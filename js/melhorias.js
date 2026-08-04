// Extraído de index.html (bloco Melhorias: notificações, busca global, wrappers) em 2026-07-27
// FUNÇÃO PARA ABRIR E LIMPAR O FORMULÁRIO
async function abrirModalOrcVar(solId, codigo, material, quantidade, unidade) {
  document.getElementById('orc-var-sol-id').value = solId;
  document.getElementById('orc-var-sol-label').textContent = `${codigo} — ${material} (${quantidade} ${unidade})`;
  document.getElementById('orc-var-qtd-ref').textContent = `Qtd: ${quantidade} ${unidade}`;

  // Limpa todos os campos das 5 cotações antes de abrir
  for (let i = 1; i <= 5; i++) {
    document.getElementById(`orc-var-forn-${i}`).value = '';
    document.getElementById(`orc-var-total-${i}`).value = '';
    document.getElementById(`orc-var-prazo-${i}`).value = '';
    document.getElementById(`orc-var-obs-${i}`).value = '';
  }

  // Se já existir orçamento para esta solicitação, carrega os dados
  try {
    const snap = await db.collection('var_orcamentos').where('solicitacaoId', '==', solId).limit(1).get();
    if (!snap.empty) {
      const data = snap.docs[0].data();
      const orcId = snap.docs[0].id;
      document.getElementById('orc-var-sol-id').dataset.orcId = orcId; // Guarda o ID para update
      if (data.cotacoes && Array.isArray(data.cotacoes)) {
        data.cotacoes.forEach((c, index) => {
          const i = index + 1;
          if (i <= 5) {
            document.getElementById(`orc-var-forn-${i}`).value = c.fornecedor || '';
            document.getElementById(`orc-var-total-${i}`).value = c.valorTotal || '';
            document.getElementById(`orc-var-prazo-${i}`).value = c.prazoEntrega || '';
            document.getElementById(`orc-var-obs-${i}`).value = c.obs || '';
          }
        });
      }
    } else {
      delete document.getElementById('orc-var-sol-id').dataset.orcId;
    }
  } catch (e) {
    console.error("Erro ao buscar cotações existentes:", e);
  }
  
  openModal('modal-orc-var');
}

// FUNÇÃO PARA SALVAR NO BANCO DE DADOS (ATÉ 5 COTAÇÕES)
async function salvarOrcVar() {
  const solId = document.getElementById('orc-var-sol-id').value;
  const listaCotacoes = [];

  for (let i = 1; i <= 5; i++) {
    const forn = document.getElementById(`orc-var-forn-${i}`).value.trim();
    const valor = parseFloat(document.getElementById(`orc-var-total-${i}`).value) || 0;
    const prazo = document.getElementById(`orc-var-prazo-${i}`).value.trim();
    const obs = document.getElementById(`orc-var-obs-${i}`).value.trim();

    if (forn || valor > 0) {
      listaCotacoes.push({
        fornecedor: forn,
        valorTotal: valor,
        prazoEntrega: prazo,
        obs: obs
      });
    }
  }

  if (listaCotacoes.length === 0) {
    showToast('⚠️ Preencha pelo menos uma cotação!');
    return;
  }

  const btn = document.getElementById('btn-salvar-orc-var');
  btn.disabled = true; 
  btn.textContent = 'Salvando...';

  try {
    const existingOrcId = document.getElementById('orc-var-sol-id').dataset.orcId;
    
    const payload = {
      solicitacaoId: solId,
      cotacoes: listaCotacoes,
      status: 'Pendente',
      registradoPor: currentUserData?.name || '',
      registradoUid: currentUser?.uid || '',
      criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    };

    if (existingOrcId) {
      await db.collection('var_orcamentos').doc(existingOrcId).set(payload, { merge: true });
    } else {
      await db.collection('var_orcamentos').add(payload);
    }

    closeModal('modal-orc-var');
    showToast('✅ Cotações registradas com sucesso!');
    if (typeof loadVarOrcamento === 'function') loadVarOrcamento();
  } catch(e) { 
    showToast('❌ Erro: ' + e.message); 
  } finally { 
    btn.disabled = false; 
    btn.textContent = 'Salvar Todas as Cotações'; 
  }
}

