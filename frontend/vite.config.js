import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/token': 'http://127.0.0.1:8000',
      '/pipeline': 'http://127.0.0.1:8000',
      '/metadata': 'http://127.0.0.1:8000',
      '/approvals': 'http://127.0.0.1:8000',
      '/documents': 'http://127.0.0.1:8000',
    }
  }
})
