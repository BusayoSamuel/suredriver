import Constants from 'expo-constants';

const defaultUrl =
  Constants.expoConfig?.extra?.apiUrl ??
  process.env.EXPO_PUBLIC_API_URL ??
  'http://localhost:3000';

export function getApiUrl() {
  return defaultUrl.replace(/\/$/, '');
}

let authToken: string | null = null;

export function setApiToken(token: string | null) {
  authToken = token;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const res = await fetch(`${defaultUrl}${path}`, { ...options, headers });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = {};
    }
  }
  if (!res.ok) {
    throw new Error((data as { message?: string })?.message ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  checkInvite: (phone: string) =>
    request<{ phone: string; role: string; needsPinSetup: boolean }>('/auth/check-invite', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),
  setupPin: (phone: string, pin: string, fullName?: string) =>
    request<{ accessToken: string; user: AuthUser }>('/auth/setup-pin', {
      method: 'POST',
      body: JSON.stringify({ phone, pin, fullName }),
    }),
  login: (phone: string, pin: string) =>
    request<{ accessToken: string; user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone, pin }),
    }),
  getMe: () => request<MeResponse>('/users/me'),
  updateMe: (body: Record<string, string>) =>
    request('/users/me', { method: 'PATCH', body: JSON.stringify(body) }),
  listVehicles: () => request<Vehicle[]>('/vehicles'),
  createVehicle: (body: Omit<Vehicle, 'id' | 'createdAt'>) =>
    request<Vehicle>('/vehicles', { method: 'POST', body: JSON.stringify(body) }),
  getQuote: (durationType: string) =>
    request<Quote>(`/bookings/quote?durationType=${durationType}`),
  createBooking: (body: CreateBookingBody) =>
    request<Booking>('/bookings', { method: 'POST', body: JSON.stringify(body) }),
  listBookings: () => request<Booking[]>('/bookings'),
  getBooking: (id: string) => request<Booking>(`/bookings/${id}`),
  checkout: (bookingId: string, callbackUrl?: string) =>
    request<{ checkoutLink: string; orderReference: string; mock?: boolean }>(
      `/payments/bookings/${bookingId}/checkout`,
      {
        method: 'POST',
        body: JSON.stringify({ callbackUrl }),
      },
    ),
  mockConfirmPayment: (bookingId: string) =>
    request<{
      bookingId: string;
      status: string;
      nombaOrderReference?: string;
      nombaTransactionId?: string;
    }>(`/payments/bookings/${bookingId}/mock-confirm`, { method: 'POST' }),
  confirmPayment: (bookingId: string) =>
    request<{
      bookingId: string;
      status: string;
      paymentStatus: string;
      nombaOrderReference?: string | null;
      nombaTransactionId?: string | null;
    }>(`/payments/bookings/${bookingId}/confirm`, { method: 'POST' }),
  reviewBooking: (id: string, rating: number, comment?: string) =>
    request(`/bookings/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ rating, comment }),
    }),
  driverOnboarding: (body: BankDetails) =>
    request('/drivers/onboarding', { method: 'POST', body: JSON.stringify(body) }),
  setOnline: (isOnline: boolean) =>
    request('/drivers/online', { method: 'PATCH', body: JSON.stringify({ isOnline }) }),
  jobOffers: () => request<Booking[]>('/drivers/jobs/offers'),
  activeJob: async () => {
    const job = await request<Booking | null>('/drivers/jobs/active');
    return job?.id ? job : null;
  },
  acceptJob: (id: string) => request<Booking>(`/bookings/${id}/accept`, { method: 'POST' }),
  updateTripStatus: (bookingId: string) =>
    request(`/trips/${bookingId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status: 'driver_en_route' }),
    }),
  startTrip: (bookingId: string) =>
    request(`/trips/${bookingId}/start`, { method: 'POST' }),
  endTrip: (bookingId: string) =>
    request<{
      payout?: { success: boolean; transferId?: string; amountKobo: number };
    }>(`/trips/${bookingId}/end`, { method: 'POST' }),
  driverEarnings: () => request<EarningsResponse>('/drivers/earnings'),
  registerPushToken: (token: string) =>
    request('/notifications/register', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),
};

interface AuthUser {
  id: string;
  phone: string;
  role: string;
  fullName: string | null;
}

export interface Vehicle {
  id: string;
  make: string;
  model: string;
  plateNumber: string;
  color?: string | null;
}

export interface Quote {
  durationType: string;
  label: string;
  durationHours: number;
  priceKobo: number;
  platformFeeKobo: number;
  driverPayoutKobo: number;
}

export interface CreateBookingBody {
  vehicleId: string;
  durationType: string;
  pickupAddress: string;
  notes?: string;
}

export interface Booking {
  id: string;
  status: string;
  pickupAddress: string;
  notes?: string | null;
  durationType: string;
  durationHours: number;
  priceKobo: number;
  platformFeeKobo: number;
  driverPayoutKobo: number;
  vehicle?: Vehicle;
  driver?: { fullName?: string | null; phone?: string };
  payment?: {
    status: string;
    payoutStatus?: string;
    checkoutLink?: string;
    nombaOrderReference?: string | null;
    nombaTransactionId?: string | null;
    nombaTransferId?: string | null;
    payoutAmountKobo?: number | null;
  };
  trip?: { startedAt?: string; endedAt?: string; statusHistory?: StatusEvent[] };
  review?: { rating: number } | null;
}

export interface StatusEvent {
  status: string;
  at: string;
}

export interface BankDetails {
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
}

export interface MeResponse {
  id: string;
  phone: string;
  role: string;
  fullName: string | null;
  ownerProfile?: {
    defaultAddress?: string | null;
    emergencyContact?: string | null;
    vehicles?: Vehicle[];
  };
  driverProfile?: {
    verificationStatus: string;
    isOnline: boolean;
    bankCode?: string | null;
    accountNumber?: string | null;
    totalEarningsKobo?: number;
  };
}

export interface EarningsResponse {
  totalEarningsKobo: number;
  ratingAvg: number;
  ratingCount: number;
  trips: {
    id: string;
    driverPayoutKobo: number;
    payoutStatus?: string;
    nombaTransferId?: string | null;
  }[];
}
