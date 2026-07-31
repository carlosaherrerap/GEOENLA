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
      <div class="form-group" style="flex: 1.5;">
        <label class="form-label">Buscar Usuario</label>
        <div style="position: relative;">
          <input
            v-model="userSearchQuery"
            type="text"
            class="form-input"
            placeholder="Nombre, usuario, correo o DNI..."
          />
        </div>
      </div>
      <div class="form-group" style="flex: 2;">
        <label class="form-label">Seleccionar Usuario *</label>
        <select v-model="selectedUser" class="form-select" @change="onUserChange">
          <option value="">-- Selecciona un usuario para ver su trayecto --</option>
          <optgroup label="🟢 USUARIOS ACTIVOS (SESIÓN ACTIVA)" v-if="activeUsers.length > 0">
            <option v-for="u in activeUsers" :key="u.id" :value="u.id">
              🟢 {{ u.username }} {{ u.supervisor ? `(${u.supervisor.nombres} ${u.supervisor.ape_pat})` : '' }}
            </option>
          </optgroup>
          <optgroup label="🔴 USUARIOS INACTIVOS (SIN SESIÓN)" v-if="inactiveUsers.length > 0">
            <option v-for="u in inactiveUsers" :key="u.id" :value="u.id">
              🔴 {{ u.username }} {{ u.supervisor ? `(${u.supervisor.nombres} ${u.supervisor.ape_pat})` : '' }}
            </option>
          </optgroup>
        </select>
      </div>
      <div class="form-group" style="flex: 1;">
        <label class="form-label">Fecha de Jornada</label>
        <input v-model="selectedDate" type="date" class="form-input" @change="fetchTrackings" />
      </div>
      <div style="margin-top: auto; display: flex; gap: 8px;">
        <button class="btn btn-primary" @click="fetchTrackings">
          <i class="ph ph-arrows-clockwise"></i> Actualizar
        </button>
        <button class="btn" @click="exportUsersToExcel" style="background-color: #059669; color: white; border: none; display: inline-flex; align-items: center; gap: 6px; font-weight: 600;">
          <i class="ph ph-file-xls" style="font-size: 1.2rem;"></i> Exportar Excel
        </button>
      </div>
    </div>

    <!-- Mensaje cuando no hay usuario seleccionado -->
    <div v-if="!selectedUser" class="card" style="margin-top: 16px; text-align: center; padding: 40px; background-color: var(--bg-subtle);">
      <i class="ph ph-user-focus" style="font-size: 2.5rem; color: var(--primary);"></i>
      <h3 style="margin-top: 12px; font-size: 1.1rem; color: var(--text-heading);">Selecciona un usuario en el filtro superior</h3>
      <p style="color: var(--text-muted); font-size: 0.875rem;">Para mantener el mapa organizado, debes seleccionar un usuario para desplegar su ruta completa de jornada y puntos de actividad.</p>
    </div>

    <!-- Información de Sede Asignada y Ubicación Real en Tiempo Real -->
    <div class="card" v-if="selectedUserObj" style="margin-top: 16px; padding: 16px 20px; background: var(--bg-surface); border: 1px solid var(--border-medium); border-radius: var(--radius-lg);">
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 44px; height: 44px; border-radius: 50%; background: var(--primary-light); color: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 1.4rem;">
            <i class="ph ph-user-circle"></i>
          </div>
          <div>
            <h3 style="margin: 0; font-size: 1.05rem; font-weight: 700; color: var(--text-heading);">
              {{ selectedUserObj.supervisor ? `${selectedUserObj.supervisor.nombres} ${selectedUserObj.supervisor.ape_pat} ${selectedUserObj.supervisor.ape_mat || ''}` : selectedUserObj.username }}
            </h3>
            <p style="margin: 2px 0 0 0; font-size: 0.85rem; color: var(--text-muted); font-family: var(--font-mono);">
              @{{ selectedUserObj.username }} &bull; DNI / Doc: {{ selectedUserObj.supervisor?.doc || '-' }} &bull; Sede: {{ selectedUserObj.supervisor?.location?.nombre || 'General' }}
            </p>
          </div>
        </div>

        <!-- Ubicación en Tiempo Real del Usuario (Departamento, Provincia, Distrito) -->
        <div style="display: flex; gap: 20px; flex-wrap: wrap; background: var(--bg-subtle); padding: 10px 16px; border-radius: var(--radius); border: 1px solid var(--border-subtle);">
          <div>
            <p style="margin: 0; font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">SEDE REGIONAL:</p>
            <strong style="font-size: 0.9rem; color: var(--text-heading);">{{ realTimeLocation.department || selectedUserObj.supervisor?.location?.sede_reg || 'LIMA' }}</strong>
          </div>
          <div style="border-left: 1px solid var(--border-subtle); padding-left: 16px;">
            <p style="margin: 0; font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">SEDE JURIS:</p>
            <strong style="font-size: 0.9rem; color: var(--text-heading);">{{ realTimeLocation.province || selectedUserObj.supervisor?.location?.sede_juris || 'LIMA' }}</strong>
          </div>
          <div style="border-left: 1px solid var(--border-subtle); padding-left: 16px;">
            <p style="margin: 0; font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">DISTRITO:</p>
            <strong style="font-size: 0.9rem; color: var(--primary);">{{ realTimeLocation.district || 'CARGANDO...' }}</strong>
          </div>
        </div>
      </div>
    </div>

    <!-- Compact Badges -->
    <div class="badges-row" v-if="selectedUserObj">
      <div :class="['chip-badge', selectedUserActive ? 'chip-success' : 'chip-danger']" style="display: inline-flex; align-items: center; gap: 8px;">
        <span :class="['semaforo-dot', selectedUserActive ? 'semaforo-online' : 'semaforo-offline']"></span>
        <span><strong>Estado App:</strong> {{ selectedUserActive ? 'SESIÓN ACTIVA (EN LÍNEA)' : 'SIN SESIÓN (DESCONECTADO)' }}</span>
      </div>
      <div class="chip-badge chip-primary">
        <i class="ph ph-navigation-arrow"></i>
        <span><strong>Puntos Capturados:</strong> {{ trackings.length }}</span>
      </div>
      <div class="chip-badge chip-info">
        <i class="ph ph-clock"></i>
        <span><strong>Primer Registro:</strong> {{ firstTime }}</span>
      </div>
      <div class="chip-badge chip-success">
        <i class="ph ph-clock-afternoon"></i>
        <span><strong>Último Registro:</strong> {{ lastTime }}</span>
      </div>
    </div>

    <!-- TIMELINE / HISTORIAL SLIDER -->
    <div class="card" v-if="selectedUser && trackings.length > 0" style="margin-top: 16px; padding: 16px 20px; background: var(--bg-surface); border: 1px solid var(--border-medium); border-radius: var(--radius-lg);">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 12px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <i class="ph ph-clock-counter-clockwise" style="font-size: 1.3rem; color: var(--primary);"></i>
          <h4 style="margin: 0; font-size: 0.95rem; font-weight: 700; color: var(--text-heading);">
            Línea de Tiempo / Historial de Recorrido
          </h4>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="font-size: 0.85rem; font-weight: 700; color: var(--primary); font-family: var(--font-mono);">
            Punto {{ timelineIndex }} de {{ trackings.length }}
          </span>
          <span style="font-size: 0.8rem; color: var(--text-muted); background: var(--bg-subtle); padding: 4px 8px; border-radius: 4px; font-family: var(--font-mono);">
            Hora: {{ currentTimelineTime }}
          </span>
        </div>
      </div>

      <!-- Input Range Slider -->
      <input
        type="range"
        :min="1"
        :max="trackings.length"
        v-model.number="timelineIndex"
        @input="onTimelineSliderChange"
        style="width: 100%; height: 8px; cursor: pointer; accent-color: var(--primary);"
      />
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
import * as XLSX from 'xlsx'
import api from '../services/api'

