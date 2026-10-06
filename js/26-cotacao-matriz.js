// ─────────────────────────────────────────────────────────────────────────
// 26-cotacao-matriz.js — janela "Orçamentos" do pedido em formato de matriz:
// linhas = produtos do pedido, colunas = fornecedores. A equipe digita o
// preço unitário de cada produto por fornecedor; o sistema calcula o total
// por empresa e destaca o menor preço de cada linha. Cada coluna é uma
// cotação (tabela quotations) e guarda os itens em quotations.itens
// ({catKey, prodId, nome, qty, valorUnit, valorTotal}) — mesmo formato que
// o comparativo de Orçamentos Pendentes (opcComparativoItensHTML) já lê.
// Cotação que só tem o total (antigas, ou fornecedor que mandou só o total)
// continua existindo: coluna no modo "só total".
// ─────────────────────────────────────────────────────────────────────────

let _cot = null; // { orderId, itens:[...], cols:[...], seq }

const _cotEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const _cotBRL = n => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const _cotNum = v => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };

// Itens que realmente precisam ser COMPRADOS: depois da Avaliação de Estoque,
// o que o estoque atende (transferência) sai da cotação. Mesma regra do PDF
// "Itens para COMPRA" (generatePDFFromDetail). Sem avaliação, vale o pedido todo.
function pedidoItensParaCompra(pedido) {
  const vazio = m => !m || !Object.values(m).some(c => c && Object.keys(c).length);
  let m = pedido?.purchaseItems;
  if (vazio(m) && pedido?.stockEval) {
    m = {};
    Object.values(pedido.stockEval).filter(ev => !ev.transfer || ev.qty <= 0).forEach(ev => {
      if (!m[ev.catKey]) m[ev.catKey] = {};
      const buyQty = ev.needed - (ev.transfer ? (ev.qty || 0) : 0);
      m[ev.catKey][ev.prodId] = Math.max(0, buyQty || ev.needed);
    });
  }
  if (vazio(m)) m = pedido?.items || {};
  const out = {};
  Object.entries(m).forEach(([cat, prods]) => Object.entries(prods || {}).forEach(([id, q]) => { if ((Number(q) || 0) > 0) (out[cat] = out[cat] || {})[id] = q; }));
  return out;
}

function _cotItensDoPedido(pedido) {
  const out = [];
  Object.entries(pedidoItensParaCompra(pedido)).forEach(([catKey, prods]) => {
    Object.entries(prods || {}).forEach(([prodId, qty]) => {
      const p = CATEGORIAS[catKey]?.produtos?.find(x => x.id === prodId);
      const nome = (typeof nomeProdutoAtual === 'function' ? nomeProdutoAtual(catKey, prodId, p?.nome) : p?.nome) || prodId;
      out.push({ key: catKey + '|' + prodId, catKey, prodId, nome, unidade: p?.unidade || '', qty: Number(qty) || 0 });
    });
  });
  return out;
}

