<template>
  <div class="layout">
    <aside class="sidebar">
      <div class="sidebar-logo">
        <span class="sidebar-logo-text" style="color: #ffffff; font-size: 1.4rem; font-weight: 800; letter-spacing: 0.05em;">ENLAGEO</span>
      </div>
      <nav class="sidebar-nav">
        <router-link to="/users" class="nav-item">
          <i class="ph ph-users" style="font-size: 1.2rem;"></i> <span>Usuarios</span>
        </router-link>
        <router-link to="/routes" class="nav-item">
          <i class="ph ph-path" style="font-size: 1.2rem;"></i> <span>Rutas</span>
        </router-link>
        <router-link to="/activities" class="nav-item">
          <i class="ph ph-clipboard-text" style="font-size: 1.2rem;"></i> <span>Actividades</span>
        </router-link>
        <router-link to="/map" class="nav-item">
          <i class="ph ph-map-pin-line" style="font-size: 1.2rem;"></i> <span>Mapa en Vivo</span>
        </router-link>
        <router-link to="/chat" class="nav-item">
          <i class="ph ph-chat-circle-dots" style="font-size: 1.2rem;"></i> <span>Chat en Vivo</span>
        </router-link>
        <router-link to="/connectivity" class="nav-item">
          <i class="ph ph-whatsapp-logo" style="font-size: 1.2rem; color: #25D366;"></i> <span>Conectividad</span>
        </router-link>
      </nav>
      <div style="padding: 16px; border-top: 1px solid rgba(255, 255, 255, 0.15); background-color: transparent; color: #ffffff;">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
          <div style="width: 32px; height: 32px; border-radius: 50%; background: rgba(255, 255, 255, 0.2); color: #ffffff; font-weight: 700; display: flex; align-items: center; justify-content: center; font-family: var(--font-heading);">
            {{ currentUser?.username?.[0]?.toUpperCase() || 'A' }}
          </div>
          <div style="overflow: hidden;">
            <div style="font-weight: 600; font-size: 0.85rem; color: #ffffff; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
              {{ currentUser?.username || 'Administrador' }}
            </div>
            <small style="color: rgba(255, 255, 255, 0.7); font-size: 0.75rem;">{{ currentUser?.correo || 'admin@enlageo.com' }}</small>
          </div>
        </div>
        <button class="btn btn-sm" style="width: 100%; justify-content: center; background-color: rgba(255, 255, 255, 0.15); color: #ffffff; border: 1px solid rgba(255, 255, 255, 0.3);" @click="logout">
          <i class="ph ph-sign-out"></i> Cerrar sesión
        </button>
      </div>
    </aside>

    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import api from '../services/api'

const router = useRouter()

const currentUser = computed(() => {
  try {
    return JSON.parse(localStorage.getItem('user'))
  } catch {
    return null
  }
})

async function logout() {
  try {
    await api.post('/logout')
  } catch { /* ignore */ }
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  router.push('/login')
}
</script>
