// Extraído de index.html (bloco Rotina de Estoque) em 2026-07-27
// ═══════════════════════════════════════════════════════════
// 📊  ROTINA DE ESTOQUE — Histórico e consumo por período
// ═══════════════════════════════════════════════════════════

let rotChart = null;         // instância Chart.js
let rotDadosBrutos = [];     // movimentos carregados
let rotTabelaDados = [];     // dados da tabela para export

// Paleta de cores do sistema
const ROT_COLORS = {
  saldo:    '#2B9FA8',
  entrada:  '#1A7A44',
  saida:    '#C0392B',
  mediaRef: '#D4890A',
};

// ── Inicialização (chamada ao entrar na aba) ──────────────
function initRotinaEstoque() {
  _rotPopularFiltros();
  _rotSetarDatasDefault();
  rotMostrarEstado('empty');
}

function _rotPopularFiltros() {
  // ── Chips de casas ──
  const chipsContainer = document.getElementById('rot-casa-chips');
  if (chipsContainer) {
    const casas = typeof CASAS !== 'undefined' ? CASAS : [];
    chipsContainer.innerHTML = casas.map(c => `
      <span class="rot-chip rot-chip-on"
            data-casa="${c}"
            onclick="rotToggleChip(this)"
            style="display:inline-flex;align-items:center;gap:4px;padding:5px 12px;border-radius:20px;font-size:12px;font-weight:500;cursor:pointer;user-select:none;transition:all .15s;border:1.5px solid var(--lumen);background:rgba(43,159,168,0.18);color:var(--lumen);">
        ✓ ${c}
      </span>`).join('');
  }

  // ── Categorias ──
  const selCat = document.getElementById('rot-cat');
  if (!selCat) return;
  selCat.innerHTML = '<option value="">Todas</option>';
  if (typeof CATEGORIAS !== 'undefined') {
    Object.entries(CATEGORIAS).forEach(([k, cat]) => {
      const o = document.createElement('option'); o.value = k; o.textContent = (cat.icone||'') + ' ' + cat.nome;
      selCat.appendChild(o);
    });
  }
}

// ── Controles dos chips de casas ─────────────────────────
function rotToggleChip(el) {
  const on = el.classList.contains('rot-chip-on');
  if (on) {
    el.classList.remove('rot-chip-on');
    el.classList.add('rot-chip-off');
    el.style.background = 'transparent';
    el.style.color = 'var(--text-muted)';
    el.style.borderColor = 'var(--border)';
    el.textContent = el.dataset.casa;
  } else {
    el.classList.remove('rot-chip-off');
    el.classList.add('rot-chip-on');
    el.style.background = 'rgba(43,159,168,0.18)';
    el.style.color = 'var(--lumen)';
    el.style.borderColor = 'var(--lumen)';
    el.textContent = '✓ ' + el.dataset.casa;
  }
}
function rotSelecionarTodasCasas() {
  document.querySelectorAll('#rot-casa-chips .rot-chip').forEach(chip => {
    chip.classList.remove('rot-chip-off');
    chip.classList.add('rot-chip-on');
    chip.style.background = 'rgba(43,159,168,0.18)';
    chip.style.color = 'var(--lumen)';
    chip.style.borderColor = 'var(--lumen)';
    chip.textContent = '✓ ' + chip.dataset.casa;
  });
}
function rotDeselecionarTodasCasas() {
  document.querySelectorAll('#rot-casa-chips .rot-chip').forEach(chip => {
    chip.classList.remove('rot-chip-on');
    chip.classList.add('rot-chip-off');
    chip.style.background = 'transparent';
    chip.style.color = 'var(--text-muted)';
    chip.style.borderColor = 'var(--border)';
    chip.textContent = chip.dataset.casa;
  });
}
function _rotGetCasasSelecionadas() {
  const todos   = document.querySelectorAll('#rot-casa-chips .rot-chip');
  const checked = Array.from(todos).filter(c => c.classList.contains('rot-chip-on')).map(c => c.dataset.casa);
  return checked.length === todos.length ? [] : checked; // [] = todas
}
// mantidas por compatibilidade (não usadas nos chips)
function rotAtualizarLabelCasas() {}
function filtrarRotCasas(q) {}
function toggleRotCasaDropdown(e) {}
function _rotFecharDropdown() {}

