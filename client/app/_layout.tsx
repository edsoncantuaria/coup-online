import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { View, ImageBackground } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import '../global.css';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded] = useFonts({
    // Standard fonts, but we'll use system fonts for "Clean Medieval" look
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  return (
    <SafeAreaProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#F4E7D3' }, // Medieval BG
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="game/[roomId]" />
      </Stack>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
