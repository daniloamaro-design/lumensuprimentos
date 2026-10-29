/* ══════════════════════════════════════════════════════════════════════
   Consumo Alimentar — etapa 2: compras sugeridas (estoque de segurança),
   auditoria (contagem real x sistema) e histórico de auditorias.
   Usa o estado e os helpers de js/29-consumo-alimentar.js. Tabela: consumo_auditorias (migration 050).
   ══════════════════════════════════════════════════════════════════════ */

// Estoque atual da casa = entradas − saídas (mesma conta usada no resto do sistema)
async function _caEstoque() {
  const est = {};
  const snap = await db.collection('movements').where('house', '==', _ca.house).get();
  snap.docs.forEach(d => {
    const m = d.data();
    (m.items || []).forEach(it => {
      const k = `${it.catKey}__${it.prodId}`;
      est[k] = (est[k] || 0) + (m.type === 'entrada' ? 1 : -1) * (Number(it.qty) || 0);
    });
  });
  return est;
}

// Consumo médio por dia (média da semana: cereais fixos + proteínas do cardápio)
function _caConsumoMedio() {
  const med = {};
  _CA_DIAS.forEach(d => Object.entries(_caConsumoDia(d.k, 1)).forEach(([k, q]) => { med[k] = (med[k] || 0) + q / 7; }));
  return med;
}

const _caArred = (q, un) => /kg|lit|l$/i.test(un) ? Math.ceil(q * 10) / 10 : Math.ceil(q);

// ── Compras sugeridas ───────────────────────────────────────────────────
async function _caRenderCompras() {
  const aba = document.getElementById('ca-aba');
  aba.innerHTML = '<div class="cardapio-card">Calculando…</div>';
  _ca.estoque = await _caEstoque();
  let seg = 7; try { seg = parseInt(localStorage.getItem('ca-seg-dias')) || 7; } catch (e) { /* sem storage */ }
  _ca.compraPar = _ca.compraPar || { periodo: _ca.plano.diasMes || 30, seg };
  aba.innerHTML = `
    <div class="cardapio-card">
      <div style="display:flex;gap:18px;align-items:flex-end;flex-wrap:wrap;">
        <div><label class="form-label">Período a comprar (dias)</label><input class="cardapio-input" style="width:110px;" id="ca-c-periodo" inputmode="numeric" value="${_ca.compraPar.periodo}" oninput="caRecalcCompras()"></div>
        <div><label class="form-label">Estoque de segurança (dias)</label><input class="cardapio-input" style="width:110px;" id="ca-c-seg" inputmode="numeric" value="${_ca.compraPar.seg}" oninput="caRecalcCompras()"></div>
        <button class="btn btn-outline btn-sm" onclick="caExportarCompras()">📊 Exportar Excel</button>
      </div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:8px;">Comprar = consumo diário × (período + segurança) − estoque atual. O consumo diário vem do plano da casa (média da semana).</div>
    </div>
    <div class="cardapio-card" style="overflow-x:auto;" id="ca-compras-tab"></div>`;
  caRecalcCompras();
}

function caRecalcCompras() {
  const periodo = parseInt(document.getElementById('ca-c-periodo').value) || 0, seg = parseInt(document.getElementById('ca-c-seg').value) || 0;
  _ca.compraPar = { periodo, seg };
  try { localStorage.setItem('ca-seg-dias', String(seg)); } catch (e) { /* sem storage */ }
  const med = _caConsumoMedio(), est = _ca.estoque || {};
  const linhas = Object.keys(med).map(key => {
    const p = _caInfoProduto(key), diario = med[key], estoque = est[key] || 0;
    const cob = diario > 0 ? estoque / diario : 0;
    const comprar = Math.max(0, diario * (periodo + seg) - estoque);
    return { key, nome: p.nome, unidade: p.unidade, diario, estoque, cob, comprar: comprar > 0 ? _caArred(comprar, p.unidade) : 0 };
  }).sort((a, b) => a.cob - b.cob);
  _ca.comprasLinhas = linhas;
  const th = 'padding:8px;font-size:11px;text-transform:uppercase;color:var(--text-muted);border-bottom:1px solid var(--border);text-align:right;';
  document.getElementById('ca-compras-tab').innerHTML = linhas.length ? `<table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr>
    <th style="${th}text-align:left;">Item</th><th style="${th}text-align:center;">Unid.</th><th style="${th}">Consumo/dia</th><th style="${th}">Estoque</th><th style="${th}">Cobertura</th><th style="${th}">Comprar</th></tr></thead><tbody>
    ${linhas.map(l => { const baixo = l.cob < seg; return `<tr style="border-top:1px solid var(--border);"><td style="padding:7px 8px;">${_caEsc(l.nome)}</td><td style="text-align:center;color:var(--text-muted);font-size:12px;">${_caEsc(l.unidade)}</td>
      <td style="text-align:right;">${_caFmt(l.diario)}</td><td style="text-align:right;${l.estoque < 0 ? 'color:var(--danger);' : ''}">${_caFmt(l.estoque)}</td>
      <td style="text-align:right;font-weight:700;color:${baixo ? 'var(--danger)' : 'var(--ok)'};">${_caFmt(l.cob, 1)} dias${baixo ? ' ⚠️' : ''}</td>
      <td style="text-align:right;font-weight:800;">${l.comprar ? _caFmt(l.comprar) : '—'}</td></tr>`; }).join('')}</tbody></table>`
    : '<div class="cardapio-empty">Cadastre o consumo por refeição e o cardápio desta casa para calcular as compras.</div>';
}
window.caRecalcCompras = caRecalcCompras;

