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

async function isBookingPaid(bookingId: string) {
  const result = await api.confirmPayment(bookingId);
  return result.status === 'paid' || result.paymentStatus === 'paid';
}

/** Nomba sandbox may redirect to nomba.com instead of our callback — poll and close browser when paid. */
async function openNombaCheckout(checkoutLink: string, bookingId: string) {
  const returnUrl = `${getApiUrl()}/payments/return`;
  let stopPoll = false;
  let confirmed = false;

  const pollForPayment = async () => {
    await sleep(2500);
    while (!stopPoll) {
      try {
        if (await isBookingPaid(bookingId)) {
          confirmed = true;
          stopPoll = true;
          await WebBrowser.dismissBrowser().catch(() => undefined);
          return;
        }
      } catch {
        // keep polling through transient API errors
      }
      if (stopPoll) break;
      await sleep(2000);
    }
  };

  const pollTask = pollForPayment();

  try {
    const session = await WebBrowser.openAuthSessionAsync(checkoutLink, returnUrl);
    stopPoll = true;

    if (!confirmed) {
      if (session.type === 'success' && (await isBookingPaid(bookingId))) {
        confirmed = true;
      } else {
        await sleep(1500);
        confirmed = await isBookingPaid(bookingId);
      }
    }
  } finally {
    stopPoll = true;
    await pollTask.catch(() => undefined);
  }

  return confirmed;
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
  const checkoutActiveRef = useRef(false);

  useEffect(() => {
    if (!token || !params.durationType) return;
    setApiToken(token);
    api.getQuote(params.durationType).then(setQuote).catch(() => undefined);
  }, [token, params.durationType]);

  const createAndPay = async () => {
    if (!token || checkoutActiveRef.current) return;
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
      setPaying(true);
      checkoutActiveRef.current = true;

      const paid = await openNombaCheckout(checkout.checkoutLink, booking.id);

      if (paid) {
        router.replace(`/(owner)/trips/${booking.id}`);
      }
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Payment failed');
    } finally {
      checkoutActiveRef.current = false;
      setLoading(false);
      setPaying(false);
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
          <Text className="text-xl text-center text-primary">Waiting for Nomba payment…</Text>
          <Text className="text-base text-center text-gray-600">
            The browser will close automatically when payment is confirmed.
          </Text>
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
