import AsyncStorage from '@react-native-async-storage/async-storage';

export interface TrackingPoint {
  id?: string;
  id_activity?: string | null;
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number;
  battery_level?: number;
  recorded_at: string;
}

export interface SyncItem {
  id: string;
  action: string;
  table_name: string;
  payload: any;
  recorded_at: string;
}

const STORAGE_KEYS = {
  TRACKING_QUEUE: '@enlageo_tracking_queue',
  SYNC_QUEUE: '@enlageo_sync_queue',
  ACTIVITIES_CACHE: '@enlageo_activities_cache',
  SWITCH_STATE: '@enlageo_switch_state',
  CONSENT_ACCEPTED: '@enlageo_consent_accepted',
};

class OfflineStorageService {
  private trackingQueue: TrackingPoint[] = [];
  private syncQueue: SyncItem[] = [];
  private activitiesCache: any[] = [];
  private lastSyncedAt: string | null = null;
  private isLoaded = false;

  constructor() {
    this.loadFromStorage();
  }

  public async loadFromStorage(): Promise<void> {
    try {
      const [tQueue, sQueue, aCache] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.TRACKING_QUEUE),
        AsyncStorage.getItem(STORAGE_KEYS.SYNC_QUEUE),
        AsyncStorage.getItem(STORAGE_KEYS.ACTIVITIES_CACHE),
      ]);

      if (tQueue) this.trackingQueue = JSON.parse(tQueue);
      if (sQueue) this.syncQueue = JSON.parse(sQueue);
      if (aCache) this.activitiesCache = JSON.parse(aCache);
      this.isLoaded = true;
      console.log(`[OfflineStorage] Cargas iniciales: ${this.trackingQueue.length} puntos de rastreo guardados localmente.`);
    } catch (err) {
      console.error('[OfflineStorage] Error al cargar almacenamiento local:', err);
    }
  }

  private async persistTrackingQueue(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.TRACKING_QUEUE, JSON.stringify(this.trackingQueue));
    } catch (err) {
      console.error('[OfflineStorage] Error al guardar trackingQueue:', err);
    }
  }

  private async persistSyncQueue(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify(this.syncQueue));
    } catch (err) {
      console.error('[OfflineStorage] Error al guardar syncQueue:', err);
    }
  }

  public async saveActivitiesCache(activities: any[]): Promise<void> {
    if (Array.isArray(activities) && activities.length > 0) {
      this.activitiesCache = activities;
      try {
        await AsyncStorage.setItem(STORAGE_KEYS.ACTIVITIES_CACHE, JSON.stringify(activities));
      } catch (err) {
        console.error('[OfflineStorage] Error al guardar caché de actividades:', err);
      }
    }
  }

  public getActivitiesCache(): any[] {
    return this.activitiesCache;
  }

  public async addTrackingPoint(point: TrackingPoint): Promise<void> {
    this.trackingQueue.push(point);
    // Ordenar siempre cronológicamente por recorded_at ASC
    this.trackingQueue.sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
    await this.persistTrackingQueue();
  }

  public getPendingTrackingPoints(): TrackingPoint[] {
    return [...this.trackingQueue];
  }

  public async clearSyncedTracking(count: number): Promise<void> {
    this.trackingQueue.splice(0, count);
    await this.persistTrackingQueue();
    this.lastSyncedAt = new Date().toISOString();
  }

  public async getSwitchState(): Promise<boolean> {
    try {
      const val = await AsyncStorage.getItem(STORAGE_KEYS.SWITCH_STATE);
      return val === 'true';
    } catch {
      return false;
    }
  }

  public async setSwitchState(state: boolean): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.SWITCH_STATE, state ? 'true' : 'false');
    } catch (err) {
      console.error('[OfflineStorage] Error guardando switch state:', err);
    }
  }

  public async addSyncQueueItem(item: SyncItem): Promise<void> {
    this.syncQueue.push(item);
    await this.persistSyncQueue();
  }

  public getPendingSyncQueue(): SyncItem[] {
    return [...this.syncQueue];
  }

  public getPendingCount(): number {
    return this.syncQueue.length + this.trackingQueue.length;
  }

  public async clearSyncedQueue(count?: number): Promise<void> {
    if (typeof count === 'number') {
      this.syncQueue.splice(0, count);
    } else {
      this.syncQueue = [];
    }
    await this.persistSyncQueue();
    this.lastSyncedAt = new Date().toISOString();
  }

  public getLastSyncedAt(): string | null {
    return this.lastSyncedAt;
  }

  public async getConsentAccepted(): Promise<boolean> {
    try {
      const val = await AsyncStorage.getItem(STORAGE_KEYS.CONSENT_ACCEPTED);
      return val === 'true';
    } catch {
      return false;
    }
  }

  public async setConsentAccepted(accepted: boolean): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.CONSENT_ACCEPTED, accepted ? 'true' : 'false');
    } catch (err) {
      console.error('[OfflineStorage] Error guardando consent state:', err);
    }
  }
}

export const offlineStorage = new OfflineStorageService();
