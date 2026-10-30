const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'stream_literal.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrency performance
db.pragma('journal_mode = WAL');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Prepared statements
const findByUsernameStmt = db.prepare('SELECT * FROM users WHERE username = ?');
const findByIdStmt = db.prepare('SELECT id, username, display_name, is_admin, created_at FROM users WHERE id = ?');
const createUserStmt = db.prepare(`
  INSERT INTO users (username, password_hash, display_name, is_admin)
  VALUES (@username, @password_hash, @username, @is_admin)
`);
const listUsersStmt = db.prepare('SELECT id, username, is_admin, created_at FROM users ORDER BY created_at ASC');
const deleteUserStmt = db.prepare('DELETE FROM users WHERE id = ?');
const updatePasswordStmt = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
const updateUsernameStmt = db.prepare('UPDATE users SET username = ?, display_name = ? WHERE id = ?');
const countUsersStmt = db.prepare('SELECT COUNT(*) as count FROM users');

// Seed initial admin if database is empty
function seedDefaultAdminIfEmpty() {
  const result = countUsersStmt.get();
  if (result.count === 0) {
    const defaultPassword = 'admin';
    const hash = bcrypt.hashSync(defaultPassword, 10);
    createUserStmt.run({
      username: 'admin',
      password_hash: hash,
      is_admin: 1
    });
    console.log('----------------------------------------------------');
    console.log('🔑 [STREAM LITERAL] Usuário inicial criado:');
    console.log('   Usuário: admin');
    console.log('   Senha:   admin');
    console.log('   (Recomendado alterar a senha do admin)');
    console.log('----------------------------------------------------');
  }
}

seedDefaultAdminIfEmpty();

module.exports = {
  db,
  getUserByUsername: (username) => findByUsernameStmt.get(username),
  getUserById: (id) => findByIdStmt.get(id),
  getAllUsers: () => listUsersStmt.all(),
  createUser: (username, password, isAdmin = 0) => {
    const cleanUsername = username.trim().toLowerCase();
    const password_hash = bcrypt.hashSync(password, 10);
    const info = createUserStmt.run({
      username: cleanUsername,
      password_hash,
      is_admin: isAdmin ? 1 : 0
    });
    return { id: info.lastInsertRowid, username: cleanUsername, is_admin: isAdmin };
  },
  deleteUser: (id) => {
    const info = deleteUserStmt.run(id);
    return info.changes > 0;
  },
  updatePassword: (id, newPassword) => {
    const password_hash = bcrypt.hashSync(newPassword, 10);
    const info = updatePasswordStmt.run(password_hash, id);
    return info.changes > 0;
  },
  updateUsername: (id, newUsername) => {
    const clean = newUsername.trim().toLowerCase();
    const info = updateUsernameStmt.run(clean, clean, id);
    return info.changes > 0;
  }
};
