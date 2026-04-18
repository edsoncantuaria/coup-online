import { translateAction, translateRole } from './translations';

export interface StatusInfo {
  title: string;
  subtitle?: string;
  kind: 'idle' | 'action' | 'challenge' | 'block' | 'losing' | 'exchange' | 'over' | 'lobby';
  waitingOnMe: boolean;
}

interface Args {
  phase: string;
  players: any[];
  currentPlayerId: string | null;
  waitingForResponseIndex: number | null;
  losingInfluenceId: string | null;
  currentAction: any;
  pendingBlock: any;
  myId: string;
}

const nameOf = (p: any, myId: string) =>
  p?.id === myId ? 'VOCÊ' : (p?.name?.toUpperCase() || '...');

export function buildStatusInfo(args: Args): StatusInfo {
  const {
    phase,
    players,
    currentPlayerId,
    waitingForResponseIndex,
    losingInfluenceId,
    currentAction,
    pendingBlock,
    myId,
  } = args;

  if (phase === 'lobby') {
    return { title: 'CONVOCANDO NOBRES', kind: 'lobby', waitingOnMe: false };
  }
  if (phase === 'game_over') {
    return { title: 'NOVO SOBERANO', kind: 'over', waitingOnMe: false };
  }

  const currentP = players.find((p) => p.id === currentPlayerId);
  const turnOwnerName = nameOf(currentP, myId);

  // Fase de escolher ação
  if (phase === 'action') {
    const isMe = currentPlayerId === myId;
    return {
      title: `TURNO DE ${turnOwnerName}`,
      subtitle: isMe ? 'Escolha sua jogada' : 'Decidindo ação...',
      kind: 'action',
      waitingOnMe: isMe,
    };
  }

  // Aguardando desafio / bloqueio
  if (phase === 'challenge' || phase === 'block') {
    const responder =
      waitingForResponseIndex !== null ? players[waitingForResponseIndex] : null;
    const responderName = nameOf(responder, myId);
    const waitingOnMe = responder?.id === myId;

    const srcPlayer = players.find((p) => p.id === currentAction?.source);
    const srcName = nameOf(srcPlayer, myId);
    const tgtPlayer = currentAction?.target
      ? players.find((p) => p.id === currentAction.target)
      : null;
    const tgtName = tgtPlayer ? nameOf(tgtPlayer, myId) : null;
    const actName = translateAction(currentAction?.type || '').toUpperCase();

    if (pendingBlock) {
      // Alguém bloqueou e estamos aguardando desafio ao bloqueio
      const blocker = players.find((p) => p.id === pendingBlock.blockerId);
      const blockerName = nameOf(blocker, myId);
      const roleName = translateRole(pendingBlock.role).toUpperCase();
      return {
        title: `TURNO DE ${turnOwnerName}`,
        subtitle: waitingOnMe
          ? `${blockerName} bloqueou como ${roleName} — desafiar?`
          : `${blockerName} bloqueou como ${roleName}. Aguardando ${responderName}...`,
        kind: 'block',
        waitingOnMe,
      };
    }

    // Ação em resolução, aguardando contestação
    let actionLine: string;
    if (tgtName) {
      actionLine = `Tentando ${actName} contra ${tgtName}`;
    } else {
      actionLine = `Tentando ${actName}`;
    }

    const waitLine = waitingOnMe
      ? 'Sua vez de decidir'
      : `Aguardando ${responderName}...`;

    return {
      title: `TURNO DE ${turnOwnerName}`,
      subtitle: `${actionLine} · ${waitLine}`,
      kind: phase === 'block' ? 'block' : 'challenge',
      waitingOnMe,
    };
  }

  // Alguém precisa descartar carta
  if (phase === 'losing_influence') {
    const loser = players.find((p) => p.id === losingInfluenceId);
    const loserName = nameOf(loser, myId);
    const waitingOnMe = losingInfluenceId === myId;
    return {
      title: `TURNO DE ${turnOwnerName}`,
      subtitle: waitingOnMe
        ? 'Toque uma carta para sacrificar'
        : `${loserName} está sacrificando uma influência...`,
      kind: 'losing',
      waitingOnMe,
    };
  }

  // Troca (embaixador)
  if (phase === 'exchanging') {
    const isMe = currentPlayerId === myId;
    return {
      title: `TURNO DE ${turnOwnerName}`,
      subtitle: isMe
        ? 'Escolhendo cartas da corte...'
        : `${turnOwnerName} consulta o Embaixador...`,
      kind: 'exchange',
      waitingOnMe: isMe,
    };
  }

  return {
    title: `TURNO DE ${turnOwnerName}`,
    kind: 'idle',
    waitingOnMe: false,
  };
}
