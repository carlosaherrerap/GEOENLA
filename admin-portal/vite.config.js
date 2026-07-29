import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Configuración de Vite para el portal web Vue 3
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    host: '0.0.0.0',
  },
})
