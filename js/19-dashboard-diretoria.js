// ─────────────────────────────────────────────────────────────────────────
// Dashboard de Performance (Diretoria) — layout replica o mockup aprovado.
// DADOS ILUSTRATIVOS por enquanto: os indicadores reais serão conectados
// indicador por indicador, depois de definirmos junto com o usuário como
// cada um é calculado (gasto per capita, desvio orçamentário, SLA, etc.).
// ─────────────────────────────────────────────────────────────────────────
let _dashdirDonut = null;
let _dashdirLinhas = null;

const DASHDIR_MOTIVOS = [
  { label: 'Eventos',          valor: 1500, pct: 35, cor: '#14224a' },
  { label: 'Comvida',          valor: 1285, pct: 30, cor: '#e0a72e' },
  { label: 'Treinamento',      valor: 857,  pct: 20, cor: '#3f7cc4' },
  { label: 'Viagem a Serviço', valor: 428,  pct: 10, cor: '#8fc1e8' },
  { label: 'Outros',           valor: 215,  pct: 5,  cor: '#b9bfc7' },
];

const DASHDIR_MESES = ['jan/26','fev/26','mar/26','abr/26','mai/26','jun/26','jul/26','ago/26','set/26','out/26','nov/26','dez/26'];
const DASHDIR_SERIES = [
  { label: 'PROT Doação',       cor: '#d64545', dados: [180,230,260,220,190,170,160,150,140,150,160,190] },
  { label: 'PROT Comprado',     cor: '#e08a2e', dados: [820,980,1080,900,760,660,600,560,540,580,650,780] },
  { label: 'CER Doação',        cor: '#e8c93a', dados: [120,150,170,140,120,110,100,95,90,95,105,125] },
  { label: 'CER Comprado',      cor: '#3fae5a', dados: [420,520,560,470,400,350,320,300,290,310,340,400] },
  { label: 'HIG Doação',        cor: '#8fc1e8', dados: [90,110,120,100,85,75,70,65,60,65,72,88] },
  { label: 'HIG Comprado',      cor: '#3f7cc4', dados: [240,300,330,270,230,200,185,170,165,175,195,235] },
  { label: 'Total Consolidado', cor: '#1a1a1a', dados: [560,700,760,640,540,470,430,400,385,405,445,540] },
];

function initDashboardDiretoria() {
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

  const ctxL = document.getElementById('dashdir-linhas');
  if (ctxL && window.Chart) {
    if (_dashdirLinhas) _dashdirLinhas.destroy();
    _dashdirLinhas = new Chart(ctxL, {
      type: 'line',
      data: {
        labels: DASHDIR_MESES,
        datasets: DASHDIR_SERIES.map(s => ({
          label: s.label, data: s.dados, borderColor: s.cor, backgroundColor: s.cor,
          borderWidth: s.label === 'Total Consolidado' ? 2.5 : 1.5,
          pointRadius: 3, tension: 0.35, fill: false,
        })),
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10.5 } } } },
        scales: { y: { beginAtZero: true, ticks: { callback: v => 'R$' + v } } },
      },
    });
  }
}
window.initDashboardDiretoria = initDashboardDiretoria;
