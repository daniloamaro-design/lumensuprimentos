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
// Situação do frete (fluxo: solicitado → transporte → entregue; ou cancelado)
function frtStatusBadge(s) {
  const map = {
    solicitado: ['📋 Solicitado', '#0284C7'],
    transporte: ['🚛 Em transporte', '#D97706'],
    entregue: ['✅ Entregue', '#059669'],
    cancelado: ['❌ Cancelado', '#DC2626'],
  };
  const [txt, cor] = map[s] || [s || '—', 'var(--text-muted)'];
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
      <td style="text-align:right;">${f.valor > 0 ? frtBRL(f.valor) : '<span style="color:var(--warn);font-size:12px;">a informar</span>'}</td>
      <td>${frtStatusBadge(f.status)}<br><span style="font-size:11px;">${frtBadgePag(f.statusPag)}</span></td>
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

  const semFreteiro = !f.freteiroNome;
  const temTrajeto = f.origem && f.destino;

  // Botões do fluxo conforme a situação (só autoriza com freteiro atribuído)
  const acoes = [];
  if (f.status === 'solicitado' && !semFreteiro) acoes.push(`<button class="btn btn-primary btn-sm" onclick="frtAutorizar('${f.id}')">✅ Autorizar</button>`);
  if (f.status === 'transporte') acoes.push(`<button class="btn btn-primary btn-sm" onclick="frtMarcarEntregue('${f.id}')">📦 Marcar entregue</button>`);
  if (f.status === 'entregue' && f.etapaStatus !== 'avaliado') acoes.push(`<button class="btn btn-secondary btn-sm" onclick="abrirAvaliacaoFrete('${f.id}')">⭐ Avaliar</button>`);
  if (f.statusPag !== 'pago' && f.status !== 'cancelado' && !semFreteiro) acoes.push(`<button class="btn btn-secondary btn-sm" onclick="frtMarcarPago('${f.id}', true)">💰 Marcar pago</button>`);
  if (f.status !== 'cancelado' && f.status !== 'entregue') acoes.push(`<button class="btn btn-outline btn-sm" onclick="frtCancelar('${f.id}')">❌ Cancelar</button>`);

  // Form de atribuição de freteiro (rota criada sem freteiro)
  const formAtrib = semFreteiro && f.status !== 'cancelado' ? `
    <div style="border-top:1px dashed var(--border);padding-top:8px;">
      <div style="font-weight:600;font-size:13px;margin-bottom:6px;">Atribuir freteiro e valor</div>
      <div style="display:grid;grid-template-columns:1fr 110px auto;gap:8px;align-items:end;">
        <div><label class="form-label">Freteiro</label><select class="form-select" id="frt-atrib-forn"><option value="">Selecione…</option></select></div>
        <div><label class="form-label">Valor</label><input class="form-input" id="frt-atrib-valor" type="number" step="0.01" min="0" value="${f.valor || ''}"></div>
        <div><button class="btn btn-primary btn-sm" onclick="frtAtribuirFreteiro('${f.id}')">Salvar</button></div>
      </div>
    </div>` : '';

  // Form de informar/alterar valor (freteiro já definido — quando não, quem
  // define o valor é o form de atribuição acima). Freteiros muitas vezes só
  // informam o valor depois do transporte.
  const formValor = (!semFreteiro && f.status !== 'cancelado') ? `
    <div style="border-top:1px dashed var(--border);padding-top:8px;">
      <div style="font-weight:600;font-size:13px;margin-bottom:6px;">${f.valor > 0 ? 'Alterar valor' : '💰 Informar valor do frete'}</div>
      <div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end;">
        <div><label class="form-label">Valor (R$)</label><input class="form-input" id="frt-det-valor" type="number" step="0.01" min="0" value="${f.valor || ''}"></div>
        <div><button class="btn btn-primary btn-sm" onclick="frtSalvarValor('${f.id}')">Salvar</button></div>
      </div>
    </div>` : '';

  document.getElementById('frt-det-body').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      ${linha('Situação', frtStatusBadge(f.status))}
      ${linha('Data', frtDataBR(f.data || f.createdAt))}
      ${linha('Freteiro', frtEsc(f.freteiroNome || '— (a definir)'))}
      ${linha('Valor', f.valor > 0 ? frtBRL(f.valor) : '<span style="color:var(--warn);">— (a informar)</span>')}
      ${linha('Pagamento', frtBadgePag(f.statusPag) + (Number(f.valorPago) ? ` (${frtBRL(f.valorPago)})` : ''))}
    </div>
    ${linha('Origem', frtEsc(f.origem || '—'))}
    ${paradas.length ? linha('Paradas', paradas.map(p => frtEsc(p)).join('<br>')) : ''}
    ${linha('Destino', frtEsc(f.destino || '—'))}
    ${temTrajeto ? `<div><a href="${rotaGoogleMapsUrl(f.origem, f.destino, paradas)}" target="_blank" rel="noopener" style="color:var(--lumen);font-weight:600;">🗺️ Ver rota no Google Maps</a></div>` : ''}
    ${f.motivo ? linha('Motivo', frtEsc(f.motivo)) : ''}
    ${f.obs ? linha('Observações', frtEsc(f.obs)) : ''}
    ${av ? linha('Avaliação', `⭐ ${av.media ?? '—'} ${av.comentario ? '— ' + frtEsc(av.comentario) : ''}`) : ''}
    ${hist.length ? linha('Histórico', hist.map(h => `• ${frtEsc(typeof h === 'string' ? h : (h.texto || h.acao || JSON.stringify(h)))}`).join('<br>')) : ''}
    ${formAtrib}
    ${formValor}
    ${acoes.length ? `<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">${acoes.join('')}</div>` : ''}
  `;
  openModal('modal-frete-detalhe');
  if (semFreteiro && f.status !== 'cancelado') popularSelectFreteiros('frt-atrib-forn');
}

async function frtSalvarValor(id) {
  const valor = Number(document.getElementById('frt-det-valor').value);
  if (!(valor > 0)) return showToast('⚠️ Informe um valor válido.');
  const f = _fretesCache.find(x => x.id === id);
  const nome = (typeof currentUserData !== 'undefined' && currentUserData?.name) || null;
  try {
    const hist = { acao: `Valor ${f?.valor > 0 ? 'alterado' : 'definido'}: ${frtBRL(valor)}`, por: nome, data: new Date().toISOString() };
    await db.collection('fretes').doc(id).update({
      valor,
      historico: firebase.firestore.FieldValue.arrayUnion(hist),
      updatedBy: nome, updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    if (f) { f.valor = valor; f.historico = [...(Array.isArray(f.historico) ? f.historico : []), hist]; }
    showToast('✅ Valor atualizado.');
    abrirFreteDetalhe(id);
    renderFrtLista();
  } catch (e) { console.error(e); showToast('❌ Erro: ' + e.message); }
}
window.frtSalvarValor = frtSalvarValor;

// Monta o link de direções do Google Maps a partir dos endereços (sem API)
function rotaGoogleMapsUrl(origem, destino, paradas) {
  const enc = s => encodeURIComponent(s || '');
  let url = 'https://www.google.com/maps/dir/?api=1&origin=' + enc(origem) + '&destination=' + enc(destino);
  const wp = (Array.isArray(paradas) ? paradas : []).filter(Boolean);
  if (wp.length) url += '&waypoints=' + wp.map(enc).join('%7C');
  return url;
}
window.rotaGoogleMapsUrl = rotaGoogleMapsUrl;

async function frtAtribuirFreteiro(id) {
  const sel = document.getElementById('frt-atrib-forn');
  const fid = sel.value;
  const fnome = sel.selectedOptions[0]?.dataset.nome || '';
  const valor = Number(document.getElementById('frt-atrib-valor').value);
  if (!fid) return showToast('⚠️ Selecione o freteiro.');
  if (!(valor > 0)) return showToast('⚠️ Informe o valor.');
  const f = _fretesCache.find(x => x.id === id);
  const nome = (typeof currentUserData !== 'undefined' && currentUserData?.name) || null;
  try {
    const hist = { acao: `Freteiro atribuído: ${fnome} (${frtBRL(valor)})`, por: nome, data: new Date().toISOString() };
    await db.collection('fretes').doc(id).update({
      freteiroId: fid, freteiroNome: fnome, valor,
      etapaStatus: 'aguardando_autorizacao',
      historico: firebase.firestore.FieldValue.arrayUnion(hist),
      updatedBy: nome, updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    if (f) { f.freteiroId = fid; f.freteiroNome = fnome; f.valor = valor; f.historico = [...(Array.isArray(f.historico) ? f.historico : []), hist]; }
    showToast('✅ Freteiro atribuído.');
    abrirFreteDetalhe(id);
    if (window._currentActivePage === 'frt-autorizacoes') loadFrtAutorizacoes(); else renderFrtLista();
  } catch (e) { console.error(e); showToast('❌ Erro: ' + e.message); }
}
window.frtAtribuirFreteiro = frtAtribuirFreteiro;

// ── Rotas: planejar um trajeto, ver no mapa e salvar como frete (sem freteiro) ──
function frtVerNoMapaForm() {
  const o = document.getElementById('frt-rota-origem').value.trim();
  const d = document.getElementById('frt-rota-destino').value.trim();
  if (!o || !d) return showToast('⚠️ Informe origem e destino.');
  const paradas = document.getElementById('frt-rota-paradas').value.split('\n').map(s => s.trim()).filter(Boolean);
  window.open(rotaGoogleMapsUrl(o, d, paradas), '_blank', 'noopener');
}
window.frtVerNoMapaForm = frtVerNoMapaForm;

async function frtSalvarRota() {
  const origem = document.getElementById('frt-rota-origem').value.trim();
  const destino = document.getElementById('frt-rota-destino').value.trim();
  if (!origem || !destino) return showToast('⚠️ Informe origem e destino.');
  const paradas = document.getElementById('frt-rota-paradas').value.split('\n').map(s => s.trim()).filter(Boolean);
  const motivo = document.getElementById('frt-rota-motivo').value.trim();
  const data = new Date().toISOString().slice(0, 10);
  const ymd = data.replace(/-/g, '');
  const nome = (typeof currentUserData !== 'undefined' && currentUserData?.name) || null;
  const btn = document.getElementById('frt-rota-salvar');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }
  try {
    if (!_fretesCache.length) { const snap = await db.collection('fretes').get(); _fretesCache = snap.docs.map(x => ({ id: x.id, ...x.data() })); }
    const seq = _fretesCache.filter(f => (f.dateStr || '') === ymd).length + 1;
    const code = `LF-${ymd}-${String(seq).padStart(3, '0')}`;
    await db.collection('fretes').add({
      code, data, dateStr: ymd, origem, destino, paradas,
      motivo: motivo || null, freteiroId: '', freteiroNome: '',
      valor: 0, valorPago: 0, status: 'solicitado', statusPag: 'pendente',
      etapaStatus: 'rota_criada', formaPag: 'pix', importado: false,
      obs: document.getElementById('frt-rota-obs').value.trim() || null,
      createdBy: nome,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      historico: [{ acao: 'Rota criada e solicitada', etapa: 'rota_criada', por: nome, data: new Date().toISOString() }],
    });
    showToast(`✅ Rota ${code} salva! Atribua um freteiro em Autorizações.`);
    ['frt-rota-origem', 'frt-rota-destino', 'frt-rota-paradas', 'frt-rota-motivo', 'frt-rota-obs'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    _fretesCache = [];
    goPage('frt-autorizacoes');
  } catch (e) {
    console.error(e); showToast('❌ Erro ao salvar: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Salvar rota'; }
  }
}
window.frtSalvarRota = frtSalvarRota;
window.abrirFreteDetalhe = abrirFreteDetalhe;

// Muda a situação do frete e registra no histórico
async function frtMudarStatus(id, novoStatus, rotulo, extra) {
  const f = _fretesCache.find(x => x.id === id);
  if (!f) return;
  const nome = (typeof currentUserData !== 'undefined' && currentUserData?.name) || null;
  try {
    const hist = { acao: rotulo, status: novoStatus, por: nome, data: new Date().toISOString() };
    await db.collection('fretes').doc(id).update({
      status: novoStatus,
      historico: firebase.firestore.FieldValue.arrayUnion(hist),
      updatedBy: nome,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      ...(extra || {}),
    });
    f.status = novoStatus;
    f.historico = [...(Array.isArray(f.historico) ? f.historico : []), hist];
    if (extra) Object.assign(f, extra);
    showToast('✅ ' + rotulo);
    closeModal('modal-frete-detalhe');
    if (window._currentActivePage === 'frt-autorizacoes') loadFrtAutorizacoes(); else renderFrtLista();
  } catch (e) { console.error(e); showToast('❌ Erro: ' + e.message); }
}
async function frtAutorizar(id) {
  const f = _fretesCache.find(x => x.id === id);
  if (!confirm(`Autorizar e liberar o frete ${f?.code || ''} para transporte?`)) return;
  frtMudarStatus(id, 'transporte', 'Frete autorizado', { statusPag: 'pendente' });
}
async function frtMarcarEntregue(id) {
  const f = _fretesCache.find(x => x.id === id);
  if (!confirm(`Confirmar a entrega do frete ${f?.code || ''}?`)) return;
  frtMudarStatus(id, 'entregue', 'Frete entregue');
}
async function frtCancelar(id) {
  const f = _fretesCache.find(x => x.id === id);
  if (!confirm(`Cancelar o frete ${f?.code || ''}? Esta ação registra o cancelamento.`)) return;
  frtMudarStatus(id, 'cancelado', 'Frete cancelado');
}
window.frtAutorizar = frtAutorizar;
window.frtMarcarEntregue = frtMarcarEntregue;
window.frtCancelar = frtCancelar;

// ── Avaliação do frete (4 critérios, 1–5 estrelas) ──
const _frtAvNotas = { pontualidade: 0, qualidade: 0, cuidado: 0, comunicacao: 0 };
function abrirAvaliacaoFrete(id) {
  document.getElementById('frt-av-id').value = id;
  Object.keys(_frtAvNotas).forEach(k => _frtAvNotas[k] = 0);
  document.querySelectorAll('#modal-avaliar-frete .frt-star').forEach(s => s.classList.remove('on'));
  document.getElementById('frt-av-media').textContent = '—';
  document.getElementById('frt-av-comentario').value = '';
  closeModal('modal-frete-detalhe');
  openModal('modal-avaliar-frete');
}
function frtSetEstrela(criterio, val) {
  _frtAvNotas[criterio] = val;
  const row = document.querySelector(`#modal-avaliar-frete .frt-star-row[data-criterio="${criterio}"]`);
  if (row) row.querySelectorAll('.frt-star').forEach(s => s.classList.toggle('on', parseInt(s.dataset.val) <= val));
  const vals = Object.values(_frtAvNotas).filter(v => v > 0);
  document.getElementById('frt-av-media').textContent = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '—';
}
async function salvarAvaliacaoFrete() {
  const id = document.getElementById('frt-av-id').value;
  const n = _frtAvNotas;
  if (!n.pontualidade || !n.qualidade || !n.cuidado || !n.comunicacao) return showToast('⚠️ Avalie todos os critérios.');
  const media = (n.pontualidade + n.qualidade + n.cuidado + n.comunicacao) / 4;
  const nome = (typeof currentUserData !== 'undefined' && currentUserData?.name) || null;
  const f = _fretesCache.find(x => x.id === id);
  try {
    const hist = { acao: 'Frete avaliado — nota ' + media.toFixed(1), etapa: 'avaliado', por: nome, data: new Date().toISOString() };
    const avaliacao = { ...n, media, comentario: document.getElementById('frt-av-comentario').value.trim(), avaliadoPor: nome, avaliadoEm: new Date().toISOString() };
    await db.collection('fretes').doc(id).update({
      etapaStatus: 'avaliado', avaliacao,
      historico: firebase.firestore.FieldValue.arrayUnion(hist),
      updatedBy: nome, updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    if (f) { f.etapaStatus = 'avaliado'; f.avaliacao = avaliacao; f.historico = [...(Array.isArray(f.historico) ? f.historico : []), hist]; }
    showToast('⭐ Avaliação salva!');
    closeModal('modal-avaliar-frete');
    renderFrtLista();
  } catch (e) { console.error(e); showToast('❌ Erro: ' + e.message); }
}
window.abrirAvaliacaoFrete = abrirAvaliacaoFrete;
window.frtSetEstrela = frtSetEstrela;
window.salvarAvaliacaoFrete = salvarAvaliacaoFrete;

// ── Página de Autorizações (fretes aguardando autorização) ──
async function loadFrtAutorizacoes() {
  const tb = document.getElementById('frt-aut-tbody');
  if (tb) tb.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted);">Carregando…</td></tr>';
  try {
    if (!_fretesCache.length) {
      const snap = await db.collection('fretes').get();
      _fretesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    const pend = _fretesCache.filter(f => f.status === 'solicitado')
      .sort((a, b) => String(b.data || b.createdAt || '').localeCompare(String(a.data || a.createdAt || '')));
    if (!tb) return;
    tb.innerHTML = pend.length ? pend.map(f => `
      <tr>
        <td>${frtEsc(f.code || '—')}</td>
        <td>${frtDataBR(f.data || f.createdAt)}</td>
        <td>${frtEsc(f.freteiroNome || '—')}</td>
        <td style="max-width:260px;">${frtEsc(f.origem || '—')} <span style="color:var(--text-muted);">→</span> ${frtEsc(f.destino || '—')}</td>
        <td style="text-align:right;">${f.valor > 0 ? frtBRL(f.valor) : '<span style="color:var(--warn);font-size:12px;">a informar</span>'}</td>
        <td style="text-align:right;white-space:nowrap;">
          <button class="btn btn-outline btn-sm" onclick="abrirFreteDetalhe('${f.id}')">Ver</button>
          <button class="btn btn-primary btn-sm" onclick="frtAutorizar('${f.id}')">✅ Autorizar</button>
        </td>
      </tr>`).join('') : '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted);">Nenhum frete aguardando autorização. 🎉</td></tr>';
  } catch (e) {
    console.error('loadFrtAutorizacoes', e);
    if (tb) tb.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--danger,#dc2626);">Erro: ${frtEsc(e.message)}</td></tr>`;
  }
}
window.loadFrtAutorizacoes = loadFrtAutorizacoes;

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
  await popularCasasFrete();
}
window.loadFrtNovoForm = loadFrtNovoForm;

// Casas (nome + endereço) p/ sugerir em Origem/Destino (datalist) e Paradas (select).
async function popularCasasFrete() {
  try {
    const snap = await db.collection('houses').get();
    const casas = snap.docs.map(d => d.data())
      .filter(h => h.ativo !== false && h.nome)
      .map(h => ({ nome: h.nome, endereco: h.endereco || '' }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
    const rotulo = h => h.nome + (h.endereco ? ' — ' + h.endereco : '');

    const dl = document.getElementById('frt-n-casas-list');
    if (dl) dl.innerHTML = casas.map(h => `<option value="${frtEsc(rotulo(h))}">`).join('');

    const sel = document.getElementById('frt-n-parada-casa');
    if (sel) sel.innerHTML = '<option value="">Adicionar casa como parada…</option>' +
      casas.map(h => `<option value="${frtEsc(rotulo(h))}">${frtEsc(h.nome)}</option>`).join('');
  } catch (e) { console.error('popularCasasFrete', e); }
}

function frtAdicionarParada() {
  const sel = document.getElementById('frt-n-parada-casa');
  const val = sel?.value;
  if (!val) return;
  const ta = document.getElementById('frt-n-paradas');
  if (!ta) return;
  const linhas = ta.value.split('\n').map(s => s.trim()).filter(Boolean);
  if (!linhas.includes(val)) linhas.push(val);
  ta.value = linhas.join('\n');
  sel.value = '';
}
window.frtAdicionarParada = frtAdicionarParada;

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
  const valorRaw = document.getElementById('frt-n-valor').value;
  const valor = valorRaw ? Number(valorRaw) : 0;
  if (!freteiroId) return showToast('⚠️ Selecione o freteiro.');
  if (!data) return showToast('⚠️ Informe a data.');
  if (!origem || !destino) return showToast('⚠️ Informe origem e destino.');
  if (valorRaw && !(valor > 0)) return showToast('⚠️ Valor inválido.');
  // Valor pode ficar em branco (freteiro muitas vezes só informa depois) —
  // dá pra completar no detalhe do frete (frtSalvarValor).

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

let _pasDetId = null;   // solicitação aberta no detalhe
let _pasOrcSel = -1;    // índice da cotação selecionada

function pasOrcamentosDe(s) {
  return Array.isArray(s.orcamentos) ? s.orcamentos.filter(o => o && Object.keys(o).length) : [];
}

function abrirPasDetalhe(id) {
  const s = _pasCache.find(x => x.id === id);
  if (!s) return;
  _pasDetId = id;
  const hist = Array.isArray(s.historico) ? s.historico : [];
  const orcs = pasOrcamentosDe(s);
  _pasOrcSel = orcs.findIndex(o => o.selecionada);
  const vf = s.valorFinal && (s.valorFinal.valor ?? s.valorFinal);
  const podeEditar = ['pendente', 'em_analise', 'Em Análise'].includes(s.status);
  const linha = (rot, val) => `<div><span style="color:var(--text-muted);font-size:13px;">${rot}</span><br>${val}</div>`;
  document.getElementById('pas-det-titulo').textContent = `Solicitação ${s.codigo || ''}`.trim();

  // Lista de cotações (com seleção quando editável)
  const orcHtml = orcs.length ? orcs.map((o, i) => {
    const nome = o.fornecedorNome || o.fornecedor || o.empresa || '—';
    const radio = podeEditar
      ? `<input type="radio" name="pas-orc-sel" value="${i}" ${o.selecionada ? 'checked' : ''} onclick="_pasOrcSel=${i}" style="cursor:pointer;">`
      : (o.selecionada ? '✅' : '');
    return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);">
      ${radio}<div style="flex:1;">${frtEsc(nome)} — <b>${frtBRL(o.valor)}</b>${o.obs ? ` <span style="color:var(--text-muted);font-size:12px;">(${frtEsc(o.obs)})</span>` : ''}</div>
      ${podeEditar ? `<button class="btn btn-outline btn-sm" onclick="pasExcluirOrcamento(${i})" title="Excluir">✕</button>` : ''}
    </div>`;
  }).join('') : '<div style="color:var(--text-muted);font-size:13px;">Nenhuma cotação ainda.</div>';

  const formAdd = (podeEditar && orcs.length < 3) ? `
    <div style="border-top:1px dashed var(--border);margin-top:8px;padding-top:8px;">
      <div style="font-weight:600;font-size:13px;margin-bottom:6px;">Adicionar cotação (${orcs.length}/3)</div>
      <div style="display:grid;grid-template-columns:1fr 110px auto;gap:8px;align-items:end;">
        <div><label class="form-label">Fornecedor</label><select class="form-select" id="pas-orc-forn"><option value="">Selecione…</option></select></div>
        <div><label class="form-label">Valor</label><input class="form-input" id="pas-orc-valor" type="number" step="0.01" min="0"></div>
        <div><button class="btn btn-primary btn-sm" onclick="pasAddOrcamento()">+ Add</button></div>
      </div>
      <input class="form-input" id="pas-orc-obs" placeholder="Observação (opcional)" style="margin-top:6px;">
    </div>` : (podeEditar ? '<div style="color:var(--text-muted);font-size:12px;margin-top:6px;">Máximo de 3 cotações atingido.</div>' : '');

  // Botões de ação por status
  const acoes = [];
  if (['pendente', 'em_analise', 'Em Análise'].includes(s.status)) {
    acoes.push(`<button class="btn btn-primary btn-sm" onclick="pasAprovarOrcamento()">✅ Aprovar selecionada</button>`);
    acoes.push(`<button class="btn btn-outline btn-sm" onclick="pasReprovar()">⛔ Reprovar</button>`);
  }
  if (s.status === 'aprovada') {
    acoes.push(`<button class="btn btn-primary btn-sm" onclick="pasMarcarComprada()">🎫 Marcar comprada</button>`);
    acoes.push(`<button class="btn btn-outline btn-sm" onclick="pasReprovar()">⛔ Reprovar</button>`);
  }

  document.getElementById('pas-det-body').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      ${linha('Solicitante', frtEsc(s.solicitante || '—'))}
      ${linha('Passageiro', frtEsc(s.passageiro || '—'))}
      ${linha('Tipo', frtEsc(s.tipo || '—'))}
      ${linha('Status', pasBadge(s.status))}
      ${linha('Saída', frtEsc(s.saida || '—'))}
      ${linha('Retorno', frtEsc(s.retorno) || '—')}
    </div>
    ${linha('Trajeto', `${frtEsc(s.origem || '—')} → ${frtEsc(s.destino || '—')}`)}
    ${s.motivo ? linha('Motivo', frtEsc(s.motivo)) : ''}
    ${s.obs ? linha('Observações', frtEsc(s.obs)) : ''}
    ${vf != null ? linha('Valor final', frtBRL(vf)) : ''}
    ${s.numBilhete ? linha('Bilhete', frtEsc(typeof s.numBilhete === 'object' ? (s.numBilhete.num || JSON.stringify(s.numBilhete)) : s.numBilhete)) : ''}
    ${s.motivoReprovacao ? linha('Motivo da reprovação', frtEsc(s.motivoReprovacao)) : ''}
    <div>
      <span style="color:var(--text-muted);font-size:13px;">Cotações</span>
      <div style="margin-top:4px;">${orcHtml}</div>
      ${formAdd}
    </div>
    ${hist.length ? linha('Histórico', hist.map(h => `• ${frtEsc(h.acao || h.texto || '')}${h.usuario ? ' — ' + frtEsc(h.usuario) : ''}`).join('<br>')) : ''}
    ${acoes.length ? `<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;border-top:1px solid var(--border);padding-top:10px;">${acoes.join('')}</div>` : ''}
  `;
  openModal('modal-pas-detalhe');
  if (podeEditar && orcs.length < 3) pasPopularFornecedores('pas-orc-forn');
}
window.abrirPasDetalhe = abrirPasDetalhe;

async function pasPopularFornecedores(selId) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  try {
    const snap = await db.collection('suppliers').orderBy('nome').get();
    const todos = snap.docs.map(x => ({ id: x.id, ...x.data() }));
    let forn = todos.filter(f => Array.isArray(f.tipos) && f.tipos.includes('passagens'));
    if (!forn.length) forn = todos;   // fallback: todos os fornecedores
    sel.innerHTML = '<option value="">Selecione…</option>' +
      forn.map(f => `<option value="${f.id}" data-nome="${frtEsc(f.nome)}">${frtEsc(f.nome)}</option>`).join('');
  } catch (e) { console.error('pasPopularFornecedores', e); }
}

// Atualiza a solicitação + registra no histórico + re-renderiza
async function pasAtualizar(id, patch, histAcao) {
  const s = _pasCache.find(x => x.id === id);
  if (!s) return;
  const nome = (typeof currentUserData !== 'undefined' && currentUserData?.name) || null;
  try {
    const hist = { acao: histAcao, usuario: nome, ts: new Date().toISOString() };
    await db.collection('passagens_solicitacoes').doc(id).update({
      ...patch,
      historico: firebase.firestore.FieldValue.arrayUnion(hist),
    });
    Object.assign(s, patch);
    s.historico = [...(Array.isArray(s.historico) ? s.historico : []), hist];
    showToast('✅ ' + histAcao);
    abrirPasDetalhe(id);
    renderPasSolic();
  } catch (e) { console.error(e); showToast('❌ Erro: ' + e.message); }
}

async function pasAddOrcamento() {
  const s = _pasCache.find(x => x.id === _pasDetId);
  if (!s) return;
  const selF = document.getElementById('pas-orc-forn');
  const fornId = selF.value;
  const fornNome = selF.selectedOptions[0]?.dataset.nome || '';
  const valor = Number(document.getElementById('pas-orc-valor').value);
  const obs = document.getElementById('pas-orc-obs').value.trim();
  if (!fornId) return showToast('⚠️ Selecione o fornecedor.');
  if (!(valor > 0)) return showToast('⚠️ Informe um valor válido.');
  const orcs = pasOrcamentosDe(s);
  if (orcs.length >= 3) return showToast('⚠️ Máximo de 3 cotações.');
  orcs.push({ fornecedorId: fornId, fornecedorNome: fornNome, valor, obs, selecionada: false });
  const patch = { orcamentos: orcs };
  if (s.status === 'pendente') patch.status = 'em_analise';
  await pasAtualizar(_pasDetId, patch, `Cotação adicionada: ${fornNome} ${frtBRL(valor)}`);
}
window.pasAddOrcamento = pasAddOrcamento;

async function pasExcluirOrcamento(idx) {
  const s = _pasCache.find(x => x.id === _pasDetId);
  if (!s) return;
  const orcs = pasOrcamentosDe(s);
  if (!orcs[idx]) return;
  if (!confirm('Excluir esta cotação?')) return;
  orcs.splice(idx, 1);
  await pasAtualizar(_pasDetId, { orcamentos: orcs }, 'Cotação removida');
}
window.pasExcluirOrcamento = pasExcluirOrcamento;

async function pasAprovarOrcamento() {
  const s = _pasCache.find(x => x.id === _pasDetId);
  if (!s) return;
  const orcs = pasOrcamentosDe(s);
  if (_pasOrcSel == null || _pasOrcSel < 0 || !orcs[_pasOrcSel]) return showToast('⚠️ Selecione uma cotação para aprovar.');
  orcs.forEach((o, i) => o.selecionada = (i === _pasOrcSel));
  const sel = orcs[_pasOrcSel];
  await pasAtualizar(_pasDetId, {
    orcamentos: orcs, status: 'aprovada',
    valorFinal: sel.valor, fornecedor: { id: sel.fornecedorId, nome: sel.fornecedorNome },
  }, `Cotação aprovada: ${sel.fornecedorNome} ${frtBRL(sel.valor)}`);
}
window.pasAprovarOrcamento = pasAprovarOrcamento;

async function pasReprovar() {
  const motivo = prompt('Motivo da reprovação:');
  if (motivo == null) return;
  await pasAtualizar(_pasDetId, { status: 'reprovada', motivoReprovacao: motivo.trim() }, 'Solicitação reprovada');
}
window.pasReprovar = pasReprovar;

async function pasMarcarComprada() {
  const s = _pasCache.find(x => x.id === _pasDetId);
  if (!s) return;
  const num = (prompt('Número do bilhete / localizador (opcional):') || '').trim();
  const orcs = pasOrcamentosDe(s);
  const sel = orcs.find(o => o.selecionada);
  const vf = (s.valorFinal != null) ? s.valorFinal : (sel ? sel.valor : null);
  await pasAtualizar(_pasDetId, {
    status: 'comprada',
    dataCompra: new Date().toISOString().slice(0, 10),
    numBilhete: num || null,
    valorFinal: vf,
  }, 'Passagem comprada' + (num ? ` — bilhete ${num}` : ''));
}
window.pasMarcarComprada = pasMarcarComprada;

/* ══════════════════════════════════════════════════════════════════════
   PAINÉIS / INDICADORES (Fretes e Passagens) — agregações client-side
   ══════════════════════════════════════════════════════════════════════ */
function _erpStat(label, val, sub, cls) {
  return `<div class="stat-card${cls ? ' ' + cls : ''}"><div class="stat-label">${label}</div><div class="stat-value">${val}</div>${sub ? `<div class="stat-sub">${sub}</div>` : ''}</div>`;
}
function _erpBarras(pares, fmt) {
  fmt = fmt || (x => x);
  const max = Math.max(1, ...pares.map(p => Number(p[1]) || 0));
  return pares.map(([lab, val]) => `
    <div style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:2px;gap:8px;"><span>${frtEsc(lab)}</span><b>${fmt(val)}</b></div>
      <div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden;"><div style="height:100%;width:${((Number(val) || 0) / max * 100).toFixed(1)}%;background:var(--lumen);"></div></div>
    </div>`).join('');
}
const _erpGrid = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px;';
// compras_financeiro.pago vem com convenções diferentes por módulo (Suprimentos
// grava 'Sim'/'Não', Passagens grava 'Pago'/'Pendente') — normaliza aqui.
const _erpPago = (v) => v === 'Sim' || v === 'Pago';

async function loadFrtIndicadores() {
  const cont = document.getElementById('frt-ind-conteudo');
  if (!cont) return;
  try {
    if (!_fretesCache.length) { const snap = await db.collection('fretes').get(); _fretesCache = snap.docs.map(d => ({ id: d.id, ...d.data() })); }
    const fs = _fretesCache;
    const qtd = fs.length;
    const total = fs.reduce((s, f) => s + (Number(f.valor) || 0), 0);
    const pago = fs.filter(f => f.statusPag === 'pago').reduce((s, f) => s + (Number(f.valor) || 0), 0);
    const ticket = qtd ? total / qtd : 0;
    const avals = fs.map(f => f.avaliacao && Number(f.avaliacao.media)).filter(v => v > 0);
    const avg = avals.length ? avals.reduce((a, b) => a + b, 0) / avals.length : 0;
    const porFret = {}; fs.forEach(f => { const n = f.freteiroNome || '—'; porFret[n] = (porFret[n] || 0) + (Number(f.valor) || 0); });
    const topFret = Object.entries(porFret).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const porMes = {}; fs.forEach(f => { const m = frtMesDaData(f.data || f.createdAt); if (m) porMes[m] = (porMes[m] || 0) + (Number(f.valor) || 0); });
    const meses = Object.entries(porMes).sort((a, b) => a[0].localeCompare(b[0])).slice(-6);
    cont.innerHTML = `
      <div style="${_erpGrid}">
        ${_erpStat('🚚 Fretes', qtd)}
        ${_erpStat('💰 Valor total', frtBRL(total))}
        ${_erpStat('✅ Pago', frtBRL(pago), '', 'stat-card-ok')}
        ${_erpStat('⏳ Pendente', frtBRL(total - pago), '', 'stat-card-warn')}
        ${_erpStat('🎫 Ticket médio', frtBRL(ticket))}
        ${_erpStat('⭐ Avaliação média', avg ? avg.toFixed(1) : '—', avals.length + ' avaliados')}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;">
        <div class="card"><div class="card-header"><b>Top freteiros (valor)</b></div><div class="card-body">${topFret.length ? _erpBarras(topFret, frtBRL) : '—'}</div></div>
        <div class="card"><div class="card-header"><b>Valor por mês</b></div><div class="card-body">${meses.length ? _erpBarras(meses, frtBRL) : '—'}</div></div>
      </div>`;
  } catch (e) { cont.innerHTML = `<div class="card"><div class="card-body" style="color:var(--danger,#dc2626);">Erro: ${frtEsc(e.message)}</div></div>`; }
}
window.loadFrtIndicadores = loadFrtIndicadores;

async function loadPasIndicadores() {
  const cont = document.getElementById('pas-ind-conteudo');
  if (!cont) return;
  try {
    if (!_pasCache.length) { const snap = await db.collection('passagens_solicitacoes').get(); _pasCache = snap.docs.map(d => ({ id: d.id, ...d.data() })); }
    const ps = _pasCache;
    const porStatus = {}; ps.forEach(s => { const st = s.status || '—'; porStatus[st] = (porStatus[st] || 0) + 1; });
    const compradas = ps.filter(s => s.status === 'comprada');
    const valorComprado = compradas.reduce((a, s) => { const vf = s.valorFinal && (s.valorFinal.valor ?? s.valorFinal); return a + (Number(vf) || 0); }, 0);
    const porMotivo = {}; ps.forEach(s => { const m = s.motivo || '—'; porMotivo[m] = (porMotivo[m] || 0) + 1; });
    const porTipo = {}; ps.forEach(s => { const t = s.tipo || '—'; porTipo[t] = (porTipo[t] || 0) + 1; });
    const statusPares = Object.entries(porStatus).sort((a, b) => b[1] - a[1]);
    const motivoPares = Object.entries(porMotivo).sort((a, b) => b[1] - a[1]);
    const tipoPares = Object.entries(porTipo).sort((a, b) => b[1] - a[1]);
    cont.innerHTML = `
      <div style="${_erpGrid}">
        ${_erpStat('📋 Solicitações', ps.length)}
        ${_erpStat('🎫 Compradas', compradas.length, '', 'stat-card-ok')}
        ${_erpStat('💰 Valor comprado', frtBRL(valorComprado))}
        ${_erpStat('⏳ Em aberto', (porStatus.pendente || 0) + (porStatus.em_analise || 0) + (porStatus['Em Análise'] || 0), '', 'stat-card-warn')}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;">
        <div class="card"><div class="card-header"><b>Por status</b></div><div class="card-body">${statusPares.length ? _erpBarras(statusPares) : '—'}</div></div>
        <div class="card"><div class="card-header"><b>Por motivo</b></div><div class="card-body">${motivoPares.length ? _erpBarras(motivoPares) : '—'}</div></div>
        <div class="card"><div class="card-header"><b>Por tipo</b></div><div class="card-body">${tipoPares.length ? _erpBarras(tipoPares) : '—'}</div></div>
      </div>`;
  } catch (e) { cont.innerHTML = `<div class="card"><div class="card-body" style="color:var(--danger,#dc2626);">Erro: ${frtEsc(e.message)}</div></div>`; }
}
window.loadPasIndicadores = loadPasIndicadores;

// ── Indicadores Gerais (transversal — Suprimentos + Passagens + Fretes) ──
async function loadIndGeral() {
  const cont = document.getElementById('ind-geral-conteudo');
  if (!cont) return;
  try {
    const [finSnap, fretesSnap, pasSnap] = await Promise.all([
      db.collection('compras_financeiro').get(),
      db.collection('fretes').get(),
      db.collection('passagens_solicitacoes').get(),
    ]);
    const porModulo = {
      suprimentos: { total: 0, pago: 0, qtd: 0 },
      passagens:   { total: 0, pago: 0, qtd: 0 },
      frete:       { total: 0, pago: 0, qtd: 0 },
    };
    // compras_financeiro cobre Suprimentos e Passagens; Fretes tem seu próprio
    // financeiro na tabela 'fretes' (não foi migrado p/ compras_financeiro).
    finSnap.docs.forEach(d => {
      const f = d.data();
      const m = porModulo[f.modulo || 'suprimentos'];
      if (!m) return;
      const val = Number(f.valor) || 0;
      m.total += val; m.qtd += 1;
      if (_erpPago(f.pago)) m.pago += val;
    });
    fretesSnap.docs.forEach(d => {
      const f = d.data();
      const val = Number(f.valor) || 0;
      porModulo.frete.total += val; porModulo.frete.qtd += 1;
      if (f.statusPag === 'pago') porModulo.frete.pago += val;
    });
    const totalGeral = porModulo.suprimentos.total + porModulo.passagens.total + porModulo.frete.total;
    const pagoGeral  = porModulo.suprimentos.pago  + porModulo.passagens.pago  + porModulo.frete.pago;

    const fretesQtd = fretesSnap.size;
    const pasQtd = pasSnap.size;
    const pasCompradas = pasSnap.docs.filter(d => d.data().status === 'comprada').length;

    const modPares = [
      ['📦 Suprimentos', porModulo.suprimentos.total],
      ['✈️ Passagens', porModulo.passagens.total],
      ['🚚 Fretes', porModulo.frete.total],
    ];
    const qtdPares = [
      ['📦 Suprimentos', porModulo.suprimentos.qtd],
      ['✈️ Passagens', porModulo.passagens.qtd],
      ['🚚 Fretes', porModulo.frete.qtd],
    ];

    cont.innerHTML = `
      <div style="${_erpGrid}">
        ${_erpStat('💰 Financeiro total (3 módulos)', frtBRL(totalGeral))}
        ${_erpStat('✅ Pago', frtBRL(pagoGeral), '', 'stat-card-ok')}
        ${_erpStat('⏳ Pendente', frtBRL(totalGeral - pagoGeral), '', 'stat-card-warn')}
        ${_erpStat('🚚 Fretes cadastrados', fretesQtd)}
        ${_erpStat('✈️ Passagens', pasQtd, pasCompradas + ' compradas')}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;">
        <div class="card"><div class="card-header"><b>Financeiro por módulo</b></div><div class="card-body">${_erpBarras(modPares, frtBRL)}</div></div>
        <div class="card"><div class="card-header"><b>Lançamentos financeiros por módulo</b></div><div class="card-body">${_erpBarras(qtdPares)}</div></div>
      </div>`;
  } catch (e) {
    cont.innerHTML = `<div class="card"><div class="card-body" style="color:var(--danger,#dc2626);">Erro: ${frtEsc(e.message)}</div></div>`;
  }
}
window.loadIndGeral = loadIndGeral;

/* ══════════════════════════════════════════════════════════════════════
   PLANO DE AÇÃO / PENDÊNCIAS — módulo transversal novo (quadro de tarefas
   compartilhado entre os 3 módulos; todos veem e criam)
   ══════════════════════════════════════════════════════════════════════ */
let _planoAcaoCache = [];
const PL_STATUS_LABEL = { a_fazer: '⬜ A fazer', em_andamento: '🔵 Em andamento', concluido: '✅ Concluído' };
const PL_MODULO_LABEL = { geral: 'Geral', suprimentos: '📦 Suprimentos', passagens: '✈️ Passagens', frete: '🚚 Fretes' };

async function loadPlanoAcao() {
  const tb = document.getElementById('pl-tbody');
  if (tb) tb.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted);">Carregando…</td></tr>';
  try {
    const [plSnap, usersSnap] = await Promise.all([
      db.collection('plano_acao').get(),
      db.collection('users').get(),
    ]);
    _planoAcaoCache = plSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String(a.prazo || '9999').localeCompare(String(b.prazo || '9999')));

    const sel = document.getElementById('pl-responsavel');
    if (sel) {
      const aprovados = usersSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.status === 'approved').sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      sel.innerHTML = '<option value="">—</option>' + aprovados.map(u => `<option value="${u.id}">${frtEsc(u.name || u.email || u.id)}</option>`).join('');
    }
    filtrarPlanoAcao();
  } catch (e) {
    console.error('loadPlanoAcao', e);
    if (tb) tb.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--danger,#dc2626);">Erro: ${frtEsc(e.message)}</td></tr>`;
  }
}
window.loadPlanoAcao = loadPlanoAcao;

function filtrarPlanoAcao() {
  const status = document.getElementById('pl-filtro-status')?.value || '';
  const modulo = document.getElementById('pl-filtro-modulo')?.value || '';
  const filtrados = _planoAcaoCache.filter(t => (!status || t.status === status) && (!modulo || t.modulo === modulo));
  renderPlanoAcao(filtrados);
}
window.filtrarPlanoAcao = filtrarPlanoAcao;

function renderPlanoAcao(tarefas) {
  const tb = document.getElementById('pl-tbody');
  if (!tb) return;
  if (!tarefas.length) {
    tb.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted);">Nenhuma tarefa encontrada.</td></tr>';
    return;
  }
  const hoje = new Date().toISOString().slice(0, 10);
  tb.innerHTML = tarefas.map(t => {
    const atrasada = t.status !== 'concluido' && t.prazo && t.prazo < hoje;
    const statusOpts = Object.entries(PL_STATUS_LABEL).map(([k, v]) => `<option value="${k}"${t.status === k ? ' selected' : ''}>${v}</option>`).join('');
    return `<tr style="${atrasada ? 'background:rgba(198,40,40,0.07);' : ''}">
      <td style="font-weight:700;">${frtEsc(t.titulo || '—')}${t.descricao ? `<div style="font-size:11px;color:var(--text-muted);font-weight:400;">${frtEsc(t.descricao)}</div>` : ''}</td>
      <td>${frtEsc(t.responsavelNome || '—')}</td>
      <td style="font-size:12px;${atrasada ? 'color:var(--danger,#dc2626);font-weight:700;' : ''}">${t.prazo || '—'}</td>
      <td>${PL_MODULO_LABEL[t.modulo] || t.modulo || '—'}</td>
      <td><select class="form-select" style="font-size:12px;padding:4px 8px;" onchange="plAtualizarStatus('${t.id}',this.value)">${statusOpts}</select></td>
      <td style="text-align:center;"><button class="btn btn-outline btn-sm" onclick="plExcluir('${t.id}')" title="Excluir">🗑️</button></td>
    </tr>`;
  }).join('');
}

async function salvarPlanoAcao() {
  const titulo = document.getElementById('pl-titulo').value.trim();
  if (!titulo) return showToast('⚠️ Informe o título.');
  const selResp = document.getElementById('pl-responsavel');
  const responsavelId = selResp.value || null;
  const responsavelNome = responsavelId ? selResp.options[selResp.selectedIndex].textContent : null;
  try {
    await db.collection('plano_acao').add({
      titulo,
      descricao: document.getElementById('pl-descricao').value.trim() || null,
      responsavelId,
      responsavelNome,
      prazo: document.getElementById('pl-prazo').value || null,
      modulo: document.getElementById('pl-modulo').value || 'geral',
      status: 'a_fazer',
      criadoPor: (typeof currentUserData !== 'undefined' && currentUserData?.name) || null,
    });
    showToast('✅ Tarefa criada.');
    ['pl-titulo', 'pl-descricao', 'pl-prazo'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    document.getElementById('pl-responsavel').value = '';
    document.getElementById('pl-modulo').value = 'geral';
    loadPlanoAcao();
  } catch (e) { console.error(e); showToast('❌ Erro ao salvar: ' + e.message); }
}
window.salvarPlanoAcao = salvarPlanoAcao;

async function plAtualizarStatus(id, status) {
  try {
    await db.collection('plano_acao').doc(id).update({ status, atualizadoEm: firebase.firestore.FieldValue.serverTimestamp() });
    const t = _planoAcaoCache.find(x => x.id === id); if (t) t.status = status;
    showToast('✅ Status atualizado.');
  } catch (e) { console.error(e); showToast('❌ Erro: ' + e.message); loadPlanoAcao(); }
}
window.plAtualizarStatus = plAtualizarStatus;

async function plExcluir(id) {
  if (!confirm('Excluir esta tarefa?')) return;
  try {
    await db.collection('plano_acao').doc(id).delete();
    showToast('🗑️ Tarefa excluída.');
    loadPlanoAcao();
  } catch (e) { console.error(e); showToast('❌ Erro: ' + e.message); }
}
window.plExcluir = plExcluir;

/* ══ Calendário de Passagens (por data de saída) ══ */
let _pasCalMes = null;   // 'YYYY-MM' em exibição
function pasCalCor(status) {
  return { comprada: '#059669', aprovada: '#0D9488', pendente: '#D97706', em_analise: '#0284C7', 'Em Análise': '#0284C7', reprovada: '#DC2626', cancelada: '#6B7280' }[status] || '#6B7280';
}
async function loadPasCalendario() {
  if (!_pasCache.length) {
    try { const snap = await db.collection('passagens_solicitacoes').get(); _pasCache = snap.docs.map(d => ({ id: d.id, ...d.data() })); } catch (e) { console.error(e); }
  }
  if (!_pasCalMes) _pasCalMes = new Date().toISOString().slice(0, 7);
  renderPasCalendario();
}
window.loadPasCalendario = loadPasCalendario;

function pasCalMudar(delta) {
  const [y, m] = (_pasCalMes || new Date().toISOString().slice(0, 7)).split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  _pasCalMes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  renderPasCalendario();
}
window.pasCalMudar = pasCalMudar;

function renderPasCalendario() {
  const grid = document.getElementById('pas-cal-grid');
  if (!grid) return;
  const [ano, mes] = _pasCalMes.split('-').map(Number);
  const nomeMes = new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const tit = document.getElementById('pas-cal-titulo');
  if (tit) tit.textContent = nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1);

  // agrupa por dia (saída) dentro do mês
  const porDia = {};
  _pasCache.forEach(s => {
    const saida = (s.saida || '').slice(0, 10);
    if (saida.startsWith(_pasCalMes)) {
      const dia = parseInt(saida.slice(8, 10), 10);
      (porDia[dia] = porDia[dia] || []).push(s);
    }
  });

  const primeiroDiaSemana = new Date(ano, mes - 1, 1).getDay();  // 0=Dom
  const diasNoMes = new Date(ano, mes, 0).getDate();
  const hojeStr = new Date().toISOString().slice(0, 10);
  const dow = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  let html = '<div class="pas-cal">' + dow.map(d => `<div class="pas-cal-dow">${d}</div>`).join('');
  for (let i = 0; i < primeiroDiaSemana; i++) html += '<div class="pas-cal-cell vazia"></div>';
  for (let dia = 1; dia <= diasNoMes; dia++) {
    const dataStr = `${_pasCalMes}-${String(dia).padStart(2, '0')}`;
    const evs = porDia[dia] || [];
    const eventos = evs.map(s => `<div class="pas-cal-ev" style="background:${pasCalCor(s.status)};" title="${frtEsc(s.passageiro || '')} — ${frtEsc(s.destino || '')}" onclick="abrirPasDetalhe('${s.id}')">${frtEsc(s.passageiro || s.codigo || '—')}</div>`).join('');
    html += `<div class="pas-cal-cell${dataStr === hojeStr ? ' hoje' : ''}"><div class="pas-cal-dia">${dia}</div>${eventos}</div>`;
  }
  html += '</div>';
  grid.innerHTML = html;
}
window.renderPasCalendario = renderPasCalendario;

// ── Nova solicitação de passagem (portado do sistema antigo) ──
function loadPasNovaForm() {
  const sol = document.getElementById('pas-n-solicitante');
  if (sol) sol.value = (typeof currentUserData !== 'undefined' && currentUserData?.name) || '';
}
window.loadPasNovaForm = loadPasNovaForm;

function pasGerarCodigo() { return 'PASS-' + Math.floor(1000 + Math.random() * 9000); }

async function salvarPasSolicitacao() {
  const tipo = document.querySelector('input[name="pas-tipo"]:checked')?.value || 'onibus';
  const passageiro = document.getElementById('pas-n-passageiro').value.trim();
  const origem = document.getElementById('pas-n-origem').value.trim();
  const destino = document.getElementById('pas-n-destino').value.trim();
  const saida = document.getElementById('pas-n-saida').value;
  const turno = document.getElementById('pas-n-turno').value;
  const motivo = document.getElementById('pas-n-motivo').value;
  if (!passageiro || !origem || !destino || !saida || !turno || !motivo) {
    return showToast('⚠️ Preencha todos os campos obrigatórios (*).');
  }
  const nome = (typeof currentUserData !== 'undefined' && currentUserData?.name) || '';
  const btn = document.getElementById('pas-n-salvar');
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
  try {
    await db.collection('passagens_solicitacoes').add({
      codigo: pasGerarCodigo(), tipo,
      solicitante: nome,
      solicitanteUid: (typeof currentUserData !== 'undefined' && currentUserData?.id) || null,
      passageiro, origem, destino, saida,
      retorno: document.getElementById('pas-n-retorno').value || '',
      turno, motivo,
      bagagem: document.getElementById('pas-n-bagagem').value,
      pix: document.getElementById('pas-n-pix').value.trim(),
      obs: document.getElementById('pas-n-obs').value.trim(),
      status: 'pendente',
      orcamentos: [{}, {}, {}],
      historico: [{ acao: 'Solicitação criada', usuario: nome, ts: new Date().toISOString() }],
      valorFinal: null, fornecedor: null, dataCompra: null, ticketImg: null, numBilhete: null,
      criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast('✅ Solicitação enviada! ✈️');
    ['pas-n-passageiro', 'pas-n-origem', 'pas-n-destino', 'pas-n-saida', 'pas-n-retorno', 'pas-n-pix', 'pas-n-obs'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    _pasCache = []; // força recarga da lista
    goPage('pas-solicitacoes');
  } catch (e) {
    console.error(e); showToast('❌ Erro ao salvar: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✈️ Enviar solicitação'; }
  }
}
window.salvarPasSolicitacao = salvarPasSolicitacao;

/* ══════════════════════════════════════════════════════════════════════
   U4 — PERMISSÕES EDITÁVEIS (perfil × página)
   Fonte da verdade: tabela role_permissions (uma linha por perfil, lista de
   páginas). Carregada no login em window.PERMISSOES. Se o banco não estiver
   disponível (tabela ainda não criada), cai para FALLBACK_PERMS = o mesmo
   acesso de hoje — então nada quebra antes da migração ser aplicada.
   O perfil 'admin' tem acesso total garantido no código.
   ══════════════════════════════════════════════════════════════════════ */

// páginas dos módulos (hoje abertas a todos; o admin restringe na tela)
const _MOD_PAGES = ['pas-solicitacoes', 'pas-nova', 'pas-indicadores', 'pas-calendario', 'frt-lista', 'frt-novo', 'frt-autorizacoes', 'frt-rotas', 'frt-freteiros', 'frt-metas', 'frt-indicadores', 'ind-geral', 'plano-acao', 'diretoria-dashboard', 'diretoria-percapita'];
// todas as páginas do Suprimentos (perfis de gestão têm tudo)
const _SUP_PAGES = ['dashboard', 'users', 'houses', 'manage-houses', 'manage-cities', 'manage-products',
  'manage-cats', 'percapita-financeiro', 'manage-cc', 'all-orders', 'produtividade', 'kanban',
  'new-order', 'movement', 'stock-view', 'transferencias', 'orcamento-financeiro', 'orc-pendentes',
  'fornecedores', 'my-orders', 'prices', 'percapita', 'calc-real', 'previsao', 'rotina-estoque',
  'cardapio-diario', 'financeiro-compras', 'indicadores', 'irmaos', 'ind-fornecedores', 'metas',
  'var-solicitacoes', 'var-orcamento', 'var-proposta', 'var-historico', 'var-setores', 'solicitar-ajuste'];
const _TODAS_PAGES = [..._SUP_PAGES, ..._MOD_PAGES];

// Matriz padrão = espelha o comportamento atual (js/04-percapita.js antigo)
// + páginas de módulo abertas a todos. NÃO inclui 'permissoes' (só admin).
window.FALLBACK_PERMS = {
  diretor: _TODAS_PAGES, gerente: _TODAS_PAGES, coordenador: _TODAS_PAGES,
  compras: ['new-order', 'movement', 'all-orders', 'prices', 'orcamento-financeiro', 'orc-pendentes',
    'fornecedores', 'kanban', 'houses', 'manage-houses', 'manage-cities', 'manage-products',
    'manage-cats', 'manage-cc', 'financeiro-compras', 'percapita', 'stock-view', 'transferencias',
    'previsao', 'calc-real', 'my-orders', 'var-solicitacoes', ..._MOD_PAGES],
  estoque: ['new-order', 'movement', 'all-orders', 'prices', 'orcamento-financeiro', 'orc-pendentes',
    'fornecedores', 'kanban', 'stock-view', 'transferencias', 'percapita', 'previsao', 'my-orders',
    'var-solicitacoes', ..._MOD_PAGES],
  financeiro: ['financeiro-compras', 'fornecedores', 'var-solicitacoes', ..._MOD_PAGES],
  escritorio: ['var-solicitacoes', ..._MOD_PAGES],
  csl: ['new-order', 'movement', 'all-orders', 'stock-view', 'my-orders', 'solicitar-ajuste', ..._MOD_PAGES],
  coord_csl: ['new-order', 'movement', 'all-orders', 'stock-view', 'my-orders', ..._MOD_PAGES],
  usuario: ['movement', 'my-orders', 'new-order', ..._MOD_PAGES],
};

// Perfis editáveis na tela (admin fica de fora = acesso total)
const _ROLES_EDIT = ['diretor', 'gerente', 'coordenador', 'compras', 'estoque', 'financeiro', 'escritorio', 'csl', 'coord_csl', 'usuario'];
const _ROLES_ROTULO = { diretor: 'Diretor', gerente: 'Gerente', coordenador: 'Coordenador', compras: 'Compras', estoque: 'Estoque', financeiro: 'Financeiro', escritorio: 'Escritório', csl: 'CSL', coord_csl: 'Coord. CSL', usuario: 'Usuário' };

// Conjunto de páginas permitidas p/ um perfil: banco → fallback. 'ALL' p/ admin.
// Se existe snapshot salvo no banco pro perfil, ele é a fonte da verdade
// inteira (inclusive páginas de módulo) — a tela Permissões monta os
// checkboxes a partir da própria sidebar, então qualquer página nova já
// aparece lá (desmarcada) na primeira vez que o admin abrir a tela; não
// precisa mais forçar _MOD_PAGES sempre aberta por baixo dos panos, e isso
// permitia desmarcar Passagens/Fretes/Diretoria sem efeito nenhum.
function permSetDe(role) {
  if (role === 'admin') return 'ALL';
  const m = window.PERMISSOES;
  if (m && m[role]) return new Set(m[role]);        // Set vindo do banco, tal como salvo
  const fb = window.FALLBACK_PERMS && window.FALLBACK_PERMS[role];
  if (fb) return new Set(fb);
  return null;                                     // perfil desconhecido: não bloqueia
}
window.permSetDe = permSetDe;

async function carregarPermissoes() {
  try {
    const snap = await db.collection('role_permissions').get();
    const map = {};
    snap.docs.forEach(d => {
      const pages = d.data().pages;
      map[d.id] = new Set(Array.isArray(pages) ? pages : []);
    });
    window.PERMISSOES = map;                         // {} se a tabela estiver vazia
  } catch (e) {
    console.warn('Permissões: usando matriz padrão (tabela indisponível).', e.message);
    window.PERMISSOES = null;                        // força fallback
  }
}
window.carregarPermissoes = carregarPermissoes;

// Aplica as permissões à barra lateral: esconde itens não permitidos, seções
// vazias e botões de módulo sem nenhuma página liberada. Roda DEPOIS do showApp.
function aplicarPermissoesSidebar(role) {
  const ps = permSetDe(role);
  if (ps === 'ALL' || ps == null) return;           // admin/desconhecido: showApp decide
  document.querySelectorAll('#sidebar .sidebar-item[data-page]').forEach(it => {
    it.style.display = ps.has(it.dataset.page) ? '' : 'none';
  });
  document.querySelectorAll('#sidebar .sidebar-section').forEach(sec => {
    const algum = [...sec.querySelectorAll('.sidebar-item[data-page]')].some(it => it.style.display !== 'none');
    if (!algum) sec.style.display = 'none';          // some se ficou sem itens p/ o perfil
  });
  document.querySelectorAll('.modulo-btn').forEach(btn => {
    const mod = btn.dataset.mod;
    const paginas = [...document.querySelectorAll(`#sidebar .sidebar-section[data-modulo="${mod}"] .sidebar-item[data-page]`)].map(i => i.dataset.page);
    btn.style.display = paginas.some(p => ps.has(p)) ? '' : 'none';
  });
}
window.aplicarPermissoesSidebar = aplicarPermissoesSidebar;

// ── Tela de gestão de permissões (admin) ──
function loadPermissoesUI() {
  const cont = document.getElementById('permissoes-conteudo');
  if (!cont) return;

  // páginas a partir da própria sidebar (dedupe global; ignora 'permissoes')
  const vistas = new Set();
  const grupos = [];
  document.querySelectorAll('#sidebar .sidebar-section').forEach(sec => {
    const titulo = sec.querySelector('.sidebar-section-title')?.textContent.trim() || '—';
    const itens = [];
    sec.querySelectorAll('.sidebar-item[data-page]').forEach(it => {
      const pg = it.dataset.page;
      if (pg === 'permissoes' || vistas.has(pg)) return;
      vistas.add(pg);
      itens.push({ page: pg, label: it.textContent.trim().replace(/\s+/g, ' ') });
    });
    if (itens.length) grupos.push({ titulo, itens });
  });

  const permDe = r => {
    const m = window.PERMISSOES;
    return (m && m[r]) ? new Set(m[r]) : new Set((window.FALLBACK_PERMS && window.FALLBACK_PERMS[r]) || []);
  };
  const cur = {}; _ROLES_EDIT.forEach(r => cur[r] = permDe(r));

  let html = '<div class="perm-scroll"><table class="perm-table"><thead><tr>'
    + '<th class="perm-pg">Página</th>';
  _ROLES_EDIT.forEach(r => html += `<th title="${r}">${_ROLES_ROTULO[r]}</th>`);
  html += '</tr></thead><tbody>';
  grupos.forEach(g => {
    html += `<tr class="perm-sec"><td colspan="${_ROLES_EDIT.length + 1}">${frtEsc(g.titulo)}</td></tr>`;
    g.itens.forEach(it => {
      html += `<tr><td class="perm-pg">${frtEsc(it.label)}<div class="perm-key">${it.page}</div></td>`;
      _ROLES_EDIT.forEach(r => {
        const ck = cur[r].has(it.page) ? 'checked' : '';
        html += `<td><input type="checkbox" data-role="${r}" data-page="${it.page}" ${ck}></td>`;
      });
      html += '</tr>';
    });
  });
  html += '</tbody></table></div>';
  cont.innerHTML = html;
}
window.loadPermissoesUI = loadPermissoesUI;

async function salvarPermissoes() {
  const btn = document.getElementById('perm-salvar');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }
  try {
    const porRole = {}; _ROLES_EDIT.forEach(r => porRole[r] = []);
    document.querySelectorAll('#permissoes-conteudo input[type=checkbox]').forEach(cb => {
      if (cb.checked) porRole[cb.dataset.role].push(cb.dataset.page);
    });
    for (const r of _ROLES_EDIT) {
      await db.collection('role_permissions').doc(r).set({
        pages: porRole[r],
        atualizadoPor: (typeof currentUserData !== 'undefined' && currentUserData?.name) || null,
        atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    await carregarPermissoes();
    showToast('✅ Permissões salvas. Cada usuário verá a mudança no próximo login.');
  } catch (e) {
    console.error(e);
    showToast('❌ Erro ao salvar: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Salvar permissões'; }
  }
}
window.salvarPermissoes = salvarPermissoes;
