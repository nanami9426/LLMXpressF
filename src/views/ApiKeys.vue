<template>
  <section class="page">
    <div class="api-key-layout">
      <div class="api-key-sidebar">
        <div class="panel api-key-panel">
          <p class="eyebrow">JWT Only</p>
          <h2>API Key 管理</h2>
          <p class="muted">
            创建、查看、吊销用户级 API Key。所有管理接口都继续使用当前 JWT 登录态。
          </p>

          <form class="form" @submit.prevent="handleCreate">
            <label class="field">
              <span>名称</span>
              <input
                v-model.trim="form.name"
                type="text"
                maxlength="64"
                placeholder="例如：test-key"
                :disabled="creating"
              />
            </label>

            <label class="field">
              <span>过期时间</span>
              <input
                v-model="form.expiresAt"
                type="datetime-local"
                step="1"
                :disabled="creating"
              />
            </label>

            <p class="tip">留空表示不过期。提交时会自动转成 RFC3339 UTC 时间。</p>
            <p v-if="error" class="error">{{ error }}</p>

            <div class="api-key-form-actions">
              <button class="btn" type="submit" :disabled="creating">
                {{ creating ? '创建中...' : '创建 API Key' }}
              </button>
              <button class="btn ghost" type="button" :disabled="creating" @click="resetForm">
                清空
              </button>
            </div>
          </form>
        </div>

        <div class="panel api-key-panel">
          <h3>接入说明</h3>
          <div class="api-key-notes">
            <p>管理接口统一使用 <code>Authorization: Bearer &lt;JWT&gt;</code>。</p>
            <p>创建成功后只会返回一次完整 key，列表里只保留 <code>prefix</code>。</p>
            <p>调用 <code>/v1/*</code> 时既可以继续用 JWT，也可以改成 <code>Bearer sk_...</code>。</p>
          </div>
        </div>
      </div>

      <div class="panel api-key-list-panel">
        <div class="api-key-list-head">
          <div>
            <p class="eyebrow">Inventory</p>
            <h3>已创建的 API Key</h3>
            <p class="muted">
              共 {{ apiKeys.length }} 个，激活 {{ activeCount }} 个，已吊销 {{ revokedCount }} 个
            </p>
          </div>
          <button
            class="btn ghost"
            type="button"
            :disabled="loading || creating || Boolean(revokingId)"
            @click="loadApiKeys(true)"
          >
            {{ loading ? '刷新中...' : '刷新列表' }}
          </button>
        </div>

        <p class="tip">列表不会返回完整 <code>key</code>，只展示前缀和状态信息。</p>
        <p v-if="loading && apiKeys.length === 0" class="muted empty-state">加载 API Key 中...</p>
        <p v-else-if="apiKeys.length === 0" class="muted empty-state">暂无 API Key。</p>

        <div v-else class="api-key-list">
          <article
            v-for="item in apiKeys"
            :key="normalizeApiKeyId(item.api_key_id)"
            class="api-key-card"
            :class="{ revoked: isRevoked(item.status) }"
          >
            <div class="api-key-card-head">
              <div class="api-key-card-title">
                <h4>{{ item.name || '未命名 Key' }}</h4>
                <p class="api-key-prefix">{{ item.prefix || '-' }}</p>
              </div>
              <span class="api-key-status" :class="item.status || 'unknown'">
                {{ statusLabel(item.status) }}
              </span>
            </div>

            <div class="api-key-meta-grid">
              <div class="api-key-meta-item">
                <span>ID</span>
                <strong>{{ normalizeApiKeyId(item.api_key_id) || '-' }}</strong>
              </div>
              <div class="api-key-meta-item">
                <span>创建时间</span>
                <strong>{{ formatDateTime(item.created_at) }}</strong>
              </div>
              <div class="api-key-meta-item">
                <span>过期时间</span>
                <strong>{{ formatDateTime(item.expires_at, '永不过期') }}</strong>
              </div>
              <div class="api-key-meta-item">
                <span>最近使用</span>
                <strong>{{ formatDateTime(item.last_used_at, '未使用') }}</strong>
              </div>
              <div class="api-key-meta-item">
                <span>最近 IP</span>
                <strong>{{ item.last_used_ip || '-' }}</strong>
              </div>
            </div>

            <div class="api-key-card-actions">
              <button
                class="btn ghost danger"
                type="button"
                :disabled="isRevoked(item.status) || revokingId === normalizeApiKeyId(item.api_key_id)"
                @click="openRevokeConfirm(item)"
              >
                {{
                  revokingId === normalizeApiKeyId(item.api_key_id)
                    ? '吊销中...'
                    : isRevoked(item.status)
                      ? '已吊销'
                      : '吊销'
                }}
              </button>
            </div>
          </article>
        </div>
      </div>
    </div>

    <div v-if="revealedKey" class="confirm-mask" @click="closeRevealDialog">
      <div
        class="confirm-dialog api-key-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="API Key 创建成功"
        @click.stop
      >
        <h3>请立即复制完整 API Key</h3>
        <p>完整 key 只会展示这一次。关闭后，列表页只能看到前缀，无法再次查看完整内容。</p>

        <div class="api-key-secret-box">
          <div class="api-key-meta-grid compact">
            <div class="api-key-meta-item">
              <span>名称</span>
              <strong>{{ revealedKey.name || '-' }}</strong>
            </div>
            <div class="api-key-meta-item">
              <span>前缀</span>
              <strong>{{ revealedKey.prefix || '-' }}</strong>
            </div>
            <div class="api-key-meta-item">
              <span>过期时间</span>
              <strong>{{ formatDateTime(revealedKey.expires_at, '永不过期') }}</strong>
            </div>
          </div>

          <label class="field">
            <span>完整 Key</span>
            <textarea readonly rows="3" :value="revealedKey.key || ''" />
          </label>
        </div>

        <div class="confirm-actions">
          <button class="btn ghost" type="button" @click="closeRevealDialog">我已保存</button>
          <button class="btn" type="button" @click="copyRevealedKey">复制完整 Key</button>
        </div>
      </div>
    </div>

    <div v-if="revokeTarget" class="confirm-mask" @click="closeRevokeConfirm">
      <div
        class="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="吊销 API Key 确认"
        @click.stop
      >
        <h3>吊销 API Key</h3>
        <p>
          确认吊销
          <strong>{{ revokeTarget.name }}</strong>
          吗？吊销后该 key 将无法继续调用 <code>/v1/*</code> 接口。
        </p>
        <div class="confirm-actions">
          <button
            class="btn ghost"
            type="button"
            :disabled="revokingId === revokeTarget.id"
            @click="closeRevokeConfirm"
          >
            取消
          </button>
          <button
            class="btn danger"
            type="button"
            :disabled="revokingId === revokeTarget.id"
            @click="confirmRevoke"
          >
            {{ revokingId === revokeTarget.id ? '吊销中...' : '确认吊销' }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { createApiKeyApi, listApiKeysApi, revokeApiKeyApi } from '../api'
import { emitToast, getToken } from '../auth'

const apiKeys = ref([])
const loading = ref(false)
const creating = ref(false)
const error = ref('')
const revokingId = ref('')
const revealedKey = ref(null)
const revokeTarget = ref(null)

const form = reactive({
  name: '',
  expiresAt: ''
})

const activeCount = computed(() =>
  apiKeys.value.filter((item) => !isRevoked(item?.status)).length
)
const revokedCount = computed(() =>
  apiKeys.value.filter((item) => isRevoked(item?.status)).length
)

function normalizeApiKeyId(value) {
  return String(value ?? '').trim()
}

function isRevoked(status) {
  return String(status || '').toLowerCase() === 'revoked'
}

function statusLabel(status) {
  if (isRevoked(status)) return '已吊销'
  if (String(status || '').toLowerCase() === 'active') return '生效中'
  return status || 'unknown'
}

function formatDateTime(value, fallback = '-') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function sortApiKeys(list) {
  const getTimestamp = (value) => {
    const timestamp = new Date(value || 0).getTime()
    return Number.isFinite(timestamp) ? timestamp : 0
  }

  return [...list].sort((left, right) => {
    return getTimestamp(right?.created_at) - getTimestamp(left?.created_at)
  })
}

function resetForm() {
  form.name = ''
  form.expiresAt = ''
  error.value = ''
}

function buildCreatePayload() {
  const name = form.name.trim()
  if (!name) {
    throw new Error('请输入 API Key 名称。')
  }

  const payload = { name }
  if (form.expiresAt) {
    const expiresAt = new Date(form.expiresAt)
    if (Number.isNaN(expiresAt.getTime())) {
      throw new Error('过期时间格式不正确。')
    }
    payload.expires_at = expiresAt.toISOString()
  }

  return payload
}

async function loadApiKeys(showToast = false) {
  error.value = ''
  try {
    loading.value = true
    const list = await listApiKeysApi(getToken())
    apiKeys.value = sortApiKeys(list)
    if (showToast) {
      emitToast('API Key 列表已刷新。', 1400)
    }
  } catch (err) {
    error.value = err?.message || '加载 API Key 列表失败。'
  } finally {
    loading.value = false
  }
}

async function handleCreate() {
  error.value = ''
  try {
    const payload = buildCreatePayload()
    creating.value = true
    const data = await createApiKeyApi(getToken(), payload)
    resetForm()
    revealedKey.value = data?.key ? data : null
    if (revealedKey.value) {
      emitToast('API Key 已创建，请立即复制并保存完整 key。', 2400)
    } else {
      emitToast('API Key 已创建。', 1800)
    }
    await loadApiKeys()
  } catch (err) {
    error.value = err?.message || '创建 API Key 失败。'
  } finally {
    creating.value = false
  }
}

function closeRevealDialog() {
  revealedKey.value = null
}

async function copyText(value) {
  if (!value) return

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', 'readonly')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

async function copyRevealedKey() {
  try {
    await copyText(revealedKey.value?.key || '')
    emitToast('完整 API Key 已复制。', 1600)
  } catch {
    emitToast('复制失败，请手动复制完整 key。', 2200)
  }
}

function openRevokeConfirm(item) {
  if (isRevoked(item?.status)) return
  revokeTarget.value = {
    id: normalizeApiKeyId(item?.api_key_id),
    name: item?.name || item?.prefix || '未命名 Key'
  }
}

function closeRevokeConfirm() {
  revokeTarget.value = null
}

async function confirmRevoke() {
  if (!revokeTarget.value?.id) return
  error.value = ''

  try {
    revokingId.value = revokeTarget.value.id
    const data = await revokeApiKeyApi(getToken(), revokeTarget.value.id)
    closeRevokeConfirm()
    emitToast(data?.message || 'API Key 已吊销。', 1800)
    await loadApiKeys()
  } catch (err) {
    error.value = err?.message || '吊销 API Key 失败。'
  } finally {
    revokingId.value = ''
  }
}

onMounted(() => {
  loadApiKeys()
})
</script>
