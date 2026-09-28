// ─────────────────────────────────────────────────────────────────────────
// 23-seguranca.js — módulo Segurança: solicitação pública (sem login, modo
// convidado — mesmo padrão de "Nova Solicitação de Variedades") → aprovação
// pela gestão → contratação de fornecedor → pagamento unificado no
// Financeiro (compras_financeiro, modulo:'seguranca').
// ─────────────────────────────────────────────────────────────────────────

function segGerarCodigo() { return 'SEG-' + Math.floor(1000 + Math.random() * 9000); }

// ── Toggles compartilhados pelos 2 formulários (convidado "seg-" e admin "seg-c-") ──
function segToggleTipoOutro(tipoSelId, wrapId) {
  document.getElementById(wrapId).style.display = document.getElementById(tipoSelId).value === 'Outro' ? 'block' : 'none';
}
window.segToggleTipoOutro = segToggleTipoOutro;

function segToggleCasa(perguntaSelId, wrapId) {
  document.getElementById(wrapId).style.display = document.getElementById(perguntaSelId).value === 'sim' ? 'block' : 'none';
}
window.segToggleCasa = segToggleCasa;

// Lê os campos de um dos 2 formulários (prefixo 'seg-' convidado, 'seg-c-' admin)
// e valida. Retorna { erro } se faltar algo, ou os dados prontos pra gravar.
function segLerFormulario(prefixo) {
  const g = suf => document.getElementById(prefixo + suf);
  const tipo = g('tipo').value;
  const tipoOutro = g('tipo-outro').value.trim();
  const ehCasa = g('eh-casa').value;
  const casa = ehCasa === 'sim' ? (g('casa').value || '') : '';
  const local = g('local').value.trim();
  const endereco = g('endereco').value.trim();
  const data = g('data').value;
  const qtd = parseInt(g('qtd').value) || 0;
  const menores = g('menores').value;
  const nomeSolicitante = g('nome-solicitante').value.trim();
  const contato = g('contato').value.trim();

  if (!tipo || (tipo === 'Outro' && !tipoOutro) || !data || !ehCasa || (ehCasa === 'sim' && !casa)
      || !local || !endereco || qtd < 1 || !menores || !nomeSolicitante || !contato) {
    return { erro: 'Preencha todos os campos obrigatórios (*).' };
  }

  return {
    evento: tipo === 'Outro' ? ('Outro: ' + tipoOutro) : tipo,
    dataEvento: data,
    horarioInicio: g('horario-inicio').value || '',
    horarioFim: g('horario-fim').value || '',
    local, endereco, casa,
    qtdSegurancas: qtd,
    temMenores: menores === 'sim',
    solicitanteNome: nomeSolicitante,
    solicitanteContato: contato,
    grupo: g('grupo').value.trim(),
    servico: g('servico').value.trim(),
    obs: g('obs').value.trim(),
  };
}

// ── Convidado: envio da solicitação ────────────────────────────────────────
async function segEnviarSolicitacao() {
  const alertEl = document.getElementById('guest-seg-alert');
  alertEl.style.display = 'none';

  const dados = segLerFormulario('seg-');
  if (dados.erro) {
    alertEl.textContent = dados.erro;
    alertEl.style.display = 'block';
    return;
  }

  const btn = document.getElementById('btn-seg-enviar');
  btn.disabled = true; btn.textContent = 'Enviando...';
  const codigo = segGerarCodigo();
  try {
    await db.collection('seguranca_solicitacoes').add({
      codigo,
      ...dados,
      solicitanteUid: currentUser?.uid || '',
      status: 'pendente',
      criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    });
    document.getElementById('guest-seg-form-wrap').style.display = 'none';
    document.getElementById('guest-seg-confirmacao').style.display = 'block';
    document.getElementById('guest-seg-codigo').textContent = codigo;
  } catch (e) {
    alertEl.textContent = 'Erro ao enviar: ' + e.message;
    alertEl.style.display = 'block';
  }
  btn.disabled = false; btn.textContent = 'Enviar Solicitação';
}
window.segEnviarSolicitacao = segEnviarSolicitacao;