// NOVA FUNÇÃO: PARA O GESTOR ESCOLHER E APROVAR UMA DAS OPÇÕES
async function aprovarOpcaoUnica(orcId) {
  const cargosGestao = ['admin', 'gerente', 'diretor', 'coordenador'];
  const meuCargo = currentUserData?.role || '';

  if (!cargosGestao.includes(meuCargo)) {
    showToast('⚠️ Apenas gestores podem autorizar compras.');
    return;
  }

  if (!confirm(`Deseja aprovar este conjunto de cotações?`)) return;

  try {
    await db.collection('var_orcamentos').doc(orcId).update({
      status: 'Aprovada',
      aprovadoPor: currentUserData?.name || '',
      aprovadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // Opcional: atualizar o status da solicitação vinculada
    const orcDoc = await db.collection('var_orcamentos').doc(orcId).get();
    if (orcDoc.exists) {
      const solId = orcDoc.data().solicitacaoId;
      await db.collection('var_solicitacoes').doc(solId).update({
        status: 'aprovada'
      });
    }

    showToast('✅ Cotação aprovada!');
    loadVarOrcamento();
  } catch (e) {
    showToast('Erro: ' + e.message);
  }
}

async function aprovarOpcaoEspecifica(orcId, indice, valor) {
  const cargosGestao = ['admin', 'gerente', 'diretor', 'coordenador'];
  const meuCargo = currentUserData?.role || '';

  if (!cargosGestao.includes(meuCargo)) {
    showToast('⚠️ Apenas gestores podem autorizar compras.');
    return;
  }

  if (!confirm(`Confirmar aprovação da Opção ${indice + 1} no valor de R$ ${valor.toFixed(2)}?`)) return;

  try {
    await db.collection('var_orcamentos').doc(orcId).update({
      status: 'Aprovado',
      opcaoEscolhida: indice, // Salva qual das 5 foi a vencedora
      aprovadoPor: currentUserData?.name || '',
      aprovadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast('✅ Compra autorizada!');
    loadVarOrcamento();
  } catch (e) {
    showToast('Erro: ' + e.message);
  }
}

async function excluirOrcVar(orcId, solId) {
  if (!confirm('Excluir este conjunto de cotações?')) return;
  await db.collection('var_orcamentos').doc(orcId).delete();
  showToast('Cotação removida.');
  if (typeof loadVarOrcamento === 'function') loadVarOrcamento();
}

// ═══════════════════════════════════════════════════════════════════
// 🔔  SISTEMA DE NOTIFICAÇÕES IN-APP
// ═══════════════════════════════════════════════════════════════════
let _notifList = JSON.parse(sessionStorage.getItem('lumen_notifs') || '[]');

function adicionarNotificacao(titulo, msg, tipo, pagina) {
  const n = { id: Date.now(), titulo, msg, tipo: tipo||'info', pagina, lida: false, ts: new Date().toLocaleString('pt-BR') };
  _notifList.unshift(n);
  if (_notifList.length > 50) _notifList = _notifList.slice(0,50);
  sessionStorage.setItem('lumen_notifs', JSON.stringify(_notifList));
  renderNotifBadge();
  renderNotifList();
}

function renderNotifBadge() {
  const nao_lidas = _notifList.filter(n => !n.lida).length;
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  if (nao_lidas > 0) { badge.style.display='block'; badge.textContent = nao_lidas > 9 ? '9+' : nao_lidas; }
  else { badge.style.display='none'; }
}

function renderNotifList() {
  const el = document.getElementById('notif-list');
  if (!el) return;
  if (_notifList.length === 0) {
    el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">Nenhuma notificação</div>';
    return;
  }
  const icons = { info:'ℹ️', warn:'⚠️', danger:'🔴', ok:'✅' };
  el.innerHTML = _notifList.slice(0,20).map(n => `
    <div onclick="notifClick('${n.id}')" style="padding:10px 16px;cursor:pointer;border-bottom:1px solid var(--border);background:${n.lida?'transparent':'var(--lumen-lt)'};transition:background 0.2s;">
      <div style="display:flex;gap:8px;align-items:flex-start;">
        <span>${icons[n.tipo]||'ℹ️'}</span>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:${n.lida?'400':'700'};color:var(--text);">${n.titulo}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${n.msg}</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:4px;">${n.ts}</div>
        </div>
      </div>
    </div>`).join('');
}

function notifClick(id) {
  const n = _notifList.find(x => x.id == id);
  if (!n) return;
  n.lida = true;
  sessionStorage.setItem('lumen_notifs', JSON.stringify(_notifList));
  renderNotifBadge();
  renderNotifList();
  if (n.pagina) { toggleNotifPanel(); goPage(n.pagina); }
}

function toggleNotifPanel() {
  const p = document.getElementById('notif-panel');
  if (!p) return;
  const vis = p.style.display !== 'none';
  p.style.display = vis ? 'none' : 'block';
  if (!vis) {
    renderNotifList();
    _notifList.forEach(n => n.lida = true);
    sessionStorage.setItem('lumen_notifs', JSON.stringify(_notifList));
    setTimeout(renderNotifBadge, 3000);
  }
}

function limparNotificacoes() {
  _notifList = [];
  sessionStorage.setItem('lumen_notifs', JSON.stringify(_notifList));
  renderNotifBadge();
  renderNotifList();
}

// Fecha painel ao clicar fora
document.addEventListener('click', e => {
  const panel = document.getElementById('notif-panel');
  const btn   = document.getElementById('btn-notif');
  if (panel && btn && !panel.contains(e.target) && !btn.contains(e.target)) {
    panel.style.display = 'none';
  }
});

// Monitora mudanças de status em pedidos e variedades para notificar
// Os unsubscribes são guardados em window._notifListeners para cancelamento no logout
function iniciarMonitorNotificacoes() {
  if (!db || !currentUser) return;

  // Cancela listeners anteriores caso esta função seja chamada mais de uma vez
  if (window._notifListeners) {
    window._notifListeners.forEach(fn => fn());
  }
  window._notifListeners = [];

  // Pedidos em análise de estoque
  window._notifListeners.push(
    db.collection('orders').where('status','==','aguardando_estoque')
      .onSnapshot(snap => {
        if (snap.docChanges().some(c => c.type === 'added')) {
          const count = snap.size;
          if (count > 0) adicionarNotificacao('Pedidos aguardando avaliação', `${count} pedido(s) aguardando análise de estoque`, 'warn', 'all-orders');
        }
      })
  );
  // Orçamentos pendentes de aprovação
  window._notifListeners.push(
    db.collection('orders').where('status','==','andamento')
      .onSnapshot(snap => {
        if (snap.docChanges().some(c => c.type === 'added')) {
          const count = snap.size;
          if (count > 0) adicionarNotificacao('Orçamentos para aprovar', `${count} pedido(s) com orçamentos pendentes`, 'info', 'orc-pendentes');
        }
      })
  );
  // Variedades - novas pendentes
  window._notifListeners.push(
    db.collection('var_solicitacoes').where('status','==','pendente')
      .onSnapshot(snap => {
        if (snap.docChanges().some(c => c.type === 'added')) {
          const count = snap.size;
          if (count > 0) adicionarNotificacao('Variedades para avaliar', `${count} solicitação(ões) pendentes`, 'warn', 'var-solicitacoes');
        }
      })
  );
}

// ═══════════════════════════════════════════════════════════════════
// 🔍  BUSCA GLOBAL
// ═══════════════════════════════════════════════════════════════════
let _globalSearchTimer = null;

async function globalSearchInput(q) {
  clearTimeout(_globalSearchTimer);
  const res = document.getElementById('global-search-results');
  if (!res) return;
  if (!q || q.length < 2) { res.style.display='none'; return; }
  _globalSearchTimer = setTimeout(() => _runGlobalSearch(q), 300);
}

async function _runGlobalSearch(q) {
  const res = document.getElementById('global-search-results');
  if (!res) return;
  res.style.display = 'block';
  res.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-muted);font-size:13px;">🔍 Buscando...</div>';
  const ql = q.toLowerCase();
  const resultados = [];
  try {
    // Pedidos
    const ordSnap = await db.collection('orders').orderBy('code').startAt(q.toUpperCase()).endAt(q.toUpperCase()+'\uf8ff').limit(5).get();
    ordSnap.docs.forEach(d => {
      const o = d.data();
      resultados.push({ icon:'📋', label: o.code + ' — ' + (o.house||''), sub: o.requesterName||'', page:'all-orders', docId: d.id });
    });
    // Pedidos por casa
    const ordHouseSnap = await db.collection('orders').where('house','>=',q).where('house','<=',q+'\uf8ff').limit(3).get();
    ordHouseSnap.docs.forEach(d => {
      const o = d.data();
      if (!resultados.find(r => r.docId===d.id))
        resultados.push({ icon:'🏠', label: o.code + ' — ' + (o.house||''), sub: 'Pedido', page:'all-orders', docId: d.id });
    });
    // Fornecedores
    const supSnap = await db.collection('suppliers').orderBy('nome').startAt(q).endAt(q+'\uf8ff').limit(5).get();
    supSnap.docs.forEach(d => {
      const s = d.data();
      resultados.push({ icon:'🏢', label: s.nome, sub: s.cnpj||s.contato||'', page:'fornecedores', docId: d.id });
    });
    // Variedades
    const varSnap = await db.collection('var_solicitacoes').orderBy('codigo').startAt(q.toUpperCase()).endAt(q.toUpperCase()+'\uf8ff').limit(3).get();
    varSnap.docs.forEach(d => {
      const v = d.data();
      resultados.push({ icon:'🌿', label: v.codigo + ' — ' + (v.material||''), sub: v.setor||'', page:'var-solicitacoes', docId: d.id });
    });
  } catch(e) {}

  if (resultados.length === 0) {
    res.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-muted);font-size:13px;">Nenhum resultado encontrado</div>';
    return;
  }
  res.innerHTML = resultados.map(r => `
    <div onclick="globalSearchGoTo('${r.page}')" style="padding:10px 14px;cursor:pointer;display:flex;gap:10px;align-items:center;border-bottom:1px solid var(--border);" onmouseover="this.style.background='var(--lumen-lt)'" onmouseout="this.style.background=''">
      <span style="font-size:18px;">${r.icon}</span>
      <div>
        <div style="font-size:13px;font-weight:600;color:var(--text);">${r.label}</div>
        ${r.sub ? `<div style="font-size:11px;color:var(--text-muted);">${r.sub}</div>` : ''}
      </div>
    </div>`).join('');
}

function globalSearchGoTo(page) {
  hideGlobalSearch();
  document.getElementById('global-search-input').value = '';
  goPage(page);
}

function hideGlobalSearch() {
  const res = document.getElementById('global-search-results');
  if (res) res.style.display = 'none';
}

// ═══════════════════════════════════════════════════════════════════
// 💾  PERSISTÊNCIA DE FILTROS
// ═══════════════════════════════════════════════════════════════════
function salvarFiltro(pagina, chave, valor) {
  try { sessionStorage.setItem(`filtro_${pagina}_${chave}`, valor); } catch(e) {}
}
function carregarFiltro(pagina, chave, defVal) {
  try { return sessionStorage.getItem(`filtro_${pagina}_${chave}`) || defVal; } catch(e) { return defVal; }
}
function persistirFiltros(pagina, ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const saved = carregarFiltro(pagina, id, null);
    if (saved !== null) el.value = saved;
    el.addEventListener('change', () => salvarFiltro(pagina, id, el.value));
    el.addEventListener('input',  () => salvarFiltro(pagina, id, el.value));
  });
}

