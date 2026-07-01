import { View, Text, Modal, ActivityIndicator } from 'react-native';
import { formatNaira } from '@suredriver/shared-types';
import { AccessibleButton } from '@/components/AccessibleButton';

interface Props {
  visible: boolean;
  amountKobo: number;
  orderReference: string;
  loading?: boolean;
  onPay: () => void;
  onClose: () => void;
}

export function NombaCheckoutDemo({
  visible,
  amountKobo,
  orderReference,
  loading,
  onPay,
  onClose,
}: Props) {
  return (
    <Modal visible={visible} animationType="slide">
      <View className="flex-1 bg-surface pt-16 px-6">
        <View className="bg-white border-2 border-gray-200 rounded-2xl p-6 mb-6">
          <Text className="text-2xl font-bold text-primary mb-1">Nomba Checkout</Text>
          <Text className="text-base text-gray-500 mb-6">Sandbox demo — simulates owner payment</Text>

          <Text className="text-base font-semibold text-gray-500 mb-1">Amount to pay</Text>
          <Text className="text-4xl font-bold text-primary mb-6">{formatNaira(amountKobo)}</Text>

          <Text className="text-base font-semibold text-gray-500 mb-1">Order reference</Text>
          <Text className="text-lg text-primary mb-6">{orderReference}</Text>

          <View className="bg-surface border-2 border-gray-200 rounded-xl px-4 py-4 mb-2">
            <Text className="text-lg font-semibold text-primary">Card / bank transfer</Text>
            <Text className="text-base text-gray-600 mt-1">Powered by Nomba</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#1B4332" className="mb-4" />
        ) : null}

        <AccessibleButton
          title={loading ? 'Processing…' : `Pay ${formatNaira(amountKobo)}`}
          onPress={onPay}
          disabled={loading}
          size="field"
        />
        <AccessibleButton
          title="Cancel"
          variant="outline"
          size="field"
          className="mt-3"
          onPress={onClose}
          disabled={loading}
        />
      </View>
    </Modal>
  );
}
