// ─────────────────────────────────────────────────────────────────────────
// 33-rotina-equipe.js — Rotina semanal da equipe
//   • Painel do Coordenador (page-coord-rotina): semana da equipe, modelo semanal,
//     "meu dia", produtividade e caixa de pedidos extras / sugestões.
//   • Minha Rotina (page-minha-rotina): o colaborador vinculado vê a semana, marca
//     as atividades do dia, sugere melhorias e pede atividade extra.
// Equipe = coord_ferias_pessoas (mesmo vínculo ao login do Planejamento de Férias).
// Tabelas/funções: migration 055_coord_rotina.sql. Sem IA.
// ─────────────────────────────────────────────────────────────────────────

const _ROT_EXP_INI = '08:00', _ROT_EXP_FIM = '17:00';
const _ROT_DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const _ROT_ORDEM = [1, 2, 3, 4, 5, 6, 0];          // segunda → domingo
const _rot = {
  pessoas: [], minha: null, gestao: false, erro: '',
  aba: 'semana', pessoaId: null, seg: null,
  itens: [], modelo: [], pedidos: [], sugestoes: [],
  periodo: 'semana', prodItens: [], prodPessoaId: '',
  // colaborador
  mAba: 'dia', mData: null, mItens: [], mPedidos: [], mSugs: [],
};

// ── utilidades de data/hora (texto AAAA-MM-DD e HH:MM, horário local) ───
const _rYmd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const _rData = s => { const [a, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(a, m - 1, d); };
const _rBR = s => { const [a, m, d] = String(s).slice(0, 10).split('-'); return d + '/' + m + '/' + a; };
const _rBRcurto = s => { const [, m, d] = String(s).slice(0, 10).split('-'); return d + '/' + m; };
const _rSoma = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const _rSegunda = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const _rMin = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const _rDur = (i, f) => Math.max(0, _rMin(f) - _rMin(i));
const _rFmtMin = n => n >= 60 ? Math.floor(n / 60) + 'h' + (n % 60 ? String(n % 60).padStart(2, '0') : '') : n + 'min';
const _rEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const _rHoje = () => _rYmd(new Date());
const _rEhExtra = (data, ini, fim) => { const w = _rData(data).getDay(); return w === 0 || w === 6 || ini < _ROT_EXP_INI || fim > _ROT_EXP_FIM; };
const _rPct = (a, b) => b ? Math.round(a * 100 / b) : 0;
const _rNomePessoa = id => (_rot.pessoas.find(p => p.id === id) || {}).nome || '—';
const _rNorm = x => ({ ...x, data: String(x.data || '').slice(0, 10) });

function _rEstilo() {
  if (document.getElementById('rot-estilo')) return;
  const st = document.createElement('style'); st.id = 'rot-estilo';
  st.textContent = `
  .rot-abas{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}
  .rot-aba{border:1px solid var(--border);background:var(--surface,transparent);color:var(--text);padding:7px 12px;border-radius:999px;font-size:13px;font-weight:600;cursor:pointer}
  .rot-aba.ativa{background:var(--lumen);color:#fff;border-color:var(--lumen)}
  .rot-badge{display:inline-block;background:var(--danger,#dc2626);color:#fff;border-radius:999px;font-size:11px;padding:0 6px;margin-left:4px}
  .rot-barra{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
  .rot-grade{display:grid;grid-template-columns:repeat(7,minmax(130px,1fr));gap:8px;overflow-x:auto}
  .rot-col{border:1px solid var(--border);border-radius:10px;padding:8px;min-width:130px;background:var(--surface,transparent)}
  .rot-col h4{margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted)}
  .rot-col.hoje{border-color:var(--lumen);box-shadow:0 0 0 1px var(--lumen)}
  .rot-it{border-radius:8px;padding:5px 7px;margin-bottom:5px;font-size:12px;background:var(--lumen-lt,rgba(0,0,0,.05));line-height:1.3}
  .rot-it.ok{background:rgba(22,163,74,.15)} .rot-it.ok b{text-decoration:line-through}
  .rot-it.extra{border-left:3px solid #d97706} .rot-it.canc{opacity:.45;text-decoration:line-through}
  .rot-it small{color:var(--text-muted)}
  .rot-lista .rot-linha{display:flex;gap:10px;align-items:center;padding:9px 12px;border-bottom:1px solid var(--border)}
  .rot-lista .rot-linha.ok{background:rgba(22,163,74,.10)} .rot-lista .rot-linha.ok .rot-nome{text-decoration:line-through;color:var(--text-muted)}
  .rot-lista input[type=checkbox]{width:20px;height:20px}
  .rot-hora{min-width:96px;font-variant-numeric:tabular-nums;color:var(--text-muted);font-size:13px}
  .rot-nome{flex:1;font-weight:600}
  .rot-prog{height:10px;background:var(--border);border-radius:999px;overflow:hidden}
  .rot-prog>div{height:100%;background:var(--ok,#16a34a)}
  .rot-form{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin:10px 0}
  .rot-form label{font-size:11px;color:var(--text-muted);display:flex;flex-direction:column;gap:3px}
  .rot-form input,.rot-form select,.rot-form textarea{padding:6px 8px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);font-size:13px}
  .rot-tab{width:100%;border-collapse:collapse;font-size:13px} .rot-tab th,.rot-tab td{padding:7px 8px;border-bottom:1px solid var(--border);text-align:left}
  .rot-tab td.n,.rot-tab th.n{text-align:right}
  .rot-card{border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin-bottom:10px}
  `;
  document.head.appendChild(st);
}

// ── Carga básica: equipe e "quem sou eu" ────────────────────────────────
async function _rotCarregarBase() {
  const papel = (currentUserData && currentUserData.role) || '';
  _rot.gestao = ['admin', 'diretor', 'gerente', 'coordenador'].includes(papel);
  const ps = await db.collection('coord_ferias_pessoas').get();
  _rot.pessoas = ps.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || String(a.nome).localeCompare(String(b.nome)));
  const uid = currentUser && currentUser.uid;
  _rot.minha = uid ? (_rot.pessoas.find(p => p.userId === uid) || null) : null;
  if (!_rot.pessoaId || !_rot.pessoas.some(p => p.id === _rot.pessoaId)) _rot.pessoaId = (_rot.minha || _rot.pessoas[0] || {}).id || null;
}

