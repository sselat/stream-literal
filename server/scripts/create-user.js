const readline = require('readline');
const db = require('../db/database');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  console.log('\n--- 👤 Stream Literal: Criar Usuário ---');
  
  const username = await ask('Nome de login (ex: joao): ');
  const cleanUsername = username.trim().toLowerCase();
  if (!cleanUsername) {
    console.log('❌ O nome de usuário não pode ser vazio.');
    rl.close();
    return;
  }

  const existing = db.getUserByUsername(cleanUsername);
  if (existing) {
    console.log(`❌ Já existe um usuário com o login "${cleanUsername}".`);
    rl.close();
    return;
  }

  const password = await ask('Senha: ');
  if (!password || password.length < 4) {
    console.log('❌ A senha deve conter pelo menos 4 caracteres.');
    rl.close();
    return;
  }

  const adminAnswer = await ask('É administrador? (s/N): ');
  const isAdmin = adminAnswer.trim().toLowerCase() === 's';

  try {
    const newUser = db.createUser(cleanUsername, password, isAdmin ? 1 : 0);
    console.log('\n✅ Usuário cadastrado com sucesso!');
    console.log(`   ID: ${newUser.id}`);
    console.log(`   Usuário: @${newUser.username}`);
    console.log(`   Admin: ${newUser.is_admin ? 'Sim' : 'Não'}\n`);
  } catch (err) {
    console.error('❌ Erro ao criar usuário:', err.message);
  } finally {
    rl.close();
  }
}

main();
