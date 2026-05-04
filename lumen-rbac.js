// ═══════════════════════════════════════════════════════════════════
//  LUMEN ESTOQUE — MÓDULO RBAC + AUDIT LOG
//  Arquivo: lumen-rbac.js
//  Versão:  1.0.0
//
//  INSTRUÇÕES DE USO:
//  1. Faça upload deste arquivo junto com o index.html (mesma pasta)
//  2. No index.html, adicione ANTES do </body>:
//     <script src="lumen-rbac.js"></script>
//  3. Configure os perfis dos usuários no Firestore (ver tutorial)
// ═══════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// 📋  DEFINIÇÃO DOS PERFIS E PERMISSÕES
// ─────────────────────────────────────────────

const PERFIS = {
  admin: {
    label: '👑 Administrador',
    cor: '#7B3FE4',
    descricao: 'Acesso total ao sistema',
    permissoes: [
      'ver_dashboard', 'ver_pedidos', 'criar_pedido', 'editar_pedido', 'excluir_pedido',
      'aprovar_pedido', 'ver_estoque', 'editar_estoque', 'ver_financeiro', 'editar_financeiro',
      'ver_fornecedores', 'editar_fornecedores', 'ver_relatorios', 'gerenciar_usuarios',
      'gerenciar_casas', 'gerenciar_categorias', 'ver_previsao_ia', 'aprovar_orcamento',
      'ver_audit_log', 'exportar_dados'
    ]
  },
  comprador: {
    label: '🛒 Comprador',
    cor: '#2B9FA8',
    descricao: 'Gerencia pedidos e fornecedores',
    permissoes: [
      'ver_dashboard', 'ver_pedidos', 'criar_pedido', 'editar_pedido',
      'aprovar_pedido', 'ver_estoque', 'ver_financeiro', 'editar_financeiro',
      'ver_fornecedores', 'editar_fornecedores', 'ver_relatorios',
      'ver_previsao_ia', 'aprovar_orcamento', 'exportar_dados'
    ]
  },
  gestor: {
    label: '📊 Gestor',
    cor: '#1A7A44',
    descricao: 'Visualiza e aprova, sem editar dados-mestre',
    permissoes: [
      'ver_dashboard', 'ver_pedidos', 'aprovar_pedido',
      'ver_estoque', 'ver_financeiro', 'ver_fornecedores',
      'ver_relatorios', 'ver_previsao_ia', 'aprovar_orcamento', 'exportar_dados'
    ]
  },
  solicitante: {
    label: '📝 Solicitante',
    cor: '#D4890A',
    descricao: 'Apenas cria e acompanha seus pedidos',
    permissoes: [
      'ver_dashboard', 'ver_pedidos', 'criar_pedido', 'ver_estoque'
    ]
  },
  viewer: {
    label: '👁️ Visualizador',
    cor: '#888888',
    descricao: 'Apenas consulta, sem criar nem editar',
    permissoes: [
      'ver_dashboard', 'ver_pedidos', 'ver_estoque', 'ver_relatorios'
    ]
  }
};

// Dados do usuário atual (preenchido após login)
window.currentUserRole = null;
window.currentUserPermissions = [];

// ─────────────────────────────────────────────
// 🔐  FUNÇÕES DE VERIFICAÇÃO DE PERMISSÃO
// ─────────────────────────────────────────────

/**
 * Verifica se o usuário atual tem uma permissão específica.
 * Uso: if (temPermissao('aprovar_pedido')) { ... }
 */
function temPermissao(permissao) {
  return window.currentUserPermissions.includes(permissao);
}

/**
 * Bloqueia execução se o usuário não tiver permissão.
 * Mostra um toast de erro e retorna false.
 */
