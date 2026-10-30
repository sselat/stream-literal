# 📺 Stream Literal

Plataforma minimalista e privada de compartilhamento de tela e áudio em tempo real para pequenos grupos (até 10 pessoas), inspirada na experiência do Discord e Google Meet.

---

## ✨ Características

- **Foco Exclusivo em Telas:** Feita especialmente para compartilhar telas com áudio de alta qualidade do sistema/aba.
- **Sala Única:** Sem necessidade de gerar links de reuniões diferentes. Ao fazer login, todos entram diretamente na mesma sala.
- **Estilo Discord:** Qualquer membro pode transmitir a qualquer momento. Você pode clicar em qualquer transmissão para deixá-la em destaque (*Spotlight*), com controle de volume independente e tela cheia.
- **Acesso Fechado:** Sem cadastro público. Apenas o administrador cria as contas de acesso (via painel visual ou comando no terminal).
- **Leve e Rápido:** Utiliza **WebRTC nativo** acelerado por hardware na GPU. O servidor Node.js consome menos de 50MB de RAM.
- **Logs Claros no Terminal:** Monitoramento em tempo real de conexões, transmissões, criação e exclusão de contas.

---

## 🚀 Como Iniciar no seu Computador

### 1. Iniciar o Servidor
Abra o terminal na pasta do projeto e execute:
```bash
npm start
```
O servidor estará rodando em: **`http://localhost:3000`**

### 2. Primeiro Acesso (Administrador)
- **Usuário:** `admin`
- **Senha:** `admin`

---

## 👥 Gerenciamento de Contas e Auditoria

Você tem 3 formas de gerenciar e auditar as contas cadastradas:

### 1. Pela Interface Web:
- **Criar Membro:** Clique no botão **"Gerenciar Usuários"** (visível apenas para admins) no topo direito da tela. Informe o nome de login e a senha.
- **Redefinir Senha de um Membro:** No mesmo painel, você verá a lista de membros e o botão **"Nova Senha"** para alterar a senha de qualquer usuário.
- **Alterar a Própria Senha:** Qualquer usuário logado pode clicar no botão **"Senha"** na barra superior e definir uma nova senha.

### 2. Pelo Painel Interativo no Terminal (Auditoria Completa):
Execute no terminal:
```bash
npm run users
```
Ele abrirá um menu interativo completo onde você pode:
1. **Auditar todos os usuários** (mostra tabela com ID, nome, status de admin e data de cadastro).
2. **Alterar senha de qualquer usuário** (inclusive do `admin`).
3. **Renomear um usuário**.
4. **Criar novos membros**.
5. **Excluir membros**.

### 3. Diretamente no Banco de Dados SQLite:
O banco de dados fica salvo no arquivo local:
`server/db/stream_literal.db`
Você pode abri-lo com qualquer ferramenta visual como o [DB Browser for SQLite](https://sqlitebrowser.org/) ou extensões do VS Code.

---

## 🔒 Como Compartilhar com Amigos pela Internet (HTTPS Automático)

Os navegadores exigem conexão segura (**HTTPS**) para autorizar a transmissão de tela pela internet.
Para facilitar ao máximo, o projeto já vem com um inicializador automático do Cloudflare Tunnel:

1. Deixe o servidor rodando em um terminal com `npm start`.
2. Em **outro terminal**, execute apenas:
   ```bash
   npm run tunnel
   ```
3. O script iniciará o Cloudflare Tunnel e exibirá o link seguro na tela:
   ```text
   ------------------------------------------------------
   🚀 SEU LINK PÚBLICO E SEGURO (HTTPS) ESTÁ PRONTO:
   🔗  https://seu-link-aleatorio.trycloudflare.com
   ------------------------------------------------------
   ```
4. Copie esse link e envie para seus amigos junto com o usuário e senha deles!
5. Para encerrar, basta fechar a janela do terminal.
