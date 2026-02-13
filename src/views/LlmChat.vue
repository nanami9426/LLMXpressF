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

          <div
            v-for="item in conversations"
            :key="item.conversation_id"
            class="history-item"
            :class="{
              active: normalizeConversationId(item.conversation_id) === activeConversationId,
              loading:
                normalizeConversationId(item.conversation_id) === loadingConversationId ||
                normalizeConversationId(item.conversation_id) === deletingConversationId
            }"
          >
            <button
              class="history-item-main"
              type="button"
              :disabled="
                isGenerating ||
                normalizeConversationId(item.conversation_id) === deletingConversationId
              "
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
            <div class="history-item-actions">
              <button
                class="history-menu-trigger"
                type="button"
                :disabled="
                  isGenerating ||
                  normalizeConversationId(item.conversation_id) === deletingConversationId
                "
                @click.stop="toggleConversationMenu(item.conversation_id)"
              >
                ...
              </button>
              <div
                v-if="normalizeConversationId(item.conversation_id) === actionMenuConversationId"
                class="history-menu-popover"
                @click.stop
              >
                <button
                  class="history-menu-item danger"
                  type="button"
                  :disabled="normalizeConversationId(item.conversation_id) === deletingConversationId"
                  @click="openDeleteConfirm(item)"
                >
                  删除会话
                </button>
              </div>
            </div>
          </div>
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
          <label>
            <span>max_tokens</span>
            <input
              v-model.number="maxTokens"
              type="number"
              min="1"
              max="8192"
              step="1"
              :disabled="isGenerating"
            />
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
        <div class="system-panel">
          <div class="system-panel-head">
            <span class="system-pill">{{ activeConversationId ? '续聊模式' : '新会话模式' }}</span>
            <span
              class="system-pill"
              :class="shouldSendSystemOverride ? 'warn' : 'ok'"
            >
              {{ shouldSendSystemOverride ? '本轮发送 system + user' : '本轮仅发送 user' }}
            </span>
            <button
              v-if="activeConversationId && shouldSendSystemOverride"
              class="btn ghost tiny"
              type="button"
              :disabled="isGenerating"
              @click="resetSystemPromptToConversation"
            >
              恢复历史 system
            </button>
          </div>
          <p class="system-panel-tip">{{ systemRuleHint }}</p>
        </div>

        <div class="status-row-inline">
          <div class="status" :class="isGenerating ? 'connecting' : 'connected'">
            {{ isGenerating ? '生成中...' : '就绪' }}
          </div>
          <p class="muted">{{ activeConversationLabel }}</p>
          <p class="muted">消息数：{{ messages.length }}</p>
        </div>

        <p v-if="error" class="error">{{ error }}</p>

        <div class="chat-body llm-body" ref="listRef" @click="handleChatBodyClick">
          <p v-if="messages.length === 0" class="muted empty-chat">
            输入消息开始测试。
          </p>
          <template v-for="item in messages" :key="item.id">
            <div v-if="item.role === 'system'" class="llm-system-line">
              <div class="meta">
                <span>{{ roleLabel(item.role) }}</span>
                <span>{{ item.time }}</span>
              </div>
              <div class="llm-system-text" v-html="renderMessageContent(item)"></div>
            </div>
            <div
              v-else
              class="bubble llm-bubble"
              :class="`role-${item.role}`"
            >
              <div class="meta">
                <span>{{ roleLabel(item.role) }}</span>
                <span>{{ item.time }}</span>
              </div>
              <div class="message-content" v-html="renderMessageContent(item)"></div>
            </div>
          </template>
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

    <div
      v-if="deleteConfirmTarget"
      class="confirm-mask"
      @click="closeDeleteConfirm"
    >
      <div
        class="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="删除会话确认"
        @click.stop
      >
        <h3>删除会话</h3>
        <p>
          确认删除
          <strong>#{{ deleteConfirmTarget.id }}</strong>
          吗？删除后不可恢复。
        </p>
        <div class="confirm-actions">
          <button
            class="btn ghost"
            type="button"
            :disabled="deletingConversationId === deleteConfirmTarget.id"
            @click="closeDeleteConfirm"
          >
            取消
          </button>
          <button
            class="btn danger"
            type="button"
            :disabled="deletingConversationId === deleteConfirmTarget.id"
            @click="confirmDeleteConversation"
          >
            {{ deletingConversationId === deleteConfirmTarget.id ? '删除中...' : '确认删除' }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import {
  chatCompletionApi,
  chatCompletionStreamApi,
  deleteConversationApi,
  listConversationMessagesApi,
  listConversationsApi,
  listModelsApi
} from '../api'
import { getToken, logout, validateToken } from '../auth'
import { renderMarkdown } from '../utils/markdown'
import { useRoute, useRouter } from 'vue-router'

const DEFAULT_MAX_TOKENS = 1024
const MAX_TOKENS_MIN = 1
const MAX_TOKENS_MAX = 8192
const SEND_THROTTLE_MS = 600
const RATE_LIMIT_CODE = '1006'

const listRef = ref(null)
const router = useRouter()
const route = useRoute()
const input = ref('')
const systemPrompt = ref('You are a helpful assistant.')
const error = ref('')
const streamEnabled = ref(true)
const maxTokens = ref(DEFAULT_MAX_TOKENS)
const models = ref([])
const selectedModel = ref('')
const loadingModels = ref(false)
const isGenerating = ref(false)
const abortRef = ref(null)
const lastSubmitAt = ref(0)

const messages = ref([])
const conversations = ref([])
const conversationsTotal = ref(0)
const conversationsLoading = ref(false)
const loadingConversationId = ref('')
const deletingConversationId = ref('')
const actionMenuConversationId = ref('')
const deleteConfirmTarget = ref(null)
const activeConversationId = ref(null)
const currentConversationTitle = ref('')
const conversationSystemPrompt = ref('')
const markdownCache = new Map()
const copyButtonTimers = new WeakMap()

const activeConversationLabel = computed(() => {
  if (!activeConversationId.value) {
    return '会话：新会话'
  }
  const title = currentConversationTitle.value ? ` · ${currentConversationTitle.value}` : ''
  return `会话：#${activeConversationId.value}${title}`
})

const shouldSendSystemOverride = computed(() => {
  const draft = systemPrompt.value.trim()
  if (!activeConversationId.value) {
    return Boolean(draft)
  }

  const current = conversationSystemPrompt.value.trim()
  return Boolean(draft) && draft !== current
})

const systemRuleHint = computed(() => {
  if (!activeConversationId.value) {
    return shouldSendSystemOverride.value
      ? '首轮会发送 system + user，后端将把 system 固定为该会话第 1 条。'
      : '首轮仅发送 user，后端不会创建 system 消息。'
  }

  if (shouldSendSystemOverride.value) {
    return '本轮将发送 system + user，后端会直接覆盖该会话旧 system。'
  }

  return '本轮只发送 user，沿用会话当前 system（不会重复追加）。'
})

const canSubmit = computed(() => {
  return Boolean(input.value.trim()) && Boolean(selectedModel.value) && !isGenerating.value
})

const normalizedMaxTokens = computed(() => {
  const parsed = Number(maxTokens.value)
  if (!Number.isFinite(parsed)) {
    return DEFAULT_MAX_TOKENS
  }

  const value = Math.trunc(parsed)
  if (value < MAX_TOKENS_MIN) return MAX_TOKENS_MIN
  if (value > MAX_TOKENS_MAX) return MAX_TOKENS_MAX
  return value
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

const parseRateLimitDimension = (details) => {
  if (!details) return ''

  if (typeof details === 'string') {
    const match = details.match(/dimension\s*=\s*(request|token)/i)
    if (match?.[1]) {
      return match[1].toLowerCase()
    }
    return ''
  }

  const dimension = String(details?.dimension || '').trim().toLowerCase()
  if (dimension === 'request' || dimension === 'token') {
    return dimension
  }
  return ''
}

const resolveChatErrorMessage = (err) => {
  const status = Number(err?.status)
  const code = String(err?.code || '')
  const type = String(err?.type || '').toLowerCase()
  const isRateLimit = status === 429 || code === RATE_LIMIT_CODE || type === 'rate_limit_error'
  if (!isRateLimit) {
    return err?.message || '请求失败'
  }

  const dimension = parseRateLimitDimension(err?.details)
  if (dimension === 'request') {
    return '请求频率过高，请稍后再发。'
  }
  if (dimension === 'token') {
    return '本分钟 token 配额不足，请缩短输入或降低 max_tokens。'
  }
  return '请求过于频繁，请稍后重试。'
}

const resolveSystemPromptFromMessages = (messageList = []) => {
  const systemItem = messageList.find((item) => item?.role === 'system')
  if (!systemItem) return ''
  const content = normalizeText(systemItem.content)
  return String(content || '').trim()
}

const renderMessageContent = (item) => {
  const source = item?.content || (item?.pending ? '生成中...' : '')
  const key = `${item?.role || 'unknown'}::${source}`
  if (markdownCache.has(key)) {
    return markdownCache.get(key)
  }

  const html = renderMarkdown(source)
  if (markdownCache.size > 300) {
    markdownCache.clear()
  }
  markdownCache.set(key, html)
  return html
}

const resetSystemPromptToConversation = () => {
  systemPrompt.value = conversationSystemPrompt.value || ''
}

const upsertSystemMessage = (content) => {
  const nextContent = String(content || '').trim()
  if (!nextContent) return

  const index = messages.value.findIndex((item) => item?.role === 'system')
  if (index === -1) {
    messages.value.unshift({
      id: Date.now() + Math.random(),
      role: 'system',
      content: nextContent,
      time: formatTime()
    })
    return
  }

  const existing = messages.value[index]
  const updated = {
    ...existing,
    content: nextContent,
    time: formatTime()
  }
  messages.value.splice(index, 1, updated)
  if (index > 0) {
    const [item] = messages.value.splice(index, 1)
    messages.value.unshift(item)
  }
}

const setCopyButtonLabel = (button, label) => {
  if (!button) return
  button.textContent = label
}

const copyText = async (text) => {
  if (!text) return false

  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Continue to fallback.
    }
  }

  try {
    const input = document.createElement('textarea')
    input.value = text
    input.setAttribute('readonly', 'readonly')
    input.style.position = 'fixed'
    input.style.opacity = '0'
    input.style.pointerEvents = 'none'
    document.body.appendChild(input)
    input.select()
    const copied = document.execCommand('copy')
    document.body.removeChild(input)
    return copied
  } catch {
    return false
  }
}

const handleChatBodyClick = async (event) => {
  const button = event?.target?.closest?.('.code-copy-btn')
  if (!button || !listRef.value?.contains(button)) return
  event.preventDefault()

  const block = button.closest('.md-code-block')
  const codeEl = block?.querySelector('pre code')
  const raw = codeEl?.textContent || ''
  if (!raw) return

  const ok = await copyText(raw)
  setCopyButtonLabel(button, ok ? '已复制' : '复制失败')

  const previous = copyButtonTimers.get(button)
  if (previous) {
    window.clearTimeout(previous)
  }

  const timer = window.setTimeout(() => {
    setCopyButtonLabel(button, '复制')
    copyButtonTimers.delete(button)
  }, ok ? 1200 : 1800)
  copyButtonTimers.set(button, timer)
}

const scrollToBottom = () => {
  if (!listRef.value) return
  listRef.value.scrollTop = listRef.value.scrollHeight
}

const emitToast = (message, duration) => {
  if (!message) return
  window.dispatchEvent(new CustomEvent('llmxpress-toast', { detail: { message, duration } }))
}

const closeConversationMenu = () => {
  actionMenuConversationId.value = ''
}

const toggleConversationMenu = (conversationId) => {
  if (isGenerating.value) return
  const targetId = normalizeConversationId(conversationId)
  if (!targetId) return
  if (deletingConversationId.value === targetId) return
  actionMenuConversationId.value = actionMenuConversationId.value === targetId ? '' : targetId
}

const openDeleteConfirm = (item) => {
  const targetId = normalizeConversationId(item?.conversation_id)
  if (!targetId) return
  closeConversationMenu()
  deleteConfirmTarget.value = { id: targetId }
}

const closeDeleteConfirm = () => {
  if (deletingConversationId.value) return
  deleteConfirmTarget.value = null
}

const handleGlobalClick = (event) => {
  const target = event?.target
  if (!(target instanceof Element)) {
    closeConversationMenu()
    return
  }
  if (target.closest('.history-item-actions')) {
    return
  }
  closeConversationMenu()
}

const handleGlobalKeydown = (event) => {
  if (event?.key !== 'Escape') return

  if (deleteConfirmTarget.value && !deletingConversationId.value) {
    deleteConfirmTarget.value = null
    return
  }

  closeConversationMenu()
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

    if (actionMenuConversationId.value) {
      const menuTargetExists = conversations.value.some((item) => {
        return normalizeConversationId(item?.conversation_id) === actionMenuConversationId.value
      })
      if (!menuTargetExists) {
        closeConversationMenu()
      }
    }

    const confirmTargetId = normalizeConversationId(deleteConfirmTarget.value?.id)
    if (confirmTargetId) {
      const confirmTargetExists = conversations.value.some((item) => {
        return normalizeConversationId(item?.conversation_id) === confirmTargetId
      })
      if (!confirmTargetExists) {
        deleteConfirmTarget.value = null
      }
    }

    if (activeConversationId.value) {
      const exists = conversations.value.some((item) => {
        return normalizeConversationId(item?.conversation_id) === activeConversationId.value
      })
      if (!exists) {
        activeConversationId.value = null
        currentConversationTitle.value = ''
        conversationSystemPrompt.value = ''
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
  closeConversationMenu()

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

    const loadedMessages = payload.messages.map((item) => ({
      id: item?.message_id || Date.now() + Math.random(),
      role: item?.role || 'assistant',
      content: item?.content || '',
      time: formatTime(item?.created_at)
    }))
    messages.value = loadedMessages

    const existingSystem = resolveSystemPromptFromMessages(loadedMessages)
    conversationSystemPrompt.value = existingSystem
    systemPrompt.value = existingSystem

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
  closeConversationMenu()
  closeDeleteConfirm()
  error.value = ''
  activeConversationId.value = null
  currentConversationTitle.value = ''
  conversationSystemPrompt.value = ''
  messages.value = []
}

const confirmDeleteConversation = async () => {
  if (isGenerating.value) return

  const targetId = normalizeConversationId(deleteConfirmTarget.value?.id)
  if (!targetId) return
  if (deletingConversationId.value === targetId) return

  error.value = ''
  if (!(await ensureAuth())) {
    return
  }

  deletingConversationId.value = targetId
  try {
    const token = getToken()
    await deleteConversationApi(token, targetId)

    const previousLength = conversations.value.length
    const nextConversations = conversations.value.filter((item) => {
      return normalizeConversationId(item?.conversation_id) !== targetId
    })
    conversations.value = nextConversations
    const removedCount = Math.max(0, previousLength - nextConversations.length)
    conversationsTotal.value = Math.max(0, conversationsTotal.value - removedCount)

    if (activeConversationId.value === targetId) {
      activeConversationId.value = null
      currentConversationTitle.value = ''
      conversationSystemPrompt.value = ''
      messages.value = []
    } else {
      syncConversationTitle()
    }

    deleteConfirmTarget.value = null
    closeConversationMenu()
    emitToast('删除成功', 1000)
  } catch (err) {
    const code = String(err?.code || '')
    if (code === '1002') {
      deleteConfirmTarget.value = null
      closeConversationMenu()
      emitToast('登录已过期，请重新登录。')
      logout()
      router.push({ name: 'login', query: { redirect: route.fullPath } })
      return
    }

    if (code === '1004') {
      deleteConfirmTarget.value = null
      closeConversationMenu()
      emitToast('会话已不存在')
      await reloadConversations()
      return
    }

    emitToast('删除失败')
  } finally {
    deletingConversationId.value = ''
  }
}

const stopGeneration = () => {
  abortRef.value?.abort()
}

const buildRequestMessages = (prompt) => {
  const draftSystem = systemPrompt.value.trim()

  if (activeConversationId.value) {
    if (shouldSendSystemOverride.value) {
      return [
        { role: 'system', content: draftSystem },
        { role: 'user', content: prompt }
      ]
    }

    // Continue mode: send only current user message by default.
    // Gateway appends stored history and keeps system at index 0.
    return [{ role: 'user', content: prompt }]
  }

  const payload = []
  if (draftSystem) {
    payload.push({
      role: 'system',
      content: draftSystem
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

const sendMessage = async () => {
  error.value = ''
  const prompt = input.value.trim()
  if (!prompt || isGenerating.value) return

  if (!selectedModel.value) {
    error.value = '请先选择模型'
    return
  }

  const now = Date.now()
  if (now - lastSubmitAt.value < SEND_THROTTLE_MS) {
    error.value = '发送过快，请稍后再试。'
    return
  }
  lastSubmitAt.value = now

  maxTokens.value = normalizedMaxTokens.value
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
  const nextSystemFromRequest = apiMessages[0]?.role === 'system'
    ? String(apiMessages[0]?.content || '').trim()
    : ''
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
        max_tokens: normalizedMaxTokens.value,
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
        max_tokens: normalizedMaxTokens.value,
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
      if (nextSystemFromRequest) {
        conversationSystemPrompt.value = nextSystemFromRequest
        upsertSystemMessage(nextSystemFromRequest)
      }
    }
  } catch (err) {
    assistantMessage.pending = false
    if (err?.name === 'AbortError') {
      assistantMessage.content = assistantMessage.content || '已停止生成。'
    } else {
      const message = resolveChatErrorMessage(err)
      assistantMessage.content = assistantMessage.content || message
      error.value = message
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
  window.addEventListener('click', handleGlobalClick)
  window.addEventListener('keydown', handleGlobalKeydown)
  await reloadModels()
  await reloadConversations()
})

onBeforeUnmount(() => {
  window.removeEventListener('llmxpress-auth', refreshAuth)
  window.removeEventListener('click', handleGlobalClick)
  window.removeEventListener('keydown', handleGlobalKeydown)
  stopGeneration()
})
</script>
