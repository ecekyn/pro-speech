import { PermissionsAndroid, Platform } from 'react-native';

export async function requestMicrophonePermission() {
  if (Platform.OS !== 'android') {
    return true;
  }

  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    {
      title: 'Microphone access',
      message: 'Pro Speech needs microphone access to analyze conversations.',
      buttonPositive: 'Allow',
      buttonNegative: 'Cancel',
    },
  );

  return result === PermissionsAndroid.RESULTS.GRANTED;
}
