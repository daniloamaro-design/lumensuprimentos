// Extraído de index.html (per capita financeiro + ajustes + dashboard) em 2026-07-27
// ─────────────────────────────────────────────
// 💰  PER CAPITA FINANCEIRO
// ─────────────────────────────────────────────
let pcfCasasSelecionadas = new Set(); // vazio = todas

function renderPcfCasaChips() {
  const box = document.getElementById('pcf-casa-chips');
  if (!box) return;
  box.innerHTML = '';
  CASAS.forEach(nome => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'irm-chip' + (pcfCasasSelecionadas.has(nome) ? ' selected' : '');
    chip.textContent = nome;
    chip.dataset.casa = nome;
    chip.onclick = () => togglePcfCasaChip(nome);
    box.appendChild(chip);
  });
  atualizarPcfCasaCount();
}

function togglePcfCasaChip(nome) {
  if (pcfCasasSelecionadas.has(nome)) pcfCasasSelecionadas.delete(nome);
  else pcfCasasSelecionadas.add(nome);
  const chip = document.querySelector(`#pcf-casa-chips .irm-chip[data-casa="${CSS.escape(nome)}"]`);
  if (chip) chip.classList.toggle('selected', pcfCasasSelecionadas.has(nome));
  atualizarPcfCasaCount();
  // Não recalcula sozinho — a consulta aqui é mais pesada (percorre pedido por pedido
  // com await sequencial), então só recalcula quando clicar em "Calcular".
}

function pcfCasaSelectAll() {
  pcfCasasSelecionadas = new Set(CASAS);
  document.querySelectorAll('#pcf-casa-chips .irm-chip').forEach(c => c.classList.add('selected'));
  atualizarPcfCasaCount();
}

function pcfCasaClearAll() {
  pcfCasasSelecionadas = new Set();
  document.querySelectorAll('#pcf-casa-chips .irm-chip').forEach(c => c.classList.remove('selected'));
  atualizarPcfCasaCount();
}

function filtrarPcfCasaChips(termo) {
  const t = (termo || '').toLowerCase().trim();
  document.querySelectorAll('#pcf-casa-chips .irm-chip').forEach(chip => {
    const nome = (chip.dataset.casa || '').toLowerCase();
    chip.style.display = (!t || nome.includes(t)) ? '' : 'none';
  });
}

function getPcfCasasSelecionadas() {
  return (pcfCasasSelecionadas.size === 0 || pcfCasasSelecionadas.size === CASAS.length)
    ? [...CASAS]
    : Array.from(pcfCasasSelecionadas);
}

function atualizarPcfCasaCount() {
  const el = document.getElementById('pcf-casa-count');
  if (!el) return;
  const n = pcfCasasSelecionadas.size;
  el.textContent = (n === 0 || n === CASAS.length) ? '(todas as casas)' : `(${n} selecionada${n > 1 ? 's' : ''})`;
}


// Timbrado padrão (Ser Feliz) recortado do modelo enviado — só as faixas coloridas,
// sem o texto de CNPJ/empresa do rodapé (ficou de fora do recorte de propósito).
let pcfUltimoResultado = null;

async function initPercapitaFinanceiro() {
  pcfCasasSelecionadas = new Set();
  renderPcfCasaChips();
  const wrap = document.getElementById('pcf-resultado-wrap');
  if (wrap) wrap.style.display = 'none';
}

function getPercapitaPeriodos() {
  const hoje = new Date();
  // Corte no 1º dia do mês (não no dia exato de hoje) — assim um mês incompleto
  // (ex: pedido só a partir do dia 20) já conta como "dentro do trimestre",
  // igual a tabela mensal já trata o mês inteiro como uma unidade só.
  return {
    m3:    new Date(hoje.getFullYear(), hoje.getMonth()-3, 1),
    m6:    new Date(hoje.getFullYear(), hoje.getMonth()-6, 1),
    m12:   new Date(hoje.getFullYear(), hoje.getMonth()-12, 1),
  };
}

// dateStr aparece em formatos diferentes no sistema (yyyymmdd no giro de estoque,
// mas pode ser yyyy-mm-dd em pedidos antigos) — tenta os dois antes de cair pra createdAt.
function getOrderDateCardapio(o) {
  if (o.dateStr) {
    const s = String(o.dateStr);
    if (/^\d{8}$/.test(s)) return new Date(`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`);
    const d = new Date(s);
    if (!isNaN(d)) return d;
  }
  if (o.createdAt && o.createdAt.toDate) return o.createdAt.toDate();
  return null;
}

async function calcularPercapitaFinanceiro() {
  const casas = getPcfCasasSelecionadas();
  if (!casas.length) { showToast('⚠️ Selecione ao menos uma casa.'); return; }

  document.getElementById('pcf-resultado-wrap').style.display = 'block';
  document.getElementById('pcf-tbody').innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;"><div class="spinner spinner-dark"></div></td></tr>';
  document.getElementById('pcf-avisos').textContent = '';

  const DIAS_LIMITE_ATUAL = 20; // ciclo de pedido é quinzenal — acima disso, "atual" está desatualizado
  const periodos = getPercapitaPeriodos();
  const categoriasReport = ['cereal','proteina','higiene'];

  const acc = {};
  const oldestDate = {}; // data do pedido mais antigo já visto por categoria (dentro da janela de 12 meses)
  ['m3','m6','m12'].forEach(p => { acc[p] = {}; categoriasReport.forEach(c => acc[p][c] = { valor:0, pessoas:0 }); });
  categoriasReport.forEach(c => oldestDate[c] = null);

  const ultimoPorCasaCategoria = {}; // ultimoPorCasaCategoria[casa][cat] = { valor, pessoas, data }

  // 12 meses corridos (mais antigo → mais recente), pra tabela e gráfico de evolução mensal
  const hojeRef = new Date();
  const meses = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(hojeRef.getFullYear(), hojeRef.getMonth() - i, 1);
    meses.push({ key: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, label: d.toLocaleDateString('pt-BR',{month:'short',year:'2-digit'}) });
  }
  const accMensal = {};
  meses.forEach(m => { accMensal[m.key] = {}; categoriasReport.forEach(c => accMensal[m.key][c] = { valor:0, pessoas:0 }); });

  let pedidosMistosExcluidos = 0;
  let valoresEstimados = 0;
  let pedidosSemValor = 0;

  for (const casa of casas) {
    ultimoPorCasaCategoria[casa] = {};
    categoriasReport.forEach(c => ultimoPorCasaCategoria[casa][c] = null);

    let ordersSnap;
    try {
      ordersSnap = await db.collection('orders').where('house','==',casa).get();
    } catch(e) { continue; }

    for (const doc of ordersSnap.docs) {
      const o = doc.data();
      const dataPedido = getOrderDateCardapio(o);
      if (!dataPedido || dataPedido < periodos.m12) continue; // fora até da maior janela, ignora

      let valor = parseFloat(o.nfValor) || 0;
      let estimado = false;
      if (!valor) {
        try {
          const qSnap = await db.collection('quotations')
            .where('orderId','==',doc.id).where('status','==','aprovado').limit(1).get();
          if (!qSnap.empty) { valor = parseFloat(qSnap.docs[0].data().valor) || 0; estimado = true; }
        } catch(e) {}
      }
      if (!valor) { pedidosSemValor++; continue; }
      if (estimado) valoresEstimados++;

      const pessoas = parseFloat(o.people) || 0;
      if (!pessoas) continue; // sem população registrada nesse pedido, não dá pra ratear por pessoa

      const cats = Array.isArray(o.categories) ? o.categories : [];
      const isMisto = cats.length > 1;
      if (isMisto) pedidosMistosExcluidos++;
      // Geral agora é a soma de Cereal+Proteína+Higiene — pedido sem categoria única
      // não entra em lugar nenhum (nem "Geral" existe mais como acumulado à parte).
      if (isMisto || cats.length !== 1 || !categoriasReport.includes(cats[0])) continue;
      const cat = cats[0];

      if (!oldestDate[cat] || dataPedido < oldestDate[cat]) oldestDate[cat] = dataPedido;

      ['m3','m6','m12'].forEach(p => {
        if (dataPedido < periodos[p]) return;
        acc[p][cat].valor += valor;
        acc[p][cat].pessoas += pessoas;
      });

      const mk = `${dataPedido.getFullYear()}-${String(dataPedido.getMonth()+1).padStart(2,'0')}`;
      if (accMensal[mk]) {
        accMensal[mk][cat].valor += valor;
        accMensal[mk][cat].pessoas += pessoas;
      }

      const atualExistente = ultimoPorCasaCategoria[casa][cat];
      if (!atualExistente || dataPedido > atualExistente.data) {
        ultimoPorCasaCategoria[casa][cat] = { valor, pessoas, data: dataPedido };
      }
    }
  }

  // Um período só é considerado completo se existir pedido mais antigo que o próprio
  // corte do período — senão o valor mostrado seria idêntico ao de uma janela menor,
  // dando a falsa impressão de ser uma média real daquele período mais longo.
  const completo = {};
  ['m3','m6','m12'].forEach(p => {
    completo[p] = {};
    categoriasReport.forEach(c => {
      // Compara MÊS com MÊS (não dia com dia) — um pedido em qualquer dia do mês de corte
      // já conta como "dentro do período", mesmo que tenha sido feito depois do dia 1.
      const mesIndice = d => d.getFullYear()*12 + d.getMonth();
      completo[p][c] = !!(oldestDate[c] && mesIndice(oldestDate[c]) <= mesIndice(periodos[p]));
    });
  });

  // 'Atual' = último pedido individual por casa+categoria, somado entre as casas selecionadas
  const hoje = new Date();
  const atual = {};
  const atualDesatualizado = {};
  categoriasReport.forEach(cat => {
    let valor = 0, pessoas = 0, temDado = false, temAntigo = false;
    casas.forEach(casa => {
      const d = ultimoPorCasaCategoria[casa]?.[cat];
      if (!d) return;
      temDado = true;
      valor += d.valor;
      pessoas += d.pessoas;
      const diasDesde = (hoje - d.data) / 86400000;
      if (diasDesde > DIAS_LIMITE_ATUAL) temAntigo = true;
    });
    atual[cat] = temDado ? { valor, pessoas } : null;
    atualDesatualizado[cat] = temAntigo;
  });

  pcfUltimoResultado = { casas, acc, atual, atualDesatualizado, completo, accMensal, meses,
    avisos: { pedidosMistosExcluidos, valoresEstimados, pedidosSemValor } };

  renderPercapitaFinanceiro(acc, atual, atualDesatualizado, completo, { pedidosMistosExcluidos, valoresEstimados, pedidosSemValor });
  renderPercapitaMensal(accMensal, meses);
}

