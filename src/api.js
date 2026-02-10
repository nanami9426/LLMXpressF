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
  if (typeof choice?.delta?.content === 'string') {
    return choice.delta.content
  }
  if (Array.isArray(choice?.delta?.content)) {
    return choice.delta.content
      .map((item) => (typeof item?.text === 'string' ? item.text : ''))
      .join('')
  }
  if (typeof choice?.text === 'string') {
    return choice.text
  }
  return ''
}

function parseSseData(eventBlock) {
  const lines = eventBlock.split('\n')
  const chunks = []
  lines.forEach((line) => {
    if (line.startsWith('data:')) {
      chunks.push(line.slice(5).trimStart())
    }
  })
  return chunks.join('\n')
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
      'Content-Type': 'application/json'
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
    const payload = await res.json().catch(() => ({}))
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
  const processEvent = (event) => {
    const data = parseSseData(event)
    if (!data || data === '[DONE]') {
      return data === '[DONE]'
    }

    try {
      const payload = JSON.parse(data)
      const delta = getDeltaText(payload)
      if (delta) {
        text += delta
        onDelta?.(delta, payload)
      }
    } catch {
      // Ignore malformed chunks and continue reading.
    }
    return false
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    buffer = buffer.replace(/\r\n/g, '\n')

    const events = buffer.split('\n\n')
    buffer = events.pop() || ''

    for (const event of events) {
      if (processEvent(event)) {
        return { text }
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
