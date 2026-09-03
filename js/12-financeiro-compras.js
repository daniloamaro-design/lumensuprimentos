// Extraído de index.html (financeiro compras + pagamentos + conta azul + theme toggle) em 2026-07-27
// ─────────────────────────────────────────────
// 💰  MÓDULO FINANCEIRO — COMPRAS
// ─────────────────────────────────────────────

let finDados = [];         // todos os registros carregados
let finFiltrados = [];     // após filtros
let finChartForn = null;
let finChartClass = null;
let finChartMensal = null;
let finPreviewDados = [];  // dados lidos do Excel antes de importar

const FMT_FIN = v => 'R$ ' + (parseFloat(v)||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});

// compras_financeiro.pago vem com convenções diferentes por módulo (Suprimentos
// grava 'Sim'/'Não'; Passagens, migrado da coleção antiga, grava 'Pago'/'Pendente').
// Normaliza toda LEITURA por aqui — a escrita continua canônica ('Sim'/'').
const FIN_PAGO = v => v === 'Sim' || v === 'Pago';

// Fretes tem financeiro próprio (tabela 'fretes', não entra em compras_financeiro).
// Carrega e converte cada frete numa "linha" no mesmo formato de finDados
// (fornecedor/classificacao/destinatario/mes/ano/valor/pago/modulo…), pra
// aparecer de verdade na tabela/gráficos/exportação quando o filtro Módulo
// = Frete for usado — não só no card "Consolidado por Módulo".
let finFretesResumo = { total: 0, pago: 0, qtd: 0 };
let finFretesLinhas = [];
const _FIN_MESES_UP = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];
function _finDataBR(v) {
  if (!v) return '';
  const s = String(v.toDate ? v.toDate().toISOString() : v);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}
async function finCarregarResumoFretes() {
  try {
    const snap = await db.collection('fretes').get();
    const r = { total: 0, pago: 0, qtd: 0 };
    const linhas = [];
    snap.docs.forEach(d => {
      const f = d.data();
      const val = Number(f.valor) || 0;
      r.total += val; r.qtd += 1;
      if (f.statusPag === 'pago') r.pago += val;

      const dataStr = String(f.data || f.createdAt || '');
      const m = dataStr.match(/^(\d{4})-(\d{2})/);
      linhas.push({
        id: d.id,
        modulo: 'frete',
        fornecedor: f.freteiroNome || '— (sem freteiro)',
        classificacao: 'Frete',
        destinatario: [f.origem, f.destino].filter(Boolean).join(' → ') || '—',
        mes: m ? _FIN_MESES_UP[parseInt(m[2], 10) - 1] : '',
        ano: m ? m[1] : '',
        dataCompraStr: _finDataBR(f.data || f.createdAt),
        vencimentoStr: '—',
        diasPrazo: '',
        valor: val,
        pago: f.statusPag === 'pago' ? 'Sim' : '',
        lancadoSP: '',
      });
    });
    finFretesResumo = r;
    finFretesLinhas = linhas;
  } catch (e) { console.error('finCarregarResumoFretes:', e); }
}

const FIN_CLASS_MAP = {
  'Proteína': 'Alimentação - Proteínas - Casas',
  'Proteina': 'Alimentação - Proteínas - Casas',
  'Cereal':   'Alimentação - Cereais - Casas',
  'Higiene':  'Mat de Limpeza e Higiene - Casas e Centros S',
  'Diverso':  'Diversos',
  'Diversas': 'Diversos',
  'Gás':      'Alimentação - Cereais - Casas',
  'Gas':      'Alimentação - Cereais - Casas',
};

function excelSerialToDate(serial) {
  if (!serial || isNaN(serial)) return null;
  const date = new Date((serial - 25569) * 86400 * 1000);
  return date;
}

function excelDateToStr(serial) {
  const d = excelSerialToDate(serial);
  if (!d) return '—';
  return d.toLocaleDateString('pt-BR');
}

// ── Inicializa a página ────────────────────────────────────
async function initFinanceiroCompras() {
  finSetTab('painel', document.getElementById('fin-tab-painel'));
  if (typeof suppliersCache !== 'undefined' && !suppliersCache.length) {
    try { const snap = await db.collection('suppliers').orderBy('nome').get(); suppliersCache = snap.docs.map(d => ({ id: d.id, ...d.data() })); }
    catch (e) { console.error('suppliers (limite de crédito):', e); }
  }
  await finCarregarResumoFretes();
  await finCarregarDados();
  await finCarregarNFs();
  pagInicializar();
}

// Mostra limite/utilizado/disponível do fornecedor selecionado no filtro —
// pra saber, na hora de decidir um pagamento, se ainda há crédito com ele.
// suppliers.limite/utilizado é cadastro manual (Suprimentos > Fornecedores);
// não é recalculado a partir do financeiro real, só exibido aqui.
function finAtualizarCreditoFornecedor() {
  const painel = document.getElementById('fin-forn-credito');
  if (!painel) return;
  const nomeSel = v('fin-filtro-forn');
  if (!nomeSel || typeof suppliersCache === 'undefined') { painel.style.display = 'none'; return; }
  const s = suppliersCache.find(x => (x.nome || '').trim().toLowerCase() === nomeSel.trim().toLowerCase());
  if (!s) { painel.style.display = 'none'; return; }

  const limite = parseFloat(s.limite) || 0;
  const utilizado = parseFloat(s.utilizado) || 0;
  const disponivel = limite - utilizado;
  const pct = limite > 0 ? Math.min(100, (utilizado / limite) * 100) : 0;

  document.getElementById('fin-forn-credito-nome').textContent = s.nome;
  document.getElementById('fin-forn-credito-limite').textContent = limite > 0 ? FMT_FIN(limite) : 'Sem limite cadastrado';
  document.getElementById('fin-forn-credito-utilizado').textContent = FMT_FIN(utilizado);
  const elDisp = document.getElementById('fin-forn-credito-disponivel');
  elDisp.textContent = limite > 0 ? FMT_FIN(disponivel) : '—';
  elDisp.style.color = limite > 0 && disponivel < 0 ? 'var(--danger,#dc2626)' : '';
  const bar = document.getElementById('fin-forn-credito-bar');
  bar.style.width = pct.toFixed(1) + '%';
  bar.style.background = pct >= 100 ? 'var(--danger,#dc2626)' : pct >= 80 ? 'var(--warn,#d97706)' : 'var(--lumen)';
  painel.style.display = '';
}

function finSetTab(tab, btn) {
  ['painel','upload','nfs','pagamentos'].forEach(t => {
    const content = document.getElementById('fin-tab-content-' + t);
    if (content) content.style.display = t === tab ? '' : 'none';
  });
  document.querySelectorAll('.fin-tab-btn').forEach(b => {
    b.style.color = 'var(--text-muted)';
    b.style.fontWeight = '600';
    b.style.borderBottom = '2px solid transparent';
  });
  if (btn) {
    btn.style.color = 'var(--lumen)';
    btn.style.fontWeight = '700';
    btn.style.borderBottom = '2px solid var(--lumen)';
  }
}