function caExportarCompras() {
  const l = (_ca.comprasLinhas || []).filter(x => x.comprar > 0);
  if (!l.length) { showToast('Nada a comprar com esses parâmetros.'); return; }
  const rows = [['Item', 'Unidade', 'Consumo/dia', 'Estoque atual', 'Cobertura (dias)', 'Comprar']]
    .concat(l.map(x => [x.nome, x.unidade, Math.round(x.diario * 1000) / 1000, Math.round(x.estoque * 1000) / 1000, Math.round(x.cob * 10) / 10, x.comprar]));
  const ws = XLSX.utils.aoa_to_sheet(rows); ws['!cols'] = [{ wch: 30 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 12 }];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Compras');
  XLSX.writeFile(wb, `Compras-${_ca.house.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
window.caExportarCompras = caExportarCompras;

// ── Auditoria: contagem real x sistema ──────────────────────────────────
async function _caRenderAuditoria() {
  const aba = document.getElementById('ca-aba');
  aba.innerHTML = '<div class="cardapio-card">Carregando…</div>';
  _ca.estoque = await _caEstoque();
  const med = _caConsumoMedio();
  const catalogo = new Set(_caTodosProdutos().map(p => p.key));
  const keys = [...new Set([...Object.keys(med), ...Object.keys(_ca.estoque).filter(k => catalogo.has(k) && Math.abs(_ca.estoque[k]) > 0.0005)])]
    .sort((a, b) => _caInfoProduto(a).nome.localeCompare(_caInfoProduto(b).nome, 'pt-BR'));
  const th = 'padding:8px;font-size:11px;text-transform:uppercase;color:var(--text-muted);border-bottom:1px solid var(--border);text-align:right;';
  aba.innerHTML = `
    <div class="cardapio-card">
      <div style="font-size:13px;margin-bottom:6px;">Na visita à casa, digite a <b>contagem real</b> de cada item. Itens deixados em branco não são auditados. A diferença vira um ajuste no estoque (entrada se sobrou, saída se faltou), registrado com seu nome.</div>
      <div style="font-size:12px;color:var(--text-muted);">Dica: dê baixa nos dias pendentes (aba Baixa de estoque) <b>antes</b> de auditar, para o sistema estar atualizado até hoje.</div>
    </div>
    <div class="cardapio-card" style="overflow-x:auto;">${keys.length ? `<table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr><th style="${th}text-align:left;">Item</th><th style="${th}text-align:center;">Unid.</th><th style="${th}">Sistema</th><th style="${th}">Contagem real</th><th style="${th}">Diferença</th></tr></thead><tbody>
      ${keys.map(k => { const p = _caInfoProduto(k); return `<tr style="border-top:1px solid var(--border);"><td style="padding:6px 8px;">${_caEsc(p.nome)}</td><td style="text-align:center;font-size:12px;color:var(--text-muted);">${_caEsc(p.unidade)}</td>
        <td style="text-align:right;">${_caFmt(_ca.estoque[k] || 0)}</td><td style="text-align:right;"><input class="cardapio-input" style="width:100px;" inputmode="decimal" data-aud="${k}" oninput="caRecalcAud()"></td>
        <td id="ca-aud-d-${k}" style="text-align:right;font-weight:700;"></td></tr>`; }).join('')}</tbody></table>
      <div class="cardapio-actions"><button class="btn btn-primary" style="width:auto;" onclick="caConfirmarAuditoria()">✅ Confirmar auditoria e ajustar estoque</button></div>`
      : '<div class="cardapio-empty">Cadastre o consumo da casa ou dê entrada de estoque para auditar.</div>'}</div>`;
}

function caRecalcAud() {
  document.querySelectorAll('#ca-aba input[data-aud]').forEach(i => {
    const k = i.dataset.aud, el = document.getElementById('ca-aud-d-' + k);
    if (i.value.trim() === '') { el.textContent = ''; return; }
    const dif = _caNum(i.value) - (_ca.estoque[k] || 0);
    el.textContent = (dif > 0 ? '+' : '') + _caFmt(dif);
    el.style.color = Math.abs(dif) < 0.0005 ? 'var(--ok)' : dif < 0 ? 'var(--danger)' : 'var(--warn,#d97706)';
  });
}
window.caRecalcAud = caRecalcAud;

async function caConfirmarAuditoria() {
  if (!_caPermitido()) return;
  const itens = {}; let totSis = 0, totDiv = 0;
  document.querySelectorAll('#ca-aba input[data-aud]').forEach(i => {
    if (i.value.trim() === '') return;
    const k = i.dataset.aud, p = _caInfoProduto(k), sis = Math.round((_ca.estoque[k] || 0) * 1000) / 1000, real = Math.round(_caNum(i.value) * 1000) / 1000;
    const dif = Math.round((real - sis) * 1000) / 1000;
    itens[k] = { nome: p.nome, unidade: p.unidade, sistema: sis, real, dif };
    totSis += Math.abs(sis); totDiv += Math.abs(dif);
  });
  if (!Object.keys(itens).length) { showToast('Digite a contagem de pelo menos um item.'); return; }
  const dif = Object.entries(itens).filter(([, x]) => Math.abs(x.dif) > 0.0005);
  const resumo = dif.length ? dif.map(([, x]) => `• ${x.nome}: sistema ${_caFmt(x.sistema)} → real ${_caFmt(x.real)} (${x.dif > 0 ? '+' : ''}${_caFmt(x.dif)} ${x.unidade})`).join('\n') : 'Nenhuma diferença — estoque confere.';
  if (!confirm(`Registrar a auditoria de "${_ca.house}" (${Object.keys(itens).length} itens contados)?\n\n${resumo}\n\nO estoque será ajustado para a contagem real.`)) return;
  const hoje = _caIso(new Date()), dateStr = hoje.replace(/-/g, ''), sigla = typeof siglaCasa === 'function' ? siglaCasa(_ca.house) : 'XX';
  try {
    const movIds = [];
    for (const tipo of ['entrada', 'saida']) {
      const lista = dif.filter(([, x]) => tipo === 'entrada' ? x.dif > 0 : x.dif < 0);
      if (!lista.length) continue;
      const movs = await db.collection('movements').where('dateStr', '==', dateStr).get();
      const mv = await db.collection('movements').add({
        code: `OB-${sigla}-${tipo === 'entrada' ? 'ENT' : 'SAI'}-AUDITORIA-${dateStr}-${String(movs.size + 1).padStart(3, '0')}`,
        house: _ca.house, type: tipo, date: hoje, dateStr, obs: 'Ajuste de auditoria — Consumo Alimentar', isDonation: false,
        items: lista.map(([k, x]) => { const p = _caInfoProduto(k); return { catKey: p.catKey || k.split('__')[0], prodId: p.prodId || k.split('__')[1], prodNome: x.nome, unidade: x.unidade, qty: Math.abs(x.dif) }; }),
        registeredBy: currentUserData?.name || '—', registeredUid: currentUser?.uid || null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      movIds.push(mv.id);
    }
    await db.collection('consumo_auditorias').add({
      house: _ca.house, data: hoje, itens, totalSistema: Math.round(totSis * 1000) / 1000, totalDiverg: Math.round(totDiv * 1000) / 1000,
      movementId: movIds.join(',') || null, registradoPor: currentUserData?.name || '—', registradoUid: currentUser?.uid || null,
    });
    showToast(dif.length ? `✅ Auditoria registrada e estoque ajustado (${dif.length} item(ns)).` : '✅ Auditoria registrada — estoque confere.');
  } catch (e) { console.error('caConfirmarAuditoria', e); showToast('❌ Erro na auditoria: ' + e.message); }
  _caRenderAuditoria();
}
window.caConfirmarAuditoria = caConfirmarAuditoria;

// ── Evolução: auditorias (% de divergência) com barras simples ───────────
async function _caHtmlAuditorias() {
  const snap = await db.collection('consumo_auditorias').where('house', '==', _ca.house).get();
  const aud = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.data).localeCompare(String(b.data)));
  if (!aud.length) return '<div class="cardapio-card"><h3>🔍 Auditorias</h3><div class="cardapio-empty">Nenhuma auditoria registrada para esta casa.</div></div>';
  const pct = a => { const s = Number(a.totalSistema) || 0; return s > 0 ? (Number(a.totalDiverg) || 0) / s * 100 : 0; };
  const max = Math.max(5, ...aud.map(pct));
  const barras = aud.slice(-12).map(a => { const p = pct(a), cor = p < 5 ? 'var(--ok)' : p < 15 ? 'var(--warn,#d97706)' : 'var(--danger)';
    return `<div style="display:flex;align-items:center;gap:10px;font-size:12.5px;margin:4px 0;"><span style="width:80px;color:var(--text-muted);">${_caDataBR(a.data)}</span>
      <div style="flex:1;background:var(--bg);border-radius:6px;height:16px;"><div style="width:${Math.min(100, p / max * 100)}%;background:${cor};height:16px;border-radius:6px;"></div></div>
      <b style="width:60px;text-align:right;color:${cor};">${_caFmt(p, 1)}%</b><span style="width:110px;color:var(--text-muted);font-size:11.5px;">${_caEsc(a.registradoPor || '')}</span></div>`; }).join('');
  return `<div class="cardapio-card"><h3>🔍 Auditorias — divergência entre sistema e contagem real</h3>${barras}
    <div style="font-size:11.5px;color:var(--text-muted);margin-top:8px;">Divergência = soma das diferenças ÷ soma do estoque do sistema. Quanto menor, mais fiel o consumo lançado.</div></div>`;
}
