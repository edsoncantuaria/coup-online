import {
  GameState,
  Player,
  Role,
  Action,
  MatchStats,
  PlayerStats,
  emptyPlayerStats,
} from './types.js';

export class CoupEngine {
  private state: GameState;
  /** true após `startGame()` — antes disso é lobby / sala de espera. */
  private gameStarted = false;

  /**
   * Reidrata o motor a partir de um snapshot serializado (retomar partida / testes).
   */
  public static hydrate(snapshot: GameState): CoupEngine {
    const roomId = snapshot.roomId || 'offline-room';
    const engine = new CoupEngine(roomId);
    (engine as unknown as { state: GameState }).state = JSON.parse(
      JSON.stringify(snapshot)
    );
    const started =
      Array.isArray(snapshot.players) &&
      snapshot.players.some((p) => (p.cards?.length ?? 0) > 0);
    (engine as unknown as { gameStarted: boolean }).gameStarted = started;
    return engine;
  }

  constructor(roomId: string) {
    this.state = {
      roomId,
      players: [],
      deck: [],
      turnIndex: 0,
      phase: 'action',
      logs: ['🏰 Aguardando nobres para iniciar a sessão...'],
      responses: {},
      waitingForResponseIndex: null,
      responderCycleStartIndex: null,
    };
  }

  public addPlayer(
    id: string,
    name: string,
    isBot: boolean = false,
    personality?: 'cautious' | 'tyrant' | 'bluffer' | 'balanced'
  ) {
    this.state.players.push({
      id,
      name,
      isBot,
      coins: 2,
      cards: [],
      deadCards: [],
      isConnected: true,
      isReady: false,
      personality: isBot ? personality || 'balanced' : undefined,
    });
  }

  public startGame() {
    this.addLog("⚙️ Iniciando motor de jogo...");
    this.state.deck = this.shuffleDeck(this.buildDeck());
    this.addLog(`⚙️ Baralho inicializado com ${this.state.deck.length} cartas.`);
    this.state.players.forEach(p => {
      const r1 = this.state.deck.pop();
      const r2 = this.state.deck.pop();
      if (r1 && r2) {
        p.cards = [
          { role: r1, isFlipped: false },
          { role: r2, isFlipped: false }
        ];
      }
    });
    // Sorteia o jogador inicial aleatoriamente
    this.state.turnIndex = Math.floor(Math.random() * this.state.players.length);
    this.state.phase = 'action';
    this.state.waitingForResponseIndex = null;
    this.state.responses = {};

    // Inicializa estatísticas da partida
    const perPlayer: Record<string, PlayerStats> = {};
    this.state.players.forEach(p => {
      perPlayer[p.id] = emptyPlayerStats();
    });
    this.state.matchStats = {
      startedAt: Date.now(),
      round: 1,
      perPlayer,
    };

    this.addLog(`🎲 Sorteio: ${this.getCurrentPlayer().name} começa o jogo!`);
    this.gameStarted = true;
  }

  public isGameStarted(): boolean {
    return this.gameStarted;
  }

  /**
   * Remove jogador (desconexão). Lobby: só remove da lista.
   * Partida: remove e simplifica fases abertas; pode encerrar o jogo.
   */
  public disconnectPlayer(playerId: string): void {
    const idx = this.state.players.findIndex((p) => p.id === playerId);
    if (idx === -1) return;

    const removed = this.state.players[idx]!;
    const label = removed.name;

    if (!this.gameStarted) {
      this.state.players.splice(idx, 1);
      this.adjustTurnIndexAfterRemove(idx);
      this.addLog(`${label} saiu da sala.`);
      return;
    }

    this.state.players.splice(idx, 1);
    this.adjustTurnIndexAfterRemove(idx);

    if (
      this.state.phase === 'challenge' ||
      this.state.phase === 'block' ||
      this.state.phase === 'reveal' ||
      this.state.phase === 'losing_influence' ||
      this.state.phase === 'exchanging'
    ) {
      this.state.phase = 'action';
      this.state.currentAction = undefined;
      this.state.pendingChallenge = undefined;
      this.state.pendingBlock = undefined;
      this.state.responses = {};
      this.state.losingInfluenceId = undefined;
      this.state.losingContext = undefined;
      this.state.exchangingCards = undefined;
      this.state.pendingResolution = undefined;
    }

    this.addLog(`${label} desconectou e foi removido da partida.`);

    if (this.state.players.length === 0) {
      this.state.phase = 'game_over';
      delete this.state.winner;
      this.addLog('Sala encerrada.');
      return;
    }

    if (this.state.players.length === 1) {
      this.state.phase = 'game_over';
      this.state.winner = this.state.players[0]!.id;
      this.addLog('Fim de jogo!');
      return;
    }

    if (this.state.phase === 'game_over') return;

    try {
      this.addLog(`Turno de ${this.getCurrentPlayer().name}`);
    } catch {
      this.state.turnIndex = 0;
    }
  }

  /**
   * Jogador sai da partida: perde todas as influências e continua na lista,
   * para não bagunçar os índices de turno. Uma jogada em aberto é cancelada
   * e o turno segue para o próximo vivo.
   *  - `left`: saiu da sala (deixa de receber o estado);
   *  - `idle`: estourou o tempo vezes demais (continua assistindo).
   */
  public forfeitPlayer(playerId: string, reason: 'left' | 'idle' = 'left'): void {
    if (!this.gameStarted) {
      this.disconnectPlayer(playerId);
      return;
    }
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) return;
    if (reason === 'left') player.isConnected = false;
    if (this.state.phase === 'game_over') return;

