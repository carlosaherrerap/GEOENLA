<template>
  <div class="fade-in">
    <div class="page-header">
      <div>
        <h1 class="page-title">{{ user?.username || 'Detalle de Trabajador' }}</h1>
        <p class="page-subtitle">Información del trabajador, recorrido en vivo y actividades asignadas</p>
      </div>
      <router-link to="/users" class="btn btn-ghost">← Volver a Usuarios</router-link>
    </div>

    <div v-if="loading" class="loading">Cargando datos del trabajador...</div>

    <template v-else-if="user">
      <!-- Datos Personales y Dispositivo -->
      <div class="card-grid" style="margin-bottom: 24px;">
        <div class="card stat-card">
          <div class="stat-value" style="font-size: 1.2rem; font-weight: 600;">{{ user.username }}</div>
          <div class="stat-label">Nombre de Usuario</div>
          <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px;">{{ user.correo }}</div>
        </div>

        <div class="card stat-card">
          <div style="display: flex; gap: 8px; justify-content: center; align-items: center;">
            <span :class="['badge', user.rol === 'admin' ? 'badge-info' : 'badge-primary']" style="text-transform: uppercase;">
              {{ user.rol }}
            </span>
            <span :class="['badge', user.estado === 'activo' ? 'badge-success' : 'badge-danger']" style="text-transform: uppercase;">
              {{ user.estado }}
            </span>
          </div>
          <div class="stat-label" style="margin-top: 8px;">Rol y Estado</div>
        </div>

        <div class="card stat-card" v-if="user.deviceDetail || user.device_detail">
          <div class="stat-value" style="font-size: 1.1rem; color: #024ad8;">
            <i class="ph ph-device-mobile"></i>
            {{ (user.deviceDetail || user.device_detail).manufacturer }} {{ (user.deviceDetail || user.device_detail).model }}
          </div>
          <div class="stat-label">
            SO: {{ (user.deviceDetail || user.device_detail).os }} {{ (user.deviceDetail || user.device_detail).os_version }} ·
            <i class="ph ph-battery-charging" style="color: #22c55e;"></i> {{ (user.deviceDetail || user.device_detail).battery_level }}%
          </div>
        </div>
      </div>

      <!-- Ubicación Actual en Tiempo Real del Usuario (Departamento, Provincia, Distrito) -->
      <div class="card" style="margin-bottom: 24px; padding: 16px 20px; background: var(--bg-surface); border: 1px solid var(--border-medium); border-radius: var(--radius-lg);">
        <h3 style="margin: 0 0 12px 0; font-size: 1rem; font-weight: 700; color: var(--text-heading); display: flex; align-items: center; gap: 8px;">
          <i class="ph ph-map-pin-line" style="color: var(--primary);"></i> Ubicación Actual en Tiempo Real
        </h3>
        <div style="display: flex; gap: 20px; flex-wrap: wrap; background: var(--bg-subtle); padding: 12px 18px; border-radius: var(--radius); border: 1px solid var(--border-subtle);">
          <div>
            <p style="margin: 0; font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">SEDE REGIONAL:</p>
            <strong style="font-size: 0.95rem; color: var(--text-heading);">{{ realTimeLocation.department || user.supervisor?.location?.sede_reg || 'LIMA' }}</strong>
          </div>
          <div style="border-left: 1px solid var(--border-subtle); padding-left: 20px;">
            <p style="margin: 0; font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">SEDE JURIS:</p>
            <strong style="font-size: 0.95rem; color: var(--text-heading);">{{ realTimeLocation.province || user.supervisor?.location?.sede_juris || 'LIMA' }}</strong>
          </div>
          <div style="border-left: 1px solid var(--border-subtle); padding-left: 20px;">
            <p style="margin: 0; font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">DISTRITO:</p>
            <strong style="font-size: 0.95rem; color: var(--primary);">{{ realTimeLocation.district || 'CARGANDO...' }}</strong>
          </div>
        </div>
      </div>

      <!-- Recorrido en el Mapa -->
      <div class="card" style="margin-bottom: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h3 style="display: flex; align-items: center; gap: 8px; font-size: 1.1rem; font-weight: 600; margin: 0;">
            <i class="ph ph-map-pin" style="color: #024ad8;"></i> Mapa del Recorrido
          </h3>
          <div style="display: flex; align-items: center; gap: 12px;">
            <label class="form-label" style="margin: 0;">Fecha:</label>
            <input v-model="trackingDate" type="date" class="form-input" style="width: auto;" @change="fetchTrackings" />
          </div>
        </div>

        <div id="user-map" class="map-container" style="height: 480px; border-radius: 8px;"></div>
      </div>

      <!-- Historial Ordenado del Recorrido y Actividades -->
      <div class="card" style="margin-bottom: 24px;">
        <h3 style="margin-bottom: 16px; display: flex; align-items: center; gap: 8px; font-size: 1.1rem; font-weight: 600;">
          <i class="ph ph-list-numbers" style="color: #024ad8;"></i> Puntos de Recorrido y Registro GPS
        </h3>

        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Hora</th>
                <th>Coordenadas (Lat, Lng)</th>
                <th>Precisión</th>
                <th>Velocidad</th>
                <th>Batería</th>
                <th>Actividad de Destino</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(pt, idx) in trackings" :key="pt.id || idx">
                <td style="font-weight: 600; color: #024ad8;">
                  {{ new Date(pt.recorded_at).toLocaleTimeString() }}
                </td>
                <td>{{ pt.lat }}, {{ pt.lng }}</td>
                <td>{{ pt.accuracy || 5 }}m</td>
                <td>{{ pt.speed || 0 }} km/h</td>
                <td>
                  <span style="color: #22c55e; font-weight: 600;">
                    <i class="ph ph-battery-charging"></i> {{ pt.battery_level || 90 }}%
                  </span>
                </td>
                <td>
                  <span v-if="pt.id_activity" class="badge badge-info">
                    {{ getActivityName(pt.id_activity) }}
                  </span>
                  <span v-else style="color: var(--text-muted); font-size: 0.85rem;">
                    En recorrido libre / Tránsito
                  </span>
                </td>
              </tr>
              <tr v-if="trackings.length === 0">
                <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 32px;">
                  No hay datos de recorrido registrados en la fecha seleccionada.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Asistencias Marcadas -->
      <div class="card">
        <h3 style="margin-bottom: 16px; display: flex; align-items: center; gap: 8px; font-size: 1.1rem; font-weight: 600;">
          <i class="ph ph-check-circle" style="color: #22c55e;"></i> Asistencias y Evidencias Registradas
        </h3>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Hora de Llegada</th>
                <th>Actividad</th>
                <th>Sede Asignada</th>
                <th>Distancia a Sede</th>
                <th>Evidencia Fotográfica</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="att in attendances" :key="att.id">
                <td style="font-weight: 600;">{{ new Date(att.checked_in_at).toLocaleString() }}</td>
                <td>{{ att.activity?.actividad || 'Actividad General' }}</td>
                <td>{{ att.location?.nombre || 'Sede' }}</td>
                <td><span class="badge badge-success">{{ att.distance_m || 0 }}m</span></td>
                <td>
                  <span v-if="att.photos && att.photos.length > 0" class="badge badge-primary">
                    <i class="ph ph-camera"></i> {{ att.photos.length }} foto(s)
                  </span>
                  <span v-else style="color: var(--text-muted);">Sin foto</span>
                </td>
              </tr>
              <tr v-if="attendances.length === 0">
                <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 32px;">
                  Sin asistencias marcadas aún.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import api from '../services/api'

