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

  // Elementos do Top Nav
  const roomStatusText = document.getElementById('room-status-text');
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

  // ========================================================
  // CONEXÃO SOCKET.IO E WEBRTC
  // ========================================================
  function connectSocket() {
    const token = API.getToken();
    socket = io({
      auth: { token },
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
      roomStatusText.textContent = 'Sala Única Conectada';
      console.log('✅ Conectado à sala única.');
    });

    socket.on('connect_error', (err) => {
      console.error('Erro no socket:', err.message);
      roomStatusText.textContent = 'Erro de conexão';
    });

    socket.on('disconnect', () => {
      roomStatusText.textContent = 'Desconectado';
    });

    // Inicializa WebRTC com arquitetura de conexões direcionais dedicadas
    webrtc = new WebRTCManager(
      socket,
      currentUser,
      handleStreamAdded,
      handleStreamRemoved,
      handleStreamingStateChanged
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

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

  // Início
  init();
});
