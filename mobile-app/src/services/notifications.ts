import * as Notifications from 'expo-notifications';
import { Audio } from 'expo-av';
import { Platform, Vibration } from 'react-native';

// Configure notification behavior when app is in foreground and background
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch (_err) {
  console.warn('[Notifications] Error initializing handler:', _err);
}

let isAudioSetup = false;

async function setupAudio() {
  if (isAudioSetup) return;
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
    });
    isAudioSetup = true;
  } catch (err) {
    console.warn('[AudioService] Error setting up audio mode:', err);
  }
}

/**
  * Trigger 20m proximity alert:
  * 1. Plays sound with expo-av Audio
  * 2. Triggers system vibration
  * 3. Triggers local push notification visible inside & outside the app
  */
export async function triggerProximityAlert(sedeNombre: string, distanceMeters: number) {
  await setupAudio();

  // 1. Vibration
  try {
    Vibration.vibrate([0, 500, 200, 500, 200, 800]);
  } catch (_e) {}

  // 2. Audio Alert Tone using expo-av
  try {
    const { sound } = await Audio.Sound.createAsync(
      // Standard notification alert sound fallback
      { uri: 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg' },
      { shouldPlay: true, volume: 1.0 }
    );
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        sound.unloadAsync().catch(() => {});
      }
    });
  } catch (err) {
    console.warn('[AudioService] Sound play warning:', err);
  }

  // 3. System Notification (visible in notification tray outside app)
  try {
    const permissions = await Notifications.getPermissionsAsync();
    if (permissions.status !== 'granted') {
      await Notifications.requestPermissionsAsync();
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: '¡Llegaste a la Sede! (GeoApp ENLA)',
        body: `Te encuentras a ${distanceMeters.toFixed(1)} metros de "${sedeNombre}". Ya puedes registrar tu asistencia y evidencia.`,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        data: { sedeNombre, distanceMeters },
      },
      trigger: null, // trigger immediately
    });
  } catch (err) {
    console.warn('[NotificationService] System notification error:', err);
  }
}
