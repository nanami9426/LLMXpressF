<template>
  <section class="page">
    <div class="login">
      <div class="login-panel">
        <h2>登录 IMGO</h2>
        <p class="muted">登录成功后将自动跳转到主页。</p>
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
        <p class="tip">提示：请使用已注册邮箱登录（后端校验邮箱与密码）。</p>
      </div>
      <div class="login-aside">
        <div class="aside-card">
          <h3>为什么要登录？</h3>
          <p>聊天界面需要登录权限。你可以在此页面快速完成验证。</p>
          <ul>
            <li>登录成功自动跳回主页</li>
            <li>可在右上角随时退出</li>
            <li>权限控制已就位</li>
          </ul>
        </div>
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
