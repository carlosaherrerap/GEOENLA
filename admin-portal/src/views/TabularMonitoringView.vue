<template>
  <div class="tabular-container">
    <!-- Cabecera de Página -->
    <div class="header-card">
      <div class="header-left">
        <h1 class="header-title">Monitoreo Tabular</h1>
        <p class="header-subtitle">Consolidado general de supervisores, estado de dispositivos y ubicacion geografica en tiempo real</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" @click="exportToExcel">
          <i class="ph ph-file-xls"></i> Exportar Excel
        </button>
        <button class="btn btn-primary" @click="fetchData" :disabled="loading">
          <i class="ph ph-arrows-clockwise" :class="{ 'spin-icon': loading }"></i>
          {{ loading ? 'Actualizando...' : 'Actualizar' }}
        </button>
      </div>
    </div>

    <!-- Barra de Filtros -->
    <div class="filters-card">
      <div class="filter-field" style="flex: 2;">
        <label class="filter-label">Buscar Personal</label>
        <input
          v-model="searchQuery"
          type="text"
          class="form-control"
          placeholder="DNI, Apellidos, Nombres, Telefono, Ubicacion..."
          @input="onSearchInput"
        />
      </div>
      <div class="filter-field" style="flex: 1.2;">
        <label class="filter-label">Sede Regional</label>
        <select v-model="selectedSede" class="form-control" @change="onSedeChange">
          <option value="">-- Todas las Sedes --</option>
          <option v-for="sede in availableSedes" :key="sede" :value="sede">
            {{ sede }}
          </option>
        </select>
      </div>
      <div class="filter-field" style="flex: 1; display: flex; flex-direction: column; justify-content: flex-end;">
        <label class="auto-refresh-label">
          <input type="checkbox" v-model="autoRefresh" @change="toggleAutoRefresh" />
          <span>Auto-actualizar (30s)</span>
        </label>
      </div>
      <div class="filter-field counter-field" style="flex: 1;">
        <div class="counter-box">
          <span class="counter-label">Registros</span>
          <span class="counter-value">{{ filteredRows.length }}</span>
        </div>
      </div>
    </div>

    <!-- Contenedor Tabular con Scroll Horizontal y Sticky Izquierda -->
    <div class="table-wrapper">
      <table class="tabular-table">
        <thead>
          <!-- Fila de Grupos -->
          <tr class="header-group-row">
            <th colspan="6" class="th-group th-sticky-personal">INFORMACION PERSONAL</th>
            <th colspan="4" class="th-group th-group-device">DETALLES DEL DISPOSITIVO</th>
            <th colspan="5" class="th-group th-group-location">DETALLE UBICACION (TIEMPO REAL)</th>
          </tr>
          <!-- Fila de Columnas Individuales -->
          <tr class="header-columns-row">
            <!-- Informacion Personal (Sticky a la izquierda) -->
            <th class="th-col th-col-orden sticky-col-1">ORDEN</th>
            <th class="th-col th-col-sede sticky-col-2">SEDE REG</th>
            <th class="th-col th-col-dni sticky-col-3">DNI</th>
            <th class="th-col th-col-nombres sticky-col-4">APELLIDOS Y NOMBRES</th>
            <th class="th-col th-col-tel sticky-col-5">TELEFONO</th>
            <th class="th-col th-col-cargo sticky-col-6 sticky-divider">CARGO</th>

            <!-- Detalles del Dispositivo (Scrollable) -->
            <th class="th-col th-col-fecha">FECHA_REG</th>
            <th class="th-col th-col-hora">HORA</th>
            <th class="th-col th-col-bat">%BAT</th>
            <th class="th-col th-col-ver">V</th>

            <!-- Detalle Ubicacion Tiempo Real (Scrollable) -->
            <th class="th-col th-col-lat">LATITUD</th>
            <th class="th-col th-col-lng">LONGITUD</th>
            <th class="th-col th-col-dept">DEPARTAMENTO</th>
            <th class="th-col th-col-prov">PROVINCIA</th>
            <th class="th-col th-col-dist">DISTRITO</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading && rows.length === 0">
            <td colspan="15" class="cell-message">Cargando informacion de supervisores...</td>
          </tr>
          <tr v-else-if="filteredRows.length === 0">
            <td colspan="15" class="cell-message">No se encontraron registros que coincidan con la busqueda.</td>
          </tr>
          <tr
            v-for="(row, idx) in paginatedRows"
            :key="row.id"
            :class="['body-row', idx % 2 === 0 ? 'row-even' : 'row-odd']"
          >
            <!-- Informacion Personal (Sticky a la izquierda) -->
            <td class="td-cell td-col-orden sticky-col-1 text-center font-mono">{{ row.orden }}</td>
            <td class="td-cell td-col-sede sticky-col-2 font-bold wrap-cell">{{ row.sede_reg }}</td>
            <td class="td-cell td-col-dni sticky-col-3 font-mono">{{ row.dni }}</td>
            <td class="td-cell td-col-nombres sticky-col-4 font-semibold wrap-cell">
              {{ row.apellidos_nombres }}
            </td>
            <td class="td-cell td-col-tel sticky-col-5 font-mono">{{ row.telefono }}</td>
            <td class="td-cell td-col-cargo sticky-col-6 sticky-divider text-muted wrap-cell">{{ row.cargo }}</td>

            <!-- Detalles del Dispositivo (Scrollable) -->
            <td class="td-cell td-col-fecha font-mono text-center">{{ row.fecha_reg }}</td>
            <td class="td-cell td-col-hora font-mono text-center">{{ row.hora }}</td>
            <td class="td-cell td-col-bat font-mono text-center">
              <span :class="['battery-tag', getBatteryClass(row.bat)]">{{ row.bat }}</span>
            </td>
            <td class="td-cell td-col-ver font-mono text-center">{{ row.version }}</td>

            <!-- Detalle Ubicacion Tiempo Real (Scrollable) -->
            <td class="td-cell td-col-lat font-mono text-right">{{ row.latitud }}</td>
            <td class="td-cell td-col-lng font-mono text-right">{{ row.longitud }}</td>
            <td class="td-cell td-col-dept font-bold wrap-cell">{{ row.departamento }}</td>
            <td class="td-cell td-col-prov wrap-cell">{{ row.provincia }}</td>
            <td class="td-cell td-col-dist wrap-cell">{{ row.distrito }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Barra de Paginacion de 15 en 15 -->
    <div class="pagination-bar" v-if="filteredRows.length > 0">
      <div class="pagination-info">
        Mostrando {{ paginationStart }} - {{ paginationEnd }} de {{ filteredRows.length }} supervisores
      </div>
      <div class="pagination-controls">
        <button
          class="btn-page"
          :disabled="currentPage === 1"
          @click="goToPage(1)"
          title="Primera Pagina"
        >
          &laquo;
        </button>
        <button
          class="btn-page"
          :disabled="currentPage === 1"
          @click="goToPage(currentPage - 1)"
          title="Pagina Anterior"
        >
          &lsaquo; Anterior
        </button>

        <div class="page-numbers">
          <button
            v-for="p in visiblePages"
            :key="p"
            :class="['btn-page', 'btn-page-number', p === currentPage ? 'btn-page-active' : '']"
            @click="goToPage(p)"
          >
            {{ p }}
          </button>
        </div>

        <button
          class="btn-page"
          :disabled="currentPage === totalPages"
          @click="goToPage(currentPage + 1)"
          title="Pagina Siguiente"
        >
          Siguiente &rsaquo;
        </button>
        <button
          class="btn-page"
          :disabled="currentPage === totalPages"
          @click="goToPage(totalPages)"
          title="Ultima Pagina"
        >
          &raquo;
        </button>
      </div>
    </div>

    <!-- Pie Informativo -->
    <div class="footer-card">
      <div class="footer-left">
        <span>Ultima actualizacion: {{ lastUpdatedText }}</span>
      </div>
      <div class="footer-right">
        <span>ENLAGEO - Gestion Territorial</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import api from '../services/api'
import * as XLSX from 'xlsx'

const rows = ref([])
const loading = ref(false)
const searchQuery = ref('')
const selectedSede = ref('')
const autoRefresh = ref(false)
const lastUpdated = ref(new Date())

// Paginacion de 15 en 15
const currentPage = ref(1)
const pageSize = ref(15)

let refreshTimer = null
let searchDebounceTimer = null

const availableSedes = computed(() => {
  const set = new Set()
  rows.value.forEach(r => {
    if (r.sede_reg && r.sede_reg !== '-') set.add(r.sede_reg)
  })
  return Array.from(set).sort()
})

const filteredRows = computed(() => {
  let list = rows.value
  if (selectedSede.value) {
    list = list.filter(r => r.sede_reg === selectedSede.value)
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase()
    list = list.filter(r =>
      (r.apellidos_nombres && r.apellidos_nombres.toLowerCase().includes(q)) ||
      (r.dni && r.dni.toLowerCase().includes(q)) ||
      (r.telefono && r.telefono.toLowerCase().includes(q)) ||
      (r.sede_reg && r.sede_reg.toLowerCase().includes(q)) ||
      (r.departamento && r.departamento.toLowerCase().includes(q)) ||
      (r.provincia && r.provincia.toLowerCase().includes(q)) ||
      (r.distrito && r.distrito.toLowerCase().includes(q))
    )
  }
  return list.map((item, index) => ({
    ...item,
    orden: index + 1
  }))
})

const totalPages = computed(() => {
  return Math.ceil(filteredRows.value.length / pageSize.value) || 1
})

const paginatedRows = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filteredRows.value.slice(start, end)
})

