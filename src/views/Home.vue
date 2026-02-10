<template>
  <section class="page">
    <div class="hero">
      <div class="hero-text">
        <p class="eyebrow">LLMXpress</p>
        <h1 class="title">高性能 LLM 网关控制台</h1>
        <p class="lead">简洁界面，专注模型调用与流式调试。</p>
        <div class="hero-actions">
          <RouterLink v-if="authed" to="/console" class="btn">进入控制台</RouterLink>
          <RouterLink v-else to="/login" class="btn">登录</RouterLink>
          <RouterLink to="/console" class="btn ghost">网关会话</RouterLink>
        </div>
      </div>
      <div class="hero-card">
        <div class="card-header">运行状态</div>
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
          <div class="status-foot">右上角可切换登录状态。</div>
        </div>
      </div>
    </div>

    <div class="grid">
      <div class="panel">
        <h3>OpenAI 兼容</h3>
        <p>统一访问 `/v1/models` 与 `/v1/chat/completions`。</p>
      </div>
      <div class="panel">
        <h3>流式响应</h3>
        <p>支持流式输出与会话上下文调试。</p>
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
  window.addEventListener('llmxpress-auth', refreshAuth)
  window.addEventListener('storage', refreshAuth)
  refreshAuth()
})

onBeforeUnmount(() => {
  window.removeEventListener('llmxpress-auth', refreshAuth)
  window.removeEventListener('storage', refreshAuth)
})
</script>
