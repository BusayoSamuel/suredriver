import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useAuth } from '@/context/AuthContext';
import { api, setApiToken, type EarningsResponse } from '@/services/api';
import { formatNaira } from '@suredriver/shared-types';

function payoutLabel(status?: string) {
  if (status === 'paid') return 'Paid';
  if (status === 'failed') return 'Failed';
  if (status === 'processing') return 'Processing';
  return 'Pending';
}

export default function DriverEarnings() {
  const { token } = useAuth();
  const [data, setData] = useState<EarningsResponse | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setApiToken(token);
    const earnings = await api.driverEarnings();
    setData(earnings);
  }, [token]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load().catch(() => undefined);
    setRefreshing(false);
  };

  return (
    <View className="flex-1 bg-surface">
      <ScreenHeader title="My earnings" closeHref="/(driver)/home" />
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-6"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {!data ? (
          <Text className="text-xl text-gray-500">Loading earnings…</Text>
        ) : (
          <>
            <View className="bg-white border-2 border-gray-200 rounded-2xl p-5 mb-8">
              <Text className="text-base font-semibold text-gray-500 mb-1">Total earned</Text>
              <Text className="text-3xl font-bold text-primary">
                {formatNaira(data.totalEarningsKobo)}
              </Text>
              <Text className="text-lg text-gray-600 mt-3">
                Rating {data.ratingAvg.toFixed(1)} · {data.ratingCount}{' '}
                {data.ratingCount === 1 ? 'review' : 'reviews'}
              </Text>
            </View>

            <Text className="text-2xl font-bold text-primary mb-4">Recent payouts</Text>
            {data.trips.length === 0 ? (
              <Text className="text-xl text-gray-500">No completed trips yet</Text>
            ) : (
              data.trips.map((trip) => {
                const paid = trip.payoutStatus === 'paid';
                return (
                  <View
                    key={trip.id}
                    className="bg-white border-2 border-gray-200 rounded-xl px-4 py-3 mb-2"
                  >
                    <View className="flex-row items-center justify-between">
                      <Text className="text-lg font-semibold text-primary">
                        {formatNaira(trip.driverPayoutKobo)}
                      </Text>
                      <View
                        className={`rounded-xl px-3 py-1 border-2 ${
                          paid ? 'border-primary bg-green-50' : 'border-gray-200 bg-surface'
                        }`}
                      >
                        <Text
                          className={`text-base font-semibold ${
                            paid ? 'text-primary' : 'text-gray-600'
                          }`}
                        >
                          {payoutLabel(trip.payoutStatus)}
                        </Text>
                      </View>
                    </View>
                    {trip.nombaTransferId ? (
                      <Text className="text-sm text-gray-500 mt-2">
                        Nomba: {trip.nombaTransferId}
                      </Text>
                    ) : null}
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
