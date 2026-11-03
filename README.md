# 📺 Stream Literal — Base Estelar

Plataforma minimalista e privada de compartilhamento de tela e áudio em tempo real para pequenos grupos (até 10 pessoas), com cliente Desktop ultraleve em **Tauri v2 (Rust)** capaz de **isolar processos de áudio** (silenciando o Discord ou outros programas da transmissão) e sistema de **descoberta automática de servidor (Service Discovery)**.

---

## ✨ Recursos Principais

- **Isolamento de Áudio por Processo (WASAPI Loopback):** Exclui nativamente o áudio do Discord da sua transmissão. Quem assiste ouve seu jogo ou vídeo com perfeição, sem vazamento da voz de quem está na call e com **zero eco** para quem transmite.
- **Filtro Dinâmico em Tempo Real (*Mid-Stream*):** Altere ou adicione programas para ignorar/silenciar durante a transmissão sem precisar reiniciar o compartilhamento.
- **Descoberta Automática de Serviço (*Service Discovery*):** Conecta o túnel seguro da Cloudflare e publica o endereço ativo automaticamente em um GitHub Gist Secreto. Nem você nem seus amigos precisam copiar e colar links novos ao reiniciar o servidor.
- **Portal de Redirecionamento Estelar:** Um link fixo (`portal.html`) que você pode hospedar no GitHub Pages ou enviar aos amigos; ao abrir, ele busca o servidor ativo e os redireciona imediatamente.
- **Layout Espacial Moderno:** Interface escura estilo Discord com grade de transmissões, visualização destacada (*Spotlight/Pin*), controle independente de volume e suporte a tela cheia.
- **Inicializador Unificado de 1 Clique:** Inicia o servidor local, WebSocket, túnel HTTPS seguro e Service Discovery simultaneamente com um único comando ou clique duplo no Windows.
- **Ultraleve e Privado:** App desktop consome ~15-30MB de RAM (contra ~300MB de soluções em Electron). Sem autorregistro público; acesso exclusivo para contas criadas pelo administrador.

---

## 🏗️ Arquitetura do Sistema

```
                      ┌────────────────────────────────────────┐
                      │            NUVEM / INTERNET            │
                      │  Cloudflare Tunnel + GitHub Gist DNS   │
                      └───────────────────▲────────────────────┘
                                          │
                   ┌──────────────────────┴──────────────────────┐
                   │                                             │
      ┌────────────┴────────────┐                   ┌────────────┴────────────┐
      │   STREAMER (HOST PC)    │                   │   ESPECTADORES (WEB)    │
      │   Stream Literal App    │                   │   Navegador Chrome/Edge │
      │   Tauri v2 + Rust Core  │                   │   ou App Desktop        │
      └────────────┬────────────┘                   └─────────────────────────┘
                   │
      ┌────────────┴───────────────────────────┐
      │   WASAPI Process Loopback (Rust)       │
      │   - Captura som do Windows             │
      │   - Exclui árvore do Discord.exe       │
      │   - Normaliza para Float32 Estéreo     │
      │   - Alimenta WebRTC (Zero Eco Local)   │
      └────────────────────────────────────────┘
```

---

## 🚀 Como Iniciar

### 1. Iniciar o Servidor e o Túnel (Host)

Você pode iniciar tudo de duas formas muito simples:

- **Opção A (1 Clique no Windows):**
  Dê um duplo clique no arquivo:
  ```text
  iniciar-servidor.bat
  ```

- **Opção B (Pelo Terminal):**
  Na pasta do projeto, execute:
  ```bash
  npm start
  ```

O inicializador unificado subirá o servidor local na porta `3000`, ativará o Cloudflare Tunnel seguro (HTTPS) e publicará a URL no Service Discovery!

### 2. Abrir o Aplicativo Desktop (Tauri)

Em outro terminal (ou pelo executável compilado):
```bash
npm run tauri dev
```

### 3. Credenciais Padrão do Administrador
- **Usuário:** `admin`
- **Senha:** `admin`
*(Recomenda-se alterar a senha no primeiro acesso através do botão "Senha" no menu superior)*.

---

## 🎧 Isolamento de Áudio (Silenciar o Discord)

No App Desktop da Stream Literal:
1. Clique no botão **"Filtro de Áudio"** na barra superior.
2. A lista de aplicativos com saída de som ativa no Windows será exibida.
3. Marque os programas que você **não** quer que saiam no stream (ex: `discord.exe`, `spotify.exe` ou adicione executáveis personalizados).
4. Clique em **Salvar Configurações**.
5. Inicie o **Compartilhamento de Tela**:
   - Os espectadores ouvirão apenas o som do jogo/vídeo.
   - O Discord estará completamente silenciado na transmissão.
   - Você ouve o jogo e o Discord normalmente nos seus fones (sem duplicações).

---

## 🛰️ Descoberta Automática de Serviço (GitHub Gist)

Para que o endereço do túnel Cloudflare seja atualizado online sem você precisar copiar e colar nada:

1. Acesse suas configurações de tokens no GitHub: [github.com/settings/tokens](https://github.com/settings/tokens).
2. Clique em **Generate new token (classic)**.
3. Marque a permissão **`gist`** (Criar e editar gists).
4. Copie o token gerado (`ghp_...`).
5. Cole no seu arquivo local `.env`:
   ```env
   DISCOVERY_GITHUB_TOKEN=ghp_seu_token_aqui
   ```
6. Pronto! Ao rodar `npm start`, o servidor criará o Gist Secreto automaticamente e manterá a URL atualizada para todos os seus amigos.

---

## 👥 Gerenciamento de Membros

O acesso à sala é restrito a amigos cadastrados. Você tem duas opções para gerenciar usuários:

### 1. Pela Interface Web / Desktop
Clique no botão **"Gerenciar Usuários"** (visível para administradores) no topo da tela para cadastrar novos amigos, redefinir senhas ou remover contas.

### 2. Pelo Terminal Interativo (CLI)
Para auditoria avançada ou gerenciamento direto pelo prompt de comando:
```bash
npm run users
```
Permite listar contas com data de criação, alterar senhas, renomear ou excluir usuários.

---

## 📦 Scripts Disponíveis

| Comando | Descrição |
| :--- | :--- |
| `npm start` | Inicializador completo (Servidor local + Túnel Cloudflare + Service Discovery) |
| `npm run server` | Inicia apenas o servidor local HTTP/WebSocket (porta 3000) |
| `npm run tunnel` | Inicia apenas o túnel Cloudflare avulso |
| `npm run tauri dev` | Executa o aplicativo Desktop em modo de desenvolvimento |
| `npm run users` | Menu CLI interativo para auditoria e gerenciamento de usuários |
| `npm run create-user` | Criação rápida de usuário via linha de comando |

---

## 📄 Licença
Distribuído sob licença ISC. Desenvolvido para uso pessoal e em pequenos grupos de amigos.
