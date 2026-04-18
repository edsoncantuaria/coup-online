import TcpSocket from 'react-native-tcp-socket';

type Listener = (...args: unknown[]) => void;

/**
 * Cliente TCP com protocolo do {@link LanGameHost} — compatível com o que o
 * `useGameState` espera de um `Socket` (on/emit/disconnect).
 */
export class LanTcpClientSocket {
  id = '';
  private sock: ReturnType<typeof TcpSocket.createConnection> | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private onceListeners = new Map<string, Set<Listener>>();
  private buf = '';

  connect(host: string, port: number, timeoutMs = 15000): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          this.sock?.destroy?.();
        } catch {
          /* ignore */
        }
        this.sock = null;
        reject(new Error('Tempo esgotado ao conectar.'));
      }, timeoutMs);

      const socket = TcpSocket.createConnection(
        { port, host, reuseAddress: true },
        () => {
          /* TCP conectado — aguarda linha hi */
        }
      );
      this.sock = socket;

      socket.once('error', (e: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(e);
      });

      socket.on('data', (chunk: Buffer | string) => {
        const raw = typeof chunk === 'string' ? chunk : chunk.toString();
        this.buf += raw;
        const parts = this.buf.split('\n');
        this.buf = parts.pop() ?? '';
        for (const line of parts) {
          const lineTrim = line.trim();
          if (!lineTrim) continue;
          let msg: { t?: string; id?: string; e?: string; d?: unknown };
          try {
            msg = JSON.parse(lineTrim);
          } catch {
            continue;
          }
          if (msg.t === 'hi' && msg.id) {
            this.id = msg.id;
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              resolve();
            }
            continue;
          }
          if (msg.t === 'ev' && msg.e !== undefined) {
            this.dispatch(msg.e, msg.d);
          }
        }
      });

      socket.on('error', (e: Error) => {
        if (this.id) this.dispatch('disconnect', e);
      });

      socket.on('close', () => {
        this.dispatch('disconnect', {});
      });
    });
  }

  private dispatch(event: string, data?: unknown) {
    const payload = data !== undefined ? [data] : [];
    this.onceListeners.get(event)?.forEach((fn) => {
      try {
        fn(...payload);
      } catch {
        /* ignore */
      }
    });
    this.onceListeners.delete(event);
    this.listeners.get(event)?.forEach((fn) => {
      try {
        fn(...payload);
      } catch {
        /* ignore */
      }
    });
  }

  on(event: string, fn: Listener) {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(fn);
  }

  once(event: string, fn: Listener) {
    let set = this.onceListeners.get(event);
    if (!set) {
      set = new Set();
      this.onceListeners.set(event, set);
    }
    set.add(fn);
  }

  off(event: string, fn?: Listener) {
    if (fn) {
      this.listeners.get(event)?.delete(fn);
      this.onceListeners.get(event)?.delete(fn);
    } else {
      this.listeners.delete(event);
      this.onceListeners.delete(event);
    }
  }

  emit(event: string, data?: unknown) {
    if (!this.sock) return;
    const line = JSON.stringify({ t: 'e', e: event, d: data }) + '\n';
    try {
      this.sock.write(line);
    } catch {
      /* ignore */
    }
  }

  disconnect() {
    try {
      this.sock?.destroy?.();
    } catch {
      /* ignore */
    }
    this.sock = null;
  }

  removeAllListeners() {
    this.listeners.clear();
    this.onceListeners.clear();
  }
}

export function parseLanUrl(url: string): { host: string; port: number } | null {
  const m = url.match(/^lan:\/\/([^:]+):(\d+)$/i);
  if (!m) return null;
  return { host: m[1], port: parseInt(m[2], 10) };
}
