import Constants from 'expo-constants';

/** Porta padrão do servidor Coup (socket.io). */
export const DEFAULT_SERVER_PORT = 3000;

/**
 * URL do servidor na Internet (Socket.IO).
 * Defina `EXPO_PUBLIC_SERVER_URL` no build (ex.: https://api.seudominio.com).
 * Em dev, cai em localhost (útil no emulador; em celular físico use o IP da máquina ou a env).
 */
export function getInternetServerUrl(): string {
  const env = process.env.EXPO_PUBLIC_SERVER_URL;
  if (typeof env === 'string' && env.trim().startsWith('http')) {
    return env.trim().replace(/\/$/, '');
  }
  const extra = Constants.expoConfig?.extra as { serverUrl?: string } | undefined;
  if (extra?.serverUrl?.startsWith('http')) {
    return extra.serverUrl.replace(/\/$/, '');
  }
  return 'http://127.0.0.1:3000';
}

/** Monta URL para partida na LAN (mesmo Wi‑Fi). */
export function buildLanServerUrl(host: string, port: string | number): string {
  const h = host.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
  const p = String(port).trim() || String(DEFAULT_SERVER_PORT);
  return `http://${h}:${p}`;
}
