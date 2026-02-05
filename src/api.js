const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'
const WS_BASE = import.meta.env.VITE_WS_BASE || 'ws://localhost:8000'

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

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data?.message || '网络错误')
    err.code = data?.stat_code || res.status
    throw err
  }
  if (typeof data.stat_code === 'number' && data.stat_code !== 0) {
    const err = new Error(data.message || '请求失败')
    err.code = data.stat_code
    throw err
  }
  return data
}

export async function loginApi(payload) {
  const data = await request('/user/user_login', {
    method: 'POST',
    body: payload
  })
  return {
    token: data.token,
    userId: data.user_id,
    version: data.version
  }
}

export async function userListApi() {
  const data = await request('/user/user_list', {
    method: 'POST',
    body: {}
  })
  return data.data || []
}

export async function checkTokenApi(token) {
  const data = await request('/user/check_token', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  })
  return data
}

export function buildWsUrl(token) {
  const url = new URL(joinUrl(WS_BASE, '/chat/send_message'))
  if (token) {
    url.searchParams.set('token', token)
  }
  return url.toString()
}

export { API_BASE, WS_BASE }
