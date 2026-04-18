import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initAudio, setMutedFlag, stopAllSfx } from '../utils/sound';
import { storage } from '../utils/storage';
import '../global.css';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded] = useFonts({});

  useEffect(() => {
    ScreenOrientation.lockAsync(
      ScreenOrientation.OrientationLock.LANDSCAPE
    ).catch(() => {});
  }, []);

  // Boot do sistema de áudio: preload + aplica mute persistido.
  useEffect(() => {
    (async () => {
      try {
        const muted = await storage.getMuted();
        setMutedFlag(muted);
        await initAudio();
      } catch {
        /* fallback silencioso */
      }
    })();
    return () => {
      stopAllSfx();
    };
  }, []);

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
          contentStyle: { backgroundColor: '#0B0F14' },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="index" />
      </Stack>
      <StatusBar style="light" hidden />
    </SafeAreaProvider>
  );
}