function renderPercapitaFinanceiro(acc, atual, atualDesatualizado, completo, avisos) {
  const nomesCat = { cereal:'Cereal', proteina:'Proteína', higiene:'Higiene', geral:'Geral' };
  const categoriasReport = ['cereal','proteina','higiene'];
  const linhas = [...categoriasReport, 'geral'];
  const periodosHistorico = ['m3','m6','m12'];

  // custo por pessoa de cada categoria em 'atual', pra poder derivar o Geral (soma das 3)
  const custoAtualPorCat = {};
  categoriasReport.forEach(cat => {
    const a = atual[cat];
    custoAtualPorCat[cat] = (a && a.pessoas) ? (a.valor / a.pessoas) : null;
  });

  document.getElementById('pcf-tbody').innerHTML = linhas.map(cat => {
    let celAtual;
    if (cat === 'geral') {
      const valores = categoriasReport.map(c => custoAtualPorCat[c]);
      if (valores.some(v => v === null)) {
        celAtual = '<td class="pcf-nodata">sem dados</td>';
      } else {
        const soma = valores.reduce((a,b) => a+b, 0);
        const avisoIcone = categoriasReport.some(c => atualDesatualizado[c]) ? ' <span title="Pelo menos uma categoria está baseada num pedido com mais de 20 dias" style="cursor:help;">⚠️</span>' : '';
        celAtual = `<td>R$ ${soma.toLocaleString('pt-BR',{minimumFractionDigits:2})}${avisoIcone}</td>`;
      }
    } else {
      const a = atual[cat];
      if (!a || !a.pessoas) {
        celAtual = '<td class="pcf-nodata">sem dados</td>';
      } else {
        const custo = a.valor / a.pessoas;
        const avisoIcone = atualDesatualizado[cat] ? ' <span title="Pedido mais recente com mais de 20 dias — valor pode estar desatualizado" style="cursor:help;">⚠️</span>' : '';
        celAtual = `<td>R$ ${custo.toLocaleString('pt-BR',{minimumFractionDigits:2})}${avisoIcone}</td>`;
      }
    }

    const cellsHistorico = periodosHistorico.map(p => {
      if (cat === 'geral') {
        const custos = categoriasReport.map(c => {
          if (!completo[p][c]) return null;
          const d = acc[p][c];
          if (!d.pessoas) return null;
          return d.valor / d.pessoas;
        });
        if (custos.some(v => v === null)) return '<td class="pcf-nodata">sem dados</td>';
        const soma = custos.reduce((a,b) => a+b, 0);
        return `<td>R$ ${soma.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>`;
      }
      if (!completo[p][cat]) return '<td class="pcf-nodata">sem dados</td>';
      const d = acc[p][cat];
      if (!d.pessoas) return '<td class="pcf-nodata">sem dados</td>';
      const custo = d.valor / d.pessoas;
      return `<td>R$ ${custo.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>`;
    }).join('');
    return `<tr><td>${nomesCat[cat]}</td>${celAtual}${cellsHistorico}</tr>`;
  }).join('');

  const notas = [];
  if (Object.values(atualDesatualizado).some(v => v)) notas.push('⚠️ A coluna "Atual" de pelo menos uma categoria está baseada num pedido com mais de 20 dias — pode não refletir o custo mais recente de verdade.');
  if (avisos.pedidosMistosExcluidos > 0) notas.push(`⚠️ ${avisos.pedidosMistosExcluidos} pedido(s) com mais de uma categoria foram excluídos do cálculo inteiro (Geral agora é a soma de Cereal+Proteína+Higiene, então pedido sem categoria única não entra em nada).`);
  if (avisos.valoresEstimados > 0) notas.push(`ℹ️ ${avisos.valoresEstimados} pedido(s) sem Nota Fiscal anexada usaram o valor da cotação aprovada como estimativa.`);
  if (avisos.pedidosSemValor > 0) notas.push(`⚠️ ${avisos.pedidosSemValor} pedido(s) não entraram no cálculo por não ter NF nem cotação aprovada com valor.`);
  document.getElementById('pcf-avisos').innerHTML = notas.join('<br>');
}

let pcfChartMensal = null;

function renderPercapitaMensal(accMensal, meses) {
  const nomesCat = { cereal:'Cereal', proteina:'Proteína', higiene:'Higiene', geral:'Geral' };
  const categoriasReport = ['cereal','proteina','higiene'];
  const linhas = [...categoriasReport, 'geral'];

  // custo por pessoa por mês e por categoria — null quando não teve pedido naquele mês
  const custoMensal = {}; // custoMensal[cat][mesKey] = número ou null
  linhas.forEach(cat => custoMensal[cat] = {});
  meses.forEach(m => {
    categoriasReport.forEach(cat => {
      const d = accMensal[m.key][cat];
      custoMensal[cat][m.key] = d.pessoas ? (d.valor / d.pessoas) : null;
    });
    const partes = categoriasReport.map(c => custoMensal[c][m.key]);
    custoMensal.geral[m.key] = partes.some(v => v === null) ? null : partes.reduce((a,b)=>a+b,0);
  });

  // Cabeçalho da tabela (Categoria + 12 meses)
  const theadRow = document.getElementById('pcf-mensal-thead-row');
  theadRow.innerHTML = '<th>Categoria</th>' + meses.map(m => `<th>${m.label}</th>`).join('');

  document.getElementById('pcf-tbody-mensal').innerHTML = linhas.map(cat => {
    const cels = meses.map(m => {
      const v = custoMensal[cat][m.key];
      return v === null ? '<td class="pcf-nodata">—</td>' : `<td>R$ ${v.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>`;
    }).join('');
    return `<tr><td>${nomesCat[cat]}</td>${cels}</tr>`;
  }).join('');

  // Gráfico de linha — uma série por categoria, meses mais antigos → mais recentes
  const cores = { cereal:'#e6b800', proteina:'#e05a5a', higiene:'#5aa9e0', geral:'#8ad46b' };
  const datasets = linhas.map(cat => ({
    label: nomesCat[cat],
    data: meses.map(m => custoMensal[cat][m.key]),
    borderColor: cores[cat],
    backgroundColor: cores[cat],
    spanGaps: false, // não conecta a linha por cima de mês sem dado — mais honesto que fingir continuidade
    tension: 0.25,
    pointRadius: 3,
  }));

  const ctx = document.getElementById('pcf-chart-mensal');
  if (pcfChartMensal) pcfChartMensal.destroy();
  pcfChartMensal = new Chart(ctx, {
    type: 'line',
    data: { labels: meses.map(m => m.label), datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: '#ccc' } } },
      scales: {
        x: { ticks: { color: '#999' }, grid: { color: 'rgba(255,255,255,0.06)' } },
        y: { ticks: { color: '#999', callback: v => 'R$ '+v }, grid: { color: 'rgba(255,255,255,0.06)' } }
      }
    }
  });
}

