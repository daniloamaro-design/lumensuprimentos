/* ══════════════════════════════════════════════════════════════════════
   js/18-erp.js — Shell do ERP unificado (U3)
   Alterna entre os módulos Suprimentos · Passagens · Fretes na sidebar.
   As seções da sidebar têm data-modulo; o CSS mostra só as do módulo ativo
   (nav#sidebar[data-mod="X"]). Aqui só trocamos o data-mod e navegamos para
   a primeira página visível do módulo escolhido. O login sempre começa em
   Suprimentos (definido em showApp, js/02-auth.js).
   ══════════════════════════════════════════════════════════════════════ */

function selecionarModulo(m) {
  const nav = document.getElementById('sidebar');
  if (!nav) return;
  nav.dataset.mod = m;

  // botão ativo
  document.querySelectorAll('.modulo-btn').forEach(b => {
    b.classList.toggle('ativo', b.dataset.mod === m);
  });

  // vai para a 1ª página visível (seção não escondida por perfil) do módulo
  const secoes = nav.querySelectorAll(`.sidebar-section[data-modulo="${m}"]`);
  for (const sec of secoes) {
    if (sec.offsetParent === null) continue;           // seção escondida por perfil
    const item = sec.querySelector('.sidebar-item[data-page]');
    if (item && item.dataset.page) { goPage(item.dataset.page); return; }
  }
}
window.selecionarModulo = selecionarModulo;

/* ══════════════════════════════════════════════════════════════════════
   MÓDULO FRETES (nativo) — lê/grava as tabelas fretes / fretes_metas e os
   freteiros em suppliers (tipos contém 'frete'), via o shim js/00-db.js.
   ══════════════════════════════════════════════════════════════════════ */

// helpers locais
function frtBRL(n) {
  return 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function frtDataBR(v) {
  if (!v) return '—';
  if (v.toDate) v = v.toDate();
  if (v instanceof Date) return v.toLocaleDateString('pt-BR');
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v);
}
function frtEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function frtMesDaData(v) { // 'YYYY-MM' a partir do campo data/created_at do frete
  if (!v) return '';
  if (v.toDate) v = v.toDate();
  if (v instanceof Date) return v.toISOString().slice(0, 7);
  const m = String(v).match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : '';
}
function frtBadgePag(sp) {
  const map = { pago: ['✅ Pago', 'var(--ok,#16a34a)'], pendente: ['⏳ Pendente', 'var(--warn,#d97706)'], parcial: ['◑ Parcial', 'var(--lumen)'] };
  const [txt, cor] = map[sp] || ['—', 'var(--text-muted)'];
  return `<span style="font-weight:600;color:${cor};">${txt}</span>`;
}

let _fretesCache = [];   // fretes carregados (objetos do shim, camelCase)

