const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const tauriConfPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json');
const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));

const version = tauriConf.version;
const productName = tauriConf.productName;
const releaseTag = `v${version}`;

const nsisDir = path.join(rootDir, 'src-tauri', 'target', 'release', 'bundle', 'nsis');
if (!fs.existsSync(nsisDir)) {
  console.error('❌ Diretório de bundles NSIS não encontrado em:', nsisDir);
  console.error('Execute primeiro o build do Tauri.');
  process.exit(1);
}

// Procura o arquivo .sig e o .exe gerados correspondentes à versão atual
const files = fs.readdirSync(nsisDir);
const sigFile = files.find(f => f.includes(version) && f.endsWith('.exe.sig'));
const exeFile = files.find(f => f.includes(version) && f.endsWith('.exe') && !f.endsWith('.sig'));

if (!sigFile || !exeFile) {
  console.error(`❌ Arquivos do instalador ou assinatura (.sig) para a versão ${version} não foram encontrados em:`, nsisDir);
  process.exit(1);
}

const signature = fs.readFileSync(path.join(nsisDir, sigFile), 'utf8').trim();
const encodedExeName = encodeURIComponent(exeFile);
const downloadUrl = `https://github.com/sselat/stream-literal/releases/download/${releaseTag}/${encodedExeName}`;

const manifest = {
  version: version,
  notes: `Atualização automática do ${productName} para a versão ${version}.`,
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': {
      signature: signature,
      url: downloadUrl
    }
  }
};

const outputPath = path.join(rootDir, 'src-tauri', 'target', 'release', 'bundle', 'latest.json');
fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2), 'utf8');

console.log('✅ Manifesto latest.json gerado com sucesso!');
console.log('📁 Local:', outputPath);
console.log('📦 Versão:', version);
console.log('📄 Executável:', exeFile);
console.log('🔗 URL de Download:', downloadUrl);
