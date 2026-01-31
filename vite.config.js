import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // 部署到 GitHub Pages 时由 Actions 传入 BASE_PATH（如 /repo-name/），本地开发为 /
  base: process.env.BASE_PATH || '/',
})
