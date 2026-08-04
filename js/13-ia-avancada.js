// Extraído de index.html (agentes IA: previsão de demanda + melhor fornecedor + padrão crítico) em 2026-07-27
// ─────────────────────────────────────────────
// 🤖  AGENTE IA — PREVISÃO DE DEMANDA
// ─────────────────────────────────────────────
let previsaoData = [];        // dados individuais por casa
let previsaoDataGeral = [];   // dados consolidados (soma de casas selecionadas)
let prevViewAtual = 'geral';  // 'geral' | 'individual'

// ── Multi-select de casas ──────────────────────────────────────
function initPrevCasaDropdown() {
  const box = document.getElementById('prev-casa-checkboxes');
  if (!box) return;
  box.innerHTML = '';
  CASAS.forEach(c => {
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.value = c;
    cb.onchange = atualizarPrevCasaLabel;
    const span = document.createElement('span');
    span.textContent = c;
    label.appendChild(cb);
    label.appendChild(span);
    box.appendChild(label);
  });
}

function togglePrevCasaDropdown(e) {
  if (e) e.stopPropagation();
  const trigger  = document.getElementById('prev-casa-trigger');
  const dropdown = document.getElementById('prev-casa-dropdown');
  const isOpen   = dropdown.classList.contains('open');
  if (isOpen) {
    dropdown.classList.remove('open');
    trigger.classList.remove('open');
  } else {
    dropdown.classList.add('open');
    trigger.classList.add('open');
    // Limpa busca e foca
    const searchInput = document.getElementById('prev-casa-search');
    if (searchInput) { searchInput.value = ''; filtrarPrevCasas(''); searchInput.focus(); }
  }
}

function prevCasaSelectAll() {
  document.querySelectorAll('#prev-casa-checkboxes input').forEach(cb => cb.checked = true);
  atualizarPrevCasaLabel();
}

function prevCasaClearAll() {
  document.querySelectorAll('#prev-casa-checkboxes input').forEach(cb => cb.checked = false);
  atualizarPrevCasaLabel();
}

function filtrarPrevCasas(termo) {
  const t = (termo || '').toLowerCase().trim();
  document.querySelectorAll('#prev-casa-checkboxes label').forEach(label => {
    const nome = label.querySelector('span') ? label.querySelector('span').textContent.toLowerCase() : '';
    label.style.display = (!t || nome.includes(t)) ? '' : 'none';
  });
}

function getPrevCasasSelecionadas() {
  return Array.from(document.querySelectorAll('#prev-casa-checkboxes input:checked')).map(cb => cb.value);
}

function atualizarPrevCasaLabel() {
  const selecionadas = getPrevCasasSelecionadas();
  const label = document.getElementById('prev-casa-label');
  if (!label) return;
  if (selecionadas.length === 0 || selecionadas.length === CASAS.length)
    label.textContent = 'Todas as casas';
  else if (selecionadas.length === 1)
    label.textContent = selecionadas[0];
  else
    label.textContent = selecionadas.length + ' casas selecionadas';
}

document.addEventListener('click', e => {
  const trigger  = document.getElementById('prev-casa-trigger');
  const dropdown = document.getElementById('prev-casa-dropdown');
  if (!trigger || !dropdown) return;
  if (!trigger.contains(e.target) && !dropdown.contains(e.target)) {
    dropdown.classList.remove('open');
    trigger.classList.remove('open');
  }
});
// Fecha o dropdown ao rolar a página (comportamento padrão de selects)
window.addEventListener('scroll', () => {
  const trigger  = document.getElementById('prev-casa-trigger');
  const dropdown = document.getElementById('prev-casa-dropdown');
  if (!dropdown || !dropdown.classList.contains('open')) return;
  dropdown.classList.remove('open');
  if (trigger) trigger.classList.remove('open');
});

