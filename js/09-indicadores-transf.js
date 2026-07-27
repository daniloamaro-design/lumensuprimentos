// Extraído de index.html (indicadores + transferências) em 2026-07-27
// ─────────────────────────────────────────────
// 📊  INDICADORES
// ─────────────────────────────────────────────
let indCharts = {};
let indDataCache = null;

function initIndicadores() {
  // Período padrão: últimos 15 dias (quinzenal)
  const hoje = new Date();
  const quinzeDiasAtras = new Date();
  quinzeDiasAtras.setDate(hoje.getDate() - 15);
  document.getElementById('ind-de').value  = quinzeDiasAtras.toISOString().slice(0,10);
  document.getElementById('ind-ate').value = hoje.toISOString().slice(0,10);

  // Popula select de categoria dinamicamente
  populateCatSelect('ind-cat', true);

  // Popula selects de casa
  ['ind-casa','ind-evolucao-casa','transf-filter-casa'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const cur = el.value;
    const isAll = id !== 'ind-evolucao-casa';
    el.innerHTML = isAll ? '<option value="">Todas as casas</option>' : '<option value="">Total geral</option>';
    CASAS.forEach(c => {
      const o = document.createElement('option'); o.value = c; o.textContent = c;
      el.appendChild(o);
    });
    if (cur) el.value = cur;
  });
}

