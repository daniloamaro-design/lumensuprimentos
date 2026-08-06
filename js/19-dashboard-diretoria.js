// ─────────────────────────────────────────────────────────────────────────
// Dashboard de Performance (Diretoria) — layout replica o mockup aprovado.
// Gasto Per Capita (card + gráfico de evolução) já usa dados reais (mesma
// fonte/fórmula da tela "Per Capita" — js/20-percapita-diretoria.js: soma
// valor dos pedidos / soma pessoas, valor = nfValor ou cotação aprovada).
// Os outros indicadores (Desvio Orçamentário, Entregas no Prazo,
// Acuracidade, Passagens por Motivo) continuam ILUSTRATIVOS até
// definirmos com o usuário como cada um deve ser calculado.
// ─────────────────────────────────────────────────────────────────────────
let _dashdirDonut = null;
let _dashdirLinhas = null;
let _dashdirPedidosCache = null; // [{data, valor, pessoas, cats}] — todas as casas, todo o histórico

const DASHDIR_MOTIVOS = [
  { label: 'Eventos',          valor: 1500, pct: 35, cor: '#14224a' },
  { label: 'Comvida',          valor: 1285, pct: 30, cor: '#e0a72e' },
  { label: 'Treinamento',      valor: 857,  pct: 20, cor: '#3f7cc4' },
  { label: 'Viagem a Serviço', valor: 428,  pct: 10, cor: '#8fc1e8' },
  { label: 'Outros',           valor: 215,  pct: 5,  cor: '#b9bfc7' },
];

const DASHDIR_COR_CAT = ['#14224a', '#e0a72e', '#3fae5a', '#3f7cc4', '#d64545', '#8fc1e8', '#b9bfc7'];

function initDashboardDiretoria() {
  // ── Passagens por Motivo (ilustrativo) ──
  const totalEl = document.getElementById('dashdir-donut-total');
  if (totalEl) totalEl.textContent = DASHDIR_MOTIVOS.reduce((s, m) => s + m.valor, 0).toLocaleString('pt-BR');

  const legendo = document.getElementById('dashdir-legend-donut');
  if (legendo) {
    legendo.innerHTML = DASHDIR_MOTIVOS.map(m => `
      <div class="dashdir-legend-item">
        <span class="dashdir-legend-dot" style="background:${m.cor};"></span>
        <span class="dashdir-legend-label">${m.label}</span>
        <span class="dashdir-legend-val">R$ ${m.valor.toLocaleString('pt-BR')} (${m.pct}%)</span>
      </div>`).join('');
  }

  const ctxD = document.getElementById('dashdir-donut');
  if (ctxD && window.Chart) {
    if (_dashdirDonut) _dashdirDonut.destroy();
    _dashdirDonut = new Chart(ctxD, {
      type: 'doughnut',
      data: {
        labels: DASHDIR_MOTIVOS.map(m => m.label),
        datasets: [{ data: DASHDIR_MOTIVOS.map(m => m.valor), backgroundColor: DASHDIR_MOTIVOS.map(m => m.cor), borderWidth: 0 }],
      },
      options: { responsive: true, cutout: '68%', plugins: { legend: { display: false } } },
    });
  }

  // ── Gasto Per Capita (real) ──
  dashdirPopularSeletorPeriodo();
  dashdirAtualizarPerCapita();
}
window.initDashboardDiretoria = initDashboardDiretoria;

function dashdirPopularSeletorPeriodo() {
  const hoje = new Date();
  const mesSel = document.getElementById('dashdir-mes');
  const anoSel = document.getElementById('dashdir-ano');
  if (mesSel && !mesSel.options.length) {
    const nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    mesSel.innerHTML = nomes.map((n, i) => `<option value="${i}">📅 ${n}</option>`).join('');
    mesSel.value = String(hoje.getMonth());
  }
  if (anoSel && !anoSel.options.length) {
    const anoAtual = hoje.getFullYear();
    const anos = [anoAtual - 1, anoAtual, anoAtual + 1];
    anoSel.innerHTML = anos.map(a => `<option value="${a}">📅 Ano: ${a}</option>`).join('');
    anoSel.value = String(anoAtual);
  }
}