const paginationStart = computed(() => {
  if (filteredRows.value.length === 0) return 0
  return (currentPage.value - 1) * pageSize.value + 1
})

const paginationEnd = computed(() => {
  return Math.min(currentPage.value * pageSize.value, filteredRows.value.length)
})

const visiblePages = computed(() => {
  const total = totalPages.value
  const cur = currentPage.value
  const maxButtons = 5
  let start = Math.max(1, cur - Math.floor(maxButtons / 2))
  let end = Math.min(total, start + maxButtons - 1)
  if (end - start + 1 < maxButtons) {
    start = Math.max(1, end - maxButtons + 1)
  }
  const pages = []
  for (let i = start; i <= end; i++) {
    pages.push(i)
  }
  return pages
})

const lastUpdatedText = computed(() => {
  if (!lastUpdated.value) return '-'
  const d = lastUpdated.value
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  const sec = String(d.getSeconds()).padStart(2, '0')
  return `${dd}/${mm}/${yyyy} ${hh}:${min}:${sec}`
})

function goToPage(p) {
  if (p >= 1 && p <= totalPages.value) {
    currentPage.value = p
  }
}

function onSedeChange() {
  currentPage.value = 1
  fetchData()
}

function onSearchInput() {
  clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(() => {
    currentPage.value = 1
  }, 250)
}

