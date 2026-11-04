// ─────────────────────────────────────────────────────────────────────────
// 31-coord-ferias.js — Planejamento de férias da equipe (Painel do Coordenador)
// Calendário anual com feriados nacionais, estaduais (CE), de Fortaleza e pontos
// facultativos, mais os períodos de férias de cada pessoa. Avisa sobre choques
// entre pessoas e sobre regras da CLT. Não usa IA: os feriados são calculados.
// Tabelas: coord_ferias_pessoas / coord_ferias_periodos (migration 053).
// Edição: admin/diretor/gerente/coordenador. Os demais perfis só consultam.
// ─────────────────────────────────────────────────────────────────────────

const _FER_CORES = ['#2563eb', '#16a34a', '#db2777', '#9333ea', '#ea580c', '#0891b2'];
const _FER_MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const _FER_DIAS_SEM = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const _FER_TIPOS = {
  nacional:   { rotulo: 'Nacional',    cor: '#dc2626' },
  estadual:   { rotulo: 'Ceará',       cor: '#d97706' },
  municipal:  { rotulo: 'Fortaleza',   cor: '#b45309' },
  facultativo:{ rotulo: 'Facultativo', cor: '#64748b' },
};
const _fer = { ano: null, pessoas: [], periodos: [], pode: false, erro: '', editId: null, usuarios: [] };