async function loadFrtLista() {
  const tb = document.getElementById('frt-tbody');
  if (tb) tb.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted);">Carregando…</td></tr>';
  try {
    const snap = await db.collection('fretes').get();
    _fretesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // ordena por data desc (fallback createdAt)
    _fretesCache.sort((a, b) => String(b.data || b.createdAt || '').localeCompare(String(a.data || a.createdAt || '')));
    // popula filtro de freteiros com os nomes presentes
    const nomes = [...new Set(_fretesCache.map(f => f.freteiroNome).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const sel = document.getElementById('frt-f-freteiro');
    if (sel) sel.innerHTML = '<option value="">Todos</option>' + nomes.map(n => `<option value="${frtEsc(n)}">${frtEsc(n)}</option>`).join('');
    renderFrtLista();
  } catch (e) {
    console.error('loadFrtLista', e);
    if (tb) tb.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--danger,#dc2626);">Erro ao carregar fretes: ${frtEsc(e.message)}</td></tr>`;
  }
}
window.loadFrtLista = loadFrtLista;

function renderFrtLista() {
  const busca = (document.getElementById('frt-f-busca')?.value || '').toLowerCase().trim();
  const fpag = document.getElementById('frt-f-pag')?.value || '';
  const ffret = document.getElementById('frt-f-freteiro')?.value || '';
  const fmes = document.getElementById('frt-f-mes')?.value || '';

  const lista = _fretesCache.filter(f => {
    if (fpag && (f.statusPag || '') !== fpag) return false;
    if (ffret && (f.freteiroNome || '') !== ffret) return false;
    if (fmes && frtMesDaData(f.data || f.createdAt) !== fmes) return false;
    if (busca) {
      const alvo = `${f.code || ''} ${f.freteiroNome || ''} ${f.origem || ''} ${f.destino || ''} ${f.motivo || ''}`.toLowerCase();
      if (!alvo.includes(busca)) return false;
    }
    return true;
  });

  // KPIs
  const total = lista.reduce((s, f) => s + (Number(f.valor) || 0), 0);
  const pago = lista.filter(f => f.statusPag === 'pago').reduce((s, f) => s + (Number(f.valor) || 0), 0);
  const pend = total - pago;
  document.getElementById('frt-kpi-qtd').textContent = lista.length;
  document.getElementById('frt-kpi-total').textContent = frtBRL(total);
  document.getElementById('frt-kpi-pago').textContent = frtBRL(pago);
  document.getElementById('frt-kpi-pendente').textContent = frtBRL(pend);

  const tb = document.getElementById('frt-tbody');
  if (!tb) return;
  if (!lista.length) {
    tb.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted);">Nenhum frete encontrado.</td></tr>';
    return;
  }
  tb.innerHTML = lista.map(f => `
    <tr>
      <td>${frtEsc(f.code || '—')}</td>
      <td>${frtDataBR(f.data || f.createdAt)}</td>
      <td>${frtEsc(f.freteiroNome || '—')}</td>
      <td style="max-width:280px;">${frtEsc(f.origem || '—')} <span style="color:var(--text-muted);">→</span> ${frtEsc(f.destino || '—')}</td>
      <td style="text-align:right;">${frtBRL(f.valor)}</td>
      <td>${frtBadgePag(f.statusPag)}</td>
      <td style="text-align:right;white-space:nowrap;">
        <button class="btn btn-outline btn-sm" onclick="abrirFreteDetalhe('${f.id}')">Ver</button>
        ${f.statusPag !== 'pago' ? `<button class="btn btn-secondary btn-sm" onclick="frtMarcarPago('${f.id}')">Marcar pago</button>` : ''}
      </td>
    </tr>`).join('');
}
window.renderFrtLista = renderFrtLista;