// ── Carrega dados do Firestore ─────────────────────────────
async function finCarregarDados() {
  try {
    const snap = await db.collection('compras_financeiro').orderBy('dataCompraSerial','asc').get();
    // Fretes entra junto (linhas já no mesmo formato, ver finCarregarResumoFretes) —
    // assim o filtro Módulo=Frete passa a valer pra tabela/gráficos/exportação também.
    finDados = snap.docs.map(d => ({ id: d.id, ...d.data() })).concat(finFretesLinhas);
    finPopularFiltrosDinamicos();
    finAplicarFiltros();
  } catch(e) {
    console.error('finCarregarDados:', e);
    const tb = document.getElementById('fin-tbody');
    if (e.code === 'permission-denied' || (e.message && e.message.includes('permission'))) {
      if (tb) tb.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:32px;">
        <div style="color:var(--danger);font-weight:700;font-size:15px;margin-bottom:8px;">⚠️ Sem permissão de acesso</div>
        <div style="color:var(--text-muted);font-size:13px;">A coleção <b>compras_financeiro</b> ainda não tem regras de acesso no Firebase.<br>
        Adicione a regra abaixo no <b>Firestore → Regras</b> do console Firebase:<br><br>
        <code style="background:var(--bg);padding:6px 10px;border-radius:6px;font-size:12px;display:inline-block;text-align:left;">
match /compras_financeiro/{doc} {<br>
&nbsp;&nbsp;allow read, write: if request.auth != null;
<br>}</code></div>
      </td></tr>`;
      showToast('⚠️ Sem permissão no Firebase. Verifique as Regras do Firestore.');
    } else {
      if (tb) tb.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:20px;color:var(--danger);">Erro ao carregar dados. Importe o histórico primeiro.</td></tr>';
    }
    finAtualizarStats([]);
  }
}

function finPopularFiltrosDinamicos() {
  const forns = [...new Set(finDados.map(d => d.fornecedor).filter(Boolean))].sort();
  const casas  = [...new Set(finDados.map(d => d.destinatario).filter(Boolean))].sort();

  const selF = document.getElementById('fin-filtro-forn');
  const selC = document.getElementById('fin-filtro-casa');
  const selNFc = document.getElementById('fin-nf-casa');
  if (selF) { selF.innerHTML = '<option value="">Todos</option>' + forns.map(f => `<option>${f}</option>`).join(''); }
  if (selC) { selC.innerHTML = '<option value="">Todas</option>' + casas.map(c => `<option>${c}</option>`).join(''); }
  if (selNFc) { selNFc.innerHTML = '<option value="">Todas</option>' + casas.map(c => `<option>${c}</option>`).join(''); }
}

function v(id) { const el = document.getElementById(id); return el ? el.value : ''; }

function finFiltrarBase(dados, { semModulo } = {}) {
  const mes    = v('fin-filtro-mes');
  const ano    = v('fin-filtro-ano');
  const forn   = v('fin-filtro-forn');
  const casa   = v('fin-filtro-casa');
  const cls    = v('fin-filtro-class');
  const pago   = v('fin-filtro-pago');
  const modulo = semModulo ? '' : v('fin-filtro-modulo');

  return dados.filter(d => {
    if (mes  && d.mes  !== mes)  return false;
    if (ano  && String(d.ano) !== String(ano)) return false;
    if (forn && d.fornecedor  !== forn)  return false;
    if (casa && d.destinatario !== casa) return false;
    if (cls  && d.classificacao !== cls)  return false;
    if (pago === 'Sim' && !FIN_PAGO(d.pago)) return false;
    if (pago === 'nao' && FIN_PAGO(d.pago)) return false;
    if (modulo && (d.modulo || 'suprimentos') !== modulo) return false;
    return true;
  });
}

function finAplicarFiltros() {
  finFiltrados = finFiltrarBase(finDados);

  finAtualizarStats(finFiltrados);
  finAtualizarStatsModulo(finFiltrarBase(finDados, { semModulo: true }));
  finRenderizarTabela(finFiltrados);
  finAtualizarGraficos(finFiltrados);
  finAtualizarCreditoFornecedor();
}

function finAtualizarStatsModulo(dados) {
  // Fretes agora entra em `dados` como linha de verdade (ver finCarregarDados),
  // então passa a respeitar os mesmos filtros de período/situação que
  // Suprimentos e Passagens já respeitavam.
  const porModulo = { suprimentos: { total: 0, qtd: 0 }, passagens: { total: 0, qtd: 0 }, frete: { total: 0, qtd: 0 } };
  dados.forEach(d => {
    const mod = d.modulo || 'suprimentos';
    if (!porModulo[mod]) return;
    porModulo[mod].total += parseFloat(d.valor) || 0;
    porModulo[mod].qtd += 1;
  });
  Object.entries(porModulo).forEach(([mod, { total, qtd }]) => {
    const elV = document.getElementById('fin-mod-' + mod);
    const elQ = document.getElementById('fin-mod-' + mod + '-qtd');
    if (elV) elV.textContent = FMT_FIN(total);
    if (elQ) elQ.textContent = qtd + ' registros';
  });
}

function finLimparFiltros() {
  ['fin-filtro-mes','fin-filtro-ano','fin-filtro-forn','fin-filtro-casa','fin-filtro-class','fin-filtro-pago','fin-filtro-modulo'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  finAplicarFiltros();
}

function finAtualizarStats(dados) {
  const total = dados.reduce((s,d) => s + (parseFloat(d.valor)||0), 0);
  const pago  = dados.filter(d => FIN_PAGO(d.pago)).reduce((s,d) => s + (parseFloat(d.valor)||0), 0);
  const pend  = total - pago;
  const pctPago = total > 0 ? (pago/total*100) : 0;
  const pctPend = total > 0 ? (pend/total*100) : 0;

  const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  const elStyle = (id, p, v) => { const e = document.getElementById(id); if (e) e.style[p] = v; };

  el('fin-s-total', FMT_FIN(total));
  el('fin-s-qtd', dados.length + ' registros');
  el('fin-s-pago', FMT_FIN(pago));
  el('fin-s-pend', FMT_FIN(pend));
  el('fin-s-filtrados', dados.length);
  elStyle('fin-s-pago-bar', 'width', pctPago.toFixed(1) + '%');
  elStyle('fin-s-pend-bar', 'width', pctPend.toFixed(1) + '%');

  // Período
  const meses = [...new Set(dados.map(d => d.mes).filter(Boolean))];
  const anos  = [...new Set(dados.map(d => d.ano).filter(Boolean))];
  const el2 = document.getElementById('fin-s-periodo');
  if (el2) el2.textContent = meses.length > 0 ? meses.join(', ') + ' / ' + anos.join(', ') : '—';

  const cnt = document.getElementById('fin-table-count');
  if (cnt) cnt.textContent = dados.length + ' registros';
}

function finRenderizarTabela(dados) {
  const tb = document.getElementById('fin-tbody');
  if (!tb) return;
  if (dados.length === 0) {
    tb.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--text-muted);">Nenhum registro encontrado para os filtros selecionados.</td></tr>';
    return;
  }
  const sort = document.getElementById('fin-sort')?.value || 'data-desc';
  dados = dados.slice().sort((a, b) => {
    if (sort === 'data-asc')   return String(a.dataCompraStr||'').localeCompare(String(b.dataCompraStr||''));
    if (sort === 'alpha')      return String(a.fornecedor||'').localeCompare(String(b.fornecedor||''), 'pt-BR');
    if (sort === 'valor-desc') return (Number(b.valor)||0) - (Number(a.valor)||0);
    if (sort === 'valor-asc')  return (Number(a.valor)||0) - (Number(b.valor)||0);
    return String(b.dataCompraStr||'').localeCompare(String(a.dataCompraStr||'')); // data-desc
  });
  tb.innerHTML = dados.slice(0, 500).map(d => {
    const isPago = FIN_PAGO(d.pago);
    const badge = isPago
      ? `<button onclick="finTogglePago('${d.id}',false)" title="Clique para marcar como pendente"
           style="background:var(--ok-bg);color:var(--ok);border:1px solid var(--ok);border-radius:20px;padding:4px 12px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">✅ Pago</button>`
      : `<button onclick="finTogglePago('${d.id}',true)" title="Clique para marcar como pago"
           style="background:var(--warn-bg);color:var(--warn);border:1px solid var(--warn);border-radius:20px;padding:4px 12px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">⏳ Pendente</button>`;
    const badgeSP = d.lancadoSP === 'Sim'
      ? '<span class="fin-badge-pago">✅</span>'
      : '<span style="color:var(--text-muted);font-size:11px;">—</span>';
    const rowBg = !isPago && d.vencimentoSerial && d.vencimentoSerial < (Date.now()/86400000 + 25569) ? 'background:rgba(198,40,40,0.07);' : '';
    return `<tr style="${rowBg}">
      <td style="font-weight:700;">${d.fornecedor||'—'}</td>
      <td><span class="block-badge">${d.classificacao||'—'}</span></td>
      <td>${d.destinatario||'—'}</td>
      <td style="font-size:11px;color:var(--text-muted);">${d.mes||''}/${d.ano||''}</td>
      <td style="font-size:11px;">${d.dataCompraStr||'—'}</td>
      <td style="font-size:11px;">${d.vencimentoStr||'—'}</td>
      <td style="text-align:center;font-size:11px;color:var(--text-muted);">${d.diasPrazo||'—'}d</td>
      <td class="td-r" style="color:var(--lumen);">${FMT_FIN(d.valor)}</td>
      <td style="text-align:center;">${badge}</td>
      <td style="text-align:center;">${badgeSP}</td>
    </tr>`;
  }).join('');
  if (dados.length > 500) {
    tb.innerHTML += `<tr><td colspan="10" style="text-align:center;padding:10px;color:var(--text-muted);font-size:12px;">Mostrando 500 de ${dados.length} registros. Use os filtros para refinar.</td></tr>`;
  }
}

function finAtualizarGraficos(dados) {
  // Gráfico por Fornecedor
  const porForn = {};
  dados.forEach(d => { porForn[d.fornecedor||'Outros'] = (porForn[d.fornecedor||'Outros']||0) + (parseFloat(d.valor)||0); });
  const fornEntries = Object.entries(porForn).sort((a,b) => b[1]-a[1]).slice(0,8);

  const ctx1 = document.getElementById('fin-chart-forn');
  if (ctx1) {
    if (finChartForn) finChartForn.destroy();
    finChartForn = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: fornEntries.map(([k]) => k),
        datasets: [{ label: 'Total (R$)', data: fornEntries.map(([,v]) => v),
          backgroundColor: ['#2B9FA8','#3BB5BF','#E8C832','#1A7A44','#C0392B','#7B68EE','#FF8C00','#20B2AA'] }]
      },
      options: { responsive: true, plugins: { legend: { display: false } },
        scales: { y: { ticks: { callback: v => 'R$'+Math.round(v/1000)+'k' } } } }
    });
  }

  // Gráfico por Classificação
  const porClass = {};
  dados.forEach(d => { porClass[d.classificacao||'Outros'] = (porClass[d.classificacao||'Outros']||0) + (parseFloat(d.valor)||0); });
  const classEntries = Object.entries(porClass).sort((a,b) => b[1]-a[1]);

  const ctx2 = document.getElementById('fin-chart-class');
  if (ctx2) {
    if (finChartClass) finChartClass.destroy();
    finChartClass = new Chart(ctx2, {
      type: 'doughnut',
      data: {
        labels: classEntries.map(([k]) => k),
        datasets: [{ data: classEntries.map(([,v]) => v),
          backgroundColor: ['#2B9FA8','#E8C832','#1A7A44','#C0392B','#7B68EE','#FF8C00'] }]
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } } }
    });
  }

  // Gráfico mensal
  const ORDEM_MESES = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];
  const porMes = {};
  dados.forEach(d => {
    const chave = (d.mes||'').toUpperCase() + '/' + (d.ano||'');
    porMes[chave] = (porMes[chave]||0) + (parseFloat(d.valor)||0);
  });
  const mensalEntries = Object.entries(porMes).sort(([a],[b]) => {
    const [ma, ya] = a.split('/'); const [mb, yb] = b.split('/');
    const ia = parseInt(ya)*12 + ORDEM_MESES.indexOf(ma);
    const ib = parseInt(yb)*12 + ORDEM_MESES.indexOf(mb);
    return ia - ib;
  });

  const ctx3 = document.getElementById('fin-chart-mensal');
  if (ctx3) {
    if (finChartMensal) finChartMensal.destroy();
    finChartMensal = new Chart(ctx3, {
      type: 'line',
      data: {
        labels: mensalEntries.map(([k]) => k),
        datasets: [{ label: 'Total mensal (R$)', data: mensalEntries.map(([,v]) => v),
          borderColor: '#2B9FA8', backgroundColor: 'rgba(43,159,168,0.1)',
          tension: 0.3, fill: true, pointRadius: 4 }]
      },
      options: { responsive: true, plugins: { legend: { display: false } },
        scales: { y: { ticks: { callback: v => 'R$'+Math.round(v/1000)+'k' } } } }
    });
  }
}

// ── UPLOAD E IMPORTAÇÃO ────────────────────────────────────
function finHandleDrop(event) {
  event.preventDefault();
  document.getElementById('fin-drop-area').classList.remove('dragover');
  const file = event.dataTransfer.files[0];
  if (file) finLerArquivo(file);
}

function finLerArquivo(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      // Tenta ler a aba 2025 primeiro, depois 2024, depois a primeira
      let sheetName = wb.SheetNames.find(s => s === '2025') ||
                      wb.SheetNames.find(s => s === '2024') ||
                      wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      // Achar a linha de cabeçalho (que contém "Fornecedor" ou "Empresa")
      let headerRow = -1;
      for (let i = 0; i < Math.min(raw.length, 10); i++) {
        if (raw[i].some(c => {
          const s = String(c).toLowerCase();
          return s.includes('fornecedor') || s === 'empresa' || s === 'la';
        })) { headerRow = i; break; }
      }
      if (headerRow < 0) { showToast('❌ Cabeçalho não encontrado. Verifique o arquivo.'); return; }

      const headers = raw[headerRow].map(h => String(h).trim());
      const dataRows = raw.slice(headerRow + 1).filter(r => r.some(c => c !== ''));

      // Mapear colunas (compatível com aba 2025 e 2024)
      const colIdx = {};
      const COL_MAP = {
        fornecedor: ['fornecedor', 'empresa', 'la'],
        classificacao: ['classificação', 'classificacao'],
        destinatario: ['destinatário', 'destinatario'],
        valor: ['valor'],
        valorNF: ['valor na nf', 'valornf'],
        dataCompra: ['data de compra', 'datacompra'],
        diasPrazo: ['dias de prazo', 'dias prazo'],
        vencimento: ['vencimento'],
        pedidoRealizado: ['pedido realizado'],
        nfRecebidas: ['nf recebidas'],
        lancadoHYB: ['lançado hyb', 'lancado hyb'],
        lancadoSP: ['lançado sp', 'lancado sp'],
        pago: ['pago'],
        mes: ['mês', 'mes'],
        ano: ['ano'],
      };
      Object.entries(COL_MAP).forEach(([key, aliases]) => {
        const idx = headers.findIndex(h => aliases.some(a => h.toLowerCase().includes(a)));
        if (idx >= 0) colIdx[key] = idx;
      });

      finPreviewDados = dataRows.map(row => {
        const d = {};
        Object.entries(colIdx).forEach(([key, idx]) => { d[key] = row[idx] !== undefined ? row[idx] : ''; });
        return d;
      }).filter(d => d.fornecedor);

      // Preview
      document.getElementById('fin-upload-info').textContent = `Aba: ${sheetName} — ${finPreviewDados.length} registros encontrados`;
      document.getElementById('fin-upload-detail').textContent = `Colunas mapeadas: ${Object.keys(colIdx).join(', ')}`;

      const pt = document.getElementById('fin-preview-table');
      const cols = ['fornecedor','classificacao','destinatario','mes','ano','valor','pago'];
      pt.innerHTML = '<thead><tr>' + cols.map(c => `<th style="padding:6px 10px;font-size:10px;background:var(--bg);text-transform:uppercase;">${c}</th>`).join('') + '</tr></thead>' +
        '<tbody>' + finPreviewDados.slice(0,10).map(d =>
          '<tr>' + cols.map(c => `<td style="padding:6px 10px;font-size:11px;border-bottom:1px solid var(--border);">${d[c]||'—'}</td>`).join('') + '</tr>'
        ).join('') + '</tbody>';

      document.getElementById('fin-upload-preview').style.display = '';
      document.getElementById('fin-drop-area').style.display = 'none';
    } catch(err) {
      console.error(err);
      showToast('❌ Erro ao ler o arquivo: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

function finCancelarUpload() {
  document.getElementById('fin-upload-preview').style.display = 'none';
  document.getElementById('fin-drop-area').style.display = '';
  document.getElementById('fin-file-input').value = '';
  finPreviewDados = [];
}

// ── GERAÇÃO DE CHAVE ÚNICA POR REGISTRO ───────────────────────────────────────
// A chave é composta por fornecedor + data de compra + valor + destinatário.
// Isso garante que o mesmo registro nunca seja inserido duas vezes.
function finGerarChaveUnica(d) {
  const forn  = String(d.fornecedor  || '').trim().toLowerCase().replace(/\s+/g,'_');
  const dest  = String(d.destinatario|| '').trim().toLowerCase().replace(/\s+/g,'_');
  const data  = String(d.dataCompra  || '0').trim();
  const valor = String(parseFloat(d.valor) || 0);
  const mes   = String(d.mes         || '').trim().toUpperCase();
  const ano   = String(parseInt(d.ano) || new Date().getFullYear());
  return `${forn}__${dest}__${data}__${valor}__${mes}__${ano}`;
}

async function finImportarNoFirestore() {
  if (!finPreviewDados.length) return;

  const progTxt = document.getElementById('fin-upload-progress-text');
  document.getElementById('fin-upload-preview').style.display = 'none';
  document.getElementById('fin-upload-progress').style.display = '';
  progTxt.textContent = 'Verificando duplicatas no sistema...';

  try {
    // 1. Busca todas as chaves já existentes no Firestore
    const snapExist = await db.collection('compras_financeiro')
      .select('chaveUnica').get();
    const chavesExistentes = new Set(
      snapExist.docs.map(d => d.data().chaveUnica).filter(Boolean)
    );

    // 2. Separa os novos dos duplicados
    const novos      = [];
    const duplicados = [];
    finPreviewDados.forEach(d => {
      const chave = finGerarChaveUnica(d);
      if (chavesExistentes.has(chave)) duplicados.push({ ...d, chaveUnica: chave });
      else                              novos.push({ ...d, chaveUnica: chave });
    });

    // 3. Avisa o usuário se houver duplicatas
    if (duplicados.length > 0 && novos.length === 0) {
      document.getElementById('fin-upload-progress').style.display = 'none';
      document.getElementById('fin-drop-area').style.display = '';
      document.getElementById('fin-file-input').value = '';
      finPreviewDados = [];
      showToast(`⚠️ Todos os ${duplicados.length} registros já existem no sistema. Nada foi importado.`);
      return;
    }
    if (duplicados.length > 0) {
      const ok = confirm(
        `⚠️ ATENÇÃO: ${duplicados.length} registro(s) desta planilha já existem no sistema e serão IGNORADOS.\n\n` +
        `✅ ${novos.length} registro(s) NOVOS serão importados.\n\n` +
        `Deseja continuar?`
      );
      if (!ok) {
        document.getElementById('fin-upload-progress').style.display = 'none';
        document.getElementById('fin-upload-preview').style.display = '';
        return;
      }
    }

    // 4. Importa apenas os novos em lotes
    const BATCH_SIZE = 400;
    let importados = 0;
    for (let i = 0; i < novos.length; i += BATCH_SIZE) {
      const lote = novos.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      lote.forEach(d => {
        // Usa a chaveUnica como ID do documento — impede duplicatas futuras
        const ref = db.collection('compras_financeiro').doc(d.chaveUnica);
        const dataSerial = parseFloat(d.dataCompra) || 0;
        const vencSerial  = parseFloat(d.vencimento) || 0;
        batch.set(ref, {
          fornecedor:       String(d.fornecedor  ||'').trim(),
          classificacao:    String(d.classificacao||'').trim(),
          destinatario:     String(d.destinatario ||'').trim(),
          valor:            parseFloat(d.valor) || 0,
          valorNF:          String(d.valorNF||'').trim(),
          dataCompraSerial: dataSerial,
          dataCompraStr:    excelDateToStr(dataSerial),
          diasPrazo:        parseInt(d.diasPrazo) || 0,
          vencimentoSerial: vencSerial,
          vencimentoStr:    excelDateToStr(vencSerial),
          pedidoRealizado:  String(d.pedidoRealizado||'').trim(),
          nfRecebidas:      String(d.nfRecebidas||'').trim(),
          lancadoHYB:       String(d.lancadoHYB||'').trim(),
          lancadoSP:        String(d.lancadoSP||'').trim(),
          pago:             String(d.pago||'').trim(),
          mes:              String(d.mes||'').toUpperCase().trim(),
          ano:              parseInt(d.ano) || new Date().getFullYear(),
          chaveUnica:       d.chaveUnica,
          importadoEm:      firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      });
      await batch.commit();
      importados += lote.length;
      progTxt.textContent = `Importando... ${importados} de ${novos.length}`;
    }

    document.getElementById('fin-upload-progress').style.display = 'none';
    document.getElementById('fin-drop-area').style.display = '';
    document.getElementById('fin-file-input').value = '';
    finPreviewDados = [];

    if (duplicados.length > 0) {
      showToast(`✅ ${importados} importados. ⚠️ ${duplicados.length} já existiam e foram ignorados.`);
    } else {
      showToast(`✅ ${importados} registros importados com sucesso!`);
    }
    await finCarregarDados();
    finSetTab('painel', document.getElementById('fin-tab-painel'));

  } catch(e) {
    console.error(e);
    document.getElementById('fin-upload-progress').style.display = 'none';
    document.getElementById('fin-drop-area').style.display = '';
    if (e.code === 'permission-denied' || (e.message && e.message.includes('permission'))) {
      showToast('⚠️ Sem permissão no Firebase. Verifique as Regras do Firestore para a coleção compras_financeiro.');
    } else {
      showToast('❌ Erro na importação: ' + e.message);
    }
  }
}

// ── Normalização de datas para detecção de duplicatas ──────────────────────
// IMPORTANTE: 'compras_financeiro' recebe registros de DUAS origens com formatos
// de data incompatíveis:
//  1) Importação de planilha -> dataCompraSerial em serial Excel (~45000)
//  2) Lançamento automático (pedido liberado, lancarPedidoNoFinanceiro) ->
//     dataCompraSerial em timestamp JS de criação do registro (Date.now(),
//     ~1.7 trilhão), que por definição quase nunca repete entre dois
//     lançamentos — mesmo que sejam duplicatas reais do mesmo pedido
//     (ex: duplo clique em "liberar pedido"). Por isso NÃO usamos
//     dataCompraSerial na chave de duplicata: usamos o Vencimento, que é
//     estável (data, sem hora) nos dois casos.
function _vencNormalizado(d) {
  if (d.vencimentoSerial) {
    const dt = excelSerialToDate(d.vencimentoSerial);
    if (dt && !isNaN(dt)) return dt.toISOString().slice(0,10);
  }
  const s = String(d.vencimentoStr || '').trim();
  if (!s || s === '—') return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;             // já está em YYYY-MM-DD
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);          // formato DD/MM/YYYY
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return s;
}

function _chaveDuplicata(d) {
  const forn  = String(d.fornecedor    || '').trim().toLowerCase().replace(/\s+/g,'_');
  const dest  = String(d.destinatario  || '').trim().toLowerCase().replace(/\s+/g,'_');
  const cls   = String(d.classificacao || '').trim().toLowerCase().replace(/\s+/g,'_');
  const venc  = _vencNormalizado(d);
  const valor = String(parseFloat(d.valor) || 0);
  const mes   = String(d.mes || '').trim().toUpperCase();
  const ano   = String(d.ano || '');
  return `${forn}__${dest}__${cls}__${venc}__${valor}__${mes}__${ano}`;
}

// ── REVISÃO MANUAL DE DUPLICADOS (aba Pagamentos) ──────────────────────────
// Diferente de finLimparDuplicatasFirestore (que exclui tudo de uma vez sem
// mostrar o que será apagado), esta função lista os grupos de duplicados e
// deixa o usuário escolher, grupo a grupo, qual registro manter.
let _dupGroups = [];

async function pagAbrirRevisaoDuplicados() {
  openModal('modal-dup-pag');
  const body = document.getElementById('modal-dup-pag-body');
  body.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-muted);"><div class="spinner spinner-dark" style="margin:0 auto 12px;"></div>Analisando lançamentos...</div>';
  document.getElementById('dup-pag-resumo').textContent = '';
  document.getElementById('btn-dup-pag-excluir').disabled = true;
  document.getElementById('btn-dup-pag-excluir').textContent = '🗑️ Excluir selecionados (0)';

  try {
    const snap = await db.collection('compras_financeiro').get();
    const todos = snap.docs.map(d => ({ docId: d.id, ...d.data() }));

    const grupos = new Map();
    todos.forEach(d => {
      const chave = _chaveDuplicata(d);
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave).push(d);
    });

    _dupGroups = [...grupos.entries()]
      .filter(([,docs]) => docs.length > 1)
      .map(([chave, docs], idx) => {
        // sugestão de qual manter: prioriza o já marcado como Pago, depois Lançado SP, depois o mais antigo (importadoEm)
        const ordenados = [...docs].sort((a,b) => {
          const score = x => (FIN_PAGO(x.pago) ? 2 : 0) + (x.lancadoSP === 'Sim' ? 1 : 0);
          const sd = score(b) - score(a);
          if (sd !== 0) return sd;
          const ta = a.importadoEm?.toMillis ? a.importadoEm.toMillis() : 0;
          const tb = b.importadoEm?.toMillis ? b.importadoEm.toMillis() : 0;
          return ta - tb;
        });
        return { gid: 'g' + idx, chave, docs, manterSugerido: ordenados[0].docId };
      });

    if (_dupGroups.length === 0) {
      body.innerHTML = '<div style="text-align:center;padding:32px;color:var(--ok);">✅ Nenhum lançamento duplicado encontrado.</div>';
      return;
    }

    body.innerHTML = _dupGroups.map(g => {
      const d0 = g.docs[0];
      const valorFmt = (parseFloat(d0.valor)||0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
      const rows = g.docs.map(d => {
        const imp = d.importadoEm?.toDate ? d.importadoEm.toDate().toLocaleString('pt-BR') : '—';
        const comp = d.dataCompraStr || (d.dataCompraSerial > 1000000000
          ? new Date(d.dataCompraSerial).toLocaleDateString('pt-BR')
          : excelDateToStr(d.dataCompraSerial)) || '—';
        return `<tr>
          <td style="text-align:center;"><input type="radio" name="keep-${g.gid}" value="${d.docId}" ${d.docId === g.manterSugerido ? 'checked' : ''} onchange="pagAtualizarResumoDup()"></td>
          <td style="font-size:11px;">${comp}</td>
          <td style="font-size:11px;">${d.vencimentoStr || '—'}</td>
          <td style="font-size:11px;text-align:center;">${FIN_PAGO(d.pago) ? '✅' : '—'}</td>
          <td style="font-size:11px;text-align:center;">${d.lancadoSP === 'Sim' || d.lancadoSP === true ? '✅' : '—'}</td>
          <td style="font-size:11px;color:var(--text-muted);">${imp}</td>
          <td style="font-size:10px;font-family:monospace;color:var(--text-muted);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${d.docId}</td>
        </tr>`;
      }).join('');
      return `<div class="dup-group" data-gid="${g.gid}" style="border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
          <strong style="font-size:13px;">${d0.fornecedor || '—'} • ${d0.destinatario || '—'} • ${d0.mes || ''}/${d0.ano || ''} • ${valorFmt} <span style="font-weight:400;color:var(--text-muted);">(${g.docs.length} cópias)</span></strong>
          <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-muted);cursor:pointer;">
            <input type="checkbox" class="dup-skip" data-gid="${g.gid}" onchange="pagAtualizarResumoDup()"> Não excluir este grupo
          </label>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="text-align:left;color:var(--text-muted);font-size:10px;text-transform:uppercase;">
            <th style="width:60px;text-align:center;">Manter</th><th>Competência</th><th>Vencimento</th><th style="text-align:center;">Pago</th><th style="text-align:center;">Lanç. SP</th><th>Importado em</th><th>ID</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    }).join('');

    pagAtualizarResumoDup();

  } catch(e) {
    console.error('pagAbrirRevisaoDuplicados:', e);
    body.innerHTML = `<div style="text-align:center;padding:32px;color:var(--danger);">Erro ao analisar: ${e.message}</div>`;
  }
}