// Aplica persistência ao inicializar cada página
const _origGoPage = goPage;
function hookFiltrosPersistencia(page) {
  const mapaFiltros = {
    'all-orders':       ['filter-house','filter-cat','filter-entrega'],
    'var-solicitacoes': ['var-filtro-setor','var-filtro-status','var-filtro-prioridade'],
    'var-orcamento':    ['var-orc-filtro-setor','var-orc-filtro-status','var-orc-filtro-periodo'],
    'stock-view':       ['sv-cat','sv-casa'],
    'prices':           ['price-cat','price-city'],
    'orc-pendentes':    ['orc-cat','orc-house'],
    'transferencias':   ['transf-filter-casa'],
    'indicadores':      ['ind-cat','ind-city'],
    'kanban':           ['kanban-filtro-role','kanban-filtro-urgencia'],
    'mov-history':      ['hist-filtro-casa','hist-filtro-tipo','hist-filtro-de','hist-filtro-ate','hist-filtro-user'],
  };
  if (mapaFiltros[page]) setTimeout(() => persistirFiltros(page, mapaFiltros[page]), 200);
}

// Intercepta goPage para aplicar persistência
(function() {
  const orig = window.goPage;
  window.goPage = function(page) {
    orig(page);
    hookFiltrosPersistencia(page);
  };
})();