function getBatteryClass(batStr) {
  if (!batStr || batStr === '-') return 'bat-neutral'
  const val = parseInt(batStr.replace('%', ''), 10)
  if (isNaN(val)) return 'bat-neutral'
  if (val <= 15) return 'bat-low'
  if (val <= 40) return 'bat-mid'
  return 'bat-good'
}

async function fetchData() {
  loading.value = true
  try {
    const res = await api.get('/supervisors/tabular')
    rows.value = res.data?.data || []
    lastUpdated.value = new Date()
  } catch (err) {
    console.error('Error al cargar datos tabulares:', err)
  } finally {
    loading.value = false
  }
}

function toggleAutoRefresh() {
  if (autoRefresh.value) {
    refreshTimer = setInterval(() => {
      fetchData()
    }, 30000)
  } else {
    if (refreshTimer) {
      clearInterval(refreshTimer)
      refreshTimer = null
    }
  }
}

function exportToExcel() {
  const exportData = filteredRows.value.map(r => ({
    ORDEN: r.orden,
    'SEDE REG': r.sede_reg,
    DNI: r.dni,
    'APELLIDOS Y NOMBRES': r.apellidos_nombres,
    TELEFONO: r.telefono,
    CARGO: r.cargo,
    FECHA_REG: r.fecha_reg,
    HORA: r.hora,
    '%BAT': r.bat,
    V: r.version,
    LATITUD: r.latitud,
    LONGITUD: r.longitud,
    DEPARTAMENTO: r.departamento,
    PROVINCIA: r.provincia,
    DISTRITO: r.distrito || '-'
  }))

  const worksheet = XLSX.utils.json_to_sheet(exportData)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Monitoreo Tabular')

  const now = new Date()
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  XLSX.writeFile(workbook, `Monitoreo_Tabular_${dateStr}.xlsx`)
}

onMounted(() => {
  fetchData()
})

onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
  }
})
</script>

<style scoped>
/* Contenedor general en fondo neutro #ddd */
.tabular-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  background-color: #ddd;
  color: #111;
  font-family: inherit;
  padding: 16px;
  box-sizing: border-box;
  min-height: 100%;
}

