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

type TabState = 'activities' | 'chat' | 'profile';
type ViewState = 'main' | 'activity_detail' | 'device_info' | 'error_logs';

function MainAppContent() {
  const insets = useSafeAreaInsets();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<TabState>('activities');
  const [currentView, setCurrentView] = useState<ViewState>('main');
  const [selectedActivity, setSelectedActivity] = useState<any>(null);

  useEffect(() => {
    // Configurar modo inmersivo sin barra nativa en Android (Samsung y todos los modelos)
    if (Platform.OS === 'android') {
      NavigationBar.setVisibilityAsync('hidden').catch(() => {});
      NavigationBar.setBehaviorAsync('overlay-swipe').catch(() => {});
      NavigationBar.setBackgroundColorAsync('transparent').catch(() => {});
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
      </View>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <MainAppContent />
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
});