// ── Período personalizado ──────────────────────────────────────
function togglePrevPeriodoCustom() {
  const val = document.getElementById('prev-projecao').value;
  const wrap = document.getElementById('prev-periodo-custom');
  if (!wrap) return;
  if (val === '0') {
    wrap.style.display = 'flex';
    const hoje = new Date();
    const fim  = new Date(hoje); fim.setDate(fim.getDate() + 14);
    if (!document.getElementById('prev-data-ini').value)
      document.getElementById('prev-data-ini').value = hoje.toISOString().slice(0,10);
    if (!document.getElementById('prev-data-fim').value)
      document.getElementById('prev-data-fim').value = fim.toISOString().slice(0,10);
  } else {
    wrap.style.display = 'none';
  }
}

// ── Tabs geral / individual ────────────────────────────────────
function setPrevView(view) {
  prevViewAtual = view;
  document.getElementById('prev-tab-geral').classList.toggle('active', view === 'geral');
  document.getElementById('prev-tab-individual').classList.toggle('active', view === 'individual');
  if (view === 'geral') renderPrevisaoGeral();
  else { renderPrevisaoCards(); renderPrevisaoTabela(); }
}

async function initPrevisao() {
  initPrevCasaDropdown();
  populateCatSelect('prev-cat', true);
}

