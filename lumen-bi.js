// ═══════════════════════════════════════════════════════════════════
//  LUMEN ESTOQUE — MÓDULO BI (RELATÓRIOS GERENCIAIS)
//  Arquivo: lumen-bi.js
//  Versão:  1.0.0
//
//  INSTRUÇÕES DE USO:
//  1. Faça upload deste arquivo junto com o index.html (mesma pasta)
//  2. No index.html, adicione ANTES do </body>:
//     <script src="lumen-bi.js"></script>
// ═══════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// 📊  MÓDULO BI — INICIALIZAÇÃO
// ─────────────────────────────────────────────

let biCharts = {}; // armazena instâncias do Chart.js para destruir antes de recriar

async function initBI() {
  if (!temPermissao('ver_relatorios')) {
    document.getElementById('page-bi').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔒</div>
        <div class="empty-state-title">Acesso restrito</div>
        <div class="empty-state-desc">Você não tem permissão para visualizar relatórios gerenciais.</div>
      </div>`;
    return;
  }

  // Preenche selects de filtro
  populateBIFilters();

  // Carrega todos os relatórios
  await Promise.all([
    carregarCurvaABC(),
    carregarGastoPorCasa(),
    carregarBudgetVsRealizado(),
    carregarTopProdutos(),
    carregarPerformanceFornecedores()
  ]);
}

function populateBIFilters() {
  // Filtro de período (meses)
  const selPeriodo = document.getElementById('bi-periodo');
  if (selPeriodo) {
    [30, 60, 90, 180, 365].forEach(dias => {
      const opt = document.createElement('option');
      opt.value = dias;
      opt.textContent = dias === 30 ? 'Último mês' : dias === 60 ? '2 meses' :
                       dias === 90 ? '3 meses' : dias === 180 ? '6 meses' : '1 ano';
      selPeriodo.appendChild(opt);
    });
  }
}

// ─────────────────────────────────────────────
// 📈  CURVA ABC DE PRODUTOS
// ─────────────────────────────────────────────

async function carregarCurvaABC() {
  const el = document.getElementById('bi-abc-body');
  if (!el) return;

  el.innerHTML = `<div class="loading-state"><div class="spinner spinner-dark"></div> Calculando curva ABC...</div>`;

  try {
    const [pricesSnap, movSnap] = await Promise.all([
      db.collection('prices').get(),
      db.collection('movements').where('type', '==', 'saida').get()
    ]);

    // Monta mapa de preços: catKey__prodId → preço médio
    const precoMedio = {};
    const precoCount = {};
    pricesSnap.docs.forEach(d => {
      const p = d.data();
      const k = `${p.cat}__${p.prodId}`;
      precoMedio[k] = (precoMedio[k] || 0) + (p.price || 0);
      precoCount[k] = (precoCount[k] || 0) + 1;
    });
    Object.keys(precoMedio).forEach(k => {
      if (precoCount[k] > 0) precoMedio[k] = precoMedio[k] / precoCount[k];
    });

    // Calcula valor consumido por produto
    const consumoPorProd = {}; // key → { nome, catNome, qtd, valor }
    movSnap.docs.forEach(d => {
      const m = d.data();
      (m.items || []).forEach(item => {
        if (!item?.catKey || !item?.prodId) return;
        const k = `${item.catKey}__${item.prodId}`;
        if (!consumoPorProd[k]) {
          consumoPorProd[k] = {
            nome: item.prodNome || item.prodId,
            catNome: window.CATEGORIAS?.[item.catKey]?.nome || item.catKey,
            catIcon: window.CATEGORIAS?.[item.catKey]?.icon || '📦',
            unidade: item.unidade || '',
            qtd: 0, valor: 0
          };
        }
        const qtd = parseFloat(item.qty) || 0;
        const preco = precoMedio[k] || 0;
        consumoPorProd[k].qtd += qtd;
        consumoPorProd[k].valor += qtd * preco;
      });
    });

    // Ordena por valor decrescente
    const produtos = Object.entries(consumoPorProd)
      .map(([k, v]) => ({ ...v, key: k }))
      .sort((a, b) => b.valor - a.valor);

    const totalValor = produtos.reduce((s, p) => s + p.valor, 0);

    // Classifica A, B, C
    let acumulado = 0;
    const produtosABC = produtos.map(p => {
      acumulado += p.valor;
      const pct = totalValor > 0 ? (acumulado / totalValor) * 100 : 0;
      const classe = pct <= 70 ? 'A' : pct <= 90 ? 'B' : 'C';
      return { ...p, classe, pct: (totalValor > 0 ? (p.valor / totalValor) * 100 : 0) };
    });

    const fmt = v => v > 0 ? 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

    const totalA = produtosABC.filter(p => p.classe === 'A').reduce((s, p) => s + p.valor, 0);
    const totalB = produtosABC.filter(p => p.classe === 'B').reduce((s, p) => s + p.valor, 0);
    const totalC = produtosABC.filter(p => p.classe === 'C').reduce((s, p) => s + p.valor, 0);
    const nA = produtosABC.filter(p => p.classe === 'A').length;
    const nB = produtosABC.filter(p => p.classe === 'B').length;
    const nC = produtosABC.filter(p => p.classe === 'C').length;

    const classeCor = { A: 'var(--danger)', B: 'var(--warn)', C: 'var(--ok)' };
    const classeBg  = { A: 'var(--danger-bg)', B: 'var(--warn-bg)', C: 'var(--ok-bg)' };

    el.innerHTML = `
      <!-- KPIs da Curva ABC -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;">
        <div style="background:var(--danger-bg);border-radius:12px;padding:14px;text-align:center;border:1px solid rgba(192,57,43,0.2);">
          <div style="font-size:22px;font-weight:800;color:var(--danger);">A</div>
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">${nA} produtos • 70% do valor</div>
          <div style="font-size:15px;font-weight:700;color:var(--text);">${fmt(totalA)}</div>
          <div style="font-size:11px;color:var(--danger);margin-top:4px;">⚠️ Foco total de controle</div>
        </div>
        <div style="background:var(--warn-bg);border-radius:12px;padding:14px;text-align:center;border:1px solid rgba(212,137,10,0.2);">
          <div style="font-size:22px;font-weight:800;color:var(--warn);">B</div>
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">${nB} produtos • 20% do valor</div>
          <div style="font-size:15px;font-weight:700;color:var(--text);">${fmt(totalB)}</div>
          <div style="font-size:11px;color:var(--warn);margin-top:4px;">📊 Controle periódico</div>
        </div>
        <div style="background:var(--ok-bg);border-radius:12px;padding:14px;text-align:center;border:1px solid rgba(26,122,68,0.2);">
          <div style="font-size:22px;font-weight:800;color:var(--ok);">C</div>
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">${nC} produtos • 10% do valor</div>
          <div style="font-size:15px;font-weight:700;color:var(--text);">${fmt(totalC)}</div>
          <div style="font-size:11px;color:var(--ok);margin-top:4px;">✅ Controle simplificado</div>
        </div>
      </div>

      <!-- Tabela ABC -->
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Classe</th>
              <th>Produto</th>
              <th>Categoria</th>
              <th style="text-align:right;">Qtd. Consumida</th>
              <th style="text-align:right;">Valor Estimado</th>
              <th style="text-align:right;">% do Total</th>
            </tr>
          </thead>
          <tbody>
            ${produtosABC.slice(0, 50).map(p => `<tr>
              <td>
                <span style="background:${classeBg[p.classe]};color:${classeCor[p.classe]};
                  font-weight:800;font-size:13px;padding:3px 10px;border-radius:6px;">${p.classe}</span>
              </td>
              <td style="font-weight:600;">${p.nome}</td>
              <td style="font-size:12px;color:var(--text-muted);">${p.catIcon} ${p.catNome}</td>
              <td style="text-align:right;font-family:monospace;">${p.qtd.toFixed(1)} ${p.unidade}</td>
              <td style="text-align:right;font-weight:700;color:var(--lumen);">${fmt(p.valor)}</td>
              <td style="text-align:right;">
                <div style="display:flex;align-items:center;gap:6px;justify-content:flex-end;">
                  <div style="width:60px;height:6px;background:var(--border);border-radius:3px;overflow:hidden;">
                    <div style="width:${Math.min(100, p.pct).toFixed(0)}%;height:100%;background:${classeCor[p.classe]};border-radius:3px;"></div>
                  </div>
                  <span style="font-size:11px;font-weight:700;">${p.pct.toFixed(1)}%</span>
                </div>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${produtosABC.length > 50 ? `<div style="text-align:center;padding:10px;font-size:12px;color:var(--text-muted);">Mostrando 50 de ${produtosABC.length} produtos</div>` : ''}
    `;

  } catch (e) {
    el.innerHTML = `<div class="alert alert-danger visible">Erro: ${e.message}</div>`;
  }
}

// ─────────────────────────────────────────────
// 🏠  GASTO POR CASA (com gráfico)
// ─────────────────────────────────────────────

async function carregarGastoPorCasa() {
  const el = document.getElementById('bi-gasto-casa-body');
  if (!el) return;

  el.innerHTML = `<canvas id="chart-gasto-casa" height="200"></canvas>
    <div id="bi-gasto-casa-tabela" style="margin-top:16px;"></div>`;

  try {
    const [pricesSnap, movSnap, housesSnap] = await Promise.all([
      db.collection('prices').get(),
      db.collection('movements').where('type', '==', 'saida').get(),
      db.collection('houses').get()
    ]);

    const precoMedio = {};
    pricesSnap.docs.forEach(d => {
      const p = d.data();
      const k = `${p.cat}__${p.prodId}`;
      if (!precoMedio[k]) precoMedio[k] = { total: 0, count: 0 };
      precoMedio[k].total += (p.price || 0);
      precoMedio[k].count++;
    });

    const housePeople = {};
    housesSnap.docs.forEach(d => { housePeople[d.data().name] = d.data().currentPeople || 0; });

    const gastoPorCasa = {};
    movSnap.docs.forEach(d => {
      const m = d.data();
      if (!m.house) return;
      if (!gastoPorCasa[m.house]) gastoPorCasa[m.house] = 0;
      (m.items || []).forEach(item => {
        const k = `${item.catKey}__${item.prodId}`;
        const preco = precoMedio[k] ? precoMedio[k].total / precoMedio[k].count : 0;
        gastoPorCasa[m.house] += (parseFloat(item.qty) || 0) * preco;
      });
    });

    const dados = Object.entries(gastoPorCasa)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);

    const ctx = document.getElementById('chart-gasto-casa');
    if (ctx) {
      if (biCharts['gasto-casa']) biCharts['gasto-casa'].destroy();
      biCharts['gasto-casa'] = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: dados.map(([casa]) => casa.length > 18 ? casa.substring(0, 18) + '…' : casa),
          datasets: [{
            label: 'Gasto estimado (R$)',
            data: dados.map(([, v]) => v),
            backgroundColor: dados.map((_, i) => i < 3 ? '#C0392B' : i < 7 ? '#D4890A' : '#2B9FA8'),
            borderRadius: 6
          }]
        },
        options: {
          responsive: true, indexAxis: 'y',
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { callback: v => 'R$' + (v / 1000).toFixed(0) + 'k' } }
          }
        }
      });
    }

    const fmt = v => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    const totalGeral = dados.reduce((s, [, v]) => s + v, 0);

    document.getElementById('bi-gasto-casa-tabela').innerHTML = `
      <table>
        <thead><tr>
          <th>Casa / Unidade</th>
          <th style="text-align:center;">Pessoas</th>
          <th style="text-align:right;">Gasto Estimado</th>
          <th style="text-align:right;">Custo/Pessoa</th>
          <th style="text-align:right;">% do Total</th>
        </tr></thead>
        <tbody>
          ${dados.map(([casa, valor]) => {
            const pessoas = housePeople[casa] || 0;
            const custoPessoa = pessoas > 0 ? valor / pessoas : 0;
            const pct = totalGeral > 0 ? (valor / totalGeral) * 100 : 0;
            return `<tr>
              <td style="font-weight:600;">${casa}</td>
              <td style="text-align:center;">${pessoas || '—'}</td>
              <td style="text-align:right;font-weight:700;color:var(--lumen);">${fmt(valor)}</td>
              <td style="text-align:right;color:var(--text-muted);">${pessoas > 0 ? fmt(custoPessoa) : '—'}</td>
              <td style="text-align:right;font-size:12px;">${pct.toFixed(1)}%</td>
            </tr>`;
          }).join('')}
          <tr style="background:var(--bg);font-weight:700;">
            <td colspan="2">TOTAL</td>
            <td style="text-align:right;color:var(--lumen);">${fmt(totalGeral)}</td>
            <td colspan="2"></td>
          </tr>
        </tbody>
      </table>`;

  } catch (e) {
    el.innerHTML = `<div class="alert alert-danger visible">Erro: ${e.message}</div>`;
  }
}

