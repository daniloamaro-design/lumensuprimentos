// Extraído de index.html (auth listeners + funções de login/registro) em 2026-07-27
// Carregar DEPOIS de js/01-core.js (usa auth/db).
// ─────────────────────────────────────────────
// 🔑  AUTH LISTENERS
// ─────────────────────────────────────────────
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    // Cancela todos os listeners de notificação ao deslogar
    if (window._notifListeners) {
      window._notifListeners.forEach(fn => fn());
      window._notifListeners = [];
    }
    if (window._pageListenerPending) { clearTimeout(window._pageListenerPending); window._pageListenerPending = null; }
    if (window._pageListener) { window._pageListener(); window._pageListener = null; }
    if (window._pageTimer)    { clearInterval(window._pageTimer); window._pageTimer = null; }
    window._appJaIniciado = false; // próximo login deve navegar pra pagina inicial de novo
    showAuthScreen('login');
    return;
  }
  currentUser = user;
  try {
    let snap = await db.collection('users').doc(user.uid).get();
    if (!snap.exists) {
      if (user.isAnonymous) { showAuthScreen('pending'); return; }
      // Primeiro login via provedor social (Google etc.) — não passou pelo
      // formulário de cadastro, então não existe linha em 'users' ainda.
      // Cria o registro automaticamente (mesmo fluxo de aprovação do
      // cadastro por e-mail/senha: pendente até o admin aprovar, exceto se
      // for o ADMIN_EMAIL) e cai nos mesmos checks de status abaixo.
      const nome = user.displayName || (user.email ? user.email.split('@')[0] : 'Novo usuário');
      await db.collection('users').doc(user.uid).set({
        name: nome, email: user.email || '', house: '',
        role: user.email === ADMIN_EMAIL ? 'admin' : 'usuario',
        status: user.email === ADMIN_EMAIL ? 'approved' : 'pending',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      if (user.email !== ADMIN_EMAIL && typeof notifyAdminNewUser === 'function') {
        notifyAdminNewUser(nome, user.email || '');
      }
      snap = await db.collection('users').doc(user.uid).get();
    }
    currentUserData = snap.data();

    if (currentUserData.status === 'pending') { showAuthScreen('pending'); return; }
    if (currentUserData.status === 'rejected') {
      logoutApp();
      showAuthScreen('login');
      showAlert('login-alert', 'Sua solicitação de acesso foi recusada.', 'danger');
      return;
    }

    // Approved → show app
    showApp();
  } catch (e) {
    console.error(e);
    // Erro de rede/offline (Firestore "unavailable", timeout, etc.) NÃO deve
    // deslogar o usuário — a sessão continua válida, é só a conexão que falhou.
    // Só forçamos logout em erros que indicam problema real de permissão/conta.
    const isNetworkError =
      e.code === 'unavailable' ||
      e.code === 'deadline-exceeded' ||
      e.code === 'cancelled' ||
      (e.message && /offline|network|unreachable/i.test(e.message));

    if (isNetworkError) {
      showAlert(
        'login-alert',
        'Sem conexão com o servidor. Verifique sua internet — a página vai reconectar automaticamente.',
        'danger'
      );
      // Tenta de novo em alguns segundos, sem deslogar o usuário.
      if (window._authRetryTimer) clearTimeout(window._authRetryTimer);
      window._authRetryTimer = setTimeout(() => {
        (async () => {
          try {
            const retrySnap = await db.collection('users').doc(user.uid).get();
            if (!retrySnap.exists) { showAuthScreen('pending'); return; }
            currentUserData = retrySnap.data();
            if (currentUserData.status === 'pending')  { showAuthScreen('pending'); return; }
            if (currentUserData.status === 'rejected') {
              logoutApp();
              showAuthScreen('login');
              showAlert('login-alert', 'Sua solicitação de acesso foi recusada.', 'danger');
              return;
            }
            hideAlert('login-alert');
            showApp();
          } catch (retryErr) {
            console.error('Retry falhou:', retryErr);
            // Mantém o usuário logado sem forçar logout; falha silenciosa no retry.
          }
        })();
      }, 5000);
      return;
    }

    // Erro que não é de rede (ex: permission-denied real) → aí sim desloga.
    logoutApp();
  }
});

