import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3003', changeOrigin: true },
      '/t': { target: 'http://localhost:3003', changeOrigin: true },
      '/c': { target: 'http://localhost:3003', changeOrigin: true },
      '/sim': { target: 'http://localhost:3003', changeOrigin: true },
    },
  },
})