// ═══════════════════════════════════════════════════════════════════
// 📞  WHATSAPP EM FORNECEDORES
// ═══════════════════════════════════════════════════════════════════
function abrirWhatsAppFornecedor(tel, nome) {
  if (!tel) { showToast('Fornecedor sem telefone cadastrado.'); return; }
  const num = tel.replace(/\D/g,'');
  const full = num.startsWith('55') ? num : '55' + num;
  const msg = encodeURIComponent(`Olá ${nome||''}, estou entrando em contato pelo Sistema Suprimentos Obra Lumen.`);
  window.open(`https://wa.me/${full}?text=${msg}`, '_blank');
}

// ═══════════════════════════════════════════════════════════════════
// 🚦  PIPELINE VISUAL NAS VARIEDADES
// ═══════════════════════════════════════════════════════════════════
const VAR_PIPELINE = [
  { key:'pendente',         label:'Pendente',        icon:'🟡' },
  { key:'em_proposta',      label:'Em Proposta',     icon:'📋' },
  { key:'pedido_liberado',  label:'Ped. Liberado',   icon:'🟢' },
  { key:'compra_realizada', label:'Compra Realizada',icon:'✅' },
  { key:'concluido',        label:'Concluído',       icon:'🏁' },
];

function buildVarPipelineBar(currentStatus) {
  if (currentStatus === 'cancelado') {
    return `<div style="padding:6px 0;text-align:center;"><span class="badge badge-danger">⛔ Cancelado</span></div>`;
  }
  // Normaliza status legados
  if (currentStatus === 'comprada') currentStatus = 'compra_realizada';
  if (currentStatus === 'entregue') currentStatus = 'concluido';
  const idx = VAR_PIPELINE.findIndex(s => s.key === currentStatus);
  return `<div style="display:flex;gap:2px;align-items:center;flex-wrap:wrap;margin:8px 0;">` +
    VAR_PIPELINE.map((s,i) => {
      const done    = i < idx;
      const active  = i === idx;
      const bg      = active ? 'var(--lumen)' : done ? 'var(--ok)' : 'var(--border)';
      const color   = (active||done) ? '#fff' : 'var(--text-muted)';
      return `<div style="display:flex;align-items:center;gap:2px;">
        <div style="background:${bg};color:${color};padding:3px 8px;border-radius:12px;font-size:10px;font-weight:${active?'700':'500'};white-space:nowrap;">${s.icon} ${s.label}</div>
        ${i < VAR_PIPELINE.length-1 ? `<span style="color:var(--text-muted);font-size:10px;">›</span>` : ''}
      </div>`;
    }).join('') + '</div>';
}

