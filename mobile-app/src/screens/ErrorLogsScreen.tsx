import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, StatusBar, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { offlineStorage } from '../services/storage';

interface Props {
  onBack: () => void;
}

export const ErrorLogsScreen: React.FC<Props> = ({ onBack }) => {
  const [logs, setLogs] = useState<any[]>([]);
  const [filterCategory, setFilterCategory] = useState<'todos' | 'red' | 'sync' | 'sistema'>('todos');

  const loadLogs = () => {
    const queue = offlineStorage.getPendingSyncQueue() || [];
    setLogs(queue);
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const clearAllLogs = () => {
    offlineStorage.clearSyncedQueue();
    loadLogs();
  };

  const getFilteredLogs = () => {
    if (filterCategory === 'todos') return logs;
    return logs.filter((item) => {
      if (filterCategory === 'sync') return item.table_name === 'sync_queues';
      if (filterCategory === 'sistema') return item.table_name === 'system_errors';
      if (filterCategory === 'red') return item.table_name === 'network_logs';
      return true;
    });
  };

  function formatPayloadSafe(payload: any) {
    if (!payload) return '{}';
    try {
      const copy = JSON.parse(JSON.stringify(payload));
      if (copy.photos && Array.isArray(copy.photos)) {
        copy.photos = copy.photos.map((p: string, i: number) =>
          typeof p === 'string' && p.length > 100
            ? `[Foto Evidencia #${i + 1} (${(p.length / 1024).toFixed(1)} KB)]`
            : p
        );
      }
      const str = JSON.stringify(copy, null, 2);
      return str.length > 3000 ? str.substring(0, 3000) + '\n... [Recortado para agilizar vista]' : str;
    } catch (_e) {
      return String(payload).substring(0, 500);
    }
  }

  const filteredLogs = getFilteredLogs().slice(0, 50);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Ionicons name="arrow-back" size={20} color="#3E6AE1" />
          <Text style={styles.backText}>Volver</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Registro de Errores y Logs</Text>
        <TouchableOpacity onPress={clearAllLogs}>
          <Text style={styles.clearText}>Limpiar</Text>
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View style={styles.tabsRow}>
        {(['todos', 'red', 'sync', 'sistema'] as const).map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[styles.tab, filterCategory === cat && styles.tabActive]}
            onPress={() => setFilterCategory(cat)}
          >
            <Text style={[styles.tabText, filterCategory === cat && styles.tabTextActive]}>
              {cat.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Log List */}
      <ScrollView style={styles.listContainer} contentContainerStyle={{ paddingBottom: 40 }}>
        {filteredLogs.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="checkmark-circle-outline" size={44} color="#22c55e" />
            <Text style={styles.emptyTitle}>Sin Errores ni Logs Pendientes</Text>
            <Text style={styles.emptySubtitle}>
              Todos los módulos del sistema y sincronización están operando correctamente.
            </Text>
          </View>
        ) : (
          filteredLogs.map((item, index) => (
            <View key={item.id || index.toString()} style={styles.logCard}>
              <View style={styles.logHeader}>
                <View style={styles.categoryBadge}>
                  <Ionicons
                    name={
                      item.table_name === 'system_errors'
                        ? 'warning'
                        : item.table_name === 'network_logs'
                        ? 'wifi'
                        : 'sync'
                    }
                    size={12}
                    color="#3E6AE1"
                  />
                  <Text style={styles.categoryText}>{item.table_name || 'LOG'}</Text>
                </View>
                <Text style={styles.dateText}>
                  {item.recorded_at ? new Date(item.recorded_at).toLocaleTimeString() : 'Reciente'}
                </Text>
              </View>

              <Text style={styles.actionTitle}>Acción: {item.action}</Text>
              <Text style={styles.payloadText}>{formatPayloadSafe(item.payload)}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F5F7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 54 : (StatusBar.currentHeight || 24) + 12,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backText: {
    color: '#3E6AE1',
    fontWeight: '700',
    fontSize: 13,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#171A20',
  },
  clearText: {
    color: '#E03C32',
    fontWeight: '700',
    fontSize: 13,
  },
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tab: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F4F5F7',
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#3E6AE1',
  },
  tabText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5C5E62',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  listContainer: {
    padding: 16,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 40,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#171A20',
    marginTop: 10,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#5C5E62',
    textAlign: 'center',
    marginTop: 4,
  },
  logCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#3E6AE1',
  },
  dateText: {
    fontSize: 11,
    color: '#5C5E62',
  },
  actionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#171A20',
    marginBottom: 4,
  },
  payloadText: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#5C5E62',
    backgroundColor: '#F9FAFB',
    padding: 6,
    borderRadius: 6,
  },
});
