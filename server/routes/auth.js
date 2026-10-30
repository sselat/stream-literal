const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { generateToken, authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Informe o usuário e a senha.' });
  }

  const user = db.getUserByUsername(username.trim());
  if (!user) {
    return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  }

  const isPasswordValid = bcrypt.compareSync(password, user.password_hash);
  if (!isPasswordValid) {
    return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  }

  const userPayload = {
    id: user.id,
    username: user.username,
    is_admin: user.is_admin
  };

  const token = generateToken(userPayload);
  res.json({ token, user: userPayload });
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/change-password (Qualquer usuário logado pode mudar sua própria senha)
router.post('/change-password', authMiddleware, (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Preencha a senha atual e a nova senha.' });
  }

  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'A nova senha deve ter no mínimo 4 caracteres.' });
  }

  const user = db.getUserById(req.user.id);
  const fullUser = db.getUserByUsername(user.username);

  const isValid = bcrypt.compareSync(currentPassword, fullUser.password_hash);
  if (!isValid) {
    return res.status(401).json({ error: 'Senha atual incorreta.' });
  }

  db.updatePassword(user.id, newPassword);
  console.log(`🔐 [SENHA ALTERADA] O usuário @${user.username} alterou sua própria senha.`);
  res.json({ success: true, message: 'Senha alterada com sucesso!' });
});

// ================= ADMIN ENDPOINTS =================

// GET /api/admin/users
router.get('/users', authMiddleware, adminMiddleware, (req, res) => {
  const users = db.getAllUsers();
  res.json({ users });
});

// POST /api/admin/users (Criar novo usuário)
router.post('/users', authMiddleware, adminMiddleware, (req, res) => {
  const { username, password, is_admin } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
  }

  const cleanUsername = username.trim().toLowerCase();
  const existing = db.getUserByUsername(cleanUsername);
  if (existing) {
    return res.status(400).json({ error: 'Esse nome de usuário já está em uso.' });
  }

  try {
    const newUser = db.createUser(
      cleanUsername,
      password,
      is_admin ? 1 : 0
    );
    console.log(`👤 [USUÁRIO CRIADO] Usuário: "@${newUser.username}" (Admin: ${newUser.is_admin ? 'Sim' : 'Não'}) cadastrado por @${req.user.username}`);
    res.status(201).json({ user: newUser });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar usuário: ' + err.message });
  }
});

// POST /api/admin/users/:id/reset-password (Admin redefine senha de qualquer usuário)
router.post('/users/:id/reset-password', authMiddleware, adminMiddleware, (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'A nova senha deve ter no mínimo 4 caracteres.' });
  }

  const targetUser = db.getUserById(targetId);
  if (!targetUser) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }

  db.updatePassword(targetId, newPassword);
  console.log(`🔑 [SENHA REDEFINIDA] A senha do usuário @${targetUser.username} foi redefinida por @${req.user.username}`);
  res.json({ success: true, message: `Senha de @${targetUser.username} alterada com sucesso!` });
});

// DELETE /api/admin/users/:id (Excluir usuário)
router.delete('/users/:id', authMiddleware, adminMiddleware, (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  if (targetId === req.user.id) {
    return res.status(400).json({ error: 'Você não pode excluir a sua própria conta.' });
  }

  const targetUser = db.getUserById(targetId);
  if (!targetUser) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }

  const deleted = db.deleteUser(targetId);
  if (!deleted) {
    return res.status(500).json({ error: 'Erro ao excluir usuário.' });
  }

  console.log(`🗑️ [USUÁRIO EXCLUÍDO] Usuário: "@${targetUser.username}" (ID: ${targetId}) excluído por @${req.user.username}`);
  res.json({ success: true });
});

module.exports = router;
