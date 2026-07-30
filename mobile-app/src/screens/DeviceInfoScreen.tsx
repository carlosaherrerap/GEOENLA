import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  StatusBar,
} from 'react-native';
import Constants from 'expo-constants';
import NetInfo from '@react-native-community/netinfo';
import * as Battery from 'expo-battery';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '../services/api';
import { offlineStorage } from '../services/storage';

export const getRealDeviceDetails = () => {
  let manufacturer = 'Samsung';
  let model = 'Galaxy A05s';

  if (Platform.OS === 'android') {
    manufacturer = 'Samsung';
    model = Constants.deviceName || (Constants.platform as any)?.android?.model || 'Galaxy A05s';
  } else if (Platform.OS === 'ios') {
    manufacturer = 'Apple';
    model = Constants.deviceName || 'iPhone';
  } else {
    manufacturer = 'Navegador';
    model = 'Web PC';
  }

  return {
    manufacturer,
    model,
    os: Platform.OS === 'android' ? 'Android' : Platform.OS === 'ios' ? 'iOS' : 'Web',
    os_version: String(Platform.Version || '14'),
    battery_level: 95,
    battery_state: 'Cargando / Conectado',
    app_version: Constants.expoConfig?.version || '1.0.0',
  };
};

interface Props {
  onBack: () => void;
}

export const DeviceInfoScreen: React.FC<Props> = ({ onBack }) => {
  const [syncing, setSyncing] = useState(false);
  const [deviceData, setDeviceData] = useState(getRealDeviceDetails());
  const [netSignal, setNetSignal] = useState<string>('Detectando...');

  useEffect(() => {
    const fetchRealData = async () => {
      const base = getRealDeviceDetails();
      try {
        const level = await Battery.getBatteryLevelAsync();
        const state = await Battery.getBatteryStateAsync();

        let batteryStateStr = 'Desconectado / En batería';
        if (state === Battery.BatteryState.CHARGING) batteryStateStr = 'Cargando';
        else if (state === Battery.BatteryState.FULL) batteryStateStr = 'Carga Completa (100%)';

        const updated = {
          ...base,
          battery_level: level > 0 ? Math.round(level * 100) : 95,
          battery_state: batteryStateStr,
        };
        setDeviceData(updated);
        apiService.updateDeviceInfo(updated).catch(() => {});
      } catch (err) {
        console.warn('[DeviceInfo] Battery API fallback:', err);
      }
    };

    fetchRealData();

    // Detectar señal de internet en tiempo real
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        const typeName = state.type ? state.type.toUpperCase() : 'INTERNET';
        setNetSignal(`Conectado (${typeName})`);
      } else {
        setNetSignal('Sin Conexión (Offline)');
      }
    });

    return () => unsubscribe();
  }, []);

  const pendingCount = offlineStorage.getPendingCount();

  const handleUpdateDevice = async () => {
    try {
      await apiService.updateDeviceInfo(deviceData);
      Alert.alert('Éxito', 'Estado del dispositivo transmitido al servidor.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo reportar el dispositivo.');
    }
  };

  const handleManualSync = async () => {
    const queue = offlineStorage.getPendingSyncQueue();
    if (queue.length === 0) {
      Alert.alert('Sincronización', 'No hay elementos pendientes por sincronizar.');
      return;
    }

    setSyncing(true);
    try {
      await apiService.syncBulk(queue);
      offlineStorage.clearSyncedQueue(queue.length);
      Alert.alert('¡Sincronizado!', `${queue.length} registros sincronizados con la nube.`);
    } catch (err: any) {
      Alert.alert('Error de sincronización', err.message || 'Error al conectar con la base de datos.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={onBack}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="arrow-back" size={16} color="#3E6AE1" />
          <Text style={styles.backText}>Volver a Actividades</Text>
        </View>
      </TouchableOpacity>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <Ionicons name="hardware-chip" size={26} color="#171A20" />
        <Text style={styles.headerTitle}>Detalles del Dispositivo</Text>
      </View>
      <Text style={styles.headerSubtitle}>
        Estado técnico e información de conectividad y sincronización
      </Text>

      {/* Device Stats Card */}
      <View style={styles.card}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Marca / Modelo</Text>
          <Text style={styles.infoValue}>
            {deviceData.manufacturer} {deviceData.model}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Sistema Operativo</Text>
          <Text style={styles.infoValue}>
            {deviceData.os} {deviceData.os_version}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Nivel de Batería</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="battery-charging" size={18} color="#22c55e" />
            <Text style={[styles.infoValue, { color: '#22c55e' }]}>
              {deviceData.battery_level}% ({deviceData.battery_state})
            </Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Señal de Internet</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons
              name={netSignal.includes('Conectado') ? 'wifi' : 'wifi-outline'}
              size={16}
              color={netSignal.includes('Conectado') ? '#3E6AE1' : '#e53e3e'}
            />
            <Text style={[styles.infoValue, { color: netSignal.includes('Conectado') ? '#3E6AE1' : '#e53e3e' }]}>
              {netSignal}
            </Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Versión de App</Text>
          <Text style={styles.infoValue}>v{deviceData.app_version}</Text>
        </View>

        <TouchableOpacity style={styles.actionButton} onPress={handleUpdateDevice}>
          <Text style={styles.actionButtonText}>Actualizar Info en Backend</Text>
        </TouchableOpacity>
      </View>

      {/* Offline Sync Card */}
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Ionicons name="sync" size={20} color="#171A20" />
          <Text style={styles.cardTitle}>Sincronización Offline (SQLite)</Text>
        </View>
        <Text style={styles.cardDescription}>
          Si te quedas sin cobertura, los registros se guardan en la base de datos local
          SQLite y se sincronizan al recuperar señal.
        </Text>

        <View style={styles.syncBox}>
          <Text style={styles.syncLabel}>Registros pendientes de sync:</Text>
          <Text style={styles.syncCount}>{pendingCount}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Última sincronización</Text>
          <Text style={styles.infoValue}>
            {offlineStorage.getLastSyncedAt()
              ? new Date(offlineStorage.getLastSyncedAt()!).toLocaleTimeString()
              : 'Reciente'}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.syncButton, pendingCount === 0 && styles.disabledButton]}
          onPress={handleManualSync}
          disabled={syncing}
        >
          {syncing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.syncButtonText}>Forzar Sincronización Ahora</Text>
          )}
        </TouchableOpacity>
      </View>
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
  backButton: {
    marginBottom: 16,
  },
  backText: {
    color: '#3E6AE1',
    fontSize: 13,
    fontWeight: '700',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#171A20',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#393C41',
    marginBottom: 20,
    marginTop: 2,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#cccccc',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#171A20',
  },
  cardDescription: {
    fontSize: 13,
    color: '#393C41',
    lineHeight: 18,
    marginBottom: 14,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  infoLabel: {
    fontSize: 13,
    color: '#5C5E62',
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#171A20',
  },
  actionButton: {
    backgroundColor: '#ffffff',
    borderRadius: 4,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#3E6AE1',
  },
  actionButtonText: {
    color: '#3E6AE1',
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.8,
  },
  syncBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f4f4f4',
    borderRadius: 8,
    padding: 14,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  syncLabel: {
    fontSize: 13,
    color: '#171A20',
    fontWeight: '600',
  },
  syncCount: {
    fontSize: 22,
    fontWeight: '800',
    color: '#3E6AE1',
  },
  syncButton: {
    backgroundColor: '#3E6AE1',
    borderRadius: 4,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 14,
  },
  disabledButton: {
    backgroundColor: '#a0aec0',
    opacity: 0.7,
  },
  syncButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
});
