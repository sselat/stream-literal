/**
 * Stream Literal - Gerenciador de API e Autenticação
 */

const API = {
  TOKEN_KEY: 'stream_literal_auth_token',
  SERVER_URL_KEY: 'stream_literal_server_url',

  getServerUrl() {
    const saved = localStorage.getItem(this.SERVER_URL_KEY);
    if (saved && saved.trim()) return saved.trim().replace(/\/+$/, '');
    
    // Se estiver rodando dentro do Tauri ou file protocol, usa o padrão localhost
    if (window.location.protocol === 'tauri:' || window.location.protocol === 'file:' || window.location.hostname === 'tauri.localhost') {
      return 'http://127.0.0.1:3000';
    }
    
    // No navegador comum, usa a própria origem (ex: link do túnel ou localhost)
    return window.location.origin;
  },

  setServerUrl(url) {
    if (!url || !url.trim()) {
      localStorage.removeItem(this.SERVER_URL_KEY);
    } else {
      localStorage.setItem(this.SERVER_URL_KEY, url.trim().replace(/\/+$/, ''));
    }
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
    try {
      const res = await fetch(`${this.getServerUrl()}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao efetuar login.');
      }
      this.setToken(data.token);
      return data;
    } catch (err) {
      if (err.name === 'TypeError' || err.message.includes('fetch') || err.message.includes('NetworkError') || err.message.includes('Failed to fetch')) {
        throw new Error('🛰️ Houston, nós temos um problema! A base estelar da Stream Literal está offline no momento (ou o Tales tropeçou no cabo de força 🔌🪐). Verifique se o servidor está ativo!');
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