function dashdirDataPedido(o) {
  if (o.dateStr) {
    const s = String(o.dateStr);
    if (/^\d{8}$/.test(s)) return new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`);
    const d = new Date(s); if (!isNaN(d)) return d;
  }
  if (o.createdAt && o.createdAt.toDate) return o.createdAt.toDate();
  return null;
}

async function dashdirValorPedido(o) {
  const valor = parseFloat(o.nfValor) || 0;
  if (valor) return valor;
  try {
    const qSnap = await db.collection('quotations').where('orderId', '==', o.id).where('status', '==', 'aprovado').limit(1).get();
    if (!qSnap.empty) return parseFloat(qSnap.docs[0].data().valor) || 0;
  } catch (e) { /* sem cotação aprovada */ }
  return 0;
}

// Busca pedidos de TODAS as casas 1x (cacheado) — reusado pelo KPI e pelo gráfico.
async function dashdirCarregarPedidos() {
  if (_dashdirPedidosCache) return _dashdirPedidosCache;
  const todos = [];
  for (const casa of CASAS) {
    try {
      const snap = await db.collection('orders').where('house', '==', casa).get();
      snap.docs.forEach(d => todos.push({ id: d.id, ...d.data() }));
    } catch (e) { console.error('dashdirCarregarPedidos', casa, e); }
  }
  const comValor = [];
  for (const o of todos) {
    const dt = dashdirDataPedido(o);
    if (!dt) continue;
    const pessoas = parseFloat(o.people) || 0;
    if (!pessoas) continue;
    const valor = await dashdirValorPedido(o);
    if (!valor) continue;
    const cats = (Array.isArray(o.categories) && o.categories.length) ? o.categories : ['outros'];
    comValor.push({ data: dt, valor, pessoas, cats });
  }
  _dashdirPedidosCache = comValor;
  return comValor;
}

function dashdirSomaMes(pedidos, ano, mes) {
  let valor = 0, pessoas = 0, qtd = 0;
  pedidos.forEach(p => {
    if (p.data.getFullYear() === ano && p.data.getMonth() === mes) { valor += p.valor; pessoas += p.pessoas; qtd++; }
  });
  return { valor, pessoas, qtd, percapita: pessoas ? valor / pessoas : 0 };
}

async function dashdirAtualizarPerCapita() {
  const mesSel = document.getElementById('dashdir-mes');
  const anoSel = document.getElementById('dashdir-ano');
  const valorEl = document.getElementById('dashdir-kpi-percapita-valor');
  const deltaEl = document.getElementById('dashdir-kpi-percapita-delta');
  const qtdEl = document.getElementById('dashdir-kpi-percapita-qtd');
  if (!mesSel || !anoSel || !valorEl) return;

  valorEl.textContent = '…';
  if (deltaEl) deltaEl.textContent = '';
  if (qtdEl) qtdEl.textContent = 'Carregando…';

  try {
    const pedidos = await dashdirCarregarPedidos();
    const mes = parseInt(mesSel.value, 10);
    const ano = parseInt(anoSel.value, 10);

    const atual = dashdirSomaMes(pedidos, ano, mes);
    const mesAnteriorData = new Date(ano, mes - 1, 1);
    const anterior = dashdirSomaMes(pedidos, mesAnteriorData.getFullYear(), mesAnteriorData.getMonth());

    valorEl.textContent = atual.pessoas ? frtBRL(atual.percapita) : '— sem dados';
    valorEl.classList.remove('ruim');

    if (deltaEl) {
      if (atual.pessoas && anterior.pessoas) {
        const variacao = ((atual.percapita - anterior.percapita) / anterior.percapita) * 100;
        const bom = variacao <= 0;
        deltaEl.className = 'dashdir-kpi-delta' + (bom ? ' good' : ' ruim');
        deltaEl.innerHTML = `${bom ? '↓' : '↑'} ${variacao > 0 ? '+' : ''}${variacao.toFixed(1)}% <span>vs. mês anterior</span>`;
      } else {
        deltaEl.className = 'dashdir-kpi-delta';
        deltaEl.innerHTML = '<span>sem dado do mês anterior p/ comparar</span>';
      }
    }
    if (qtdEl) qtdEl.textContent = atual.qtd ? `${atual.qtd} pedido(s) no mês` : 'Nenhum pedido com valor no mês';

    dashdirRenderEvolucao(pedidos);
  } catch (e) {
    console.error('dashdirAtualizarPerCapita', e);
    valorEl.textContent = 'Erro';
    if (qtdEl) qtdEl.textContent = e.message;
  }
}
window.dashdirAtualizarPerCapita = dashdirAtualizarPerCapita;

// Evolução dos últimos 12 meses (rolante a partir de hoje), por categoria + Total.
function dashdirCalcularEvolucao(pedidos) {
  const hoje = new Date();
  const meses = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    meses.push({ ano: d.getFullYear(), mes: d.getMonth(), label: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }) });
  }
  const categorias = new Set();
  pedidos.forEach(p => p.cats.forEach(c => categorias.add(c)));

  const totalMes = meses.map(() => ({ valor: 0, pessoas: 0 }));
  const porCatMes = {};
  categorias.forEach(c => { porCatMes[c] = meses.map(() => ({ valor: 0, pessoas: 0 })); });

  pedidos.forEach(p => {
    const idx = meses.findIndex(m => m.ano === p.data.getFullYear() && m.mes === p.data.getMonth());
    if (idx === -1) return;
    totalMes[idx].valor += p.valor; totalMes[idx].pessoas += p.pessoas;
    const fatiaV = p.valor / p.cats.length, fatiaP = p.pessoas / p.cats.length;
    p.cats.forEach(c => { porCatMes[c][idx].valor += fatiaV; porCatMes[c][idx].pessoas += fatiaP; });
  });

  return {
    labels: meses.map(m => m.label),
    total: totalMes.map(m => (m.pessoas ? m.valor / m.pessoas : null)),
    porCategoria: Object.fromEntries([...categorias].map(c => [c, porCatMes[c].map(m => (m.pessoas ? m.valor / m.pessoas : null))])),
  };
}

function dashdirNomeCategoria(k) {
  return (window.CATEGORIAS && CATEGORIAS[k] && CATEGORIAS[k].nome) || (k.charAt(0).toUpperCase() + k.slice(1));
}

function dashdirRenderEvolucao(pedidos) {
  const ctxL = document.getElementById('dashdir-linhas');
  if (!ctxL || !window.Chart) return;
  const ev = dashdirCalcularEvolucao(pedidos);
  const cats = Object.keys(ev.porCategoria).sort((a, b) => dashdirNomeCategoria(a).localeCompare(dashdirNomeCategoria(b)));

  const datasets = [
    { label: 'Total Consolidado', data: ev.total, borderColor: '#1a1a1a', backgroundColor: '#1a1a1a', borderWidth: 2.5, pointRadius: 3, tension: 0.35, fill: false, spanGaps: true },
    ...cats.map((c, i) => ({
      label: dashdirNomeCategoria(c), data: ev.porCategoria[c],
      borderColor: DASHDIR_COR_CAT[i % DASHDIR_COR_CAT.length], backgroundColor: DASHDIR_COR_CAT[i % DASHDIR_COR_CAT.length],
      borderWidth: 1.5, pointRadius: 2.5, tension: 0.35, fill: false, spanGaps: true,
    })),
  ];

  if (_dashdirLinhas) _dashdirLinhas.destroy();
  _dashdirLinhas = new Chart(ctxL, {
    type: 'line',
    data: { labels: ev.labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10.5 } } } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => 'R$' + v } } },
    },
  });
}