function pagAtualizarResumoDup() {
  let totalExcluir = 0;
  let gruposAfetados = 0;
  _dupGroups.forEach(g => {
    const skip = document.querySelector(`.dup-skip[data-gid="${g.gid}"]`)?.checked;
    if (skip) return;
    totalExcluir += g.docs.length - 1; // todos exceto o "manter" selecionado
    gruposAfetados++;
  });
  const btn = document.getElementById('btn-dup-pag-excluir');
  btn.textContent = `🗑️ Excluir selecionados (${totalExcluir})`;
  btn.disabled = totalExcluir === 0;
  document.getElementById('dup-pag-resumo').textContent =
    `${_dupGroups.length} grupo(s) de duplicados encontrados • ${gruposAfetados} grupo(s) serão afetados`;
}

async function pagExcluirDuplicadosSelecionados() {
  const deletar = [];
  _dupGroups.forEach(g => {
    const skip = document.querySelector(`.dup-skip[data-gid="${g.gid}"]`)?.checked;
    if (skip) return;
    const manterId = document.querySelector(`input[name="keep-${g.gid}"]:checked`)?.value;
    g.docs.forEach(d => { if (d.docId !== manterId) deletar.push(d.docId); });
  });

  if (deletar.length === 0) { showToast('Nada selecionado para excluir.'); return; }

  const ok = confirm(`Confirma a exclusão de ${deletar.length} lançamento(s) duplicado(s)?\n\nEsta ação é irreversível.`);
  if (!ok) return;

  const btn = document.getElementById('btn-dup-pag-excluir');
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Excluindo...';

  try {
    const BATCH_SIZE = 400;
    for (let i = 0; i < deletar.length; i += BATCH_SIZE) {
      const lote = deletar.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      lote.forEach(id => batch.delete(db.collection('compras_financeiro').doc(id)));
      await batch.commit();
    }
    showToast(`✅ ${deletar.length} lançamento(s) duplicado(s) excluído(s)!`);
    closeModal('modal-dup-pag');
    await finCarregarDados();
    if (typeof pagFiltrar === 'function') pagFiltrar();
  } catch(e) {
    console.error('pagExcluirDuplicadosSelecionados:', e);
    showToast('❌ Erro ao excluir: ' + e.message);
    btn.textContent = original;
    btn.disabled = false;
  }
}


