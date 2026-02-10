const API_BASE = import.meta.env.VITE_API_BASE || ''
const WS_BASE = import.meta.env.VITE_WS_BASE || 'ws://localhost:5000'

function joinUrl(base, path) {
  if (base.endsWith('/') && path.startsWith('/')) {
    return base.slice(0, -1) + path
  }
  if (!base.endsWith('/') && !path.startsWith('/')) {
    return base + '/' + path
  }
  return base + path
}

async function request(path, { method = 'GET', body, headers } = {}) {
  const res = await fetch(joinUrl(API_BASE, path), {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  })

  const payload = await res.json().catch(() => ({}))

  const buildError = (source, status) => {
    const errInfo = source?.error || {}
    const err = new Error(
      errInfo.message || source?.message || '请求失败'
    )
    err.code = errInfo.code ?? source?.stat_code ?? status
    if (errInfo.type || source?.stat) {
      err.type = errInfo.type || source?.stat
    }
    if (errInfo.details || source?.err) {
      err.details = errInfo.details || source?.err
    }
    if (status) {
      err.status = status
    }
    return err
  }

  if (!res.ok) {
    throw buildError(payload, res.status)
  }

  if (payload && typeof payload.success === 'boolean') {
    if (!payload.success) {
      throw buildError(payload, res.status)
    }
    return payload.data
  }

  if (typeof payload.stat_code === 'number' && payload.stat_code !== 0) {
    throw buildError(payload, res.status)
  }

  return payload
}

function requireToken(token) {
  if (token) return token
  const err = new Error('缺少登录令牌，请先登录。')
  err.status = 401
  err.code = 401
  throw err
}

function withBearerToken(token, headers = {}) {
  return {
    ...headers,
    Authorization: `Bearer ${requireToken(token)}`
  }
}

export async function loginApi(payload) {
  const data = await request('/user/user_login', {
    method: 'POST',
    body: payload
  })
  return {
    token: data?.token,
    userId: data?.user_id,
    version: data?.version
  }
}

export async function userListApi() {
  const data = await request('/user/user_list', {
    method: 'POST',
    body: {}
  })
  if (Array.isArray(data)) {
    return data
  }
  return data?.data || []
}

export async function checkTokenApi(token) {
  const data = await request('/user/check_token', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  })
  return data
}

export async function listModelsApi(token) {
  const payload = await request('/v1/models', {
    method: 'GET',
    headers: withBearerToken(token)
  })
  if (Array.isArray(payload?.data)) {
    return payload.data
  }
  if (Array.isArray(payload)) {
    return payload
  }
  return []
}

export async function chatCompletionApi({
  token,
  model,
  messages,
  temperature,
  max_tokens
}) {
  return request('/v1/chat/completions', {
    method: 'POST',
    headers: withBearerToken(token),
    body: {
      model,
      messages,
      temperature,
      max_tokens
    }
  })
}

function getDeltaText(payload) {
  const choice = payload?.choices?.[0]
  if (!choice) return ''

  const normalizeContent = (value) => {
    if (typeof value === 'string') return value
    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (typeof item === 'string') return item
          if (typeof item?.text === 'string') return item.text
          if (typeof item?.content === 'string') return item.content
          return ''
        })
        .join('')
    }
    if (typeof value?.text === 'string') {
      return value.text
    }
    if (typeof value?.content === 'string') {
      return value.content
    }
    return ''
  }

  const deltaText = [
    normalizeContent(choice?.delta?.content),
    normalizeContent(choice?.delta?.reasoning_content),
    normalizeContent(choice?.delta?.reasoning)
  ].filter(Boolean).join('')
  if (deltaText) return deltaText

  const fallbackText = normalizeContent(choice?.text) || normalizeContent(choice?.message?.content)
  return fallbackText || ''
}

function parseStreamPayloads(eventBlock) {
  const lines = eventBlock.split('\n')
  const dataLines = []
  const rawLines = []
  let hasSseFields = false

  lines.forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith(':')) {
      return
    }

    if (trimmed.startsWith('data:')) {
      hasSseFields = true
      dataLines.push(trimmed.slice(5).trimStart())
      return
    }

    if (/^(event|id|retry):/i.test(trimmed)) {
      hasSseFields = true
      return
    }

    rawLines.push(trimmed)
  })

  if (hasSseFields) {
    if (dataLines.length === 0) return []
    return [
      {
        data: dataLines.join('\n'),
        fromSse: true
      }
    ]
  }

  return rawLines.map((data) => ({
    data,
    fromSse: false
  }))
}

export async function chatCompletionStreamApi({
  token,
  model,
  messages,
  temperature,
  max_tokens,
  signal,
  onDelta
}) {
  const res = await fetch(joinUrl(API_BASE, '/v1/chat/completions'), {
    method: 'POST',
    headers: withBearerToken(token, {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache'
    }),
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens,
      stream: true
    }),
    signal
  })

  if (!res.ok) {
    const raw = await res.text().catch(() => '')
    let payload = {}
    if (raw) {
      try {
        payload = JSON.parse(raw)
      } catch {
        payload = { message: raw }
      }
    }
    const info = payload?.error || {}
    const err = new Error(info.message || payload?.message || '请求失败')
    err.status = res.status
    err.code = info.code ?? res.status
    throw err
  }

  if (!res.body) {
    return { text: '' }
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''

  const emitDelta = (delta, payload) => {
    if (!delta) return
    text += delta
    onDelta?.(delta, payload)
  }

  const processPayload = (rawData, fromSse) => {
    const data = String(rawData || '').trim()
    if (!data) return false
    if (data === '[DONE]') return true

    try {
      const payload = JSON.parse(data)
      const delta = getDeltaText(payload)
      emitDelta(delta, payload)
      return false
    } catch {
      // Some gateways may flush multiple `data:` lines as one block without blank separators.
      if (fromSse && data.includes('\n')) {
        const lines = data.split('\n')
        for (const line of lines) {
          if (processPayload(line, true)) return true
        }
        return false
      }

      // Fallback for plain text chunk streams.
      if (!fromSse || !/^[{\[]/.test(data)) {
        emitDelta(data)
      }
      return false
    }
  }

  const processEvent = (event) => {
    const payloads = parseStreamPayloads(event)
    for (const payload of payloads) {
      if (processPayload(payload.data, payload.fromSse)) {
        return true
      }
    }
    return false
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) {
      buffer += decoder.decode()
      break
    }

    buffer += decoder.decode(value, { stream: true })
    buffer = buffer.replace(/\r\n?/g, '\n')

    const events = buffer.split('\n\n')
    buffer = events.pop() || ''

    for (const event of events) {
      if (processEvent(event)) {
        return { text }
      }
    }

    // Fallback for non-standard streams that flush one line at a time without blank separators.
    if (events.length === 0) {
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (processEvent(line)) {
          return { text }
        }
      }
    }
  }

  if (buffer.trim()) {
    processEvent(buffer)
  }

  return { text }
}

export function buildWsUrl() {
  return joinUrl(WS_BASE, '/chat/send_message')
}

function toBase64Url(value) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function isWsProtocolTokenSafe(value) {
  return /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(value)
}

export function buildWsProtocols(token) {
  if (!token) return []
  // Browser WebSocket API cannot set Authorization directly.
  // Pass bearer token via Sec-WebSocket-Protocol for server-side validation.
  if (isWsProtocolTokenSafe(token)) {
    return [`authorization.bearer.${token}`]
  }
  return [`authorization.bearer.b64.${toBase64Url(token)}`]
}

export { API_BASE, WS_BASE }
