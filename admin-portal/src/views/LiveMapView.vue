<template>
  <div class="fade-in">
    <div class="page-header">
      <div>
        <h1 class="page-title" style="display: flex; align-items: center; gap: 8px;"><i class="ph ph-map-trifold"></i> Mapa en Vivo</h1>
        <p class="page-subtitle">Seguimiento de trayectos, sedes y marcación de asistencia en tiempo real</p>
      </div>
    </div>

    <!-- Filters -->
    <div class="filters-bar">
      <div class="form-group" style="flex: 2;">
        <label class="form-label">Seleccionar Usuario *</label>
        <select v-model="selectedUser" class="form-select" @change="onUserChange">
          <option value="">-- Selecciona un usuario para ver su trayecto --</option>
          <option v-for="u in users" :key="u.id" :value="u.id">
            {{ u.username }}
          </option>
        </select>
      </div>
      <div class="form-group" style="flex: 1;">
        <label class="form-label">Fecha de Jornada</label>
        <input v-model="selectedDate" type="date" class="form-input" @change="fetchTrackings" />
      </div>
      <button class="btn btn-primary" @click="fetchTrackings" style="margin-top: auto;">
        <i class="ph ph-arrows-clockwise"></i> Actualizar
      </button>
    </div>

    <!-- Mensaje cuando no hay usuario seleccionado -->
    <div v-if="!selectedUser" class="card" style="margin-top: 16px; text-align: center; padding: 40px; background-color: var(--bg-subtle);">
      <i class="ph ph-user-focus" style="font-size: 2.5rem; color: var(--primary);"></i>
      <h3 style="margin-top: 12px; font-size: 1.1rem; color: var(--text-heading);">Selecciona un usuario en el filtro superior</h3>
      <p style="color: var(--text-muted); font-size: 0.875rem;">Para mantener el mapa organizado, debes seleccionar un usuario para desplegar su ruta completa de jornada y puntos de actividad.</p>
    </div>

    <!-- Compact Badges -->
    <div class="badges-row" v-else-if="trackings.length > 0">
      <div :class="['chip-badge', selectedUserActive ? 'chip-success' : 'chip-danger']">
        <i class="ph ph-user"></i>
        <span><strong>Estado App:</strong> {{ selectedUserActive ? 'ACTIVO' : 'INACTIVO' }}</span>
      </div>
      <div class="chip-badge chip-primary">
        <i class="ph ph-navigation-arrow"></i>
        <span><strong>Puntos Capturados:</strong> {{ trackings.length }}</span>
      </div>
      <div class="chip-badge chip-info">
        <i class="ph ph-clock"></i>
        <span><strong>Primer Registro (Inicio):</strong> {{ firstTime }}</span>
      </div>
      <div class="chip-badge chip-success">
        <i class="ph ph-clock-afternoon"></i>
        <span><strong>Último Registro:</strong> {{ lastTime }}</span>
      </div>
    </div>

    <!-- Map -->
    <div class="card" style="margin-top: 16px;" v-show="selectedUser">
      <div id="live-map" class="map-container" style="height: 600px; border-radius: var(--radius-lg);"></div>
    </div>

    <!-- Modal para Fotos y Comentarios de Marcación de Asistencia -->
    <div v-if="activeAttendanceModal" class="modal-overlay" @click.self="activeAttendanceModal = null">
      <div class="modal-card" style="max-width: 500px;">
        <div class="modal-header">
          <div>
            <h3 class="modal-title">Detalle de Marcación / Evidencia</h3>
            <span style="font-size: 0.75rem; color: var(--primary); font-weight: 600; font-family: var(--font-mono); text-transform: uppercase;">
              {{ activeAttendanceModal.estado === 'completado' ? 'FIN DE ACTIVIDAD' : 'ASISTENCIA MARCADA' }}
            </span>
          </div>
          <button class="btn-close" @click="activeAttendanceModal = null">&times;</button>
        </div>

        <div style="padding: 24px;">
          <div style="margin-bottom: 16px;">
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 4px;"><strong>Actividad / Sede:</strong></p>
            <p style="font-size: 1rem; font-weight: 700; color: var(--text-heading);">
              {{ activeAttendanceModal.activity?.actividad || 'Actividad en campo' }}
            </p>
            <p style="font-size: 0.85rem; color: var(--primary); font-weight: 600;">
              Sede: {{ activeAttendanceModal.location?.nombre || 'Sede principal' }} ({{ activeAttendanceModal.location?.sede_reg || 'Lima' }} - {{ activeAttendanceModal.location?.sede_juris || 'Jurisdicción' }})
            </p>
          </div>

          <div style="margin-bottom: 16px;">
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 4px;"><strong>Fecha y Hora:</strong></p>
            <p style="font-size: 0.9rem; font-family: var(--font-mono);">
              {{ new Date(activeAttendanceModal.checked_in_at).toLocaleString() }}
            </p>
          </div>

          <div style="margin-bottom: 16px;">
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 4px;"><strong>Comentario / Descripción:</strong></p>
            <p style="font-size: 0.9rem; background: var(--bg-canvas); padding: 12px; border-radius: var(--radius); border: 1px solid var(--border-subtle);">
              {{ activeAttendanceModal.observacion || 'Sin comentarios registrados.' }}
            </p>
          </div>

          <div>
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 8px;"><strong>Fotos de Evidencia (Cloudflare R2):</strong></p>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;" v-if="activeAttendanceModal.photos && activeAttendanceModal.photos.length > 0">
              <a v-for="(img, idx) in activeAttendanceModal.photos" :key="idx" :href="img" target="_blank" style="display: block;">
                <img :src="img" style="width: 100px; height: 100px; object-fit: cover; border-radius: 8px; border: 1px solid var(--border-subtle);" />
              </a>
            </div>
            <p v-else style="font-size: 0.85rem; color: var(--text-muted); font-style: italic;">Sin fotos adjuntas</p>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-primary" @click="activeAttendanceModal = null">Cerrar</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, nextTick } from 'vue'
