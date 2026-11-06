// ─────────────────────────────────────────────────────────────────────────
// 32-var-pedidos.js — Compras de Variedades: detalhe do pedido + cotações na própria tela.
// Mesmo desenho dos Pedidos: lista em tabela → "Ver" abre o pedido → "Orçamentos" abre a
// tabela produto × fornecedor, sem trocar de aba. A escolha do fornecedor de cada item é
// salva e liberada em duas etapas (coordenador salva, gerente libera), como nos Pedidos.
//
// Dados (sem migração): cada item é uma linha de var_solicitacoes; as cotações de cada item
// ficam em var_orcamentos { solicitacaoId, cotacoes:[{fornecedor, fornecedorId, valorUnitario,
// qtd, valorTotal, prazoEntrega, obs}], opcaoEscolhida } — o mesmo formato que as telas
// Orçamentos e Proposta Semanal já leem.
// A fase 'em_proposta' passa a se chamar "Em Aprovação" (seleção salva, aguardando liberar).
// ─────────────────────────────────────────────────────────────────────────

// "Em Proposta" → "Em Aprovação" (sem Proposta no novo fluxo). VAR_PIPELINE vem de melhorias.js.
if (typeof VAR_PIPELINE !== 'undefined') {
  const p = VAR_PIPELINE.find(s => s.key === 'em_proposta');
  if (p) { p.label = 'Em Aprovação'; p.icon = '📝'; }
}

const _VC_GESTAO = ['admin', 'diretor', 'gerente', 'coordenador'];
const _vc = { key: null, itens: [], cols: [], seq: 0, sel: {}, orc: {} };
const _vcNum = v => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const _vcNorm = s => String(s || '').trim().toLowerCase();
const _vcRound = n => Math.round(n * 100) / 100;
const _vcPodeOrcar = () => _VC_GESTAO.includes(currentUserData?.role || '');

function _vcGarantirModais() {
  if (!document.getElementById('modal-var-pedido')) {
    const d = document.createElement('div');
    d.className = 'modal-overlay hidden'; d.id = 'modal-var-pedido';
    d.innerHTML = '<div class="modal modal-wide" style="max-width:860px;width:96vw;">'
      + '<div class="modal-header"><div class="modal-title" id="vp-titulo">Pedido</div><button class="modal-close" onclick="closeModal(\'modal-var-pedido\')">×</button></div>'
      + '<div class="modal-body" id="vp-body"></div>'
      + '<div class="modal-footer" id="vp-footer" style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;"></div></div>';
    document.body.appendChild(d);
  }
  if (!document.getElementById('modal-var-cot')) {
    const d = document.createElement('div');
    d.className = 'modal-overlay hidden'; d.id = 'modal-var-cot';
    d.innerHTML = '<div class="modal modal-wide" style="max-width:1320px;width:97vw;">'
      + '<div class="modal-header"><div class="modal-title" id="vc-titulo">Orçamentos</div><button class="modal-close" onclick="closeModal(\'modal-var-cot\')">×</button></div>'
      + '<div class="modal-body" id="vc-body"></div>'
      + '<div class="modal-footer" id="vc-footer" style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;"></div></div>';
    document.body.appendChild(d);
  }
}

