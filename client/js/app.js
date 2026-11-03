/**
 * Stream Literal - Lógica Principal do Aplicativo e Interface
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elementos do DOM - Login
  const loginContainer = document.getElementById('login-container');
  const roomContainer = document.getElementById('room-container');
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const btnLogin = document.getElementById('btn-login');
  const btnToggleServerConfig = document.getElementById('btn-toggle-server-config');
  const serverConfigPanel = document.getElementById('server-config-panel');
  const serverUrlInput = document.getElementById('server-url-input');

  // Elementos do Top Nav
  const roomStatusText = document.getElementById('room-status-text');
  const statusDot = document.querySelector('.status-dot');
  const serverOfflineBanner = document.getElementById('server-offline-banner');
  const btnRetryConnection = document.getElementById('btn-retry-connection');
  const userAvatarInitials = document.getElementById('user-avatar-initials');
  const userDisplayName = document.getElementById('user-display-name');
  const userRoleBadge = document.getElementById('user-role-badge');
  const btnLogout = document.getElementById('btn-logout');
  const btnAdminModal = document.getElementById('btn-admin-modal');
  const btnOpenPasswordModal = document.getElementById('btn-open-password-modal');

  // Elementos da Área Principal (Spotlight)
  const spotlightContainer = document.getElementById('spotlight-container');
  const spotlightEmpty = document.getElementById('spotlight-empty');
  const spotlightPlayerWrapper = document.getElementById('spotlight-player-wrapper');
  const spotlightVideo = document.getElementById('spotlight-video');
  const spotlightStreamerName = document.getElementById('spotlight-streamer-name');
  const spotlightAudioIndicator = document.getElementById('spotlight-audio-indicator');
  
  // Controles de Mídia do Spotlight
  const spotlightControls = document.getElementById('spotlight-controls');
  const btnSpotlightMute = document.getElementById('btn-spotlight-mute');
  const iconVolumeHigh = document.getElementById('icon-volume-high');
  const iconVolumeMuted = document.getElementById('icon-volume-muted');
  const spotlightVolumeSlider = document.getElementById('spotlight-volume-slider');
  const btnSpotlightPip = document.getElementById('btn-spotlight-pip');
  const btnSpotlightFullscreen = document.getElementById('btn-spotlight-fullscreen');
  const iconFullscreenEnter = document.getElementById('icon-fullscreen-enter');
  const iconFullscreenExit = document.getElementById('icon-fullscreen-exit');

  // Elementos da Barra Lateral
  const connectedCountBadge = document.getElementById('connected-count-badge');
  const streamsThumbnailsContainer = document.getElementById('streams-thumbnails-container');
  const membersOnlineList = document.getElementById('members-online-list');

  // Elementos da Barra Inferior
  const btnToggleShare = document.getElementById('btn-toggle-share');
  const iconStartShare = document.getElementById('icon-start-share');
  const iconStopShare = document.getElementById('icon-stop-share');
  const btnToggleShareText = document.getElementById('btn-toggle-share-text');

  // Elementos do Modal Admin
  const adminModal = document.getElementById('admin-modal');
  const btnCloseAdminModal = document.getElementById('btn-close-admin-modal');
  const formCreateUser = document.getElementById('form-create-user');
  const createUserStatus = document.getElementById('create-user-status');
  const adminUsersListTbody = document.getElementById('admin-users-list-tbody');

  // Elementos do Modal Alterar Senha
  const passwordModal = document.getElementById('password-modal');
  const btnClosePasswordModal = document.getElementById('btn-close-password-modal');
  const formChangePassword = document.getElementById('form-change-password');
  const changePasswordStatus = document.getElementById('change-password-status');

  // Elementos do Modal Isolamento de Áudio
  const btnAudioSettings = document.getElementById('btn-audio-settings');
  const audioSettingsModal = document.getElementById('audio-settings-modal');
  const btnCloseAudioModal = document.getElementById('btn-close-audio-modal');
  const audioAppsList = document.getElementById('audio-apps-list');
  const btnRefreshAudioApps = document.getElementById('btn-refresh-audio-apps');
  const customExeInput = document.getElementById('custom-exe-input');
  const btnAddCustomExe = document.getElementById('btn-add-custom-exe');
  const btnSaveAudioSettings = document.getElementById('btn-save-audio-settings');
  const audioSettingsStatus = document.getElementById('audio-settings-status');

  // Estado da Aplicação
  let currentUser = null;
  let socket = null;
  let webrtc = null;
  let activePeers = [];
  // Mapa de streams ativas: peerId -> { stream, user }
  const activeStreams = new Map();
  let pinnedPeerId = null;

  // ========================================================
  // INICIALIZAÇÃO E AUTENTICAÇÃO
  // ========================================================
  if (serverUrlInput) {
    const currentCustomUrl = localStorage.getItem(API.SERVER_URL_KEY) || '';
    serverUrlInput.value = currentCustomUrl;
    serverUrlInput.addEventListener('change', () => {
      API.setServerUrl(serverUrlInput.value);
    });
  }

  if (btnToggleServerConfig && serverConfigPanel) {
    btnToggleServerConfig.addEventListener('click', () => {
      const isHidden = serverConfigPanel.style.display === 'none';
      serverConfigPanel.style.display = isHidden ? 'block' : 'none';
    });
  }

  async function init() {
    currentUser = await API.getMe();
    if (currentUser) {
      showRoomView();
      connectSocket();
    } else {
      showLoginView();
    }
  }

  function showLoginView() {
    loginContainer.style.display = 'flex';
    roomContainer.style.display = 'none';
  }

  function showRoomView() {
    loginContainer.style.display = 'none';
    roomContainer.style.display = 'flex';

    // Preenche dados do usuário logado
    userDisplayName.textContent = '@' + currentUser.username;
    userAvatarInitials.textContent = currentUser.username.substring(0, 2).toUpperCase();
    
    if (currentUser.is_admin) {
      userRoleBadge.textContent = 'Admin';
      btnAdminModal.style.display = 'inline-flex';
    } else {
      userRoleBadge.textContent = 'Membro';
      btnAdminModal.style.display = 'none';
    }
  }

  // Formulário de Login
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.style.display = 'none';
    btnLogin.disabled = true;
    btnLogin.innerHTML = '<span>Entrando...</span>';

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    try {
      const data = await API.login(username, password);
      currentUser = data.user;
      showRoomView();
      connectSocket();
    } catch (err) {
      loginError.textContent = err.message;
      loginError.style.display = 'block';
    } finally {
      btnLogin.disabled = false;
      btnLogin.innerHTML = '<span>Entrar na Sala</span>';
    }
  });

  // Logout
  btnLogout.addEventListener('click', () => {
    if (confirm('Deseja realmente sair da Stream Literal?')) {
      if (webrtc) webrtc.destroy();
      if (socket) socket.disconnect();
      API.removeToken();
      window.location.reload();
    }
  });

  // Função para exibir alertas e avisos visuais no topo
  function showNotice(message, type = 'info') {
    const existing = document.getElementById('app-toast-notice');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'app-toast-notice';
    toast.className = `toast-notice toast-${type}`;
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-show');
    }, 10);

    setTimeout(() => {
      toast.classList.remove('toast-show');
      setTimeout(() => toast.remove(), 350);
    }, 6000);
  }

  // ========================================================
  // CONTROLE DO ESTADO DE CONEXÃO E BANNER OFFLINE
  // ========================================================
  let wasOffline = false;

  function showOfflineBanner() {
    if (serverOfflineBanner) {
      serverOfflineBanner.style.display = 'block';
    }
    if (statusDot) {
      statusDot.classList.remove('status-online');
      statusDot.classList.add('status-offline');
    }
  }

  function hideOfflineBanner() {
    if (serverOfflineBanner) {
      serverOfflineBanner.style.display = 'none';
    }
    if (statusDot) {
      statusDot.classList.remove('status-offline');
      statusDot.classList.add('status-online');
    }
  }

  if (btnRetryConnection) {
    btnRetryConnection.addEventListener('click', () => {
      btnRetryConnection.innerHTML = '<span>Reconectando...</span>';
      btnRetryConnection.disabled = true;
      if (socket) {
        socket.connect();
      }
      setTimeout(() => {
        btnRetryConnection.disabled = false;
        btnRetryConnection.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
          <span>Reconectar</span>
        `;
      }, 1500);
    });
  }

  // ========================================================
  // CONEXÃO SOCKET.IO E WEBRTC
  // ========================================================
  function connectSocket() {
    const token = API.getToken();
    socket = io(API.getServerUrl(), {
      auth: { token },
      transports: ['websocket'], // Conexão persistente WebSocket pura (evita problemas de polling Anycast no Cloudflare)
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000
    });

    socket.on('connect', () => {
      hideOfflineBanner();
      roomStatusText.textContent = 'Sala Única Conectada';
      if (wasOffline) {
        showNotice('🚀 Conexão restabelecida com a base estelar!', 'success');
        wasOffline = false;
      }
      console.log('✅ Conectado à sala única.');
    });

    socket.on('connect_error', (err) => {
      console.warn('Conexão Socket.io instável ou reconectando:', err.message);
      wasOffline = true;
      roomStatusText.textContent = 'Sinal Perdido';
      showOfflineBanner();
    });

    socket.on('disconnect', (reason) => {
      console.warn('Socket desconectado:', reason);
      if (reason !== 'io client disconnect') {
        wasOffline = true;
        roomStatusText.textContent = 'Desconectado';
        showOfflineBanner();
      }
    });

    // Inicializa WebRTC com arquitetura de conexões direcionais dedicadas
    webrtc = new WebRTCManager(
      socket,
      currentUser,
      handleStreamAdded,
      handleStreamRemoved,
      handleStreamingStateChanged,
      showNotice
    );

    // Estado inicial da sala recebido do servidor
    socket.on('room-state', ({ selfId, peers }) => {
      activePeers = peers;
      updateMembersList();
    });

    // Novo usuário entrou
    socket.on('user-joined', ({ peer }) => {
      const exists = activePeers.some(p => p.socketId === peer.socketId);
      if (!exists) activePeers.push(peer);
      updateMembersList();
    });

    // Usuário saiu
    socket.on('user-left', ({ peerId }) => {
      activePeers = activePeers.filter(p => p.socketId !== peerId);
      updateMembersList();
      handleStreamRemoved(peerId);
    });

    // Usuário começou a transmitir
    socket.on('stream-started', ({ peerId, streamerId, user }) => {
      const targetId = streamerId || peerId;
      const peer = activePeers.find(p => p.socketId === targetId);
      if (peer) peer.isStreaming = true;
      updateMembersList();
    });

    // Usuário parou de transmitir
    socket.on('stream-stopped', ({ peerId, streamerId }) => {
      const targetId = streamerId || peerId;
      const peer = activePeers.find(p => p.socketId === targetId);
      if (peer) peer.isStreaming = false;
      updateMembersList();
      handleStreamRemoved(targetId);
    });
  }

  // ========================================================
  // GERENCIAMENTO DE STREAMS E DESTAQUE (SPOTLIGHT)
  // ========================================================

  function handleStreamAdded(peerId, stream, user) {
    console.log(`🎥 Stream adicionada/atualizada do peer: ${peerId}`);
    activeStreams.set(peerId, { stream, user });
    renderStreamThumbnail(peerId, stream, user);

    // Se nenhuma transmissão estiver destacada no momento, destaca esta automaticamente
    if (!pinnedPeerId || !activeStreams.has(pinnedPeerId)) {
      pinStream(peerId);
    } else if (pinnedPeerId === peerId) {
      // Se era a stream atualmente destacada, atualiza o stream object
      pinStream(peerId);
    }
  }

  function handleStreamRemoved(peerId) {
    activeStreams.delete(peerId);

    const thumbEl = document.getElementById(`thumb-${peerId}`);
    if (thumbEl) thumbEl.remove();

    if (pinnedPeerId === peerId) {
      pinnedPeerId = null;
      const remainingPeerIds = Array.from(activeStreams.keys());
      if (remainingPeerIds.length > 0) {
        pinStream(remainingPeerIds[0]);
      } else {
        resetSpotlight();
      }
    }
  }

  function pinStream(peerId) {
    const streamData = activeStreams.get(peerId);
    if (!streamData) return;

    pinnedPeerId = peerId;
    const { stream, user } = streamData;

    spotlightVideo.srcObject = stream;
    spotlightVideo.playsInline = true;
    spotlightVideo.autoplay = true;

    const isSelf = (peerId === socket?.id);
    spotlightVideo.muted = isSelf;

    if (isSelf) {
      spotlightAudioIndicator.innerHTML = '<span class="audio-status-pill">🔇 Sua tela (áudio mutado localmente)</span>';
      iconVolumeHigh.style.display = 'none';
      iconVolumeMuted.style.display = 'block';
    } else {
      const hasAudio = stream.getAudioTracks().length > 0;
      spotlightAudioIndicator.innerHTML = hasAudio
        ? '<span class="audio-status-pill">🔊 Áudio ativo</span>'
        : '<span class="audio-status-pill" style="color: var(--text-dim);">Sem áudio</span>';

      const currentVol = parseFloat(spotlightVolumeSlider.value);
      if (currentVol === 0) {
        spotlightVideo.muted = true;
        iconVolumeHigh.style.display = 'none';
        iconVolumeMuted.style.display = 'block';
      } else {
        spotlightVideo.muted = false;
        spotlightVideo.volume = currentVol;
        iconVolumeHigh.style.display = 'block';
        iconVolumeMuted.style.display = 'none';
      }
    }

    spotlightStreamerName.textContent = '@' + (user?.username || 'usuário');

    spotlightEmpty.style.display = 'none';
    spotlightPlayerWrapper.style.display = 'flex';

    // Dispara a reprodução imediatamente
    const playPromise = spotlightVideo.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        console.warn('Reprodução da tela destacada aguardando:', err.message);
        spotlightVideo.onloadedmetadata = () => spotlightVideo.play().catch(() => {});
      });
    }

    // Atualiza borda de destaque na barra de miniaturas
    document.querySelectorAll('.stream-thumb-card').forEach((el) => {
      el.classList.remove('active-pin');
    });
    const currentThumb = document.getElementById(`thumb-${peerId}`);
    if (currentThumb) currentThumb.classList.add('active-pin');

    // Exibe brevemente os controles ao fixar uma stream
    showControls();
  }

  function resetSpotlight() {
    pinnedPeerId = null;
    spotlightVideo.srcObject = null;
    spotlightPlayerWrapper.style.display = 'none';
    spotlightEmpty.style.display = 'flex';
  }

  function renderStreamThumbnail(peerId, stream, user) {
    const existing = document.getElementById(`thumb-${peerId}`);
    if (existing) existing.remove();

    const card = document.createElement('div');
    card.id = `thumb-${peerId}`;
    card.className = 'stream-thumb-card' + (pinnedPeerId === peerId ? ' active-pin' : '');
    card.title = 'Clique para destacar esta tela';

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true; // Miniaturas sempre silenciosas
    video.srcObject = stream;

    const overlay = document.createElement('div');
    overlay.className = 'stream-thumb-overlay';

    const name = document.createElement('span');
    name.className = 'stream-thumb-name';
    name.textContent = '@' + (user?.username || 'usuário');

    const badge = document.createElement('span');
    badge.className = 'stream-thumb-badge';
    badge.textContent = 'AO VIVO';

    overlay.appendChild(name);
    overlay.appendChild(badge);
    card.appendChild(video);
    card.appendChild(overlay);

    card.addEventListener('click', () => {
      pinStream(peerId);
    });

    streamsThumbnailsContainer.appendChild(card);

    // Inicia reprodução da miniatura
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        video.onloadedmetadata = () => video.play().catch(() => {});
      });
    }
  }

  // ========================================================
  // CONTROLES DO PLAYER SPOTLIGHT
  // ========================================================

  // Slider de Volume
  spotlightVolumeSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    spotlightVideo.volume = val;

    if (val === 0) {
      spotlightVideo.muted = true;
      iconVolumeHigh.style.display = 'none';
      iconVolumeMuted.style.display = 'block';
    } else {
      if (pinnedPeerId !== socket?.id) {
        spotlightVideo.muted = false;
        iconVolumeHigh.style.display = 'block';
        iconVolumeMuted.style.display = 'none';
      }
    }
  });

  // Botão de Mutar/Desmutar
  btnSpotlightMute.addEventListener('click', () => {
    if (pinnedPeerId === socket?.id) {
      // Se for a própria tela, mantém mutado para evitar eco
      return;
    }

    if (spotlightVideo.muted) {
      spotlightVideo.muted = false;
      const targetVol = parseFloat(spotlightVolumeSlider.value) || 0.8;
      spotlightVideo.volume = targetVol;
      spotlightVolumeSlider.value = targetVol;
      iconVolumeHigh.style.display = 'block';
      iconVolumeMuted.style.display = 'none';
    } else {
      spotlightVideo.muted = true;
      iconVolumeHigh.style.display = 'none';
      iconVolumeMuted.style.display = 'block';
    }
  });

  // Botão de Tela Cheia
  btnSpotlightFullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      spotlightPlayerWrapper.requestFullscreen().catch(err => {
        console.error('Erro ao entrar em fullscreen:', err);
      });
    } else {
      document.exitFullscreen().catch(err => {
        console.error('Erro ao sair de fullscreen:', err);
      });
    }
  });

  // Atualização do ícone ao entrar/sair de fullscreen (inclusive via tecla ESC)
  document.addEventListener('fullscreenchange', () => {
    const isFullscreen = !!document.fullscreenElement;
    if (isFullscreen) {
      iconFullscreenEnter.style.display = 'none';
      iconFullscreenExit.style.display = 'block';
      btnSpotlightFullscreen.title = 'Sair da Tela Cheia';
    } else {
      iconFullscreenEnter.style.display = 'block';
      iconFullscreenExit.style.display = 'none';
      btnSpotlightFullscreen.title = 'Tela Cheia';
    }
  });

  // Picture-in-Picture
  if (!document.pictureInPictureEnabled) {
    btnSpotlightPip.style.display = 'none';
  } else {
    btnSpotlightPip.addEventListener('click', async () => {
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else if (spotlightVideo.srcObject) {
          await spotlightVideo.requestPictureInPicture();
        }
      } catch (err) {
        console.warn('Erro ao alternar Picture-in-Picture:', err);
      }
    });
  }

  // ========================================================
  // CONTROLE AUTOMÁTICO DE VISIBILIDADE (AUTO-HIDE HOVER/IDLE)
  // ========================================================
  let hideControlsTimer = null;
  const INACTIVITY_DELAY = 2500; // 2,5 segundos

  function showControls() {
    spotlightPlayerWrapper.classList.add('user-active');
    spotlightPlayerWrapper.classList.remove('hide-cursor');

    clearTimeout(hideControlsTimer);
    hideControlsTimer = setTimeout(() => {
      // Se o usuário estiver interagindo (mouse em cima dos controles ou arrastando o slider), mantém visível
      if (
        document.activeElement === spotlightVolumeSlider ||
        spotlightControls.matches(':hover') ||
        spotlightControls.classList.contains('interacting')
      ) {
        return;
      }
      spotlightPlayerWrapper.classList.remove('user-active');
      if (document.fullscreenElement) {
        spotlightPlayerWrapper.classList.add('hide-cursor');
      }
    }, INACTIVITY_DELAY);
  }

  function hideControlsImmediately() {
    clearTimeout(hideControlsTimer);
    if (!spotlightControls.matches(':hover') && !spotlightControls.classList.contains('interacting')) {
      spotlightPlayerWrapper.classList.remove('user-active');
      spotlightPlayerWrapper.classList.remove('hide-cursor');
    }
  }

  spotlightPlayerWrapper.addEventListener('mousemove', showControls);
  spotlightPlayerWrapper.addEventListener('mouseenter', showControls);
  spotlightPlayerWrapper.addEventListener('mouseleave', hideControlsImmediately);
  spotlightPlayerWrapper.addEventListener('click', showControls);

  // Evita esconder enquanto o usuário estiver arrastando a barra de volume
  spotlightVolumeSlider.addEventListener('mousedown', () => {
    spotlightControls.classList.add('interacting');
  });
  window.addEventListener('mouseup', () => {
    spotlightControls.classList.remove('interacting');
    showControls();
  });

  // ========================================================
  // CONTROLE DE COMPARTILHAMENTO DE TELA
  // ========================================================

  btnToggleShare.addEventListener('click', async () => {
    if (!webrtc) return;

    if (webrtc.isSharingScreen) {
      webrtc.stopScreenShare();
    } else {
      await webrtc.startScreenShare(activePeers);
    }
  });

  function handleStreamingStateChanged(isSharing) {
    if (isSharing) {
      btnToggleShare.classList.add('streaming-active');
      iconStartShare.style.display = 'none';
      iconStopShare.style.display = 'block';
      btnToggleShareText.textContent = 'Parar Compartilhamento';
    } else {
      btnToggleShare.classList.remove('streaming-active');
      iconStartShare.style.display = 'block';
      iconStopShare.style.display = 'none';
      btnToggleShareText.textContent = 'Compartilhar Tela';
    }
  }

  // ========================================================
  // LISTA DE MEMBROS ONLINE
  // ========================================================

  function updateMembersList() {
    connectedCountBadge.textContent = activePeers.length;
    membersOnlineList.innerHTML = '';

    activePeers.forEach((peer) => {
      const li = document.createElement('li');
      li.className = 'member-item';

      const left = document.createElement('div');
      left.className = 'member-left';

      const dot = document.createElement('span');
      dot.className = 'member-dot';

      const label = document.createElement('span');
      label.className = 'member-label';
      label.textContent = '@' + peer.user.username + (peer.socketId === socket?.id ? ' (Você)' : '');

      left.appendChild(dot);
      left.appendChild(label);
      li.appendChild(left);

      if (peer.isStreaming) {
        const liveBadge = document.createElement('span');
        liveBadge.className = 'member-streaming-badge';
        liveBadge.textContent = 'AO VIVO';
        li.appendChild(liveBadge);
      }

      membersOnlineList.appendChild(li);
    });
  }

  // ========================================================
  // MODAL DE ALTERAÇÃO DE SENHA PESSOAL
  // ========================================================

  btnOpenPasswordModal.addEventListener('click', () => {
    formChangePassword.reset();
    changePasswordStatus.textContent = '';
    passwordModal.style.display = 'flex';
  });

  btnClosePasswordModal.addEventListener('click', () => {
    passwordModal.style.display = 'none';
  });

  passwordModal.addEventListener('click', (e) => {
    if (e.target === passwordModal) {
      passwordModal.style.display = 'none';
    }
  });

  formChangePassword.addEventListener('submit', async (e) => {
    e.preventDefault();
    changePasswordStatus.className = 'status-msg';
    changePasswordStatus.textContent = 'Alterando senha...';

    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;

    try {
      await API.changePassword(currentPassword, newPassword);
      changePasswordStatus.className = 'status-msg success';
      changePasswordStatus.textContent = '✅ Senha alterada com sucesso!';
      setTimeout(() => {
        passwordModal.style.display = 'none';
      }, 1500);
    } catch (err) {
      changePasswordStatus.className = 'status-msg error';
      changePasswordStatus.textContent = '❌ ' + err.message;
    }
  });

  // ========================================================
  // MODAL DE ADMINISTRAÇÃO DE USUÁRIOS
  // ========================================================

  btnAdminModal.addEventListener('click', () => {
    loadAdminUsersList();
    adminModal.style.display = 'flex';
  });

  btnCloseAdminModal.addEventListener('click', () => {
    adminModal.style.display = 'none';
  });

  adminModal.addEventListener('click', (e) => {
    if (e.target === adminModal) {
      adminModal.style.display = 'none';
    }
  });

  async function loadAdminUsersList() {
    try {
      const users = await API.listUsers();
      adminUsersListTbody.innerHTML = '';

      users.forEach((u) => {
        const tr = document.createElement('tr');

        // Usuário
        const tdName = document.createElement('td');
        tdName.innerHTML = `<strong>@${escapeHtml(u.username)}</strong>`;

        // Permissão
        const tdRole = document.createElement('td');
        tdRole.innerHTML = u.is_admin ? '<span style="color:var(--primary); font-weight:700;">Admin</span>' : 'Membro';

        // Data
        const tdDate = document.createElement('td');
        tdDate.textContent = new Date(u.created_at).toLocaleDateString('pt-BR');

        // Ações
        const tdAction = document.createElement('td');
        const actionsWrapper = document.createElement('div');
        actionsWrapper.style.display = 'flex';
        actionsWrapper.style.gap = '6px';

        // Botão para Redefinir Senha
        const btnResetPass = document.createElement('button');
        btnResetPass.className = 'btn btn-secondary btn-sm';
        btnResetPass.textContent = 'Nova Senha';
        btnResetPass.title = 'Definir uma nova senha para este usuário';
        btnResetPass.addEventListener('click', async () => {
          const newPass = prompt(`Digite a nova senha para o usuário "@${u.username}":`);
          if (newPass && newPass.trim().length >= 4) {
            try {
              await API.resetUserPassword(u.id, newPass.trim());
              alert(`✅ Senha de @${u.username} alterada com sucesso!`);
            } catch (err) {
              alert(err.message);
            }
          } else if (newPass !== null) {
            alert('A senha deve ter pelo menos 4 caracteres.');
          }
        });
        actionsWrapper.appendChild(btnResetPass);

        // Botão de Excluir (somente para outras contas)
        if (u.id !== currentUser.id) {
          const btnDel = document.createElement('button');
          btnDel.className = 'btn btn-danger btn-sm';
          btnDel.textContent = 'Excluir';
          btnDel.addEventListener('click', async () => {
            if (confirm(`Excluir permanentemente o usuário "@${u.username}"?`)) {
              try {
                await API.deleteUser(u.id);
                loadAdminUsersList();
              } catch (err) {
                alert(err.message);
              }
            }
          });
          actionsWrapper.appendChild(btnDel);
        }

        tdAction.appendChild(actionsWrapper);
        tr.appendChild(tdName);
        tr.appendChild(tdRole);
        tr.appendChild(tdDate);
        tr.appendChild(tdAction);
        adminUsersListTbody.appendChild(tr);
      });
    } catch (err) {
      console.error('Erro ao listar usuários:', err);
    }
  }

  formCreateUser.addEventListener('submit', async (e) => {
    e.preventDefault();
    createUserStatus.className = 'status-msg';
    createUserStatus.textContent = 'Cadastrando...';

    const username = document.getElementById('new-user-username').value.trim();
    const password = document.getElementById('new-user-password').value;
    const is_admin = document.getElementById('new-user-isadmin').checked;

    try {
      await API.createUser({ username, password, is_admin });
      createUserStatus.className = 'status-msg success';
      createUserStatus.textContent = '✅ Usuário criado com sucesso!';
      formCreateUser.reset();
      loadAdminUsersList();
      setTimeout(() => { createUserStatus.textContent = ''; }, 3000);
    } catch (err) {
      createUserStatus.className = 'status-msg error';
      createUserStatus.textContent = '❌ ' + err.message;
    }
  });

  // ========================================================
  // MODAL DE ISOLAMENTO DE ÁUDIO
  // ========================================================
  const IGNORED_AUDIO_KEY = 'stream_literal_ignored_audio_exes';

  function getIgnoredExes() {
    try {
      const stored = localStorage.getItem(IGNORED_AUDIO_KEY);
      if (stored) return JSON.parse(stored);
    } catch { }
    // Padrão inteligente: Discord silenciado por padrão
    return ['discord.exe'];
  }

  function saveIgnoredExes(list) {
    const unique = Array.from(new Set(list.map(s => s.toLowerCase().trim()))).filter(Boolean);
    localStorage.setItem(IGNORED_AUDIO_KEY, JSON.stringify(unique));
  }

  async function loadAudioApps() {
    if (!audioAppsList) return;
    audioAppsList.innerHTML = '<div class="loading-apps" style="padding:16px;text-align:center;color:var(--text-muted);font-size:0.85rem;">Escaneando processos ativos do Windows...</div>';

    const isTauri = typeof window.__TAURI__ !== 'undefined';
    const ignored = getIgnoredExes();

    if (!isTauri) {
      // Executando no navegador comum
      let html = `
        <div class="web-fallback-note">
          <strong>🌐 Acesso via Navegador Web</strong><br>
          A detecção em tempo real e isolamento nativo de canais de som do Windows é ativada usando o <strong>App Desktop da Stream Literal</strong>.
          No navegador web, a transmissão de áudio usa o mixer padrão do sistema.
        </div>
      `;
      html += '<div style="font-size:0.8rem;font-weight:600;margin-bottom:6px;color:var(--text-muted);">PROGRAMAS NA LISTA NEGRA SALVA:</div>';
      ignored.forEach(exe => {
        html += `
          <div class="audio-app-item selected">
            <input type="checkbox" checked data-exe="${escapeHtml(exe)}" id="chk-web-${escapeHtml(exe)}">
            <div class="app-icon-badge ${exe.includes('discord') ? 'icon-discord' : 'icon-game'}">
              ${exe.includes('discord') ? '💬' : '🎵'}
            </div>
            <div class="app-info-col">
              <span class="app-info-name">${escapeHtml(exe)}</span>
              <span class="app-info-exe">Regra salva permanentemente</span>
            </div>
            <span class="app-ignored-tag">Silenciado</span>
          </div>
        `;
      });
      audioAppsList.innerHTML = html;
      return;
    }

    try {
      const apps = await window.__TAURI__.core.invoke('get_audio_apps');
      renderAudioAppsList(apps, ignored);
    } catch (err) {
      audioAppsList.innerHTML = `<div style="padding:12px;color:var(--danger);font-size:0.85rem;">Erro ao listar aplicativos: ${err.message}</div>`;
    }
  }

  function renderAudioAppsList(apps, ignored) {
    audioAppsList.innerHTML = '';

    const allExesMap = new Map();
    apps.forEach(a => allExesMap.set(a.exe_name.toLowerCase(), a));

    ignored.forEach(exe => {
      const lower = exe.toLowerCase();
      if (!allExesMap.has(lower)) {
        allExesMap.set(lower, {
          name: lower.includes('discord') ? 'Discord' : lower.includes('spotify') ? 'Spotify' : exe,
          exe_name: exe,
          icon_hint: lower.includes('discord') ? 'discord' : lower.includes('spotify') ? 'spotify' : 'app',
          pid: 0
        });
      }
    });

    const mergedList = Array.from(allExesMap.values());
    mergedList.sort((a, b) => {
      const aIgnored = ignored.includes(a.exe_name.toLowerCase()) ? 0 : 1;
      const bIgnored = ignored.includes(b.exe_name.toLowerCase()) ? 0 : 1;
      return aIgnored - bIgnored || a.name.localeCompare(b.name);
    });

    mergedList.forEach(app => {
      const isChecked = ignored.includes(app.exe_name.toLowerCase());
      const item = document.createElement('div');
      item.className = `audio-app-item ${isChecked ? 'selected' : ''}`;

      let iconEmoji = '🎮';
      if (app.icon_hint === 'discord') iconEmoji = '💬';
      else if (app.icon_hint === 'spotify') iconEmoji = '🎵';
      else if (app.icon_hint === 'browser') iconEmoji = '🌐';
      else if (app.icon_hint === 'steam') iconEmoji = '🕹️';

      item.innerHTML = `
        <input type="checkbox" ${isChecked ? 'checked' : ''} data-exe="${escapeHtml(app.exe_name)}">
        <div class="app-icon-badge icon-${app.icon_hint}">
          ${iconEmoji}
        </div>
        <div class="app-info-col">
          <span class="app-info-name">${escapeHtml(app.name)}</span>
          <span class="app-info-exe">${escapeHtml(app.exe_name)} ${app.pid ? `(PID: ${app.pid})` : '(Fechado)'}</span>
        </div>
        ${isChecked ? '<span class="app-ignored-tag">Silenciado</span>' : ''}
      `;

      const chk = item.querySelector('input[type="checkbox"]');
      item.addEventListener('click', (e) => {
        if (e.target !== chk) {
          chk.checked = !chk.checked;
        }
        item.classList.toggle('selected', chk.checked);
        let tag = item.querySelector('.app-ignored-tag');
        if (chk.checked && !tag) {
          const span = document.createElement('span');
          span.className = 'app-ignored-tag';
          span.textContent = 'Silenciado';
          item.appendChild(span);
        } else if (!chk.checked && tag) {
          tag.remove();
        }
      });

      audioAppsList.appendChild(item);
    });
  }

  if (btnAudioSettings) {
    btnAudioSettings.addEventListener('click', () => {
      audioSettingsModal.style.display = 'flex';
      loadAudioApps();
    });
  }

  if (btnCloseAudioModal) {
    btnCloseAudioModal.addEventListener('click', () => {
      audioSettingsModal.style.display = 'none';
    });
  }

  if (audioSettingsModal) {
    audioSettingsModal.addEventListener('click', (e) => {
      if (e.target === audioSettingsModal) {
        audioSettingsModal.style.display = 'none';
      }
    });
  }

  if (btnRefreshAudioApps) {
    btnRefreshAudioApps.addEventListener('click', () => {
      loadAudioApps();
    });
  }

  if (btnAddCustomExe && customExeInput) {
    btnAddCustomExe.addEventListener('click', () => {
      let val = customExeInput.value.trim().toLowerCase();
      if (!val) return;
      if (!val.endsWith('.exe')) val += '.exe';
      const current = getIgnoredExes();
      if (!current.includes(val)) {
        current.push(val);
        saveIgnoredExes(current);
      }
      customExeInput.value = '';
      loadAudioApps();
    });
  }

  if (btnSaveAudioSettings) {
    btnSaveAudioSettings.addEventListener('click', () => {
      const checkboxes = audioAppsList.querySelectorAll('input[type="checkbox"]');
      const selected = [];
      checkboxes.forEach(c => {
        if (c.checked && c.dataset.exe) {
          selected.push(c.dataset.exe.toLowerCase());
        }
      });
      saveIgnoredExes(selected);
      audioSettingsStatus.className = 'status-msg success';
      audioSettingsStatus.textContent = '✅ Configurações salvas permanentemente!';
      showNotice('Filtro de áudio atualizado! Sons selecionados serão ignorados.', 'info');
      setTimeout(() => {
        audioSettingsStatus.textContent = '';
        audioSettingsModal.style.display = 'none';
      }, 1200);
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

  // Início
  init();
});
