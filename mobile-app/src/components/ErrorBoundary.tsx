import React, { Component, ErrorInfo, ReactNode } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { offlineStorage } from '../services/storage';

interface Props {
  children: ReactNode;
  fallbackText?: string;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message || 'Error del sistema' };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Error capturado:', error, errorInfo);
    try {
      offlineStorage.addSyncQueueItem({
        id: Date.now().toString(),
        action: 'ERROR_LOG',
        table_name: 'system_errors',
        payload: {
          error: error.message,
          stack: errorInfo.componentStack,
        },
        recorded_at: new Date().toISOString(),
      });
    } catch (_e) {}
  }

  private handleReset = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Ionicons name="warning-outline" size={40} color="#f59e0b" />
          <Text style={styles.title}>Error Recuperado</Text>
          <Text style={styles.subtitle}>
            {this.props.fallbackText || 'Ocurrió un inconveniente al cargar esta sección. El resto de la app sigue funcionando.'}
          </Text>
          <Text style={styles.errorDetail}>{this.state.errorMessage}</Text>

          <TouchableOpacity style={styles.button} onPress={this.handleReset} activeOpacity={0.85}>
            <Ionicons name="refresh-outline" size={16} color="#FFFFFF" />
            <Text style={styles.buttonText}>REINTENTAR CARGAR</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FCD34D',
    alignItems: 'center',
    marginVertical: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#92400E',
    marginTop: 8,
  },
  subtitle: {
    fontSize: 12,
    color: '#B45309',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  errorDetail: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#78350F',
    backgroundColor: '#FEF3C7',
    padding: 6,
    borderRadius: 6,
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#D97706',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
});