// Sem argumentos: pedido aberto no detalhe. Com (orderId, pedido, origem): chamada de outra tela
// (ex.: Orçamentos Pendentes, origem 'pendentes' — recarrega a lista depois de salvar).
async function cotMatrizAbrir(orderIdArg, pedidoArg, origem) {
  const orderId = orderIdArg || currentDetailOrderId;
  const pedido = pedidoArg || detailOrderData;
  currentQuotationOrderId = orderId;
  document.getElementById('modal-quot-title').textContent = `Orçamentos — ${pedido?.code || ''}`;
  openModal('modal-quotation');
  const wrap = document.getElementById('cot-matriz');
  wrap.innerHTML = '<div class="loading-state"><div class="spinner spinner-dark"></div>Carregando...</div>';
  try {
    if (!suppliersCache.length) {
      const s = await db.collection('suppliers').orderBy('nome').get();
      suppliersCache = s.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    const snap = await db.collection('quotations').where('orderId', '==', orderId).get();
    _cot = { orderId, pedido, origem: origem || (_cot && _cot.orderId === orderId ? _cot.origem : null), itens: _cotItensDoPedido(pedido), cols: [], seq: 0 };
    snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (Number(a.valor) || 0) - (Number(b.valor) || 0)).forEach(q => {
      const precos = {};
      (Array.isArray(q.itens) ? q.itens : []).forEach(i => { precos[i.catKey + '|' + i.prodId] = String(i.valorUnit ?? ''); });
      _cot.cols.push({
        uid: ++_cot.seq, id: q.id, fornecedorId: q.fornecedorId || '', fornecedorNome: q.fornecedorNome || '',
        validade: q.validade || '', obs: q.obs || '', status: q.status || 'pendente',
        // Proteína (e qualquer pedido aberto por Orçamentos Pendentes) usa a
        // tabela por produto: cotação antiga só com total abre em modo "por
        // item" (preços em branco) — o total antigo fica visível no aviso e
        // volta com "informar só o total".
        modo: ((Array.isArray(q.itens) && q.itens.length) || _cot.origem === 'pendentes' || (_cot.pedido?.categories || []).includes('proteina')) ? 'itens' : 'total',
        totalAnterior: (Array.isArray(q.itens) && q.itens.length) ? 0 : (parseFloat(q.valor) || 0),
        precos, totalManual: q.valor != null ? String(q.valor) : '',
      });
    });
    if (!_cot.cols.length) _cotNovaColuna();
    _cotRenderizar();
  } catch (e) {
    console.error('cotMatrizAbrir', e);
    wrap.innerHTML = `<div style="color:var(--danger);padding:16px;">Erro ao carregar orçamentos: ${_cotEsc(e.message)}</div>`;
  }
}
window.cotMatrizAbrir = cotMatrizAbrir;

function _cotNovaColuna() {
  _cot.cols.push({ uid: ++_cot.seq, id: null, fornecedorId: '', fornecedorNome: '', validade: '', obs: '', status: 'pendente', modo: 'itens', precos: {}, totalManual: '' });
}
function cotAddCol() { _cotNovaColuna(); _cotRenderizar(); }
window.cotAddCol = cotAddCol;

const _cotCol = uid => _cot.cols.find(c => c.uid === uid);
const _cotEditavel = c => !c.id || c.status === 'pendente';

function _cotTotais(c) {
  if (c.modo === 'total') return { total: _cotNum(c.totalManual), faltam: 0, completo: _cotNum(c.totalManual) > 0 };
  let total = 0, faltam = 0;
  _cot.itens.forEach(i => { const u = _cotNum(c.precos[i.key]); if (u > 0) total += u * i.qty; else faltam++; });
  return { total, faltam, completo: faltam === 0 && total > 0 };
}

