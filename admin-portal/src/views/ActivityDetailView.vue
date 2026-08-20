<template>
  <div class="fade-in">
    <!-- Header -->
    <div class="page-header">
      <div>
        <div style="display: flex; align-items: center; gap: 10px;">
          <h1 class="page-title">{{ activity?.actividad || 'Detalle de Actividad' }}</h1>
          <span v-if="activity" :class="['badge', statusClass(activity.estado)]">
            {{ activity.estado }}
          </span>
        </div>
        <p class="page-subtitle">{{ activity?.detalle || 'Información de la tarea de campo asignada' }}</p>
      </div>
      <router-link to="/activities" class="btn btn-ghost">
        <i class="ph ph-arrow-left"></i> Volver a Actividades
      </router-link>
    </div>

    <div v-if="loading" class="card" style="padding: 40px; text-align: center; color: var(--text-muted);">
      Cargando detalle de actividad...
    </div>

    <template v-else-if="activity">
      <!-- Summary Bar -->
      <div class="summary-grid">
        <div class="summary-card">
          <span class="summary-label">Sede Asignada</span>
          <span class="summary-value">{{ activity.location?.nombre || 'Sin Sede' }}</span>
          <small style="color: var(--text-muted); font-size: 0.75rem;">{{ activity.location?.sede_reg || 'Lima' }} - {{ activity.location?.sede_juris || 'Jurisdicción' }}</small>
        </div>

        <div class="summary-card">
          <span class="summary-label">Período de Validez</span>
          <span class="summary-value">{{ activity.period?.nombre || '-' }}</span>
          <small style="color: var(--text-muted); font-size: 0.75rem;">
            {{ activity.period ? `${formatDate(activity.period.fec_inicio)} - ${formatDate(activity.period.fec_fin)}` : 'Sin horario definido' }}
          </small>
        </div>

        <div class="summary-card">
          <span class="summary-label">Personal Asignado</span>
          <span class="summary-value" style="margin-bottom: 6px;">{{ assignedUsersWithStatus.length }} Supervisores</span>
          <button
            v-if="assignedUsersWithStatus.length > 0"
            type="button"
            class="btn btn-sm btn-secondary"
            style="align-self: flex-start; margin-top: 4px; display: inline-flex; align-items: center; gap: 6px;"
            @click="showModal = true"
          >
            <i class="ph ph-users"></i> Ver Personal Asignado ({{ assignedUsersWithStatus.length }})
          </button>
          <span v-else class="summary-value" style="font-size: 0.85rem; color: var(--text-muted);">Sin asignar</span>
        </div>

        <div class="summary-card">
          <span class="summary-label">Asistencias / Evidencias</span>
          <span class="summary-value">{{ activity.attendances?.length || 0 }} Registros</span>
          <small style="color: var(--text-muted); font-size: 0.75rem;">Marcaciones en sede</small>
        </div>
      </div>

      <!-- Main Content Grid -->
      <div class="detail-grid" style="margin-top: 20px;">
        <!-- Left Column: Map -->
        <div class="card">
          <h3 style="font-size: 1rem; margin-bottom: 14px; display: flex; align-items: center; gap: 8px;">
            <i class="ph ph-map-pin" style="color: var(--primary);"></i> Ubicación GPS de la Sede
          </h3>
          <div id="activity-map" style="height: 380px; border-radius: var(--radius); border: 1px solid var(--border-subtle);"></div>
        </div>

        <!-- Right Column: Attendances List -->
        <div class="card">
          <h3 style="font-size: 1rem; margin-bottom: 14px; display: flex; align-items: center; gap: 8px;">
            <i class="ph ph-check-circle" style="color: var(--primary);"></i> Asistencias Registradas
          </h3>

          <div v-if="!activity.attendances?.length" style="padding: 30px; text-align: center; color: var(--text-muted); font-size: 0.9rem;">
            No se han registrado marcaciones de asistencia para esta actividad.
          </div>

          <div v-else class="attendance-list">
            <div v-for="att in activity.attendances" :key="att.id" class="attendance-item">
              <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                  <span style="font-weight: 700; font-size: 0.9rem; color: var(--text-heading);">
                    {{ att.user?.username || 'Usuario' }}
                  </span>
                  <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">
                    Hora: {{ new Date(att.checked_in_at).toLocaleString() }}
                  </div>
                </div>
                <span class="badge badge-success">{{ att.distance_m ? `${att.distance_m}m` : 'En rango' }}</span>
              </div>

              <p v-if="att.observacion" style="font-size: 0.85rem; color: var(--text-body); background: var(--bg-subtle); padding: 8px 12px; border-radius: 4px; margin-top: 8px;">
                {{ att.observacion }}
              </p>

              <div v-if="att.photos?.length" style="display: flex; gap: 6px; margin-top: 8px;">
                <a v-for="(photo, pIdx) in att.photos" :key="pIdx" :href="photo" target="_blank">
                  <img :src="photo" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px; border: 1px solid var(--border-subtle);" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Modal Personal Asignado con Buscador -->
    <div v-if="showModal" class="modal-backdrop" @click.self="showModal = false">
      <div class="modal-container">
        <div class="modal-header">
          <div>
            <h3 class="modal-title">Personal Asignado ({{ assignedUsersWithStatus.length }})</h3>
            <p class="modal-subtitle">Consulta y busca entre los supervisores asignados a esta actividad</p>
          </div>
          <button type="button" class="btn-close" @click="showModal = false">
            <i class="ph ph-x"></i>
          </button>
        </div>

        <div class="modal-body">
          <!-- Buscador -->
          <div class="search-box" style="margin-bottom: 16px; position: relative;">
            <i class="ph ph-magnifying-glass" style="position: absolute; left: 12px; top: 12px; font-size: 1.1rem; color: var(--text-muted);"></i>
            <input
              v-model="searchQuery"
              type="text"
              class="form-input"
              style="padding-left: 38px; width: 100%;"
              placeholder="Buscar por nombre, DNI o usuario..."
            />
          </div>

          <!-- Lista de Usuarios -->
          <div v-if="filteredAssignedUsers.length === 0" style="padding: 24px; text-align: center; color: var(--text-muted);">
            No se encontraron usuarios coincidentes con "{{ searchQuery }}".
          </div>

          <div v-else class="assigned-users-list">
            <div v-for="u in filteredAssignedUsers" :key="u.id" class="user-item-row">
              <div class="user-avatar">
                {{ (u.nombres?.[0] || u.username?.[0] || 'U').toUpperCase() }}
              </div>
              <div class="user-info">
                <div class="user-name">
                  {{ u.nombres ? `${u.nombres} ${u.ape_pat} ${u.ape_mat}`.trim() : `@${u.username}` }}
                </div>
                <div class="user-meta">
                  <span>@{{ u.username }}</span>
                  <span v-if="u.doc">• DNI: {{ u.doc }}</span>
                </div>
              </div>
              <div class="user-status-badge">
                <span :class="['badge', userStatusBadgeClass(u.status)]">
                  {{ formatUserStatusLabel(u.status) }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="showModal = false">Cerrar</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import api from '../services/api'

const props = defineProps({ id: String })

const activity = ref(null)
const loading = ref(true)
const showModal = ref(false)
const searchQuery = ref('')

const assignedUsersWithStatus = computed(() => {
  if (!activity.value) return []
  let usersList = []
  if (activity.value.activityUsers && activity.value.activityUsers.length > 0) {
    usersList = activity.value.activityUsers.map(au => {
      const u = au.user || {}
      return {
        id: u.id || au.id_user,
        username: u.username || '',
        nombres: u.supervisor?.nombres || '',
        ape_pat: u.supervisor?.ape_pat || '',
        ape_mat: u.supervisor?.ape_mat || '',
        doc: u.supervisor?.doc || '',
        status: au.user_status || 'pendiente',
        attendances_count: au.attendances_count || 0
      }
    })
  } else if (activity.value.user) {
    const u = activity.value.user
    usersList = [{
      id: u.id,
      username: u.username || '',
      nombres: u.supervisor?.nombres || '',
      ape_pat: u.supervisor?.ape_pat || '',
      ape_mat: u.supervisor?.ape_mat || '',
      doc: u.supervisor?.doc || '',
      status: activity.value.estado || 'pendiente',
      attendances_count: activity.value.attendances?.length || 0
    }]
  }
  return usersList
})

const filteredAssignedUsers = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return assignedUsersWithStatus.value
  return assignedUsersWithStatus.value.filter(u => {
    const fullName = `${u.nombres} ${u.ape_pat} ${u.ape_mat}`.toLowerCase()
    const username = (u.username || '').toLowerCase()
    const doc = (u.doc || '').toLowerCase()
    return fullName.includes(q) || username.includes(q) || doc.includes(q)
  })
})