// Para registros importados ANTES desta atualização (sem chaveUnica),
// esta função escaneia tudo e remove duplicatas mantendo apenas 1 de cada grupo.
async function finLimparDuplicatasFirestore() {
  const ok = confirm(
    '🔍 LIMPAR DUPLICATAS\n\n' +
    'Esta função vai analisar TODOS os registros do Firestore, identificar\n' +
    'entradas duplicadas (mesmo fornecedor + data + valor + destinatário)\n' +
    'e excluir as cópias extras, mantendo apenas 1 por grupo.\n\n' +
    'Isso é irreversível. Deseja continuar?'
  );
  if (!ok) return;

  const progTxt = document.getElementById('fin-upload-progress-text');
  document.getElementById('fin-drop-area').style.display = 'none';
  document.getElementById('fin-upload-progress').style.display = '';
  progTxt.textContent = 'Carregando todos os registros...';

  try {
    const snap = await db.collection('compras_financeiro').get();
    const todos = snap.docs.map(d => ({ docId: d.id, ...d.data() }));

    progTxt.textContent = `${todos.length} registros encontrados. Analisando...`;

    // Agrupa por chave: mantém o primeiro, marca o restante para deletar
    const visto   = new Map();
    const deletar = [];

    todos.forEach(d => {
      // Usa a mesma chave normalizada (por Vencimento) de _chaveDuplicata —
      // dataCompraSerial NÃO é confiável aqui (ver comentário acima de _chaveDuplicata)
      const chave = _chaveDuplicata(d);

      if (visto.has(chave)) {
        deletar.push(d.docId);
      } else {
        visto.set(chave, d.docId);
        // Aproveita e grava a chaveUnica se ainda não tiver
        if (!d.chaveUnica) {
          db.collection('compras_financeiro').doc(d.docId).update({ chaveUnica: chave })
            .catch(() => {});
        }
      }
    });

    if (deletar.length === 0) {
      document.getElementById('fin-upload-progress').style.display = 'none';
      document.getElementById('fin-drop-area').style.display = '';
      showToast('✅ Nenhuma duplicata encontrada! Os dados já estão limpos.');
      return;
    }

    // Exclui em lotes de 400
    progTxt.textContent = `Excluindo ${deletar.length} duplicatas...`;
    const BATCH_SIZE = 400;
    let excluidos = 0;
    for (let i = 0; i < deletar.length; i += BATCH_SIZE) {
      const lote = deletar.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      lote.forEach(id => batch.delete(db.collection('compras_financeiro').doc(id)));
      await batch.commit();
      excluidos += lote.length;
      progTxt.textContent = `Excluindo duplicatas... ${excluidos} de ${deletar.length}`;
    }

    document.getElementById('fin-upload-progress').style.display = 'none';
    document.getElementById('fin-drop-area').style.display = '';
    showToast(`✅ ${excluidos} duplicatas removidas! Restaram ${todos.length - excluidos} registros únicos.`);
    await finCarregarDados();

  } catch(e) {
    console.error(e);
    document.getElementById('fin-upload-progress').style.display = 'none';
    document.getElementById('fin-drop-area').style.display = '';
    showToast('❌ Erro ao limpar duplicatas: ' + e.message);
  }
}

