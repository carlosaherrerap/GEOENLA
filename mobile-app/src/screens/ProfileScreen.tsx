import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '../services/api';

interface Props {
  onLogout: () => void;
  onOpenDevice: () => void;
}

export const ProfileScreen: React.FC<Props> = ({ onLogout, onOpenDevice }) => {
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await apiService.getMe();
        setUserProfile(response.user || null);
      } catch (err) {
        console.warn('[ProfileScreen] Error cargando perfil:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatarCircle}>
          <Ionicons name="person" size={40} color="#3E6AE1" />
        </View>
        <Text style={styles.userName}>{userProfile?.username || 'Usuario de Campo'}</Text>
        <Text style={styles.userEmail}>{userProfile?.correo || 'usuario@geoapp.com'}</Text>

        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{userProfile?.rol || 'TRABAJADOR DE CAMPO'}</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#3E6AE1" style={{ marginTop: 40 }} />
      ) : (
        <View style={styles.content}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Información Personal</Text>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Nombre de Usuario</Text>
              <Text style={styles.infoValue}>{userProfile?.username || 'jperez'}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Correo Electrónico</Text>
              <Text style={styles.infoValue}>{userProfile?.correo || 'jperez@geoapp.com'}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Estado de Cuenta</Text>
              <View style={styles.statusBadge}>
                <Ionicons name="checkmark-circle" size={14} color="#22c55e" />
                <Text style={styles.statusText}>{userProfile?.estado || 'Activo'}</Text>
              </View>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Supervisor Asignado</Text>
              <Text style={styles.infoValue}>
                {userProfile?.supervisor
                  ? `${userProfile.supervisor.nombres} ${userProfile.supervisor.ape_pat}`
                  : 'Supervisor General'}
              </Text>
            </View>
          </View>

          {/* Quick Actions */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Ajustes y Dispositivo</Text>

            <TouchableOpacity style={styles.actionRow} onPress={onOpenDevice}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="hardware-chip-outline" size={20} color="#3E6AE1" />
                <Text style={styles.actionLabel}>Detalles del Dispositivo</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#5C5E62" />
            </TouchableOpacity>

            <TouchableOpacity style={[styles.actionRow, { borderBottomWidth: 0 }]} onPress={onLogout}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="log-out-outline" size={20} color="#e53e3e" />
                <Text style={[styles.actionLabel, { color: '#e53e3e' }]}>Cerrar Sesión</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#e53e3e" />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ddd',
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 12 : 48,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
    backgroundColor: '#ffffff',
    marginHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#cccccc',
    marginBottom: 16,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f0f7ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#3E6AE1',
  },
  userName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#171A20',
  },
  userEmail: {
    fontSize: 13,
    color: '#5C5E62',
    marginTop: 2,
  },
  roleBadge: {
    marginTop: 10,
    backgroundColor: '#f0f7ff',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3E6AE1',
  },
  roleText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3E6AE1',
    textTransform: 'uppercase',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 60,
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
    marginBottom: 14,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f4f4f4',
  },
  infoLabel: {
    fontSize: 13,
    color: '#5C5E62',
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#171A20',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#22c55e',
    textTransform: 'capitalize',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f4f4f4',
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#171A20',
  },
});
