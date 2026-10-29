/* ══════════════════════════════════════════════════════════════════════
   Consumo Alimentar — novo método de cálculo dos suprimentos (Cereais e Proteínas)
   • Por casa: quantidade de cada cereal em 6 refeições (total diário e mensal).
   • Cardápio semanal de proteínas (seg–dom × 6 refeições: proteína + quantidade).
   • Baixa de estoque por dia (ou vários dias, ex.: sáb+dom na segunda), com opção de
     editar pessoas/quantidades para um evento isolado.
   • Cada baixa guarda previsto x real em consumo_baixas (base de gráficos/%).
   Tabelas: consumo_planos, consumo_baixas (migration 049). Perfis: compras + gestão.
   ══════════════════════════════════════════════════════════════════════ */

const _CA_REFEICOES = [
  { k: 'cafe',         n: 'Café da manhã',   h: '6:30'  },
  { k: 'merendaManha', n: 'Merenda da manhã', h: '9:30'  },
  { k: 'almoco',       n: 'Almoço',          h: '12:00' },
  { k: 'merendaTarde', n: 'Merenda da tarde', h: '16:00' },
  { k: 'janta',        n: 'Janta',           h: '19:00' },
  { k: 'ceia',         n: 'Ceia',            h: '21:00' },
];
const _CA_DIAS = [
  { k: 'seg', n: 'Segunda' }, { k: 'ter', n: 'Terça' }, { k: 'qua', n: 'Quarta' }, { k: 'qui', n: 'Quinta' },
  { k: 'sex', n: 'Sexta' }, { k: 'sab', n: 'Sábado' }, { k: 'dom', n: 'Domingo' },
];
const _CA_DIA_POR_GETDAY = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
const _CA_PERFIS = ['admin', 'diretor', 'gerente', 'coordenador', 'compras'];

const _ca = { house: '', plano: null, planoId: null, pessoasCasa: 0, aba: 'consumo', baixas: [], dias: [] };

