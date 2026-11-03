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

// CORS middleware for REST API
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
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
const HOST = '0.0.0.0';

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ [ERRO FATAL] A porta ${PORT} já está sendo usada por outro processo.`);
    console.error(`   Feche o outro terminal aberto ou finalize o processo node no Gerenciador de Tarefas.\n`);
    process.exit(1);
  } else {
    console.error('❌ [ERRO NO SERVIDOR]:', err);
  }
});

// Encerramento gracioso para liberar a porta no Windows imediatamente
process.on('SIGINT', () => {
  console.log('\n🛑 Encerrando servidor e liberando portas...');
  server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});

server.listen(PORT, HOST, () => {
  console.log('====================================================');
  console.log(`🚀 [STREAM LITERAL] Servidor iniciado com sucesso!`);
  console.log(`🌐 Acesso Local:     http://localhost:${PORT}`);
  console.log(`🌐 Acesso Rede IPv4: http://127.0.0.1:${PORT}`);
  console.log(`🔒 Para acesso externo seguro, use Cloudflare Tunnel`);
  console.log('====================================================');
});
