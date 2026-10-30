/**
 * Stream Literal - Gerenciador WebRTC com Arquitetura Direcional Dedicada
 * Garante múltiplos compartilhamentos simultâneos sem conflitos de negociação (glare)
 */

class WebRTCManager {
  constructor(socket, currentUser, onStreamAdded, onStreamRemoved, onStreamingStateChanged) {
    this.socket = socket;
    this.currentUser = currentUser;
    this.onStreamAdded = onStreamAdded;             // callback(peerId, stream, user)
    this.onStreamRemoved = onStreamRemoved;         // callback(peerId)
    this.onStreamingStateChanged = onStreamingStateChanged; // callback(isSharing)

    this.localStream = null;
    this.isSharingScreen = false;

    // Conexões de ENVIO (quando EU sou o streamer): viewerPeerId -> RTCPeerConnection
    this.sendConnections = new Map();

    // Conexões de RECEBIMENTO (quando EU sou o viewer): streamerPeerId -> RTCPeerConnection
    this.receiveConnections = new Map();

    // Filas de ICE Candidates: connectionKey -> [candidate]
    this.iceCandidateQueues = new Map();

    this.rtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    };

    this.setupSocketListeners();
  }

  setupSocketListeners() {
    // Quando outro usuário inicia uma transmissão
    this.socket.on('stream-started', ({ streamerId, user }) => {
      // Se for a nossa própria transmissão, a UI já tratou localmente
      if (streamerId === this.socket.id) return;
      console.log(`📡 [STREAM-STARTED] @${user?.username || streamerId} iniciou transmissão. Aguardando oferta...`);
    });

    // Quando alguém encerra a transmissão
    this.socket.on('stream-stopped', ({ streamerId }) => {
      console.log(`⏹️ [STREAM-STOPPED] Transmissão de ${streamerId} finalizada.`);
      this.closeReceiveConnection(streamerId);
      this.onStreamRemoved(streamerId);
    });

    // Quando um novo usuário entra na sala:
    // Se nós estivermos transmitindo, enviamos uma oferta para ele!
    this.socket.on('user-joined', ({ peer }) => {
      if (this.isSharingScreen && peer.socketId !== this.socket.id) {
        console.log(`👋 Novo usuário @${peer.user.username} entrou. Enviando nossa tela para ele...`);
        this.createSendConnection(peer.socketId);
      }
    });

    // Oferta WebRTC recebida (Streamer -> Viewer)
    this.socket.on('webrtc-offer', async ({ fromPeerId, streamerId, offer, fromUser }) => {
      await this.handleOffer(fromPeerId, streamerId, offer, fromUser);
    });

    // Resposta WebRTC recebida (Viewer -> Streamer)
    this.socket.on('webrtc-answer', async ({ fromPeerId, streamerId, answer }) => {
      await this.handleAnswer(fromPeerId, streamerId, answer);
    });

    // ICE Candidate recebido
    this.socket.on('webrtc-ice-candidate', async ({ fromPeerId, streamerId, candidate }) => {
      await this.handleIceCandidate(fromPeerId, streamerId, candidate);
    });

    // Quando um peer se desconecta totalmente
    this.socket.on('user-left', ({ peerId }) => {
      this.closeSendConnection(peerId);
      this.closeReceiveConnection(peerId);
      this.onStreamRemoved(peerId);
    });
  }

  // ========================================================
  // TRANSMISSÃO (PRODUTOR / SENDER)
  // ========================================================

  async startScreenShare(existingPeers = []) {
    try {
      this.localStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
          frameRate: { ideal: 30, max: 60 }
        },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });

      this.isSharingScreen = true;
      this.onStreamingStateChanged(true);

      // Listener para quando o usuário clicar em "Interromper compartilhamento" na barra nativa do navegador
      const videoTrack = this.localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          this.stopScreenShare();
        };
      }

      // Notifica o servidor de sinalização
      this.socket.emit('start-stream');

      // Exibe a própria tela imediatamente na UI local (miniatura e destaque)
      this.onStreamAdded(this.socket.id, this.localStream, this.currentUser);

      // Envia nossa transmissão para todos os outros membros conectados
      existingPeers.forEach((peer) => {
        if (peer.socketId !== this.socket.id) {
          this.createSendConnection(peer.socketId);
        }
      });

      return true;
    } catch (err) {
      console.warn('Compartilhamento cancelado ou não permitido:', err);
      this.isSharingScreen = false;
      this.onStreamingStateChanged(false);
      return false;
    }
  }

  // Cria uma conexão de ENVIO dedicada para um espectador específico
  async createSendConnection(viewerPeerId) {
    try {
      this.closeSendConnection(viewerPeerId);

      const pc = new RTCPeerConnection(this.rtcConfig);
      this.sendConnections.set(viewerPeerId, pc);
      const queueKey = `send_${viewerPeerId}`;
      this.iceCandidateQueues.set(queueKey, []);

      // Adiciona as faixas de vídeo e áudio da tela local
      if (this.localStream) {
        this.localStream.getTracks().forEach((track) => {
          pc.addTrack(track, this.localStream);
        });
      }

      // Envia candidatos ICE para o espectador
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.socket.emit('webrtc-ice-candidate', {
            toPeerId: viewerPeerId,
            streamerId: this.socket.id,
            candidate: event.candidate
          });
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (['disconnected', 'failed', 'closed'].includes(pc.iceConnectionState)) {
          this.closeSendConnection(viewerPeerId);
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      this.socket.emit('webrtc-offer', {
        toPeerId: viewerPeerId,
        streamerId: this.socket.id,
        offer
      });
    } catch (err) {
      console.error(`Erro ao criar conexão de envio para ${viewerPeerId}:`, err);
    }
  }

  // ========================================================
  // RECEPÇÃO (CONSUMIDOR / VIEWER)
  // ========================================================

  async handleOffer(fromPeerId, streamerId, offer, fromUser) {
    try {
      console.log(`📥 Recebendo oferta de transmissão de @${fromUser?.username || streamerId}...`);
      this.closeReceiveConnection(streamerId);

      const pc = new RTCPeerConnection(this.rtcConfig);
      this.receiveConnections.set(streamerId, pc);
      const queueKey = `receive_${streamerId}`;
      this.iceCandidateQueues.set(queueKey, []);

      // Quando as trilhas de vídeo/áudio remotas chegam
      pc.ontrack = (event) => {
        console.log(`🎬 Trilha de vídeo/áudio recebida de ${streamerId}:`, event.track.kind);
        const remoteStream = event.streams[0] || new MediaStream([event.track]);
        this.onStreamAdded(streamerId, remoteStream, fromUser);
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.socket.emit('webrtc-ice-candidate', {
            toPeerId: streamerId,
            streamerId: streamerId,
            candidate: event.candidate
          });
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (['disconnected', 'failed', 'closed'].includes(pc.iceConnectionState)) {
          this.closeReceiveConnection(streamerId);
          this.onStreamRemoved(streamerId);
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      // Aplica candidatos ICE que chegaram antes da descrição remota
      const queue = this.iceCandidateQueues.get(queueKey) || [];
      while (queue.length > 0) {
        const cand = queue.shift();
        await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      this.socket.emit('webrtc-answer', {
        toPeerId: streamerId,
        streamerId: streamerId,
        answer
      });
    } catch (err) {
      console.error(`Erro ao processar oferta de ${streamerId}:`, err);
    }
  }

  async handleAnswer(fromPeerId, streamerId, answer) {
    try {
      // Como somos o streamer, procuramos na nossa lista de conexões de envio para o viewer
      const pc = this.sendConnections.get(fromPeerId);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));

        const queueKey = `send_${fromPeerId}`;
        const queue = this.iceCandidateQueues.get(queueKey) || [];
        while (queue.length > 0) {
          const cand = queue.shift();
          await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
        }
      }
    } catch (err) {
      console.error(`Erro ao processar resposta de ${fromPeerId}:`, err);
    }
  }

  async handleIceCandidate(fromPeerId, streamerId, candidate) {
    try {
      let pc = null;
      let queueKey = '';

      if (streamerId === this.socket.id) {
        // Somos o streamer, o candidato veio do viewer (fromPeerId)
        pc = this.sendConnections.get(fromPeerId);
        queueKey = `send_${fromPeerId}`;
      } else {
        // Somos o viewer, o candidato veio do streamer (streamerId)
        pc = this.receiveConnections.get(streamerId);
        queueKey = `receive_${streamerId}`;
      }

      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      } else {
        const queue = this.iceCandidateQueues.get(queueKey);
        if (queue) {
          queue.push(candidate);
        }
      }
    } catch (err) {
      console.error(`Erro ao adicionar candidato ICE:`, err);
    }
  }

  // ========================================================
  // FINALIZAÇÃO E LIMPEZA
  // ========================================================

  stopScreenShare() {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    this.isSharingScreen = false;
    this.onStreamingStateChanged(false);

    // Notifica o servidor
    this.socket.emit('stop-stream');

    // Fecha todas as conexões de envio
    this.sendConnections.forEach((pc) => {
      try { pc.close(); } catch {}
    });
    this.sendConnections.clear();

    // Remove nossa stream local da UI
    this.onStreamRemoved(this.socket.id);
  }

  closeSendConnection(viewerPeerId) {
    const pc = this.sendConnections.get(viewerPeerId);
    if (pc) {
      try { pc.close(); } catch {}
      this.sendConnections.delete(viewerPeerId);
    }
    this.iceCandidateQueues.delete(`send_${viewerPeerId}`);
  }

  closeReceiveConnection(streamerId) {
    const pc = this.receiveConnections.get(streamerId);
    if (pc) {
      try { pc.close(); } catch {}
      this.receiveConnections.delete(streamerId);
    }
    this.iceCandidateQueues.delete(`receive_${streamerId}`);
  }

  destroy() {
    this.stopScreenShare();
    this.receiveConnections.forEach((pc) => {
      try { pc.close(); } catch {}
    });
    this.receiveConnections.clear();
    this.iceCandidateQueues.clear();
  }
}