import api from '../services/api'

const users = ref([])
const activities = ref([])
const attendances = ref([])
const trackings = ref([])
const selectedUser = ref('')
const selectedDate = ref(new Date().toISOString().split('T')[0])
const activeAttendanceModal = ref(null)
const hasFittedUserBounds = ref(false)
let pollInterval = null

let map = null
let trackingsLayerGroup = null

const selectedUserObj = computed(() => {
  return users.value.find(u => u.id === selectedUser.value)
})

const selectedUserActive = computed(() => {
  if (!selectedUserObj.value) return false
  return isUserActive(selectedUserObj.value)
})

const firstTime = computed(() => {
  const valid = trackings.value.length > 1 ? trackings.value.slice(1) : trackings.value
  if (valid.length === 0) return '-'
  return new Date(valid[0].recorded_at).toLocaleTimeString()
})

const lastTime = computed(() => {
  const valid = trackings.value.length > 1 ? trackings.value.slice(1) : trackings.value
  if (valid.length === 0) return '-'
  return new Date(valid[valid.length - 1].recorded_at).toLocaleTimeString()
})

function isUserActive(u) {
  if (!u) return false
  if (u.estado === 'bloqueado') return false
  const lastSeen = u.deviceDetail?.last_seen_at || u.last_seen_at
  if (!lastSeen) return false
  const diffMs = Date.now() - new Date(lastSeen).getTime()
  return diffMs < 10 * 60 * 1000
}

function onUserChange() {
  hasFittedUserBounds.value = false
  fetchTrackings()
}

async function fetchUsers() {
  try {
    const { data } = await api.get('/users', { params: { per_page: 100, rol: 'usuario' } })
    const allUsers = data.data || []
    users.value = allUsers.filter(u => u.rol === 'usuario')
  } catch (err) {
    console.error('Error:', err)
  }
}

async function fetchActivities() {
  try {
    const { data } = await api.get('/activities')
    activities.value = data.data || []
  } catch (err) {
    console.error('Error:', err)
  }
}

async function fetchAttendances() {
  try {
    const { data } = await api.get('/attendances')
    attendances.value = data.data || []
  } catch (err) {
    console.error('Error attendances:', err)
  }
}

async function fetchTrackings() {
  if (!selectedUser.value) {
    trackings.value = []
    if (trackingsLayerGroup) trackingsLayerGroup.clearLayers()
    return
  }

  try {
    const params = {
      fecha: selectedDate.value,
      id_user: selectedUser.value
    }

    const [trackRes] = await Promise.all([
      api.get('/trackings', { params }),
      fetchAttendances()
    ])

    trackings.value = trackRes.data.data || []
    await nextTick()
    drawMap()
  } catch (err) {
    console.error('Error fetching trackings:', err)
  }
}

