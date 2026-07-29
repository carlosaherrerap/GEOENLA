<template>
  <div class="chat-container">
    <!-- Users & Chats Sidebar -->
    <div class="chat-sidebar">
      <div class="chat-sidebar-header">
        <h3 class="title">Chat en Vivo</h3>
        <input
          type="text"
          v-model="searchQuery"
          placeholder="Buscar usuario..."
          class="form-control"
        />
      </div>

      <div class="users-list">
        <div
          v-for="user in filteredUsers"
          :key="user.id"
          class="user-item"
          :class="{ active: selectedUser?.id === user.id }"
          @click="selectUser(user)"
        >
          <div class="user-avatar">
            <i class="ph ph-user"></i>
          </div>
          <div class="user-info">
            <div class="user-name-row">
              <span class="user-name">
                {{ user.username }}
              </span>
              <span class="badge" :class="isUserActive(user) ? 'badge-success' : 'badge-danger'">
                {{ isUserActive(user) ? 'ACTIVO' : 'INACTIVO' }}
              </span>
            </div>
            <div class="user-email">{{ user.correo }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Active Chat Window -->
    <div class="chat-main" v-if="selectedUser">
      <div class="chat-main-header">
        <div class="header-info">
          <h4>{{ selectedUser.username }}</h4>
          <span>{{ selectedUser.correo }} &bull; {{ selectedUser.rol }} ({{ isUserActive(selectedUser) ? 'ACTIVO' : 'INACTIVO' }})</span>
        </div>
      </div>

      <div class="chat-messages" ref="messagesContainer">
        <div v-if="loadingMessages" class="loading-state">
          Cargando mensajes...
        </div>
        <div v-else-if="messages.length === 0" class="empty-state">
          No hay mensajes en esta conversación. Escribe el primer mensaje a continuación.
        </div>
        <div
          v-else
          v-for="msg in messages"
          :key="msg.id"
          class="message-bubble"
          :class="{ 'mine': msg.sender?.id === currentAdminId }"
        >
          <div class="sender-name">{{ msg.sender?.username || 'Usuario' }}</div>
          <div class="message-text">{{ msg.texto }}</div>
          <div class="message-time">
            {{ formatTime(msg.fec_envio) }}
            <span v-if="msg.sender?.id === currentAdminId" style="margin-left: 6px; font-weight: 700; display: inline-flex; align-items: center;">
              <i v-if="msg.estado === 'leido'" class="ph ph-checks" style="color: #60a5fa; font-size: 1.1rem;" title="Visto / Leído"></i>
              <i v-else class="ph ph-check" style="color: rgba(255,255,255,0.7); font-size: 0.95rem;" title="Enviado"></i>
            </span>
          </div>
        </div>
      </div>

      <div class="chat-input-bar">
        <input
          type="text"
          v-model="newMessageText"
          @keyup.enter="sendMessage"
          placeholder="Escribe tu mensaje para el trabajador..."
          class="form-control"
        />
        <button class="btn btn-primary" :disabled="sending || !newMessageText.trim()" @click="sendMessage">
          <i class="ph ph-paper-plane-right"></i> Enviar
        </button>
      </div>
    </div>

    <div class="chat-main empty-select" v-else>
      <div class="select-prompt">
        <i class="ph ph-chats-circle" style="font-size: 3rem; color: var(--primary);"></i>
        <h3>Selecciona un trabajador o supervisor</h3>
        <p>Inicia una conversación en tiempo real con cualquier usuario registrado.</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import api from '../services/api'

const users = ref([])
const searchQuery = ref('')
const selectedUser = ref(null)
const activeChatId = ref(null)
const messages = ref([])
const newMessageText = ref('')
const loadingMessages = ref(false)
const sending = ref(false)
const messagesContainer = ref(null)
let pollInterval = null

function isUserActive(u) {
  if (!u) return false
  if (u.estado === 'bloqueado') return false
  const lastSeen = u.deviceDetail?.last_seen_at || u.last_seen_at
  if (!lastSeen) return false
  const diffMs = Date.now() - new Date(lastSeen).getTime()
  return diffMs < 10 * 60 * 1000
}

const currentAdminId = computed(() => {
  try {
    return JSON.parse(localStorage.getItem('user'))?.id
  } catch {
    return null
  }
})

const filteredUsers = computed(() => {
  return users.value.filter(u =>
    u.username.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
    u.correo.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
    u.rol.toLowerCase().includes(searchQuery.value.toLowerCase())
  )
})

async function fetchUsers() {
  try {
    const res = await api.get('/users/all')
    users.value = res.data?.data || []
  } catch (err) {
    console.error('Error cargando usuarios para chat:', err)
  }
}

async function selectUser(user) {
  selectedUser.value = user
  loadingMessages.value = true
  try {
    const res = await api.post('/chats', { id_user_target: user.id })
    activeChatId.value = res.data?.data?.id
    await loadMessages()
  } catch (err) {
    console.error('Error iniciando conversación:', err)
  } finally {
    loadingMessages.value = false
  }
}

async function loadMessages() {
  if (!activeChatId.value) return
  try {
    const res = await api.get(`/chats/${activeChatId.value}/messages`)
    messages.value = res.data?.data || []
    await nextTick()
    scrollToBottom()
  } catch (err) {
    console.error('Error cargando mensajes:', err)
  }
}

async function sendMessage() {
  if (!newMessageText.value.trim() || !activeChatId.value) return
  sending.value = true
  const text = newMessageText.value.trim()
  newMessageText.value = ''

  try {
    const res = await api.post(`/chats/${activeChatId.value}/messages`, { texto: text })
    if (res.data?.data) {
      messages.value.push(res.data.data)
      await nextTick()
      scrollToBottom()
    }
  } catch (err) {
    console.error('Error enviando mensaje:', err)
  } finally {
    sending.value = false
  }
}

function scrollToBottom() {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

function formatTime(dateStr) {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return dateStr
  }
}

onMounted(() => {
  fetchUsers()
  pollInterval = setInterval(() => {
    if (activeChatId.value) {
      loadMessages()
    }
  }, 4000)
})

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval)
})
</script>

