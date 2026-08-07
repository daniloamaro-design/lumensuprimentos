// ─────────────────────────────────────────────────────────────────────────
// Dashboard de Performance (Diretoria) — layout replica o mockup aprovado.
// Gasto Per Capita, Passagens por Motivo, Desvio Orçamentário de Passagens
// e % de Entregas no Prazo já usam dados reais. Só a Acuracidade do
// Estoque continua ILUSTRATIVA até definirmos com o usuário como calcular.
// ─────────────────────────────────────────────────────────────────────────
let _dashdirDonut = null;
let _dashdirLinhas = null;
let _dashdirPedidosCache = null; // [{data, valor, pessoas, cats}] — todas as casas, todo o histórico

const DASHDIR_COR_CAT = ['#14224a', '#e0a72e', '#3fae5a', '#3f7cc4', '#d64545', '#8fc1e8', '#b9bfc7'];
const DASHDIR_COR_MOTIVO = ['#14224a', '#e0a72e', '#3f7cc4', '#3fae5a', '#d64545', '#8fc1e8', '#b9bfc7'];

async function initDashboardDiretoria() {
  dashdirPopularSeletorPeriodo();
  dashdirAtualizarPeriodo();
}
window.initDashboardDiretoria = initDashboardDiretoria;

// Reage à troca de mês/ano no seletor do header — atualiza os 4 indicadores reais.
function dashdirAtualizarPeriodo() {
  dashdirAtualizarPerCapita();
  dashdirAtualizarDesvioPassagens();
  dashdirCarregarMotivos();
  dashdirAtualizarEntregasPrazo();
}
window.dashdirAtualizarPeriodo = dashdirAtualizarPeriodo;

// % de Entregas no Prazo: entre os fretes marcados como ENTREGUES no mês/ano
// selecionado (pela data real de entrega, tirada do histórico) e que têm
// previsaoEntrega preenchida, qual % chegou até a data prevista.
async function dashdirAtualizarEntregasPrazo() {
  const valorEl = document.getElementById('dashdir-kpi-prazo-valor');
  const deltaEl = document.getElementById('dashdir-kpi-prazo-delta');
  const metaEl = document.getElementById('dashdir-kpi-prazo-meta');
  if (!valorEl) return;

  valorEl.textContent = '…';
  if (deltaEl) deltaEl.textContent = '';
  if (metaEl) { metaEl.textContent = ''; metaEl.className = 'dashdir-kpi-meta'; }

  try {
    const { ano, mes } = dashdirPeriodoAtual(); // mes 0-11

    const snap = await db.collection('fretes').get();
    const fretes = snap.docs.map(d => d.data()).filter(f => f.status === 'entregue' && f.previsaoEntrega);

    const doMes = fretes.filter(f => {
      const hist = Array.isArray(f.historico) ? f.historico : [];
      const ent = hist.slice().reverse().find(h => h && h.status === 'entregue');
      const dataReal = ent ? String(ent.data || '').slice(0, 10) : null;
      if (!dataReal) return false;
      f._dataEntregaReal = dataReal; // guarda pra reusar abaixo sem re-procurar
      const [y, m] = dataReal.split('-').map(Number);
      return y === ano && (m - 1) === mes;
    });

    if (!doMes.length) {
      valorEl.textContent = '— sem dados';
      if (metaEl) metaEl.textContent = 'Nenhum frete entregue com previsão cadastrada nesse mês.';
      return;
    }

    const noPrazo = doMes.filter(f => f._dataEntregaReal <= f.previsaoEntrega).length;
    const pct = (noPrazo / doMes.length) * 100;
    const temEstimado = doMes.some(f => f.previsaoEstimada);

    valorEl.textContent = pct.toFixed(1).replace('.', ',') + '%';
    valorEl.classList.toggle('ruim', pct < 90);
    if (deltaEl) {
      deltaEl.className = 'dashdir-kpi-delta' + (pct >= 90 ? ' good' : ' ruim');
      deltaEl.innerHTML = `${noPrazo}/${doMes.length} <span>entregues no prazo</span>`;
    }
    if (metaEl) metaEl.textContent = 'Meta: > 90%' + (temEstimado ? ' • inclui previsão estimada (fretes antigos)' : '');
  } catch (e) {
    console.error('dashdirAtualizarEntregasPrazo', e);
    valorEl.textContent = 'Erro';
    if (metaEl) metaEl.textContent = e.message;
  }
}
window.dashdirAtualizarEntregasPrazo = dashdirAtualizarEntregasPrazo;