function _cotRenderizar() {
  const wrap = document.getElementById('cot-matriz');
  const { itens, cols } = _cot;
  const th = 'padding:8px 10px;border-bottom:1px solid var(--border);text-align:left;font-size:11px;text-transform:uppercase;color:var(--text-muted);vertical-align:bottom;';
  const optsForn = sel => '<option value="">Selecione o fornecedor…</option>' + suppliersCache.map(s => `<option value="${_cotEsc(s.id)}" ${s.id === sel ? 'selected' : ''}>${_cotEsc(s.nome)}</option>`).join('');

  const head = cols.map(c => {
    const ed = _cotEditavel(c);
    const nome = c.id
      ? `<div style="font-weight:700;font-size:13px;text-transform:none;color:var(--text);">${_cotEsc(c.fornecedorNome || '—')}</div>`
      : `<select class="form-select" style="font-size:12px;padding:5px 6px;" onchange="cotSetForn(${c.uid}, this)">${optsForn(c.fornecedorId)}</select>`;
    const badge = c.id && c.status !== 'pendente' ? `<span class="badge ${c.status === 'aprovado' ? 'badge-ok' : 'badge-danger'}" style="margin-left:6px;">${_cotEsc(c.status)}</span>` : '';
    return `<th style="${th}min-width:170px;border-left:1px solid var(--border);">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">${nome}${badge}
        <button class="btn btn-danger btn-sm" title="Remover coluna" onclick="cotRemoverCol(${c.uid})" style="padding:2px 7px;">✕</button></div>
      <div style="margin-top:6px;"><input type="date" class="form-input" style="font-size:11px;padding:4px 6px;" value="${_cotEsc(c.validade)}" ${ed ? '' : 'disabled'} oninput="cotSetMeta(${c.uid},'validade',this.value)" title="Validade da cotação"></div>
    </th>`;
  }).join('');

  const linhas = itens.map(i => `<tr>
      <td style="padding:7px 10px;border-bottom:1px solid var(--border);font-size:13px;">${_cotEsc(i.nome)} <span style="color:var(--text-muted);font-size:11px;">${_cotEsc(i.unidade)}</span></td>
      <td style="padding:7px 10px;border-bottom:1px solid var(--border);text-align:right;font-weight:700;">${i.qty}</td>
      ${cols.map(c => c.modo === 'itens'
        ? `<td data-cel="${c.uid}|${_cotEsc(i.key)}" style="padding:5px 8px;border-bottom:1px solid var(--border);border-left:1px solid var(--border);">
             <input type="number" step="0.01" min="0" class="form-input" placeholder="0,00" style="text-align:right;padding:6px 8px;" value="${_cotEsc(c.precos[i.key] ?? '')}" ${_cotEditavel(c) ? '' : 'disabled'}
               oninput="cotSetPreco(${c.uid},'${_cotEsc(i.key)}',this.value)">
             <div data-sub="${c.uid}|${_cotEsc(i.key)}" style="font-size:10.5px;color:var(--text-muted);text-align:right;margin-top:2px;min-height:13px;"></div>
           </td>`
        : `<td style="padding:7px 10px;border-bottom:1px solid var(--border);border-left:1px solid var(--border);text-align:center;color:var(--text-muted);font-size:11px;">só total</td>`).join('')}
    </tr>`).join('') || `<tr><td colspan="${2 + cols.length}" style="padding:16px;text-align:center;color:var(--text-muted);">Pedido sem itens.</td></tr>`;

  const totais = cols.map(c => {
    const ed = _cotEditavel(c);
    const entrada = c.modo === 'total'
      ? `<input type="number" step="0.01" min="0" class="form-input" placeholder="Total (R$)" style="text-align:right;font-weight:700;padding:6px 8px;" value="${_cotEsc(c.totalManual)}" ${ed ? '' : 'disabled'} oninput="cotSetTotal(${c.uid},this.value)">`
      : `<div id="cot-total-${c.uid}" style="font-size:16px;font-weight:800;text-align:right;"></div>`;
    return `<td style="padding:8px;border-top:2px solid var(--border);border-left:1px solid var(--border);vertical-align:top;">
      ${entrada}
      <div id="cot-aviso-${c.uid}" style="font-size:11px;text-align:right;margin-top:3px;min-height:14px;"></div>
      <div style="text-align:right;margin-top:2px;">${ed ? `<a href="#" style="font-size:11px;" onclick="event.preventDefault();cotSetModo(${c.uid})">${c.modo === 'total' ? 'preencher por item' : 'informar só o total'}</a>` : ''}</div>
    </td>`;
  }).join('');

  const obs = cols.map(c => `<td style="padding:6px 8px;border-left:1px solid var(--border);">
      <input type="text" class="form-input" placeholder="Obs.: frete, desconto, itens que não tem…" style="font-size:12px;padding:5px 8px;" value="${_cotEsc(c.obs)}" ${_cotEditavel(c) ? '' : 'disabled'} oninput="cotSetMeta(${c.uid},'obs',this.value)"></td>`).join('');
  const acoes = cols.map(c => `<td style="padding:8px;border-left:1px solid var(--border);text-align:right;">
      ${_cotEditavel(c) ? `<button class="btn btn-primary btn-sm" onclick="cotSalvarCol(${c.uid})">💾 ${c.id ? 'Salvar alterações' : 'Salvar cotação'}</button>` : '<span style="font-size:11px;color:var(--text-muted);">Cotação já decidida — não editável</span>'}
    </td>`).join('');

  wrap.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
      <div style="font-size:12px;color:var(--text-muted);">Digite o preço <b>unitário</b> de cada produto por fornecedor. Produto que a empresa não tem fica em branco — o total avisa quantos faltam. 🟢 verde = menor preço da linha.</div>
      <button class="btn btn-outline btn-sm" onclick="cotAddCol()">+ Adicionar fornecedor</button>
    </div>
    <div style="overflow-x:auto;border:1px solid var(--border);border-radius:10px;">
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr><th style="${th}min-width:200px;">Produto</th><th style="${th}text-align:right;">Qtd.</th>${head}</tr></thead>
        <tbody>${linhas}
          <tr><td colspan="2" style="padding:8px 10px;border-top:2px solid var(--border);font-weight:700;vertical-align:top;">Valor total de cada empresa</td>${totais}</tr>
          <tr><td colspan="2" style="padding:6px 10px;font-size:12px;color:var(--text-muted);">Observações</td>${obs}</tr>
          <tr><td colspan="2"></td>${acoes}</tr>
        </tbody>
      </table>
    </div>`;
  _cotRecalcular();
}

// Atualiza só o que é calculado (subtotais, totais, destaques) sem redesenhar
// os campos — senão o cursor sairia do input a cada tecla.
function _cotRecalcular() {
  if (!_cot) return;
  const { itens, cols } = _cot;
  itens.forEach(i => {
    const precos = cols.filter(c => c.modo === 'itens').map(c => ({ c, u: _cotNum(c.precos[i.key]) })).filter(x => x.u > 0);
    const min = precos.length ? Math.min(...precos.map(x => x.u)) : 0;
    cols.forEach(c => {
      if (c.modo !== 'itens') return;
      const u = _cotNum(c.precos[i.key]);
      const td = document.querySelector(`[data-cel="${c.uid}|${i.key}"]`);
      const sub = document.querySelector(`[data-sub="${c.uid}|${i.key}"]`);
      const melhor = u > 0 && precos.length > 1 && u === min;
      if (td) td.style.background = melhor ? 'var(--ok-bg)' : '';
      if (sub) { sub.textContent = u > 0 ? _cotBRL(u * i.qty) : ''; sub.style.color = melhor ? 'var(--ok)' : 'var(--text-muted)'; sub.style.fontWeight = melhor ? '700' : '400'; }
    });
  });
  const tots = cols.map(c => ({ c, t: _cotTotais(c) }));
  const elegiveis = tots.filter(x => x.t.completo);
  const menor = elegiveis.length > 1 ? Math.min(...elegiveis.map(x => x.t.total)) : null;
  tots.forEach(({ c, t }) => {
    const el = document.getElementById('cot-total-' + c.uid);
    if (el) { el.textContent = t.total > 0 ? _cotBRL(t.total) : '—'; el.style.color = (menor != null && t.completo && t.total === menor) ? 'var(--ok)' : 'var(--text)'; }
    const av = document.getElementById('cot-aviso-' + c.uid);
    if (av) {
      if (c.modo === 'itens' && t.total === 0 && c.totalAnterior > 0) av.innerHTML = `<span style="color:var(--text-muted);">total informado antes (sem itens): <b>${_cotBRL(c.totalAnterior)}</b> — preencha os preços por produto</span>`;
      else if (c.modo === 'itens' && t.faltam > 0 && t.total > 0) av.innerHTML = `<span style="color:var(--warn,#d97706);font-weight:600;">⚠️ faltam ${t.faltam} item(ns) sem preço</span>`;
      else if (menor != null && t.completo && t.total === menor) av.innerHTML = '<span style="color:var(--ok);font-weight:700;">★ menor total</span>';
      else if (c.modo === 'total' && t.total > 0) av.innerHTML = '<span style="color:var(--text-muted);">total informado (sem itens)</span>';
      else av.innerHTML = '';
    }
  });
}

function cotSetForn(uid, sel) {
  const c = _cotCol(uid); if (!c) return;
  c.fornecedorId = sel.value;
  c.fornecedorNome = sel.options[sel.selectedIndex]?.text || '';
}
function cotSetPreco(uid, key, v) { const c = _cotCol(uid); if (c) { c.precos[key] = v; _cotRecalcular(); } }
function cotSetTotal(uid, v) { const c = _cotCol(uid); if (c) { c.totalManual = v; _cotRecalcular(); } }
function cotSetMeta(uid, campo, v) { const c = _cotCol(uid); if (c) c[campo] = v; }
function cotSetModo(uid) { const c = _cotCol(uid); if (c) { c.modo = c.modo === 'total' ? 'itens' : 'total'; _cotRenderizar(); } }
window.cotSetForn = cotSetForn; window.cotSetPreco = cotSetPreco; window.cotSetTotal = cotSetTotal; window.cotSetMeta = cotSetMeta; window.cotSetModo = cotSetModo;

async function cotRemoverCol(uid) {
  const c = _cotCol(uid); if (!c) return;
  if (c.id) {
    if (!confirm(`Remover a cotação de ${c.fornecedorNome || 'este fornecedor'}?`)) return;
    try { await db.collection('quotations').doc(c.id).delete(); } catch (e) { showToast('❌ Erro ao remover: ' + e.message); return; }
  }
  _cot.cols = _cot.cols.filter(x => x.uid !== uid);
  if (!_cot.cols.length) _cotNovaColuna();
  _cotRenderizar();
}
window.cotRemoverCol = cotRemoverCol;

async function cotSalvarCol(uid) {
  const c = _cotCol(uid); if (!c) return;
  if (!c.fornecedorId) { showToast('Selecione o fornecedor.'); return; }
  let valor = 0, itens = null;
  if (c.modo === 'total') {
    valor = _cotNum(c.totalManual);
  } else {
    itens = _cot.itens.filter(i => _cotNum(c.precos[i.key]) > 0).map(i => {
      const u = _cotNum(c.precos[i.key]);
      return { catKey: i.catKey, prodId: i.prodId, nome: i.nome, qty: i.qty, valorUnit: u, valorTotal: Math.round(u * i.qty * 100) / 100 };
    });
    valor = Math.round(itens.reduce((s, i) => s + i.valorTotal, 0) * 100) / 100;
  }
  if (!(valor > 0)) { showToast('Informe pelo menos um preço (ou o total) antes de salvar.'); return; }
  const dados = { fornecedorId: c.fornecedorId, fornecedorNome: c.fornecedorNome, valor, itens, validade: c.validade || '', obs: c.obs || '' };
  try {
    if (c.id) {
      await db.collection('quotations').doc(c.id).update(dados);
    } else {
      await db.collection('quotations').add({ ...dados, orderId: _cot.orderId, status: 'pendente', createdBy: currentUserData?.name || '', createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      // 1ª cotação do pedido: avança de "Estoque Avaliado" pra "Análise de
      // Orçamento" — só nesse sentido (nunca regride pedido já liberado).
      try {
        const o = await db.collection('orders').doc(_cot.orderId).get();
        if (o.exists && o.data().status === 'estoque_avaliado') {
          await db.collection('orders').doc(_cot.orderId).update({ status: 'andamento', updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
          if (typeof loadAllOrders === 'function') loadAllOrders();
        }
      } catch (e) { console.warn('Erro ao avançar status do pedido:', e); }
    }
    showToast('✅ Cotação salva!');
    const origem = _cot.origem;
    await cotMatrizAbrir(_cot.orderId, _cot.pedido, origem);
    if (origem === 'pendentes' && typeof initOrcPendentes === 'function') initOrcPendentes();
  } catch (e) {
    console.error('cotSalvarCol', e);
    showToast('❌ Erro ao salvar: ' + e.message);
  }
}
window.cotSalvarCol = cotSalvarCol;
