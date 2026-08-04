// Extraído de index.html (metas funções adicionais + wrappers + loader de cores) em 2026-07-27
// ÚLTIMO arquivo do bloco principal — contém wrappers que dependem dos anteriores.
// ═══════════════════════════════════════════════════════════════
// 📊 METAS — FUNÇÕES ADICIONAIS
// ═══════════════════════════════════════════════════════════════

function toggleAnaliseSemanaPeriodo() {
  const periodo = document.getElementById('analise-periodo')?.value;
  const mesWrap = document.getElementById('analise-mes-wrap');
  const semWrap = document.getElementById('analise-semana-wrap');
  if (mesWrap) mesWrap.style.display = periodo === 'semanal' ? 'none' : (periodo === 'acumulado' ? 'none' : '');
  if (semWrap) semWrap.style.display = periodo === 'semanal' ? 'flex' : 'none';
  // Auto-preenche com a semana atual (seg–dom) ao abrir o modo semanal
  if (periodo === 'semanal') {
    const iniEl = document.getElementById('analise-data-ini');
    const fimEl = document.getElementById('analise-data-fim');
    if (iniEl && !iniEl.value) setSemanaAtual();
  }
  carregarAnalise();
}

// Retorna { ini, fim } da semana (seg-dom) que contém a data informada
function semanaDeData(ref) {
  const d = new Date(ref);
  const dow = d.getDay(); // 0=dom, 1=seg...
  const diffSeg = (dow === 0) ? -6 : 1 - dow; // volta até segunda
  const seg = new Date(d); seg.setDate(d.getDate() + diffSeg); seg.setHours(0,0,0,0);
  const dom = new Date(seg); dom.setDate(seg.getDate() + 6); dom.setHours(23,59,59,999);
  return { ini: seg, fim: dom };
}

function toDateInput(d) {
  return d.toISOString().slice(0,10);
}

function setSemanaAtual() {
  const { ini, fim } = semanaDeData(new Date());
  document.getElementById('analise-data-ini').value = toDateInput(ini);
  document.getElementById('analise-data-fim').value = toDateInput(fim);
  atualizarLabelSemana(ini, fim);
}

function navegarSemana(dir) {
  if (dir === 0) { setSemanaAtual(); carregarAnalise(); return; }
  const iniEl = document.getElementById('analise-data-ini');
  const fimEl = document.getElementById('analise-data-fim');
  const base = iniEl.value ? new Date(iniEl.value + 'T12:00:00') : new Date();
  base.setDate(base.getDate() + dir * 7);
  const { ini, fim } = semanaDeData(base);
  iniEl.value = toDateInput(ini);
  fimEl.value = toDateInput(fim);
  atualizarLabelSemana(ini, fim);
  carregarAnalise();
}

function atualizarLabelSemana(ini, fim) {
  const el = document.getElementById('analise-semana-label');
  if (!el) return;
  const fmtD = d => d.toLocaleDateString('pt-BR', { day:'2-digit', month:'short' });
  el.textContent = `📅 ${fmtD(ini)} → ${fmtD(fim)}`;
}

// Carrega metas com fallback para o ano atual se não existir
async function carregarMetasComFallback(ano) {
  const snap = await db.collection('metas').doc('categorias_' + ano).get();
  if (snap.exists && Object.keys(snap.data() || {}).length > 0) {
    return snap.data();
  }
  // Fallback: usa meta do ano atual
  const anoAtual = new Date().getFullYear();
  if (parseInt(ano) !== anoAtual) {
    const snapAtual = await db.collection('metas').doc('categorias_' + anoAtual).get();
    if (snapAtual.exists) return snapAtual.data();
  }
  return {};
}