function userStatusBadgeClass(status) {
  const map = {
    pendiente: 'badge-warning',
    asistencia_marcada: 'badge-info',
    completado: 'badge-success',
    cancelado: 'badge-danger'
  }
  return map[status] || 'badge-warning'
}

function formatUserStatusLabel(status) {
  const map = {
    pendiente: 'PENDIENTE',
    asistencia_marcada: 'ASISTENCIA MARCADA',
    completado: 'FINALIZADA',
    cancelado: 'CANCELADA'
  }
  return map[status] || status.toUpperCase()
}

function statusClass(estado) {
  const map = { pendiente: 'badge-warning', en_progreso: 'badge-info', completado: 'badge-success', cancelado: 'badge-danger' }
  return map[estado] || 'badge-info'
}

function formatDate(isoStr) {
  if (!isoStr) return ''
  try {
    return new Date(isoStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return isoStr
  }
}

async function fetchActivity() {
  loading.value = true
  try {
    const { data } = await api.get(`/activities/${props.id}`)
    activity.value = data
    await nextTick()
    drawMap()
  } catch (err) {
    console.error('Error fetching activity detail:', err)
  } finally {
    loading.value = false
  }
}

async function drawMap() {
  const L = await import('leaflet')
  await import('leaflet/dist/leaflet.css')

  const container = document.getElementById('activity-map')
  if (!container) return

  const ubiety = activity.value?.location?.ubiety
  const lat = ubiety?.latitud || -12.046
  const lng = ubiety?.longitud || -77.042

  const map = L.map('activity-map').setView([lat, lng], 16)

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; CARTO',
    maxZoom: 19,
  }).addTo(map)

  L.circleMarker([lat, lng], {
    radius: 10,
    color: '#024ad8',
    fillColor: '#024ad8',
    fillOpacity: 0.9,
  }).addTo(map).bindPopup(activity.value.location?.nombre || 'Sede principal')

  L.circle([lat, lng], {
    radius: 25,
    color: '#024ad8',
    fillColor: '#024ad8',
    fillOpacity: 0.1,
    dashArray: '4, 4',
  }).addTo(map)
}