async function loadIndicadores() {
  setBtnLoading('btn-load-ind', true);
  const de   = document.getElementById('ind-de').value;
  const ate  = document.getElementById('ind-ate').value;
  const casa = document.getElementById('ind-casa').value;
  const cat  = document.getElementById('ind-cat').value;

  if (!de || !ate) { showToast('Selecione o período!'); setBtnLoading('btn-load-ind', false); return; }

  // Busca preços para calcular valor
  const pricesSnap = await db.collection('prices').get();
  const precos = {};
  pricesSnap.docs.forEach(d => {
    const p = d.data();
    const key = `${p.cat}__${p.prodId}`;
    if (!precos[key]) precos[key] = {};
    precos[key][p.city] = p.price;
  });

  // Busca movimentações no período
  let query = db.collection('movements')
    .where('date', '>=', de)
    .where('date', '<=', ate);
  if (casa) query = query.where('house', '==', casa);
  const snap = await query.get();

  // Busca transferências no período (sem filtrar status no Firestore para evitar índice composto)
  let transfQuery = db.collection('transferencias')
    .where('data', '>=', de)
    .where('data', '<=', ate);
  const transfSnapRaw = await transfQuery.get();
  // Filtra status e casa no cliente
  const transfSnap = { docs: transfSnapRaw.docs.filter(d => {
    const t = d.data();
    return t.status === 'confirmada' && (!casa || t.origem === casa || t.destino === casa);
  })};

  // Agrega dados por casa/produto
  const dados = {}; // { house: { catKey__prodId: { entradas, saidas, nome, unidade, catKey, prodId } } }

  snap.docs.forEach(d => {
    const m = d.data();
    if (!dados[m.house]) dados[m.house] = {};
    (m.items || []).forEach(item => {
      if (cat && item.catKey !== cat) return;
      const key = `${item.catKey}__${item.prodId}`;
      if (!dados[m.house][key]) dados[m.house][key] = { e: 0, s: 0, nome: nomeProdutoAtual(item.catKey, item.prodId, item.prodNome), unidade: item.unidade, catKey: item.catKey, prodId: item.prodId };
      if (m.type === 'entrada') dados[m.house][key].e += item.qty;
      else dados[m.house][key].s += item.qty;
    });
  });

  // Adiciona saídas de transferências
  transfSnap.docs.forEach(d => {
    const t = d.data();
    (t.items || []).forEach(item => {
      if (cat && item.catKey !== cat) return;
      const key = `${item.catKey}__${item.prodId}`;
      if (!dados[t.origem]) dados[t.origem] = {};
      if (!dados[t.origem][key]) dados[t.origem][key] = { e: 0, s: 0, nome: nomeProdutoAtual(item.catKey, item.prodId, item.prodNome), unidade: item.unidade, catKey: item.catKey, prodId: item.prodId };
      dados[t.origem][key].s += item.qty;
      // Adiciona entradas no destino
      if (!dados[t.destino]) dados[t.destino] = {};
      if (!dados[t.destino][key]) dados[t.destino][key] = { e: 0, s: 0, nome: nomeProdutoAtual(item.catKey, item.prodId, item.prodNome), unidade: item.unidade, catKey: item.catKey, prodId: item.prodId };
      dados[t.destino][key].e += item.qty;
    });
  });

  indDataCache = { dados, precos, de, ate };

  // Calcula totais por casa
  const rankingCasas = Object.entries(dados).map(([house, prods]) => {
    let valEntrada = 0, valSaida = 0, qtdEntrada = 0, qtdSaida = 0;
    const cidade = CASAS_CIDADES[house] || '';
    Object.values(prods).forEach(p => {
      const prKey = `${p.catKey}__${p.prodId}`;
      const preco = (precos[prKey] && precos[prKey][cidade]) || 0;
      valEntrada += p.e * preco;
      valSaida   += p.s * preco;
      qtdEntrada += p.e;
      qtdSaida   += p.s;
    });
    return { house, valEntrada, valSaida, qtdEntrada, qtdSaida, totalInvest: valEntrada };
  }).sort((a,b) => b.totalInvest - a.totalInvest);

  // Stats cards
  const totalEntrada = rankingCasas.reduce((a,c) => a + c.valEntrada, 0);
  const totalSaida   = rankingCasas.reduce((a,c) => a + c.valSaida, 0);
  const totalMovs    = snap.size;
  document.getElementById('ind-stats').innerHTML = `
    <div class="stat-card"><div class="stat-label">Valor Total Entradas</div><div class="stat-value ok" style="font-size:18px;font-family:monospace;">R$ ${totalEntrada.toFixed(2)}</div><div class="stat-desc">${de} → ${ate}</div></div>
    <div class="stat-card"><div class="stat-label">Valor Total Saídas</div><div class="stat-value warn" style="font-size:18px;font-family:monospace;">R$ ${totalSaida.toFixed(2)}</div></div>
    <div class="stat-card"><div class="stat-label">Saldo no Período</div><div class="stat-value" style="font-size:18px;font-family:monospace;color:${totalEntrada-totalSaida>=0?'var(--ok)':'var(--danger)'};">R$ ${(totalEntrada-totalSaida).toFixed(2)}</div></div>
    <div class="stat-card"><div class="stat-label">Movimentações</div><div class="stat-value">${totalMovs}</div></div>
    <div class="stat-card"><div class="stat-label">Casas com movimento</div><div class="stat-value">${rankingCasas.length}</div></div>`;

  // Ranking
  const rankEl = document.getElementById('ind-ranking');
  if (rankingCasas.length === 0) {
    rankEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div><div class="empty-state-title">Nenhuma movimentação no período</div></div>';
  } else {
    const maxVal = rankingCasas[0].totalInvest || 1;
    rankEl.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr>
        <th style="padding:10px 14px;text-align:left;border-bottom:1px solid var(--border);font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">#</th>
        <th style="padding:10px 14px;text-align:left;border-bottom:1px solid var(--border);font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Casa</th>
        <th style="padding:10px 14px;border-bottom:1px solid var(--border);font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Proporção</th>
        <th style="padding:10px 14px;text-align:right;border-bottom:1px solid var(--border);font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Valor Entrada</th>
        <th style="padding:10px 14px;text-align:right;border-bottom:1px solid var(--border);font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Valor Saída</th>
        <th style="padding:10px 14px;text-align:right;border-bottom:1px solid var(--border);font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Saldo</th>
      </tr></thead>
      <tbody>
      ${rankingCasas.map((c, i) => {
        const pct = maxVal > 0 ? (c.totalInvest / maxVal * 100).toFixed(0) : 0;
        const saldo = c.valEntrada - c.valSaida;
        return `<tr style="${i===0?'background:var(--ok-bg);':''}">
          <td style="padding:11px 14px;border-bottom:1px solid var(--border);font-weight:700;color:var(--text-muted);">${i+1}</td>
          <td style="padding:11px 14px;border-bottom:1px solid var(--border);font-weight:600;">${c.house}</td>
          <td style="padding:11px 14px;border-bottom:1px solid var(--border);">
            <div style="display:flex;align-items:center;gap:8px;">
              <div style="flex:1;height:8px;background:var(--border);border-radius:4px;overflow:hidden;">
                <div style="height:100%;width:${pct}%;background:var(--lumen);border-radius:4px;"></div>
              </div>
              <span style="font-size:11px;color:var(--text-muted);min-width:32px;">${pct}%</span>
            </div>
          </td>
          <td style="padding:11px 14px;border-bottom:1px solid var(--border);text-align:right;font-family:monospace;font-weight:600;color:var(--ok);">R$ ${c.valEntrada.toFixed(2)}</td>
          <td style="padding:11px 14px;border-bottom:1px solid var(--border);text-align:right;font-family:monospace;font-weight:600;color:var(--warn);">R$ ${c.valSaida.toFixed(2)}</td>
          <td style="padding:11px 14px;border-bottom:1px solid var(--border);text-align:right;font-family:monospace;font-weight:700;color:${saldo>=0?'var(--ok)':'var(--danger)'};">R$ ${saldo.toFixed(2)}</td>
        </tr>`;
      }).join('')}
      </tbody>
    </table>`;
  }

  // Tabela detalhada
  const rows = [];
  Object.entries(dados).forEach(([house, prods]) => {
    const cidade = CASAS_CIDADES[house] || '';
    Object.values(prods).forEach(p => {
      if (cat && p.catKey !== cat) return;
      const prKey = `${p.catKey}__${p.prodId}`;
      const preco = (precos[prKey] && precos[prKey][cidade]) || 0;
      rows.push({ house, ...p, valE: p.e * preco, valS: p.s * preco, saldo: p.e - p.s });
    });
  });
  rows.sort((a,b) => b.valE - a.valE);

  const tbody = document.getElementById('ind-tbody');
  tbody.innerHTML = rows.length === 0
    ? '<tr><td colspan="9" class="text-muted" style="text-align:center;padding:32px;">Nenhum dado no período.</td></tr>'
    : rows.map(r => `<tr>
        <td>${r.house}</td>
        <td>${CATEGORIAS[r.catKey]?.icon} ${CATEGORIAS[r.catKey]?.nome}</td>
        <td>${r.nome}</td>
        <td style="color:var(--ok);font-weight:600;">${r.e.toFixed(2)}</td>
        <td style="color:var(--warn);font-weight:600;">${r.s.toFixed(2)}</td>
        <td style="font-weight:700;color:${r.saldo>=0?'var(--ok)':'var(--danger)'};">${r.saldo.toFixed(2)}</td>
        <td style="font-family:monospace;font-size:12px;color:var(--ok);">R$ ${r.valE.toFixed(2)}</td>
        <td style="font-family:monospace;font-size:12px;color:var(--warn);">R$ ${r.valS.toFixed(2)}</td>
        <td class="text-muted">${r.unidade}</td>
      </tr>`).join('');

  // Charts
  renderIndicadoresCharts(rankingCasas, dados);

  // Popula select de evolução
  const evSel = document.getElementById('ind-evolucao-casa');
  const curEv = evSel.value;
  evSel.innerHTML = '<option value="">Total geral</option>';
  rankingCasas.forEach(c => {
    const o = document.createElement('option'); o.value = c.house; o.textContent = c.house;
    evSel.appendChild(o);
  });
  if (curEv) evSel.value = curEv;

  await renderEvolucaoChart();
  setBtnLoading('btn-load-ind', false);
}

function renderIndicadoresCharts(ranking, dados) {
  // Entradas vs Saídas por casa (top 8)
  const top = ranking.slice(0, 8);
  const ctx1 = document.getElementById('chart-ent-sai');
  if (indCharts.entSai) indCharts.entSai.destroy();
  indCharts.entSai = new Chart(ctx1, {
    type: 'bar',
    data: {
      labels: top.map(c => c.house.length > 12 ? c.house.slice(0,12)+'…' : c.house),
      datasets: [
        { label: 'Entradas (R$)', data: top.map(c => c.valEntrada.toFixed(2)), backgroundColor: '#1A7A44', borderRadius: 4 },
        { label: 'Saídas (R$)',   data: top.map(c => c.valSaida.toFixed(2)),   backgroundColor: '#D4890A', borderRadius: 4 }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } }, scales: { y: { beginAtZero: true } } }
  });

  // Por categoria — todos os 5 grupos
  const catTotais = {};
  Object.values(dados).forEach(prods => {
    Object.values(prods).forEach(p => {
      if (!catTotais[p.catKey]) catTotais[p.catKey] = 0;
      catTotais[p.catKey] += p.e;
    });
  });
  // Build labels/data/colors from CATEGORIAS (dynamic — works for all categories)
  const catKeys   = Object.keys(CATEGORIAS);
  const catLabels = catKeys.map(k => CATEGORIAS[k].icon + ' ' + CATEGORIAS[k].nome);
  const catColors = ['#1B3A6B','#D4890A','#C0392B','#7C3AED','#16A34A'];
  const catData   = catKeys.map(k => catTotais[k] || 0);
  const ctx2 = document.getElementById('chart-cat');
  if (indCharts.cat) indCharts.cat.destroy();
  indCharts.cat = new Chart(ctx2, {
    type: 'doughnut',
    data: {
      labels: catLabels,
      datasets: [{ data: catData, backgroundColor: catColors, borderWidth: 2, borderColor: '#fff' }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { font: { size: 12 }, padding: 12 } },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              const total = ctx.dataset.data.reduce((a,b)=>a+b,0);
              const pct = total > 0 ? ((ctx.parsed/total)*100).toFixed(1) : 0;
              return ` ${ctx.label}: ${ctx.parsed.toFixed(0)} un. (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

async function renderEvolucaoChart() {
  const casaSel = document.getElementById('ind-evolucao-casa')?.value || '';

  // Últimos 6 meses
  const meses = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    meses.push(d.toISOString().slice(0,7));
  }

  const valoresPorMes = await Promise.all(meses.map(async (mes) => {
    const de = `${mes}-01`;
    const ate = `${mes}-31`;
    let q = db.collection('movements').where('date','>=',de).where('date','<=',ate);
    if (casaSel) q = q.where('house','==',casaSel);
    const snap = await q.get();

    const pricesSnap = await db.collection('prices').get();
    const precos = {};
    pricesSnap.docs.forEach(d => {
      const p = d.data();
      precos[`${p.cat}__${p.prodId}`] = precos[`${p.cat}__${p.prodId}`] || {};
      precos[`${p.cat}__${p.prodId}`][p.city] = p.price;
    });

    let totalE = 0;
    snap.docs.forEach(d => {
      const m = d.data();
      if (m.type !== 'entrada') return;
      const cidade = CASAS_CIDADES[m.house] || '';
      (m.items||[]).forEach(item => {
        const preco = precos[`${item.catKey}__${item.prodId}`]?.[cidade] || 0;
        totalE += item.qty * preco;
      });
    });
    return totalE;
  }));

  const ctx = document.getElementById('chart-evolucao');
  if (indCharts.evolucao) indCharts.evolucao.destroy();
  indCharts.evolucao = new Chart(ctx, {
    type: 'line',
    data: {
      labels: meses.map(m => { const [y,mo] = m.split('-'); return `${mo}/${y.slice(2)}`; }),
      datasets: [{
        label: casaSel ? casaSel : 'Total Geral',
        data: valoresPorMes.map(v => v.toFixed(2)),
        borderColor: '#003875', backgroundColor: 'rgba(0,56,117,0.08)',
        fill: true, tension: 0.3, pointRadius: 5, pointBackgroundColor: '#003875'
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });
}

function exportIndicadoresCSV() {
  if (!indDataCache) { showToast('Carregue os indicadores primeiro!'); return; }
  const { dados, precos } = indDataCache;
  const header = 'Casa,Categoria,Produto,Qtd Entrada,Qtd Saída,Saldo,Valor Entrada (R$),Valor Saída (R$),Unidade\n';
  const rows = [];
  Object.entries(dados).forEach(([house, prods]) => {
    const cidade = CASAS_CIDADES[house] || '';
    Object.values(prods).forEach(p => {
      const preco = precos[`${p.catKey}__${p.prodId}`]?.[cidade] || 0;
      rows.push(`"${house}","${CATEGORIAS[p.catKey]?.nome}","${p.nome}",${p.e.toFixed(2)},${p.s.toFixed(2)},${(p.e-p.s).toFixed(2)},${(p.e*preco).toFixed(2)},${(p.s*preco).toFixed(2)},"${p.unidade}"`);
    });
  });
  const blob = new Blob([header + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = `LM-Indicadores-${indDataCache.de}-${indDataCache.ate}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────
// 🔄  TRANSFERÊNCIAS
// ─────────────────────────────────────────────
let transfCat   = 'cereal';
let transfItems = { cereal: {}, higiene: {}, proteina: {}, missa_sf: {}, lanches_csl: {} };
let origemStockCache = {};

async function initTransferencias() {
  // Popula selects de casa
  ['transf-origem','transf-destino','transf-filter-casa'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const cur = el.value;
    const isFilter = id === 'transf-filter-casa';
    el.innerHTML = isFilter ? '<option value="">Todas as casas</option>' : '<option value="">Selecione...</option>';
    CASAS.forEach(c => {
      const o = document.createElement('option'); o.value = c; o.textContent = c;
      el.appendChild(o);
    });
    if (cur) el.value = cur;
  });

  document.getElementById('transf-data').value = new Date().toISOString().slice(0,10);

  // Mostra/esconde seção de nova transferência baseado em role
  const isAdmin = ['admin','diretor','gerente','coordenador'].includes(currentUserData.role);
  document.getElementById('transf-nova-card').style.display = isAdmin ? 'block' : 'none';

  loadTransferencias();
}

async function onTransfOrigemChange() {
  const house = document.getElementById('transf-origem').value;
  if (!house) return;

  // Carrega estoque atual da casa de origem
  origemStockCache = {};
  const snap = await db.collection('movements').where('house','==',house).get();
  snap.docs.forEach(d => {
    const m = d.data();
    (m.items||[]).forEach(item => {
      const key = `${item.catKey}__${item.prodId}`;
      if (!origemStockCache[key]) origemStockCache[key] = 0;
      if (m.type === 'entrada') origemStockCache[key] += item.qty;
      else origemStockCache[key] -= item.qty;
    });
  });

  // Também considera transferências saindo dessa casa
  const transfSnap = await db.collection('transferencias').where('origem','==',house).where('status','==','confirmada').get();
  transfSnap.docs.forEach(d => {
    (d.data().items||[]).forEach(item => {
      const key = `${item.catKey}__${item.prodId}`;
      if (!origemStockCache[key]) origemStockCache[key] = 0;
      origemStockCache[key] -= item.qty;
    });
  });

  document.getElementById('transf-stock-info').style.display = 'block';
  renderTransfProducts();
}

function setTransfCat(cat) {
  transfCat = cat;
  // Regenera abas de transferência
  const ttEl = document.getElementById('transf-cat-tabs');
  if (ttEl) {
    ttEl.innerHTML = Object.entries(CATEGORIAS).map(([k,c]) => `
      <button class="cat-tab ${k===cat?'active':''}" data-cat="${k}" onclick="setTransfCat('${k}')">
        ${c.icon} ${c.nome} <span class="cat-count" id="tc-${k}"></span>
      </button>`).join('');
  }
  document.querySelectorAll('#transf-cat-tabs .cat-tab').forEach(t => t.classList.toggle('active', t.dataset.cat === cat));
  const info = CATEGORIAS[cat];
  document.getElementById('transf-cat-header').querySelector('.card-header-title').textContent = `${info.icon} ${info.nome}`;
  renderTransfProducts();
}

function renderTransfProducts() {
  const house = document.getElementById('transf-origem').value;
  if (!house) {
    document.getElementById('transf-products-list').innerHTML = '<div class="empty-state" style="padding:24px;"><div class="empty-state-icon">🏠</div><div class="empty-state-title">Selecione a casa de origem primeiro</div></div>';
    return;
  }

  const prods = CATEGORIAS[transfCat].produtos;
  const el = document.getElementById('transf-products-list');

  el.innerHTML = prods.map(p => {
    const isChecked = transfItems[transfCat][p.id] !== undefined;
    const qty = transfItems[transfCat][p.id] || '';
    const estoque = origemStockCache[`${transfCat}__${p.id}`] || 0;
    const stockColor = estoque <= 0 ? 'color:var(--danger);' : estoque < 5 ? 'color:var(--warn);' : 'color:var(--ok);';

    return `<div class="prod-row" onclick="toggleTransfItem(event,'${transfCat}','${p.id}')">
      <div class="prod-checkbox ${isChecked ? 'checked' : ''}"></div>
      <div class="prod-name">${p.nome}</div>
      <span class="prod-unit">${p.unidade}</span>
      <span style="font-size:12px;min-width:90px;text-align:right;${stockColor}">Estoque: ${estoque.toFixed(1)}</span>
      ${isChecked
        ? `<input class="prod-qty-input" type="number" min="0.1" step="0.1" max="${estoque}" value="${qty}"
             onclick="event.stopPropagation()"
             onchange="setTransfQty('${transfCat}','${p.id}',this.value)"
             placeholder="Qtd" style="width:80px;">`
        : '<span style="width:80px;"></span>'
      }
    </div>`;
  }).join('');

  updateTransfSummary();
}

function toggleTransfItem(event, cat, prodId) {
  if (event.target.tagName === 'INPUT') return;
  if (transfItems[cat][prodId] !== undefined) {
    delete transfItems[cat][prodId];
  } else {
    transfItems[cat][prodId] = 1;
  }
  renderTransfProducts();
}

function setTransfQty(cat, prodId, val) {
  transfItems[cat][prodId] = parseFloat(val) || 0;
  updateTransfSummary();
}

function updateTransfSummary() {
  let total = 0;
  Object.values(transfItems).forEach(c => { total += Object.keys(c).length; });
  document.getElementById('transf-total-summary').textContent = `${total} item(s) selecionado(s)`;
  document.getElementById('btn-confirmar-transf').disabled = total === 0;
  Object.entries(CATEGORIAS).forEach(([k]) => {
    const count = Object.keys(transfItems[k]||{}).length;
    const el = document.getElementById(`tc-${k}`);
    if (el) el.textContent = count > 0 ? count : '';
  });
}

function clearTransferencia() {
  transfItems = { cereal: {}, higiene: {}, proteina: {}, missa_sf: {}, lanches_csl: {} };
  origemStockCache = {};
  document.getElementById('transf-origem').value = '';
  document.getElementById('transf-destino').value = '';
  document.getElementById('transf-obs').value = '';
  document.getElementById('transf-data').value = new Date().toISOString().slice(0,10);
  document.getElementById('transf-stock-info').style.display = 'none';
  renderTransfProducts();
}

async function confirmarTransferencia() {
  const origem  = document.getElementById('transf-origem').value;
  const destino = document.getElementById('transf-destino').value;
  const data    = document.getElementById('transf-data').value;
  const obs     = document.getElementById('transf-obs').value;

  if (!origem)  { showToast('Selecione a casa de origem!'); return; }
  if (!destino) { showToast('Selecione a casa de destino!'); return; }
  if (origem === destino) { showToast('Origem e destino não podem ser iguais!'); return; }
  if (!data)    { showToast('Informe a data!'); return; }

  let totalItens = 0;
  Object.values(transfItems).forEach(c => { totalItens += Object.keys(c).length; });
  if (totalItens === 0) { showToast('Adicione ao menos um item!'); return; }

  setBtnLoading('btn-confirmar-transf', true);

  // Monta lista de itens
  const itensList = [];
  Object.entries(transfItems).forEach(([catKey, prods]) => {
    Object.entries(prods).forEach(([prodId, qty]) => {
      if (qty <= 0) return;
      const p = CATEGORIAS[catKey].produtos.find(x => x.id === prodId);
      if (p) itensList.push({ catKey, prodId, prodNome: p.nome, unidade: p.unidade, qty });
    });
  });

  // Gera código
  const dateStr = data.replace(/-/g,'');
  const snap = await db.collection('transferencias').where('dateStr','==',dateStr).get();
  const seq = String(snap.size + 1).padStart(3,'0');
  const code = `OB-LT-${dateStr}-${seq}`;

  const transfData = {
    code, dateStr, data, origem, destino, obs,
    items: itensList,
    status: 'confirmada',
    registradoPor: currentUserData.name,
    registradoPorUid: currentUser.uid,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    const batch = db.batch();

    // Salva transferência
    const transfRef = db.collection('transferencias').doc();
    batch.set(transfRef, transfData);

    // Cria movimento de SAÍDA na origem
    const saidaRef = db.collection('movements').doc();
    batch.set(saidaRef, {
      code: `${code}-SAI`,
      house: origem, type: 'saida', date: data, dateStr,
      items: itensList,
      obs: `Transferência ${code} → ${destino}`,
      registeredBy: currentUserData.name,
      registeredUid: currentUser.uid,
      isTransferencia: true,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Cria movimento de ENTRADA no destino
    const entradaRef = db.collection('movements').doc();
    batch.set(entradaRef, {
      code: `${code}-ENT`,
      house: destino, type: 'entrada', date: data, dateStr,
      items: itensList,
      obs: `Transferência ${code} ← ${origem}`,
      registeredBy: currentUserData.name,
      registeredUid: currentUser.uid,
      isTransferencia: true,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();

    clearTransferencia();
    showToast(`✅ Transferência ${code} confirmada! Estoque atualizado em ${origem} e ${destino}.`);
    loadTransferencias();
  } catch(e) {
    console.error(e);
    showToast('Erro: ' + e.message);
  }
  setBtnLoading('btn-confirmar-transf', false);
}

async function loadTransferencias() {
  const tbody    = document.getElementById('transf-tbody');
  const filterCasa = document.getElementById('transf-filter-casa')?.value || '';

  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;"><div class="loading-state"><div class="spinner spinner-dark"></div></div></td></tr>';

  let query = db.collection('transferencias').orderBy('createdAt','desc');
  const snap = await query.get();
  let docs = snap.docs;
  if (filterCasa) {
    docs = docs.filter(d => d.data().origem === filterCasa || d.data().destino === filterCasa);
  }

  transfDocsAll = docs.map(d => ({ id: d.id, ...d.data() }));
  transfPage = 1;
  transfSelecionadas.clear();
  updateTransfExportBtn();
  renderTransfPage();
}

// ── Paginação do histórico de transferências (30 em 30, mais recente primeiro) ──
let transfDocsAll = [];
let transfPage = 1;
const TRANSF_PAGE_SIZE = 30;
let _transfDetailAtual = null;
let transfSelecionadas = new Set();
const TRANSF_CANCEL_ROLES = ['admin','diretor','gerente','coordenador'];

function transfTotalPages() {
  return Math.max(1, Math.ceil((transfDocsAll || []).length / TRANSF_PAGE_SIZE));
}

function transfGoToPage(p) {
  const max = transfTotalPages();
  transfPage = Math.min(Math.max(1, p), max);
  renderTransfPage();
}

function renderTransfPage() {
  const tbody   = document.getElementById('transf-tbody');
  const pagWrap = document.getElementById('transf-pagination');

  if (transfDocsAll.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-muted" style="text-align:center;padding:32px;">Nenhuma transferência registrada ainda.</td></tr>';
    pagWrap.style.display = 'none';
    return;
  }

  const totalPages = transfTotalPages();
  if (transfPage > totalPages) transfPage = totalPages;
  const start = (transfPage - 1) * TRANSF_PAGE_SIZE;
  const pageDocs = transfDocsAll.slice(start, start + TRANSF_PAGE_SIZE);

  tbody.innerHTML = pageDocs.map(t => {
    const cancelada = t.status === 'cancelada';
    let statusBadge;
    if (cancelada) {
      statusBadge = `<span class="badge badge-danger">🚫 Cancelada</span>`;
    } else if (t.recebido) {
      statusBadge = `<span class="badge badge-ok">✅ Recebida</span>`;
    } else {
      statusBadge = `<span class="badge badge-warn">⏳ Aguardando</span>`;
    }
    const podeCancelar = !cancelada && TRANSF_CANCEL_ROLES.includes(currentUserData.role);
    return `<tr>
      <td><input type="checkbox" class="transf-row-check" data-id="${t.id}" ${transfSelecionadas.has(t.id) ? 'checked' : ''} onchange="transfToggleCheck('${t.id}', this.checked)"></td>
      <td><span class="order-code">${t.code}</span></td>
      <td class="text-muted text-sm">${t.data || '—'}</td>
      <td><strong>${t.origem}</strong></td>
      <td><strong>${t.destino}</strong></td>
      <td>${(t.items||[]).length} item(s)</td>
      <td class="text-muted">${t.registradoPor || '—'}</td>
      <td>${statusBadge}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="btn btn-secondary btn-sm" onclick="showTransfDetail('${t.id}')">Ver</button>
        ${!cancelada && !t.recebido && (t.destino === currentUserData.house || TRANSF_CANCEL_ROLES.includes(currentUserData.role)) ? `<button class="btn btn-outline btn-sm" style="color:var(--ok);border-color:var(--ok);" onclick="confirmarRecebimentoTransf('${t.id}')">✔ Recebido</button>` : ''}
        ${podeCancelar ? `<button class="btn btn-outline btn-sm" style="color:var(--danger);border-color:var(--danger);" onclick="cancelarTransferencia('${t.id}')">🗑️ Excluir</button>` : ''}
      </td>
    </tr>`;
  }).join('');

  const headerCheck = document.getElementById('transf-check-all');
  if (headerCheck) headerCheck.checked = pageDocs.length > 0 && pageDocs.every(t => transfSelecionadas.has(t.id));

  pagWrap.style.display = 'flex';
  document.getElementById('transf-pag-info').textContent =
    `Mostrando ${start + 1}–${Math.min(start + TRANSF_PAGE_SIZE, transfDocsAll.length)} de ${transfDocsAll.length}`;
  document.getElementById('transf-pag-pages').textContent = `Página ${transfPage} de ${totalPages}`;
  document.getElementById('transf-pag-first').disabled = transfPage === 1;
  document.getElementById('transf-pag-prev').disabled  = transfPage === 1;
  document.getElementById('transf-pag-next').disabled  = transfPage === totalPages;
  document.getElementById('transf-pag-last').disabled  = transfPage === totalPages;
}

// ── Seleção múltipla para exportação de PDF em lote ──
function transfToggleCheck(docId, checked) {
  if (checked) transfSelecionadas.add(docId); else transfSelecionadas.delete(docId);
  updateTransfExportBtn();
  const pageDocs = transfDocsAll.slice((transfPage-1)*TRANSF_PAGE_SIZE, (transfPage-1)*TRANSF_PAGE_SIZE + TRANSF_PAGE_SIZE);
  const headerCheck = document.getElementById('transf-check-all');
  if (headerCheck) headerCheck.checked = pageDocs.length > 0 && pageDocs.every(t => transfSelecionadas.has(t.id));
}

function transfToggleAll(checked) {
  const start = (transfPage - 1) * TRANSF_PAGE_SIZE;
  const pageDocs = transfDocsAll.slice(start, start + TRANSF_PAGE_SIZE);
  pageDocs.forEach(t => { if (checked) transfSelecionadas.add(t.id); else transfSelecionadas.delete(t.id); });
  document.querySelectorAll('.transf-row-check').forEach(cb => { cb.checked = checked; });
  updateTransfExportBtn();
}

function updateTransfExportBtn() {
  const btn = document.getElementById('btn-transf-export-pdf');
  if (!btn) return;
  const n = transfSelecionadas.size;
  btn.textContent = `📄 Exportar PDF (${n})`;
  btn.disabled = n === 0;
}

// ── Cancelamento de transferência (estorno de estoque, mantém histórico) ──
async function cancelarTransferencia(docId) {
  const t = transfDocsAll.find(x => x.id === docId);
  if (!t) { showToast('Transferência não encontrada.'); return; }
  if (!TRANSF_CANCEL_ROLES.includes(currentUserData.role)) { showToast('Você não tem permissão para cancelar transferências.'); return; }

  const avisoRecebida = t.recebido
    ? '\n\n⚠️ Esta transferência já foi marcada como RECEBIDA. Se os itens já foram usados/redistribuídos na casa de destino, cancelar aqui vai corrigir o estoque no sistema, mas não desfaz o que já aconteceu fisicamente.'
    : '';
  if (!confirm(`Cancelar a transferência ${t.code}?\n\nOs itens voltarão ao estoque de ${t.origem} e serão removidos do estoque de ${t.destino}. Esta ação fica registrada no histórico.${avisoRecebida}`)) return;

  try {
    const batch = db.batch();

    // Movimento de ESTORNO: devolve o estoque para a origem
    const estornoOrigemRef = db.collection('movements').doc();
    batch.set(estornoOrigemRef, {
      code: `${t.code}-EST-ENT`,
      house: t.origem, type: 'entrada', date: new Date().toISOString().slice(0,10), dateStr: new Date().toISOString().slice(0,10).replace(/-/g,''),
      items: t.items || [],
      obs: `Estorno da transferência cancelada ${t.code} (→ ${t.destino})`,
      registeredBy: currentUserData.name,
      registeredUid: currentUser.uid,
      isTransferencia: true,
      isEstorno: true,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Movimento de ESTORNO: remove o estoque do destino
    const estornoDestinoRef = db.collection('movements').doc();
    batch.set(estornoDestinoRef, {
      code: `${t.code}-EST-SAI`,
      house: t.destino, type: 'saida', date: new Date().toISOString().slice(0,10), dateStr: new Date().toISOString().slice(0,10).replace(/-/g,''),
      items: t.items || [],
      obs: `Estorno da transferência cancelada ${t.code} (← ${t.origem})`,
      registeredBy: currentUserData.name,
      registeredUid: currentUser.uid,
      isTransferencia: true,
      isEstorno: true,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Marca a transferência original como cancelada (não apaga o registro)
    const transfRef = db.collection('transferencias').doc(docId);
    batch.update(transfRef, {
      status: 'cancelada',
      canceladoEm: firebase.firestore.FieldValue.serverTimestamp(),
      canceladoPor: currentUserData.name || '',
      canceladoPorUid: currentUser.uid
    });

    await batch.commit();

    if (typeof registrarAuditoria === 'function') {
      registrarAuditoria('transferencias', docId, 'transferencia_cancelada', `Transferência ${t.code} cancelada e estornada`);
    }

    transfSelecionadas.delete(docId);
    showToast(`✅ Transferência ${t.code} cancelada. Estoque estornado.`);
    loadTransferencias();
  } catch(e) {
    console.error(e);
    showToast('Erro ao cancelar: ' + e.message);
  }
}

async function showTransfDetail(docId) {
  const snap = await db.collection('transferencias').doc(docId).get();
  if (!snap.exists) { showToast('Transferência não encontrada.'); return; }
  const t = snap.data();
  _transfDetailAtual = { docId, ...t };
  document.getElementById('modal-transf-title').textContent = t.code;

  // Fallback: registros antigos podem não ter o nome salvo, só o UID
  let registradoPorNome = t.registradoPor || '';
  if (!registradoPorNome && t.registradoPorUid) {
    try {
      const uSnap = await db.collection('users').doc(t.registradoPorUid).get();
      if (uSnap.exists) registradoPorNome = uSnap.data().name || '';
    } catch(e) { console.warn('Erro ao buscar usuário:', e); }
  }
  _transfDetailAtual.registradoPorResolvido = registradoPorNome;

  let itemsHTML = '';
  const cats = {};
  (t.items||[]).forEach(item => {
    if (!cats[item.catKey]) cats[item.catKey] = [];
    cats[item.catKey].push(item);
  });
  Object.entries(cats).forEach(([catKey, items]) => {
    const cat = CATEGORIAS[catKey];
    itemsHTML += `<div style="margin-bottom:12px;">
      <div style="font-weight:700;font-size:13px;color:var(--lumen);background:var(--lumen-lt);padding:6px 10px;border-radius:6px;margin-bottom:6px;">${cat?.icon} ${cat?.nome}</div>
      ${items.map(i => `<div style="display:flex;justify-content:space-between;padding:6px 10px;border-bottom:1px solid var(--border);">
        <span>${i.prodNome}</span>
        <span style="font-weight:700;color:var(--lumen);">${i.qty} ${i.unidade}</span>
      </div>`).join('')}
    </div>`;
  });

  document.getElementById('modal-transf-body').innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
      <span class="badge badge-info">📅 ${t.data}</span>
      <span class="badge badge-gray">Por: ${registradoPorNome || '—'}</span>
    </div>
    <div class="rota-box" style="margin-bottom:16px;display:flex;gap:16px;align-items:center;">
      <div><div style="font-size:10px;text-transform:uppercase;color:var(--text-muted);margin-bottom:2px;">Fornecedor (origem)</div><div style="font-weight:700;">${t.origem}</div></div>
      <span style="color:var(--text-muted);">→</span>
      <div><div style="font-size:10px;text-transform:uppercase;color:var(--text-muted);margin-bottom:2px;">Destinatário</div><div style="font-weight:700;">${t.destino}</div></div>
    </div>
    ${t.obs ? `<div class="info-box" style="margin-bottom:16px;"><strong>Obs:</strong> ${t.obs}</div>` : ''}
    ${itemsHTML}`;

  const btnPdf = document.getElementById('btn-transf-pdf');
  if (btnPdf) btnPdf.style.display = '';

  openModal('modal-transf-detail');
}

// ── Gera PDF da transferência exibida no modal-transf-detail ──
// Resolve o nome de quem registrou (fallback pelo UID para registros antigos)
async function resolverRegistradoPorTransf(t) {
  let registradoPorNome = t.registradoPor || t.registradoPorResolvido || '';
  if (!registradoPorNome && t.registradoPorUid) {
    try {
      const uSnap = await db.collection('users').doc(t.registradoPorUid).get();
      if (uSnap.exists) registradoPorNome = uSnap.data().name || '';
    } catch(e) { console.warn('Erro ao buscar usuário:', e); }
  }
  return registradoPorNome;
}

// Desenha o conteúdo de UMA transferência na página atual do doc jsPDF (sem numerar rodapé nem salvar).
// Reutilizada tanto no PDF individual quanto no PDF em lote (1 transferência = 1 página, ou mais se a lista de itens for longa).
function desenharTransferenciaNoPDF(doc, t, registradoPorNome) {
  const blue = [0, 56, 117];
  const gray = [107, 114, 128];

  // Header
  doc.setFillColor(...blue);
  doc.rect(0, 0, 210, 30, 'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(15); doc.setFont('helvetica','bold');
  doc.text('Lumen Estoque — Transferência entre Casas', 14, 13);
  doc.setFontSize(9); doc.setFont('helvetica','normal');
  doc.text(`Código: ${t.code}   |   Data: ${t.data || '—'}`, 14, 21);
  doc.text(`Registrado por: ${registradoPorNome || '—'}`, 14, 27);

  let y = 42;
  doc.setTextColor(0,0,0);

  // Bloco Fornecedor / Destinatário (sem caractere de seta — Helvetica do jsPDF não
  // renderiza "→" corretamente, por isso aparecia como "!'" no PDF anterior)
  const colW = 86;
  const leftX = 14, rightX = 14 + colW + 14;
  doc.setFillColor(245,247,250);
  doc.roundedRect(leftX, y-6, colW, 20, 2, 2, 'F');
  doc.roundedRect(rightX, y-6, colW, 20, 2, 2, 'F');
  doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(...gray);
  doc.text('FORNECEDOR (ORIGEM)', leftX + 4, y);
  doc.text('DESTINATÁRIO', rightX + 4, y);
  doc.setFontSize(12); doc.setFont('helvetica','bold'); doc.setTextColor(...blue);
  doc.text(t.origem || '—', leftX + 4, y + 8);
  doc.text(t.destino || '—', rightX + 4, y + 8);

  // Seta desenhada (vetor), não caractere de fonte
  const midX = leftX + colW + 7;
  doc.setDrawColor(...blue); doc.setLineWidth(0.8);
  doc.line(midX - 4, y + 1, midX + 4, y + 1);
  doc.triangle(midX + 4, y - 1.5, midX + 4, y + 3.5, midX + 7, y + 1, 'F');

  y += 22;

  if (t.obs) {
    doc.setFontSize(9); doc.setFont('helvetica','italic'); doc.setTextColor(...gray);
    doc.text(`Obs: ${t.obs}`, 14, y);
    y += 8;
  }
  y += 2;

  const cats = {};
  (t.items||[]).forEach(item => {
    if (!cats[item.catKey]) cats[item.catKey] = [];
    cats[item.catKey].push(item);
  });

  Object.entries(cats).forEach(([catKey, items]) => {
    const cat = CATEGORIAS[catKey];
    if (y > 250) { doc.addPage(); y = 20; }

    doc.setFillColor(...blue);
    doc.rect(12, y-5, 186, 9, 'F');
    doc.setTextColor(255,255,255);
    doc.setFontSize(10); doc.setFont('helvetica','bold');
    doc.text(`${cat?.nome || catKey}`, 16, y+1);
    y += 11;

    doc.setFillColor(230,238,248);
    doc.rect(12, y-4, 186, 8, 'F');
    doc.setTextColor(...gray);
    doc.setFontSize(8); doc.setFont('helvetica','bold');
    doc.text('PRODUTO', 16, y+1);
    doc.text('QUANTIDADE', 160, y+1);
    y += 8;

    items.forEach((i, idx) => {
      if (y > 270) { doc.addPage(); y = 20; }
      if (idx % 2 === 0) { doc.setFillColor(250,251,252); doc.rect(12, y-4, 186, 8, 'F'); }
      doc.setTextColor(0,0,0); doc.setFont('helvetica','normal'); doc.setFontSize(9);
      doc.text(i.prodNome, 16, y+1);
      doc.setFont('helvetica','bold'); doc.setTextColor(...blue);
      doc.text(`${i.qty} ${i.unidade}`, 160, y+1);
      y += 8;
    });
    y += 6;
  });

  // Bloco de assinatura de recebimento — só uma vez, no final do documento inteiro
  // (não em cada página). Verifica espaço antes de desenhar pra não sobrepor a
  // tabela de itens quando a transferência tem muitos produtos.
  if (y > 240) { doc.addPage(); y = 20; }
  y += 14;
  doc.setDrawColor(180,180,180); doc.setLineWidth(0.3);
  doc.line(14, y, 110, y);
  doc.setFontSize(8); doc.setTextColor(...gray); doc.setFont('helvetica','normal');
  doc.text('Assinatura de quem recebeu', 14, y + 5);

  y += 18;
  doc.setFontSize(10); doc.setTextColor(0,0,0); doc.setFont('helvetica','normal');
  doc.text('(   ) Coordenador(a)', 14, y);
  doc.text('(   ) Ponto de Luz', 84, y);
  doc.text('(   ) Acolhido(a)', 150, y);
}

// ── PDF de UMA transferência (chamado a partir do modal de detalhe) ──
async function gerarPDFTransferencia() {
  const t = _transfDetailAtual;
  if (!t) { showToast('Nenhuma transferência carregada.'); return; }

  const registradoPorNome = await resolverRegistradoPorTransf(t);

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  desenharTransferenciaNoPDF(doc, t, registradoPorNome);

  // Footer
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setTextColor(150,150,150);
    doc.text(`Lumen Estoque — Página ${i} de ${pageCount}`, 14, doc.internal.pageSize.height - 8);
    doc.text(new Date().toLocaleString('pt-BR'), 140, doc.internal.pageSize.height - 8);
  }

  // Nome do arquivo: TRF-DATA(AAAAMMDD)-CASA-CATEGORIA
  // A data vem do próprio código (TRF-AAAAMMDD-XXXX), que já é gerado nesse formato invertido.
  const dataCodigo = (t.code || '').split('-')[1] || (t.data || '').replace(/-/g, '');
  const casaNome = t.destino || t.origem || 'Casa'; // usa a casa de destino (quem recebe)
  const categoriasNomes = [...new Set((t.items || []).map(i => CATEGORIAS[i.catKey]?.nome || i.catKey))];
  const categoriaStr = categoriasNomes.join('-') || 'Geral';
  const sanitizarNomeArquivo = s => (s || '').toString()
    .replace(/[\/\\:*?"<>|]/g, '')  // remove caracteres inválidos em nome de arquivo
    .replace(/\s+/g, '_')
    .trim();
  const nomeArquivo = `TRF-${dataCodigo}-${sanitizarNomeArquivo(casaNome)}-${sanitizarNomeArquivo(categoriaStr)}.pdf`;

  doc.save(nomeArquivo);
}

// ── PDF em lote: uma transferência por página, todas num único arquivo ──
async function exportarTransferenciasSelecionadasPDF() {
  if (transfSelecionadas.size === 0) { showToast('Selecione ao menos uma transferência.'); return; }

  const selecionadas = transfDocsAll.filter(t => transfSelecionadas.has(t.id));
  if (selecionadas.length === 0) { showToast('Selecione ao menos uma transferência.'); return; }

  const btn = document.getElementById('btn-transf-export-pdf');
  if (btn) { btn.disabled = true; btn.textContent = 'Gerando PDF...'; }

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    for (let i = 0; i < selecionadas.length; i++) {
      const t = selecionadas[i];
      const registradoPorNome = await resolverRegistradoPorTransf(t);
      if (i > 0) doc.addPage();
      desenharTransferenciaNoPDF(doc, t, registradoPorNome);
    }

    // Footer em todas as páginas do arquivo combinado
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8); doc.setTextColor(150,150,150);
      doc.text(`Lumen Estoque — Página ${i} de ${pageCount}`, 14, doc.internal.pageSize.height - 8);
      doc.text(new Date().toLocaleString('pt-BR'), 140, doc.internal.pageSize.height - 8);
    }

    const sanitizarNomeArquivo = s => (s || '').toString()
      .replace(/[\/\\:*?"<>|]/g, '')
      .replace(/\s+/g, '_')
      .trim();

    // Data no nome = data da exportação (o arquivo cobre N transferências, possivelmente de datas diferentes)
    const agora = new Date();
    const dataExport = agora.toISOString().slice(0,10).replace(/-/g,'');

    // Casa(s): lista os destinos únicos das transferências selecionadas, na ordem em que aparecem na tabela.
    // Teto de 3 nomes no arquivo — acima disso, a lista fica ilegível e arrisca estourar limite de caminho do SO.
    const MAX_CASAS_NO_NOME = 3;
    const destinosUnicos = [...new Set(selecionadas.map(t => t.destino).filter(Boolean))];
    const casaNome = destinosUnicos.length <= MAX_CASAS_NO_NOME
      ? destinosUnicos.join('-')
      : `${destinosUnicos.slice(0, MAX_CASAS_NO_NOME).join('-')}-e-mais-${destinosUnicos.length - MAX_CASAS_NO_NOME}casas`;

    // Categoria: só usa o nome se TODAS as selecionadas cobrirem exatamente o mesmo conjunto de categorias
    const categoriasPorTransf = selecionadas.map(t => [...new Set((t.items||[]).map(i => CATEGORIAS[i.catKey]?.nome || i.catKey))].sort().join(','));
    const categoriasIguais = categoriasPorTransf.every(c => c === categoriasPorTransf[0]);
    const categoriaStr = categoriasIguais && categoriasPorTransf[0] ? categoriasPorTransf[0].replace(/,/g,'-') : 'Diversas-Categorias';

    const nomeArquivo = `TRF-${dataExport}-${sanitizarNomeArquivo(casaNome)}-${sanitizarNomeArquivo(categoriaStr)}.pdf`;
    doc.save(nomeArquivo);
    showToast(`✅ PDF gerado com ${selecionadas.length} transferência(s).`);
  } catch(e) {
    console.error(e);
    showToast('Erro ao gerar PDF: ' + e.message);
  }

  updateTransfExportBtn();
}

