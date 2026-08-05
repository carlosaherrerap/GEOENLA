<template>
  <div class="whatsapp-messages-container">
    <div class="page-header">
      <div>
        <h1 class="page-title">Historial de WhatsApp</h1>
        <p class="page-subtitle">Registro de mensajes de inactividad enviados a supervisores</p>
      </div>
      <div>
        <button class="btn btn-secondary" @click="fetchChats" :disabled="loading">
          Refrescar Historial
        </button>
      </div>
    </div>

    <!-- Filtros para el Superusuario (su) -->
    <div v-if="userRole === 'su'" class="filter-card">
      <span class="filter-label">Filtrar por Sede Regional:</span>
      <select v-model="selectedSedeFilter" @change="fetchChats" class="select-input">
        <option value="">Todas las regiones</option>
        <option value="LIMA">Lima</option>
        <option value="AREQUIPA">Arequipa</option>
        <option value="LA LIBERTAD">La Libertad</option>
      </select>
    </div>

    <!-- Indicador de carga -->
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>Cargando historial de mensajes...</p>
    </div>

    <!-- Estado vacío -->
    <div v-else-if="chatLogs.length === 0" class="empty-state">
      <p>No se encontraron registros de WhatsApp para la región indicada.</p>
    </div>

    <!-- Lista de mensajes -->
    <div v-else class="chats-table-container">
      <table class="chats-table">
        <thead>
          <tr>
            <th>Fecha y Hora</th>
            <th>Enviado Por (Admin)</th>
            <th>Región</th>
            <th>Destinatario (Supervisor)</th>
            <th>Teléfono</th>
            <th>Mensaje</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="msg in chatLogs" :key="msg.id">
            <td class="cell-time">{{ formatTime(msg.sent_at) }}</td>
            <td class="cell-sender">
              {{ msg.admin?.supervisor ? `${msg.admin.supervisor.nombres} ${msg.admin.supervisor.ape_pat}` : msg.admin?.username }}
            </td>
            <td>
              <span class="badge badge-region">{{ msg.sede_reg }}</span>
            </td>
            <td class="cell-receiver">
              {{ msg.receiver ? `${msg.receiver.nombres} ${msg.receiver.ape_pat} ${msg.receiver.ape_mat}` : 'Desconocido' }}
            </td>
            <td class="cell-phone">{{ msg.phone }}</td>
            <td class="cell-message">{{ msg.message }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '../services/api'

const chatLogs = ref([])
const loading = ref(false)
const userRole = ref('admin')
const selectedSedeFilter = ref('')

async function fetchUserRole() {
  try {
    const userStr = localStorage.getItem('user')
    if (userStr) {
      const user = JSON.parse(userStr)
      userRole.value = user.rol || 'admin'
    }
  } catch (err) {
    console.error('Error al parsear rol del usuario:', err)
  }
}

async function fetchChats() {
  loading.value = true
  try {
    let url = '/whatsapp/messages'
    if (userRole.value === 'su' && selectedSedeFilter.value) {
      url += `?sede_reg=${encodeURIComponent(selectedSedeFilter.value)}`
    }
    const res = await api.get(url)
    chatLogs.value = res.data
  } catch (err) {
    console.error('Error al cargar historial de mensajes:', err)
  } finally {
    loading.value = false
  }
}

function formatTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleString('es-PE', { timeZone: 'America/Lima' })
}

onMounted(async () => {
  await fetchUserRole()
  await fetchChats()
})
</script>

<style scoped>
.whatsapp-messages-container {
  padding: 24px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.page-title {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--text-heading);
  margin: 0 0 4px 0;
}

.page-subtitle {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin: 0;
}

.filter-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 24px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.filter-label {
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--text-heading);
}

.select-input {
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-heading);
  font-size: 0.88rem;
}

.loading-state {
  text-align: center;
  padding: 60px 0;
  color: var(--text-muted);
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-color);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  margin: 0 auto 12px auto;
  animation: spin 1s linear infinite;
}

.empty-state {
  text-align: center;
  padding: 60px 0;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.chats-table-container {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.chats-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.chats-table th,
.chats-table td {
  padding: 14px 16px;
  font-size: 0.88rem;
  border-bottom: 1px solid var(--border-color);
}

.chats-table th {
  background: var(--bg-hover);
  color: var(--text-heading);
  font-weight: 700;
}

.chats-table td {
  color: var(--text-heading);
}

.cell-time {
  white-space: nowrap;
  color: var(--text-muted);
  font-size: 0.82rem;
}

.cell-sender {
  font-weight: 600;
}

.cell-receiver {
  font-weight: 600;
}

.cell-phone {
  font-family: monospace;
  font-size: 0.85rem;
}

.cell-message {
  white-space: pre-wrap;
  line-height: 1.4;
  color: var(--text-heading);
  max-width: 350px;
}

.badge {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 20px;
}

.badge-region {
  background: rgba(2, 74, 216, 0.08);
  color: var(--primary-color);
  border: 1px solid rgba(2, 74, 216, 0.15);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