function _rotSetarDatasDefault() {
  const hoje = new Date();
  const ini  = new Date(hoje); ini.setDate(ini.getDate() - 29);
  const fmt  = d => d.toISOString().slice(0, 10);
  const elIni = document.getElementById('rot-ini');
  const elFim = document.getElementById('rot-fim');
  if (elIni && !elIni.value) elIni.value = fmt(ini);
  if (elFim && !elFim.value) elFim.value = fmt(hoje);
}

// ── Estado visual ─────────────────────────────────────────
function rotMostrarEstado(estado) {
  const ids = ['rot-empty','rot-loading','rot-kpis','rot-chart-card','rot-table-card','rot-btn-export'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = 'none';
  });
  if (estado === 'empty') {
    document.getElementById('rot-empty').style.display = '';
  } else if (estado === 'loading') {
    document.getElementById('rot-loading').style.display = '';
  } else if (estado === 'results') {
    ['rot-kpis','rot-chart-card','rot-table-card'].forEach(id => {
      const el = document.getElementById(id); if (el) el.style.display = '';
    });
    document.getElementById('rot-kpis').style.display = 'grid';
    document.getElementById('rot-btn-export').style.display = '';
  }
}

// ── Lógica principal ──────────────────────────────────────
async function carregarRotinaEstoque() {
  const casasSel = _rotGetCasasSelecionadas(); // [] = todas; [a,b,...] = selecionadas
  const cat    = document.getElementById('rot-cat')?.value  || '';
  const iniStr = document.getElementById('rot-ini')?.value;
  const fimStr = document.getElementById('rot-fim')?.value;
  const gran   = document.getElementById('rot-gran')?.value || 'dia';

  if (!iniStr || !fimStr) { showToast('Selecione o período de análise.'); return; }
  if (iniStr > fimStr)    { showToast('A data início deve ser anterior à data fim.'); return; }
  const totalCasas = document.querySelectorAll('#rot-casa-checkboxes input[type=checkbox]').length;
  if (totalCasas > 0 && casasSel !== null && casasSel.length === 0 &&
      document.querySelectorAll('#rot-casa-checkboxes input:checked').length === 0) {
    showToast('Selecione ao menos uma casa.'); return;
  }

  rotMostrarEstado('loading');

  try {
    // 1. Buscar todos os movimentos (filtro de casas feito em JS para suportar múltiplas)
    const allSnap = await db.collection('movements').get();

    const fimDate = new Date(fimStr + 'T23:59:59');
    const iniDate = new Date(iniStr + 'T00:00:00');

    // 2. Separar: antes do período (saldo inicial) e dentro do período; aplicar filtro de casas
    const movAntes   = [];
    const movPeriodo = [];

    allSnap.docs.forEach(d => {
      const m = { id: d.id, ...d.data() };
      if (!m.date) return;
      // Filtro de casas: se casasSel vazio = todas; senão checar inclusão
      if (casasSel.length > 0 && !casasSel.includes(m.house)) return;
      const dt = m.date.toDate ? m.date.toDate() : new Date(m.date);
      if (dt < iniDate)                        movAntes.push({ ...m, _dt: dt });
      else if (dt >= iniDate && dt <= fimDate) movPeriodo.push({ ...m, _dt: dt });
    });

    // 3. Saldo inicial por produto
    const saldoIni = _rotCalcSaldo(movAntes, cat);

    // 4. Filtrar categoria dentro do período
    const movFiltrados = movPeriodo.filter(m => {
      if (!cat) return true;
      return (m.items || []).some(item => item.catKey === cat);
    });

    // 5. Timeline + evolução do saldo
    const timeline = _rotGerarTimeline(iniStr, fimStr, gran);
    const saldoPorPeriodo = _rotCalcTimeline(timeline, movFiltrados, saldoIni, cat, gran);

    // 6. Métricas globais
    const totalEntradas = movFiltrados.filter(m => m.type === 'entrada').reduce((s, m) =>
      s + (m.items||[]).filter(i => !cat || i.catKey === cat).reduce((a,i) => a+(parseFloat(i.qty)||0), 0), 0);
    const totalSaidas = movFiltrados.filter(m => m.type !== 'entrada').reduce((s, m) =>
      s + (m.items||[]).filter(i => !cat || i.catKey === cat).reduce((a,i) => a+(parseFloat(i.qty)||0), 0), 0);

    const saldoIniTotal  = Object.values(saldoIni).reduce((s, p) => s + p.qty, 0);
    const saldoFimTotal  = saldoIniTotal + totalEntradas - totalSaidas;
    const diasAnalisados = Math.max(1, Math.round((fimDate - iniDate) / 86400000) + 1);
    const mediaDiaria    = totalSaidas / diasAnalisados;

    // 7. Tabela por produto
    rotTabelaDados = _rotGerarTabelaProdutos(movAntes, movFiltrados, cat, iniDate, fimDate, diasAnalisados);

    // 8. Label descritivo das casas
    const casasLabel = casasSel.length === 0 ? 'Todas as casas'
      : casasSel.length === 1 ? casasSel[0]
      : `${casasSel.length} casas`;

    // 9. Renderizar
    _rotRenderKPIs(saldoIniTotal, saldoFimTotal, totalEntradas, totalSaidas, mediaDiaria, diasAnalisados);
    _rotRenderGrafico(timeline, saldoPorPeriodo, gran);
    _rotRenderTabela(rotTabelaDados);

    document.getElementById('rot-chart-sub').textContent =
      `${casasLabel} · ${iniStr.split('-').reverse().join('/')} até ${fimStr.split('-').reverse().join('/')}`;
    document.getElementById('rot-table-sub').textContent =
      `${rotTabelaDados.length} produto(s) com movimentação no período`;

    rotMostrarEstado('results');

  } catch(e) {
    console.error('Rotina de Estoque — erro:', e);
    showToast('Erro ao calcular rotina: ' + e.message);
    rotMostrarEstado('empty');
  }
}