function abrirFreteDetalhe(id) {
  const f = _fretesCache.find(x => x.id === id);
  if (!f) return;
  document.getElementById('frt-det-titulo').textContent = `Frete ${f.code || ''}`.trim();
  const paradas = Array.isArray(f.paradas) ? f.paradas : [];
  const av = f.avaliacao || null;
  const hist = Array.isArray(f.historico) ? f.historico : [];
  const linha = (rot, val) => `<div><span style="color:var(--text-muted);font-size:13px;">${rot}</span><br>${val}</div>`;
  document.getElementById('frt-det-body').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      ${linha('Data', frtDataBR(f.data || f.createdAt))}
      ${linha('Freteiro', frtEsc(f.freteiroNome || '—'))}
      ${linha('Valor', frtBRL(f.valor))}
      ${linha('Pagamento', frtBadgePag(f.statusPag) + (Number(f.valorPago) ? ` (${frtBRL(f.valorPago)})` : ''))}
    </div>
    ${linha('Origem', frtEsc(f.origem || '—'))}
    ${paradas.length ? linha('Paradas', paradas.map(p => frtEsc(p)).join('<br>')) : ''}
    ${linha('Destino', frtEsc(f.destino || '—'))}
    ${f.motivo ? linha('Motivo', frtEsc(f.motivo)) : ''}
    ${f.obs ? linha('Observações', frtEsc(f.obs)) : ''}
    ${av ? linha('Avaliação', `⭐ ${av.media ?? '—'} ${av.comentario ? '— ' + frtEsc(av.comentario) : ''}`) : ''}
    ${hist.length ? linha('Histórico', hist.map(h => `• ${frtEsc(typeof h === 'string' ? h : (h.texto || h.acao || JSON.stringify(h)))}`).join('<br>')) : ''}
    ${f.statusPag !== 'pago' ? `<div style="text-align:right;"><button class="btn btn-primary" onclick="frtMarcarPago('${f.id}', true)">Marcar como pago</button></div>` : ''}
  `;
  openModal('modal-frete-detalhe');
}
window.abrirFreteDetalhe = abrirFreteDetalhe;

async function frtMarcarPago(id, fecharModalDepois) {
  const f = _fretesCache.find(x => x.id === id);
  if (!f) return;
  if (!confirm(`Marcar o frete ${f.code || ''} como PAGO (${frtBRL(f.valor)})?`)) return;
  try {
    await db.collection('fretes').doc(id).update({
      statusPag: 'pago',
      valorPago: Number(f.valor) || 0,
      updatedBy: (typeof currentUserData !== 'undefined' && currentUserData?.name) || null,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    f.statusPag = 'pago'; f.valorPago = Number(f.valor) || 0;
    showToast('✅ Frete marcado como pago.');
    if (fecharModalDepois) closeModal('modal-frete-detalhe');
    renderFrtLista();
  } catch (e) { console.error(e); showToast('❌ Erro ao atualizar: ' + e.message); }
}
window.frtMarcarPago = frtMarcarPago;

// ── Novo frete ──
async function loadFrtNovoForm() {
  const d = document.getElementById('frt-n-data');
  if (d && !d.value) d.value = new Date().toISOString().slice(0, 10);
  await popularSelectFreteiros('frt-n-freteiro');
}
window.loadFrtNovoForm = loadFrtNovoForm;

async function popularSelectFreteiros(selId) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  try {
    const snap = await db.collection('suppliers').orderBy('nome').get();
    const fret = snap.docs.map(x => ({ id: x.id, ...x.data() })).filter(s => Array.isArray(s.tipos) && s.tipos.includes('frete'));
    sel.innerHTML = '<option value="">Selecione…</option>' +
      fret.map(s => `<option value="${s.id}" data-nome="${frtEsc(s.nome)}">${frtEsc(s.nome)}</option>`).join('');
  } catch (e) { console.error('popularSelectFreteiros', e); }
}

async function salvarNovoFrete() {
  const selF = document.getElementById('frt-n-freteiro');
  const freteiroId = selF.value;
  const freteiroNome = selF.selectedOptions[0]?.dataset.nome || '';
  const data = document.getElementById('frt-n-data').value;
  const origem = document.getElementById('frt-n-origem').value.trim();
  const destino = document.getElementById('frt-n-destino').value.trim();
  const valor = Number(document.getElementById('frt-n-valor').value);
  if (!freteiroId) return showToast('⚠️ Selecione o freteiro.');
  if (!data) return showToast('⚠️ Informe a data.');
  if (!origem || !destino) return showToast('⚠️ Informe origem e destino.');
  if (!(valor > 0)) return showToast('⚠️ Informe um valor válido.');

  const paradas = document.getElementById('frt-n-paradas').value.split('\n').map(s => s.trim()).filter(Boolean);
  const ymd = data.replace(/-/g, '');
  // código sequencial do dia: LF-AAAAMMDD-NNN
  let seq = 1;
  try {
    const doDia = _fretesCache.filter(f => (f.dateStr || '') === ymd);
    if (!_fretesCache.length) {
      const snap = await db.collection('fretes').get();
      _fretesCache = snap.docs.map(x => ({ id: x.id, ...x.data() }));
    }
    seq = _fretesCache.filter(f => (f.dateStr || '') === ymd).length + 1;
  } catch (e) { /* usa 1 */ }
  const code = `LF-${ymd}-${String(seq).padStart(3, '0')}`;

  const btn = document.getElementById('frt-n-salvar');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }
  try {
    await db.collection('fretes').add({
      code, data, dateStr: ymd,
      freteiroId, freteiroNome,
      origem, destino, paradas,
      motivo: document.getElementById('frt-n-motivo').value.trim() || null,
      valor, valorPago: 0,
      status: 'solicitado', statusPag: 'pendente', etapaStatus: 'novo',
      formaPag: document.getElementById('frt-n-forma').value,
      obs: document.getElementById('frt-n-obs').value.trim() || null,
      importado: false,
      createdBy: (typeof currentUserData !== 'undefined' && currentUserData?.name) || null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast(`✅ Frete ${code} criado.`);
    // limpa
    ['frt-n-origem', 'frt-n-destino', 'frt-n-paradas', 'frt-n-motivo', 'frt-n-valor', 'frt-n-obs'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    _fretesCache = []; // força recarga
    goPage('frt-lista');
  } catch (e) {
    console.error(e); showToast('❌ Erro ao salvar: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Salvar frete'; }
  }
}
window.salvarNovoFrete = salvarNovoFrete;

// ── Freteiros (suppliers tipo frete) ──
async function loadFrtFreteiros() {
  const tb = document.getElementById('frt-freteiros-tbody');
  if (tb) tb.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-muted);">Carregando…</td></tr>';
  try {
    const snap = await db.collection('suppliers').orderBy('nome').get();
    const fret = snap.docs.map(x => ({ id: x.id, ...x.data() })).filter(s => Array.isArray(s.tipos) && s.tipos.includes('frete'));
    if (!tb) return;
    tb.innerHTML = fret.length
      ? fret.map(s => `<tr><td>${frtEsc(s.nome)}</td><td>${frtEsc(s.tel || '—')}</td><td>${frtEsc(s.pix || '—')}</td><td>${frtEsc(s.cnpj || '—')}</td></tr>`).join('')
      : '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-muted);">Nenhum freteiro cadastrado.</td></tr>';
  } catch (e) {
    console.error('loadFrtFreteiros', e);
    if (tb) tb.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--danger,#dc2626);">Erro: ${frtEsc(e.message)}</td></tr>`;
  }
}
window.loadFrtFreteiros = loadFrtFreteiros;

