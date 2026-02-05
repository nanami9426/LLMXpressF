import { checkTokenApi } from './api'

const TOKEN_KEY = 'imgo_token'
const USER_KEY = 'imgo_user'
const USER_ID_KEY = 'imgo_user_id'
const VERSION_KEY = 'imgo_token_version'

const emitToast = (message) => {
  if (!message) return
  window.dispatchEvent(new CustomEvent('imgo-toast', { detail: { message } }))
}

export function hasToken() {
  return Boolean(localStorage.getItem(TOKEN_KEY))
}

export function saveAuth({ token, userId, email, version, user }) {
  localStorage.setItem(TOKEN_KEY, token)
  const userInfo = user || (email ? { email } : {})
  localStorage.setItem(USER_KEY, JSON.stringify(userInfo))
  localStorage.setItem(USER_ID_KEY, String(userId || ''))
  if (version !== undefined) {
    localStorage.setItem(VERSION_KEY, String(version))
  }
  window.dispatchEvent(new Event('imgo-auth'))
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  localStorage.removeItem(USER_ID_KEY)
  localStorage.removeItem(VERSION_KEY)
  window.dispatchEvent(new Event('imgo-auth'))
}

export function getUser() {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export async function validateToken() {
  const token = getToken()
  if (!token) {
    logout()
    return false
  }
  try {
    await checkTokenApi(token)
    return true
  } catch (err) {
    if (err?.code === 1002) {
      emitToast('登录已过期，请重新登录。')
    } else {
      emitToast(err?.message || '登录状态失效，请重新登录。')
    }
    logout()
    return false
  }
}

export function getUserId() {
  const raw = localStorage.getItem(USER_ID_KEY)
  if (!raw) return 0
  const num = Number(raw)
  return Number.isFinite(num) ? num : 0
}

export function getTokenVersion() {
  const raw = localStorage.getItem(VERSION_KEY)
  if (!raw) return 0
  const num = Number(raw)
  return Number.isFinite(num) ? num : 0
}
