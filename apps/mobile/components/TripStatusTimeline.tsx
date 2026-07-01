import { View, Text } from 'react-native';
import type { StatusEvent } from '@/services/api';

const STEPS = ['paid', 'driver_assigned', 'driver_en_route', 'in_progress', 'completed'] as const;

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
  paymentStatus?: string;
}

function progressIndex(currentStatus: string, history: StatusEvent[], paymentStatus?: string) {
  let max = -1;

  const statusIdx = STEPS.indexOf(currentStatus as (typeof STEPS)[number]);
  if (statusIdx >= 0) max = statusIdx;

  if (currentStatus === 'awaiting_payment' && paymentStatus === 'paid') {
    max = Math.max(max, 0);
  }

  for (const event of history) {
    const idx = STEPS.indexOf(event.status as (typeof STEPS)[number]);
    if (idx >= 0) max = Math.max(max, idx);
  }

  if (paymentStatus === 'paid') max = Math.max(max, 0);

  return max;
}

export function TripStatusTimeline({ currentStatus, history = [], paymentStatus }: Props) {
  const historyArr = Array.isArray(history) ? history : [];
  const maxIndex = progressIndex(currentStatus, historyArr, paymentStatus);
  const awaitingPayment =
    currentStatus === 'awaiting_payment' && paymentStatus !== 'paid';

  return (
    <View className="bg-white rounded-2xl p-5 gap-4">
      <Text className="text-2xl font-bold text-primary mb-2">Trip status</Text>
      {awaitingPayment ? (
        <Text className="text-lg text-amber-700 mb-1">
          Complete Nomba payment to confirm your request.
        </Text>
      ) : null}
      {STEPS.map((step, index) => {
        const done = index <= maxIndex;
        const active = index === maxIndex + 1 && maxIndex >= 0;
        return (
          <View key={step} className="flex-row items-center gap-4">
            <View
              className={`w-4 h-4 rounded-full ${
                done ? 'bg-accent' : active ? 'bg-primary' : 'bg-gray-300'
              }`}
            />
            <Text
              className={`text-xl ${
                done ? 'text-primary font-semibold' : active ? 'text-primary' : 'text-gray-400'
              }`}
            >
              {LABELS[step] ?? step}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