/* Tarjeta de encabezado */
.header-card {
  background-color: #ddd;
  border: 1px solid #bbb;
  padding: 14px 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.header-title {
  margin: 0;
  font-size: 1.3rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #111;
}

.header-subtitle {
  margin: 2px 0 0 0;
  font-size: 0.82rem;
  color: #444;
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

/* Botones con estilo sobrio, sin sombras ni degradados */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  font-size: 0.85rem;
  font-weight: 600;
  border-radius: 4px;
  border: 1px solid #999;
  cursor: pointer;
  box-shadow: none !important;
}

.btn-primary {
  background-color: #333;
  color: #fff;
  border-color: #222;
}

.btn-primary:hover:not(:disabled) {
  background-color: #111;
}

.btn-secondary {
  background-color: #eee;
  color: #222;
  border-color: #bbb;
}

.btn-secondary:hover {
  background-color: #e2e2e2;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spin-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Tarjeta de filtros */
.filters-card {
  background-color: #ddd;
  border: 1px solid #bbb;
  padding: 12px 18px;
  display: flex;
  gap: 16px;
  align-items: flex-end;
  flex-wrap: wrap;
}

.filter-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.filter-label {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  color: #333;
  letter-spacing: 0.03em;
}

.form-control {
  background-color: #eee;
  color: #111;
  border: 1px solid #aaa;
  border-radius: 3px;
  padding: 6px 10px;
  font-size: 0.85rem;
  box-shadow: none !important;
}

.form-control:focus {
  outline: none;
  border-color: #333;
  background-color: #fff;
}

.auto-refresh-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.82rem;
  font-weight: 600;
  color: #333;
  cursor: pointer;
  margin-bottom: 6px;
}

.counter-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-color: #eee;
  border: 1px solid #bbb;
  padding: 4px 10px;
  border-radius: 3px;
}

.counter-label {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  color: #555;
}

.counter-value {
  font-size: 1rem;
  font-weight: 800;
  color: #111;
  font-family: monospace;
}

/* Wrapper de la tabla con scroll horizontal */
.table-wrapper {
  position: relative;
  overflow-x: auto;
  overflow-y: auto;
  background-color: #ddd;
  border: 1px solid #bbb;
  box-shadow: none !important;
}

/* Tabla base */
.tabular-table {
  width: max-content;
  min-width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 0.82rem;
  color: #111;
  background-color: #ddd;
}

/* Fila de cabecera de grupos */
.header-group-row {
  position: sticky;
  top: 0;
  z-index: 10;
}

.th-group {
  padding: 8px 10px;
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  text-align: center;
  border-bottom: 1px solid #999;
  border-right: 1px solid #bbb;
  box-shadow: none !important;
}

.th-sticky-personal {
  position: sticky;
  left: 0;
  z-index: 15;
  background-color: #ccc;
  color: #111;
  border-right: 2px solid #888;
}

.th-group-device {
  background-color: #d5d5d5;
  color: #222;
  border-right: 2px solid #888;
}

.th-group-location {
  background-color: #cccccc;
  color: #222;
}

/* Fila de cabecera de columnas */
.header-columns-row {
  position: sticky;
  top: 31px;
  z-index: 10;
}

.th-col {
  padding: 6px 8px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: #222;
  background-color: #d0d0d0;
  border-bottom: 2px solid #888;
  border-right: 1px solid #bbb;
  white-space: nowrap;
}

/* Anchos fijos y posiciones Sticky para Información Personal (Total = 860px) */
.th-col-orden, .td-col-orden {
  width: 55px;
  min-width: 55px;
  max-width: 55px;
}
.sticky-col-1 {
  position: sticky;
  left: 0;
}

.th-col-sede, .td-col-sede {
  width: 150px;
  min-width: 150px;
  max-width: 150px;
}
.sticky-col-2 {
  position: sticky;
  left: 55px;
}

.th-col-dni, .td-col-dni {
  width: 95px;
  min-width: 95px;
  max-width: 95px;
}
.sticky-col-3 {
  position: sticky;
  left: 205px;
}

.th-col-nombres, .td-col-nombres {
  width: 280px;
  min-width: 280px;
  max-width: 280px;
}
.sticky-col-4 {
  position: sticky;
  left: 300px;
}

.th-col-tel, .td-col-tel {
  width: 105px;
  min-width: 105px;
  max-width: 105px;
}
.sticky-col-5 {
  position: sticky;
  left: 580px;
}

.th-col-cargo, .td-col-cargo {
  width: 175px;
  min-width: 175px;
  max-width: 175px;
}
.sticky-col-6 {
  position: sticky;
  left: 685px;
}

/* Divisor vertical entre la sección fija y la desplazable */
.sticky-divider {
  border-right: 2px solid #888 !important;
}

