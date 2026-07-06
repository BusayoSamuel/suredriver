import { useEffect, useRef, useState } from 'react';
import { View, Text, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { formatNaira } from '@suredriver/shared-types';
import { AccessibleButton } from '@/components/AccessibleButton';
import { ScreenHeader } from '@/components/ScreenHeader';
import { NombaCheckoutDemo } from '@/components/NombaCheckoutDemo';
import { useAuth } from '@/context/AuthContext';
import { api, getApiUrl, setApiToken, type Quote } from '@/services/api';

WebBrowser.maybeCompleteAuthSession();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  const [mockCheckout, setMockCheckout] = useState<{
    orderReference: string;
    amountKobo: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const confirmingRef = useRef(false);

  useEffect(() => {
    if (!token || !params.durationType) return;
    setApiToken(token);
    api.getQuote(params.durationType).then(setQuote).catch(() => undefined);
  }, [token, params.durationType]);

  const finishPayment = async (id: string) => {
    if (!token || confirmingRef.current) return;
    confirmingRef.current = true;
    setApiToken(token);
    setPaying(true);
    try {
      for (let attempt = 0; attempt < 12; attempt++) {
        const result = await api.confirmPayment(id);
        if (result.status === 'paid' || result.paymentStatus === 'paid') {
          router.replace(`/(owner)/trips/${id}`);
          return;
        }
        await sleep(2000);
      }
      Alert.alert(
        'Payment not confirmed',
        'Nomba has not confirmed this payment yet. Please try again in a moment.',
      );
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not confirm payment');
    } finally {
      setPaying(false);
      confirmingRef.current = false;
    }
  };

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

      const returnUrl = `${getApiUrl()}/payments/return?bookingId=${encodeURIComponent(booking.id)}`;
      const checkout = await api.checkout(booking.id, returnUrl);

      if (checkout.mock) {
        setMockCheckout({
          orderReference: checkout.orderReference,
          amountKobo: quote?.priceKobo ?? booking.priceKobo,
        });
        return;
      }

      setLoading(false);

      const session = await WebBrowser.openAuthSessionAsync(
        checkout.checkoutLink,
        returnUrl,
      );

      if (session.type === 'success') {
        await finishPayment(booking.id);
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
      {paying ? (
        <View className="flex-1 items-center justify-center p-6 gap-4">
          <ActivityIndicator size="large" color="#1B4332" />
          <Text className="text-xl text-center text-primary">Confirming your payment…</Text>
        </View>
      ) : (
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
            title={loading ? 'Opening Nomba…' : 'Pay with Nomba'}
            onPress={createAndPay}
            disabled={loading || paying}
            size="field"
          />
        </ScrollView>
      )}

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
    </View>
  );
}
