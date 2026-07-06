import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Text,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewNavigation } from 'react-native-webview';
import { getApiUrl } from '@/services/api';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isReturnUrl(url: string) {
  try {
    const parsed = new URL(url);
    const base = new URL(getApiUrl());
    return parsed.origin === base.origin && parsed.pathname === '/payments/return';
  } catch {
    return url.includes('/payments/return');
  }
}

function isCheckoutPage(url: string) {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname.includes('checkout') ||
      parsed.pathname.includes('/pay/') ||
      parsed.pathname.includes('/checkout')
    );
  } catch {
    return false;
  }
}

function isMarketingHomepage(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    return host === 'nomba.com' && (parsed.pathname === '/' || parsed.pathname === '');
  } catch {
    return false;
  }
}

interface Props {
  visible: boolean;
  checkoutUrl: string;
  bookingId: string;
  confirmPaid: (bookingId: string) => Promise<boolean>;
  onPaid: () => void;
  onClose: () => void;
}

export function NombaCheckoutWebView({
  visible,
  checkoutUrl,
  bookingId,
  confirmPaid,
  onPaid,
  onClose,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const paidRef = useRef(false);
  const stopPollRef = useRef(false);
  const sawCheckoutPageRef = useRef(false);
  const confirmBurstRef = useRef(false);

  const finishIfPaid = useCallback(async () => {
    if (paidRef.current || stopPollRef.current) return false;
    const paid = await confirmPaid(bookingId);
    if (paid) {
      paidRef.current = true;
      stopPollRef.current = true;
      onPaid();
      return true;
    }
    return false;
  }, [bookingId, confirmPaid, onPaid]);

  const burstConfirm = useCallback(async () => {
    if (paidRef.current || confirmBurstRef.current) return;
    confirmBurstRef.current = true;
    setConfirming(true);
    try {
      for (let attempt = 0; attempt < 40; attempt++) {
        if (stopPollRef.current || paidRef.current) return;
        if (await finishIfPaid()) return;
        await sleep(3000);
      }
    } finally {
      confirmBurstRef.current = false;
      if (!paidRef.current) setConfirming(false);
    }
  }, [finishIfPaid]);

  useEffect(() => {
    if (!visible) return;

    paidRef.current = false;
    stopPollRef.current = false;
    sawCheckoutPageRef.current = false;
    confirmBurstRef.current = false;
    setConfirming(false);

    const poll = async () => {
      await sleep(1500);
      while (!stopPollRef.current && !paidRef.current) {
        await finishIfPaid();
        if (stopPollRef.current || paidRef.current) break;
        await sleep(2000);
      }
    };

    void poll();
    return () => {
      stopPollRef.current = true;
    };
  }, [visible, bookingId, finishIfPaid]);

  const handleNavigation = (navState: WebViewNavigation) => {
    const url = navState.url;
    if (isCheckoutPage(url)) sawCheckoutPageRef.current = true;

    if (isReturnUrl(url)) {
      void burstConfirm();
      return;
    }

    if (url.includes('orderReference=') || url.includes('payment-success')) {
      void burstConfirm();
      return;
    }

    if (sawCheckoutPageRef.current && isMarketingHomepage(url)) {
      void burstConfirm();
    }
  };

  const handleClose = () => {
    if (confirming) return;
    stopPollRef.current = true;
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View className="flex-1 bg-white pt-14">
        <View className="flex-row items-center justify-between px-4 pb-3 border-b border-gray-200">
          <Pressable
            onPress={handleClose}
            disabled={confirming}
            className="px-3 py-2"
            accessibilityRole="button"
            accessibilityLabel="Close checkout"
          >
            <Text className="text-lg font-semibold text-primary">Close</Text>
          </Pressable>
          <Text className="text-lg font-bold text-primary">Nomba Checkout</Text>
          <View className="w-16" />
        </View>

        {confirming ? (
          <View className="absolute inset-0 z-10 bg-white/90 items-center justify-center gap-3">
            <ActivityIndicator size="large" color="#1B4332" />
            <Text className="text-lg text-primary">Confirming payment…</Text>
          </View>
        ) : null}

        <WebView
          source={{ uri: checkoutUrl }}
          onNavigationStateChange={handleNavigation}
          onShouldStartLoadWithRequest={(request) => {
            handleNavigation({ url: request.url } as WebViewNavigation);
            return true;
          }}
          startInLoadingState
          renderLoading={() => (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="large" color="#1B4332" />
            </View>
          )}
        />
      </View>
    </Modal>
  );
}