// ── Helpers de cálculo ────────────────────────────────────

function _rotCalcSaldo(movs, filtCat) {
  // saldo[prodKey] = { qty, nome, unidade, catKey, catNome, prodId }
  const saldo = {};
  movs.forEach(m => {
    (m.items || []).forEach(item => {
      if (filtCat && item.catKey !== filtCat) return;
      const k = `${item.catKey}__${item.prodId}`;
      if (!saldo[k]) saldo[k] = { qty: 0, nome: nomeProdutoAtual(item.catKey, item.prodId, item.prodNome), unidade: item.unidade || '', catKey: item.catKey, prodId: item.prodId, catNome: _rotNomeCat(item.catKey) };
      saldo[k].qty += (m.type === 'entrada' ? 1 : -1) * (parseFloat(item.qty) || 0);
    });
  });
  return saldo;
}

function _rotNomeCat(catKey) {
  if (typeof CATEGORIAS !== 'undefined' && CATEGORIAS[catKey]) return CATEGORIAS[catKey].nome;
  return catKey || '—';
}

function _rotGerarTimeline(iniStr, fimStr, gran) {
  const dias = [];
  const cur  = new Date(iniStr + 'T12:00:00');
  const fim  = new Date(fimStr + 'T12:00:00');
  while (cur <= fim) {
    dias.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  if (gran === 'semana') {
    const semanas = [];
    let semAtual = null, semLabel = null;
    dias.forEach(d => {
      const dt = new Date(d + 'T12:00:00');
      const sem = _rotSemanaISO(dt);
      if (sem !== semAtual) { semAtual = sem; semLabel = d; semanas.push(d); }
    });
    return semanas;
  }
  return dias;
}

function _rotSemanaISO(dt) {
  const d = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return d.getUTCFullYear() + '-W' + String(Math.ceil(((d - yearStart) / 86400000 + 1) / 7)).padStart(2, '0');
}

function _rotCalcTimeline(timeline, movPeriodo, saldoIni, filtCat, gran) {
  // Calcula saldo total acumulado em cada ponto da timeline
  let saldoCor = Object.values(saldoIni).reduce((s, p) => s + p.qty, 0);
  const pontos = [];
  const entPontos = [];
  const saiPontos = [];

  const movsPorDia = {};
  movPeriodo.forEach(m => {
    const dk = m._dt.toISOString().slice(0, 10);
    if (!movsPorDia[dk]) movsPorDia[dk] = [];
    movsPorDia[dk].push(m);
  });

  let prevPonto = timeline[0];
  timeline.forEach((ponto, idx) => {
    // Acumular dias entre pontos anteriores e este
    const diasDoPonto = [];
    if (gran === 'semana' && idx > 0) {
      const prev = new Date(prevPonto + 'T12:00:00');
      const cur  = new Date(ponto   + 'T12:00:00');
      const tmp  = new Date(prev);
      while (tmp < cur) {
        tmp.setDate(tmp.getDate() + 1);
        diasDoPonto.push(tmp.toISOString().slice(0, 10));
      }
    } else {
      diasDoPonto.push(ponto);
    }

    let entDia = 0, saiDia = 0;
    diasDoPonto.forEach(dk => {
      (movsPorDia[dk] || []).forEach(m => {
        (m.items || []).forEach(item => {
          if (filtCat && item.catKey !== filtCat) return;
          const q = parseFloat(item.qty) || 0;
          if (m.type === 'entrada') entDia += q;
          else                      saiDia += q;
        });
      });
    });

    saldoCor += entDia - saiDia;
    pontos.push(Math.max(0, Math.round(saldoCor * 100) / 100));
    entPontos.push(Math.round(entDia * 100) / 100);
    saiPontos.push(Math.round(saiDia * 100) / 100);
    prevPonto = ponto;
  });

  return { pontos, entPontos, saiPontos };
}

function _rotGerarTabelaProdutos(movAntes, movPeriodo, filtCat, iniDate, fimDate, diasAnalisados) {
  // saldo inicial por produto
  const saldoIni = _rotCalcSaldo(movAntes, filtCat);
  // movimentos no período por produto
  const tabMap = {};

  // Inicializar com produtos que tinham saldo antes
  Object.entries(saldoIni).forEach(([k, p]) => {
    if (p.qty !== 0) tabMap[k] = { ...p, saldoIni: p.qty, entradas: 0, saidas: 0 };
  });

  movPeriodo.forEach(m => {
    (m.items || []).forEach(item => {
      if (filtCat && item.catKey !== filtCat) return;
      const k = `${item.catKey}__${item.prodId}`;
      if (!tabMap[k]) tabMap[k] = { nome: nomeProdutoAtual(item.catKey, item.prodId, item.prodNome), unidade: item.unidade || '', catKey: item.catKey, prodId: item.prodId, catNome: _rotNomeCat(item.catKey), saldoIni: saldoIni[k]?.qty || 0, entradas: 0, saidas: 0 };
      const q = parseFloat(item.qty) || 0;
      if (m.type === 'entrada') tabMap[k].entradas += q;
      else                      tabMap[k].saidas   += q;
    });
  });

  return Object.values(tabMap)
    .filter(p => p.entradas > 0 || p.saidas > 0 || p.saldoIni !== 0)
    .map(p => ({ ...p, saldoFim: Math.max(0, p.saldoIni + p.entradas - p.saidas), mediaDia: p.saidas / diasAnalisados }))
    .sort((a, b) => b.saidas - a.saidas);
}

// ── Renderização ──────────────────────────────────────────

function _rotFmt(n, unidade) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return n.toFixed(1).replace('.', ',') + (unidade ? ' ' + unidade : '');
}