const props = defineProps({ id: String })

const user = ref(null)
const attendances = ref([])
const trackings = ref([])
const activities = ref([])
const loading = ref(true)

function getTodayLocalDate() {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const trackingDate = ref(getTodayLocalDate())

const realTimeLocation = ref({
  department: '',
  province: '',
  district: ''
})

function getActivityName(activityId) {
  const found = activities.value.find(a => a.id === activityId)
  return found ? found.actividad : `Actividad #${activityId}`
}

async function fetchUser() {
  loading.value = true
  try {
    const { data } = await api.get(`/users/${props.id}`)
    user.value = data
  } catch (err) {
    console.error('Error fetching user:', err)
  } finally {
    loading.value = false
  }
}

async function fetchActivities() {
  try {
    const { data } = await api.get('/activities')
    activities.value = data.data || []
  } catch (err) {
    console.error('Error fetching activities:', err)
  }
}

async function fetchAttendances() {
  try {
    const { data } = await api.get('/attendances', { params: { id_user: props.id } })
    attendances.value = data.data || []
  } catch (err) {
    console.error('Error fetching attendances:', err)
  }
}

onMounted(() => {
  fetchUser()
  fetchActivities()
  fetchAttendances()
  fetchTrackings()
})

const geocodeCache = new Map()

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

    const department = (addr.state || addr.region || addr.province || user.value?.supervisor?.location?.sede_reg || 'LIMA').toUpperCase()
    const province = (addr.province || addr.county || addr.city || addr.city_district || user.value?.supervisor?.location?.sede_juris || 'LIMA').toUpperCase()
    const district = (addr.suburb || addr.district || addr.city_district || addr.town || addr.village || addr.neighbourhood || 'LIMA').toUpperCase()

    const locData = { department, province, district }
    geocodeCache.set(cacheKey, locData)
    realTimeLocation.value = locData
  } catch (err) {
    console.warn('[ReverseGeocode Warning]', err)
  }
}

