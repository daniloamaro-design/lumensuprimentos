// ─────────────────────────────────────────────────────────────────────────
// 27-aprovacao-por-produto.js — Orçamentos Pendentes: aprovação POR PRODUTO.
// Em vez de aprovar um fornecedor pro pedido inteiro, a tabela mostra cada
// produto x fornecedor e permite escolher de qual empresa comprar cada item
// (ou cancelar o item). Fluxo em 2 etapas, como a aprovação normal:
//   1) Coordenador salva a seleção  → cotações com itens escolhidos ficam
//      "aprovadas pelo coord.", as outras "recusadas"; a seleção fica em
//      orders.divisao_fornecedores ({etapa:'coordenador', porItem:{...}}).
//   2) Gerente confirma             → libera o pedido, grava a divisão final
//      (partes por fornecedor) e lança UM lançamento no Financeiro por
//      fornecedor (código do pedido; as demais partes com sufixo -F2, -F3…).
// Cotação que só tem o total (sem preço por item) não dá pra dividir: fica
// de fora da tabela de escolha (aprova-se o pedido inteiro pelos botões da
// lista, como antes).
// ─────────────────────────────────────────────────────────────────────────

let _apf = null; // { pedido, cots, itens, sel:{chave: cotId|'cancel'|''} }

const _apfEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const _apfBRL = n => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function _apfGarantirModal() {
  if (document.getElementById('modal-apf')) return;
  const div = document.createElement('div');
  div.className = 'modal-overlay hidden';
  div.id = 'modal-apf';
  div.innerHTML = `<div class="modal modal-wide" style="max-width:1320px;width:97vw;">
    <div class="modal-header"><div class="modal-title" id="apf-titulo">Aprovar por produto</div>
      <button class="modal-close" onclick="closeModal('modal-apf')">×</button></div>
    <div class="modal-body" id="apf-body"></div>
    <div class="modal-footer" id="apf-footer" style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;"></div>
  </div>`;
  document.body.appendChild(div);
}

