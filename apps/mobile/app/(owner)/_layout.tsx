import { Stack } from 'expo-router';

export default function OwnerLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#1B4332' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontSize: 20, fontWeight: '700' },
      }}
    >
      <Stack.Screen name="home" options={{ headerShown: false }} />
      <Stack.Screen name="book/duration" options={{ headerShown: false }} />
      <Stack.Screen name="book/confirm" options={{ headerShown: false }} />
      <Stack.Screen name="trips/[id]" options={{ headerShown: false }} />
    </Stack>
  );
}