const users = ref([])
const activities = ref([])
const attendances = ref([])
const trackings = ref([])
const selectedUser = ref('')
const userSearchQuery = ref('')
function getTodayLocalDate() {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const selectedDate = ref(getTodayLocalDate())
const activeAttendanceModal = ref(null)
const hasFittedUserBounds = ref(false)
let pollInterval = null

let map = null
let trackingsLayerGroup = null

const filteredUsers = computed(() => {
  if (!userSearchQuery.value.trim()) return users.value
  const q = userSearchQuery.value.toLowerCase().trim()
  return users.value.filter(u => {
    const uname = (u.username || '').toLowerCase()
    const mail = (u.correo || '').toLowerCase()
    const superName = u.supervisor ? `${u.supervisor.nombres} ${u.supervisor.ape_pat} ${u.supervisor.ape_mat}`.toLowerCase() : ''
    const doc = u.supervisor?.doc ? String(u.supervisor.doc).toLowerCase() : ''
    return uname.includes(q) || mail.includes(q) || superName.includes(q) || doc.includes(q)
  })
})

const activeUsers = computed(() => {
  return filteredUsers.value.filter(u => isUserActive(u))
})

const inactiveUsers = computed(() => {
  return filteredUsers.value.filter(u => !isUserActive(u))
})

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
  return diffMs < 15 * 60 * 1000
}

