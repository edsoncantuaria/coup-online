import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  playerName: '@coup/player_name',
  muted: '@coup/muted',
};

export const storage = {
  async getPlayerName(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(KEYS.playerName);
    } catch {
      return null;
    }
  },
  async setPlayerName(name: string): Promise<void> {
    try {
      await AsyncStorage.setItem(KEYS.playerName, name);
    } catch {
      // ignora
    }
  },
  async getMuted(): Promise<boolean> {
    try {
      const v = await AsyncStorage.getItem(KEYS.muted);
      return v === '1';
    } catch {
      return false;
    }
  },
  async setMuted(muted: boolean): Promise<void> {
    try {
      await AsyncStorage.setItem(KEYS.muted, muted ? '1' : '0');
    } catch {
      // ignora
    }
  },
};
