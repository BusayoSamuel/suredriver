import { View, Text } from 'react-native';
import { formatNaira } from '@suredriver/shared-types';

type PaymentInfo = {
  status?: string;
  nombaOrderReference?: string | null;
  nombaTransactionId?: string | null;
  nombaTransferId?: string | null;
  payoutStatus?: string | null;
  payoutAmountKobo?: number | null;
};

interface Props {
  title: string;
  priceKobo: number;
  platformFeeKobo?: number;
  driverPayoutKobo?: number;
  payment?: PaymentInfo | null;
  mode: 'owner' | 'driver';
}

function statusLabel(status?: string | null) {
  if (!status) return '—';
  return status.replace(/_/g, ' ');
}

export function NombaPaymentCard({
  title,
  priceKobo,
  platformFeeKobo,
  driverPayoutKobo,
  payment,
  mode,
}: Props) {
  const payoutAmount = payment?.payoutAmountKobo ?? driverPayoutKobo;

  return (
    <View className="mb-6">
      <Text className="text-2xl font-bold text-primary mb-4">{title}</Text>
      <View className="bg-white border-2 border-gray-200 rounded-2xl p-5 gap-3">
        {mode === 'owner' ? (
          <>
            <Row label="Trip total" value={formatNaira(priceKobo)} />
            {platformFeeKobo != null ? (
              <Row label="Platform fee (15%)" value={formatNaira(platformFeeKobo)} />
            ) : null}
            {driverPayoutKobo != null ? (
              <Row label="Driver receives" value={formatNaira(driverPayoutKobo)} />
            ) : null}
            <Row label="Payment status" value={statusLabel(payment?.status)} />
            {payment?.nombaOrderReference ? (
              <Row label="Nomba order ref" value={payment.nombaOrderReference} />
            ) : null}
            {payment?.nombaTransactionId ? (
              <Row label="Transaction ID" value={payment.nombaTransactionId} />
            ) : null}
          </>
        ) : (
          <>
            <Row label="Your payout" value={payoutAmount != null ? formatNaira(payoutAmount) : '—'} />
            <Row label="Payout status" value={statusLabel(payment?.payoutStatus)} />
            {payment?.nombaTransferId ? (
              <Row label="Nomba transfer ID" value={payment.nombaTransferId} />
            ) : null}
          </>
        )}
        <Text className="text-sm text-gray-500 mt-1">
          {mode === 'owner'
            ? 'Collected via Nomba Checkout'
            : 'Sent via Nomba Transfers API'}
        </Text>
      </View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text className="text-base font-semibold text-gray-500">{label}</Text>
      <Text className="text-lg font-semibold text-primary">{value}</Text>
    </View>
  );
}
