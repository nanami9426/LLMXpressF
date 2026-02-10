const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
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
