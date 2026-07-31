<template>
  <div class="fade-in">
    <div class="page-header">
      <div>
        <h1 class="page-title">Usuarios</h1>
        <p class="page-subtitle">Gestiona los trabajadores de campo y administradores del sistema</p>
      </div>
      <button class="btn btn-primary" @click="openWizard">
        <i class="ph ph-user-plus"></i> Nuevo Usuario
      </button>
    </div>

    <!-- Filters -->
    <div class="filters-bar">
      <div class="form-group" style="margin: 0; flex: 2;">
        <label class="form-label">Buscar Usuario</label>
        <input v-model="search" class="form-input" placeholder="Buscar por nombre, usuario o correo..." @input="fetchUsers" />
      </div>
      <div class="form-group" style="margin: 0; flex: 1;">
        <label class="form-label">Estado</label>
        <select v-model="filterEstado" class="form-select" @change="currentPage = 1">
          <option value="">Todos los Estados</option>
          <option value="activos">ACTIVOS (Sesión Activa)</option>
          <option value="inactivos">INACTIVOS (Sin Sesión / Desconectados)</option>
          <option value="bloqueado">Bloqueados</option>
        </select>
      </div>
      <div class="form-group" style="margin: 0; flex: 1;">
        <label class="form-label">Rol</label>
        <select v-model="filterRol" class="form-select" @change="currentPage = 1">
          <option value="">Todos los Roles</option>
          <option value="admin">Administrador</option>
          <option value="usuario">Usuario de Campo</option>
        </select>
      </div>
    </div>

    <!-- Skeleton Loading State -->
    <div v-if="loading" class="card" style="padding: 0; overflow: hidden;">
      <div class="skeleton-loader">
        <div class="skeleton-line" style="width: 100%; height: 36px;"></div>
        <div class="skeleton-line" style="width: 100%; height: 28px;"></div>
        <div class="skeleton-line" style="width: 100%; height: 28px;"></div>
        <div class="skeleton-line" style="width: 100%; height: 28px;"></div>
        <div class="skeleton-line" style="width: 100%; height: 28px;"></div>
      </div>
    </div>

    <!-- Table -->
    <div v-else class="table-container">
      <table>
        <thead>
          <tr>
            <th>Personal (Apellidos A-Z)</th>
            <th>Nombre de Usuario</th>
            <th>Correo Electrónico</th>
            <th>DNI / Doc</th>
            <th>Sede / Turno</th>
            <th>Rol</th>
            <th>Estado</th>
            <th style="text-align: right;">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in paginatedUsers" :key="user.id">
            <td style="font-weight: 600; color: var(--text-heading);">
              {{ user.supervisor ? `${user.supervisor.ape_pat} ${user.supervisor.ape_mat || ''}, ${user.supervisor.nombres}` : user.username }}
            </td>
            <td style="font-family: var(--font-mono); font-size: 0.85rem;">@{{ user.username }}</td>
            <td>{{ user.correo }}</td>
            <td style="font-family: var(--font-mono);">{{ user.supervisor?.doc || '-' }}</td>
            <td>
              <div style="font-weight: 600;">{{ user.supervisor?.location?.nombre || '-' }}</div>
              <span style="color: var(--text-muted); font-size: 0.75rem; font-family: var(--font-mono);">{{ user.supervisor?.schedule?.tipo || '-' }}</span>
            </td>
            <td>
              <span :class="['badge', user.rol === 'admin' ? 'badge-info' : 'badge-success']">
                {{ user.rol }}
              </span>
            </td>
            <td>
              <span :class="['badge', user.estado === 'bloqueado' ? 'badge-danger' : (isUserActive(user) ? 'badge-success' : 'badge-warning')]">
                {{ user.estado === 'bloqueado' ? 'BLOQUEADO' : (isUserActive(user) ? 'ACTIVO' : 'INACTIVO') }}
              </span>
            </td>
            <td style="text-align: right;">
              <div style="display: inline-flex; gap: 8px;">
                <router-link :to="`/users/${user.id}`" class="btn btn-ghost btn-sm">Ver</router-link>
                <button class="btn btn-sm" :class="user.estado === 'activo' ? 'btn-danger' : 'btn-primary'" @click="toggleBlock(user)">
                  {{ user.estado === 'activo' ? 'Bloquear' : 'Activar' }}
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="allFilteredUsers.length === 0">
            <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 40px;">
              No se encontraron usuarios registrados.
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Controles de Paginación (20 en 20) -->
      <div v-if="allFilteredUsers.length > 0" style="display: flex; justify-content: space-between; align-items: center; padding: 16px; border-top: 1px solid var(--border-subtle); background: var(--bg-subtle);">
        <span style="font-size: 0.85rem; color: var(--text-muted);">
          Mostrando {{ (currentPage - 1) * pageSize + 1 }} - {{ Math.min(currentPage * pageSize, allFilteredUsers.length) }} de {{ allFilteredUsers.length }} usuarios
        </span>
        <div style="display: flex; gap: 8px; align-items: center;">
          <button
            class="btn btn-sm btn-secondary"
            :disabled="currentPage === 1"
            @click="currentPage--"
          >
            Anterior
          </button>
          <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-heading);">
            Página {{ currentPage }} de {{ totalPages }}
          </span>
          <button
            class="btn btn-sm btn-secondary"
            :disabled="currentPage >= totalPages"
            @click="currentPage++"
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL WIZARD: NUEVO USUARIO (LIGHT THEME) -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal-card">
        <!-- Header -->
        <div class="modal-header">
          <div>
            <h3 class="modal-title">Nuevo Usuario</h3>
            <span style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--primary); font-weight: 600; text-transform: uppercase;">
              Paso {{ step }} de 3: {{ stepTitles[step - 1] }}
            </span>
          </div>
          <button class="btn-close" @click="showModal = false">&times;</button>
        </div>

        <!-- Progress Bar -->
        <div style="height: 3px; background: var(--border-subtle); width: 100%;">
          <div :style="{ width: (step / 3) * 100 + '%', height: '100%', background: 'var(--primary)', transition: 'width 0.3s ease' }"></div>
        </div>

        <!-- Form content -->
        <form @submit.prevent="handleNext">
          <div style="padding: 24px; max-height: 65vh; overflow-y: auto;">

            <!-- PASO 1: INFORMACIÓN PERSONAL -->
            <div v-if="step === 1" class="fade-in">
              <h4 style="font-size: 0.9rem; font-family: var(--font-heading); color: var(--text-heading); margin-bottom: 16px; border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px;">
                1. Información Personal (Supervisor)
              </h4>
              <div class="grid-2">
                <div class="form-group">
                  <label class="form-label">Nombres *</label>
                  <input v-model="form.nombres" class="form-input" placeholder="Ej: Juan Carlos" required />
                </div>
                <div class="form-group">
                  <label class="form-label">Apellido Paterno *</label>
                  <input v-model="form.ape_pat" class="form-input" placeholder="Ej: Perez" required />
                </div>
              </div>
              <div class="grid-2">
                <div class="form-group">
                  <label class="form-label">Apellido Materno *</label>
                  <input v-model="form.ape_mat" class="form-input" placeholder="Ej: Gomez" required />
                </div>
                <div class="form-group">
                  <label class="form-label">Documento (DNI 8 dígitos / CE 9-11 dígitos) *</label>
                  <input
                    v-model="form.doc"
                    class="form-input"
                    placeholder="Ej: 72839102"
                    maxlength="11"
                    required
                    @input="form.doc = form.doc.replace(/\D/g, '').slice(0, 11)"
                  />
                </div>
              </div>
              <div class="grid-2">
                <div class="form-group">
                  <label class="form-label">Nacionalidad</label>
                  <input v-model="form.nacionalidad" class="form-input" placeholder="PERUANA" />
                </div>
                <div class="form-group">
                  <label class="form-label">Género</label>
                  <select v-model="form.genero" class="form-select">
                    <option value="MASCULINO">MASCULINO</option>
                    <option value="FEMENINO">FEMENINO</option>
                    <option value="OTRO">OTRO</option>
                  </select>
                </div>
              </div>
              <div class="grid-2">
                <div class="form-group">
                  <label class="form-label">Teléfono (9 dígitos) *</label>
                  <input
                    v-model="form.telefono"
                    class="form-input"
                    placeholder="Ej: 987654321"
                    maxlength="9"
                    required
                    @input="form.telefono = form.telefono.replace(/\D/g, '').slice(0, 9)"
                  />
                </div>
                <div class="form-group">
                  <label class="form-label">Dirección *</label>
                  <input v-model="form.direccion" class="form-input" placeholder="Ej: Av. Brasil 450, Lima" required />
                </div>
              </div>
            </div>

            <!-- PASO 2: CUENTA Y UBICACIÓN -->
            <div v-if="step === 2" class="fade-in">
              <h4 style="font-size: 0.9rem; font-family: var(--font-heading); color: var(--text-heading); margin-bottom: 16px; border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px;">
                2. Cuenta de Acceso y Asignación de Sede
              </h4>
              <div class="grid-2">
                <div class="form-group">
                  <label class="form-label">Nombre de Usuario *</label>
                  <input v-model="form.username" class="form-input" placeholder="Ej: jperez" required />
                </div>
                <div class="form-group">
                  <label class="form-label">Correo Electrónico *</label>
                  <input v-model="form.correo" type="email" class="form-input" placeholder="jperez@empresa.com" required />
                </div>
              </div>
              <div class="grid-2">
                <div class="form-group">
                  <label class="form-label">Contraseña *</label>
                  <input v-model="form.clave" type="password" class="form-input" placeholder="******" required />
                </div>
                <div class="form-group">
                  <label class="form-label">Rol de Acceso</label>
                  <select v-model="form.rol" class="form-select">
                    <option value="usuario">Usuario de Campo</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
              </div>

              <div class="form-group" style="margin-top: 12px;">
                <label class="form-label">Sede Regional de Pertenencia</label>
                <select v-model="form.id_location" class="form-select" @change="onLocationSelect">
                  <option value="">-- Seleccionar Sede Creada --</option>
                  <option v-for="loc in locations" :key="loc.id" :value="loc.id">
                    {{ loc.nombre }} ({{ loc.sede_reg }} - {{ loc.sede_juris }})
                  </option>
                </select>
              </div>

              <div class="grid-2">
                <div class="form-group">
                  <label class="form-label">Departamento (Sede Reg)</label>
                  <input v-model="form.sede_reg" class="form-input" placeholder="Ej: LIMA" />
                </div>
                <div class="form-group">
                  <label class="form-label">Provincia (Sede Juris)</label>
                  <input v-model="form.sede_juris" class="form-input" placeholder="Ej: LIMA" />
                </div>
              </div>

              <div class="grid-2">
                <div class="form-group">
                  <label class="form-label">Latitud Hogar (Opcional)</label>
                  <input v-model="form.hogar_lat" type="number" step="any" class="form-input" placeholder="-12.046374" />
                </div>
                <div class="form-group">
                  <label class="form-label">Longitud Hogar (Opcional)</label>
                  <input v-model="form.hogar_long" type="number" step="any" class="form-input" placeholder="-77.042793" />
                </div>
              </div>
            </div>

            <!-- PASO 3: TURNO Y HORARIO -->
            <div v-if="step === 3" class="fade-in">
              <h4 style="font-size: 0.9rem; font-family: var(--font-heading); color: var(--text-heading); margin-bottom: 16px; border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px;">
                3. Asignación de Turno Laboral
              </h4>
              
              <div class="form-group">
                <label class="form-label">Selecciona el Tipo de Turno *</label>
                <div class="grid-3" style="margin-top: 6px;">
                  <label v-for="t in ['DIURNO', 'VESPERTINO', 'NOCTURNO']" :key="t" 
                         :class="['shift-card', form.turno_tipo === t ? 'active' : '']">
                    <input type="radio" v-model="form.turno_tipo" :value="t" style="display: none;" />
                    <span style="font-weight: 700; display: block; font-family: var(--font-heading);">{{ t }}</span>
                    <small style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-top: 4px;">
                      {{ t === 'DIURNO' ? '08:00 AM - 05:00 PM' : t === 'VESPERTINO' ? '01:00 PM - 09:00 PM' : '09:00 PM - 06:00 AM' }}
                    </small>
                  </label>
                </div>
              </div>

              <div class="grid-2" style="margin-top: 16px;">
                <div class="form-group">
                  <label class="form-label">Hora de Ingreso *</label>
                  <input v-model="form.turno_ingreso" type="time" class="form-input" required />
                </div>
                <div class="form-group">
                  <label class="form-label">Hora de Salida *</label>
                  <input v-model="form.turno_salida" type="time" class="form-input" required />
                </div>
              </div>
            </div>

            <!-- Error Alert -->
            <div v-if="errorMessage" style="background: var(--danger-bg); border: 1px solid var(--danger-border); color: var(--danger-text); padding: 10px 14px; border-radius: var(--radius); font-size: 0.85rem; margin-top: 16px;">
              {{ errorMessage }}
            </div>

          </div>

          <!-- Footer Actions -->
          <div class="modal-footer">
            <button v-if="step > 1" type="button" class="btn btn-ghost" @click="step--">Anterior</button>
            <div style="flex: 1;"></div>
            <button type="button" class="btn btn-ghost" @click="showModal = false">Cancelar</button>
            <button v-if="step < 3" type="submit" class="btn btn-primary">Siguiente &rarr;</button>
            <button v-else type="submit" class="btn btn-primary" :disabled="submitting">
              {{ submitting ? 'Registrando...' : 'Finalizar y Registrar' }}
            </button>
          </div>

        </form>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import api from '../services/api'

