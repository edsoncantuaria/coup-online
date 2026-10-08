import type { Server } from 'socket.io';
import type { MatchMember } from '../socket/RoomManager.js';

export type MatchmakerOptions = {
  /** Mesa cheia: começa na hora. */
  maxPlayers: number;
  /** Com pelo menos isso de humanos, começa depois de `gatherMs`. */
  minPlayers: number;
  /** Espera extra para juntar mais gente quando já dá para começar. */
  gatherMs: number;
  /** Depois disso o mais antigo da fila não espera mais: bots completam a mesa. */
  botFillMs: number;
  /** Tamanho da mesa quando bots completam. */
  botFillTarget: number;
  /** Intervalo do relógio da fila (status + checagem). */
  tickMs: number;
};

type Ticket = MatchMember & { userId?: string; joinedAt: number };

export type QueueStatus =
  | { state: 'idle' }
  | {
      state: 'searching';
      position: number;
      queued: number;
      waitedMs: number;
      /** Quanto falta para começar com bots, se ninguém mais chegar. */
      botFillInMs: number;
    }
  | { state: 'matched'; roomId: string };

/**
 * Fila de "Buscar partida": junta jogadores sem sala numa partida pública.
 * Mesa cheia começa na hora; com o mínimo de humanos, espera um pouco para
 * juntar mais; se a espera do mais antigo passar de `botFillMs`, bots
 * completam os lugares vazios.
 */
export class Matchmaker {
  private queue: Ticket[] = [];
  private timer: ReturnType<typeof setInterval>;

  constructor(
    private io: Server,
    private opts: MatchmakerOptions,
    private startMatch: (members: MatchMember[], bots: number) => string | undefined,
    private onPresence: (socketIds: string[]) => void,
  ) {
    this.timer = setInterval(() => this.tick(), opts.tickMs);
    this.timer.unref?.();
  }

  isQueued(socketId: string): boolean {
    return this.queue.some((t) => t.socketId === socketId);
  }

  get size(): number {
    return this.queue.length;
  }

  join(socketId: string, name: string, userId?: string): QueueStatus {
    const existing = this.queue.find((t) => t.socketId === socketId);
    if (existing) {
      existing.name = name;
    } else {
      // A mesma conta em dois aparelhos fica uma vez só na fila.
      if (userId) {
        for (const t of this.queue.filter((t) => t.userId === userId)) this.leave(t.socketId);
      }
      this.queue.push({ socketId, name, joinedAt: Date.now(), ...(userId ? { userId } : {}) });
      this.onPresence([socketId]);
    }
    this.tick();
    return this.statusOf(socketId);
  }

  /** Tira da fila; avisa o cliente se ele estava lá. */
  leave(socketId: string, notify = true) {
    const before = this.queue.length;
    this.queue = this.queue.filter((t) => t.socketId !== socketId);
    if (this.queue.length === before) return;
    if (notify) this.io.to(socketId).emit('queue_status', { state: 'idle' });
    this.onPresence([socketId]);
    this.broadcastStatus();
  }

  statusOf(socketId: string, now = Date.now()): QueueStatus {
    const idx = this.queue.findIndex((t) => t.socketId === socketId);
    if (idx < 0) return { state: 'idle' };
    const oldest = this.queue[0]!;
    return {
      state: 'searching',
      position: idx + 1,
      queued: this.queue.length,
      waitedMs: now - this.queue[idx]!.joinedAt,
      botFillInMs: Math.max(0, this.opts.botFillMs - (now - oldest.joinedAt)),
    };
  }

  /** Forma as partidas possíveis agora. */
  tick(now = Date.now()) {
    // Quem caiu sai da fila.
    this.queue = this.queue.filter((t) => this.io.sockets.sockets.get(t.socketId)?.connected);
    for (;;) {
      const q = this.queue;
      if (q.length === 0) break;
      const waited = now - q[0]!.joinedAt;
      let take = 0;
      let bots = 0;
      if (q.length >= this.opts.maxPlayers) {
        take = this.opts.maxPlayers;
      } else if (q.length >= this.opts.minPlayers && waited >= this.opts.gatherMs) {
        take = q.length;
      } else if (waited >= this.opts.botFillMs) {
        take = q.length;
        bots = Math.max(0, this.opts.botFillTarget - take);
      }
      if (take === 0) break;
      const group = q.slice(0, take);
      this.queue = q.slice(take);
      const roomId = this.startMatch(
        group.map(({ socketId, name }) => ({ socketId, name })),
        bots,
      );
      if (!roomId) continue;
      for (const t of group) {
        this.io.to(t.socketId).emit('queue_status', { state: 'matched', roomId });
      }
    }
    this.broadcastStatus(now);
  }

  private broadcastStatus(now = Date.now()) {
    for (const t of this.queue) {
      this.io.to(t.socketId).emit('queue_status', this.statusOf(t.socketId, now));
    }
  }

  close() {
    clearInterval(this.timer);
  }
}
