import { useState, useEffect } from 'react';
import { View, Text, ScrollView, Alert, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import type { DurationType } from '@suredriver/shared-types';
import { DurationPicker } from '@/components/DurationPicker';
import { AccessibleButton } from '@/components/AccessibleButton';
import { ScreenHeader } from '@/components/ScreenHeader';
import { FormTextInput } from '@/components/FormTextInput';
import { useAuth } from '@/context/AuthContext';
import { api, setApiToken } from '@/services/api';

type TransmissionType = 'manual' | 'automatic';

const labelClass = 'text-xl font-semibold mb-2';
const transmissionOptions: { value: TransmissionType; label: string }[] = [
  { value: 'manual', label: 'Manual' },
  { value: 'automatic', label: 'Automatic' },
];

export default function BookDuration() {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const [duration, setDuration] = useState<DurationType | null>(null);
  const [address, setAddress] = useState('');
  const [carModel, setCarModel] = useState('');
  const [transmission, setTransmission] = useState<TransmissionType | null>(null);
  const [notes, setNotes] = useState('');
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    setApiToken(token);
    api.getMe().then((me) => {
      const vehicle = me.ownerProfile?.vehicles?.[0];
      if (vehicle) {
        setVehicleId(vehicle.id);
      }
    }).catch(() => undefined);
  }, [token]);

  const onContinue = async () => {
    if (!duration || !address.trim() || !carModel.trim() || !transmission) {
      Alert.alert('Enter pickup address, car model, transmission, and select a duration');
      return;
    }
    if (!token) return;
    setApiToken(token);
    setLoading(true);
    try {
      let vId = vehicleId;
      if (!vId) {
        const me = await api.getMe();
        vId = me.ownerProfile?.vehicles?.[0]?.id ?? null;
        if (!vId) {
          const parts = carModel.trim().split(/\s+/);
          const make = parts[0] || 'Car';
          const model = parts.slice(1).join(' ') || carModel.trim();
          const created = await api.createVehicle({
            make,
            model,
            plateNumber: '—',
          });
          vId = created.id;
        }
        setVehicleId(vId);
      }
      router.push({
        pathname: '/(owner)/book/confirm',
        params: {
          durationType: duration,
          pickupAddress: address,
          carModel: carModel.trim(),
          transmission,
          notes,
          vehicleId: vId,
        },
      });
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-surface">
      <ScreenHeader title="Find a driver" closeHref="/(owner)/home" />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 24,
          paddingBottom: insets.bottom + 16,
        }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator
      >
          <Text className={labelClass}>Pickup address</Text>
          <FormTextInput
            placeholder="Your home or destination"
            value={address}
            onChangeText={setAddress}
          />

          <Text className={labelClass}>Car model</Text>
          <FormTextInput
            placeholder="e.g. Toyota Camry"
            value={carModel}
            onChangeText={setCarModel}
          />

          <Text className={labelClass}>Manual or automatic?</Text>
          <View className="flex-row gap-2 mb-4">
            {transmissionOptions.map((option) => {
              const active = transmission === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setTransmission(option.value)}
                  className={`flex-1 px-4 py-3 rounded-xl border-2 items-center ${active ? 'border-primary bg-green-50' : 'border-gray-200 bg-white'}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text className="text-xl font-bold text-primary">{option.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text className={labelClass}>Description</Text>
          <FormTextInput
            placeholder="e.g. Doctor appointment, wait up to 30 min"
            value={notes}
            onChangeText={setNotes}
            multiline
          />

          <Text className={`${labelClass} mt-4`}>How long do you need a driver?</Text>
          <DurationPicker selected={duration} onSelect={setDuration} />

          <AccessibleButton
            title={loading ? 'Loading…' : 'Submit'}
            onPress={onContinue}
            disabled={loading}
            size="field"
            className="mt-6"
          />
      </ScrollView>
    </View>
  );
}
