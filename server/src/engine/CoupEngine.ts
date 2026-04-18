import { GameState, Player, Role, Action } from './types.js';

export class CoupEngine {
  private state: GameState;

  constructor(roomId: string) {
    this.state = {
      roomId,
      players: [],
      deck: [],
      turnIndex: 0,
      phase: 'action',
      logs: ['Aguardando jogadores...'],
      responses: {},
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
    this.state.deck = this.shuffleDeck(this.buildDeck());
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
    this.state.phase = 'action';
    this.addLog(`Turno de ${this.getCurrentPlayer().name}`);
  }

  private buildDeck(): Role[] {
    const roles: Role[] = ['duke', 'assassin', 'captain', 'contessa', 'inquisitor'];
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

  public getState(): GameState {
    return this.state;
  }

  private addLog(message: string) {
    this.state.logs.push(message);
    if (this.state.logs.length > 50) this.state.logs.shift();
  }

  public handleAction(playerId: string, action: Action) {
    if (this.state.phase !== 'action') return;
    
    this.state.currentAction = action;
    const player = this.state.players.find(p => p.id === playerId);
    if (!player) return;

    this.addLog(`${player.name} declarou ${action.type}${action.target ? ' contra ' + this.getPlayerName(action.target) : ''}`);

    if (action.target) {
      const targetPlayer = this.state.players.find(p => p.id === action.target);
      if (!targetPlayer) return;
    }

    if (this.isActionChallengeable(action.type)) {
      this.state.phase = 'challenge';
    } else {
      this.applyAction(action);
    }
  }

  private isActionChallengeable(type: string): boolean {
    return !['income', 'foreign_aid', 'coup'].includes(type);
  }

  private isActionBlockable(type: string): boolean {
    return ['foreign_aid', 'steal', 'assassinate'].includes(type);
  }

  private applyAction(action: Action) {
    const source = this.state.players.find(p => p.id === action.source);
    if (!source) return;
    
    const target = action.target ? this.state.players.find(p => p.id === action.target) : null;

    switch (action.type) {
      case 'income':
        source.coins += 1;
        break;
      case 'foreign_aid':
        source.coins += 2;
        break;
      case 'tax':
        source.coins += 3;
        break;
      case 'steal':
        if (target) {
          const amount = Math.min(target.coins, 2);
          target.coins -= amount;
          source.coins += amount;
        }
        break;
      case 'assassinate':
        source.coins -= 3;
        if (target) {
          this.state.phase = 'reveal';
          return;
        }
        break;
      case 'coup':
        source.coins -= 7;
        if (target) {
          this.state.phase = 'reveal';
          return;
        }
        break;
      case 'exchange':
        this.handleExchange(source);
        return;
      case 'examine':
        if (target) {
          this.handleExamine(source, target);
        }
        return;
    }

    this.nextTurn();
  }

  private handleExchange(player: Player) {
    // Basic exchange logic: pull 2 cards, keep existing count
    const role1 = this.state.deck.pop();
    const role2 = this.state.deck.pop();
    if (role1) player.cards.push({ role: role1 as Role, isFlipped: false });
    if (role2) player.cards.push({ role: role2 as Role, isFlipped: false });
    
    this.addLog(`${player.name} está trocando influências`);
    this.nextTurn(); // In a real game, this would pause for player choice
  }

  private handleExamine(source: Player, target: Player) {
    this.state.phase = 'examine_resolve';
    this.addLog(`${source.name} está examinando ${target.name}`);
  }

  public nextTurn() {
    this.state.turnIndex = (this.state.turnIndex + 1) % this.state.players.length;
    const currentPlayer = this.state.players[this.state.turnIndex];
    if (!currentPlayer || currentPlayer.cards.length === 0) {
      this.state.turnIndex = (this.state.turnIndex + 1) % this.state.players.length;
    }
    
    this.state.phase = 'action';
    delete this.state.currentAction;
    this.state.responses = {};
    this.addLog(`Turno de ${this.getCurrentPlayer().name}`);
  }

  public handleResponse(playerId: string, response: 'pass' | 'challenge' | 'block' | 'allow') {
    if (this.state.phase !== 'challenge') return;

    this.state.responses[playerId] = response;

    if (response === 'challenge') {
      this.resolveChallenge(playerId);
      return;
    }

    if (response === 'block') {
      this.state.phase = 'challenge'; // Anyone can challenge the block too
      this.state.responses = {}; // Reset for the block challenge
      this.addLog(`${this.getPlayerName(playerId)} tentou bloquear.`);
      return;
    }

    // Check if everyone has passed
    const activePlayers = this.state.players.filter(p => p.cards.length > 0 && p.id !== this.getCurrentPlayer().id);
    const allResponded = activePlayers.every(p => this.state.responses[p.id] === 'pass' || this.state.responses[p.id] === 'allow');

    if (allResponded) {
      if (this.state.currentAction) {
        this.applyAction(this.state.currentAction);
      }
    }
  }

  private resolveChallenge(challengerId: string) {
    const action = this.state.currentAction;
    if (!action) return;

    const actor = this.getCurrentPlayer();
    const requiredRole = this.getRequiredRole(action.type);

    if (!requiredRole) {
      this.applyAction(action);
      return;
    }

    const hasRole = actor.cards.some(c => !c.isFlipped && c.role === requiredRole);
    const cardToReveal = actor.cards.find(c => !c.isFlipped && (c.role as Role) === requiredRole);
    if (!cardToReveal) return;
    
    cardToReveal.isFlipped = true;

    if (hasRole) {
      this.addLog(`${actor.name} provou ter o ${requiredRole}!`);
      // Actor wins, challenger loses a card
      this.state.phase = 'action'; // Dummy for now, should actually ask challenger to lose a card
      this.applyAction(action);
    } else {
      this.addLog(`${actor.name} estava blefando!`);
      // Actor loses challenge, action fails
      this.nextTurn();
    }
  }

  private getRequiredRole(actionType: string): Role | undefined {
    switch (actionType) {
      case 'tax': return 'duke';
      case 'assassinate': return 'assassin';
      case 'steal': return 'captain';
      case 'exchange': return 'inquisitor';
      case 'block_foreign_aid': return 'duke';
      case 'block_steal': return Math.random() > 0.5 ? 'captain' : 'inquisitor'; // Simplified for now
      case 'block_assassination': return 'contessa';
      default: return undefined;
    }
  }

  private getPlayerName(id: string): string {
    return this.state.players.find(p => p.id === id)?.name || 'Desconhecido';
  }
}