const users = ref([])
const locations = ref([])
const loading = ref(true)
const search = ref('')
const filterEstado = ref('')
const filterRol = ref('')

const currentPage = ref(1)
const pageSize = 20

function getFullLastName(u) {
  if (u.supervisor && (u.supervisor.ape_pat || u.supervisor.ape_mat)) {
    return `${u.supervisor.ape_pat || ''} ${u.supervisor.ape_mat || ''} ${u.supervisor.nombres || ''}`.trim().toLowerCase()
  }
  return (u.username || '').toLowerCase()
}

const allFilteredUsers = computed(() => {
  let list = [...users.value]

  if (filterEstado.value === 'activos') {
    list = list.filter(u => isUserActive(u))
  } else if (filterEstado.value === 'inactivos') {
    list = list.filter(u => !isUserActive(u))
  } else if (filterEstado.value === 'bloqueado') {
    list = list.filter(u => u.estado === 'bloqueado')
  }

  if (filterRol.value) {
    list = list.filter(u => u.rol === filterRol.value)
  }

  if (search.value && search.value.trim()) {
    const q = search.value.toLowerCase().trim()
    list = list.filter(u => {
      const uname = (u.username || '').toLowerCase()
      const mail = (u.correo || '').toLowerCase()
      const sName = u.supervisor ? `${u.supervisor.nombres} ${u.supervisor.ape_pat} ${u.supervisor.ape_mat}`.toLowerCase() : ''
      const doc = u.supervisor?.doc ? String(u.supervisor.doc).toLowerCase() : ''
      return uname.includes(q) || mail.includes(q) || sName.includes(q) || doc.includes(q)
    })
  }

  // Ordenar alfabéticamente por apellidos A - Z
  list.sort((a, b) => getFullLastName(a).localeCompare(getFullLastName(b)))

  return list
})

