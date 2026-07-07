import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Alert, Linking } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AccessibleButton } from '@/components/AccessibleButton';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TripStatusTimeline } from '@/components/TripStatusTimeline';
import { TripDetailsCard } from '@/components/TripDetailsCard';
import { NombaPaymentCard } from '@/components/NombaPaymentCard';
import { useAuth } from '@/context/AuthContext';
import { api, setApiToken, type Booking } from '@/services/api';
import { formatNaira } from '@suredriver/shared-types';

export default function DriverJob() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

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
    if (!token || !id || actionLoading) return;
    setApiToken(token);
    setActionLoading(true);
    try {
      await api.acceptJob(id);
      Alert.alert('Job accepted', 'Head to the pickup location.');
      await load();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
    } finally {
      setActionLoading(false);
    }
  };

  const enRoute = async () => {
    if (!id || !token || actionLoading) return;
    setApiToken(token);
    setActionLoading(true);
    try {
      await api.updateTripStatus(id);
      await load();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to update status');
      await load();
    } finally {
      setActionLoading(false);
    }
  };

  const start = async () => {
    if (!id || !token || actionLoading) return;
    setApiToken(token);
    setActionLoading(true);
    try {
      await api.startTrip(id);
      await load();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to start trip');
      await load();
    } finally {
      setActionLoading(false);
    }
  };

  const end = async () => {
    if (!id || !token || actionLoading) return;
    setApiToken(token);
    setActionLoading(true);
    try {
      const result = await api.endTrip(id);
      const payout = result.payout;
      const amount = payout?.amountKobo ?? booking?.driverPayoutKobo;
      Alert.alert(
        'Trip completed',
        payout?.success
          ? `Nomba sent ${amount ? formatNaira(amount) : 'your payout'} to your bank.\nTransfer: ${payout.transferId ?? '—'}`
          : 'Trip completed. Payout is being processed.',
        [{ text: 'OK', onPress: () => router.dismissTo('/(driver)/home') }],
      );
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to end trip');
    } finally {
      setActionLoading(false);
    }
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
          paymentStatus={booking.payment?.status}
        />

        {booking.status === 'completed' && booking.payment?.payoutStatus ? (
          <View className="mt-6">
            <NombaPaymentCard
              title="Payout"
              mode="driver"
              priceKobo={booking.priceKobo}
              driverPayoutKobo={booking.driverPayoutKobo}
              payment={booking.payment}
            />
          </View>
        ) : null}

        <View className="mt-6 gap-3">
          {!booking.driver && (
            <AccessibleButton
              title="Accept job"
              size="field"
              onPress={accept}
              loading={actionLoading}
            />
          )}
          {(booking.status === 'driver_assigned' ||
            (booking.status === 'paid' && booking.driver)) && (
            <>
              <AccessibleButton
                title="Open in Google Maps"
                variant="secondary"
                size="field"
                onPress={openMaps}
                disabled={actionLoading}
              />
              <AccessibleButton
                title="I'm en route"
                size="field"
                onPress={enRoute}
                loading={actionLoading}
              />
            </>
          )}
          {booking.status === 'driver_en_route' && (
            <AccessibleButton
              title="Start trip"
              size="field"
              onPress={start}
              loading={actionLoading}
            />
          )}
          {booking.status === 'in_progress' && (
            <AccessibleButton
              title="End trip"
              size="field"
              onPress={end}
              loading={actionLoading}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}