function segLimparFormulario(prefixo) {
  ['tipo-outro','local','endereco','contato','grupo','servico','obs','nome-solicitante'].forEach(id => { document.getElementById(prefixo + id).value = ''; });
  document.getElementById(prefixo + 'tipo').value = '';
  document.getElementById(prefixo + 'eh-casa').value = '';
  document.getElementById(prefixo + 'menores').value = '';
  document.getElementById(prefixo + 'data').value = '';
  document.getElementById(prefixo + 'horario-inicio').value = '';
  document.getElementById(prefixo + 'horario-fim').value = '';
  document.getElementById(prefixo + 'casa').value = '';
  document.getElementById(prefixo + 'qtd').value = 1;
  document.getElementById(prefixo + 'tipo-outro-wrap').style.display = 'none';
  document.getElementById(prefixo + 'casa-wrap').style.display = 'none';
}

function segNovaSolicitacao() {
  segLimparFormulario('seg-');
  document.getElementById('guest-seg-confirmacao').style.display = 'none';
  document.getElementById('guest-seg-form-wrap').style.display = 'block';
}
window.segNovaSolicitacao = segNovaSolicitacao;

// ── Admin: lista de solicitações ───────────────────────────────────────────
let _segCache = [];
let segPage = 1;

async function segCarregarLista() {
  const wrap = document.getElementById('seg-lista-wrap');
  if (!wrap) return;
  wrap.innerHTML = '<div class="loading-state"><div class="spinner spinner-dark"></div>Carregando...</div>';
  try {
    const snap = await db.collection('seguranca_solicitacoes').orderBy('criadoEm', 'desc').get();
    _segCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    const filtro = document.getElementById('seg-filtro-status')?.value || '';
    const lista = filtro ? _segCache.filter(s => s.status === filtro) : _segCache;

    if (!lista.length) {
      wrap.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:32px;text-align:center;">Nenhuma solicitação encontrada.</div>';
      return;
    }

    const statusMap = {
      pendente:   { label: '🟡 Pendente',    cor: 'var(--warn)' },
      aprovado:   { label: '✅ Aprovado',     cor: 'var(--ok)' },
      recusado:   { label: '❌ Recusado',     cor: 'var(--danger)' },
      contratado: { label: '🛡️ Contratado',  cor: 'var(--lumen)' },
      concluido:  { label: '✔️ Concluído',    cor: 'var(--ok)' },
      cancelado:  { label: '🚫 Cancelado',    cor: 'var(--text-muted)' },
    };
    const fmtData = s => s ? new Date(s + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
    const fmt = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const pag = paginar(lista, segPage);
    wrap.innerHTML = pag.itens.map(s => {
      const st = statusMap[s.status] || { label: s.status, cor: 'var(--text-muted)' };
      const acoes = [];
      if (s.status === 'pendente') {
        acoes.push(`<button class="btn btn-primary btn-sm" onclick="segAprovar('${s.id}')">Aprovar</button>`);
        acoes.push(`<button class="btn btn-danger btn-sm" onclick="segRecusar('${s.id}')">Recusar</button>`);
      }
      if (s.status === 'aprovado') {
        acoes.push(`<button class="btn btn-primary btn-sm" onclick="segAbrirContratar('${s.id}')">🛡️ Contratar</button>`);
      }
      if (s.status === 'contratado' || s.status === 'concluido') {
        acoes.push(`<button class="btn btn-outline btn-sm" onclick="segAbrirContratar('${s.id}')">✏️ Editar contratação</button>`);
      }
      if (!['cancelado','concluido'].includes(s.status)) {
        acoes.push(`<button class="btn btn-outline btn-sm" onclick="segCancelar('${s.id}')">Cancelar</button>`);
      }
      return `
        <div class="card" style="margin-bottom:10px;padding:14px 16px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">
            <div>
              <div style="font-weight:700;font-size:14px;">${s.evento || '—'} <span style="font-weight:400;font-size:12px;color:var(--text-muted);">${s.codigo || ''}</span></div>
              <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${fmtData(s.dataEvento)}${s.horarioInicio ? ' · ' + s.horarioInicio + (s.horarioFim ? '–' + s.horarioFim : '') : ''} &nbsp;|&nbsp; ${s.local || '—'}${s.endereco ? ' · ' + s.endereco : ''} ${s.casa ? '· ' + s.casa : ''}</div>
              <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">👤 ${s.solicitanteNome || '—'} ${s.solicitanteContato ? '· ' + s.solicitanteContato : ''} ${s.grupo ? '· Grupo: ' + s.grupo : ''} ${s.servico ? '· Serviço: ' + s.servico : ''}</div>
              <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">🛡️ ${s.qtdSegurancas || 1} segurança(s) ${s.temMenores ? ' &nbsp;|&nbsp; 🧒 Terá menores de idade' : ''}</div>
              ${s.obs ? `<div style="font-size:12px;color:var(--text-muted);margin-top:4px;">📝 ${s.obs}</div>` : ''}
              ${s.fornecedorNome ? `<div style="font-size:12px;margin-top:4px;">🏢 ${s.fornecedorNome} — <strong>${fmt(s.valor)}</strong></div>` : ''}
            </div>
            <div style="text-align:right;">
              <div style="font-size:12px;font-weight:700;color:${st.cor};">${st.label}</div>
            </div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;">${acoes.join('')}</div>
        </div>`;
    }).join('') + paginacaoHTML(pag, 'segGoToPage');
  } catch (e) {
    wrap.innerHTML = `<div style="color:var(--danger);padding:20px;text-align:center;">Erro: ${e.message}</div>`;
  }
}
window.segCarregarLista = segCarregarLista;
function segGoToPage(p) { segPage = p; segCarregarLista(); }
window.segGoToPage = segGoToPage;
function segFiltrar() { segPage = 1; segCarregarLista(); }
window.segFiltrar = segFiltrar;

async function segAprovar(id) {
  if (!confirm('Aprovar esta solicitação de segurança?')) return;
  await db.collection('seguranca_solicitacoes').doc(id).update({
    status: 'aprovado', aprovadoEm: firebase.firestore.FieldValue.serverTimestamp(), aprovadoPor: currentUserData?.name || '',
  });
  showToast('✅ Solicitação aprovada.');
  segCarregarLista();
}
window.segAprovar = segAprovar;

async function segRecusar(id) {
  if (!confirm('Recusar esta solicitação de segurança?')) return;
  await db.collection('seguranca_solicitacoes').doc(id).update({
    status: 'recusado', aprovadoEm: firebase.firestore.FieldValue.serverTimestamp(), aprovadoPor: currentUserData?.name || '',
  });
  showToast('Solicitação recusada.');
  segCarregarLista();
}
window.segRecusar = segRecusar;

async function segCancelar(id) {
  if (!confirm('Cancelar esta solicitação de segurança?')) return;
  await db.collection('seguranca_solicitacoes').doc(id).update({ status: 'cancelado' });
  showToast('Solicitação cancelada.');
  segCarregarLista();
}
window.segCancelar = segCancelar;

// ── Admin: criar solicitação direto no sistema (sem passar pelo link de convidado) ──
function segAbrirCriar() {
  segLimparFormulario('seg-c-');
  const sel = document.getElementById('seg-c-casa');
  sel.innerHTML = '<option value="">Selecione...</option>' + (typeof CASAS !== 'undefined' ? CASAS : []).map(c => `<option value="${c}">${c}</option>`).join('');
  document.getElementById('modal-seg-criar').classList.remove('hidden');
}
window.segAbrirCriar = segAbrirCriar;

function segFecharCriar() {
  document.getElementById('modal-seg-criar').classList.add('hidden');
}
window.segFecharCriar = segFecharCriar;

async function segSalvarCriacao() {
  const dados = segLerFormulario('seg-c-');
  if (dados.erro) { showToast(dados.erro); return; }

  setBtnLoading('btn-seg-salvar-criar', true);
  const codigo = segGerarCodigo();
  try {
    await db.collection('seguranca_solicitacoes').add({
      codigo,
      ...dados,
      solicitanteUid: currentUser?.uid || '',
      status: 'pendente',
      criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast(`✅ Solicitação ${codigo} criada!`);
    segFecharCriar();
    segCarregarLista();
  } catch (e) {
    showToast('Erro ao criar: ' + e.message);
  }
  setBtnLoading('btn-seg-salvar-criar', false);
}
window.segSalvarCriacao = segSalvarCriacao;

// ── Admin: contratação (fornecedor + valor) ────────────────────────────────
let _segContratarId = null;

async function segAbrirContratar(id) {
  const s = _segCache.find(x => x.id === id);
  if (!s) return;
  _segContratarId = id;
  document.getElementById('seg-contratar-label').textContent = `${s.evento} — ${s.codigo || ''}`;
  document.getElementById('seg-contratar-valor').value = s.valor || '';

  const sel = document.getElementById('seg-contratar-fornecedor');
  sel.innerHTML = '<option value="">Carregando...</option>';
  try {
    const snap = await db.collection('suppliers').orderBy('nome').get();
    const forn = snap.docs.map(x => ({ id: x.id, ...x.data() })).filter(f => Array.isArray(f.tipos) && f.tipos.includes('seguranca'));
    sel.innerHTML = '<option value="">Selecione...</option>' +
      forn.map(f => `<option value="${f.id}" data-nome="${f.nome.replace(/"/g,'&quot;')}" ${f.id === s.fornecedorId ? 'selected' : ''}>${f.nome}</option>`).join('');
    if (!forn.length) sel.innerHTML = '<option value="">Nenhum fornecedor tipo Segurança cadastrado</option>';
  } catch (e) {
    sel.innerHTML = '<option value="">Erro ao carregar fornecedores</option>';
  }
  document.getElementById('modal-seg-contratar').classList.remove('hidden');
}
window.segAbrirContratar = segAbrirContratar;

function segFecharContratar() {
  document.getElementById('modal-seg-contratar').classList.add('hidden');
  _segContratarId = null;
}
window.segFecharContratar = segFecharContratar;

async function segSalvarContratacao() {
  const s = _segCache.find(x => x.id === _segContratarId);
  if (!s) return;
  const sel = document.getElementById('seg-contratar-fornecedor');
  const fornecedorId = sel.value;
  const fornecedorNome = sel.selectedOptions[0]?.dataset.nome || '';
  const valor = parseFloat(document.getElementById('seg-contratar-valor').value) || 0;

  if (!fornecedorId || valor <= 0) { showToast('Selecione o fornecedor e informe o valor.'); return; }

  setBtnLoading('btn-seg-salvar-contratacao', true);
  try {
    await db.collection('seguranca_solicitacoes').doc(s.id).update({
      fornecedorId, fornecedorNome, valor, status: 'contratado',
    });
    await _syncFinanceiroLancar({
      pedidoRef: s.id, pedidoId: s.id,
      fornecedor: fornecedorNome, fornecedorId,
      classificacao: 'Segurança', destinatario: s.evento,
      valor, pago: '', valorPago: 0,
      modulo: 'seguranca', dataRef: s.dataEvento,
    });
    showToast('✅ Contratação registrada! O pagamento é feito no Financeiro.');
    segFecharContratar();
    segCarregarLista();
  } catch (e) {
    showToast('Erro: ' + e.message);
  }
  setBtnLoading('btn-seg-salvar-contratacao', false);
}
window.segSalvarContratacao = segSalvarContratacao;
