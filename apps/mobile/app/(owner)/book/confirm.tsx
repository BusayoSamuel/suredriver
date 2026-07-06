import { useEffect, useRef, useState } from 'react';
import { View, Text, Alert, Modal, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { formatNaira } from '@suredriver/shared-types';
import { AccessibleButton } from '@/components/AccessibleButton';
import { ScreenHeader } from '@/components/ScreenHeader';
import { NombaCheckoutDemo } from '@/components/NombaCheckoutDemo';
import { useAuth } from '@/context/AuthContext';
import { api, getApiUrl, setApiToken, type Quote } from '@/services/api';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNombaReturnUrl(url: string, apiBase: string) {
  try {
    const parsed = new URL(url);
    const base = new URL(apiBase);
    return (
      parsed.origin === base.origin &&
      parsed.pathname === '/payments/return' &&
      parsed.searchParams.has('bookingId')
    );
  } catch {
    return false;
  }
}

function isSureDriverPaymentLink(url: string) {
  return url.startsWith('suredriver://payment');
}

function handleCheckoutNavigation(
  url: string,
  bookingId: string,
  apiBase: string,
  onReturn: (id: string) => void,
) {
  if (isNombaReturnUrl(url, apiBase) || isSureDriverPaymentLink(url)) {
    onReturn(bookingId);
    return true;
  }
  return false;
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
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
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

      const callbackUrl = `${getApiUrl()}/payments/return?bookingId=${encodeURIComponent(booking.id)}`;
      const checkout = await api.checkout(booking.id, callbackUrl);
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

  const finishPayment = async (id: string) => {
    if (!token || confirmingRef.current) return;
    confirmingRef.current = true;
    setApiToken(token);
    setPaying(true);
    try {
      for (let attempt = 0; attempt < 12; attempt++) {
        const result = await api.confirmPayment(id);
        if (result.status === 'paid' || result.paymentStatus === 'paid') {
          setCheckoutUrl(null);
          router.replace(`/(owner)/trips/${id}`);
          return;
        }
        await sleep(2000);
      }
      setCheckoutUrl(null);
      Alert.alert(
        'Payment not confirmed yet',
        'Nomba has not confirmed this payment. Tap "I\'ve completed payment" to try again, or pay again if needed.',
      );
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not confirm payment');
    } finally {
      setPaying(false);
      confirmingRef.current = false;
    }
  };

  const onCheckoutReturn = (id: string) => {
    finishPayment(id).catch(() => undefined);
  };

  const onWebViewUrl = (url: string) => {
    if (!bookingId || !token || paying) return;
    handleCheckoutNavigation(url, bookingId, getApiUrl(), onCheckoutReturn);
  };

  const onShouldStartLoad = (request: { url: string }) => {
    if (!bookingId) return true;
    const intercepted = handleCheckoutNavigation(
      request.url,
      bookingId,
      getApiUrl(),
      onCheckoutReturn,
    );
    return !intercepted;
  };

  const cancelCheckout = () => {
    if (!bookingId) {
      setCheckoutUrl(null);
      return;
    }
    Alert.alert('Cancel payment?', 'Have you already paid in Nomba?', [
      { text: 'Not yet', style: 'cancel', onPress: () => setCheckoutUrl(null) },
      {
        text: 'Yes, I paid',
        onPress: () => onCheckoutReturn(bookingId),
      },
    ]);
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
          disabled={loading || paying}
          size="field"
        />

        {bookingId && !checkoutUrl && !mockCheckout ? (
          <AccessibleButton
            title={paying ? 'Checking payment…' : "I've completed payment"}
            variant="outline"
            className="mt-3"
            onPress={() => onCheckoutReturn(bookingId)}
            disabled={paying}
            size="field"
          />
        ) : null}
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
          {paying ? (
            <View className="flex-1 items-center justify-center p-6">
              <Text className="text-xl text-center">Confirming your payment…</Text>
            </View>
          ) : null}
          {checkoutUrl && !paying ? (
            <WebView
              source={{ uri: checkoutUrl }}
              style={{ flex: 1 }}
              originWhitelist={['https://*', 'suredriver://*']}
              onShouldStartLoadWithRequest={onShouldStartLoad}
              onNavigationStateChange={(nav: WebViewNavigation) => onWebViewUrl(nav.url)}
              onMessage={(event) => {
                try {
                  const data = JSON.parse(event.nativeEvent.data) as {
                    type?: string;
                    bookingId?: string;
                  };
                  if (data.type === 'payment_return' && data.bookingId) {
                    onCheckoutReturn(data.bookingId);
                  }
                } catch {
                  // ignore non-JSON messages
                }
              }}
            />
          ) : null}
          {!paying ? (
            <View className="gap-2 m-4">
              <AccessibleButton
                title="I've completed payment"
                onPress={() => bookingId && onCheckoutReturn(bookingId)}
                size="field"
              />
              <AccessibleButton
                title="Cancel payment"
                variant="outline"
                onPress={cancelCheckout}
              />
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}
