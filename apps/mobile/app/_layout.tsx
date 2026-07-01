import '../global.css';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { registerForPushNotifications } from '@/services/notifications';

function RootNavigator() {
  const { user, token, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === '(auth)';

    if (!user && !inAuth) {
      router.replace('/(auth)/login');
      return;
    }

    if (user && inAuth) {
      if (user.role === 'owner') router.replace('/(owner)/home');
      else if (user.role === 'driver') router.replace('/(driver)/home');
      else router.replace('/(owner)/home');
    }
  }, [user, loading, segments, router]);

  useEffect(() => {
    if (user && token) {
      registerForPushNotifications(token).catch(() => undefined);
    }
  }, [user, token]);

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
