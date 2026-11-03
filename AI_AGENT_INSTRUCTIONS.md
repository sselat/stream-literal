# 🤖 Guia de Configuração e Instalação para Agente de IA

> **Aviso para o Agente de IA:** Este documento contém instruções técnicas diretas, passo a passo e comandos executáveis para instalar, configurar e iniciar a base do **Stream Literal** nesta máquina.

---

## 📌 Contexto da Aplicação
O **Stream Literal** é uma plataforma fechada de compartilhamento de tela e áudio WebRTC para pequenos grupos.
- **Backend:** Node.js (Express 5, Socket.io, SQLite com `better-sqlite3`, JWT).
- **Conectividade Externa:** Cloudflare Tunnel (`cloudflared`) integrado automaticamente.
- **Service Discovery:** Ao ligar o túnel, o servidor publica a nova URL no GitHub Gist Secreto (`DISCOVERY_GITHUB_TOKEN`). O portal no Netlify (`https://stream-literal.netlify.app`) consulta o Gist e redireciona os espectadores automaticamente.

---

## 💻 1. Pré-requisitos do Sistema

O host precisa ter instalado:
1. **Node.js** (versão 18, 20 ou 22 LTS recomendada):
   ```bash
   node -v
   npm -v
   ```
2. **Git**:
   ```bash
   git --version
   ```

*(Nota: O executável do Cloudflare Tunnel `cloudflared` é baixado automaticamente pelo projeto para a pasta `bin/` na primeira execução caso não esteja instalado no sistema).*

---

## 🚀 2. Passo a Passo de Instalação Autônoma

### Passo 2.1 — Instalar Dependências do Node.js
Na raiz do projeto clonado, execute:
```bash
npm install
```
*(Nota: O pacote `better-sqlite3` compila bindings nativos ou baixa binários pré-compilados para a sua arquitetura).*

---

### Passo 2.2 — Criar o Arquivo de Configuração `.env`
Crie o arquivo `.env` na raiz do projeto com o seguinte conteúdo:

```env
PORT=3000
JWT_SECRET=stream_literal_super_secret_jwt_key_2026
ADMIN_SECRET_KEY=admin_secret_key_123

# [Obrigatório para Conexão Automática Externa]
# Token pessoal do GitHub (escopo "gist") para atualizar o link do túnel online:
DISCOVERY_GITHUB_TOKEN=SEU_TOKEN_AQUI

# ID do Gist do Service Discovery (o mesmo do Netlify):
DISCOVERY_GIST_ID=7d880c174e0777293cfae8e7c2b74fdb
```

> **Atenção:** 
> - O `DISCOVERY_GIST_ID` deve ser o mesmo ID do Gist que já está configurado no portal do Netlify para que os clientes continuem sendo redirecionados para este novo servidor sem mudar nada.
> - O `DISCOVERY_GITHUB_TOKEN` deve ter permissão de edição no Gist.

---

### Passo 2.3 — Banco de Dados de Usuários (SQLite)

O banco de dados SQLite fica localizado em:
`server/db/stream_literal.db`

#### Duas opções de inicialização:
1. **Migrar contas do computador antigo (Recomendado se quiser manter as senhas e logins existentes):**
   - Basta copiar o arquivo `server/db/stream_literal.db` da máquina anterior para a pasta `server/db/` desta nova máquina.
2. **Começar banco do zero:**
   - Não faça nada! O script `server/db/database.js` cria o banco e a tabela de usuários automaticamente na primeira execução, criando o usuário administrador padrão:
     - **Usuário:** `admin`
     - **Senha:** `admin`

---

### Passo 2.4 — Iniciar o Servidor Completo (Host + Túnel + Discovery)

#### No Windows:
Você pode executar o inicializador de 1 clique:
```powershell
.\iniciar-servidor.bat
```
Ou via terminal:
```powershell
npm start
```

#### No Linux / macOS:
```bash
npm start
```

---

## ✅ 3. Verificação de Saúde e Sucesso

O Agente de IA deve verificar os seguintes sinais de sucesso nos logs do terminal:
1. `🚀 [STREAM LITERAL] Servidor iniciado com sucesso!` (ouvindo na porta 3000).
2. `🌐 [STREAM LITERAL] Conectando túnel seguro para a porta 3000...`
3. `🚀 SEU LINK PÚBLICO E SEGURO (HTTPS) ESTÁ PRONTO: https://....trycloudflare.com`
4. `📡 [Service Discovery] Publicado com sucesso no GitHub Gist!`

### Teste de Endpoint Local:
```bash
curl http://127.0.0.1:3000/api/health
```
Deve responder:
```json
{"ok":true,"name":"stream-literal","timestamp":...}
```

---

## 🛠️ 4. Gerenciamento e Comandos Úteis

### Criar ou redefinir usuários via linha de comando:
```bash
# Menu interativo completo de auditoria e troca de senhas:
npm run users

# Ou criar usuário direto:
node server/scripts/create-user.js
```

### Rodar permanentemente em segundo plano (24/7):
Se esta máquina for um servidor dedicado (VPS ou PC sempre ligado), instale o `pm2`:
```bash
npm install -g pm2
pm2 start server/launcher.js --name stream-literal
pm2 save
pm2 startup
```

---

## 🛑 5. Resolução de Problemas Comuns

- **Porta 3000 em uso (`EADDRINUSE`):**
  - No Windows: `Get-Process node | Stop-Process -Force` ou `taskkill /f /im node.exe`
  - No Linux: `fuser -k 3000/tcp`
- **Falha ao baixar `cloudflared`:**
  - Instale manualmente:
    - Windows: `winget install --id Cloudflare.cloudflared -e`
    - Linux (Debian/Ubuntu): `sudo apt-get install cloudflared` ou baixe o `.deb` oficial.