async function fetchTrackings() {
  try {
    const { data } = await api.get('/trackings', {
      params: { id_user: props.id, fecha: trackingDate.value }
    })
    trackings.value = data.data || []

    const lastPt = trackings.value[trackings.value.length - 1]
    if (lastPt) {
      updateRealTimeLocation(lastPt.lat, lastPt.lng)
    } else if (user.value?.supervisor?.location) {
      realTimeLocation.value = {
        department: (user.value.supervisor.location.sede_reg || 'LIMA').toUpperCase(),
        province: (user.value.supervisor.location.sede_juris || 'LIMA').toUpperCase(),
        district: (user.value.supervisor.location.nombre || 'LIMA').toUpperCase()
      }
    }

    await nextTick()
    drawMap()
  } catch (err) {
    console.error('Error fetching trackings:', err)
  }
}

let userMapInstance = null
let userTrackingsLayerGroup = null
const isUserMapInitialLoad = ref(true)

async function drawMap() {
  const L = await import('leaflet')
  await import('leaflet/dist/leaflet.css')

  const container = document.getElementById('user-map')
  if (!container) return

  if (!userMapInstance) {
    userMapInstance = L.map('user-map').setView([-12.046, -77.042], 13)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; CARTO',
      maxZoom: 19,
    }).addTo(userMapInstance)

    userTrackingsLayerGroup = L.layerGroup().addTo(userMapInstance)
  }

  userTrackingsLayerGroup.clearLayers()

  if (trackings.value.length > 0) {
    const coords = trackings.value.map(t => [t.lat, t.lng])

    const polyline = L.polyline(coords, {
      color: '#024ad8',
      weight: 4,
      opacity: 0.85,
      smoothFactor: 1.5,
    }).addTo(userTrackingsLayerGroup)

    // Punto Inicial (Verde)
    L.circleMarker(coords[0], {
      radius: 8, color: '#22c55e', fillColor: '#22c55e', fillOpacity: 1,
    }).addTo(userTrackingsLayerGroup).bindPopup(`<b>Inicio del trayecto</b><br>Hora: ${new Date(trackings.value[0].recorded_at).toLocaleTimeString()}`)

    // Punto Actual / Último (Rojo)
    const lastPoint = trackings.value[trackings.value.length - 1]
    L.circleMarker(coords[coords.length - 1], {
      radius: 10, color: '#ef4444', fillColor: '#ef4444', fillOpacity: 1, className: 'pulse-marker'
    }).addTo(userTrackingsLayerGroup).bindPopup(`<b>Última ubicación conocida</b><br>Hora: ${new Date(lastPoint.recorded_at).toLocaleTimeString()}`)

    if (isUserMapInitialLoad.value) {
      userMapInstance.fitBounds(polyline.getBounds(), { padding: [40, 40] })
      isUserMapInitialLoad.value = false
    }
  }
}

onMounted(async () => {
  await Promise.all([fetchUser(), fetchActivities(), fetchAttendances()])
  await fetchTrackings()
})
</script>

<style scoped>
:deep(.pulse-marker) {
  animation: pulse-ring 1.5s infinite;
}

@keyframes pulse-ring {
  0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.5); }
  70% { box-shadow: 0 0 0 15px rgba(239, 68, 68, 0); }
  100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
}
</style>
