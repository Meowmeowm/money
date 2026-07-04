import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // 相对 base：同一份产物在 GitHub Pages 子路径 (/money/) 和根域名都能跑
  base: './',
  plugins: [react()],
  build: { target: 'es2019' },
})