function exportUsersToExcel() {
  // Ordenar: primero los usuarios con sesión activa, luego inactivos
  const sortedUsers = [...users.value].sort((a, b) => {
    const actA = isUserActive(a) ? 0 : 1
    const actB = isUserActive(b) ? 0 : 1
    return actA - actB
  })

  const exportData = sortedUsers.map(u => {
    const active = isUserActive(u)
    return {
      'Estado Sesión App': active ? 'ACTIVO (SESION ACTIVA)' : 'INACTIVO (SIN SESION)',
      'Usuario': u.username || '',
      'Correo Electrónico': u.correo || '',
      'Nombres': u.supervisor?.nombres || '-',
      'Apellido Paterno': u.supervisor?.ape_pat || '-',
      'Apellido Materno': u.supervisor?.ape_mat || '-',
      'DNI / Documento': u.supervisor?.doc || '-',
      'Rol': u.rol || 'usuario',
      'Estado Sistema': u.estado || 'activo',
      'Nombre de Sede': u.supervisor?.location?.nombre || '-',
      'Sede Regional (Departamento)': u.supervisor?.location?.sede_reg || '-',
      'Sede Jurisdicción (Provincia)': u.supervisor?.location?.sede_juris || '-',
      'Última Sesión': (u.deviceDetail?.last_seen_at || u.last_seen_at)
        ? new Date(u.deviceDetail?.last_seen_at || u.last_seen_at).toLocaleString()
        : 'Sin registro'
    }
  })

  const worksheet = XLSX.utils.json_to_sheet(exportData)

  worksheet['!cols'] = [
    { wch: 25 }, // Estado Sesión App
    { wch: 18 }, // Usuario
    { wch: 25 }, // Correo
    { wch: 20 }, // Nombres
    { wch: 20 }, // Apellido Paterno
    { wch: 20 }, // Apellido Materno
    { wch: 16 }, // DNI
    { wch: 12 }, // Rol
    { wch: 15 }, // Estado Sistema
    { wch: 25 }, // Nombre Sede
    { wch: 28 }, // Sede Reg
    { wch: 28 }, // Sede Juris
    { wch: 22 }  // Última Sesión
  ]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Usuarios Activos e Inactivos')

  const dateStr = new Date().toISOString().split('T')[0]
  XLSX.writeFile(workbook, `reporte_usuarios_activos_inactivos_${dateStr}.xlsx`)
}

function onUserChange() {
  hasFittedUserBounds.value = false
  fetchTrackings()
}

async function fetchUsers() {
  try {
    const { data } = await api.get('/users/all')
    const allUsers = data.data || []
    // NUNCA permitir usuarios con rol ADMINISTRADOR en el Mapa en Vivo
    users.value = allUsers.filter(u => u.rol === 'usuario')
  } catch (err) {
    console.error('Error fetching users:', err)
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
    const params = {}
    if (selectedDate.value) params.fecha = selectedDate.value
    if (selectedUser.value) params.id_user = selectedUser.value
    const { data } = await api.get('/attendances', { params })
    attendances.value = data.data || []
  } catch (err) {
    console.error('Error attendances:', err)
  }
}

