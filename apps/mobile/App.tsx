import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from 'react-native-safe-area-context';
import { RecordingScreen } from './src/screens/RecordingScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { VoiceProfileStatus, getVoiceProfile } from './src/services/api';
import { GradientBackdrop } from './src/components/primitives';
import { colors, spacing } from './src/theme';

function App() {
  const [isCheckingProfile, setIsCheckingProfile] = useState(true);
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfileStatus | null>(
    null,
  );

  useEffect(() => {
    let isMounted = true;

    getVoiceProfile()
      .then(status => {
        if (isMounted) {
          setVoiceProfile(status);
        }
      })
      .catch((error: any) => {
        if (!isMounted) {
          return;
        }

        setVoiceProfile({ enrolled: false });
        Alert.alert(
          'Voice Profile Error',
          error.message || 'Failed to load voice profile.',
        );
      })
      .finally(() => {
        if (isMounted) {
          setIsCheckingProfile(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <StatusBar barStyle="dark-content" />
      {isCheckingProfile ? (
        <StartupScreen />
      ) : voiceProfile?.enrolled ? (
        <RecordingScreen initialVoiceProfile={voiceProfile} />
      ) : (
        <OnboardingScreen onComplete={setVoiceProfile} />
      )}
    </SafeAreaProvider>
  );
}

function StartupScreen() {
  return (
    <View style={styles.root}>
      <GradientBackdrop />
      <View style={styles.loadingContent}>
        <ActivityIndicator color={colors.indigo} />
        <Text style={styles.loadingText}>Checking voice profile</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#EEF2FF',
  },
  loadingContent: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
  },
  loadingText: {
    color: colors.inkMuted,
    fontSize: 14,
    fontWeight: '700',
  },
});

export default App;