const _caEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const _caNum = v => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : 0; };
const _caFmt = (n, d = 3) => (Math.round((Number(n) || 0) * 10 ** d) / 10 ** d).toLocaleString('pt-BR', { maximumFractionDigits: d });
const _caIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const _caDataBR = iso => { const [y, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
const _caDiaDe = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const _caPermitido = () => _CA_PERFIS.includes(currentUserData?.role || '');

function _caProdutos(catKey) {
  return (CATEGORIAS[catKey]?.produtos || []).map(p => ({
    key: `${catKey}__${p.id}`, catKey, prodId: p.id, unidade: p.unidade || '',
    nome: (typeof nomeProdutoAtual === 'function' ? nomeProdutoAtual(catKey, p.id, p.nome) : p.nome) || p.id,
  }));
}
const _caTodosProdutos = () => [..._caProdutos('cereal'), ..._caProdutos('proteina')];
const _caInfoProduto = key => _caTodosProdutos().find(p => p.key === key) || { key, nome: key, unidade: '' };

function _caMontarPagina() {
  if (document.getElementById('page-consumo-alimentar')) return;
  const ancora = document.getElementById('page-cardapio-diario');
  if (!ancora) return;
  ancora.insertAdjacentHTML('afterend', `
  <div class="page" id="page-consumo-alimentar">
    <div class="page-header"><h2>🍽️ Consumo Alimentar</h2></div>
    <div class="page-sub" style="margin-bottom:14px;">Novo método de cálculo dos suprimentos (Cereais e Proteínas): consumo por refeição, cardápio semanal e baixa de estoque por dia.</div>
    <div class="cardapio-card">
      <div style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap;">
        <div style="min-width:240px;"><label class="form-label">Casa</label>
          <select id="ca-house" class="form-select" onchange="caTrocarCasa()"><option value="">Selecione a casa</option></select></div>
        <div id="ca-info-casa" style="font-size:13px;color:var(--text-muted);"></div>
      </div>
    </div>
    <div id="ca-conteudo" style="display:none;">
      <div id="ca-abas" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;"></div>
      <div id="ca-aba"></div>
    </div>
  </div>`);
}

async function loadConsumoAlimentar() {
  _caMontarPagina();
  if (!_caPermitido()) { showToast('⛔ Sem permissão para Consumo Alimentar.'); return; }
  const sel = document.getElementById('ca-house');
  if (!sel) return;
  if (sel.options.length <= 1) {
    const snap = await db.collection('houses').get();
    const nomes = snap.docs.map(d => d.data().name || d.data().nome).filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    sel.innerHTML = '<option value="">Selecione a casa</option>' + nomes.map(n => `<option value="${_caEsc(n)}">${_caEsc(n)}</option>`).join('');
  }
  if (_ca.house) sel.value = _ca.house;
}
window.loadConsumoAlimentar = loadConsumoAlimentar;

async function caTrocarCasa() {
  const house = document.getElementById('ca-house').value;
  _ca.house = house;
  const cont = document.getElementById('ca-conteudo');
  if (!house) { cont.style.display = 'none'; document.getElementById('ca-info-casa').textContent = ''; return; }
  const [hs, ps] = await Promise.all([
    db.collection('houses').where('name', '==', house).get(),
    db.collection('consumo_planos').where('house', '==', house).get(),
  ]);
  _ca.pessoasCasa = hs.empty ? 0 : (hs.docs[0].data().currentPeople || 0);
  const d = ps.empty ? null : ps.docs[0];
  _ca.planoId = d ? d.id : null;
  const p = d ? d.data() : {};
  _ca.plano = { pessoasBase: p.pessoasBase || _ca.pessoasCasa || 0, diasMes: p.diasMes || 30, itens: p.itens || {}, cardapio: p.cardapio || {} };
  document.getElementById('ca-info-casa').innerHTML = `👥 Pessoas cadastradas na casa: <b>${_ca.pessoasCasa}</b>`;
  cont.style.display = '';
  caAba(_ca.aba);
}
window.caTrocarCasa = caTrocarCasa;

function caAba(aba) {
  _ca.aba = aba;
  const abas = [['consumo', '📋 Consumo por refeição'], ['cardapio', '🍗 Cardápio semanal de proteínas'], ['baixa', '📦 Baixa de estoque'], ['compras', '🛒 Compras sugeridas'], ['auditoria', '🔍 Auditoria'], ['historico', '📈 Previsto × Real']];
  document.getElementById('ca-abas').innerHTML = abas.map(([k, n]) =>
    `<button class="btn ${k === aba ? 'btn-primary' : 'btn-outline'} btn-sm" onclick="caAba('${k}')">${n}</button>`).join('');
  ({ consumo: _caRenderConsumo, cardapio: _caRenderCardapio, baixa: _caRenderBaixa, compras: _caRenderCompras, auditoria: _caRenderAuditoria, historico: _caRenderHistorico })[aba]();
}
window.caAba = caAba;

// ── Totais ───────────────────────────────────────────────────────────────
// Cereal: soma das 6 refeições. Proteína: a partir do cardápio semanal (média por dia da semana).
function _caConsumoDia(dia /* 'seg'… */, fator = 1) {
  const out = {};
  const pl = _ca.plano;
  Object.entries(pl.itens || {}).forEach(([key, m]) => {
    const q = _CA_REFEICOES.reduce((s, r) => s + _caNum(m?.[r.k]), 0);
    if (q > 0) out[key] = q * fator;
  });
  const cd = pl.cardapio?.[dia] || {};
  _CA_REFEICOES.forEach(r => {
    const c = cd[r.k];
    if (c && c.key && _caNum(c.qtd) > 0) out[c.key] = (out[c.key] || 0) + _caNum(c.qtd) * fator;
  });
  return out;
}

// ── Aba 1: consumo por refeição ──────────────────────────────────────────
function _caRenderConsumo() {
  const pl = _ca.plano, th = 'padding:8px 6px;font-size:11px;text-transform:uppercase;color:var(--text-muted);text-align:center;border-bottom:1px solid var(--border);';
  const cab = _CA_REFEICOES.map(r => `<th style="${th}">${r.n}<br><span style="text-transform:none;">${r.h}</span></th>`).join('');
  const linhasCereal = _caProdutos('cereal').map(p => {
    const m = pl.itens[p.key] || {};
    const cels = _CA_REFEICOES.map(r => `<td style="padding:3px;"><input class="cardapio-input" style="width:76px;" inputmode="decimal" data-key="${p.key}" data-ref="${r.k}" value="${m[r.k] ? _caEsc(m[r.k]) : ''}" oninput="caRecalcLinha('${p.key}')"></td>`).join('');
    return `<tr><td style="padding:5px 8px;font-size:13px;">${_caEsc(p.nome)}</td><td style="text-align:center;font-size:12px;color:var(--text-muted);">${_caEsc(p.unidade)}</td>${cels}
      <td id="ca-d-${p.key}" style="text-align:right;font-weight:700;padding:0 8px;"></td><td id="ca-m-${p.key}" style="text-align:right;font-weight:700;padding:0 8px;"></td></tr>`;
  }).join('');

  // proteínas: derivado do cardápio semanal (média diária por refeição)
  const dias = pl.diasMes || 30;
  const prot = {};
  _CA_DIAS.forEach(d => _CA_REFEICOES.forEach(r => {
    const c = pl.cardapio?.[d.k]?.[r.k];
    if (c && c.key && _caNum(c.qtd) > 0) { (prot[c.key] = prot[c.key] || {})[r.k] = (prot[c.key][r.k] || 0) + _caNum(c.qtd); }
  }));
  const linhasProt = Object.keys(prot).sort((a, b) => _caInfoProduto(a).nome.localeCompare(_caInfoProduto(b).nome, 'pt-BR')).map(key => {
    const p = _caInfoProduto(key), semana = _CA_REFEICOES.reduce((s, r) => s + (prot[key][r.k] || 0), 0);
    return `<tr><td style="padding:5px 8px;font-size:13px;">${_caEsc(p.nome)}</td><td style="text-align:center;font-size:12px;color:var(--text-muted);">${_caEsc(p.unidade)}</td>
      ${_CA_REFEICOES.map(r => `<td style="text-align:center;font-size:12.5px;">${prot[key][r.k] ? _caFmt(prot[key][r.k] / 7) : ''}</td>`).join('')}
      <td style="text-align:right;font-weight:700;padding:0 8px;">${_caFmt(semana / 7)}</td><td style="text-align:right;font-weight:700;padding:0 8px;">${_caFmt(semana / 7 * dias)}</td></tr>`;
  }).join('');

  document.getElementById('ca-aba').innerHTML = `
    <div class="cardapio-card">
      <div style="display:flex;gap:18px;align-items:flex-end;flex-wrap:wrap;margin-bottom:10px;">
        <div><label class="form-label">Pessoas (base destas quantidades)</label><input class="cardapio-input" style="width:110px;" id="ca-pessoas-base" inputmode="numeric" value="${pl.pessoasBase || ''}"></div>
        <div><label class="form-label">Dias do mês (total mensal)</label><input class="cardapio-input" style="width:110px;" id="ca-dias-mes" inputmode="numeric" value="${pl.diasMes || 30}" oninput="caRecalcTudo()"></div>
        <button class="btn btn-primary" style="width:auto;" onclick="caSalvarPlano()">💾 Salvar</button>
      </div>
      <div style="font-size:12px;color:var(--text-muted);">Digite a quantidade que a casa usa em <b>cada refeição</b> (na unidade do item). O total diário e o mensal são calculados.</div>
    </div>
    <div class="cardapio-card" style="overflow-x:auto;"><h3>🌾 Cereais</h3>
      <table style="width:100%;border-collapse:collapse;"><thead><tr><th style="${th}text-align:left;">Item</th><th style="${th}">Unid.</th>${cab}<th style="${th}">Total diário</th><th style="${th}">Total mensal</th></tr></thead><tbody>${linhasCereal}</tbody></table></div>
    <div class="cardapio-card" style="overflow-x:auto;"><h3>🥩 Proteínas <span style="font-size:12px;font-weight:400;color:var(--text-muted);">(calculadas pelo cardápio semanal — média por dia)</span></h3>
      ${linhasProt ? `<table style="width:100%;border-collapse:collapse;"><thead><tr><th style="${th}text-align:left;">Item</th><th style="${th}">Unid.</th>${cab}<th style="${th}">Total diário</th><th style="${th}">Total mensal</th></tr></thead><tbody>${linhasProt}</tbody></table>`
        : '<div class="cardapio-empty">Monte o cardápio semanal na aba "🍗 Cardápio semanal de proteínas".</div>'}</div>`;
  caRecalcTudo();
}

function caRecalcLinha(key) {
  const dias = _caNum(document.getElementById('ca-dias-mes')?.value) || 30;
  let total = 0;
  document.querySelectorAll(`#ca-aba input[data-key="${key}"]`).forEach(i => { total += _caNum(i.value); });
  const d = document.getElementById('ca-d-' + key), m = document.getElementById('ca-m-' + key);
  if (d) d.textContent = total ? _caFmt(total) : '';
  if (m) m.textContent = total ? _caFmt(total * dias) : '';
}
function caRecalcTudo() { _caProdutos('cereal').forEach(p => caRecalcLinha(p.key)); }
window.caRecalcLinha = caRecalcLinha; window.caRecalcTudo = caRecalcTudo;

async function _caGravarPlano() {
  const pl = _ca.plano;
  const dados = { house: _ca.house, pessoasBase: pl.pessoasBase || null, diasMes: pl.diasMes || 30, itens: pl.itens, cardapio: pl.cardapio,
    atualizadoPor: currentUserData?.name || '', atualizadoEm: new Date().toISOString() };
  if (_ca.planoId) await db.collection('consumo_planos').doc(_ca.planoId).update(dados);
  else { const r = await db.collection('consumo_planos').add(dados); _ca.planoId = r.id; }
}

async function caSalvarPlano() {
  if (!_caPermitido()) return;
  const itens = {};
  document.querySelectorAll('#ca-aba input[data-key]').forEach(i => {
    const q = _caNum(i.value);
    if (q > 0) (itens[i.dataset.key] = itens[i.dataset.key] || {})[i.dataset.ref] = q;
  });
  _ca.plano.itens = itens;
  _ca.plano.pessoasBase = parseInt(document.getElementById('ca-pessoas-base').value) || 0;
  _ca.plano.diasMes = parseInt(document.getElementById('ca-dias-mes').value) || 30;
  try { await _caGravarPlano(); showToast('✅ Consumo da casa salvo.'); _caRenderConsumo(); }
  catch (e) { console.error(e); showToast('❌ Erro ao salvar: ' + e.message); }
}
window.caSalvarPlano = caSalvarPlano;

// ── Aba 2: cardápio semanal de proteínas ────────────────────────────────
function _caRenderCardapio() {
  const prots = _caProdutos('proteina');
  const opts = sel => '<option value="">—</option>' + prots.map(p => `<option value="${p.key}" ${p.key === sel ? 'selected' : ''}>${_caEsc(p.nome)} (${_caEsc(p.unidade)})</option>`).join('');
  const th = 'padding:8px 6px;font-size:12px;text-align:center;border-bottom:1px solid var(--border);background:var(--bg);';
  const linhas = _CA_REFEICOES.map(r => `<tr><td style="padding:6px 8px;font-size:12.5px;font-weight:700;white-space:nowrap;">${r.n}<br><span style="font-weight:400;color:var(--text-muted);">${r.h}</span></td>
    ${_CA_DIAS.map(d => { const c = _ca.plano.cardapio?.[d.k]?.[r.k] || {};
      return `<td style="padding:4px;border-left:1px solid var(--border);min-width:150px;"><select class="cardapio-select" style="width:100%;" data-dia="${d.k}" data-ref="${r.k}" data-campo="key">${opts(c.key)}</select>
        <input class="cardapio-input" style="width:100%;margin-top:3px;text-align:right;" placeholder="Qtd." inputmode="decimal" data-dia="${d.k}" data-ref="${r.k}" data-campo="qtd" value="${c.qtd ? _caEsc(c.qtd) : ''}"></td>`; }).join('')}</tr>`).join('');
  document.getElementById('ca-aba').innerHTML = `
    <div class="cardapio-card" style="overflow-x:auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:10px;">
        <div style="font-size:12px;color:var(--text-muted);">Em cada refeição, escolha a proteína e a quantidade que será <b>baixada do estoque</b> (na unidade do item, ex.: Kg).</div>
        <div style="display:flex;gap:8px;"><button class="btn btn-outline btn-sm" onclick="caCopiarCardapio()">📋 Copiar de outra casa</button><button class="btn btn-primary btn-sm" onclick="caSalvarCardapio()">💾 Salvar cardápio</button></div>
      </div>
      <table style="width:100%;border-collapse:collapse;"><thead><tr><th style="${th}">Refeição</th>${_CA_DIAS.map(d => `<th style="${th}">${d.n}</th>`).join('')}</tr></thead><tbody>${linhas}</tbody></table>
    </div>`;
}

function _caLerCardapioTela() {
  const cd = {};
  document.querySelectorAll('#ca-aba [data-dia]').forEach(el => {
    const c = ((cd[el.dataset.dia] = cd[el.dataset.dia] || {})[el.dataset.ref] = cd[el.dataset.dia][el.dataset.ref] || {});
    c[el.dataset.campo] = el.dataset.campo === 'qtd' ? _caNum(el.value) : el.value;
  });
  _CA_DIAS.forEach(d => _CA_REFEICOES.forEach(r => { const c = cd[d.k]?.[r.k]; if (c && (!c.key || !(c.qtd > 0))) delete cd[d.k][r.k]; }));
  return cd;
}

async function caSalvarCardapio() {
  if (!_caPermitido()) return;
  _ca.plano.cardapio = _caLerCardapioTela();
  try { await _caGravarPlano(); showToast('✅ Cardápio semanal salvo.'); }
  catch (e) { console.error(e); showToast('❌ Erro ao salvar: ' + e.message); }
}
window.caSalvarCardapio = caSalvarCardapio;

async function caCopiarCardapio() {
  const snap = await db.collection('consumo_planos').get();
  const outras = snap.docs.filter(d => d.data().house !== _ca.house);
  if (!outras.length) { showToast('Nenhuma outra casa tem cardápio salvo ainda.'); return; }
  const lista = outras.map((d, i) => `${i + 1} — ${d.data().house}`).join('\n');
  const r = prompt(`Copiar o cardápio (e o consumo por refeição) de qual casa?\n\n${lista}\n\nDigite o número:`);
  const d = outras[(parseInt(r) || 0) - 1];
  if (!d) return;
  if (!confirm(`Substituir o cardápio e o consumo por refeição desta tela pelos de "${d.data().house}"? (Só salva quando você clicar em Salvar.)`)) return;
  _ca.plano.cardapio = JSON.parse(JSON.stringify(d.data().cardapio || {}));
  _ca.plano.itens = JSON.parse(JSON.stringify(d.data().itens || {}));
  _caRenderCardapio();
  showToast('📋 Copiado. Ajuste o que precisar e clique em Salvar cardápio (e Salvar em Consumo por refeição).');
}
window.caCopiarCardapio = caCopiarCardapio;

// ── Aba 3: baixa de estoque ─────────────────────────────────────────────
async function _caCarregarBaixas() {
  const snap = await db.collection('consumo_baixas').where('house', '==', _ca.house).get();
  _ca.baixas = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.data).localeCompare(String(a.data)));
}