/* Anchos para columnas desplazables */
.th-col-fecha, .td-col-fecha { width: 100px; min-width: 100px; }
.th-col-hora, .td-col-hora { width: 70px; min-width: 70px; }
.th-col-bat, .td-col-bat { width: 70px; min-width: 70px; }
.th-col-ver, .td-col-ver { width: 60px; min-width: 60px; }
.th-col-lat, .td-col-lat { width: 115px; min-width: 115px; }
.th-col-lng, .td-col-lng { width: 115px; min-width: 115px; }
.th-col-dept, .td-col-dept { width: 150px; min-width: 150px; }
.th-col-prov, .td-col-prov { width: 150px; min-width: 150px; }
.th-col-dist, .td-col-dist { width: 150px; min-width: 150px; }

/* Celdas del cuerpo */
.td-cell {
  padding: 8px 10px;
  border-bottom: 1px solid #ccc;
  border-right: 1px solid #bbb;
  vertical-align: middle;
}

.wrap-cell {
  white-space: normal;
  word-break: break-word;
  line-height: 1.25;
}

/* Filas alternadas con fondos sólidos y legibles */
.row-even {
  background-color: #ddd;
}
.row-even .sticky-col-1,
.row-even .sticky-col-2,
.row-even .sticky-col-3,
.row-even .sticky-col-4,
.row-even .sticky-col-5,
.row-even .sticky-col-6 {
  background-color: #ddd;
  z-index: 3;
}

.row-odd {
  background-color: #e5e5e5;
}
.row-odd .sticky-col-1,
.row-odd .sticky-col-2,
.row-odd .sticky-col-3,
.row-odd .sticky-col-4,
.row-odd .sticky-col-5,
.row-odd .sticky-col-6 {
  background-color: #e5e5e5;
  z-index: 3;
}

.body-row:hover {
  background-color: #eeeeee;
}
.body-row:hover .sticky-col-1,
.body-row:hover .sticky-col-2,
.body-row:hover .sticky-col-3,
.body-row:hover .sticky-col-4,
.body-row:hover .sticky-col-5,
.body-row:hover .sticky-col-6 {
  background-color: #eeeeee;
}

/* Encabezados sticky z-index alto */
.header-columns-row .sticky-col-1,
.header-columns-row .sticky-col-2,
.header-columns-row .sticky-col-3,
.header-columns-row .sticky-col-4,
.header-columns-row .sticky-col-5,
.header-columns-row .sticky-col-6 {
  z-index: 12;
  background-color: #c8c8c8;
}

/* Utilidades de texto y formato */
.text-center { text-align: center; }
.text-right { text-align: right; }
.font-mono { font-family: monospace; font-size: 0.8rem; }
.font-bold { font-weight: 700; }
.font-semibold { font-weight: 600; }
.text-muted { color: #555; }

.cell-message {
  padding: 30px;
  text-align: center;
  font-size: 0.9rem;
  color: #555;
  background-color: #ddd;
}

/* Indicador de Batería sobrio */
.battery-tag {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 2px;
  font-size: 0.75rem;
  font-weight: 700;
  border: 1px solid #aaa;
}

.bat-good {
  background-color: #cfd;
  color: #062;
  border-color: #8c9;
}

.bat-mid {
  background-color: #ffe;
  color: #760;
  border-color: #dc8;
}

.bat-low {
  background-color: #fdd;
  color: #811;
  border-color: #caa;
}

.bat-neutral {
  background-color: #eee;
  color: #555;
  border-color: #ccc;
}

/* Barra de Paginacion de 15 en 15 */
.pagination-bar {
  background-color: #ddd;
  border: 1px solid #bbb;
  padding: 10px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.pagination-info {
  font-size: 0.82rem;
  color: #333;
  font-weight: 600;
}

.pagination-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}

.page-numbers {
  display: flex;
  gap: 4px;
}

.btn-page {
  background-color: #eee;
  color: #222;
  border: 1px solid #aaa;
  border-radius: 3px;
  padding: 5px 10px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: none !important;
}

.btn-page:hover:not(:disabled) {
  background-color: #e0e0e0;
  border-color: #666;
}

.btn-page:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-page-number {
  min-width: 32px;
  text-align: center;
}

.btn-page-active {
  background-color: #333 !important;
  color: #fff !important;
  border-color: #222 !important;
}

/* Pie de página */
.footer-card {
  background-color: #ddd;
  border: 1px solid #bbb;
  padding: 8px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
  color: #555;
}
</style>