// ── NFs e BOLETOS ──────────────────────────────────────────
let finNFsData = [];
let finFiltradosNFs = [];

async function finCarregarNFs() {
  try {
    // Busca todos os pedidos com status relevante (sem índice composto)
    const snap = await db.collection('orders')
      .orderBy('createdAt','desc')
      .limit(500)
      .get();
    const relevantes = ['aguardando_nf','pedido_liberado','andamento','concluido','pendente_pag','aprovado'];
    finNFsData = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(d => !d.status || relevantes.includes(d.status));
    finFiltradosNFs = finNFsData;
    finRenderizarNFs(finNFsData);
  } catch(e) {
    console.error('finCarregarNFs:', e);
    const tb = document.getElementById('fin-nf-tbody');
    if (tb) tb.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--text-muted);">Nenhum pedido com NF/Boleto encontrado ainda.</td></tr>';
  }
}

function finFiltrarNFs() {
  const search = (v('fin-nf-search')||'').toLowerCase();
  const casa   = v('fin-nf-casa');
  const status = v('fin-nf-status');
  const filtrados = finNFsData.filter(d => {
    if (search && !(d.code||'').toLowerCase().includes(search) && !(d.house||'').toLowerCase().includes(search)) return false;
    if (casa && d.house !== casa) return false;
    if (status === 'com_nf' && !d.nfNumero) return false;
    if (status === 'sem_nf' && d.nfNumero) return false;
    return true;
  });
  finFiltradosNFs = filtrados;
  finRenderizarNFs(filtrados);
}

function finRenderizarNFs(dados) {
  const tb = document.getElementById('fin-nf-tbody');
  if (!tb) return;
  if (!dados.length) {
    tb.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--text-muted);">Nenhum pedido encontrado.</td></tr>';
    return;
  }
  tb.innerHTML = dados.map(d => {
    const dataP = d.createdAt?.toDate ? d.createdAt.toDate().toLocaleDateString('pt-BR') : '—';
    const temNF = d.nfNumero || d.nfFileName;
    const temBol = d.boletoVencimento || d.boletoFileName;
    const iconNF = d.nfFileURL
      ? `<a href="${d.nfFileURL}" target="_blank" style="color:var(--ok);font-weight:700;font-size:11px;text-decoration:none;">📄 ${d.nfFileName||'Ver NF'}</a>`
      : d.nfFileName
        ? `<span style="color:var(--lumen);font-size:11px;">📎 ${d.nfFileName}</span>`
        : '<span style="color:var(--text-muted);font-size:11px;">—</span>';
    const iconBol = d.boletoFileURL
      ? `<a href="${d.boletoFileURL}" target="_blank" style="color:var(--ok);font-weight:700;font-size:11px;text-decoration:none;">📄 Venc: ${d.boletoVencimento||'Ver'}</a>`
      : d.boletoFileName
        ? `<span style="color:var(--lumen);font-size:11px;">📎 ${d.boletoFileName}</span>`
        : d.boletoVencimento
          ? `<span style="color:var(--warn);font-size:11px;">⏳ Venc: ${d.boletoVencimento}</span>`
          : '<span style="color:var(--text-muted);font-size:11px;">—</span>';
    return `<tr>
      <td><span style="font-size:12px;font-weight:700;color:var(--lumen);">${d.code||d.id}</span></td>
      <td>${d.house||'—'}</td>
      <td style="font-size:11px;">${dataP}</td>
      <td style="font-size:12px;">${d.fornecedorNome||'—'}</td>
      <td class="td-r">${d.nfValor > 0 ? FMT_FIN(d.nfValor) : '—'}</td>
      <td style="font-size:11px;">${d.nfNumero||'—'}</td>
      <td style="font-size:11px;">${d.boletoVencimento||'—'}</td>
      <td style="text-align:center;">${iconNF}</td>
      <td style="text-align:center;">${iconBol}</td>
      <td style="text-align:center;"><button class="btn btn-outline btn-sm" onclick="goPage('all-orders');setTimeout(()=>showOrderDetail('${d.id}'),800);">Ver Pedido</button></td>
    </tr>`;
  }).join('');
}