// ── Datas (sempre em horário local, texto AAAA-MM-DD) ───────────────────
const _ferYmd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const _ferData = s => { const [a, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(a, m - 1, d); };
const _ferBR = s => { const [a, m, d] = String(s).slice(0, 10).split('-'); return d + '/' + m + '/' + a; };
const _ferSomaDias = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const _ferDiasEntre = (ini, fim) => Math.round((_ferData(fim) - _ferData(ini)) / 86400000) + 1;

// Páscoa (algoritmo de Meeus/Jones/Butcher)
function _ferPascoa(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

function _ferFeriados(ano) {
  const fx = (m, d, nome, tipo) => ({ data: ano + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0'), nome, tipo });
  const p = _ferPascoa(ano);
  const mv = (n, nome, tipo) => ({ data: _ferYmd(_ferSomaDias(p, n)), nome, tipo });
  const lista = [
    fx(1, 1, 'Confraternização Universal', 'nacional'),
    mv(-48, 'Carnaval (segunda-feira)', 'facultativo'),
    mv(-47, 'Carnaval (terça-feira)', 'facultativo'),
    mv(-46, 'Quarta-feira de Cinzas (até as 14h)', 'facultativo'),
    mv(-2, 'Sexta-feira Santa', 'nacional'),
    fx(3, 19, 'São José (padroeiro do Ceará)', 'estadual'),
    fx(3, 25, 'Data Magna do Ceará', 'estadual'),
    fx(4, 13, 'Aniversário de Fortaleza', 'municipal'),
    fx(4, 21, 'Tiradentes', 'nacional'),
    fx(5, 1, 'Dia do Trabalho', 'nacional'),
    mv(60, 'Corpus Christi', 'facultativo'),
    fx(8, 15, 'Nossa Senhora da Assunção (Fortaleza)', 'municipal'),
    fx(9, 7, 'Independência do Brasil', 'nacional'),
    fx(10, 12, 'Nossa Senhora Aparecida', 'nacional'),
    fx(11, 2, 'Finados', 'nacional'),
    fx(11, 15, 'Proclamação da República', 'nacional'),
    fx(11, 20, 'Consciência Negra', 'nacional'),
    fx(12, 25, 'Natal', 'nacional'),
  ];
  return lista.sort((a, b) => a.data.localeCompare(b.data));
}

// ── Datas pessoais: aniversário e dia de entrada na empresa ─────────────
// Ocorrência da data (mês/dia de `s`) no ano dado; 29/02 vira 28/02 em ano não bissexto.
function _ferNoAno(s, ano) {
  const [, m, d] = String(s).slice(0, 10).split('-').map(Number);
  const dt = new Date(ano, m - 1, d);
  return dt.getMonth() !== m - 1 ? new Date(ano, m - 1, d - 1) : dt;
}
// Próxima ocorrência a partir de hoje (hoje conta).
function _ferProxima(s) {
  const h = new Date(), hoje = new Date(h.getFullYear(), h.getMonth(), h.getDate());
  let dt = _ferNoAno(s, hoje.getFullYear());
  if (dt < hoje) dt = _ferNoAno(s, hoje.getFullYear() + 1);
  return { data: dt, dias: Math.round((dt - hoje) / 86400000) };
}
function _ferTempoDeCasa(admissao) {
  const a = _ferData(admissao), h = new Date();
  if (a > h) return 'entra em ' + _ferBR(admissao);
  let meses = (h.getFullYear() - a.getFullYear()) * 12 + h.getMonth() - a.getMonth();
  if (h.getDate() < a.getDate()) meses--;
  const anos = Math.floor(meses / 12), mm = meses % 12;
  const partes = [];
  if (anos) partes.push(anos + (anos === 1 ? ' ano' : ' anos'));
  if (mm) partes.push(mm + (mm === 1 ? ' mês' : ' meses'));
  return partes.length ? partes.join(' e ') : 'menos de 1 mês';
}
const _ferEmDias = n => n === 0 ? '🎉 hoje' : n === 1 ? 'amanhã' : 'em ' + n + ' dias';

// Marcadores no calendário: 🎂 aniversários e 🏢 aniversários de empresa do ano exibido.
function _ferMarcas(ano) {
  const marcas = {};
  const add = (dt, emoji, texto) => { const k = _ferYmd(dt); (marcas[k] = marcas[k] || []).push({ emoji, texto }); };
  _fer.pessoas.forEach(p => {
    if (p.nascimento) add(_ferNoAno(p.nascimento, ano), '🎂', 'Aniversário de ' + p.nome + ' (' + (ano - Number(String(p.nascimento).slice(0, 4))) + ' anos)');
    if (p.admissao && Number(String(p.admissao).slice(0, 4)) < ano) add(_ferNoAno(p.admissao, ano), '🏢', p.nome + ' completa ' + (ano - Number(String(p.admissao).slice(0, 4))) + ' ano(s) de empresa');
  });
  return marcas;
}

// ── Carga ───────────────────────────────────────────────────────────────
async function initCoordFerias() {
  const raiz = document.getElementById('fer-root');
  if (!raiz) return;
  const papel = (typeof currentUserData !== 'undefined' && currentUserData && currentUserData.role) || '';
  _fer.pode = ['admin', 'diretor', 'gerente', 'coordenador'].includes(papel);
  if (!_fer.ano) { const h = new Date(); _fer.ano = h.getMonth() >= 8 ? h.getFullYear() + 1 : h.getFullYear(); }
  raiz.innerHTML = '<div class="loading-state"><div class="spinner spinner-dark"></div>Carregando…</div>';
  try {
    const [ps, pr] = await Promise.all([db.collection('coord_ferias_pessoas').get(), db.collection('coord_ferias_periodos').get()]);
    _fer.pessoas = ps.docs.map(d => ({ id: d.id, ...d.data() }))
      .map(p => ({ ...p, admissao: p.admissao ? String(p.admissao).slice(0, 10) : '', nascimento: p.nascimento ? String(p.nascimento).slice(0, 10) : '' })).sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || String(a.nome).localeCompare(String(b.nome)));
    _fer.periodos = pr.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.inicio && x.fim)
      .map(x => ({ ...x, inicio: String(x.inicio).slice(0, 10), fim: String(x.fim).slice(0, 10) }))
      .sort((a, b) => a.inicio.localeCompare(b.inicio));
    _fer.erro = '';
    _fer.usuarios = [];
    if (_fer.pode) {
      try {
        const us = await db.collection('users').get();
        _fer.usuarios = us.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.status !== 'rejected' && u.name)
          .sort((a, b) => String(a.name).localeCompare(String(b.name)));
      } catch (e) { console.error('initCoordFerias: usuários', e); }
    }
  } catch (e) {
    console.error('initCoordFerias', e);
    _fer.erro = e.message || String(e);
  }
  _ferRenderizar();
}
window.initCoordFerias = initCoordFerias;

const _ferCor = pessoaId => _FER_CORES[Math.max(0, _fer.pessoas.findIndex(p => p.id === pessoaId)) % _FER_CORES.length];
const _ferNome = pessoaId => (_fer.pessoas.find(p => p.id === pessoaId) || {}).nome || '—';

// ── Cálculos de choque e de regras ──────────────────────────────────────
// mapa dia → [pessoaIds] com todos os períodos
function _ferMapaDias() {
  const mapa = {};
  _fer.periodos.forEach(p => {
    for (let d = _ferData(p.inicio), fim = _ferData(p.fim); d <= fim; d = _ferSomaDias(d, 1)) {
      const k = _ferYmd(d); (mapa[k] = mapa[k] || []).push(p.pessoaId);
    }
  });
  return mapa;
}

// trechos contínuos em que 2 ou mais pessoas estão ausentes ao mesmo tempo
function _ferChoques(mapa) {
  const dias = Object.keys(mapa).filter(k => new Set(mapa[k]).size >= 2).sort();
  const trechos = [];
  dias.forEach(k => {
    const ult = trechos[trechos.length - 1], nomes = [...new Set(mapa[k])].sort().join('|');
    if (ult && ult.nomes === nomes && _ferYmd(_ferSomaDias(_ferData(ult.fim), 1)) === k) ult.fim = k;
    else trechos.push({ inicio: k, fim: k, nomes, ids: [...new Set(mapa[k])] });
  });
  return trechos;
}

// avisos da CLT por período e por pessoa (são alertas, não bloqueiam o cadastro)
function _ferAvisos() {
  const avisos = [];
  const feriadosFixos = new Set();
  [_fer.ano - 1, _fer.ano, _fer.ano + 1].forEach(a => _ferFeriados(a).filter(f => f.tipo !== 'facultativo').forEach(f => feriadosFixos.add(f.data)));
  _fer.periodos.forEach(p => {
    const ini = _ferData(p.inicio), dow = ini.getDay(), nome = _ferNome(p.pessoaId);
    const proxFeriado = [0, 1, 2].some(n => feriadosFixos.has(_ferYmd(_ferSomaDias(ini, n))));
    if (dow === 5 || dow === 6 || dow === 0 || proxFeriado) {
      avisos.push(nome + ' — férias começando em ' + _ferBR(p.inicio) + ' (' + _FER_DIAS_SEM[dow] + '): a CLT (art. 134, §3º) proíbe iniciar as férias nos 2 dias que antecedem feriado ou descanso semanal.');
    }
    const dias = _ferDiasEntre(p.inicio, p.fim);
    if (dias < 5) avisos.push(nome + ' — o período de ' + _ferBR(p.inicio) + ' a ' + _ferBR(p.fim) + ' tem ' + dias + ' dia(s); quando as férias são divididas, nenhum período pode ter menos de 5 dias.');
  });
  _fer.pessoas.forEach(pe => {
    const meus = _fer.periodos.filter(p => p.pessoaId === pe.id);
    if (!meus.length) return;
    const total = meus.reduce((s, p) => s + _ferDiasEntre(p.inicio, p.fim), 0);
    if (total > 30) avisos.push(pe.nome + ' — soma ' + total + ' dias de férias; o direito é de 30 dias por período aquisitivo.');
    if (meus.length > 3) avisos.push(pe.nome + ' — ' + meus.length + ' períodos; a CLT permite dividir em no máximo 3.');
    if (meus.length > 1 && !meus.some(p => _ferDiasEntre(p.inicio, p.fim) >= 14)) avisos.push(pe.nome + ' — quando as férias são divididas, um dos períodos precisa ter pelo menos 14 dias.');
  });
  return avisos;
}

// ── Renderização ────────────────────────────────────────────────────────
function _ferEstilo() {
  if (document.getElementById('fer-style')) return;
  const st = document.createElement('style');
  st.id = 'fer-style';
  st.textContent = `
    .fer-meses{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px;}
    .fer-mes{border:1px solid var(--border);border-radius:10px;padding:10px;background:var(--surface,transparent);}
    .fer-mes h4{margin:0 0 6px;font-size:13px;}
    .fer-grade{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;}
    .fer-sem{font-size:10px;text-align:center;color:var(--text-muted);padding-bottom:2px;}
    .fer-dia{position:relative;min-height:34px;border-radius:6px;font-size:11px;text-align:center;padding-top:3px;border:1px solid transparent;}
    .fer-dia.fds{color:var(--text-muted);background:rgba(120,120,120,.08);}
    .fer-dia.fer{font-weight:700;color:#fff;}
    .fer-dia.vazio{visibility:hidden;}
    .fer-dia .barras{position:absolute;left:2px;right:2px;bottom:2px;display:flex;flex-direction:column;gap:1px;}
    .fer-dia .barras i{display:block;height:4px;border-radius:2px;}
    .fer-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border);border-radius:99px;padding:3px 10px;font-size:12px;margin:0 6px 6px 0;}
    .fer-chip b{width:10px;height:10px;border-radius:50%;display:inline-block;}
    .fer-chip button{border:0;background:none;cursor:pointer;color:var(--text-muted);font-size:14px;line-height:1;padding:0;}
    .fer-dia .marca{position:absolute;top:0;right:1px;font-size:9px;line-height:1;}
    .fer-equipe{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;}
    .fer-pessoa{border:1px solid var(--border);border-left-width:5px;border-radius:10px;padding:12px;font-size:13px;}
    .fer-pessoa .nome{font-weight:800;font-size:15px;margin-bottom:6px;}
    .fer-pessoa .lin{margin-top:4px;}
    .fer-pessoa .breve{background:rgba(217,119,6,.15);border-radius:6px;padding:1px 6px;font-weight:700;}
    .fer-tag{display:inline-block;border-radius:4px;padding:1px 6px;font-size:11px;color:#fff;}
  `;
  document.head.appendChild(st);
}

function _ferMesHTML(m, mapa, feriados, marcas) {
  const ano = _fer.ano, primeiro = new Date(ano, m, 1), nDias = new Date(ano, m + 1, 0).getDate();
  let h = '<div class="fer-mes"><h4>' + _FER_MESES[m] + '</h4><div class="fer-grade">'
    + ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(x => '<div class="fer-sem">' + x + '</div>').join('');
  for (let i = 0; i < primeiro.getDay(); i++) h += '<div class="fer-dia vazio"></div>';
  for (let d = 1; d <= nDias; d++) {
    const dt = new Date(ano, m, d), k = _ferYmd(dt), fer = feriados[k], dow = dt.getDay();
    const gente = [...new Set(mapa[k] || [])];
    const cls = 'fer-dia' + (fer ? ' fer' : (dow === 0 || dow === 6 ? ' fds' : ''));
    const bg = fer ? ' style="background:' + _FER_TIPOS[fer.tipo].cor + ';"' : '';
    const mk = marcas[k] || [];
    const dica = [fer ? fer.nome + ' (' + _FER_TIPOS[fer.tipo].rotulo + ')' : '', ...mk.map(x => x.texto), ...gente.map(id => _ferNome(id) + ' de férias')].filter(Boolean).join(' · ');
    h += '<div class="' + cls + '"' + bg + (dica ? ' title="' + frtEsc(dica) + '"' : '') + '>' + d
      + (mk.length ? '<span class="marca">' + [...new Set(mk.map(x => x.emoji))].join('') + '</span>' : '')
      + (gente.length ? '<span class="barras">' + gente.map(id => '<i style="background:' + _ferCor(id) + ';"></i>').join('') + '</span>' : '') + '</div>';
  }
  return h + '</div></div>';
}

function _ferRenderizar() {
  const raiz = document.getElementById('fer-root');
  if (!raiz) return;
  _ferEstilo();
  if (_fer.erro) {
    const faltaTabela = /coord_ferias|relation|schema cache|does not exist/i.test(_fer.erro);
    raiz.innerHTML = '<div class="card"><div class="card-body" style="color:var(--danger,#dc2626);">'
      + (faltaTabela ? 'As tabelas do planejamento de férias ainda não foram criadas no banco. Aplique a migração <b>053_coord_ferias.sql</b> no Supabase (SQL Editor) e atualize esta página.' : 'Erro ao carregar: ' + frtEsc(_fer.erro))
      + '</div></div>';
    return;
  }
  const lista = _ferFeriados(_fer.ano), feriados = {};
  lista.forEach(f => { feriados[f.data] = f; });
  const mapa = _ferMapaDias(), choques = _ferChoques(mapa), avisos = _ferAvisos();
  const hoje = _ferYmd(new Date());

  const marcas = _ferMarcas(_fer.ano);
  const cartoes = _fer.pessoas.map(p => {
    let l = '';
    if (p.admissao) {
      const pr = _ferProxima(p.admissao), anos = pr.data.getFullYear() - Number(p.admissao.slice(0, 4));
      l += '<div class="lin">🏢 Entrou em <b>' + _ferBR(p.admissao) + '</b> · ' + _ferTempoDeCasa(p.admissao) + ' de casa</div>'
        + (anos > 0 ? '<div class="lin">Completa ' + anos + (anos === 1 ? ' ano' : ' anos') + ' de empresa em ' + _ferBR(_ferYmd(pr.data)).slice(0, 5) + ' <span class="' + (pr.dias <= 30 ? 'breve' : '') + '">' + _ferEmDias(pr.dias) + '</span></div>' : '');
    } else l += '<div class="lin" style="color:var(--text-muted);">🏢 Data de entrada não informada</div>';
    if (p.nascimento) {
      const pr = _ferProxima(p.nascimento), idade = pr.data.getFullYear() - Number(p.nascimento.slice(0, 4));
      l += '<div class="lin">🎂 Aniversário em <b>' + _ferBR(p.nascimento).slice(0, 5) + '</b> · faz ' + idade + ' anos <span class="' + (pr.dias <= 30 ? 'breve' : '') + '">' + _ferEmDias(pr.dias) + '</span></div>';
    } else l += '<div class="lin" style="color:var(--text-muted);">🎂 Aniversário não informado</div>';
    const meuUid = (typeof currentUser !== 'undefined' && currentUser && currentUser.uid) || '';
    const souEu = !!(p.userId && p.userId === meuUid);
    const us = _fer.usuarios.find(u => u.id === p.userId);
    const vinc = p.userId ? '<div class="lin" style="color:var(--text-muted);font-size:12px;">🔗 Login: ' + (us ? frtEsc(us.email || us.name) + ' · ' + frtEsc(us.role || '') : 'vinculado')
      + (p.podePreencher ? ' · ✏️ preenche os próprios dados' : '') + '</div>' : '';
    const meus = (souEu && p.podePreencher) ? '<div class="lin" style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--border);">'
      + '<div style="font-weight:700;margin-bottom:6px;">✏️ Preencha seus dados</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">'
      + '<div><label class="form-label">Entrei na empresa em</label><input type="date" class="form-input" id="fer-meu-adm" value="' + (p.admissao || '') + '"></div>'
      + '<div><label class="form-label">Meu aniversário (nascimento)</label><input type="date" class="form-input" id="fer-meu-nasc" value="' + (p.nascimento || '') + '"></div>'
      + '<button class="btn btn-primary btn-sm" onclick="ferSalvarMeusDados()">Salvar meus dados</button></div></div>' : '';
    return '<div class="fer-pessoa" style="border-left-color:' + _ferCor(p.id) + ';' + (souEu ? 'box-shadow:0 0 0 2px ' + _ferCor(p.id) + '55;' : '') + '"><div class="nome">' + frtEsc(p.nome)
      + (souEu ? ' <span class="fer-tag" style="background:' + _ferCor(p.id) + ';">você</span>' : '') + '</div>' + l + vinc + meus
      + (_fer.pode ? '<div style="margin-top:8px;display:flex;gap:6px;"><button class="btn btn-outline btn-sm" onclick="ferEditarPessoa(\'' + p.id + '\')">Editar</button>'
        + '<button class="btn btn-outline btn-sm" onclick="ferRemoverPessoa(\'' + p.id + '\')">Remover</button></div>' : '') + '</div>';
  }).join('');
  const ed = _fer.pessoas.find(p => p.id === _fer.editId) || {};

  const form = _fer.pode ? `
    <div class="card" style="margin-bottom:16px;"><div class="card-body">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px;">
        <div><label class="form-label">${_fer.editId ? 'Editando pessoa' : 'Adicionar pessoa à equipe'}</label><input class="form-input" id="fer-nova-pessoa" placeholder="Nome" style="min-width:180px;" value="${frtEsc(ed.nome || '')}"></div>
        <div><label class="form-label">Entrou na empresa em</label><input type="date" class="form-input" id="fer-admissao" value="${ed.admissao || ''}"></div>
        <div><label class="form-label">Data de nascimento</label><input type="date" class="form-input" id="fer-nascimento" value="${ed.nascimento || ''}"></div>
        <div><label class="form-label">Login no sistema</label><select class="form-select" id="fer-login" onchange="ferAoEscolherLogin()" style="min-width:200px;">
          <option value="">— sem vínculo —</option>${_fer.usuarios.map(u => '<option value="' + u.id + '"' + (ed.userId === u.id ? ' selected' : '') + '>' + frtEsc(u.name) + (u.email ? ' (' + frtEsc(u.email) + ')' : '') + '</option>').join('')}</select></div>
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;padding-bottom:8px;"><input type="checkbox" id="fer-pode-preencher" ${ed.podePreencher ? 'checked' : ''}> Pode preencher os próprios dados</label>
        <button class="btn btn-outline btn-sm" onclick="ferAdicionarPessoa()">${_fer.editId ? 'Salvar alterações' : '+ Adicionar'}</button>
        ${_fer.editId ? '<button class="btn btn-outline btn-sm" onclick="ferCancelarEdicao()">Cancelar</button>' : ''}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">
        <div><label class="form-label">Pessoa</label><select class="form-select" id="fer-sel-pessoa">${_fer.pessoas.map(p => '<option value="' + p.id + '">' + frtEsc(p.nome) + '</option>').join('')}</select></div>
        <div><label class="form-label">Início</label><input type="date" class="form-input" id="fer-ini"></div>
        <div><label class="form-label">Fim (último dia)</label><input type="date" class="form-input" id="fer-fim"></div>
        <div><label class="form-label">Observação</label><input class="form-input" id="fer-obs" placeholder="Opcional" style="min-width:160px;"></div>
        <button class="btn btn-primary btn-sm" onclick="ferAdicionarPeriodo()">Adicionar férias</button>
      </div>
    </div></div>` : '<div class="page-sub" style="margin-bottom:12px;">Somente consulta — quem edita o planejamento é o coordenador.</div>';

  const alertas = (choques.length || avisos.length) ? `
    <div class="card" style="margin-bottom:16px;border-left:3px solid #d97706;"><div class="card-body">
      ${choques.length ? '<div style="font-weight:700;margin-bottom:6px;">⚠️ Choque de férias (duas ou mais pessoas ausentes juntas)</div><ul style="margin:0 0 10px 18px;font-size:13px;">'
        + choques.map(c => '<li>' + _ferBR(c.inicio) + (c.fim !== c.inicio ? ' a ' + _ferBR(c.fim) : '') + ' — ' + c.ids.map(id => frtEsc(_ferNome(id))).join(' e ') + '</li>').join('') + '</ul>' : ''}
      ${avisos.length ? '<div style="font-weight:700;margin-bottom:6px;">📋 Pontos de atenção (CLT)</div><ul style="margin:0 0 0 18px;font-size:13px;">'
        + avisos.map(a => '<li>' + frtEsc(a) + '</li>').join('') + '</ul>'
        + '<div style="font-size:11px;color:var(--text-muted);margin-top:8px;">Alertas de apoio ao planejamento; confirme as regras com o RH/contabilidade.</div>' : ''}
    </div></div>` : '';

  const periodosAno = _fer.periodos.filter(p => p.inicio.slice(0, 4) <= String(_fer.ano) && p.fim.slice(0, 4) >= String(_fer.ano));
  const tabPeriodos = periodosAno.length ? periodosAno.map(p => '<tr><td><span class="fer-chip" style="margin:0;"><b style="background:' + _ferCor(p.pessoaId) + ';"></b>' + frtEsc(_ferNome(p.pessoaId)) + '</span></td>'
    + '<td>' + _ferBR(p.inicio) + ' a ' + _ferBR(p.fim) + '</td><td style="text-align:right;">' + _ferDiasEntre(p.inicio, p.fim) + ' dias</td><td>' + frtEsc(p.obs || '') + '</td>'
    + (_fer.pode ? '<td><button class="btn btn-outline btn-sm" onclick="ferRemoverPeriodo(\'' + p.id + '\')">Excluir</button></td>' : '') + '</tr>').join('')
    : '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:16px;">Nenhum período de férias marcado em ' + _fer.ano + '.</td></tr>';

  const tabFeriados = lista.map(f => {
    const dt = _ferData(f.data), dow = dt.getDay(), t = _FER_TIPOS[f.tipo];
    const dica = (dow === 2 || dow === 4) ? '<span style="color:#d97706;font-size:11px;"> · cai na ' + _FER_DIAS_SEM[dow] + ': possível emenda</span>' : '';
    return '<tr' + (f.data < hoje ? ' style="opacity:.55;"' : '') + '><td>' + _ferBR(f.data).slice(0, 5) + '</td><td>' + _FER_DIAS_SEM[dow] + '</td><td>' + frtEsc(f.nome) + dica
      + '</td><td><span class="fer-tag" style="background:' + t.cor + ';">' + t.rotulo + '</span></td></tr>';
  }).join('');

  raiz.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
      <button class="btn btn-outline btn-sm" onclick="ferMudarAno(-1)">◀</button>
      <div style="font-size:20px;font-weight:800;min-width:60px;text-align:center;">${_fer.ano}</div>
      <button class="btn btn-outline btn-sm" onclick="ferMudarAno(1)">▶</button>
    </div>
    <div class="card" style="margin-bottom:16px;"><div class="card-header"><div class="card-header-title">👥 Equipe</div></div><div class="card-body">
      ${cartoes ? '<div class="fer-equipe">' + cartoes + '</div>' : '<span style="color:var(--text-muted);font-size:13px;">Nenhuma pessoa cadastrada' + (_fer.pode ? ' — adicione você e os colaboradores abaixo.' : '.') + '</span>'}
    </div></div>
    ${form}
    ${alertas}
    <div class="card" style="margin-bottom:16px;"><div class="card-body">
      <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:12px;margin-bottom:10px;">
        ${Object.values(_FER_TIPOS).map(t => '<span><span class="fer-tag" style="background:' + t.cor + ';">&nbsp;</span> ' + t.rotulo + '</span>').join('')}
        <span>🎂 Aniversário</span><span>🏢 Aniversário de empresa</span>
        <span style="color:var(--text-muted);">As barras coloridas embaixo do dia mostram quem está de férias.</span>
      </div>
      <div class="fer-meses">${[...Array(12).keys()].map(m => _ferMesHTML(m, mapa, feriados, marcas)).join('')}</div>
    </div></div>
    <div class="card" style="margin-bottom:16px;"><div class="card-header"><div class="card-header-title">🏖️ Férias marcadas em ${_fer.ano}</div></div>
      <div class="card-body"><div class="table-wrap"><table class="fin-table"><thead><tr><th>Pessoa</th><th>Período</th><th style="text-align:right;">Duração</th><th>Obs.</th>${_fer.pode ? '<th></th>' : ''}</tr></thead><tbody>${tabPeriodos}</tbody></table></div></div></div>
    <div class="card"><div class="card-header"><div class="card-header-title">📅 Feriados e pontos facultativos de ${_fer.ano}</div></div>
      <div class="card-body"><div class="table-wrap"><table class="fin-table"><thead><tr><th>Data</th><th>Dia</th><th>Feriado</th><th>Tipo</th></tr></thead><tbody>${tabFeriados}</tbody></table></div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:8px;">Carnaval, Quarta de Cinzas e Corpus Christi são pontos facultativos (não são feriados por lei federal). Para outra cidade além de Fortaleza, avise para incluir os feriados municipais.</div></div></div>`;
}

// ── Ações ───────────────────────────────────────────────────────────────
function ferMudarAno(delta) { _fer.ano += delta; _ferRenderizar(); }

async function ferAdicionarPessoa() {
  if (!_fer.pode) return;
  const el = document.getElementById('fer-nova-pessoa'), nome = (el && el.value || '').trim();
  if (!nome) { showToast('Digite o nome da pessoa.'); return; }
  if (!_fer.editId && _fer.pessoas.length >= _FER_CORES.length) { showToast('Limite de ' + _FER_CORES.length + ' pessoas no planejamento.'); return; }
  if (_fer.pessoas.some(p => p.id !== _fer.editId && p.nome.toLowerCase() === nome.toLowerCase())) { showToast('Essa pessoa já está na equipe.'); return; }
  const admissao = document.getElementById('fer-admissao')?.value || null;
  const nascimento = document.getElementById('fer-nascimento')?.value || null;
  const userId = document.getElementById('fer-login')?.value || null;
  const podePreencher = !!(userId && document.getElementById('fer-pode-preencher')?.checked);
  if (userId && _fer.pessoas.some(p => p.id !== _fer.editId && p.userId === userId)) { showToast('Esse login já está vinculado a outra pessoa.'); return; }
  try {
    if (_fer.editId) {
      await db.collection('coord_ferias_pessoas').doc(_fer.editId).update({ nome, admissao, nascimento, userId, podePreencher });
      _fer.editId = null;
    } else {
      await db.collection('coord_ferias_pessoas').add({ nome, ordem: _fer.pessoas.length, admissao, nascimento, userId, podePreencher });
    }
    await initCoordFerias();
  } catch (e) { console.error(e); showToast('Erro ao salvar: ' + e.message); }
}
function ferEditarPessoa(id) { _fer.editId = id; _ferRenderizar(); const el = document.getElementById('fer-nova-pessoa'); if (el) el.scrollIntoView({ block: 'center' }); }
// Ao escolher um login, preenche o nome se ainda estiver vazio.
function ferAoEscolherLogin() {
  const sel = document.getElementById('fer-login'), nm = document.getElementById('fer-nova-pessoa');
  const u = _fer.usuarios.find(x => x.id === (sel && sel.value));
  if (u && nm && !nm.value.trim()) nm.value = u.name;
}
// O próprio colaborador (vinculado e liberado) salva só a própria admissão e nascimento.
async function ferSalvarMeusDados() {
  const adm = document.getElementById('fer-meu-adm')?.value || null, nasc = document.getElementById('fer-meu-nasc')?.value || null;
  if (!adm && !nasc) { showToast('Preencha pelo menos uma das datas.'); return; }
  try {
    const { error } = await window._sb.rpc('coord_ferias_salvar_meus_dados', { p_admissao: adm, p_nascimento: nasc });
    if (error) throw new Error(error.message);
    showToast('✅ Seus dados foram salvos.');
    await initCoordFerias();
  } catch (e) { console.error(e); showToast('Erro ao salvar: ' + e.message); }
}
function ferCancelarEdicao() { _fer.editId = null; _ferRenderizar(); }

async function ferRemoverPessoa(id) {
  if (!_fer.pode) return;
  const p = _fer.pessoas.find(x => x.id === id); if (!p) return;
  const n = _fer.periodos.filter(x => x.pessoaId === id).length;
  if (!confirm('Remover ' + p.nome + (n ? ' e as ' + n + ' férias marcadas dela(e)' : '') + '?')) return;
  try { await db.collection('coord_ferias_pessoas').doc(id).delete(); await initCoordFerias(); }
  catch (e) { console.error(e); showToast('Erro ao remover: ' + e.message); }
}

async function ferAdicionarPeriodo() {
  if (!_fer.pode) return;
  const pessoaId = document.getElementById('fer-sel-pessoa')?.value || '';
  const ini = document.getElementById('fer-ini')?.value || '', fim = document.getElementById('fer-fim')?.value || '';
  if (!pessoaId) { showToast('Cadastre e escolha uma pessoa.'); return; }
  if (!ini || !fim) { showToast('Informe o início e o fim.'); return; }
  if (fim < ini) { showToast('O fim não pode ser antes do início.'); return; }
  try {
    await db.collection('coord_ferias_periodos').add({
      pessoaId, inicio: ini, fim, obs: (document.getElementById('fer-obs')?.value || '').trim(),
      createdBy: (typeof currentUserData !== 'undefined' && currentUserData && currentUserData.name) || '',
    });
    await initCoordFerias();
    showToast('✅ Férias adicionadas.');
  } catch (e) { console.error(e); showToast('Erro ao salvar: ' + e.message); }
}

async function ferRemoverPeriodo(id) {
  if (!_fer.pode || !confirm('Excluir este período de férias?')) return;
  try { await db.collection('coord_ferias_periodos').doc(id).delete(); await initCoordFerias(); }
  catch (e) { console.error(e); showToast('Erro ao excluir: ' + e.message); }
}

window.ferMudarAno = ferMudarAno; window.ferAdicionarPessoa = ferAdicionarPessoa; window.ferRemoverPessoa = ferRemoverPessoa;
window.ferAoEscolherLogin = ferAoEscolherLogin; window.ferSalvarMeusDados = ferSalvarMeusDados; window.ferEditarPessoa = ferEditarPessoa; window.ferCancelarEdicao = ferCancelarEdicao;
window.ferAdicionarPeriodo = ferAdicionarPeriodo; window.ferRemoverPeriodo = ferRemoverPeriodo;
