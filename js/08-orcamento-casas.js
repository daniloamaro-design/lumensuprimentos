// Extraído de index.html (casas p/ orçamento + preços + per capita/casa + gerenciar casas/cidades) em 2026-07-27
// ─────────────────────────────────────────────────────────────────
// 🏠  CASAS VÁLIDAS PARA ORÇAMENTO (comparação de períodos)
// ─────────────────────────────────────────────────────────────────
let _orcCasasAtivas = null; // null = ainda não carregado

async function orcCasasCarregar() {
  const el = document.getElementById('orc-casas-checkboxes');
  if (!el) return;
  try {
    const snap = await db.collection('config').doc('orcamento_casas_ativas').get();
    // Se não existir ainda, considera todas as casas ativas
    _orcCasasAtivas = snap.exists && snap.data().casas
      ? new Set(snap.data().casas)
      : new Set(CASAS);
  } catch(e) {
    _orcCasasAtivas = new Set(CASAS);
  }
  _orcCasasRenderizar();
}

function _orcCasasRenderizar() {
  const el = document.getElementById('orc-casas-checkboxes');
  if (!el) return;
  el.innerHTML = CASAS.map(c => {
    const checked = _orcCasasAtivas?.has(c) ? 'checked' : '';
    const id = 'orc-casa-' + c.replace(/[^a-zA-Z0-9]/g,'_');
    return `<label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:12.5px;color:var(--text);white-space:nowrap;">
      <input type="checkbox" id="${id}" value="${c}" ${checked}
        onchange="_orcCasasAtualizar()"
        style="width:14px;height:14px;cursor:pointer;accent-color:var(--lumen);">
      ${c}
    </label>`;
  }).join('');
}

function _orcCasasAtualizar() {
  _orcCasasAtivas = new Set(
    CASAS.filter(c => {
      const id = 'orc-casa-' + c.replace(/[^a-zA-Z0-9]/g,'_');
      return document.getElementById(id)?.checked;
    })
  );
}

function orcCasasSelecionarTodas(sel) {
  CASAS.forEach(c => {
    const id = 'orc-casa-' + c.replace(/[^a-zA-Z0-9]/g,'_');
    const el = document.getElementById(id);
    if (el) el.checked = sel;
  });
  _orcCasasAtualizar();
}

