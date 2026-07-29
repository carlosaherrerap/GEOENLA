import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
  StatusBar,
  Alert,
  Switch,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '../services/api';
import { locationTracking } from '../services/location';
import { offlineStorage } from '../services/storage';

interface ActivityItem {
  id: string;
  actividad: string;
  detalle: string;
  estado: string;
  created_at?: string;
  id_route?: string;
  route?: {
    id: string;
    nombre: string;
  };
  period?: {
    nombre?: string;
    fec_inicio?: string;
    fec_fin?: string;
  };
  location?: {
    nombre: string;
    sede_reg?: string;
    sede_juris?: string;
    ubiety?: {
      latitud: number;
      longitud: number;
    };
  };
}

interface RouteItem {
  id: string;
  nombre: string;
}

interface Props {
  onSelectActivity: (activity: ActivityItem) => void;
  onOpenDeviceScreen: () => void;
  onOpenErrorLogs?: () => void;
  onLogout: () => void;
}

type DateFilter = 'ayer' | 'hoy' | 'manana';

export const ActivitiesScreen: React.FC<Props> = ({
  onSelectActivity,
  onOpenDeviceScreen,
  onOpenErrorLogs,
  onLogout,
}) => {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDateFilter, setSelectedDateFilter] = useState<DateFilter>('hoy');
  const [selectedRouteId, setSelectedRouteId] = useState<string>('');
  const [serverTodayStr, setServerTodayStr] = useState<string>('');
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);

  useEffect(() => {
    fetchActivities();
    offlineStorage.getSwitchState().then((state) => {
      setIsTransmitting(state);
      if (state) {
        locationTracking.startTracking();
      }
    });
  }, []);

  const handleToggleSwitch = async (value: boolean) => {
    if (value) {
      setShowConsentModal(true);
    } else {
      await locationTracking.stopTracking();
      setIsTransmitting(false);
      Alert.alert(
        'Transmisión Detenida',
        'Se acaba de apagar la transmisión de ubicación y ya no se obtendrá su ubicación.',
        [{ text: 'Entendido' }]
      );
    }
  };

  const handleConfirmConsent = async () => {
    setShowConsentModal(false);
    await offlineStorage.setConsentAccepted(true);
    await locationTracking.startTracking();
    setIsTransmitting(true);
  };

  const fetchServerDate = async () => {
    try {
      const res = await apiService.getServerDate();
      if (res?.serverDate) {
        setServerTodayStr(res.serverDate); // e.g. "2026-07-27"
      }
    } catch (_e) {}
  };

  const fetchRoutes = async () => {
    try {
      const res = await apiService.getRoutes();
      setRoutes(res.data || []);
    } catch (_e) {}
  };

  const fetchActivities = async () => {
    try {
      await fetchServerDate();
      await fetchRoutes();
      const response = await apiService.getActivities();
      const fetchedData = response.data || [];
      setActivities(fetchedData);
      offlineStorage.saveActivitiesCache(fetchedData);
      setIsOfflineMode(false);
    } catch (err) {
      console.log('[ActivitiesScreen] Sin red o error API. Cargando desde caché SQLite local:', err);
      const cached = offlineStorage.getActivitiesCache();
      setActivities(cached);
      setIsOfflineMode(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchActivities();
  }, []);

  const getLeftBorderColor = (item: ActivityItem) => {
    const isCurrentHeading = locationTracking.isTrackingActive() && locationTracking.getCurrentActivityId() === item.id;
    const estadoLower = item.estado?.toLowerCase();

    if (isCurrentHeading || estadoLower === 'en_camino' || estadoLower === 'en_progreso') {
      return '#3E6AE1'; // Azul Tesla: En camino / Empezó ruta
    }
    if (estadoLower === 'completado') {
      return '#22c55e'; // Verde: Actividad finalizada con marcación y foto
    }
    if (estadoLower === 'en_el_lugar' || estadoLower === 'asistencia_marcada') {
      return '#f59e0b'; // Amarillo: Llegó a la sede / en el lugar
    }
    return '#d0d1d2'; // Neutral: Sin marcar
  };

  const extractPureDateString = (dateVal?: string): string => {
    if (!dateVal) return '';
    const str = String(dateVal).trim();
    if (str.includes('T')) {
      return str.split('T')[0];
    }
    return str.substring(0, 10);
  };

  const getLocalDateString = (dateObj: Date) => {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) {
      const fallback = serverTodayStr || getLocalDateString(new Date());
      const parts = fallback.split('-');
      return `${parts[2]}/${parts[1]}/${parts[0]} 08:00`;
    }
    const pureDate = extractPureDateString(dateStr);
    const parts = pureDate.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]} 08:00`;
    }
    return dateStr;
  };

  // Filtrado de actividades por fecha (servidor) y por Ruta
  const getFilteredActivities = () => {
    const baseTodayStr = serverTodayStr || getLocalDateString(new Date());

    const [y, m, d] = baseTodayStr.split('-').map(Number);
    const baseDateObj = new Date(y, (m || 1) - 1, d || 1);

    const yesterdayObj = new Date(baseDateObj);
    yesterdayObj.setDate(yesterdayObj.getDate() - 1);
    const yesterdayStr = getLocalDateString(yesterdayObj);

    const tomorrowObj = new Date(baseDateObj);
    tomorrowObj.setDate(tomorrowObj.getDate() + 1);
    const tomorrowStr = getLocalDateString(tomorrowObj);

    return activities.filter((act) => {
      // Filtro opcional por Ruta
      if (selectedRouteId && act.id_route !== selectedRouteId) {
        return false;
      }

      const dateVal = act.period?.fec_inicio || act.created_at;
      if (!dateVal) return selectedDateFilter === 'hoy';

      const actDateStr = extractPureDateString(dateVal);

      if (selectedDateFilter === 'ayer') return actDateStr === yesterdayStr;
      if (selectedDateFilter === 'manana') return actDateStr === tomorrowStr;
      return actDateStr === baseTodayStr; // 'hoy' por defecto
    });
  };

  const filteredList = getFilteredActivities();

  const handleCardPress = (item: ActivityItem) => {
    const activeTrackingId = locationTracking.getCurrentActivityId();
    const isTracking = locationTracking.isTrackingActive();

    if (isTracking && activeTrackingId && activeTrackingId !== item.id) {
      const currentActiveItem = activities.find(a => a.id === activeTrackingId);
      Alert.alert(
        'Actividad en Curso',
        `Actualmente estás transmitiendo el trayecto para la actividad "${currentActiveItem?.actividad || 'en progreso'}". Debes presionar "FINALIZAR ACTIVIDAD" antes de dirigirte a otra.`
      );
      return;
    }

    onSelectActivity(item);
  };

  const renderItem = ({ item }: { item: ActivityItem }) => {
    const leftBorderColor = getLeftBorderColor(item);
    const dateFormatted = formatDate(item.period?.fec_inicio || item.created_at);
    const isCurrentActive = locationTracking.isTrackingActive() && locationTracking.getCurrentActivityId() === item.id;

    return (
      <TouchableOpacity
        style={[styles.card, { borderLeftColor: leftBorderColor }]}
        onPress={() => handleCardPress(item)}
        activeOpacity={0.85}
      >
        {/* Route Badge si la actividad pertenece a una ruta */}
        {item.route?.nombre && (
          <View style={styles.routeBadge}>
            <Ionicons name="map-outline" size={12} color="#024ad8" />
            <Text style={styles.routeBadgeText}>
              RUTA: {item.route.nombre}
            </Text>
          </View>
        )}

        {/* Card Header with Status & Active Indicator */}
        <View style={styles.cardHeader}>
          <View style={styles.titleWrap}>
            {isCurrentActive && (
              <View style={styles.activeKickerRow}>
                <Ionicons name="radio" size={12} color="#3E6AE1" />
                <Text style={styles.activeKickerText}>TRANSMITIENDO EN VIVO</Text>
              </View>
            )}
            <Text style={styles.activityTitle}>{item.actividad}</Text>
          </View>
          <View style={styles.badgeContainer}>
            <View style={[styles.badge, { borderColor: leftBorderColor }]}>
              <Text style={[styles.badgeText, { color: leftBorderColor === '#d0d1d2' ? '#171A20' : leftBorderColor }]}>
                {isCurrentActive ? 'en camino' : item.estado}
              </Text>
            </View>
          </View>
        </View>

        {/* Date & Time Badge */}
        <View style={styles.timeBadgeRow}>
          <Ionicons name="time-outline" size={14} color="#3E6AE1" />
          <Text style={styles.timeBadgeText}>Presentación: {dateFormatted}</Text>
        </View>

        {/* Detail Description */}
        <Text style={styles.activityDetail} numberOfLines={2}>
          {item.detalle}
        </Text>

        {/* Detailed Location Footer */}
        <View style={styles.locationContainer}>
          <View style={styles.locationMainRow}>
            <Ionicons name="location" size={16} color="#3E6AE1" />
            <Text style={styles.locationName}>
              {item.location?.nombre || 'Sede no asignada'}
            </Text>
          </View>
          <View style={styles.locationSubRow}>
            <Ionicons name="business-outline" size={14} color="#5C5E62" />
            <Text style={styles.locationSubText}>
              Región: <Text style={styles.highlightText}>{item.location?.sede_reg || 'Lima Sur'}</Text>
              {'  |  '}
              Jurisdicción: <Text style={styles.highlightText}>{item.location?.sede_juris || 'San Isidro'}</Text>
            </Text>
          </View>
        </View>

        {/* Footer Link Prompt */}
        <View style={styles.cardFooter}>
          <Text style={styles.cardFooterText}>Toca para gestionar ruta y marcar llegada</Text>
          <Ionicons name="chevron-forward" size={16} color="#3E6AE1" />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4F5F7" />

      {/* Header */}
      <View style={styles.headerContainer}>
        <View>
          <Text style={styles.headerTitle}>Mis Actividades</Text>

          {isOfflineMode ? (
            <View style={styles.offlineKicker}>
              <Ionicons name="cloud-offline" size={14} color="#f59e0b" />
              <Text style={styles.offlineKickerText}>Modo Offline (Caché SQLite)</Text>
            </View>
          ) : (
            <Text style={styles.headerSubtitle}>Toca una actividad para gestionar tu ruta</Text>
          )}
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          {onOpenErrorLogs && (
            <TouchableOpacity
              style={styles.deviceBtn}
              onPress={onOpenErrorLogs}
              activeOpacity={0.8}
            >
              <Ionicons name="bug-outline" size={22} color="#D97706" />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.deviceBtn}
            onPress={onOpenDeviceScreen}
            activeOpacity={0.8}
          >
            <Ionicons name="hardware-chip-outline" size={22} color="#3E6AE1" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={onLogout}
            activeOpacity={0.8}
          >
            <Ionicons name="log-out-outline" size={22} color="#E03C32" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Banner de Transmisión de Ubicación (Switch Manual) */}
      <View style={{
        backgroundColor: isTransmitting ? '#EFF6FF' : '#F9FAFB',
        marginHorizontal: 16,
        marginTop: 12,
        marginBottom: 4,
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: isTransmitting ? '#BFDBFE' : '#E5E7EB',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: isTransmitting ? '#1D4ED8' : '#374151' }}>
            TRANSMISIÓN DE UBICACIÓN
          </Text>
          <Text style={{ fontSize: 11, color: isTransmitting ? '#2563EB' : '#6B7280', marginTop: 2 }}>
            {isTransmitting ? 'Transmitiendo ubicación autorizada para INEI...' : 'Transmisión desactivada. Presiona para encender.'}
          </Text>
        </View>
        <Switch
          value={isTransmitting}
          onValueChange={handleToggleSwitch}
          trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
          thumbColor={isTransmitting ? '#024ad8' : '#9CA3AF'}
        />
      </View>

      {/* Selector de Fecha (Ayer, Hoy, Mañana) */}
      <View style={styles.filterBar}>
        <TouchableOpacity
          style={[
            styles.filterTab,
            selectedDateFilter === 'ayer' && styles.filterTabActive,
          ]}
          onPress={() => setSelectedDateFilter('ayer')}
        >
          <Text
            style={[
              styles.filterTabText,
              selectedDateFilter === 'ayer' && styles.filterTabTextActive,
            ]}
          >
            Ayer
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterTab,
            selectedDateFilter === 'hoy' && styles.filterTabActive,
          ]}
          onPress={() => setSelectedDateFilter('hoy')}
        >
          <Text
            style={[
              styles.filterTabText,
              selectedDateFilter === 'hoy' && styles.filterTabTextActive,
            ]}
          >
            Hoy
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterTab,
            selectedDateFilter === 'manana' && styles.filterTabActive,
          ]}
          onPress={() => setSelectedDateFilter('manana')}
        >
          <Text
            style={[
              styles.filterTabText,
              selectedDateFilter === 'manana' && styles.filterTabTextActive,
            ]}
          >
            Mañana
          </Text>
        </TouchableOpacity>
      </View>

      {/* Selector de Filtro por Ruta */}
      {routes.length > 0 && (
        <View style={styles.routeFilterRow}>
          <Text style={styles.routeFilterLabel}>Filtrar por Ruta:</Text>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={[{ id: '', nombre: 'Todas' }, ...routes]}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.routeChip,
                  selectedRouteId === item.id && styles.routeChipActive,
                ]}
                onPress={() => setSelectedRouteId(item.id)}
              >
                <Text
                  style={[
                    styles.routeChipText,
                    selectedRouteId === item.id && styles.routeChipTextActive,
                  ]}
                >
                  {item.nombre}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* Main List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#3E6AE1" />
          <Text style={styles.loadingText}>Cargando actividades...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredList}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchActivities();
              }}
              colors={['#3E6AE1']}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="calendar-outline" size={48} color="#D1D5DB" />
              <Text style={styles.emptyTitle}>Sin Actividades Programadas</Text>
              <Text style={styles.emptySubtitle}>
                {selectedDateFilter === 'hoy'
                  ? 'No tienes tareas asignadas para el día de hoy.'
                  : selectedDateFilter === 'ayer'
                  ? 'No hubo actividades registradas el día de ayer.'
                  : 'No hay actividades programadas para mañana.'}
              </Text>
            </View>
          }
        />
      )}

      {/* MODAL DE CONSENTIMIENTO INEI / PROYECTO ENLA */}
      <Modal
        visible={showConsentModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowConsentModal(false)}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.6)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24
        }}>
          <View style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 16,
            padding: 24,
            width: '100%',
            maxWidth: 340,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25,
            shadowRadius: 10,
            elevation: 8
          }}>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <Ionicons name="shield-checkmark" size={44} color="#024ad8" />
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827', marginTop: 8, textAlign: 'center' }}>
                Permiso de Ubicación
              </Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#024ad8', textTransform: 'uppercase', marginTop: 2 }}>
                INEI & Proyecto ENLA
              </Text>
            </View>

            <Text style={{ fontSize: 13, color: '#4B5563', lineHeight: 20, textAlign: 'center', marginBottom: 20 }}>
              Al activar el switch de transmisión, otorgas tu consentimiento expreso al INEI y al proyecto ENLA para registrar y transmitir tus coordenadas GPS en tiempo real durante tu jornada para fines exclusivos de supervisión y monitoreo de campo.
            </Text>

            <TouchableOpacity
              style={{
                backgroundColor: '#024ad8',
                paddingVertical: 14,
                borderRadius: 10,
                alignItems: 'center',
                marginBottom: 10
              }}
              onPress={handleConfirmConsent}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>
                Aceptar y Transmitir
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                paddingVertical: 10,
                alignItems: 'center'
              }}
              onPress={() => setShowConsentModal(false)}
            >
              <Text style={{ color: '#6B7280', fontSize: 13, fontWeight: '600' }}>
                Cancelar
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F5F7',
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : (StatusBar.currentHeight || 24) + 16,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#171A20',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#5C5E62',
    marginTop: 2,
  },
  offlineKicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  offlineKickerText: {
    fontSize: 12,
    color: '#f59e0b',
    fontWeight: '600',
  },
  deviceBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    gap: 10,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F4F5F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterTabActive: {
    backgroundColor: '#3E6AE1',
  },
  filterTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#5C5E62',
  },
  filterTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  routeFilterRow: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
  },
  routeFilterLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5C5E62',
    marginRight: 8,
  },
  routeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F4F5F7',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  routeChipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#3E6AE1',
  },
  routeChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5C5E62',
  },
  routeChipTextActive: {
    color: '#3E6AE1',
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderLeftWidth: 5,
    elevation: 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  routeBadge: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  routeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#024ad8',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  titleWrap: {
    flex: 1,
    paddingRight: 8,
  },
  activeKickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  activeKickerText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#3E6AE1',
    letterSpacing: 0.5,
  },
  activityTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#171A20',
  },
  badgeContainer: {
    alignItems: 'flex-end',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: '#F9FAFB',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  timeBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    backgroundColor: '#F4F5F7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  timeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3E6AE1',
  },
  activityDetail: {
    fontSize: 13,
    color: '#5C5E62',
    lineHeight: 18,
    marginBottom: 12,
  },
  locationContainer: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 10,
  },
  locationMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  locationName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#171A20',
  },
  locationSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationSubText: {
    fontSize: 11,
    color: '#5C5E62',
  },
  highlightText: {
    fontWeight: '700',
    color: '#3E6AE1',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F4F5F7',
  },
  cardFooterText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3E6AE1',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#5C5E62',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#171A20',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#5C5E62',
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 260,
  },
});

function uppercase(str: any) {
  return String(str || '').toUpperCase();
}