const totalPages = computed(() => Math.ceil(allFilteredUsers.value.length / pageSize) || 1)

const paginatedUsers = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return allFilteredUsers.value.slice(start, start + pageSize)
})

function isUserActive(u) {
  if (!u) return false
  if (u.estado === 'bloqueado') return false
  const lastSeen = u.deviceDetail?.last_seen_at || u.last_seen_at
  if (!lastSeen) return false
  const diffMs = Date.now() - new Date(lastSeen).getTime()
  return diffMs < 15 * 60 * 1000
}

const showModal = ref(false)
const step = ref(1)
const submitting = ref(false)
const errorMessage = ref('')

const stepTitles = ['Información Personal', 'Cuenta y Ubicación', 'Turno y Horario']

const defaultForm = () => ({
  nombres: '',
  ape_pat: '',
  ape_mat: '',
  doc: '',
  nacionalidad: 'PERUANA',
  genero: 'MASCULINO',
  telefono: '',
  direccion: '',

  username: '',
  correo: '',
  clave: '',
  rol: 'usuario',

  id_location: '',
  sede_reg: 'LIMA',
  sede_juris: 'LIMA',
  hogar_lat: '',
  hogar_long: '',

  turno_tipo: 'DIURNO',
  turno_ingreso: '08:00',
  turno_salida: '17:00',
})

