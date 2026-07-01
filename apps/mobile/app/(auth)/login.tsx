import { useState } from 'react';
import {
  Text,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { AccessibleButton } from '@/components/AccessibleButton';
import { api, setApiToken } from '@/services/api';
import { useAuth } from '@/context/AuthContext';

const DEMO_PIN = '1234';

const DEMO_ACCOUNTS = {
  owner: { phone: '08011111111', label: 'Test Owner' },
  driver: { phone: '08022222222', label: 'Test Driver' },
} as const;

function normalizePhoneInput(phone: string): string {
  return phone.replace(/\D/g, '');
}

function validatePhone(phone: string): string | null {
  const digits = normalizePhoneInput(phone);
  if (digits.startsWith('234') && digits.length === 13) return null;
  if (digits.startsWith('0') && digits.length === 11) return null;
  return 'Use 11 digits starting with 0, e.g. 08011111111';
}

function authErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Sign in failed';
  if (message.includes('invite list')) {
    return 'That number is not invited. Use a demo button below, or enter 08011111111 / 08022222222 with PIN 1234.';
  }
  if (message.includes('Network') || message.includes('fetch')) {
    return 'Cannot reach the API. Is pnpm dev:api running? Check EXPO_PUBLIC_API_URL in apps/mobile/.env';
  }
  return message;
}

export default function LoginScreen() {
  const { setSession } = useAuth();
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [fullName, setFullName] = useState('');
  const [needsSetup, setNeedsSetup] = useState(false);
  const [loading, setLoading] = useState(false);

  const signInWith = async (demoPhone: string, demoPin: string) => {
    setPhone(demoPhone);
    setPin(demoPin);
    setLoading(true);
    try {
      const invite = await api.checkInvite(demoPhone);
      if (invite.needsPinSetup) {
        setNeedsSetup(true);
        Alert.alert('First time?', 'Enter your name above, then sign in.');
        return;
      }
      const result = await api.login(demoPhone, demoPin);
      setApiToken(result.accessToken);
      await setSession(result.accessToken, result.user as Parameters<typeof setSession>[1]);
    } catch (e) {
      Alert.alert('Could not sign in', authErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async () => {
    const phoneError = validatePhone(phone);
    if (phoneError) {
      Alert.alert('Check phone number', phoneError);
      return;
    }
    if (pin.length !== 4) {
      Alert.alert('PIN must be 4 digits');
      return;
    }
    setLoading(true);
    try {
      const invite = await api.checkInvite(phone);
      if (invite.needsPinSetup) {
        setNeedsSetup(true);
        if (!fullName.trim()) {
          Alert.alert('Enter your name to create your account');
          return;
        }
        const result = await api.setupPin(phone, pin, fullName.trim());
        setApiToken(result.accessToken);
        await setSession(result.accessToken, result.user as Parameters<typeof setSession>[1]);
        return;
      }
      const result = await api.login(phone, pin);
      setApiToken(result.accessToken);
      await setSession(result.accessToken, result.user as Parameters<typeof setSession>[1]);
    } catch (e) {
      Alert.alert('Could not sign in', authErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-surface"
    >
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 pt-24 pb-12 flex-grow"
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-4xl font-bold text-primary mb-2">SureDriver</Text>
        <Text className="text-xl text-gray-600 mb-8">Trusted drivers for your car</Text>

        {needsSetup && (
          <>
            <Text className="text-xl font-semibold mb-2">Your name</Text>
            <TextInput
              className="bg-white border-2 border-gray-200 rounded-xl px-4 py-5 text-xl mb-4"
              placeholder="Full name"
              value={fullName}
              onChangeText={setFullName}
              accessibilityLabel="Full name"
            />
          </>
        )}

        <Text className="text-xl font-semibold mb-2">Phone number</Text>
        <TextInput
          className="bg-white border-2 border-gray-200 rounded-xl px-4 py-5 text-2xl mb-4"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={(text) => setPhone(normalizePhoneInput(text))}
          maxLength={13}
          accessibilityLabel="Phone number"
        />

        <Text className="text-xl font-semibold mb-2">PIN</Text>
        <TextInput
          className="bg-white border-2 border-gray-200 rounded-xl px-4 py-5 text-2xl mb-6 tracking-widest"
          keyboardType="number-pad"
          secureTextEntry
          maxLength={4}
          value={pin}
          onChangeText={setPin}
          accessibilityLabel="PIN"
        />

        <AccessibleButton
          title={loading ? 'Please wait…' : needsSetup ? 'Create account' : 'Sign in'}
          onPress={onSubmit}
          disabled={loading}
          size="field"
        />

        <Text className="text-lg text-gray-500 mt-8 mb-3">Demo accounts (PIN 1234)</Text>
        <AccessibleButton
          title={DEMO_ACCOUNTS.owner.label}
          variant="outline"
          size="field"
          className="mb-3"
          onPress={() => signInWith(DEMO_ACCOUNTS.owner.phone, DEMO_PIN)}
          disabled={loading}
        />
        <AccessibleButton
          title={DEMO_ACCOUNTS.driver.label}
          variant="secondary"
          size="field"
          onPress={() => signInWith(DEMO_ACCOUNTS.driver.phone, DEMO_PIN)}
          disabled={loading}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
