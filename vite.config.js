import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
const base = process.env.BASE_PATH || '/'

export default defineConfig({
  plugins: [react()],
  base,
})