// ─────────────────────────────────────────────
// 🔐  AUTH FUNCTIONS
// ─────────────────────────────────────────────
// Desliga qualquer listener de tempo real (all-orders/orc-pendentes/var-solicitacoes)
// antes de encerrar a sessão — sem isso o listener continua tentando sincronizar
// depois do logout e falha repetidamente contra as regras do Firestore (sem auth),
// gerando erro "permission-denied" em loop no console sem nenhuma ação visível do usuário.
function logoutApp() {
  if (window._pageListener) { window._pageListener(); window._pageListener = null; }
  if (window._pageListenerPending) { clearTimeout(window._pageListenerPending); window._pageListenerPending = null; }
  if (window._pageTimer) { clearInterval(window._pageTimer); window._pageTimer = null; }
  auth.signOut();
}

function showForm(name) {
  ['login','register','pending','reset','guest-movement','guest-order'].forEach(f => {
    document.getElementById(`form-${f}`).classList.toggle('hidden', f !== name);
  });
  // Limpa alertas e campos ao trocar de tela
  if (name === 'reset') {
    hideAlert('reset-alert');
    const el = document.getElementById('reset-email');
    if (el) el.value = '';
  }
}

function showAuthScreen(form) {
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app-screen').style.display  = 'none';
  showForm(form);
}

async function enterGuestMode(page) {
  const nameFieldId = page === 'movement' ? 'guest-movement-name' : 'guest-order-name';
  const alertId     = page === 'movement' ? 'guest-movement-alert' : 'guest-order-alert';
  const name = document.getElementById(nameFieldId).value.trim();
  if (!name) {
    showAlert(alertId, 'Por favor, informe seu nome.', 'danger');
    return;
  }

  // Autentica de verdade (anônimo) antes de liberar a tela — sem isso, request.auth
  // fica null no Firestore e QUALQUER gravação (inclusive o contador de código
  // sequencial) cai em "permission-denied", sempre, pra todo mundo nesse modo.
  const btnConfirm = document.querySelector(`#form-${page === 'movement' ? 'guest-movement' : 'guest-order'} button.btn-primary`);
  if (btnConfirm) { btnConfirm.disabled = true; btnConfirm.textContent = 'Entrando...'; }
  try {
    await auth.signInAnonymously();
  } catch (e) {
    console.error('Falha ao autenticar modo convidado:', e);
    showAlert(alertId, 'Não foi possível iniciar o acesso rápido agora. Avise o administrador do sistema (autenticação anônima pode estar desabilitada no Firebase).', 'danger');
    if (btnConfirm) { btnConfirm.disabled = false; btnConfirm.textContent = 'Continuar para Solicitação'; }
    return;
  }
  if (btnConfirm) { btnConfirm.disabled = false; btnConfirm.textContent = 'Continuar para Solicitação'; }

  guestMode = true;
  guestName = name;
  // currentUser/currentUserData continuam sendo objetos locais pras funções existentes
  // funcionarem (nome, role, etc.) — mas agora existe uma sessão real (anônima) por trás,
  // que é o que o Firestore de fato enxerga em request.auth.
  currentUser     = { uid: auth.currentUser?.uid || ('guest_' + Date.now()), email: '', displayName: name };
  currentUserData = { name: name, role: 'usuario', house: '', status: 'approved' };
  // Esconde auth, mostra app
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-screen').style.display  = 'block';
  // Configura topbar para modo visitante
  document.getElementById('topbar-user').textContent = name + ' (Visitante)';
  document.getElementById('topbar-page-title').textContent = page === 'movement' ? 'Entrada / Saída' : 'Nova Solicitação de Variedades';
  // Esconde sidebar e mostra apenas a página solicitada
  document.getElementById('sidebar').style.display = 'none';
  document.getElementById('sidebar-overlay').style.display = 'none';
  document.querySelector('.main-content').style.marginLeft = '0';
  document.getElementById('btn-hamburger').style.display = 'none';
  // Esconde o botão sair padrão e adiciona botão voltar ao login
  const logoutBtn = document.querySelector('.topbar-logout');
  if (logoutBtn) logoutBtn.onclick = function() { exitGuestMode(); };
  if (logoutBtn) logoutBtn.textContent = 'Sair';
  // Ativa a página
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const targetPage = page === 'movement' ? 'page-movement' : 'page-guest-var';
  const el = document.getElementById(targetPage);
  if (el) el.classList.add('active');
  if (page === 'movement') setMovCat('cereal');
  if (page === 'new-order') abrirModalNovaVar();
}

