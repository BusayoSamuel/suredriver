import { Stack } from 'expo-router';

export default function DriverLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#1B4332' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontSize: 20, fontWeight: '700' },
      }}
    >
      <Stack.Screen name="home" options={{ headerShown: false }} />
      <Stack.Screen name="job/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="earnings" options={{ headerShown: false }} />
    </Stack>
  );
}
