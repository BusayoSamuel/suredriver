import { useEffect, useState } from 'react';
import { View, Text, Alert, Modal, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';
import { formatNaira } from '@suredriver/shared-types';
import { AccessibleButton } from '@/components/AccessibleButton';
import { ScreenHeader } from '@/components/ScreenHeader';
import { NombaCheckoutDemo } from '@/components/NombaCheckoutDemo';
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
  const [mockCheckout, setMockCheckout] = useState<{
    orderReference: string;
    amountKobo: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);

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

      const checkout = await api.checkout(booking.id, 'suredriver://payment/success');
      if (checkout.mock) {
        setMockCheckout({
          orderReference: checkout.orderReference,
          amountKobo: quote?.priceKobo ?? booking.priceKobo,
        });
      } else {
        setCheckoutUrl(checkout.checkoutLink);
      }
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Payment failed');
    } finally {
      setLoading(false);
    }
  };

  const completeMockPayment = async () => {
    if (!token || !bookingId) return;
    setApiToken(token);
    setPaying(true);
    try {
      const result = await api.mockConfirmPayment(bookingId);
      setMockCheckout(null);
      Alert.alert(
        'Payment successful',
        `Paid via Nomba Checkout\nOrder: ${result.nombaOrderReference ?? '—'}\nTxn: ${result.nombaTransactionId ?? '—'}`,
        [{ text: 'View trip', onPress: () => router.replace(`/(owner)/trips/${bookingId}`) }],
      );
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Payment failed');
    } finally {
      setPaying(false);
    }
  };

  return (
    <View className="flex-1 bg-surface">
      <ScreenHeader title="Find a driver" closeHref="/(owner)/home" />
      <ScrollView className="flex-1" contentContainerClassName="p-6">
        <Text className="text-3xl font-bold text-primary mb-4">Confirm booking</Text>
        {quote && (
          <View className="bg-white rounded-2xl p-6 mb-6 border-2 border-gray-200">
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
            <View className="mt-4 pt-4 border-t border-gray-200 gap-1">
              <Text className="text-lg text-gray-600">
                Platform fee: {formatNaira(quote.platformFeeKobo)}
              </Text>
              <Text className="text-lg text-gray-600">
                Driver receives: {formatNaira(quote.driverPayoutKobo)}
              </Text>
              <Text className="text-base text-gray-500 mt-2">Paid securely with Nomba Checkout</Text>
            </View>
          </View>
        )}

        <AccessibleButton
          title={loading ? 'Processing…' : 'Pay with Nomba'}
          onPress={createAndPay}
          disabled={loading}
          size="field"
        />
      </ScrollView>

      {mockCheckout ? (
        <NombaCheckoutDemo
          visible
          amountKobo={mockCheckout.amountKobo}
          orderReference={mockCheckout.orderReference}
          loading={paying}
          onPay={completeMockPayment}
          onClose={() => !paying && setMockCheckout(null)}
        />
      ) : null}

      <Modal visible={!!checkoutUrl} animationType="slide">
        <View className="flex-1 pt-12">
          {checkoutUrl && (
            <WebView
              source={{ uri: checkoutUrl }}
              onNavigationStateChange={async (nav) => {
                if (!bookingId || !token) return;
                if (!nav.url.includes('suredriver')) return;
                setCheckoutUrl(null);
                setApiToken(token);
                try {
                  const booking = await api.getBooking(bookingId);
                  if (booking.status === 'paid') {
                    router.replace(`/(owner)/trips/${bookingId}`);
                    return;
                  }
                  Alert.alert(
                    'Payment processing',
                    'Nomba is confirming your payment. Check your trip in a moment.',
                    [{ text: 'View trip', onPress: () => router.replace(`/(owner)/trips/${bookingId}`) }],
                  );
                } catch {
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
