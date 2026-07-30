import { apiService } from './api';
import { offlineStorage, TrackingPoint } from './storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

const BACKGROUND_LOCATION_TASK = 'background-location-task';
const MIN_DISTANCE_DELTA_METERS = 3; // Mínimo 3 metros para capturar movimiento
const MAX_ACCURACY_THRESHOLD_METERS = 40; // Ampliado a 40 metros para evitar descarte de coordenadas urbanas
const DB_SAVE_INTERVAL_MS = 20000; // 20 segundos para guardar en base de datos

export interface LocationCoords {
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number;
}

/**
 * Cálculo de Haversine para distancia GPS instantánea en microsegundos.
 */
export function calculateDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

class LocationTrackingService {
  private currentActivityId: string | null = null;
  private userEmail: string = 'usuario@enlageo.com';
  private isTracking = false;
  private foregroundSubscription: any = null;
  private lastSavedPoint: { lat: number; lng: number; timestamp: number } | null = null;
  private lastDbSaveTimestamp: number = 0;

  public setUserEmail(email: string) {
    this.userEmail = email;
  }

  public setCurrentActivity(activityId: string | null) {
    this.currentActivityId = activityId;
  }

  public getCurrentActivityId(): string | null {
    return this.currentActivityId;
  }

  public isTrackingActive(): boolean {
    return this.isTracking;
  }

  public async startTracking() {
    if (this.isTracking) return;

    try {
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      if (foregroundStatus !== 'granted') return;

      const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();

      this.isTracking = true;
      await offlineStorage.setSwitchState(true);

      // Suscripción en primer plano para UI
      this.foregroundSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000,
          distanceInterval: 3,
        },
        (loc) => {
          this.processLocationUpdate(loc);
        }
      );

      // Tarea en segundo plano
      const hasStartedBackground = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (!hasStartedBackground && backgroundStatus === 'granted') {
        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 15000,
          distanceInterval: 5,
          foregroundService: {
            notificationTitle: 'GeoApp ENLA',
            notificationBody: 'Transmitiendo ubicación autorizada para INEI...',
            notificationColor: '#024ad8',
          },
        });
      }
    } catch (err) {
      console.error('[LocationTracking] Error iniciando rastreo:', err);
    }
  }

  public async stopTracking() {
    if (this.foregroundSubscription) {
      this.foregroundSubscription.remove();
      this.foregroundSubscription = null;
    }

    try {
      const hasStartedBackground = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (hasStartedBackground) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      }
    } catch (_err) {}

    this.isTracking = false;
    await offlineStorage.setSwitchState(false);
  }

  public async processLocationUpdate(locationObj: Location.LocationObject) {
    if (!this.isTracking) return;

    const { latitude, longitude, accuracy, speed } = locationObj.coords;
    const now = Date.now();

    // 1. Filtro Anti-Jitter: Descartar lecturas con mala precisión
    if (accuracy && accuracy > MAX_ACCURACY_THRESHOLD_METERS) {
      console.log(`[AntiJitter] Ignorando posición por mala precisión (${accuracy.toFixed(1)}m > ${MAX_ACCURACY_THRESHOLD_METERS}m)`);
      return;
    }

    // 2. Filtro Anti-Jitter Estático: Ignorar pequeñas oscilaciones (< 10 metros)
    if (this.lastSavedPoint) {
      const distFromLast = calculateDistanceMeters(latitude, longitude, this.lastSavedPoint.lat, this.lastSavedPoint.lng);
      const speedVal = speed || 0;
      if (distFromLast < MIN_DISTANCE_DELTA_METERS && speedVal < 0.5) {
        console.log(`[AntiJitter] Usuario en el mismo punto (desplazamiento: ${distFromLast.toFixed(1)}m). Ignorando ruido GPS.`);
        return;
      }
    }

    // 3. Control de intervalo de 2 minutos para guardar en base de datos
    if (now - this.lastDbSaveTimestamp < DB_SAVE_INTERVAL_MS && this.lastSavedPoint !== null) {
      return;
    }

    const point: TrackingPoint = {
      id_activity: this.currentActivityId,
      lat: Number(latitude.toFixed(7)),
      lng: Number(longitude.toFixed(7)),
      accuracy: accuracy ? Number(accuracy.toFixed(1)) : 5.0,
      speed: speed ? Number(speed.toFixed(1)) : 0.0,
      battery_level: 90,
      recorded_at: new Date(locationObj.timestamp).toISOString(),
    };

    this.lastSavedPoint = { lat: point.lat, lng: point.lng, timestamp: now };
    this.lastDbSaveTimestamp = now;

    // 4. Procesar primero los puntos offline pendientes de SQLite/AsyncStorage (orden cronológico)
    await this.flushOfflinePoints();

    // 5. Enviar punto actual al servidor o guardarlo en SQLite si no hay internet
    try {
      await apiService.sendTrackingPoint(point);
      // Enviar latido de presencia para mantener el estado ACTIVO en vivo
      apiService.updateDeviceInfo({ battery_level: point.battery_level ?? 90 }).catch(() => {});
      console.log('[Tracking] Punto enviado en vivo a la plataforma.');
    } catch (err) {
      console.log('[Tracking] Sin conexión a internet. Guardando punto en SQLite...');
      await offlineStorage.addTrackingPoint(point);
    }
  }

  private async flushOfflinePoints() {
    const pendingPoints = offlineStorage.getPendingTrackingPoints();
    if (pendingPoints.length === 0) return;

    console.log(`[SyncOffline] Sincronizando ${pendingPoints.length} puntos offline acumulados...`);
    try {
      await apiService.sendTrackingBatch(pendingPoints);
      await offlineStorage.clearSyncedTracking(pendingPoints.length);
      console.log('[SyncOffline] Puntos offline sincronizados con éxito.');
    } catch (err) {
      console.log('[SyncOffline] El servidor aún no es alcanzable. Se mantienen en SQLite.');
    }
  }
}

export const locationTracking = new LocationTrackingService();

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  try {
    if (error || !data) return;
    const { locations } = data as any;
    if (locations && locations.length > 0) {
      await locationTracking.processLocationUpdate(locations[0]);
    }
  } catch (err) {
    console.error('[BackgroundLocationTask] Error al procesar ubicación:', err);
  }
});
