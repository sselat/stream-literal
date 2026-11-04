/**
 * Stream Literal - Audio Bridge
 * Conecta a captura nativa WASAPI Loopback do Rust ao Web Audio API do navegador,
 * gerando um MediaStreamTrack pronto para o WebRTC sem duplicar ou dar eco para o streamer.
 */

class AudioBridge {
  constructor() {
    this.audioCtx = null;
    this.destination = null;
    this.channel = null;
    this.isCapturing = false;
    this.nextPlayTime = 0;
    this.currentInfo = null;
  }

  /**
   * Verifica se o ambiente possui acesso à API nativa do Tauri v2
   */
  isSupported() {
    return Boolean(
      window.__TAURI__?.core?.invoke &&
      window.__TAURI__?.core?.Channel
    );
  }

  /**
   * Inicia a captura WASAPI Loopback via Rust e inicializa o pipeline de áudio
   * @param {string[]} targetExes - Lista de executáveis para silenciar (ex: ['discord.exe'])
   * @param {boolean} exclude - true para capturar todo o sistema EXCETO os alvos
   * @returns {Promise<{ track: MediaStreamTrack, info: any }>}
   */
  async start(targetExes = ['stream-literal.exe', 'msedgewebview2.exe', 'discord.exe'], exclude = true, targetPid = null) {
    if (!this.isSupported()) {
      throw new Error('Tauri API não disponível para captura nativa.');
    }

    if (this.isCapturing) {
      await this.stop();
    }

    const { Channel, invoke } = window.__TAURI__.core;
    this.channel = new Channel();

    this.channel.onmessage = (chunk) => {
      this.handleAudioChunk(chunk);
    };

    console.log('🎙️ [AudioBridge] Solicitando início da captura nativa ao Rust...', { targetExes, exclude, targetPid });

    const result = await invoke('start_audio_capture', {
      onAudioChunk: this.channel,
      targetExes: targetExes,
      targetPid: targetPid || null,
      exclude: exclude
    });

    this.currentInfo = result;
    const sampleRate = result.sample_rate || 48000;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.audioCtx = new AudioContextClass({
      sampleRate: sampleRate,
      latencyHint: 'interactive'
    });

    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    // O destino cria uma MediaStream isolada para o WebRTC
    // NOTA IMPORTANTE: Nós NÃO conectamos ao audioCtx.destination (alto-falantes locais),
    // garantindo 0% de eco para quem está transmitindo!
    this.destination = this.audioCtx.createMediaStreamDestination();
    this.nextPlayTime = 0;
    this.isCapturing = true;

    console.log(`✅ [AudioBridge] Captura WASAPI ativa: ${sampleRate}Hz estéreo. Alvo:`, result);

    const track = this.destination.stream.getAudioTracks()[0];
    return {
      track,
      info: result
    };
  }

  /**
   * Alimenta os chunks PCM estéreo Float32 recebidos do Rust no Web Audio
   */
  handleAudioChunk(data) {
    if (!this.isCapturing || !this.audioCtx || !this.destination) return;
    if (!data) return;

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }

    let floatArray;
    try {
      if (data instanceof ArrayBuffer) {
        floatArray = new Float32Array(data);
      } else if (ArrayBuffer.isView(data)) {
        floatArray = new Float32Array(data.buffer, data.byteOffset, Math.floor(data.byteLength / 4));
      } else if (Array.isArray(data)) {
        floatArray = new Float32Array(new Uint8Array(data).buffer);
      } else {
        return;
      }
    } catch {
      return;
    }

    const numFrames = Math.floor(floatArray.length / 2); // Estéreo: 2 canais por frame
    if (numFrames <= 0) return;

    try {
      const audioBuffer = this.audioCtx.createBuffer(2, numFrames, this.audioCtx.sampleRate);
      const leftChannel = audioBuffer.getChannelData(0);
      const rightChannel = audioBuffer.getChannelData(1);

      // Desentrelaçamento direto
      for (let i = 0; i < numFrames; i++) {
        leftChannel[i] = floatArray[i * 2];
        rightChannel[i] = floatArray[i * 2 + 1];
      }

      const source = this.audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.destination);

      const now = this.audioCtx.currentTime;
      // Jitter buffer adaptativo (30ms para suavidade)
      if (this.nextPlayTime < now) {
        this.nextPlayTime = now + 0.03;
      } else if (this.nextPlayTime > now + 0.12) {
        this.nextPlayTime = now + 0.03;
      }

      source.start(this.nextPlayTime);
      this.nextPlayTime += audioBuffer.duration;
    } catch (err) {
      console.warn('[AudioBridge] Erro ao reproduzir chunk:', err);
    }
  }

  /**
   * Atualiza as exclusões em tempo real durante uma transmissão em andamento
   */
  /**
   * Inicia captura exclusiva para uma janela específica (muta todo o restante do PC)
   */
  async startForWindow(windowPid) {
    return this.start([], false, windowPid);
  }

  /**
   * Atualiza as exclusões em tempo real durante uma transmissão em andamento
   */
  async updateExclusions(targetExes = ['stream-literal.exe', 'msedgewebview2.exe', 'discord.exe'], exclude = true, targetPid = null) {
    if (!this.isCapturing || !this.isSupported()) return null;

    const { Channel, invoke } = window.__TAURI__.core;
    const newChannel = new Channel();
    newChannel.onmessage = (chunk) => {
      this.handleAudioChunk(chunk);
    };
    this.channel = newChannel;

    console.log('🔄 [AudioBridge] Atualizando filtros mid-stream...', { targetExes, exclude, targetPid });

    const result = await invoke('start_audio_capture', {
      onAudioChunk: this.channel,
      targetExes: targetExes,
      targetPid: targetPid || null,
      exclude: exclude
    });

    this.currentInfo = result;
    return result;
  }

  /**
   * Encerra a captura WASAPI e libera recursos do Web Audio
   */
  async stop() {
    this.isCapturing = false;

    if (this.isSupported()) {
      try {
        const { invoke } = window.__TAURI__.core;
        await invoke('stop_audio_capture');
      } catch (err) {
        console.warn('[AudioBridge] Erro ao chamar stop_audio_capture:', err);
      }
    }

    if (this.audioCtx) {
      try {
        await this.audioCtx.close();
      } catch {}
      this.audioCtx = null;
    }

    this.destination = null;
    this.channel = null;
    this.nextPlayTime = 0;
    this.currentInfo = null;
    console.log('⏹️ [AudioBridge] Captura finalizada.');
  }
}

// Instância global
window.AudioBridge = new AudioBridge();
