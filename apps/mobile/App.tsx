import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RecordingScreen } from './src/screens/RecordingScreen';
import { colors } from './src/theme';

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={colors.backgroundTop}
      />
      <RecordingScreen />
    </SafeAreaProvider>
  );
}

export default App;
