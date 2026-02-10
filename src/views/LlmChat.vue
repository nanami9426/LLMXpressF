<template>
  <section class="page">
    <div class="chat llm-chat">
      <div class="chat-header llm-header">
        <div class="llm-title">
          <h2>LLM 聊天</h2>
          <p class="muted">通过 vLLM 网关调用 `/v1/chat/completions`</p>
        </div>
        <div class="chat-actions">
          <button
            class="btn ghost"
            type="button"
            @click="reloadModels"
            :disabled="loadingModels || isGenerating"
          >
            {{ loadingModels ? '加载模型中...' : '刷新模型' }}
          </button>
          <button
            class="btn ghost"
            type="button"
            @click="clearConversation"
            :disabled="isGenerating || messages.length === 0"
          >
            清空会话
          </button>
        </div>
      </div>

      <div class="chat-controls llm-controls">
        <label>
          <span>模型</span>
          <select v-model="selectedModel" :disabled="loadingModels || isGenerating">
            <option value="" disabled>请选择模型</option>
            <option v-for="item in models" :key="item" :value="item">
              {{ item }}
            </option>
          </select>
        </label>
        <label class="toggle">
          <input v-model="streamEnabled" type="checkbox" :disabled="isGenerating" />
          <span>流式输出</span>
        </label>
      </div>

      <label class="field">
        <span>System Prompt（可选）</span>
        <textarea
          v-model.trim="systemPrompt"
          rows="2"
          placeholder="例如：You are a helpful assistant."
          :disabled="isGenerating"
        />
      </label>

      <div class="status-row-inline">
        <div class="status" :class="isGenerating ? 'connecting' : 'connected'">
          {{ isGenerating ? '生成中...' : '就绪' }}
        </div>
        <p class="muted">会话消息：{{ messages.length }}</p>
      </div>

      <p v-if="error" class="error">{{ error }}</p>

      <div class="chat-body llm-body" ref="listRef">
        <p v-if="messages.length === 0" class="muted empty-chat">
          先输入一条消息开始对话。
        </p>
        <div
          v-for="item in messages"
          :key="item.id"
          class="bubble llm-bubble"
          :class="`role-${item.role}`"
        >
          <div class="meta">
            <span>{{ roleLabel(item.role) }}</span>
            <span>{{ item.time }}</span>
          </div>
          <p>{{ item.content || (item.pending ? '生成中...' : '') }}</p>
        </div>
      </div>

      <form class="chat-input llm-input" @submit.prevent="sendMessage">
        <textarea
          v-model.trim="input"
          rows="3"
          placeholder="输入消息，按 Enter 发送，Shift + Enter 换行"
          @keydown.enter.exact.prevent="sendMessage"
        />
        <div class="chat-input-actions">
          <button
            v-if="isGenerating"
            class="btn ghost"
            type="button"
            @click="stopGeneration"
          >
            停止
          </button>
          <button class="btn" type="submit" :disabled="!canSubmit">
            {{ isGenerating ? '生成中...' : '发送' }}
          </button>
        </div>
      </form>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import {
  chatCompletionApi,
  chatCompletionStreamApi,
  listModelsApi
} from '../api'
import { getToken, validateToken } from '../auth'

const listRef = ref(null)
const input = ref('')
const systemPrompt = ref('You are a helpful assistant.')
const error = ref('')
const streamEnabled = ref(true)
const models = ref([])
const selectedModel = ref('')
const loadingModels = ref(false)
const isGenerating = ref(false)
const abortRef = ref(null)

const formatTime = (value) => {
  if (!value) {
    return new Date().toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

const roleLabel = (role) => {
  if (role === 'user') return '你'
  if (role === 'assistant') return '助手'
  return '系统'
}

const messages = ref([])

const scrollToBottom = () => {
  if (!listRef.value) return
  listRef.value.scrollTop = listRef.value.scrollHeight
}

const appendMessage = async (payload) => {
  messages.value.push(payload)
  await nextTick()
  scrollToBottom()
}

const ensureAuth = async () => {
  error.value = ''
  const ok = await validateToken()
  if (!ok) {
    error.value = '登录已失效，请重新登录。'
    return false
  }
  return true
}

const normalizeText = (content) => {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (typeof part?.text === 'string') return part.text
        return ''
      })
      .join('')
  }
  return ''
}