async function salvarFreteiro() {
  const nome = document.getElementById('frt-fr-nome').value.trim();
  if (!nome) return showToast('⚠️ Informe o nome.');
  try {
    // se já existe fornecedor com esse nome, só adiciona o tipo 'frete'
    const snap = await db.collection('suppliers').get();
    const existente = snap.docs.map(x => ({ id: x.id, ...x.data() })).find(s => (s.nome || '').toLowerCase() === nome.toLowerCase());
    const tel = document.getElementById('frt-fr-tel').value.trim() || null;
    const pix = document.getElementById('frt-fr-pix').value.trim() || null;
    const doc = document.getElementById('frt-fr-doc').value.trim() || null;
    if (existente) {
      const tipos = [...new Set([...(existente.tipos || []), 'frete'])];
      await db.collection('suppliers').doc(existente.id).update({ tipos, tel: existente.tel || tel, pix: existente.pix || pix, cnpj: existente.cnpj || doc });
    } else {
      await db.collection('suppliers').add({ nome, tel, pix, cnpj: doc, tipos: ['frete'], createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    }
    showToast('✅ Freteiro salvo.');
    ['frt-fr-nome', 'frt-fr-tel', 'frt-fr-pix', 'frt-fr-doc'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    loadFrtFreteiros();
  } catch (e) { console.error(e); showToast('❌ Erro ao salvar: ' + e.message); }
}
window.salvarFreteiro = salvarFreteiro;

// ── Metas do frete ──
async function loadFrtMetas() {
  const tb = document.getElementById('frt-metas-tbody');
  if (tb) tb.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-muted);">Carregando…</td></tr>';
  try {
    const snap = await db.collection('fretes_metas').get();
    const metas = snap.docs.map(x => ({ id: x.id, ...x.data() })).sort((a, b) => String(b.mes || '').localeCompare(String(a.mes || '')));
    if (!tb) return;
    tb.innerHTML = metas.length
      ? metas.map(m => `<tr><td>${frtEsc(m.mes || '—')}</td><td style="text-align:right;">${frtBRL(m.semanal)}</td><td style="text-align:right;">${frtBRL(m.mensal)}</td><td style="text-align:right;">${frtBRL(m.anual)}</td></tr>`).join('')
      : '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-muted);">Nenhuma meta cadastrada.</td></tr>';
  } catch (e) {
    console.error('loadFrtMetas', e);
    if (tb) tb.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--danger,#dc2626);">Erro: ${frtEsc(e.message)}</td></tr>`;
  }
}
window.loadFrtMetas = loadFrtMetas;

async function salvarFrtMeta() {
  const mes = document.getElementById('frt-m-mes').value;
  if (!mes) return showToast('⚠️ Informe o mês.');
  try {
    await db.collection('fretes_metas').add({
      mes,
      semanal: Number(document.getElementById('frt-m-semanal').value) || 0,
      mensal: Number(document.getElementById('frt-m-mensal').value) || 0,
      anual: Number(document.getElementById('frt-m-anual').value) || 0,
      criadoPor: (typeof currentUserData !== 'undefined' && currentUserData?.name) || null,
      criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast('✅ Meta salva.');
    ['frt-m-semanal', 'frt-m-mensal', 'frt-m-anual'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    loadFrtMetas();
  } catch (e) { console.error(e); showToast('❌ Erro ao salvar: ' + e.message); }
}
window.salvarFrtMeta = salvarFrtMeta;

/* ══════════════════════════════════════════════════════════════════════
   MÓDULO PASSAGENS (enxuto) — lista das solicitações (passagens_solicitacoes),
   somente leitura + detalhe. O financeiro já está consolidado no Suprimentos.
   ══════════════════════════════════════════════════════════════════════ */

let _pasCache = [];

const _PAS_STATUS = {
  nova: ['🆕 Nova', 'var(--text-muted)'],
  em_analise: ['🔎 Em análise', 'var(--lumen)'],
  'Em Análise': ['🔎 Em análise', 'var(--lumen)'],
  aprovada: ['✅ Aprovada', 'var(--ok,#16a34a)'],
  comprada: ['🎫 Comprada', 'var(--ok,#16a34a)'],
  reprovada: ['⛔ Reprovada', 'var(--danger,#dc2626)'],
  cancelada: ['✖ Cancelada', 'var(--text-muted)'],
};
function pasBadge(s) {
  const [txt, cor] = _PAS_STATUS[s] || [s || '—', 'var(--text-muted)'];
  return `<span style="font-weight:600;color:${cor};">${txt}</span>`;
}

async function loadPasSolic() {
  const tb = document.getElementById('pas-tbody');
  if (tb) tb.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted);">Carregando…</td></tr>';
  try {
    const snap = await db.collection('passagens_solicitacoes').get();
    _pasCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    _pasCache.sort((a, b) => String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')));
    const status = [...new Set(_pasCache.map(s => s.status).filter(Boolean))];
    const sel = document.getElementById('pas-f-status');
    if (sel) sel.innerHTML = '<option value="">Todos</option>' + status.map(s => `<option value="${frtEsc(s)}">${frtEsc(s)}</option>`).join('');
    renderPasSolic();
  } catch (e) {
    console.error('loadPasSolic', e);
    if (tb) tb.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--danger,#dc2626);">Erro ao carregar: ${frtEsc(e.message)}</td></tr>`;
  }
}
window.loadPasSolic = loadPasSolic;

function renderPasSolic() {
  const busca = (document.getElementById('pas-f-busca')?.value || '').toLowerCase().trim();
  const fst = document.getElementById('pas-f-status')?.value || '';
  const lista = _pasCache.filter(s => {
    if (fst && (s.status || '') !== fst) return false;
    if (busca) {
      const alvo = `${s.codigo || ''} ${s.passageiro || ''} ${s.solicitante || ''} ${s.origem || ''} ${s.destino || ''}`.toLowerCase();
      if (!alvo.includes(busca)) return false;
    }
    return true;
  });
  const tb = document.getElementById('pas-tbody');
  if (!tb) return;
  if (!lista.length) {
    tb.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted);">Nenhuma solicitação encontrada.</td></tr>';
    return;
  }
  tb.innerHTML = lista.map(s => `
    <tr>
      <td>${frtEsc(s.codigo || '—')}</td>
      <td>${frtDataBR(s.criadoEm)}</td>
      <td>${frtEsc(s.tipo || '—')}</td>
      <td>${frtEsc(s.passageiro || '—')}</td>
      <td style="max-width:260px;">${frtEsc(s.origem || '—')} <span style="color:var(--text-muted);">→</span> ${frtEsc(s.destino || '—')}</td>
      <td>${pasBadge(s.status)}</td>
      <td style="text-align:right;"><button class="btn btn-outline btn-sm" onclick="abrirPasDetalhe('${s.id}')">Ver</button></td>
    </tr>`).join('');
}
window.renderPasSolic = renderPasSolic;

function abrirPasDetalhe(id) {
  const s = _pasCache.find(x => x.id === id);
  if (!s) return;
  document.getElementById('pas-det-titulo').textContent = `Solicitação ${s.codigo || ''}`.trim();
  const hist = Array.isArray(s.historico) ? s.historico : [];
  const orcs = Array.isArray(s.orcamentos) ? s.orcamentos.filter(o => o && Object.keys(o).length) : [];
  const vf = s.valorFinal && (s.valorFinal.valor ?? s.valorFinal);
  const linha = (rot, val) => `<div><span style="color:var(--text-muted);font-size:13px;">${rot}</span><br>${val}</div>`;
  document.getElementById('pas-det-body').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      ${linha('Solicitante', frtEsc(s.solicitante || '—'))}
      ${linha('Passageiro', frtEsc(s.passageiro || '—'))}
      ${linha('Tipo', frtEsc(s.tipo || '—'))}
      ${linha('Status', pasBadge(s.status))}
      ${linha('Saída', frtEsc(s.saida || '—'))}
      ${linha('Retorno', frtEsc(s.retorno || '—') || '—')}
    </div>
    ${linha('Trajeto', `${frtEsc(s.origem || '—')} → ${frtEsc(s.destino || '—')}`)}
    ${s.motivo ? linha('Motivo', frtEsc(s.motivo)) : ''}
    ${s.obs ? linha('Observações', frtEsc(s.obs)) : ''}
    ${vf != null ? linha('Valor final', frtBRL(vf)) : ''}
    ${s.motivoReprovacao ? linha('Motivo da reprovação', frtEsc(s.motivoReprovacao)) : ''}
    ${s.motivoCancelamento ? linha('Motivo do cancelamento', frtEsc(s.motivoCancelamento)) : ''}
    ${orcs.length ? linha('Orçamentos', orcs.map(o => `• ${frtEsc(o.fornecedor || o.empresa || '')} ${o.valor != null ? frtBRL(o.valor) : ''}`).join('<br>')) : ''}
    ${hist.length ? linha('Histórico', hist.map(h => `• ${frtEsc(h.acao || h.texto || '')}${h.usuario ? ' — ' + frtEsc(h.usuario) : ''}`).join('<br>')) : ''}
  `;
  openModal('modal-pas-detalhe');
}
window.abrirPasDetalhe = abrirPasDetalhe;
