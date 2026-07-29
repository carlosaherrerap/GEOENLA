import { API_BASE_URL } from '../config';
import { offlineStorage, TrackingPoint } from './storage';

let authToken: string | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
};

export const getAuthToken = () => authToken;

async function request(endpoint: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Bypass-Tunnel-Reminder': 'true',
    ...(options.headers as Record<string, string>),
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const url = `${API_BASE_URL}${endpoint}`;
  console.log(`[API] ${options.method || 'GET'} ${url}`);

  let response: Response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (networkErr: any) {
    console.error('[API] Network error:', networkErr.message);
    throw new Error('No se pudo conectar al servidor. Verifica tu conexión a internet.');
  }

  const text = await response.text();

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    console.error('[API] Respuesta no-JSON recibida:', text.substring(0, 200));
    throw new Error('El servidor devolvió una respuesta inesperada. Puede ser un problema del túnel de red.');
  }

  if (!response.ok) {
    throw new Error(data.message || 'Error en la petición');
  }

  return data;
}

export const apiService = {
  async login(username: string, clave: string, deviceName = 'React Native App') {
    const data = await request('/login', {
      method: 'POST',
      body: JSON.stringify({ username, clave, device_name: deviceName }),
    });
    setAuthToken(data.token);
    return data;
  },

  async getMe() {
    return request('/me');
  },

  async logout() {
    try {
      await request('/logout', { method: 'POST' });
    } finally {
      setAuthToken(null);
    }
  },

  async getServerDate() {
    return request('/server-date');
  },

  async getRoutes() {
    return request('/routes');
  },

  async getActivities() {
    return request('/activities');
  },

  async getActivityDetail(id: string) {
    return request(`/activities/${id}`);
  },

  async checkIn(formData: FormData) {
    return request('/attendances/check-in', {
      method: 'POST',
      body: formData,
    });
  },

  async checkInJson(payload: {
    id_activity: string;
    id_location?: string;
    lat: number;
    lng: number;
    observacion?: string;
    photos: string[];
    is_final?: boolean;
  }) {
    return request('/attendances/check-in', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async sendTrackingPoint(point: TrackingPoint) {
    try {
      return await request('/trackings', {
        method: 'POST',
        body: JSON.stringify(point),
      });
    } catch (err) {
      // Si hay error de red, guardar localmente en la cola sin conexión
      offlineStorage.addTrackingPoint(point);
      return { offline: true };
    }
  },

  async sendTrackingBatch(points: TrackingPoint[]) {
    return request('/trackings/sync-batch', {
      method: 'POST',
      body: JSON.stringify({ points }),
    });
  },

  async syncBulk(operations: any[]) {
    return request('/sync', {
      method: 'POST',
      body: JSON.stringify({ operations }),
    });
  },

  async updateDeviceInfo(deviceInfo: {
    manufacturer: string;
    model: string;
    os: string;
    os_version: string;
    battery_level: number;
    battery_state: string;
    app_version: string;
  }) {
    return request('/device', {
      method: 'POST',
      body: JSON.stringify(deviceInfo),
    });
  },

  async getAllUsers() {
    return request('/users/all');
  },

  async getChats() {
    return request('/chats');
  },

  async createOrGetChat(id_user_target: string) {
    return request('/chats', {
      method: 'POST',
      body: JSON.stringify({ id_user_target }),
    });
  },

  async getChatMessages(chatId: string) {
    return request(`/chats/${chatId}/messages`);
  },

  async sendMessage(chatId: string, texto: string) {
    return request(`/chats/${chatId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ texto }),
    });
  },
};
