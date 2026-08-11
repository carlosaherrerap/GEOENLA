import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { apiService } from '../services/api';
import { locationTracking } from '../services/location';
import { getRealDeviceDetails } from './DeviceInfoScreen';

interface Props {
  onLoginSuccess: (user: any) => void;
}

export const LoginScreen: React.FC<Props> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [clave, setClave] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !clave) {
      Alert.alert('Error', 'Por favor ingresa tu usuario y contraseña.');
      return;
    }

    setLoading(true);
    try {
      const response = await apiService.login(username.trim(), clave);

      if (response.user?.rol === 'admin') {
        Alert.alert('Acceso denegado', 'La aplicación móvil es exclusiva para usuarios de campo.');
        return;
      }

      locationTracking.setUserEmail(response.user?.correo || `${username.trim()}@enlageo.com`);
      locationTracking.startTracking();

      try {
        const devicePayload = getRealDeviceDetails();
        await apiService.updateDeviceInfo(devicePayload);
      } catch (devErr) {
        console.warn('[Login] No se pudo enviar estado del dispositivo:', devErr);
      }

      onLoginSuccess(response.user);
    } catch (err: any) {
      Alert.alert('Error de inicio de sesión', err.message || 'Credenciales incorrectas');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          {/* Header con Isotipo ENLA Oficial */}
          <View style={styles.header}>
            <View style={styles.logoBadge}>
              <Image
                source={require('../../assets/iconENLA.png')}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.title}>
              Geo
              <Text style={styles.colorE}>E</Text>
              <Text style={styles.colorN}>N</Text>
              <Text style={styles.colorL}>L</Text>
              <Text style={styles.colorA}>A</Text>
            </Text>
            <Text style={styles.subtitle}>Supervisores y Monitoreo de Campo</Text>
          </View>

          {/* Formulario de Entrada */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>USUARIO</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder="Ingresa tu usuario asignado"
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>CONTRASEÑA</Text>
            <TextInput
              style={styles.input}
              value={clave}
              onChangeText={setClave}
              placeholder="Ingresa tu contraseña"
              placeholderTextColor="#94a3b8"
              secureTextEntry
            />
          </View>

          {/* Botón de Acción */}
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.buttonText}>INICIAR SESIÓN</Text>
            )}
          </TouchableOpacity>

          {/* Pie Institucional */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Instituto Nacional de Estadística e Informática (INEI)
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 30,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 32,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoBadge: {
    width: 90,
    height: 90,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  logo: {
    width: 82,
    height: 82,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  colorE: {
    color: '#0F5698', // Azul ENLA
  },
  colorN: {
    color: '#EE8800', // Naranja ENLA
  },
  colorL: {
    color: '#8E267B', // Púrpura ENLA
  },
  colorA: {
    color: '#E93C6A', // Rosa ENLA
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 4,
    letterSpacing: 0.3,
  },
  formGroup: {
    marginBottom: 18,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
    letterSpacing: 0.8,
  },
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingHorizontal: 16,
    height: 50,
    color: '#0f172a',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  button: {
    backgroundColor: '#0F5698',
    borderRadius: 10,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  footer: {
    marginTop: 28,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 16,
  },
  footerText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#94a3b8',
    textAlign: 'center',
  },
});