// ═══════════════════════════════════════════════════════════════════
// 📬  CONFIRMAÇÃO DE RECEBIMENTO EM TRANSFERÊNCIAS
// ═══════════════════════════════════════════════════════════════════
async function confirmarRecebimentoTransf(docId) {
  if (!confirm('Confirmar que os itens desta transferência foram recebidos fisicamente?')) return;
  try {
    await db.collection('transferencias').doc(docId).update({
      recebido: true,
      recebidoEm: firebase.firestore.FieldValue.serverTimestamp(),
      recebidoPor: currentUserData.name || '',
    });
    registrarAuditoria('transferencias', docId, 'recebimento_confirmado', 'Recebimento físico confirmado');
    showToast('✅ Recebimento confirmado!');
    loadTransferencias();
  } catch(e) { showToast('Erro: ' + e.message); }
}

// ═══════════════════════════════════════════════════════════════════
// 📈  HISTÓRICO DE PREÇOS POR PRODUTO
// ═══════════════════════════════════════════════════════════════════
async function verHistoricoPreco(prodId, prodNome, catKey, cidade) {
  try {
    const snap = await db.collection('prices_historico')
      .where('prodId','==',prodId).where('city','==',cidade).where('cat','==',catKey)
      .orderBy('savedAt','asc').limit(12).get();
    if (snap.empty) { showToast('Sem histórico de preços para este produto.'); return; }
    const dados = snap.docs.map(d => ({ data: d.data().savedAt?.toDate?.()?.toLocaleDateString('pt-BR') || '—', preco: d.data().price }));
    const body = `<div style="font-weight:700;margin-bottom:12px;">📈 ${prodNome} — ${cidade}</div>
      <table style="width:100%;border-collapse:collapse;">
        <tr style="background:var(--lumen-lt);">
          <th style="padding:8px;text-align:left;font-size:12px;">Data</th>
          <th style="padding:8px;text-align:right;font-size:12px;">Preço</th>
          <th style="padding:8px;text-align:right;font-size:12px;">Variação</th>
        </tr>
        ${dados.map((d,i) => {
          const prev = i > 0 ? dados[i-1].preco : null;
          const var_ = prev ? ((d.preco-prev)/prev*100).toFixed(1) : '—';
          const color = prev ? (d.preco>prev?'var(--danger)':d.preco<prev?'var(--ok)':'var(--text-muted)') : 'var(--text-muted)';
          return `<tr style="border-bottom:1px solid var(--border);">
            <td style="padding:7px 8px;font-size:12px;">${d.data}</td>
            <td style="padding:7px 8px;font-size:12px;text-align:right;font-weight:600;">R$ ${parseFloat(d.preco).toFixed(2).replace('.',',')}</td>
            <td style="padding:7px 8px;font-size:12px;text-align:right;color:${color};">${var_ !== '—' ? (d.preco>prev?'▲':'▼')+' '+Math.abs(var_)+'%' : '—'}</td>
          </tr>`;
        }).join('')}
      </table>`;
    document.getElementById('modal-transf-body').innerHTML = body;
    document.getElementById('modal-transf-title').textContent = 'Histórico de Preços';
    const btnPdf = document.getElementById('btn-transf-pdf');
    if (btnPdf) btnPdf.style.display = 'none';
    openModal('modal-transf-detail');
  } catch(e) { showToast('Erro ao buscar histórico: ' + e.message); }
}

