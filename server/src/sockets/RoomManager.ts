import { Server, Socket } from 'socket.io';
import { CoupEngine } from '../engine/CoupEngine.js';
import { Action } from '../engine/types.js';

export class RoomManager {
  private io: Server;
  private games: Map<string, CoupEngine> = new Map();

  constructor(io: Server) {
    this.io = io;
    this.setupListeners();
  }

  private setupListeners() {
    this.io.on('connection', (socket: Socket) => {
      console.log('Client connected:', socket.id);

      socket.on('join_room', (data: { roomId: string; playerName: string }) => {
        socket.join(data.roomId);
        console.log(`${data.playerName} joined room ${data.roomId}`);
        
        // Broadcast joined event or initial state
        this.io.to(data.roomId).emit('player_joined', data.playerName);
      });

      socket.on('start_game', (roomId: string) => {
        // Mock players for now, will get from room state
        const players = [
          { id: socket.id, name: 'Player 1', isBot: false },
          { id: 'bot-1', name: 'Bot Inquisidor', isBot: true }
        ];
        
        const engine = new CoupEngine(roomId, players);
        engine.startGame();
        this.games.set(roomId, engine);
        
        this.broadcastState(roomId);
      });

      socket.on('game_action', (data: { roomId: string; action: Action }) => {
        const engine = this.games.get(data.roomId);
        if (engine) {
          engine.handleAction(data.action);
          this.broadcastState(data.roomId);
        }
      });

      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
      });
    });
  }

  private broadcastState(roomId: string) {
    const engine = this.games.get(roomId);
    if (engine) {
      this.io.to(roomId).emit('game_state', engine.getState());
    }
  }
}
