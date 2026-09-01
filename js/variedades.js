// Extraído de index.html (bloco Módulo Variedades) em 2026-07-27
// ═══════════════════════════════════════════════════════════
//  MÓDULO: COMPRAS DE VARIEDADES
// ═══════════════════════════════════════════════════════════

const VAR_SETORES_PADRAO = [
  'Relacionamento','Marketing','Compras','Logística','Almoxarifado',
  'Selo Lumen','RH/DP','Financeiro','Casas/CSL','Direção','Manutenção'
];

let varPropostaSelecionadas = new Set();

// ── Popula selects de setor em toda a página ─────────────
async function populateVarSetorSelects() {
  const setores = await getVarSetores();
  const ids = ['var-setor','var-filtro-setor','var-hist-setor','edit-var-setor'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const val = el.value;
    el.innerHTML = '<option value="">Todos os setores</option>';
    if (id === 'var-setor' || id === 'edit-var-setor') el.innerHTML = '<option value="">Selecione o setor...</option>';
    setores.forEach(s => {
      const o = document.createElement('option');
      o.value = s; o.textContent = s;
      el.appendChild(o);
    });
    if (val) el.value = val;
  });
}

async function getVarSetores() {
  try {
    const snap = await db.collection('var_setores').orderBy('nome').get();
    if (snap.empty) {
      // Seed padrão na primeira vez
      const batch = db.batch();
      VAR_SETORES_PADRAO.forEach(nome => {
        const ref = db.collection('var_setores').doc();
        batch.set(ref, { nome, criadoEm: firebase.firestore.FieldValue.serverTimestamp() });
      });
      await batch.commit();
      return VAR_SETORES_PADRAO;
    }
    return snap.docs.map(d => d.data().nome);
  } catch(e) { return VAR_SETORES_PADRAO; }
}

// ── Gerar código sequencial ──────────────────────────────
// Reserva N códigos sequenciais numa única transação (evita colisão quando
// vários usuários enviam solicitações ao mesmo tempo — o get()+set() antigo,
// sem transação, tinha essa brecha, que ficava mais exposta agora que um único
// envio pode gerar vários códigos em sequência).
async function gerarCodigosVarLote(n) {
  // Usa a SEQUENCE do Postgres via função SQL proximo_codigo_var() — atômica,
  // sem colisão entre usuários simultâneos (substitui o runTransaction do Firestore).
  const codigos = [];
  for (let i = 0; i < n; i++) {
    const { data, error } = await window._sb.rpc('proximo_codigo_var');
    if (error) throw error;
    codigos.push(data);
  }
  return codigos;
}

async function gerarCodigoVar() {
  const codigos = await gerarCodigosVarLote(1);
  return codigos[0];
}

// ── STATUS automático por fluxo ──────────────────────────
function proximoStatusVar(statusAtual, acao) {
  const fluxo = {
    pendente:         { avancar: 'em_proposta'      },
    em_proposta:      { avancar: 'pedido_liberado'  },
    pedido_liberado:  { avancar: 'compra_realizada' },
    compra_realizada: { avancar: 'concluido'        },
    comprada:         { avancar: 'concluido'        },
    entregue:         { avancar: 'concluido'        },
  };
  return fluxo[statusAtual]?.[acao] || statusAtual;
}

// ── Abrir modal nova solicitação ─────────────────────────
const VAR_MAX_ITENS = 10;
const VAR_UNIDADES_OPTIONS = [
  ['un','un (unidade)'],['kg','kg'],['g','g'],['L','L (litro)'],['ml','ml'],
  ['m','m (metro)'],['m²','m²'],['cx','cx (caixa)'],['fd','fd (fardo)'],
  ['pc','pc (peça)'],['sc','sc (saco)'],['par','par'],['rolo','rolo'],
];

function _varItemRowHTML() {
  const opts = VAR_UNIDADES_OPTIONS.map(([v,l]) => `<option value="${v}">${l}</option>`).join('');
  return `
    <div class="var-item-row" style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 30px;gap:8px;margin-bottom:8px;align-items:center;">
      <input type="text" class="form-input var-item-material" placeholder="Descreva o material" maxlength="200">
      <input type="number" class="form-input var-item-quantidade" placeholder="Ex: 10" min="0.01" step="any">
      <select class="form-select var-item-unidade">${opts}</select>
      <input type="number" class="form-input var-item-valor" placeholder="0,00" step="0.01" min="0">
      <button type="button" class="btn btn-outline btn-sm" style="color:var(--danger);border-color:var(--danger);padding:6px;" onclick="removerVarItemRow(this)" title="Remover item">🗑</button>
    </div>`;
}

function adicionarVarItemRow() {
  const lista = document.getElementById('var-itens-lista');
  const n = lista.children.length;
  if (n >= VAR_MAX_ITENS) { showToast(`Máximo de ${VAR_MAX_ITENS} itens por solicitação.`); return; }
  lista.insertAdjacentHTML('beforeend', _varItemRowHTML());
  atualizarVarItensUI();
}

function removerVarItemRow(btn) {
  const lista = document.getElementById('var-itens-lista');
  if (lista.children.length <= 1) { showToast('A solicitação precisa de pelo menos 1 item.'); return; }
  btn.closest('.var-item-row').remove();
  atualizarVarItensUI();
}

function atualizarVarItensUI() {
  const lista = document.getElementById('var-itens-lista');
  const n = lista.children.length;
  const countEl = document.getElementById('var-itens-count');
  if (countEl) countEl.textContent = `${n} de ${VAR_MAX_ITENS} itens`;
  const addBtn = document.getElementById('btn-add-var-item');
  if (addBtn) addBtn.style.display = n >= VAR_MAX_ITENS ? 'none' : '';
}

async function abrirModalNovaVar() {
  await populateVarSetorSelects();
  document.getElementById('var-setor').value = '';
  document.getElementById('var-prioridade').value = 'normal';
  document.getElementById('var-obs').value = '';
  document.getElementById('var-data-limite').value = '';
  document.getElementById('var-forn-empresa').value = '';
  document.getElementById('var-forn-atendente').value = '';
  document.getElementById('var-forn-tel').value = '';
  // Reseta a lista de itens pra 1 linha em branco
  document.getElementById('var-itens-lista').innerHTML = _varItemRowHTML();
  atualizarVarItensUI();
  document.getElementById('modal-nova-var').classList.remove('hidden');
}