function exigirPermissao(permissao, acao) {
  if (!temPermissao(permissao)) {
    showToast(`⛔ Sem permissão para ${acao || permissao}. Contate o administrador.`);
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────
// 👤  CARREGAMENTO DO PERFIL DO USUÁRIO
// ─────────────────────────────────────────────

/**
 * Carrega o perfil do usuário do Firestore e configura as permissões.
 * Chamado automaticamente após o login.
 */
async function carregarPerfilUsuario(uid) {
  try {
    const snap = await db.collection('usuarios_perfis').doc(uid).get();

    if (!snap.exists) {
      // Usuário sem perfil definido → acesso mínimo (viewer)
      window.currentUserRole = 'viewer';
      window.currentUserPermissions = [...PERFIS.viewer.permissoes];
      console.warn('[RBAC] Perfil não encontrado para uid:', uid, '— aplicando perfil viewer');
    } else {
      const dados = snap.data();
      const perfil = dados.perfil || 'viewer';
      window.currentUserRole = perfil;
      window.currentUserPermissions = dados.permissoesCustom
        ? [...dados.permissoesCustom]
        : [...(PERFIS[perfil]?.permissoes || PERFIS.viewer.permissoes)];

      console.log('[RBAC] Perfil carregado:', perfil, '— Permissões:', window.currentUserPermissions.length);
    }

    // Aplica restrições visuais na interface
    aplicarRestricoesVisuais();

  } catch (e) {
    console.error('[RBAC] Erro ao carregar perfil:', e);
    window.currentUserRole = 'viewer';
    window.currentUserPermissions = [...PERFIS.viewer.permissoes];
  }
}

// ─────────────────────────────────────────────
// 🎨  RESTRIÇÕES VISUAIS NA SIDEBAR E BOTÕES
// ─────────────────────────────────────────────

/**
 * Oculta/mostra itens do menu e botões com base no perfil.
 * Adicione data-permissao="nome_da_permissao" nos elementos HTML.
 */
function aplicarRestricoesVisuais() {
  // Oculta itens de menu sem permissão
  document.querySelectorAll('[data-permissao]').forEach(el => {
    const permissao = el.getAttribute('data-permissao');
    if (!temPermissao(permissao)) {
      el.style.display = 'none';
    }
  });

  // Desabilita botões sem permissão (alternativa: data-permissao-btn)
  document.querySelectorAll('[data-permissao-btn]').forEach(el => {
    const permissao = el.getAttribute('data-permissao-btn');
    if (!temPermissao(permissao)) {
      el.disabled = true;
      el.title = 'Sem permissão para esta ação';
      el.style.opacity = '0.4';
      el.style.cursor = 'not-allowed';
    }
  });

  // Mostra badge do perfil na topbar
  mostrarBadgePerfil();

  // Aplica restrições específicas por perfil
  if (!temPermissao('gerenciar_usuarios')) {
    ocultarItemSidebar('manage-users');
  }
  if (!temPermissao('gerenciar_casas')) {
    ocultarItemSidebar('manage-houses');
  }
  if (!temPermissao('ver_financeiro')) {
    ocultarItemSidebar('financeiro');
  }
  if (!temPermissao('ver_audit_log')) {
    ocultarItemSidebar('audit-log');
  }
  if (!temPermissao('ver_previsao_ia')) {
    ocultarItemSidebar('previsao');
  }
  if (!temPermissao('aprovar_orcamento')) {
    ocultarItemSidebar('orc-pendentes');
  }
}

function ocultarItemSidebar(pageId) {
  document.querySelectorAll(`.sidebar-item[data-page="${pageId}"]`).forEach(el => {
    el.style.display = 'none';
  });
}

function mostrarBadgePerfil() {
  const perfil = PERFIS[window.currentUserRole];
  if (!perfil) return;

  // Insere badge na topbar, ao lado do nome do usuário
  const userEl = document.querySelector('.topbar-user');
  if (userEl && !document.getElementById('badge-perfil')) {
    const badge = document.createElement('span');
    badge.id = 'badge-perfil';
    badge.style.cssText = `
      font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 20px;
      background: ${perfil.cor}33; color: ${perfil.cor};
      border: 1px solid ${perfil.cor}55; margin-left: 6px;
    `;
    badge.textContent = perfil.label;
    userEl.after(badge);
  }
}

// ─────────────────────────────────────────────
// 📜  AUDIT LOG — REGISTRO DE AÇÕES
// ─────────────────────────────────────────────

/**
 * Registra uma ação no log de auditoria do Firestore.
 *
 * @param {string} acao       - Ex: 'criar_pedido', 'aprovar_pedido', 'editar_produto'
 * @param {string} descricao  - Ex: 'Pedido LM-2025-001 criado para Dom Bosco'
 * @param {object} dadosExtra - Qualquer dado adicional relevante (id, antes, depois, etc.)
 */
async function registrarAuditoria(acao, descricao, dadosExtra = {}) {
  try {
    const usuario = window.currentUserData || {};
    const entrada = {
      acao,
      descricao,
      uid:        firebase.auth().currentUser?.uid || 'desconhecido',
      nome:       usuario.name || usuario.email || 'desconhecido',
      email:      usuario.email || '',
      perfil:     window.currentUserRole || 'desconhecido',
      timestamp:  firebase.firestore.FieldValue.serverTimestamp(),
      dataHora:   new Date().toISOString(),
      userAgent:  navigator.userAgent.substring(0, 120),
      ...dadosExtra
    };

    await db.collection('audit_log').add(entrada);
  } catch (e) {
    // Nunca deixar falha no log quebrar o fluxo principal
    console.warn('[AUDIT] Falha ao registrar auditoria:', e.message);
  }
}

// ─────────────────────────────────────────────
// 📊  PÁGINA DE AUDIT LOG (para admins)
// ─────────────────────────────────────────────

async function initAuditLogPage() {
  if (!temPermissao('ver_audit_log')) {
    document.getElementById('page-audit-log').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔒</div>
        <div class="empty-state-title">Acesso restrito</div>
        <div class="empty-state-desc">Apenas administradores podem visualizar o log de auditoria.</div>
      </div>`;
    return;
  }
  await carregarAuditLog();
}

async function carregarAuditLog(filtros = {}) {
  const tbody = document.getElementById('audit-tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;">
    <div class="spinner spinner-dark"></div><br>Carregando log...
  </td></tr>`;

  try {
    let query = db.collection('audit_log').orderBy('timestamp', 'desc').limit(200);

    if (filtros.usuario)  query = query.where('email', '==', filtros.usuario);
    if (filtros.acao)     query = query.where('acao', '==', filtros.acao);

    const snap = await query.get();
    const registros = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (registros.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted);">
        Nenhum registro encontrado.
      </td></tr>`;
      return;
    }

    tbody.innerHTML = registros.map(r => {
      const dt = r.timestamp?.toDate
        ? r.timestamp.toDate().toLocaleString('pt-BR')
        : (r.dataHora ? new Date(r.dataHora).toLocaleString('pt-BR') : '—');

      const acaoColor = {
        criar_pedido: 'var(--ok)',
        excluir_pedido: 'var(--danger)',
        aprovar_pedido: 'var(--lumen)',
        login: '#7B3FE4',
        logout: '#888',
        editar_produto: 'var(--warn)',
      };
      const cor = acaoColor[r.acao] || 'var(--text-muted)';
      const perfilInfo = PERFIS[r.perfil] || { label: r.perfil, cor: '#888' };

      return `<tr>
        <td style="font-size:11px;color:var(--text-muted);white-space:nowrap;">${dt}</td>
        <td>
          <div style="font-weight:600;font-size:13px;">${r.nome || '—'}</div>
          <div style="font-size:11px;color:var(--text-muted);">${r.email || ''}</div>
        </td>
        <td>
          <span style="background:${perfilInfo.cor}22;color:${perfilInfo.cor};
            border:1px solid ${perfilInfo.cor}44;padding:2px 8px;border-radius:20px;
            font-size:11px;font-weight:700;">${perfilInfo.label}</span>
        </td>
        <td>
          <span style="color:${cor};font-weight:700;font-size:12px;">${r.acao}</span>
        </td>
        <td style="font-size:12px;max-width:280px;">${r.descricao || '—'}</td>
        <td style="font-size:11px;color:var(--text-muted);">${r.userAgent?.substring(0,40) || '—'}</td>
      </tr>`;
    }).join('');

  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--danger);">
      Erro ao carregar: ${e.message}
    </td></tr>`;
  }
}

async function exportarAuditLogExcel() {
  if (!temPermissao('ver_audit_log')) return;
  const snap = await db.collection('audit_log').orderBy('timestamp','desc').limit(1000).get();
  const rows = [['Data/Hora','Usuário','Email','Perfil','Ação','Descrição']];
  snap.docs.forEach(d => {
    const r = d.data();
    const dt = r.timestamp?.toDate ? r.timestamp.toDate().toLocaleString('pt-BR') : r.dataHora || '';
    rows.push([dt, r.nome||'', r.email||'', r.perfil||'', r.acao||'', r.descricao||'']);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 20 }, { wch: 22 }, { wch: 28 }, { wch: 14 }, { wch: 22 }, { wch: 50 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Audit Log');
  XLSX.writeFile(wb, 'LM-AuditLog-' + new Date().toISOString().slice(0,10) + '.xlsx');
  showToast('✅ Audit log exportado!');
}

// ─────────────────────────────────────────────
// 👥  GERENCIAMENTO DE USUÁRIOS E PERFIS
// ─────────────────────────────────────────────

async function carregarUsuariosAdmin() {
  if (!temPermissao('gerenciar_usuarios')) {
    showToast('⛔ Sem permissão para gerenciar usuários.');
    return;
  }

  const tbody = document.getElementById('usuarios-tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:32px;">
    <div class="spinner spinner-dark"></div></td></tr>`;

  try {
    // Busca todos os registros de usuários (cadastros feitos no sistema)
    const snapUsers = await db.collection('users').get();
    const snapPerfis = await db.collection('usuarios_perfis').get();

    const perfisMap = {};
    snapPerfis.docs.forEach(d => { perfisMap[d.id] = d.data(); });

    const usuarios = snapUsers.docs.map(d => ({ id: d.id, ...d.data() }));

    if (usuarios.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted);">
        Nenhum usuário encontrado.</td></tr>`;
      return;
    }

    tbody.innerHTML = usuarios.map(u => {
      const uid = u.uid || u.id;
      const perfilDados = perfisMap[uid] || {};
      const perfilKey = perfilDados.perfil || 'viewer';
      const perfil = PERFIS[perfilKey] || PERFIS.viewer;

      const optionsPerfis = Object.entries(PERFIS)
        .map(([k, p]) => `<option value="${k}" ${k === perfilKey ? 'selected' : ''}>${p.label}</option>`)
        .join('');

      return `<tr>
        <td>
          <div style="font-weight:600;">${u.name || u.displayName || '—'}</div>
          <div style="font-size:11px;color:var(--text-muted);">${u.email || ''}</div>
        </td>
        <td>
          <select class="form-select" style="font-size:12px;padding:5px 8px;"
            onchange="salvarPerfilUsuario('${uid}', this.value, '${u.name||u.email||''}')">
            ${optionsPerfis}
          </select>
        </td>
        <td>
          <span style="font-size:11px;background:${perfil.cor}22;color:${perfil.cor};
            border:1px solid ${perfil.cor}44;padding:2px 8px;border-radius:20px;">
            ${perfil.descricao}
          </span>
        </td>
        <td style="font-size:11px;color:var(--text-muted);">${u.status || 'ativo'}</td>
        <td>
          <button class="btn btn-secondary btn-sm"
            onclick="verHistoricoUsuario('${uid}', '${u.name||u.email||''}')">
            Ver histórico
          </button>
        </td>
      </tr>`;
    }).join('');

  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--danger);">
      Erro: ${e.message}</td></tr>`;
  }
}

async function salvarPerfilUsuario(uid, novoPerfil, nomeUsuario) {
  if (!temPermissao('gerenciar_usuarios')) return;
  try {
    await db.collection('usuarios_perfis').doc(uid).set({
      perfil: novoPerfil,
      atualizadoPor: window.currentUserData?.name || '',
      atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await registrarAuditoria(
      'alterar_perfil_usuario',
      `Perfil de "${nomeUsuario}" alterado para ${PERFIS[novoPerfil]?.label || novoPerfil}`,
      { uid_alvo: uid, novo_perfil: novoPerfil }
    );

    showToast(`✅ Perfil de ${nomeUsuario} atualizado para ${PERFIS[novoPerfil]?.label}!`);
  } catch (e) {
    showToast('Erro ao salvar perfil: ' + e.message);
  }
}

async function verHistoricoUsuario(uid, nome) {
  showToast(`Buscando histórico de ${nome}...`);
  const snap = await db.collection('audit_log')
    .where('uid', '==', uid)
    .orderBy('timestamp', 'desc')
    .limit(50)
    .get();

  if (snap.empty) {
    showToast(`Nenhuma ação registrada para ${nome}.`);
    return;
  }

  const acoes = snap.docs.map(d => {
    const r = d.data();
    const dt = r.timestamp?.toDate ? r.timestamp.toDate().toLocaleString('pt-BR') : '—';
    return `${dt} — ${r.acao}: ${r.descricao}`;
  }).join('\n');

  alert(`Histórico de ${nome} (últimas 50 ações):\n\n${acoes}`);
}

// ─────────────────────────────────────────────
// 🔌  INTERCEPTORES — AUDIT LOG AUTOMÁTICO
// ─────────────────────────────────────────────
// Substitui funções existentes para adicionar registro automático.
// Cole estas chamadas dentro das suas funções existentes:

// Em doLogin(), após login bem-sucedido:
//   registrarAuditoria('login', `Login realizado`);

// Em doLogout():
//   registrarAuditoria('logout', `Logout realizado`);

// Em submitOrder() ou saveOrder(), após salvar:
//   registrarAuditoria('criar_pedido', `Pedido ${code} criado para ${house}`, { pedidoId: id, casa: house });

// Em aprovarPedido() ou updateOrderStatus():
//   registrarAuditoria('aprovar_pedido', `Pedido ${code} — status alterado para ${novoStatus}`, { pedidoId: id });

// Em deleteProduct():
//   registrarAuditoria('excluir_produto', `Produto "${nome}" removido da categoria ${cat}`, { prodId: id });

// Em saveMovement():
//   registrarAuditoria('movimentacao_estoque', `${tipo} de ${qtd} ${unidade} de ${produto} em ${casa}`, { tipo, casa });

// ─────────────────────────────────────────────
// 🚀  INICIALIZAÇÃO
// ─────────────────────────────────────────────

/**
 * Chame esta função após o firebase.auth().onAuthStateChanged
 * detectar que o usuário está logado.
 *
 * Exemplo no seu código existente:
 *
 *   firebase.auth().onAuthStateChanged(async (user) => {
 *     if (user) {
 *       // ... seu código existente de carregamento ...
 *       await inicializarRBAC(user.uid);  // ← ADICIONE ESTA LINHA
 *     }
 *   });
 */
async function inicializarRBAC(uid) {
  await carregarPerfilUsuario(uid);
  console.log('[RBAC] Sistema de permissões ativo. Perfil:', window.currentUserRole);
}

// Exporta funções para uso global
window.temPermissao = temPermissao;
window.exigirPermissao = exigirPermissao;
window.registrarAuditoria = registrarAuditoria;
window.inicializarRBAC = inicializarRBAC;
window.carregarUsuariosAdmin = carregarUsuariosAdmin;
window.salvarPerfilUsuario = salvarPerfilUsuario;
window.initAuditLogPage = initAuditLogPage;
window.carregarAuditLog = carregarAuditLog;
window.exportarAuditLogExcel = exportarAuditLogExcel;
window.PERFIS = PERFIS;

console.log('[LUMEN RBAC] Módulo carregado. Versão 1.0.0');