// Gera (a partir do modelo) e carrega os itens de uma semana de uma pessoa.
// Semanas passadas não são regeradas, para não mudar o histórico.
async function _rotItensSemana(pessoaId, seg) {
  const hoje = _rYmd(_rSegunda(new Date()));
  if (_rYmd(seg) >= hoje) {
    try { const { error } = await window._sb.rpc('rotina_gerar_semana', { p_pessoa: pessoaId, p_segunda: _rYmd(seg) }); if (error) console.warn('rotina_gerar_semana', error.message); }
    catch (e) { console.warn('rotina_gerar_semana', e); }
  }
  const snap = await db.collection('coord_rotina_itens').where('pessoaId', '==', pessoaId)
    .where('data', '>=', _rYmd(seg)).where('data', '<=', _rYmd(_rSoma(seg, 6))).get();
  return snap.docs.map(d => _rNorm({ id: d.id, ...d.data() }))
    .sort((a, b) => a.data.localeCompare(b.data) || String(a.inicio).localeCompare(String(b.inicio)));
}

// ═══════════════════════════════════════════════════════════════════════
//  PAINEL DO COORDENADOR
// ═══════════════════════════════════════════════════════════════════════
async function initCoordRotina() {
  _rEstilo();
  const raiz = document.getElementById('rot-root'); if (!raiz) return;
  raiz.innerHTML = '<div class="loading-state"><div class="spinner spinner-dark"></div>Carregando…</div>';
  try {
    await _rotCarregarBase();
    if (!_rot.seg) _rot.seg = _rSegunda(new Date());
    _rot.erro = '';
    await _rotCarregarAba();
  } catch (e) { console.error('initCoordRotina', e); _rot.erro = e.message || String(e); }
  _rotRender();
}
window.initCoordRotina = initCoordRotina;

async function _rotCarregarAba() {
  const a = _rot.aba;
  if (a === 'semana' || a === 'meudia') {
    const alvo = a === 'meudia' ? (_rot.minha && _rot.minha.id) : _rot.pessoaId;
    _rot.itens = alvo ? await _rotItensSemana(alvo, _rot.seg) : [];
  } else if (a === 'modelo') {
    _rot.modelo = _rot.pessoaId ? (await db.collection('coord_rotina_modelo').where('pessoaId', '==', _rot.pessoaId).get()).docs.map(d => ({ id: d.id, ...d.data() })) : [];
  } else if (a === 'prod') {
    const [de, ate] = _rotPeriodoProd();
    _rot.prodItens = (await db.collection('coord_rotina_itens').where('data', '>=', de).where('data', '<=', ate).get()).docs.map(d => _rNorm({ id: d.id, ...d.data() }));
  }
  await _rotContarInbox();
}

async function _rotContarInbox() {
  const [pe, su] = await Promise.all([
    db.collection('coord_rotina_pedidos').where('status', '==', 'pendente').get(),
    db.collection('coord_rotina_sugestoes').where('lida', '==', false).get(),
  ]);
  _rot.pedidos = pe.docs.map(d => _rNorm({ id: d.id, ...d.data() })).sort((a, b) => a.data.localeCompare(b.data));
  _rot.sugestoes = su.docs.map(d => ({ id: d.id, ...d.data() }));
}

function _rotPeriodoProd() {
  const hoje = new Date();
  if (_rot.periodo === 'semana') { const s = _rSegunda(hoje); return [_rYmd(s), _rYmd(_rSoma(s, 6))]; }
  if (_rot.periodo === 'mes') return [_rYmd(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), _rYmd(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0))];
  return [_rYmd(_rSoma(hoje, -89)), _rYmd(hoje)];   // últimos 90 dias
}

function _rotRender() {
  const raiz = document.getElementById('rot-root'); if (!raiz) return;
  if (_rot.erro) { raiz.innerHTML = `<div class="card"><div class="card-body"><b>Não foi possível carregar.</b><div style="margin-top:6px;color:var(--text-muted);font-size:13px">${_rEsc(_rot.erro)}<br>Se a mensagem fala de tabela inexistente, aplique a migração 055_coord_rotina.sql no Supabase.</div></div></div>`; return; }
  if (!_rot.gestao) { raiz.innerHTML = '<div class="card"><div class="card-body">Esta área é só do coordenador. Para ver a sua rotina, use <b>Minha Rotina</b>.</div></div>'; return; }
  if (!_rot.pessoas.length) { raiz.innerHTML = '<div class="card"><div class="card-body">Cadastre primeiro a equipe em <b>Planejamento de Férias</b> (inclua você e seus colaboradores e vincule cada um ao login). Eles aparecerão aqui.</div></div>'; return; }
  const pend = _rot.pedidos.length + _rot.sugestoes.length;
  const abas = [['semana', '📅 Semana da equipe'], ['modelo', '🧩 Modelo semanal'], ['meudia', '✅ Meu dia'], ['prod', '📊 Produtividade'], ['inbox', '📬 Pedidos e sugestões' + (pend ? `<span class="rot-badge">${pend}</span>` : '')]];
  let h = '<div class="rot-abas">' + abas.map(([k, t]) => `<button class="rot-aba ${_rot.aba === k ? 'ativa' : ''}" onclick="rotAba('${k}')">${t}</button>`).join('') + '</div>';
  if (_rot.aba === 'semana') h += _rotHtmlSemana();
  else if (_rot.aba === 'modelo') h += _rotHtmlModelo();
  else if (_rot.aba === 'meudia') h += _rotHtmlMeuDia();
  else if (_rot.aba === 'prod') h += _rotHtmlProd();
  else h += _rotHtmlInbox();
  raiz.innerHTML = h;
}
async function rotAba(k) { _rot.aba = k; await _rotRecarregar(); }
async function _rotRecarregar() {
  const raiz = document.getElementById('rot-root');
  try { await _rotCarregarAba(); _rot.erro = ''; } catch (e) { console.error(e); _rot.erro = e.message || String(e); }
  _rotRender();
}
window.rotAba = rotAba;