// Salva meta com histórico (versão com timestamp)
async function salvarMetas() {
  const ano  = document.getElementById('metas-ano')?.value || new Date().getFullYear();
  const data = {};
  Object.keys(CATEGORIAS).forEach(key => {
    const mes  = parseFloat(document.getElementById('meta-mes-' + key)?.value) || 0;
    const sem  = parseFloat(document.getElementById('meta-sem-' + key)?.value) || 0;
    const anoV = parseFloat(document.getElementById('meta-ano-' + key)?.value) || (mes * 12);
    if (mes > 0 || sem > 0) {
      data[key] = { metaMes: mes, metaSemana: sem, metaAno: anoV || mes * 12 };
    }
  });

  try {
    // Salva versão atual
    await db.collection('metas').doc('categorias_' + ano).set(data, { merge: true });

    // Salva histórico com timestamp
    await db.collection('metas_historico').add({
      ano: parseInt(ano),
      data,
      atualizadoPor: currentUserData?.name || '',
      atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    });

    _metasCache = data;
    showToast('✅ Metas salvas com histórico!');
  } catch(e) {
    showToast('❌ Erro ao salvar: ' + e.message);
  }
}

// ─── Meta semanal nos orçamentos pendentes ───
async function opcCarregarMetasSemana() {
  try {
    const ano = new Date().getFullYear();
    const metas = await carregarMetasComFallback(ano);
    window.opcMetasSemana = metas;
  } catch(e) {
    window.opcMetasSemana = {};
  }
}

// ─── Relatório semanal por email ───
async function enviarRelatorioSemanal() {
  showToast('⏳ Gerando relatório semanal...');

  try {
    const hoje    = new Date();
    const semStr  = `Semana ${Math.ceil(hoje.getDate()/7)} de ${MESES_PT[hoje.getMonth()]}/${hoje.getFullYear()}`;
    const ano     = hoje.getFullYear();
    const mes     = MESES_PT[hoje.getMonth()];

    // 1. Boletos em aberto e atrasados
    const finSnap  = await db.collection('compras_financeiro').where('pago', '!=', 'Sim').get();
    let totalAberto = 0, totalAtrasado = 0, bolAtrasados = [], bolVencendo = [];
    finSnap.docs.forEach(doc => {
      const d   = doc.data();
      const val = parseFloat(d.valor) || 0;
      totalAberto += val;
      if (d.vencimentoStr) {
        const vd = new Date(d.vencimentoStr + 'T00:00:00');
        if (vd < hoje) {
          totalAtrasado += val;
          bolAtrasados.push(`  • ${d.fornecedor} — R$ ${val.toFixed(2)} (venc: ${vd.toLocaleDateString('pt-BR')})`);
        } else if (vd <= new Date(hoje.getTime() + 7*24*60*60*1000)) {
          bolVencendo.push(`  • ${d.fornecedor} — R$ ${val.toFixed(2)} (venc: ${vd.toLocaleDateString('pt-BR')})`);
        }
      }
    });

    // 2. Fornecedores acima de 50% e 80%
    await loadSuppliers();
    const forn50 = [], forn80 = [];
    suppliersCache.forEach(s => {
      const limite = parseFloat(s.limite) || 0;
      const util   = parseFloat(s.utilizado) || 0;
      if (!limite) return;
      const pct = (util / limite) * 100;
      if (pct >= 80) forn80.push(`  🔴 ${s.nome}: ${pct.toFixed(0)}% (R$ ${util.toFixed(0)}/${limite.toFixed(0)})`);
      else if (pct >= 50) forn50.push(`  ⚠️ ${s.nome}: ${pct.toFixed(0)}% (R$ ${util.toFixed(0)}/${limite.toFixed(0)})`);
    });

    // 3. Análise de metas
    const gastos = await buscarGastosReais(ano);
    const metas  = await carregarMetasComFallback(ano);
    let metasLinha = [];
    Object.entries(CATEGORIAS).forEach(([key, cat]) => {
      const m   = metas[key] || {};
      const g   = gastos[key] || { meses: {}, total: 0 };
      const val = g.meses[mes] || 0;
      const meta = parseFloat(m.metaMes) || 0;
      if (!meta && !val) return;
      const pct  = meta > 0 ? ((val / meta) * 100).toFixed(0) : '—';
      const icon = meta > 0 && val > meta ? '🔴' : meta > 0 && val > meta * 0.8 ? '⚠️' : '✅';
      metasLinha.push(`  ${icon} ${cat.nome}: R$ ${val.toFixed(0)} / meta R$ ${meta.toFixed(0)} (${pct}%)`);
    });

    // 4. Monta relatório
    const relatorio = `📊 RELATÓRIO SEMANAL — ${semStr}
${'═'.repeat(50)}

💰 FINANCEIRO GERAL
• Total em aberto: R$ ${totalAberto.toFixed(2)}
• Total atrasado:  R$ ${totalAtrasado.toFixed(2)}

🔴 BOLETOS ATRASADOS (${bolAtrasados.length}):
${bolAtrasados.slice(0,10).join('\n') || '  Nenhum'}

⏰ VENCENDO EM 7 DIAS (${bolVencendo.length}):
${bolVencendo.slice(0,10).join('\n') || '  Nenhum'}

🏢 FORNECEDORES ACIMA DE 80% DO LIMITE:
${forn80.join('\n') || '  Nenhum'}

⚠️ FORNECEDORES ACIMA DE 50% DO LIMITE:
${forn50.join('\n') || '  Nenhum'}

🎯 ANÁLISE DE METAS (${mes}/${ano}):
${metasLinha.join('\n') || '  Sem metas cadastradas'}

${'═'.repeat(50)}
Relatório gerado automaticamente pelo Sistema Suprimentos Obra Lumen`;

    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_email:  ADMIN_EMAIL,
      to_name:   'Administrador Lumen',
      from_name: 'Sistema Suprimentos Obra Lumen',
      reply_to:  ADMIN_EMAIL,
      subject:   `📊 Relatório Semanal Lumen — ${semStr}`,
      message:   relatorio,
    });

    showToast('✅ Relatório semanal enviado para ' + ADMIN_EMAIL);
  } catch(e) {
    console.error('enviarRelatorioSemanal error:', e);
    showToast('❌ Erro ao enviar relatório: ' + e.message);
  }
}

