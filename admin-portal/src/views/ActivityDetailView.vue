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
          <span class="summary-label">Trabajador Asignado</span>
          <span class="summary-value">
            {{ activity.user?.supervisor ? `${activity.user.supervisor.nombres} ${activity.user.supervisor.ape_pat}` : (activity.user?.username ? `@${activity.user.username}` : 'Sin asignar') }}
          </span>
          <small style="color: var(--text-muted); font-size: 0.75rem;">{{ activity.user?.correo || '-' }}</small>
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
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import api from '../services/api'

const props = defineProps({ id: String })

const activity = ref(null)
const loading = ref(true)

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
</style>