async function runPrevisao() {
  setBtnLoading('btn-run-prev', true);
  document.getElementById('prev-cards').innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;"><div class="spinner spinner-dark" style="width:36px;height:36px;"></div><div style="margin-top:12px;font-size:14px;color:var(--text-muted);">Buscando histórico e calculando projeções...</div></div>';
  document.getElementById('prev-ai-card').style.display = 'none';
  document.getElementById('prev-table-card').style.display = 'none';

  const casasSel  = getPrevCasasSelecionadas();
  const catFiltro = document.getElementById('prev-cat').value;
  const janela    = parseInt(document.getElementById('prev-janela').value);

  const projecaoVal = document.getElementById('prev-projecao').value;
  let projecao = parseInt(projecaoVal);
  let projecaoLabel = '';
  if (projecaoVal === '0') {
    const iniStr = document.getElementById('prev-data-ini').value;
    const fimStr = document.getElementById('prev-data-fim').value;
    if (!iniStr || !fimStr) { showToast('Informe as datas do período personalizado.'); setBtnLoading('btn-run-prev', false); return; }
    const ini = new Date(iniStr + 'T00:00:00');
    const fim = new Date(fimStr + 'T23:59:59');
    projecao = Math.max(1, Math.ceil((fim - ini) / 86400000));
    projecaoLabel = ini.toLocaleDateString('pt-BR') + ' → ' + fim.toLocaleDateString('pt-BR');
  }

  const multiCasa = casasSel.length >= 2;
  const toggleEl  = document.getElementById('prev-view-toggle');
  if (toggleEl) toggleEl.style.display = multiCasa ? 'flex' : 'none';
  if (!multiCasa) prevViewAtual = 'individual';

  try {
    const hoje   = new Date();
    const inicio = new Date(hoje); inicio.setDate(inicio.getDate() - janela);
    const deStr  = inicio.toISOString().slice(0,10);
    const movSnap   = await db.collection('movements').where('date', '>=', deStr).get();
    const stockSnap = await db.collection('movements').get();

    const saldoAtual = {};
    stockSnap.docs.forEach(d => {
      const m = d.data();
      if (casasSel.length > 0 && !casasSel.includes(m.house)) return;
      if (!m.house) return;
      if (!saldoAtual[m.house]) saldoAtual[m.house] = {};
      (m.items || []).forEach(item => {
        if (!item?.catKey || !item?.prodId) return;
        if (catFiltro && item.catKey !== catFiltro) return;
        const k = item.catKey + '__' + item.prodId;
        if (!saldoAtual[m.house][k]) saldoAtual[m.house][k] = { qty: 0 };
        saldoAtual[m.house][k].qty += (m.type === 'entrada' ? 1 : -1) * (parseFloat(item.qty) || 0);
      });
    });

    const consumo = {};
    movSnap.docs.forEach(d => {
      const m = d.data();
      if (m.type !== 'saida') return;
      if (casasSel.length > 0 && !casasSel.includes(m.house)) return;
      (m.items || []).forEach(item => {
        if (!item?.catKey || !item?.prodId) return;
        if (catFiltro && item.catKey !== catFiltro) return;
        const k = m.house + '__' + item.catKey + '__' + item.prodId;
        if (!consumo[k]) consumo[k] = {
          total: 0, nome: nomeProdutoAtual(item.catKey, item.prodId, item.prodNome),
          catNome: CATEGORIAS[item.catKey]?.nome || item.catKey,
          catIcon: CATEGORIAS[item.catKey]?.icon || '📦',
          unidade: item.unidade || '', house: m.house,
          catKey: item.catKey, prodId: item.prodId
        };
        consumo[k].total += parseFloat(item.qty) || 0;
      });
    });

    const riscoOrdem = { critico:0, alto:1, medio:2, ok:3, sem_dados:4 };
    const calcRisco = (dias) => dias === null ? 'sem_dados' : dias <= 3 ? 'critico' : dias <= 7 ? 'alto' : dias <= 14 ? 'medio' : 'ok';

    previsaoData = [];
    Object.entries(consumo).forEach(([k, dados]) => {
      const mediaDiaria     = dados.total / janela;
      if (mediaDiaria < 0.001) return;
      const previsaoConsumo = mediaDiaria * projecao;
      const stockKey        = dados.catKey + '__' + dados.prodId;
      const estoqueAtual    = saldoAtual[dados.house]?.[stockKey]?.qty ?? null;
      const diasCobertura   = estoqueAtual !== null && mediaDiaria > 0 ? Math.floor(estoqueAtual / mediaDiaria) : null;
      previsaoData.push({ ...dados, mediaDiaria, previsaoConsumo, estoqueAtual, diasCobertura, risco: calcRisco(diasCobertura) });
    });
    previsaoData.sort((a,b) => riscoOrdem[a.risco] - riscoOrdem[b.risco] || b.mediaDiaria - a.mediaDiaria);

    // Consolidado
    if (multiCasa) {
      const geralMap = {};
      previsaoData.forEach(d => {
        const k = d.catKey + '__' + d.prodId;
        if (!geralMap[k]) geralMap[k] = { nome:d.nome, catNome:d.catNome, catIcon:d.catIcon, unidade:d.unidade, catKey:d.catKey, prodId:d.prodId, house: casasSel.join(' + '), mediaDiaria:0, previsaoConsumo:0, estoqueAtual:0, semEstoque:false };
        geralMap[k].mediaDiaria     += d.mediaDiaria;
        geralMap[k].previsaoConsumo += d.previsaoConsumo;
        if (d.estoqueAtual !== null) geralMap[k].estoqueAtual += d.estoqueAtual;
        else geralMap[k].semEstoque = true;
      });
      previsaoDataGeral = Object.values(geralMap).map(d => {
        const est = d.semEstoque ? null : d.estoqueAtual;
        const dias = est !== null && d.mediaDiaria > 0 ? Math.floor(est / d.mediaDiaria) : null;
        return { ...d, estoqueAtual: est, diasCobertura: dias, risco: calcRisco(dias) };
      });
      previsaoDataGeral.sort((a,b) => riscoOrdem[a.risco] - riscoOrdem[b.risco] || b.mediaDiaria - a.mediaDiaria);
    }

    if (multiCasa && prevViewAtual === 'geral') renderPrevisaoGeral();
    else { renderPrevisaoCards(); renderPrevisaoTabela(); }

    const casaLabel = casasSel.length === 0 ? '' : casasSel.length === 1 ? casasSel[0] : casasSel.length + ' casas';
    await callAIPrevisao(janela, projecao, casaLabel, catFiltro, projecaoLabel);

  } catch(e) {
    document.getElementById('prev-cards').innerHTML = '<div style="grid-column:1/-1;"><div class="alert alert-danger visible">Erro: ' + e.message + '</div></div>';
    console.error(e);
  }
  setBtnLoading('btn-run-prev', false);
}

const _prevRiscoInfo = {
  critico:   { cor:'#DC2626', label:'🔴 Crítico',  bg:'#FEF2F2' },
  alto:      { cor:'#EA580C', label:'🟠 Alto',      bg:'#FFF7ED' },
  medio:     { cor:'#D97706', label:'🟡 Médio',     bg:'#FFFBEB' },
  ok:        { cor:'#16A34A', label:'🟢 OK',         bg:'#F0FDF4' },
  sem_dados: { cor:'#6B7280', label:'⚪ Sem dados', bg:'var(--surface)' },
};

