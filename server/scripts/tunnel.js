require('dotenv').config();
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { updateDiscoveryUrl } = require('./discovery');

const PORT = process.env.PORT || 3000;
const BIN_DIR = path.join(__dirname, '..', '..', 'bin');
const CLOUDFLARED_EXE = path.join(BIN_DIR, 'cloudflared.exe');
const DOWNLOAD_URL = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';

function isCommandAvailable(cmd) {
  try {
    const isWindows = process.platform === 'win32';
    const checkCmd = isWindows ? `where.exe ${cmd}` : `which ${cmd}`;
    execSync(checkCmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(BIN_DIR)) {
      fs.mkdirSync(BIN_DIR, { recursive: true });
    }

    const file = fs.createWriteStream(destPath);
    console.log(`📥 Baixando o Cloudflare Tunnel oficial do GitHub...`);
    console.log(`   (Isso acontece apenas uma vez, aguarde alguns segundos)`);

    const request = (targetUrl) => {
      const urlObj = new URL(targetUrl);
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        rejectUnauthorized: false // Permite download mesmo com antivírus/inspeção de SSL local
      };

      https.get(options, (response) => {
        // Trata redirects HTTP (301, 302, etc.)
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          return request(response.headers.location);
        }

        if (response.statusCode !== 200) {
          return reject(new Error(`Falha no download: Código HTTP ${response.statusCode}`));
        }

        let downloadedBytes = 0;
        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          process.stdout.write(`\r   Baixado: ${(downloadedBytes / (1024 * 1024)).toFixed(1)} MB...`);
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close(() => {
            console.log('\n✅ Download concluído com sucesso!');
            resolve();
          });
        });
      }).on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    };

    request(url);
  });
}

async function startTunnel(portOverride) {
  const targetPort = portOverride || PORT;
  let executable = 'cloudflared';

  // 1. Verifica se já está instalado no PATH do Windows
  if (!isCommandAvailable('cloudflared')) {
    // 2. Verifica se já temos o bin/cloudflared.exe baixado
    if (!fs.existsSync(CLOUDFLARED_EXE)) {
      try {
        await downloadFile(DOWNLOAD_URL, CLOUDFLARED_EXE);
      } catch (err) {
        console.error('❌ Erro ao baixar cloudflared:', err.message);
        console.log('\n💡 Alternativa: você pode instalar via PowerShell executando:');
        console.log('   winget install --id Cloudflare.cloudflared -e');
        process.exit(1);
      }
    }
    executable = CLOUDFLARED_EXE;
  }

  console.log('\n======================================================');
  console.log(`🌐 [STREAM LITERAL] Conectando túnel seguro para a porta ${targetPort}...`);
  console.log('======================================================\n');

  const tunnelProcess = spawn(executable, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${targetPort}`], {
    stdio: ['inherit', 'pipe', 'pipe']
  });

  let lastDiscoveredUrl = null;

  const extractUrl = async (text) => {
    const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (match && match[0] !== lastDiscoveredUrl) {
      lastDiscoveredUrl = match[0];
      const url = match[0];

      console.log('\n------------------------------------------------------');
      console.log('🚀 SEU LINK PÚBLICO E SEGURO (HTTPS) ESTÁ PRONTO:');
      console.log(`🔗  \x1b[32m\x1b[1m${url}\x1b[0m`);
      console.log('------------------------------------------------------');

      // Publicação automática de Service Discovery no GitHub Gist
      const discRes = await updateDiscoveryUrl(url);
      if (discRes.success) {
        console.log('📡 [Service Discovery] Publicado com sucesso no GitHub Gist!');
        console.log(`   ID do Gist: \x1b[36m${discRes.gistId}\x1b[0m`);
        console.log('   O app desktop e a página de entrada agora conectam automaticamente!');
      } else if (discRes.reason === 'TOKEN_MISSING') {
        console.log('\n💡 [Conexão Automática Opcional]');
        console.log('   Para que seus amigos e o app desktop conectem sozinhos sem copiar links:');
        console.log('   Adicione um token do GitHub no seu arquivo .env:');
        console.log('   DISCOVERY_GITHUB_TOKEN=seu_token_aqui\n');
      } else {
        console.warn(`⚠️ [Service Discovery] Falha ao publicar no Gist: ${discRes.reason}`);
      }
      console.log('------------------------------------------------------\n');
    }
  };

  tunnelProcess.stdout.on('data', (data) => {
    const str = data.toString();
    process.stdout.write(str);
    extractUrl(str);
  });

  tunnelProcess.stderr.on('data', (data) => {
    const str = data.toString();
    // O cloudflared envia os logs informativos no stderr
    process.stderr.write(str);
    extractUrl(str);
  });

  tunnelProcess.on('close', (code) => {
    console.log(`\n🛑 Túnel encerrado (código ${code}).`);
  });

  return tunnelProcess;
}

if (require.main === module) {
  startTunnel();
}

module.exports = { startTunnel };