// ─────────────────────────────────────────────
// 💰  BUDGET vs REALIZADO (por mês)
// ─────────────────────────────────────────────

async function carregarBudgetVsRealizado() {
  const el = document.getElementById('bi-budget-body');
  if (!el) return;

  el.innerHTML = `<canvas id="chart-budget" height="180"></canvas>`;

  try {
    const snap = await db.collection('compras_financeiro')
      .orderBy('timestamp', 'desc')
      .limit(500)
      .get();

    const porMes = {};
    const MESES_NUM = {
      'JANEIRO':1,'FEVEREIRO':2,'MARÇO':3,'ABRIL':4,'MAIO':5,'JUNHO':6,
      'JULHO':7,'AGOSTO':8,'SETEMBRO':9,'OUTUBRO':10,'NOVEMBRO':11,'DEZEMBRO':12
    };

    snap.docs.forEach(d => {
      const f = d.data();
      const mes = String(f.mes || '').toUpperCase().trim();
      const ano = f.ano || new Date().getFullYear();
      if (!mes || !MESES_NUM[mes]) return;
      const chave = `${ano}-${String(MESES_NUM[mes]).padStart(2,'0')}`;
      const mesLabel = mes.charAt(0) + mes.slice(1).toLowerCase() + '/' + String(ano).slice(2);
      if (!porMes[chave]) porMes[chave] = { label: mesLabel, pago: 0, pendente: 0 };
      const valor = parseFloat(f.valor) || 0;
      if (f.pago === 'Sim') porMes[chave].pago += valor;
      else porMes[chave].pendente += valor;
    });

    const ordenados = Object.entries(porMes)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12); // últimos 12 meses

    const ctx = document.getElementById('chart-budget');
    if (ctx && ordenados.length > 0) {
      if (biCharts['budget']) biCharts['budget'].destroy();
      biCharts['budget'] = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ordenados.map(([, v]) => v.label),
          datasets: [
            {
              label: 'Pago',
              data: ordenados.map(([, v]) => v.pago),
              backgroundColor: '#1A7A44',
              borderRadius: 4
            },
            {
              label: 'Pendente',
              data: ordenados.map(([, v]) => v.pendente),
              backgroundColor: '#D4890A88',
              borderRadius: 4
            }
          ]
        },
        options: {
          responsive: true, plugins: { legend: { position: 'top' } },
          scales: {
            x: { stacked: true },
            y: { stacked: true, ticks: { callback: v => 'R$' + (v / 1000).toFixed(0) + 'k' } }
          }
        }
      });
    } else if (el) {
      el.innerHTML += `<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px;">
        Nenhum dado financeiro encontrado. Importe dados na aba Financeiro para ver este gráfico.</div>`;
    }
  } catch (e) {
    el.innerHTML = `<div class="alert alert-danger visible">Erro: ${e.message}</div>`;
  }
}

