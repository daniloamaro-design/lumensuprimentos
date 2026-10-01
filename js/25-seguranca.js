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

// Evento é em casa/centro social do Lumen → Local e Endereço já estão
// cadastrados na casa (CASAS_ENDERECOS, populado em loadDynamicData), não
// faz sentido pedir pra digitar nome/endereço de novo.
function segPreencherLocalCasa(prefixo) {
  const casa = document.getElementById(prefixo + 'casa').value;
  if (!casa) return;
  document.getElementById(prefixo + 'local').value = casa;
  document.getElementById(prefixo + 'endereco').value = (typeof CASAS_ENDERECOS !== 'undefined' && CASAS_ENDERECOS[casa]) || '';
}
window.segPreencherLocalCasa = segPreencherLocalCasa;

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
  const qtdPessoas = parseInt(g('qtd-pessoas').value) || 0;
  const menores = g('menores').value;
  const nomeSolicitante = g('nome-solicitante').value.trim();
  const contato = g('contato').value.trim();

  if (!nomeSolicitante || !contato || !tipo || (tipo === 'Outro' && !tipoOutro) || !data || qtdPessoas < 1
      || !ehCasa || (ehCasa === 'sim' && !casa) || !local || !endereco || !menores) {
    return { erro: 'Preencha todos os campos obrigatórios (*).' };
  }

  return {
    evento: tipo === 'Outro' ? ('Outro: ' + tipoOutro) : tipo,
    dataEvento: data,
    horarioInicio: g('horario-inicio').value || '',
    horarioFim: g('horario-fim').value || '',
    local, endereco, casa,
    qtdPessoas,
    temMenores: menores === 'sim',
    solicitanteNome: nomeSolicitante,
    solicitanteContato: contato,
    grupo: g('grupo').value.trim(),
    servico: g('servico').value.trim(),
    obs: g('obs').value.trim(),
  };
}

// ── Convidado: envio da solicitação ────────────────────────────────────────
let _segUltimaSolicitacao = null; // guarda os dados enviados, pra montar a mensagem do WhatsApp

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
    _segUltimaSolicitacao = { ...dados, codigo };
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

// Número fixo pra quem recebe o aviso de nova solicitação de segurança.
const SEG_WHATSAPP_NUMERO = '5585992074073';

function segAvisarWhatsApp() {
  const d = _segUltimaSolicitacao;
  if (!d) return;
  const horario = d.horarioInicio ? `${d.horarioInicio}${d.horarioFim ? '–' + d.horarioFim : ''}` : '—';
  const dataFmt = d.dataEvento ? new Date(d.dataEvento + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
  const linhas = [
    '🛡️ *Nova solicitação de segurança*',
    `Nome: ${d.solicitanteNome || '—'}`,
    `Contato (WhatsApp): ${d.solicitanteContato || '—'}`,
    `Tipo de solicitação: ${d.evento || '—'}`,
    `Data/Horário: ${dataFmt} · ${horario}`,
    `Quantidade de pessoas: ${d.qtdPessoas || '—'}`,
    `Local: ${d.local || '—'}`,
    `Endereço: ${d.endereco || '—'}`,
  ];
  const texto = encodeURIComponent(linhas.join('\n'));
  window.open(`https://wa.me/${SEG_WHATSAPP_NUMERO}?text=${texto}`, '_blank');
}
window.segAvisarWhatsApp = segAvisarWhatsApp;

function segLimparFormulario(prefixo) {
  ['tipo-outro','local','endereco','contato','grupo','servico','obs','nome-solicitante'].forEach(id => { document.getElementById(prefixo + id).value = ''; });
  document.getElementById(prefixo + 'tipo').value = '';
  document.getElementById(prefixo + 'eh-casa').value = '';
  document.getElementById(prefixo + 'menores').value = '';
  document.getElementById(prefixo + 'data').value = '';
  document.getElementById(prefixo + 'horario-inicio').value = '';
  document.getElementById(prefixo + 'horario-fim').value = '';
  document.getElementById(prefixo + 'casa').value = '';
  document.getElementById(prefixo + 'qtd-pessoas').value = '';
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

const SEG_COLUNAS = ['Código','Tipo','Data','Horário','Local','Endereço','Casa/Unidade','Qtd. Pessoas','Menores?','Solicitante','Contato','Grupo','Serviço','Observações','Status','Fornecedor','Valor','Ações'];

function segTabelaVazia(mensagem) {
  return `<div class="table-wrap" style="overflow-x:auto;"><table>
    <thead><tr>${SEG_COLUNAS.map(c => `<th>${c}</th>`).join('')}</tr></thead>
    <tbody><tr><td colspan="${SEG_COLUNAS.length}" class="text-muted" style="text-align:center;padding:24px;">${mensagem}</td></tr></tbody>
  </table></div>`;
}

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
      wrap.innerHTML = segTabelaVazia('Nenhuma solicitação encontrada.');
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
    const linhas = pag.itens.map(s => {
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
        acoes.push(`<button class="btn btn-outline btn-sm" onclick="segAbrirContratar('${s.id}')">✏️ Editar</button>`);
      }
      if (!['cancelado','concluido'].includes(s.status)) {
        acoes.push(`<button class="btn btn-outline btn-sm" onclick="segCancelar('${s.id}')">Cancelar</button>`);
      }
      const horario = s.horarioInicio ? s.horarioInicio + (s.horarioFim ? '–' + s.horarioFim : '') : '—';
      return `<tr>
        <td style="white-space:nowrap;">${s.codigo || '—'}</td>
        <td>${s.evento || '—'}</td>
        <td style="white-space:nowrap;">${fmtData(s.dataEvento)}</td>
        <td style="white-space:nowrap;">${horario}</td>
        <td>${s.local || '—'}</td>
        <td>${s.endereco || '—'}</td>
        <td>${s.casa || '—'}</td>
        <td style="text-align:center;">${s.qtdPessoas || '—'}</td>
        <td style="text-align:center;">${s.temMenores ? '🧒 Sim' : 'Não'}</td>
        <td>${s.solicitanteNome || '—'}</td>
        <td style="white-space:nowrap;">${s.solicitanteContato || '—'}</td>
        <td>${s.grupo || '—'}</td>
        <td>${s.servico || '—'}</td>
        <td>${s.obs || '—'}</td>
        <td style="white-space:nowrap;color:${st.cor};font-weight:600;">${st.label}</td>
        <td>${s.fornecedorNome || '—'}</td>
        <td style="white-space:nowrap;">${s.fornecedorNome ? fmt(s.valor) : '—'}</td>
        <td style="white-space:nowrap;"><div style="display:flex;gap:6px;flex-wrap:wrap;">${acoes.join('')}</div></td>
      </tr>`;
    }).join('');

    wrap.innerHTML = `<div class="table-wrap" style="overflow-x:auto;"><table>
      <thead><tr>${SEG_COLUNAS.map(c => `<th>${c}</th>`).join('')}</tr></thead>
      <tbody>${linhas}</tbody>
    </table></div>` + paginacaoHTML(pag, 'segGoToPage');
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