const _rotSelPessoa = (fn) => `<select onchange="${fn}(this.value)">${_rot.pessoas.map(p => `<option value="${p.id}" ${p.id === _rot.pessoaId ? 'selected' : ''}>${_rEsc(p.nome)}${p.userId ? '' : ' (sem login)'}</option>`).join('')}</select>`;
const _rotNavSemana = () => `<button class="btn btn-secondary btn-sm" onclick="rotSemana(-1)">‹</button>
  <b style="min-width:170px;text-align:center">${_rBR(_rYmd(_rot.seg))} a ${_rBR(_rYmd(_rSoma(_rot.seg, 6)))}</b>
  <button class="btn btn-secondary btn-sm" onclick="rotSemana(1)">›</button>
  <button class="btn btn-secondary btn-sm" onclick="rotSemana(0)">Esta semana</button>`;
async function rotSemana(d) { _rot.seg = d === 0 ? _rSegunda(new Date()) : _rSoma(_rot.seg, d * 7); await _rotRecarregar(); }
async function rotEscolherPessoa(id) { _rot.pessoaId = id; await _rotRecarregar(); }
window.rotSemana = rotSemana; window.rotEscolherPessoa = rotEscolherPessoa;

// ── Grade da semana (7 colunas) ─────────────────────────────────────────
function _rotGrade(itens, seg, acoes) {
  const hoje = _rHoje();
  return '<div class="rot-grade">' + _ROT_ORDEM.map((dow, i) => {
    const dia = _rYmd(_rSoma(seg, i));
    const doDia = itens.filter(x => x.data === dia);
    return `<div class="rot-col ${dia === hoje ? 'hoje' : ''}"><h4>${_ROT_DIAS[dow].slice(0, 3)} ${_rBRcurto(dia)}</h4>`
      + (doDia.map(x => `<div class="rot-it ${x.concluida ? 'ok' : ''} ${x.extra ? 'extra' : ''} ${x.cancelada ? 'canc' : ''}">
          <small>${_rEsc(x.inicio)}–${_rEsc(x.fim)}${x.extra ? ' · extra' : ''}${x.origem === 'extra' ? ' · pedido aprovado' : ''}</small><br><b>${_rEsc(x.atividade)}</b>
          ${acoes && !x.cancelada ? `<div style="margin-top:3px"><button class="btn btn-secondary btn-sm" style="padding:1px 6px;font-size:11px" onclick="rotRemoverItem('${x.id}')">🗑</button></div>` : ''}</div>`).join('') || '<small style="color:var(--text-muted)">—</small>')
      + '</div>';
  }).join('') + '</div>';
}

function _rotHtmlSemana() {
  const p = _rot.pessoas.find(x => x.id === _rot.pessoaId);
  let h = `<div class="rot-barra">${_rotSelPessoa('rotEscolherPessoa')} ${_rotNavSemana()}</div>`;
  h += _rotGrade(_rot.itens, _rot.seg, true);
  h += `<div class="card" style="margin-top:14px"><div class="card-body"><b>Ajuste só desta semana (${_rEsc(p ? p.nome : '')})</b>
    <div class="rot-form">
      <label>Dia<input type="date" id="rot-aj-data" value="${_rYmd(_rot.seg)}"></label>
      <label>Início<input type="time" id="rot-aj-ini" value="09:00"></label>
      <label>Fim<input type="time" id="rot-aj-fim" value="10:00"></label>
      <label style="flex:1;min-width:200px">Atividade<input type="text" id="rot-aj-ativ" placeholder="Ex.: Visita na Casa X"></label>
      <button class="btn btn-primary" onclick="rotAdicionarAjuste()">Adicionar</button>
    </div>
    <div style="font-size:12px;color:var(--text-muted)">Sábado, domingo e horários fora de ${_ROT_EXP_INI}–${_ROT_EXP_FIM} ficam marcados como <b>extra</b> e contam à parte na produtividade. Para mudar a rotina que se repete, use <b>Modelo semanal</b>.</div></div></div>`;
  return h;
}

async function rotAdicionarAjuste() {
  const data = document.getElementById('rot-aj-data').value, ini = document.getElementById('rot-aj-ini').value, fim = document.getElementById('rot-aj-fim').value;
  const ativ = document.getElementById('rot-aj-ativ').value.trim();
  if (!data || !ini || !fim || !ativ) { showToast('Preencha dia, início, fim e atividade.'); return; }
  if (fim <= ini) { showToast('O fim precisa ser depois do início.'); return; }
  const choque = _rot.itens.find(x => x.data === data && !x.cancelada && _rMin(x.inicio) < _rMin(fim) && _rMin(ini) < _rMin(x.fim));
  if (choque && !confirm(`Já existe "${choque.atividade}" (${choque.inicio}–${choque.fim}) nesse horário. Adicionar mesmo assim?`)) return;
  try {
    await db.collection('coord_rotina_itens').add({ pessoaId: _rot.pessoaId, data, inicio: ini, fim, atividade: ativ, origem: 'semana', extra: _rEhExtra(data, ini, fim), concluida: false, cancelada: false });
    showToast('✅ Atividade adicionada.'); await _rotRecarregar();
  } catch (e) { console.error(e); showToast('Erro: ' + e.message); }
}
async function rotRemoverItem(id) {
  const it = _rot.itens.find(x => x.id === id); if (!it) return;
  if (!confirm(`Tirar "${it.atividade}" de ${_rBR(it.data)}?${it.concluida ? '\nEla já estava concluída.' : ''}`)) return;
  try {
    if (it.origem === 'modelo') await db.collection('coord_rotina_itens').doc(id).update({ cancelada: true });   // soft: o modelo não recria
    else await db.collection('coord_rotina_itens').doc(id).delete();
    await _rotRecarregar();
  } catch (e) { console.error(e); showToast('Erro: ' + e.message); }
}
window.rotAdicionarAjuste = rotAdicionarAjuste; window.rotRemoverItem = rotRemoverItem;