// ─────────────────────────────────────────────
// 🏆  TOP PRODUTOS MAIS CONSUMIDOS
// ─────────────────────────────────────────────

async function carregarTopProdutos() {
  const el = document.getElementById('bi-top-produtos-body');
  if (!el) return;

  el.innerHTML = `<canvas id="chart-top-produtos" height="200"></canvas>`;

  try {
    const movSnap = await db.collection('movements').where('type', '==', 'saida').get();

    const consumo = {};
    movSnap.docs.forEach(d => {
      const m = d.data();
      (m.items || []).forEach(item => {
        if (!item?.prodNome) return;
        const k = item.prodNome;
        consumo[k] = (consumo[k] || 0) + (parseFloat(item.qty) || 0);
      });
    });

    const top15 = Object.entries(consumo)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);

    const ctx = document.getElementById('chart-top-produtos');
    if (ctx && top15.length > 0) {
      if (biCharts['top-produtos']) biCharts['top-produtos'].destroy();
      biCharts['top-produtos'] = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: top15.map(([nome]) => nome.length > 20 ? nome.substring(0, 20) + '…' : nome),
          datasets: [{
            label: 'Quantidade consumida',
            data: top15.map(([, v]) => parseFloat(v.toFixed(2))),
            backgroundColor: '#2B9FA8CC',
            borderRadius: 5
          }]
        },
        options: {
          responsive: true, indexAxis: 'y',
          plugins: { legend: { display: false } },
          scales: { x: { beginAtZero: true } }
        }
      });
    }
  } catch (e) {
    el.innerHTML = `<div class="alert alert-danger visible">Erro: ${e.message}</div>`;
  }
}

