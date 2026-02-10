<template>
  <section class="page">
    <div class="llm-workspace">
      <aside class="history-panel">
        <div class="history-header">
          <div>
            <h3>历史会话</h3>
            <p class="muted">仅 LLM 对话</p>
          </div>
          <button
            class="btn ghost"
            type="button"
            @click="reloadConversations()"
            :disabled="isGenerating || conversationsLoading"
          >
            {{ conversationsLoading ? '刷新中...' : '刷新' }}
          </button>
        </div>

        <button
          class="btn wide"
          type="button"
          @click="startNewConversation"
          :disabled="isGenerating"
        >
          新建会话
        </button>

        <p class="muted">共 {{ conversationsTotal }} 条会话</p>

        <div class="history-list">
          <p v-if="conversationsLoading && conversations.length === 0" class="muted">
            加载会话中...
          </p>
          <p v-else-if="conversations.length === 0" class="muted">
            暂无历史会话。
          </p>

          <button
            v-for="item in conversations"
            :key="item.conversation_id"
            class="history-item"
            :class="{
              active: normalizeConversationId(item.conversation_id) === activeConversationId,
              loading: normalizeConversationId(item.conversation_id) === loadingConversationId
            }"
            type="button"
            :disabled="isGenerating"
            @click="openConversation(item.conversation_id)"
          >
            <p class="history-title">{{ conversationTitle(item) }}</p>
            <p class="history-preview">{{ item.last_message_preview || '无预览内容' }}</p>
            <div class="history-meta">
              <span>#{{ item.conversation_id }}</span>
              <span>{{ item.message_count || 0 }} 条</span>
              <span>{{ formatConversationTime(item.last_message_at) }}</span>
            </div>
          </button>
        </div>
      </aside>

      <div class="chat llm-chat">
        <div class="chat-header llm-header">
          <div class="llm-title">
            <h2>LLMXpress 控制台</h2>
            <p class="muted">`/v1/chat/completions`</p>
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
              @click="startNewConversation"
              :disabled="isGenerating"
            >
              新建会话
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
          <span>System Prompt</span>
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
          <p class="muted">{{ activeConversationLabel }}</p>
          <p class="muted">消息数：{{ messages.length }}</p>
        </div>

        <p v-if="error" class="error">{{ error }}</p>

        <div class="chat-body llm-body" ref="listRef">
          <p v-if="messages.length === 0" class="muted empty-chat">
            输入消息开始测试。
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
            placeholder="输入消息，Enter 发送，Shift + Enter 换行"
            :disabled="isGenerating"
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
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import {
  chatCompletionApi,
  chatCompletionStreamApi,
  listConversationMessagesApi,
  listConversationsApi,
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

const messages = ref([])
const conversations = ref([])
const conversationsTotal = ref(0)
const conversationsLoading = ref(false)
const loadingConversationId = ref('')
const activeConversationId = ref(null)
const currentConversationTitle = ref('')

const activeConversationLabel = computed(() => {
  if (!activeConversationId.value) {
    return '会话：新会话'
  }
  const title = currentConversationTitle.value ? ` · ${currentConversationTitle.value}` : ''
  return `会话：#${activeConversationId.value}${title}`
})

const canSubmit = computed(() => {
  return Boolean(input.value.trim()) && Boolean(selectedModel.value) && !isGenerating.value
})

const normalizeConversationId = (value) => {
  if (value === null || value === undefined) return null
  const id = String(value).trim()
  if (!/^\d+$/.test(id)) return null
  if (/^0+$/.test(id)) return null
  return id
}

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

const formatConversationTime = (value) => {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const roleLabel = (role) => {
  if (role === 'user') return '你'
  if (role === 'assistant') return '助手'
  return '系统'
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

const scrollToBottom = () => {
  if (!listRef.value) return
  listRef.value.scrollTop = listRef.value.scrollHeight
}

const appendMessage = async (payload) => {
  messages.value.push(payload)
  await nextTick()
  scrollToBottom()
}

const ensureAuth = async ({ clearError = true } = {}) => {
  if (clearError) {
    error.value = ''
  }
  const ok = await validateToken()
  if (!ok) {
    error.value = '登录已失效，请重新登录。'
    return false
  }
  return true
}

const conversationTitle = (item) => {
  const title = String(item?.title || '').trim()
  if (title) return title

  const preview = String(item?.last_message_preview || '').trim()
  if (preview) {
    if (preview.length > 30) {
      return `${preview.slice(0, 30)}...`
    }
    return preview
  }

  const id = normalizeConversationId(item?.conversation_id)
  return id ? `会话 #${id}` : '未命名会话'
}

const syncConversationTitle = () => {
  if (!activeConversationId.value) {
    currentConversationTitle.value = ''
    return
  }

  const active = conversations.value.find((item) => {
    return normalizeConversationId(item?.conversation_id) === activeConversationId.value
  })

  if (active) {
    currentConversationTitle.value = conversationTitle(active)
  }
}

const applyModelFromConversation = (model) => {
  if (!model) return
  if (!models.value.includes(model)) {
    models.value = [model, ...models.value]
  }
  selectedModel.value = model
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

const reloadConversations = async ({ silent = false } = {}) => {
  if (!silent) {
    error.value = ''
  }

  if (!(await ensureAuth({ clearError: !silent }))) {
    return
  }

  if (!silent) {
    conversationsLoading.value = true
  }

  try {
    const token = getToken()
    const payload = await listConversationsApi(token, {
      page: 1,
      pageSize: 50
    })

    conversations.value = payload.list
    conversationsTotal.value = payload.total

    if (activeConversationId.value) {
      const exists = conversations.value.some((item) => {
        return normalizeConversationId(item?.conversation_id) === activeConversationId.value
      })
      if (!exists) {
        activeConversationId.value = null
        currentConversationTitle.value = ''
      } else {
        syncConversationTitle()
      }
    }
  } catch (err) {
    if (!silent) {
      error.value = err?.message || '加载历史会话失败'
    }
  } finally {
    if (!silent) {
      conversationsLoading.value = false
    }
  }
}

const openConversation = async (conversationId) => {
  if (isGenerating.value) return

  const targetId = normalizeConversationId(conversationId)
  if (!targetId) return

  error.value = ''
  if (!(await ensureAuth())) {
    return
  }

  loadingConversationId.value = targetId
  try {
    const token = getToken()
    const payload = await listConversationMessagesApi(token, targetId, {
      page: 1,
      pageSize: 200
    })

    activeConversationId.value = targetId
    currentConversationTitle.value = conversationTitle(payload.conversation || { conversation_id: targetId })
    applyModelFromConversation(payload?.conversation?.model)

    messages.value = payload.messages.map((item) => ({
      id: item?.message_id || Date.now() + Math.random(),
      role: item?.role || 'assistant',
      content: item?.content || '',
      time: formatTime(item?.created_at)
    }))

    await nextTick()
    scrollToBottom()
  } catch (err) {
    error.value = err?.message || '加载会话消息失败'
  } finally {
    loadingConversationId.value = ''
  }
}

const startNewConversation = () => {
  if (isGenerating.value) return
  error.value = ''
  activeConversationId.value = null
  currentConversationTitle.value = ''
  messages.value = []
}

const stopGeneration = () => {
  abortRef.value?.abort()
}

const buildRequestMessages = (prompt) => {
  const payload = []
  if (systemPrompt.value) {
    payload.push({
      role: 'system',
      content: systemPrompt.value
    })
  }

  if (activeConversationId.value) {
    payload.push({ role: 'user', content: prompt })
    return payload
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

  const apiMessages = buildRequestMessages(prompt)
  const assistantMessage = reactive({
    id: Date.now() + Math.random(),
    role: 'assistant',
    content: '',
    pending: true,
    time: formatTime()
  })
  await appendMessage(assistantMessage)

  let nextConversationId = activeConversationId.value

  try {
    if (streamEnabled.value) {
      const controller = new AbortController()
      abortRef.value = controller

      const result = await chatCompletionStreamApi({
        token: getToken(),
        model: selectedModel.value,
        messages: apiMessages,
        conversation_id: activeConversationId.value || undefined,
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

      const resolvedId = normalizeConversationId(result?.conversationId)
      if (resolvedId) {
        nextConversationId = resolvedId
      }
    } else {
      const result = await chatCompletionApi({
        token: getToken(),
        model: selectedModel.value,
        messages: apiMessages,
        conversation_id: activeConversationId.value || undefined
      })
      assistantMessage.content = readAssistantMessage(result?.data)

      const resolvedId = normalizeConversationId(result?.conversationId)
      if (resolvedId) {
        nextConversationId = resolvedId
      }
    }

    assistantMessage.pending = false
    if (!assistantMessage.content) {
      assistantMessage.content = '（无返回内容）'
    }

    if (nextConversationId) {
      activeConversationId.value = nextConversationId
      syncConversationTitle()
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
    await reloadConversations({ silent: true })
  }
}

const refreshAuth = () => {
  if (!getToken()) {
    stopGeneration()
  }
}

onMounted(async () => {
  window.addEventListener('llmxpress-auth', refreshAuth)
  await reloadModels()
  await reloadConversations()
})

onBeforeUnmount(() => {
  window.removeEventListener('llmxpress-auth', refreshAuth)
  stopGeneration()
})
</script>
