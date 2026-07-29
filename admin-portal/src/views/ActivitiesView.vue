<template>
  <div class="fade-in">
    <div class="page-header">
      <div>
        <h1 class="page-title">Actividades</h1>
        <p class="page-subtitle">Asigna y gestiona las actividades de campo por sede y período</p>
      </div>
      <button class="btn btn-primary" @click="showCreate = !showCreate">
        <i class="ph ph-plus"></i> Nueva Actividad
      </button>
    </div>

    <!-- CREATE ACTIVITY CARD -->
    <div v-if="showCreate" class="card fade-in" style="margin-bottom: 24px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid var(--border-subtle); padding-bottom: 12px;">
        <h3 style="font-size: 1.1rem; margin: 0;">Crear y Asignar Actividad</h3>
        <button class="btn-close" @click="showCreate = false">&times;</button>
      </div>

      <form @submit.prevent="createActivity">
        <div class="grid-3">
          <!-- Asignar Usuario -->
          <div class="form-group">
            <label class="form-label">Asignar a Usuario</label>
            <select v-model="newActivity.id_user" class="form-select">
              <option value="">-- Sin usuario asignado --</option>
              <option v-for="u in usersList" :key="u.id" :value="u.id">
                {{ u.supervisor ? `${u.supervisor.nombres} ${u.supervisor.ape_pat}` : u.username }} (@{{ u.username }})
              </option>
            </select>
          </div>

          <!-- Seleccionar Sede -->
          <div class="form-group">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <label class="form-label">Sede (Location) *</label>
              <button type="button" class="btn-link" @click="showLocationModal = true">+ Crear Sede</button>
            </div>
            <select v-model="newActivity.id_location" class="form-select" required>
              <option value="">-- Seleccionar Sede --</option>
              <option v-for="loc in locationsList" :key="loc.id" :value="loc.id">
                {{ loc.nombre }}
              </option>
            </select>
          </div>

          <!-- Seleccionar Período -->
          <div class="form-group">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <label class="form-label">Período de Validez *</label>
              <button type="button" class="btn-link" @click="showPeriodModal = true">+ Crear Período</button>
            </div>
            <select v-model="newActivity.id_period" class="form-select" required>
              <option value="">-- Seleccionar Período --</option>
              <option v-for="p in periodsList" :key="p.id" :value="p.id">
                {{ p.nombre }} ({{ formatDate(p.fec_inicio) }} - {{ formatDate(p.fec_fin) }})
              </option>
            </select>
          </div>
        </div>

        <div class="grid-2" style="margin-top: 12px;">
          <!-- Título/Nombre Actividad -->
          <div class="form-group">
            <label class="form-label">Actividad (Título) *</label>
            <input v-model="newActivity.actividad" class="form-input" placeholder="Ej: Ir a almorzar, Compra tu comida..." required />
          </div>

          <!-- Estado -->
          <div class="form-group">
            <label class="form-label">Estado Inicial</label>
            <select v-model="newActivity.estado" class="form-select">
              <option value="pendiente">Pendiente</option>
              <option value="en_progreso">En Progreso</option>
              <option value="completado">Completado</option>
            </select>
          </div>
        </div>

        <!-- Detalle -->
        <div class="form-group">
          <label class="form-label">Detalle / Descripción de la Actividad *</label>
          <textarea v-model="newActivity.detalle" class="form-input" rows="3" placeholder="Instrucciones específicas para el trabajador de campo..." required></textarea>
        </div>

        <div style="display: flex; gap: 12px; margin-top: 16px;">
          <button type="submit" class="btn btn-primary" :disabled="creating">
            {{ creating ? 'Creando Actividad...' : 'Crear y Asignar Actividad' }}
          </button>
          <button type="button" class="btn btn-ghost" @click="showCreate = false">Cancelar</button>
        </div>
      </form>
    </div>

    <!-- FILTERS -->
    <div class="filters-bar">
      <div class="form-group" style="margin: 0; flex: 1;">
        <label class="form-label">Estado de Actividad</label>
        <select v-model="filterEstado" class="form-select" @change="fetchActivities">
          <option value="">Todos los Estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="en_progreso">En Progreso</option>
          <option value="completado">Completado</option>
          <option value="cancelado">Cancelado</option>
        </select>
      </div>
      <div class="form-group" style="margin: 0; flex: 1;">
        <label class="form-label">Filtrar por Fecha</label>
        <input v-model="filterFecha" type="date" class="form-input" @change="fetchActivities" />
      </div>
    </div>

    <!-- SKELETON LOADING STATE -->
    <div v-if="loading" class="card" style="padding: 0; overflow: hidden;">
      <div class="skeleton-loader">
        <div class="skeleton-line" style="width: 100%; height: 36px;"></div>
        <div class="skeleton-line" style="width: 100%; height: 28px;"></div>
        <div class="skeleton-line" style="width: 100%; height: 28px;"></div>
        <div class="skeleton-line" style="width: 100%; height: 28px;"></div>
      </div>
    </div>

    <!-- TABLE -->
    <div v-else class="table-container">
      <table>
        <thead>
          <tr>
            <th>Actividad</th>
            <th>Detalle</th>
            <th>Sede</th>
            <th>Período</th>
            <th>Usuario Asignado</th>
            <th>Estado</th>
            <th style="text-align: right;">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="act in activities" :key="act.id">
            <td style="font-weight: 600; color: var(--text-heading);">{{ act.actividad }}</td>
            <td style="max-width: 250px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; color: var(--text-body);">
              {{ act.detalle }}
            </td>
            <td style="font-weight: 600;">{{ act.location?.nombre || '-' }}</td>
            <td style="font-family: var(--font-mono); font-size: 0.8rem;">{{ act.period?.nombre || '-' }}</td>
            <td>
              <span v-if="act.user" style="font-weight: 600;">
                {{ act.user.supervisor ? `${act.user.supervisor.nombres} ${act.user.supervisor.ape_pat}` : `@${act.user.username}` }}
              </span>
              <span v-else style="color: var(--text-muted); font-size: 0.8rem;">Sin asignar</span>
            </td>
            <td>
              <span :class="['badge', statusClass(act.estado)]">{{ act.estado }}</span>
            </td>
            <td style="text-align: right;">
              <div style="display: inline-flex; gap: 8px;">
                <router-link :to="`/activities/${act.id}`" class="btn btn-ghost btn-sm">Ver</router-link>
                <button class="btn btn-danger btn-sm" @click="deleteActivity(act.id)">Eliminar</button>
              </div>
            </td>
          </tr>
          <tr v-if="activities.length === 0">
            <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 40px;">
              No hay actividades registradas.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- MODAL: CREAR SEDE (LOCATION + UBIETY) -->
    <div v-if="showLocationModal" class="modal-overlay" @click.self="showLocationModal = false">
      <div class="modal-card">
        <div class="modal-header">
          <div>
            <h3 class="modal-title">Crear Nueva Sede (Location)</h3>
            <span style="font-size: 0.75rem; color: var(--primary); font-weight: 600; font-family: var(--font-mono); text-transform: uppercase;">
              Sede Regional con Ubicación GPS
            </span>
          </div>
          <button class="btn-close" @click="showLocationModal = false">&times;</button>
        </div>
        <form @submit.prevent="submitLocation">
          <div style="padding: 24px;">
            <div class="form-group">
              <label class="form-label">Nombre de la Sede *</label>
              <input v-model="newLocation.nombre" class="form-input" placeholder="Ej: Sede Principal Miraflores" required />
            </div>

            <div class="grid-2">
              <div class="form-group">
                <label class="form-label">Departamento (Sede Reg) *</label>
                <input v-model="newLocation.sede_reg" class="form-input" placeholder="Ej: LIMA" required />
              </div>
              <div class="form-group">
                <label class="form-label">Provincia (Sede Juris) *</label>
                <input v-model="newLocation.sede_juris" class="form-input" placeholder="Ej: LIMA" required />
              </div>
            </div>

            <div style="margin-top: 12px; background: var(--primary-light); border: 1px solid var(--primary-border); padding: 14px; border-radius: var(--radius);">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-weight: 700; color: var(--primary); font-size: 0.85rem; font-family: var(--font-heading);">
                  Ubicación GPS de la Sede (Ubiety) *
                </span>
                <button type="button" class="btn btn-sm btn-secondary" @click="showCoordsModal = true">
                  Abrir Selector Modal
                </button>
              </div>
              <div class="grid-2">
                <div class="form-group" style="margin: 0;">
                  <label class="form-label">Latitud *</label>
                  <input v-model="newLocation.latitud" type="number" step="any" class="form-input" placeholder="-12.046374" required />
                </div>
                <div class="form-group" style="margin: 0;">
                  <label class="form-label">Longitud *</label>
                  <input v-model="newLocation.longitud" type="number" step="any" class="form-input" placeholder="-77.042793" required />
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-ghost" @click="showLocationModal = false">Cancelar</button>
            <button type="submit" class="btn btn-primary" :disabled="savingLocation">
              {{ savingLocation ? 'Guardando...' : 'Guardar Sede' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL: INSERCIÓN RÁPIDA DE COORDENADAS (UBIETY) -->
    <div v-if="showCoordsModal" class="modal-overlay" @click.self="showCoordsModal = false">
      <div class="modal-card" style="max-width: 450px;">
        <div class="modal-header">
          <h3 class="modal-title">Ubicación GPS</h3>
          <button class="btn-close" @click="showCoordsModal = false">&times;</button>
        </div>
        <div style="padding: 20px;">
          <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 16px;">
            Ingresa las coordenadas precisas de latitud y longitud requeridas para validar la asistencia en esta sede.
          </p>
          <div class="form-group">
            <label class="form-label">Latitud (Decimal)</label>
            <input v-model="newLocation.latitud" type="number" step="any" class="form-input" placeholder="-12.046374" />
          </div>
          <div class="form-group">
            <label class="form-label">Longitud (Decimal)</label>
            <input v-model="newLocation.longitud" type="number" step="any" class="form-input" placeholder="-77.042793" />
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-primary" @click="showCoordsModal = false">Aceptar Coordenadas</button>
        </div>
      </div>
    </div>

    <!-- MODAL: CREAR PERÍODO (PERIODS CON FECHA Y HORA) -->
    <div v-if="showPeriodModal" class="modal-overlay" @click.self="showPeriodModal = false">
      <div class="modal-card">
        <div class="modal-header">
          <div>
            <h3 class="modal-title">Crear Nuevo Período</h3>
            <span style="font-size: 0.75rem; color: var(--primary); font-weight: 600; font-family: var(--font-mono); text-transform: uppercase;">
              Rango de Fecha y Hora
            </span>
          </div>
          <button class="btn-close" @click="showPeriodModal = false">&times;</button>
        </div>
        <form @submit.prevent="submitPeriod">
          <div style="padding: 24px;">
            <div class="form-group">
              <label class="form-label">Nombre del Período *</label>
              <input v-model="newPeriod.nombre" class="form-input" placeholder="Ej: Turno Mañana 27 Julio" required />
            </div>

            <div class="grid-2">
              <div class="form-group">
                <label class="form-label">Fecha y Hora de Inicio *</label>
                <input v-model="newPeriod.fec_inicio" type="datetime-local" class="form-input" required />
              </div>
              <div class="form-group">
                <label class="form-label">Fecha y Hora de Fin *</label>
                <input v-model="newPeriod.fec_fin" type="datetime-local" class="form-input" required />
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-ghost" @click="showPeriodModal = false">Cancelar</button>
            <button type="submit" class="btn btn-primary" :disabled="savingPeriod">
              {{ savingPeriod ? 'Guardando...' : 'Guardar Período' }}
            </button>
          </div>
        </form>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '../services/api'

const activities = ref([])
const locationsList = ref([])
const periodsList = ref([])
const usersList = ref([])

const loading = ref(true)
const showCreate = ref(false)
const creating = ref(false)
const filterEstado = ref('')
const filterFecha = ref('')

const showLocationModal = ref(false)
const showCoordsModal = ref(false)
const savingLocation = ref(false)

const showPeriodModal = ref(false)
const savingPeriod = ref(false)

const newActivity = ref({
  actividad: '',
  detalle: '',
  estado: 'pendiente',
  id_period: '',
  id_location: '',
  id_user: '',
})

const newLocation = ref({
  nombre: '',
  sede_reg: 'LIMA',
  sede_juris: 'LIMA',
  latitud: -12.046374,
  longitud: -77.042793,
})

const newPeriod = ref({
  nombre: '',
  fec_inicio: '',
  fec_fin: '',
})

function statusClass(estado) {
  const map = { pendiente: 'badge-warning', en_progreso: 'badge-info', completado: 'badge-success', cancelado: 'badge-danger' }
  return map[estado] || 'badge-info'
}

function formatDate(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  return d.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
}

async function fetchActivities() {
  loading.value = true
  try {
    const params = {}
    if (filterEstado.value) params.estado = filterEstado.value
    if (filterFecha.value) params.fecha = filterFecha.value

    const { data } = await api.get('/activities', { params })
    activities.value = data.data || []
  } catch (err) {
    console.error('Error fetching activities:', err)
  } finally {
    loading.value = false
  }
}

async function fetchDropdownData() {
  try {
    const [locRes, perRes, usrRes] = await Promise.all([
      api.get('/locations'),
      api.get('/periods'),
      api.get('/users/list')
    ])
    locationsList.value = locRes.data.data || []
    periodsList.value = perRes.data.data || []
    usersList.value = usrRes.data.data || []
  } catch (err) {
    console.error('Error loading dropdown data:', err)
  }
}

async function createActivity() {
  creating.value = true
  try {
    await api.post('/activities', newActivity.value)
    showCreate.value = false
    newActivity.value = { actividad: '', detalle: '', estado: 'pendiente', id_period: '', id_location: '', id_user: '' }
    await fetchActivities()
    alert('¡Actividad creada y asignada exitosamente!')
  } catch (err) {
    alert(err.response?.data?.message || 'Error al crear la actividad')
  } finally {
    creating.value = false
  }
}

async function submitLocation() {
  savingLocation.value = true
  try {
    const { data } = await api.post('/locations', newLocation.value)
    alert('Sede creada exitosamente.')
    showLocationModal.value = false
    await fetchDropdownData()
    if (data.location?.id) {
      newActivity.value.id_location = data.location.id
    }
  } catch (err) {
    alert(err.response?.data?.message || 'Error al guardar la sede.')
  } finally {
    savingLocation.value = false
  }
}

async function submitPeriod() {
  savingPeriod.value = true
  try {
    const { data } = await api.post('/periods', newPeriod.value)
    alert('Período creado exitosamente.')
    showPeriodModal.value = false
    await fetchDropdownData()
    if (data.period?.id) {
      newActivity.value.id_period = data.period.id
    }
  } catch (err) {
    alert(err.response?.data?.message || 'Error al guardar el período.')
  } finally {
    savingPeriod.value = false
  }
}

async function deleteActivity(id) {
  if (!confirm('¿Estás seguro de eliminar esta actividad?')) return
  try {
    await api.delete(`/activities/${id}`)
    await fetchActivities()
  } catch (err) {
    console.error('Error:', err)
  }
}

onMounted(() => {
  fetchActivities()
  fetchDropdownData()
})
</script>

<style scoped>
.grid-3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.btn-link {
  background: transparent;
  border: none;
  color: var(--primary);
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
}

.btn-close {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 1.5rem;
  cursor: pointer;
  line-height: 1;
}
</style>
