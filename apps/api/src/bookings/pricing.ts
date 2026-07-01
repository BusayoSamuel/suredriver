import {
  DURATION_PRICING,
  DurationType,
  computePriceBreakdown,
} from '@suredriver/shared-types';

export function getDurationConfig(type: DurationType) {
  const config = DURATION_PRICING.find((d) => d.type === type);
  if (!config) throw new Error(`Unknown duration type: ${type}`);
  return config;
}

export function quoteBooking(type: DurationType) {
  const config = getDurationConfig(type);
  const breakdown = computePriceBreakdown(config.priceKobo);
  return {
    durationType: type,
    label: config.label,
    durationHours: config.hours,
    ...breakdown,
  };
}
