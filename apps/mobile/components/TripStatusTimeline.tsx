import { View, Text } from 'react-native';
import type { StatusEvent } from '@/services/api';

const LABELS: Record<string, string> = {
  awaiting_payment: 'Awaiting payment',
  paid: 'Request made',
  driver_assigned: 'Driver assigned',
  driver_en_route: 'Driver en route',
  in_progress: 'Trip in progress',
  completed: 'Trip completed',
};

interface Props {
  currentStatus: string;
  history?: StatusEvent[];
}

export function TripStatusTimeline({ currentStatus, history = [] }: Props) {
  const steps = [
    'paid',
    'driver_assigned',
    'driver_en_route',
    'in_progress',
    'completed',
  ];

  const currentIndex = steps.indexOf(currentStatus);

  return (
    <View className="bg-white rounded-2xl p-5 gap-4">
      <Text className="text-2xl font-bold text-primary mb-2">Trip status</Text>
      {steps.map((step, index) => {
        const done = index <= currentIndex || history.some((h) => h.status === step);
        return (
          <View key={step} className="flex-row items-center gap-4">
            <View
              className={`w-4 h-4 rounded-full ${done ? 'bg-accent' : 'bg-gray-300'}`}
            />
            <Text className={`text-xl ${done ? 'text-primary font-semibold' : 'text-gray-400'}`}>
              {LABELS[step] ?? step}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