function _apfItensDoPedido(pedido) {
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

// preço unitário real (cotado por item) de um item numa cotação, ou 0
const _apfPreco = (q, key) => {
  const it = (Array.isArray(q.itens) ? q.itens : []).find(i => i.catKey + '|' + i.prodId === key);
  return it ? (parseFloat(it.valorUnit) || 0) : 0;
};
const _apfDetalhada = q => Array.isArray(q.itens) && q.itens.length > 0;

// Abre a matriz de preços (js/26) pra este pedido, a partir de Orçamentos Pendentes
function opcAbrirPrecosPorProduto(pedidoId) {
  const pedido = opcPedidos.find(p => p.id === pedidoId);
  if (!pedido) return;
  if (document.getElementById('modal-apf')) closeModal('modal-apf');
  cotMatrizAbrir(pedido.id, pedido, 'pendentes');
}
window.opcAbrirPrecosPorProduto = opcAbrirPrecosPorProduto;

function opcAbrirAprovacaoPorProduto(pedidoId) {
  const pedido = opcPedidos.find(p => p.id === pedidoId);
  if (!pedido) return;
  _apfGarantirModal();
  const cots = (opcCotacoes[pedidoId] || []).filter((q, i, arr) => arr.findIndex(x => x.id === q.id) === i && q.statusGerente !== 'aprovado' && q.statusGerente !== 'recusado');
  const itens = _apfItensDoPedido(pedido);
  const sel = {};
  const rascunho = pedido.divisaoFornecedores?.porItem || null;
  itens.forEach(i => {
    if (rascunho && rascunho[i.key] !== undefined) { sel[i.key] = rascunho[i.key]; return; }
    // sugestão: fornecedor de menor preço que cotou o item
    const cand = cots.filter(_apfDetalhada).map(q => ({ id: q.id, p: _apfPreco(q, i.key) })).filter(x => x.p > 0).sort((a, b) => a.p - b.p);
    sel[i.key] = cand.length ? cand[0].id : '';
  });
  _apf = { pedido, cots, itens, sel, sugestao: !rascunho };
  document.getElementById('apf-titulo').textContent = `Aprovar por produto — ${pedido.code || pedido.id} · ${pedido.house || ''}`;
  _apfRenderizar();
  openModal('modal-apf');
}
window.opcAbrirAprovacaoPorProduto = opcAbrirAprovacaoPorProduto;

function _apfRenderizar() {
  const { cots, itens, sel } = _apf;
  const th = 'padding:8px 10px;border-bottom:1px solid var(--border);text-align:left;font-size:11px;text-transform:uppercase;color:var(--text-muted);vertical-align:bottom;';
  const detalhadas = cots.filter(_apfDetalhada);
  const soTotal = cots.filter(q => !_apfDetalhada(q));

  const head = detalhadas.map(q => `<th style="${th}border-left:1px solid var(--border);min-width:150px;">
      <div style="font-weight:700;font-size:13px;text-transform:none;color:var(--text);">${_apfEsc(q.fornecedorNome || '—')}</div>
      <div style="font-size:11px;font-weight:400;text-transform:none;color:var(--text-muted);">${q.validade ? 'Validade ' + _apfEsc(q.validade) : ''}${q.obs ? ' · ' + _apfEsc(q.obs) : ''}</div></th>`).join('');

  const linhas = itens.map(i => {
    const precos = detalhadas.map(q => ({ q, p: _apfPreco(q, i.key) }));
    const validos = precos.filter(x => x.p > 0);
    const min = validos.length ? Math.min(...validos.map(x => x.p)) : 0;
    const cel = precos.map(({ q, p }) => {
      if (!(p > 0)) return `<td style="padding:7px 10px;border-bottom:1px solid var(--border);border-left:1px solid var(--border);text-align:center;color:var(--text-muted);font-size:12px;">— não tem</td>`;
      const melhor = validos.length > 1 && p === min;
      return `<td data-apf-key="${_apfEsc(i.key)}" data-apf-qid="${q.id}" style="padding:7px 10px;border-bottom:1px solid var(--border);border-left:1px solid var(--border);${melhor ? 'background:var(--ok-bg);' : ''}">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
            <input type="radio" name="apf-${_apfEsc(i.key)}" value="${q.id}" ${sel[i.key] === q.id ? 'checked' : ''} onchange="apfEscolher('${_apfEsc(i.key)}','${q.id}')" style="accent-color:var(--lumen);width:16px;height:16px;">
            <span><b style="${melhor ? 'color:var(--ok);' : ''}">${_apfBRL(p)}</b>${melhor ? ' <span style="font-size:10px;color:var(--ok);">★ menor</span>' : ''}<br><span style="font-size:11px;color:var(--text-muted);">${_apfBRL(p * i.qty)}</span></span>
          </label></td>`;
    }).join('');
    return `<tr>
      <td style="padding:7px 10px;border-bottom:1px solid var(--border);font-size:13px;">${_apfEsc(i.nome)} <span style="font-size:11px;color:var(--text-muted);">${_apfEsc(i.unidade)}</span></td>
      <td style="padding:7px 10px;border-bottom:1px solid var(--border);text-align:right;font-weight:700;">${i.qty}</td>
      ${cel}
      <td style="padding:7px 10px;border-bottom:1px solid var(--border);border-left:2px solid var(--border);text-align:center;">
        <label style="cursor:pointer;font-size:12px;color:var(--danger);display:inline-flex;align-items:center;gap:6px;"><input type="radio" name="apf-${_apfEsc(i.key)}" value="cancel" ${sel[i.key] === 'cancel' ? 'checked' : ''} onchange="apfEscolher('${_apfEsc(i.key)}','cancel')" style="accent-color:var(--danger);">cancelar item</label></td>
    </tr>`;
  }).join('');

  const rodape = detalhadas.map(q => `<td style="padding:8px 10px;border-top:2px solid var(--border);border-left:1px solid var(--border);vertical-align:top;">
      <div id="apf-tot-${q.id}" style="font-size:15px;font-weight:800;"></div><div id="apf-qtd-${q.id}" style="font-size:11px;color:var(--text-muted);"></div></td>`).join('');

  document.getElementById('apf-body').innerHTML = `
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">
      Marque, em cada produto, de qual fornecedor vai comprar (ou cancele o item). ${_apf.sugestao ? 'A seleção inicial é uma <b>sugestão</b>: o menor preço de cada item.' : 'Seleção salva pelo coordenador — confira e ajuste se precisar.'}
      O pedido será dividido em um lançamento por fornecedor.
    </div>
    ${soTotal.length ? `<div style="font-size:12px;padding:8px 12px;margin-bottom:10px;border-left:3px solid var(--warn,#d97706);background:var(--warn-bg);">Sem preço por item (só total), não entram na divisão: <b>${soTotal.map(q => _apfEsc(q.fornecedorNome) + ' (' + _apfBRL(q.valor) + ')').join(', ')}</b>. Pra aprovar o pedido inteiro com uma delas, use os botões ✅ da lista.</div>` : ''}
    ${detalhadas.length === 0 ? `<div style="padding:24px;text-align:center;color:var(--text-muted);">Nenhuma cotação com preço por item neste pedido.<br><br><button class="btn btn-primary" onclick="opcAbrirPrecosPorProduto('${_apf.pedido.id}')">💲 Preencher preços por produto</button></div>` : `
    <div style="overflow-x:auto;border:1px solid var(--border);border-radius:10px;">
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr><th style="${th}min-width:200px;">Produto</th><th style="${th}text-align:right;">Qtd.</th>${head}<th style="${th}border-left:2px solid var(--border);text-align:center;">Cancelar</th></tr></thead>
        <tbody>${linhas}
          <tr><td colspan="2" style="padding:8px 10px;border-top:2px solid var(--border);font-weight:700;">Total aprovado por fornecedor</td>${rodape}<td style="border-top:2px solid var(--border);border-left:2px solid var(--border);padding:8px 10px;vertical-align:top;"><div id="apf-tot-cancel" style="font-size:12px;color:var(--danger);"></div></td></tr>
        </tbody>
      </table>
    </div>
    <div id="apf-resumo" style="margin-top:12px;font-size:13px;"></div>`}`;

  const ft = document.getElementById('apf-footer');
  ft.innerHTML = `<button class="btn btn-outline" onclick="closeModal('modal-apf')">Fechar</button>
    ${detalhadas.length ? `<button class="btn btn-secondary" onclick="apfSalvarSelecao()">💾 Salvar seleção (Coordenador)</button>
    <button class="btn btn-primary" onclick="apfAprovarEliberar()">✅ Aprovar e liberar pedido (Gerente)</button>` : ''}`;
  _apfRecalcular();
}

function apfEscolher(key, valor) { _apf.sel[key] = valor; _apfRecalcular(); }
window.apfEscolher = apfEscolher;

// Partes = [{cot, itens:[chave], valor}] só com cotações que têm algo escolhido
function _apfPartes() {
  const partes = [];
  _apf.cots.filter(_apfDetalhada).forEach(q => {
    const chaves = _apf.itens.filter(i => _apf.sel[i.key] === q.id).map(i => i.key);
    if (!chaves.length) return;
    const valor = Math.round(chaves.reduce((s, k) => { const it = _apf.itens.find(x => x.key === k); return s + _apfPreco(q, k) * it.qty; }, 0) * 100) / 100;
    partes.push({ cot: q, chaves, valor });
  });
  return partes;
}
const _apfSemEscolha = () => _apf.itens.filter(i => !_apf.sel[i.key]);

function _apfRecalcular() {
  const partes = _apfPartes();
  _apf.cots.filter(_apfDetalhada).forEach(q => {
    const p = partes.find(x => x.cot.id === q.id);
    const t = document.getElementById('apf-tot-' + q.id), n = document.getElementById('apf-qtd-' + q.id);
    if (t) { t.textContent = p ? _apfBRL(p.valor) : '—'; t.style.color = p ? 'var(--ok)' : 'var(--text-muted)'; }
    if (n) n.textContent = p ? `${p.chaves.length} de ${_apf.itens.length} produto(s)` : 'nenhum produto';
  });
  const canc = _apf.itens.filter(i => _apf.sel[i.key] === 'cancel');
  const tc = document.getElementById('apf-tot-cancel'); if (tc) tc.textContent = canc.length ? canc.length + ' item(ns) cancelado(s)' : '';
  // destaca célula escolhida
  document.querySelectorAll('[data-apf-key]').forEach(td => {
    td.style.outline = _apf.sel[td.dataset.apfKey] === td.dataset.apfQid ? '2px solid var(--lumen)' : '';
    td.style.outlineOffset = '-2px';
  });
  const total = partes.reduce((s, p) => s + p.valor, 0);
  const falta = _apfSemEscolha();
  const el = document.getElementById('apf-resumo');
  if (el) el.innerHTML = `<b>Total a comprar:</b> ${_apfBRL(total)} em ${partes.length} fornecedor(es)` +
    (falta.length ? ` &nbsp;·&nbsp; <span style="color:var(--warn,#d97706);font-weight:700;">⚠️ ${falta.length} produto(s) sem escolha: ${falta.map(i => _apfEsc(i.nome)).join(', ')}</span>` : ' &nbsp;·&nbsp; <span style="color:var(--ok);font-weight:700;">✓ todos os produtos definidos</span>');
}

// ── Etapa 1: coordenador salva a seleção ────────────────────────────────
async function apfSalvarSelecao(silencioso) {
  const falta = _apfSemEscolha();
  if (falta.length) { showToast(`Escolha um fornecedor (ou cancele) em: ${falta.map(i => i.nome).join(', ')}`); return false; }
  const partes = _apfPartes();
  const agora = firebase.firestore.FieldValue.serverTimestamp();
  try {
    for (const q of _apf.cots) {
      const tem = partes.some(p => p.cot.id === q.id);
      const st = tem ? 'aprovado' : 'recusado';
      await db.collection('quotations').doc(q.id).update({
        status: st, statusCoordenador: st, coordenadorNome: currentUserData?.name || '', coordenadorEm: agora, statusGerente: 'pendente',
      });
    }
    await db.collection('orders').doc(_apf.pedido.id).update({
      divisaoFornecedores: { etapa: 'coordenador', porItem: { ..._apf.sel }, por: currentUserData?.name || '', em: new Date().toISOString() },
    });
    if (!silencioso) {
      showToast('✅ Seleção salva. Aguardando o gerente confirmar.');
      closeModal('modal-apf');
      if (typeof initOrcPendentes === 'function') initOrcPendentes();
    }
    return true;
  } catch (e) {
    console.error('apfSalvarSelecao', e);
    showToast('❌ Erro ao salvar a seleção: ' + e.message);
    return false;
  }
}
window.apfSalvarSelecao = apfSalvarSelecao;

// ── Etapa 2: gerente confirma e libera ─────────────────────────────────
async function apfAprovarEliberar() {
  const role = currentUserData?.role || '';
  if (!['admin', 'diretor', 'gerente', 'coordenador'].includes(role)) { showToast('⚠️ Só gerente/coordenador pode liberar o pedido.'); return; }
  const falta = _apfSemEscolha();
  if (falta.length) { showToast(`Escolha um fornecedor (ou cancele) em: ${falta.map(i => i.nome).join(', ')}`); return; }
  const partes = _apfPartes();
  if (!partes.length) { showToast('Nenhum item foi escolhido — pra recusar tudo use ❌ na lista.'); return; }
  const total = partes.reduce((s, p) => s + p.valor, 0);
  const resumo = partes.map(p => `• ${p.cot.fornecedorNome}: ${p.chaves.length} produto(s) — ${_apfBRL(p.valor)}`).join('\n');
  if (!confirm(`Liberar o pedido ${_apf.pedido.code || ''} dividido assim?\n\n${resumo}\n\nTotal: ${_apfBRL(total)}\n\nVai criar um lançamento no Financeiro por fornecedor.`)) return;

  const pedido = _apf.pedido;
  try {
    const orderSnap = await db.collection('orders').doc(pedido.id).get();
    const orderData = orderSnap.data() || {};
    if (orderData.status !== 'andamento') { showToast('⚠️ Este pedido já não está em "andamento" (outra pessoa pode ter liberado). Atualize a tela.'); return; }

    const ok = await apfSalvarSelecao(true);   // grava o passo do coordenador antes (idempotente)
    if (!ok) return;

    const agora = firebase.firestore.FieldValue.serverTimestamp();
    partes.sort((a, b) => b.valor - a.valor);   // maior parte = fornecedor principal do pedido
    const code = orderData.code || pedido.id;
    const cats = orderData.categories || [];
    const classif = cats.map(c => CATEGORIAS[c]?.nome || c).join(', ') || 'Pedido';
    const hoje = new Date();
    const divisaoPartes = [];

    for (let idx = 0; idx < partes.length; idx++) {
      const { cot, chaves, valor } = partes[idx];
      const ref = idx === 0 ? code : `${code}-F${idx + 1}`;
      // prazo do fornecedor → vencimento
      let venc = '';
      try {
        let sup = (window.suppliersCache || []).find(s => s.id === cot.fornecedorId);
        if (!sup && cot.fornecedorId) { const ss = await db.collection('suppliers').doc(cot.fornecedorId).get(); if (ss.exists) sup = { id: cot.fornecedorId, ...ss.data() }; }
        const dias = sup ? (sup.prazo === 'a_vista' ? 0 : parseInt(sup.prazo) || 0) : 0;
        if (dias > 0) { const d = new Date(); d.setDate(d.getDate() + dias); venc = d.toISOString().slice(0, 10); }
      } catch (e) { console.warn('prazo', e); }

      // cotação aprovada: valor = só a parte escolhida (guarda o total original na obs)
      const totalOriginal = parseFloat(cot.valor) || 0;
      const upd = { status: 'aprovado', statusCoordenador: 'aprovado', statusGerente: 'aprovado', gerenteNome: currentUserData?.name || '', gerenteEm: agora, approvedAt: agora };
      if (Math.abs(totalOriginal - valor) > 0.005) { upd.valor = valor; upd.obs = `${cot.obs ? cot.obs + ' | ' : ''}Aprovação parcial: ${chaves.length} de ${_apf.itens.length} produto(s) — cotação original ${_apfBRL(totalOriginal)}`; }
      await db.collection('quotations').doc(cot.id).update(upd);

      // lançamento no Financeiro (um por fornecedor), sem duplicar
      const jaTem = await db.collection('compras_financeiro').where('pedidoRef', '==', ref).limit(1).get();
      if (jaTem.empty) {
        await db.collection('compras_financeiro').add({
          fornecedor: cot.fornecedorNome || '', fornecedorId: cot.fornecedorId || '', classificacao: classif, catKey: cats[0] || '',
          destinatario: orderData.house || '', mes: MESES_PT[hoje.getMonth()], ano: hoje.getFullYear(), dataCompraSerial: hoje.getTime(),
          vencimentoStr: venc || '', valor, pago: '', pedidoRef: ref, pedidoId: pedido.id,
          centroCustoId: orderData.centroCustoId || '', centroCustoNome: orderData.centroCustoNome || '',
          lancadoSP: false, createdAt: agora,
        });
        if (cot.fornecedorId) await db.collection('suppliers').doc(cot.fornecedorId).update({ utilizado: firebase.firestore.FieldValue.increment(valor) }).catch(() => {});
      }

      // preço de referência (Preços por Cidade) só dos itens comprados desta empresa
      const cidade = (typeof CASAS_CIDADES !== 'undefined' ? CASAS_CIDADES : {})[orderData.house];
      if (cidade) {
        await Promise.all(chaves.map(k => {
          const it = (cot.itens || []).find(x => x.catKey + '|' + x.prodId === k); if (!it) return null;
          return atualizarPrecoReferencia({ catKey: it.catKey, prodId: it.prodId, prodNome: it.nome, unidade: CATEGORIAS[it.catKey]?.produtos?.find(x => x.id === it.prodId)?.unidade || '', cidade, price: it.valorUnit, usuario: currentUserData?.name || '' });
        }).filter(Boolean)).catch(e => console.warn('preço de referência', e));
      }
      divisaoPartes.push({ quotationId: cot.id, fornecedorId: cot.fornecedorId || '', fornecedorNome: cot.fornecedorNome || '', valor, itens: chaves, pedidoRef: ref, vencimento: venc || null });
    }

    // cotações sem nada escolhido: recusadas pelo gerente
    for (const q of _apf.cots.filter(c => !partes.some(p => p.cot.id === c.id))) {
      await db.collection('quotations').doc(q.id).update({ status: 'recusado', statusCoordenador: 'recusado', statusGerente: 'recusado', gerenteNome: currentUserData?.name || '', gerenteEm: agora });
    }

    const principal = divisaoPartes[0];
    await db.collection('orders').doc(pedido.id).update({
      status: 'pedido_liberado', liberadoEm: agora,
      cotacaoAprovadaId: principal.quotationId,
      cotacaoFornecedor: divisaoPartes.map(p => p.fornecedorNome).join(' + '),
      cotacaoValor: total,
      fornecedorId: principal.fornecedorId,
      fornecedorNome: divisaoPartes.map(p => p.fornecedorNome).join(' + '),
      boletoVencimento: principal.vencimento || null,
      divisaoFornecedores: { etapa: 'final', partes: divisaoPartes, cancelados: _apf.itens.filter(i => _apf.sel[i.key] === 'cancel').map(i => i.key), por: currentUserData?.name || '', em: new Date().toISOString() },
    });

    showToast(`✅ Pedido liberado e dividido em ${divisaoPartes.length} fornecedor(es).`);
    closeModal('modal-apf');
    if (typeof initOrcPendentes === 'function') initOrcPendentes();
  } catch (e) {
    console.error('apfAprovarEliberar', e);
    showToast('❌ Erro ao liberar o pedido: ' + e.message);
  }
}
window.apfAprovarEliberar = apfAprovarEliberar;
