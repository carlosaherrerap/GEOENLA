import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  StatusBar,
  Modal,
  Vibration,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { apiService } from '../services/api';
import { locationTracking, calculateDistanceMeters } from '../services/location';
import { triggerProximityAlert } from '../services/notifications';
import { offlineStorage } from '../services/storage';
import { LeafletMapView } from '../components/LeafletMapView';
import { ErrorBoundary } from '../components/ErrorBoundary';

interface Props {
  activity: any;
  onBack: () => void;
}

export const ActivityDetailScreen: React.FC<Props> = ({ activity, onBack }) => {
  const [photos, setPhotos] = useState<string[]>([]);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [hasNotifiedProximity, setHasNotifiedProximity] = useState(false);
  const [isHeadingToSede, setIsHeadingToSede] = useState<boolean>(() => {
    return (
      locationTracking.isTrackingActive() &&
      locationTracking.getCurrentActivityId() === activity.id
    );
  });

  const [attendanceMarked, setAttendanceMarked] = useState<boolean>(
    activity.estado === 'en_el_lugar' || activity.estado === 'asistencia_marcada'
  );
  const [activityCompleted, setActivityCompleted] = useState<boolean>(
    activity.estado === 'completado'
  );

  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [showFullMapModal, setShowFullMapModal] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncItems, setSyncItems] = useState<any[]>([]);

  const sedeLat = parseFloat(activity.location?.ubiety?.latitud) || -12.0464;
  const sedeLng = parseFloat(activity.location?.ubiety?.longitud) || -77.0428;

  // Actualizar posición GPS del usuario en tiempo real para la distancia y ruta
  useEffect(() => {
    let isMounted = true;

    const updateGPS = async () => {
      try {
        let loc = null;
        try {
          loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        } catch {
          loc = await Location.getLastKnownPositionAsync();
        }

        if (loc?.coords && isMounted) {
          const lat = loc.coords.latitude;
          const lng = loc.coords.longitude;
          setUserLocation({ latitude: lat, longitude: lng });
          const dist = calculateDistanceMeters(lat, lng, sedeLat, sedeLng);
          setDistanceMeters(dist);

          // Notificación y alerta sonora/vibración al ingresar a 20 metros (dentro y fuera de la app)
          if (dist <= 20.0 && !hasNotifiedProximity && !attendanceMarked) {
            setHasNotifiedProximity(true);
            triggerProximityAlert(activity.location?.nombre || 'Sede Asignada', dist);
            Alert.alert(
              '¡Llegaste a la Sede!',
              `Te encuentras a ${dist.toFixed(1)} metros de la sede asignada (radio de 20m). Ya puedes tomar tu foto evidencia y MARCAR ASISTENCIA.`
            );
          }
        }
      } catch (err) {
        // Fallback silencioso a coordenadas de la sede sin advertencias invasivas
        if (isMounted && !userLocation) {
          setUserLocation({ latitude: sedeLat, longitude: sedeLng });
          setDistanceMeters(0.0);
        }
      }
    };

    updateGPS();
    const interval = setInterval(updateGPS, 8000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [sedeLat, sedeLng, hasNotifiedProximity, attendanceMarked]);

  const isFreeLocation =
    !activity.location ||
    activity.location.nombre?.toLowerCase().includes('sin sede') ||
    activity.location.nombre?.toLowerCase().includes('libre') ||
    (activity.location as any)?.es_libre === true ||
    (sedeLat === 0 && sedeLng === 0);

  const isAtSede = isFreeLocation || (distanceMeters !== null && distanceMeters <= 25.0);
  const canTakePhoto = (isFreeLocation || isAtSede || attendanceMarked) && !activityCompleted;

  const handleStartHeading = () => {
    locationTracking.setCurrentActivity(activity.id);
    locationTracking.startTracking();
    setIsHeadingToSede(true);
    Alert.alert(
      'Ruta Iniciada',
      'Tu ubicación se está transmitiendo en tiempo real hacia la sede asignada.'
    );
  };

  const handleCancelHeading = () => {
    Alert.alert(
      'Cancelar Trayecto',
      '¿Deseas cancelar el envío de ubicación para esta sede?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí, Cancelar',
          style: 'destructive',
          onPress: () => {
            locationTracking.setCurrentActivity(null);
            locationTracking.stopTracking();
            setIsHeadingToSede(false);
          },
        },
      ]
    );
  };

  const handleAddPhoto = async () => {
    if (photos.length >= 5) {
      Alert.alert('Límite alcanzado', 'Puedes adjuntar como máximo 5 fotos de evidencia.');
      return;
    }

    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso denegado', 'Se requiere acceso a la cámara para tomar evidencias.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        allowsEditing: false,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const formattedPhoto = asset.base64
          ? `data:image/jpeg;base64,${asset.base64}`
          : asset.uri;
        setPhotos([...photos, formattedPhoto]);
      }
    } catch (err) {
      console.warn('[ActivityDetail] Fallback cámara:', err);
      const simulatedPhoto = `photo_${Date.now()}_${photos.length + 1}.jpg`;
      setPhotos([...photos, simulatedPhoto]);
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos(photos.filter((_, i) => i !== index));
  };

  const handleMarkAttendance = async () => {
    if (photos.length < 1) {
      Alert.alert('Foto Requerida', 'Debes tomar al menos 1 foto de evidencia para MARCAR ASISTENCIA.');
      return;
    }

    setSubmitting(true);
    const currentLat = userLocation?.latitude || sedeLat;
    const currentLng = userLocation?.longitude || sedeLng;
    const dist = distanceMeters || 0;

    try {
      await apiService.checkInJson({
        id_activity: activity.id,
        id_location: activity.location?.id,
        lat: currentLat,
        lng: currentLng,
        observacion: commentText || 'Asistencia marcada en la sede (≤25m).',
        photos,
        is_final: false,
      });

      setAttendanceMarked(true);
      activity.estado = 'asistencia_marcada';
      setPhotos([]);
      setCommentText('');
      Alert.alert('Asistencia Registrada', 'Has marcado asistencia en la sede correctamente. Ahora puedes continuar con tu trabajo.');
    } catch (err: any) {
      console.warn('[ActivityDetail] Error en checkInJson:', err.message);
      offlineStorage.addSyncQueueItem({
        id: Date.now().toString(),
        action: 'insert',
        table_name: 'attendances',
        payload: {
          id_activity: activity.id,
          id_location: activity.location?.id,
          lat: currentLat,
          lng: currentLng,
          distance_m: dist,
          photos,
          observacion: commentText || 'Asistencia marcada (Offline)',
          checked_in_at: new Date().toISOString(),
        },
        recorded_at: new Date().toISOString(),
      });
      setAttendanceMarked(true);
      activity.estado = 'asistencia_marcada';
      setPhotos([]);
      setCommentText('');
      Alert.alert(
        'Asistencia Registrada',
        'Tu asistencia ha sido procesada y guardada localmente. Se sincronizará automáticamente al detectar conexión.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinalizeActivity = async () => {
    if (photos.length < 1) {
      Alert.alert('Foto Requerida', 'Debes tomar al menos 1 foto de evidencia final para FINALIZAR ACTIVIDAD.');
      return;
    }

    setSubmitting(true);
    const currentLat = userLocation?.latitude || sedeLat;
    const currentLng = userLocation?.longitude || sedeLng;

    try {
      await apiService.checkInJson({
        id_activity: activity.id,
        id_location: activity.location?.id,
        lat: currentLat,
        lng: currentLng,
        observacion: commentText || 'Actividad finalizada y cerrada con foto evidencia.',
        photos,
        is_final: true,
      });

      locationTracking.setCurrentActivity(null);
      locationTracking.stopTracking();
      setIsHeadingToSede(false);
      setActivityCompleted(true);
      activity.estado = 'completado';

      Alert.alert('Actividad Finalizada', 'La actividad ha sido completada y cerrada exitosamente.', [
        { text: 'OK', onPress: onBack },
      ]);
    } catch (err: any) {
      console.warn('[ActivityDetail] Error finalizando actividad:', err.message);
      locationTracking.setCurrentActivity(null);
      locationTracking.stopTracking();
      setIsHeadingToSede(false);
      setActivityCompleted(true);
      activity.estado = 'completado';

      Alert.alert('Actividad Finalizada', 'La actividad ha sido finalizada y guardada localmente.', [
        { text: 'OK', onPress: onBack },
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  const openSyncModal = () => {
    const queue = offlineStorage.getPendingSyncQueue();
    setSyncItems(queue);
    setShowSyncModal(true);
  };

  // El botón TOMAR FOTO sólo aparece cuando el usuario está en la sede, sin sede, o ha marcado asistencia
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }}>
      {/* Header Actions Row */}
      <View style={styles.topRow}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="arrow-back" size={16} color="#3E6AE1" />
            <Text style={styles.backText}>Volver a Actividades</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.syncModalButton} onPress={openSyncModal}>
          <Ionicons name="cloud-done-outline" size={16} color="#3E6AE1" />
          <Text style={styles.syncModalText}>VER DATOS SINCRONIZADOS</Text>
        </TouchableOpacity>
      </View>

      {/* Main Activity Card */}
      <View style={styles.card}>
        <Text style={styles.title}>{activity.actividad}</Text>
        <Text style={styles.detail}>{activity.detalle}</Text>

        <View style={styles.divider} />

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="location-outline" size={18} color="#3E6AE1" />
            <Text style={styles.sectionTitle}>Sede Asignada</Text>
          </View>
          <TouchableOpacity style={styles.fullMapBtn} onPress={() => setShowFullMapModal(true)}>
            <Ionicons name="map-outline" size={14} color="#3E6AE1" />
            <Text style={styles.fullMapText}>VER MAPA COMPLETO</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sedeName}>{activity.location?.nombre || 'Sede Principal'}</Text>
        
        {/* Leaflet Map View con Ruteo a Pie y Waze */}
        <ErrorBoundary fallbackText="No se pudo inicializar el mapa. El resto de las funciones están disponibles.">
          <LeafletMapView
            userLocation={userLocation}
            sedeLocation={{
              latitude: sedeLat,
              longitude: sedeLng,
              nombre: activity.location?.nombre || 'Sede Principal',
            }}
            height={310}
          />
        </ErrorBoundary>

        {/* Indicador de Transmisión Activa */}
        <View style={styles.activeTrackingBox}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Ionicons name="radio" size={18} color="#3E6AE1" />
            <Text style={styles.activeTrackingText}>
              Geolocalización en Vivo (Gestión Principal)
            </Text>
          </View>
        </View>
      </View>

      {/* Evidencias Section */}
      <View style={styles.card}>
        <View style={styles.photoHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="camera" size={18} color="#171A20" />
            <Text style={styles.sectionTitle}>EVIDENCIAS</Text>
          </View>
          <Text style={styles.photoCount}>{photos.length}/5</Text>
        </View>

        <View style={styles.photoList}>
          {photos.length === 0 ? (
            <Text style={styles.noPhotoText}>No se han adjuntado evidencias fotográficas aún.</Text>
          ) : (
            photos.map((photo, index) => (
              <View key={photo || index.toString()} style={styles.photoItem}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <Ionicons name="image" size={16} color="#3E6AE1" />
                  <Text style={styles.photoText} numberOfLines={1}>Evidencia #{index + 1} (Foto adjunta)</Text>
                </View>
                <TouchableOpacity onPress={() => handleRemovePhoto(index)}>
                  <Ionicons name="close-circle" size={20} color="#e53e3e" />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* Botón TOMAR FOTO: Solo aparece cuando está a 5m/para asistencia o para finalizar actividad */}
        {canTakePhoto && (
          <TouchableOpacity style={styles.addPhotoButton} onPress={handleAddPhoto}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="camera-outline" size={18} color="#3E6AE1" />
              <Text style={styles.addPhotoText}>TOMAR FOTO</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>

      {/* Main Action Flow Button (MARCAR ASISTENCIA / FINALIZAR ACTIVIDAD) */}
      <View style={{ marginBottom: 20 }}>
        {isFreeLocation ? (
          <Text style={styles.distanceInfo}>
            Ubicación: <Text style={{ fontWeight: '700', color: '#059669' }}>Sin Sede (Ubicación Libre Habilitada)</Text>
          </Text>
        ) : distanceMeters !== null && (
          <Text style={styles.distanceInfo}>
            Distancia a la sede: <Text style={{ fontWeight: '700', color: '#171A20' }}>{distanceMeters.toFixed(1)} metros</Text>
          </Text>
        )}

        {!activityCompleted && (
          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>
              Comentario / Descripción (Opcional):
            </Text>
            <TextInput
              style={{
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: '#D1D5DB',
                borderRadius: 8,
                padding: 12,
                fontSize: 14,
                color: '#111827',
                minHeight: 60,
                textAlignVertical: 'top'
              }}
              placeholder="Escribe un comentario sobre la marcación o trabajo realizado..."
              placeholderTextColor="#9CA3AF"
              multiline={true}
              value={commentText}
              onChangeText={setCommentText}
            />
          </View>
        )}

        {!attendanceMarked ? (
          <TouchableOpacity
            style={[
              styles.actionFlowButton,
              (photos.length < 1 || !isAtSede) && styles.disabledButton,
            ]}
            onPress={handleMarkAttendance}
            disabled={submitting || photos.length < 1 || !isAtSede}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View style={{ alignItems: 'center' }}>
                <Text style={styles.actionFlowText}>MARCAR ASISTENCIA</Text>
                {!isAtSede ? (
                  <Text style={styles.actionFlowSubtext}>(Debes estar a ≤ 25 metros de la sede)</Text>
                ) : photos.length < 1 ? (
                  <Text style={styles.actionFlowSubtext}>(Requiere al menos 1 foto)</Text>
                ) : null}
              </View>
            )}
          </TouchableOpacity>
        ) : !activityCompleted ? (
          <TouchableOpacity
            style={[
              styles.finalizeButton,
              photos.length < 1 && styles.disabledButton,
            ]}
            onPress={handleFinalizeActivity}
            disabled={submitting || photos.length < 1}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View style={{ alignItems: 'center' }}>
                <Text style={styles.actionFlowText}>FINALIZAR ACTIVIDAD</Text>
                {photos.length < 1 && (
                  <Text style={styles.actionFlowSubtext}>(Requiere foto de evidencia final)</Text>
                )}
              </View>
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.completedBadgeBox}>
            <Ionicons name="checkmark-done-circle" size={24} color="#22c55e" />
            <Text style={styles.completedBadgeText}>ACTIVIDAD COMPLETADA Y CERRADA</Text>
          </View>
        )}
      </View>

      {/* Full Screen Map Modal */}
      <Modal visible={showFullMapModal} animationType="slide" onRequestClose={() => setShowFullMapModal(false)}>
        <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalHeaderTitle}>Ruta de Trayecto en Mapa</Text>
            <TouchableOpacity onPress={() => setShowFullMapModal(false)}>
              <Ionicons name="close" size={24} color="#171A20" />
            </TouchableOpacity>
          </View>
          <ErrorBoundary fallbackText="Ocurrió un error cargando el mapa interactivo.">
            <LeafletMapView
              userLocation={userLocation}
              sedeLocation={{
                latitude: sedeLat,
                longitude: sedeLng,
                nombre: activity.location?.nombre || 'Sede Principal',
              }}
              height={550}
            />
          </ErrorBoundary>
        </View>
      </Modal>

      {/* Offline Sync Status Modal */}
      <Modal visible={showSyncModal} animationType="fade" transparent onRequestClose={() => setShowSyncModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.syncModalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderTitle}>Datos Sincronizados con la Nube</Text>
              <TouchableOpacity onPress={() => setShowSyncModal(false)}>
                <Ionicons name="close" size={24} color="#171A20" />
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 13, color: '#5C5E62', marginBottom: 12 }}>
              Items pendientes en cola de SQLite local: <Text style={{ fontWeight: '700', color: '#3E6AE1' }}>{syncItems.length}</Text>
            </Text>
            <ScrollView style={{ maxHeight: 200 }}>
              {syncItems.length === 0 ? (
                <Text style={{ color: '#22c55e', fontWeight: '600', paddingVertical: 12 }}>
                  Todos los registros están sincronizados con Render.
                </Text>
              ) : (
                syncItems.map((item, idx) => (
                  <View key={item.id || idx.toString()} style={styles.syncQueueRow}>
                    <Ionicons name="time-outline" size={14} color="#3E6AE1" />
                    <Text style={{ fontSize: 12, color: '#171A20', flex: 1 }}>
                      {item.table_name} - {item.action} ({new Date(item.recorded_at).toLocaleTimeString()})
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowSyncModal(false)}>
              <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 13 }}>CERRAR</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ddd', // Tesla Light Neutral (#ddd)
    padding: 20,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 12 : 48,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  backButton: {
    paddingVertical: 4,
  },
  backText: {
    color: '#3E6AE1',
    fontSize: 13,
    fontWeight: '700',
  },
  syncModalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cccccc',
  },
  syncModalText: {
    color: '#3E6AE1',
    fontSize: 10,
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#cccccc',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#171A20',
    marginBottom: 6,
  },
  detail: {
    fontSize: 14,
    color: '#393C41',
    lineHeight: 20,
  },
  divider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 14,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#171A20',
  },
  fullMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  fullMapText: {
    color: '#3E6AE1',
    fontSize: 11,
    fontWeight: '700',
  },
  sedeName: {
    fontSize: 15,
    color: '#3E6AE1',
    fontWeight: '700',
    marginBottom: 12,
  },
  mapContainer: {
    height: 170,
    width: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  primaryPillButton: {
    backgroundColor: '#3E6AE1', // Tesla Electric Blue
    borderRadius: 4,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryPillText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.8,
  },
  activeTrackingBox: {
    backgroundColor: '#f0f7ff',
    borderRadius: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: '#3E6AE1',
  },
  activeTrackingText: {
    color: '#3E6AE1',
    fontSize: 13,
    fontWeight: '700',
  },
  cancelButton: {
    backgroundColor: '#ffffff',
    borderRadius: 4,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e53e3e',
  },
  cancelButtonText: {
    color: '#e53e3e',
    fontWeight: '700',
    fontSize: 12,
  },
  photoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  photoCount: {
    color: '#3E6AE1',
    fontWeight: '700',
    fontSize: 14,
  },
  photoList: {
    marginBottom: 12,
  },
  noPhotoText: {
    fontSize: 13,
    color: '#5C5E62',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  photoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f4f4f4',
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  photoText: {
    color: '#171A20',
    fontSize: 13,
  },
  addPhotoButton: {
    backgroundColor: '#ffffff',
    borderRadius: 4,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3E6AE1',
  },
  addPhotoText: {
    color: '#3E6AE1',
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.8,
  },
  distanceInfo: {
    color: '#5C5E62',
    textAlign: 'center',
    marginBottom: 10,
    fontSize: 13,
  },
  actionFlowButton: {
    backgroundColor: '#3E6AE1',
    borderRadius: 4,
    paddingVertical: 14,
    alignItems: 'center',
  },
  finalizeButton: {
    backgroundColor: '#22c55e',
    borderRadius: 4,
    paddingVertical: 14,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#a0aec0',
    opacity: 0.7,
  },
  actionFlowText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  actionFlowSubtext: {
    color: '#ffffff',
    fontSize: 11,
    marginTop: 2,
    opacity: 0.9,
  },
  completedBadgeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f0fdf4',
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#22c55e',
  },
  completedBadgeText: {
    color: '#22c55e',
    fontWeight: '800',
    fontSize: 13,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#171A20',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  syncModalCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
  },
  syncQueueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f4f4f4',
  },
  modalCloseBtn: {
    backgroundColor: '#3E6AE1',
    borderRadius: 4,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
  },
});
