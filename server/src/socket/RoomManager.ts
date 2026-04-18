import { Server, Socket } from 'socket.io';
import { CoupEngine } from '../engine/CoupEngine.js';
import { BotManager } from '../engine/BotManager.js';

export class RoomManager {
  private rooms: Map<string, CoupEngine> = new Map();
  private bots: Map<string, BotManager> = new Map();

  constructor(private io: Server) {}

  public handleConnection(socket: Socket) {
    socket.on('create_room', (data: { roomName: string; playerName: string }) => {
      const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
      const engine = new CoupEngine(roomId);
      engine.addPlayer(socket.id, data.playerName);
      
      this.rooms.set(roomId, engine);
      socket.join(roomId);
      
      socket.emit('room_update', engine.getState());
    });

    socket.on('join_room', (data: { roomId: string; playerName: string }) => {
      const engine = this.rooms.get(data.roomId);
      if (engine && engine.getState().players.length < 6) {
        engine.addPlayer(socket.id, data.playerName);
        socket.join(data.roomId);
        this.io.to(data.roomId).emit('room_update', engine.getState());
      } else {
        socket.emit('error', { message: 'Sala cheia ou inexistente' });
      }
    });

    socket.on('add_bot', (roomId: string) => {
      const engine = this.rooms.get(roomId);
      if (engine && engine.getState().players.length < 6) {
        const botId = `bot_${Math.random().toString(36).substring(7)}`;
        const botName = `Bot ${engine.getState().players.length + 1}`;
        engine.addPlayer(botId, botName, true);
        this.io.to(roomId).emit('room_update', engine.getState());
      }
    });

    socket.on('start_game', (roomId: string) => {
      const engine = this.rooms.get(roomId);
      if (engine) {
        const currentCount = engine.getState().players.length;
        if (currentCount < 1) { // No players? (Shouldn't happen)
          return;
        }
        
        // Auto-fill with bots if less than 2 players to allow solo testing
        if (currentCount < 2) {
          const botId = `bot_auto_1`;
          engine.addPlayer(botId, `Bot 1`, true);
        }
        
        engine.startGame();
        this.io.to(roomId).emit('room_update', engine.getState());
        this.checkBotTurn(roomId);
      }
    });

    socket.on('game_action', (data: { roomId: string; action: any }) => {
      const engine = this.rooms.get(data.roomId);
      if (engine) {
        engine.handleAction(socket.id, data.action);
        this.io.to(data.roomId).emit('room_update', engine.getState());
        this.checkBotTurn(data.roomId);
      }
    });
    
    socket.on('game_response', (data: { roomId: string; response: any }) => {
        const engine = this.rooms.get(data.roomId);
        if (engine) {
          engine.handleResponse(socket.id, data.response);
          this.io.to(data.roomId).emit('room_update', engine.getState());
          this.checkBotTurn(data.roomId);
        }
      });
  }

  private checkBotTurn(roomId: string) {
    const engine = this.rooms.get(roomId);
    if (!engine) return;
    
    const state = engine.getState();
    const botMgr = new BotManager(engine);

    // Turno do Bot (Fase de Ação)
    if (state.phase === 'action') {
      const currentPlayer = state.players[state.turnIndex];
      if (currentPlayer && currentPlayer.isBot && currentPlayer.cards.length > 0) {
        setTimeout(() => {
          const action = botMgr.decideAction(currentPlayer.id);
          if (action) {
            engine.handleAction(currentPlayer.id, action);
            this.io.to(roomId).emit('room_update', engine.getState());
            this.checkBotTurn(roomId);
          }
        }, 1500);
        return;
      }
    }

    // Bots respondendo a desafios/bloqueios
    if (state.phase === 'challenge' || state.phase === 'block') {
      const botsToRespond = state.players.filter(p => p.isBot && p.cards.length > 0 && !state.responses[p.id]);
      
      if (botsToRespond.length > 0) {
        setTimeout(() => {
          botsToRespond.forEach(bot => {
            const response = botMgr.decideResponse(bot.id);
            engine.handleResponse(bot.id, response);
          });
          this.io.to(roomId).emit('room_update', engine.getState());
          this.checkBotTurn(roomId);
        }, 1000);
      }
    }
  }
}
