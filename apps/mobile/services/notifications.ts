import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { api } from './api';
import { useAuth } from '@/context/AuthContext';
import { setApiToken } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function getExpoProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId
  );
}

export async function registerForPushNotifications(authToken?: string | null) {
  try {
    if (Platform.OS === 'web') return;

    // Remote push is not supported in Expo Go (SDK 53+) and requires an EAS projectId.
    if (Constants.appOwnership === 'expo') return;

    const projectId = getExpoProjectId();
    if (!projectId) return;

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    if (authToken) setApiToken(authToken);
    await api.registerPushToken(tokenData.data);
  } catch {
    // Push is optional — polling covers MVP in Expo Go
  }
}

export function useApiAuth() {
  const { token } = useAuth();
  if (token) setApiToken(token);
}