function finExportarNFsExcel() {
  if (!finNFsData.length) { showToast('Nenhum dado para exportar!'); return; }

  // Cabeçalho — "Link NF" e "Link Boleto" serão células com hyperlink clicável
  const header = ['Pedido','Casa','Data','Fornecedor','Valor NF (R$)','Nº NF','Venc. Boleto',
                  'Arquivo NF','Link NF (clique para baixar)','Arquivo Boleto','Link Boleto (clique para baixar)','Status'];
  const rows = [header];

  finNFsData.forEach(d => {
    const dataP = d.createdAt?.toDate ? d.createdAt.toDate().toLocaleDateString('pt-BR') : '';
    rows.push([
      d.code||d.id,
      d.house||'',
      dataP,
      d.fornecedorNome||'',
      d.nfValor||0,
      d.nfNumero||'',
      d.boletoVencimento||'',
      d.nfFileName||'',
      d.nfFileURL ? '⬇ Baixar NF' : '—',        // texto da célula linkada
      d.boletoFileName||'',
      d.boletoFileURL ? '⬇ Baixar Boleto' : '—', // texto da célula linkada
      d.status||''
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // ── Adicionar hyperlinks clicáveis nas colunas de link (I=col 8, K=col 10) ──
  finNFsData.forEach((d, i) => {
    const rowIdx = i + 1; // +1 porque linha 0 é o cabeçalho
    // Link NF — coluna I (índice 8)
    if (d.nfFileURL) {
      const cellNF = XLSX.utils.encode_cell({ r: rowIdx, c: 8 });
      ws[cellNF] = {
        v: '⬇ Baixar NF',
        t: 's',
        l: { Target: d.nfFileURL, Tooltip: d.nfFileName || 'Baixar NF' }
      };
    }
    // Link Boleto — coluna K (índice 10)
    if (d.boletoFileURL) {
      const cellBol = XLSX.utils.encode_cell({ r: rowIdx, c: 10 });
      ws[cellBol] = {
        v: '⬇ Baixar Boleto',
        t: 's',
        l: { Target: d.boletoFileURL, Tooltip: d.boletoFileName || 'Baixar Boleto' }
      };
    }
  });

  ws['!cols'] = [
    { wch: 24 }, // Pedido
    { wch: 22 }, // Casa
    { wch: 12 }, // Data
    { wch: 26 }, // Fornecedor
    { wch: 14 }, // Valor NF
    { wch: 14 }, // Nº NF
    { wch: 14 }, // Venc. Boleto
    { wch: 26 }, // Arquivo NF
    { wch: 24 }, // Link NF
    { wch: 26 }, // Arquivo Boleto
    { wch: 24 }, // Link Boleto
    { wch: 18 }, // Status
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'NFs e Boletos');
  XLSX.writeFile(wb, 'NFs-Boletos-' + new Date().toISOString().slice(0,10) + '.xlsx');
  showToast('✅ Excel de NFs exportado com links clicáveis!');
}

// ── Exportação Conta Azul a partir dos PEDIDOS (aba NFs e Boletos) ──
// Mesmo layout/colunas do formato Conta Azul usado em Painel/Pagamentos,
// mas a partir dos dados de `orders` (Pedido, Casa, Fornecedor, Valor NF, Venc. Boleto).
async function finExportarNFsContaAzul() {
  const dados = (finFiltradosNFs && finFiltradosNFs.length) ? finFiltradosNFs : finNFsData;
  if (!dados.length) { showToast('Nenhum dado para exportar!'); return; }

  await _caGarantirFornecedores();
  const mapaDocs = _caMapaDocs();

  const header = ['Data de Competência','Data de Vencimento','Data de Pagamento','Valor','Categoria','Descrição','Cliente/Fornecedor','CNPJ/CPF Cliente/Fornecedor','Centro de Custo','Observações'];
  const linhas = [header];
  let semDoc = 0;
  let semNF  = 0;

  dados.forEach(d => {
    if (!(d.nfValor > 0)) { semNF++; return; } // sem NF lançada ainda: não entra no Conta Azul

    const dtComp = d.createdAt?.toDate ? d.createdAt.toDate() : null;
    const dtVenc = d.boletoVencimento ? new Date(d.boletoVencimento + 'T00:00:00') : dtComp;
    const pago   = d.status === 'concluido'; // ajuste se "concluido" não corresponder a "pago" no seu fluxo real
    const dtPag  = pago && d.updatedAt?.toDate ? d.updatedAt.toDate() : '';

    const valor  = -Math.abs(parseFloat(d.nfValor) || 0); // saída = negativo

    const catKeys = (Array.isArray(d.categories) && d.categories.length)
      ? d.categories                          // categorias com que o pedido foi REGISTRADO (fonte confiável)
      : Object.keys(d.items || {});           // fallback p/ pedidos antigos sem o campo 'categories'
    const catNomes = catKeys.map(k => window.CATEGORIAS?.[k]?.nome || k);
    const categoria = catNomes.length ? [...new Set(catNomes)].join(', ') : '';

    const forn   = String(d.fornecedorNome || '').trim();
    const docFis = mapaDocs.get(_caNorm(forn)) || '';
    if (forn && !docFis) semDoc++;

    const desc = `Pedido ${d.code || d.id}${d.nfNumero ? ' - NF ' + d.nfNumero : ''}`;

    linhas.push([ dtComp || '', dtVenc || '', dtPag, valor, categoria, desc, forn, docFis, d.house || '', d.attachObs || '' ]);
  });

  if (linhas.length === 1) { showToast('Nenhum pedido com NF lançada para exportar.'); return; }

  const ws = XLSX.utils.aoa_to_sheet(linhas, { cellDates: true });
  for (let r = 1; r < linhas.length; r++) {
    ['A','B','C'].forEach(col => { const c = ws[col + (r+1)]; if (c && c.v instanceof Date) { c.t='d'; c.z='dd/mm/yyyy'; } });
    const h = ws['H' + (r+1)];
    if (h && h.v !== undefined && h.v !== '') { h.t='s'; h.v = String(h.v); }
  }
  ws['!cols'] = [{wch:18},{wch:18},{wch:18},{wch:12},{wch:18},{wch:40},{wch:30},{wch:24},{wch:20},{wch:30}];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Dados');
  XLSX.writeFile(wb, 'ContaAzul-NFs-' + new Date().toISOString().slice(0,10) + '.xlsx', { cellDates: true });

  let msg = '✅ Conta Azul exportado!';
  if (semNF)  msg += ` (${semNF} pedido${semNF>1?'s':''} sem NF lançada, ignorado${semNF>1?'s':''})`;
  if (semDoc) msg += ` (${semDoc} sem CNPJ/CPF no cadastro de fornecedor)`;
  showToast(msg);
}

// ── EXPORTAÇÃO FORMATO SP ─────────────────────────────────
function finExportarSP() {
  const dados = finFiltrados.length > 0 ? finFiltrados : finDados;
  if (!dados.length) { showToast('Nenhum dado para exportar!'); return; }

  const headers = ['','HYB','COMP. REC','COMP. PAG','Descrição','CNPJ','Vencimento','Competencia','Valor','DIAS DE ATRASO','Situação','Valor Programado','Valor Pago','PROGRAMAÇÃO','PAG OU TEC','Classificação','Obs','Nome Padrão de Lançamento','Ano','DATA/ANO','VERIFICAÇÃO'];
  const rows = [headers];

  const hoje = new Date();

  dados.forEach(d => {
    const fornNome = String(d.fornecedor||'').trim();
    const casa = String(d.destinatario||'').trim();
    const cls  = String(d.classificacao||'').trim();
    const mes  = String(d.mes||'').trim();
    const ano  = parseInt(d.ano) || new Date().getFullYear();
    const venc = d.vencimentoSerial || 0;
    const valor = parseFloat(d.valor) || 0;

    // Data de compra
    const dtCompra = excelSerialToDate(d.dataCompraSerial);
    const ddMM = dtCompra ? `${String(dtCompra.getDate()).padStart(2,'0')}/${String(dtCompra.getMonth()+1).padStart(2,'0')}` : 'DD/MM';

    // Descrição no padrão SP
    const descricao = `${fornNome} - ${casa} - ${cls} - Pedido dia ${ddMM}/yyyy`;

    // Classificação completa
    const clsFull = FIN_CLASS_MAP[cls] || cls;

    // Nome padrão de lançamento
    const nomePadrao = `${cls} - ${casa} - ${mes.charAt(0) + mes.slice(1).toLowerCase()} - ASL`;

    // Vencimento como data Excel serial
    const vencDate = excelSerialToDate(venc);
    const vencExcel = venc || '';

    // Dias de atraso (vencimento vs hoje)
    let diasAtraso = '';
    if (vencDate) {
      const diff = Math.floor((hoje - vencDate) / (1000*60*60*24));
      diasAtraso = diff > 0 ? diff : '';
    }

    // DATA/ANO (ex: ago/YY)
    const MESES_ABREV = {
      'JANEIRO':'jan','FEVEREIRO':'fev','MARÇO':'mar','ABRIL':'abr','MAIO':'mai','JUNHO':'jun',
      'JULHO':'jul','AGOSTO':'ago','SETEMBRO':'set','OUTUBRO':'out','NOVEMBRO':'nov','DEZEMBRO':'dez'
    };

    // Mês seguinte (como SP usa competência do mês seguinte)
    const mesIdx = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'].indexOf(mes.toUpperCase());
    const mesProx = mesIdx >= 0 && mesIdx < 11 ? ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'][mesIdx+1] : mes;
    const dataAno = (MESES_ABREV[mesProx.toUpperCase()] || 'jan') + '/YY';

    rows.push([
      '',          // coluna A (em branco)
      '',          // HYB
      '',          // COMP. REC
      '',          // COMP. PAG
      descricao,   // Descrição
      'ASL',       // CNPJ
      vencExcel,   // Vencimento
      mes.charAt(0) + mes.slice(1).toLowerCase(), // Competencia
      valor,       // Valor
      diasAtraso,  // DIAS DE ATRASO
      '',          // Situação
      '',          // Valor Programado
      '',          // Valor Pago
      '',          // PROGRAMAÇÃO
      'PAG',       // PAG OU TEC
      clsFull,     // Classificação
      '',          // Obs
      nomePadrao,  // Nome Padrão de Lançamento
      ano,         // Ano
      dataAno,     // DATA/ANO
      1,           // VERIFICAÇÃO
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  // Formata coluna de vencimento como data
  ws['!cols'] = headers.map((h,i) => {
    if (h === 'Descrição' || h === 'Classificação' || h === 'Nome Padrão de Lançamento') return { wch: 50 };
    if (h === 'Valor') return { wch: 14 };
    return { wch: 16 };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Fórmula SP');
  XLSX.writeFile(wb, 'LM-FormatSP-' + new Date().toISOString().slice(0,10) + '.xlsx');
  showToast('✅ Excel no formato SP exportado!');
}

function finExportarExcel() {
  const dados = finFiltrados.length > 0 ? finFiltrados : finDados;
  if (!dados.length) { showToast('Nenhum dado para exportar!'); return; }
  const rows = [['Fornecedor','Classificação','Destinatário','Mês','Ano','Data Compra','Vencimento','Prazo','Valor','Pago','Lançado SP']];
  dados.forEach(d => {
    rows.push([d.fornecedor||'',d.classificacao||'',d.destinatario||'',d.mes||'',d.ano||'',d.dataCompraStr||'',d.vencimentoStr||'',d.diasPrazo||0,parseFloat(d.valor)||0,d.pago||'',d.lancadoSP||'']);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = rows[0].map(() => ({ wch: 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Compras');
  XLSX.writeFile(wb, 'LM-Compras-' + new Date().toISOString().slice(0,10) + '.xlsx');
  showToast('✅ Excel exportado!');
}


// ─────────────────────────────────────────────
// 💳  MÓDULO DE PAGAMENTOS
// ─────────────────────────────────────────────

let pagDadosFiltrados = [];
let pagSelecionados   = new Set();

// Chamado ao abrir a página (depois de finCarregarDados)
function pagInicializar() {
  // Popula filtro de fornecedor
  const forns = [...new Set(finDados.map(d => d.fornecedor).filter(Boolean))].sort();
  const selF  = document.getElementById('pag-filtro-forn');
  if (selF) selF.innerHTML = '<option value="">Todos</option>' + forns.map(f => `<option>${f}</option>`).join('');

  // Atualiza badge da aba
  const pendentes = finDados.filter(d => !FIN_PAGO(d.pago));
  const badge = document.getElementById('fin-badge-pendentes');
  if (badge) {
    badge.textContent = pendentes.length;
    badge.style.display = pendentes.length > 0 ? '' : 'none';
  }

  pagAtualizarResumo();
  pagFiltrar();
}

function pagAtualizarResumo() {
  const hoje = Date.now() / 86400000 + 25569; // hoje em serial Excel
  const mesAtual = new Date().toLocaleString('pt-BR', { month: 'long' }).toUpperCase();
  const anoAtual = new Date().getFullYear();

  const pendentes = finDados.filter(d => !FIN_PAGO(d.pago));
  const vencidos  = pendentes.filter(d => d.vencimentoSerial && d.vencimentoSerial < hoje);
  const pagosMes  = finDados.filter(d => FIN_PAGO(d.pago) &&
    String(d.mes).toUpperCase() === mesAtual && parseInt(d.ano) === anoAtual);

  const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };

  el('pag-s-pendente',   FMT_FIN(pendentes.reduce((s,d) => s+(parseFloat(d.valor)||0), 0)));
  el('pag-s-n-pend',     pendentes.length + ' lançamentos');
  el('pag-s-vencido',    FMT_FIN(vencidos.reduce((s,d) => s+(parseFloat(d.valor)||0), 0)));
  el('pag-s-n-venc',     vencidos.length + ' vencidos');
  el('pag-s-pago-mes',   FMT_FIN(pagosMes.reduce((s,d) => s+(parseFloat(d.valor)||0), 0)));
  el('pag-s-n-pago-mes', pagosMes.length + ' lançamentos');

  // Próximo vencimento
  const proximos = pendentes
    .filter(d => d.vencimentoSerial && d.vencimentoSerial >= hoje)
    .sort((a,b) => a.vencimentoSerial - b.vencimentoSerial);
  if (proximos.length > 0) {
    const prox = proximos[0];
    el('pag-s-proximo', prox.vencimentoStr || '—');
    el('pag-s-prox-forn', prox.fornecedor + ' · ' + FMT_FIN(prox.valor));
  } else {
    el('pag-s-proximo', '—');
    el('pag-s-prox-forn', 'Sem vencimentos futuros');
  }
}

function pagFiltrar() {
  const status = (document.getElementById('pag-filtro-status')?.value) || 'pendente';
  const forn   = document.getElementById('pag-filtro-forn')?.value || '';
  const mes    = document.getElementById('pag-filtro-mes')?.value  || '';
  const ano    = document.getElementById('pag-filtro-ano')?.value  || '';
  const hoje   = Date.now() / 86400000 + 25569;

  pagDadosFiltrados = finDados.filter(d => {
    if (forn && d.fornecedor !== forn) return false;
    if (mes  && d.mes !== mes)         return false;
    if (ano  && String(d.ano) !== ano) return false;
    if (status === 'pendente') return !FIN_PAGO(d.pago);
    if (status === 'vencido')  return !FIN_PAGO(d.pago) && d.vencimentoSerial && d.vencimentoSerial < hoje;
    if (status === 'pago')     return FIN_PAGO(d.pago);
    return true; // todos
  }).sort((a,b) => (a.vencimentoSerial||0) - (b.vencimentoSerial||0));

  pagSelecionados.clear();
  pagRenderizarTabela();
}

function pagRenderizarTabela() {
  const tb  = document.getElementById('pag-tbody');
  const cnt = document.getElementById('pag-table-count');
  if (!tb) return;
  if (cnt) cnt.textContent = pagDadosFiltrados.length + ' registros';

  const hoje = Date.now() / 86400000 + 25569;

  if (!pagDadosFiltrados.length) {
    tb.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--text-muted);">Nenhum lançamento encontrado.</td></tr>';
    return;
  }

  tb.innerHTML = pagDadosFiltrados.map(d => {
    const isPago    = FIN_PAGO(d.pago);
    const isVencido = !isPago && d.vencimentoSerial && d.vencimentoSerial < hoje;
    const diasVenc  = isVencido ? Math.floor(hoje - d.vencimentoSerial) : null;
    const checked   = pagSelecionados.has(d.id) ? 'checked' : '';

    const rowBg = isPago    ? '' :
                  isVencido ? 'background:rgba(198,40,40,0.08);' : '';

    const vencLabel = d.vencimentoStr
      ? `${d.vencimentoStr}${isVencido ? `<br><span style="color:var(--danger);font-size:10px;font-weight:700;">⚠️ ${diasVenc}d atrasado</span>` : ''}`
      : '—';

    const statusBtn = isPago
      ? `<button onclick="finTogglePago('${d.id}',false)"
           style="background:var(--ok);color:#fff;border:none;border-radius:20px;padding:5px 14px;font-size:12px;font-weight:700;cursor:pointer;width:100%;">
           ✅ Pago — Desfazer
         </button>`
      : `<button onclick="finTogglePago('${d.id}',true)"
           style="background:${isVencido?'var(--danger)':'var(--warn)'};color:#fff;border:none;border-radius:20px;padding:5px 14px;font-size:12px;font-weight:700;cursor:pointer;width:100%;">
           ${isVencido ? '🔴 Vencido — Pagar' : '⏳ Pendente — Pagar'}
         </button>`;

    const badgeSP = d.lancadoSP === 'Sim'
      ? '<span style="color:var(--ok);font-weight:700;font-size:12px;">✅ Sim</span>'
      : `<button onclick="finToggleSP('${d.id}')"
           style="background:var(--surface);color:var(--text-muted);border:1px solid var(--border);border-radius:6px;padding:3px 10px;font-size:11px;cursor:pointer;">
           Marcar SP
         </button>`;

    return `<tr id="pag-row-${d.id}" style="${rowBg}">
      <td style="padding:8px 12px;"><input type="checkbox" ${checked} onchange="pagToggleCheck('${d.id}',this.checked)"></td>
      <td style="font-weight:700;white-space:nowrap;">${d.fornecedor||'—'}</td>
      <td><span class="block-badge">${d.classificacao||'—'}</span></td>
      <td style="font-size:12px;">${d.destinatario||'—'}</td>
      <td style="font-size:11px;color:var(--text-muted);white-space:nowrap;">${d.mes||''}/${d.ano||''}</td>
      <td style="font-size:12px;white-space:nowrap;">${vencLabel}</td>
      <td style="text-align:right;font-weight:700;color:var(--lumen);white-space:nowrap;">${FMT_FIN(d.valor)}</td>
      <td style="font-size:11px;color:var(--text-muted);max-width:120px;">${d.pedidoRealizado||'—'}</td>
      <td style="text-align:center;">${badgeSP}</td>
      <td style="text-align:center;padding:6px 10px;">${statusBtn}</td>
    </tr>`;
  }).join('');
}

function pagToggleCheck(id, checked) {
  if (checked) pagSelecionados.add(id);
  else pagSelecionados.delete(id);
}

function pagSelecionarTodos(checked) {
  pagDadosFiltrados.forEach(d => {
    if (checked) pagSelecionados.add(d.id);
    else pagSelecionados.delete(d.id);
  });
  document.querySelectorAll('#pag-tbody input[type=checkbox]').forEach(cb => cb.checked = checked);
}

async function pagMarcarSelecionados(pagar) {
  if (!pagSelecionados.size) { showToast('Nenhum lançamento selecionado.'); return; }
  const novoStatus = pagar ? 'Sim' : '';
  const label = pagar ? 'pagos' : 'desmarcados';
  let count = 0;

  try {
    // Frete tem financeiro próprio (tabela 'fretes') — não pode ir no mesmo
    // batch de compras_financeiro (um id inexistente lá derrubaria o batch
    // inteiro). Separa e atualiza cada tabela do seu jeito.
    const batch = db.batch();
    const fretesParaAtualizar = [];
    pagSelecionados.forEach(id => {
      const reg = finDados.find(d => d.id === id);
      if (reg && reg.modulo === 'frete') { fretesParaAtualizar.push(reg); return; }
      batch.update(db.collection('compras_financeiro').doc(id), {
        pago:    novoStatus,
        pagoEm:  pagar ? firebase.firestore.FieldValue.serverTimestamp() : null,
      });
    });
    await batch.commit();
    for (const reg of fretesParaAtualizar) {
      await db.collection('fretes').doc(reg.id).update({
        statusPag: pagar ? 'pago' : 'pendente',
        valorPago: pagar ? (Number(reg.valor) || 0) : 0,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    }
    pagSelecionados.forEach(id => {
      const reg = finDados.find(d => d.id === id);
      if (reg) { reg.pago = novoStatus; count++; }
    });
    pagSelecionados.clear();
    pagAtualizarResumo();
    pagFiltrar();
    finAplicarFiltros(); // atualiza painel também
    showToast(`✅ ${count} lançamento(s) ${label}!`);
    // Atualiza badge da aba
    const badge = document.getElementById('fin-badge-pendentes');
    if (badge) {
      const n = finDados.filter(d => !FIN_PAGO(d.pago)).length;
      badge.textContent = n;
      badge.style.display = n > 0 ? '' : 'none';
    }
  } catch(e) {
    console.error(e);
    showToast('❌ Erro ao salvar: ' + e.message);
  }
}

// Toggle individual — usado no Painel E na aba Pagamentos
async function finTogglePago(id, pagar) {
  const novoStatus = pagar ? 'Sim' : '';
  const reg = finDados.find(d => d.id === id);
  if (!reg) return;
  const ehFrete = reg.modulo === 'frete';

  // Feedback imediato
  reg.pago = novoStatus;
  pagAtualizarResumo();
  pagFiltrar();
  finAplicarFiltros();

  try {
    if (ehFrete) {
      // Frete tem financeiro próprio (tabela 'fretes'), campos diferentes.
      await db.collection('fretes').doc(id).update({
        statusPag: pagar ? 'pago' : 'pendente',
        valorPago: pagar ? (Number(reg.valor) || 0) : 0,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      await db.collection('compras_financeiro').doc(id).update({
        pago:   novoStatus,
        pagoEm: pagar ? firebase.firestore.FieldValue.serverTimestamp() : null,
      });
    }
    showToast(pagar ? '✅ Marcado como pago!' : '↩️ Marcado como pendente!');
    // Atualiza badge
    const badge = document.getElementById('fin-badge-pendentes');
    if (badge) {
      const n = finDados.filter(d => !FIN_PAGO(d.pago)).length;
      badge.textContent = n;
      badge.style.display = n > 0 ? '' : 'none';
    }
  } catch(e) {
    // Reverte em caso de erro
    reg.pago = pagar ? '' : 'Sim';
    pagFiltrar();
    finAplicarFiltros();
    console.error(e);
    showToast('❌ Erro ao salvar: ' + e.message);
  }
}

async function finToggleSP(id) {
  const reg = finDados.find(d => d.id === id);
  if (!reg) return;
  reg.lancadoSP = reg.lancadoSP === 'Sim' ? '' : 'Sim';
  pagFiltrar();
  try {
    await db.collection('compras_financeiro').doc(id).update({ lancadoSP: reg.lancadoSP });
    showToast(reg.lancadoSP === 'Sim' ? '✅ Marcado como lançado SP!' : '↩️ SP desmarcado!');
  } catch(e) {
    reg.lancadoSP = reg.lancadoSP === 'Sim' ? '' : 'Sim'; // reverte
    pagFiltrar();
    showToast('❌ Erro ao salvar: ' + e.message);
  }
}

function pagExportarExcel() {
  if (!pagDadosFiltrados.length) { showToast('Nenhum dado para exportar!'); return; }
  const rows = [['Fornecedor','Classificação','Casa/Destinatário','Mês','Ano','Vencimento','Valor','Status','Lançado SP','Obs']];
  pagDadosFiltrados.forEach(d => {
    rows.push([d.fornecedor||'',d.classificacao||'',d.destinatario||'',d.mes||'',d.ano||'',d.vencimentoStr||'',parseFloat(d.valor)||0,d.pago==='Sim'?'Pago':'Pendente',d.lancadoSP||'',d.pedidoRealizado||'']);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = rows[0].map((_,i) => ({ wch: i===0?22:i===6?14:16 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Pagamentos');
  XLSX.writeFile(wb, 'LM-Pagamentos-' + new Date().toISOString().slice(0,10) + '.xlsx');
  showToast('✅ Excel de pagamentos exportado!');
}

// ─────────────────────────────────────────────
// 📘  EXPORTAÇÃO CONTA AZUL  +  PDF DETALHADO
// ─────────────────────────────────────────────

// Normaliza nome p/ casar o fornecedor do lançamento com o cadastro
function _caNorm(s){
  return String(s||'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toUpperCase().replace(/\s+/g,' ').trim();
}

// Garante que o cache de fornecedores esteja carregado (p/ buscar CNPJ/CPF)
async function _caGarantirFornecedores(){
  if (suppliersCache && suppliersCache.length) return;
  try {
    const snap = await db.collection('suppliers').orderBy('nome').get();
    suppliersCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e){ console.warn('Falha ao carregar fornecedores p/ CNPJ:', e); }
}

// Mapa nome normalizado -> CNPJ/CPF
function _caMapaDocs(){
  const m = new Map();
  (suppliersCache||[]).forEach(s => {
    const doc = String(s.cnpj||'').trim();
    if (doc) m.set(_caNorm(s.nome), doc);
  });
  return m;
}

// Constrói as linhas no layout Conta Azul a partir dos lançamentos financeiros
function _caMontarLinhas(dados, mapaDocs){
  const header = ['Data de Competência','Data de Vencimento','Data de Pagamento','Valor','Categoria','Descrição','Cliente/Fornecedor','CNPJ/CPF Cliente/Fornecedor','Centro de Custo','Observações'];
  const linhas = [header];
  dados.forEach(d => {
    const dtComp = excelSerialToDate(d.dataCompraSerial) || excelSerialToDate(d.vencimentoSerial);
    const dtVenc = excelSerialToDate(d.vencimentoSerial) || dtComp;
    const valor  = -Math.abs(parseFloat(d.valor) || 0);                 // saída = negativo
    const cat    = String(d.classificacao||'').trim();                  // Categoria = classificação do lançamento
    const forn   = String(d.fornecedor||'').trim();
    const dest   = String(d.destinatario||'').trim();
    const docFis = mapaDocs.get(_caNorm(forn)) || '';                   // CNPJ/CPF do cadastro (branco se não houver)
    const periodo = (d.mes||d.ano) ? ` (${String(d.mes||'').trim()}${d.mes&&d.ano?'/':''}${d.ano||''})` : '';
    const desc   = ([cat,dest].filter(Boolean).join(' - ') || 'Lançamento') + periodo;
    const obsP   = [];
    if (d.pedidoRealizado) obsP.push(String(d.pedidoRealizado).trim());
    obsP.push(FIN_PAGO(d.pago) ? 'Pago' : 'Pendente');
    // Centro de Custo: prefere o vínculo direto do lançamento, cai na casa de destino como fallback
    const cc = String(d.centroCustoNome || d.centroCusto || dest || '').trim();
    linhas.push([ dtComp || '', dtVenc || '', '', valor, cat, desc, forn, docFis, cc, obsP.join(' | ') ]);
  });
  return linhas;
}

// Gera e baixa o XLSX no formato Conta Azul (datas reais, CNPJ como texto)
async function exportarContaAzulExcel(dados, nomeArquivo){
  if (!dados || !dados.length){ showToast('Nenhum dado para exportar!'); return; }
  await _caGarantirFornecedores();
  const linhas = _caMontarLinhas(dados, _caMapaDocs());
  const ws = XLSX.utils.aoa_to_sheet(linhas, { cellDates:true });
  for (let r = 1; r < linhas.length; r++){
    ['A','B'].forEach(col => { const c = ws[col + (r+1)]; if (c && c.v instanceof Date){ c.t='d'; c.z='dd/mm/yyyy'; } });
    const h = ws['H' + (r+1)];
    if (h && h.v !== undefined && h.v !== '') { h.t='s'; h.v = String(h.v); }
  }
  ws['!cols'] = [{wch:18},{wch:18},{wch:18},{wch:12},{wch:18},{wch:48},{wch:30},{wch:24},{wch:20},{wch:30}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Dados');
  XLSX.writeFile(wb, nomeArquivo, { cellDates:true });
  const semDoc = linhas.slice(1).filter(l => !l[7]).length;
  showToast('✅ Conta Azul exportado!' + (semDoc ? ` (${semDoc} sem CNPJ/CPF no cadastro)` : ''));
}

// PDF detalhado: agrupado por fornecedor → categoria, com subtotais e total geral
function gerarPdfDetalhadoFin(dados, titulo, nomeArquivo){
  if (!dados || !dados.length){ showToast('Nenhum dado para exportar!'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const blue = [0,56,117], lightBlue = [230,238,248], gray = [107,114,128];
  const fmt = v => 'R$ ' + Math.abs(v||0).toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 });

  doc.setFillColor(...blue); doc.rect(0,0,210,26,'F');
  doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(14);
  doc.text(titulo, 14, 12);
  doc.setFont('helvetica','normal'); doc.setFontSize(9);
  doc.text('Gerado em: ' + new Date().toLocaleDateString('pt-BR') + '  ·  ' + dados.length + ' lançamento(s)', 14, 20);

  const porForn = {};
  dados.forEach(d => { const f = String(d.fornecedor||'').trim() || '(Sem fornecedor)'; (porForn[f] = porForn[f] || []).push(d); });
  const fornecedores = Object.keys(porForn).sort((a,b)=>a.localeCompare(b,'pt-BR'));

  let totalGeral = 0, y = 32;

  fornecedores.forEach(forn => {
    const itens = porForn[forn];
    const totalForn = itens.reduce((s,d)=> s + (parseFloat(d.valor)||0), 0);
    totalGeral += totalForn;

    const porCat = {};
    itens.forEach(d => { const c = String(d.classificacao||'').trim() || '(Sem categoria)'; (porCat[c]=porCat[c]||[]).push(d); });
    const cats = Object.keys(porCat).sort((a,b)=>a.localeCompare(b,'pt-BR'));

    const body = [];
    cats.forEach(cat => {
      const its = porCat[cat];
      const totalCat = its.reduce((s,d)=> s + (parseFloat(d.valor)||0), 0);
      body.push([
        { content: 'Categoria: ' + cat, colSpan:4, styles:{ fontStyle:'bold', fillColor:lightBlue, textColor:blue } },
        { content: fmt(totalCat), styles:{ fontStyle:'bold', fillColor:lightBlue, textColor:blue, halign:'right' } }
      ]);
      its.forEach(d => {
        body.push([
          d.dataCompraStr || excelDateToStr(d.dataCompraSerial) || '—',
          d.vencimentoStr || excelDateToStr(d.vencimentoSerial) || '—',
          String(d.destinatario||'—'),
          (FIN_PAGO(d.pago) ? 'Pago' : 'Pendente'),
          { content: fmt(parseFloat(d.valor)||0), styles:{ halign:'right' } }
        ]);
      });
    });
    body.push([
      { content: 'Total do fornecedor', colSpan:4, styles:{ fontStyle:'bold', halign:'right' } },
      { content: fmt(totalForn), styles:{ fontStyle:'bold', halign:'right' } }
    ]);

    doc.autoTable({
      startY: y,
      head: [
        [{ content: forn + '   —   ' + itens.length + ' lançamento(s)', colSpan:5, styles:{ fillColor:blue, textColor:255, halign:'left', fontStyle:'bold', fontSize:10 } }],
        ['Competência','Vencimento','Centro de Custo','Status','Valor']
      ],
      body: body,
      theme: 'grid',
      styles: { fontSize:8, cellPadding:2 },
      headStyles: { fillColor:[224,231,240], textColor:[40,40,40], fontSize:8 },
      columnStyles: { 0:{cellWidth:24}, 1:{cellWidth:24}, 3:{cellWidth:22}, 4:{cellWidth:28, halign:'right'} },
      margin: { left:10, right:10 },
      didDrawPage: () => { doc.setTextColor(...gray); doc.setFontSize(7); doc.text('Suprimentos Obra Lumen — lumenserfeliz.org', 14, 290); }
    });
    y = doc.lastAutoTable.finalY + 8;
    if (y > 250){ doc.addPage(); y = 20; }
  });

  if (y > 270){ doc.addPage(); y = 20; }
  doc.setFillColor(...blue); doc.rect(10, y, 190, 12, 'F');
  doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(11);
  doc.text('TOTAL GERAL (despesas)', 14, y+8);
  doc.text(fmt(totalGeral), 196, y+8, { align:'right' });

  doc.save(nomeArquivo);
  showToast('✅ PDF detalhado exportado!');
}

// ── Wrappers ligados às telas financeiras ──
function finExportarContaAzul(){
  const dados = (typeof finFiltrados !== 'undefined' && finFiltrados.length) ? finFiltrados : finDados;
  exportarContaAzulExcel(dados, 'ContaAzul-' + new Date().toISOString().slice(0,10) + '.xlsx');
}
function finExportarPdfDetalhado(){
  const dados = (typeof finFiltrados !== 'undefined' && finFiltrados.length) ? finFiltrados : finDados;
  gerarPdfDetalhadoFin(dados, 'Lumen — Lançamentos Financeiros', 'LM-Financeiro-Detalhado-' + new Date().toISOString().slice(0,10) + '.pdf');
}
function pagExportarContaAzul(){
  exportarContaAzulExcel(pagDadosFiltrados, 'ContaAzul-Pagamentos-' + new Date().toISOString().slice(0,10) + '.xlsx');
}
function pagExportarPdfDetalhado(){
  gerarPdfDetalhadoFin(pagDadosFiltrados, 'Lumen — Pagamentos', 'LM-Pagamentos-Detalhado-' + new Date().toISOString().slice(0,10) + '.pdf');
}

// ─────────────────────────────────────────────
// 🌙  THEME TOGGLE (Light / Dark)
// ─────────────────────────────────────────────


