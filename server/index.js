const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const { setupSignaling } = require('./sockets/signaling');

const app = express();
const server = http.createServer(app);

// Socket.io with permissive CORS for local and tunnel access
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// JSON and URL-encoded body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static assets from client/
const clientPath = path.join(__dirname, '..', 'client');
app.use(express.static(clientPath));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', authRoutes);

// Setup WebRTC signaling
setupSignaling(io);

// SPA fallback: any other request returns client/index.html
app.use((req, res) => {
  res.sendFile(path.join(clientPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('====================================================');
  console.log(`🚀 [STREAM LITERAL] Servidor iniciado com sucesso!`);
  console.log(`🌐 Acesso Local:     http://localhost:${PORT}`);
  console.log(`🔒 Para acesso externo seguro, use Cloudflare Tunnel`);
  console.log('====================================================');
});