// Salva histórico de preços ao salvar preços
const _origSavePrices = window.savePrices;
if (typeof savePrices === 'function') {
  const __origSP = savePrices;
  window.savePrices = async function() {
    const cat  = document.getElementById('price-cat')?.value;
    const city = document.getElementById('price-city')?.value;
    if (cat && city) {
      const prods = CATEGORIAS[cat]?.produtos || [];
      const batch2 = db.batch();
      prods.forEach(p => {
        const inp = document.getElementById(`price-inp-${p.id}`);
        if (!inp) return;
        const price = parseFloat(inp.value);
        if (isNaN(price) || price <= 0) return;
        const ref = db.collection('prices_historico').doc();
        batch2.set(ref, { prodId: p.id, cat, city, price, savedAt: firebase.firestore.FieldValue.serverTimestamp(), savedBy: currentUserData.name || '' });
      });
      try { await batch2.commit(); } catch(e) {}
    }
    return __origSP();
  };
}

// ═══════════════════════════════════════════════════════════════════
// 📝  AUDITORIA — LOG DE AÇÕES
// ═══════════════════════════════════════════════════════════════════
async function registrarAuditoria(colecao, docId, acao, detalhe) {
  try {
    await db.collection('audit_logs').add({
      colecao, docId, acao, detalhe,
      usuario: currentUserData.name || '',
      usuarioUid: currentUser?.uid || '',
      ts: firebase.firestore.FieldValue.serverTimestamp(),
      data: new Date().toISOString().slice(0,10),
    });
  } catch(e) { /* silencioso */ }
}

