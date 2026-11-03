/**
 * Stream Literal - Inicializador Unificado da Base Estelar
 * Inicia o servidor HTTP/WebSocket local, conecta o Cloudflare Tunnel
 * e atualiza o Service Discovery no GitHub Gist com um único comando.
 */

require('dotenv').config();
const { execSync } = require('child_process');
const { startTunnel } = require('./scripts/tunnel');

const PORT = process.env.PORT || 3000;

console.clear?.();
console.log('======================================================');
console.log('🛸 [STREAM LITERAL] INICIANDO BASE ESTELAR COMPLETA');
console.log('======================================================');
console.log('1. Subindo servidor local e sinalização WebRTC...');

// 1. Inicia o servidor Express + Socket.io
require('./index');

let tunnelInstance = null;

// 2. Aguarda a porta estar ouvindo e inicia o túnel seguro
setTimeout(async () => {
  try {
    console.log('2. Estabelecendo túnel seguro Cloudflare...');
    tunnelInstance = await startTunnel(PORT);
  } catch (err) {
    console.error('❌ Erro ao inicializar o túnel:', err.message);
  }
}, 800);

// 3. Encerramento gracioso unificado (Ctrl+C ou fechamento do terminal)
function cleanup() {
  console.log('\n🛑 [STREAM LITERAL] Encerrando base estelar...');
  if (tunnelInstance && tunnelInstance.pid) {
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /pid ${tunnelInstance.pid} /t /f`, { stdio: 'ignore' });
      } else {
        tunnelInstance.kill('SIGTERM');
      }
    } catch {}
  }
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
