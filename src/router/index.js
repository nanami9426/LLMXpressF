import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'
import Login from '../views/Login.vue'
import Chat from '../views/Chat.vue'
import LlmChat from '../views/LlmChat.vue'
import { validateToken } from '../auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: Home },
    { path: '/login', name: 'login', component: Login },
    {
      path: '/chat',
      name: 'chat',
      component: Chat,
      meta: { requiresAuth: true }
    },
    {
      path: '/llm',
      name: 'llm',
      component: LlmChat,
      meta: { requiresAuth: true }
    },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
})

router.beforeEach(async (to) => {
  if (to.meta.requiresAuth) {
    const ok = await validateToken()
    if (!ok) {
      return { name: 'login', query: { redirect: to.fullPath } }
    }
  }
  return true
})

export default router