async function orcCasasSalvar() {
  _orcCasasAtualizar();
  try {
    await db.collection('config').doc('orcamento_casas_ativas').set({
      casas: [..._orcCasasAtivas],
      updatedBy: currentUserData?.name || '',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast('✅ Seleção de casas salva!');
  } catch(e) {
    showToast('Erro ao salvar: ' + e.message);
  }
}

function orcCasasFiltradas() {
  // Retorna Set com casas ativas; se nada carregado, retorna todas
  if (!_orcCasasAtivas) return new Set(CASAS);
  return _orcCasasAtivas;
}

async function histCompararPeriodos() {
  const aIni = document.getElementById('hist-cmp-a-ini').value;
  const aFim = document.getElementById('hist-cmp-a-fim').value;
  const bIni = document.getElementById('hist-cmp-b-ini').value;
  const bFim = document.getElementById('hist-cmp-b-fim').value;
  if (!aIni || !aFim || !bIni || !bFim) { showToast('Preencha as datas dos dois períodos.'); return; }

  const tbody = document.getElementById('hist-cmp-tbody');
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:16px;"><div class="loading-state"><div class="spinner spinner-dark"></div>Carregando...</div></td></tr>';

  const fmtD = d => d.split('-').reverse().join('/');

  async function somarPeriodo(ini, fim) {
    const snap = await db.collection('quotations')
      .where('status', '==', 'aprovado')
      .where('createdAt', '>=', new Date(ini + 'T00:00:00'))
      .where('createdAt', '<=', new Date(fim + 'T23:59:59'))
      .get();
    const orderIds = [...new Set(snap.docs.map(d => d.data().orderId).filter(Boolean))];
    const pedMap = {};
    const chunks = [];
    for (let i = 0; i < orderIds.length; i += 10) chunks.push(orderIds.slice(i, i+10));
    for (const chunk of chunks) {
      const s = await db.collection('orders').where(firebase.firestore.FieldPath.documentId(), 'in', chunk).get();
      s.docs.forEach(d => { pedMap[d.id] = d.data(); });
    }
    const casasValidas = orcCasasFiltradas();
    const tot = { total:0, cereal:0, higiene:0, proteina:0 };
    snap.docs.forEach(d => {
      const q = d.data(); const p = pedMap[q.orderId] || {};
      if (!casasValidas.has(p.house || '—')) return; // filtra casas não selecionadas
      const val = parseFloat(q.valor||0); tot.total += val;
      (p.categories||[]).forEach(c => {
        const div = (p.categories||[]).length||1;
        if (c==='cereal')   tot.cereal   += val/div;
        if (c==='higiene')  tot.higiene  += val/div;
        if (c==='proteina') tot.proteina += val/div;
      });
    });
    return tot;
  }

  try {
    const [A, B] = await Promise.all([somarPeriodo(aIni, aFim), somarPeriodo(bIni, bFim)]);

    const varTag = (a, b) => {
      if (!b) return '';
      const pct = ((a-b)/b*100).toFixed(1);
      return parseFloat(pct) > 0
        ? `<span style="font-size:10px;color:var(--danger);margin-left:4px;">▲${pct}%</span>`
        : `<span style="font-size:10px;color:var(--ok);margin-left:4px;">▼${Math.abs(pct)}%</span>`;
    };
    const menor = '<span style="font-size:10px;background:var(--ok-bg);color:var(--ok);padding:1px 6px;border-radius:20px;margin-left:5px;font-weight:700;">★ menor</span>';
    const cell = (a, b, showVar) => {
      const isA = a <= b;
      return `<td style="padding:11px 14px;text-align:right;font-weight:${isA?'700':'400'};color:var(--${isA?'ok':'danger'});">${FMT_HIST(a)}${isA?menor:''}${showVar?varTag(a,b):''}</td>`;
    };

    // Pill de tendência total
    const pill = document.getElementById('hist-trend-pill');
    if (pill && B.total > 0) {
      const pct = ((A.total - B.total)/B.total*100).toFixed(1);
      const isUp = parseFloat(pct) > 0;
      pill.innerHTML = `<span class="trend-pill ${isUp?'trend-up':'trend-down'}">${isUp?'▲':'▼'}${Math.abs(pct)}% vs período B</span>`;
    }

    tbody.innerHTML =
      `<tr>
        <td style="padding:11px 14px;border-bottom:1px solid var(--border);">
          <strong style="color:var(--text);">Período A</strong>
          <div style="font-size:11px;color:var(--text-muted);">${fmtD(aIni)} a ${fmtD(aFim)}</div>
        </td>
        ${cell(A.total,B.total,true)}${cell(A.cereal,B.cereal,false)}${cell(A.higiene,B.higiene,false)}${cell(A.proteina,B.proteina,false)}
      </tr>
      <tr>
        <td style="padding:11px 14px;">
          <strong style="color:var(--text);">Período B</strong>
          <div style="font-size:11px;color:var(--text-muted);">${fmtD(bIni)} a ${fmtD(bFim)}</div>
        </td>
        ${cell(B.total,A.total,false)}${cell(B.cereal,A.cereal,false)}${cell(B.higiene,A.higiene,false)}${cell(B.proteina,A.proteina,false)}
      </tr>`;
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:16px;color:var(--danger);">Erro: ${e.message}</td></tr>`;
  }
}

async function somarPeriodoPorCasa(ini, fim) {
  const snap = await db.collection('quotations')
    .where('status', '==', 'aprovado')
    .where('createdAt', '>=', new Date(ini + 'T00:00:00'))
    .where('createdAt', '<=', new Date(fim + 'T23:59:59'))
    .get();
  const orderIds = [...new Set(snap.docs.map(d => d.data().orderId).filter(Boolean))];
  const pedMap = {};
  const chunks = [];
  for (let i = 0; i < orderIds.length; i += 10) chunks.push(orderIds.slice(i, i+10));
  for (const chunk of chunks) {
    const s = await db.collection('orders').where(firebase.firestore.FieldPath.documentId(), 'in', chunk).get();
    s.docs.forEach(d => { pedMap[d.id] = d.data(); });
  }
  const casasValidas = orcCasasFiltradas();
  const porCasa = {};
  snap.docs.forEach(d => {
    const q = d.data(); const p = pedMap[q.orderId] || {};
    const casa = p.house || '—';
    if (!casasValidas.has(casa)) return; // filtra casas não selecionadas
    if (!porCasa[casa]) porCasa[casa] = { total:0, cereal:0, higiene:0, proteina:0 };
    const val = parseFloat(q.valor||0);
    porCasa[casa].total += val;
    const cats = p.categories || [];
    const div = cats.length || 1;
    cats.forEach(c => {
      if (c==='cereal')   porCasa[casa].cereal   += val/div;
      if (c==='higiene')  porCasa[casa].higiene  += val/div;
      if (c==='proteina') porCasa[casa].proteina += val/div;
    });
  });
  return porCasa;
}

async function histCompararPorCasa() {
  const aIni = document.getElementById('hist-cmp-a-ini').value;
  const aFim = document.getElementById('hist-cmp-a-fim').value;
  const bIni = document.getElementById('hist-cmp-b-ini').value;
  const bFim = document.getElementById('hist-cmp-b-fim').value;
  if (!aIni || !aFim || !bIni || !bFim) { showToast('Preencha as datas dos dois períodos.'); return; }

  const wrap = document.getElementById('hist-cmp-casas-wrap');
  wrap.style.display = 'block';
  wrap.innerHTML = '<div class="loading-state"><div class="spinner spinner-dark"></div>Carregando...</div>';

  try {
    const [porCasaA, porCasaB] = await Promise.all([somarPeriodoPorCasa(aIni, aFim), somarPeriodoPorCasa(bIni, bFim)]);
    const casas = [...new Set([...Object.keys(porCasaA), ...Object.keys(porCasaB)])];
    const nomesCat = { cereal:'🌾 Cereal', higiene:'🧴 Higiene', proteina:'🥩 Proteína' };

    const linhas = casas.map(casa => {
      const A = porCasaA[casa] || { total:0, cereal:0, higiene:0, proteina:0 };
      const B = porCasaB[casa] || { total:0, cereal:0, higiene:0, proteina:0 };
      const semBase = B.total === 0; // não teve orçamento no período B — não dá pra calcular variação real
      const pct = semBase ? (A.total > 0 ? Infinity : 0) : ((A.total - B.total)/B.total*100);
      const deltas = { cereal: A.cereal-B.cereal, higiene: A.higiene-B.higiene, proteina: A.proteina-B.proteina };
      const catMaior = Object.entries(deltas).sort((x,y)=>y[1]-x[1])[0][0];
      return { casa, A, B, pct, semBase, catMaior };
    });

    // pior orçamento (maior aumento) pro melhor (maior queda)
    linhas.sort((a,b) => {
      if (a.semBase && !b.semBase) return -1;
      if (!a.semBase && b.semBase) return 1;
      return b.pct - a.pct;
    });

    const cellComp = (val, other) => {
      const isMenor = val <= other;
      const cor = isMenor ? 'var(--ok)' : 'var(--danger)';
      return `<td style="padding:9px 12px;text-align:right;color:${cor};font-weight:600;">${FMT_HIST(val)}</td>`;
    };

    let html = `<div class="card" style="margin-top:4px;">
      <div class="card-header"><div class="card-header-title">🏠 Análise detalhada por casa — pior orçamento primeiro</div></div>
      <div class="card-body">
        <div style="font-size:11.5px;color:var(--text-muted);margin-bottom:10px;">🟢 verde = opção mais barata entre os dois períodos &nbsp;|&nbsp; 🔴 vermelho = opção mais cara</div>`;

    linhas.forEach(l => {
      const pctLabel = l.semBase
        ? (l.A.total > 0 ? '<span style="font-size:12px;color:var(--warn);font-weight:700;">novo período — sem base de comparação</span>' : '<span style="font-size:12px;color:var(--text-muted);">sem movimento</span>')
        : `<span style="font-size:12px;color:${l.pct>0?'var(--danger)':'var(--ok)'};font-weight:700;">${l.pct>0?'▲':'▼'} ${Math.abs(l.pct).toFixed(1)}%</span>`;
      const catLabel = nomesCat[l.catMaior] || l.catMaior;

      html += `
        <div style="margin-bottom:16px;border:1px solid var(--border);border-radius:10px;overflow:hidden;">
          <div style="padding:10px 14px;background:var(--surface);display:flex;justify-content:space-between;align-items:center;">
            <strong>${l.casa}</strong>
            ${pctLabel}
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead><tr>
              <th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--text-muted);text-transform:uppercase;">Período</th>
              <th style="padding:8px 12px;text-align:right;font-size:11px;color:var(--text-muted);text-transform:uppercase;">Total</th>
              <th style="padding:8px 12px;text-align:right;font-size:11px;color:var(--text-muted);text-transform:uppercase;">🌾 Cereal</th>
              <th style="padding:8px 12px;text-align:right;font-size:11px;color:var(--text-muted);text-transform:uppercase;">🧴 Higiene</th>
              <th style="padding:8px 12px;text-align:right;font-size:11px;color:var(--text-muted);text-transform:uppercase;">🥩 Proteína</th>
            </tr></thead>
            <tbody>
              <tr style="border-top:1px solid var(--border);">
                <td style="padding:9px 12px;">Período A</td>
                ${cellComp(l.A.total, l.B.total)}
                ${cellComp(l.A.cereal, l.B.cereal)}
                ${cellComp(l.A.higiene, l.B.higiene)}
                ${cellComp(l.A.proteina, l.B.proteina)}
              </tr>
              <tr style="border-top:1px solid var(--border);">
                <td style="padding:9px 12px;">Período B</td>
                ${cellComp(l.B.total, l.A.total)}
                ${cellComp(l.B.cereal, l.A.cereal)}
                ${cellComp(l.B.higiene, l.A.higiene)}
                ${cellComp(l.B.proteina, l.A.proteina)}
              </tr>
            </tbody>
          </table>
          <div style="padding:6px 14px;font-size:11.5px;color:var(--text-muted);background:var(--surface);">Categoria que mais puxou o valor: <strong style="color:var(--danger);">${catLabel}</strong></div>
        </div>`;
    });

    html += `</div></div>`;
    wrap.innerHTML = html;
  } catch(e) {
    wrap.innerHTML = `<div style="color:var(--danger);padding:12px;">Erro: ${e.message}</div>`;
  }
}

function histExportarCSV() {
  if (!window._histRows?.length) { showToast('Busque o histórico primeiro.'); return; }
  const header = 'Pedido,Casa,Categorias,Fornecedor,Valor,Autorizado por,Data autorização,Nível\n';
  const rows = window._histRows.map(({ q, p }) => {
    const cats = (p.categories||[]).map(c => CATEGORIAS[c]?.nome||c).join(';');
    const autEm = q.gerenteEm?.toDate ? q.gerenteEm.toDate().toLocaleDateString('pt-BR')
                : q.coordenadorEm?.toDate ? q.coordenadorEm.toDate().toLocaleDateString('pt-BR') : '';
    const nivel = (q.statusGerente==='aprovado'&&q.statusCoordenador==='aprovado') ? 'Coord+Ger'
                : q.statusGerente==='aprovado' ? 'Gerente' : 'Coord.';
    return `"${p.code||q.orderId||''}","${p.house||''}","${cats}","${q.fornecedorNome||''}",${parseFloat(q.valor||0).toFixed(2)},"${q.gerenteNome||q.coordenadorNome||q.createdBy||''}","${autEm}","${nivel}"`;
  }).join('\n');
  const blob = new Blob(['\ufeff'+header+rows], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `historico_orcamentos_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

function histExportarPDF() {
  showToast('Gerando PDF... (use Ctrl+P e salve como PDF)');
  window.print();
}

function exportStockCSV() {
  if (!window._stockRows?.length) { showToast('Carregue o estoque primeiro!'); return; }
  const header = 'Casa,Categoria,Produto,Entradas,Saídas,Saldo Atual,Unidade\n';
  const csv = window._stockRows.map(r =>
    `"${r.house}","${r.cat.nome}","${r.data.nome}",${r.data.e.toFixed(2)},${r.data.s.toFixed(2)},${r.saldoAtual.toFixed(2)},"${r.data.unidade}"`
  ).join('\n');
  const blob = new Blob([header + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `LM-Estoque-${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────
// 💰  PREÇOS POR CIDADE
// ─────────────────────────────────────────────
let priceData = {}; // { prodId: { cidade: preco } }
let showingComparison = false;

async function loadPrices() {
  const cat  = document.getElementById('price-cat').value;
  const city = document.getElementById('price-city').value;
  if (!city) return;

  document.getElementById('price-edit-title').textContent = `Preços — ${CATEGORIAS[cat].nome} — ${city}`;
  document.getElementById('price-edit-card').classList.remove('hidden');

  // Load from Firestore
  const snap = await db.collection('prices').where('cat','==',cat).get();
  priceData = {};
  snap.docs.forEach(d => {
    const p = d.data();
    if (!priceData[p.prodId]) priceData[p.prodId] = {};
    priceData[p.prodId][p.city] = { price: p.price, docId: d.id };
  });

  const prods = CATEGORIAS[cat].produtos;
  const el = document.getElementById('price-products-list');
  el.innerHTML = prods.map(p => {
    const currentPrice = priceData[p.id]?.[city]?.price || '';
    return `<div class="prod-row">
      <div class="prod-name">${p.nome}</div>
      <span class="prod-unit">${p.unidade}</span>
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:13px;color:var(--text-muted);">R$</span>
        <input class="prod-qty-input" type="number" min="0" step="0.01" id="price-inp-${p.id}"
          value="${currentPrice}" placeholder="0,00" style="width:90px;">
      </div>
    </div>`;
  }).join('');

  if (showingComparison) renderPriceComparison();
}

async function savePrices() {
  const cat  = document.getElementById('price-cat').value;
  const city = document.getElementById('price-city').value;
  if (!city) { showToast('Selecione uma cidade!'); return; }

  setBtnLoading('btn-save-prices', true);
  const prods = CATEGORIAS[cat].produtos;
  const batch = db.batch();

  for (const p of prods) {
    const inp = document.getElementById(`price-inp-${p.id}`);
    if (!inp) continue;
    const price = parseFloat(inp.value);
    if (isNaN(price) || price <= 0) continue;

    const existingDocId = priceData[p.id]?.[city]?.docId;
    const data = { cat, prodId: p.id, prodNome: p.nome, city, price, unidade: p.unidade,
      updatedBy: currentUserData.name, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };

    if (existingDocId) {
      batch.update(db.collection('prices').doc(existingDocId), data);
    } else {
      batch.set(db.collection('prices').doc(), data);
    }
  }

  try {
    await batch.commit();
    showToast(`✅ Preços de ${city} salvos!`);
    await loadPrices();
    if (showingComparison) renderPriceComparison();
  } catch(e) {
    showToast('Erro ao salvar preços.');
    console.error(e);
  }
  setBtnLoading('btn-save-prices', false);
}

function togglePriceComparison() {
  showingComparison = !showingComparison;
  document.getElementById('price-comparison-card').classList.toggle('hidden', !showingComparison);
  if (showingComparison) renderPriceComparison();
}

async function renderPriceComparison() {
  const cat = document.getElementById('price-cat').value;
  const snap = await db.collection('prices').where('cat','==',cat).get();
  const allPrices = {};
  snap.docs.forEach(d => {
    const p = d.data();
    if (!allPrices[p.prodId]) allPrices[p.prodId] = { nome: p.prodNome, unidade: p.unidade, cities: {} };
    allPrices[p.prodId].cities[p.city] = p.price;
  });

  const prods = Object.values(allPrices);
  if (prods.length === 0) {
    document.getElementById('price-comparison-body').innerHTML = '<div class="empty-state"><div class="empty-state-icon">💰</div><div class="empty-state-title">Nenhum preço cadastrado ainda</div></div>';
    return;
  }

  document.getElementById('price-comp-title').textContent = `Comparação — ${CATEGORIAS[cat].nome}`;
  const cityHeaders = CIDADES.map(c => `<th>${c}</th>`).join('');
  const rows = CATEGORIAS[cat].produtos.map(p => {
    const data = allPrices[p.id];
    if (!data) return '';
    const prices = CIDADES.map(c => data.cities[c]);
    const validPrices = prices.filter(x => x > 0);
    const minPrice = validPrices.length ? Math.min(...validPrices) : null;

    const cells = prices.map(price => {
      if (!price) return '<td class="text-muted" style="text-align:center;">—</td>';
      const isBest = price === minPrice && validPrices.length > 1;
      return `<td style="text-align:center;${isBest ? 'background:var(--ok-bg);color:var(--ok);font-weight:700;' : ''}">R$ ${price.toFixed(2)}</td>`;
    }).join('');
    return `<tr><td>${p.nome}</td><td class="text-muted">${p.unidade}</td>${cells}</tr>`;
  }).filter(Boolean).join('');

  document.getElementById('price-comparison-body').innerHTML = `
    <table style="min-width:600px;">
      <thead><tr><th>Produto</th><th>Unid.</th>${cityHeaders}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="text-sm text-muted" style="padding:10px 14px;">🟢 Verde = menor preço entre as cidades cadastradas</div>`;
}

// ─────────────────────────────────────────────
// 📊  PER CAPITA POR CASA
// ─────────────────────────────────────────────
async function loadPercapitaPage() {
  const house = document.getElementById('pc-house')?.value;
  const cat   = document.getElementById('pc-cat')?.value || 'cereal';
  const el    = document.getElementById('pc-products-list');
  if (!house) { el.innerHTML = '<div class="loading-state">Selecione uma casa acima</div>'; return; }

  document.getElementById('pc-title').textContent = `Per Capita — ${house} — ${CATEGORIAS[cat].nome}`;
  el.innerHTML = '<div class="loading-state"><div class="spinner spinner-dark"></div>Carregando...</div>';

  // Load from Firestore
  let vals = JSON.parse(JSON.stringify(PERCAPITAS_PADRAO));
  const snap = await db.collection('percapitas').where('house','==',house).get();
  if (!snap.empty) vals = snap.docs[0].data().values || vals;

  el.innerHTML = CATEGORIAS[cat].produtos.map(p => {
    const currentVal = (vals[cat] && vals[cat][p.id] !== undefined) ? vals[cat][p.id] : 0;
    const defaultVal = (PERCAPITAS_PADRAO[cat] && PERCAPITAS_PADRAO[cat][p.id]) || 0;
    return `<div class="prod-row">
      <div class="prod-name">${p.nome}</div>
      <span class="prod-unit">${p.unidade}/dia</span>
      <span class="text-muted text-sm" style="min-width:120px;text-align:right;">Padrão: ${defaultVal}</span>
      <input class="prod-qty-input" type="number" min="0" step="0.001"
        id="pc-inp-${p.id}" value="${currentVal}" style="width:90px;">
    </div>`;
  }).join('');
}

async function savePercapita() {
  const house = document.getElementById('pc-house')?.value;
  const cat   = document.getElementById('pc-cat')?.value || 'cereal';
  if (!house) { showToast('Selecione uma casa!'); return; }

  setBtnLoading('btn-save-pc', true);

  // Load existing values first
  let vals = JSON.parse(JSON.stringify(PERCAPITAS_PADRAO));
  const snap = await db.collection('percapitas').where('house','==',house).get();
  if (!snap.empty) vals = snap.docs[0].data().values || vals;

  // Update only current category
  if (!vals[cat]) vals[cat] = {};
  CATEGORIAS[cat].produtos.forEach(p => {
    const inp = document.getElementById(`pc-inp-${p.id}`);
    if (inp) vals[cat][p.id] = parseFloat(inp.value) || 0;
  });

  try {
    if (snap.empty) {
      await db.collection('percapitas').add({
        house, values: vals,
        updatedBy: currentUserData.name,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } else {
      await db.collection('percapitas').doc(snap.docs[0].id).update({
        values: vals,
        updatedBy: currentUserData.name,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    // Update local cache
    housePercapitas[house] = vals;
    showToast(`✅ Per capita de ${house} — ${CATEGORIAS[cat].nome} salvo!`);
  } catch(e) {
    showToast('Erro ao salvar: ' + e.message);
  }
  setBtnLoading('btn-save-pc', false);
}

async function resetPercapitaToDefault() {
  const house = document.getElementById('pc-house')?.value;
  const cat   = document.getElementById('pc-cat')?.value || 'cereal';
  if (!house) { showToast('Selecione uma casa!'); return; }
  const defaults = PERCAPITAS_PADRAO[cat];
  CATEGORIAS[cat].produtos.forEach(p => {
    const inp = document.getElementById(`pc-inp-${p.id}`);
    if (inp) inp.value = defaults[p.id] || 0;
  });
  showToast('Valores padrão carregados. Clique em Salvar para confirmar.');
}

// ─────────────────────────────────────────────
// 🚨  ALERTA DE ESTOQUE CRÍTICO
// ─────────────────────────────────────────────
async function checkCriticalStock(manual = false) {
  if (manual) showToast('Verificando estoque crítico...');

  const snap = await db.collection('movements').get();
  const saldo = {};
  snap.docs.forEach(d => {
    const m = d.data();
    if (!m || !m.house) return;
    if (!saldo[m.house]) saldo[m.house] = {};
    const items = Array.isArray(m.items) ? m.items : [];
    items.forEach(item => {
      if (!item || !item.catKey || !item.prodId) return;
      const key = `${item.catKey}__${item.prodId}`;
      if (!saldo[m.house][key]) saldo[m.house][key] = { qty: 0, nome: nomeProdutoAtual(item.catKey, item.prodId, item.prodNome), unidade: item.unidade || '', catKey: item.catKey, prodId: item.prodId };
      if (m.type === 'entrada') saldo[m.house][key].qty += (parseFloat(item.qty) || 0);
      else saldo[m.house][key].qty -= (parseFloat(item.qty) || 0);
    });
  });

  const pcSnap = await db.collection('percapitas').get();
  const allPc = {};
  pcSnap.docs.forEach(d => { if (d.data().house) allPc[d.data().house] = d.data().values || PERCAPITAS_PADRAO; });

  const housesSnap = await db.collection('houses').get();
  const housePeople = {};
  housesSnap.docs.forEach(d => { if (d.data().name) housePeople[d.data().name] = d.data().currentPeople || 0; });

  const criticos = [];
  Object.entries(saldo).forEach(([house, prods]) => {
    const pessoas = housePeople[house] || 0;
    if (pessoas === 0) return;
    const pc = allPc[house] || PERCAPITAS_PADRAO;

    Object.entries(prods).forEach(([key, data]) => {
      if (!data || !data.catKey || !data.prodId) return;
      const ppcCat = pc[data.catKey] || {};
      const ppc = ppcCat[data.prodId] || 0;
      if (ppc === 0) return;

      const esperado7dias = 7 * pessoas * ppc;
      const limiteMin = esperado7dias * 0.3;

      if (data.qty < limiteMin) {
        criticos.push({
          house, produto: data.nome, unidade: data.unidade,
          saldoAtual: data.qty.toFixed(2),
          minimo: limiteMin.toFixed(2),
          esperado: esperado7dias.toFixed(2),
          status: data.qty <= 0 ? '🔴 ZERADO' : '🟠 CRÍTICO'
        });
      }
    });
  });

  if (criticos.length === 0) {
    if (manual) showToast('✅ Nenhum item em estoque crítico!');
    return;
  }

  // Monta resumo agrupado por casa
  const porCasa = {};
  criticos.forEach(c => {
    if (!porCasa[c.house]) porCasa[c.house] = [];
    porCasa[c.house].push(c);
  });

  // Monta corpo do e-mail em texto
  let emailBody = `ALERTA DE ESTOQUE CRÍTICO — Obra Lumen\nData: ${new Date().toLocaleDateString('pt-BR')}\n\n`;
  Object.entries(porCasa).forEach(([house, itens]) => {
    emailBody += `🏠 ${house}:\n`;
    itens.forEach(i => { emailBody += `  ${i.status} ${i.produto}: ${i.saldoAtual} ${i.unidade} (mín: ${i.minimo})\n`; });
    emailBody += '\n';
  });

  // Envia via EmailJS
  try {
    await sendAlertEmail(
      `🚨 ALERTA — ${criticos.length} item(s) crítico(s)`,
      emailBody
    );
    if (manual) showToast(`🚨 Alerta enviado! ${criticos.length} item(s) crítico(s) em ${Object.keys(porCasa).length} casa(s).`);
  } catch(e) {
    if (manual) showToast('Erro ao enviar alerta: ' + e.message);
  }
}

// Verifica estoque crítico automaticamente a cada 6 horas
setInterval(() => checkCriticalStock(false), 6 * 60 * 60 * 1000);

// ─────────────────────────────────────────────
// 🏠  GERENCIAR CASAS
// ─────────────────────────────────────────────
// Global map casa → bloco (loaded from firebase)
let CASAS_BLOCOS = {};
window.CASAS_ENDERECOS = {};

async function loadManageHouses() {
  const el = document.getElementById('custom-houses-list');
  el.innerHTML = '<div class="loading-state"><div class="spinner spinner-dark"></div>Carregando...</div>';

  // Modelo consolidado: tudo vem da tabela houses (id + bloco por casa).
  const housesSnap = await db.collection('houses').get();
  const customIds = {}; // nome → id da linha em houses
  CASAS_BLOCOS = {};
  housesSnap.docs.forEach(d => { const h = d.data(); customIds[h.nome] = d.id; if (h.bloco) CASAS_BLOCOS[h.nome] = h.bloco; });

  // Names of default houses (hardcoded list)
  const CASAS_PADRAO_NOMES = new Set([
    'Dom Bosco','São Francisco','Fraternitas','São Gabriel',
    'Três Pastorinhos','Santa Dulce - CE','N. S. Lourdes',
    'Espírito Santo','Bom Samaritano','Filho Pródigo',
    'Coração Sagrado','Sítio Belém','Santa Dulce - SSA',
    'Fazenda Natal - SSA','Recanto Solidário - SSA',
    'Dom Helder - PE','Bom Jesus - SP'
  ]);

  const blocoOptions = `<option value="">—</option>${[1,2,3,4,5,6,7,8,9,10].map(i=>`<option value="${i}">Bloco ${i}</option>`).join('')}`;

  el.innerHTML = `<div class="table-wrap"><table>
    <thead><tr>
      <th>Casa / Unidade</th>
      <th>Cidade</th>
      <th style="min-width:140px;">Bloco de Compra</th>
      <th>Tipo</th>
      <th>Ações</th>
    </tr></thead>
    <tbody>
    ${CASAS.map(casa => {
      const hid     = casa.replace(/[^a-zA-Z0-9]/g,'_');
      const cidade  = CASAS_CIDADES[casa] || '—';
      const isPadrao= CASAS_PADRAO_NOMES.has(casa);
      const isCustom= !isPadrao;
      const docId   = customIds[casa] || '';   // id da linha em houses
      const tipo    = isPadrao ? 'padrao' : 'custom';
      return `<tr>
        <td><strong>${casa}</strong></td>
        <td class="text-muted text-sm">${cidade}</td>
        <td>
          <select class="form-select" id="bloco-sel-${hid}" style="font-size:12px;padding:5px 8px;" onchange="CASAS_BLOCOS['${casa}']=this.value">
            ${blocoOptions}
          </select>
        </td>
        <td>${isPadrao ? '<span class="badge badge-gray">Padrão</span>' : '<span class="badge badge-info">Manual</span>'}</td>
        <td style="display:flex;gap:5px;flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm" onclick="openEditHouse('${casa.replace(/'/g,"\\'")}','${docId}','${tipo}')">✏️ Editar</button>
          <button class="btn btn-danger btn-sm" onclick="deleteHouse('${docId}','${casa.replace(/'/g,"\\'")}','${tipo}')">Remover</button>
        </td>
      </tr>`;
    }).join('')}
    </tbody>
  </table></div>`;

  // Set saved bloco values
  CASAS.forEach(casa => {
    const hid = casa.replace(/[^a-zA-Z0-9]/g,'_');
    const sel = document.getElementById('bloco-sel-' + hid);
    if (sel) sel.value = CASAS_BLOCOS[casa] || '';
  });
}

async function saveAllBlocks() {
  try {
    // Mapa nome → id da linha em houses
    const housesSnap = await db.collection('houses').get();
    const idPorNome = {};
    housesSnap.docs.forEach(d => { idPorNome[d.data().nome] = d.id; });
    for (const casa of CASAS) {
      const hid  = casa.replace(/[^a-zA-Z0-9]/g,'_');
      const sel  = document.getElementById('bloco-sel-' + hid);
      const bloco= sel ? sel.value : '';
      const id   = idPorNome[casa];
      if (id) await db.collection('houses').doc(id).update({ bloco });
    }
    showToast('✅ Blocos de compra salvos com sucesso!');
  } catch(e) {
    showToast('Erro ao salvar blocos: ' + e.message);
  }
}

async function addNewHouse() {
  const nome   = document.getElementById('new-house-name').value.trim();
  const cidade = document.getElementById('new-house-city').value;
  const bloco  = document.getElementById('new-house-bloco').value;

  if (!nome)   { showToast('Digite o nome da casa!'); return; }
  if (!cidade) { showToast('Selecione a cidade!'); return; }
  if (CASAS.includes(nome)) { showToast('Essa casa já existe no sistema!'); return; }

  const endereco = document.getElementById('new-house-endereco').value.trim();
  try {
    await db.collection('houses').add({
      nome, cidade, endereco, bloco: bloco || null, ativo: true,
      acolhidos: 0, coordenadores: 0, extra: 0, currentPeople: 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    if (typeof CASAS_ENDERECOS !== 'undefined') CASAS_ENDERECOS[nome] = endereco;
    CASAS.push(nome);
    CASAS.sort((a, b) => a.localeCompare(b, 'pt-BR'));
    CASAS_CIDADES[nome] = cidade;
    document.getElementById('new-house-name').value     = '';
    document.getElementById('new-house-city').value     = '';
    document.getElementById('new-house-bloco').value    = '';
    document.getElementById('new-house-endereco').value = '';
    populateHouseSelects();
    showToast(`✅ Casa "${nome}" adicionada com sucesso!`);
    loadManageHouses();
  } catch(e) {
    showToast('Erro ao adicionar casa: ' + e.message);
  }
}

// ─── Abrir modal de edição de casa ───
function openEditHouse(nome, docId, tipo) {
  document.getElementById('edit-house-original-nome').value = nome;
  document.getElementById('edit-house-doc-id').value = docId;
  document.getElementById('edit-house-is-custom').value = tipo;
  document.getElementById('edit-house-nome').value = nome;

  // Popula select de cidades
  const sel = document.getElementById('edit-house-cidade');
  sel.innerHTML = '<option value="">Selecione a cidade...</option>';
  CIDADES.forEach(c => {
    const o = document.createElement('option');
    o.value = c; o.textContent = c;
    if (c === CASAS_CIDADES[nome]) o.selected = true;
    sel.appendChild(o);
  });

  // Preenche bloco
  const bloco = CASAS_BLOCOS[nome] || '';
  document.getElementById('edit-house-bloco').value = bloco;

  const endAtual = (typeof CASAS_ENDERECOS !== 'undefined' && CASAS_ENDERECOS[nome]) || '';
  document.getElementById('edit-house-endereco').value = endAtual;

  document.getElementById('modal-edit-house').classList.remove('hidden');
}

async function saveEditHouse() {
  const originalNome = document.getElementById('edit-house-original-nome').value;
  const docId        = document.getElementById('edit-house-doc-id').value;
  const tipo         = document.getElementById('edit-house-is-custom').value;
  const novoNome     = document.getElementById('edit-house-nome').value.trim();
  const novaCidade   = document.getElementById('edit-house-cidade').value;
  const novoBloco    = document.getElementById('edit-house-bloco').value;
  const novoEndereco = document.getElementById('edit-house-endereco').value.trim();

  if (!novoNome)    { showToast('Digite o nome da casa!'); return; }
  if (!novaCidade)  { showToast('Selecione a cidade!'); return; }

  setBtnLoading('btn-save-edit-house', true);
  try {
    // Modelo consolidado: uma única linha em houses. docId = id da linha;
    // se vazio (fallback), localiza pela nome original.
    let id = docId;
    if (!id) {
      const snap = await db.collection('houses').where('nome', '==', originalNome).get();
      if (!snap.empty) id = snap.docs[0].id;
    }
    if (id) {
      await db.collection('houses').doc(id).update({
        nome: novoNome, cidade: novaCidade, endereco: novoEndereco, bloco: novoBloco || null
      });
    }

    if (typeof CASAS_ENDERECOS !== 'undefined') {
      delete CASAS_ENDERECOS[originalNome];
      CASAS_ENDERECOS[novoNome] = novoEndereco;
    }
    const idx = CASAS.indexOf(originalNome);
    if (idx >= 0) CASAS[idx] = novoNome;
    delete CASAS_CIDADES[originalNome];
    CASAS_CIDADES[novoNome] = novaCidade;
    CASAS_BLOCOS[novoNome]  = novoBloco;
    CASAS.sort((a, b) => a.localeCompare(b, 'pt-BR'));

    populateHouseSelects();
    closeModal('modal-edit-house');
    showToast(`✅ Casa "${novoNome}" atualizada!`);
    loadManageHouses();
  } catch(e) {
    showToast('Erro ao salvar: ' + e.message);
  }
  setBtnLoading('btn-save-edit-house', false);
}

async function deleteHouse(docId, nome, tipo) {
  if (!confirm(`Tem certeza que deseja remover "${nome}"?\n\nOs dados de estoque e pedidos desta casa não serão apagados.`)) return;

  try {
    // Modelo consolidado: marca a linha em houses como inativa (soft delete),
    // preservando o histórico. docId = id da linha; fallback pela nome.
    let id = docId;
    if (!id) {
      const snap = await db.collection('houses').where('nome', '==', nome).get();
      if (!snap.empty) id = snap.docs[0].id;
    }
    if (id) await db.collection('houses').doc(id).update({ ativo: false });

    // Remove da lista local
    CASAS = CASAS.filter(c => c !== nome);
    delete CASAS_CIDADES[nome];

    populateHouseSelects();
    showToast(`Casa "${nome}" removida.`);
    loadManageHouses();
  } catch(e) {
    showToast('Erro ao remover: ' + e.message);
  }
}

// ─────────────────────────────────────────────
// 🌆  GERENCIAR CIDADES
// ─────────────────────────────────────────────
async function loadManageCities() {
  const el = document.getElementById('custom-cities-list');
  el.innerHTML = '<div class="loading-state"><div class="spinner spinner-dark"></div>Carregando...</div>';

  // Modelo consolidado: cidades vêm da tabela 'cidades' (PK = nome).
  const customSnap = await db.collection('cidades').orderBy('nome').get();
  const customIds = {};
  customSnap.docs.forEach(d => { customIds[d.data().nome] = { id: d.id, data: d.data() }; });

  // Cidades padrão hardcoded
  const CIDADES_PADRAO = new Set([
    'Fortaleza - CE','Salvador - BA','São Carlos - SP',
    'Jaboatão dos Guararapes - PE','Simões Filho - BA','Paulo Afonso - BA'
  ]);

  if (CIDADES.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🌆</div><div class="empty-state-title">Nenhuma cidade cadastrada</div></div>';
    return;
  }

  el.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Cidade</th><th>Tipo</th><th>Ações</th></tr></thead>
    <tbody>
    ${CIDADES.map(cidade => {
      const isCustom = !!customIds[cidade];
      const tipo     = CIDADES_PADRAO.has(cidade) && !isCustom ? 'padrao' : 'custom';
      const docId    = isCustom ? customIds[cidade].id : '';
      return `<tr>
        <td><strong>${cidade}</strong></td>
        <td>${tipo === 'padrao' ? '<span class="badge badge-gray">Padrão</span>' : '<span class="badge badge-info">Manual</span>'}</td>
        <td style="display:flex;gap:5px;">
          <button class="btn btn-secondary btn-sm" onclick="openEditCity('${cidade.replace(/'/g,"\\'")}','${docId}','${tipo}')">✏️ Editar</button>
          <button class="btn btn-danger btn-sm" onclick="deleteCity('${docId}','${cidade.replace(/'/g,"\\'")}','${tipo}')">Remover</button>
        </td>
      </tr>`;
    }).join('')}
    </tbody>
  </table></div>`;
}

// ─── Abrir modal de edição de cidade ───
function openEditCity(nome, docId, tipo) {
  document.getElementById('edit-city-original-nome').value = nome;
  document.getElementById('edit-city-doc-id').value = docId;
  document.getElementById('edit-city-is-custom').value = tipo;
  document.getElementById('edit-city-nome').value = nome;
  document.getElementById('modal-edit-city').classList.remove('hidden');
}

async function saveEditCity() {
  const originalNome = document.getElementById('edit-city-original-nome').value;
  const docId        = document.getElementById('edit-city-doc-id').value;
  const tipo         = document.getElementById('edit-city-is-custom').value;
  const novoNome     = document.getElementById('edit-city-nome').value.trim();

  if (!novoNome) { showToast('Digite o nome da cidade!'); return; }
  if (novoNome !== originalNome && CIDADES.includes(novoNome)) { showToast('Já existe uma cidade com esse nome!'); return; }

  setBtnLoading('btn-save-edit-city', true);
  try {
    // Renomear cidade: como houses.cidade referencia cidades(nome), criamos a nova,
    // repontamos as casas e removemos a antiga (respeitando a chave estrangeira).
    if (novoNome !== originalNome) {
      await db.collection('cidades').add({ nome: novoNome, ativo: true });
      const casasSnap = await db.collection('houses').where('cidade', '==', originalNome).get();
      for (const d of casasSnap.docs) await db.collection('houses').doc(d.id).update({ cidade: novoNome });
      await db.collection('cidades').doc(originalNome).delete();
    }

    // Atualiza memória local
    const idx = CIDADES.indexOf(originalNome);
    if (idx >= 0) CIDADES[idx] = novoNome;
    Object.keys(CASAS_CIDADES).forEach(casa => {
      if (CASAS_CIDADES[casa] === originalNome) CASAS_CIDADES[casa] = novoNome;
    });
    CIDADES.sort((a, b) => a.localeCompare(b, 'pt-BR'));

    populateHouseSelects();
    closeModal('modal-edit-city');
    showToast(`✅ Cidade "${novoNome}" atualizada!`);
    loadManageCities();
  } catch(e) {
    showToast('Erro ao salvar: ' + e.message);
  }
  setBtnLoading('btn-save-edit-city', false);
}

async function addNewCity() {
  const nome = document.getElementById('new-city-name').value.trim();
  if (!nome) { showToast('Digite o nome da cidade!'); return; }
  if (CIDADES.includes(nome)) { showToast('Essa cidade já existe no sistema!'); return; }

  try {
    await db.collection('cidades').add({ nome, ativo: true });

    CIDADES.push(nome);
    CIDADES.sort((a, b) => a.localeCompare(b, 'pt-BR'));
    document.getElementById('new-city-name').value = '';
    populateHouseSelects();
    showToast(`✅ Cidade "${nome}" adicionada com sucesso!`);
    loadManageCities();
  } catch(e) {
    showToast('Erro ao adicionar cidade: ' + e.message);
  }
}

async function deleteCity(docId, nome, tipo) {
  if (!confirm(`Tem certeza que deseja remover "${nome}"?\n\nOs preços cadastrados para esta cidade não serão apagados.`)) return;

  try {
    // Soft delete: marca a cidade como inativa (preserva preços/histórico).
    await db.collection('cidades').doc(nome).update({ ativo: false });
    CIDADES = CIDADES.filter(c => c !== nome);
    populateHouseSelects();
    showToast(`Cidade "${nome}" removida.`);
    loadManageCities();
  } catch(e) {
    showToast('Erro ao remover: ' + e.message);
  }
}


// ─────────────────────────────────────────────
// 📊  CALCULADO × REAL — CONSUMO POR CASA
// (implementado em 2026-07-27; página já existia no HTML mas as funções
//  crHouseChange/loadCalcReal nunca haviam sido criadas)
// ─────────────────────────────────────────────
let _crHousesData = null; // nome da casa → total de pessoas

async function _crCarregarCasas() {
  if (_crHousesData) return _crHousesData;
  const snap = await db.collection('houses').get();
  _crHousesData = {};
  snap.docs.forEach(d => {
    const h = d.data();
    const nome = h.name || d.id;
    const total = (h.acolhidos || h.currentPeople || 0) + (h.coordenadores || 0) + (h.extra || 0);
    _crHousesData[nome] = total || 1;
  });
  const sel = document.getElementById('cr-house');
  if (sel && sel.options.length <= 1) {
    Object.keys(_crHousesData).sort().forEach(nome => {
      const opt = document.createElement('option');
      opt.value = nome; opt.textContent = nome;
      sel.appendChild(opt);
    });
  }
  return _crHousesData;
}

async function crHouseChange() {
  const casas = await _crCarregarCasas();
  const casa = document.getElementById('cr-house').value;
  const inp  = document.getElementById('cr-pessoas-sim');
  inp.value = '';
  inp.placeholder = (casa && casas[casa]) ? ('Atual: ' + casas[casa]) : 'Qtd. pessoas';
}

async function loadCalcReal() {
  const tbody = document.getElementById('cr-tbody');
  const kpis  = document.getElementById('cr-kpis');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="11" class="text-muted" style="text-align:center;padding:40px;">Analisando movimentações…</td></tr>';

  try {
    const casas    = await _crCarregarCasas();
    const casaSel  = document.getElementById('cr-house').value;
    const catSel   = document.getElementById('cr-cat').value;
    const dias     = Math.max(1, parseInt(document.getElementById('cr-dias').value, 10) || 30);
    const pessoasSim = parseInt(document.getElementById('cr-pessoas-sim').value, 10) || 0;

    const movSnap = await db.collection('movements').get();
    const iniDate = new Date();
    iniDate.setDate(iniDate.getDate() - dias);

    // Agrega por casa+categoria+produto: saídas no período, entradas/saídas totais (p/ estoque)
    const dados = {};
    movSnap.docs.forEach(d => {
      const m = d.data();
      if (!m.house || !m.items) return;
      if (casaSel && m.house !== casaSel) return;
      const dt = m.date && m.date.toDate ? m.date.toDate() : (m.date ? new Date(m.date) : null);
      m.items.forEach(item => {
        if (!item.catKey || !item.prodId) return;
        if (catSel && item.catKey !== catSel) return;
        const k = m.house + '|' + item.catKey + '|' + item.prodId;
        if (!dados[k]) dados[k] = {
          casa: m.house, catKey: item.catKey, prodId: item.prodId,
          nome: nomeProdutoAtual(item.catKey, item.prodId, item.prodNome),
          unidade: item.unidade || '',
          saidasPeriodo: 0, entradasTot: 0, saidasTot: 0
        };
        const q = item.qty || 0;
        if (m.type === 'entrada') dados[k].entradasTot += q;
        else {
          dados[k].saidasTot += q;
          if (dt && dt >= iniDate) dados[k].saidasPeriodo += q;
        }
      });
    });

    // Per capita personalizado das casas envolvidas (fallback: padrão)
    const casasEnvolvidas = casaSel ? [casaSel] : [...new Set(Object.values(dados).map(p => p.casa))];
    await Promise.all(casasEnvolvidas.map(async c => {
      if (housePercapitas[c]) return;
      try {
        const s = await db.collection('percapitas').where('house', '==', c).get();
        housePercapitas[c] = !s.empty ? (s.docs[0].data().values || PERCAPITAS_PADRAO) : PERCAPITAS_PADRAO;
      } catch (e) {
        housePercapitas[c] = PERCAPITAS_PADRAO;
      }
    }));

    const linhas = Object.values(dados).map(p => {
      const pessoas = pessoasSim || casas[p.casa] || 1;
      const pc      = housePercapitas[p.casa] || PERCAPITAS_PADRAO;
      const pcVal   = (pc[p.catKey] && pc[p.catKey][p.prodId]) || 0;
      const calcDia = pcVal * pessoas;
      const realDia = p.saidasPeriodo / dias;
      const estoque = Math.max(0, p.entradasTot - p.saidasTot);
      const base    = realDia > 0 ? realDia : calcDia;
      const diasRest = base > 0 ? estoque / base : null;
      const diff    = realDia - calcDia;
      const varPct  = calcDia > 0 ? (diff / calcDia) * 100 : (realDia > 0 ? null : 0);
      return Object.assign({}, p, { pessoas, calcDia, realDia, estoque, diasRest, diff, varPct });
    })
    .filter(p => p.calcDia > 0 || p.realDia > 0 || p.estoque > 0)
    .sort((a, b) => a.casa.localeCompare(b.casa) ||
      ((b.varPct === null ? 999 : b.varPct) - (a.varPct === null ? 999 : a.varPct)));

    const f = (n, dec) => (n == null ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: (dec == null ? 2 : dec) }));

    // KPIs
    const nOk      = linhas.filter(p => p.varPct !== null && p.varPct <= 0).length;
    const nAtencao = linhas.filter(p => p.varPct !== null && p.varPct > 0 && p.varPct <= 20).length;
    const nCritico = linhas.filter(p => p.varPct === null || p.varPct > 20).length;
    const tile = (label, valor, cor) =>
      '<div class="card"><div class="card-body" style="padding:14px;">' +
      '<div style="font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase;">' + label + '</div>' +
      '<div style="font-size:24px;font-weight:800;color:' + cor + ';margin-top:4px;">' + valor + '</div>' +
      '</div></div>';
    kpis.innerHTML =
      tile('Produtos analisados', linhas.length, 'var(--text)') +
      tile('🟢 Dentro do calculado', nOk, 'var(--ok)') +
      tile('🟡 Até 20% acima', nAtencao, 'var(--warn)') +
      tile('🔴 Acima de 20%', nCritico, 'var(--danger)');

    if (!linhas.length) {
      tbody.innerHTML = '<tr><td colspan="11" class="text-muted" style="text-align:center;padding:40px;">Nenhuma movimentação encontrada para os filtros escolhidos.</td></tr>';
      return;
    }

    tbody.innerHTML = linhas.map(p => {
      let badge, corVar;
      if (p.varPct === null)   { badge = '🔴 s/ per capita';          corVar = 'var(--danger)'; }
      else if (p.varPct <= 0)  { badge = '🟢 ' + f(p.varPct, 0) + '%';  corVar = 'var(--ok)'; }
      else if (p.varPct <= 20) { badge = '🟡 +' + f(p.varPct, 0) + '%'; corVar = 'var(--warn)'; }
      else                     { badge = '🔴 +' + f(p.varPct, 0) + '%'; corVar = 'var(--danger)'; }
      const catDef = CATEGORIAS[p.catKey];
      return '<tr>' +
        '<td>' + p.casa + '</td>' +
        '<td>' + (catDef ? catDef.icon + ' ' + catDef.nome : p.catKey) + '</td>' +
        '<td>' + p.nome + '</td>' +
        '<td>' + p.unidade + '</td>' +
        '<td style="text-align:right;">' + p.pessoas + '</td>' +
        '<td style="text-align:right;font-family:monospace;">' + f(p.calcDia, 3) + '</td>' +
        '<td style="text-align:right;font-family:monospace;">' + f(p.realDia, 3) + '</td>' +
        '<td style="text-align:right;font-family:monospace;color:' + corVar + ';">' + (p.diff > 0 ? '+' : '') + f(p.diff, 3) + '</td>' +
        '<td style="text-align:center;font-weight:700;color:' + corVar + ';">' + badge + '</td>' +
        '<td style="text-align:right;font-family:monospace;">' + f(p.estoque) + '</td>' +
        '<td style="text-align:right;font-weight:700;">' + (p.diasRest == null ? '—' : f(p.diasRest, 0) + ' dias') + '</td>' +
        '</tr>';
    }).join('');
  } catch (e) {
    console.error('Erro em loadCalcReal:', e);
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:40px;color:var(--danger);">Erro ao analisar: ' + e.message + '</td></tr>';
  }
}
