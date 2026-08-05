import React, { useState, useEffect } from 'react';
import { StatusBar, StyleSheet, View, Text, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as NavigationBar from 'expo-navigation-bar';
import { Ionicons } from '@expo/vector-icons';
import { LoginScreen } from './src/screens/LoginScreen';
import { ActivitiesScreen } from './src/screens/ActivitiesScreen';
import { ActivityDetailScreen } from './src/screens/ActivityDetailScreen';
import { DeviceInfoScreen } from './src/screens/DeviceInfoScreen';
import { ChatScreen } from './src/screens/ChatScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { ErrorLogsScreen } from './src/screens/ErrorLogsScreen';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { locationTracking } from './src/services/location';
import { offlineStorage } from './src/services/storage';
import { getAuthToken } from './src/services/api';
import { API_BASE_URL } from './src/config';
import { Audio } from 'expo-av';
import { Vibration, Modal } from 'react-native';
import * as Notifications from 'expo-notifications';
import { VolumeManager } from 'react-native-volume-manager';

type TabState = 'activities' | 'chat' | 'profile';
type ViewState = 'main' | 'activity_detail' | 'device_info' | 'error_logs';

function MainAppContent() {
  const insets = useSafeAreaInsets();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<TabState>('activities');
  const [currentView, setCurrentView] = useState<ViewState>('main');
  const [selectedActivity, setSelectedActivity] = useState<any>(null);

  const [callState, setCallState] = useState<'ringing' | 'connected' | null>(null);
  const [callSeconds, setCallSeconds] = useState<number>(0);
  const [activeCall, setActiveCall] = useState<{
    message: string;
    audioUrl: string;
    autoHangupMs: number;
    playUrl?: string;
  } | null>(null);

  const soundRef = React.useRef<any>(null);
  const ringtoneRef = React.useRef<any>(null);
  const isCallActiveRef = React.useRef<boolean>(false);

  useEffect(() => {
    let interval: any = null;
    if (callState === 'connected') {
      setCallSeconds(0);
      interval = setInterval(() => {
        setCallSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setCallSeconds(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [callState]);

  const formatCallTime = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const startRingtoneAudio = async (url: string) => {
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri: url },
        { shouldPlay: true, isLooping: true, volume: 1.0 }
      );
      ringtoneRef.current = sound;
    } catch (err) {
      console.warn('[Ringtone] Error playing ringtone audio:', err);
    }
  };

  const stopRingtoneAudio = async () => {
    if (ringtoneRef.current) {
      try {
        await ringtoneRef.current.stopAsync();
        await ringtoneRef.current.unloadAsync();
      } catch (_e) {}
      ringtoneRef.current = null;
    }
  };

  const startCallAudio = async (url: string) => {
    isCallActiveRef.current = true;
    try {
      try {
        await VolumeManager.setVolume(1.0);
      } catch (volErr) {
        console.warn('[VolumeManager] No se pudo establecer volumen multimedia al 100%:', volErr);
      }

      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri: url },
        { shouldPlay: true, isLooping: false, volume: 1.0 }
      );

      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.isLoaded && status.didJustFinish) {
          console.log('[AudioCall] Audio finalizado. Cortando llamada automáticamente...');
          hangupCall();
        }
      });

      if (!isCallActiveRef.current) {
        await sound.stopAsync();
        await sound.unloadAsync();
        return;
      }

      soundRef.current = sound;
    } catch (err) {
      console.warn('[AudioCall] Error playing call audio:', err);
    }
  };

  const stopCallAudio = async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch (_e) {}
      soundRef.current = null;
    }
  };

  const startVibration = () => {
    try {
      Vibration.vibrate([1000, 1000, 1000, 1000], true);
    } catch (_e) {}
  };

  const stopVibration = () => {
    try {
      Vibration.cancel();
    } catch (_e) {}
  };

  const answerCall = async () => {
    if (!activeCall) return;
    console.log('[Call] Usuario contestó la llamada. Deteniendo tono de llamada e iniciando audio de respuesta...');
    stopRingtoneAudio();
    stopVibration();
    setCallState('connected');
    if (activeCall.playUrl) {
      startCallAudio(activeCall.playUrl);
    }
  };

  const hangupCall = () => {
    isCallActiveRef.current = false;
    setCallState(null);
    setActiveCall(null);
    setCallSeconds(0);
    stopRingtoneAudio();
    stopCallAudio();
    stopVibration();
  };

  useEffect(() => {
    if (!isLoggedIn || !user) {
      hangupCall();
      return;
    }

    const getWsUrl = (apiUrl: string): string => {
      let wsUrl = apiUrl.replace('/api', '/ws');
      if (wsUrl.startsWith('https://')) {
        wsUrl = wsUrl.replace('https://', 'wss://');
      } else if (wsUrl.startsWith('http://')) {
        wsUrl = wsUrl.replace('http://', 'ws://');
      }
      return wsUrl;
    };

    const token = getAuthToken();
    const wsUrl = `${getWsUrl(API_BASE_URL)}?token=${token}`;
    console.log(`[WebSocket] Conectando a ${wsUrl}...`);

    let ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[WebSocket] Conexión establecida.');
    };

    ws.onmessage = (event: any) => {
      try {
        const payload = JSON.parse(event.data);
        console.log('[WebSocket] Mensaje recibido:', payload);

        if (payload.type === 'AUTOMATED_CALL') {
          const ringtoneUrl = payload.ringtoneUrl
            ? (payload.ringtoneUrl.startsWith('http')
                ? payload.ringtoneUrl
                : `${API_BASE_URL.replace('/api', '')}${payload.ringtoneUrl}`)
            : `${API_BASE_URL.replace('/api', '')}/audio/november.mp3`;

          const playUrl = payload.audioUrl.startsWith('http')
            ? payload.audioUrl
            : `${API_BASE_URL.replace('/api', '')}${payload.audioUrl}`;

          setActiveCall({
            message: payload.message,
            audioUrl: payload.audioUrl,
            autoHangupMs: payload.autoHangupMs || 25000,
            playUrl,
          });
          setCallState('ringing');

          // Reproducir tono de llamada (november.mp3)
          startRingtoneAudio(ringtoneUrl);

          // Disparar la notificación del sistema con alta prioridad (para sobreponerse en pantalla)
          Notifications.scheduleNotificationAsync({
            content: {
              title: '⚠️ LLAMADA ENTRANTE DE INACTIVIDAD',
              body: payload.message,
              sound: true,
              priority: Notifications.AndroidNotificationPriority.MAX,
              vibrate: [0, 2000, 250, 2000, 250, 2000],
            },
            trigger: null,
          }).catch((e) => console.warn('[Notifications] Error scheduling call push:', e));

          startVibration();
        }
      } catch (err) {
        console.error('[WebSocket] Error parseando mensaje:', err);
      }
    };

    ws.onclose = () => {
      console.log('[WebSocket] Conexión cerrada.');
    };

    return () => {
      ws.close();
      stopCallAudio();
      stopVibration();
    };
  }, [isLoggedIn, user]);

  useEffect(() => {
    // Cargar caché local tras montar la interfaz de React
    offlineStorage.loadFromStorage().catch(() => {});

    // Configurar ocultamiento de barra nativa en Android de forma segura
    if (Platform.OS === 'android') {
      const timer = setTimeout(() => {
        try {
          NavigationBar.setVisibilityAsync('hidden').catch(() => {});
        } catch (_err) {
          // Ignorar si no está disponible
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleLoginSuccess = (userData: any) => {
    setUser(userData);
    setIsLoggedIn(true);
    setActiveTab('activities');
    setCurrentView('main');
  };

  const handleLogout = () => {
    locationTracking.stopTracking();
    setUser(null);
    setIsLoggedIn(false);
    setActiveTab('activities');
    setCurrentView('main');
  };

  if (!isLoggedIn) {
    return (
      <View style={[styles.container, { paddingTop: Math.max(insets.top, 24), paddingBottom: Math.max(insets.bottom, 12) }]}>
        <StatusBar barStyle="dark-content" backgroundColor="#ddd" translucent />
        <LoginScreen onLoginSuccess={handleLoginSuccess} />
      </View>
    );
  }

  const bottomPadding = Math.max(insets.bottom, 14);

  return (
    <ErrorBoundary fallbackText="Ocurrió un inconveniente general en la interfaz. Presiona reintentar para restablecer la vista.">
      <View style={[styles.container, { paddingTop: Math.max(insets.top, 24) }]}>
        <StatusBar barStyle="dark-content" backgroundColor="#ddd" translucent />

        {/* Main Screens Content */}
        <View style={{ flex: 1 }}>
          {currentView === 'activity_detail' ? (
            <ActivityDetailScreen
              activity={selectedActivity}
              onBack={() => setCurrentView('main')}
            />
          ) : currentView === 'device_info' ? (
            <DeviceInfoScreen onBack={() => setCurrentView('main')} />
          ) : currentView === 'error_logs' ? (
            <ErrorLogsScreen onBack={() => setCurrentView('main')} />
          ) : (
            <>
              {activeTab === 'activities' && (
                <ActivitiesScreen
                  onSelectActivity={(activity) => {
                    setSelectedActivity(activity);
                    setCurrentView('activity_detail');
                  }}
                  onOpenDeviceScreen={() => setCurrentView('device_info')}
                  onOpenErrorLogs={() => setCurrentView('error_logs')}
                  onLogout={handleLogout}
                />
              )}
              {activeTab === 'chat' && <ChatScreen />}
              {activeTab === 'profile' && (
                <ProfileScreen
                  onLogout={handleLogout}
                  onOpenDevice={() => setCurrentView('device_info')}
                />
              )}
            </>
          )}
        </View>

        {/* Bottom Navigation Bar con Safe Area Padding */}
        {currentView === 'main' && (
          <View style={[styles.bottomTabBar, { paddingBottom: bottomPadding, height: 56 + bottomPadding }]}>
            <TouchableOpacity
              style={styles.tabItem}
              onPress={() => setActiveTab('activities')}
              activeOpacity={0.7}
            >
              <Ionicons
                name={activeTab === 'activities' ? 'clipboard' : 'clipboard-outline'}
                size={22}
                color={activeTab === 'activities' ? '#3E6AE1' : '#5C5E62'}
              />
              <Text style={[styles.tabLabel, activeTab === 'activities' && styles.activeTabLabel]}>
                Actividades
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.tabItem}
              onPress={() => setActiveTab('chat')}
              activeOpacity={0.7}
            >
              <Ionicons
                name={activeTab === 'chat' ? 'chatbubbles' : 'chatbubbles-outline'}
                size={22}
                color={activeTab === 'chat' ? '#3E6AE1' : '#5C5E62'}
              />
              <Text style={[styles.tabLabel, activeTab === 'chat' && styles.activeTabLabel]}>
                Chat
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.tabItem}
              onPress={() => setActiveTab('profile')}
              activeOpacity={0.7}
            >
              <Ionicons
                name={activeTab === 'profile' ? 'person' : 'person-outline'}
                size={22}
                color={activeTab === 'profile' ? '#3E6AE1' : '#5C5E62'}
              />
              <Text style={[styles.tabLabel, activeTab === 'profile' && styles.activeTabLabel]}>
                Mi Perfil
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Modal para llamadas de advertencia de inactividad */}
        {activeCall && callState && (
          <Modal transparent animationType="fade" visible={!!activeCall}>
            <View style={styles.callOverlay}>
              <View style={styles.callCard}>
                {callState === 'ringing' ? (
                  <>
                    <View style={styles.callHeader}>
                      <Ionicons name="alert-circle" size={54} color="#e11d48" style={styles.pulseIcon} />
                      <Text style={styles.callTitle}>LLAMADA ENTRANTE</Text>
                      <Text style={styles.callSubtitle}>Área de Monitoreo GEOENLA</Text>
                    </View>
                    <Text style={styles.callMessage}>{activeCall.message}</Text>
                    <View style={styles.callActions}>
                      <TouchableOpacity style={[styles.callBtn, styles.callBtnAccept]} onPress={answerCall}>
                        <Ionicons name="call" size={20} color="#ffffff" />
                        <Text style={styles.callBtnLabel}>Contestar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.callBtn, styles.callBtnHangup]} onPress={hangupCall}>
                        <Ionicons name="close-circle" size={20} color="#ffffff" />
                        <Text style={styles.callBtnLabel}>Rechazar</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={styles.callHeader}>
                      <Ionicons name="call" size={54} color="#10b981" style={styles.pulseIcon} />
                      <Text style={[styles.callTitle, { color: '#10b981' }]}>EN LLAMADA</Text>
                      <Text style={styles.callTimerText}>{formatCallTime(callSeconds)}</Text>
                      <Text style={styles.callSubtitle}>Área de Monitoreo GEOENLA</Text>
                    </View>
                    <Text style={styles.callMessage}>{activeCall.message}</Text>
                    <View style={styles.callActions}>
                      <TouchableOpacity style={[styles.callBtn, styles.callBtnHangup, { width: '85%' }]} onPress={hangupCall}>
                        <Ionicons name="call" size={20} color="#ffffff" style={{ transform: [{ rotate: '135deg' }] }} />
                        <Text style={styles.callBtnLabel}>Finalizar Llamada</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            </View>
          </Modal>
        )}
      </View>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ErrorBoundary fallbackText="Ocurrió un problema de interfaz al iniciar la pantalla de inicio.">
        <MainAppContent />
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ddd',
  },
  bottomTabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#cccccc',
    alignItems: 'center',
    justifyContent: 'space-around',
    elevation: 12,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    flex: 1,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#5C5E62',
    marginTop: 2,
  },
  activeTabLabel: {
    color: '#3E6AE1',
    fontWeight: '700',
  },
  callOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  callCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    width: '100%',
    padding: 24,
    alignItems: 'center',
    elevation: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.58,
    shadowRadius: 16.0,
  },
  callHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  pulseIcon: {
    marginBottom: 10,
  },
  callTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#e11d48',
    letterSpacing: 1.5,
  },
  callSubtitle: {
    fontSize: 14,
    color: '#5C5E62',
    fontWeight: '600',
    marginTop: 4,
  },
  callTimerText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#171A20',
    marginTop: 6,
    marginBottom: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  callMessage: {
    fontSize: 16,
    color: '#171A20',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 28,
    fontWeight: '500',
  },
  callActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 30,
    gap: 8,
    minWidth: 120,
    justifyContent: 'center',
  },
  callBtnAccept: {
    backgroundColor: '#10b981',
  },
  callBtnHangup: {
    backgroundColor: '#ef4444',
  },
  callBtnLabel: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