onMounted(() => fetchActivity())
</script>

<style scoped>
.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.summary-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  padding: 16px;
  display: flex;
  flex-direction: column;
}

.summary-label {
  font-family: var(--font-heading);
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 4px;
}

.summary-value {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-heading);
  line-height: 1.3;
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.attendance-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 380px;
  overflow-y: auto;
}

.attendance-item {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  padding: 12px 14px;
}

/* Modal Styling */
.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(15, 23, 42, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 20px;
}

.modal-container {
  background: var(--bg-surface, #ffffff);
  border-radius: var(--radius-lg, 12px);
  width: 100%;
  max-width: 580px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-medium, #cbd5e1);
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
}

.modal-header {
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-subtle, #e2e8f0);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal-title {
  font-size: 1.1rem;
  font-weight: 800;
  color: var(--text-heading, #0f172a);
  margin: 0;
}

.modal-subtitle {
  font-size: 0.8rem;
  color: var(--text-muted, #64748b);
  margin: 2px 0 0 0;
}

.btn-close {
  background: transparent;
  border: none;
  font-size: 1.3rem;
  color: var(--text-muted, #64748b);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
}
.btn-close:hover {
  background: var(--bg-subtle, #f1f5f9);
  color: var(--text-heading, #0f172a);
}

.modal-body {
  padding: 20px 24px;
  overflow-y: auto;
  flex: 1;
}

.modal-footer {
  padding: 14px 24px;
  border-top: 1px solid var(--border-subtle, #e2e8f0);
  display: flex;
  justify-content: flex-end;
}

.assigned-users-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.user-item-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: var(--bg-subtle, #f8fafc);
  border: 1px solid var(--border-subtle, #e2e8f0);
  border-radius: 8px;
}

.user-avatar {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: #0F5698;
  color: #ffffff;
  font-weight: 700;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.user-info {
  flex: 1;
}

.user-name {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text-heading, #0f172a);
}

.user-meta {
  font-size: 0.78rem;
  color: var(--text-muted, #64748b);
  margin-top: 2px;
}
</style>
