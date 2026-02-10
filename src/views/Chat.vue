<template>
  <section class="page">
    <div class="chat">
      <div class="chat-header">
        <div>
          <h2>聊天空间</h2>
          <p class="muted">仅登录用户可进入，基于后端 WebSocket</p>
          <p class="muted">我的用户ID：#{{ myId || '-' }}</p>
        </div>
        <div class="status" :class="status">
          {{ statusLabel }}
        </div>
      </div>

      <div class="chat-controls">
        <label>
          <span>对方用户ID</span>
          <input
            v-model.trim="toId"
            type="number"
            min="1"
            placeholder="输入对方 user_id"
          />
        </label>
        <button class="btn ghost" type="button" @click="connect" :disabled="status === 'connecting'">
          {{ status === 'connected' ? '重新连接' : '连接' }}
        </button>
      </div>

      <p v-if="error" class="error">{{ error }}</p>

      <div class="chat-body" ref="listRef">
        <div
          v-for="item in messages"
          :key="item.id"
          class="bubble"
          :class="item.fromId === myId ? 'me' : 'bot'"
        >
          <div class="meta">
            <span>#{{ item.fromId }}</span>
            <span>{{ item.time }}</span>
          </div>
          <p>{{ item.text }}</p>
        </div>
      </div>

      <form class="chat-input" @submit.prevent="send">
        <input
          v-model.trim="input"
          type="text"
          placeholder="输入你的消息..."
        />
        <button class="btn" type="submit">发送</button>
      </form>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { buildWsProtocols, buildWsUrl } from '../api'
import { getToken, getUserId, validateToken } from '../auth'

const listRef = ref(null)
const input = ref('')
const toId = ref('')
const error = ref('')
const status = ref('disconnected')
const wsRef = ref(null)
const myId = ref(getUserId())

const statusLabel = computed(() => {
  if (status.value === 'connected') return '已连接'
  if (status.value === 'connecting') return '连接中...'
  if (status.value === 'error') return '连接失败'
  return '未连接'
})

const formatTime = (value) => {
  if (!value) return new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  })
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

const messages = ref([
  {
    id: 1,
    fromId: 0,
    text: '欢迎进入聊天空间。请输入对方用户ID开始对话。',
    time: formatTime()
  }
])

const scrollToBottom = () => {
  if (!listRef.value) return
  listRef.value.scrollTop = listRef.value.scrollHeight
}

const appendMessage = async (payload) => {
  messages.value.push(payload)
  await nextTick()
  scrollToBottom()
}

const connect = async () => {
  error.value = ''
  const ok = await validateToken()
  if (!ok) {
    status.value = 'error'
    error.value = '登录已过期或无效，请重新登录。'
    return
  }
  const token = getToken()

  if (wsRef.value) {
    wsRef.value.close()
  }

  status.value = 'connecting'
  const protocols = buildWsProtocols(token)
  const ws = protocols.length > 0
    ? new WebSocket(buildWsUrl(), protocols)
    : new WebSocket(buildWsUrl())
  wsRef.value = ws
  let opened = false

  ws.onopen = () => {
    opened = true
    status.value = 'connected'
  }

  ws.onclose = (evt) => {
    if (!opened && protocols.length > 0) {
      status.value = 'error'
      error.value = `WebSocket 握手被拒绝（code: ${evt.code}）。后端需要支持 Sec-WebSocket-Protocol 鉴权。`
      return
    }
    if (status.value !== 'error') {
      status.value = 'disconnected'
    }
  }

  ws.onerror = () => {
    status.value = 'error'
    error.value = 'WebSocket 连接失败'
  }

  ws.onmessage = async (evt) => {
    try {
      const data = JSON.parse(evt.data)
      await appendMessage({
        id: Date.now() + Math.random(),
        fromId: data.from_id || 0,
        text: data.content || '',
        time: formatTime(data.timestamp)
      })
    } catch (err) {
      error.value = '消息解析失败'
    }
  }
}

const send = () => {
  error.value = ''
  if (!input.value) return

  const targetId = Number(toId.value)
  if (!Number.isFinite(targetId) || targetId <= 0) {
    error.value = '请输入正确的对方用户ID'
    return
  }

  if (!wsRef.value || wsRef.value.readyState !== WebSocket.OPEN) {
    error.value = '当前未连接到聊天服务'
    return
  }

  const payload = {
    to_id: targetId,
    content: input.value
  }

  wsRef.value.send(JSON.stringify(payload))
  input.value = ''
}

const refreshAuth = () => {
  myId.value = getUserId()
  if (!getToken()) {
    status.value = 'disconnected'
    if (wsRef.value) {
      wsRef.value.close()
    }
  }
}

onMounted(() => {
  window.addEventListener('imgo-auth', refreshAuth)
  connect()
})

onBeforeUnmount(() => {
  window.removeEventListener('imgo-auth', refreshAuth)
  if (wsRef.value) {
    wsRef.value.close()
  }
})
</script>