async function drawMap() {
  if (!selectedUser.value) return

  const L = await import('leaflet')
  await import('leaflet/dist/leaflet.css')

  const container = document.getElementById('live-map')
  if (!container) return

  if (!map) {
    map = L.map('live-map').setView([-12.046, -77.042], 13)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; CARTO',
      maxZoom: 19,
    }).addTo(map)

    trackingsLayerGroup = L.layerGroup().addTo(map)
  }

  trackingsLayerGroup.clearLayers()

  const allCoords = []

  // Omitir obligatoriamente el primer punto capturado por posible imprecisión inicial/cold start
  const validTrackings = trackings.value.length > 1 ? trackings.value.slice(1) : trackings.value
  const coords = validTrackings.map(t => [t.lat, t.lng])
  allCoords.push(...coords)

  if (coords.length > 0) {
    // Dibujar línea continua de la jornada completa a partir del 2do punto
    L.polyline(coords, {
      color: '#024ad8',
      weight: 4,
      opacity: 0.85,
      smoothFactor: 1.5,
    }).addTo(trackingsLayerGroup)

    const lastCoord = coords[coords.length - 1]
    const lastPoint = validTrackings[validTrackings.length - 1]
    const firstPoint = validTrackings[0]
    const uName = lastPoint.user?.username || 'Usuario'

    // Punto de Inicio de jornada (Verde - 2do punto capturado en adelante)
    L.circleMarker(coords[0], {
      radius: 8,
      color: '#16a34a',
      fillColor: '#16a34a',
      fillOpacity: 1,
    }).addTo(trackingsLayerGroup).bindPopup(`<b>Inicio de Jornada (${uName})</b><br>Hora: ${new Date(firstPoint.recorded_at).toLocaleTimeString()}`)

    // Punto de Ubicación Actual / Fin de jornada (Azul en vivo)
    L.circleMarker(lastCoord, {
      radius: 10,
      color: '#024ad8',
      fillColor: '#024ad8',
      fillOpacity: 1,
      className: 'pulse-marker',
    }).addTo(trackingsLayerGroup).bindPopup(`<b>${uName}</b><br>Ubicación actual en vivo<br>Hora: ${new Date(lastPoint.recorded_at).toLocaleTimeString()}`)
  }

  // Dibujar Marcadores de Actividades / Asistencia registrados a lo largo de la ruta
  attendances.value.forEach(att => {
    if (att.id_user !== selectedUser.value) return

    const lat = Number(att.lat)
    const lng = Number(att.lng)
    allCoords.push([lat, lng])

    const isFinal = att.estado === 'completado'
    const pinColor = isFinal ? '#dc2626' : '#2563eb'
    const statusTitle = isFinal ? 'Fin de Actividad' : 'Asistencia Marcada'

    const marker = L.circleMarker([lat, lng], {
      radius: 11,
      color: '#ffffff',
      weight: 2,
      fillColor: pinColor,
      fillOpacity: 1,
    }).addTo(trackingsLayerGroup)

    const popupHtml = `
      <div style="font-family: sans-serif; font-size: 0.85rem;">
        <b style="color: ${pinColor}; font-size: 0.95rem;">${statusTitle}</b><br>
        <b>Sede:</b> ${att.location?.nombre || 'Sede'}<br>
        <b>Hora:</b> ${new Date(att.checked_in_at).toLocaleTimeString()}<br>
        <b>Observación:</b> ${att.observacion || '-'}<br>
        <button id="btn-att-${att.id}" style="margin-top: 8px; background: #024ad8; color: #fff; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 0.75rem;">
          Ver Fotos y Detalle
        </button>
      </div>
    `
    marker.bindPopup(popupHtml)

    marker.on('popupopen', () => {
      setTimeout(() => {
        const btn = document.getElementById(`btn-att-${att.id}`)
        if (btn) {
          btn.onclick = () => {
            activeAttendanceModal.value = att
          }
        }
      }, 100)
    })
  })

  // Enfocar / Centrar el mapa ÚNICAMENTE 1 vez al seleccionar/cambiar el usuario en el dropdown
  if (allCoords.length > 0 && !hasFittedUserBounds.value) {
    map.fitBounds(allCoords, { padding: [50, 50] })
    hasFittedUserBounds.value = true
  }
}

onMounted(async () => {
  await Promise.all([fetchUsers(), fetchActivities(), fetchAttendances()])
  await fetchTrackings()

  pollInterval = setInterval(() => {
    fetchTrackings()
  }, 10000)
})

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval)
})
</script>

<style scoped>
.badges-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 12px;
}

.chip-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 0.85rem;
  font-family: var(--font-heading);
}

.chip-primary {
  background-color: var(--primary-light);
  color: var(--primary);
  border: 1px solid var(--primary-border);
}

.chip-info {
  background-color: #f0f9ff;
  color: #0284c7;
  border: 1px solid #bae6fd;
}

.chip-success {
  background-color: #f0fdf4;
  color: #16a34a;
  border: 1px solid #bbf7d0;
}

.chip-danger {
  background-color: #fef2f2;
  color: #dc2626;
  border: 1px solid #fecaca;
}

:deep(.pulse-marker) {
  animation: pulse-ring 1.5s infinite;
}

@keyframes pulse-ring {
  0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.5); }
  70% { box-shadow: 0 0 0 15px rgba(239, 68, 68, 0); }
  100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
}
</style>
