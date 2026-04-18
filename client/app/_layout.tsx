import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  initAudio,
  setMutedFlag,
  setSfxVolume,
  setMusicVolume,
  stopAllSfx,
} from '../utils/sound';
import { storage } from '../utils/storage';
import { configureNotificationHandler } from '../utils/notifications';
import '../global.css';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded] = useFonts({});

  useEffect(() => {
    ScreenOrientation.lockAsync(
      ScreenOrientation.OrientationLock.LANDSCAPE
    ).catch(() => {});
  }, []);

  // Boot do sistema de áudio: preload + volumes persistidos.
  useEffect(() => {
    (async () => {
      try {
        const muted = await storage.getMuted();
        const sfx = await storage.getAudioSfxVol();
        const music = await storage.getAudioMusicVol();
        setSfxVolume(sfx);
        setMusicVolume(music);
        setMutedFlag(muted);
        await initAudio();
        await configureNotificationHandler();
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
    <GestureHandlerRootView style={{ flex: 1 }}>
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
    </GestureHandlerRootView>
  );
}