<style scoped>
.chat-container {
  display: flex;
  height: calc(100vh - 40px);
  gap: 20px;
}

.chat-sidebar {
  width: 320px;
  background: var(--surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
}

.chat-sidebar-header {
  padding: 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chat-sidebar-header .title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
}

.users-list {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
}

.user-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background 0.15s ease;
  margin-bottom: 6px;
}

.user-item:hover, .user-item.active {
  background: rgba(62, 106, 225, 0.08);
}

.user-avatar {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: #f0f7ff;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary);
  border: 1px solid var(--primary);
}

.user-info {
  flex: 1;
  overflow: hidden;
}

.user-name-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2px;
}

.user-name {
  font-weight: 600;
  font-size: 0.95rem;
}

.user-email {
  font-size: 0.8rem;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-main {
  flex: 1;
  background: var(--surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
}

.chat-main-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.chat-main-header h4 {
  margin: 0 0 2px 0;
}

.chat-main-header span {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.chat-messages {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message-bubble {
  align-self: flex-start;
  background: #f4f4f4;
  padding: 10px 14px;
  border-radius: 12px;
  max-width: 70%;
  border: 1px solid var(--border);
}

.message-bubble.mine {
  align-self: flex-end;
  background: #3E6AE1;
  color: #ffffff;
  border-color: #3E6AE1;
}

.message-bubble.mine .sender-name,
.message-bubble.mine .message-time {
  color: rgba(255, 255, 255, 0.8);
}

.sender-name {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--primary);
  margin-bottom: 2px;
}

.message-text {
  font-size: 0.95rem;
  line-height: 1.4;
}

.message-time {
  font-size: 0.7rem;
  color: var(--text-muted);
  text-align: right;
  margin-top: 4px;
}

.chat-input-bar {
  padding: 16px 20px;
  border-top: 1px solid var(--border);
  display: flex;
  gap: 12px;
}

.empty-select {
  align-items: center;
  justify-content: center;
}

.select-prompt {
  text-align: center;
  color: var(--text-muted);
}

.loading-state, .empty-state {
  text-align: center;
  color: var(--text-muted);
  margin-top: 40px;
}
</style>
