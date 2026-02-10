import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/v1': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/user': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/chat': {
        target: 'ws://localhost:5000',
        ws: true,
        changeOrigin: true
      }
    }
  }
})
