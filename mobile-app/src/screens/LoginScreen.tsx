import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
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
      locationTracking.setUserEmail(response.user?.correo || `${username.trim()}@enlageo.com`);
      locationTracking.startTracking();

      // Transmitir detalles reales del dispositivo activo al servidor automáticamente al iniciar sesión
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
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>
          Geo<Text style={styles.accent}>App</Text>
        </Text>
        <Text style={styles.subtitle}>Trabajadores de Campo</Text>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Usuario</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="Ingresa tu usuario"
            placeholderTextColor="#666688"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Contraseña</Text>
          <TextInput
            style={styles.input}
            value={clave}
            onChangeText={setClave}
            placeholder="••••••••"
            placeholderTextColor="#666688"
            secureTextEntry
          />
        </View>

        <TouchableOpacity
          style={styles.button}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Iniciar Sesión</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ddd', // Tesla Neutral Gray (#ddd)
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#ffffff', // Tesla White Card Surface
    borderRadius: 16,
    padding: 28,
    borderWidth: 1,
    borderColor: '#cccccc',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#171A20', // Tesla Carbon Dark
    textAlign: 'center',
  },
  accent: {
    color: '#3E6AE1', // Tesla Electric Blue
  },
  subtitle: {
    fontSize: 14,
    color: '#393C41',
    textAlign: 'center',
    marginBottom: 28,
    marginTop: 4,
    fontWeight: '500',
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#171A20',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    paddingHorizontal: 16,
    height: 48,
    color: '#171A20',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#cccccc',
  },
  button: {
    backgroundColor: '#3E6AE1', // Tesla Electric Blue CTA
    borderRadius: 4,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
});
