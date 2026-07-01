import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Alert, Linking } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AccessibleButton } from '@/components/AccessibleButton';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TripStatusTimeline } from '@/components/TripStatusTimeline';
import { TripDetailsCard } from '@/components/TripDetailsCard';
import { useAuth } from '@/context/AuthContext';
import { api, setApiToken, type Booking } from '@/services/api';
import { formatNaira } from '@suredriver/shared-types';

export default function DriverJob() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const [booking, setBooking] = useState<Booking | null>(null);

  const load = useCallback(async () => {
    if (!token || !id) return;
    setApiToken(token);
    const data = await api.getBooking(id);
    setBooking(data);
  }, [token, id]);

  useEffect(() => {
    load().catch(() => undefined);
    const interval = setInterval(() => load().catch(() => undefined), 5000);
    return () => clearInterval(interval);
  }, [load]);

  const accept = async () => {
    if (!token || !id) return;
    setApiToken(token);
    try {
      await api.acceptJob(id);
      Alert.alert('Job accepted', 'Head to the pickup location.');
      await load();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
    }
  };

  const enRoute = async () => {
    if (!id || !token) return;
    setApiToken(token);
    await api.updateTripStatus(id);
    await load();
  };

  const start = async () => {
    if (!id || !token) return;
    setApiToken(token);
    await api.startTrip(id);
    await load();
  };

  const end = async () => {
    if (!id || !token) return;
    setApiToken(token);
    await api.endTrip(id);
    Alert.alert('Trip completed', 'Payout will be sent to your bank.');
    router.dismissTo('/(driver)/home');
  };

  const openMaps = async () => {
    if (!booking) return;
    const q = encodeURIComponent(booking.pickupAddress);
    const url = `https://www.google.com/maps/search/?api=1&query=${q}`;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        Alert.alert('Maps unavailable', 'Could not open Google Maps on this device.');
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert('Maps unavailable', 'Could not open Google Maps on this device.');
    }
  };

  if (!booking) {
    return (
      <View className="flex-1 bg-surface">
        <ScreenHeader title="Job details" closeHref="/(driver)/home" />
        <View className="flex-1 p-6 justify-center">
          <Text className="text-xl text-center">Loading job…</Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface">
      <ScreenHeader title="Job details" closeHref="/(driver)/home" />
      <ScrollView className="flex-1" contentContainerClassName="p-6">
        <Text className="text-3xl font-bold text-primary mb-2">
          {formatNaira(booking.driverPayoutKobo)}
        </Text>
        <Text className="text-lg text-gray-500 mb-4">Your earnings for this trip</Text>

        <TripDetailsCard booking={booking} />

        <TripStatusTimeline
          currentStatus={booking.status}
          history={booking.trip?.statusHistory}
        />

        <View className="mt-6 gap-3">
          {!booking.driver && (
            <AccessibleButton title="Accept job" size="field" onPress={accept} />
          )}
          {booking.status === 'driver_assigned' && (
            <>
              <AccessibleButton
                title="Open in Google Maps"
                variant="secondary"
                size="field"
                onPress={openMaps}
              />
              <AccessibleButton title="I'm en route" size="field" onPress={enRoute} />
            </>
          )}
          {booking.status === 'driver_en_route' && (
            <AccessibleButton title="Start trip" size="field" onPress={start} />
          )}
          {booking.status === 'in_progress' && (
            <AccessibleButton title="End trip" size="field" onPress={end} />
          )}
        </View>
      </ScrollView>
    </View>
  );
}
