import { Pressable, Text, View } from 'react-native';
import { DURATION_PRICING, formatNaira, type DurationType } from '@suredriver/shared-types';

interface Props {
  selected: DurationType | null;
  onSelect: (type: DurationType) => void;
}

export function DurationPicker({ selected, onSelect }: Props) {
  return (
    <View className="gap-2">
      {DURATION_PRICING.map((item) => {
        const active = selected === item.type;
        return (
          <Pressable
            key={item.type}
            onPress={() => onSelect(item.type)}
            className={`px-4 py-3 rounded-xl border-2 flex-row items-center justify-between ${active ? 'border-primary bg-green-50' : 'border-gray-200 bg-white'}`}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text className="text-xl font-bold text-primary">{item.label}</Text>
            <Text className="text-lg text-gray-700">{formatNaira(item.priceKobo)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