// ─── Gera slides de metas (abre aba de download) ───
async function gerarSlidesMetas() {
  showToast('⏳ Gerando apresentação...');
  try {
    const ano    = document.getElementById('analise-ano')?.value || new Date().getFullYear();
    const periodo= document.getElementById('analise-periodo')?.value || 'mensal';
    const mesFilt= document.getElementById('analise-mes')?.value || '';
    const iniStr = document.getElementById('analise-data-ini')?.value;
    const fimStr = document.getElementById('analise-data-fim')?.value;
    const dataIniSem = iniStr ? new Date(iniStr + 'T00:00:00') : null;
    const dataFimSem = fimStr ? new Date(fimStr + 'T23:59:59') : null;

    const gastos = await buscarGastosReais(ano);
    const metas  = await carregarMetasComFallback(ano);
    const hoje   = new Date();
    const mesAtualIdx = hoje.getMonth();

    let periodoTexto = '';
    if (periodo === 'semanal' && iniStr && fimStr) {
      const fmtD = d => d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });
      periodoTexto = `Semana ${fmtD(dataIniSem)} → ${fmtD(dataFimSem)}`;
    } else if (periodo === 'mensal' && mesFilt) periodoTexto = mesFilt + ' / ' + ano;
    else                                  periodoTexto = 'Acumulado ' + ano + ' (Janeiro a ' + MESES_PT[mesAtualIdx] + ')';

    const fmt = function(v) { return 'R$ ' + (v||0).toLocaleString('pt-BR', {minimumFractionDigits:2}); };

    const slidesData = [];
    let totalRealPer = 0, totalMetaPer = 0;

    Object.entries(CATEGORIAS).forEach(function([key, cat]) {
      const m = metas[key] || {};
      const g = gastos[key] || { meses: {}, total: 0 };
      const metaMes = parseFloat(m.metaMes) || 0;
      const metaSem = parseFloat(m.metaSemana) || 0;
      const mesRef  = periodo === 'semanal' ? mesSem : (mesFilt || MESES_PT[mesAtualIdx]);
      const realMes = g.meses[mesRef] || 0;
      const realSem = realMes / 4.33;
      let realPer = 0, metaPer = 0;
      if (periodo === 'semanal')       { realPer = realSem; metaPer = metaSem; }
      else if (periodo === 'mensal')   { realPer = realMes; metaPer = metaMes; }
      else                              { realPer = g.total; metaPer = metaMes * (mesAtualIdx + 1); }
      if (!metaMes && !realMes && !g.total) return;
      totalRealPer += realPer; totalMetaPer += metaPer;
      slidesData.push({ key, cat, metaMes, metaSem, metaPer, realMes, realSem, realPer });
    });

    const economia  = totalMetaPer - totalRealPer;
    const varGeral  = totalMetaPer > 0 ? ((totalRealPer / totalMetaPer - 1) * 100).toFixed(1) : null;
    const oport = slidesData.filter(function(d) { return d.metaPer > 0 && d.realPer > d.metaPer; })
      .sort(function(a,b) { return (b.realPer-b.metaPer)-(a.realPer-a.metaPer); }).slice(0,4);
    const totalMesAtual = Object.values(gastos).reduce(function(s,g2) { return s+(g2.meses[MESES_PT[mesAtualIdx]]||0); }, 0);
    const totalMetaMes  = Object.values(metas).reduce(function(s,m2) { return s+(parseFloat(m2&&m2.metaMes)||0); }, 0);
    const economiaMes   = Math.max(0, totalMesAtual - totalMetaMes);
    const economiaProjAnual = economiaMes * 12;

    // Get logo from page
    const logoEl  = document.querySelector('.login-logo-img');
    const logoSrc = logoEl ? logoEl.src : '';

    const w = window.open('', '_blank', 'width=1100,height=680');
    if (!w) { showToast('⚠️ Pop-up bloqueado! Permita pop-ups para este site.'); return; }

    let html = '<!DOCTYPE html><html lang="pt-BR"><head>';
    html += '<meta charset="UTF-8"><title>Metas ' + ano + ' — Obra Lumen</title>';
    html += '<style>';
    html += '* { box-sizing:border-box; margin:0; padding:0; }';
    html += 'body { font-family:"Segoe UI",sans-serif; background:#0d1b2a; color:#e8f1f2; }';
    html += '@media print { body { -webkit-print-color-adjust:exact; } .noprint { display:none!important; } }';
    html += '.slide { width:100%; min-height:100vh; display:flex; flex-direction:column; justify-content:center; align-items:center; padding:52px 60px; page-break-after:always; border-bottom:2px solid #1e3a5f; }';
    html += 'h1 { font-size:48px; font-weight:900; color:#00c8e0; margin-bottom:12px; text-align:center; }';
    html += 'h2 { font-size:26px; font-weight:700; color:#00c8e0; margin-bottom:20px; text-align:center; }';
    html += '.subtitle { font-size:17px; color:#7fb3d3; margin-bottom:8px; text-align:center; }';
    html += '.period-badge { background:#1e3a5f; border:1px solid #00c8e0; color:#00c8e0; border-radius:24px; padding:8px 24px; font-size:15px; font-weight:700; display:inline-block; margin-top:16px; }';
    html += 'table { width:100%; max-width:960px; border-collapse:collapse; }';
    html += 'th { background:#1e3a5f; padding:9px 12px; text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:1px; color:#7fb3d3; }';
    html += 'th.r { text-align:right; }';
    html += 'td { padding:9px 12px; border-bottom:1px solid #1e3a5f; font-size:12px; vertical-align:middle; }';
    html += 'td.r { text-align:right; font-weight:700; }';
    html += '.ok { color:#22c55e; } .warn { color:#f59e0b; } .danger { color:#ef4444; }';
    html += '.cards3 { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; width:100%; max-width:900px; margin:24px 0; }';
    html += '.cards4 { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; width:100%; max-width:960px; margin:16px 0; }';
    html += '.card { background:#1e3a5f; border-radius:12px; padding:18px 14px; text-align:center; border:1px solid #2a5280; }';
    html += '.card-label { font-size:10px; color:#7fb3d3; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px; }';
    html += '.card-val { font-size:20px; font-weight:800; }';
    html += '.print-btn { position:fixed; bottom:24px; right:24px; padding:12px 22px; background:#00c8e0; color:#0d1b2a; border:none; border-radius:10px; font-size:14px; font-weight:700; cursor:pointer; z-index:999; }';
    html += '.opp-card { background:#1e3a5f; border-left:4px solid #ef4444; border-radius:8px; padding:14px 18px; margin-bottom:10px; width:100%; max-width:760px; display:flex; justify-content:space-between; align-items:center; }';
    html += '.bar-bg { background:#1e3a5f; border-radius:8px; height:12px; width:100%; }';
    html += '.bar-fill { height:12px; border-radius:8px; }';
    html += '</style></head><body>';
    html += '<button class="print-btn noprint" onclick="window.print()">🖨️ Imprimir / PDF</button>';

    // SLIDE 1 - CAPA
    html += '<div class="slide" style="background:#0d1b2a;">';
    if (logoSrc) html += '<div style="margin-bottom:24px;"><img src="' + logoSrc + '" alt="Obra Lumen" style="height:72px;"></div>';
    html += '<h1>Análise de Metas</h1>';
    html += '<div class="subtitle">Obra Lumen · Gestão de Suprimentos</div>';
    html += '<div class="period-badge">📅 ' + periodoTexto + '</div>';
    html += '<div style="font-size:13px;color:#3a6186;margin-top:40px;">' + new Date().toLocaleString('pt-BR') + '</div>';
    html += '</div>';

    // SLIDE 2 - RESUMO
    html += '<div class="slide">';
    html += '<h2>📊 Resumo Executivo</h2>';
    html += '<div class="subtitle">' + periodoTexto + '</div>';
    html += '<div class="cards3" style="margin-top:24px;">';
    html += '<div class="card"><div class="card-label">Meta do Período</div><div class="card-val" style="color:#00c8e0;">' + fmt(totalMetaPer) + '</div></div>';
    const corReal = totalRealPer > totalMetaPer ? '#ef4444' : '#22c55e';
    html += '<div class="card"><div class="card-label">Realizado no Período</div><div class="card-val" style="color:' + corReal + ';">' + fmt(totalRealPer) + '</div></div>';
    const corEcon = economia >= 0 ? '#22c55e' : '#ef4444';
    const lblEcon = economia >= 0 ? '💚 Economia' : '🔴 Excesso';
    html += '<div class="card"><div class="card-label">' + lblEcon + '</div><div class="card-val" style="color:' + corEcon + ';">' + fmt(Math.abs(economia)) + '</div>';
    if (varGeral !== null) html += '<div style="font-size:12px;color:' + (parseFloat(varGeral)>0?'#ef4444':'#22c55e') + ';margin-top:4px;">' + (parseFloat(varGeral)>0?'+':'') + varGeral + '% da meta</div>';
    html += '</div></div>';
    html += '</div>';

    // SLIDE 3 - TABELA
    html += '<div class="slide">';
    html += '<h2>📦 Realizado × Meta por Categoria</h2>';
    html += '<table><thead><tr>';
    html += '<th>Categoria</th>';
    html += '<th class="r">Meta Per.</th><th class="r">Real. Per.</th><th class="r">Var. %</th>';
    html += '<th class="r">Meta Mês</th><th class="r">Real. Mês</th><th class="r">Var. %</th>';
    html += '<th class="r">Meta Sem.</th><th class="r">Real. Sem.</th><th class="r">Status</th>';
    html += '</tr></thead><tbody>';
    slidesData.forEach(function(d) {
      const varPer = d.metaPer > 0 ? ((d.realPer/d.metaPer-1)*100).toFixed(1) : null;
      const varMes = d.metaMes > 0 ? ((d.realMes/d.metaMes-1)*100).toFixed(1) : null;
      const stCls  = varPer === null ? '' : parseFloat(varPer) > 15 ? 'danger' : parseFloat(varPer) > 0 ? 'warn' : 'ok';
      const stLbl  = varPer === null ? '—' : parseFloat(varPer) > 15 ? '🔴 Acima' : parseFloat(varPer) > 0 ? '⚠️ Aten.' : '✅ OK';
      const mCls   = varMes === null ? '' : parseFloat(varMes) > 0 ? 'danger' : 'ok';
      html += '<tr>';
      html += '<td style="font-weight:700;">' + d.cat.icon + ' ' + d.cat.nome + '</td>';
      html += '<td class="r">' + (d.metaPer > 0 ? fmt(d.metaPer) : '—') + '</td>';
      html += '<td class="r ' + stCls + '">' + fmt(d.realPer) + '</td>';
      html += '<td class="r ' + stCls + '">' + (varPer !== null ? (parseFloat(varPer)>0?'+':'') + varPer + '%' : '—') + '</td>';
      html += '<td class="r">' + (d.metaMes > 0 ? fmt(d.metaMes) : '—') + '</td>';
      html += '<td class="r ' + mCls + '">' + fmt(d.realMes) + '</td>';
      html += '<td class="r ' + mCls + '">' + (varMes !== null ? (parseFloat(varMes)>0?'+':'') + varMes + '%' : '—') + '</td>';
      html += '<td class="r">' + (d.metaSem > 0 ? fmt(d.metaSem) : '—') + '</td>';
      html += '<td class="r">' + fmt(d.realSem) + '</td>';
      html += '<td class="' + stCls + '">' + stLbl + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table></div>';

    // SLIDES POR CATEGORIA
    slidesData.filter(function(d) { return d.metaMes > 0 || d.realMes > 0; }).forEach(function(d) {
      const varPer = d.metaPer > 0 ? ((d.realPer/d.metaPer-1)*100).toFixed(1) : null;
      const varMes = d.metaMes > 0 ? ((d.realMes/d.metaMes-1)*100).toFixed(1) : null;
      const pctMes = d.metaMes > 0 ? Math.min(150, (d.realMes/d.metaMes)*100) : 0;
      const barCor = pctMes > 100 ? '#ef4444' : pctMes > 80 ? '#f59e0b' : '#22c55e';
      const cpReal = varPer !== null && parseFloat(varPer) > 0 ? '#ef4444' : '#22c55e';
      const cmReal = varMes !== null && parseFloat(varMes) > 0 ? '#ef4444' : '#22c55e';
      html += '<div class="slide">';
      html += '<div style="font-size:48px;margin-bottom:8px;">' + d.cat.icon + '</div>';
      html += '<h2>' + d.cat.nome + '</h2>';
      html += '<div class="cards4">';
      html += '<div class="card"><div class="card-label">Meta Período</div><div class="card-val" style="color:#00c8e0;">' + (d.metaPer > 0 ? fmt(d.metaPer) : '—') + '</div></div>';
      html += '<div class="card"><div class="card-label">Real. Período</div><div class="card-val" style="color:' + cpReal + ';">' + fmt(d.realPer) + '</div>' + (varPer ? '<div style="font-size:11px;color:' + cpReal + ';margin-top:4px;">' + (parseFloat(varPer)>0?'+':'') + varPer + '%</div>' : '') + '</div>';
      html += '<div class="card"><div class="card-label">Meta Mensal</div><div class="card-val" style="color:#00c8e0;">' + (d.metaMes > 0 ? fmt(d.metaMes) : '—') + '</div></div>';
      html += '<div class="card"><div class="card-label">Real. Mensal</div><div class="card-val" style="color:' + cmReal + ';">' + fmt(d.realMes) + '</div>' + (varMes ? '<div style="font-size:11px;color:' + cmReal + ';margin-top:4px;">' + (parseFloat(varMes)>0?'+':'') + varMes + '%</div>' : '') + '</div>';
      html += '</div>';
      html += '<div style="width:100%;max-width:640px;margin-top:8px;">';
      html += '<div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:12px;color:#7fb3d3;">';
      html += '<span>Meta Sem.: <strong style="color:#fff;">' + (d.metaSem > 0 ? fmt(d.metaSem) : '—') + '</strong></span>';
      html += '<span>Real. Sem.: <strong style="color:#fff;">' + fmt(d.realSem) + '</strong></span>';
      html += '<span>' + pctMes.toFixed(0) + '% da meta mensal</span></div>';
      html += '<div class="bar-bg"><div class="bar-fill" style="width:' + Math.min(100,pctMes) + '%;background:' + barCor + ';"></div></div>';
      html += '</div></div>';
    });

    // SLIDE OPORTUNIDADES
    html += '<div class="slide">';
    html += '<h2>💡 Oportunidades de Melhoria</h2>';
    html += '<div class="subtitle">Categorias com maior espaço para redução de gastos</div>';
    if (oport.length > 0) {
      oport.forEach(function(d) {
        const excesso = d.realPer - d.metaPer;
        const pct = d.metaPer > 0 ? ((d.realPer/d.metaPer-1)*100).toFixed(0) : 0;
        html += '<div class="opp-card">';
        html += '<div style="font-size:16px;font-weight:700;">' + d.cat.icon + ' ' + d.cat.nome + '</div>';
        html += '<div style="text-align:right;"><div style="color:#ef4444;font-size:18px;font-weight:800;">+' + fmt(excesso) + ' acima</div>';
        html += '<div style="color:#7fb3d3;font-size:12px;">+' + pct + '% da meta do período</div></div>';
        html += '</div>';
      });
    } else {
      html += '<div style="color:#22c55e;font-size:20px;margin-top:24px;">✅ Todas as categorias dentro da meta!</div>';
    }
    html += '<div style="margin-top:28px;background:#1e3a5f;border-radius:12px;padding:18px 28px;width:100%;max-width:760px;">';
    html += '<div style="font-size:13px;color:#7fb3d3;margin-bottom:8px;">💰 PROJEÇÃO: Se atingirmos as metas mensais...</div>';
    html += '<div style="font-size:22px;font-weight:800;color:#22c55e;">Economia anual estimada: ' + fmt(economiaProjAnual) + '</div>';
    html += '<div style="font-size:12px;color:#7fb3d3;margin-top:4px;">Baseado no excesso médio de ' + fmt(economiaMes) + ' por mês</div>';
    html += '</div></div>';

    // SLIDE FINAL
    html += '<div class="slide" style="background:#0d1b2a;">';
    if (logoSrc) html += '<div style="margin-bottom:24px;"><img src="' + logoSrc + '" alt="Obra Lumen" style="height:80px;"></div>';
    html += '<h1 style="font-size:32px;">Juntos por uma gestão mais eficiente!</h1>';
    html += '<div class="subtitle">Suprimentos Obra Lumen</div>';
    html += '<div style="font-size:13px;color:#3a6186;margin-top:32px;">Gerado em ' + new Date().toLocaleString('pt-BR') + '</div>';
    html += '</div>';

    html += '</body></html>';

    w.document.write(html);
    w.document.close();
    showToast('✅ Apresentação gerada! Use Ctrl+P para salvar como PDF.');
  } catch(e) {
    showToast('❌ Erro ao gerar slides: ' + e.message);
    console.error(e);
  }
}


// Hook: carrega metas ao iniciar orçamentos pendentes
const _origInitOrcPendentes = typeof initOrcPendentes === 'function' ? initOrcPendentes : null;

// Apply saved custom colors on load
(function() {
  const main  = localStorage.getItem('lumen-color-main');
  const dark  = localStorage.getItem('lumen-color-dark');
  const light = localStorage.getItem('lumen-color-light');
  const acc   = localStorage.getItem('lumen-color-accent');
  const accdk = localStorage.getItem('lumen-color-accent-dk');
  if (main)  { document.documentElement.style.setProperty('--lumen', main); }
  if (dark)  { document.documentElement.style.setProperty('--lumen-dark', dark); }
  if (light) { document.documentElement.style.setProperty('--lumen-lt', light); }
  if (acc)   { document.documentElement.style.setProperty('--accent', acc); }
  if (accdk) { document.documentElement.style.setProperty('--accent-dk', accdk); }
})();


