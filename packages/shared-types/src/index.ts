export type UserRole = 'owner' | 'driver' | 'admin';

export type VerificationStatus = 'pending' | 'approved' | 'rejected';

export type DurationType = 'hourly' | 'half_day' | 'full_day';

export type BookingStatus =
  | 'requested'
  | 'awaiting_payment'
  | 'paid'
  | 'driver_assigned'
  | 'driver_en_route'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export type PayoutStatus = 'pending' | 'processing' | 'paid' | 'failed';

export interface DurationPricing {
  type: DurationType;
  label: string;
  hours: number;
  priceKobo: number;
}

export const DURATION_PRICING: DurationPricing[] = [
  { type: 'hourly', label: '2 Hours', hours: 2, priceKobo: 600_000 },
  { type: 'half_day', label: 'Half Day (4 hrs)', hours: 4, priceKobo: 1_000_000 },
  { type: 'full_day', label: 'Full Day (8 hrs)', hours: 8, priceKobo: 1_800_000 },
];

export const PLATFORM_FEE_PERCENT = 0.15;

export const SUPPORT_PHONE = '+2348000000000';
export const SUPPORT_WHATSAPP = '2348000000000';
export const KYC_WHATSAPP = '2348000000001';

export function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;
}

export function computePriceBreakdown(priceKobo: number) {
  const platformFeeKobo = Math.round(priceKobo * PLATFORM_FEE_PERCENT);
  const driverPayoutKobo = priceKobo - platformFeeKobo;
  return { priceKobo, platformFeeKobo, driverPayoutKobo };
}
