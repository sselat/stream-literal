const fs = require('fs');
const path = require('path');

const ENV_PATH = path.join(__dirname, '..', '..', '.env');
const CONFIG_JS_PATH = path.join(__dirname, '..', '..', 'client', 'js', 'config.js');
const DOCS_CONFIG_JS_PATH = path.join(__dirname, '..', '..', 'docs', 'js', 'config.js');

/**
 * Atualiza ou insere uma variável no arquivo .env local
 */
function updateEnvFile(key, value) {
  try {
    let content = '';
    if (fs.existsSync(ENV_PATH)) {
      content = fs.readFileSync(ENV_PATH, 'utf8');
    }
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content = content.trim() + (content.trim().length > 0 ? '\n' : '') + `${key}=${value}\n`;
    }
    fs.writeFileSync(ENV_PATH, content, 'utf8');
  } catch (err) {
    console.warn('⚠️ Não foi possível salvar no .env:', err.message);
  }
}

/**
 * Atualiza o arquivo client/js/config.js com o ID do Gist
 */
function updateConfigJs(gistId) {
  try {
    const code = `/**
 * Stream Literal - Configurações Dinâmicas da Aplicação
 * Gerado e atualizado automaticamente pelo sistema de Service Discovery
 */
window.STREAM_LITERAL_CONFIG = {
  discoveryGistId: '${gistId}'
};
`;
    fs.writeFileSync(CONFIG_JS_PATH, code, 'utf8');

    // Sincroniza também o portal estático do GitHub Pages em docs/
    const docsDir = path.dirname(DOCS_CONFIG_JS_PATH);
    if (fs.existsSync(docsDir)) {
      fs.writeFileSync(DOCS_CONFIG_JS_PATH, code, 'utf8');
    }
  } catch (err) {
    console.warn('⚠️ Não foi possível atualizar os arquivos de config.js:', err.message);
  }
}

/**
 * Publica a nova URL do túnel no GitHub Gist
 * @param {string} tunnelUrl - URL gerada pelo Cloudflare Tunnel (ex: https://...trycloudflare.com)
 */
async function updateDiscoveryUrl(tunnelUrl) {
  const token = process.env.DISCOVERY_GITHUB_TOKEN;
  let gistId = process.env.DISCOVERY_GIST_ID;

  if (!token) {
    return {
      success: false,
      reason: 'TOKEN_MISSING'
    };
  }

  const payload = {
    description: 'Stream Literal - Dynamic Service Discovery Endpoint',
    files: {
      'stream_literal_discovery.json': {
        content: JSON.stringify(
          {
            url: tunnelUrl,
            updated_at: new Date().toISOString()
          },
          null,
          2
        )
      }
    }
  };

  try {
    if (gistId && gistId.length > 5 && !gistId.startsWith('SEU_')) {
      // Atualiza o Gist existente
      const res = await fetch(`https://api.github.com/gists/${gistId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'Stream-Literal'
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorText = await res.text();
        return { success: false, reason: `HTTP ${res.status}: ${errorText}` };
      }

      updateConfigJs(gistId);
      return { success: true, gistId, created: false };
    } else {
      // Cria um novo Gist Secreto no GitHub
      const res = await fetch('https://api.github.com/gists', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'Stream-Literal'
        },
        body: JSON.stringify({
          ...payload,
          public: false
        })
      });

      if (!res.ok) {
        const errorText = await res.text();
        return { success: false, reason: `HTTP ${res.status}: ${errorText}` };
      }

      const data = await res.json();
      gistId = data.id;

      // Persiste no .env e no config.js
      process.env.DISCOVERY_GIST_ID = gistId;
      updateEnvFile('DISCOVERY_GIST_ID', gistId);
      updateConfigJs(gistId);

      return { success: true, gistId, created: true };
    }
  } catch (err) {
    return { success: false, reason: err.message };
  }
}

module.exports = {
  updateDiscoveryUrl,
  updateConfigJs
};
