const { verifyToken } = require('../middleware/auth');

function setupSignaling(io) {
  // Store connected users: socketId -> { user, socketId, isStreaming, streamingSince }
  const activePeers = new Map();

  // Socket authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Autenticação necessária.'));
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return next(new Error('Token inválido ou expirado.'));
    }

    socket.user = decoded;
    next();
  });

  io.on('connection', (socket) => {
    const user = socket.user;
    console.log(`🔌 [CONECTADO] @${user.username} entrou na sala [socket: ${socket.id}]`);

    activePeers.set(socket.id, {
      socketId: socket.id,
      user,
      isStreaming: false,
      streamingSince: null
    });

    // Notify the newly joined socket of current active peers and streams
    socket.emit('room-state', {
      selfId: socket.id,
      peers: Array.from(activePeers.values())
    });

    // Notify all other clients that a new user joined
    socket.broadcast.emit('user-joined', {
      peer: activePeers.get(socket.id)
    });

    // Handle user starting a screen share
    socket.on('start-stream', () => {
      const peer = activePeers.get(socket.id);
      if (peer) {
        peer.isStreaming = true;
        peer.streamingSince = Date.now();
        console.log(`📺 [STREAM INICIADA] @${user.username} iniciou compartilhamento.`);
        io.emit('stream-started', {
          peerId: socket.id,
          streamerId: socket.id,
          user: peer.user,
          streamingSince: peer.streamingSince
        });
      }
    });

    // Handle user stopping screen share
    socket.on('stop-stream', () => {
      const peer = activePeers.get(socket.id);
      if (peer && peer.isStreaming) {
        peer.isStreaming = false;
        peer.streamingSince = null;
        console.log(`⏹️ [STREAM FINALIZADA] @${user.username} encerrou compartilhamento.`);
        io.emit('stream-stopped', {
          peerId: socket.id,
          streamerId: socket.id
        });
      }
    });

    // WebRTC Signaling: Offer (Streamer -> Viewer)
    socket.on('webrtc-offer', ({ toPeerId, streamerId, offer }) => {
      io.to(toPeerId).emit('webrtc-offer', {
        fromPeerId: socket.id,
        streamerId: streamerId || socket.id,
        offer,
        fromUser: socket.user
      });
    });

    // WebRTC Signaling: Answer (Viewer -> Streamer)
    socket.on('webrtc-answer', ({ toPeerId, streamerId, answer }) => {
      io.to(toPeerId).emit('webrtc-answer', {
        fromPeerId: socket.id,
        streamerId: streamerId || toPeerId,
        answer
      });
    });

    // WebRTC Signaling: ICE Candidate
    socket.on('webrtc-ice-candidate', ({ toPeerId, streamerId, candidate }) => {
      io.to(toPeerId).emit('webrtc-ice-candidate', {
        fromPeerId: socket.id,
        streamerId: streamerId || socket.id,
        candidate
      });
    });

    // Disconnect
    socket.on('disconnect', () => {
      const peer = activePeers.get(socket.id);
      if (peer) {
        if (peer.isStreaming) {
          io.emit('stream-stopped', {
            peerId: socket.id,
            streamerId: socket.id
          });
        }
        activePeers.delete(socket.id);
        console.log(`🔌 [DESCONECTADO] @${user.username} saiu da sala [socket: ${socket.id}]`);
        io.emit('user-left', {
          peerId: socket.id,
          user
        });
      }
    });
  });
}

module.exports = { setupSignaling };
