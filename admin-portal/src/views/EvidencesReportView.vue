<template>
  <div class="fade-in">
    <div class="page-header">
      <div>
        <h1 class="page-title">Descarga de Evidencias y Reportes</h1>
        <p class="page-subtitle">Exporta todas las fotografías de actividades organizadas por carpetas y genera el reporte Excel detallado</p>
      </div>
      <button
        class="btn btn-primary"
        :disabled="downloading"
        @click="downloadZipReport"
      >
        <span v-if="downloading" class="spinner-sm" style="margin-right: 8px;"></span>
        <i v-else class="ph ph-download-simple" style="margin-right: 6px;"></i>
        {{ downloading ? 'Generando y Descargando ZIP...' : 'Descargar Evidencias (ZIP + Excel)' }}
      </button>
    </div>

    <!-- MODAL OVERLAY DE CARGA ANIMADA -->
    <div v-if="downloading" class="modal-overlay">
      <div class="modal-card" style="max-width: 480px; text-align: center; padding: 28px 24px;">
        <div style="display: flex; justify-content: center; margin-bottom: 18px;">
          <div class="loading-spinner-circle"></div>
        </div>
        <h3 style="font-size: 1.15rem; font-weight: 700; color: var(--text-heading); margin-bottom: 8px;">
          Generando Archivo ZIP y Reporte Excel
        </h3>
        <p style="font-size: 0.85rem; color: var(--text-body); line-height: 1.5; margin-bottom: 20px;">
          El servidor está descargando las imágenes de evidencias, organizando la estructura de carpetas por actividad y supervisor, y consolidando el resumen en la hoja de cálculo.
        </p>

        <!-- BARRA DE PROGRESO ANIMADA -->
        <div class="progress-bar-container">
          <div class="progress-bar-indeterminate"></div>
        </div>

        <div style="margin-top: 14px; display: flex; justify-content: space-between; font-size: 0.78rem; color: var(--text-muted); font-family: var(--font-mono);">
          <span>Estado: Procesando paquetes</span>
          <span>Por favor no cierres la ventana</span>
        </div>
      </div>
    </div>

    <!-- EXPLANATION CARD -->
    <div class="card" style="margin-bottom: 20px;">
      <h3 style="font-size: 1rem; margin-bottom: 8px; color: var(--text-heading);">Estructura del Paquete ZIP:</h3>
      <div style="font-family: var(--font-mono); font-size: 0.85rem; background: var(--bg-subtle); padding: 14px; border-radius: var(--radius); border: 1px solid var(--border-subtle); color: var(--text-body); line-height: 1.6;">
        <div>📁 (nombre_de_actividad)_(fecha:DD-MM-YY)/</div>
        <div style="padding-left: 24px;">└── 📁 supervisor/</div>
        <div style="padding-left: 48px;">└── 📷 foto_1.jpg, foto_2.jpg...</div>
        <div style="margin-top: 6px;">📊 Resumen_Evidencias_Actividades.xlsx (Especificando actividades, fecha, todos los supervisores asignados y conteo de fotos)</div>
      </div>
    </div>

    <!-- FILTERS -->
    <div class="card" style="margin-bottom: 20px;">
      <h3 style="font-size: 0.95rem; margin-bottom: 14px; color: var(--text-heading);">Filtros de Exportación:</h3>
      <div class="grid-4">
        <div class="form-group" style="margin: 0;">
          <label class="form-label">Fecha Desde</label>
          <input v-model="filterFecInicio" type="date" class="form-input" />
        </div>

        <div class="form-group" style="margin: 0;">
          <label class="form-label">Fecha Hasta</label>
          <input v-model="filterFecFin" type="date" class="form-input" />
        </div>

        <div class="form-group" style="margin: 0;">
          <label class="form-label">Período</label>
          <select v-model="filterPeriod" class="form-select">
            <option value="">Todos los Períodos</option>
            <option v-for="p in periodsList" :key="p.id" :value="p.id">
              {{ p.nombre }}
            </option>
          </select>
        </div>

        <div class="form-group" style="margin: 0;">
          <label class="form-label">Supervisor / Trabajador</label>
          <select v-model="filterUser" class="form-select">
            <option value="">Todos los Usuarios</option>
            <option v-for="u in usersList" :key="u.id" :value="u.id">
              {{ getUserDisplayName(u) }}
            </option>
          </select>
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px;">
        <button class="btn btn-ghost btn-sm" @click="resetFilters">Limpiar Filtros</button>
        <button class="btn btn-secondary btn-sm" @click="fetchPreviewActivities">Consultar Registros</button>
      </div>
    </div>

    <!-- DOWNLOAD STATUS ALERT -->
    <div v-if="downloadProgressMsg" class="card" style="margin-bottom: 20px; border-left: 4px solid var(--primary); background: var(--bg-subtle);">
      <div style="display: flex; align-items: center; gap: 10px;">
        <div style="font-weight: 600; color: var(--text-heading);">
          {{ downloadProgressMsg }}
        </div>
      </div>
    </div>

    <!-- PREVIEW TABLE -->
    <div class="table-container">
      <div style="padding: 14px 18px; border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center;">
        <strong style="font-size: 0.95rem; color: var(--text-heading);">Vista Previa de Actividades a Exportar</strong>
        <span class="badge badge-primary">{{ previewActivities.length }} actividades seleccionadas</span>
      </div>

      <div v-if="loading" class="skeleton-loader" style="padding: 20px;">
        <div class="skeleton-line" style="width: 100%; height: 32px;"></div>
        <div class="skeleton-line" style="width: 100%; height: 32px;"></div>
        <div class="skeleton-line" style="width: 100%; height: 32px;"></div>
      </div>

      <table v-else>
        <thead>
          <tr>
            <th>Actividad</th>
            <th>Sede</th>
            <th>Fecha</th>
            <th>Supervisor Asignado</th>
            <th>Estado</th>
            <th>Evidencias Fotográficas</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="act in previewActivities" :key="act.id">
            <td style="font-weight: 600; color: var(--text-heading);">{{ act.actividad }}</td>
            <td>{{ act.location?.nombre || '-' }} ({{ act.location?.sede_reg || 'Lima' }})</td>
            <td style="font-family: var(--font-mono); font-size: 0.85rem;">{{ formatDate(act.period?.fec_inicio || act.created_at) }}</td>
            <td>
              <div v-if="act.activityUsers && act.activityUsers.length > 0" style="display: flex; flex-direction: column; gap: 4px;">
                <span style="font-weight: 600; color: var(--text-heading); font-size: 0.85rem;">
                  {{ getUserDisplayName(act.activityUsers[0].user) }}
                </span>
                <span v-if="act.activityUsers.length > 1" class="badge badge-primary" style="align-self: flex-start; font-size: 0.75rem;">
                  +{{ act.activityUsers.length - 1 }} más ({{ act.activityUsers.length }} asignados)
                </span>
              </div>
              <span v-else-if="act.user" style="font-weight: 600; font-size: 0.85rem;">
                {{ getUserDisplayName(act.user) }}
              </span>
              <span v-else style="color: var(--text-muted); font-size: 0.8rem;">Sin asignar</span>
            </td>
            <td>
              <span class="badge" :class="act.estado === 'completado' ? 'badge-success' : 'badge-warning'">
                {{ act.estado }}
              </span>
            </td>
            <td>
              <span class="badge badge-info">
                {{ getPhotoCount(act) }} fotos
              </span>
            </td>
          </tr>
          <tr v-if="previewActivities.length === 0">
            <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 36px;">
              No se encontraron actividades con los filtros actuales.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '../services/api'