function _prevCardHtml(d) {
  const ri  = _prevRiscoInfo[d.risco];
  const cob = d.diasCobertura !== null ? d.diasCobertura + ' dias' : '—';
  const houseTag = (d.house && !d.house.includes('+')) ? '<div style="font-size:11px;color:var(--text-muted);margin-top:1px;">📍 ' + d.house + '</div>' : '';
  return '<div style="background:var(--surface);border-radius:12px;border-left:4px solid ' + ri.cor + ';padding:14px 16px;box-shadow:0 1px 4px rgba(0,0,0,0.07);">' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">' +
      '<div><div style="font-size:11px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.4px;">' + d.catIcon + ' ' + d.catNome + '</div>' +
        '<div style="font-size:14px;font-weight:700;color:var(--text);margin-top:2px;">' + d.nome + '</div>' + houseTag + '</div>' +
      '<span style="background:' + ri.bg + ';color:' + ri.cor + ';border:1px solid ' + ri.cor + '33;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap;">' + ri.label + '</span>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px;font-size:12px;">' +
      '<div style="background:var(--bg);border-radius:6px;padding:6px 8px;"><div style="color:var(--text-muted);font-size:10px;">Média/dia</div><div style="font-weight:700;">' + d.mediaDiaria.toFixed(2) + ' ' + d.unidade + '</div></div>' +
      '<div style="background:var(--bg);border-radius:6px;padding:6px 8px;"><div style="color:var(--text-muted);font-size:10px;">Previsão consumo</div><div style="font-weight:700;color:var(--lumen);">' + d.previsaoConsumo.toFixed(1) + ' ' + d.unidade + '</div></div>' +
      '<div style="background:var(--bg);border-radius:6px;padding:6px 8px;"><div style="color:var(--text-muted);font-size:10px;">Estoque atual</div><div style="font-weight:700;">' + (d.estoqueAtual !== null ? d.estoqueAtual.toFixed(1) + ' ' + d.unidade : '—') + '</div></div>' +
      '<div style="background:' + ri.bg + ';border-radius:6px;padding:6px 8px;"><div style="color:var(--text-muted);font-size:10px;">Dias cobertura</div><div style="font-weight:700;color:' + ri.cor + ';">' + cob + '</div></div>' +
    '</div></div>';
}

function renderPrevisaoCards(src) {
  const el  = document.getElementById('prev-cards');
  const dados = src || previsaoData;
  if (dados.length === 0) {
    el.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);">Nenhum dado de consumo encontrado no período selecionado.</div>';
    document.getElementById('prev-table-card').style.display = 'none';
    return;
  }
  el.innerHTML = dados.slice(0,24).map(_prevCardHtml).join('');
}

function renderPrevisaoGeral() {
  const el       = document.getElementById('prev-cards');
  const casasSel = getPrevCasasSelecionadas();
  if (previsaoDataGeral.length === 0) {
    el.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);">Nenhum dado para consolidar.</div>';
    document.getElementById('prev-table-card').style.display = 'none';
    return;
  }
  const criticos = previsaoDataGeral.filter(d => d.risco === 'critico').length;
  const altos    = previsaoDataGeral.filter(d => d.risco === 'alto').length;
  const banner = '<div style="grid-column:1/-1;background:var(--lumen-lt);border:1px solid var(--lumen);border-radius:12px;padding:14px 18px;display:flex;gap:24px;align-items:center;flex-wrap:wrap;">' +
    '<div style="font-size:13px;font-weight:700;color:var(--lumen);">📊 Consolidado — ' + casasSel.length + ' casas: ' + casasSel.join(', ') + '</div>' +
    '<div style="display:flex;gap:16px;margin-left:auto;">' +
      '<div style="text-align:center;"><div style="font-size:20px;font-weight:800;color:#DC2626;">' + criticos + '</div><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;">Críticos</div></div>' +
      '<div style="text-align:center;"><div style="font-size:20px;font-weight:800;color:#EA580C;">' + altos + '</div><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;">Alto risco</div></div>' +
      '<div style="text-align:center;"><div style="font-size:20px;font-weight:800;color:var(--lumen);">' + previsaoDataGeral.length + '</div><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;">Produtos</div></div>' +
    '</div></div>';
  el.innerHTML = banner + previsaoDataGeral.slice(0,24).map(_prevCardHtml).join('');
  renderPrevisaoTabela(previsaoDataGeral);
}

