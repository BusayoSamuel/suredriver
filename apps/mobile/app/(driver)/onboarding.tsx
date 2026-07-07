import { useState } from 'react';
import { View, Text, TextInput, ScrollView, Alert, Linking } from 'react-native';
import { router } from 'expo-router';
import { KYC_WHATSAPP } from '@suredriver/shared-types';
import { AccessibleButton } from '@/components/AccessibleButton';
import { useAuth } from '@/context/AuthContext';
import { api, setApiToken } from '@/services/api';

export default function DriverOnboarding() {
  const { token } = useAuth();
  const [bankName, setBankName] = useState('GTBank');
  const [bankCode, setBankCode] = useState('058');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!token) return;
    const digits = accountNumber.replace(/\D/g, '');
    if (digits.length !== 10) {
      Alert.alert('Invalid account', 'Account number must be exactly 10 digits.');
      return;
    }
    setApiToken(token);
    setLoading(true);
    try {
      await api.driverOnboarding({
        bankName,
        bankCode,
        accountNumber: digits,
        accountName,
      });
      Alert.alert(
        'Submitted',
        'Send your license and ID via WhatsApp for verification.',
        [
          {
            text: 'Open WhatsApp',
            onPress: () => Linking.openURL(`https://wa.me/${KYC_WHATSAPP}`),
          },
          { text: 'OK', onPress: () => router.dismissTo('/(driver)/home') },
        ],
      );
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView className="flex-1 bg-surface p-6">
      <Text className="text-3xl font-bold text-primary mb-4">Driver setup</Text>
      <Text className="text-xl text-gray-700 mb-6">
        Add your bank details for payouts, then send your driver&apos;s license and national ID via WhatsApp for
        verification.
      </Text>

      <Text className="text-xl font-semibold mb-2">Bank name</Text>
      <TextInput className="bg-white border-2 border-gray-200 rounded-xl px-4 py-4 text-xl mb-4" value={bankName} onChangeText={setBankName} />

      <Text className="text-xl font-semibold mb-2">Bank code</Text>
      <TextInput className="bg-white border-2 border-gray-200 rounded-xl px-4 py-4 text-xl mb-4" value={bankCode} onChangeText={setBankCode} keyboardType="number-pad" />

      <Text className="text-xl font-semibold mb-2">Account number</Text>
      <Text className="text-base text-gray-600 mb-2">10 digits (Nigerian NUBAN)</Text>
      <TextInput
        className="bg-white border-2 border-gray-200 rounded-xl px-4 py-4 text-xl mb-4"
        value={accountNumber}
        onChangeText={setAccountNumber}
        keyboardType="number-pad"
        maxLength={10}
      />

      <Text className="text-xl font-semibold mb-2">Account name</Text>
      <TextInput className="bg-white border-2 border-gray-200 rounded-xl px-4 py-4 text-xl mb-6" value={accountName} onChangeText={setAccountName} />

      <AccessibleButton title={loading ? 'Saving…' : 'Save & send docs via WhatsApp'} onPress={submit} disabled={loading} />
    </ScrollView>
  );
}
