import { useEffect, useState } from 'react';
import { View, Text, Alert, Modal, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';
import { formatNaira } from '@suredriver/shared-types';
import { AccessibleButton } from '@/components/AccessibleButton';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useAuth } from '@/context/AuthContext';
import { api, setApiToken, type Quote } from '@/services/api';

export default function BookConfirm() {
  const params = useLocalSearchParams<{
    durationType: string;
    pickupAddress: string;
    carModel?: string;
    transmission?: string;
    notes?: string;
    vehicleId: string;
  }>();
  const { token } = useAuth();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token || !params.durationType) return;
    setApiToken(token);
    api.getQuote(params.durationType).then(setQuote).catch(() => undefined);
  }, [token, params.durationType]);

  const createAndPay = async () => {
    if (!token) return;
    setApiToken(token);
    setLoading(true);
    try {
      const transmissionLabel =
        params.transmission === 'manual'
          ? 'Manual'
          : params.transmission === 'automatic'
            ? 'Automatic'
            : null;

      const bookingNotes = [
        params.carModel ? `Car: ${params.carModel}` : null,
        transmissionLabel ? `Transmission: ${transmissionLabel}` : null,
        params.notes?.trim() || null,
      ]
        .filter(Boolean)
        .join('\n');

      const booking = await api.createBooking({
        vehicleId: params.vehicleId,
        durationType: params.durationType,
        pickupAddress: params.pickupAddress,
        notes: bookingNotes || undefined,
      });
      setBookingId(booking.id);

      const checkout = await api.checkout(booking.id);
      if (checkout.mock) {
        await api.mockConfirmPayment(booking.id);
        Alert.alert('Payment successful', 'Your booking is confirmed.', [
          { text: 'View trip', onPress: () => router.replace(`/(owner)/trips/${booking.id}`) },
        ]);
      } else {
        setCheckoutUrl(checkout.checkoutLink);
      }
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Payment failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-surface">
      <ScreenHeader title="Find a driver" closeHref="/(owner)/home" />
      <ScrollView className="flex-1" contentContainerClassName="p-6">
        <Text className="text-3xl font-bold text-primary mb-4">Confirm booking</Text>
        {quote && (
          <View className="bg-white rounded-2xl p-6 mb-6">
          <Text className="text-2xl font-bold">{quote.label}</Text>
          {params.carModel ? (
            <Text className="text-xl mt-2 text-gray-700">{params.carModel}</Text>
          ) : null}
          {params.transmission ? (
            <Text className="text-xl mt-1 text-gray-700">
              {params.transmission === 'manual' ? 'Manual' : 'Automatic'}
            </Text>
          ) : null}
          <Text className="text-xl mt-2">{params.pickupAddress}</Text>
            <Text className="text-3xl font-bold text-primary mt-4">{formatNaira(quote.priceKobo)}</Text>
            <Text className="text-lg text-gray-500 mt-2">Includes platform fee</Text>
          </View>
        )}

        <AccessibleButton title={loading ? 'Processing…' : 'Pay & confirm'} onPress={createAndPay} disabled={loading} />
      </ScrollView>

      <Modal visible={!!checkoutUrl} animationType="slide">
        <View className="flex-1 pt-12">
          {checkoutUrl && (
            <WebView
              source={{ uri: checkoutUrl }}
              onNavigationStateChange={(nav) => {
                if (nav.url.includes('suredriver') && bookingId) {
                  setCheckoutUrl(null);
                  router.replace(`/(owner)/trips/${bookingId}`);
                }
              }}
            />
          )}
          <AccessibleButton title="Close" variant="outline" className="m-4" onPress={() => setCheckoutUrl(null)} />
        </View>
      </Modal>
    </View>
  );
}
