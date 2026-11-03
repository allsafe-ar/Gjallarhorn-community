import path from 'path'
import { createRequire } from 'module'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { versionJson } from './vite-version-json'

const pkg = createRequire(import.meta.url)('./package.json')

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    // Publica /version.json con el id de esta compilación: el aviso de versión nueva lo compara (src/lib/version-nueva.ts).
    versionJson(pkg.version),
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