function exitGuestMode() {
  guestMode = false;
  guestName = null;
  currentUser = null;
  currentUserData = null;
  if (auth.currentUser && auth.currentUser.isAnonymous) { auth.signOut(); }
  // Restaura sidebar
  document.getElementById('sidebar').style.display = '';
  document.querySelector('.main-content').style.marginLeft = '';
  document.getElementById('btn-hamburger').style.display = '';
  showAuthScreen('login');
}

async function doLogin() {
  const email    = v('login-email');
  const password = v('login-password');
  if (!email || !password) { showAlert('login-alert','Preencha e-mail e senha.','danger'); return; }
  setBtnLoading('btn-login', true);
  hideAlert('login-alert');
  document.getElementById('login-reenviar-wrap').style.display = 'none';
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (e) {
    showAlert('login-alert', friendlyAuthError(e.code), 'danger');
    if (e.code === 'auth/email-not-verified') {
      document.getElementById('login-reenviar-wrap').style.display = '';
    }
    setBtnLoading('btn-login', false);
  }
}

async function reenviarConfirmacaoEmail() {
  const email = v('login-email');
  if (!email) { showAlert('login-alert', 'Digite seu e-mail no campo acima antes de reenviar.', 'danger'); return; }
  try {
    await auth.resendConfirmationEmail(email);
    showAlert('login-alert', '✅ E-mail de confirmação reenviado! Verifique sua caixa de entrada (e a pasta de spam).', 'success');
    document.getElementById('login-reenviar-wrap').style.display = 'none';
  } catch (e) {
    showAlert('login-alert', friendlyAuthError(e.code), 'danger');
  }
}

async function doLoginGoogle() {
  hideAlert('login-alert');
  try {
    await auth.signInWithGoogle();
    // A partir daqui o navegador redireciona pro Google; ao voltar, a sessão
    // já vem pronta e quem trata o resto é o auth.onAuthStateChanged normal.
  } catch (e) {
    showAlert('login-alert', 'Não foi possível iniciar o login com Google agora. Tente novamente em instantes.', 'danger');
  }
}