function _rotRenderKPIs(ini, fim, ent, sai, media, dias) {
  document.getElementById('rot-kpi-ini').textContent     = ini.toFixed(1);
  document.getElementById('rot-kpi-ini-sub').textContent = 'unidades no início do período';
  document.getElementById('rot-kpi-fim').textContent     = fim.toFixed(1);
  document.getElementById('rot-kpi-fim-sub').textContent = 'unidades ao final do período';
  document.getElementById('rot-kpi-consumo').textContent = sai.toFixed(1);
  document.getElementById('rot-kpi-entrada').textContent = ent.toFixed(1);
  document.getElementById('rot-kpi-media').textContent   = media.toFixed(2) + '/dia';
  document.getElementById('rot-kpi-dias').textContent    = dias + ' dias';
}

function _rotRenderGrafico(timeline, dados, gran) {
  const ctx = document.getElementById('rot-chart').getContext('2d');
  if (rotChart) { rotChart.destroy(); rotChart = null; }

  const labels = timeline.map(d => {
    const [y, m, dia] = d.split('-');
    return gran === 'semana' ? `Sem ${dia}/${m}` : `${dia}/${m}`;
  });

  rotChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Saldo',
          data: dados.pontos,
          borderColor: ROT_COLORS.saldo,
          backgroundColor: ROT_COLORS.saldo + '22',
          borderWidth: 2.5,
          fill: true,
          tension: 0.35,
          pointRadius: labels.length > 60 ? 0 : 3,
          pointHoverRadius: 5,
          order: 1,
        },
        {
          label: 'Entradas',
          data: dados.entPontos,
          borderColor: ROT_COLORS.entrada,
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderDash: [4, 3],
          fill: false,
          tension: 0.2,
          pointRadius: 0,
          pointHoverRadius: 4,
          order: 2,
        },
        {
          label: 'Saídas',
          data: dados.saiPontos,
          borderColor: ROT_COLORS.saida,
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderDash: [4, 3],
          fill: false,
          tension: 0.2,
          pointRadius: 0,
          pointHoverRadius: 4,
          order: 3,
        },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { font: { size: 12 }, padding: 16 } },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1).replace('.', ',')}`
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 }, maxTicksLimit: 20 } },
        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { font: { size: 11 } } }
      }
    }
  });
}

function _rotRenderTabela(dados) {
  const tbody = document.getElementById('rot-tbody');
  if (!dados.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted);">Nenhuma movimentação encontrada no período.</td></tr>';
    return;
  }
  tbody.innerHTML = dados.map(p => {
    const variacao = p.saldoFim - p.saldoIni;
    const pct      = p.saldoIni > 0 ? (variacao / p.saldoIni * 100) : (p.entradas > 0 ? 100 : 0);
    let tendEmoji = '➡️';
    let tendCor   = 'var(--text-muted)';
    if (variacao > 0.5)        { tendEmoji = '📈'; tendCor = 'var(--ok)'; }
    else if (variacao < -0.5)  { tendEmoji = '📉'; tendCor = 'var(--danger)'; }

    return `
    <tr style="border-bottom:1px solid var(--border);">
      <td style="padding:9px 10px;font-size:13px;font-weight:600;">${p.nome}</td>
      <td style="padding:9px 10px;font-size:12px;color:var(--text-muted);">${p.catNome}</td>
      <td style="padding:9px 10px;text-align:right;font-family:monospace;font-size:12px;">${_rotFmt(p.saldoIni, p.unidade)}</td>
      <td style="padding:9px 10px;text-align:right;font-family:monospace;font-size:12px;color:var(--ok);">+${_rotFmt(p.entradas, p.unidade)}</td>
      <td style="padding:9px 10px;text-align:right;font-family:monospace;font-size:12px;color:var(--danger);">-${_rotFmt(p.saidas, p.unidade)}</td>
      <td style="padding:9px 10px;text-align:right;font-family:monospace;font-size:12px;font-weight:700;color:${p.saldoFim < p.saldoIni * 0.3 ? 'var(--danger)' : 'var(--text)'};">${_rotFmt(p.saldoFim, p.unidade)}</td>
      <td style="padding:9px 10px;text-align:right;font-family:monospace;font-size:12px;color:var(--lumen);">${p.mediaDia.toFixed(2).replace('.',',')}${p.unidade ? '/'+p.unidade : ''}/d</td>
      <td style="padding:9px 10px;text-align:center;font-size:14px;color:${tendCor};" title="${pct > 0 ? '+' : ''}${pct.toFixed(1)}%">${tendEmoji}</td>
    </tr>`;
  }).join('');
}

// ── Exportação CSV ────────────────────────────────────────
function exportarRotinaCSV() {
  if (!rotTabelaDados.length) { showToast('Nenhum dado para exportar.'); return; }
  const casasSel   = _rotGetCasasSelecionadas();
  const casasLabel = casasSel.length === 0 ? 'todas'
    : casasSel.length === 1 ? casasSel[0]
    : `${casasSel.length}_casas`;
  const iniStr = document.getElementById('rot-ini')?.value || '';
  const fimStr = document.getElementById('rot-fim')?.value || '';

  const linhas = [
    ['Casas','Produto','Categoria','Estoque Inicial','Entradas','Saídas','Estoque Final','Média Diária','Unidade'],
    ...rotTabelaDados.map(p => [
      casasLabel,
      p.nome, p.catNome,
      p.saldoIni.toFixed(2), p.entradas.toFixed(2), p.saidas.toFixed(2), p.saldoFim.toFixed(2),
      p.mediaDia.toFixed(3), p.unidade
    ])
  ];

  const csv = linhas.map(l => l.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `rotina_estoque_${casasLabel}_${iniStr}_${fimStr}.csv`.replace(/\s/g,'_');
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  showToast('✅ CSV exportado com sucesso!');
}
