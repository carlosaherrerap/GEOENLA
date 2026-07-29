<template>
  <div class="fade-in">
    <div class="page-header">
      <div>
        <h1 class="page-title">Rutas de Trabajo</h1>
        <p class="page-subtitle">Agrupa actividades por ruta y asigna uno o varios usuarios responsables</p>
      </div>
      <button class="btn btn-primary" @click="openModalCreate">
        <i class="ph ph-path"></i> Nueva Ruta
      </button>
    </div>

    <!-- SKELETON LOADING -->
    <div v-if="loading" class="card" style="padding: 0; overflow: hidden;">
      <div class="skeleton-loader">
        <div class="skeleton-line" style="width: 100%; height: 36px;"></div>
        <div class="skeleton-line" style="width: 100%; height: 28px;"></div>
        <div class="skeleton-line" style="width: 100%; height: 28px;"></div>
      </div>
    </div>

    <!-- TABLE -->
    <div v-else class="table-container">
      <table>
        <thead>
          <tr>
            <th>Nombre de Ruta</th>
            <th>Sede</th>
            <th>Período</th>
            <th>Fecha Visita</th>
            <th>Actividades Incluidas</th>
            <th>Usuarios Responsables</th>
            <th>Estado</th>
            <th style="text-align: right;">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in routesList" :key="r.id">
            <td style="font-weight: 700; color: var(--text-heading);">
              <i class="ph ph-map-pin" style="color: var(--primary); margin-right: 4px;"></i>
              {{ r.nombre }}
            </td>
            <td>{{ r.location?.nombre || '-' }}</td>
            <td style="font-family: var(--font-mono); font-size: 0.8rem;">{{ r.period?.nombre || '-' }}</td>
            <td style="font-family: var(--font-mono);">{{ formatDate(r.fec_visita) }}</td>
            <td>
              <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                <span v-for="act in r.activities" :key="act.id" class="badge badge-info" style="font-size: 0.7rem;">
                  {{ act.actividad }}
                </span>
                <span v-if="!r.activities?.length" style="color: var(--text-muted); font-size: 0.8rem;">Sin actividades</span>
              </div>
            </td>
            <td>
              <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                <span v-for="ru in r.routeUsers" :key="ru.id" class="badge badge-success" style="font-size: 0.7rem;">
                  {{ ru.user?.supervisor ? `${ru.user.supervisor.nombres} ${ru.user.supervisor.ape_pat}` : `@${ru.user?.username}` }}
                </span>
                <span v-if="!r.routeUsers?.length && r.user" class="badge badge-success" style="font-size: 0.7rem;">
                  {{ r.user.supervisor ? `${r.user.supervisor.nombres} ${r.user.supervisor.ape_pat}` : `@${r.user.username}` }}
                </span>
                <span v-if="!r.routeUsers?.length && !r.user" style="color: var(--text-muted); font-size: 0.8rem;">Sin responsable</span>
              </div>
            </td>
            <td>
              <span :class="['badge', r.estado === 'completado' ? 'badge-success' : 'badge-warning']">
                {{ r.estado }}
              </span>
            </td>
            <td style="text-align: right;">
              <div style="display: inline-flex; gap: 8px;">
                <button class="btn btn-ghost btn-sm" @click="openModalEdit(r)">Editar</button>
                <button class="btn btn-danger btn-sm" @click="deleteRoute(r.id)">Eliminar</button>
              </div>
            </td>
          </tr>
          <tr v-if="routesList.length === 0">
            <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 40px;">
              No se han creado rutas de trabajo.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- MODAL CREAR / EDITAR RUTA -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal-card" style="max-width: 680px;">
        <div class="modal-header">
          <div>
            <h3 class="modal-title">{{ isEdit ? 'Editar Ruta' : 'Nueva Ruta de Trabajo' }}</h3>
            <span style="font-size: 0.75rem; color: var(--primary); font-weight: 600; font-family: var(--font-mono); text-transform: uppercase;">
              Agrupa actividades y asigna responsables
            </span>
          </div>
          <button class="btn-close" @click="showModal = false">&times;</button>
        </div>

        <form @submit.prevent="submitRoute">
          <div style="padding: 24px; max-height: 65vh; overflow-y: auto;">

            <!-- Nombre de Ruta -->
            <div class="form-group">
              <label class="form-label">Nombre de la Ruta *</label>
              <input v-model="form.nombre" class="form-input" placeholder="Ej: RUTA 1 - CENTRO HISTÓRICO" required />
            </div>

            <div class="grid-3">
              <!-- Sede -->
              <div class="form-group">
                <label class="form-label">Sede (Location) *</label>
                <select v-model="form.id_sede" class="form-select" required>
                  <option value="">-- Seleccionar Sede --</option>
                  <option v-for="loc in locations" :key="loc.id" :value="loc.id">
                    {{ loc.nombre }}
                  </option>
                </select>
              </div>

              <!-- Período -->
              <div class="form-group">
                <label class="form-label">Período *</label>
                <select v-model="form.id_period" class="form-select" required>
                  <option value="">-- Seleccionar Período --</option>
                  <option v-for="p in periods" :key="p.id" :value="p.id">
                    {{ p.nombre }}
                  </option>
                </select>
              </div>

              <!-- Fecha Visita -->
              <div class="form-group">
                <label class="form-label">Fecha de Visita *</label>
                <input v-model="form.fec_visita" type="date" class="form-input" required />
              </div>
            </div>

            <hr style="border: 0; border-top: 1px solid var(--border-subtle); margin: 16px 0;" />

            <!-- Seleccionar Actividades -->
            <div class="form-group">
              <label class="form-label">Actividades Incluidas en la Ruta</label>
              <div style="border: 1px solid var(--border-medium); border-radius: var(--radius); max-height: 140px; overflow-y: auto; padding: 8px;">
                <div v-for="act in availableActivities" :key="act.id" style="display: flex; align-items: center; gap: 8px; padding: 6px 4px; border-bottom: 1px solid var(--border-subtle);">
                  <input type="checkbox" :value="act.id" v-model="form.activity_ids" :id="`act-${act.id}`" />
                  <label :for="`act-${act.id}`" style="font-size: 0.85rem; cursor: pointer; color: var(--text-heading); font-weight: 500;">
                    {{ act.actividad }} <small style="color: var(--text-muted);">({{ act.location?.nombre || 'Sin sede' }})</small>
                  </label>
                </div>
                <div v-if="availableActivities.length === 0" style="color: var(--text-muted); font-size: 0.8rem; text-align: center; padding: 8px;">
                  No hay actividades registradas.
                </div>
              </div>
            </div>

            <!-- Seleccionar Usuarios Responsables -->
            <div class="form-group">
              <label class="form-label">Usuarios Responsables de la Ruta (Multi-usuario)</label>
              <div style="border: 1px solid var(--border-medium); border-radius: var(--radius); max-height: 140px; overflow-y: auto; padding: 8px;">
                <div v-for="u in users" :key="u.id" style="display: flex; align-items: center; gap: 8px; padding: 6px 4px; border-bottom: 1px solid var(--border-subtle);">
                  <input type="checkbox" :value="u.id" v-model="form.user_ids" :id="`usr-${u.id}`" />
                  <label :for="`usr-${u.id}`" style="font-size: 0.85rem; cursor: pointer; color: var(--text-heading); font-weight: 600;">
                    {{ u.supervisor ? `${u.supervisor.nombres} ${u.supervisor.ape_pat}` : `@${u.username}` }}
                  </label>
                </div>
                <div v-if="users.length === 0" style="color: var(--text-muted); font-size: 0.8rem; text-align: center; padding: 8px;">
                  No hay usuarios disponibles.
                </div>
              </div>
              <small style="color: var(--text-muted); margin-top: 4px; display: block;">
                Los usuarios seleccionados se asignarán automáticamente como responsables de todas las actividades incluidas en esta ruta.
              </small>
            </div>

          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-ghost" @click="showModal = false">Cancelar</button>
            <button type="submit" class="btn btn-primary" :disabled="submitting">
              {{ submitting ? 'Guardando...' : 'Guardar Ruta' }}
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

