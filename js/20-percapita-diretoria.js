// ─────────────────────────────────────────────────────────────────────────
// Per Capita (Diretoria) — datas customizadas, comparação A/B, todas as
// categorias (pedidos mistos rateados igualmente entre as categorias que
// contêm), evolução mensal/anual. Independente da tela "Per Capita
// Financeiro" do Suprimentos (js/04-percapita.js), que tem regras próprias
// (m3/m6/m12, só 3 categorias, exclui pedido misto) — não mexi nela.
// ─────────────────────────────────────────────────────────────────────────
let _pcdCasasSel = new Set();
let _pcdGranularidade = 'mensal';
let _pcdChart = null;
let _pcdUltimo = null; // { comValor, A, B }

function initDiretoriaPercapita() {
  _pcdCasasSel = new Set();
  const box = document.getElementById('pcd-casa-chips');
  if (box) {
    box.innerHTML = CASAS.map(c => `<button type="button" class="irm-chip" data-casa="${frtEsc(c)}" onclick="pcdToggleCasa('${frtEsc(c)}')">${frtEsc(c)}</button>`).join('');
  }
  pcdAtualizarCasaCount();

  const hoje = new Date();
  const primeiroMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
  const hojeStr = hoje.toISOString().slice(0, 10);
  const ai = document.getElementById('pcd-a-ini'); if (ai && !ai.value) ai.value = primeiroMes;
  const af = document.getElementById('pcd-a-fim'); if (af && !af.value) af.value = hojeStr;

  document.getElementById('pcd-resultado').style.display = 'none';
  document.getElementById('pcd-vazio').style.display = '';
  pcdSetGranularidade('mensal');
}
window.initDiretoriaPercapita = initDiretoriaPercapita;

function pcdToggleCasa(nome) {
  if (_pcdCasasSel.has(nome)) _pcdCasasSel.delete(nome); else _pcdCasasSel.add(nome);
  document.querySelector(`#pcd-casa-chips .irm-chip[data-casa="${CSS.escape(nome)}"]`)?.classList.toggle('selected', _pcdCasasSel.has(nome));
  pcdAtualizarCasaCount();
}
window.pcdToggleCasa = pcdToggleCasa;

function pcdCasaSelectAll() {
  _pcdCasasSel = new Set(CASAS);
  document.querySelectorAll('#pcd-casa-chips .irm-chip').forEach(c => c.classList.add('selected'));
  pcdAtualizarCasaCount();
}
function pcdCasaClearAll() {
  _pcdCasasSel = new Set();
  document.querySelectorAll('#pcd-casa-chips .irm-chip').forEach(c => c.classList.remove('selected'));
  pcdAtualizarCasaCount();
}
window.pcdCasaSelectAll = pcdCasaSelectAll;
window.pcdCasaClearAll = pcdCasaClearAll;

function pcdAtualizarCasaCount() {
  const el = document.getElementById('pcd-casa-count');
  if (!el) return;
  const n = _pcdCasasSel.size;
  el.textContent = (n === 0 || n === CASAS.length) ? '(todas as casas)' : `(${n} selecionada${n > 1 ? 's' : ''})`;
}
function pcdCasasSelecionadas() {
  return (_pcdCasasSel.size === 0 || _pcdCasasSel.size === CASAS.length) ? [...CASAS] : [..._pcdCasasSel];
}

// Bucket atual + bucket imediatamente anterior (mesma duração), alinhados ao
// calendário — ex.: trimestral segue Jan-Mar/Abr-Jun/Jul-Set/Out-Dez, não uma
// janela rolante de 90 dias.
function pcdBucketAtualEAnterior(gran, hoje) {
  const mesesPorBucket = { mensal: 1, trimestral: 3, semestral: 6, anual: 12 }[gran] || 1;
  const ano = hoje.getFullYear(), mes = hoje.getMonth();

  const mesInicioAtual = Math.floor(mes / mesesPorBucket) * mesesPorBucket;
  const iniAtual = new Date(ano, mesInicioAtual, 1);
  const fimAtual = hoje;

  const mesInicioAnteriorTotal = mesInicioAtual - mesesPorBucket;
  const anoAnterior = ano + Math.floor(mesInicioAnteriorTotal / 12);
  const mesAnterior = ((mesInicioAnteriorTotal % 12) + 12) % 12;
  const iniAnterior = new Date(anoAnterior, mesAnterior, 1);
  const fimAnterior = new Date(iniAtual.getTime() - 86400000); // véspera do início do atual

  return { iniAtual, fimAtual, iniAnterior, fimAnterior };
}

