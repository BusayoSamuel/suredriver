import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, Alert } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { TripStatusTimeline } from '@/components/TripStatusTimeline';
import { TripDetailsCard } from '@/components/TripDetailsCard';
import { NombaPaymentCard } from '@/components/NombaPaymentCard';
import { AccessibleButton } from '@/components/AccessibleButton';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useAuth } from '@/context/AuthContext';
import { api, setApiToken, type Booking } from '@/services/api';
import { formatNaira } from '@suredriver/shared-types';

export default function TripDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [rating, setRating] = useState('5');

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

  const submitReview = async () => {
    if (!id || !token) return;
    setApiToken(token);
    try {
      await api.reviewBooking(id, parseInt(rating, 10));
      Alert.alert('Thank you', 'Your review was submitted.');
      load();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
    }
  };

  if (!booking) {
    return (
      <View className="flex-1 bg-surface">
        <ScreenHeader title="Your trip" closeHref="/(owner)/home" />
        <View className="flex-1 p-6 justify-center">
          <Text className="text-xl text-center">Loading trip…</Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface">
      <ScreenHeader title="Your trip" closeHref="/(owner)/home" />
      <ScrollView className="flex-1" contentContainerClassName="p-6">
      <Text className="text-3xl font-bold text-primary mb-4">{formatNaira(booking.priceKobo)}</Text>
      {booking.driver?.fullName && (
        <Text className="text-xl mb-4">Driver: {booking.driver.fullName}</Text>
      )}

      <TripDetailsCard booking={booking} />

      {booking.payment?.status === 'paid' ? (
        <NombaPaymentCard
          title="Payment"
          mode="owner"
          priceKobo={booking.priceKobo}
          platformFeeKobo={booking.platformFeeKobo}
          driverPayoutKobo={booking.driverPayoutKobo}
          payment={booking.payment}
        />
      ) : null}

      <TripStatusTimeline
        currentStatus={booking.status}
        history={booking.trip?.statusHistory}
      />

      {booking.status === 'completed' && !booking.review && (
        <View className="mt-8 bg-white p-5 rounded-2xl">
          <Text className="text-xl font-bold mb-3">Rate your driver (1-5)</Text>
          <TextInput
            className="border-2 border-gray-200 rounded-xl px-4 py-4 text-2xl mb-4"
            keyboardType="number-pad"
            maxLength={1}
            value={rating}
            onChangeText={setRating}
          />
          <AccessibleButton title="Submit rating" onPress={submitReview} />
        </View>
      )}
      </ScrollView>
    </View>
  );
}
