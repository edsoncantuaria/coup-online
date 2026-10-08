import type { Server } from 'socket.io';
import { AccountService, IdentityRegistry, type UserRecord } from '../accounts/AccountService.js';
import { AppError } from '../errors.js';

/** Limite de amigos por conta e de pedidos pendentes. */
const MAX_FRIENDS = 200;
const MAX_PENDING = 100;

export type FriendStatus = 'offline' | 'online' | 'searching' | 'in_lobby' | 'in_match';

const STATUS_RANK: Record<FriendStatus, number> = {
  offline: 0,
  online: 1,
  searching: 2,
  in_lobby: 3,
  in_match: 4,
};

/**
 * Amizades entre contas: pedido → aceite, lista com situação ao vivo
 * (online, buscando partida, no lobby, em partida).
 */
export class FriendService {
  constructor(
    private io: Server,
    private accounts: AccountService,
    private identities: IdentityRegistry,
    /** Situação de um socket específico (sala/fila), sem contar "online". */
    private socketStatus: (socketId: string) => FriendStatus | undefined,
  ) {}

  statusOf(userId: string): FriendStatus {
    let best: FriendStatus = 'offline';
    for (const sid of this.identities.socketsOf(userId)) {
      const s = this.socketStatus(sid) ?? 'online';
      if (STATUS_RANK[s] > STATUS_RANK[best]) best = s;
    }
    return best;
  }

  listFor(userId: string) {
    const me = this.require(userId);
    const ref = (id: string) => {
      const u = this.accounts.get(id);
      return u ? { userId: u.id, username: u.username } : undefined;
    };
    const friends = me.friends
      .map((id) => {
        const r = ref(id);
        return r ? { ...r, status: this.statusOf(id) } : undefined;
      })
      .filter((x) => !!x)
      .sort(
        (a, b) =>
          STATUS_RANK[b.status] - STATUS_RANK[a.status] || a.username.localeCompare(b.username),
      );
    return {
      friends,
      incoming: me.incoming.map(ref).filter((x) => !!x),
      outgoing: me.outgoing.map(ref).filter((x) => !!x),
    };
  }

  /** Pede amizade. Se o outro já tinha pedido, vira amizade na hora. */
  request(fromId: string, target: UserRecord | undefined): 'sent' | 'accepted' | 'already_friends' {
    const me = this.require(fromId);
    if (!target) throw new AppError('NOT_FOUND', 'Jogador não encontrado.');
    if (target.id === me.id) throw new AppError('INVALID', 'Você não pode adicionar a si mesmo.');
    if (me.friends.includes(target.id)) return 'already_friends';
    if (me.incoming.includes(target.id)) {
      this.makeFriends(me, target);
      return 'accepted';
    }
    if (me.outgoing.includes(target.id)) return 'sent';
    if (me.friends.length >= MAX_FRIENDS) throw new AppError('LIMIT', 'Sua lista de amigos está cheia.');
    if (me.outgoing.length >= MAX_PENDING || target.incoming.length >= MAX_PENDING) {
      throw new AppError('LIMIT', 'Pedidos de amizade demais pendentes.');
    }
    me.outgoing.push(target.id);
    target.incoming.push(me.id);
    this.accounts.save();
    this.push(me.id);
    this.push(target.id);
    for (const sid of this.identities.socketsOf(target.id)) {
      this.io.to(sid).emit('friend_request', { from: { userId: me.id, username: me.username } });
    }
    return 'sent';
  }

  respond(userId: string, fromId: string, accept: boolean) {
    const me = this.require(userId);
    if (!me.incoming.includes(fromId)) throw new AppError('NOT_FOUND', 'Pedido de amizade não encontrado.');
    const other = this.accounts.get(fromId);
    me.incoming = me.incoming.filter((id) => id !== fromId);
    if (other) other.outgoing = other.outgoing.filter((id) => id !== me.id);
    if (accept && other) {
      this.makeFriends(me, other);
    } else {
      this.accounts.save();
      this.push(me.id);
      if (other) this.push(other.id);
    }
  }

  /** Desfaz amizade ou cancela um pedido enviado. */
  remove(userId: string, otherId: string) {
    const me = this.require(userId);
    const other = this.accounts.get(otherId);
    me.friends = me.friends.filter((id) => id !== otherId);
    me.outgoing = me.outgoing.filter((id) => id !== otherId);
    me.incoming = me.incoming.filter((id) => id !== otherId);
    if (other) {
      other.friends = other.friends.filter((id) => id !== me.id);
      other.incoming = other.incoming.filter((id) => id !== me.id);
      other.outgoing = other.outgoing.filter((id) => id !== me.id);
    }
    this.accounts.save();
    this.push(me.id);
    if (other) this.push(other.id);
  }

  areFriends(a: string, b: string): boolean {
    return this.accounts.get(a)?.friends.includes(b) ?? false;
  }

  /** Manda a lista atualizada para todos os aparelhos da conta. */
  push(userId: string) {
    const sockets = this.identities.socketsOf(userId);
    if (sockets.length === 0) return;
    const payload = this.listFor(userId);
    for (const sid of sockets) this.io.to(sid).emit('friends_update', payload);
  }

  /** A situação da conta mudou: atualiza a lista dos amigos dela que estão online. */
  presenceChanged(userId: string) {
    const u = this.accounts.get(userId);
    if (!u) return;
    for (const f of u.friends) this.push(f);
  }

  private makeFriends(a: UserRecord, b: UserRecord) {
    a.incoming = a.incoming.filter((id) => id !== b.id);
    a.outgoing = a.outgoing.filter((id) => id !== b.id);
    b.incoming = b.incoming.filter((id) => id !== a.id);
    b.outgoing = b.outgoing.filter((id) => id !== a.id);
    if (!a.friends.includes(b.id)) a.friends.push(b.id);
    if (!b.friends.includes(a.id)) b.friends.push(a.id);
    this.accounts.save();
    this.push(a.id);
    this.push(b.id);
  }

  private require(userId: string): UserRecord {
    const u = this.accounts.get(userId);
    if (!u) throw new AppError('UNAUTHORIZED', 'Entre com sua conta.');
    return u;
  }
}