function exportarPercapitaFinanceiroPDF() {
  if (!pcfUltimoResultado) { showToast('⚠️ Clique em Calcular antes de exportar o relatório.'); return; }
  const { casas, acc, atual, atualDesatualizado, completo, accMensal, meses, avisos } = pcfUltimoResultado;

  const nomesCat = { cereal:'Cereal', proteina:'Proteína', higiene:'Higiene', geral:'Geral' };
  const categoriasReport = ['cereal','proteina','higiene'];
  const linhas = [...categoriasReport, 'geral'];
  const fmt = v => v === null || v === undefined ? '—' : `R$ ${v.toLocaleString('pt-BR',{minimumFractionDigits:2})}`;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const dataStr = new Date().toLocaleDateString('pt-BR');
  const casasTxt = (casas.length === CASAS.length) ? 'Todas as casas' : casas.join(', ');

  const desenhaCabecalho = () => {
    doc.setTextColor(0,0,0);
    doc.setFontSize(14);
    doc.text('Obra Lumen — Per Capita Financeiro', 14, 13);
    doc.setFontSize(10);
    doc.text(`Casas: ${casasTxt}   |   Data: ${dataStr}`, 14, 20, { maxWidth: 180 });
  };

  desenhaCabecalho();
  let cursorY = 34; // posição vertical controlada manualmente — nunca confia em finalY de uma tabela anterior

  const novaPaginaSeNecessario = (alturaNecessaria) => {
    if (cursorY + alturaNecessaria > 280) { doc.addPage(); desenhaCabecalho(); cursorY = 34; }
  };

  // Resumo (Atual / 3 / 6 / 12 meses)
  const custoAtualPorCat = {};
  categoriasReport.forEach(cat => {
    const a = atual[cat];
    custoAtualPorCat[cat] = (a && a.pessoas) ? (a.valor/a.pessoas) : null;
  });
  const linhasResumo = linhas.map(cat => {
    let vAtual;
    if (cat === 'geral') {
      const vs = categoriasReport.map(c => custoAtualPorCat[c]);
      vAtual = vs.some(v=>v===null) ? null : vs.reduce((a,b)=>a+b,0);
    } else {
      vAtual = custoAtualPorCat[cat] !== undefined ? custoAtualPorCat[cat] : null;
    }
    const periodosVals = ['m3','m6','m12'].map(p => {
      if (cat === 'geral') {
        const vs = categoriasReport.map(c => (completo[p][c] && acc[p][c].pessoas) ? acc[p][c].valor/acc[p][c].pessoas : null);
        return vs.some(v=>v===null) ? null : vs.reduce((a,b)=>a+b,0);
      }
      if (!completo[p][cat] || !acc[p][cat].pessoas) return null;
      return acc[p][cat].valor/acc[p][cat].pessoas;
    });
    return [nomesCat[cat], fmt(vAtual), ...periodosVals.map(fmt)];
  });

  doc.setTextColor(0,0,0);
  doc.setFontSize(12);
  doc.text('Resumo por período', 14, cursorY);
  doc.autoTable({
    startY: cursorY + 4,
    head: [['Categoria','Atual','Últimos 3 meses','Últimos 6 meses','Últimos 12 meses']],
    body: linhasResumo,
    styles: { fontSize: 9, textColor: [0,0,0] },
    headStyles: { textColor: [255,255,255] }
  });
  cursorY = doc.lastAutoTable.finalY + 16; // espaço generoso antes do próximo bloco

  // Tabela mensal
  novaPaginaSeNecessario(60);
  doc.setTextColor(0,0,0);
  doc.setFontSize(12);
  doc.text('Análise mensal (últimos 12 meses)', 14, cursorY);

  const custoMensal = {};
  linhas.forEach(cat => custoMensal[cat] = {});
  meses.forEach(m => {
    categoriasReport.forEach(cat => {
      const d = accMensal[m.key][cat];
      custoMensal[cat][m.key] = d.pessoas ? d.valor/d.pessoas : null;
    });
    const partes = categoriasReport.map(c => custoMensal[c][m.key]);
    custoMensal.geral[m.key] = partes.some(v=>v===null) ? null : partes.reduce((a,b)=>a+b,0);
  });
  const bodyMensal = linhas.map(cat => [nomesCat[cat], ...meses.map(m => fmt(custoMensal[cat][m.key]))]);

  doc.autoTable({
    startY: cursorY + 4,
    head: [['Categoria', ...meses.map(m => m.label)]],
    body: bodyMensal,
    styles: { fontSize: 6.5, cellPadding: 1.3, textColor: [0,0,0] },
    headStyles: { textColor: [255,255,255] }
  });
  cursorY = doc.lastAutoTable.finalY + 16; // espaço generoso antes do gráfico

  // Gráfico — captura o canvas já desenhado na tela pelo Chart.js
  const canvas = document.getElementById('pcf-chart-mensal');
  if (canvas && canvas.width > 0) {
    const imgW = 182;
    const imgH = imgW * (canvas.height / canvas.width);
    novaPaginaSeNecessario(imgH + 10);
    doc.setTextColor(0,0,0);
    doc.setFontSize(12);
    doc.text('Evolução mensal — custo por pessoa', 14, cursorY);
    doc.addImage(canvas.toDataURL('image/png', 1.0), 'PNG', 14, cursorY + 4, imgW, imgH);
    cursorY += imgH + 16; // só agora o cursor reflete o espaço real ocupado pelo gráfico
  }

  // Avisos/observações — agora usam o cursor real, depois do gráfico, não mais a tabela anterior
  const notas = [];
  if (avisos.valoresEstimados > 0) notas.push(`• ${avisos.valoresEstimados} pedido(s) sem Nota Fiscal anexada usaram o valor da cotação aprovada como estimativa.`);
  if (avisos.pedidosMistosExcluidos > 0) notas.push(`• ${avisos.pedidosMistosExcluidos} pedido(s) com mais de uma categoria não entraram no cálculo (Geral = soma de Cereal+Proteína+Higiene).`);
  if (avisos.pedidosSemValor > 0) notas.push(`• ${avisos.pedidosSemValor} pedido(s) não entraram por não ter NF nem cotação aprovada com valor.`);
  if (notas.length) {
    novaPaginaSeNecessario(notas.length * 5 + 8);
    doc.setFontSize(8);
    doc.setTextColor(0,0,0);
    notas.forEach((n, i) => doc.text(n, 14, cursorY + i*5, { maxWidth: 182 }));
  }

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(0,0,0);
    doc.text(`Suprimentos Obra Lumen — Página ${i} de ${pageCount}`, 14, doc.internal.pageSize.height - 8);
  }

  doc.save(`Per_Capita_Financeiro_${new Date().toISOString().slice(0,10)}.pdf`);
}

