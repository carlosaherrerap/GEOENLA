<template>
  <div class="connectivity-container">
    <div class="page-header">
      <div>
        <h1 class="page-title">Conectividad WhatsApp</h1>
        <p class="page-subtitle">Vinculación de WhatsApp para notificaciones automáticas y alertas de inactividad</p>
      </div>
      <div style="display: flex; gap: 10px;">
        <button class="btn btn-secondary" @click="fetchStatus" :disabled="loading">
          <i class="ph ph-arrows-clockwise"></i> Refrescar
        </button>
      </div>
    </div>

    <div class="grid-layout">
      <!-- Tarjeta de Estado y Escaneo de QR -->
      <div class="card status-card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h2 style="font-size: 1.1rem; font-weight: 700; margin: 0; color: var(--text-heading); display: flex; align-items: center; gap: 8px;">
            <i class="ph ph-whatsapp-logo" style="font-size: 1.4rem; color: #25D366;"></i> Estado de Conexión
          </h2>
          <span :class="['badge', statusBadgeClass]">{{ statusText }}</span>
        </div>

        <!-- Información de la Sede asignada al Admin -->
        <div style="background: var(--bg-hover); padding: 12px 16px; border-radius: 8px; margin-bottom: 20px; display: flex; flex-direction: column; gap: 6px; font-size: 0.88rem; text-align: left;">
          <div><strong>Sede Regional:</strong> <span style="color: var(--primary-color); font-weight: 600;">{{ sedeReg }}</span></div>
          <div><strong>Jurisdicción:</strong> <span style="color: var(--text-heading); font-weight: 500;">{{ sedeJuris }}</span></div>
          <div v-if="userRole === 'su'"><strong>Rol especial:</strong> <span class="badge-su">Superusuario (su)</span></div>
        </div>

        <!-- Si el usuario es Superusuario (su), no requiere escanear QR -->
        <div v-if="userRole === 'su'" style="text-align: center; padding: 24px 16px;">
          <div style="width: 70px; height: 70px; border-radius: 50%; background: rgba(16, 185, 129, 0.15); color: #10b981; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto;">
            <i class="ph ph-shield-check" style="font-size: 2.8rem;"></i>
          </div>
          <h3 style="margin: 0 0 8px 0; font-size: 1.2rem; color: var(--text-heading);">Acceso Maestro Activo</h3>
          <p style="color: var(--text-muted); font-size: 0.9rem; max-width: 400px; margin: 0 auto 24px auto;">
            Como superusuario no requieres conectar un dispositivo. Tienes acceso para visualizar todos los mensajes enviados de todas las regiones.
          </p>
        </div>

        <!-- Si el usuario es Admin normal -->
        <div v-else>
          <div v-if="status === 'CONNECTED'" style="text-align: center; padding: 32px 16px;">
            <div style="width: 70px; height: 70px; border-radius: 50%; background: rgba(37, 211, 102, 0.15); color: #25D366; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto;">
              <i class="ph ph-check-circle" style="font-size: 2.8rem;"></i>
            </div>
            <h3 style="margin: 0 0 8px 0; font-size: 1.2rem; color: var(--text-heading);">WhatsApp Vinculado Exitosamente</h3>
            <p style="color: var(--text-muted); font-size: 0.9rem; max-width: 400px; margin: 0 auto 24px auto;">
              Tu cuenta de WhatsApp regional está conectada y lista para enviar notificaciones a los supervisores de la región <strong>{{ sedeReg }}</strong>.
            </p>
            <button class="btn btn-danger" @click="disconnectWhatsApp" :disabled="loading">
              <i class="ph ph-power"></i> Desconectar WhatsApp
            </button>
          </div>

          <div v-else-if="qrImage" style="text-align: center; padding: 24px 16px;">
            <h3 style="margin: 0 0 8px 0; font-size: 1.1rem; color: var(--text-heading);">Escanea el Código QR</h3>
            <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 20px;">
              Abre WhatsApp en tu teléfono &rarr; Menú / Ajustes &rarr; <strong>Dispositivos vinculados</strong> &rarr; Escanear código QR.
            </p>
            
            <div style="background: #ffffff; padding: 16px; display: inline-block; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-bottom: 20px;">
              <img :src="qrImage" alt="WhatsApp QR Code" style="width: 240px; height: 240px; display: block;" />
            </div>

            <div style="display: flex; justify-content: center; gap: 12px;">
              <button class="btn btn-primary" @click="fetchQR" :disabled="loading">
                <i class="ph ph-arrows-clockwise"></i> Actualizar QR
              </button>
              <button class="btn btn-ghost" @click="disconnectWhatsApp">Cancelar</button>
            </div>
          </div>

          <!-- Generando QR: spinner de espera -->
          <div v-else-if="generatingQR" style="text-align: center; padding: 32px 16px;">
            <div style="width: 70px; height: 70px; border-radius: 50%; background: rgba(2, 74, 216, 0.1); color: var(--primary-color); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto;">
              <i class="ph ph-spinner" style="font-size: 2.5rem; animation: spin 1s linear infinite;"></i>
            </div>
            <h3 style="margin: 0 0 8px 0; font-size: 1.1rem; color: var(--text-heading);">Generando Código QR...</h3>
            <p style="color: var(--text-muted); font-size: 0.85rem; max-width: 380px; margin: 0 auto;">
              Espera unos segundos mientras Baileys inicializa la sesión.
            </p>
          </div>

          <!-- Sin conexión: botón conectar -->
          <div v-else style="text-align: center; padding: 32px 16px;">
            <div style="width: 70px; height: 70px; border-radius: 50%; background: var(--bg-hover); color: var(--text-muted); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto;">
              <i class="ph ph-qr-code" style="font-size: 2.5rem;"></i>
            </div>
            <h3 style="margin: 0 0 8px 0; font-size: 1.1rem; color: var(--text-heading);">WhatsApp no Conectado</h3>
            <p style="color: var(--text-muted); font-size: 0.9rem; max-width: 380px; margin: 0 auto 16px auto;">
              Inicia la conexión para generar un nuevo código QR y sincronizar la cuenta de envío de mensajes.
            </p>
            <!-- Error del backend (timeout, sesión inválida, etc.) -->
            <div v-if="backendError" style="background: rgba(225,29,72,0.08); border: 1px solid rgba(225,29,72,0.25); border-radius: 8px; padding: 10px 16px; margin: 0 auto 16px auto; max-width: 380px; font-size: 0.82rem; color: #e11d48; text-align: left;">
              <i class="ph ph-warning-circle"></i> {{ backendError }}
            </div>
            <button class="btn btn-primary" @click="connectWhatsApp" :disabled="loading">
              <i class="ph ph-plug"></i> Conectar / Generar QR
            </button>
          </div>
        </div>

        <!-- Botón Ver Chats -->
        <div style="margin-top: 20px; border-top: 1px solid var(--border-color); padding-top: 16px;">
          <button class="btn btn-secondary" @click="goToChatsView" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;">
            <i class="ph ph-chat-circle-text" style="font-size: 1.2rem;"></i> VER CHATS
          </button>
        </div>
      </div>

      <!-- Tarjeta de Reglas del Motor de Inactividad -->
      <div class="card rules-card">
        <h2 style="font-size: 1.1rem; font-weight: 700; margin: 0 0 16px 0; color: var(--text-heading); display: flex; align-items: center; gap: 8px;">
          <i class="ph ph-shield-warning" style="font-size: 1.4rem; color: var(--primary-color);"></i> Protocolo de Inactividad (8:55 AM)
        </h2>
        <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 20px; line-height: 1.5;">
          A partir de las 8:55 AM, el sistema evalúa la señal GPS de los trabajadores. Si no se detecta actualización en vivo, se ejecuta el siguiente protocolo escalonado:
        </p>

        <div class="timeline-step">
          <div class="step-badge step-5m">5 Minutos</div>
          <div>
            <h4 style="margin: 0; font-size: 0.9rem; font-weight: 600;">Saludo y Notificación Preventiva</h4>
            <p style="margin: 4px 0 0 0; font-size: 0.8rem; color: var(--text-muted);">
              Envío de WhatsApp cordial y notificación Push recordando ingresar a la app y mantener encendida la ubicación (GPS).
            </p>
          </div>
        </div>

        <div class="timeline-step">
          <div class="step-badge step-10m">10 Minutos</div>
          <div>
            <h4 style="margin: 0; font-size: 0.9rem; font-weight: 600;">Llamada de Atención (1/3, 2/3, 3/3)</h4>
            <p style="margin: 4px 0 0 0; font-size: 0.8rem; color: var(--text-muted);">
              Mensaje estricto por WhatsApp recordando sanción INEI. Registro de falta diaria. Al acumular 3 llamadas de atención, <strong>la cuenta se bloquea automáticamente</strong>.
            </p>
          </div>
        </div>

        <div class="timeline-step">
          <div class="step-badge step-20m">20 Minutos</div>
          <div>
            <h4 style="margin: 0; font-size: 0.9rem; font-weight: 600;">Llamada Automatizada por WebSocket</h4>
            <p style="margin: 4px 0 0 0; font-size: 0.8rem; color: var(--text-muted);">
              Disparo de llamada interactiva a la app móvil con reproducción de audio `.mp3` de advertencia e invalidez de la jornada laboral.
            </p>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '../services/api'

