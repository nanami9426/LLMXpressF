<template>
  <section class="page">
    <div class="hero">
      <div class="hero-text">
        <p class="eyebrow">欢迎来到 IMGO</p>
        <h1 class="title">一个专注于交流效率的轻量聊天室</h1>
        <p class="lead">
          主页对所有人可见。登录后可进入聊天界面，体验实时交流的节奏感。
        </p>
        <div class="hero-actions">
          <RouterLink to="/chat" class="btn">进入聊天</RouterLink>
          <RouterLink v-if="!authed" to="/login" class="btn ghost">去登录</RouterLink>
        </div>
      </div>
      <div class="hero-card">
        <div class="card-header">状态面板</div>
        <div class="card-body">
          <div class="status-row">
            <span>登录状态</span>
            <strong>{{ authed ? '已登录' : '未登录' }}</strong>
          </div>
          <div class="status-row" v-if="!authed">
            <span>提示</span>
            <strong class="warn">未登录，部分功能不可用</strong>
          </div>
          <div class="status-row" v-else>
            <span>当前用户</span>
            <strong>{{ user?.email || '用户' }}</strong>
          </div>
          <div class="status-row" v-if="authed">
            <span>用户ID</span>
            <strong>#{{ userId || '-' }}</strong>
          </div>
          <div class="status-foot">
            你可以随时从右上角登录或退出。
          </div>
        </div>
      </div>
    </div>

    <div class="grid">
      <div class="panel">
        <h3>轻量但有序</h3>
        <p>页面结构干净，信息层级明确，适合快速沟通与记录。</p>
      </div>
      <div class="panel">
        <h3>登录后解锁</h3>
        <p>聊天界面加入权限控制，保护你的会话内容。</p>
      </div>
      <div class="panel">
        <h3>随时可扩展</h3>
        <p>前端已预留清晰结构，后续可接入后端 API。</p>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { RouterLink } from 'vue-router'
import { getUser, getUserId, hasToken, validateToken } from '../auth'

const authed = ref(hasToken())
const user = ref(getUser())
const userId = ref(getUserId())

const refreshAuth = async () => {
  if (hasToken()) {
    authed.value = await validateToken()
  } else {
    authed.value = false
  }
  user.value = getUser()
  userId.value = getUserId()
}

onMounted(() => {
  window.addEventListener('imgo-auth', refreshAuth)
  window.addEventListener('storage', refreshAuth)
  refreshAuth()
})

onBeforeUnmount(() => {
  window.removeEventListener('imgo-auth', refreshAuth)
  window.removeEventListener('storage', refreshAuth)
})
</script>
