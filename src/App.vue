<template>
  <div class="app-shell">
    <div v-if="toast.visible" class="toast">{{ toast.message }}</div>
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">LX</div>
        <div>
          <p class="brand-title">LLMXpress</p>
          <p class="brand-sub">LLM Gateway</p>
        </div>
      </div>
      <nav class="nav">
        <RouterLink to="/" class="nav-link">主页</RouterLink>
        <RouterLink to="/chat" class="nav-link">私聊</RouterLink>
        <RouterLink to="/console" class="nav-link">控制台</RouterLink>
      </nav>
      <div class="auth">
        <template v-if="authed">
          <span class="user-pill">已登录：{{ user?.email || '用户' }} #{{ userId || '-' }}</span>
          <button class="btn ghost" @click="handleLogout">退出</button>
        </template>
        <template v-else>
          <RouterLink to="/login" class="btn">登录</RouterLink>
        </template>
      </div>
    </header>

    <main class="main">
      <RouterView />
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, reactive } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { getUser, getUserId, hasToken, logout, validateToken } from './auth'

const authed = ref(hasToken())
const user = ref(getUser())
const userId = ref(getUserId())
const router = useRouter()
const route = useRoute()
let expiryTimer = 0
let toastTimer = 0

const toast = reactive({
  visible: false,
  message: ''
})

const showToast = (message) => {
  if (!message) return
  toast.message = message
  toast.visible = true
  if (toastTimer) {
    window.clearTimeout(toastTimer)
  }
  toastTimer = window.setTimeout(() => {
    toast.visible = false
  }, 1800)
}

const handleToast = (event) => {
  showToast(event?.detail?.message || '登录已过期，请重新登录。')
}

const refreshAuth = async () => {
  if (hasToken()) {
    authed.value = await validateToken()
  } else {
    authed.value = false
  }
  user.value = getUser()
  userId.value = getUserId()
  if (!authed.value && route.meta.requiresAuth) {
    router.push({ name: 'login', query: { redirect: route.fullPath } })
  }
}

const handleLogout = () => {
  logout()
  refreshAuth()
  if (route.meta.requiresAuth) {
    router.push('/')
  }
}

onMounted(() => {
  window.addEventListener('llmxpress-auth', refreshAuth)
  window.addEventListener('storage', refreshAuth)
  window.addEventListener('llmxpress-toast', handleToast)
  refreshAuth()
  expiryTimer = window.setInterval(() => {
    refreshAuth()
  }, 30000)
})

onBeforeUnmount(() => {
  window.removeEventListener('llmxpress-auth', refreshAuth)
  window.removeEventListener('storage', refreshAuth)
  window.removeEventListener('llmxpress-toast', handleToast)
  if (expiryTimer) {
    window.clearInterval(expiryTimer)
  }
  if (toastTimer) {
    window.clearTimeout(toastTimer)
  }
})
</script>