    const wasAlive = player.cards.some((c) => !c.isFlipped);
    player.cards.forEach((c) => {
      c.isFlipped = true;
    });
    if (wasAlive) {
      this.addLog(
        reason === 'idle'
          ? `⏰ ${player.name} foi eliminado por ficar sem jogar.`
          : `🚪 ${player.name} abandonou a partida.`,
      );
      const stats = this.state.matchStats?.perPlayer[playerId];
      if (stats && stats.eliminatedAtRound === undefined) {
        stats.eliminatedAtRound = this.state.matchStats!.round;
      }
    }

    // Cartas compradas numa troca em andamento voltam para a Corte.
    if (this.state.exchangingCards?.length) {
      this.state.deck.push(...this.state.exchangingCards);
      this.state.deck = this.shuffleDeck(this.state.deck);
    }

    const open = this.state.phase !== 'action';
    const wasCurrent = this.state.players[this.state.turnIndex]?.id === playerId;
    this.state.currentAction = null;
    this.state.pendingBlock = null;
    this.state.pendingChallenge = undefined;
    this.state.responses = {};
    this.state.losingInfluenceId = undefined;
    this.state.losingContext = undefined;
    this.state.exchangingCards = undefined;
    this.state.pendingResolution = undefined;
    this.state.waitingForResponseIndex = null;
    this.state.responderCycleStartIndex = null;

