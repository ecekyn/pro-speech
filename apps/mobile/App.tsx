import React from 'react';
import { StatusBar } from 'react-native';
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from 'react-native-safe-area-context';
import { RecordingScreen } from './src/screens/RecordingScreen';

function App() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <StatusBar barStyle="dark-content" />
      <RecordingScreen />
    </SafeAreaProvider>
  );
}

export default App;