function pcdAplicarPeriodoFixo(gran) {
  document.querySelectorAll('.pcd-gran-btn').forEach(b => b.classList.toggle('btn-primary', b.dataset.gran === gran));
  const fmt = d => d.toISOString().slice(0, 10);
  const { iniAtual, fimAtual, iniAnterior, fimAnterior } = pcdBucketAtualEAnterior(gran, new Date());
  document.getElementById('pcd-a-ini').value = fmt(iniAtual);
  document.getElementById('pcd-a-fim').value = fmt(fimAtual);
  document.getElementById('pcd-b-ini').value = fmt(iniAnterior);
  document.getElementById('pcd-b-fim').value = fmt(fimAnterior);
}
window.pcdAplicarPeriodoFixo = pcdAplicarPeriodoFixo;

function pcdSetGranularidade(g) {
  _pcdGranularidade = g;
  document.getElementById('pcd-btn-mensal')?.classList.toggle('btn-primary', g === 'mensal');
  document.getElementById('pcd-btn-anual')?.classList.toggle('btn-primary', g === 'anual');
  if (_pcdUltimo) pcdRenderEvolucao();
}
window.pcdSetGranularidade = pcdSetGranularidade;

// mesma lógica de leitura de data usada em js/04-percapita.js (getOrderDateCardapio)
function pcdDataPedido(o) {
  if (o.dateStr) {
    const s = String(o.dateStr);
    if (/^\d{8}$/.test(s)) return new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`);
    const d = new Date(s); if (!isNaN(d)) return d;
  }
  if (o.createdAt && o.createdAt.toDate) return o.createdAt.toDate();
  return null;
}

async function pcdValorPedido(o) {
  const valor = parseFloat(o.nfValor) || 0;
  if (valor) return valor;
  try {
    const qSnap = await db.collection('quotations').where('orderId', '==', o.id).where('status', '==', 'aprovado').limit(1).get();
    if (!qSnap.empty) return parseFloat(qSnap.docs[0].data().valor) || 0;
  } catch (e) { /* sem cotação aprovada — sem valor */ }
  return 0;
}

async function pcdCalcular() {
  const casas = pcdCasasSelecionadas();
  const aIni = document.getElementById('pcd-a-ini').value;
  const aFim = document.getElementById('pcd-a-fim').value;
  const bIni = document.getElementById('pcd-b-ini').value;
  const bFim = document.getElementById('pcd-b-fim').value;
  if (!aIni || !aFim) return showToast('⚠️ Informe o Período A.');
  if (!casas.length) return showToast('⚠️ Selecione ao menos uma casa.');

  document.getElementById('pcd-vazio').style.display = 'none';
  document.getElementById('pcd-resultado').style.display = 'block';
  document.getElementById('pcd-kpis').innerHTML = '<div class="loading-state"><div class="spinner spinner-dark"></div>Calculando...</div>';

  try {
    const pedidos = [];
    for (const casa of casas) {
      const snap = await db.collection('orders').where('house', '==', casa).get();
      snap.docs.forEach(d => pedidos.push({ id: d.id, ...d.data() }));
    }

    const comValor = [];
    for (const o of pedidos) {
      const dt = pcdDataPedido(o);
      if (!dt) continue;
      const pessoas = parseFloat(o.people) || 0;
      if (!pessoas) continue;
      const valor = await pcdValorPedido(o);
      if (!valor) continue;
      const cats = (Array.isArray(o.categories) && o.categories.length) ? o.categories : ['outros'];
      comValor.push({ data: dt, valor, pessoas, cats });
    }

    const somaPeriodo = (ini, fim) => {
      const di = new Date(ini + 'T00:00:00'), df = new Date(fim + 'T23:59:59');
      const porCatValor = {}, porCatPessoas = {};
      let totalValor = 0, totalPessoas = 0, qtdPedidos = 0;
      comValor.forEach(p => {
        if (p.data < di || p.data > df) return;
        const fatiaValor = p.valor / p.cats.length;
        const fatiaPessoas = p.pessoas / p.cats.length;
        p.cats.forEach(c => {
          porCatValor[c] = (porCatValor[c] || 0) + fatiaValor;
          porCatPessoas[c] = (porCatPessoas[c] || 0) + fatiaPessoas;
        });
        totalValor += p.valor; totalPessoas += p.pessoas; qtdPedidos++;
      });
      return { porCatValor, porCatPessoas, totalValor, totalPessoas, qtdPedidos };
    };

    const A = somaPeriodo(aIni, aFim);
    const B = (bIni && bFim) ? somaPeriodo(bIni, bFim) : null;
    _pcdUltimo = { comValor, A, B };

    pcdRenderResultado(A, B);
    pcdRenderEvolucao();
  } catch (e) {
    console.error('pcdCalcular', e);
    document.getElementById('pcd-kpis').innerHTML = `<div class="card"><div class="card-body" style="color:var(--danger,#dc2626);">Erro: ${frtEsc(e.message)}</div></div>`;
  }
}
window.pcdCalcular = pcdCalcular;

function pcdNomeCategoria(k) {
  return (window.CATEGORIAS && CATEGORIAS[k] && CATEGORIAS[k].nome) || (k.charAt(0).toUpperCase() + k.slice(1));
}

function pcdRenderResultado(A, B) {
  const percapitaA = A.totalPessoas ? A.totalValor / A.totalPessoas : 0;
  const percapitaB = (B && B.totalPessoas) ? B.totalValor / B.totalPessoas : null;
  const variacao = (percapitaB != null && percapitaB > 0) ? ((percapitaA - percapitaB) / percapitaB * 100) : null;

  const cards = [
    _erpStat('👥 Per capita — Período A', frtBRL(percapitaA), A.qtdPedidos + ' pedido(s)'),
    _erpStat('💰 Total gasto — Período A', frtBRL(A.totalValor)),
  ];
  if (B) {
    cards.push(_erpStat('👥 Per capita — Período B', frtBRL(percapitaB), B.qtdPedidos + ' pedido(s)'));
    cards.push(_erpStat('💰 Total gasto — Período B', frtBRL(B.totalValor)));
  }
  if (variacao != null) {
    cards.push(_erpStat(variacao > 0 ? '⚠️ Variação A vs B' : '✅ Variação A vs B', (variacao > 0 ? '+' : '') + variacao.toFixed(1) + '%', '', variacao > 0 ? 'stat-card-warn' : 'stat-card-ok'));
  }
  document.getElementById('pcd-kpis').innerHTML = `<div style="${_erpGrid}">${cards.join('')}</div>`;

  const cats = new Set([...Object.keys(A.porCatValor), ...(B ? Object.keys(B.porCatValor) : [])]);
  const tb = document.getElementById('pcd-tbody-cat');
  if (!cats.size) {
    tb.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted);">Nenhum pedido com valor e pessoas registrados no período.</td></tr>';
    return;
  }
  tb.innerHTML = [...cats].sort((a, b) => pcdNomeCategoria(a).localeCompare(pcdNomeCategoria(b))).map(c => {
    const pcA = A.porCatPessoas[c] ? A.porCatValor[c] / A.porCatPessoas[c] : null;
    const pcB = (B && B.porCatPessoas[c]) ? B.porCatValor[c] / B.porCatPessoas[c] : null;
    const varCat = (pcA != null && pcB != null && pcB > 0) ? ((pcA - pcB) / pcB * 100) : null;
    const corVar = varCat == null ? '' : (varCat > 0 ? 'color:var(--danger,#dc2626);' : 'color:var(--ok,#16a34a);');
    return `<tr>
      <td>${frtEsc(pcdNomeCategoria(c))}</td>
      <td style="text-align:right;">${pcA != null ? frtBRL(pcA) : '—'}</td>
      <td style="text-align:right;">${pcB != null ? frtBRL(pcB) : '—'}</td>
      <td style="text-align:right;${corVar}">${varCat != null ? ((varCat > 0 ? '+' : '') + varCat.toFixed(1) + '%') : '—'}</td>
    </tr>`;
  }).join('');
}

function pcdCalcularEvolucao(comValor, granularidade) {
  const buckets = {};
  comValor.forEach(p => {
    const key = granularidade === 'anual'
      ? String(p.data.getFullYear())
      : `${p.data.getFullYear()}-${String(p.data.getMonth() + 1).padStart(2, '0')}`;
    if (!buckets[key]) buckets[key] = { valor: 0, pessoas: 0 };
    buckets[key].valor += p.valor;
    buckets[key].pessoas += p.pessoas;
  });
  return Object.keys(buckets).sort().map(k => ({
    label: granularidade === 'anual' ? k : new Date(k + '-01T00:00:00').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
    percapita: buckets[k].pessoas ? buckets[k].valor / buckets[k].pessoas : 0,
  }));
}

function pcdRenderEvolucao() {
  if (!_pcdUltimo) return;
  const dados = pcdCalcularEvolucao(_pcdUltimo.comValor, _pcdGranularidade);
  const ctx = document.getElementById('pcd-chart-evolucao');
  if (!ctx || !window.Chart) return;
  if (_pcdChart) _pcdChart.destroy();
  if (!dados.length) return;
  _pcdChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dados.map(d => d.label),
      datasets: [{ label: 'Per capita (R$)', data: dados.map(d => d.percapita), borderColor: '#2B9FA8', backgroundColor: '#2B9FA8', tension: 0.3, pointRadius: 3, fill: false }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => 'R$' + v } } },
    },
  });
}