// Desvio Orçamentário de Passagens: gasto real do mês (compras_financeiro,
// modulo=passagens, filtrado por VENCIMENTO — decisão da Diretoria, não
// data de compra) vs. orçamento mensal cadastrado em Passagens > Orçamento
// (tabela metas, modulo=passagens, cat_key='geral', meta_mes — o mesmo valor
// mensal vale pra qualquer mês daquele ano).
async function dashdirAtualizarDesvioPassagens() {
  const valorEl = document.getElementById('dashdir-kpi-desvio-valor');
  const pctEl = document.getElementById('dashdir-kpi-desvio-pct');
  const metaEl = document.getElementById('dashdir-kpi-desvio-meta');
  if (!valorEl) return;

  valorEl.textContent = '…';
  valorEl.classList.remove('ruim');
  if (pctEl) { pctEl.textContent = ''; pctEl.className = 'dashdir-kpi-delta'; }
  if (metaEl) { metaEl.textContent = ''; metaEl.className = 'dashdir-kpi-meta'; }

  try {
    const { ano, mes } = dashdirPeriodoAtual(); // mes 0-11

    const { data: metas, error: errMeta } = await window._sb.from('metas').select('meta_mes')
      .eq('modulo', 'passagens').eq('cat_key', 'geral').eq('ano', ano).maybeSingle();
    if (errMeta) throw errMeta;
    const orcamentoMensal = metas ? Number(metas.meta_mes) || 0 : 0;

    const de = `${ano}-${String(mes + 1).padStart(2, '0')}-01`;
    const proxMes = new Date(ano, mes + 1, 1);
    const ate = `${proxMes.getFullYear()}-${String(proxMes.getMonth() + 1).padStart(2, '0')}-01`;
    // Por decisão da Diretoria (2026-08-07): o mês do desvio é o do
    // VENCIMENTO (quando o pagamento cai), não o da data de compra.
    const { data: fin, error: errFin } = await window._sb.from('compras_financeiro').select('valor')
      .eq('modulo', 'passagens').gte('vencimento', de).lt('vencimento', ate);
    if (errFin) throw errFin;
    const gastoReal = (fin || []).reduce((s, r) => s + (Number(r.valor) || 0), 0);

    if (!orcamentoMensal) {
      valorEl.textContent = '— sem orçamento';
      if (metaEl) { metaEl.textContent = 'Cadastre o orçamento em Passagens › Orçamento'; metaEl.classList.add('faixa-alerta'); }
      return;
    }

    const desvio = gastoReal - orcamentoMensal;
    const pct = (desvio / orcamentoMensal) * 100;
    const estourou = desvio > 0;

    valorEl.textContent = (estourou ? '+' : '−') + frtBRL(Math.abs(desvio));
    valorEl.classList.toggle('ruim', estourou);
    if (pctEl) {
      pctEl.className = 'dashdir-kpi-delta' + (estourou ? ' ruim' : ' good');
      pctEl.innerHTML = `${estourou ? '↑' : '↓'} ${estourou ? '+' : ''}${pct.toFixed(1)}% <span>vs. orçamento do mês</span>`;
    }
    if (metaEl) metaEl.textContent = `Gasto: ${frtBRL(gastoReal)} • Orçamento: ${frtBRL(orcamentoMensal)}`;
  } catch (e) {
    console.error('dashdirAtualizarDesvioPassagens', e);
    valorEl.textContent = 'Erro';
    if (metaEl) metaEl.textContent = e.message;
  }
}
window.dashdirAtualizarDesvioPassagens = dashdirAtualizarDesvioPassagens;

let _dashdirPasCache = null; // todas as passagens_solicitacoes — filtradas client-side por período