async function doResetPassword() {
  const email = v('reset-email');
  if (!email) { showAlert('reset-alert', 'Informe seu e-mail.', 'danger'); return; }
  setBtnLoading('btn-reset', true);
  hideAlert('reset-alert');
  try {
    await auth.sendPasswordResetEmail(email);
    showAlert('reset-alert',
      '✅ E-mail de recuperação enviado! Verifique sua caixa de entrada (e a pasta de spam).',
      'success');
    document.getElementById('reset-email').value = '';
  } catch (e) {
    let msg = 'Erro ao enviar e-mail. Tente novamente.';
    if (e.code === 'auth/user-not-found')    msg = 'Nenhuma conta encontrada com este e-mail.';
    if (e.code === 'auth/invalid-email')     msg = 'E-mail inválido.';
    if (e.code === 'auth/too-many-requests') msg = 'Muitas tentativas. Aguarde alguns minutos.';
    showAlert('reset-alert', msg, 'danger');
  } finally {
    setBtnLoading('btn-reset', false);
  }
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
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    await db.collection('users').doc(cred.user.uid).set({
      name, email,
      house: '',
      role: email === ADMIN_EMAIL ? 'admin' : 'usuario',
      status: email === ADMIN_EMAIL ? 'approved' : 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    notifyAdminNewUser(name, email);
    showAlert('register-alert','Solicitação enviada! Se pedirmos, confirme seu e-mail (confira a caixa de entrada/spam) — depois é só aguardar a aprovação do administrador.','success');
  } catch (e) {
    showAlert('register-alert', friendlyAuthError(e.code), 'danger');
  }
  setBtnLoading('btn-register', false);
}

function friendlyAuthError(code) {
  const msgs = {
    'auth/user-not-found':    'E-mail não encontrado.',
    'auth/wrong-password':    'Senha incorreta.',
    'auth/invalid-email':     'E-mail inválido.',
    'auth/email-already-in-use': 'Este e-mail já está em uso.',
    'auth/too-many-requests': 'Muitas tentativas. Tente novamente em alguns minutos.',
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/email-not-verified': 'Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada (e o spam) — ou clique em "Reenviar e-mail de confirmação" abaixo.',
  };
  return msgs[code] || 'Erro: ' + code;
}

// ─────────────────────────────────────────────
// 🏛️  APP SETUP
// ─────────────────────────────────────────────
async function showApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-screen').style.display  = 'block';

  const role = currentUserData.role || 'usuario';
  const isAdmin       = role === 'admin';
  const isDiretor     = role === 'diretor';
  const isGerente     = role === 'gerente';
  const isCoordenador = role === 'coordenador';
  const isAdminLevel  = isAdmin || isDiretor || isGerente || isCoordenador;
  const isFinanceiro  = role === 'financeiro';
  const isCompras     = role === 'compras';
  const isEstoque     = role === 'estoque';
  const isEscritorio  = role === 'escritorio';
  const isCSL         = role === 'csl';
  const isCoordCSL    = role === 'coord_csl';
  const isUsuario     = role === 'usuario';

  document.getElementById('topbar-user').textContent = currentUserData.name;

  // U4: carrega as permissões editáveis (perfil × página) antes de montar o menu.
  if (typeof carregarPermissoes === 'function') { await carregarPermissoes(); }

  // Administracao: somente adminLevel
  document.getElementById('sidebar-admin').style.display = isAdminLevel ? 'block' : 'none';

  // Estoque/Compras: adminLevel + compras + estoque + csl + coord_csl
  document.getElementById('sidebar-estoque-compras').style.display =
    (isAdminLevel || isCompras || isEstoque || isCSL || isCoordCSL) ? 'block' : 'none';

  // Indicadores: oculto para compras/estoque/financeiro/escritorio/csl/coord_csl/usuario
  const sidebarIndicadores = document.getElementById('sidebar-indicadores');
  if (sidebarIndicadores) {
    const semIndicadores = ['compras','estoque','financeiro','escritorio','csl','coord_csl','usuario'];
    sidebarIndicadores.style.display = semIndicadores.includes(role) ? 'none' : 'block';
  }

  // Financeiro: adminLevel + financeiro + compras
  document.getElementById('sidebar-financeiro').style.display =
    (isAdminLevel || isFinanceiro || isCompras) ? 'block' : 'none';

  // Variedades: adminLevel + compras + estoque + financeiro + escritorio
  const sidebarVar = document.getElementById('sidebar-variedades');
  if (sidebarVar) {
    const comVar = ['admin','diretor','gerente','coordenador','compras','estoque','financeiro','escritorio'];
    sidebarVar.style.display = comVar.includes(role) ? 'block' : 'none';
    // Proposta/Historico/Setores: apenas adminLevel
    document.querySelectorAll('.var-admin-only').forEach(el => {
      el.style.display = isAdminLevel ? 'block' : 'none';
    });
  }

  // Usuario: apenas usuario simples
  document.getElementById('sidebar-usuario').style.display = isUsuario ? 'block' : 'none';

  // CSL: csl + coord_csl (+ adminLevel ja ve tudo)
  const sidebarCSL = document.getElementById('sidebar-csl');
  if (sidebarCSL) {
    sidebarCSL.style.display = (isCSL || isCoordCSL) ? 'block' : 'none';
  }

  // compras-only items na sidebar
  document.querySelectorAll('.compras-only').forEach(el => {
    el.style.display = (isCompras || isAdminLevel) ? 'block' : 'none';
  });

  // Cardápio Diário: somente adminLevel (admin/diretor/gerente/coordenador)
  document.querySelectorAll('.cardapio-admin-only').forEach(el => {
    el.style.display = isAdminLevel ? 'block' : 'none';
  });

  // csl: "Solicitar Ajuste" só aparece para csl (não coord_csl)
  document.querySelectorAll('.csl-solicitacao-only').forEach(el => {
    el.style.display = isCSL ? 'block' : 'none';
  });

  // Painel do Coordenador: visível para coordenador, gerente, diretor, admin
  const isCoordNivel = isAdminLevel || role === 'coordenador';
  // sidebar section
  document.querySelectorAll('.coord-dash-section').forEach(el => {
    el.style.display = isCoordNivel ? '' : 'none';
  });
  // botão de módulo no switcher
  const btnCoord = document.getElementById('btn-mod-coord');
  if (btnCoord) btnCoord.style.display = isCoordNivel ? '' : 'none';

  // Carrega casas e cidades dinamicas do Firebase
  await loadDynamicData();
  populateHouseSelects();

  // U4: filtra a barra lateral pelas permissões do perfil (esconde itens/seções
  // não permitidos). Roda por último para sobrepor a visibilidade padrão acima.
  if (typeof aplicarPermissoesSidebar === 'function') { aplicarPermissoesSidebar(role); }

  // showApp() roda de novo a cada evento de auth do Supabase — inclusive a
  // renovação automática de token (acontece sozinha em background, e também
  // quando a aba volta a ficar visível). Sem essa guarda, o usuário era
  // jogado de volta pra página inicial do perfil no meio do uso, perdendo a
  // página em que estava. A navegação de entrada (módulo Suprimentos + página
  // inicial do perfil) só deve acontecer no primeiro show da sessão.
  if (window._appJaIniciado) return;
  window._appJaIniciado = true;

  // ERP (U3): o login começa sempre no módulo Suprimentos (a navegação abaixo
  // cai numa página do Suprimentos). O usuário troca de módulo pelo seletor.
  const _navShell = document.getElementById('sidebar');
  if (_navShell) _navShell.dataset.mod = 'suprimentos';
  document.querySelectorAll('.modulo-btn').forEach(b =>
    b.classList.toggle('ativo', b.dataset.mod === 'suprimentos'));

  if (isAdminLevel) {
    goPage('dashboard');
    restaurarEstadoPaineis();
    loadPendingCount();
    loadDashboard();
    loadAjustesBadge();
  } else if (isFinanceiro) {
    goPage('var-solicitacoes');
  } else if (isCompras) {
    goPage('all-orders');
  } else if (isEstoque) {
    goPage('all-orders');
  } else if (isEscritorio) {
    goPage('var-solicitacoes');
  } else if (isCSL || isCoordCSL) {
    goPage('all-orders');
  } else {
    goPage('movement');
    const sel = document.getElementById('order-house');
    if (sel) { sel.value = currentUserData.house || ''; onOrderHouseChange(); }
    const mh = document.getElementById('mov-house');
    if (mh) mh.value = currentUserData.house || '';
  }

  // Tela inicial (escolha de módulo) por cima do app, 1x por sessão — o
  // módulo Suprimentos já foi montado na página certa do perfil acima;
  // se a pessoa clicar "Suprimentos" na tela inicial, entrarModuloInicio()
  // percebe que já está lá e só tira a tela de cima, sem renavegar.
  if (typeof mostrarTelaInicio === 'function') mostrarTelaInicio();
}

