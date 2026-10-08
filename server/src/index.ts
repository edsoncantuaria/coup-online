import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { RoomManager } from './socket/RoomManager.js';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const roomManager = new RoomManager(io);

app.get('/api/ping', (_req, res) => {
  res.json({ ok: true, name: 'coup-online' });
});

app.get('/api/rooms', (_req, res) => {
  res.json({ rooms: roomManager.getLobbySummaries() });
});

io.on('connection', (socket) => {
  roomManager.handleConnection(socket);

  socket.on('disconnect', () => {
    roomManager.handleDisconnect(socket);
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