// ── Modelo semanal ──────────────────────────────────────────────────────
function _rotHtmlModelo() {
  const p = _rot.pessoas.find(x => x.id === _rot.pessoaId);
  let h = `<div class="rot-barra">${_rotSelPessoa('rotEscolherPessoa')}<span style="font-size:12px;color:var(--text-muted)">A rotina que se repete toda semana. Vale para as semanas ainda não abertas; as já abertas não mudam sozinhas.</span></div>`;
  h += `<div class="card"><div class="card-body"><b>Adicionar ao modelo de ${_rEsc(p ? p.nome : '')}</b>
    <div class="rot-form">
      <label>Dias<select id="rot-m-dia"><option value="uteis">Segunda a sexta</option>${_ROT_ORDEM.map(d => `<option value="${d}">${_ROT_DIAS[d]}</option>`).join('')}</select></label>
      <label>Início<input type="time" id="rot-m-ini" value="08:00"></label>
      <label>Fim<input type="time" id="rot-m-fim" value="09:00"></label>
      <label style="flex:1;min-width:200px">Atividade<input type="text" id="rot-m-ativ" placeholder="Ex.: VERIFICAR WHATSAPP"></label>
      <button class="btn btn-primary" onclick="rotAdicionarModelo()">Adicionar</button>
    </div></div></div>`;
  h += '<div class="rot-grade" style="margin-top:12px">' + _ROT_ORDEM.map(dow => {
    const lista = _rot.modelo.filter(m => Number(m.diaSemana) === dow).sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)));
    return `<div class="rot-col"><h4>${_ROT_DIAS[dow]}</h4>` + (lista.map(m => `<div class="rot-it ${m.extra ? 'extra' : ''}"><small>${_rEsc(m.inicio)}–${_rEsc(m.fim)}${m.extra ? ' · extra' : ''}</small><br><b>${_rEsc(m.atividade)}</b>
      <div style="margin-top:3px"><button class="btn btn-secondary btn-sm" style="padding:1px 6px;font-size:11px" onclick="rotRemoverModelo('${m.id}')">🗑</button></div></div>`).join('') || '<small style="color:var(--text-muted)">—</small>') + '</div>';
  }).join('') + '</div>';
  return h;
}
async function rotAdicionarModelo() {
  const dia = document.getElementById('rot-m-dia').value, ini = document.getElementById('rot-m-ini').value, fim = document.getElementById('rot-m-fim').value;
  const ativ = document.getElementById('rot-m-ativ').value.trim();
  if (!ini || !fim || !ativ) { showToast('Preencha início, fim e atividade.'); return; }
  if (fim <= ini) { showToast('O fim precisa ser depois do início.'); return; }
  const dias = dia === 'uteis' ? [1, 2, 3, 4, 5] : [Number(dia)];
  try {
    for (const d of dias) {
      const extra = d === 0 || d === 6 || ini < _ROT_EXP_INI || fim > _ROT_EXP_FIM;
      await db.collection('coord_rotina_modelo').add({ pessoaId: _rot.pessoaId, diaSemana: d, inicio: ini, fim, atividade: ativ, extra });
    }
    showToast('✅ Adicionado ao modelo.'); await _rotRecarregar();
  } catch (e) { console.error(e); showToast('Erro: ' + e.message); }
}
async function rotRemoverModelo(id) {
  const m = _rot.modelo.find(x => x.id === id); if (!m) return;
  if (!confirm(`Remover "${m.atividade}" do modelo?\nAs semanas de hoje em diante deixam de ter essa atividade (o que já foi concluído fica no histórico).`)) return;
  try {
    const hoje = _rHoje();
    const fut = (await db.collection('coord_rotina_itens').where('modeloId', '==', id).where('data', '>=', hoje).get()).docs;
    for (const d of fut) { if (d.data().concluida) continue; await db.collection('coord_rotina_itens').doc(d.id).update({ cancelada: true }); }
    await db.collection('coord_rotina_modelo').doc(id).delete();
    await _rotRecarregar();
  } catch (e) { console.error(e); showToast('Erro: ' + e.message); }
}
window.rotAdicionarModelo = rotAdicionarModelo; window.rotRemoverModelo = rotRemoverModelo;

// ── Meu dia (o coordenador também tem a própria rotina) ─────────────────
function _rotHtmlMeuDia() {
  if (!_rot.minha) return '<div class="card"><div class="card-body">Seu login ainda não está vinculado a uma pessoa da equipe. Em <b>Planejamento de Férias</b>, adicione você mesmo e vincule ao seu login para ter checklist próprio.</div></div>';
  return `<div class="rot-barra">${_rotNavSemana()}</div>` + _rotListaDia(_rot.itens.filter(x => x.data === _rHoje()), _rHoje(), 'rotMarcar')
    + '<div style="height:12px"></div>' + _rotGrade(_rot.itens, _rot.seg, false);
}

// Checklist de um dia (usada no coordenador e no colaborador)
function _rotListaDia(itens, dia, fnMarcar) {
  const ativos = itens.filter(x => !x.cancelada).sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)));
  const feitos = ativos.filter(x => x.concluida).length;
  const futuro = dia > _rHoje();
  let h = `<div class="card"><div class="card-body" style="padding-bottom:6px"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
    <b>${_ROT_DIAS[_rData(dia).getDay()]}, ${_rBR(dia)}</b><span style="font-weight:700">${feitos}/${ativos.length} · ${_rPct(feitos, ativos.length)}%</span></div>
    <div class="rot-prog" style="margin:8px 0"><div style="width:${_rPct(feitos, ativos.length)}%"></div></div></div>`;
  h += '<div class="rot-lista">' + (ativos.map(x => `<div class="rot-linha ${x.concluida ? 'ok' : ''}">
      <input type="checkbox" ${x.concluida ? 'checked' : ''} ${futuro ? 'disabled title="Dia ainda não chegou"' : ''} onchange="${fnMarcar}('${x.id}', this.checked)">
      <span class="rot-hora">${_rEsc(x.inicio)}–${_rEsc(x.fim)}</span>
      <span class="rot-nome">${_rEsc(x.atividade)}${x.extra ? ' <span class="badge badge-warn" style="font-size:10px">extra</span>' : ''}</span>
      <span style="font-size:11px;color:var(--text-muted)">${x.concluida && x.concluidaEm ? 'feito ' + new Date(x.concluidaEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : _rFmtMin(_rDur(x.inicio, x.fim))}</span>
      ${fnMarcar === 'rotMarcarMeu' ? `<button class="btn btn-secondary btn-sm" title="Sugerir sobre esta atividade" style="padding:1px 7px" onclick="rotSugerirItem('${x.id}')">💬</button>` : ''}
    </div>`).join('') || '<div style="padding:16px;color:var(--text-muted)">Nenhuma atividade neste dia.</div>') + '</div></div>';
  return h;
}
async function _rotMarcarGeral(id, v, depois) {
  try {
    const { error } = await window._sb.rpc('rotina_marcar', { p_item: id, p_concluida: v });
    if (error) throw new Error(error.message);
    await depois();
  } catch (e) { console.error(e); showToast('Erro: ' + e.message); await depois(); }
}
const rotMarcar = (id, v) => _rotMarcarGeral(id, v, _rotRecarregar);
window.rotMarcar = rotMarcar;

