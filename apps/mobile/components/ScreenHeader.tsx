import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, type Href } from 'expo-router';

/** Fixed inner bar height — keeps SureDriver and Book a driver headers aligned. */
export const SCREEN_HEADER_BAR_HEIGHT = 48;

interface Props {
  title: string;
  onClose?: () => void;
  /** Pop the stack back to this route instead of pushing a new screen. */
  closeHref?: Href;
  showClose?: boolean;
}

export function ScreenHeader({ title, onClose, closeHref, showClose = true }: Props) {
  const handleClose =
    onClose ??
    (() => {
      if (closeHref) {
        router.dismissTo(closeHref);
        return;
      }
      router.back();
    });

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.bar}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {showClose ? (
          <Pressable
            onPress={handleClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={styles.closeButton}
          >
            <Text style={styles.closeIcon}>×</Text>
          </Pressable>
        ) : (
          <View style={styles.closePlaceholder} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#1B4332',
  },
  bar: {
    height: SCREEN_HEADER_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  title: {
    flex: 1,
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -8,
  },
  closePlaceholder: {
    width: 40,
    height: 40,
  },
  closeIcon: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 28,
    marginTop: -2,
  },
});