const realTimeLocation = ref({
  department: '',
  province: '',
  district: ''
})

const geocodeCache = new Map()

const timelineIndex = ref(1)
const isPlayingTimeline = ref(false)
let timelineTimer = null

const currentTimelineTime = computed(() => {
  if (trackings.value.length === 0) return '-'
  const idx = Math.min(Math.max(1, timelineIndex.value), trackings.value.length) - 1
  const pt = trackings.value[idx]
  return pt && pt.recorded_at ? new Date(pt.recorded_at).toLocaleTimeString() : '-'
})

function onTimelineSliderChange() {
  drawMap()
}

function toggleTimelinePlayback() {
  if (isPlayingTimeline.value) {
    pauseTimeline()
  } else {
    playTimeline()
  }
}

function playTimeline() {
  if (trackings.value.length <= 1) return
  if (timelineIndex.value >= trackings.value.length) {
    timelineIndex.value = 1
  }
  isPlayingTimeline.value = true
  timelineTimer = setInterval(() => {
    if (timelineIndex.value < trackings.value.length) {
      timelineIndex.value++
      drawMap()
    } else {
      pauseTimeline()
    }
  }, 400)
}

function pauseTimeline() {
  isPlayingTimeline.value = false
  if (timelineTimer) {
    clearInterval(timelineTimer)
    timelineTimer = null
  }
}

