// Extraído de index.html (bloco Kanban + Produtividade da Equipe) em 2026-07-27


// ═══════════════════════════════════════════════════════════════
// 🗂️ KANBAN DA EQUIPE
// ═══════════════════════════════════════════════════════════════

const KANBAN_STATUS = {
  aguardando:  { label: '📋 Aguardando',  cor: '#64748b', bg: 'rgba(100,116,139,0.12)' },
  em_execucao: { label: '⚡ Em Execução', cor: 'var(--lumen)', bg: 'rgba(79,140,255,0.12)' },
  em_revisao:  { label: '🔍 Em Revisão',  cor: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  concluido:   { label: '✅ Concluído',   cor: 'var(--ok)', bg: 'rgba(34,197,94,0.12)' },
};
const KANBAN_URGENCIA = {
  critica: { label: '🔴 Crítica', cor: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  alta:    { label: '🟠 Alta',    cor: '#f97316', bg: 'rgba(249,115,22,0.10)' },
  media:   { label: '🟡 Média',   cor: '#eab308', bg: 'rgba(234,179,8,0.10)' },
  baixa:   { label: '🟢 Baixa',   cor: '#22c55e', bg: 'rgba(34,197,94,0.10)' },
};
const KANBAN_ROLE = {
  compras: { label: '🛒 Compras', cor: '#14b8a6' },
  estoque: { label: '📦 Estoque', cor: '#f59e0b' },
  ambos:   { label: '🔄 Ambos',   cor: '#a78bfa' },
};

let _kanbanTasks = [];

function kanbanPodeEditar() {
  return ['admin','diretor','gerente','coordenador'].includes(currentUserData?.role);
}

async function loadKanban() {
  const board  = document.getElementById('kanban-board');
  const countEl = document.getElementById('kanban-count');
  const btnNova = document.getElementById('kanban-btn-nova');
  const filtroRoleWrap = document.getElementById('kanban-filtro-role-wrap');
  if (!board) return;

  // Mostra botão Nova apenas para admin/gerente/diretor
  if (btnNova) btnNova.style.display = kanbanPodeEditar() ? '' : 'none';

  // Usuários compras/estoque não veem o filtro de role (só veem as deles)
  const role = currentUserData?.role;
  if (filtroRoleWrap) {
    filtroRoleWrap.style.display = kanbanPodeEditar() ? '' : 'none';
  }

  board.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);"><div class="spinner spinner-dark" style="width:32px;height:32px;margin:0 auto 12px;"></div>Carregando...</div>';

  try {
    let snap;
    // Busca todos os documentos e filtra localmente (evita index composto no Firestore)
    snap = await db.collection('kanban_tasks').get();
    let allTasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Filtra por role: compras/estoque veem só as do seu time + ambos
    if (role === 'compras') {
      allTasks = allTasks.filter(t => t.assignedRole === 'compras' || t.assignedRole === 'ambos');
    } else if (role === 'estoque') {
      allTasks = allTasks.filter(t => t.assignedRole === 'estoque' || t.assignedRole === 'ambos');
    }
    // admin/diretor/gerente veem tudo sem filtro adicional

    _kanbanTasks = allTasks;

    // Filtros locais
    const filtroRole     = document.getElementById('kanban-filtro-role')?.value || '';
    const filtroUrgencia = document.getElementById('kanban-filtro-urgencia')?.value || '';

    let tasks = _kanbanTasks;
    if (filtroRole)     tasks = tasks.filter(t => t.assignedRole === filtroRole || t.assignedRole === 'ambos');
    if (filtroUrgencia) tasks = tasks.filter(t => t.urgency === filtroUrgencia);

    // Ordena: urgência decrescente, depois prazo
    const urgOrd = { critica:0, alta:1, media:2, baixa:3 };
    tasks.sort((a,b) => {
      const u = (urgOrd[a.urgency]||3) - (urgOrd[b.urgency]||3);
      if (u !== 0) return u;
      return (a.deadline||'9999') < (b.deadline||'9999') ? -1 : 1;
    });

    if (countEl) countEl.textContent = `${tasks.length} atividade${tasks.length !== 1 ? 's' : ''}`;

    // Agrupa por status
    const cols = ['aguardando','em_execucao','em_revisao','concluido'];
    const grupos = {};
    cols.forEach(s => grupos[s] = []);
    tasks.forEach(t => { (grupos[t.status] || grupos['aguardando']).push(t); });

    board.style.gridTemplateColumns = 'repeat(4,1fr)';
    board.innerHTML = cols.map(status => {
      const st = KANBAN_STATUS[status];
      const items = grupos[status];
      const cards = items.length > 0
        ? items.map(t => renderKanbanCard(t)).join('')
        : `<div style="text-align:center;padding:20px 12px;color:var(--text-muted);font-size:12px;">Nenhuma atividade</div>`;

      return `
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;">
          <div style="padding:12px 16px;border-bottom:1px solid var(--border);background:${st.bg};display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size:13px;font-weight:700;color:${st.cor};">${st.label}</span>
            <span style="font-size:11px;font-weight:700;background:${st.bg};color:${st.cor};padding:2px 8px;border-radius:12px;border:1px solid ${st.cor}33;">${items.length}</span>
          </div>
          <div style="padding:10px;display:flex;flex-direction:column;gap:8px;min-height:120px;">
            ${cards}
          </div>
        </div>`;
    }).join('');

  } catch(e) {
    console.error('loadKanban error:', e);
    board.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:32px;color:var(--danger);">Erro: ${e.message}</div>`;
  }
}

function renderKanbanCard(t) {
  const urg  = KANBAN_URGENCIA[t.urgency] || KANBAN_URGENCIA.baixa;
  const role = KANBAN_ROLE[t.assignedRole] || { label: t.assignedRole, cor: 'var(--lumen)' };
  const podEd = kanbanPodeEditar();

  // Calcular prazo
  let prazoHtml = '';
  if (t.deadline) {
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const prazo = new Date(t.deadline + 'T00:00:00');
    const dias  = Math.round((prazo - hoje) / 86400000);
    const prazoLabel = t.deadline.split('-').reverse().join('/');
    if (t.status !== 'concluido') {
      if (dias < 0)      prazoHtml = `<span style="color:var(--danger);font-size:10px;font-weight:700;">⚠️ ${Math.abs(dias)}d atrasado</span>`;
      else if (dias === 0) prazoHtml = `<span style="color:var(--danger);font-size:10px;font-weight:700;">🔥 Vence hoje</span>`;
      else if (dias <= 2)  prazoHtml = `<span style="color:#f97316;font-size:10px;font-weight:700;">⏰ ${dias}d restante${dias>1?'s':''}</span>`;
      else                 prazoHtml = `<span style="color:var(--text-muted);font-size:10px;">📅 ${prazoLabel}</span>`;
    } else {
      prazoHtml = `<span style="color:var(--text-muted);font-size:10px;">📅 ${prazoLabel}</span>`;
    }
  }

  const editBtns = podEd ? `
    <div style="display:flex;gap:4px;margin-top:8px;">
      <button onclick="editarKanbanTask('${t.id}')"
        style="flex:1;padding:4px;font-size:10px;font-weight:700;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text-muted);cursor:pointer;">
        ✏️ Editar
      </button>
      <button onclick="moverKanbanTask('${t.id}')"
        style="flex:1;padding:4px;font-size:10px;font-weight:700;border-radius:6px;border:1px solid var(--lumen);background:rgba(79,140,255,0.08);color:var(--lumen);cursor:pointer;">
        ▶ Mover
      </button>
      <button onclick="excluirKanbanTask('${t.id}')"
        style="padding:4px 8px;font-size:10px;border-radius:6px;border:1px solid var(--danger);background:var(--danger-bg);color:var(--danger);cursor:pointer;">
        🗑
      </button>
    </div>` : `
    <div style="margin-top:8px;">
      <button onclick="atualizarStatusProprio('${t.id}')"
        style="width:100%;padding:4px;font-size:10px;font-weight:700;border-radius:6px;border:1px solid var(--lumen);background:rgba(79,140,255,0.08);color:var(--lumen);cursor:pointer;">
        ▶ Atualizar Status
      </button>
    </div>`;

  return `
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:12px;
      border-left:3px solid ${urg.cor};">
      <!-- Header do card -->
      <div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:8px;">
        <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;background:${urg.bg};color:${urg.cor};white-space:nowrap;">${urg.label}</span>
        <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;background:${role.cor}22;color:${role.cor};white-space:nowrap;margin-left:auto;">${role.label}</span>
      </div>
      <!-- Título -->
      <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px;line-height:1.3;">${t.title}</div>
      <!-- Descrição -->
      ${t.description ? `<div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;line-height:1.4;">${t.description}</div>` : ''}
      <!-- Prazo -->
      ${prazoHtml ? `<div style="margin-bottom:4px;">${prazoHtml}</div>` : ''}
      <!-- Criado por -->
      <div style="font-size:10px;color:var(--text-muted);">Por: ${t.createdBy || '—'}</div>
      ${editBtns}
    </div>`;
}

function abrirModalNovaTask() {
  document.getElementById('ktask-id').value = '';
  document.getElementById('ktask-titulo').value = '';
  document.getElementById('ktask-desc').value = '';
  document.getElementById('ktask-role').value = 'compras';
  document.getElementById('ktask-urgencia').value = 'media';
  document.getElementById('ktask-status').value = 'aguardando';
  document.getElementById('ktask-prazo').value = '';
  document.getElementById('modal-kanban-title').textContent = 'Nova Atividade';
  document.getElementById('modal-kanban-task').classList.remove('hidden');
}

function editarKanbanTask(id) {
  const t = _kanbanTasks.find(x => x.id === id);
  if (!t) return;
  document.getElementById('ktask-id').value = id;
  document.getElementById('ktask-titulo').value = t.title || '';
  document.getElementById('ktask-desc').value = t.description || '';
  document.getElementById('ktask-role').value = t.assignedRole || 'compras';
  document.getElementById('ktask-urgencia').value = t.urgency || 'media';
  document.getElementById('ktask-status').value = t.status || 'aguardando';
  document.getElementById('ktask-prazo').value = t.deadline || '';
  document.getElementById('modal-kanban-title').textContent = 'Editar Atividade';
  document.getElementById('modal-kanban-task').classList.remove('hidden');
}

async function salvarKanbanTask() {
  const id     = document.getElementById('ktask-id').value;
  const titulo = document.getElementById('ktask-titulo').value.trim();
  if (!titulo) { showToast('Informe o título da atividade.'); return; }

  const data = {
    title:        titulo,
    description:  document.getElementById('ktask-desc').value.trim(),
    assignedRole: document.getElementById('ktask-role').value,
    urgency:      document.getElementById('ktask-urgencia').value,
    status:       document.getElementById('ktask-status').value,
    deadline:     document.getElementById('ktask-prazo').value || '',
    updatedAt:    firebase.firestore.FieldValue.serverTimestamp(),
  };

  try {
    if (id) {
      await db.collection('kanban_tasks').doc(id).update(data);
      showToast('✅ Atividade atualizada!');
    } else {
      data.createdBy = currentUserData?.name || '';
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('kanban_tasks').add(data);
      showToast('✅ Atividade criada!');
    }
    closeModal('modal-kanban-task');
    loadKanban();
  } catch(e) {
    showToast('❌ Erro: ' + e.message);
  }
}

async function moverKanbanTask(id) {
  const t = _kanbanTasks.find(x => x.id === id);
  if (!t) return;
  const ordem = ['aguardando','em_execucao','em_revisao','concluido'];
  const idx   = ordem.indexOf(t.status);
  if (idx >= ordem.length - 1) { showToast('Atividade já está em Concluído.'); return; }
  const proximo = ordem[idx + 1];
  try {
    const upd = { status: proximo, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    if (proximo === 'concluido') upd.completedAt = firebase.firestore.FieldValue.serverTimestamp();
    await db.collection('kanban_tasks').doc(id).update(upd);
    showToast(`✅ Movido para: ${KANBAN_STATUS[proximo].label}`);
    loadKanban();
  } catch(e) { showToast('❌ Erro: ' + e.message); }
}

async function atualizarStatusProprio(id) {
  const t = _kanbanTasks.find(x => x.id === id);
  if (!t) return;
  // Compras/Estoque só podem mover para frente (não podem criar ou excluir)
  const ordem = ['aguardando','em_execucao','em_revisao','concluido'];
  const idx   = ordem.indexOf(t.status);
  if (idx >= ordem.length - 1) { showToast('Atividade já está concluída.'); return; }
  const labels = ordem.slice(idx+1).map(s => KANBAN_STATUS[s].label);
  const proximo = ordem[idx + 1];
  if (!confirm(`Mover para "${KANBAN_STATUS[proximo].label}"?`)) return;
  try {
    const upd = { status: proximo, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    if (proximo === 'concluido') upd.completedAt = firebase.firestore.FieldValue.serverTimestamp();
    await db.collection('kanban_tasks').doc(id).update(upd);
    showToast(`✅ Status atualizado: ${KANBAN_STATUS[proximo].label}`);
    loadKanban();
  } catch(e) { showToast('❌ Erro: ' + e.message); }
}

async function excluirKanbanTask(id) {
  if (!confirm('Excluir esta atividade permanentemente?')) return;
  try {
    await db.collection('kanban_tasks').doc(id).delete();
    showToast('🗑️ Atividade excluída.');
    loadKanban();
  } catch(e) { showToast('❌ Erro: ' + e.message); }
}

// ═══════════════════════════════════════════════════════════════
// 📊 PRODUTIVIDADE DA EQUIPE
// ═══════════════════════════════════════════════════════════════
let _prodDays = 1; // período selecionado em dias

function prodSetPeriod(btn, days) {
  document.querySelectorAll('.prod-period-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  _prodDays = days;
  loadProdutividade();
}

async function loadProdutividade() {
  const kanban  = document.getElementById('prod-kanban');
  const kpisEl  = document.getElementById('prod-kpis');
  const feedEl  = document.getElementById('prod-feed');
  const feedCnt = document.getElementById('prod-feed-count');
  if (!kanban) return;

  kanban.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);grid-column:1/-1;"><div class="spinner spinner-dark" style="width:32px;height:32px;margin:0 auto 12px;"></div>Carregando...</div>';
  kpisEl.innerHTML = '';
  feedEl.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-muted);">Carregando...</div>';

  try {
    // ── Período ────────────────────────────────────
    const agora  = new Date();
    const inicio = new Date(agora);
    inicio.setDate(agora.getDate() - (_prodDays - 1));
    inicio.setHours(0, 0, 0, 0);
    const inicioTs = firebase.firestore.Timestamp.fromDate(inicio);

    // ── 1. Buscar usuários compras/estoque ─────────
    const usersSnap = await db.collection('users')
      .where('status', '==', 'approved').get();
    const teamUsers = usersSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(u => ['compras', 'estoque'].includes(u.role));

    // ── 2. Movimentações no período ────────────────
    const movSnap = await db.collection('movements')
      .where('createdAt', '>=', inicioTs).get();
    const movs = movSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // ── 3. Transferências no período ───────────────
    let transfs = [];
    try {
      const tSnap = await db.collection('transferencias')
        .where('createdAt', '>=', inicioTs).get();
      transfs = tSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch(e) { /* ignora se sem índice */ }

    // ── 4. Pedidos criados no período ──────────────
    const ordSnap = await db.collection('orders')
      .where('createdAt', '>=', inicioTs).get();
    const orders = ordSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // ── 5. Cotações processadas no período ─────────
    let cotacoes = [];
    try {
      const cotSnap = await db.collection('quotations')
        .where('createdAt', '>=', inicioTs).get();
      cotacoes = cotSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch(e) { /* ignora se sem índice */ }

    // ── 6. Pedidos pendentes (sem filtro de data) ──
    const pendSnap = await db.collection('orders')
      .where('status', 'in', ['pending', 'quotation', 'approved', 'liberado']).get();
    const pendentes = pendSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // ── Monta mapa por usuário ─────────────────────
    const byUser = {};
    teamUsers.forEach(u => {
      byUser[u.name] = {
        user: u,
        movEntradas: 0, movSaidas: 0,
        transfs: 0,
        pedidosCriados: 0,
        cotacoesAprovadas: 0, cotacoesRecusadas: 0,
        itensMov: 0,
        atividades: [],  // feed unificado
      };
    });

    // Garante entrada para nomes não cadastrados mas ativos
    const ensureUser = (nome, role) => {
      if (nome && !byUser[nome]) {
        byUser[nome] = {
          user: { name: nome, role: role || 'compras' },
          movEntradas: 0, movSaidas: 0, transfs: 0,
          pedidosCriados: 0, cotacoesAprovadas: 0, cotacoesRecusadas: 0,
          itensMov: 0, atividades: [],
        };
      }
    };

    // Processar movimentações
    movs.forEach(m => {
      const nome = m.registeredBy || '';
      ensureUser(nome, 'estoque');
      if (!byUser[nome]) return;
      const u = byUser[nome];
      if (m.type === 'entrada') u.movEntradas++;
      else u.movSaidas++;
      u.itensMov += (m.items || []).reduce((s,i) => s + (parseFloat(i.qty)||0), 0);
      const dt = m.createdAt?.toDate ? m.createdAt.toDate() : new Date();
      u.atividades.push({
        ts: dt, tipo: m.type === 'entrada' ? 'entrada' : 'saida',
        icon: m.type === 'entrada' ? '📥' : '📤',
        cor: m.type === 'entrada' ? 'var(--ok)' : 'var(--danger)',
        bg: m.type === 'entrada' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.10)',
        desc: `${m.type === 'entrada' ? 'Entrada' : 'Saída'} registrada — ${m.house || ''}`,
        sub: `${(m.items||[]).length} produto(s) · ${m.house || '—'}`,
        user: nome,
      });
    });

    // Processar transferências
    transfs.forEach(t => {
      const nome = t.registradoPor || '';
      ensureUser(nome, 'estoque');
      if (!byUser[nome]) return;
      byUser[nome].transfs++;
      const dt = t.createdAt?.toDate ? t.createdAt.toDate() : new Date();
      byUser[nome].atividades.push({
        ts: dt, tipo: 'transf', icon: '🔄', cor: 'var(--lumen)',
        bg: 'rgba(79,140,255,0.12)',
        desc: `Transferência ${t.origem || ''} → ${t.destino || ''}`,
        sub: `${(t.items||[]).length} item(s)`,
        user: nome,
      });
    });

    // Processar pedidos criados
    orders.forEach(o => {
      const nome = o.requesterName || o.solicitanteNome || '';
      ensureUser(nome, 'compras');
      if (!byUser[nome]) return;
      byUser[nome].pedidosCriados++;
      const dt = o.createdAt?.toDate ? o.createdAt.toDate() : new Date();
      byUser[nome].atividades.push({
        ts: dt, tipo: 'pedido', icon: '📋', cor: '#f59e0b',
        bg: 'rgba(245,158,11,0.12)',
        desc: `Pedido criado — ${o.house || ''}`,
        sub: `${o.code || o.id} · ${(o.categories||[]).map(c => CATEGORIAS[c]?.nome||c).join(', ')||'—'}`,
        user: nome,
      });
    });

    // Processar cotações
    cotacoes.forEach(q => {
      const coord = q.coordenadorNome || '';
      ensureUser(coord, 'compras');
      if (coord && byUser[coord]) {
        if (q.statusCoordenador === 'aprovado') byUser[coord].cotacoesAprovadas++;
        else if (q.statusCoordenador === 'recusado') byUser[coord].cotacoesRecusadas++;
        if (q.statusCoordenador) {
          const dt = q.createdAt?.toDate ? q.createdAt.toDate() : new Date();
          byUser[coord].atividades.push({
            ts: dt,
            tipo: q.statusCoordenador === 'aprovado' ? 'cot-ok' : 'cot-no',
            icon: q.statusCoordenador === 'aprovado' ? '✅' : '❌',
            cor: q.statusCoordenador === 'aprovado' ? 'var(--ok)' : 'var(--danger)',
            bg: q.statusCoordenador === 'aprovado' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.10)',
            desc: `Cotação ${q.statusCoordenador === 'aprovado' ? 'aprovada' : 'recusada'} — ${q.fornecedorNome||'—'}`,
            sub: `R$ ${parseFloat(q.valor||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}`,
            user: coord,
          });
        }
      }
    });

    // ── KPIs globais ───────────────────────────────
    const totalMovs   = movs.length;
    const totalEntradas = movs.filter(m => m.type === 'entrada').length;
    const totalSaidas   = movs.filter(m => m.type !== 'entrada').length;
    const totalPedidos  = orders.length;
    const totalCots     = cotacoes.filter(q => q.statusCoordenador).length;
    const totalTransfs  = transfs.length;
    const periodoLabel  = _prodDays === 1 ? 'hoje' : `últimos ${_prodDays} dias`;

    kpisEl.innerHTML = [
      { label: 'Movimentações', value: totalMovs,    sub: `${totalEntradas} ent · ${totalSaidas} saí`, cor: 'var(--lumen)' },
      { label: 'Pedidos Criados', value: totalPedidos, sub: periodoLabel, cor: '#f59e0b' },
      { label: 'Cotações Processadas', value: totalCots, sub: `no período`, cor: 'var(--ok)' },
      { label: 'Transferências', value: totalTransfs, sub: `no período`, cor: '#a78bfa' },
    ].map(k => `
      <div class="prod-kpi-card">
        <div class="prod-kpi-label">${k.label}</div>
        <div class="prod-kpi-value" style="color:${k.cor};">${k.value}</div>
        <div class="prod-kpi-sub">${k.sub}</div>
      </div>`).join('');

    // ── Kanban por usuário ─────────────────────────
    const entries = Object.entries(byUser);
    if (entries.length === 0) {
      kanban.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);">Nenhum usuário de Compras ou Estoque encontrado.</div>';
    } else {
      const roleCor = { compras: '#14b8a6', estoque: '#f59e0b', outros: 'var(--lumen)' };
      const roleLabel = { compras: '🛒 Compras', estoque: '📦 Estoque' };

      kanban.innerHTML = entries.map(([nome, data]) => {
        const u = data.user;
        const cor = roleCor[u.role] || roleCor.outros;
        const totalAtvs = data.atividades.length;

        // Últimas 5 atividades ordenadas
        const recentes = [...data.atividades]
          .sort((a, b) => b.ts - a.ts).slice(0, 5);

        // Tarefas pendentes para este usuário
        let pendUser = [];
        if (u.role === 'compras') {
          // Pedidos aguardando cotação deste coordenador
          const semCot = pendentes.filter(p => p.status === 'pending').slice(0, 3);
          semCot.forEach(p => pendUser.push({
            icon: '⏳', cor: '#f59e0b', bg: 'rgba(245,158,11,0.1)',
            desc: `Pedido ${p.code||p.id} aguarda cotação`,
            sub: p.house || '—',
          }));
          // Cotações aprovadas aguardando NF
          const semNF = pendentes.filter(p => p.status === 'liberado' && !p.nfValor).slice(0, 3);
          semNF.forEach(p => pendUser.push({
            icon: '📄', cor: '#a78bfa', bg: 'rgba(167,139,250,0.1)',
            desc: `Pedido ${p.code||p.id} aguarda NF/Boleto`,
            sub: p.house || '—',
          }));
        } else if (u.role === 'estoque') {
          // Pedidos liberados aguardando recebimento/entrada
          const liberados = pendentes.filter(p => p.status === 'liberado').slice(0, 4);
          liberados.forEach(p => pendUser.push({
            icon: '📦', cor: 'var(--ok)', bg: 'rgba(34,197,94,0.1)',
            desc: `Pedido ${p.code||p.id} aguarda entrada`,
            sub: p.house || '—',
          }));
        }
        pendUser = pendUser.slice(0, 4);

        const statChips = [
          data.movEntradas > 0 ? `<span class="prod-stat-chip" style="color:var(--ok);">📥 ${data.movEntradas} entradas</span>` : '',
          data.movSaidas   > 0 ? `<span class="prod-stat-chip" style="color:var(--danger);">📤 ${data.movSaidas} saídas</span>` : '',
          data.transfs     > 0 ? `<span class="prod-stat-chip" style="color:#a78bfa;">🔄 ${data.transfs} transf.</span>` : '',
          data.pedidosCriados > 0 ? `<span class="prod-stat-chip" style="color:#f59e0b;">📋 ${data.pedidosCriados} pedidos</span>` : '',
          data.cotacoesAprovadas > 0 ? `<span class="prod-stat-chip" style="color:var(--ok);">✅ ${data.cotacoesAprovadas} cot. ap.</span>` : '',
          data.cotacoesRecusadas > 0 ? `<span class="prod-stat-chip" style="color:var(--danger);">❌ ${data.cotacoesRecusadas} cot. rec.</span>` : '',
        ].filter(Boolean).join('');

        const ativFeed = recentes.length > 0
          ? recentes.map(a => `
            <div class="prod-task-item">
              <div class="prod-task-dot" style="background:${a.cor};"></div>
              <div style="flex:1;">
                <div style="font-weight:600;color:var(--text);">${a.desc}</div>
                <div style="color:var(--text-muted);font-size:11px;">${a.sub} · ${a.ts.toLocaleString('pt-BR',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'})}</div>
              </div>
            </div>`).join('')
          : '<div class="prod-empty">Sem atividades no período</div>';

        const pendFeed = pendUser.length > 0
          ? pendUser.map(p => `
            <div class="prod-task-item">
              <div class="prod-task-dot" style="background:${p.cor};"></div>
              <div style="flex:1;">
                <div style="font-weight:600;color:var(--text);">${p.desc}</div>
                <div style="color:var(--text-muted);font-size:11px;">${p.sub}</div>
              </div>
            </div>`).join('')
          : '<div class="prod-empty">Sem pendências 🎉</div>';

        return `
          <div class="prod-user-col">
            <div class="prod-user-header">
              <div style="display:flex;align-items:center;gap:10px;">
                <div style="width:36px;height:36px;border-radius:10px;background:${cor}22;border:1.5px solid ${cor};
                  display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:${cor};">
                  ${nome.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div class="prod-user-name">${nome}</div>
                  <span style="font-size:10px;font-weight:700;background:${cor}22;color:${cor};padding:2px 8px;border-radius:10px;">
                    ${roleLabel[u.role] || u.role}
                  </span>
                </div>
                <div style="margin-left:auto;text-align:right;">
                  <div style="font-size:22px;font-weight:800;color:${cor};">${totalAtvs}</div>
                  <div style="font-size:10px;color:var(--text-muted);">atividades</div>
                </div>
              </div>
              <div class="prod-user-stats">${statChips || '<span style="font-size:11px;color:var(--text-muted);">Sem atividades no período</span>'}</div>
            </div>
            <div class="prod-section-title">⏳ PENDÊNCIAS (${pendUser.length})</div>
            ${pendFeed}
            <div class="prod-section-title">⚡ ÚLTIMAS ATIVIDADES</div>
            ${ativFeed}
          </div>`;
      }).join('');
    }

    // ── Feed global (todas as atividades) ─────────
    const allAtivs = Object.values(byUser)
      .flatMap(u => u.atividades)
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 60);

    feedCnt.textContent = `${allAtivs.length} eventos`;

    feedEl.innerHTML = allAtivs.length > 0
      ? allAtivs.map(a => `
        <div class="prod-feed-item">
          <div class="prod-feed-icon" style="background:${a.bg};">${a.icon}</div>
          <div style="flex:1;">
            <div class="prod-feed-user">${a.user}</div>
            <div class="prod-feed-desc">${a.desc}</div>
            <div class="prod-feed-time">${a.ts.toLocaleString('pt-BR')} · ${a.sub}</div>
          </div>
        </div>`).join('')
      : '<div style="text-align:center;padding:32px;color:var(--text-muted);">Nenhuma atividade registrada no período.</div>';

  } catch(e) {
    console.error('loadProdutividade error:', e);
    kanban.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:32px;color:var(--danger);">Erro: ${e.message}</div>`;
  }
}

