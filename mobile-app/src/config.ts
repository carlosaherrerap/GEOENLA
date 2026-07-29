import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * CONFIGURACIÓN DE CONEXIÓN AL BACKEND:
 * 
 * Opción A (Recomendada para probar en cualquier celular en 4G/5G o redes distintas - Igual que en proyecto 'async'):
 *   Si desplegaste tu backend en la nube (Render, Railway, etc.) o usas un túnel público (localtunnel / ngrok / cloudflare):
 *   Asigna tu URL aquí o por variable de entorno EXPO_PUBLIC_API_URL.
 */
const PUBLIC_BACKEND_URL = 'https://geoapp-backend.onrender.com/api';

/**
 * Opción B (Para desarrollo en la misma red Wi-Fi):
 *   Si el celular está en la misma red Wi-Fi que tu PC, usa la IP de tu PC.
 *   Nota: Asegúrate de que el Firewall de Windows permita tráfico entrante en el puerto 8000.
 */
const LOCAL_DEV_IP = '192.168.3.7';

const getApiBaseUrl = (): string => {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  if (PUBLIC_BACKEND_URL) {
    return PUBLIC_BACKEND_URL;
  }

  // Si la app está ejecutándose en Navegador Web
  if (Platform.OS === 'web') {
    return 'http://localhost:8000/api';
  }

  // Intentar obtener la IP local de la máquina host desde Expo Metro
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants.manifest2 as any)?.extra?.expoGo?.debuggerHost ||
    (Constants as any).manifest?.debuggerHost;

  if (hostUri) {
    const hostIp = hostUri.split(':')[0];
    if (hostIp && /^\d+\.\d+\.\d+\.\d+$/.test(hostIp) && hostIp !== '127.0.0.1') {
      return `http://${hostIp}:8000/api`;
    }
  }

  // Fallback para celulares físicos en la misma red Wi-Fi
  return `http://${LOCAL_DEV_IP}:8000/api`;
};

export const API_BASE_URL = getApiBaseUrl();
export const DISTANCE_LIMIT_METERS = 5.0;
export const GPS_TRACKING_INTERVAL_MS = 60000; // 1 minute




