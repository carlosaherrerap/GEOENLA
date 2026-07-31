import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Platform,
  StatusBar,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '../services/api';

interface ChatItem {
  id: string;
  user1: { id: string; username: string; correo: string; rol: string; estado: string };
  user2: { id: string; username: string; correo: string; rol: string; estado: string };
  talks?: { id: string; texto: string; fec_envio: string }[];
  last_update_chat?: string;
}

interface UserItem {
  id: string;
  username: string;
  correo: string;
  rol: string;
  estado: string;
}

interface MessageItem {
  id: string;
  texto: string;
  fec_envio: string;
  sender: { id: string; username: string; correo: string };
}

export const ChatScreen: React.FC = () => {
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [allUsers, setAllUsers] = useState<UserItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [myUserId, setMyUserId] = useState<string>('');

  // Active Chat State
  const [activeChat, setActiveChat] = useState<ChatItem | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [newMessageText, setNewMessageText] = useState('');
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);

  const scrollViewRef = useRef<ScrollView>(null);

  const fetchMyInfo = async () => {
    try {
      const res = await apiService.getMe();
      if (res?.user?.id) setMyUserId(res.user.id);
    } catch (_e) {}
  };

  const fetchChats = async () => {
    try {
      const response = await apiService.getChats();
      setChats(response.data || []);
    } catch (err) {
      console.warn('[ChatScreen] Error cargando chats:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await apiService.getAllUsers();
      setAllUsers(response.data || []);
    } catch (err) {
      console.warn('[ChatScreen] Error cargando usuarios:', err);
    }
  };

  useEffect(() => {
    fetchMyInfo();
    fetchChats();
    fetchUsers();
  }, []);

  // Polling de mensajes en tiempo real cuando un chat está abierto
  useEffect(() => {
    if (!activeChat) return;

    const interval = setInterval(() => {
      loadMessagesSilent(activeChat.id);
    }, 4000);

    return () => clearInterval(interval);
  }, [activeChat?.id]);

  const loadMessagesSilent = async (chatId: string) => {
    try {
      const response = await apiService.getChatMessages(chatId);
      setMessages(response.data || []);
    } catch (_e) {}
  };

  const handleStartChatWithUser = async (user: UserItem) => {
    setShowSearchModal(false);
    setLoadingMessages(true);
    try {
      const response = await apiService.createOrGetChat(user.id);
      const chat = response.data;
      setActiveChat(chat);
      loadMessages(chat.id);
    } catch (err) {
      console.warn('[ChatScreen] Error iniciando chat:', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  const loadMessages = async (chatId: string) => {
    setLoadingMessages(true);
    try {
      const response = await apiService.getChatMessages(chatId);
      setMessages(response.data || []);
    } catch (err) {
      console.warn('[ChatScreen] Error cargando mensajes:', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleOpenChat = (chat: ChatItem) => {
    setActiveChat(chat);
    loadMessages(chat.id);
  };

  const handleSendMessage = async () => {
    if (!newMessageText.trim() || !activeChat) return;

    setSending(true);
    const textToSend = newMessageText.trim();
    setNewMessageText('');

    try {
      const response = await apiService.sendMessage(activeChat.id, textToSend);
      if (response.data) {
        setMessages((prev) => [...prev, response.data]);
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
      fetchChats();
    } catch (err) {
      console.warn('[ChatScreen] Error enviando mensaje:', err);
    } finally {
      setSending(false);
    }
  };

  const isUserActive = (user: any): boolean => {
    if (!user) return false;
    if (user.estado === 'bloqueado') return false;
    const lastSeen = user.deviceDetail?.last_seen_at || user.last_seen_at;
    if (!lastSeen) return false;
    const diffMs = Date.now() - new Date(lastSeen).getTime();
    return diffMs < 15 * 60 * 1000;
  };

  const processedChats = React.useMemo(() => {
    let list = [...chats];

    // Ordenar conversaciones por mensaje más reciente (más reciente arriba)
    list.sort((a, b) => {
      const timeA = a.talks && a.talks.length > 0 ? new Date(a.talks[0].fec_envio).getTime() : (a.last_update_chat ? new Date(a.last_update_chat).getTime() : 0);
      const timeB = b.talks && b.talks.length > 0 ? new Date(b.talks[0].fec_envio).getTime() : (b.last_update_chat ? new Date(b.last_update_chat).getTime() : 0);
      return timeB - timeA;
    });

    // Buscar chat con el usuario Administrador
    const adminChatIndex = list.findIndex((c) => {
      const partner = c.user1?.id === myUserId ? c.user2 : c.user1 || c.user2;
      return partner?.rol === 'admin';
    });

    if (adminChatIndex > -1) {
      const [adminChat] = list.splice(adminChatIndex, 1);
      return [{ ...adminChat, isPinned: true }, ...list];
    }

    // Si no existe conversación iniciada con el Admin, anclar opción con usuario Admin disponible
    const adminUser = allUsers.find((u) => u.rol === 'admin');
    if (adminUser) {
      const dummyAdminChat: any = {
        id: `admin-pinned-${adminUser.id}`,
        isPinned: true,
        isSynthetic: true,
        user1: { id: myUserId, username: '', correo: '', rol: 'usuario', estado: 'activo' },
        user2: adminUser,
        talks: [],
        last_update_chat: null,
      };
      return [dummyAdminChat, ...list];
    }

    return list;
  }, [chats, allUsers, myUserId]);

  const filteredUsers = allUsers.filter(
    (u) =>
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.correo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.rol.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Mensajería en Vivo</Text>
          <Text style={styles.headerSubtitle}>Chatea con supervisores, admin y compañeros</Text>
        </View>
        <TouchableOpacity style={styles.newChatBtn} onPress={() => setShowSearchModal(true)}>
          <Ionicons name="chatbubble-ellipses" size={20} color="#ffffff" />
        </TouchableOpacity>
      </View>

      {/* Main Conversations List */}
      {loading ? (
        <ActivityIndicator size="large" color="#3E6AE1" style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={processedChats}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
          renderItem={({ item }) => {
            const partner = item.user1?.id === myUserId ? item.user2 : item.user1 || item.user2;
            const lastMsg = item.talks && item.talks.length > 0 ? item.talks[0].texto : (item.isPinned ? 'Toca para hablar con el administrador' : 'Sin mensajes');
            const activeStatus = isUserActive(partner);

            return (
              <TouchableOpacity
                style={[styles.chatCard, item.isPinned && styles.pinnedChatCard]}
                onPress={() => item.isSynthetic ? handleStartChatWithUser(partner) : handleOpenChat(item)}
              >
                <View style={{ position: 'relative' }}>
                  <View style={styles.avatarCircle}>
                    <Ionicons name={partner?.rol === 'admin' ? 'shield-checkmark' : 'person'} size={22} color={partner?.rol === 'admin' ? '#059669' : '#3E6AE1'} />
                  </View>
                  <View style={[styles.semaforoDotOverlay, activeStatus ? styles.semaforoDotOnline : styles.semaforoDotOffline]} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {item.isPinned && <Ionicons name="pin" size={14} color="#059669" />}
                      <Text style={styles.partnerName}>{partner?.username || 'Administrador'}</Text>
                    </View>
                    <View style={[styles.roleBadge, partner?.rol === 'admin' && styles.adminRoleBadge]}>
                      <Text style={[styles.roleText, partner?.rol === 'admin' && styles.adminRoleText]}>
                        {item.isPinned ? 'ADMIN (ANCLADO)' : (partner?.rol || 'usuario')}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.lastMsgText} numberOfLines={1}>
                    {lastMsg}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60 }}>
              <Ionicons name="chatbubbles-outline" size={48} color="#5C5E62" />
              <Text style={styles.emptyText}>No tienes conversaciones activas aún.</Text>
              <TouchableOpacity style={styles.startBtn} onPress={() => setShowSearchModal(true)}>
                <Text style={styles.startBtnText}>NUEVA CONVERSACIÓN</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* Modal Search Users */}
      <Modal visible={showSearchModal} animationType="slide" onRequestClose={() => setShowSearchModal(false)}>
        <View style={{ flex: 1, backgroundColor: '#F4F5F7', paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 12 : 48 }}>
          <View style={styles.searchHeader}>
            <TouchableOpacity onPress={() => setShowSearchModal(false)}>
              <Ionicons name="arrow-back" size={24} color="#171A20" />
            </TouchableOpacity>
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar usuario o correo..."
              placeholderTextColor="#5C5E62"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
          </View>

          <FlatList
            data={filteredUsers}
            keyExtractor={(u) => u.id}
            contentContainerStyle={{ padding: 20 }}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.userCard} onPress={() => handleStartChatWithUser(item)}>
                <View style={{ position: 'relative' }}>
                  <View style={styles.avatarCircle}>
                    <Ionicons name={item.rol === 'admin' ? 'shield-checkmark' : 'person'} size={20} color={item.rol === 'admin' ? '#059669' : '#3E6AE1'} />
                  </View>
                  <View style={[styles.semaforoDotOverlay, isUserActive(item) ? styles.semaforoDotOnline : styles.semaforoDotOffline]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.userNameText}>{item.username}</Text>
                  <Text style={styles.userEmailText}>{item.correo}</Text>
                </View>
                <View style={[styles.statusPill, isUserActive(item) ? styles.statusPillOnline : styles.statusPillOffline]}>
                  <Text style={[styles.statusPillText, isUserActive(item) ? styles.statusPillTextOnline : styles.statusPillTextOffline]}>
                    {isUserActive(item) ? 'ACTIVO' : 'INACTIVO'}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>

      {/* Modal Active Chat Conversation (Chat UI con Burbujas Emisor / Receptor) */}
      <Modal visible={activeChat !== null} animationType="slide" onRequestClose={() => setActiveChat(null)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, backgroundColor: '#F4F5F7' }}
        >
          {/* Active Chat Header */}
          <View style={styles.chatDetailHeader}>
            <TouchableOpacity onPress={() => setActiveChat(null)}>
              <Ionicons name="arrow-back" size={24} color="#171A20" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.activeChatTitle}>
                {activeChat?.user1?.id === myUserId ? activeChat?.user2?.username : activeChat?.user1?.username || 'Conversación'}
              </Text>
              <Text style={styles.activeChatSub}>En línea - Chat en vivo</Text>
            </View>
          </View>

          {/* Messages Feed */}
          {loadingMessages ? (
            <ActivityIndicator size="large" color="#3E6AE1" style={{ marginTop: 40 }} />
          ) : (
            <ScrollView
              ref={scrollViewRef}
              style={{ flex: 1, padding: 16 }}
              contentContainerStyle={{ gap: 10, paddingBottom: 20 }}
              onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
            >
              {messages.map((m) => {
                const isMe = m.sender?.id === myUserId;
                return (
                  <View
                    key={m.id}
                    style={[
                      styles.msgBubble,
                      isMe ? styles.msgBubbleSender : styles.msgBubbleReceiver,
                    ]}
                  >
                    {!isMe && <Text style={styles.msgSenderName}>{m.sender?.username || 'Usuario'}</Text>}
                    <Text style={[styles.msgText, isMe ? styles.msgTextSender : styles.msgTextReceiver]}>
                      {m.texto}
                    </Text>
                    <Text style={[styles.msgTimeText, isMe ? styles.msgTimeSender : styles.msgTimeReceiver]}>
                      {new Date(m.fec_envio).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          )}

          {/* Message Input Bar */}
          <View style={styles.inputBar}>
            <TextInput
              style={styles.messageInput}
              placeholder="Escribe un mensaje..."
              placeholderTextColor="#5C5E62"
              value={newMessageText}
              onChangeText={setNewMessageText}
            />
            <TouchableOpacity
              style={[styles.sendBtn, !newMessageText.trim() && { opacity: 0.5 }]}
              onPress={handleSendMessage}
              disabled={sending || !newMessageText.trim()}
            >
              {sending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="send" size={18} color="#ffffff" />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F5F7',
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 12 : 48,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#171A20',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#5C5E62',
  },
  newChatBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3E6AE1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 12,
  },
  avatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  partnerName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#171A20',
  },
  roleBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  roleText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#3E6AE1',
    textTransform: 'uppercase',
  },
  lastMsgText: {
    fontSize: 13,
    color: '#5C5E62',
    marginTop: 2,
  },
  emptyText: {
    fontSize: 14,
    color: '#5C5E62',
    marginTop: 12,
  },
  startBtn: {
    marginTop: 16,
    backgroundColor: '#3E6AE1',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  startBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  searchInput: {
    flex: 1,
    height: 40,
    backgroundColor: '#F4F5F7',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#171A20',
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    gap: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  userNameText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#171A20',
  },
  userEmailText: {
    fontSize: 12,
    color: '#5C5E62',
  },
  pinnedChatCard: {
    backgroundColor: '#F0FDF4',
    borderColor: '#A7F3D0',
    borderWidth: 1.5,
  },
  adminRoleBadge: {
    backgroundColor: '#D1FAE5',
  },
  adminRoleText: {
    color: '#059669',
  },
  semaforoDotOverlay: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  semaforoDotOnline: {
    backgroundColor: '#22C55E',
  },
  semaforoDotOffline: {
    backgroundColor: '#EF4444',
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusPillOnline: {
    backgroundColor: '#DCFCE7',
  },
  statusPillOffline: {
    backgroundColor: '#FEE2E2',
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  statusPillTextOnline: {
    color: '#15803D',
  },
  statusPillTextOffline: {
    color: '#B91C1C',
  },
  chatDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 12 : 50,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  activeChatTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#171A20',
  },
  activeChatSub: {
    fontSize: 11,
    color: '#22c55e',
    fontWeight: '600',
  },

  // Estilos de Burbujas de Chat (Emisor a la Derecha, Receptor a la Izquierda)
  msgBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 14,
    marginVertical: 2,
  },
  msgBubbleSender: {
    alignSelf: 'flex-end',
    backgroundColor: '#3E6AE1', // Azul Emisor
    borderBottomRightRadius: 2,
  },
  msgBubbleReceiver: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF', // Blanco Receptor
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderBottomLeftRadius: 2,
  },
  msgSenderName: {
    fontSize: 10,
    fontWeight: '700',
    color: '#3E6AE1',
    marginBottom: 2,
  },
  msgText: {
    fontSize: 14,
    lineHeight: 20,
  },
  msgTextSender: {
    color: '#FFFFFF',
  },
  msgTextReceiver: {
    color: '#171A20',
  },
  msgTimeText: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  msgTimeSender: {
    color: 'rgba(255, 255, 255, 0.75)',
  },
  msgTimeReceiver: {
    color: '#9CA3AF',
  },
  inputBar: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 8,
  },
  messageInput: {
    flex: 1,
    height: 44,
    backgroundColor: '#F4F5F7',
    borderRadius: 22,
    paddingHorizontal: 16,
    fontSize: 14,
    color: '#171A20',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#3E6AE1',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
