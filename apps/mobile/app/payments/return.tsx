import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { api, setApiToken } from '@/services/api';

export default function PaymentReturn() {
  const { bookingId } = useLocalSearchParams<{ bookingId?: string }>();
  const { token } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !bookingId) {
      setError('Missing booking details');
      return;
    }

    setApiToken(token);
    api
      .confirmPayment(bookingId)
      .then((result) => {
        if (result.status === 'paid' || result.paymentStatus === 'paid') {
          router.replace(`/(owner)/trips/${bookingId}`);
        } else {
          setError('Payment not confirmed yet. Check your trip in a moment.');
        }
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Could not confirm payment');
      });
  }, [token, bookingId]);

  return (
    <View className="flex-1 bg-surface items-center justify-center p-6 gap-4">
      {!error ? (
        <>
          <ActivityIndicator size="large" color="#1B4332" />
          <Text className="text-xl text-center text-primary">Confirming payment…</Text>
        </>
      ) : (
        <Text className="text-lg text-center text-red-700">{error}</Text>
      )}
    </View>
  );
}