function goPage(page) {
  // Desliga qualquer listener de tempo real da página anterior (all-orders,
  // orc-pendentes, var-solicitacoes) antes de trocar de página — evita listener
  // órfão rodando em segundo plano (e falhando contra as regras depois do logout).
  if (window._pageListener) { window._pageListener(); window._pageListener = null; }

  // ── Guarda de acesso por perfil (U4: permissões editáveis) ──
  // O 'admin' tem acesso total garantido (salvaguarda). Para os demais perfis,
  // o conjunto de páginas vem da tabela role_permissions (window.PERMISSOES),
  // com fallback para a matriz padrão (window.FALLBACK_PERMS, em js/18-erp.js)
  // caso o banco/tela de permissões ainda não esteja disponível.
  const role = currentUserData?.role || 'usuario';
  if (role !== 'admin' && typeof permSetDe === 'function') {
    const ps = permSetDe(role);           // Set de páginas, 'ALL', ou null (desconhecido)
    if (ps && ps !== 'ALL' && !ps.has(page)) {
      showToast('⛔ Você não tem permissão para esta página.');
      return;
    }
  }
  // ── fim da guarda ──

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));
  const pageEl = document.getElementById(`page-${page}`);
  if (!pageEl) return;
  pageEl.classList.add('active');

  // ── Limpa listeners/timers da página anterior ──
  // _pageListenerPending cancela o setTimeout caso o usuário troque de página
  // antes do callback ser executado (evita listener órfão)
  if (window._pageListenerPending) { clearTimeout(window._pageListenerPending); window._pageListenerPending = null; }
  if (window._pageListener) { window._pageListener(); window._pageListener = null; }
  if (window._pageTimer)    { clearInterval(window._pageTimer); window._pageTimer = null; }
  window._currentActivePage = page;

  // Inicializa páginas que precisam de carregamento ao abrir
  if (page === 'produtividade') setTimeout(loadProdutividade, 50);
  if (page === 'kanban') setTimeout(loadKanban, 50);
  // Módulo Fretes (U3)
  if (page === 'frt-lista') setTimeout(loadFrtLista, 50);
  if (page === 'frt-novo') setTimeout(loadFrtNovoForm, 50);
  if (page === 'frt-freteiros') setTimeout(loadFrtFreteiros, 50);
  if (page === 'frt-metas') setTimeout(loadFrtMetas, 50);
  if (page === 'frt-indicadores') setTimeout(loadFrtIndicadores, 50);
  // Módulo Passagens (U3)
  if (page === 'pas-solicitacoes') setTimeout(loadPasSolic, 50);
  if (page === 'pas-nova') setTimeout(loadPasNovaForm, 50);
  if (page === 'pas-indicadores') setTimeout(loadPasIndicadores, 50);
  if (page === 'pas-calendario') setTimeout(loadPasCalendario, 50);
  if (page === 'pas-orcamento') setTimeout(loadPasOrcamento, 50);
  if (page === 'ind-geral') setTimeout(loadIndGeral, 50);
  if (page === 'diretoria-dashboard') setTimeout(initDashboardDiretoria, 50);
  if (page === 'diretoria-percapita') setTimeout(initDiretoriaPercapita, 50);
  if (page === 'plano-acao') setTimeout(loadPlanoAcao, 50);
  // Permissões (U4)
  if (page === 'permissoes') setTimeout(loadPermissoesUI, 50);
  if (page === 'dashboard') {
    setTimeout(restaurarEstadoPaineis, 50);
    // Auto-refresh dashboard a cada 3 minutos
    window._pageTimer = setInterval(() => {
      if (window._currentActivePage === 'dashboard') loadDashboard();
    }, 180000);
  }
  // onSnapshot em tempo real para pedidos
  if (page === 'all-orders') {
    window._pageListenerPending = setTimeout(() => {
      window._pageListenerPending = null;
      if (window._currentActivePage !== 'all-orders') return;
      loadAllOrders();
      if (window._pageListener) { window._pageListener(); window._pageListener = null; }
      window._pageListener = db.collection('orders').orderBy('createdAt','desc').limit(1)
        .onSnapshot(() => { if (window._currentActivePage === 'all-orders') loadAllOrders(); });
    }, 50);
  }
  // onSnapshot em tempo real para orçamentos pendentes
  if (page === 'orc-pendentes') {
    window._pageListenerPending = setTimeout(() => {
      window._pageListenerPending = null;
      if (window._currentActivePage !== 'orc-pendentes') return;
      initOrcPendentes();
      if (window._pageListener) { window._pageListener(); window._pageListener = null; }
      window._pageListener = db.collection('orders').where('status','==','andamento')
        .onSnapshot(() => { if (window._currentActivePage === 'orc-pendentes') initOrcPendentes(); });
    }, 50);
  }
  // onSnapshot em tempo real para variedades
  if (page === 'var-solicitacoes') {
    window._pageListenerPending = setTimeout(() => {
      window._pageListenerPending = null;
      if (window._currentActivePage !== 'var-solicitacoes') return;
      loadVarSolicitacoes();
      if (window._pageListener) { window._pageListener(); window._pageListener = null; }
      window._pageListener = db.collection('var_solicitacoes').orderBy('criadoEm','desc').limit(1)
        .onSnapshot(() => { if (window._currentActivePage === 'var-solicitacoes') loadVarSolicitacoes(); });
    }, 50);
  }
  const activeBtn = document.querySelector(`.sidebar-item[data-page="${page}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  // Update mobile bottom nav active state
  const _mobilePages = { 'dashboard':0, 'new-order':1, 'movement':2, 'my-orders':3 };
  document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
  if (_mobilePages[page] !== undefined) {
    const _btns = document.querySelectorAll('.mobile-nav-btn');
    if (_btns[_mobilePages[page]]) _btns[_mobilePages[page]].classList.add('active');
  }

  const titles = {
    'dashboard':'Painel Geral','users':'Usuários','houses':'Casas e Pessoas',
    'all-orders':'Todos os Pedidos','new-order':'Nova Solicitação','my-orders':'Meus Pedidos',
    'movement':'Entrada / Saída','stock-view':'Estoque Atual','prices':'Preços por Cidade',
    'percapita':'Per Capita por Casa','manage-houses':'Gerenciar Casas',
    'manage-cities':'Gerenciar Cidades','manage-products':'Gerenciar Produtos',
    'indicadores':'Indicadores','transferencias':'Transferências',
    'fornecedores':'Fornecedores','calc-real':'Calculado × Real','orcamento-financeiro':'Orçamento Financeiro','ind-fornecedores':'Indicadores de Fornecedores','orc-pendentes':'Orçamentos Pendentes','financeiro-compras':'Financeiro — Compras','metas':'Metas e Análise Econômica','var-solicitacoes':'Solicitações de Variedades','var-orcamento':'Orçamentos de Variedades','var-proposta':'Proposta Semanal','var-historico':'Histórico de Compras','var-setores':'Gerenciar Setores','rotina-estoque':'Rotina de Estoque','manage-cc':'Gerenciar Centro de Custo','cardapio-diario':'Cardápio Diário','percapita-financeiro':'Per Capita Financeiro','inventario':'Contagem de Inventário','coord-dashboard':'Painel do Coordenador'
  };
  document.getElementById('topbar-page-title').textContent = titles[page] || '';

  if (page === 'users')            { loadUsers(); }
  if (page === 'houses')           { loadHouses(); }
  if (page === 'my-orders')        { loadMyOrders(); }
  if (page === 'new-order')        { renderOrderProducts(); _ccPopularSelects(); }
  if (page === 'movement')         { setMovCat('cereal'); }
  if (page === 'stock-view')       { loadStockView(); }
  if (page === 'prices')           { loadPrices(); }
  if (page === 'percapita')        { loadPercapitaPage(); }
  if (page === 'manage-houses')    { loadManageHouses(); }
  if (page === 'manage-cities')    { loadManageCities(); }
  if (page === 'manage-products')  { initManageProducts(); }
  if (page === 'indicadores')      { initIndicadores(); }
  if (page === 'irmaos')          { loadIrmaosIndicadores(); }
  if (page === 'transferencias')   { initTransferencias(); }
  if (page === 'fornecedores')     { loadSuppliers(); }
  if (page === 'ind-fornecedores')  { initIndFornecedores(); }
  if (page === 'calc-real')         { loadCalcReal(); }
  if (page === 'orcamento-financeiro') { initOrcamentoFinanceiro(); }
  if (page === 'financeiro-compras')    { initFinanceiroCompras(); }
  if (page === 'metas')                { initMetas(); }
  if (page === 'manage-cats')          { initManageCats(); }
  if (page === 'manage-cc')            { initManageCC(); }
  if (page === 'cardapio-diario')      { setTimeout(initCardapioDiario, 50); }
  if (page === 'percapita-financeiro') { setTimeout(initPercapitaFinanceiro, 50); }
  if (page === 'previsao')             { initPrevisao(); }
  if (page === 'var-orcamento')        { loadVarOrcamento(); }
  if (page === 'var-proposta')         { loadVarProposta(); }
  if (page === 'var-historico')        { loadVarHistorico(); }
  if (page === 'var-setores')          { loadVarSetores(); }
  if (page === 'rotina-estoque')       { initRotinaEstoque(); }
  if (page === 'inventario')           { if (typeof initPageInventario === 'function') initPageInventario(); }
  if (page === 'coord-dashboard')      { if (typeof initCoordDashboard === 'function') initCoordDashboard(); }
  if (page === 'importar-precos')      { if (typeof initPageImportarPrecos === 'function') initPageImportarPrecos(); }
}

// ─────────────────────────────────────────────
// ✏️  SOLICITAÇÕES DE AJUSTE (Usuário → Admin)
// ─────────────────────────────────────────────

const AJUSTE_TIPO_MAP = {
  desperdicio:      { label: '🗑️ Desperdício/Estragado', movType: 'saida',   movMotivo: 'desperdicio' },
  inventario_menos: { label: '📉 Inventário (menos)',     movType: 'saida',   movMotivo: 'ajuste_inventario' },
  inventario_mais:  { label: '📈 Inventário (mais)',      movType: 'entrada', movMotivo: 'ajuste_inventario' },
  corrigir_entrada: { label: '📥 Corrigir Entrada',       movType: 'entrada', movMotivo: 'correcao' },
  corrigir_saida:   { label: '📤 Corrigir Saída (estorno)', movType: 'entrada', movMotivo: 'correcao' },
  outro:            { label: '🔧 Outro',                  movType: null,      movMotivo: null },
};

let _ajusteItemCount = 0;

function openAjusteModal() {
  document.getElementById('ajuste-tipo').value = '';
  document.getElementById('ajuste-descricao').value = '';
  document.getElementById('ajuste-urgencia').value = 'normal';
  document.getElementById('ajuste-data').value = new Date().toISOString().slice(0,10);
  // Popula casas sempre ao abrir (CASAS pode não ter sido carregado quando populateHouseSelects rodou)
  const sel = document.getElementById('ajuste-casa');
  if (sel) {
    const casas = window.CASAS || [];
    sel.innerHTML = '<option value="">Selecione...</option>';
    casas.forEach(c => {
      const o = document.createElement('option');
      o.value = c; o.textContent = c;
      if (c === (currentUserData?.house || '')) o.selected = true;
      sel.appendChild(o);
    });
    // Se CASAS ainda vazio, tenta buscar do banco
    if (casas.length === 0) {
      db.collection('houses').orderBy('nome').get().then(snap => {
        snap.docs.forEach(d => {
          const nome = d.data().nome || d.id;
          const o = document.createElement('option');
          o.value = nome; o.textContent = nome;
          if (nome === (currentUserData?.house || '')) o.selected = true;
          sel.appendChild(o);
        });
      }).catch(() => {});
    }
  }
  // Reset itens
  _ajusteItemCount = 0;
  document.getElementById('ajuste-itens-lista').innerHTML = '';
  ajusteAdicionarItem();
  document.getElementById('ajuste-itens-section').style.display = 'block';
  hideAlert('ajuste-alert');
  openModal('modal-ajuste');
}

function ajusteTipoChange() {
  const tipo = document.getElementById('ajuste-tipo').value;
  const sec  = document.getElementById('ajuste-itens-section');
  sec.style.display = tipo === 'outro' ? 'none' : 'block';
}

function ajusteAdicionarItem() {
  const lista = document.getElementById('ajuste-itens-lista');
  const idx   = _ajusteItemCount++;
  // Monta opções de produto de CATEGORIAS (global)
  let optsHtml = '<option value="">Selecione o produto...</option>';
  if (window.CATEGORIAS) {
    Object.entries(CATEGORIAS).forEach(([catKey, cat]) => {
      optsHtml += `<optgroup label="${cat.nome}">`;
      cat.produtos.forEach(p => {
        optsHtml += `<option value="${catKey}|${p.id}|${p.unidade}|${p.nome}">${p.nome} (${p.unidade})</option>`;
      });
      optsHtml += '</optgroup>';
    });
  }
  const row = document.createElement('div');
  row.id = `ajuste-item-${idx}`;
  row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:8px;';
  row.innerHTML = `
    <select class="form-select" style="flex:1;" id="ajuste-prod-${idx}">${optsHtml}</select>
    <input type="number" class="form-input" style="width:90px;" id="ajuste-qty-${idx}"
      placeholder="Qtd" min="0.01" step="0.01">
    ${idx > 0 ? `<button class="btn btn-danger btn-sm" style="flex-shrink:0;" onclick="document.getElementById('ajuste-item-${idx}').remove()">✕</button>` : '<div style="width:32px;"></div>'}
  `;
  lista.appendChild(row);
}

async function enviarSolicitacaoAjuste() {
  const tipo      = document.getElementById('ajuste-tipo').value;
  const casa      = document.getElementById('ajuste-casa').value;
  const data      = document.getElementById('ajuste-data').value;
  const descricao = document.getElementById('ajuste-descricao').value.trim();
  const urgencia  = document.getElementById('ajuste-urgencia').value;

  if (!tipo)      { showAlertInline('ajuste-alert','Selecione o tipo de ajuste.','danger'); return; }
  if (!casa)      { showAlertInline('ajuste-alert','Selecione a casa.','danger'); return; }
  if (!data)      { showAlertInline('ajuste-alert','Informe a data de referência.','danger'); return; }
  if (!descricao) { showAlertInline('ajuste-alert','Descreva o motivo do ajuste.','danger'); return; }

  // Coleta itens (se aplicável)
  const itens = [];
  if (tipo !== 'outro') {
    const lista = document.getElementById('ajuste-itens-lista');
    const rows  = lista.querySelectorAll('[id^="ajuste-item-"]');
    for (const row of rows) {
      const idx  = row.id.replace('ajuste-item-','');
      const prod = document.getElementById(`ajuste-prod-${idx}`)?.value;
      const qty  = parseFloat(document.getElementById(`ajuste-qty-${idx}`)?.value);
      if (!prod) { showAlertInline('ajuste-alert','Selecione o produto em todos os itens.','danger'); return; }
      if (!qty || qty <= 0) { showAlertInline('ajuste-alert','Informe a quantidade (maior que zero) em todos os itens.','danger'); return; }
      const [catKey, prodId, unidade, prodNome] = prod.split('|');
      itens.push({ catKey, prodId, unidade, prodNome, qty });
    }
    if (itens.length === 0) { showAlertInline('ajuste-alert','Adicione pelo menos 1 produto.','danger'); return; }
  }

  setBtnLoading('btn-enviar-ajuste', true);
  try {
    await db.collection('ajustes').add({
      tipo, casa, data, descricao, urgencia, itens,
      status: 'pendente',
      solicitanteUid:   currentUser?.uid || '',
      solicitanteNome:  currentUserData?.name || '',
      solicitanteEmail: currentUser?.email || '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    closeModal('modal-ajuste');
    showToast('✅ Solicitação enviada! Aguardando autorização do coordenador/gerente.');
  } catch(e) {
    console.error(e);
    showAlertInline('ajuste-alert','Erro ao enviar. Tente novamente.','danger');
  }
  setBtnLoading('btn-enviar-ajuste', false);
}

function showAlertInline(id, msg, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = `alert alert-${type} visible`;
}

async function openAjustesAdmin() {
  openModal('modal-ajustes-admin');
  const body = document.getElementById('modal-ajustes-admin-body');
  body.innerHTML = '<div class="loading-state"><div class="spinner spinner-dark"></div>Carregando...</div>';

  // Carrega ajustes e inventários em paralelo
  let snapAjustes, snapInv;
  try {
    [snapAjustes, snapInv] = await Promise.all([
      db.collection('ajustes').orderBy('createdAt','desc').get(),
      db.collection('inventarios').orderBy('createdAt','desc').get(),
    ]);
  } catch(e) {
    body.innerHTML = `<div class="alert alert-danger visible" style="margin:0;">
      Sem permissão para acessar os registros.<br>
      <small style="opacity:0.7;">Erro: ${e.message}</small>
    </div>`;
    return;
  }

  const urgColors = { critico:'var(--danger)', urgente:'var(--warn)', normal:'var(--ok)' };
  const statusMap = { pendente:'🟡 Pendente', autorizado:'✅ Autorizado', recusado:'❌ Recusado' };

  // ── Seção de Inventários ─────────────────────────────────────────────
  const invHtml = snapInv.empty ? '' : `
    <div style="font-size:11px;font-weight:800;color:var(--lumen,#7c3aed);text-transform:uppercase;
                letter-spacing:.8px;margin:0 0 10px;padding-bottom:6px;border-bottom:2px solid var(--border);">
      📋 Contagens de Inventário
    </div>
    ${snapInv.docs.map(d => {
      const inv = d.data();
      const statusAtual = inv.status || 'pendente';
      let dateStr = '—';
      try { dateStr = inv.createdAt?.toDate().toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}); } catch(e){}
      const dataContagem = inv.data ? new Date(inv.data+'T00:00:00').toLocaleDateString('pt-BR') : '—';
      const corAcuracia = inv.acuracia >= 98 ? 'var(--ok)' : inv.acuracia >= 95 ? 'var(--warn)' : 'var(--danger)';
      const divergentes = (inv.itens || []).filter(i => Math.abs(i.diferenca) >= 0.01);

      const divergHtml = divergentes.length > 0 ? `
        <div style="margin-top:8px;">
          <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px;">
            Divergências (${divergentes.length} ${divergentes.length === 1 ? 'item' : 'itens'})
          </div>
          ${divergentes.map(it => `
            <div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px solid var(--border);">
              <span>${it.prodNome}</span>
              <span>
                Sistema: <strong>${it.qtySistema.toFixed(2).replace('.',',')} ${it.unidade}</strong>
                → Físico: <strong>${it.qtyFisico.toFixed(2).replace('.',',')} ${it.unidade}</strong>
                <span style="color:${it.diferenca > 0 ? 'var(--ok)' : 'var(--danger)'};">
                  (${it.diferenca > 0 ? '+' : ''}${it.diferenca.toFixed(2).replace('.',',')} ${it.unidade})
                </span>
              </span>
            </div>`).join('')}
        </div>` : `<div style="font-size:12px;color:var(--ok);margin-top:6px;">✓ Nenhuma divergência encontrada</div>`;

      const resolvidoInfo = statusAtual !== 'pendente'
        ? `<div style="font-size:11px;color:var(--text-muted);margin-top:6px;">
             ${statusAtual === 'autorizado' ? '✅' : '❌'} Por: <strong>${inv.resolvidoPor || '—'}</strong>
             ${inv.codigosMovimento?.length ? `· Movs: <strong>${inv.codigosMovimento.join(', ')}</strong>` : ''}
           </div>` : '';

      return `<div style="border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:8px;">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:13px;">
              📋 Inventário — <span style="color:var(--text-muted);">${inv.casa || '—'}</span>
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
              Enviado: ${dateStr} · Contagem: ${dataContagem} · Por: ${inv.responsavel || inv.solicitanteNome}
            </div>
            <div style="font-size:11px;margin-top:2px;">
              ${inv.totalItens} itens contados ·
              <span style="color:var(--ok);">${inv.itensOk} corretos</span> ·
              <span style="color:var(--danger);">${divergentes.length} divergentes</span>
            </div>
            ${divergentes.length > 0 ? `<div style="font-size:11px;color:var(--lumen,#7c3aed);margin-top:2px;">→ vai gerar <strong>${divergentes.filter(i=>i.diferenca<0).length} Saída(s)</strong> e <strong>${divergentes.filter(i=>i.diferenca>0).length} Entrada(s)</strong></div>` : ''}
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0;">
            <div style="font-size:22px;font-weight:900;color:${corAcuracia};">${inv.acuracia?.toFixed(1).replace('.',',')}%</div>
            ${statusAtual === 'pendente' ? `
              <div style="display:flex;gap:6px;">
                <button class="btn btn-primary btn-sm" onclick="autorizarInventario('${d.id}')">✓ Autorizar</button>
                <button class="btn btn-danger btn-sm" onclick="recusarInventario('${d.id}')">✕ Recusar</button>
              </div>` : `<span class="badge ${statusAtual==='autorizado'?'badge-ok':'badge-danger'}">${statusMap[statusAtual]||statusAtual}</span>`}
          </div>
        </div>
        ${divergHtml}
        ${resolvidoInfo}
      </div>`;
    }).join('')}
  `;

  // ── Seção de Ajustes ─────────────────────────────────────────────────
  const ajustesHtml = snapAjustes.empty ? '' : `
    <div style="font-size:11px;font-weight:800;color:var(--text-muted);text-transform:uppercase;
                letter-spacing:.8px;margin:${snapInv.empty?'0':'20px 0'} 0 10px;padding-bottom:6px;border-bottom:2px solid var(--border);">
      ✏️ Solicitações de Ajuste
    </div>
    ${snapAjustes.docs.map(d => {
      const a = d.data();
      let dateStr = '—';
      try { dateStr = a.createdAt?.toDate().toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}); } catch(e){}
      const cor = urgColors[a.urgencia] || 'var(--text)';
      const statusAtual = a.status || 'pendente';
      const tipoInfo = AJUSTE_TIPO_MAP[a.tipo] || { label: a.tipo };
      const movDir = tipoInfo.movType === 'entrada' ? '→ vai gerar <strong>Entrada</strong>' :
                     tipoInfo.movType === 'saida'   ? '→ vai gerar <strong>Saída</strong>' : '→ execução manual';
      const itensHtml = (a.itens && a.itens.length > 0)
        ? `<div style="margin-top:8px;">
            <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px;">Produtos</div>
            ${a.itens.map(it => `
              <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;border-bottom:1px solid var(--border);">
                <span>${it.prodNome}</span>
                <span style="font-weight:700;">${it.qty} ${it.unidade}</span>
              </div>`).join('')}
          </div>` : '';
      const resolvidoInfo = statusAtual !== 'pendente'
        ? `<div style="font-size:11px;color:var(--text-muted);margin-top:6px;">
             ${statusAtual === 'autorizado' ? '✅' : '❌'} Por: <strong>${a.resolvidoPor || '—'}</strong>
             ${a.codigoMovimento ? `· Mov: <strong>${a.codigoMovimento}</strong>` : ''}
           </div>` : '';
      return `<div style="border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:8px;">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:13px;">${a.solicitanteNome} — <span style="color:var(--text-muted);">${a.casa || '—'}</span></div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
              ${dateStr} · ${tipoInfo.label} · <span style="color:${cor};font-weight:700;">${(a.urgencia||'').toUpperCase()}</span>
            </div>
            <div style="font-size:11px;color:var(--lumen,#7c3aed);margin-top:2px;">${movDir}</div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0;">
            ${statusAtual === 'pendente' ? `
              <button class="btn btn-primary btn-sm" onclick="autorizarAjuste('${d.id}')">✓ Autorizar</button>
              <button class="btn btn-danger btn-sm" onclick="resolverAjuste('${d.id}','recusado')">✕ Recusar</button>
            ` : `<span class="badge ${statusAtual==='autorizado'?'badge-ok':'badge-danger'}">${statusMap[statusAtual]||statusAtual}</span>`}
          </div>
        </div>
        <div style="font-size:13px;color:var(--text);background:var(--bg);padding:10px;border-radius:6px;">${a.descricao}</div>
        ${itensHtml}
        ${resolvidoInfo}
      </div>`;
    }).join('')}
  `;

  const tudo = invHtml + ajustesHtml;
  body.innerHTML = tudo.trim()
    ? tudo
    : '<div class="empty-state"><div class="empty-state-icon">✅</div><div class="empty-state-title">Nenhum registro pendente</div></div>';
}

// ── Autorizar / Recusar Inventário ───────────────────────────────────────
async function autorizarInventario(id) {
  const snap = await db.collection('inventarios').doc(id).get();
  if (!snap.exists) { showToast('Inventário não encontrado.'); return; }
  const inv = snap.data();
  if (inv.status !== 'pendente') { showToast('Este inventário já foi processado.'); return; }

  const divergentes = (inv.itens || []).filter(i => Math.abs(i.diferenca) >= 0.01);
  const codigosMovimento = [];

  // Para cada item divergente, gera uma movimentação individual
  for (const it of divergentes) {
    const movType  = it.diferenca > 0 ? 'entrada' : 'saida';
    const typeCode = movType === 'entrada' ? 'ENT' : 'SAI';
    const dateStr  = (inv.data || new Date().toISOString().slice(0,10)).replace(/-/g,'');

    try {
      const todaySnap = await db.collection('movements').where('dateStr','==',dateStr).get();
      const seq = String(todaySnap.size + codigosMovimento.length + 1).padStart(3,'0');
      const prefixMov = typeof siglaCasa === 'function' ? siglaCasa(inv.casa) : inv.casa.slice(0,3).toUpperCase();
      const code = `OB-${prefixMov}-${typeCode}-INV-${dateStr}-${seq}`;

      await db.collection('movements').add({
        code,
        house: inv.casa,
        type: movType,
        date: inv.data,
        dateStr,
        obs: `[Inventário Autorizado] ${it.prodNome}: sistema ${it.qtySistema.toFixed(2)} → físico ${it.qtyFisico.toFixed(2)} ${it.unidade} (Resp.: ${inv.responsavel || inv.solicitanteNome})`,
        isDonation: false,
        isAjuste: true,
        isInventario: true,
        inventarioId: id,
        items: [{ catKey: it.catKey, prodId: it.prodId, prodNome: it.prodNome, unidade: it.unidade, qty: Math.abs(it.diferenca) }],
        photoBase64: null,
        leituraIA: false,
        registeredBy: currentUserData?.name || '',
        registeredUid: currentUser?.uid || '',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      codigosMovimento.push(code);
    } catch(e) {
      showToast('Erro ao gerar movimentação para ' + it.prodNome + ': ' + e.message);
      console.error(e);
      return;
    }
  }

  // Atualiza o inventário como autorizado
  try {
    await db.collection('inventarios').doc(id).update({
      status: 'autorizado',
      resolvidoAt: firebase.firestore.FieldValue.serverTimestamp(),
      resolvidoPor: currentUserData?.name || '',
      codigosMovimento,
    });
    const msg = codigosMovimento.length > 0
      ? `✅ Inventário autorizado! ${codigosMovimento.length} movimentação(ões) gerada(s).`
      : '✅ Inventário autorizado! Nenhuma divergência para corrigir.';
    showToast(msg);
    openAjustesAdmin();
    loadAjustesBadge();
  } catch(e) {
    showToast('Erro ao autorizar inventário: ' + e.message);
  }
}

async function recusarInventario(id) {
  try {
    await db.collection('inventarios').doc(id).update({
      status: 'recusado',
      resolvidoAt: firebase.firestore.FieldValue.serverTimestamp(),
      resolvidoPor: currentUserData?.name || '',
    });
    showToast('❌ Inventário recusado. Nenhuma alteração no estoque.');
    openAjustesAdmin();
    loadAjustesBadge();
  } catch(e) {
    showToast('Erro ao recusar inventário: ' + e.message);
  }
}

async function autorizarAjuste(id) {
  const snap = await db.collection('ajustes').doc(id).get();
  if (!snap.exists) { showToast('Solicitação não encontrada.'); return; }
  const a = snap.data();
  if (a.status !== 'pendente') { showToast('Esta solicitação já foi processada.'); return; }

  const tipoInfo = AJUSTE_TIPO_MAP[a.tipo];

  // Se tem movimentação automática a criar
  let codigoMovimento = null;
  if (tipoInfo?.movType && a.itens?.length > 0 && a.casa && a.data) {
    try {
      const dateStr = (a.data || '').replace(/-/g,'');
      const todaySnap = await db.collection('movements').where('dateStr','==',dateStr).get();
      const seq = String(todaySnap.size + 1).padStart(3,'0');
      const typeCode = tipoInfo.movType === 'entrada' ? 'ENT' : 'SAI';
      const motivoCode = tipoInfo.movMotivo === 'desperdicio' ? '-DESP' :
                         tipoInfo.movMotivo === 'ajuste_inventario' ? '-INV' :
                         tipoInfo.movMotivo === 'correcao' ? '-COR' : '';
      const prefixMov = typeof siglaCasa === 'function' ? siglaCasa(a.casa) : a.casa.slice(0,3).toUpperCase();
      codigoMovimento = `OB-${prefixMov}-${typeCode}${motivoCode}-${dateStr}-${seq}`;

      const movData = {
        code: codigoMovimento,
        house: a.casa,
        type: tipoInfo.movType,
        date: a.data,
        dateStr,
        obs: `[Ajuste Autorizado] ${tipoInfo.label} — ${a.descricao} (Sol. por: ${a.solicitanteNome})`,
        isDonation: false,
        isAjuste: true,
        ajusteId: id,
        ajusteTipo: a.tipo,
        items: a.itens.map(it => ({
          catKey: it.catKey,
          prodId: it.prodId,
          prodNome: it.prodNome,
          unidade: it.unidade,
          qty: it.qty,
        })),
        photoBase64: null,
        leituraIA: false,
        registeredBy: currentUserData?.name || '',
        registeredUid: currentUser?.uid || '',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      };

      await db.collection('movements').add(movData);
    } catch(e) {
      showToast('Erro ao criar movimentação: ' + e.message);
      console.error(e);
      return;
    }
  }

  // Atualiza o ticket
  try {
    await db.collection('ajustes').doc(id).update({
      status: 'autorizado',
      resolvidoAt: firebase.firestore.FieldValue.serverTimestamp(),
      resolvidoPor: currentUserData?.name || '',
      codigoMovimento,
    });
    const msg = codigoMovimento
      ? `✅ Autorizado! Movimentação gerada: ${codigoMovimento}`
      : '✅ Autorizado! (execução manual necessária para tipo "Outro")';
    showToast(msg);
    openAjustesAdmin();
    loadAjustesBadge();
  } catch(e) {
    showToast('Erro ao autorizar: ' + e.message);
  }
}

async function resolverAjuste(id, status) {
  try {
    await db.collection('ajustes').doc(id).update({
      status,
      resolvidoAt: firebase.firestore.FieldValue.serverTimestamp(),
      resolvidoPor: currentUserData?.name || '',
    });
    showToast(status === 'autorizado' ? '✅ Autorizado!' : '❌ Solicitação recusada.');
    openAjustesAdmin();
    loadAjustesBadge();
  } catch(e) {
    showToast('Erro ao atualizar: ' + e.message);
  }
}

async function loadAjustesBadge() {
  try {
    const [snapAjustes, snapInv] = await Promise.all([
      db.collection('ajustes').where('status','==','pendente').get(),
      db.collection('inventarios').where('status','==','pendente').get(),
    ]);
    const total = snapAjustes.size + snapInv.size;
    const badge = document.getElementById('badge-ajustes');
    if (!badge) return;
    if (total > 0) { badge.textContent = total; badge.classList.remove('hidden'); }
    else { badge.classList.add('hidden'); }
  } catch(e) {}
}
// ─────────────────────────────────────────────
// 🗂️  DASHBOARD — PAINÉIS RECOLHÍVEIS
// ─────────────────────────────────────────────
const DASH_PANELS = ['panel-alertas','panel-estoque','panel-variedades','panel-fluxo','panel-avisos'];

function toggleDashPanel(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const collapsed = el.classList.toggle('collapsed');
  try { localStorage.setItem('dash_panel_' + id, collapsed ? '1' : '0'); } catch(e) {}
}

function recolherTodosPaineis() {
  DASH_PANELS.forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.classList.add('collapsed'); try { localStorage.setItem('dash_panel_' + id, '1'); } catch(e) {} }
  });
}

function expandirTodosPaineis() {
  DASH_PANELS.forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.classList.remove('collapsed'); try { localStorage.setItem('dash_panel_' + id, '0'); } catch(e) {} }
  });
}

function restaurarEstadoPaineis() {
  DASH_PANELS.forEach(id => {
    try {
      const val = localStorage.getItem('dash_panel_' + id);
      if (val === '1') { document.getElementById(id)?.classList.add('collapsed'); }
    } catch(e) {}
  });
}

async function loadDashboard() {
  try {
    const [usersSnap, ordersSnap, housesSnap, suppliersSnap, varSolSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('orders').orderBy('createdAt','desc').get(),
      db.collection('houses').get(),
      db.collection('suppliers').get(),
      db.collection('var_solicitacoes').orderBy('criadoEm','desc').get()
    ]);

    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear  = now.getFullYear();

    const pending     = usersSnap.docs.filter(d => d.data().status === 'pending').length;
    const monthOrders = ordersSnap.docs.filter(d => {
      const ts = d.data().createdAt?.toDate();
      return ts && ts.getMonth() === thisMonth && ts.getFullYear() === thisYear;
    }).length;
    const openOrders      = ordersSnap.docs.filter(d => ['aberto','aguardando_estoque'].includes(d.data().status || 'aguardando_estoque')).length;
    const awaitingNF      = ordersSnap.docs.filter(d => d.data().status === 'aguardando_nf').length;
    const pendingPay      = ordersSnap.docs.filter(d => d.data().status === 'pendente_pag').length;

    let totalPeople = 0;
    housesSnap.docs.forEach(d => { totalPeople += (d.data().currentPeople || 0); });

    // Update stats
    document.getElementById('s-houses').textContent      = CASAS.length;
    document.getElementById('s-people').textContent      = totalPeople;
    document.getElementById('s-orders').textContent      = monthOrders;

    // New stat: in-purchase orders
    const inPurchase = ordersSnap.docs.filter(d => d.data().status === 'andamento').length;
    const doneTodayOrders = ordersSnap.docs.filter(d => {
      const ts = d.data().updatedAt?.toDate() || d.data().createdAt?.toDate();
      return ts && d.data().status === 'concluido' &&
        ts.toDateString() === new Date().toDateString();
    }).length;
    if (document.getElementById('s-in-purchase')) document.getElementById('s-in-purchase').textContent = inPurchase;
    if (document.getElementById('s-done-today')) document.getElementById('s-done-today').textContent = doneTodayOrders;

    // ── SOLICITAÇÕES DE VARIEDADES — KPIs ────────────
    const varSols = varSolSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const varTotal    = varSols.length;
    const varPendente = varSols.filter(d => d.status === 'pendente').length;
    const varUrgente  = varSols.filter(d => d.prioridade === 'urgente' && !['concluido','cancelado'].includes(d.status)).length;
    const varEmAnalise= varSols.filter(d => d.status === 'em_proposta').length;
    const varAprovada = varSols.filter(d => d.status === 'pedido_liberado').length;
    const varComprada = varSols.filter(d => ['compra_realizada','comprada'].includes(d.status)).length;
    const varEntregue = varSols.filter(d => ['concluido','entregue'].includes(d.status)).length;
    if (document.getElementById('s-var-total')) document.getElementById('s-var-total').textContent = varTotal;
    if (document.getElementById('s-var-pendentes')) document.getElementById('s-var-pendentes').textContent = `${varPendente} pendente${varPendente !== 1 ? 's' : ''}`;
    if (document.getElementById('s-var-urgente')) document.getElementById('s-var-urgente').textContent = varUrgente;

    // ── PAINEL DE VARIEDADES ──────────────────────────
    const varEl = document.getElementById('dashboard-var-sol');
    if (varEl) {
      if (varTotal === 0) {
        varEl.innerHTML = `<div class="alert-item info"><div class="alert-item-icon">✅</div><div class="alert-item-body"><div class="alert-item-title">Nenhuma solicitação de variedades</div><div class="alert-item-sub">Nenhuma solicitação registrada no momento.</div></div></div>`;
      } else {
        const statusBar = [
          { label:'Análise Estoque',  count: varPendente,  color:'var(--warn)',   bg:'var(--warn-bg)' },
          { label:'Est. Avaliado',    count: varEmAnalise, color:'#0891B2',       bg:'rgba(8,145,178,0.10)' },
          { label:'Em Proposta',     count: varEmAnalise, color:'#0891B2',       bg:'rgba(8,145,178,0.10)'   },
          { label:'Compra Realizada', count: varComprada,  color:'var(--lumen)',  bg:'var(--lumen-lt)' },
          { label:'Concluído',        count: varEntregue,  color:'#5F7D80',       bg:'var(--bg)' },
        ];
        const kpiHtml = `
          <div style="display:flex;gap:0;border-bottom:1px solid var(--border);overflow-x:auto;">
            ${statusBar.map(s => `
              <div style="flex:1;min-width:90px;text-align:center;padding:12px 8px;border-right:1px solid var(--border);">
                <div style="font-size:22px;font-weight:800;color:${s.color};">${s.count}</div>
                <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;margin-top:2px;">${s.label}</div>
              </div>`).join('')}
          </div>`;

        const priorLabel = { normal:'🟢', alta:'🟠', urgente:'🔴' };
        const statusLabel = { pendente:'Pendente', em_proposta:'Em Proposta', pedido_liberado:'Pedido Liberado', compra_realizada:'Compra Realizada', concluido:'Concluído', cancelado:'Cancelado' };
        const statusBadgeColor = { pendente:'var(--warn)', em_proposta:'#0891B2', pedido_liberado:'var(--ok)', compra_realizada:'var(--lumen)', concluido:'#888', cancelado:'var(--danger)' };

        // Mostra as mais recentes/urgentes primeiro
        const sorted = [...varSols].sort((a, b) => {
          const priorOrder = { urgente:0, alta:1, normal:2 };
          const statusOrder = { pendente:0, em_proposta:1, pedido_liberado:2, compra_realizada:3, concluido:4, cancelado:5 };
          if ((statusOrder[a.status]||0) !== (statusOrder[b.status]||0)) return (statusOrder[a.status]||0) - (statusOrder[b.status]||0);
          return (priorOrder[a.prioridade]||2) - (priorOrder[b.prioridade]||2);
        });

        const listHtml = sorted.slice(0, 8).map(d => {
          const dt = d.dataLimite ? new Date(d.dataLimite + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
          const qtd = d.quantidade ? `<span style="font-size:11px;font-weight:700;color:var(--lumen);background:var(--lumen-lt);padding:1px 7px;border-radius:5px;margin-left:6px;">${d.quantidade} ${d.unidade||'un'}</span>` : '';
          return `
            <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--border);flex-wrap:wrap;">
              <div style="font-size:15px;flex-shrink:0;">${priorLabel[d.prioridade]||'🟢'}</div>
              <div style="flex:1;min-width:140px;">
                <div style="font-size:13px;font-weight:600;color:var(--text);">${d.material||'—'}${qtd}</div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
                  🏢 ${d.setor||'—'} &nbsp;·&nbsp; 📅 ${dt} &nbsp;·&nbsp; 👤 ${d.solicitanteNome||'—'}
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
                <span style="font-size:11px;font-weight:700;color:${statusBadgeColor[d.status]||'var(--text-muted)'};background:rgba(0,0,0,0.04);padding:3px 9px;border-radius:20px;border:1px solid ${statusBadgeColor[d.status]||'var(--border)'};">
                  ${statusLabel[d.status]||d.status}
                </span>
                <button class="btn btn-outline btn-sm" style="font-size:11px;padding:3px 8px;" onclick="goPage('var-solicitacoes')">Ver</button>
              </div>
            </div>`;
        }).join('');

        const rodape = varTotal > 8 ? `<div style="padding:10px 16px;font-size:12px;color:var(--text-muted);text-align:center;"><a style="color:var(--lumen);cursor:pointer;font-weight:600;" onclick="goPage('var-solicitacoes')">Ver todas as ${varTotal} solicitações →</a></div>` : '';

        varEl.innerHTML = kpiHtml + listHtml + rodape;

        // Adiciona alerta se há urgentes pendentes
        if (varUrgente > 0) {
          const alertsEl2 = document.getElementById('dashboard-alerts');
          if (alertsEl2) {
            const urgDiv = document.createElement('div');
            urgDiv.className = 'alert-item critical';
            urgDiv.innerHTML = `
              <div class="alert-item-icon">🔴</div>
              <div class="alert-item-body">
                <div class="alert-item-title">${varUrgente} solicitação(ões) de variedades com prioridade URGENTE</div>
                <div class="alert-item-sub">Precisam de atenção imediata para compra</div>
              </div>
              <div class="alert-item-action"><button class="btn btn-secondary btn-sm" onclick="goPage('var-solicitacoes')">Ver solicitações</button></div>`;
            alertsEl2.prepend(urgDiv);
          }
        }
      }
    }

    // ── LOW-STOCK HOUSES SECTION ──────────────────────
    const lowStockEl = document.getElementById('dashboard-low-stock');
    if (lowStockEl) {
      // Try to detect low-stock houses from orders marked as critical
      const lowStockHouses = [];
      ordersSnap.docs.forEach(d => {
        const o = d.data();
        if ((o.status === 'aberto' || o.status === 'andamento') && o.house && !lowStockHouses.includes(o.house)) {
          lowStockHouses.push(o.house);
        }
      });
      if (document.getElementById('s-low-stock')) document.getElementById('s-low-stock').textContent = lowStockHouses.length;
      if (lowStockHouses.length === 0) {
        lowStockEl.innerHTML = `<div class="alert-item info"><div class="alert-item-icon">✅</div><div class="alert-item-body"><div class="alert-item-title">Nenhuma casa com estoque crítico</div><div class="alert-item-sub">Todas as casas estão com estoque adequado.</div></div></div>`;
      } else {
        lowStockEl.innerHTML = lowStockHouses.map(h => `
          <div class="alert-item warning" style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border);">
            <div class="alert-item-icon">🏠</div>
            <div class="alert-item-body" style="flex:1;">
              <div class="alert-item-title">${h}</div>
              <div class="alert-item-sub">Pedido pendente de compra</div>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="goPage('all-orders')">Ver pedido</button>
          </div>`).join('');
      }
    }

    // ── PURCHASE FLOW SECTION (redesign) ─────────────
    const flowEl = document.getElementById('dashboard-purchase-flow');
    if (flowEl) {
      const flowStages = [
        { key: ['aguardando_estoque','aberto'], label: 'Análise de Estoque', icon: '🏪', color: '#8B5CF6', bg: 'rgba(139,92,246,0.10)' },
        { key: ['estoque_avaliado'],            label: 'Estoque Avaliado',   icon: '✅', color: '#0891B2', bg: 'rgba(8,145,178,0.10)'   },
        { key: ['andamento'],                   label: 'Análise Orçamento',  icon: '📊', color: '#F59E0B', bg: 'rgba(245,158,11,0.10)'  },
        { key: ['pedido_liberado'],             label: 'Pedido Liberado',    icon: '🟩', color: '#059669', bg: 'rgba(5,150,105,0.10)'   },
        { key: ['compra_realizada'],            label: 'Compra Realizada',   icon: '🛍️', color: '#1560BD', bg: 'rgba(21,96,189,0.10)'   },
        { key: ['concluido'],                   label: 'Concluído',          icon: '🎯', color: '#16A34A', bg: 'rgba(22,163,74,0.10)'   },
      ];

      // Agrega por stage
      const stageData = flowStages.map(s => {
        const docs = ordersSnap.docs.filter(d => s.key.includes(d.data().status || 'aguardando_estoque'));
        const cnt  = docs.length;
        // Pega os 3 mais recentes para preview
        const recent = docs.slice(0, 3).map(d => d.data());
        // Calcula valor total de NFs nesse stage
        const valorNF = docs.reduce((sum, d) => sum + (parseFloat(d.data().nfValor) || 0), 0);
        return { ...s, cnt, recent, valorNF };
      });

      const totalAtivos = stageData.reduce((s, d) => s + d.cnt, 0) || 1;
      const totalComNF  = ordersSnap.docs.filter(d => d.data().nfNumero).length;
      const totalNFVal  = ordersSnap.docs.reduce((s, d) => s + (parseFloat(d.data().nfValor) || 0), 0);

      // ── KPI bar no topo do fluxo ──
      const kpiBar = `
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:14px 16px;border-bottom:1px solid var(--border);">
          <div style="text-align:center;">
            <div style="font-size:22px;font-weight:800;color:var(--lumen);">${totalAtivos}</div>
            <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;">Total Ativos</div>
          </div>
          <div style="text-align:center;">
            <div style="font-size:22px;font-weight:800;color:#F59E0B;">${stageData.find(s=>s.key.includes('andamento'))?.cnt || 0}</div>
            <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;">Em Análise</div>
          </div>
          <div style="text-align:center;">
            <div style="font-size:22px;font-weight:800;color:#059669;">${totalComNF}</div>
            <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;">Com NF</div>
          </div>
          <div style="text-align:center;">
            <div style="font-size:16px;font-weight:800;color:var(--ok);">${totalNFVal > 0 ? 'R$ '+totalNFVal.toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:0}) : '—'}</div>
            <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;">Valor NFs</div>
          </div>
        </div>`;

      // ── Estágios em grade ──
      const stagesGrid = `
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0;padding:0;">
          ${stageData.map((s, i) => {
            const pct = Math.round((s.cnt / totalAtivos) * 100);
            const recentHtml = s.recent.length > 0
              ? s.recent.map(o => `
                  <div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
                    <span style="font-size:10px;font-weight:700;color:var(--lumen);font-family:monospace;flex-shrink:0;">${(o.code||'—').slice(-8)}</span>
                    <span style="font-size:10px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${o.house||'—'}</span>
                    ${o.nfNumero ? `<span style="font-size:9px;color:var(--ok);font-weight:700;flex-shrink:0;">📎</span>` : ''}
                  </div>`).join('')
              : `<div style="font-size:11px;color:var(--text-muted);text-align:center;padding:8px 0;">Nenhum pedido</div>`;

            const borderRight = (i+1) % 3 !== 0 ? 'border-right:1px solid var(--border);' : '';
            const borderBottom = i < 3 ? 'border-bottom:1px solid var(--border);' : '';

            return `
              <div style="padding:14px;${borderRight}${borderBottom}">
                <!-- Header do estágio -->
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                  <div style="display:flex;align-items:center;gap:7px;">
                    <div style="width:28px;height:28px;border-radius:8px;background:${s.bg};display:flex;align-items:center;justify-content:center;font-size:14px;">${s.icon}</div>
                    <div>
                      <div style="font-size:11px;font-weight:700;color:var(--text);line-height:1.2;">${s.label}</div>
                      <div style="font-size:10px;color:var(--text-muted);">${pct}% do total</div>
                    </div>
                  </div>
                  <div style="font-size:24px;font-weight:800;color:${s.color};">${s.cnt}</div>
                </div>
                <!-- Barra de progresso -->
                <div style="background:var(--bg);border-radius:4px;height:4px;margin-bottom:10px;overflow:hidden;">
                  <div style="height:100%;border-radius:4px;background:${s.color};width:${Math.max(pct,2)}%;transition:width .6s ease;"></div>
                </div>
                <!-- Pedidos recentes -->
                <div style="font-size:9px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Mais recentes</div>
                ${recentHtml}
                ${s.valorNF > 0 ? `<div style="margin-top:8px;font-size:10px;font-weight:700;color:var(--ok);">R$ ${s.valorNF.toLocaleString('pt-BR',{minimumFractionDigits:2})} em NFs</div>` : ''}
              </div>`;
          }).join('')}
        </div>`;

      flowEl.innerHTML = kpiBar + stagesGrid;
    }

    // ── BUILD ALERTS ──────────────────────────────────
    const alertsEl  = document.getElementById('dashboard-alerts');
    const noticesEl = document.getElementById('dashboard-notices');
    const criticals = [];
    const warnings  = [];
    const notices   = [];

    // 1. Pending users
    if (pending > 0) {
      criticals.push({
        icon: '👤',
        title: `${pending} usuário(s) aguardando aprovação`,
        sub: 'Acesse Usuários para aprovar ou recusar',
        action: `<button class="btn btn-secondary btn-sm" onclick="goPage('users');closeModal&&closeModal()">Ver usuários</button>`
      });
    }

    // 2. Supplier limit alerts (>= 50%)
    suppliersSnap.docs.forEach(d => {
      const s = d.data();
      const limite    = parseFloat(s.limite)    || 0;
      const utilizado = parseFloat(s.utilizado) || 0;
      if (limite <= 0) return;
      const pct = (utilizado / limite) * 100;
      if (pct >= 90) {
        criticals.push({
          icon: '🔴',
          title: `Fornecedor "${s.nome}": limite crítico — ${pct.toFixed(0)}% utilizado`,
          sub: `Utilizado: R$ ${utilizado.toFixed(2)} de R$ ${limite.toFixed(2)} | Disponível: R$ ${Math.max(0, limite - utilizado).toFixed(2)}`,
          action: `<button class="btn btn-secondary btn-sm" onclick="goPage('fornecedores')">Ver fornecedor</button>`
        });
      } else if (pct >= 50) {
        warnings.push({
          icon: '⚠️',
          title: `Fornecedor "${s.nome}": ${pct.toFixed(0)}% do limite utilizado`,
          sub: `Utilizado: R$ ${utilizado.toFixed(2)} de R$ ${limite.toFixed(2)} | Disponível: R$ ${Math.max(0, limite - utilizado).toFixed(2)}`,
          action: `<button class="btn btn-secondary btn-sm" onclick="goPage('fornecedores')">Ver fornecedor</button>`
        });
      }
    });

    // 3. Pedidos liberados aguardando NF (pedido_liberado sem nfNumero)
    const liberadosSemNF = ordersSnap.docs.filter(d => d.data().status === 'pedido_liberado' && !d.data().nfNumero).length;
    if (liberadosSemNF > 0) {
      warnings.push({
        icon: '📎',
        title: `${liberadosSemNF} pedido(s) liberado(s) aguardando NF`,
        sub: 'Pedidos aprovados que ainda não tiveram a nota fiscal lançada',
        action: `<button class="btn btn-secondary btn-sm" onclick="goPage('all-orders')">Ver pedidos</button>`
      });
    }

    // 4. Boletos vencendo nos próximos 3 dias
    const today   = new Date(); today.setHours(0,0,0,0);
    const in3days = new Date(today); in3days.setDate(in3days.getDate() + 3);
    ordersSnap.docs.forEach(d => {
      const o = d.data();
      if (!o.boletoVencimento) return;
      const venc = new Date(o.boletoVencimento + 'T00:00:00');
      if (venc <= in3days) {
        const vencida = venc < today;
        const arr = vencida ? criticals : warnings;
        arr.push({
          icon: vencida ? '🚨' : '📅',
          title: `${vencida ? 'Boleto VENCIDO' : 'Boleto vencendo em breve'} — Pedido ${o.code}`,
          sub: `Casa: ${o.house} | Vencimento: ${new Date(o.boletoVencimento + 'T00:00:00').toLocaleDateString('pt-BR')}${o.fornecedorNome ? ' | Fornecedor: ' + o.fornecedorNome : ''}`,
          action: ''
        });
      }
    });

    // 5. Open orders info
    if (openOrders > 0) {
      notices.push({
        icon: '🔵',
        title: `${openOrders} solicitação(ões) em aberto`,
        sub: 'Aguardando início do processo de cotação e compra',
        action: `<button class="btn btn-secondary btn-sm" onclick="goPage('all-orders')">Ver todos</button>`
      });
    }

    // 6. Houses with no people registered
    const housesWithPeople = {};
    housesSnap.docs.forEach(d => { housesWithPeople[d.data().name] = d.data().currentPeople || 0; });
    const semPessoas = CASAS.filter(c => !housesWithPeople[c] || housesWithPeople[c] === 0);
    if (semPessoas.length > 0) {
      notices.push({
        icon: '🏠',
        title: `${semPessoas.length} casa(s) sem pessoas cadastradas`,
        sub: semPessoas.slice(0,4).join(', ') + (semPessoas.length > 4 ? ` e mais ${semPessoas.length - 4}` : ''),
        action: `<button class="btn btn-secondary btn-sm" onclick="goPage('houses')">Cadastrar</button>`
      });
    }

    // Render alerts
    // 🤖 Detecta padrão crítico recorrente e injeta no dashboard
    detectarPadraoCritico().then(resultado => {
      if (!resultado || !resultado.padroes?.length) return;
      const alertsEl2 = document.getElementById('dashboard-alerts');
      if (!alertsEl2) return;
      const aiDiv = document.createElement('div');
      aiDiv.className = 'alert-item warning';
      aiDiv.style.cssText = 'border-left:4px solid var(--lumen);';
      aiDiv.innerHTML = `
        <div class="alert-item-icon">🤖</div>
        <div class="alert-item-body">
          <div class="alert-item-title" style="color:var(--lumen);">IA detectou padrão crítico recorrente — ${resultado.padroes.length} produto(s)</div>
          <div class="alert-item-sub" style="white-space:pre-line;">${resultado.aiText || resultado.padroes.slice(0,3).map(p=>`${p.house}: ${p.nome} (${p.semanasProblema} semanas)`).join(' | ')}</div>
          <button class="btn btn-secondary btn-sm" style="margin-top:6px;" onclick="goPage('previsao')">Ver Previsão IA</button>
        </div>`;
      alertsEl2.prepend(aiDiv);
    }).catch(() => {});

    function renderItems(items, cssClass) {
      return items.map(a => `<div class="alert-item ${cssClass}">
        <div class="alert-item-icon">${a.icon}</div>
        <div class="alert-item-body">
          <div class="alert-item-title">${a.title}</div>
          <div class="alert-item-sub">${a.sub}</div>
        </div>
        ${a.action ? `<div class="alert-item-action">${a.action}</div>` : ''}
      </div>`).join('');
    }

    const allAlerts = [
      ...renderItems(criticals, 'critical'),
      ...renderItems(warnings,  'warning')
    ].join('');

    alertsEl.innerHTML = allAlerts || `<div class="alert-item info">
      <div class="alert-item-icon">✅</div>
      <div class="alert-item-body">
        <div class="alert-item-title">Nenhum alerta crítico no momento</div>
        <div class="alert-item-sub">Tudo parece estar em ordem. Continue monitorando o sistema.</div>
      </div>
    </div>`;

    noticesEl.innerHTML = renderItems(notices, 'info') || `<div class="alert-item">
      <div class="alert-item-icon">📋</div>
      <div class="alert-item-body">
        <div class="alert-item-title">Nenhum aviso no momento</div>
        <div class="alert-item-sub">Sistema funcionando normalmente.</div>
      </div>
    </div>`;

  } catch(e) { console.error('Erro no dashboard:', e); }
}

