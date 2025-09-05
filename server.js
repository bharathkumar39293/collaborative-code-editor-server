import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Server } from 'socket.io';
import ACTIONS from './src/actions/Actions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5175",
    methods: ["GET", "POST"],
  },
});

app.use(express.static('build'));
app.use((req, res, next) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

const userSocketMap = {};
function getAllConnectedClients(roomId) {
  // For every socket in a room, get its username
  return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map((socketId) => {
    return {
      socketId,
      username: userSocketMap[socketId] || "Anonymous", // fallback to avoid undefined
    };
  });
}

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  socket.on(ACTIONS.JOIN, ({ roomId, username }) => {
    // Prevent empty username; fallback/debug
    if (!username || username.trim() === "") {
      console.log(`[WARN] Empty username received for socketId ${socket.id}`);
      userSocketMap[socket.id] = "Anonymous";
    } else {
      userSocketMap[socket.id] = username;
    }
    socket.join(roomId);

    const clients = getAllConnectedClients(roomId);
    console.log('[JOINED EMIT]:', clients);

    // Send joined event to everyone in the room (including joiner)
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
    delete userSocketMap[socket.id];
  });
});

app.get('/', (req, res) => {
  const htmlContent = '<h1>Welcome to the code editor server</h1>';
  res.setHeader('Content-Type', 'text/html');
  res.send(htmlContent);
});

const PORT = process.env.SERVER_PORT || 5000;
server.listen(PORT, () => console.log(`Listening on port ${PORT}`));