// ── Cotações já gravadas dos itens do pedido (var_orcamentos) ───────────
async function _vcBuscarOrcamentos(ids) {
  if (!ids.length) return [];
  const snap = await db.collection('var_orcamentos').where('solicitacaoId', 'in', ids).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
// Entradas de cotação de um doc (formato novo cotacoes[] ou o antigo, 1 cotação por doc)
function _vcEntradas(o) {
  if (Array.isArray(o.cotacoes) && o.cotacoes.length) return o.cotacoes;
  if ((Number(o.valorTotal) || 0) > 0) return [{ fornecedor: o.fornecedor || '', valorTotal: o.valorTotal, valorUnitario: o.valorUnitario, prazoEntrega: o.prazoEntrega || '', obs: o.obs || '' }];
  return [];
}

// ── Detalhe do pedido (substitui o antigo "Ver") ────────────────────────
async function verVarPedido(key) {
  const g = _varGrupos[key]; if (!g) return;
  _vcGarantirModais();
  _vc.key = key;
  const d = g.base, role = currentUserData?.role || '';
  const dt = d.dataLimite ? new Date(d.dataLimite + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
  const terminal = _VAR_TERMINAIS.includes(g.status);
  const canEditDelete = ['admin', 'diretor', 'gerente'].includes(role);
  const canAvancar = _VC_GESTAO.includes(role) || ['compras', 'estoque'].includes(role);
  document.getElementById('vp-titulo').textContent = 'Pedido ' + g.codigo;

  const orcs = await _vcBuscarOrcamentos(g.itens.map(i => i.id)).catch(() => []);
  const porItem = {};
  orcs.forEach(o => { (porItem[o.solicitacaoId] = porItem[o.solicitacaoId] || []).push(o); });
  // fornecedores escolhidos (de cada item ativo) → valor, itens e PDF
  const porForn = {};
  g.itens.filter(i => i.status !== 'cancelado').forEach(it => {
    (porItem[it.id] || []).forEach(o => {
      const e = Array.isArray(o.cotacoes) && o.opcaoEscolhida != null ? o.cotacoes[o.opcaoEscolhida] : null;
      if (!e || !e.fornecedor) return;
      const x = porForn[e.fornecedor] = porForn[e.fornecedor] || { linhas: [], valor: 0 };
      x.linhas.push({ nome: it.material, unidade: it.unidade || 'un', qtd: Number(e.qtd) > 0 ? Number(e.qtd) : (Number(it.quantidade) || 1), preco: Number(e.valorUnitario) || 0, obs: e.obs || '' });
      x.valor += Number(e.valorTotal) || 0;
    });
  });
  _vc.pdf = { key, porForn };
  const nomesForn = Object.keys(porForn);
  const blocoForn = nomesForn.length ? '<div class="form-label">Fornecedores escolhidos</div><div style="border:1px solid var(--border);border-radius:8px;margin-bottom:12px;">'
    + nomesForn.map((n, ix) => '<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;' + (ix ? 'border-top:1px solid var(--border);' : '') + '">'
      + '<div style="flex:1;"><b>' + _varEsc(n) + '</b><div style="font-size:11px;color:var(--text-muted);">' + porForn[n].linhas.length + ' item(ns)</div></div>'
      + '<div style="font-weight:800;">' + _varBRL(_vcRound(porForn[n].valor)) + '</div>'
      + '<button class="btn btn-outline btn-sm" onclick="varPdfFornecedor(' + ix + ')">📄 Baixar pedido (PDF)</button></div>').join('') + '</div>' : '';
  const escolha = it => {
    for (const o of (porItem[it.id] || [])) {
      const e = Array.isArray(o.cotacoes) ? o.cotacoes[o.opcaoEscolhida] : null;
      if (e && o.opcaoEscolhida != null) return '<b>' + _varEsc(e.fornecedor) + '</b><br><span style="font-size:11px;color:var(--text-muted);">' + _varBRL(e.valorTotal) + '</span>';
    }
    const n = (porItem[it.id] || []).reduce((s, o) => s + _vcEntradas(o).length, 0);
    return n ? '<span style="font-size:12px;color:var(--text-muted);">' + n + ' cotação(ões)</span>' : '<span style="font-size:12px;color:var(--text-muted);">sem cotação</span>';
  };
  const linhas = g.itens.map(i => '<tr style="' + (i.status === 'cancelado' ? 'opacity:.5;text-decoration:line-through;' : '') + '">'
    + '<td style="padding:7px 8px;border-bottom:1px solid var(--border);">' + _varEsc(i.material) + '<div style="font-size:11px;color:var(--text-muted);">' + _varEsc(i.codigo || '') + '</div></td>'
    + '<td style="padding:7px 8px;border-bottom:1px solid var(--border);text-align:right;font-weight:700;white-space:nowrap;">' + (i.quantidade ? _varEsc(i.quantidade) + ' ' + _varEsc(i.unidade || 'un') : '—') + '</td>'
    + '<td style="padding:7px 8px;border-bottom:1px solid var(--border);text-align:right;white-space:nowrap;">' + (i.valorEstimado > 0 ? _varBRL(i.valorEstimado) : '—') + '</td>'
    + '<td style="padding:7px 8px;border-bottom:1px solid var(--border);">' + escolha(i) + '</td>'
    + (canEditDelete ? '<td style="padding:7px 4px;border-bottom:1px solid var(--border);white-space:nowrap;text-align:right;">'
      + '<button class="btn btn-outline btn-sm" title="Editar item" style="padding:2px 7px;" onclick="closeModal(\'modal-var-pedido\');abrirEditarVarSol(\'' + i.id + '\')">✏️</button> '
      + '<button class="btn btn-danger btn-sm" title="Excluir item" style="padding:2px 7px;" onclick="closeModal(\'modal-var-pedido\');excluirVarSol(\'' + i.id + '\',\'' + _varEsc((i.codigo || '').replace(/'/g, '')) + '\')">🗑</button></td>' : '')
    + '</tr>').join('');

  document.getElementById('vp-body').innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:12px;">'
    + '<div><div class="form-label">Setor</div><div style="font-size:14px;">' + _varEsc(d.setor) + '</div></div>'
    + '<div><div class="form-label">Prioridade</div><div style="font-size:14px;">' + _varEsc(d.prioridade) + '</div></div>'
    + '<div><div class="form-label">Data limite</div><div style="font-size:14px;">' + dt + '</div></div>'
    + '<div><div class="form-label">Solicitado por</div><div style="font-size:14px;">' + _varEsc(d.solicitanteNome || '—') + '</div></div></div>'
    + buildVarPipelineBar(g.status)
    + '<div class="form-label" style="margin-top:10px;">Itens (' + g.itens.length + ')</div>'
    + '<div style="border:1px solid var(--border);border-radius:8px;overflow-x:auto;margin-bottom:12px;"><table style="width:100%;border-collapse:collapse;"><thead><tr>'
    + ['MATERIAL', 'QTD.', 'ESTIMADO', 'FORNECEDOR ESCOLHIDO'].map((h, n) => '<th style="padding:6px 8px;text-align:' + (n === 1 || n === 2 ? 'right' : 'left') + ';font-size:11px;color:var(--text-muted);">' + h + '</th>').join('')
    + (canEditDelete ? '<th></th>' : '') + '</tr></thead><tbody>' + linhas + '</tbody></table></div>'
    + blocoForn
    + (d.obs ? '<div class="form-group"><div class="form-label">Observação</div><div style="font-size:13px;color:var(--text-muted);">' + _varEsc(d.obs) + '</div></div>' : '')
    + (d.fornecedor?.empresa ? '<div style="border:1px solid var(--border);border-radius:8px;padding:12px;"><div class="form-label" style="margin-bottom:8px;">Fornecedor sugerido pelo solicitante</div><div>🏪 ' + _varEsc(d.fornecedor.empresa) + '</div>'
      + (d.fornecedor.atendente ? '<div>👤 ' + _varEsc(d.fornecedor.atendente) + '</div>' : '') + (d.fornecedor.tel ? '<div>📞 ' + _varEsc(d.fornecedor.tel) + '</div>' : '') + '</div>' : '');

  document.getElementById('vp-footer').innerHTML = '<button class="btn btn-outline" onclick="closeModal(\'modal-var-pedido\')">Fechar</button>'
    + (nomesForn.length > 1 ? '<button class="btn btn-outline" onclick="varPdfTodos()">📄 Baixar todos os PDFs</button>' : '')
    + (_vcPodeOrcar() && !terminal ? '<button class="btn btn-primary" onclick="varOrcarPedido(\'' + _varEsc(key) + '\')">💲 Orçamentos</button>' : '')
    + (canAvancar && !terminal ? '<button class="btn btn-secondary" onclick="closeModal(\'modal-var-pedido\');avancarLoteVar(\'' + _varEsc(key) + '\')">▶ Avançar pedido</button>' : '')
    + (canAvancar && !terminal ? '<button class="btn btn-danger" onclick="closeModal(\'modal-var-pedido\');cancelarLoteVar(\'' + _varEsc(key) + '\')">⛔ Cancelar pedido</button>' : '');
  openModal('modal-var-pedido');
}
window.verVarPedido = verVarPedido;

// PDF de um fornecedor do pedido: nome do arquivo "Setor - Fornecedor.pdf"
function varPdfFornecedor(ix) {
  const p = _vc.pdf; if (!p) return;
  const nome = Object.keys(p.porForn)[ix], x = p.porForn[nome], g = _varGrupos[p.key];
  if (!x || !g) return;
  if (typeof apfGerarPdfPedido !== 'function') { showToast('Recarregue a página (Ctrl+F5) e tente de novo.'); return; }
  apfGerarPdfPedido({ pedido: { code: g.codigo, id: g.key, house: g.base.setor || '' }, fornecedorNome: nome, linhas: x.linhas, valor: _vcRound(x.valor), rotuloLocal: 'Setor' });
}
async function varPdfTodos() {
  const p = _vc.pdf; if (!p) return;
  for (let i = 0; i < Object.keys(p.porForn).length; i++) { varPdfFornecedor(i); await new Promise(r => setTimeout(r, 600)); }
}
window.varPdfFornecedor = varPdfFornecedor; window.varPdfTodos = varPdfTodos;

// Ao liberar: um lançamento por fornecedor em compras_financeiro (módulo 'variedades'), que aparece em
// "Solicitar Pagamento" do módulo. Vencimento pelo prazo do cadastro do fornecedor. Sem duplicar (pedidoRef).
async function _vcCriarLancamentos(g, porForn) {
  const hoje = new Date(), cod = (g.itens[0] && g.itens[0].codigo) || g.key, setor = g.base.setor || '';
  const partes = Object.entries(porForn).sort((a, b) => b[1].v - a[1].v);
  const lista = typeof suppliersCache !== 'undefined' ? suppliersCache : [];
  let criados = 0;
  for (let idx = 0; idx < partes.length; idx++) {
    const [forn, x] = partes[idx], ref = idx === 0 ? cod : cod + '-F' + (idx + 1), valor = _vcRound(x.v);
    const sup = lista.find(s => _vcNorm(s.nome) === _vcNorm(forn));
    let venc = '';
    if (sup) {
      const dias = sup.prazo === 'a_vista' ? 0 : (parseInt(sup.prazo) || 0);
      if (dias > 0) { const d = new Date(); d.setDate(d.getDate() + dias); venc = d.toISOString().slice(0, 10); }
    }
    const ja = await db.collection('compras_financeiro').where('pedidoRef', '==', ref).limit(1).get();
    if (!ja.empty) continue;
    await db.collection('compras_financeiro').add({
      fornecedor: forn, fornecedorId: sup ? sup.id : '', classificacao: 'Variedades', catKey: '', destinatario: setor,
      mes: MESES_PT[hoje.getMonth()], ano: hoje.getFullYear(), dataCompraSerial: hoje.getTime(), vencimentoStr: venc, valor,
      pago: '', pedidoRef: ref, pedidoId: g.key, modulo: 'variedades', lancadoSP: false, createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    if (sup) await db.collection('suppliers').doc(sup.id).update({ utilizado: firebase.firestore.FieldValue.increment(valor) }).catch(() => {});
    criados++;
  }
  return criados;
}

// ── Tabela de cotações (produto × fornecedor) ───────────────────────────
async function varOrcarPedido(key) {
  const g = _varGrupos[key]; if (!g) return;
  if (!_vcPodeOrcar()) { showToast('⚠️ Só admin, diretor, gerente e coordenador registram orçamentos.'); return; }
  _vcGarantirModais();
  document.getElementById('vc-titulo').textContent = 'Orçamentos — ' + g.codigo;
  openModal('modal-var-cot');
  const body = document.getElementById('vc-body');
  body.innerHTML = '<div class="loading-state"><div class="spinner spinner-dark"></div>Carregando...</div>';
  document.getElementById('vc-footer').innerHTML = '';
  try {
    if (typeof suppliersCache !== 'undefined' && !suppliersCache.length) {
      const s = await db.collection('suppliers').orderBy('nome').get();
      suppliersCache = s.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    const itens = g.itens.filter(i => i.status !== 'cancelado').map(i => ({ id: i.id, codigo: i.codigo || '', material: i.material || '', unidade: i.unidade || 'un', qty: Number(i.quantidade) || 1, status: i.status }));
    _vc.key = key; _vc.itens = itens; _vc.cols = []; _vc.seq = 0; _vc.sel = {}; _vc.orc = {};
    const orcs = await _vcBuscarOrcamentos(itens.map(i => i.id));
    const porNome = new Map();
    const colDe = (nome, fornecedorId) => {
      const k = _vcNorm(nome);
      if (!porNome.has(k)) {
        const c = { uid: ++_vc.seq, fornecedor: nome, fornecedorId: fornecedorId || '', prazo: '', obs: '', precos: {}, qtds: {}, obsItens: {} };
        porNome.set(k, c); _vc.cols.push(c);
      }
      return porNome.get(k);
    };
    itens.forEach(it => {
      const docs = orcs.filter(o => o.solicitacaoId === it.id);
      if (!docs.length) return;
      const primario = docs.find(o => Array.isArray(o.cotacoes) && o.cotacoes.length) || docs[0];
      _vc.orc[it.id] = { primaryId: primario.id, extraIds: docs.filter(o => o.id !== primario.id).map(o => o.id) };
      docs.forEach(o => _vcEntradas(o).forEach((e, idx) => {
        const nome = (e.fornecedor || '').trim() || ('Opção ' + (idx + 1));
        const c = colDe(nome, e.fornecedorId);
        const qtd = Number(e.qtd) > 0 ? Number(e.qtd) : it.qty;
        const unit = Number(e.valorUnitario) > 0 ? Number(e.valorUnitario) : (Number(e.valorTotal) > 0 ? Number(e.valorTotal) / qtd : 0);
        if (unit > 0) c.precos[it.id] = String(_vcRound(unit * 10000) / 10000);
        if (qtd !== it.qty) c.qtds[it.id] = String(qtd);
        if (e.obs) c.obsItens[it.id] = e.obs;
        if (e.prazoEntrega && !c.prazo) c.prazo = e.prazoEntrega;
        if (o.id === primario.id && o.opcaoEscolhida === idx) _vc.sel[it.id] = c.uid;
      }));
    });
    if (!_vc.cols.length) _vcNovaColuna();
    _vcRenderizar();
  } catch (e) {
    console.error('varOrcarPedido', e);
    body.innerHTML = '<div style="color:var(--danger);padding:16px;">Erro ao carregar orçamentos: ' + _varEsc(e.message) + '</div>';
  }
}
window.varOrcarPedido = varOrcarPedido;

function _vcNovaColuna() { _vc.cols.push({ uid: ++_vc.seq, fornecedor: '', fornecedorId: '', prazo: '', obs: '', precos: {}, qtds: {}, obsItens: {} }); }
const _vcCol = uid => _vc.cols.find(c => c.uid === uid);
const _vcQtd = (c, it) => { const q = _vcNum(c.qtds[it.id]); return q > 0 ? q : it.qty; };
function _vcTotais(c) {
  let total = 0, faltam = 0;
  _vc.itens.forEach(it => { const u = _vcNum(c.precos[it.id]); if (u > 0) total += u * _vcQtd(c, it); else faltam++; });
  return { total: _vcRound(total), faltam };
}

function _vcRenderizar() {
  const { itens, cols } = _vc;
  const th = 'padding:8px 10px;border-bottom:1px solid var(--border);text-align:left;font-size:11px;text-transform:uppercase;color:var(--text-muted);vertical-align:bottom;';
  const nomes = (typeof suppliersCache !== 'undefined' ? suppliersCache : []).map(s => s.nome).filter(Boolean);
  const dl = '<datalist id="vc-fornecedores">' + nomes.map(n => '<option value="' + _varEsc(n) + '">').join('') + '</datalist>';

  const head = cols.map(c => '<th style="' + th + 'min-width:190px;border-left:1px solid var(--border);">'
    + '<div style="display:flex;gap:6px;align-items:center;"><input class="form-input" list="vc-fornecedores" placeholder="Fornecedor" style="font-size:13px;font-weight:700;padding:5px 8px;" value="' + _varEsc(c.fornecedor) + '" oninput="vcSetForn(' + c.uid + ',this.value)">'
    + '<button class="btn btn-danger btn-sm" title="Remover fornecedor" onclick="vcRemCol(' + c.uid + ')" style="padding:2px 7px;">✕</button></div>'
    + '<input class="form-input" placeholder="Prazo de entrega" style="font-size:11px;padding:4px 8px;margin-top:6px;" value="' + _varEsc(c.prazo) + '" oninput="vcSetPrazo(' + c.uid + ',this.value)"></th>').join('');

  const linhas = itens.map(it => {
    const validos = cols.map(c => _vcNum(c.precos[it.id])).filter(p => p > 0);
    const min = validos.length ? Math.min(...validos) : 0;
    const cel = cols.map(c => {
      const p = _vcNum(c.precos[it.id]), melhor = validos.length > 1 && p > 0 && p === min;
      return '<td data-vc-cel="' + c.uid + '|' + it.id + '" style="padding:5px 8px;border-bottom:1px solid var(--border);border-left:1px solid var(--border);' + (melhor ? 'background:var(--ok-bg);' : '') + '">'
        + '<div style="display:flex;align-items:center;gap:6px;">'
        + '<input type="radio" data-vc-radio="' + c.uid + '|' + it.id + '" name="vcsel-' + it.id + '" title="Comprar deste fornecedor" ' + (_vc.sel[it.id] === c.uid ? 'checked' : '') + ' ' + (p > 0 ? '' : 'disabled') + ' onchange="vcSel(\'' + it.id + '\',' + c.uid + ')" style="accent-color:var(--lumen);width:16px;height:16px;flex-shrink:0;">'
        + '<input type="number" step="0.01" min="0" class="form-input" placeholder="0,00" style="text-align:right;padding:6px 8px;" value="' + _varEsc(c.precos[it.id] ?? '') + '" oninput="vcSetPreco(' + c.uid + ',\'' + it.id + '\',this.value)"></div>'
        + '<div style="display:flex;gap:4px;margin-top:4px;">'
        + '<input type="number" step="any" min="0" class="form-input" title="Quantidade que ESTE fornecedor fornece. Em branco = ' + it.qty + ' do pedido." placeholder="' + it.qty + '" style="width:62px;text-align:right;padding:3px 6px;font-size:11px;" value="' + _varEsc(c.qtds[it.id] ?? '') + '" oninput="vcSetQtd(' + c.uid + ',\'' + it.id + '\',this.value)">'
        + '<input type="text" class="form-input" placeholder="obs." style="flex:1;min-width:0;padding:3px 6px;font-size:11px;" value="' + _varEsc(c.obsItens[it.id] ?? '') + '" oninput="vcSetObs(' + c.uid + ',\'' + it.id + '\',this.value)"></div>'
        + '<div data-vc-sub="' + c.uid + '|' + it.id + '" style="font-size:10.5px;color:var(--text-muted);text-align:right;margin-top:2px;min-height:13px;"></div></td>';
    }).join('');
    return '<tr><td style="padding:7px 10px;border-bottom:1px solid var(--border);font-size:13px;">' + _varEsc(it.material) + ' <span style="font-size:11px;color:var(--text-muted);">' + _varEsc(it.unidade) + '</span></td>'
      + '<td style="padding:7px 10px;border-bottom:1px solid var(--border);text-align:right;font-weight:700;">' + it.qty + '</td>' + cel
      + '<td style="padding:7px 10px;border-bottom:1px solid var(--border);border-left:2px solid var(--border);text-align:center;"><label style="cursor:pointer;font-size:12px;color:var(--danger);display:inline-flex;align-items:center;gap:6px;">'
      + '<input type="radio" name="vcsel-' + it.id + '" ' + (_vc.sel[it.id] === 'cancel' ? 'checked' : '') + ' onchange="vcSel(\'' + it.id + '\',\'cancel\')" style="accent-color:var(--danger);">cancelar item</label></td></tr>';
  }).join('');

  const totais = cols.map(c => '<td style="padding:8px 10px;border-top:2px solid var(--border);border-left:1px solid var(--border);vertical-align:top;">'
    + '<div id="vc-tot-' + c.uid + '" style="font-size:16px;font-weight:800;text-align:right;"></div><div id="vc-aviso-' + c.uid + '" style="font-size:11px;text-align:right;min-height:14px;"></div>'
    + '<div id="vc-esc-' + c.uid + '" style="font-size:11px;color:var(--ok);text-align:right;"></div></td>').join('');

  document.getElementById('vc-body').innerHTML = dl
    + '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;">'
    + '<div style="font-size:12px;color:var(--text-muted);">Digite o preço <b>unitário</b> de cada produto por fornecedor (em branco = não tem). Marque o <b>círculo</b> do fornecedor de cada item para comprar dele, ou cancele o item. 🟢 verde = menor preço da linha.</div>'
    + '<div style="display:flex;gap:6px;"><button class="btn btn-outline btn-sm" onclick="vcSugerir()">⭐ Sugerir menor preço</button><button class="btn btn-outline btn-sm" onclick="vcAddCol()">+ Adicionar fornecedor</button></div></div>'
    + '<div style="overflow-x:auto;border:1px solid var(--border);border-radius:10px;"><table style="width:100%;border-collapse:collapse;"><thead><tr>'
    + '<th style="' + th + 'min-width:200px;">Produto</th><th style="' + th + 'text-align:right;">Qtd.</th>' + head + '<th style="' + th + 'border-left:2px solid var(--border);text-align:center;">Cancelar</th></tr></thead>'
    + '<tbody>' + linhas + '<tr><td colspan="2" style="padding:8px 10px;border-top:2px solid var(--border);font-weight:700;vertical-align:top;">Total por fornecedor</td>' + totais
    + '<td style="border-top:2px solid var(--border);border-left:2px solid var(--border);"></td></tr></tbody></table></div>'
    + '<div id="vc-resumo" style="margin-top:12px;font-size:13px;"></div>';

  document.getElementById('vc-footer').innerHTML = '<button class="btn btn-outline" onclick="closeModal(\'modal-var-cot\')">Fechar</button>'
    + '<button class="btn btn-outline" onclick="vcSalvar()">💾 Salvar cotações</button>'
    + '<button class="btn btn-secondary" onclick="vcAprovar(false)">📝 Salvar seleção (Coordenador)</button>'
    + '<button class="btn btn-primary" onclick="vcAprovar(true)">✅ Aprovar e liberar pedido (Gerente)</button>';
  _vcRecalcular();
}

// Recalcula totais/realces sem redesenhar (mantém o foco do campo que está sendo digitado)
function _vcRecalcular() {
  _vc.cols.forEach(c => {
    const t = _vcTotais(c);
    const el = document.getElementById('vc-tot-' + c.uid), av = document.getElementById('vc-aviso-' + c.uid), es = document.getElementById('vc-esc-' + c.uid);
    if (el) el.textContent = _varBRL(t.total);
    if (av) av.innerHTML = t.faltam ? '<span style="color:var(--warn,#d97706);">⚠ faltam ' + t.faltam + ' item(ns) sem preço</span>' : '<span style="color:var(--ok);">✓ completo</span>';
    const escolhidos = _vc.itens.filter(it => _vc.sel[it.id] === c.uid);
    const vEsc = _vcRound(escolhidos.reduce((s, it) => s + _vcNum(c.precos[it.id]) * _vcQtd(c, it), 0));
    if (es) es.textContent = escolhidos.length ? 'Escolhido: ' + escolhidos.length + ' item(ns) · ' + _varBRL(vEsc) : '';
    _vc.itens.forEach(it => {
      const sub = document.querySelector('[data-vc-sub="' + c.uid + '|' + it.id + '"]');
      const u = _vcNum(c.precos[it.id]);
      if (sub) sub.textContent = u > 0 ? (_vcQtd(c, it) + ' × ' + _varBRL(u) + ' = ' + _varBRL(u * _vcQtd(c, it))) : '';
    });
  });
  _vc.itens.forEach(it => {
    const validos = _vc.cols.map(c => _vcNum(c.precos[it.id])).filter(p => p > 0), min = validos.length ? Math.min(...validos) : 0;
    _vc.cols.forEach(c => {
      const td = document.querySelector('[data-vc-cel="' + c.uid + '|' + it.id + '"]'), p = _vcNum(c.precos[it.id]);
      if (td) td.style.background = (validos.length > 1 && p > 0 && p === min) ? 'var(--ok-bg)' : '';
    });
  });
  const falta = _vc.itens.filter(it => !_vc.sel[it.id]);
  const el = document.getElementById('vc-resumo');
  if (el) el.innerHTML = falta.length
    ? '<span style="color:var(--warn,#d97706);font-weight:700;">⚠️ ' + falta.length + ' item(ns) sem fornecedor escolhido: ' + falta.map(i => _varEsc(i.material)).join(', ') + '</span>'
    : '<span style="color:var(--ok);font-weight:700;">✓ todos os itens definidos</span>';
}

function vcSetForn(uid, v) { const c = _vcCol(uid); if (c) { c.fornecedor = v; const s = (typeof suppliersCache !== 'undefined' ? suppliersCache : []).find(x => _vcNorm(x.nome) === _vcNorm(v)); c.fornecedorId = s ? s.id : ''; } }
function vcSetPrazo(uid, v) { const c = _vcCol(uid); if (c) c.prazo = v; }
function vcSetPreco(uid, itemId, v) {
  const c = _vcCol(uid); if (!c) return; c.precos[itemId] = v;
  if (!(_vcNum(v) > 0) && _vc.sel[itemId] === uid) delete _vc.sel[itemId];   // tirou o preço: perde a escolha
  const r = document.querySelector('[data-vc-radio="' + uid + '|' + itemId + '"]');
  if (r) { r.disabled = !(_vcNum(v) > 0); if (r.disabled) r.checked = false; }
  _vcRecalcular();
}
function vcSetQtd(uid, itemId, v) { const c = _vcCol(uid); if (c) { c.qtds[itemId] = v; _vcRecalcular(); } }
function vcSetObs(uid, itemId, v) { const c = _vcCol(uid); if (c) c.obsItens[itemId] = v; }
function vcSel(itemId, valor) { _vc.sel[itemId] = valor; _vcRecalcular(); }
function vcAddCol() { _vcNovaColuna(); _vcRenderizar(); }
function vcRemCol(uid) {
  const c = _vcCol(uid); if (!c) return;
  if ((c.fornecedor || Object.keys(c.precos).length) && !confirm('Remover o fornecedor ' + (c.fornecedor || 'desta coluna') + ' e os preços dele?')) return;
  _vc.cols = _vc.cols.filter(x => x.uid !== uid);
  Object.keys(_vc.sel).forEach(k => { if (_vc.sel[k] === uid) delete _vc.sel[k]; });
  if (!_vc.cols.length) _vcNovaColuna();
  _vcRenderizar();
}
function vcSugerir() {
  _vc.itens.forEach(it => {
    const cand = _vc.cols.map(c => ({ uid: c.uid, p: _vcNum(c.precos[it.id]) })).filter(x => x.p > 0).sort((a, b) => a.p - b.p);
    if (cand.length) _vc.sel[it.id] = cand[0].uid;
  });
  _vcRenderizar();
}
Object.assign(window, { vcSetForn, vcSetPrazo, vcSetPreco, vcSetQtd, vcSetObs, vcSel, vcAddCol, vcRemCol, vcSugerir });

// ── Gravação ────────────────────────────────────────────────────────────
// Grava as cotações de cada item. extra(itemId, ref, indiceEscolhido) permite marcar a aprovação junto.
function _vcMontarBatch(statusOrc) {
  const batch = db.batch(), agora = firebase.firestore.FieldValue.serverTimestamp(), docIds = {};
  _vc.itens.forEach(it => {
    const entradas = []; let idxSel = null;
    _vc.cols.forEach(c => {
      const forn = (c.fornecedor || '').trim(), u = _vcNum(c.precos[it.id]);
      if (!forn || !(u > 0)) return;
      const qtd = _vcQtd(c, it);
      if (_vc.sel[it.id] === c.uid) idxSel = entradas.length;
      entradas.push({
        fornecedor: forn, fornecedorId: c.fornecedorId || '', valorUnitario: u, qtd, valorTotal: _vcRound(u * qtd),
        prazoEntrega: c.prazo || '', obs: (c.obsItens[it.id] || '').trim(),
      });
    });
    const o = _vc.orc[it.id] || {};
    const dados = { cotacoes: entradas, opcaoEscolhida: idxSel };
    if (statusOrc && idxSel != null) Object.assign(dados, { status: statusOrc, aprovadoPor: currentUserData?.name || '', aprovadoEm: agora });
    if (o.primaryId) {
      batch.update(db.collection('var_orcamentos').doc(o.primaryId), dados);
      docIds[it.id] = o.primaryId;
      (o.extraIds || []).forEach(id => batch.delete(db.collection('var_orcamentos').doc(id)));   // já fundidos na tabela
    } else if (entradas.length) {
      const ref = db.collection('var_orcamentos').doc();
      batch.set(ref, { solicitacaoId: it.id, ...dados, status: statusOrc && idxSel != null ? statusOrc : 'Pendente', registradoPor: currentUserData?.name || '', registradoUid: currentUser?.uid || '', criadoEm: agora });
      docIds[it.id] = ref.id;
    }
  });
  return { batch, docIds };
}

async function vcSalvar() {
  if (!_vcPodeOrcar()) return;
  const sem = _vc.cols.filter(c => !(c.fornecedor || '').trim() && Object.values(c.precos).some(v => _vcNum(v) > 0));
  if (sem.length) { showToast('Informe o nome do fornecedor das colunas com preço.'); return; }
  try {
    const { batch } = _vcMontarBatch(null);
    await batch.commit();
    showToast('✅ Cotações salvas.');
    await varOrcarPedido(_vc.key);
    loadVarSolicitacoes();
  } catch (e) { console.error(e); showToast('❌ Erro ao salvar: ' + e.message); }
}
window.vcSalvar = vcSalvar;

// Etapa 1 (liberar=false): coordenador salva a seleção → itens ficam "Em Aprovação".
// Etapa 2 (liberar=true): gerente aprova e libera → itens ficam "Pedido Liberado".
async function vcAprovar(liberar) {
  if (!_vcPodeOrcar()) return;
  const falta = _vc.itens.filter(it => !_vc.sel[it.id]);
  if (falta.length) { showToast('Escolha um fornecedor (ou cancele) em: ' + falta.map(i => i.material).join(', ')); return; }
  const sem = _vc.cols.filter(c => !(c.fornecedor || '').trim() && Object.values(c.precos).some(v => _vcNum(v) > 0));
  if (sem.length) { showToast('Informe o nome do fornecedor das colunas com preço.'); return; }
  const porForn = {};
  _vc.itens.forEach(it => {
    const s = _vc.sel[it.id]; if (s === 'cancel') return;
    const c = _vcCol(s); const v = _vcNum(c.precos[it.id]) * _vcQtd(c, it);
    (porForn[c.fornecedor.trim()] = porForn[c.fornecedor.trim()] || { n: 0, v: 0 }); porForn[c.fornecedor.trim()].n++; porForn[c.fornecedor.trim()].v += v;
  });
  const cancelados = _vc.itens.filter(it => _vc.sel[it.id] === 'cancel');
  if (!Object.keys(porForn).length) { showToast('Todos os itens estão cancelados — para cancelar o pedido use "Cancelar pedido".'); return; }
  const resumo = Object.entries(porForn).map(([f, x]) => '• ' + f + ': ' + x.n + ' item(ns) — ' + _varBRL(x.v)).join('\n');
  const total = Object.values(porForn).reduce((s, x) => s + x.v, 0);
  if (!confirm((liberar ? 'Aprovar e liberar o pedido assim?' : 'Salvar a seleção do pedido assim?') + '\n\n' + resumo
    + (cancelados.length ? '\n\n' + cancelados.length + ' item(ns) cancelado(s)' : '') + '\n\nTotal: ' + _varBRL(total))) return;
  try {
    let criados = 0;
    if (liberar) {
      try { criados = await _vcCriarLancamentos(_varGrupos[_vc.key], porForn); }
      catch (e) {
        console.error('lançamentos', e);
        showToast('❌ Não consegui criar o lançamento no Financeiro (' + e.message + '). O pedido NÃO foi liberado. Confira se a migração 054 foi aplicada no Supabase.');
        return;
      }
    }
    const { batch } = _vcMontarBatch('Aprovado');
    const agora = firebase.firestore.FieldValue.serverTimestamp(), nome = currentUserData?.name || '';
    _vc.itens.forEach(it => {
      const ref = db.collection('var_solicitacoes').doc(it.id);
      if (_vc.sel[it.id] === 'cancel') batch.update(ref, { status: 'cancelado', canceladoEm: agora, canceladoPor: nome });
      else if (liberar) batch.update(ref, { status: 'pedido_liberado', pedidoLiberadoEm: agora, pedidoLiberadoPor: nome });
      else batch.update(ref, { status: 'em_proposta' });
    });
    await batch.commit();
    showToast(liberar ? '✅ Pedido liberado' + (criados ? ' — ' + criados + ' pagamento(s) em Solicitar Pagamento.' : '.') : '✅ Seleção salva — falta o gerente aprovar e liberar.');
    closeModal('modal-var-cot');
    if (typeof atualizarBadgeVar === 'function') atualizarBadgeVar();
    await loadVarSolicitacoes();
    if (_vc.key && _varGrupos[_vc.key]) verVarPedido(_vc.key);
  } catch (e) { console.error('vcAprovar', e); showToast('❌ Erro: ' + e.message); }
}
window.vcAprovar = vcAprovar;