// Agrupa por motivo as passagens efetivamente COMPRADAS no mês/ano do
// seletor do cabeçalho, usando a data da compra (dataCompra) — mesmo
// critério de período usado no Desvio Orçamentário.
async function dashdirCarregarMotivos() {
  const totalEl = document.getElementById('dashdir-donut-total');
  const legendo = document.getElementById('dashdir-legend-donut');
  if (totalEl) totalEl.textContent = '…';
  try {
    if (!_dashdirPasCache) {
      const snap = await db.collection('passagens_solicitacoes').get();
      _dashdirPasCache = snap.docs.map(d => d.data());
    }
    const { ano, mes } = dashdirPeriodoAtual(); // mes 0-11

    const sols = _dashdirPasCache.filter(s => {
      if (!s.dataCompra) return false;
      const m = String(s.dataCompra).match(/^(\d{4})-(\d{2})/);
      if (!m) return false;
      return parseInt(m[1], 10) === ano && (parseInt(m[2], 10) - 1) === mes;
    });

    const porMotivo = {};
    sols.forEach(s => {
      const m = (s.motivo || 'Não informado').trim() || 'Não informado';
      porMotivo[m] = (porMotivo[m] || 0) + 1;
    });
    let lista = Object.entries(porMotivo).sort((a, b) => b[1] - a[1]);
    // Top 6 + "Outros" agrupando o resto, pra não poluir a legenda/donut.
    if (lista.length > 7) {
      const top = lista.slice(0, 6);
      const outros = lista.slice(6).reduce((s, [, n]) => s + n, 0);
      lista = [...top, ['Outros', outros]];
    }
    const total = sols.length;
    const dados = lista.map(([label, n], i) => ({
      label, n, pct: total ? Math.round((n / total) * 100) : 0, cor: DASHDIR_COR_MOTIVO[i % DASHDIR_COR_MOTIVO.length],
    }));

    if (totalEl) totalEl.textContent = total.toLocaleString('pt-BR');
    if (legendo) {
      legendo.innerHTML = dados.length ? dados.map(m => `
        <div class="dashdir-legend-item">
          <span class="dashdir-legend-dot" style="background:${m.cor};"></span>
          <span class="dashdir-legend-label">${dashdirEsc(m.label)}</span>
          <span class="dashdir-legend-val">${m.n} (${m.pct}%)</span>
        </div>`).join('') : '<div class="dashdir-legend-item">Nenhuma passagem comprada no período selecionado.</div>';
    }

    const ctxD = document.getElementById('dashdir-donut');
    if (ctxD && window.Chart) {
      if (_dashdirDonut) _dashdirDonut.destroy();
      _dashdirDonut = new Chart(ctxD, {
        type: 'doughnut',
        data: {
          labels: dados.map(m => m.label),
          datasets: [{ data: dados.map(m => m.n), backgroundColor: dados.map(m => m.cor), borderWidth: 0 }],
        },
        options: { responsive: true, cutout: '68%', plugins: { legend: { display: false } } },
      });
    }
  } catch (e) {
    console.error('dashdirCarregarMotivos', e);
    if (totalEl) totalEl.textContent = 'Erro';
    if (legendo) legendo.innerHTML = `<div class="dashdir-legend-item">Erro ao carregar: ${dashdirEsc(e.message)}</div>`;
  }
}
function dashdirEsc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const DASHDIR_MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// Lista suspensa única "Mês/Ano" (ex.: "Junho/2026") — de jan/(ano-1) até
// dez/(ano+1), mês atual pré-selecionado.
function dashdirPopularSeletorPeriodo() {
  const sel = document.getElementById('dashdir-periodo');
  if (!sel || sel.options.length) return;
  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const atual = `${anoAtual}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  const opts = [];
  for (const ano of [anoAtual - 1, anoAtual, anoAtual + 1]) {
    for (let m = 0; m < 12; m++) {
      const valor = `${ano}-${String(m + 1).padStart(2, '0')}`;
      opts.push(`<option value="${valor}">${DASHDIR_MESES[m]}/${ano}</option>`);
    }
  }
  sel.innerHTML = opts.join('');
  sel.value = atual;
}

// Lê o seletor único de período ("YYYY-MM") e devolve {ano, mes} com mês
// 0-based (igual Date.getMonth()) — usado pelos 4 indicadores reais do
// Dashboard, todos filtrados pelo mesmo período.
function dashdirPeriodoAtual() {
  const sel = document.getElementById('dashdir-periodo');
  const v = sel && sel.value; // "YYYY-MM"
  if (!v) { const h = new Date(); return { ano: h.getFullYear(), mes: h.getMonth() }; }
  const [ano, mes] = v.split('-').map(Number);
  return { ano, mes: mes - 1 };
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
  const valorEl = document.getElementById('dashdir-kpi-percapita-valor');
  const deltaEl = document.getElementById('dashdir-kpi-percapita-delta');
  const qtdEl = document.getElementById('dashdir-kpi-percapita-qtd');
  if (!valorEl) return;

  valorEl.textContent = '…';
  if (deltaEl) deltaEl.textContent = '';
  if (qtdEl) qtdEl.textContent = 'Carregando…';

  try {
    const pedidos = await dashdirCarregarPedidos();
    const { ano, mes } = dashdirPeriodoAtual();

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
