/**
 * Stream Literal - Gerenciador de API e Autenticação
 */

const API = {
  TOKEN_KEY: 'stream_literal_auth_token',
  SERVER_URL_KEY: 'stream_literal_server_url',

  isDesktopApp() {
    return typeof window.__TAURI__ !== 'undefined'
      || typeof window.__TAURI_INTERNALS__ !== 'undefined'
      || window.location.protocol === 'tauri:'
      || window.location.protocol === 'file:'
      || window.location.hostname === 'tauri.localhost'
      || (window.location.hostname === 'localhost' && window.location.port !== '3000');
  },

  getServerUrl() {
    const saved = localStorage.getItem(this.SERVER_URL_KEY);
    if (saved && saved.trim()) return saved.trim().replace(/\/+$/, '');
    
    // Se estiver no App Desktop, a base do servidor local padrão é a porta 3000
    if (this.isDesktopApp()) {
      return 'http://127.0.0.1:3000';
    }
    
    // No navegador comum (acesso direto ou via Cloudflare Tunnel)
    return window.location.origin;
  },

  setServerUrl(url) {
    if (!url || !url.trim()) {
      localStorage.removeItem(this.SERVER_URL_KEY);
    } else {
      localStorage.setItem(this.SERVER_URL_KEY, url.trim().replace(/\/+$/, ''));
    }
  },

  async discoverServerUrl() {
    // 1. Se estiver no App Desktop, testa primeiro se o servidor local 127.0.0.1:3000 está ativo
    if (this.isDesktopApp()) {
      try {
        const ping = await fetch('http://127.0.0.1:3000/api/health', {
          method: 'GET',
          signal: AbortSignal.timeout(1200)
        });
        if (ping.ok) {
          console.log('⚡ Conectado ao servidor local (127.0.0.1:3000)');
          this.setServerUrl('http://127.0.0.1:3000');
          return 'http://127.0.0.1:3000';
        }
      } catch {
        console.log('ℹ️ Servidor local 127.0.0.1:3000 offline, consultando Service Discovery...');
      }
    }

    // 2. Consulta o GitHub Gist de descoberta de serviço
    const gistId = window.STREAM_LITERAL_CONFIG?.discoveryGistId || localStorage.getItem('stream_literal_gist_id');
    if (gistId && gistId.length > 5 && !gistId.startsWith('SEU_')) {
      try {
        const res = await fetch(`https://api.github.com/gists/${gistId}?t=${Date.now()}`, {
          headers: { 'Accept': 'application/vnd.github.v3+json' },
          signal: AbortSignal.timeout(4000)
        });
        if (res.ok) {
          const data = await res.json();
          const file = data.files && (data.files['stream_literal_discovery.json'] || Object.values(data.files)[0]);
          if (file && file.content) {
            const parsed = JSON.parse(file.content);
            if (parsed.url && parsed.url.startsWith('https://')) {
              console.log('🚀 [Service Discovery] URL ativa obtida via Gist:', parsed.url);
              this.setServerUrl(parsed.url);
              return parsed.url;
            }
          }
        }
      } catch (err) {
        console.warn('⚠️ Falha ao consultar Service Discovery do GitHub:', err.message);
      }
    }

    return this.getServerUrl();
  },

  getToken() {
    return localStorage.getItem(this.TOKEN_KEY);
  },

  setToken(token) {
    localStorage.setItem(this.TOKEN_KEY, token);
  },

  removeToken() {
    localStorage.removeItem(this.TOKEN_KEY);
  },

  getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  },

  async login(username, password) {
    const makeRequest = async () => {
      const res = await fetch(`${this.getServerUrl()}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('NON_JSON_RESPONSE');
      }
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao efetuar login.');
      }
      this.setToken(data.token);
      return data;
    };

    try {
      return await makeRequest();
    } catch (err) {
      // Se for erro de conexão/resposta inesperada, tenta redescobrir a URL online uma vez
      if (err.message === 'NON_JSON_RESPONSE' || err.name === 'TypeError' || err.message.includes('fetch') || err.message.includes('NetworkError')) {
        try {
          const newUrl = await this.discoverServerUrl();
          if (newUrl) {
            return await makeRequest();
          }
        } catch { }
        throw new Error('🛰️ Houston, we have a problem\nA base estelar do Espaço Literal está fora de órbita. Tentando restabelecer contato...');
      }
      throw err;
    }
  },

  async getMe() {
    const token = this.getToken();
    if (!token) return null;

    try {
      const res = await fetch(`${this.getServerUrl()}/api/auth/me`, {
        headers: this.getHeaders()
      });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        return null;
      }
      if (!res.ok) {
        this.removeToken();
        return null;
      }
      const data = await res.json();
      return data.user;
    } catch {
      return null;
    }
  },

  async changePassword(currentPassword, newPassword) {
    const res = await fetch(`${this.getServerUrl()}/api/auth/change-password`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao alterar senha.');
    return data;
  },

  async resetUserPassword(userId, newPassword) {
    const res = await fetch(`${this.getServerUrl()}/api/admin/users/${userId}/reset-password`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ newPassword })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao redefinir senha do usuário.');
    return data;
  },

  async listUsers() {
    const res = await fetch(`${this.getServerUrl()}/api/admin/users`, {
      headers: this.getHeaders()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao carregar usuários.');
    return data.users;
  },

  async createUser(payload) {
    const res = await fetch(`${this.getServerUrl()}/api/admin/users`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao cadastrar usuário.');
    return data.user;
  },

  async deleteUser(userId) {
    const res = await fetch(`${this.getServerUrl()}/api/admin/users/${userId}`, {
      method: 'DELETE',
      headers: this.getHeaders()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao excluir usuário.');
    return data;
  }
};