// ── Produtividade ───────────────────────────────────────────────────────
function _rotAgrega(itens) {
  const ativos = itens.filter(x => !x.cancelada);
  const norm = ativos.filter(x => !x.extra), ext = ativos.filter(x => x.extra);
  const soma = l => l.reduce((a, x) => a + _rDur(x.inicio, x.fim), 0);
  return {
    plan: norm.length, feitas: norm.filter(x => x.concluida).length,
    minPlan: soma(norm), minFeitos: soma(norm.filter(x => x.concluida)),
    extras: ext.length, extrasFeitas: ext.filter(x => x.concluida).length,
  };
}
function _rotHtmlProd() {
  const [de, ate] = _rotPeriodoProd();
  let h = `<div class="rot-barra"><b>Período:</b>
    ${[['semana', 'Esta semana'], ['mes', 'Este mês'], ['90', 'Últimos 90 dias']].map(([k, t]) => `<button class="rot-aba ${_rot.periodo === k ? 'ativa' : ''}" onclick="rotPeriodo('${k}')">${t}</button>`).join('')}
    <span style="font-size:12px;color:var(--text-muted)">${_rBR(de)} a ${_rBR(ate)} · só entram dias em que a rotina foi aberta. Atividades extras (fim de semana e fora do expediente) aparecem à parte e não puxam a nota para baixo.</span></div>`;
  h += '<div class="card"><div class="card-body" style="overflow-x:auto"><table class="rot-tab"><thead><tr><th>Pessoa</th><th class="n">Planejadas</th><th class="n">Concluídas</th><th class="n">% concluído</th><th class="n">Min. planejados</th><th class="n">Min. concluídos</th><th class="n">% do tempo</th><th class="n">Extras feitas</th></tr></thead><tbody>';
  _rot.pessoas.forEach(p => {
    const a = _rotAgrega(_rot.prodItens.filter(x => x.pessoaId === p.id));
    h += `<tr style="cursor:pointer" onclick="rotProdPessoa('${p.id}')"><td><b>${_rEsc(p.nome)}</b></td><td class="n">${a.plan}</td><td class="n">${a.feitas}</td><td class="n"><b>${_rPct(a.feitas, a.plan)}%</b></td><td class="n">${a.minPlan}</td><td class="n">${a.minFeitos}</td><td class="n">${_rPct(a.minFeitos, a.minPlan)}%</td><td class="n">${a.extrasFeitas}/${a.extras}</td></tr>`;
  });
  h += '</tbody></table><div style="font-size:12px;color:var(--text-muted);margin-top:6px">Clique numa pessoa para ver por dia e por atividade.</div></div></div>';
  const sel = _rot.prodPessoaId;
  if (sel) {
    const dele = _rot.prodItens.filter(x => x.pessoaId === sel && !x.cancelada);
    const dias = [...new Set(dele.map(x => x.data))].sort().reverse();
    h += `<div class="card" style="margin-top:12px"><div class="card-body"><b>${_rEsc(_rNomePessoa(sel))} — por dia</b><div style="overflow-x:auto"><table class="rot-tab"><thead><tr><th>Dia</th><th class="n">Planej.</th><th class="n">Concl.</th><th class="n">%</th><th class="n">Min. planej.</th><th class="n">Min. concl.</th></tr></thead><tbody>`
      + dias.map(d => { const a = _rotAgrega(dele.filter(x => x.data === d)); return `<tr><td>${_rBR(d)} · ${_ROT_DIAS[_rData(d).getDay()].slice(0, 3)}</td><td class="n">${a.plan}</td><td class="n">${a.feitas}</td><td class="n">${_rPct(a.feitas, a.plan)}%</td><td class="n">${a.minPlan}</td><td class="n">${a.minFeitos}</td></tr>`; }).join('')
      + '</tbody></table></div></div></div>';
    const porAtiv = {};
    dele.filter(x => !x.extra).forEach(x => { const k = String(x.atividade).trim().toUpperCase(); (porAtiv[k] = porAtiv[k] || { p: 0, c: 0 }).p++; if (x.concluida) porAtiv[k].c++; });
    h += `<div class="card" style="margin-top:12px"><div class="card-body"><b>${_rEsc(_rNomePessoa(sel))} — por atividade</b><div style="overflow-x:auto"><table class="rot-tab"><thead><tr><th>Atividade</th><th class="n">Planej.</th><th class="n">Concl.</th><th class="n">%</th></tr></thead><tbody>`
      + Object.entries(porAtiv).sort((a, b) => _rPct(a[1].c, a[1].p) - _rPct(b[1].c, b[1].p)).map(([k, v]) => `<tr><td>${_rEsc(k)}</td><td class="n">${v.p}</td><td class="n">${v.c}</td><td class="n">${_rPct(v.c, v.p)}%</td></tr>`).join('')
      + '</tbody></table></div></div></div>';
  }
  return h;
}
async function rotPeriodo(k) { _rot.periodo = k; await _rotRecarregar(); }
function rotProdPessoa(id) { _rot.prodPessoaId = _rot.prodPessoaId === id ? '' : id; _rotRender(); }
window.rotPeriodo = rotPeriodo; window.rotProdPessoa = rotProdPessoa;