const periodsList = ref([])
const usersList = ref([])
const previewActivities = ref([])
const loading = ref(false)
const downloading = ref(false)
const downloadProgressMsg = ref('')

const filterFecInicio = ref('')
const filterFecFin = ref('')
const filterPeriod = ref('')
const filterUser = ref('')

function getUserDisplayName(u) {
  if (!u) return '-'
  if (u.supervisor && (u.supervisor.nombres || u.supervisor.ape_pat)) {
    return `${u.supervisor.nombres || ''} ${u.supervisor.ape_pat || ''}`.trim()
  }
  return u.username ? `@${u.username}` : '-'
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

function getPhotoCount(act) {
  let count = 0
  if (act.attendances && Array.isArray(act.attendances)) {
    act.attendances.forEach(att => {
      if (Array.isArray(att.photos)) count += att.photos.length
      else if (typeof att.photos === 'string' && att.photos) {
        try {
          const parsed = JSON.parse(att.photos)
          if (Array.isArray(parsed)) count += parsed.length
          else count += 1
        } catch {
          count += 1
        }
      }
    })
  }
  return count
}

async function fetchDropdowns() {
  try {
    const [pRes, uRes] = await Promise.all([
      api.get('/periods'),
      api.get('/users/all')
    ])
    periodsList.value = pRes.data.data || []
    usersList.value = (uRes.data.data || []).filter(u => u.rol === 'usuario')
  } catch (err) {
    console.error('Error loading dropdowns:', err)
  }
}

async function fetchPreviewActivities() {
  loading.value = true
  try {
    const params = {}
    if (filterFecInicio.value) params.fec_inicio = filterFecInicio.value
    if (filterFecFin.value) params.fec_fin = filterFecFin.value
    if (filterPeriod.value) params.id_period = filterPeriod.value
    if (filterUser.value) params.id_user = filterUser.value

    const { data } = await api.get('/activities', { params })
    previewActivities.value = data.data || []
  } catch (err) {
    console.error('Error fetching preview activities:', err)
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  filterFecInicio.value = ''
  filterFecFin.value = ''
  filterPeriod.value = ''
  filterUser.value = ''
  fetchPreviewActivities()
}

async function downloadZipReport() {
  downloading.value = true
  downloadProgressMsg.value = 'El servidor está empaquetando las fotos y generando el reporte Excel...'

  try {
    const params = {}
    if (filterFecInicio.value) params.fec_inicio = filterFecInicio.value
    if (filterFecFin.value) params.fec_fin = filterFecFin.value
    if (filterPeriod.value) params.id_period = filterPeriod.value
    if (filterUser.value) params.id_user = filterUser.value

    const response = await api.get('/reports/evidences-zip', {
      params,
      responseType: 'blob',
    })

    const blob = new Blob([response.data], { type: 'application/zip' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `Evidencias_Actividades_${new Date().toISOString().split('T')[0]}.zip`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)

    downloadProgressMsg.value = '¡Descarga completada con éxito!'
    setTimeout(() => {
      downloadProgressMsg.value = ''
    }, 4000)
  } catch (err) {
    console.error('Error descargando ZIP:', err)
    alert('Hubo un error al generar el archivo ZIP de evidencias.')
    downloadProgressMsg.value = ''
  } finally {
    downloading.value = false
  }
}

onMounted(() => {
  fetchDropdowns()
  fetchPreviewActivities()
})
</script>

<style scoped>
.grid-4 {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}

.spinner-sm {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #ffffff;
  border-radius: 50%;
  display: inline-block;
  animation: spin-anim 0.8s linear infinite;
}

.loading-spinner-circle {
  width: 36px;
  height: 36px;
  border: 3px solid var(--border-subtle);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin-anim 0.8s linear infinite;
}

.progress-bar-container {
  width: 100%;
  height: 6px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-subtle);
  border-radius: 3px;
  overflow: hidden;
  position: relative;
}

.progress-bar-indeterminate {
  position: absolute;
  top: 0;
  bottom: 0;
  background: var(--primary);
  border-radius: 3px;
  animation: indeterminate-anim 1.6s ease-in-out infinite;
}

@keyframes spin-anim {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

@keyframes indeterminate-anim {
  0% {
    left: -35%;
    width: 35%;
  }
  50% {
    left: 25%;
    width: 50%;
  }
  100% {
    left: 100%;
    width: 35%;
  }
}

@media (max-width: 900px) {
  .grid-4 {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 600px) {
  .grid-4 {
    grid-template-columns: 1fr;
  }
}
</style>