function populateHouseSelects() {
  const selects = ['order-house','filter-house','mov-house','cr-house','card-house','ajuste-casa'];
  selects.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = '<option value="">Selecione...</option>';
    CASAS.forEach(c => {
      const o = document.createElement('option');
      o.value = c; o.textContent = c;
      el.appendChild(o);
    });
  });
  const fh = document.getElementById('filter-house');
  if (fh) fh.querySelector('option').textContent = 'Todas as casas';
  const crh = document.getElementById('cr-house');
  if (crh) crh.querySelector('option').textContent = 'Todas as casas';

  // Populate city selects (prices page + manage houses form)
  ['price-city', 'new-house-city'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const current = el.value;
    el.innerHTML = '<option value="">Selecione a cidade...</option>';
    CIDADES.forEach(c => {
      const o = document.createElement('option'); o.value = c; o.textContent = c;
      el.appendChild(o);
    });
    if (current) el.value = current;
  });

  // Populate percapita house select (sempre recarrega para incluir novas casas)
  const pch = document.getElementById('pc-house');
  if (pch) {
    const current = pch.value;
    pch.innerHTML = '<option value="">Selecione a casa...</option>';
    CASAS.forEach(c => {
      const o = document.createElement('option'); o.value = c; o.textContent = c;
      pch.appendChild(o);
    });
    if (current) pch.value = current;
  }

  // Set today's date for movement
  const md = document.getElementById('mov-date');
  if (md) md.value = new Date().toISOString().slice(0,10);

  // Pre-select user house for movement
  if (currentUserData?.house) {
    const mh = document.getElementById('mov-house');
    if (mh) {
      mh.value = currentUserData.house;
      // Bloqueia seleção de casa para perfil usuário
      if ((currentUserData.role || 'usuario') === 'usuario') {
        mh.disabled = true;
      }
    }
  }
}