async function _caRenderBaixa() {
  document.getElementById('ca-aba').innerHTML = '<div class="cardapio-card">Carregando…</div>';
  await _caCarregarBaixas();
  const feitos = new Set(_ca.baixas.map(b => String(b.data).slice(0, 10)));
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const ultima = _ca.baixas.length ? _caDiaDe(String(_ca.baixas[0].data).slice(0, 10)) : null;
  const dias = [];
  if (ultima) for (let d = new Date(ultima.getTime() + 86400000); d <= hoje && dias.length < 31; d = new Date(d.getTime() + 86400000)) dias.push(_caIso(d));
  else dias.push(_caIso(hoje));
  _ca.dias = dias.map(iso => _caNovoDia(iso)).filter(Boolean);
  _caDesenharBaixa(feitos);
}

function _caNovoDia(iso) {
  const pl = _ca.plano, base = pl.pessoasBase || 0;
  const dia = _CA_DIA_POR_GETDAY[_caDiaDe(iso).getDay()];
  const previsto = _caConsumoDia(dia, 1);
  return { iso, dia, pessoas: base || _ca.pessoasCasa || 0, previsto, qtd: { ...previsto }, editado: false, marcado: true, aberto: false };
}

function _caDesenharBaixa(feitos) {
  const pl = _ca.plano;
  const vazio = !Object.keys(pl.itens || {}).length && !Object.keys(pl.cardapio || {}).length;
  const aviso = vazio ? `<div class="cardapio-alert-pop" style="margin-bottom:12px;">⚠️ Esta casa ainda não tem consumo por refeição nem cardápio salvo — cadastre nas abas anteriores antes de dar baixa.</div>` : '';
  const cards = _ca.dias.map((d, i) => {
    const itens = Object.entries(d.qtd).filter(([, q]) => q > 0);
    const wd = _CA_DIAS.find(x => x.k === d.dia)?.n || d.dia;
    const linhas = d.aberto ? `<table style="width:100%;font-size:12.5px;border-collapse:collapse;margin-top:8px;">${itens.map(([k, q]) => { const p = _caInfoProduto(k);
      return `<tr><td style="padding:3px 0;">${_caEsc(p.nome)}</td><td style="width:110px;"><input class="cardapio-input" style="width:100px;" inputmode="decimal" value="${_caEsc(_caFmt(q))}" onchange="caEditarQtd(${i},'${k}',this.value)"></td><td style="width:40px;color:var(--text-muted);">${_caEsc(p.unidade)}</td></tr>`; }).join('')}</table>`
      : `<div style="font-size:12px;color:var(--text-muted);margin-top:6px;">${itens.length ? itens.map(([k, q]) => `${_caEsc(_caInfoProduto(k).nome)}: <b>${_caFmt(q)}</b>`).join(' · ') : 'Nenhum consumo previsto para este dia.'}</div>`;
    return `<div class="cardapio-card" style="padding:12px 16px;margin-bottom:10px;${d.marcado ? '' : 'opacity:.6;'}">
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
        <label style="display:flex;align-items:center;gap:8px;font-weight:700;"><input type="checkbox" ${d.marcado ? 'checked' : ''} onchange="caMarcarDia(${i},this.checked)"> ${_caDataBR(d.iso)} — ${wd}</label>
        <label style="font-size:12px;color:var(--text-muted);">Pessoas <input class="cardapio-input" style="width:70px;" inputmode="numeric" value="${d.pessoas}" onchange="caPessoasDia(${i},this.value)"></label>
        ${d.editado ? '<span style="font-size:11px;font-weight:700;color:var(--warn,#d97706);">✏️ EDITADO</span>' : ''}
        <button class="btn btn-outline btn-sm" onclick="caAbrirDia(${i})">${d.aberto ? 'Fechar' : '✏️ Editar itens'}</button>
        <button class="btn btn-outline btn-sm" style="margin-left:auto;" onclick="caRemoverDia(${i})">✕</button>
      </div>${linhas}</div>`;
  }).join('');
  const ultimos = _ca.baixas.slice(0, 5).map(b => _caDataBR(b.data)).join(', ');
  document.getElementById('ca-aba').innerHTML = `
    ${aviso}
    <div class="cardapio-card">
      <div style="font-size:13px;margin-bottom:8px;">${_ca.baixas.length ? `Última baixa: <b>${_caDataBR(_ca.baixas[0].data)}</b>. Abaixo estão os dias pendentes desde então.` : 'Ainda não há baixas desta casa. Começa pelo dia de hoje; use "Adicionar dia" para outros.'}</div>
      <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;">
        <div><label class="form-label">Adicionar dia</label><input type="date" class="cardapio-input" id="ca-add-dia" style="width:160px;"></div>
        <button class="btn btn-outline btn-sm" onclick="caAdicionarDia()">+ Adicionar</button>
      </div>
    </div>
    ${cards || '<div class="cardapio-card cardapio-empty">Nenhum dia pendente — a casa está em dia. 🎉</div>'}
    ${_ca.dias.length ? `<div class="cardapio-actions"><button class="btn btn-primary" style="width:auto;" onclick="caConfirmarBaixa()">📦 Dar baixa nos dias marcados</button></div>` : ''}
    ${ultimos ? `<div style="font-size:11.5px;color:var(--text-muted);">Últimas baixas: ${ultimos}</div>` : ''}`;
  _ca._feitos = feitos;
}

