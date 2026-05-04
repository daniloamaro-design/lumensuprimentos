// ═══════════════════════════════════════════════════════════════════
//  LUMEN ESTOQUE — MÓDULO DE AUTENTICAÇÃO
//  Arquivo: lumen-auth.js
//
//  Contém: login, registro, controle de status, carregamento do
//  admin_email do Firestore (seguro — não fica mais no código-fonte).
// ═══════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// 👑  CARREGA O ADMIN_EMAIL DO FIRESTORE
// ─────────────────────────────────────────────
// O e-mail do admin não fica mais hardcoded no código.
// Fica no Firestore: coleção "app_config" → documento "geral" → campo "admin_email"
// Isso evita que qualquer pessoa que abra o DevTools veja o e-mail.

async function carregarAdminEmail() {
  try {
    const snap = await db.collection('app_config').doc('geral').get();
    if (snap.exists && snap.data().admin_email) {
      window.ADMIN_EMAIL = snap.data().admin_email;
      console.log('[Auth] admin_email carregado do Firestore.');
    } else {
      // Fallback: usa o valor de config.js se o Firestore não tiver o doc
      window.ADMIN_EMAIL = window.ADMIN_EMAIL_FALLBACK;
      console.warn('[Auth] admin_email não encontrado no Firestore. Usando fallback de config.js.');
    }
  } catch (e) {
    window.ADMIN_EMAIL = window.ADMIN_EMAIL_FALLBACK;
    console.warn('[Auth] Erro ao buscar admin_email:', e.message, '— usando fallback.');
  }
}

// ─────────────────────────────────────────────
// 🔑  AUTH STATE LISTENER
// ─────────────────────────────────────────────
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    showAuthScreen('login');
    return;
  }

  currentUser = user;

  try {
    // Garante que o admin_email está carregado
    if (!window.ADMIN_EMAIL) await carregarAdminEmail();

    const snap = await db.collection('users').doc(user.uid).get();
    if (!snap.exists) { showAuthScreen('pending'); return; }

    currentUserData = snap.data();

    if (currentUserData.status === 'pending')   { showAuthScreen('pending'); return; }
    if (currentUserData.status === 'rejected')  {
      auth.signOut();
      showAuthScreen('login');
      showAlert('login-alert', 'Sua solicitação de acesso foi recusada.', 'danger');
      return;
    }

    // Carrega RBAC (módulo lumen-rbac.js) se disponível
    if (typeof inicializarRBAC === 'function') {
      await inicializarRBAC(user.uid);
    }

    // Registra login no audit log se disponível
    if (typeof registrarAuditoria === 'function') {
      registrarAuditoria('login', `Login realizado — ${currentUserData.name || user.email}`);
    }

    showApp();

  } catch (e) {
    console.error('[Auth] Erro no onAuthStateChanged:', e);
    auth.signOut();
  }
});

// ─────────────────────────────────────────────
// 🔐  FUNÇÕES DE AUTH
// ─────────────────────────────────────────────

function showForm(name) {
  ['login','register','pending'].forEach(f => {
    document.getElementById(`form-${f}`)?.classList.toggle('hidden', f !== name);
  });
}

function showAuthScreen(form) {
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app-screen').style.display  = 'none';
  showForm(form);
}

async function doLogin() {
  const email    = v('login-email');
  const password = v('login-password');
  if (!email || !password) { showAlert('login-alert','Preencha e-mail e senha.','danger'); return; }
  setBtnLoading('btn-login', true);
  hideAlert('login-alert');
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (e) {
    showAlert('login-alert', friendlyAuthError(e.code), 'danger');
    setBtnLoading('btn-login', false);
  }
}

async function doLogout() {
  // Registra logout antes de sair
  if (typeof registrarAuditoria === 'function') {
    await registrarAuditoria('logout', `Logout — ${currentUserData?.name || ''}`);
  }
  await auth.signOut();
}

async function doRegister() {
  const name     = v('reg-name');
  const email    = v('reg-email');
  const password = v('reg-password');

  if (!name || !email || !password) {
    showAlert('register-alert','Preencha todos os campos.','danger'); return;
  }
  if (password.length < 6) {
    showAlert('register-alert','A senha deve ter ao menos 6 caracteres.','danger'); return;
  }

  setBtnLoading('btn-register', true);
  hideAlert('register-alert');

  try {
    // Garante que ADMIN_EMAIL está carregado
    if (!window.ADMIN_EMAIL) await carregarAdminEmail();

    const cred = await auth.createUserWithEmailAndPassword(email, password);
    const isAdmin = email.toLowerCase() === (window.ADMIN_EMAIL || '').toLowerCase();

    await db.collection('users').doc(cred.user.uid).set({
      name,
      email,
      house:     '',
      role:      isAdmin ? 'admin'    : 'usuario',
      status:    isAdmin ? 'approved' : 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    if (!isAdmin) notifyAdminNewUser(name, email);

    showAlert('register-alert','Solicitação enviada! Aguarde a aprovação do administrador.','success');
  } catch (e) {
    showAlert('register-alert', friendlyAuthError(e.code), 'danger');
  }
  setBtnLoading('btn-register', false);
}

function friendlyAuthError(code) {
  const msgs = {
    'auth/user-not-found':       'E-mail não encontrado.',
    'auth/wrong-password':       'Senha incorreta.',
    'auth/invalid-email':        'E-mail inválido.',
    'auth/email-already-in-use': 'Este e-mail já está em uso.',
    'auth/too-many-requests':    'Muitas tentativas. Tente novamente em alguns minutos.',
    'auth/invalid-credential':   'E-mail ou senha incorretos.',
  };
  return msgs[code] || 'Erro: ' + code;
}

// ─────────────────────────────────────────────
// 🛠️  CONFIGURAR ADMIN_EMAIL NO FIRESTORE
// ─────────────────────────────────────────────
// Função auxiliar: rode uma vez no console do navegador (F12)
// para criar o documento no Firestore com o e-mail do admin.
// Depois não precisa mais chamar — fica salvo.
//
// Como usar:
//   1. Faça login como admin
//   2. Abra o DevTools (F12) → Console
//   3. Digite: configurarAdminEmailNoFirestore("seu@email.com")
//   4. Pressione Enter
//   5. Pronto! O e-mail está seguro no Firestore.

window.configurarAdminEmailNoFirestore = async function(email) {
  if (!email || !email.includes('@')) {
    console.error('E-mail inválido!');
    return;
  }
  try {
    await db.collection('app_config').doc('geral').set(
      { admin_email: email, atualizadoEm: firebase.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    window.ADMIN_EMAIL = email;
    console.log(`✅ Admin email "${email}" salvo no Firestore com sucesso!`);
    console.log('Agora você pode remover o ADMIN_EMAIL_FALLBACK do config.js.');
  } catch(e) {
    console.error('Erro ao salvar:', e.message);
  }
};

console.log('[Auth] Módulo de autenticação carregado.');