function renderPrevisaoTabela(src) {
  const tbody     = document.getElementById('prev-tbody');
  const tableCard = document.getElementById('prev-table-card');
  const dados     = src || previsaoData;
  if (!tbody || dados.length === 0) return;
  const rl = { critico:'🔴 Crítico', alto:'🟠 Alto', medio:'🟡 Médio', ok:'🟢 OK', sem_dados:'⚪ —' };
  tableCard.style.display = '';
  tbody.innerHTML = dados.map(d =>
    '<tr><td style="font-size:12px;">' + d.house + '</td><td>' + d.catIcon + ' ' + d.catNome + '</td><td style="font-weight:600;">' + d.nome + '</td>' +
    '<td style="color:var(--lumen);font-weight:600;">' + d.mediaDiaria.toFixed(2) + ' ' + d.unidade + '</td>' +
    '<td>' + (d.estoqueAtual !== null ? d.estoqueAtual.toFixed(1) + ' ' + d.unidade : '—') + '</td>' +
    '<td style="color:var(--lumen);font-weight:600;">' + d.previsaoConsumo.toFixed(1) + ' ' + d.unidade + '</td>' +
    '<td>' + (d.diasCobertura !== null ? d.diasCobertura + ' dias' : '—') + '</td>' +
    '<td>' + (rl[d.risco] || d.risco) + '</td></tr>'
  ).join('');
}

async function callAIPrevisao(janela, projecao, casa, catFiltro, projecaoLabel) {
  const aiCard = document.getElementById('prev-ai-card');
  const aiText = document.getElementById('prev-ai-text');
  aiCard.style.display = '';
  aiText.textContent = '🤖 Analisando dados... aguarde.';

  // Monta resumo compacto para a IA
  const criticos = previsaoData.filter(d => d.risco === 'critico');
  const altos    = previsaoData.filter(d => d.risco === 'alto');
  const resumo   = previsaoData.slice(0,30).map(d =>
    `${d.house} | ${d.catNome} | ${d.nome}: média ${d.mediaDiaria.toFixed(2)}${d.unidade}/dia, previsão ${d.previsaoConsumo.toFixed(1)}${d.unidade} em ${projecao} dias, estoque ${d.estoqueAtual !== null ? d.estoqueAtual.toFixed(1)+d.unidade : 'desconhecido'}, cobertura ${d.diasCobertura !== null ? d.diasCobertura + ' dias' : '?'} [${d.risco}]`
  ).join('\n');

  const periodoDesc = projecaoLabel ? `período personalizado (${projecaoLabel})` : `${projecao} dias`;
  const prompt = `Você é um especialista em gestão de estoques para casas assistenciais.

Analise os dados abaixo e gere um relatório executivo em português, direto e útil, com:
1. Situação geral em 2-3 linhas
2. Top 3 produtos/casas mais críticos com recomendação específica de reposição
3. Tendências observadas
4. Sugestão de ação imediata para os próximos ${periodoDesc}

Parâmetros: janela histórica de ${janela} dias, projeção de ${periodoDesc}.
Filtros: ${casa ? 'Casa(s): '+casa : 'Todas as casas'}, ${catFiltro ? 'Categoria: '+catFiltro : 'Todas as categorias'}.
Total de itens críticos: ${criticos.length}, alto risco: ${altos.length}.

DADOS:
${resumo}

Seja objetivo e prático. Use emojis para destacar pontos importantes.`;

  try {
    const resp = await geminiFetch({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      })
    });
    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sem resposta da IA.';
    aiText.textContent = text;
  } catch(e) {
    aiText.textContent = '⚠️ IA indisponível no momento. Os dados da tabela e cards acima foram calculados localmente com base no histórico real.';
  }
}

