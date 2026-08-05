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

type TabState = 'activities' | 'chat' | 'profile';
type ViewState = 'main' | 'activity_detail' | 'device_info' | 'error_logs';

function MainAppContent() {
  const insets = useSafeAreaInsets();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<TabState>('activities');
  const [currentView, setCurrentView] = useState<ViewState>('main');
  const [selectedActivity, setSelectedActivity] = useState<any>(null);

  const [activeCall, setActiveCall] = useState<{
    message: string;
    audioUrl: string;
    autoHangupMs: number;
  } | null>(null);
  const soundRef = React.useRef<any>(null);

  const startCallAudio = async (url: string) => {
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

  const hangupCall = () => {
    setActiveCall(null);
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

    let ws = new global.WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[WebSocket] Conexión establecida.');
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        console.log('[WebSocket] Mensaje recibido:', payload);

        if (payload.type === 'AUTOMATED_CALL') {
          setActiveCall({
            message: payload.message,
            audioUrl: payload.audioUrl,
            autoHangupMs: payload.autoHangupMs || 12000,
          });

          const playUrl = payload.audioUrl.startsWith('http')
            ? payload.audioUrl
            : `${API_BASE_URL.replace('/api', '')}${payload.audioUrl}`;

          startCallAudio(playUrl);
          startVibration();

          const hangupTime = payload.autoHangupMs || 12000;
          setTimeout(() => {
            hangupCall();
          }, hangupTime);
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
        {activeCall && (
          <Modal transparent animationType="fade" visible={!!activeCall}>
            <View style={styles.callOverlay}>
              <View style={styles.callCard}>
                <View style={styles.callHeader}>
                  <Ionicons name="alert-circle" size={48} color="#e11d48" style={styles.pulseIcon} />
                  <Text style={styles.callTitle}>LLAMADA ENTRANTE</Text>
                  <Text style={styles.callSubtitle}>Área de Monitoreo GEOENLA</Text>
                </View>
                <Text style={styles.callMessage}>{activeCall.message}</Text>
                <View style={styles.callActions}>
                  <TouchableOpacity style={[styles.callBtn, styles.callBtnAccept]} onPress={hangupCall}>
                    <Ionicons name="checkmark-circle" size={20} color="#ffffff" />
                    <Text style={styles.callBtnLabel}>Aceptar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.callBtn, styles.callBtnHangup]} onPress={hangupCall}>
                    <Ionicons name="close-circle" size={20} color="#ffffff" />
                    <Text style={styles.callBtnLabel}>Colgar</Text>
                  </TouchableOpacity>
                </View>
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
