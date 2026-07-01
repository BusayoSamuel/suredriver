import { useEffect, useState } from 'react';
import { Text, ScrollView, RefreshControl, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { AccessibleButton } from '@/components/AccessibleButton';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useAuth } from '@/context/AuthContext';
import { api, setApiToken, type Booking } from '@/services/api';
import { formatNaira } from '@suredriver/shared-types';

export default function OwnerHome() {
  const { user, token, signOut } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    if (!token) return;
    setApiToken(token);
    const data = await api.listBookings();
    setBookings(data.slice(0, 5));
  };

  useEffect(() => {
    load().catch(() => undefined);
  }, [token]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load().catch(() => undefined);
    setRefreshing(false);
  };

  return (
    <View className="flex-1 bg-surface">
      <ScreenHeader title="SureDriver" showClose={false} />
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-6 pb-4"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
      <Text className="text-3xl font-bold text-primary mb-8">Hello{user?.fullName ? `, ${user.fullName}` : ''}</Text>

      <AccessibleButton title="Find a driver for your car" onPress={() => router.push('/(owner)/book/duration')} />

      <Text className="text-2xl font-bold text-primary mt-10 mb-4">Recent trips</Text>
      {bookings.length === 0 ? (
        <Text className="text-xl text-gray-500">No trips yet</Text>
      ) : (
        bookings.map((b) => (
          <Pressable
            key={b.id}
            className="border-2 border-primary bg-white rounded-xl px-4 py-3 mb-2"
            onPress={() => router.push(`/(owner)/trips/${b.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`Trip to ${b.pickupAddress}`}
          >
            <Text className="text-lg font-semibold text-primary" numberOfLines={1}>
              {b.pickupAddress} — {formatNaira(b.priceKobo)}
            </Text>
          </Pressable>
        ))
      )}
      </ScrollView>

      <SafeAreaView edges={['bottom']} className="bg-surface px-6 pt-2 pb-2">
        <AccessibleButton title="Sign out" variant="outline" size="field" onPress={signOut} />
      </SafeAreaView>
    </View>
  );
}
