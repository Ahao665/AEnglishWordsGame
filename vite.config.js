import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

// https://vitejs.dev/config/
const base = process.env.BASE_PATH || '/'

// 开发时提供 wasm，构建时复制到 dist，避免依赖国外 CDN
const wasmSource = path.resolve(__dirname, 'node_modules/@mediapipe/tasks-vision/wasm')
function copyWasmToDist() {
  return {
    name: 'copy-mediapipe-wasm',
    closeBundle() {
      const outDir = path.resolve(__dirname, 'dist')
      const wasmDir = path.join(outDir, 'wasm')
      if (!fs.existsSync(wasmSource)) return
      if (!fs.existsSync(wasmDir)) fs.mkdirSync(wasmDir, { recursive: true })
      for (const name of fs.readdirSync(wasmSource)) {
        fs.copyFileSync(path.join(wasmSource, name), path.join(wasmDir, name))
      }
    },
  }
}

function serveWasmInDev() {
  return {
    name: 'serve-mediapipe-wasm',
    configureServer(server) {
      server.middlewares.use('/wasm', (req, res, next) => {
        const name = path.basename(req.url?.split('?')[0] || '')
        const file = path.join(wasmSource, name)
        if (!name || !fs.existsSync(file) || !fs.statSync(file).isFile()) return next()
        res.setHeader('Content-Type', req.url?.endsWith('.wasm') ? 'application/wasm' : 'application/javascript')
        fs.createReadStream(file).pipe(res)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), serveWasmInDev(), copyWasmToDist()],
  base,
})