const router = useRouter()
const status = ref('DISCONNECTED')
const qrImage = ref(null)
const loading = ref(false)
const generatingQR = ref(false)
const backendError = ref(null)
let pollTimer = null

// Regional/role states
const sedeReg = ref('Cargando...')
const sedeJuris = ref('Cargando...')
const userRole = ref('admin')

function goToChatsView() {
  router.push('/whatsapp-messages')
}

const statusBadgeClass = computed(() => {
  if (status.value === 'CONNECTED') return 'badge-success'
  if (qrImage.value || status.value === 'CONNECTING') return 'badge-warning'
  if (backendError.value) return 'badge-danger'
  return 'badge-danger'
})

const statusText = computed(() => {
  if (status.value === 'CONNECTED') return 'CONECTADO'
  if (qrImage.value) return 'ESPERANDO ESCANEO QR'
  if (generatingQR.value || status.value === 'CONNECTING') return 'GENERANDO QR...'
  return 'DESCONECTADO'
})

async function fetchStatus() {
  try {
    let res
    try {
      res = await api.get('/whatsapp/status')
    } catch {
      res = await api.get('/admin/whatsapp/status')
    }
    const prevStatus = status.value
    status.value = res.data.status
    sedeReg.value = res.data.sede_reg || 'No asignada'
    sedeJuris.value = res.data.sede_juris || 'No asignada'
    userRole.value = res.data.rol || 'admin'

    if (res.data.error) {
      backendError.value = res.data.error
    } else {
      backendError.value = null
    }

    if (res.data.hasQR) {
      await fetchQR()
      generatingQR.value = false
    } else if (status.value === 'CONNECTED') {
      qrImage.value = null
      generatingQR.value = false
    } else if (status.value === 'DISCONNECTED' && prevStatus === 'CONNECTING') {
      qrImage.value = null
      generatingQR.value = false
    }
  } catch (err) {
    console.error('Error cargando estado WhatsApp:', err)
  }
}