async function updateRealTimeLocation(lat, lng) {
  if (!lat || !lng) return
  const cacheKey = `${Number(lat).toFixed(3)},${Number(lng).toFixed(3)}`
  if (geocodeCache.has(cacheKey)) {
    realTimeLocation.value = geocodeCache.get(cacheKey)
    return
  }

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
      headers: { 'Accept-Language': 'es' }
    })
    const data = await res.json()
    const addr = data.address || {}

    const department = (addr.state || addr.region || addr.province || selectedUserObj.value?.supervisor?.location?.sede_reg || 'LIMA').toUpperCase()
    const province = (addr.province || addr.county || addr.city || addr.city_district || selectedUserObj.value?.supervisor?.location?.sede_juris || 'LIMA').toUpperCase()
    const district = (addr.suburb || addr.district || addr.city_district || addr.town || addr.village || addr.neighbourhood || 'LIMA').toUpperCase()

    const locData = { department, province, district }
    geocodeCache.set(cacheKey, locData)
    realTimeLocation.value = locData
  } catch (err) {
    console.warn('[ReverseGeocode Warning]', err)
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

    const rawPoints = trackRes.data?.data || []
    // Filtrar estrictamente por fecha local seleccionada (YYYY-MM-DD)
    trackings.value = rawPoints.filter(t => {
      if (!t.recorded_at) return false
      const recDate = new Date(t.recorded_at)
      const y = recDate.getFullYear()
      const m = String(recDate.getMonth() + 1).padStart(2, '0')
      const d = String(recDate.getDate()).padStart(2, '0')
      const localDateStr = `${y}-${m}-${d}`
      return localDateStr === selectedDate.value
    })

    pauseTimeline()
    timelineIndex.value = trackings.value.length > 0 ? trackings.value.length : 1

    const lastPt = trackings.value[trackings.value.length - 1]
    if (lastPt) {
      updateRealTimeLocation(lastPt.lat, lastPt.lng)
    } else if (selectedUserObj.value?.supervisor?.location) {
      realTimeLocation.value = {
        department: (selectedUserObj.value.supervisor.location.sede_reg || 'LIMA').toUpperCase(),
        province: (selectedUserObj.value.supervisor.location.sede_juris || 'LIMA').toUpperCase(),
        district: (selectedUserObj.value.supervisor.location.nombre || 'LIMA').toUpperCase()
      }
    }

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

  // Filtrar coordenadas de prueba o imprecisas (-12.046374, -77.042793)
  const realTrackings = trackings.value.filter(t => {
    const lat = Number(t.lat)
    const lng = Number(t.lng)
    if (!lat || !lng || (lat === 0 && lng === 0)) return false
    if (Math.abs(lat - (-12.046374)) < 0.0001 && Math.abs(lng - (-77.042793)) < 0.0001 && trackings.value.length > 1) {
      return false
    }
    return true
  })

  // Recortar puntos según la posición del slider de la Línea de Tiempo (History Timeline)
  const maxIdx = Math.min(Math.max(1, timelineIndex.value), realTrackings.length)
  const slicedTrackings = realTrackings.slice(0, maxIdx)
  const validTrackings = slicedTrackings.length > 1 ? slicedTrackings.slice(1) : slicedTrackings
  const coords = validTrackings.map(t => [Number(t.lat), Number(t.lng)])
  allCoords.push(...coords)

  if (coords.length > 0) {
    // Dibujar línea básica inicial por resguardo
    const mainPolyline = L.polyline(coords, {
      color: '#024ad8',
      weight: 4,
      opacity: 0.85,
      smoothFactor: 1.5,
    }).addTo(trackingsLayerGroup);

    // Intentar alinear el trayecto sobre aceras y calles usando OSRM Map-Matching si hay más de 1 punto
    if (coords.length >= 2) {
      const step = Math.max(1, Math.ceil(validTrackings.length / 30));
      const sampleTrackings = validTrackings.filter((_, idx) => idx % step === 0);
      const coordString = sampleTrackings.map(t => `${t.lng},${t.lat}`).join(';');
      api.get(`/routes/osrm-match?coordinates=${coordString}`)
        .then(({ data }) => {
          if (data && data.matchings && data.matchings.length > 0) {
            const matchedCoords = data.matchings.flatMap(m =>
              m.geometry.coordinates.map(c => [c[1], c[0]])
            );
            if (matchedCoords.length > 0) {
              mainPolyline.setLatLngs(matchedCoords);
            }
          }
        })
        .catch(err => console.warn('[OSRM Map-Matching Warning]', err.message));
    }

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

    // Punto de Ubicación Actual / Fin de jornada (Pin Animado Azul con pulso en vivo)
    const livePulseIcon = L.divIcon({
      className: 'live-pulse-wrapper',
      html: '<div class="pulse-beacon-ring"></div><div class="pulse-beacon-dot"></div>',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    })

    L.marker(lastCoord, { icon: livePulseIcon })
      .addTo(trackingsLayerGroup)
      .bindPopup(`<b>${uName}</b><br>Ubicación actual en vivo<br>Hora: ${new Date(lastPoint.recorded_at).toLocaleTimeString()}`)
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

.semaforo-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}

.semaforo-online {
  background-color: #22c55e;
  box-shadow: 0 0 8px rgba(34, 197, 94, 0.8);
  animation: semaforo-pulse 2s infinite;
}

.semaforo-offline {
  background-color: #ef4444;
  box-shadow: 0 0 4px rgba(239, 68, 68, 0.4);
}

@keyframes semaforo-pulse {
  0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); }
  70% { transform: scale(1.1); box-shadow: 0 0 0 6px rgba(34, 197, 94, 0); }
  100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
}

:deep(.live-pulse-wrapper) {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}
:deep(.pulse-beacon-dot) {
  width: 14px;
  height: 14px;
  background-color: #024ad8;
  border: 2px solid #ffffff;
  border-radius: 50%;
  box-shadow: 0 0 8px rgba(2, 74, 216, 0.8);
  z-index: 2;
}
:deep(.pulse-beacon-ring) {
  position: absolute;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background-color: rgba(2, 74, 216, 0.45);
  animation: beacon-pulse 1.8s ease-out infinite;
  z-index: 1;
}
@keyframes beacon-pulse {
  0% {
    transform: scale(0.4);
    opacity: 0.9;
  }
  100% {
    transform: scale(1.8);
    opacity: 0;
  }
}
</style>
