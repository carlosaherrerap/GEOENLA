<template>
  <div class="login-page">
    <div class="login-card fade-in">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="width: 48px; height: 48px; border-radius: 12px; background: var(--primary-light); color: var(--primary); display: inline-flex; align-items: center; justify-content: center; font-size: 1.8rem; margin-bottom: 12px;">
          <i class="ph-bold ph-globe-hemisphere-west"></i>
        </div>
        <h1 style="font-family: var(--font-heading); font-size: 1.75rem; font-weight: 800; color: var(--text-heading); letter-spacing: -0.03em;">
          enla<span style="color: var(--primary);">GEO</span>
        </h1>
        <p style="color: var(--text-muted); font-size: 0.875rem; margin-top: 4px;">Portal Administrativo de Campo</p>
      </div>

      <div v-if="error" style="background: var(--danger-bg); border: 1px solid var(--danger-border); padding: 10px 14px; border-radius: var(--radius); margin-bottom: 20px; color: var(--danger-text); font-size: 0.85rem;">
        {{ error }}
      </div>

      <form @submit.prevent="handleLogin">
        <div class="form-group">
          <label class="form-label">Usuario</label>
          <input
            v-model="form.username"
            type="text"
            class="form-input"
            placeholder="Ingresa tu usuario"
            required
            autocomplete="username"
          />
        </div>

        <div class="form-group">
          <label class="form-label">Contraseña</label>
          <input
            v-model="form.clave"
            type="password"
            class="form-input"
            placeholder="••••••••"
            required
            autocomplete="current-password"
          />
        </div>

        <button type="submit" class="btn btn-primary" style="width: 100%; justify-content: center; margin-top: 12px; padding: 11px;" :disabled="loading">
          {{ loading ? 'Ingresando...' : 'Iniciar Sesión' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '../services/api'

const router = useRouter()

const form = ref({ username: '', clave: '' })
const error = ref('')
const loading = ref(false)

async function handleLogin() {
  error.value = ''
  loading.value = true

  try {
    const { data } = await api.post('/login', form.value)

    if (data.user?.rol !== 'admin' && data.user?.rol !== 'su') {
      error.value = 'Acceso denegado. El portal administrativo está reservado para administradores.'
      return
    }

    localStorage.setItem('token', data.token)
    localStorage.setItem('user', JSON.stringify(data.user))
    router.push('/')
  } catch (err) {
    error.value = err.response?.data?.message || 'Error al iniciar sesión.'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--bg-canvas);
  padding: 20px;
}

.login-card {
  background-color: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  padding: 36px;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05);
}
</style>