function caMarcarDia(i, v) { _ca.dias[i].marcado = v; _caDesenharBaixa(_ca._feitos); }
function caAbrirDia(i) { _ca.dias[i].aberto = !_ca.dias[i].aberto; _caDesenharBaixa(_ca._feitos); }
function caRemoverDia(i) { _ca.dias.splice(i, 1); _caDesenharBaixa(_ca._feitos); }
function caEditarQtd(i, key, v) { const d = _ca.dias[i]; d.qtd[key] = _caNum(v); d.editado = true; _caDesenharBaixa(_ca._feitos); }
function caPessoasDia(i, v) {
  const d = _ca.dias[i], base = _ca.plano.pessoasBase || 0, n = parseInt(v) || 0;
  d.pessoas = n; d.editado = base > 0 && n !== base;
  if (base > 0) d.qtd = Object.fromEntries(Object.entries(_caConsumoDia(d.dia, 1)).map(([k, q]) => [k, Math.round(q * n / base * 1000) / 1000]));
  _caDesenharBaixa(_ca._feitos);
}
function caAdicionarDia() {
  const iso = document.getElementById('ca-add-dia').value;
  if (!iso) return;
  if (_ca._feitos?.has(iso)) { showToast('⚠️ Esse dia já foi baixado.'); return; }
  if (_ca.dias.some(d => d.iso === iso)) { showToast('Esse dia já está na lista.'); return; }
  _ca.dias.push(_caNovoDia(iso)); _ca.dias.sort((a, b) => a.iso.localeCompare(b.iso));
  _caDesenharBaixa(_ca._feitos);
}
Object.assign(window, { caMarcarDia, caAbrirDia, caRemoverDia, caEditarQtd, caPessoasDia, caAdicionarDia });

