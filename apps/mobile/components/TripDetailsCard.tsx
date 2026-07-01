import { View, Text } from 'react-native';
import { DURATION_PRICING } from '@suredriver/shared-types';
import type { Booking } from '@/services/api';

const sectionTitleClass = 'text-2xl font-bold text-primary mb-4';
const rowClass = 'bg-white border-2 border-gray-200 rounded-xl px-4 py-3';
const labelClass = 'text-base font-semibold text-gray-500 mb-1';
const valueClass = 'text-lg font-semibold text-primary';

function parseBookingNotes(notes?: string | null) {
  const lines = (notes ?? '').split('\n').filter(Boolean);
  let carModel: string | null = null;
  let transmission: string | null = null;
  const descriptionLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('Car: ')) {
      carModel = line.slice(5);
    } else if (line.startsWith('Transmission: ')) {
      transmission = line.slice(14);
    } else {
      descriptionLines.push(line);
    }
  }

  return {
    carModel,
    transmission,
    description: descriptionLines.join('\n') || null,
  };
}

function getDurationLabel(booking: Pick<Booking, 'durationType' | 'durationHours'>) {
  return (
    DURATION_PRICING.find((item) => item.type === booking.durationType)?.label ??
    `${booking.durationHours} hours`
  );
}

type DetailRow =
  | { label: string; value: string; variant?: 'default' | 'badge' | 'multiline' };

function DetailField({ label, value, variant = 'default' }: DetailRow) {
  return (
    <View className={variant === 'multiline' ? `${rowClass} py-4` : rowClass}>
      <Text className={labelClass}>{label}</Text>
      {variant === 'badge' ? (
        <View className="self-start border-2 border-primary bg-green-50 rounded-xl px-4 py-2 mt-1">
          <Text className="text-lg font-bold text-primary">{value}</Text>
        </View>
      ) : (
        <Text
          className={`${valueClass} ${variant === 'multiline' ? 'leading-6' : ''}`}
          numberOfLines={variant === 'multiline' ? undefined : 3}
        >
          {value}
        </Text>
      )}
    </View>
  );
}

interface Props {
  booking: Pick<Booking, 'pickupAddress' | 'durationType' | 'durationHours' | 'notes'>;
}

export function TripDetailsCard({ booking }: Props) {
  const { carModel, transmission, description } = parseBookingNotes(booking.notes);
  const durationLabel = getDurationLabel(booking);

  const rows: DetailRow[] = [
    { label: 'Pickup address', value: booking.pickupAddress, variant: 'multiline' },
    { label: 'Duration', value: durationLabel, variant: 'badge' },
  ];

  if (carModel) rows.push({ label: 'Car model', value: carModel });
  if (transmission) rows.push({ label: 'Transmission', value: transmission, variant: 'badge' });
  if (description) rows.push({ label: 'Description', value: description, variant: 'multiline' });

  return (
    <View className="mb-6">
      <Text className={sectionTitleClass}>Trip details</Text>
      <View className="gap-2">
        {rows.map((row) => (
          <DetailField key={row.label} {...row} />
        ))}
      </View>
    </View>
  );
}
