import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import ACTIONS from './Actions.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5175", // Update this in production to your frontend URL
    methods: ["GET", "POST"],
  },
});

const userSocketMap = {};
function getAllConnectedClients(roomId) {
  return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map((socketId) => ({
    socketId,
    username: userSocketMap[socketId] || "Anonymous",
  }));
}

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  socket.on(ACTIONS.JOIN, ({ roomId, username }) => {
    if (!username || username.trim() === "") {
      console.log(`[WARN] Empty username received for socketId ${socket.id}`);
      userSocketMap[socket.id] = "Anonymous";
    } else {
      userSocketMap[socket.id] = username;
    }
    socket.join(roomId);

    const clients = getAllConnectedClients(roomId);
    console.log('[JOINED EMIT]:', clients);

    io.to(roomId).emit(ACTIONS.JOINED, {
      clients,
      username: userSocketMap[socket.id],
      socketId: socket.id,
    });
  });

  socket.on(ACTIONS.CODE_CHANGE, ({ roomId, code }) => {
    socket.in(roomId).emit(ACTIONS.CODE_CHANGE, { code });
  });

  socket.on(ACTIONS.SYNC_CODE, ({ socketId, code }) => {
    io.to(socketId).emit(ACTIONS.CODE_CHANGE, { code });
  });

  socket.on('disconnecting', () => {
    const rooms = [...socket.rooms];
    rooms.forEach((roomId) => {
      socket.in(roomId).emit(ACTIONS.DISCONNECTED, {
        socketId: socket.id,
        username: userSocketMap[socket.id],
      });
    });
    console.log('Socket disconnecting:', socket.id);
    delete userSocketMap[socket.id];
  });

  socket.on('disconnect', (reason) => {
    console.log(`Socket disconnected: ${socket.id}, reason: ${reason}`);
  });

  socket.on('connect_error', (err) => {
    console.error(`Connection error on socket ${socket.id}: ${err.message}`);
  });
});

io.engine.on('connection_error', (err) => {
  console.error('Engine connection error:', err.message);
});

// Simple root endpoint for health check or basic info
app.get('/', (req, res) => {
  const htmlContent = '<h1>Welcome to the code editor server</h1>';
  res.setHeader('Content-Type', 'text/html');
  res.send(htmlContent);
});

const PORT = process.env.SERVER_PORT || 5000;
server.listen(PORT, () => console.log(`Listening on port ${PORT}`));