function exportPrevisaoCSV() {
  if (!previsaoData.length) { showToast('Nenhum dado para exportar.'); return; }
  const cols = ['Casa','Categoria','Produto','Média Diária','Unidade','Estoque Atual','Previsão Consumo','Dias Cobertura','Risco'];
  const rows = previsaoData.map(d => [
    d.house, d.catNome, d.nome,
    d.mediaDiaria.toFixed(2), d.unidade,
    d.estoqueAtual !== null ? d.estoqueAtual.toFixed(1) : '',
    d.previsaoConsumo.toFixed(1), d.diasCobertura ?? '', d.risco
  ].join(';'));
  const csv = [cols.join(';'), ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `previsao_demanda_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}


// ─────────────────────────────────────────────
// 🤖  AGENTE IA — MELHOR FORNECEDOR POR CATEGORIA
// ─────────────────────────────────────────────

function toggleAIFornCard() {
  const body = document.getElementById('ai-forn-body');
  const chev = document.getElementById('ai-forn-chevron');
  const open = body.style.display === '';
  body.style.display = open ? 'none' : '';
  if (chev) chev.style.transform = open ? '' : 'rotate(180deg)';
  if (!open) {
    // Popular select ao abrir
    populateCatSelect('ai-forn-cat', false);
  }
}

async function runAIFornecedor() {
  const cat = document.getElementById('ai-forn-cat')?.value;
  const resultEl = document.getElementById('ai-forn-result');
  if (!cat) { showToast('Selecione uma categoria.'); return; }
  setBtnLoading('btn-ai-forn', true);
  resultEl.textContent = '🤖 Analisando histórico de compras...';

  try {
    // Busca pedidos concluídos com fornecedor
    const ordersSnap = await db.collection('orders')
      .where('status', '==', 'concluido').get();

    // Busca dados financeiros (se disponível)
    let finSnap = { docs: [] };
    try { finSnap = await db.collection('compras_financeiro').get(); } catch(e) {}

    // Mapeia fornecedores × categoria
    const fornMap = {}; // { fornNome: { totalPedidos, totalValue, cats: Set, casas: Set, tempos: [] } }

    ordersSnap.docs.forEach(d => {
      const o = d.data();
      const forn = o.fornecedorNome || o.supplier || null;
      if (!forn) return;
      const cats = Array.isArray(o.cats) ? o.cats : (o.cats ? [o.cats] : []);
      if (cat && !cats.includes(cat)) return;
      if (!fornMap[forn]) fornMap[forn] = { totalPedidos: 0, totalValue: 0, cats: new Set(), casas: new Set(), tempos: [] };
      fornMap[forn].totalPedidos++;
      fornMap[forn].totalValue += parseFloat(o.totalValue || o.valorTotal || 0);
      cats.forEach(c => fornMap[forn].cats.add(c));
      if (o.house) fornMap[forn].casas.add(o.house);
    });

    // Enriquece com dados financeiros
    finSnap.docs.forEach(d => {
      const f = d.data();
      const forn = f.fornecedor || f.fornecedorNome;
      if (!forn) return;
      if (!fornMap[forn]) fornMap[forn] = { totalPedidos: 0, totalValue: 0, cats: new Set(), casas: new Set(), tempos: [] };
      fornMap[forn].totalValue += parseFloat(f.valorTotal || f.valor || 0);
    });

    // Busca dados do cadastro de fornecedores
    if (!suppliersCache.length) {
      const sup = await db.collection('suppliers').get();
      suppliersCache = sup.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    const fornResumo = Object.entries(fornMap).map(([nome, dados]) => {
      const supData = suppliersCache.find(s => s.nome === nome) || {};
      return {
        nome, totalPedidos: dados.totalPedidos,
        totalValue: dados.totalValue.toFixed(2),
        categorias: [...dados.cats].join(', ') || cat,
        casas: dados.casas.size,
        limite: supData.limite || 0,
        utilizado: supData.utilizado || 0,
        prazo: supData.prazo || 'não informado',
        obs: supData.obs || ''
      };
    });

    const catNome = CATEGORIAS[cat]?.nome || cat;
    const catIcon = CATEGORIAS[cat]?.icon || '📦';

    const prompt = `Você é um especialista em compras institucionais para casas assistenciais.

Analise os fornecedores abaixo que atendem a categoria "${catIcon} ${catNome}" e recomende:
1. O melhor fornecedor geral com justificativa (considere volume, valor médio, prazo, cobertura de casas)
2. Pontos de atenção sobre cada fornecedor
3. Se algum fornecedor está próximo do limite de crédito, destaque como risco
4. Sugestão de diversificação se houver poucos fornecedores

DADOS DOS FORNECEDORES para categoria ${catNome}:
${JSON.stringify(fornResumo, null, 2)}

Seja direto e prático. Use emojis. Máximo 350 palavras.`;

    const resp = await geminiFetch({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
    });
    const data = await resp.json();
    resultEl.textContent = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sem dados suficientes para análise.';

  } catch(e) {
    resultEl.textContent = '⚠️ Erro: ' + e.message;
  }
  setBtnLoading('btn-ai-forn', false);
}

// ─────────────────────────────────────────────
// 🤖  AGENTE IA — PADRÃO CRÍTICO RECORRENTE
// ─────────────────────────────────────────────

async function detectarPadraoCritico() {
  // Analisa últimos 90 dias e detecta casas que ficaram críticas 3+ vezes no mesmo produto
  try {
    const hoje = new Date();
    const inicio90 = new Date(hoje); inicio90.setDate(inicio90.getDate() - 90);
    const deStr = inicio90.toISOString().slice(0,10);

    const snap = await db.collection('movements').where('date', '>=', deStr).get();

    // Agrupa movimentos por semana para detectar padrão
    const semanas = {}; // { "casa__prodId": { semanas com saldo crítico } }
    const saldoSemanal = {}; // acumulado por semana

    snap.docs.forEach(d => {
      const m = d.data();
      if (!m.house || !m.date) return;
      const dt = new Date(m.date);
      const semana = `${dt.getFullYear()}-W${Math.ceil((dt.getDate())/7)}`;
      (m.items || []).forEach(item => {
        if (!item?.catKey || !item?.prodId) return;
        const k = `${m.house}__${item.catKey}__${item.prodId}`;
        if (!saldoSemanal[k]) saldoSemanal[k] = {};
        if (!saldoSemanal[k][semana]) saldoSemanal[k][semana] = { qty: 0, nome: nomeProdutoAtual(item.catKey, item.prodId, item.prodNome), catKey: item.catKey, house: m.house, unidade: item.unidade || '' };
        const qt = parseFloat(item.qty) || 0;
        saldoSemanal[k][semana].qty += (m.type === 'entrada' ? qt : -qt);
      });
    });

    // Conta semanas com saldo negativo ou zero
    const padroes = [];
    Object.entries(saldoSemanal).forEach(([k, semanas]) => {
      const semanasOrdenadas = Object.entries(semanas).sort(([a],[b]) => a.localeCompare(b));
      const criticas = semanasOrdenadas.filter(([_,d]) => d.qty <= 0).length;
      if (criticas >= 3) {
        const ultimo = semanasOrdenadas[semanasOrdenadas.length-1][1];
        padroes.push({ ...ultimo, semanasProblema: criticas, totalSemanas: semanasOrdenadas.length });
      }
    });

    if (padroes.length === 0) return null;

    // Chama IA para diagnóstico
    const prompt = `Analise estes produtos que apresentam padrão de estoque crítico RECORRENTE nas casas assistenciais (ficaram sem estoque em 3 ou mais semanas dos últimos 90 dias):

${padroes.slice(0,15).map(p => `${p.house} | ${CATEGORIAS[p.catKey]?.nome||p.catKey} | ${p.nome}: ${p.semanasProblema} semanas críticas de ${p.totalSemanas}`).join('\n')}

Gere um alerta executivo de 4-5 linhas destacando:
- Casas com padrão mais grave
- Possível causa estrutural (subabastecimento crônico?)
- Recomendação de ação urgente

Use emojis. Seja direto.`;

    try {
      const resp = await geminiFetch({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
      });
      const data = await resp.json();
      const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return { padroes, aiText };
    } catch(e) { return { padroes, aiText: '' }; }

  } catch(e) { return null; }
}