const form = ref(defaultForm())

async function fetchUsers() {
  loading.value = true
  try {
    const params = {}
    if (search.value) params.search = search.value
    if (filterEstado.value) params.estado = filterEstado.value
    if (filterRol.value) params.rol = filterRol.value

    const { data } = await api.get('/users', { params })
    users.value = data.data || []
  } catch (err) {
    console.error('Error fetching users:', err)
  } finally {
    loading.value = false
  }
}

async function fetchLocations() {
  try {
    const { data } = await api.get('/locations')
    locations.value = data.data || []
  } catch (err) {
    console.error('Error fetching locations:', err)
  }
}

function openWizard() {
  form.value = defaultForm()
  step.value = 1
  errorMessage.value = ''
  showModal.value = true
}

function onLocationSelect() {
  const selected = locations.value.find(l => l.id === form.value.id_location)
  if (selected) {
    form.value.sede_reg = selected.sede_reg
    form.value.sede_juris = selected.sede_juris
  }
}

function handleNext() {
  errorMessage.value = ''
  if (step.value === 1) {
    if (!form.value.nombres || !form.value.ape_pat || !form.value.doc || !form.value.telefono || !form.value.direccion) {
      errorMessage.value = 'Por favor completa todos los campos obligatorios (*).'
      return
    }
    const docClean = String(form.value.doc).trim()
    if (!/^\d{8,11}$/.test(docClean)) {
      errorMessage.value = 'El documento debe contener entre 8 y 11 dígitos numéricos.'
      return
    }
    const telClean = String(form.value.telefono).trim()
    if (!/^\d{9}$/.test(telClean)) {
      errorMessage.value = 'El teléfono debe contener exactamente 9 dígitos numéricos.'
      return
    }
    step.value = 2
  } else if (step.value === 2) {
    if (!form.value.username || !form.value.correo || !form.value.clave) {
      errorMessage.value = 'Por favor ingresa usuario, correo y contraseña.'
      return
    }
    step.value = 3
  } else if (step.value === 3) {
    submitUser()
  }
}

async function submitUser() {
  submitting.value = true
  errorMessage.value = ''
  try {
    await api.post('/users', form.value)
    showModal.value = false
    await fetchUsers()
    alert('¡Usuario registrado exitosamente!')
  } catch (err) {
    errorMessage.value = err.response?.data?.message || 'Error al guardar usuario.'
  } finally {
    submitting.value = false
  }
}

async function toggleBlock(user) {
  try {
    const { data } = await api.patch(`/users/${user.id}/toggle-block`)
    user.estado = data.user.estado
  } catch (err) {
    console.error('Error toggling block:', err)
  }
}

onMounted(() => {
  fetchUsers()
  fetchLocations()
})
</script>

<style scoped>
.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.grid-3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.shift-card {
  border: 1px solid var(--border-medium);
  border-radius: var(--radius);
  padding: 12px;
  text-align: center;
  cursor: pointer;
  background: var(--bg-surface);
  transition: var(--transition);
}

.shift-card:hover {
  border-color: var(--primary);
}

.shift-card.active {
  border-color: var(--primary);
  background: var(--primary-light);
  box-shadow: 0 0 0 2px var(--primary-border);
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