// ── Pedidos extras e sugestões ──────────────────────────────────────────
function _rotHtmlInbox() {
  let h = '<div class="card"><div class="card-body"><b>Atividades extras pedidas</b>';
  h += _rot.pedidos.length ? _rot.pedidos.map(p => `<div class="rot-card" style="margin-top:10px">
      <b>${_rEsc(_rNomePessoa(p.pessoaId))}</b> pede: <b>${_rEsc(p.atividade)}</b><br>
      <span style="font-size:13px">${_ROT_DIAS[_rData(p.data).getDay()]}, ${_rBR(p.data)} · ${_rEsc(p.inicio)}–${_rEsc(p.fim)}${_rEhExtra(p.data, p.inicio, p.fim) ? ' · <span class="badge badge-warn">extra</span>' : ''}</span>
      ${p.motivo ? `<div style="font-size:13px;color:var(--text-muted);margin-top:4px">Motivo: ${_rEsc(p.motivo)}</div>` : ''}
      <div class="rot-form"><label style="flex:1;min-width:180px">Resposta (opcional)<input type="text" id="rot-resp-${p.id}"></label>
        <button class="btn btn-primary btn-sm" onclick="rotDecidir('${p.id}', true)">✅ Autorizar</button>
        <button class="btn btn-danger btn-sm" onclick="rotDecidir('${p.id}', false)">Recusar</button></div></div>`).join('')
    : '<div style="color:var(--text-muted);margin-top:8px">Nenhum pedido esperando.</div>';
  h += '</div></div><div class="card" style="margin-top:12px"><div class="card-body"><b>Sugestões da equipe</b>';
  h += _rot.sugestoes.length ? _rot.sugestoes.map(s => `<div class="rot-card" style="margin-top:10px">
      <b>${_rEsc(_rNomePessoa(s.pessoaId))}</b> <span style="font-size:12px;color:var(--text-muted)">${s.createdAt ? new Date(s.createdAt).toLocaleString('pt-BR') : ''}</span>
      <div style="margin-top:4px">${_rEsc(s.texto)}</div>
      <div class="rot-form"><label style="flex:1;min-width:180px">Resposta (opcional)<input type="text" id="rot-sresp-${s.id}"></label>
        <button class="btn btn-secondary btn-sm" onclick="rotSugestaoLida('${s.id}')">Marcar como vista</button></div></div>`).join('')
    : '<div style="color:var(--text-muted);margin-top:8px">Nenhuma sugestão nova.</div>';
  return h + '</div></div>';
}
async function rotDecidir(id, aprovar) {
  const p = _rot.pedidos.find(x => x.id === id); if (!p) return;
  const resposta = (document.getElementById('rot-resp-' + id) || {}).value || '';
  if (!aprovar && !confirm('Recusar este pedido?')) return;
  try {
    let itemId = null;
    if (aprovar) {
      const r = await db.collection('coord_rotina_itens').add({ pessoaId: p.pessoaId, data: p.data, inicio: p.inicio, fim: p.fim, atividade: p.atividade, origem: 'extra', extra: _rEhExtra(p.data, p.inicio, p.fim), concluida: false, cancelada: false });
      itemId = r && r.id;
    }
    await db.collection('coord_rotina_pedidos').doc(id).update({ status: aprovar ? 'aprovado' : 'recusado', resposta: resposta || null, decididoPor: (currentUserData && currentUserData.name) || '', decididoEm: firebase.firestore.FieldValue.serverTimestamp() });
    showToast(aprovar ? '✅ Autorizado: a atividade entrou na rotina do dia.' : 'Pedido recusado.');
    await _rotRecarregar();
  } catch (e) { console.error(e); showToast('Erro: ' + e.message); }
}
async function rotSugestaoLida(id) {
  const resposta = (document.getElementById('rot-sresp-' + id) || {}).value || '';
  try { await db.collection('coord_rotina_sugestoes').doc(id).update({ lida: true, resposta: resposta || null }); await _rotRecarregar(); }
  catch (e) { console.error(e); showToast('Erro: ' + e.message); }
}
window.rotDecidir = rotDecidir; window.rotSugestaoLida = rotSugestaoLida;

// ═══════════════════════════════════════════════════════════════════════
//  MINHA ROTINA (colaborador vinculado)
// ═══════════════════════════════════════════════════════════════════════
async function initMinhaRotina() {
  _rEstilo();
  const raiz = document.getElementById('minha-rotina-root'); if (!raiz) return;
  raiz.innerHTML = '<div class="loading-state"><div class="spinner spinner-dark"></div>Carregando…</div>';
  try {
    await _rotCarregarBase();
    if (!_rot.seg) _rot.seg = _rSegunda(new Date());
    if (!_rot.mData) _rot.mData = _rHoje();
    _rot.erro = '';
    await _rotCarregarMinha();
  } catch (e) { console.error('initMinhaRotina', e); _rot.erro = e.message || String(e); }
  _rotRenderMinha();
}
window.initMinhaRotina = initMinhaRotina;

async function _rotCarregarMinha() {
  if (!_rot.minha) { _rot.mItens = []; return; }
  const seg = _rSegunda(_rData(_rot.mData));
  _rot.mSeg = seg;
  _rot.mItens = await _rotItensSemana(_rot.minha.id, seg);
  const [pe, su] = await Promise.all([
    db.collection('coord_rotina_pedidos').where('pessoaId', '==', _rot.minha.id).get(),
    db.collection('coord_rotina_sugestoes').where('pessoaId', '==', _rot.minha.id).get(),
  ]);
  _rot.mPedidos = pe.docs.map(d => _rNorm({ id: d.id, ...d.data() })).sort((a, b) => b.data.localeCompare(a.data)).slice(0, 15);
  _rot.mSugs = su.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 10);
}