    if (open || wasCurrent) {
      if (open) this.addLog('⚠️ A jogada em andamento foi cancelada.');
      this.state.phase = 'action';
      this.nextTurn();
      return;
    }
    const alive = this.state.players.filter((p) => p.cards.some((c) => !c.isFlipped));
    if (alive.length <= 1) {
      // nextTurn encerra a partida ao detectar um único sobrevivente.
      this.nextTurn();
    }
  }

  private adjustTurnIndexAfterRemove(removedIdx: number): void {
    if (this.state.players.length === 0) return;
    if (removedIdx < this.state.turnIndex) {
      this.state.turnIndex--;
    } else if (removedIdx === this.state.turnIndex) {
      this.state.turnIndex = this.state.turnIndex % this.state.players.length;
    }
    if (this.state.turnIndex >= this.state.players.length) {
      this.state.turnIndex = 0;
    }
  }

  /** Helpers de estatística (no-op se matchStats não existe) */
  private bumpStat(
    playerId: string | undefined,
    key: keyof PlayerStats,
    delta: number = 1
  ) {
    if (!playerId || !this.state.matchStats) return;
    const stats = this.state.matchStats.perPlayer[playerId];
    if (!stats) return;
    const cur = stats[key];
    if (typeof cur === 'number') {
      (stats[key] as number) = cur + delta;
    }
  }

  private recordCoinChange(playerId: string | undefined, delta: number) {
    if (!playerId || !this.state.matchStats) return;
    const stats = this.state.matchStats.perPlayer[playerId];
    if (!stats) return;
    if (delta > 0) stats.coinsGained += delta;
    else stats.coinsLost += -delta;
  }

  private recordCardLost(playerId: string | undefined) {
    if (!playerId || !this.state.matchStats) return;
    const stats = this.state.matchStats.perPlayer[playerId];
    if (!stats) return;
    stats.cardsLost += 1;
    const player = this.state.players.find(p => p.id === playerId);
    if (player && player.cards.every(c => c.isFlipped)) {
      stats.eliminatedAtRound = this.state.matchStats!.round;
    }
  }

  private setResolved(
    actionType: string,
    actorId: string,
    summary: string,
    targetId?: string
  ) {
    const actor = this.state.players.find(p => p.id === actorId);
    const target = targetId
      ? this.state.players.find(p => p.id === targetId)
      : undefined;
    this.state.lastResolved = {
      actionType,
      actorId,
      actorName: actor?.name || '?',
      targetId,
      targetName: target?.name,
      summary,
      stamp: Date.now(),
    };
  }

  private buildDeck(): Role[] {
    const roles: Role[] = ['duke', 'assassin', 'captain', 'contessa', 'ambassador'];
    let deck: Role[] = [];
    roles.forEach(role => {
      for (let i = 0; i < 3; i++) {
        deck.push(role);
      }
    });
    return deck;
  }

  private shuffleDeck(deck: Role[]): Role[] {
    const newDeck = [...deck];
    for (let i = newDeck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = newDeck[i] as Role;
      newDeck[i] = newDeck[j] as Role;
      newDeck[j] = temp;
    }
    return newDeck;
  }

  public getCurrentPlayer(): Player {
    const player = this.state.players[this.state.turnIndex];
    if (!player) throw new Error("Current player not found");
    return player;
  }

  public allLogs: string[] = [];

  public getState(): GameState {
    return this.state;
  }

  /** Mensagem no registro da partida vinda de fora do motor (ex.: relógio). */
  public note(message: string) {
    this.addLog(message);
  }

  private addLog(message: string) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    
    this.state.logs.push(message); // UI: visível a todos os jogadores
    if (this.state.logs.length > 50) this.state.logs.shift();
    
    this.allLogs.push(logEntry);
  }

  // Debug-only: vai apenas para o arquivo de simulação, NUNCA para a UI
  private addDebugLog(message: string) {
    const timestamp = new Date().toISOString();
    this.allLogs.push(`[${timestamp}] ${message}`);
  }

  private translateAction(type: string): string {
    const dict: Record<string, string> = {
      income: 'Renda',
      foreign_aid: 'Ajuda Externa',
      tax: 'Taxa (Duque)',
      steal: 'Extorsão (Capitão)',
      assassinate: 'Assassinato',
      exchange: 'Troca (Embaixador)',
      coup: 'Golpe de Estado',
      challenge: 'Desafio',
      block: 'Bloqueio'
    };
    return dict[type] || type;
  }

  /**
   * Valida uma ação antes de aplicá-la, refletindo TODAS as regras oficiais
   * do Coup. Retorna `{ ok: true }` se a ação é legal, ou `{ ok: false, reason }`
   * com motivo para feedback na UI/log.
   */
  public validateAction(
    playerId: string,
    action: Action
  ): { ok: true } | { ok: false; reason: string } {
    if (this.state.phase !== 'action')
      return { ok: false, reason: 'Não é a fase de ação.' };

    const current = this.getCurrentPlayer();
    if (playerId !== current.id)
      return { ok: false, reason: 'Não é o seu turno.' };

    const player = this.state.players.find(p => p.id === playerId);
    if (!player) return { ok: false, reason: 'Jogador não encontrado.' };

    const isAlive = player.cards.some(c => !c.isFlipped);
    if (!isAlive)
      return { ok: false, reason: 'Jogador eliminado não pode agir.' };

    // Regra das 10 moedas: Coup obrigatório
    if (player.coins >= 10 && action.type !== 'coup') {
      return {
        ok: false,
        reason:
          'Com 10 moedas ou mais o jogador é OBRIGADO a realizar um Golpe de Estado.',
      };
    }

    // Custos
    if (action.type === 'coup' && player.coins < 7)
      return { ok: false, reason: 'Golpe requer 7 moedas.' };
    if (action.type === 'assassinate' && player.coins < 3)
      return { ok: false, reason: 'Assassinato requer 3 moedas.' };

    // Targets — quem precisa, quem não pode ter
    const NEEDS_TARGET = ['coup', 'assassinate', 'steal'];
    const FORBIDS_TARGET = ['income', 'foreign_aid', 'tax', 'exchange'];

    if (NEEDS_TARGET.includes(action.type)) {
      if (!action.target)
        return { ok: false, reason: 'Esta ação exige um alvo.' };
      if (action.target === playerId)
        return {
          ok: false,
          reason: 'Você não pode escolher a si mesmo como alvo.',
        };
      const target = this.state.players.find(p => p.id === action.target);
      if (!target)
        return { ok: false, reason: 'Alvo inexistente.' };
      if (target.cards.every(c => c.isFlipped))
        return { ok: false, reason: 'Alvo já está eliminado.' };
      // Steal exige que o alvo tenha pelo menos 1 moeda (regra oficial)
      if (action.type === 'steal' && target.coins < 1)
        return {
          ok: false,
          reason: 'Não é possível roubar de quem não tem moedas.',
        };
    } else if (FORBIDS_TARGET.includes(action.type)) {
      if (action.target)
        return {
          ok: false,
          reason: 'Esta ação não pode ter alvo.',
        };
    }

    // Tipo desconhecido
    const KNOWN = [
      'income',
      'foreign_aid',
      'tax',
      'steal',
      'assassinate',
      'exchange',
      'coup',
    ];
    if (!KNOWN.includes(action.type))
      return { ok: false, reason: 'Ação desconhecida.' };

    return { ok: true };
  }

  public handleAction(playerId: string, action: Action) {
    const check = this.validateAction(playerId, action);
    if (check.ok === false) {
      this.addLog(`⛔ Ação inválida: ${check.reason}`);
      this.state.lastInvalid = {
        reason: check.reason,
        actionType: action.type,
        stamp: Date.now(),
      };
      return;
    }

    const player = this.state.players.find(p => p.id === playerId)!;
    this.state.currentAction = action;
    this.state.pendingBlock = undefined; // Garante que nenhum bloqueio anterior vaze
    this.state.responses = {};

    const actionName = this.translateAction(action.type);

    this.addLog(`📢 ${player.name} declarou ${actionName}${action.target ? ' contra ' + this.getPlayerName(action.target) : ''}`);
    this.bumpStat(player.id, 'actionsTaken');

    // Dedução imediata de moedas (Regra Oficial: Paga na declaração)
    if (action.type === 'assassinate') {
      player.coins -= 3;
      this.recordCoinChange(player.id, -3);
    } else if (action.type === 'coup') {
      player.coins -= 7;
      this.recordCoinChange(player.id, -7);
    }

    if (this.isActionChallengeable(action.type)) {
      this.addLog(`🔍 Fase de DESAFIO iniciada para ${actionName}.`);
      this.state.phase = 'challenge';
      this.state.responses = {};
      this.state.responderCycleStartIndex = this.state.turnIndex;
      this.setNextResponder(this.state.turnIndex);
    } else if (this.isActionBlockable(action.type)) {
      if (action.type === 'foreign_aid') {
        this.addLog(`🛡️ Alguém deseja bloquear a Ajuda Externa de ${this.getPlayerName(action.source)} como Duque?`);
      }
      this.state.phase = 'block';
      this.state.responses = {};
      this.state.responderCycleStartIndex = this.state.turnIndex;
      this.setNextResponder(this.state.turnIndex);
    } else {
      this.addLog(`✅ ${actionName} não pode ser desafiado nem bloqueado. Resolvendo...`);
      this.resolveAction();
    }
  }

  private setNextResponder(startIndex: number) {
    let nextIndex = (startIndex + 1) % this.state.players.length;
    let iterations = 0;

    while (iterations < this.state.players.length) {
      // Se chegamos de volta ao início do ciclo de quem começou a responder, encerramos.
      if (nextIndex === this.state.responderCycleStartIndex) {
        break;
      }

      const p = this.state.players[nextIndex];
      const isAlive = p.cards.some(c => !c.isFlipped);
      
      // No desafio de ação, o autor da ação não se auto-desafia.
      // Em outros casos (como desafio de bloqueio), todos menos o bloqueador podem responder.
      let skipThisPlayer = false;
      if (this.state.phase === 'challenge') {
        skipThisPlayer = p.id === this.state.currentAction?.source;
      } else if (this.state.phase === 'block') {
        if (this.state.pendingBlock) {
          // Estamos aguardando desafios a um bloqueio! Todos menos o bloqueador podem desafiar.
          skipThisPlayer = p.id === this.state.pendingBlock.blockerId;
        } else {
          // Estamos aguardando bloqueios à ação!
          const action = this.state.currentAction;
          if (action?.type === 'foreign_aid') {
            skipThisPlayer = p.id === action.source; // Quem pediu ajuda não bloqueia a si mesmo
          } else {
            // Ações direcionadas: Apenas o alvo pode bloquear
            skipThisPlayer = p.id !== action?.target;
          }
        }
      }

      if (isAlive && !skipThisPlayer) {
        this.state.waitingForResponseIndex = nextIndex;
        // Só loga a vez se for importante (humano ou mudança de fase relevante)
        if (!p.isBot) {
          this.addLog(`⏳ Vez de ${p.name} responder.`);
        }
        return;
      }

      nextIndex = (nextIndex + 1) % this.state.players.length;
      iterations++;
    }

    this.addLog(`⏹️ Ciclo de respostas encerrado.`);
    this.state.waitingForResponseIndex = null;
    this.state.responderCycleStartIndex = null;
    
    if (this.state.phase === 'challenge') {
      const action = this.state.currentAction;
      if (!action) return;

      // Se tiver alvo e for bloqueável (Roubo, Assassinato)
      if (action.target && this.isActionBlockable(action.type)) {
        const targetPlayer = this.state.players.find(p => p.id === action.target);
        if (targetPlayer && targetPlayer.cards.some(c => !c.isFlipped)) {
          this.state.phase = 'block';
          const targetIndex = this.state.players.findIndex(p => p.id === action.target);
          this.state.waitingForResponseIndex = targetIndex;
          this.state.responderCycleStartIndex = targetIndex; // O ciclo começa e termina no alvo
          this.addLog(`🛡️ ${targetPlayer.name}, deseja bloquear a ação de ${this.getPlayerName(action.source)}?`);
          return;
        }
      }
      
      this.resolveAction();
    } else if (this.state.phase === 'block') {
      if (this.state.pendingBlock) {
        // Alguém bloqueou e ninguém desafiou o bloqueio. A ação falha.
        this.addLog(`🚫 O bloqueio de ${this.getPlayerName(this.state.pendingBlock.blockerId)} foi aceito e a ação não surtirá efeito.`);
        this.bumpStat(this.state.pendingBlock.blockerId, 'blocksSuccess');
        const blockedAction = this.state.currentAction;
        if (blockedAction) {
          this.setResolved(
            blockedAction.type,
            blockedAction.source,
            `Bloqueio com ${this.translateRole(this.state.pendingBlock.role)} impediu ${this.translateAction(blockedAction.type)}.`,
            blockedAction.target
          );
        }
        this.state.currentAction = null;
        this.state.pendingBlock = null;
        this.nextTurn();
      } else {
        // Ninguém se manifestou para bloquear. A ação prossegue.
        this.addLog(`✨ Ninguém bloqueou a ação.`);
        this.state.phase = 'action';
        this.resolveAction();
      }
    }
  }

  public handleResponse(playerId: string, response: 'pass' | 'challenge' | 'block' | 'allow', role?: Role) {
    if (this.state.waitingForResponseIndex === null) return;
    
    const expectedPlayer = this.state.players[this.state.waitingForResponseIndex];
    if (playerId !== expectedPlayer.id) return;

    this.state.responses[playerId] = response;

    if (response === 'pass' || response === 'allow') {
        const p = this.state.players[this.state.waitingForResponseIndex];
        this.addLog(`📜 ${p.name} decide PASSAR.`);
    }

    if (response === 'challenge') {
      this.addLog(`⚔️ ${expectedPlayer.name} DESAFIOU!`);
      this.bumpStat(playerId, 'challengesMade');
      this.resolveChallenge(playerId);
      return;
    }

    if (response === 'block') {
      if (this.state.phase as string !== 'block' || this.state.pendingBlock) {
        this.addLog(`🚫 Tentativa de bloqueio fora de hora por ${expectedPlayer.name}.`);
        return;
      }

      const actionType = this.state.currentAction?.type;
      const isTarget = this.state.currentAction?.target === playerId;
      const canBlock = (actionType === 'foreign_aid') || 
                       (actionType === 'steal' && isTarget) || 
                       (actionType === 'assassinate' && isTarget);

      if (!canBlock) {
        this.addLog(`🚫 Tentativa de bloqueio inválida por ${expectedPlayer.name}.`);
        return;
      }

      let blockRole: Role = 'duke'; 
      if (actionType === 'foreign_aid') blockRole = 'duke';
      else if (actionType === 'assassinate') blockRole = 'contessa';
      else if (actionType === 'steal') blockRole = role || 'captain';

      this.addLog(`🛡️ ${expectedPlayer.name} bloqueia como ${this.translateRole(blockRole)}!`);
      this.bumpStat(playerId, 'blocksMade');
      this.state.phase = 'block';
      this.state.responses = {};

      this.state.pendingBlock = {
        blockerId: playerId,
        actionType: this.state.currentAction?.type || '',
        role: blockRole
      };
      
      this.state.responderCycleStartIndex = this.state.waitingForResponseIndex;
      this.setNextResponder(this.state.waitingForResponseIndex);
      return;
    }

    this.setNextResponder(this.state.waitingForResponseIndex);
  }

  private isActionChallengeable(type: string): boolean {
    return !['income', 'coup', 'foreign_aid'].includes(type);
  }

  private isActionBlockable(type: string): boolean {
    return ['foreign_aid', 'steal', 'assassinate'].includes(type);
  }

  private resolveChallenge(challengerId: string) {
    const action = this.state.currentAction;
    if (!action) return;

    const isChallengingBlock = this.state.phase === 'block' && this.state.pendingBlock;
    const targetId = isChallengingBlock ? this.state.pendingBlock!.blockerId : action.source;
    const actionRole = isChallengingBlock ? this.state.pendingBlock!.role : this.getRequiredRole(action.type);

    if (!actionRole) {
      this.state.phase = 'action';
      this.resolveAction();
      return;
    }

    const targetPlayer = this.state.players.find(p => p.id === targetId);
    if (!targetPlayer) return;

    const hasCard = targetPlayer.cards.some(c => c.role === actionRole && !c.isFlipped);

    if (hasCard) {
      this.addLog(`✅ ${targetPlayer.name} PROVOU ser ${this.translateRole(actionRole)}!`);
      // Desafiante errou: perdeu um desafio. Alvo sobreviveu à acusação.
      this.bumpStat(challengerId, 'challengesLost');
      this.bumpStat(targetPlayer.id, 'bluffsSurvived');
      if (isChallengingBlock) {
        this.bumpStat(targetPlayer.id, 'blocksSuccess');
      }
      this.state.lastReveal = {
        role: actionRole,
        playerName: targetPlayer.name,
        playerId: targetPlayer.id,
        verdict: 'proven',
        stamp: Date.now(),
      };

      // Substitui a carta provada MANTENDO A POSIÇÃO da mão,
      // para o jogador acompanhar visualmente a troca sem reordenar cartas.
      const cardIndex = targetPlayer.cards.findIndex(c => c.role === actionRole && !c.isFlipped);
      const oldRole = targetPlayer.cards[cardIndex].role;
      this.state.deck.push(oldRole);
      this.state.deck = this.shuffleDeck(this.state.deck);
      const newRole = this.state.deck.pop();
      if (!newRole) {
        // Cenário extremamente improvável: deck vazio. Mantém a carta provada
        // (oldRole) e relogga, evitando undefined e card "fantasma".
        this.addDebugLog(
          `⚠️ Deck vazio ao trocar carta provada de ${targetPlayer.name}. Mantendo ${oldRole}.`
        );
        targetPlayer.cards[cardIndex] = { role: oldRole, isFlipped: false };
      } else {
        targetPlayer.cards[cardIndex] = { role: newRole, isFlipped: false };
      }

      if (isChallengingBlock) {
        // Bloqueio legítimo: Ação original é abortada
        this.addLog(`🛡️ O bloqueio teve sucesso! A ação de ${this.getPlayerName(action.source)} foi impedida.`);
        this.state.currentAction = null; 
        const waiting = this.loseInfluence(challengerId, 'next_turn', {
          reason: 'challenge_lost',
          causedByPlayerId: targetPlayer.id,
        });
        if (!waiting) this.nextTurn();
      } else {
        // Ação legítima: Desafiante perde carta.
        // Se a ação ainda pode ser bloqueada pelo alvo, abrimos a fase de bloqueio antes de resolver.
        const needsBlockPhase = !!action.target && this.isActionBlockable(action.type);
        const pendingType = needsBlockPhase ? 'allow_block' : 'resolve_action';
        const waiting = this.loseInfluence(challengerId, pendingType, {
          reason: 'challenge_lost',
          causedByPlayerId: targetPlayer.id,
        });
        if (!waiting) {
          if (needsBlockPhase) {
            this.openBlockPhaseForTarget();
          } else {
            this.resolveAction();
          }
        }
      }
    } else {
      this.addLog(`❗ ${targetPlayer.name} estava blefando!`);
      // Desafiante acertou: ganhou o desafio. Alvo foi pego blefando.
      this.bumpStat(challengerId, 'challengesWon');
      this.bumpStat(targetPlayer.id, 'bluffsCaught');
      if (isChallengingBlock) {
        this.bumpStat(targetPlayer.id, 'blocksFailed');
      }
      this.state.lastReveal = {
        role: actionRole,
        playerName: targetPlayer.name,
        playerId: targetPlayer.id,
        verdict: 'bluff',
        stamp: Date.now(),
      };

      if (isChallengingBlock) {
        // Bloqueio falso: A ação original prossegue
        this.state.phase = 'action'; 
        
        // Se for uma ação que pode ser bloqueada por outros (como Ajuda Externa), reabre a fase de bloqueio.
        // Diferente de Assassinato/Roubo onde o alvo já tentou e falhou (e perdeu carta),
        // no caso de FA, qualquer um pode tentar bloquear.
        const isForeignAid = action.type === 'foreign_aid';
        const resolutionType = isForeignAid ? 'reopen_block' : 'resolve_action';
        
        const isWaiting = this.loseInfluence(targetId, resolutionType, {
          reason: 'bluff_caught',
          causedByPlayerId: challengerId,
        });
        if (!isWaiting && (this.state.phase as string) !== 'game_over') {
          if (isForeignAid) {
            this.addLog(`⚔️ O bloqueio de ${targetPlayer.name} falhou! Outros nobres ainda podem tentar bloquear.`);
            this.state.pendingBlock = undefined;
            this.reopenBlockPhaseEveryone();
          } else {
            this.addLog(`⚔️ O bloqueio falhou! A ação original de ${this.getPlayerName(action.source)} prosseguirá.`);
            this.resolveAction();
          }
        }
      } else {
        // Ação falsa: A ação é CANCELADA
        this.addLog(`❌ A ação de ${targetPlayer.name} falhou pois era um blefe.`);
        this.state.currentAction = null; 
        const waiting = this.loseInfluence(targetId, 'next_turn', {
          reason: 'bluff_caught',
          causedByPlayerId: challengerId,
        });
        if (!waiting) this.nextTurn();
      }
    }
  }

  private translateRole(role: string): string {
    const dict: Record<string, string> = {
      duke: 'Duque',
      assassin: 'Assassino',
      captain: 'Capitão',
      ambassador: 'Embaixador',
      contessa: 'Condessa'
    };
    return dict[role] || role;
  }

  public resolveAction() {
    if (this.state.phase === 'game_over') return;
    
    // Trava para evitar processamento duplo da mesma ação
    const action = this.state.currentAction;
    if (!action) return;
    
    // Limpa a ação imediatamente para evitar que outras chamadas entrem aqui
    this.state.currentAction = undefined;

    this.addLog(`✨ Ação ${this.translateAction(action.type)} resolvida.`);

    const source = this.state.players.find(p => p.id === action.source);
    if (!source) return;

    switch (action.type) {
      case 'income':
        source.coins += 1;
        this.recordCoinChange(source.id, 1);
        this.setResolved(action.type, source.id, `${source.name} tomou Renda (+1).`);
        this.addLog(`💰 ${source.name} agora tem ${source.coins} moedas.`);
        break;
      case 'tax':
        source.coins += 3;
        this.recordCoinChange(source.id, 3);
        this.setResolved(action.type, source.id, `${source.name} taxou como Duque (+3).`);
        this.addLog(`💰 ${source.name} agora tem ${source.coins} moedas.`);
        break;
      case 'foreign_aid':
        source.coins += 2;
        this.recordCoinChange(source.id, 2);
        this.setResolved(action.type, source.id, `${source.name} recebeu Ajuda Externa (+2).`);
        this.addLog(`💰 ${source.name} agora tem ${source.coins} moedas.`);
        break;
      case 'steal': {
        const target = this.state.players.find(p => p.id === action.target);
        if (target) {
          const amount = Math.min(target.coins, 2);
          target.coins -= amount;
          source.coins += amount;
          this.recordCoinChange(source.id, amount);
          this.recordCoinChange(target.id, -amount);
          this.setResolved(
            action.type,
            source.id,
            `${source.name} roubou ${amount} moeda${amount === 1 ? '' : 's'} de ${target.name}.`,
            target.id
          );
          this.addLog(`💰 Roubo: ${source.name} (+${amount}) | ${target.name} (${target.coins} restantes).`);
        }
        break;
      }
      case 'assassinate':
        if (action.target) {
          const tgt = this.state.players.find(p => p.id === action.target);
          this.setResolved(
            action.type,
            source.id,
            `${source.name} ordena assassinato contra ${tgt?.name || '??'}.`,
            action.target
          );
          const pending = this.loseInfluence(action.target, 'next_turn', {
            reason: 'assassinate',
            causedByPlayerId: source.id,
          });
          if (!pending) this.nextTurn();
        } else {
          this.nextTurn();
        }
        return;
      case 'coup':
        if (action.target) {
          const tgt = this.state.players.find(p => p.id === action.target);
          this.setResolved(
            action.type,
            source.id,
            `${source.name} executa Golpe contra ${tgt?.name || '??'}.`,
            action.target
          );
          const pending = this.loseInfluence(action.target, 'next_turn', {
            reason: 'coup',
            causedByPlayerId: source.id,
          });
          if (!pending) this.nextTurn();
        } else {
          this.nextTurn();
        }
        return;
      case 'exchange':
        this.setResolved(action.type, source.id, `${source.name} trocou cartas com a Corte.`);
        this.handleExchange(source);
        return;
    }

    this.nextTurn();
  }

  public nextTurn() {
    if (this.state.phase === 'game_over') return;
    this.addLog(`🔄 Passando o turno...`);
    const previous = this.state.turnIndex;
    this.state.turnIndex = (this.state.turnIndex + 1) % this.state.players.length;

    // Nova rodada quando o índice de turno dá a volta (passa do último para 0)
    if (this.state.matchStats && this.state.turnIndex <= previous) {
      // Só incrementa se realmente deu a volta (não quando pula um morto)
      if (previous === this.state.players.length - 1 && this.state.turnIndex === 0) {
        this.state.matchStats.round += 1;
      }
    }

    if (this.checkWinner()) return;

    while (this.state.players[this.state.turnIndex].cards.every(c => c.isFlipped)) {
        const skipped = this.state.players[this.state.turnIndex];
        this.addLog(`⚙️ Pulando ${skipped.name} (Sem influências).`);
        this.state.turnIndex = (this.state.turnIndex + 1) % this.state.players.length;
    }
    
    this.state.phase = 'action';
    this.state.waitingForResponseIndex = null;
    this.state.currentAction = null;
    this.state.pendingBlock = undefined;
    this.state.responses = {};
    const cp = this.getCurrentPlayer();
    // Log público (UI): mostra apenas quem é o jogador atual
    this.addLog(`📍 Turno de ${cp.name}`);
    // Log de debug (simulação/arquivo): mostra mão completa + moedas de todos
    const allStates = this.state.players
      .map(p => {
        const hand = p.cards.map(c => c.isFlipped ? `[${this.translateRole(c.role)} ☠]` : `[${this.translateRole(c.role)}]`).join(', ');
        return `${p.name}: 💰${p.coins} ${hand}`;
      })
      .join(' | ');
    this.addDebugLog(`📍 [DEBUG] Turno de ${cp.name} | Estado: ${allStates}`);
  }

  private checkWinner(): boolean {
    if (this.state.phase === 'game_over') return true; 
    
    const alivePlayers = this.state.players.filter(p => p.cards.some(c => !c.isFlipped));
    if (alivePlayers.length <= 1) {
      this.state.phase = 'game_over';
      this.state.winner = alivePlayers[0]?.id;
      this.state.currentAction = null; // Limpa ação pendente para evitar "ações fantasma"
      if (this.state.matchStats) {
        this.state.matchStats.endedAt = Date.now();
      }
      this.addLog(`🏆 FIM DE JOGO! O Reino agora pertence a ${alivePlayers[0]?.name || 'ninguém'}.`);
      return true;
    }
    return false;
  }

  private handleExchange(player: Player) {
    this.addLog(`🎭 ${player.name} está escolhendo cartas para troca...`);
    const drew = [this.state.deck.pop(), this.state.deck.pop()].filter(Boolean) as Role[];
    if (drew.length > 0) {
      this.state.phase = 'exchanging';
      this.state.exchangingCards = drew;
      this.state.waitingForResponseIndex = this.state.players.findIndex(p => p.id === player.id);
    } else {
      this.nextTurn();
    }
  }

  private loseInfluence(
    playerId: string,
    nextAction: 'next_turn' | 'resolve_action' | 'action_fail' | 'allow_block' | 'reopen_block' = 'next_turn',
    context?: { reason: 'coup' | 'assassinate' | 'challenge_lost' | 'bluff_caught'; causedByPlayerId?: string },
  ): boolean {
    const player = this.state.players.find(p => p.id === playerId);
    if (!player) return false;

    const aliveCards = player.cards.filter(c => !c.isFlipped);
    if (aliveCards.length === 0) return false;

    if (aliveCards.length === 1) {
      const card = aliveCards[0];
      card.isFlipped = true;
      this.addLog(`💀 ${player.name} perdeu sua última influência (${this.translateRole(card.role)})!`);
      this.state.lastLoss = {
        role: card.role,
        playerName: player.name,
        playerId: player.id,
        stamp: Date.now(),
      };
      this.recordCardLost(playerId);
      this.checkWinner();
      return false;
    } else {
      this.state.phase = 'losing_influence';
      this.state.losingInfluenceId = playerId;
      this.state.waitingForResponseIndex = this.state.players.findIndex(p => p.id === playerId);
      this.state.pendingResolution = { type: nextAction };
      if (context) {
        this.state.losingContext = {
          reason: context.reason,
          causedByPlayerId: context.causedByPlayerId,
          stamp: Date.now(),
        };
      } else {
        this.state.losingContext = undefined;
      }
      const reasonLog = nextAction === 'resolve_action' ? '(ação ainda prosseguirá após escolha)' : '';
      this.addLog(`🤔 ${player.name} deve escolher qual influência perder. ${reasonLog}`);
      return true;
    }
  }

  public handleFlip(playerId: string, role: Role) {
    if (this.state.phase !== 'losing_influence' || this.state.losingInfluenceId !== playerId) {
      return;
    }
    
    const player = this.state.players.find(p => p.id === playerId);
    if (!player) return;

    const card = player.cards.find(c => c.role === role && !c.isFlipped);
    if (card) {
      card.isFlipped = true;
      this.addLog(`📉 ${player.name} revelou e perdeu seu ${this.translateRole(role)}.`);
      this.state.lastLoss = {
        role,
        playerName: player.name,
        playerId: player.id,
        stamp: Date.now(),
      };
      this.recordCardLost(playerId);
      
      const resolution = this.state.pendingResolution?.type || 'next_turn';
      this.state.pendingResolution = undefined;
      this.state.losingInfluenceId = undefined;
      this.state.losingContext = undefined;
      this.state.waitingForResponseIndex = null;

      this.checkWinner();

      if ((this.state.phase as string) === 'game_over') return;

      if (resolution === 'resolve_action') {
        this.resolveAction();
      } else if (resolution === 'allow_block') {
        this.openBlockPhaseForTarget();
      } else if (resolution === 'reopen_block') {
        this.reopenBlockPhaseEveryone();
      } else {
        this.nextTurn();
      }
    } else {
    }
  }

  public handleExchangeChoice(playerId: string, keptRoles: Role[]) {
    if (this.state.phase !== 'exchanging') return;

    // Usa waitingForResponseIndex (definido em handleExchange) em vez de turnIndex,
    // que pode mudar se houver atraso no processamento — mais robusto contra deadlocks.
    const expectedIndex = this.state.waitingForResponseIndex;
    if (expectedIndex === null || this.state.players[expectedIndex]?.id !== playerId) return;

    const player = this.state.players[expectedIndex];
    if (!player || !this.state.exchangingCards) return;

    // Combinar cartas atuais vivas com as compradas
    const currentAliveRoles = player.cards.filter(c => !c.isFlipped).map(c => c.role);
    const currentAndDrew = [...currentAliveRoles, ...this.state.exchangingCards];

    // Validação 1: deve manter exatamente o mesmo número de cartas vivas
    if (keptRoles.length !== currentAliveRoles.length) {
      this.addLog(
        `⛔ Troca inválida: deve manter exatamente ${currentAliveRoles.length} carta(s).`
      );
      return;
    }

    // Validação 2: keptRoles deve ser um subconjunto válido (com multiplicidade)
    // de currentAndDrew — sem duplicar cartas que não existem no pool.
    const pool = [...currentAndDrew];
    for (const r of keptRoles) {
      const idx = pool.indexOf(r);
      if (idx === -1) {
        this.addLog(
          `⛔ Troca inválida: tentativa de manter ${this.translateRole(r)} fora do pool.`
        );
        return;
      }
      pool.splice(idx, 1);
    }

    // Atualizar as cartas do jogador
    let keptIdx = 0;
    player.cards.forEach(c => {
        if (!c.isFlipped) {
            c.role = keptRoles[keptIdx];
            keptIdx++;
        }
    });

    // Devolve para o deck o restante exato (pool consumido acima).
    const toReturn = pool;
    const toReturnStr = toReturn.length > 0
      ? toReturn.map(r => this.translateRole(r)).join(', ')
      : 'nenhuma';
    this.addLog(`⚙️ Devolvendo ${toReturn.length} cartas ao deck: ${toReturnStr}.`);
    this.state.deck.push(...toReturn);
    this.state.deck = this.shuffleDeck(this.state.deck);
    this.addLog("⚙️ Deck re-embaralhado após troca.");
    
    this.state.exchangingCards = undefined;
    this.addLog(`🎭 ${player.name} completou a troca de influências.`);
    this.nextTurn();
  }

  /**
   * Abre a fase de bloqueio exclusivamente para o alvo da ação atual.
   * Chamado após desafio resolvido a favor do atacante, garantindo que o
   * alvo ainda possa bloquear com Condessa (ex: Assassinato provado).
   */
  private openBlockPhaseForTarget() {
    const action = this.state.currentAction;
    if (!action || !action.target) {
      this.resolveAction();
      return;
    }

    const targetPlayer = this.state.players.find(p => p.id === action.target);
    
    // Se o alvo morreu perdendo a carta no desafio, a ação original (assassinato/roubo)
    // não precisa mais ser resolvida contra ele.
    if (!targetPlayer || targetPlayer.cards.every(c => c.isFlipped)) {
      this.addLog(`💀 O alvo ${targetPlayer?.name || ''} já foi eliminado pelo desafio.`);
      this.state.currentAction = undefined; // Cancela a ação original
      this.nextTurn();
      return;
    }

    this.state.phase = 'block';
    this.state.responses = {};
    this.state.pendingBlock = undefined;
    const targetIndex = this.state.players.findIndex(p => p.id === action.target);
    this.state.waitingForResponseIndex = targetIndex;
    this.state.responderCycleStartIndex = targetIndex; 

    const blockRoles = action.type === 'assassinate' ? 'Condessa' : 
                       action.type === 'steal' ? 'Capitão ou Embaixador' : 'Duque';

    this.addLog(`🛡️ ${targetPlayer.name}, o desafio falhou! Deseja bloquear com ${blockRoles}?`);
  }

  /**
   * Reabre a fase de bloqueio para todos os jogadores vivos
   * (Usado após um bloqueio de Ajuda Externa ser pego no blefe)
   */
  private reopenBlockPhaseEveryone() {
    const action = this.state.currentAction;
    if (!action) {
      this.nextTurn();
      return;
    }

    this.addLog(`🛡️ Reiniciando fase de bloqueio para a Ajuda Externa...`);
    this.state.phase = 'block';
    this.state.responses = {};
    this.state.pendingBlock = undefined;
    this.state.responderCycleStartIndex = this.state.turnIndex;
    this.setNextResponder(this.state.turnIndex);
  }


  private getRequiredRole(action: string): Role | null {
    switch (action) {
      case 'tax': return 'duke';
      case 'assassinate': return 'assassin';
      case 'steal': return 'captain';
      case 'exchange': return 'ambassador';
      default: return null;
    }
  }

  private getPlayerName(id: string): string {
    return this.state.players.find(p => p.id === id)?.name || 'Desconhecido';
  }
}
