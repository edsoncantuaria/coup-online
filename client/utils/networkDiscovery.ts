import { Platform } from 'react-native';
import * as Network from 'expo-network';
import TcpSocket from 'react-native-tcp-socket';
import { DEFAULT_SERVER_PORT } from '../constants/Online';
import {
  COUP_OK,
  COUP_PING,
  LAN_HOST_PORT_MAX,
  LAN_HOST_PORT_MIN,
} from '../host/lanConstants';
import { parseLanUrl } from '../host/LanTcpClientSocket';

export type LobbyRoomSummary = {
  roomId: string;
  displayName: string;
  players: number;
  maxPlayers: number;
  hasPassword: boolean;
  inGame: boolean;
};

async function probeHttp(baseUrl: string): Promise<boolean> {
  const c = new AbortController();
  const id = setTimeout(() => c.abort(), 450);
  try {
    const r = await fetch(`${baseUrl}/api/ping`, {
      method: 'GET',
      signal: c.signal,
    });
    clearTimeout(id);
    return r.ok;
  } catch {
    clearTimeout(id);
    return false;
  }
}

/** Descobre um anfitrião com app (TCP) na LAN. */
async function probeLanHost(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const socket = TcpSocket.createConnection(
        { port, host, reuseAddress: true },
        () => {
          try {
            socket.write(COUP_PING);
          } catch {
            resolve(false);
          }
        }
      );
      const t = setTimeout(() => {
        try {
          socket.destroy();
        } catch {
          /* ignore */
        }
        resolve(false);
      }, 500);
      socket.on('data', (chunk: Buffer | string) => {
        const s = typeof chunk === 'string' ? chunk : chunk.toString();
        if (s.includes('COUP_OK')) {
          clearTimeout(t);
          try {
            socket.destroy();
          } catch {
            /* ignore */
          }
          resolve(true);
        }
      });
      socket.on('error', () => {
        clearTimeout(t);
        resolve(false);
      });
    } catch {
      resolve(false);
    }
  });
}

async function tryHostLanPorts(host: string): Promise<string | null> {
  for (let port = LAN_HOST_PORT_MIN; port <= LAN_HOST_PORT_MAX; port++) {
    if (await probeLanHost(host, port)) {
      return `lan://${host}:${port}`;
    }
  }
  return null;
}

async function tryHostHttp(host: string, port: number): Promise<string | null> {
  const url = `http://${host}:${port}`;
  if (await probeHttp(url)) return url;
  return null;
}

/**
 * Procura mesa na mesma rede: primeiro app anfitrião (TCP no celular), depois
 * servidor clássico em PC (HTTP / socket.io).
 */
export async function discoverLanServerUrl(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return null;
  }
  let ip: string;
  try {
    ip = await Network.getIpAddressAsync();
  } catch {
    return null;
  }
  if (!ip || ip === '0.0.0.0') return null;
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const prefix = `${parts[0]}.${parts[1]}.${parts[2]}`;

  const selfLan = await tryHostLanPorts(ip);
  if (selfLan) return selfLan;

  const selfHttp = await tryHostHttp(ip, DEFAULT_SERVER_PORT);
  if (selfHttp) return selfHttp;

  for (let start = 1; start <= 254; start += 16) {
    const batch: Promise<string | null>[] = [];
    for (let j = 0; j < 16 && start + j <= 254; j++) {
      const host = `${prefix}.${start + j}`;
      batch.push(
        (async () => {
          const lan = await tryHostLanPorts(host);
          if (lan) return lan;
          return tryHostHttp(host, DEFAULT_SERVER_PORT);
        })()
      );
    }
    const results = await Promise.all(batch);
    const hit = results.find((r) => r !== null);
    if (hit) return hit;
  }
  return null;
}

function fetchLobbyRoomsLan(host: string, port: number): Promise<LobbyRoomSummary[]> {
  return new Promise((resolve) => {
    let buf = '';
    let socket: ReturnType<typeof TcpSocket.createConnection> | null = null;
    const done = (rooms: LobbyRoomSummary[]) => {
      try {
        socket?.destroy?.();
      } catch {
        /* ignore */
      }
      resolve(rooms);
    };
    const timer = setTimeout(() => done([]), 8000);
    try {
      socket = TcpSocket.createConnection({ port, host, reuseAddress: true }, () => {
        try {
          socket?.write(`${JSON.stringify({ t: 'rpc', m: 'rooms' })}\n`);
        } catch {
          clearTimeout(timer);
          done([]);
        }
      });
    } catch {
      clearTimeout(timer);
      done([]);
      return;
    }
    socket.on('data', (chunk: Buffer | string) => {
      buf += typeof chunk === 'string' ? chunk : chunk.toString();
      const parts = buf.split('\n');
      buf = parts.pop() ?? '';
      for (const line of parts) {
        const lineTrim = line.trim();
        if (!lineTrim) continue;
        try {
          const msg = JSON.parse(lineTrim) as {
            t?: string;
            m?: string;
            d?: { rooms?: LobbyRoomSummary[] };
          };
          if (msg.t === 'rpc_ok' && msg.m === 'rooms' && msg.d?.rooms) {
            clearTimeout(timer);
            done(Array.isArray(msg.d.rooms) ? msg.d.rooms : []);
            return;
          }
        } catch {
          /* ignore malformed */
        }
      }
    });
    socket.on('error', () => {
      clearTimeout(timer);
      done([]);
    });
  });
}

export async function fetchLobbyRooms(
  baseUrl: string
): Promise<LobbyRoomSummary[]> {
  if (baseUrl.startsWith('lan://')) {
    const parsed = parseLanUrl(baseUrl);
    if (!parsed) return [];
    return fetchLobbyRoomsLan(parsed.host, parsed.port);
  }
  const root = baseUrl.replace(/\/$/, '');
  const c = new AbortController();
  const id = setTimeout(() => c.abort(), 8000);
  try {
    const r = await fetch(`${root}/api/rooms`, { signal: c.signal });
    clearTimeout(id);
    if (!r.ok) return [];
    const j = (await r.json()) as { rooms?: LobbyRoomSummary[] };
    return Array.isArray(j.rooms) ? j.rooms : [];
  } catch {
    clearTimeout(id);
    return [];
  }
}
