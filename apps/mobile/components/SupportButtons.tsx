import { Linking, Pressable, Text, View } from 'react-native';
import { SUPPORT_PHONE, SUPPORT_WHATSAPP } from '@suredriver/shared-types';

export function SupportButtons() {
  return (
    <View className="flex-row gap-3 mt-4">
      <Pressable
        className="flex-1 bg-primary py-4 rounded-xl items-center"
        onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE}`)}
        accessibilityRole="button"
        accessibilityLabel="Call support"
      >
        <Text className="text-white text-lg font-semibold">Call Support</Text>
      </Pressable>
      <Pressable
        className="flex-1 bg-accent py-4 rounded-xl items-center"
        onPress={() => Linking.openURL(`https://wa.me/${SUPPORT_WHATSAPP}`)}
        accessibilityRole="button"
        accessibilityLabel="WhatsApp support"
      >
        <Text className="text-white text-lg font-semibold">WhatsApp</Text>
      </Pressable>
    </View>
  );
}