// Intercepta mudanças de status de pedidos para auditoria
const _origAvancarStatus = window.avancarStatusVar;
if (typeof avancarStatusVar === 'function') {
  const __origAVS = avancarStatusVar;
  window.avancarStatusVar = async function(docId, statusAtual) {
    const novo = proximoStatusVar(statusAtual, 'avancar');
    await registrarAuditoria('var_solicitacoes', docId, 'status_alterado', `${statusAtual} → ${novo}`);
    return __origAVS(docId, statusAtual);
  };
}

// ═══════════════════════════════════════════════════════════════════
// ✅  APROVAÇÃO FORMAL DE ORÇAMENTOS DE VARIEDADES
// ═══════════════════════════════════════════════════════════════════
async function aprovarOrcamentoVar(orcId, solId) {
  if (!confirm('Confirmar aprovação deste orçamento?')) return;
  try {
    await db.collection('var_orcamentos').doc(orcId).update({
      status: 'aprovado',
      aprovadoEm: firebase.firestore.FieldValue.serverTimestamp(),
      aprovadoPor: currentUserData.name || '',
    });
    // Avança solicitação para pedido_liberado
    await db.collection('var_solicitacoes').doc(solId).update({
      status: 'pedido_liberado',
      pedido_liberadoEm: firebase.firestore.FieldValue.serverTimestamp(),
      pedido_liberadoPor: currentUserData.name || '',
    });
    await registrarAuditoria('var_orcamentos', orcId, 'orcamento_aprovado', 'Orçamento aprovado formalmente');
    adicionarNotificacao('Orçamento Aprovado', 'Orçamento de variedade aprovado — solicitação avançou para Pedido Liberado', 'ok', 'var-orcamento');
    showToast('✅ Orçamento aprovado! Solicitação avançou para Pedido Liberado.');
    loadVarOrcamento();
    atualizarBadgeVar();
  } catch(e) { showToast('Erro: ' + e.message); }
}

async function recusarOrcamentoVar(orcId) {
  const motivo = prompt('Motivo da recusa (opcional):');
  if (motivo === null) return; // cancelou
  try {
    await db.collection('var_orcamentos').doc(orcId).update({
      status: 'recusado',
      recusadoEm: firebase.firestore.FieldValue.serverTimestamp(),
      recusadoPor: currentUserData.name || '',
      motivoRecusa: motivo || '',
    });
    await registrarAuditoria('var_orcamentos', orcId, 'orcamento_recusado', motivo || 'Sem motivo informado');
    showToast('⛔ Orçamento recusado.');
    loadVarOrcamento();
  } catch(e) { showToast('Erro: ' + e.message); }
}

// ═══════════════════════════════════════════════════════════════════
// 🚀  INICIALIZAÇÃO DAS MELHORIAS
// ═══════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  renderNotifBadge();
  setTimeout(() => {
    if (typeof currentUser !== 'undefined' && currentUser) iniciarMonitorNotificacoes();
    else {
      const _w = setInterval(() => {
        if (typeof currentUser !== 'undefined' && currentUser) { clearInterval(_w); iniciarMonitorNotificacoes(); }
      }, 1000);
    }
  }, 2000);
});

