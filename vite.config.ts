import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Project Pages: https://isaac1125.github.io/boardgame-home/
  base: command === 'build' ? '/boardgame-home/' : '/',
  server: {
    host: '127.0.0.1',
    port: 5173,
    allowedHosts: true,
  },
}))
