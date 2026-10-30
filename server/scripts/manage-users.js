const readline = require('readline');
const db = require('../db/database');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function listUsers() {
  console.log('\n📋 --- AUDITORIA DE USUÁRIOS NO BANCO ---');
  const users = db.getAllUsers();
  if (users.length === 0) {
    console.log('Nenhum usuário cadastrado.');
    return;
  }
  console.table(users.map(u => ({
    ID: u.id,
    'Nome de Usuário': u.username,
    'Administrador': u.is_admin ? '✅ Sim' : 'Não',
    'Cadastrado em': u.created_at
  })));
}

async function changePassword() {
  listUsers();
  const target = await ask('\nDigite o ID ou o Nome do usuário para alterar a senha: ');
  let user = null;

  if (/^\d+$/.test(target.trim())) {
    user = db.getUserById(parseInt(target.trim(), 10));
  } else {
    user = db.getUserByUsername(target.trim());
  }

  if (!user) {
    console.log('❌ Usuário não encontrado.');
    return;
  }

  const newPass = await ask(`Digite a nova senha para "@${user.username}": `);
  if (!newPass || newPass.length < 4) {
    console.log('❌ A senha deve conter pelo menos 4 caracteres.');
    return;
  }

  db.updatePassword(user.id, newPass);
  console.log(`✅ Senha do usuário "@${user.username}" alterada com sucesso!`);
}

async function changeUsername() {
  listUsers();
  const target = await ask('\nDigite o ID ou o Nome atual do usuário para renomear: ');
  let user = null;

  if (/^\d+$/.test(target.trim())) {
    user = db.getUserById(parseInt(target.trim(), 10));
  } else {
    user = db.getUserByUsername(target.trim());
  }

  if (!user) {
    console.log('❌ Usuário não encontrado.');
    return;
  }

  const newUsername = await ask(`Digite o novo nome de usuário para substituir "@${user.username}": `);
  const clean = newUsername.trim().toLowerCase();
  if (!clean) {
    console.log('❌ Nome de usuário inválido.');
    return;
  }

  const existing = db.getUserByUsername(clean);
  if (existing && existing.id !== user.id) {
    console.log(`❌ O nome de usuário "${clean}" já está em uso.`);
    return;
  }

  db.updateUsername(user.id, clean);
  console.log(`✅ Nome de usuário alterado de "@${user.username}" para "@${clean}" com sucesso!`);
}

async function createUser() {
  console.log('\n➕ --- CRIAR NOVO USUÁRIO ---');
  const username = await ask('Nome de login (ex: pedro): ');
  const clean = username.trim().toLowerCase();
  if (!clean) {
    console.log('❌ Nome de login não pode ser vazio.');
    return;
  }

  const existing = db.getUserByUsername(clean);
  if (existing) {
    console.log(`❌ Já existe um usuário com o login "${clean}".`);
    return;
  }

  const password = await ask('Senha: ');
  if (!password || password.length < 4) {
    console.log('❌ A senha deve conter pelo menos 4 caracteres.');
    return;
  }

  const adminAnswer = await ask('É administrador? (s/N): ');
  const isAdmin = adminAnswer.trim().toLowerCase() === 's';

  try {
    const newUser = db.createUser(clean, password, isAdmin ? 1 : 0);
    console.log(`\n✅ Usuário "@${newUser.username}" cadastrado com sucesso! (ID: ${newUser.id})`);
  } catch (err) {
    console.error('❌ Erro:', err.message);
  }
}

async function deleteUser() {
  listUsers();
  const target = await ask('\nDigite o ID do usuário que deseja EXCLUIR: ');
  const id = parseInt(target.trim(), 10);
  if (isNaN(id)) {
    console.log('❌ ID inválido.');
    return;
  }

  const user = db.getUserById(id);
  if (!user) {
    console.log('❌ Usuário não encontrado.');
    return;
  }

  const confirm = await ask(`Tem certeza que deseja excluir permanentemente o usuário "@${user.username}"? (s/N): `);
  if (confirm.trim().toLowerCase() !== 's') {
    console.log('Operação cancelada.');
    return;
  }

  db.deleteUser(id);
  console.log(`🗑️ Usuário "@${user.username}" excluído com sucesso!`);
}

async function menu() {
  while (true) {
    console.log('\n=======================================');
    console.log('  🛠️  STREAM LITERAL — GERENCIADOR DE USUÁRIOS');
    console.log('=======================================');
    console.log('1. Listar / Auditar todos os usuários');
    console.log('2. Alterar senha de um usuário (incluindo admin)');
    console.log('3. Alterar nome de login (renomear usuário)');
    console.log('4. Criar novo usuário');
    console.log('5. Excluir usuário');
    console.log('0. Sair');
    
    const choice = await ask('\nEscolha uma opção: ');
    
    switch (choice.trim()) {
      case '1':
        listUsers();
        break;
      case '2':
        await changePassword();
        break;
      case '3':
        await changeUsername();
        break;
      case '4':
        await createUser();
        break;
      case '5':
        await deleteUser();
        break;
      case '0':
        console.log('Até mais!');
        rl.close();
        return;
      default:
        console.log('Opção inválida.');
    }
  }
}

menu();