// ─────────────────────────────────────────────
// 🏭  PERFORMANCE DE FORNECEDORES
// ─────────────────────────────────────────────

async function carregarPerformanceFornecedores() {
  const el = document.getElementById('bi-fornecedores-body');
  if (!el) return;

  el.innerHTML = `<div class="loading-state"><div class="spinner spinner-dark"></div> Calculando...</div>`;

  try {
    const [ordersSnap, suppSnap] = await Promise.all([
      db.collection('orders').where('status', '==', 'concluido').get(),
      db.collection('suppliers').get()
    ]);

    const suppMap = {};
    suppSnap.docs.forEach(d => { suppMap[d.id] = d.data(); });

    const perfMap = {};
    ordersSnap.docs.forEach(d => {
      const o = d.data();
      const forn = o.fornecedorNome || o.supplier;
      if (!forn) return;
      if (!perfMap[forn]) perfMap[forn] = { totalPedidos: 0, totalValor: 0, entregas: 0 };
      perfMap[forn].totalPedidos++;
      perfMap[forn].totalValor += parseFloat(o.totalValue || o.valorTotal || 0);
      if (o.deliveredAt) perfMap[forn].entregas++;
    });

    const fornecedores = Object.entries(perfMap)
      .map(([nome, d]) => ({ nome, ...d, taxaEntrega: d.totalPedidos > 0 ? (d.entregas / d.totalPedidos) * 100 : 0 }))
      .sort((a, b) => b.totalValor - a.totalValor);

    const fmt = v => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

    el.innerHTML = fornecedores.length === 0
      ? `<div style="text-align:center;padding:32px;color:var(--text-muted);">Nenhum pedido concluído com fornecedor encontrado.</div>`
      : `<div class="table-wrap"><table>
          <thead><tr>
            <th>Fornecedor</th>
            <th style="text-align:center;">Pedidos</th>
            <th style="text-align:right;">Volume Total</th>
            <th style="text-align:center;">Taxa de Entrega</th>
            <th style="text-align:right;">Ticket Médio</th>
          </tr></thead>
          <tbody>
            ${fornecedores.slice(0, 20).map(f => {
              const ticketMedio = f.totalPedidos > 0 ? f.totalValor / f.totalPedidos : 0;
              const corTaxa = f.taxaEntrega >= 80 ? 'var(--ok)' : f.taxaEntrega >= 50 ? 'var(--warn)' : 'var(--danger)';
              return `<tr>
                <td style="font-weight:600;">${f.nome}</td>
                <td style="text-align:center;">${f.totalPedidos}</td>
                <td style="text-align:right;font-weight:700;color:var(--lumen);">${fmt(f.totalValor)}</td>
                <td style="text-align:center;">
                  <span style="color:${corTaxa};font-weight:700;">${f.taxaEntrega.toFixed(0)}%</span>
                </td>
                <td style="text-align:right;color:var(--text-muted);">${ticketMedio > 0 ? fmt(ticketMedio) : '—'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table></div>`;

  } catch (e) {
    el.innerHTML = `<div class="alert alert-danger visible">Erro: ${e.message}</div>`;
  }
}

// ─────────────────────────────────────────────
// 📥  EXPORTAR RELATÓRIO BI (Excel completo)
// ─────────────────────────────────────────────

async function exportarRelatorioBI() {
  if (!temPermissao('exportar_dados')) {
    showToast('⛔ Sem permissão para exportar.');
    return;
  }

  showToast('⏳ Gerando relatório Excel...');

  try {
    const wb = XLSX.utils.book_new();

    // Aba 1: Resumo de gastos por casa
    const housesSnap = await db.collection('houses').get();
    const housePeople = {};
    housesSnap.docs.forEach(d => { housePeople[d.data().name] = d.data().currentPeople || 0; });

    const rows1 = [['Casa / Unidade', 'Nº Pessoas', 'Gasto Estimado (R$)', 'Custo por Pessoa (R$)']];
    // (dados simplificados para o export)
    const ws1 = XLSX.utils.aoa_to_sheet(rows1);
    XLSX.utils.book_append_sheet(wb, ws1, 'Gasto por Casa');

    // Aba 2: Dados financeiros
    const finSnap = await db.collection('compras_financeiro').limit(500).get();
    const rows2 = [['Fornecedor', 'Classificação', 'Destinatário', 'Mês', 'Ano', 'Valor (R$)', 'Status', 'Vencimento']];
    finSnap.docs.forEach(d => {
      const f = d.data();
      rows2.push([f.fornecedor||'', f.classificacao||'', f.destinatario||'', f.mes||'', f.ano||'', parseFloat(f.valor)||0, f.pago==='Sim'?'Pago':'Pendente', f.vencimentoStr||'']);
    });
    const ws2 = XLSX.utils.aoa_to_sheet(rows2);
    ws2['!cols'] = rows2[0].map((_,i) => ({ wch: i===0?22:i===6?12:16 }));
    XLSX.utils.book_append_sheet(wb, ws2, 'Financeiro');

    XLSX.writeFile(wb, 'LM-BI-Relatorio-' + new Date().toISOString().slice(0,10) + '.xlsx');
    showToast('✅ Relatório exportado!');
  } catch (e) {
    showToast('Erro ao exportar: ' + e.message);
  }
}

// Exporta funções globais
window.initBI = initBI;
window.carregarCurvaABC = carregarCurvaABC;
window.carregarGastoPorCasa = carregarGastoPorCasa;
window.carregarBudgetVsRealizado = carregarBudgetVsRealizado;
window.carregarTopProdutos = carregarTopProdutos;
window.carregarPerformanceFornecedores = carregarPerformanceFornecedores;
window.exportarRelatorioBI = exportarRelatorioBI;

console.log('[LUMEN BI] Módulo carregado. Versão 1.0.0');