function _rotRenderMinha() {
  const raiz = document.getElementById('minha-rotina-root'); if (!raiz) return;
  if (_rot.erro) { raiz.innerHTML = `<div class="card"><div class="card-body"><b>Não foi possível carregar.</b><div style="margin-top:6px;color:var(--text-muted);font-size:13px">${_rEsc(_rot.erro)}</div></div></div>`; return; }
  if (!_rot.minha) { raiz.innerHTML = '<div class="card"><div class="card-body">Seu login ainda não foi vinculado a uma rotina. Peça ao coordenador para vincular você na equipe.</div></div>'; return; }
  const abas = [['dia', '✅ Meu dia'], ['semana', '📅 Minha semana'], ['extra', '➕ Pedir atividade extra'], ['sug', '💬 Sugestões']];
  let h = '<div class="rot-abas">' + abas.map(([k, t]) => `<button class="rot-aba ${_rot.mAba === k ? 'ativa' : ''}" onclick="rotMAba('${k}')">${t}</button>`).join('') + '</div>';
  if (_rot.mAba === 'dia') {
    h += `<div class="rot-barra"><button class="btn btn-secondary btn-sm" onclick="rotMDia(-1)">‹</button><input type="date" value="${_rot.mData}" onchange="rotMIr(this.value)"><button class="btn btn-secondary btn-sm" onclick="rotMDia(1)">›</button><button class="btn btn-secondary btn-sm" onclick="rotMIr('${_rHoje()}')">Hoje</button></div>`
      + _rotListaDia(_rot.mItens.filter(x => x.data === _rot.mData), _rot.mData, 'rotMarcarMeu');
  } else if (_rot.mAba === 'semana') {
    h += `<div class="rot-barra"><button class="btn btn-secondary btn-sm" onclick="rotMSemana(-1)">‹</button><b style="min-width:170px;text-align:center">${_rBR(_rYmd(_rot.mSeg))} a ${_rBR(_rYmd(_rSoma(_rot.mSeg, 6)))}</b><button class="btn btn-secondary btn-sm" onclick="rotMSemana(1)">›</button><button class="btn btn-secondary btn-sm" onclick="rotMIr('${_rHoje()}')">Esta semana</button></div>`
      + _rotGrade(_rot.mItens, _rot.mSeg, false);
  } else if (_rot.mAba === 'extra') {
    h += `<div class="card"><div class="card-body"><b>Pedir uma atividade extra</b>
      <div style="font-size:13px;color:var(--text-muted);margin-top:4px">O pedido vai para o coordenador. A atividade só entra na sua rotina depois que ele autorizar.</div>
      <div class="rot-form"><label>Dia<input type="date" id="rot-x-data" value="${_rHoje()}"></label><label>Início<input type="time" id="rot-x-ini" value="09:00"></label><label>Fim<input type="time" id="rot-x-fim" value="10:00"></label>
        <label style="flex:1;min-width:200px">Atividade<input type="text" id="rot-x-ativ"></label></div>
      <div class="rot-form"><label style="flex:1;min-width:260px">Motivo<textarea id="rot-x-motivo" rows="2" placeholder="Por que isso surgiu?"></textarea></label><button class="btn btn-primary" onclick="rotMPedir()">Enviar pedido</button></div></div></div>`;
    h += '<div class="card" style="margin-top:12px"><div class="card-body"><b>Meus pedidos</b>' + (_rot.mPedidos.map(p => `<div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:13px"><b>${_rEsc(p.atividade)}</b> · ${_rBR(p.data)} ${_rEsc(p.inicio)}–${_rEsc(p.fim)} —
      <span class="badge ${p.status === 'aprovado' ? 'badge-ok' : p.status === 'recusado' ? 'badge-danger' : 'badge-warn'}">${p.status === 'pendente' ? 'aguardando' : p.status}</span>${p.resposta ? `<div style="color:var(--text-muted)">Resposta: ${_rEsc(p.resposta)}</div>` : ''}</div>`).join('') || '<div style="color:var(--text-muted);margin-top:6px">Nenhum pedido ainda.</div>') + '</div></div>';
  } else {
    h += `<div class="card"><div class="card-body"><b>Enviar uma sugestão</b>
      <div class="rot-form"><label style="flex:1;min-width:260px">Sugestão<textarea id="rot-s-texto" rows="3" placeholder="Algo que poderia melhorar na sua rotina…"></textarea></label><button class="btn btn-primary" onclick="rotMSugerir('')">Enviar</button></div></div></div>`;
    h += '<div class="card" style="margin-top:12px"><div class="card-body"><b>Minhas sugestões</b>' + (_rot.mSugs.map(s => `<div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:13px">${_rEsc(s.texto)}
      <div style="color:var(--text-muted);font-size:12px">${s.lida ? '✔ vista pelo coordenador' : 'aguardando'}${s.resposta ? ' · Resposta: ' + _rEsc(s.resposta) : ''}</div></div>`).join('') || '<div style="color:var(--text-muted);margin-top:6px">Nenhuma ainda.</div>') + '</div></div>';
  }
  raiz.innerHTML = h;
}
async function _rotRecarregarMinha() {
  try { await _rotCarregarMinha(); _rot.erro = ''; } catch (e) { console.error(e); _rot.erro = e.message || String(e); }
  _rotRenderMinha();
}
const rotMAba = k => { _rot.mAba = k; _rotRenderMinha(); };
const rotMDia = async d => { _rot.mData = _rYmd(_rSoma(_rData(_rot.mData), d)); await _rotRecarregarMinha(); };
const rotMIr = async v => { if (v) { _rot.mData = v; await _rotRecarregarMinha(); } };
const rotMSemana = async d => { _rot.mData = _rYmd(_rSoma(_rot.mSeg, d * 7)); await _rotRecarregarMinha(); };
const rotMarcarMeu = (id, v) => _rotMarcarGeral(id, v, _rotRecarregarMinha);
async function rotMPedir() {
  const data = document.getElementById('rot-x-data').value, ini = document.getElementById('rot-x-ini').value, fim = document.getElementById('rot-x-fim').value;
  const ativ = document.getElementById('rot-x-ativ').value.trim(), motivo = document.getElementById('rot-x-motivo').value.trim();
  if (!data || !ini || !fim || !ativ) { showToast('Preencha dia, horário e atividade.'); return; }
  if (fim <= ini) { showToast('O fim precisa ser depois do início.'); return; }
  try {
    const { error } = await window._sb.rpc('rotina_pedir_extra', { p_data: data, p_inicio: ini, p_fim: fim, p_atividade: ativ, p_motivo: motivo });
    if (error) throw new Error(error.message);
    showToast('✅ Pedido enviado ao coordenador.'); await _rotRecarregarMinha();
  } catch (e) { console.error(e); showToast('Erro: ' + e.message); }
}
async function rotMSugerir(itemId) {
  const el = document.getElementById('rot-s-texto'); const texto = (el ? el.value : '').trim();
  if (!texto) { showToast('Escreva a sugestão.'); return; }
  try {
    const { error } = await window._sb.rpc('rotina_sugerir', { p_item: itemId || '', p_texto: texto });
    if (error) throw new Error(error.message);
    showToast('✅ Sugestão enviada.'); await _rotRecarregarMinha();
  } catch (e) { console.error(e); showToast('Erro: ' + e.message); }
}
async function rotSugerirItem(itemId) {
  const it = _rot.mItens.find(x => x.id === itemId); if (!it) return;
  const texto = (prompt('Sugestão sobre "' + it.atividade + '":') || '').trim(); if (!texto) return;
  try {
    const { error } = await window._sb.rpc('rotina_sugerir', { p_item: itemId, p_texto: '[' + it.atividade + '] ' + texto });
    if (error) throw new Error(error.message);
    showToast('✅ Sugestão enviada.');
  } catch (e) { console.error(e); showToast('Erro: ' + e.message); }
}
Object.assign(window, { rotMAba, rotMDia, rotMIr, rotMSemana, rotMarcarMeu, rotMPedir, rotMSugerir, rotSugerirItem });

