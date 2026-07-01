import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { AccessibleButton } from '@/components/AccessibleButton';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useAuth } from '@/context/AuthContext';
import { api, setApiToken, type Booking } from '@/services/api';
import { formatNaira } from '@suredriver/shared-types';

const ACTIVE_STATUS_LABELS: Record<string, string> = {
  driver_assigned: 'Accepted',
  driver_en_route: 'En route',
  in_progress: 'In progress',
};

const ACTIVE_JOB_STATUSES = new Set(Object.keys(ACTIVE_STATUS_LABELS));

function getActiveStatusLabel(status: string) {
  return ACTIVE_STATUS_LABELS[status] ?? status.replace(/_/g, ' ');
}

export default function DriverHome() {
  const { user, token, signOut } = useAuth();
  const [activeJob, setActiveJob] = useState<Booking | null>(null);
  const [jobs, setJobs] = useState<Booking[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setApiToken(token);
    const profile = await api.getMe();

    if (profile.driverProfile?.verificationStatus !== 'approved') {
      router.replace('/(driver)/onboarding');
      return;
    }

    if (!profile.driverProfile?.isOnline) {
      await api.setOnline(true);
    }

    const offers = await api.jobOffers();
    const current = await api.activeJob();
    setActiveJob(
      current?.status && ACTIVE_JOB_STATUSES.has(current.status) ? current : null,
    );
    setJobs(offers);
  }, [token]);

  useEffect(() => {
    load().catch(() => undefined);
    const interval = setInterval(() => load().catch(() => undefined), 5000);
    return () => clearInterval(interval);
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load().catch(() => undefined);
    setRefreshing(false);
  };

  return (
    <View className="flex-1 bg-surface">
      <ScreenHeader title="SureDriver" showClose={false} />
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-6 pb-4"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text className="text-3xl font-bold text-primary mb-8">
          Hello{user?.fullName ? `, ${user.fullName}` : ''}
        </Text>

        {activeJob ? (
          <>
            <Text className="text-2xl font-bold text-primary mb-4">Active job</Text>
            <Pressable
              className="border-2 border-accent bg-green-50 rounded-xl px-4 py-3 mb-8"
              onPress={() => router.push(`/(driver)/job/${activeJob.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`Active job at ${activeJob.pickupAddress}`}
            >
              <Text className="text-lg font-semibold text-primary" numberOfLines={1}>
                {activeJob.pickupAddress} — {formatNaira(activeJob.driverPayoutKobo)}
              </Text>
              <Text className="text-base text-gray-600 mt-1">
                {getActiveStatusLabel(activeJob.status)}
              </Text>
            </Pressable>
          </>
        ) : null}

        <Text className="text-2xl font-bold text-primary mb-4">Available jobs</Text>
        {jobs.length === 0 ? (
          <Text className="text-xl text-gray-500">No jobs right now</Text>
        ) : (
          jobs.map((job) => (
            <Pressable
              key={job.id}
              className="border-2 border-primary bg-white rounded-xl px-4 py-3 mb-2"
              onPress={() => router.push(`/(driver)/job/${job.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`Job at ${job.pickupAddress}`}
            >
              <Text className="text-lg font-semibold text-primary" numberOfLines={1}>
                {job.pickupAddress} — {formatNaira(job.priceKobo)}
              </Text>
            </Pressable>
          ))
        )}

      </ScrollView>

      <SafeAreaView edges={['bottom']} className="bg-surface px-6 pt-2 pb-2">
        <AccessibleButton
          title="My earnings"
          variant="secondary"
          size="field"
          onPress={() => router.push('/(driver)/earnings')}
        />
        <AccessibleButton title="Sign out" variant="outline" size="field" className="mt-3" onPress={signOut} />
      </SafeAreaView>
    </View>
  );
}
