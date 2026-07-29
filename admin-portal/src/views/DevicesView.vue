<template>
  <div class="fade-in">
    <div class="page-header">
      <div>
        <h1 class="page-title" style="display: flex; align-items: center; gap: 8px;"><i class="ph ph-device-mobile"></i> Dispositivos</h1>
        <p class="page-subtitle">Información de los dispositivos móviles de los trabajadores</p>
      </div>
    </div>

    <div v-if="loading" class="loading">Cargando dispositivos...</div>

    <div v-else class="card-grid">
      <div v-for="device in devices" :key="device.id" class="card" style="cursor: pointer;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
          <div>
            <h3 style="font-size: 1.1rem; font-weight: 600;">{{ device.manufacturer }} {{ device.model }}</h3>
            <p style="color: var(--text-secondary); font-size: 0.85rem;">{{ device.user?.username }}</p>
          </div>
          <span :class="['badge', batteryClass(device.battery_level)]">
            <i class="ph ph-battery-full"></i> {{ device.battery_level }}%
          </span>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 0.85rem;">
          <div>
            <span style="color: var(--text-muted);">Sistema</span>
            <div style="font-weight: 500;">{{ device.os }} {{ device.os_version }}</div>
          </div>
          <div>
            <span style="color: var(--text-muted);">Batería</span>
            <div style="font-weight: 500;">{{ device.battery_state }}</div>
          </div>
          <div>
            <span style="color: var(--text-muted);">App Version</span>
            <div style="font-weight: 500;">{{ device.app_version || '-' }}</div>
          </div>
          <div>
            <span style="color: var(--text-muted);">Última conexión</span>
            <div style="font-weight: 500;">{{ formatDate(device.last_seen_at) }}</div>
          </div>
        </div>

        <!-- Battery bar -->
        <div style="margin-top: 16px;">
          <div style="height: 4px; background: var(--bg-input); border-radius: 2px; overflow: hidden;">
            <div :style="{ width: device.battery_level + '%', height: '100%', background: batteryColor(device.battery_level), borderRadius: '2px', transition: 'width 0.5s' }"></div>
          </div>
        </div>
      </div>

      <div v-if="devices.length === 0" class="card" style="text-align: center; color: var(--text-muted); grid-column: 1 / -1; padding: 60px;">
        No hay dispositivos registrados.
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '../services/api'

const devices = ref([])
const loading = ref(true)

function batteryClass(level) {
  if (level >= 60) return 'badge-success'
  if (level >= 30) return 'badge-warning'
  return 'badge-danger'
}

function batteryColor(level) {
  if (level >= 60) return '#22c55e'
  if (level >= 30) return '#f59e0b'
  return '#ef4444'
}

function formatDate(date) {
  if (!date) return '-'
  return new Date(date).toLocaleString()
}

async function fetchDevices() {
  loading.value = true
  try {
    const { data } = await api.get('/devices')
    devices.value = data.data || []
  } catch (err) {
    console.error('Error:', err)
  } finally {
    loading.value = false
  }
}

onMounted(() => fetchDevices())
</script>
