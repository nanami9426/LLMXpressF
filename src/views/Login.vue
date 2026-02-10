<template>
  <section class="page">
    <div class="login">
      <div class="login-panel">
        <h2>登录 LLMXpress</h2>
        <p class="muted">登录后进入控制台。</p>
        <form class="form" @submit.prevent="handleSubmit">
          <label class="field">
            <span>邮箱</span>
            <input
              v-model.trim="form.email"
              type="email"
              placeholder="请输入邮箱"
              autocomplete="email"
            />
          </label>
          <label class="field">
            <span>密码</span>
            <input
              v-model.trim="form.password"
              type="password"
              placeholder="请输入密码"
              autocomplete="current-password"
            />
          </label>
          <p v-if="error" class="error">{{ error }}</p>
          <button class="btn wide" type="submit" :disabled="loading">
            {{ loading ? '登录中...' : '登录' }}
          </button>
        </form>
        <p class="tip">后端将校验邮箱与密码。</p>
      </div>
    </div>
  </section>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { loginApi } from '../api'
import { saveAuth } from '../auth'

const router = useRouter()
const route = useRoute()
const error = ref('')
const loading = ref(false)

const form = reactive({
  email: '',
  password: ''
})

const handleSubmit = async () => {
  error.value = ''
  if (!form.email) {
    error.value = '请输入邮箱'
    return
  }
  if (!form.password) {
    error.value = '请输入密码'
    return
  }

  try {
    loading.value = true
    const result = await loginApi({
      email: form.email,
      password: form.password
    })
    saveAuth({
      token: result.token,
      userId: result.userId,
      version: result.version,
      email: form.email
    })
    const redirect = route.query.redirect || '/'
    router.replace(redirect)
  } catch (err) {
    error.value = err?.message || '登录失败'
  } finally {
    loading.value = false
  }
}
</script>