async function caConfirmarBaixa() {
  if (!_caPermitido()) return;
  const dias = _ca.dias.filter(d => d.marcado);
  if (!dias.length) { showToast('Marque pelo menos um dia.'); return; }
  const vazios = dias.filter(d => !Object.values(d.qtd).some(q => q > 0));
  if (vazios.length) { showToast(`⚠️ Sem quantidade para dar baixa em ${vazios.map(d => _caDataBR(d.iso)).join(', ')}.`); return; }
  const tot = {};
  dias.forEach(d => Object.entries(d.qtd).forEach(([k, q]) => { tot[k] = (tot[k] || 0) + q; }));
  const resumo = Object.entries(tot).filter(([, q]) => q > 0).map(([k, q]) => `• ${_caInfoProduto(k).nome}: ${_caFmt(q)} ${_caInfoProduto(k).unidade}`).join('\n');
  if (!confirm(`Dar baixa no estoque de "${_ca.house}" referente a ${dias.length} dia(s): ${dias.map(d => _caDataBR(d.iso)).join(', ')}?\n\n${resumo}`)) return;

  const sigla = typeof siglaCasa === 'function' ? siglaCasa(_ca.house) : 'XX';
  let ok = 0;
  try {
    for (const d of dias) {
      const jaTem = await db.collection('consumo_baixas').where('house', '==', _ca.house).where('data', '==', d.iso).get();
      if (!jaTem.empty) { showToast(`⚠️ ${_caDataBR(d.iso)} já tinha sido baixado — ignorado.`); continue; }
      const entradas = Object.entries(d.qtd).filter(([, q]) => q > 0).map(([k, q]) => {
        const p = _caInfoProduto(k);
        return { catKey: p.catKey || k.split('__')[0], prodId: p.prodId || k.split('__')[1], prodNome: p.nome, unidade: p.unidade, qty: Math.round(q * 1000) / 1000 };
      });
      const dateStr = d.iso.replace(/-/g, '');
      const movs = await db.collection('movements').where('dateStr', '==', dateStr).get();
      const code = `OB-${sigla}-SAI-CONSUMO-${dateStr}-${String(movs.size + 1).padStart(3, '0')}`;
      const mv = await db.collection('movements').add({
        code, house: _ca.house, type: 'saida', date: d.iso, dateStr,
        obs: `Baixa de Consumo Alimentar — ${_caDataBR(d.iso)}${d.editado ? ` (editado: ${d.pessoas} pessoas)` : ''}`, isDonation: false, items: entradas,
        registeredBy: currentUserData?.name || '—', registeredUid: currentUser?.uid || null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      const prev = {}, real = {};
      Object.entries(d.previsto).forEach(([k, q]) => { const p = _caInfoProduto(k); prev[k] = { nome: p.nome, unidade: p.unidade, qtd: Math.round(q * 1000) / 1000 }; });
      entradas.forEach(e => { const k = `${e.catKey}__${e.prodId}`; real[k] = { nome: e.prodNome, unidade: e.unidade, qtd: e.qty }; });
      await db.collection('consumo_baixas').add({
        house: _ca.house, data: d.iso, pessoas: d.pessoas, pessoasPadrao: _ca.plano.pessoasBase || null,
        previsto: prev, real, editado: !!d.editado, movementId: mv.id,
        obs: d.editado ? 'Lançamento editado (evento/pessoas diferentes)' : '',
        registradoPor: currentUserData?.name || '—', registradoUid: currentUser?.uid || null,
      });
      ok++;
    }
    showToast(`✅ Baixa feita em ${ok} dia(s).`);
  } catch (e) { console.error('caConfirmarBaixa', e); showToast('❌ Erro na baixa: ' + e.message); }
  _caRenderBaixa();
}
window.caConfirmarBaixa = caConfirmarBaixa;

// ── Aba 4: previsto × real ──────────────────────────────────────────────
async function _caRenderHistorico() {
  document.getElementById('ca-aba').innerHTML = '<div class="cardapio-card">Carregando…</div>';
  await _caCarregarBaixas();
  const soma = o => Object.values(o || {}).reduce((s, x) => s + (Number(x.qtd) || 0), 0);
  const linhas = _ca.baixas.map(b => {
    const p = soma(b.previsto), r = soma(b.real), pct = p > 0 ? (r - p) / p * 100 : 0;
    const cor = Math.abs(pct) < 5 ? 'var(--ok)' : Math.abs(pct) < 15 ? 'var(--warn,#d97706)' : 'var(--danger)';
    return `<tr><td style="padding:7px 8px;">${_caDataBR(b.data)}</td><td style="text-align:right;">${b.pessoas ?? '—'}${b.pessoasPadrao ? ` <span style="color:var(--text-muted);font-size:11px;">/ ${b.pessoasPadrao}</span>` : ''}</td>
      <td style="text-align:right;">${_caFmt(p)}</td><td style="text-align:right;">${_caFmt(r)}</td><td style="text-align:right;font-weight:700;color:${cor};">${pct > 0 ? '+' : ''}${_caFmt(pct, 1)}%</td>
      <td style="text-align:center;">${b.editado ? '✏️' : ''}</td><td style="font-size:11.5px;color:var(--text-muted);">${_caEsc(b.registradoPor || '')}</td></tr>`;
  }).join('');
  const th = 'padding:8px;font-size:11px;text-transform:uppercase;color:var(--text-muted);border-bottom:1px solid var(--border);';
  document.getElementById('ca-aba').innerHTML = `<div class="cardapio-card" style="overflow-x:auto;">
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">Cada baixa guarda o consumo <b>previsto</b> (plano da casa) e o <b>real</b> lançado (com pessoas/itens editados). A comparação com a contagem física (auditoria) entra na próxima etapa.</div>
    ${linhas ? `<table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr><th style="${th}text-align:left;">Dia</th><th style="${th}text-align:right;">Pessoas</th><th style="${th}text-align:right;">Previsto (soma)</th><th style="${th}text-align:right;">Lançado (soma)</th><th style="${th}text-align:right;">Diferença</th><th style="${th}text-align:center;">Editado</th><th style="${th}">Por</th></tr></thead><tbody>${linhas}</tbody></table>` : '<div class="cardapio-empty">Nenhuma baixa registrada para esta casa ainda.</div>'}</div>` + await _caHtmlAuditorias();
}
