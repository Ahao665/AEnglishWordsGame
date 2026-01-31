import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
const base = process.env.BASE_PATH || '/'

export default defineConfig({
  plugins: [
    react(),
    // 构建时注入 <base>，使相对路径 ./mediapipe/ 在在线子路径（如 /repo-name/）下始终正确
    {
      name: 'inject-base-for-mediapipe',
      transformIndexHtml(html) {
        const baseTag = `<base href="${base}">`
        if (html.includes('<head>')) {
          return html.replace('<head>', `<head>\n    ${baseTag}`)
        }
        return html
      },
    },
  ],
  base,
})
