import { GameState, Player, Role, Action } from './types';

export class CoupEngine {
  private state: GameState;

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

  public addPlayer(id: string, name: string, isBot: boolean = false) {
    this.state.players.push({
      id,
      name,
      isBot,
      coins: 2,
      cards: [],
      deadCards: [],
      isConnected: true,
      isReady: false,
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
    this.addLog(`🎲 Sorteio: ${this.getCurrentPlayer().name} começa o jogo!`);
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

  public handleAction(playerId: string, action: Action) {
    if (this.state.phase !== 'action') return;
    if (playerId !== this.getCurrentPlayer().id) return;
    
    this.state.currentAction = action;
    this.state.pendingBlock = undefined; // Garante que nenhum bloqueio anterior vaze
    this.state.responses = {};
    const player = this.state.players.find(p => p.id === playerId);
    if (!player) return;

    const actionName = this.translateAction(action.type);
    
    // Regra das 10 moedas: Se tem >= 10, DEVE dar golpe
    if (player.coins >= 10 && action.type !== 'coup') {
      this.addLog(`⚠️ ${player.name} tem 10 ou mais moedas e DEVE realizar um Golpe de Estado.`);
      return;
    }

    this.addLog(`📢 ${player.name} declarou ${actionName}${action.target ? ' contra ' + this.getPlayerName(action.target) : ''}`);

    // Dedução imediata de moedas (Regra Oficial: Paga na declaração)
    if (action.type === 'assassinate') {
      player.coins -= 3;
    } else if (action.type === 'coup') {
      player.coins -= 7;
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
      
      // Substitui a carta provada
      const cardIndex = targetPlayer.cards.findIndex(c => c.role === actionRole && !c.isFlipped);
      const [card] = targetPlayer.cards.splice(cardIndex, 1);
      this.state.deck.push(card.role);
      this.state.deck = this.shuffleDeck(this.state.deck);
      targetPlayer.cards.push({ role: this.state.deck.pop() as Role, isFlipped: false });

      if (isChallengingBlock) {
        // Bloqueio legítimo: Ação original é abortada
        this.addLog(`🛡️ O bloqueio teve sucesso! A ação de ${this.getPlayerName(action.source)} foi impedida.`);
        this.state.currentAction = null; 
        const waiting = this.loseInfluence(challengerId, 'next_turn');
        if (!waiting) this.nextTurn();
      } else {
        // Ação legítima: Desafiante perde carta.
        // Se a ação ainda pode ser bloqueada pelo alvo, abrimos a fase de bloqueio antes de resolver.
        const needsBlockPhase = !!action.target && this.isActionBlockable(action.type);
        const pendingType = needsBlockPhase ? 'allow_block' : 'resolve_action';
        const waiting = this.loseInfluence(challengerId, pendingType);
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
      
      if (isChallengingBlock) {
        // Bloqueio falso: A ação original prossegue
        this.state.phase = 'action'; 
        
        // Se for uma ação que pode ser bloqueada por outros (como Ajuda Externa), reabre a fase de bloqueio.
        // Diferente de Assassinato/Roubo onde o alvo já tentou e falhou (e perdeu carta),
        // no caso de FA, qualquer um pode tentar bloquear.
        const isForeignAid = action.type === 'foreign_aid';
        const resolutionType = isForeignAid ? 'reopen_block' : 'resolve_action';
        
        const isWaiting = this.loseInfluence(targetId, resolutionType);
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
        const waiting = this.loseInfluence(targetId, 'next_turn');
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
        this.addLog(`💰 ${source.name} agora tem ${source.coins} moedas.`);
        break;
      case 'tax':
        source.coins += 3;
        this.addLog(`💰 ${source.name} agora tem ${source.coins} moedas.`);
        break;
      case 'foreign_aid':
        source.coins += 2;
        this.addLog(`💰 ${source.name} agora tem ${source.coins} moedas.`);
        break;
      case 'steal':
        const target = this.state.players.find(p => p.id === action.target);
        if (target) {
          const amount = Math.min(target.coins, 2);
          target.coins -= amount;
          source.coins += amount;
          this.addLog(`💰 Roubo: ${source.name} (+${amount}) | ${target.name} (${target.coins} restantes).`);
        }
        break;
      case 'assassinate':
        if (action.target) {
          const pending = this.loseInfluence(action.target, 'next_turn');
          if (!pending) this.nextTurn();
        } else {
          this.nextTurn();
        }
        return; // Usa return para não cair no nextTurn() abaixo
      case 'coup':
        if (action.target) {
          const pending = this.loseInfluence(action.target, 'next_turn');
          if (!pending) this.nextTurn();
        } else {
          this.nextTurn();
        }
        return; // Usa return para não cair no nextTurn() abaixo
      case 'exchange':
        this.handleExchange(source);
        return;
    }

    this.nextTurn();
  }

  public nextTurn() {
    if (this.state.phase === 'game_over') return;
    this.addLog(`🔄 Passando o turno...`);
    this.state.turnIndex = (this.state.turnIndex + 1) % this.state.players.length;
    
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

  private loseInfluence(playerId: string, nextAction: 'next_turn' | 'resolve_action' | 'action_fail' | 'allow_block' | 'reopen_block' = 'next_turn'): boolean {
    const player = this.state.players.find(p => p.id === playerId);
    if (!player) return false;

    const aliveCards = player.cards.filter(c => !c.isFlipped);
    if (aliveCards.length === 0) return false;

    if (aliveCards.length === 1) {
      const card = aliveCards[0];
      card.isFlipped = true;
      this.addLog(`💀 ${player.name} perdeu sua última influência (${this.translateRole(card.role)})!`);
      this.checkWinner();
      return false;
    } else {
      this.state.phase = 'losing_influence';
      this.state.losingInfluenceId = playerId;
      this.state.waitingForResponseIndex = this.state.players.findIndex(p => p.id === playerId);
      this.state.pendingResolution = { type: nextAction };
      const reasonLog = nextAction === 'resolve_action' ? '(ação ainda prosseguirá após escolha)' : '';
      this.addLog(`🤔 ${player.name} deve escolher qual influência perder. ${reasonLog}`);
      return true;
    }
  }

  public handleFlip(playerId: string, role: Role) {
    if (this.state.phase !== 'losing_influence' || this.state.losingInfluenceId !== playerId) {
      console.log(`[Engine] handleFlip ignorado: phase=${this.state.phase}, expected=${this.state.losingInfluenceId}, got=${playerId}`);
      return;
    }
    
    const player = this.state.players.find(p => p.id === playerId);
    if (!player) return;

    const card = player.cards.find(c => c.role === role && !c.isFlipped);
    if (card) {
      card.isFlipped = true;
      this.addLog(`📉 ${player.name} revelou e perdeu seu ${this.translateRole(role)}.`);
      console.log(`[Engine] Card flipped: ${playerId} lost ${role}`);
      
      const resolution = this.state.pendingResolution?.type || 'next_turn';
      this.state.pendingResolution = undefined;
      this.state.losingInfluenceId = undefined;
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
      console.log(`[Engine] Carta não encontrada ou já virada: ${playerId} -> ${role}`);
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
    
    // Atualizar as cartas do jogador
    let keptIdx = 0;
    player.cards.forEach(c => {
        if (!c.isFlipped) {
            c.role = keptRoles[keptIdx];
            keptIdx++;
        }
    });

    // Devolve as outras para o deck
    const toReturn = currentAndDrew.filter(role => !keptRoles.includes(role));
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