const readAssistantMessage = (payload) => {
  const choice = payload?.choices?.[0]
  if (!choice) return ''

  if (typeof choice?.message?.content === 'string') {
    return choice.message.content
  }
  if (Array.isArray(choice?.message?.content)) {
    return normalizeText(choice.message.content)
  }
  if (typeof choice?.text === 'string') {
    return choice.text
  }

  return ''
}

const buildRequestMessages = () => {
  const payload = []
  if (systemPrompt.value) {
    payload.push({
      role: 'system',
      content: systemPrompt.value
    })
  }
  messages.value.forEach((item) => {
    if (!['user', 'assistant'].includes(item.role)) return
    if (!item.content) return
    payload.push({
      role: item.role,
      content: item.content
    })
  })
  return payload
}

const reloadModels = async () => {
  error.value = ''
  if (!(await ensureAuth())) {
    return
  }
  loadingModels.value = true
  try {
    const token = getToken()
    const modelList = await listModelsApi(token)
    const nextModels = modelList
      .map((item) => (typeof item === 'string' ? item : item?.id))
      .filter(Boolean)

    models.value = Array.from(new Set(nextModels))
    if (models.value.length === 0) {
      selectedModel.value = ''
      error.value = '模型列表为空，请联系后端确认 vLLM 模型配置。'
      return
    }
    if (!models.value.includes(selectedModel.value)) {
      selectedModel.value = models.value[0]
    }
  } catch (err) {
    error.value = err?.message || '加载模型列表失败'
  } finally {
    loadingModels.value = false
  }
}

const canSubmit = computed(() => {
  return Boolean(input.value.trim()) && Boolean(selectedModel.value) && !isGenerating.value
})

const stopGeneration = () => {
  abortRef.value?.abort()
}

const clearConversation = () => {
  if (isGenerating.value) return
  messages.value = []
}

const sendMessage = async () => {
  error.value = ''
  const prompt = input.value.trim()
  if (!prompt || isGenerating.value) return

  if (!selectedModel.value) {
    error.value = '请先选择模型'
    return
  }
  isGenerating.value = true
  if (!(await ensureAuth())) {
    isGenerating.value = false
    return
  }

  const userMessage = {
    id: Date.now() + Math.random(),
    role: 'user',
    content: prompt,
    time: formatTime()
  }
  await appendMessage(userMessage)
  input.value = ''

  const apiMessages = buildRequestMessages()
  const assistantMessage = reactive({
    id: Date.now() + Math.random(),
    role: 'assistant',
    content: '',
    pending: true,
    time: formatTime()
  })
  await appendMessage(assistantMessage)

  try {
    if (streamEnabled.value) {
      const controller = new AbortController()
      abortRef.value = controller

      const result = await chatCompletionStreamApi({
        token: getToken(),
        model: selectedModel.value,
        messages: apiMessages,
        signal: controller.signal,
        onDelta: async (delta) => {
          assistantMessage.content += delta
          await nextTick()
          scrollToBottom()
        }
      })

      if (!assistantMessage.content && result?.text) {
        assistantMessage.content = result.text
      }
    } else {
      const payload = await chatCompletionApi({
        token: getToken(),
        model: selectedModel.value,
        messages: apiMessages
      })
      assistantMessage.content = readAssistantMessage(payload)
    }

    assistantMessage.pending = false
    if (!assistantMessage.content) {
      assistantMessage.content = '（无返回内容）'
    }
  } catch (err) {
    assistantMessage.pending = false
    if (err?.name === 'AbortError') {
      assistantMessage.content = assistantMessage.content || '已停止生成。'
    } else {
      assistantMessage.content = assistantMessage.content || '请求失败，请重试。'
      error.value = err?.message || '请求失败'
    }
  } finally {
    abortRef.value = null
    isGenerating.value = false
    await nextTick()
    scrollToBottom()
  }
}

const refreshAuth = () => {
  if (!getToken()) {
    stopGeneration()
  }
}

onMounted(() => {
  window.addEventListener('imgo-auth', refreshAuth)
  reloadModels()
})

onBeforeUnmount(() => {
  window.removeEventListener('imgo-auth', refreshAuth)
  stopGeneration()
})
</script>