// ── Salvar nova solicitação — cria 1 documento por item, todos ligados
// por um grupoId comum (mesmo lote), pra continuar cotando/avançando cada
// item separadamente igual já funciona hoje ──────────────────────────
async function salvarNovaVar() {
  if (!currentUser || !auth.currentUser) {
    showToast('⚠️ Sua sessão expirou. Faça login novamente antes de continuar.');
    return;
  }
  const setor       = document.getElementById('var-setor').value;
  const prioridade  = document.getElementById('var-prioridade').value;
  const obs         = document.getElementById('var-obs').value.trim();
  const dataLimite  = document.getElementById('var-data-limite').value;
  const fornecedor  = {
    empresa:   document.getElementById('var-forn-empresa').value.trim(),
    atendente: document.getElementById('var-forn-atendente').value.trim(),
    tel:       document.getElementById('var-forn-tel').value.trim(),
  };
  if (!setor) { showToast('Selecione o setor!'); return; }
  if (!dataLimite) { showToast('Informe a data de recebimento!'); return; }

  // Coleta e valida cada linha de item
  const linhas = Array.from(document.querySelectorAll('#var-itens-lista .var-item-row'));
  const itens = [];
  for (let i = 0; i < linhas.length; i++) {
    const row = linhas[i];
    const material    = row.querySelector('.var-item-material').value.trim();
    const quantidade  = parseFloat(row.querySelector('.var-item-quantidade').value) || 0;
    const unidade     = row.querySelector('.var-item-unidade').value || 'un';
    const valorEstimado = parseFloat(row.querySelector('.var-item-valor').value) || 0;
    if (!material) { showToast(`Item ${i+1}: informe o material.`); row.querySelector('.var-item-material').focus(); return; }
    if (!quantidade || quantidade <= 0) { showToast(`Item ${i+1} (${material}): informe a quantidade.`); row.querySelector('.var-item-quantidade').focus(); return; }
    itens.push({ material, quantidade, unidade, valorEstimado });
  }
  if (itens.length === 0) { showToast('Adicione pelo menos 1 item.'); return; }

  const btn = document.getElementById('btn-salvar-var');
  btn.disabled = true; btn.textContent = 'Salvando...';

  try {
    const codigos = await gerarCodigosVarLote(itens.length);
    const grupoId = itens.length > 1
      ? (db.collection('var_solicitacoes').doc().id) // só usado como chave de agrupamento visual
      : null;

    const batch = db.batch();
    itens.forEach((item, i) => {
      const ref = db.collection('var_solicitacoes').doc();
      batch.set(ref, {
        codigo: codigos[i],
        grupoId,
        grupoTotal: itens.length,
        setor,
        prioridade,
        material: item.material,
        quantidade: item.quantidade,
        unidade: item.unidade,
        obs,
        dataLimite,
        valorEstimado: item.valorEstimado,
        fornecedor,
        status: 'pendente',
        solicitanteUid:  currentUserData.uid  || currentUser?.uid || '',
        solicitanteNome: currentUserData.name || '',
        criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();

    closeModal('modal-nova-var');
    showToast(itens.length > 1 ? `✅ ${itens.length} solicitações registradas com sucesso!` : '✅ Solicitação registrada com sucesso!');

    if (window.guestMode) {
      mostrarConfirmacaoGuest(itens, codigos, setor, prioridade, obs, dataLimite);
    } else {
      loadVarSolicitacoes();
      atualizarBadgeVar();
    }
  } catch(e) {
    showToast('Erro ao salvar: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Enviar Solicitação';
  }
}

// ── Confirmação para convidados (sem acesso ao SELECT do DB) ──
function mostrarConfirmacaoGuest(itens, codigos, setor, prioridade, obs, dataLimite) {
  const inicio = document.getElementById('guest-var-inicio');
  const confirmacao = document.getElementById('guest-var-confirmacao');
  const lista = document.getElementById('guest-var-lista-confirmacao');
  if (!confirmacao || !lista) return;

  const prioLabel = { urgente: '🔴 Urgente', alta: '🟠 Alta', normal: '🟡 Normal', baixa: '⚪ Baixa' };
  const dataFmt = dataLimite ? new Date(dataLimite + 'T00:00:00').toLocaleDateString('pt-BR') : '—';

  lista.innerHTML = itens.map((item, i) => `
    <div style="background:var(--card-bg,#1a1a2e);border:1px solid var(--border,#333);border-radius:10px;padding:14px 16px;margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <span style="font-family:monospace;font-size:13px;font-weight:700;color:var(--lumen,#7c3aed);">${codigos[i]}</span>
        <span style="font-size:11px;padding:2px 8px;border-radius:99px;background:#22c55e22;color:#22c55e;">pendente</span>
      </div>
      <div style="font-size:14px;font-weight:600;margin-bottom:4px;">${item.material}</div>
      <div style="font-size:12px;color:var(--text-muted,#888);display:flex;gap:12px;flex-wrap:wrap;">
        <span>Qtd: <b>${item.quantidade} ${item.unidade}</b></span>
        <span>Setor: <b>${setor || '—'}</b></span>
        <span>Prioridade: <b>${prioLabel[prioridade] || prioridade}</b></span>
        ${dataLimite ? `<span>Data limite: <b>${dataFmt}</b></span>` : ''}
        ${item.valorEstimado ? `<span>Valor est.: <b>R$ ${item.valorEstimado.toFixed(2)}</b></span>` : ''}
      </div>
      ${obs ? `<div style="font-size:12px;color:var(--text-muted,#888);margin-top:4px;">Obs: ${obs}</div>` : ''}
    </div>
  `).join('');

  if (inicio) inicio.style.display = 'none';
  confirmacao.style.display = 'block';
}

function guestVarNovaSolicitacao() {
  const inicio = document.getElementById('guest-var-inicio');
  const confirmacao = document.getElementById('guest-var-confirmacao');
  if (inicio) inicio.style.display = 'block';
  if (confirmacao) confirmacao.style.display = 'none';
}

// ── Carregar solicitações ─────────────────────────────────
async function loadVarSolicitacoes() {
  await populateVarSetorSelects();
  const listEl = document.getElementById('var-sol-list');
  const countEl = document.getElementById('var-sol-count');
  if (!listEl) return;

  // Só mostra o spinner no primeiro carregamento: em atualizações automáticas
  // (onSnapshot a cada 30s) trocar o conteúdo por um placeholder colapsa a
  // altura da lista e "puxa" a página pra cima — parece o scroll se mexendo
  // sozinho enquanto o usuário está rolando.
  if (!listEl.dataset.loaded) {
    listEl.innerHTML = '<div class="loading-state"><div class="spinner spinner-dark"></div>Carregando...</div>';
  }

  const role = currentUserData?.role || 'usuario';
  const isEscritorio = role === 'escritorio';

  try {
    let query = db.collection('var_solicitacoes').orderBy('criadoEm','desc');
    const snap = await query.get();
    let docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (isEscritorio) {
      const uid = currentUserData.uid || currentUser?.uid || '';
      docs = docs.filter(d => d.solicitanteUid === uid);
    }

    // Filtros
    const fSetor = document.getElementById('var-filtro-setor')?.value;
    const fStatus = document.getElementById('var-filtro-status')?.value;
    const fPrior = document.getElementById('var-filtro-prioridade')?.value;
    if (fSetor)  docs = docs.filter(d => d.setor === fSetor);
    if (fStatus) docs = docs.filter(d => d.status === fStatus || (fStatus === 'compra_realizada' && d.status === 'comprada'));
    if (fPrior)  docs = docs.filter(d => d.prioridade === fPrior);
    if (_varFiltroGrupo) docs = docs.filter(d => d.grupoId === _varFiltroGrupo);

    if (countEl) {
      countEl.innerHTML = docs.length + ' solicitação(ões)' + (_varFiltroGrupo
        ? ` <span class="badge badge-info" style="cursor:pointer;" onclick="limparFiltroGrupoVar()">📦 filtrando por lote — limpar ✕</span>`
        : '');
    }

    if (!docs.length) {
      listEl.dataset.loaded = '1';
      listEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-title">Nenhuma solicitação encontrada</div></div>';
      return;
    }

    const _isAdminLvl = ['admin','diretor','gerente','coordenador'].includes(role);
    const canAvancar = _isAdminLvl || ['compras','estoque'].includes(role);
    const canEditDelete = ['admin','diretor','gerente'].includes(role);

    const priorBadge = { normal: 'badge-gray', alta: 'badge-warn', urgente: 'badge-danger' };
    const priorLabel = { normal: '🟢 Normal', alta: '🟠 Alta', urgente: '🔴 Urgente' };
    const statusBadge = {
      pendente:'badge-warn', em_proposta:'badge-info',
      pedido_liberado:'badge-ok', compra_realizada:'badge-brand', comprada:'badge-brand', concluido:'badge-gray', entregue:'badge-gray', cancelado:'badge-danger'
    };
    const statusLabel = {
      pendente:'🟡 Pendente', em_proposta:'📋 Em Proposta',
      pedido_liberado:'🟢 Pedido Liberado',
      compra_realizada:'✅ Compra Realizada', comprada:'✅ Compra Realizada', concluido:'🏁 Concluído', entregue:'🏁 Concluído', cancelado:'⛔ Cancelado'
    };

    listEl.dataset.loaded = '1';
    listEl.innerHTML = docs.map(d => {
      const dt = d.dataLimite ? new Date(d.dataLimite + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
      const valor = d.valorEstimado > 0 ? 'R$ ' + d.valorEstimado.toLocaleString('pt-BR',{minimumFractionDigits:2}) : '—';
      const forn = d.fornecedor?.empresa ? `<span style="font-size:11px;color:var(--text-muted);">🏪 ${d.fornecedor.empresa}</span>` : '';
      const terminais = ['concluido','cancelado'];
      const btnAvancar = canAvancar && !terminais.includes(d.status) ?
        `<button class="btn btn-secondary btn-sm" onclick="avancarStatusVar('${d.id}','${d.status}')">▶ Avançar</button>` : '';
      const btnCancelar = canAvancar && !terminais.includes(d.status)
        ? `<button class="btn btn-danger btn-sm" onclick="cancelarVarSol('${d.id}')">⛔ Cancelar</button>` : '';
      const btnEditar = canEditDelete
        ? `<button class="btn btn-outline btn-sm" style="color:var(--warn);border-color:var(--warn);" onclick="abrirEditarVarSol('${d.id}')">✏️ Editar</button>` : '';
      const btnExcluir = canEditDelete
        ? `<button class="btn btn-danger btn-sm" onclick="excluirVarSol('${d.id}','${(d.codigo||'').replace(/'/g,"\\'")}')">🗑 Excluir</button>` : '';
      return `<div class="card" style="margin-bottom:10px;">
        <div class="card-body" style="padding:14px 18px;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
            <div style="flex:1;min-width:200px;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
                <span style="font-size:12px;font-weight:700;color:var(--lumen);">${d.codigo || '—'}</span>
                ${d.grupoId && d.grupoTotal > 1 ? `<span class="badge badge-info" title="Enviada junto com outros itens no mesmo pedido" style="cursor:pointer;" onclick="filtrarVarPorGrupo('${d.grupoId}')">📦 lote de ${d.grupoTotal}</span>` : ''}
                <span class="badge ${priorBadge[d.prioridade]||'badge-gray'}">${priorLabel[d.prioridade]||d.prioridade}</span>
                <span class="badge ${statusBadge[d.status]||'badge-gray'}">${statusLabel[d.status]||d.status}</span>
              </div>
              ${buildVarPipelineBar(d.status)}
              <div style="font-size:14px;font-weight:600;margin-bottom:4px;">${d.material}${d.quantidade ? `<span style="font-size:12px;font-weight:700;color:var(--lumen);margin-left:8px;background:var(--lumen-lt);padding:2px 8px;border-radius:6px;">${d.quantidade} ${d.unidade||'un'}</span>` : ''}</div>
              <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">
                🏢 ${d.setor} &nbsp;·&nbsp; 📅 Até ${dt} &nbsp;·&nbsp; 💰 ${valor}
              </div>
              ${d.obs ? `<div style="font-size:12px;color:var(--text-muted);font-style:italic;">"${d.obs}"</div>` : ''}
              ${forn}
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">
              <span style="font-size:11px;color:var(--text-muted);">por ${d.solicitanteNome||'—'}</span>
              <button class="btn btn-outline btn-sm" onclick="verVarSolicitacao('${d.id}')">👁 Ver</button>
              <button class="btn btn-outline btn-sm" style="color:var(--lumen);border-color:var(--lumen);" onclick="goPage('var-orcamento');setTimeout(()=>abrirModalOrcVar('${d.id}','${(d.codigo||'').replace(/'/g,"\\'")}','${(d.material||'').replace(/'/g,"\\'")}',${d.quantidade||1},'${d.unidade||'un'}'),400)">💲 Orçar</button>
              ${btnAvancar}
              ${btnCancelar}
              ${btnEditar}
              ${btnExcluir}
            </div>
          </div>
        </div>
      </div>`;
    }).join('');
  } catch(e) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-title">Erro ao carregar: ' + e.message + '</div></div>';
  }
}

async function avancarStatusVar(docId, statusAtual) {
  const novo = proximoStatusVar(statusAtual, 'avancar');
  if (novo === statusAtual) return;
  await db.collection('var_solicitacoes').doc(docId).update({
    status: novo,
    [`${novo}Em`]: firebase.firestore.FieldValue.serverTimestamp(),
    [`${novo}Por`]: currentUserData.name || '',
  });
  showToast('Status atualizado para: ' + novo.replace(/_/g,' '));
  loadVarSolicitacoes();
  atualizarBadgeVar();
}

async function cancelarVarSol(docId) {
  if (!confirm('Deseja cancelar esta solicitação?')) return;
  try {
    await db.collection('var_solicitacoes').doc(docId).update({
      status: 'cancelado',
      canceladoEm: firebase.firestore.FieldValue.serverTimestamp(),
      canceladoPor: currentUserData.name || '',
    });
    showToast('⛔ Solicitação cancelada.');
    loadVarSolicitacoes();
    atualizarBadgeVar();
  } catch(e) {
    showToast('Erro ao cancelar: ' + e.message);
  }
}

async function verVarSolicitacao(docId) {
  const snap = await db.collection('var_solicitacoes').doc(docId).get();
  if (!snap.exists) return;
  const d = snap.data();
  document.getElementById('modal-ver-var-title').textContent = 'Solicitação ' + (d.codigo||'—');
  const dt = d.dataLimite ? new Date(d.dataLimite+'T00:00:00').toLocaleDateString('pt-BR') : '—';
  document.getElementById('modal-ver-var-body').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
      <div><div class="form-label">Setor</div><div style="font-size:14px;">${d.setor}</div></div>
      <div><div class="form-label">Prioridade</div><div style="font-size:14px;">${d.prioridade}</div></div>
      <div><div class="form-label">Status</div><div style="font-size:14px;">${d.status?.replace('_',' ')}</div></div>
      <div><div class="form-label">Data limite</div><div style="font-size:14px;">${dt}</div></div>
    </div>
    <div class="form-group"><div class="form-label">Material</div><div style="font-size:14px;">${d.material}</div></div>
    ${d.quantidade ? `<div class="form-group"><div class="form-label">Quantidade</div><div style="font-size:16px;font-weight:700;color:var(--lumen);">${d.quantidade} ${d.unidade||'un'}</div></div>` : ''}
    ${d.obs ? `<div class="form-group"><div class="form-label">Observação</div><div style="font-size:13px;color:var(--text-muted);">${d.obs}</div></div>` : ''}
    ${d.valorEstimado > 0 ? `<div class="form-group"><div class="form-label">Valor Estimado</div><div style="font-size:14px;font-weight:600;color:var(--lumen);">R$ ${d.valorEstimado.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div></div>` : ''}
    ${d.fornecedor?.empresa ? `<div style="border:1px solid var(--border);border-radius:8px;padding:12px;">
      <div class="form-label" style="margin-bottom:8px;">Fornecedor sugerido</div>
      <div>🏪 ${d.fornecedor.empresa}</div>
      ${d.fornecedor.atendente ? `<div>👤 ${d.fornecedor.atendente}</div>` : ''}
      ${d.fornecedor.tel ? `<div>📞 ${d.fornecedor.tel}</div>` : ''}
    </div>` : ''}
    <div style="margin-top:12px;font-size:11px;color:var(--text-muted);">Solicitado por ${d.solicitanteNome||'—'}</div>
  `;
  document.getElementById('modal-ver-var').classList.remove('hidden');
}

let _varFiltroGrupo = null;

function filtrarVarPorGrupo(grupoId) {
  _varFiltroGrupo = grupoId;
  loadVarSolicitacoes();
}

function limparFiltroGrupoVar() {
  _varFiltroGrupo = null;
  loadVarSolicitacoes();
}

function resetVarFiltros() {
  ['var-filtro-setor','var-filtro-status','var-filtro-prioridade'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  _varFiltroGrupo = null;
  loadVarSolicitacoes();
}

async function atualizarBadgeVar() {
  try {
    const snap = await db.collection('var_solicitacoes')
      .where('status','in',['pendente','em_proposta','pedido_liberado']).get();
    const badge = document.getElementById('var-badge-count');
    if (badge) {
      badge.textContent = snap.size;
      badge.style.display = snap.size > 0 ? 'inline-block' : 'none';
    }
  } catch(e) {}
}

// ── Proposta Semanal ─────────────────────────────────────
// Mapa de formaPagamento para cada item selecionado (id -> 'pix'|'prazo')
const varPropostaFormaPagto = {};

// Atualiza forma de pagamento sem precisar de JSON.stringify inline no HTML
function varAtualizarPagto(selectEl) {
  const id = selectEl.getAttribute('data-sol-id');
  if (id) {
    varPropostaFormaPagto[id] = selectEl.value;
    // Recalcula e atualiza apenas o rodapé de totais
    const selEl = document.getElementById('var-proposta-selecionadas');
    if (!selEl) return;
    let totalPix = 0, totalPrazo = 0;
    [...varPropostaSelecionadas].forEach(sid => {
      const pago = varPropostaFormaPagto[sid] || 'pix';
      const card = selEl.querySelector('select[data-sol-id="' + sid + '"]');
      if (!card) return;
      const span = card.closest('.card-body') && card.closest('.card-body').querySelector('span[style*="monospace"]');
      if (!span) return;
      const raw = span.textContent.replace('R$','').replace(/\./g,'').replace(',','.').trim();
      const val = parseFloat(raw) || 0;
      if (pago === 'pix') totalPix += val; else totalPrazo += val;
    });
    const totalGeral = totalPix + totalPrazo;
    const fmt = v => 'R$ ' + v.toLocaleString('pt-BR',{minimumFractionDigits:2});
    const resumo = selEl.querySelector('.proposta-resumo-footer');
    if (resumo) {
      resumo.innerHTML =
        '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">' +
          '<span>\uD83D\uDCB3 Total PIX:</span><strong style="color:var(--lumen);font-family:monospace;">' + fmt(totalPix) + '</strong>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">' +
          '<span>\uD83D\uDCC5 Total Prazo:</span><strong style="color:var(--warn);font-family:monospace;">' + fmt(totalPrazo) + '</strong>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;font-size:14px;font-weight:800;border-top:1px solid var(--border);padding-top:6px;margin-top:6px;">' +
          '<span>\uD83D\uDCB0 Total Geral:</span><strong style="color:var(--ok);font-family:monospace;">' + fmt(totalGeral) + '</strong>' +
        '</div>';
    }
  }
}

async function loadVarProposta() {
  const dispEl = document.getElementById('var-proposta-disponivel');
  const kpisEl = document.getElementById('var-proposta-kpis');
  if (!dispEl) return;

  dispEl.innerHTML = '<div class="loading-state"><div class="spinner spinner-dark"></div></div>';

  try {
    // 1. Busca solicitações pendentes
    const snap = await db.collection('var_solicitacoes')
      .where('status','in',['pendente','em_proposta','pedido_liberado'])
      .orderBy('criadoEm','desc').get();
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // 2. Busca todos os orçamentos e monta mapa solicitacaoId -> melhor cotação
    // Estrutura: var_orcamentos { solicitacaoId, cotacoes:[{fornecedor,valorTotal,...}], opcaoEscolhida }
    const orcSnap = await db.collection('var_orcamentos').get();
    const orcMap  = {}; // solicitacaoId -> { valorTotal, fornecedor, prazoEntrega, ... }
    orcSnap.docs.forEach(d => {
      const o   = d.data();
      const sid = o.solicitacaoId;
      if (!sid) return;

      const cotacoes = o.cotacoes || [];

      // Usa a cotação escolhida (opcaoEscolhida) se existir, senão pega a de menor preço
      let melhor = null;
      if (o.opcaoEscolhida !== undefined && o.opcaoEscolhida >= 0 && cotacoes[o.opcaoEscolhida]) {
        melhor = cotacoes[o.opcaoEscolhida];
      } else {
        // Pega a de menor valorTotal > 0
        cotacoes.forEach(c => {
          if ((c.valorTotal || 0) > 0) {
            if (!melhor || c.valorTotal < melhor.valorTotal) melhor = c;
          }
        });
      }

      // Suporte a formato antigo (valorTotal direto no documento)
      if (!melhor && (o.valorTotal || 0) > 0) {
        melhor = { valorTotal: o.valorTotal, fornecedor: o.fornecedor || '', prazoEntrega: o.prazoEntrega || '' };
      }

      if (!melhor) return; // sem cotação válida, não inclui no mapa

      // Mantém apenas o melhor valor por solicitação
      if (!orcMap[sid] || melhor.valorTotal < orcMap[sid].valorTotal) {
        orcMap[sid] = {
          valorTotal:    melhor.valorTotal || 0,
          valorUnitario: melhor.valorUnitario || 0,
          fornecedor:    melhor.fornecedor    || '',
          prazoEntrega:  melhor.prazoEntrega  || '',
          contato:       melhor.contato       || '',
        };
      }
    });

    // 3. Filtra: apenas quem TEM orçamento
    const comOrc    = docs.filter(d => orcMap[d.id]);
    const urgentes  = comOrc.filter(d => d.prioridade === 'urgente').length;

    // 4. Valor total selecionado
    const valorSel = [...varPropostaSelecionadas].reduce((acc, id) => {
      const orc = orcMap[id];
      return acc + (orc ? orc.valorTotal : 0);
    }, 0);

    // 5. KPIs
    if (kpisEl) kpisEl.innerHTML = [
      { label: 'Disponíveis',    val: comOrc.length,          cor: 'var(--lumen)' },
      { label: 'Selecionadas',   val: varPropostaSelecionadas.size, cor: 'var(--ok)' },
      { label: 'Urgentes',       val: urgentes,               cor: 'var(--danger)' },
      { label: 'Valor estimado', val: 'R$ ' + valorSel.toLocaleString('pt-BR',{minimumFractionDigits:2}), cor: 'var(--warn)' },
    ].map(k => `<div class="stat-card"><div class="stat-label">${k.label}</div><div class="stat-value" style="color:${k.cor};">${k.val}</div></div>`).join('');

    // 6. Lista disponíveis (sem orçamento ou já selecionadas ficam de fora)
    const disponiveis = comOrc.filter(d => !varPropostaSelecionadas.has(d.id));
    if (!disponiveis.length) {
      dispEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px;">Nenhuma disponível com orçamento</div>';
    } else {
      dispEl.innerHTML = disponiveis.map(d => {
        const orc   = orcMap[d.id];
        const valor = orc ? 'R$ ' + orc.valorTotal.toLocaleString('pt-BR',{minimumFractionDigits:2}) : '—';
        const forn  = orc?.fornecedor ? ` · ${orc.fornecedor}` : '';
        const prio  = d.prioridade === 'urgente' ? '<span style="color:var(--danger);font-weight:700;"> 🔴 urgente</span>' :
                      d.prioridade === 'alta'    ? '<span style="color:var(--warn);font-weight:700;"> 🟠 alta</span>' : '';
        return `
        <div class="card" style="margin-bottom:8px;cursor:pointer;transition:border-color .15s;"
             onmouseenter="this.style.borderColor='var(--lumen)'" onmouseleave="this.style.borderColor=''"
             onclick="varToggleProposta('${d.id}')">
          <div class="card-body" style="padding:10px 14px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
              <div>
                <div style="font-size:12px;font-weight:700;color:var(--lumen);">${d.codigo||'—'}</div>
                <div style="font-size:13px;font-weight:600;">${d.material}</div>
                <div style="font-size:11px;color:var(--text-muted);">${d.setor||''}${forn}${prio}</div>
              </div>
              <div style="font-size:15px;font-weight:800;color:var(--ok);font-family:monospace;white-space:nowrap;margin-left:12px;">${valor}</div>
            </div>
          </div>
        </div>`;
      }).join('');
    }

    // 7. Renderiza selecionadas com valores
    renderVarSelecionadas(comOrc, orcMap);

    // 8. Histórico de propostas
    const histEl = document.getElementById('var-historico-propostas');
    if (histEl) {
      const hSnap = await db.collection('var_propostas').orderBy('criadoEm','desc').limit(10).get();
      if (hSnap.empty) {
        histEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:16px;">Nenhuma proposta publicada ainda.</div>';
      } else {
        histEl.innerHTML = hSnap.docs.map(d => {
          const pd  = d.data();
          const dt  = pd.criadoEm?.toDate?.()?.toLocaleDateString('pt-BR') || '—';
          const itens = pd.itens || [];
          const totalVal = itens.reduce((s, it) => s + ((it.valorEstimado||0)*(it.quantidade||1)), 0);
          return `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border);">
            <div>
              <div style="font-size:13px;font-weight:600;">Proposta — ${dt}</div>
              <div style="font-size:12px;color:var(--text-muted);">${itens.length} itens · por ${pd.autorNome||'—'} · <strong style="color:var(--ok);">R$ ${totalVal.toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></div>
            </div>
            <div style="display:flex;gap:8px;">
              <button class="btn btn-sm" onclick="abrirPropostaDetalhes('${d.id}')" style="color:var(--lumen);padding:6px 12px;font-size:12px;">👁️ Ver / PDF / E-mail</button>
              <button class="btn btn-sm" onclick="deletarProposta('${d.id}')" style="color:var(--danger);padding:6px 12px;font-size:12px;">🗑️</button>
            </div>
          </div>`;
        }).join('');
      }
    }
  } catch(e) {
    dispEl.innerHTML = '<div style="color:var(--danger);padding:20px;">Erro: ' + e.message + '</div>';
  }
}

function varToggleProposta(id) {
  if (varPropostaSelecionadas.has(id)) {
    varPropostaSelecionadas.delete(id);
    delete varPropostaFormaPagto[id];
  } else {
    varPropostaSelecionadas.add(id);
    if (!varPropostaFormaPagto[id]) varPropostaFormaPagto[id] = 'pix';
  }
  loadVarProposta();
}

function renderVarSelecionadas(docs, orcMap) {
  const selEl   = document.getElementById('var-proposta-selecionadas');
  const countEl = document.getElementById('var-proposta-sel-count');
  if (!selEl) return;
  const sel = [...varPropostaSelecionadas];
  if (countEl) countEl.textContent = sel.length + ' itens';
  if (!sel.length) {
    selEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px;">Nenhuma selecionada ainda</div>';
    return;
  }

  let totalPix = 0, totalPrazo = 0;
  sel.forEach(id => {
    const orc  = orcMap[id];
    const val  = orc?.valorTotal || 0;
    const pago = varPropostaFormaPagto[id] || 'pix';
    if (pago === 'pix')   totalPix   += val;
    else                  totalPrazo += val;
  });
  const totalGeral = totalPix + totalPrazo;

  const fmt = v => 'R$ ' + v.toLocaleString('pt-BR',{minimumFractionDigits:2});

  selEl.innerHTML = sel.map(id => {
    const d   = docs.find(x => x.id === id);
    if (!d) return '';
    const orc  = orcMap[id];
    const val  = orc?.valorTotal || 0;
    const pago = varPropostaFormaPagto[id] || 'pix';
    return `
    <div class="card" style="margin-bottom:8px;border-color:var(--lumen);">
      <div class="card-body" style="padding:10px 14px;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
          <div style="flex:1;">
            <div style="font-size:12px;font-weight:700;color:var(--lumen);">${d.codigo||'—'}</div>
            <div style="font-size:13px;font-weight:600;">${d.material}</div>
            <div style="font-size:11px;color:var(--text-muted);">${d.setor||''} · ${orc?.fornecedor||'—'}</div>
            <div style="margin-top:6px;display:flex;align-items:center;gap:8px;">
              <span style="font-size:14px;font-weight:800;color:var(--ok);font-family:monospace;">${fmt(val)}</span>
              <select data-sol-id="${id}" onchange="varAtualizarPagto(this)"
                style="font-size:11px;padding:2px 6px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);">
                <option value="pix"   ${pago==='pix'  ?'selected':''}>💳 PIX</option>
                <option value="prazo" ${pago==='prazo'?'selected':''}>📅 Prazo</option>
              </select>
            </div>
          </div>
          <button class="btn btn-outline btn-sm" style="flex-shrink:0;" onclick="varToggleProposta('${id}')">✕</button>
        </div>
      </div>
    </div>`;
  }).join('') + `
  <div class="proposta-resumo-footer" style="margin-top:12px;padding:12px;border-radius:10px;background:var(--bg);border:1.5px solid var(--border);">
    <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
      <span>💳 Total PIX:</span><strong style="color:var(--lumen);font-family:monospace;">${fmt(totalPix)}</strong>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
      <span>📅 Total Prazo:</span><strong style="color:var(--warn);font-family:monospace;">${fmt(totalPrazo)}</strong>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:800;border-top:1px solid var(--border);padding-top:6px;margin-top:6px;">
      <span>💰 Total Geral:</span><strong style="color:var(--ok);font-family:monospace;">${fmt(totalGeral)}</strong>
    </div>
  </div>`;
}

async function publicarProposta() {
  if (!varPropostaSelecionadas.size) { showToast('Selecione ao menos uma solicitação!'); return; }
  const btn = document.getElementById('btn-publicar-proposta');
  btn.disabled = true; btn.textContent = 'Publicando...';
  try {
    // Busca os dados completos de cada item selecionado
    const ids = [...varPropostaSelecionadas];

    // Busca solicitações
    const solSnap = await db.collection('var_solicitacoes')
      .where('status','in',['pendente','em_proposta','pedido_liberado']).get();
    const solMap = {};
    solSnap.docs.forEach(d => { solMap[d.id] = { id: d.id, ...d.data() }; });

    // Busca orçamentos — lê cotacoes[] com opcaoEscolhida
    const orcSnap = await db.collection('var_orcamentos').get();
    const orcMap  = {};
    orcSnap.docs.forEach(d => {
      const o   = d.data();
      const sid = o.solicitacaoId;
      if (!sid) return;
      const cotacoes = o.cotacoes || [];
      let melhor = null;
      if (o.opcaoEscolhida !== undefined && o.opcaoEscolhida >= 0 && cotacoes[o.opcaoEscolhida]) {
        melhor = cotacoes[o.opcaoEscolhida];
      } else {
        cotacoes.forEach(c => {
          if ((c.valorTotal || 0) > 0 && (!melhor || c.valorTotal < melhor.valorTotal)) melhor = c;
        });
      }
      // Suporte formato antigo
      if (!melhor && (o.valorTotal || 0) > 0) {
        melhor = { valorTotal: o.valorTotal, fornecedor: o.fornecedor||'', prazoEntrega: o.prazoEntrega||'' };
      }
      if (!melhor) return;
      if (!orcMap[sid] || melhor.valorTotal < orcMap[sid].valorTotal) {
        orcMap[sid] = { valorTotal: melhor.valorTotal||0, valorUnitario: melhor.valorUnitario||0,
                        fornecedor: melhor.fornecedor||'', prazoEntrega: melhor.prazoEntrega||'' };
      }
    });

    // Monta array de itens completos
    const itens = ids.map(id => {
      const sol  = solMap[id] || {};
      const orc  = orcMap[id] || {};
      return {
        solicitacaoId:  id,
        codigo:         sol.codigo        || '—',
        material:       sol.material      || '—',
        setor:          sol.setor         || '—',
        prioridade:     sol.prioridade    || 'normal',
        quantidade:     sol.quantidade    || 1,
        valorEstimado:  orc.valorTotal    || 0,
        valorUnitario:  (orc.valorTotal || 0) / (sol.quantidade || 1),
        fornecedor:     orc.fornecedor    || '—',
        prazoEntrega:   orc.prazoEntrega  || '—',
        formaPagamento: varPropostaFormaPagto[id] || 'pix',
        autorizado:     false,
      };
    });

    const propostaRef = await db.collection('var_propostas').add({
      itens,
      autorNome: currentUserData?.name || '',
      autorUid:  currentUserData?.uid  || currentUser?.uid || '',
      criadoEm:  firebase.firestore.FieldValue.serverTimestamp(),
    });

    // Marca cada solicitação como "em_proposta" para que não apareça mais na lista de disponíveis
    const batch = db.batch();
    ids.forEach(id => {
      const ref = db.collection('var_solicitacoes').doc(id);
      batch.update(ref, { status: 'em_proposta', propostaId: propostaRef.id });
    });
    await batch.commit();

    varPropostaSelecionadas.clear();
    Object.keys(varPropostaFormaPagto).forEach(k => delete varPropostaFormaPagto[k]);
    showToast('✅ Proposta publicada com sucesso!');
    loadVarProposta();
  } catch(e) { showToast('Erro ao publicar: ' + e.message); console.error(e); }
  finally { btn.disabled = false; btn.textContent = '📤 Publicar Proposta'; }
}


async function recuperarSolicitacoesOrfas() {
  const btn = event.currentTarget;
  const origText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '⏳ Verificando...';
  try {
    // 1. Busca todas as solicitações presas como "em_proposta"
    const solSnap = await db.collection('var_solicitacoes').where('status','==','em_proposta').get();
    if (solSnap.empty) {
      showToast('Nenhuma solicitação órfã encontrada.');
      btn.disabled = false; btn.innerHTML = origText;
      return;
    }

    // 2. Coleta os propostaIds referenciados
    const propostaIds = [...new Set(
      solSnap.docs.map(d => d.data().propostaId).filter(Boolean)
    )];

    // 3. Verifica quais propostas ainda existem
    const existentes = new Set();
    for (const pid of propostaIds) {
      const doc = await db.collection('var_propostas').doc(pid).get();
      if (doc.exists) existentes.add(pid);
    }

    // 4. Filtra solicitações cujas propostas NÃO existem mais (órfãs)
    const orfas = solSnap.docs.filter(d => {
      const pid = d.data().propostaId;
      return !pid || !existentes.has(pid);
    });

    if (!orfas.length) {
      showToast('Nenhuma solicitação órfã encontrada.');
      btn.disabled = false; btn.innerHTML = origText;
      return;
    }

    // 5. Restaura todas as órfãs para "analise_estoque"
    const batch = db.batch();
    orfas.forEach(d => {
      batch.update(d.ref, {
        status: 'pendente',
        propostaId: firebase.firestore.FieldValue.delete()
      });
    });
    await batch.commit();

    showToast('✅ ' + orfas.length + ' solicitação(ões) restaurada(s) para disponíveis!');
    loadVarProposta();
  } catch(e) {
    showToast('Erro ao recuperar: ' + e.message);
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.innerHTML = origText;
  }
}

async function deletarProposta(propostaId) {
  if (!confirm("Deletar esta proposta? As solicitações voltarão para a lista de disponíveis.")) return;
  try {
    const propostaDoc = await db.collection("var_propostas").doc(propostaId).get();
    if (propostaDoc.exists) {
      const itens = propostaDoc.data().itens || [];
      const ids = itens.map(it => it.solicitacaoId).filter(Boolean);
      if (ids.length) {
        const batch = db.batch();
        ids.forEach(sid => {
          const ref = db.collection("var_solicitacoes").doc(sid);
          batch.update(ref, { status: "pendente", propostaId: firebase.firestore.FieldValue.delete() });
        });
        await batch.commit();
      }
    }
    await db.collection("var_propostas").doc(propostaId).delete();
    showToast("✅ Proposta deletada! Solicitações restauradas.");
    loadVarProposta();
  } catch(e) {
    showToast("Erro ao deletar: " + e.message);
    console.error(e);
  }
}
// ── Histórico de Compras ──────────────────────────────────
async function loadVarHistorico() {
  await populateVarSetorSelects();
  const tbEl  = document.getElementById('var-hist-tbody');
  const kpiEl = document.getElementById('var-hist-kpis');
  if (!tbEl) return;
  tbEl.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--text-muted);">Carregando...</td></tr>';

  const periodo = parseInt(document.getElementById('var-hist-periodo')?.value || '30');
  const setor   = document.getElementById('var-hist-setor')?.value || '';

  let query = db.collection('var_solicitacoes').where('status','in',['comprada','entregue','compra_realizada','concluido']);
  const snap = await query.get();
  let docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (periodo > 0) {
    const corte = new Date(); corte.setDate(corte.getDate() - periodo);
    docs = docs.filter(d => d.criadoEm?.toDate?.() >= corte);
  }
  if (setor) docs = docs.filter(d => d.setor === setor);

  const totalGasto = docs.reduce((a, d) => a + (d.valorEstimado||0), 0);
  const entregues  = docs.filter(d => d.status === 'entregue').length;

  if (kpiEl) kpiEl.innerHTML = [
    { label: 'Total de compras',  val: docs.length,   cor: 'var(--lumen)' },
    { label: 'Entregues',         val: entregues,      cor: 'var(--ok)' },
    { label: 'Valor total',       val: 'R$ ' + totalGasto.toLocaleString('pt-BR',{minimumFractionDigits:2}), cor: 'var(--warn)' },
  ].map(k => `<div class="stat-card"><div class="stat-label">${k.label}</div><div class="stat-value" style="color:${k.cor};">${k.val}</div></div>`).join('');

  if (!docs.length) {
    tbEl.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--text-muted);">Nenhum registro encontrado.</td></tr>';
    return;
  }

  const priorLabel = { normal:'🟢 Normal', alta:'🟠 Alta', urgente:'🔴 Urgente' };
  const statusLabel = { comprada:'✅ Compra Realizada', entregue:'🏁 Concluído', compra_realizada:'✅ Compra Realizada', concluido:'🏁 Concluído' };

  tbEl.innerHTML = docs.map(d => {
    const dt  = d.dataLimite ? new Date(d.dataLimite+'T00:00:00').toLocaleDateString('pt-BR') : '—';
    const val = d.valorEstimado > 0 ? 'R$ ' + d.valorEstimado.toLocaleString('pt-BR',{minimumFractionDigits:2}) : '—';
    return `<tr>
      <td><span style="font-weight:600;color:var(--lumen);">${d.codigo||'—'}</span></td>
      <td>${d.setor||'—'}</td>
      <td>${d.material||'—'}</td>
      <td>${priorLabel[d.prioridade]||d.prioridade||'—'}</td>
      <td>${d.solicitanteNome||'—'}</td>
      <td>${dt}</td>
      <td>${d.fornecedor?.empresa||'—'}</td>
      <td>${val}</td>
      <td><span class="badge badge-ok">${statusLabel[d.status]||d.status}</span></td>
    </tr>`;
  }).join('');
}

// ── Gerenciar Setores ─────────────────────────────────────
async function loadVarSetores() {
  const listEl = document.getElementById('var-setores-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="loading-state"><div class="spinner spinner-dark"></div></div>';
  const snap = await db.collection('var_setores').orderBy('nome').get();
  if (snap.empty) {
    listEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:12px;">Nenhum setor cadastrado.</div>';
    return;
  }
  listEl.innerHTML = snap.docs.map(d => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
      <span style="font-size:14px;">${d.data().nome}</span>
      <button class="btn btn-danger btn-sm" onclick="excluirVarSetor('${d.id}')">Excluir</button>
    </div>`).join('');
}

async function salvarNovoSetor() {
  const nome = document.getElementById('novo-setor-nome').value.trim();
  if (!nome) { showToast('Informe o nome do setor!'); return; }
  await db.collection('var_setores').add({ nome, criadoEm: firebase.firestore.FieldValue.serverTimestamp() });
  document.getElementById('novo-setor-nome').value = '';
  showToast('✅ Setor adicionado!');
  loadVarSetores();
  populateVarSetorSelects();
}

async function excluirVarSetor(docId) {
  if (!confirm('Excluir este setor?')) return;
  await db.collection('var_setores').doc(docId).delete();
  showToast('Setor removido.');
  loadVarSetores();
  populateVarSetorSelects();
}

// Atualiza badge ao carregar a app
setTimeout(atualizarBadgeVar, 3000);

// ══════════════════════════════════════════════
// 💲  ORÇAMENTOS DE VARIEDADES
// ══════════════════════════════════════════════

async function populateVarOrcSetorSelect() {
  const el = document.getElementById('var-orc-filtro-setor');
  if (!el || el.options.length > 1) return;
  const snap = await db.collection('var_setores').orderBy('nome').get();
  snap.docs.forEach(d => {
    const o = document.createElement('option');
    o.value = o.textContent = d.data().nome;
    el.appendChild(o);
  });
}

async function loadVarOrcamento() {
  await populateVarOrcSetorSelect();
  const listEl  = document.getElementById('var-orc-list');
  const kpiEl   = document.getElementById('var-orc-kpis');
  const countEl = document.getElementById('var-orc-count');
  if (!listEl) return;
  listEl.innerHTML = '<div class="loading-state"><div class="spinner spinner-dark"></div>Carregando...</div>';

  const fSetor   = document.getElementById('var-orc-filtro-setor')?.value   || '';
  const fStatus  = document.getElementById('var-orc-filtro-status')?.value  || '';
  const periodo  = parseInt(document.getElementById('var-orc-filtro-periodo')?.value || '30');

  try {
    let snap = await db.collection('var_solicitacoes').orderBy('criadoEm','desc').get();
    let docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (periodo > 0) {
      const corte = new Date(); corte.setDate(corte.getDate() - periodo);
      docs = docs.filter(d => d.criadoEm?.toDate?.() >= corte);
    }
    if (fSetor)  docs = docs.filter(d => d.setor  === fSetor);
    if (fStatus) docs = docs.filter(d => d.status === fStatus);

    // Carregar orçamentos de cada solicitação
    const orcSnap = await db.collection('var_orcamentos').get();
    const orcMap  = {};
    orcSnap.docs.forEach(d => {
      const o = { id: d.id, ...d.data() };
      if (!orcMap[o.solicitacaoId]) orcMap[o.solicitacaoId] = [];
      orcMap[o.solicitacaoId].push(o);
    });

    // KPIs
    const totalSols   = docs.length;
    const comOrc      = docs.filter(d => (orcMap[d.id]||[]).length > 0).length;
    const totalGasto  = docs.reduce((acc, d) => {
      const orcEntries = orcMap[d.id] || [];
      // Cada entry em orcEntries tem um array .cotacoes
      let menorValor = Infinity;
      orcEntries.forEach(entry => {
        (entry.cotacoes || []).forEach(c => {
          if (c.valorTotal > 0 && c.valorTotal < menorValor) menorValor = c.valorTotal;
        });
      });
      return acc + (menorValor === Infinity ? 0 : menorValor);
    }, 0);
    const mediaGasto = totalSols > 0 ? totalGasto / totalSols : 0;

    if (kpiEl) kpiEl.innerHTML = [
      { label: 'Solicitações',        val: totalSols,   cor: 'var(--lumen)' },
      { label: 'Com orçamento',       val: comOrc,      cor: 'var(--ok)' },
      { label: 'Sem orçamento',       val: totalSols - comOrc, cor: 'var(--warn)' },
      { label: 'Total previsto',      val: 'R$ ' + totalGasto.toLocaleString('pt-BR',{minimumFractionDigits:2}), cor: 'var(--lumen)' },
    ].map(k => `<div class="stat-card"><div class="stat-label">${k.label}</div><div class="stat-value" style="color:${k.cor};">${k.val}</div></div>`).join('');

    if (countEl) countEl.textContent = totalSols + ' solicitação(ões)';

    if (!docs.length) {
      listEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">💲</div><div class="empty-state-title">Nenhuma solicitação encontrada</div></div>';
      return;
    }

    const priorBadge  = { normal:'badge-gray', alta:'badge-warn', urgente:'badge-danger' };
    const priorLabel  = { normal:'🟢 Normal', alta:'🟠 Alta', urgente:'🔴 Urgente' };
    const statusBadge = { pendente:'badge-warn', em_proposta:'badge-info', pedido_liberado:'badge-ok', compra_realizada:'badge-brand', comprada:'badge-brand', concluido:'badge-gray', entregue:'badge-gray', cancelado:'badge-danger' };
    const statusLabel = { pendente:'🟡 Pendente', em_proposta:'📋 Em Proposta', pedido_liberado:'🟢 Pedido Liberado', compra_realizada:'✅ Compra Realizada', comprada:'✅ Compra Realizada', concluido:'🏁 Concluído', entregue:'🏁 Concluído', cancelado:'⛔ Cancelado' };

    listEl.innerHTML = docs.map(d => {
      const orcEntries = orcMap[d.id] || [];
      const flatCotacoes = [];
      let orcId = null;
      let statusOrc = 'Pendente';
      let opcaoEscolhida = -1;

      orcEntries.forEach(entry => {
        orcId = entry.id;
        statusOrc = entry.status || 'Pendente';
        opcaoEscolhida = entry.opcaoEscolhida !== undefined ? entry.opcaoEscolhida : -1;
        (entry.cotacoes || []).forEach((c, idx) => {
          if (c.fornecedor || c.valorTotal > 0) {
            flatCotacoes.push({ ...c, index: idx, orcId: entry.id });
          }
        });
      });

      flatCotacoes.sort((a, b) => (a.valorTotal || 0) - (b.valorTotal || 0));
      
      const qtd = d.quantidade ? `${d.quantidade} ${d.unidade||'un'}` : '';
      const dt  = d.dataLimite ? new Date(d.dataLimite+'T00:00:00').toLocaleDateString('pt-BR') : '—';
      const melhor = flatCotacoes[0];

      const orcsHtml = flatCotacoes.length === 0
        ? `<div style="color:var(--text-muted);font-size:12px;font-style:italic;padding:8px 0;">Nenhum orçamento registrado ainda.</div>`
        : flatCotacoes.map((o, i) => {
            const isBest = i === 0;
            const isSelected = opcaoEscolhida === o.index;
            const bg = isSelected ? 'var(--ok-bg)' : (isBest ? 'rgba(43,159,168,0.05)' : 'var(--bg)');
            const border = isSelected ? '2px solid var(--ok)' : '1px solid var(--border)';
            
            return `
              <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;background:${bg};border:${border};margin-bottom:8px;flex-wrap:wrap;position:relative;">
                ${isSelected ? '<div style="position:absolute; top:-10px; right:10px; background:var(--ok); color:white; font-size:10px; font-weight:800; padding:2px 8px; border-radius:10px; text-transform:uppercase;">ESCOLHIDA</div>' : ''}
                <div style="display:flex; flex-direction:column; gap:2px;">
                   ${isBest ? '<span style="font-size:9px;font-weight:800;color:var(--lumen);text-transform:uppercase;letter-spacing:0.5px;">Menor Preço</span>' : `<span style="font-size:9px;color:var(--text-muted);text-transform:uppercase;">Opção ${o.index + 1}</span>`}
                   <div style="font-size:14px;font-weight:700;">🏪 ${o.fornecedor || '—'}</div>
                </div>
                <div style="flex:1;min-width:120px;font-size:12px;color:var(--text-muted);">
                  ${o.prazoEntrega ? `<div>⏱️ Prazo: ${o.prazoEntrega}</div>` : ''}
                  ${o.obs ? `<div style="font-style:italic;">💬 ${o.obs}</div>` : ''}
                </div>
                <div style="text-align:right;min-width:100px;">
                  <div style="font-size:16px;font-weight:800;color:${isSelected ? 'var(--ok)' : 'var(--text)'};">R$ ${(o.valorTotal||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
                </div>
                <div style="display:flex;gap:6px;">
                  ${statusOrc !== 'Aprovada' ? `
                    <button class="btn btn-primary btn-sm" style="padding:6px 10px; background:var(--ok); border:none;" onclick="aprovarOpcaoEspecifica('${o.orcId}', ${o.index}, ${o.valorTotal})" title="Selecionar esta opção">
                      ✅ Selecionar
                    </button>
                  ` : ''}
                  ${i === 0 && flatCotacoes.length > 0 && statusOrc !== 'Aprovada' ? `
                    <button class="btn btn-danger btn-sm" style="padding:6px 10px;" onclick="excluirOrcVar('${o.orcId}','${d.id}')" title="Excluir todas">
                      🗑
                    </button>
                  ` : ''}
                </div>
              </div>`;
          }).join('');

      return `<div class="card" style="margin-bottom:16px; border-left: 4px solid ${statusOrc === 'Aprovada' ? 'var(--ok)' : 'var(--warn)'};">
        <div class="card-body" style="padding:18px;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
            <div style="flex:1;">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
                <span style="font-size:12px;font-weight:800;color:var(--lumen);background:var(--lumen-lt);padding:2px 10px;border-radius:6px;">${d.codigo||'—'}</span>
                <span class="badge ${priorBadge[d.prioridade]||'badge-gray'}">${priorLabel[d.prioridade]||d.prioridade}</span>
                <span class="badge ${statusBadge[d.status]||'badge-gray'}">${statusLabel[d.status]||d.status}</span>
              </div>
              <div style="font-size:17px;font-weight:800;margin-bottom:4px;color:var(--text);">
                ${d.material}
                ${qtd ? `<span style="font-size:12px;font-weight:700;color:var(--lumen);margin-left:8px;">(${qtd})</span>` : ''}
              </div>
              <div style="font-size:12px;color:var(--text-muted);display:flex;gap:12px;">
                <span>🏢 <b>Setor:</b> ${d.setor}</span>
                <span>📅 <b>Limite:</b> ${dt}</span>
                <span>👤 <b>Por:</b> ${d.solicitanteNome||'—'}</span>
              </div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
              ${statusOrc !== 'Aprovada' ? `
                <button class="btn btn-primary" style="padding:8px 16px; font-size:13px;" onclick="abrirModalOrcVar('${d.id}','${(d.codigo||'').replace(/'/g,"\\'")}','${(d.material||'').replace(/'/g,"\\'")}',${d.quantidade||1},'${d.unidade||'un'}')">
                  ${flatCotacoes.length > 0 ? '📝 Editar Cotações' : '+ Adicionar Cotação'}
                </button>
              ` : `
                <div style="color:var(--ok); font-weight:800; font-size:13px; display:flex; align-items:center; gap:5px;">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  COMPRA AUTORIZADA
                </div>
              `}
              ${['admin','diretor','gerente'].includes(currentUserData?.role) ? `
                <button class="btn btn-outline btn-sm" style="color:var(--warn);border-color:var(--warn);" onclick="abrirEditarVarSol('${d.id}')">✏️ Editar Sol.</button>
                <button class="btn btn-danger btn-sm" onclick="excluirVarSol('${d.id}','${(d.codigo||'').replace(/'/g,"\\'")}')">🗑 Excluir Sol.</button>
              ` : ''}
              ${flatCotacoes.length > 0 && statusOrc !== 'aprovado' && orcId && ['admin','diretor','gerente','compras','coordenador'].includes(currentUserData?.role) ? `
                <button class="btn btn-secondary btn-sm" style="background:var(--ok);color:#fff;border-color:var(--ok);" onclick="aprovarOrcamentoVar('${orcId}','${d.id}')">✅ Aprovar Orçamento</button>
                <button class="btn btn-danger btn-sm" onclick="recusarOrcamentoVar('${orcId}')">❌ Recusar</button>
              ` : ''}
            </div>
          </div>
          <div style="background: rgba(0,0,0,0.01); border-radius:12px; padding:12px; border:1px dashed var(--border);">
            <div style="font-size:11px;font-weight:800;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;display:flex;justify-content:space-between;">
              <span>${flatCotacoes.length} OPÇÕES DISPONÍVEIS</span>
              ${flatCotacoes.length > 1 ? `<span style="color:var(--lumen);">ECONOMIA POTENCIAL: R$ ${(flatCotacoes[flatCotacoes.length-1].valorTotal - flatCotacoes[0].valorTotal).toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>` : ''}
            </div>
            ${orcsHtml}
          </div>
        </div>
      </div>`;
    }).join('');
  } catch(e) {
    listEl.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-title">Erro: ${e.message}</div></div>`;
  }
}

function resetVarOrcFiltros() {
  ['var-orc-filtro-setor','var-orc-filtro-status'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('var-orc-filtro-periodo').value = '30';
  loadVarOrcamento();
}

function abrirModalOrcVar(solId, codigo, material, quantidade, unidade) {
  document.getElementById('orc-var-sol-id').value     = solId;
  document.getElementById('orc-var-sol-label').textContent = `${codigo} — ${material} (${quantidade} ${unidade})`;
  document.getElementById('orc-var-fornecedor').value  = '';
  document.getElementById('orc-var-contato').value     = '';
  document.getElementById('orc-var-val-unit').value    = '';
  document.getElementById('orc-var-val-total').value   = '';
  document.getElementById('orc-var-prazo').value       = '';
  document.getElementById('orc-var-obs').value         = '';
  document.getElementById('orc-var-qtd-ref').textContent = `Qtd: ${quantidade} ${unidade}`;
  // Listener para calcular total automaticamente
  const qty = quantidade || 1;
  document.getElementById('orc-var-val-unit').oninput = function() {
    const u = parseFloat(this.value) || 0;
    const t = document.getElementById('orc-var-val-total');
    if (u > 0) t.value = (u * qty).toFixed(2);
  };
  openModal('modal-orc-var');
}

async function salvarOrcVar() {
  const solId    = document.getElementById('orc-var-sol-id').value;
  const forn     = document.getElementById('orc-var-fornecedor').value.trim();
  const contato  = document.getElementById('orc-var-contato').value.trim();
  const valUnit  = parseFloat(document.getElementById('orc-var-val-unit').value)  || 0;
  const valTotal = parseFloat(document.getElementById('orc-var-val-total').value) || 0;
  const prazo    = document.getElementById('orc-var-prazo').value.trim();
  const obs      = document.getElementById('orc-var-obs').value.trim();

  if (!forn)     { showToast('Informe o nome do fornecedor!'); return; }
  if (valTotal <= 0) { showToast('Informe o valor total da cotação!'); return; }

  const btn = document.getElementById('btn-salvar-orc-var');
  btn.disabled = true; btn.textContent = 'Salvando...';
  try {
    await db.collection('var_orcamentos').add({
      solicitacaoId: solId,
      fornecedor:   forn,
      contato,
      valorUnitario: valUnit,
      valorTotal,
      prazoEntrega: prazo,
      obs,
      registradoPor:  currentUserData?.name || '',
      registradoUid:  currentUser?.uid || '',
      criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    });
    closeModal('modal-orc-var');
    showToast('✅ Cotação registrada!');
    loadVarOrcamento();
  } catch(e) { showToast('Erro: ' + e.message); }
  finally { btn.disabled = false; btn.textContent = 'Salvar Cotação'; }
}

async function excluirOrcVar(orcId, solId) {
  if (!confirm('Excluir esta cotação?')) return;
  await db.collection('var_orcamentos').doc(orcId).delete();
  showToast('Cotação removida.');
  loadVarOrcamento();
}

// ── Excluir solicitação inteira (admin/diretor/gerente) ─────────
async function excluirVarSol(docId, codigo) {
  const role = currentUserData?.role || '';
  if (!['admin','diretor','gerente'].includes(role)) {
    showToast('❌ Sem permissão para excluir solicitações.'); return;
  }
  if (!confirm(`Excluir a solicitação ${codigo}? Esta ação não pode ser desfeita.`)) return;
  try {
    // Exclui orçamentos vinculados
    const orcSnap = await db.collection('var_orcamentos').where('solicitacaoId','==',docId).get();
    const batch = db.batch();
    orcSnap.docs.forEach(d => batch.delete(d.ref));
    batch.delete(db.collection('var_solicitacoes').doc(docId));
    await batch.commit();
    showToast(`✅ Solicitação ${codigo} excluída com sucesso.`);
    if (typeof loadVarSolicitacoes === 'function') loadVarSolicitacoes();
    if (typeof loadVarOrcamento === 'function') loadVarOrcamento();
  } catch(e) { showToast('❌ Erro ao excluir: ' + e.message); }
}

// ── Abrir modal de edição de solicitação ───────────────────────
async function abrirEditarVarSol(docId) {
  const role = currentUserData?.role || '';
  if (!['admin','diretor','gerente'].includes(role)) {
    showToast('❌ Sem permissão para editar solicitações.'); return;
  }
  const snap = await db.collection('var_solicitacoes').doc(docId).get();
  if (!snap.exists) { showToast('Solicitação não encontrada.'); return; }
  const d = snap.data();

  document.getElementById('edit-var-doc-id').value        = docId;
  document.getElementById('edit-var-material').value      = d.material || '';
  document.getElementById('edit-var-quantidade').value    = d.quantidade || '';
  document.getElementById('edit-var-obs').value           = d.obs || '';
  document.getElementById('edit-var-data-limite').value   = d.dataLimite || '';
  document.getElementById('edit-var-valor-estimado').value= d.valorEstimado > 0 ? d.valorEstimado : '';
  document.getElementById('edit-var-forn-empresa').value  = d.fornecedor?.empresa || '';
  document.getElementById('edit-var-forn-atendente').value= d.fornecedor?.atendente || '';
  document.getElementById('edit-var-forn-tel').value      = d.fornecedor?.tel || '';

  // Preenche setor e prioridade
  await populateVarSetorSelects();
  const setorEl = document.getElementById('edit-var-setor');
  if (setorEl) setorEl.value = d.setor || '';
  const priorEl = document.getElementById('edit-var-prioridade');
  if (priorEl) priorEl.value = d.prioridade || 'normal';
  const statusEl = document.getElementById('edit-var-status');
  if (statusEl) statusEl.value = d.status || 'pendente';
  const unidEl = document.getElementById('edit-var-unidade');
  if (unidEl) unidEl.value = d.unidade || 'un';

  document.getElementById('edit-var-codigo-label').textContent = d.codigo || '—';
  document.getElementById('modal-editar-var').classList.remove('hidden');
}

// ── Salvar edição da solicitação ───────────────────────────────
async function salvarEdicaoVarSol() {
  const docId   = document.getElementById('edit-var-doc-id').value;
  const material= document.getElementById('edit-var-material').value.trim();
  const quantidade = parseFloat(document.getElementById('edit-var-quantidade').value) || 0;
  const unidade = document.getElementById('edit-var-unidade').value || 'un';
  const setor   = document.getElementById('edit-var-setor').value;
  const prioridade  = document.getElementById('edit-var-prioridade').value;
  const status  = document.getElementById('edit-var-status').value;
  const obs     = document.getElementById('edit-var-obs').value.trim();
  const dataLimite   = document.getElementById('edit-var-data-limite').value;
  const valorEstimado= parseFloat(document.getElementById('edit-var-valor-estimado').value) || 0;
  const empresa  = document.getElementById('edit-var-forn-empresa').value.trim();
  const atendente= document.getElementById('edit-var-forn-atendente').value.trim();
  const tel      = document.getElementById('edit-var-forn-tel').value.trim();

  if (!material) { showToast('Informe o material.'); return; }
  if (!setor)    { showToast('Selecione o setor.'); return; }
  if (!quantidade || quantidade <= 0) { showToast('Informe a quantidade.'); return; }

  const btn = document.getElementById('btn-salvar-edit-var');
  btn.disabled = true; btn.textContent = 'Salvando...';
  try {
    await db.collection('var_solicitacoes').doc(docId).update({
      material, quantidade, unidade, setor, prioridade, status, obs, dataLimite, valorEstimado,
      fornecedor: { empresa, atendente, tel },
      editadoEm: firebase.firestore.FieldValue.serverTimestamp(),
      editadoPor: currentUserData?.name || '',
    });
    closeModal('modal-editar-var');
    showToast('✅ Solicitação atualizada com sucesso!');
    if (typeof loadVarSolicitacoes === 'function') loadVarSolicitacoes();
    if (typeof loadVarOrcamento === 'function') loadVarOrcamento();
  } catch(e) { showToast('❌ Erro ao salvar: ' + e.message); }
  finally { btn.disabled = false; btn.textContent = 'Salvar Alterações'; }
}