const routesList = ref([])
const locations = ref([])
const periods = ref([])
const availableActivities = ref([])
const users = ref([])

const loading = ref(true)
const showModal = ref(false)
const isEdit = ref(false)
const editId = ref(null)
const submitting = ref(false)

const form = ref({
  nombre: '',
  id_sede: '',
  id_period: '',
  fec_visita: new Date().toISOString().split('T')[0],
  activity_ids: [],
  user_ids: [],
})

function formatDate(isoStr) {
  if (!isoStr) return '-'
  const d = new Date(isoStr)
  return d.toLocaleDateString()
}

async function fetchRoutes() {
  loading.value = true
  try {
    const { data } = await api.get('/routes')
    routesList.value = data.data || []
  } catch (err) {
    console.error('Error fetching routes:', err)
  } finally {
    loading.value = false
  }
}

async function fetchDropdowns() {
  try {
    const [locRes, perRes, actRes, usrRes] = await Promise.all([
      api.get('/locations'),
      api.get('/periods'),
      api.get('/activities'),
      api.get('/users/list')
    ])
    locations.value = locRes.data.data || []
    periods.value = perRes.data.data || []
    availableActivities.value = actRes.data.data || []
    users.value = usrRes.data.data || []
  } catch (err) {
    console.error('Error fetching dropdowns:', err)
  }
}

function openModalCreate() {
  isEdit.value = false
  editId.value = null
  form.value = {
    nombre: '',
    id_sede: '',
    id_period: '',
    fec_visita: new Date().toISOString().split('T')[0],
    activity_ids: [],
    user_ids: [],
  }
  showModal.value = true
}

function openModalEdit(r) {
  isEdit.value = true
  editId.value = r.id
  form.value = {
    nombre: r.nombre,
    id_sede: r.id_sede,
    id_period: r.id_period,
    fec_visita: r.fec_visita ? r.fec_visita.split('T')[0] : '',
    activity_ids: r.activities ? r.activities.map(a => a.id) : [],
    user_ids: r.routeUsers ? r.routeUsers.map(ru => ru.id_user) : (r.id_user ? [r.id_user] : []),
  }
  showModal.value = true
}

async function submitRoute() {
  submitting.value = true
  try {
    if (isEdit.value) {
      await api.put(`/routes/${editId.value}`, form.value)
    } else {
      await api.post('/routes', form.value)
    }
    showModal.value = false
    await fetchRoutes()
    alert('Ruta guardada exitosamente.')
  } catch (err) {
    alert(err.response?.data?.message || 'Error al guardar la ruta.')
  } finally {
    submitting.value = false
  }
}

async function deleteRoute(id) {
  if (!confirm('¿Estás seguro de eliminar esta ruta?')) return
  try {
    await api.delete(`/routes/${id}`)
    await fetchRoutes()
  } catch (err) {
    console.error('Error deleting route:', err)
  }
}

onMounted(() => {
  fetchRoutes()
  fetchDropdowns()
})
</script>

<style scoped>
.grid-3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
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