async function fetchQR() {
  try {
    let res
    try {
      res = await api.get('/whatsapp/qr')
    } catch {
      res = await api.get('/admin/whatsapp/qr')
    }
    if (res.data.qr) {
      qrImage.value = res.data.qr
      generatingQR.value = false
    }
  } catch (err) {
    console.error('Error cargando QR WhatsApp:', err)
  }
}

async function connectWhatsApp() {
  loading.value = true
  generatingQR.value = true
  status.value = 'CONNECTING'
  qrImage.value = null

  try {
    try {
      await api.post('/whatsapp/connect')
    } catch {
      await api.post('/admin/whatsapp/connect')
    }
  } catch (err) {
    console.error('Error conectando WhatsApp:', err)
    status.value = 'DISCONNECTED'
    generatingQR.value = false
  } finally {
    loading.value = false
  }

  startFastPoll()
}

async function disconnectWhatsApp() {
  loading.value = true
  generatingQR.value = false
  try {
    try {
      await api.post('/whatsapp/disconnect')
    } catch {
      await api.post('/admin/whatsapp/disconnect')
    }
    status.value = 'DISCONNECTED'
    qrImage.value = null
  } catch (err) {
    console.error('Error desconectando WhatsApp:', err)
  } finally {
    loading.value = false
  }
  startNormalPoll()
}



function formatTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleString('es-PE', { timeZone: 'America/Lima' })
}

function startFastPoll() {
  if (pollTimer) clearInterval(pollTimer)
  let ticks = 0
  pollTimer = setInterval(async () => {
    await fetchStatus()
    ticks++
    const done = status.value === 'CONNECTED' || qrImage.value ||
                 status.value === 'DISCONNECTED' || ticks >= 30
    if (done) {
      startNormalPoll()
    }
  }, 1500)
}

function startNormalPoll() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = setInterval(fetchStatus, 5000)
}

onMounted(() => {
  fetchStatus()
  startNormalPoll()
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<style scoped>
.connectivity-container {
  padding: 24px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.page-title {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--text-heading);
  margin: 0 0 4px 0;
}

.page-subtitle {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin: 0;
}

.grid-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

@media (max-width: 900px) {
  .grid-layout {
    grid-template-columns: 1fr;
  }
}

.card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.timeline-step {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  padding: 12px 0;
  border-bottom: 1px dashed var(--border-color);
}

.timeline-step:last-child {
  border-bottom: none;
}

.step-badge {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 20px;
  white-space: nowrap;
}

.step-5m {
  background: rgba(2, 74, 216, 0.1);
  color: var(--primary-color);
}

.step-10m {
  background: rgba(234, 179, 8, 0.15);
  color: #b45309;
}

.step-20m {
  background: rgba(225, 29, 72, 0.15);
  color: #e11d48;
}

.badge-su {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 20px;
  display: inline-block;
}



@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