// Mostra "Minha Rotina" no menu só para quem está vinculado a uma pessoa da equipe (1 consulta leve por login).
async function verificarMinhaRotina() {
  try {
    const uid = currentUser && currentUser.uid; if (!uid) return;
    const r = await db.collection('coord_ferias_pessoas').where('userId', '==', uid).limit(1).get();
    const sec = document.getElementById('sidebar-minha-rotina');
    if (sec) sec.style.display = r.docs.length ? '' : 'none';
  } catch (e) { /* tabela ainda não criada ou perfil sem acesso: some em silêncio */ }
}
window.verificarMinhaRotina = verificarMinhaRotina;

// ═══════════════════════════════════════════════════════════════════════
//  ALERTA DE PENDÊNCIAS AO ENTRAR (só gestão)
//  Uma janelinha com o que está esperando decisão. Só CONTAGENS (sem baixar linhas),
//  uma vez por sessão de login; o mesmo resumo vai para o sino. Sem consulta repetida.
// ═══════════════════════════════════════════════════════════════════════
const _ALERTA_FONTES = [
  { tabela: 'coord_rotina_pedidos', campo: 'status', valor: 'pendente', icone: '🕒', texto: n => n + (n === 1 ? ' atividade extra pedida pela equipe' : ' atividades extras pedidas pela equipe'), pagina: 'coord-rotina', aba: 'inbox' },
  { tabela: 'coord_rotina_sugestoes', campo: 'lida', valor: false, icone: '💬', texto: n => n + (n === 1 ? ' sugestão nova da equipe' : ' sugestões novas da equipe'), pagina: 'coord-rotina', aba: 'inbox' },
  { tabela: 'orders', campo: 'status', valor: 'andamento', icone: '💰', texto: n => n + (n === 1 ? ' pedido com orçamento para decidir' : ' pedidos com orçamento para decidir'), pagina: 'all-orders' },
  { tabela: 'orders', campo: 'status', valor: 'aguardando_estoque', icone: '🏪', texto: n => n + (n === 1 ? ' pedido aguardando avaliação de estoque' : ' pedidos aguardando avaliação de estoque'), pagina: 'all-orders' },
  { tabela: 'var_solicitacoes', campo: 'status', valor: 'em_proposta', icone: '🛒', texto: n => n + (n === 1 ? ' item de Variedades em aprovação' : ' itens de Variedades em aprovação'), pagina: 'var-solicitacoes' },
];

async function iniciarAlertaPendencias(forcar) {
  try {
    const papel = (currentUserData && currentUserData.role) || '';
    if (!['admin', 'diretor', 'gerente', 'coordenador'].includes(papel) || !window._sb) return;
    if (!forcar && sessionStorage.getItem('lumen_alerta_pend')) return;
    sessionStorage.setItem('lumen_alerta_pend', '1');
    const linhas = [];
    for (const f of _ALERTA_FONTES) {
      try {
        const { count, error } = await window._sb.from(f.tabela).select('id', { count: 'exact', head: true }).eq(f.campo, f.valor);
        if (!error && count > 0) linhas.push({ ...f, n: count });
      } catch (e) { /* tabela ainda não existe ou sem acesso: ignora esta fonte */ }
    }
    if (!linhas.length) return;
    if (typeof adicionarNotificacao === 'function') linhas.forEach(l => adicionarNotificacao('Pendência: ' + l.texto(l.n), 'Toque para abrir', 'warn', l.pagina));
    _alertaMostrar(linhas);
  } catch (e) { console.warn('iniciarAlertaPendencias', e); }
}
window.iniciarAlertaPendencias = iniciarAlertaPendencias;

function _alertaMostrar(linhas) {
  const antigo = document.getElementById('alerta-pend'); if (antigo) antigo.remove();
  const d = document.createElement('div'); d.id = 'alerta-pend';
  d.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:9999;width:min(360px,calc(100vw - 36px));background:var(--surface,#fff);color:var(--text);border:1px solid var(--border);border-left:4px solid var(--warn,#d97706);border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.3);padding:14px 16px;font-size:13px';
  d.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><b style="font-size:14px">🔔 Pendências para você</b><button onclick="document.getElementById(\'alerta-pend\').remove()" style="border:0;background:transparent;color:var(--text-muted);font-size:18px;cursor:pointer">✕</button></div>'
    + linhas.map(l => `<div onclick="alertaIr('${l.pagina}','${l.aba || ''}')" style="cursor:pointer;padding:7px 4px;border-top:1px solid var(--border)">${l.icone} ${_rEsc(l.texto(l.n))} <span style="color:var(--lumen);float:right">abrir ›</span></div>`).join('');
  document.body.appendChild(d);
}
function alertaIr(pagina, aba) {
  const d = document.getElementById('alerta-pend'); if (d) d.remove();
  if (aba) _rot.aba = aba;
  goPage(pagina);
}
window.alertaIr = alertaIr;
