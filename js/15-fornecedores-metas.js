// Extraído de index.html (fornecedores: limites/dashboards/alertas + metas e análise + sincronização) em 2026-07-27
// ─────────────────────────────────────────────
// 🔄 RECALCULAR LIMITES DOS FORNECEDORES
// ─────────────────────────────────────────────
async function recalcularLimitesFornecedores() {
  if (!confirm('Isso vai recalcular o "Limite Utilizado" de todos os fornecedores com base nos lançamentos financeiros não pagos.\n\nDeseja continuar?')) return;
  showToast('⏳ Recalculando limites, aguarde...');
  try {
    const snap = await db.collection('compras_financeiro').where('pago', '!=', 'Sim').get();
    const totaisPorId   = {};
    const totaisPorNome = {};
    snap.docs.forEach(doc => {
      const d = doc.data();
      const val = parseFloat(d.valor) || 0;
      if (!val) return;
      if (d.fornecedorId) {
        totaisPorId[d.fornecedorId] = (totaisPorId[d.fornecedorId] || 0) + val;
      } else if (d.fornecedor) {
        const key = d.fornecedor.trim().toLowerCase();
        totaisPorNome[key] = (totaisPorNome[key] || 0) + val;
      }
    });
    const supSnap = await db.collection('suppliers').get();
    const batch = db.batch();
    let count = 0;
    supSnap.docs.forEach(doc => {
      const s = doc.data();
      let total = totaisPorId[doc.id] || 0;
      if (!total && s.nome) {
        const key = s.nome.trim().toLowerCase();
        total = totaisPorNome[key] || 0;
        if (!total) {
          for (const [k, v] of Object.entries(totaisPorNome)) {
            if (k.includes(key.slice(0,6)) || key.includes(k.slice(0,6))) total += v;
          }
        }
      }
      batch.update(doc.ref, { utilizado: total });
      count++;
    });
    await batch.commit();
    await loadSuppliers();
    showToast(`✅ Limites recalculados! ${count} fornecedores atualizados.`);
  } catch(e) {
    console.error(e);
    showToast('❌ Erro: ' + e.message);
  }
}

// ─────────────────────────────────────────────
// 📊 DASHBOARD FINANCEIRO POR FORNECEDOR
// ─────────────────────────────────────────────
let chartSuppLimites = null;

function renderSuppDashboard() {
  const canvas = document.getElementById('chart-supp-limites');
  if (!canvas) return;

  const fornComLimite = suppliersCache.filter(s => parseFloat(s.limite) > 0);
  if (fornComLimite.length === 0) {
    canvas.parentElement.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">Nenhum fornecedor com limite cadastrado</div>';
    return;
  }

  const labels     = fornComLimite.map(s => s.nome);
  const utilizado  = fornComLimite.map(s => parseFloat(s.utilizado) || 0);
  const disponivel = fornComLimite.map(s => Math.max(0, (parseFloat(s.limite)||0) - (parseFloat(s.utilizado)||0)));

  if (chartSuppLimites) chartSuppLimites.destroy();
  chartSuppLimites = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Utilizado (R$)',   data: utilizado,  backgroundColor: '#ef444488', borderColor: '#ef4444', borderWidth: 1 },
        { label: 'Disponível (R$)',  data: disponivel, backgroundColor: '#22c55e44', borderColor: '#22c55e', borderWidth: 1 },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
      scales: {
        x: { stacked: true },
        y: { stacked: true, ticks: { callback: v => 'R$' + v.toLocaleString('pt-BR') } }
      }
    }
  });
}

// ─────────────────────────────────────────────
// 📋 HISTÓRICO DE PAGAMENTOS POR FORNECEDOR
// ─────────────────────────────────────────────
async function abrirHistoricoFornecedor(fornId, fornNome) {
  document.getElementById('modal-hist-forn-title').textContent = '📋 Histórico — ' + fornNome;
  document.getElementById('hf-tbody').innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;"><div class="spinner spinner-dark"></div></td></tr>';
  document.getElementById('hf-total-aberto').textContent = '...';
  document.getElementById('hf-total-pago').textContent   = '...';
  document.getElementById('hf-prox-venc').textContent    = '...';
  openModal('modal-hist-fornecedor');

  try {
    // Busca por ID e por nome (para histórico importado)
    const [snapId, snapNome] = await Promise.all([
      db.collection('compras_financeiro').where('fornecedorId','==',fornId).orderBy('createdAt','desc').get().catch(()=>({docs:[]})),
      db.collection('compras_financeiro').where('fornecedor','==',fornNome).orderBy('createdAt','desc').get().catch(()=>({docs:[]}))
    ]);

    // Merge e deduplica
    const seenIds = new Set();
    const docs = [...snapId.docs, ...snapNome.docs]
      .filter(d => { if (seenIds.has(d.id)) return false; seenIds.add(d.id); return true; })
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a,b) => {
        const da = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
        const db2 = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
        return db2 - da;
      });

    let totalAberto = 0, totalPago = 0, proxVenc = null;
    const hoje = new Date(); hoje.setHours(0,0,0,0);

    docs.forEach(d => {
      const val = parseFloat(d.valor) || 0;
      if (d.pago === 'Sim') totalPago += val;
      else {
        totalAberto += val;
        if (d.vencimentoStr) {
          const vd = new Date(d.vencimentoStr + 'T00:00:00');
          if (vd >= hoje && (!proxVenc || vd < proxVenc)) proxVenc = vd;
        }
      }
    });

    document.getElementById('hf-total-aberto').textContent = 'R$ ' + totalAberto.toLocaleString('pt-BR',{minimumFractionDigits:2});
    document.getElementById('hf-total-pago').textContent   = 'R$ ' + totalPago.toLocaleString('pt-BR',{minimumFractionDigits:2});
    document.getElementById('hf-prox-venc').textContent    = proxVenc ? proxVenc.toLocaleDateString('pt-BR') : '—';

    if (docs.length === 0) {
      document.getElementById('hf-tbody').innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted);">Nenhum lançamento encontrado</td></tr>';
      return;
    }

    document.getElementById('hf-tbody').innerHTML = docs.map(d => {
      const isPago    = d.pago === 'Sim';
      const val       = parseFloat(d.valor) || 0;
      const vencDate  = d.vencimentoStr ? new Date(d.vencimentoStr + 'T00:00:00') : null;
      const isVencido = !isPago && vencDate && vencDate < hoje;
      const vencLabel = vencDate ? `${vencDate.toLocaleDateString('pt-BR')}${isVencido ? ' <span style="color:var(--danger);font-size:10px;">⚠️ atrasado</span>' : ''}` : '—';
      const statusHtml = isPago
        ? '<span style="color:var(--ok);font-weight:700;">✅ Pago</span>'
        : isVencido
          ? '<span style="color:var(--danger);font-weight:700;">🔴 Vencido</span>'
          : '<span style="color:var(--warn);font-weight:700;">⏳ Pendente</span>';

      return `<tr style="${isVencido ? 'background:rgba(198,40,40,0.06);' : ''}">
        <td style="font-size:12px;">${d.mes || '—'}/${d.ano || ''}</td>
        <td style="font-size:12px;">${d.destinatario || d.house || '—'}</td>
        <td style="font-size:12px;">${d.classificacao || '—'}</td>
        <td style="font-size:12px;">${vencLabel}</td>
        <td style="text-align:right;font-weight:700;">R$ ${val.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
        <td style="text-align:center;">${statusHtml}</td>
      </tr>`;
    }).join('');

  } catch(e) {
    console.error('abrirHistoricoFornecedor error:', e);
    document.getElementById('hf-tbody').innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--danger);">Erro: ${e.message}</td></tr>`;
  }
}

// ─────────────────────────────────────────────
// 🔔 ALERTAS DE VENCIMENTO PRÓXIMO
// ─────────────────────────────────────────────
async function verificarVencimentos() {
  openModal('modal-alertas-venc');
  const body = document.getElementById('alertas-venc-body');
  body.innerHTML = '<div style="text-align:center;padding:24px;"><div class="spinner spinner-dark"></div></div>';

  try {
    const hoje    = new Date(); hoje.setHours(0,0,0,0);
    const em7dias = new Date(hoje); em7dias.setDate(hoje.getDate() + 7);
    const em15dias= new Date(hoje); em15dias.setDate(hoje.getDate() + 15);

    const snap = await db.collection('compras_financeiro')
      .where('pago', '!=', 'Sim')
      .get();

    const vencendoHoje = [], vencendo7 = [], vencendo15 = [], vencidos = [];

    snap.docs.forEach(doc => {
      const d   = doc.data();
      const val = parseFloat(d.valor) || 0;
      if (!d.vencimentoStr || !val) return;
      const vd = new Date(d.vencimentoStr + 'T00:00:00');
      const item = { ...d, id: doc.id, vd, val };

      if (vd < hoje)         vencidos.push(item);
      else if (+vd === +hoje) vencendoHoje.push(item);
      else if (vd <= em7dias) vencendo7.push(item);
      else if (vd <= em15dias) vencendo15.push(item);
    });

    const renderGrupo = (titulo, cor, items) => {
      if (!items.length) return '';
      const total = items.reduce((s, i) => s + i.val, 0);
      return `<div style="margin-bottom:16px;">
        <div style="font-weight:700;color:${cor};font-size:13px;margin-bottom:8px;">${titulo} — ${items.length} lançamento(s) · R$ ${total.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
        ${items.map(i => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--surface);border-radius:8px;margin-bottom:6px;border:1px solid var(--border);">
            <div>
              <span style="font-weight:700;">${i.fornecedor || '—'}</span>
              <span style="color:var(--text-muted);font-size:12px;margin-left:8px;">${i.destinatario || ''} · ${i.mes || ''}/${i.ano || ''}</span>
            </div>
            <div style="display:flex;gap:12px;align-items:center;">
              <span style="font-size:12px;color:var(--text-muted);">Venc: ${i.vd.toLocaleDateString('pt-BR')}</span>
              <strong style="color:${cor};">R$ ${i.val.toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong>
            </div>
          </div>`).join('')}
      </div>`;
    };

    body.innerHTML = [
      renderGrupo('🔴 Vencidos', 'var(--danger)', vencidos),
      renderGrupo('🟠 Vence Hoje', '#f97316', vencendoHoje),
      renderGrupo('🟡 Vence em até 7 dias', 'var(--warn)', vencendo7),
      renderGrupo('🔵 Vence em até 15 dias', 'var(--lumen)', vencendo15),
    ].join('') || '<div style="text-align:center;padding:32px;color:var(--ok);">✅ Nenhum vencimento próximo!</div>';

    // Guarda para envio de email
    window._alertasVencimento = { vencidos, vencendoHoje, vencendo7, vencendo15 };

  } catch(e) {
    body.innerHTML = `<div style="color:var(--danger);padding:16px;">Erro: ${e.message}</div>`;
  }
}

async function enviarAlertasVencimento() {
  const dados = window._alertasVencimento;
  if (!dados) return;

  const total = dados.vencidos.length + dados.vencendoHoje.length + dados.vencendo7.length;
  if (total === 0) { showToast('Nenhum alerta para enviar!'); return; }

  const linhas = [
    ...dados.vencidos.map(i => `🔴 VENCIDO: ${i.fornecedor} — R$ ${i.val.toFixed(2)} (${i.destinatario||''}) — Venc: ${i.vd.toLocaleDateString('pt-BR')}`),
    ...dados.vencendoHoje.map(i => `🟠 VENCE HOJE: ${i.fornecedor} — R$ ${i.val.toFixed(2)} (${i.destinatario||''})`),
    ...dados.vencendo7.map(i => `🟡 Vence em 7 dias: ${i.fornecedor} — R$ ${i.val.toFixed(2)} (${i.destinatario||''}) — Venc: ${i.vd.toLocaleDateString('pt-BR')}`),
  ].join('\n');

  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_email:   ADMIN_EMAIL,
      to_name:    'Administrador',
      from_name:  'Sistema Lumen',
      subject:    `🔔 ${total} boleto(s) vencendo/vencido(s) — Lumen Estoque`,
      message:    `Prezado Administrador,\n\nOs seguintes boletos precisam de atenção:\n\n${linhas}\n\nAcesse o sistema para realizar os pagamentos.`,
      reply_to:   ADMIN_EMAIL,
    });
    showToast('✅ Alertas enviados por e-mail!');
    closeModal('modal-alertas-venc');
  } catch(e) {
    showToast('❌ Erro ao enviar e-mail: ' + e.message);
  }
}

// ─────────────────────────────────────────────
// 📦 APROVAÇÃO EM LOTE POR CASA
// ─────────────────────────────────────────────
async function opcAprovarLoteCasa(casaNome, tipo) {
  // tipo = 'coord' ou 'gerente'
  const pedidosCasa = opcPedidos.filter(p => p.house === casaNome);
  const cotIds = pedidosCasa.flatMap(p => (opcCotacoes[p.id] || []).map(q => q.id));
  if (!cotIds.length) { showToast('Nenhuma cotação encontrada para esta casa.'); return; }

  const label = tipo === 'gerente' ? 'Gerente' : 'Coordenador';
  if (!confirm(`Aprovar TODAS as ${cotIds.length} cotação(ões) da casa "${casaNome}" como ${label}?`)) return;

  showToast(`⏳ Aprovando ${cotIds.length} cotações...`);
  const batch = db.batch();
  cotIds.forEach(id => {
    const ref = db.collection('quotations').doc(id);
    if (tipo === 'gerente') {
      // Gerente aprova: marca também coordenador como aprovado para consistência
      batch.update(ref, { statusGerente: 'aprovado', gerenteNome: currentUserData?.name || '', statusCoordenador: 'aprovado', coordenadorNome: currentUserData?.name || '', status: 'aprovado' });
    } else {
      batch.update(ref, { statusCoordenador: 'aprovado', coordenadorNome: currentUserData?.name || '', statusGerente: 'aguardando' });
    }
  });
  await batch.commit();

  // Atualiza cache local
  cotIds.forEach(id => { opcAutorizados[id] = true; });
  opcRenderizar();
  showToast(`✅ ${cotIds.length} cotações aprovadas como ${label}!`);
}

// Hook: render supplier dashboard when suppliers load
const _origLoadSuppliers = typeof loadSuppliers === 'function' ? loadSuppliers : null;

// ═══════════════════════════════════════════════════════════════
// 🎯 METAS E ANÁLISE ECONÔMICA
// ═══════════════════════════════════════════════════════════════
let chartMetaCat   = null;
let chartProjMensal= null;
let _metasCache    = {}; // { catKey: { metaMes, metaSemana } }
let _gastosCache   = {}; // { catKey: { meses: {MÊS: total} } }

const MESES_ORDEM = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];

function metasSetTab(tab, btn) {
  ['metas','analise','projecao'].forEach(t => {
    const el = document.getElementById('metas-tab-' + t);
    const b  = document.getElementById('metas-tab-btn-' + t);
    if (el) el.style.display = t === tab ? '' : 'none';
    if (b) {
      b.style.color      = t === tab ? 'var(--lumen)' : 'var(--text-muted)';
      b.style.fontWeight = t === tab ? '700' : '600';
      b.style.borderBottom = t === tab ? '2px solid var(--lumen)' : 'none';
    }
  });
  if (tab === 'analise')  carregarAnalise();
  if (tab === 'projecao') carregarProjecao();
}

async function initMetas() {
  await carregarMetas();
}

// ── Carrega metas do Firestore e monta o formulário ──
async function carregarMetas() {
  const ano = document.getElementById('metas-ano')?.value || new Date().getFullYear();
  const wrap = document.getElementById('metas-form-categorias');
  if (!wrap) return;
  wrap.innerHTML = '<div style="color:var(--text-muted);padding:16px;">Carregando...</div>';

  try {
    const snap = await db.collection('metas').doc('categorias_' + ano).get();
    _metasCache = snap.exists ? (snap.data() || {}) : {};

    // Busca médias reais dos gastos
    let gastosReais = {};
    try {
      gastosReais = await buscarGastosReais(ano);
    } catch(e) { gastosReais = {}; }

    // Formulário com 6 colunas: real e meta para mês, semana e ano
    const cats = Object.entries(CATEGORIAS);
    const fmtN = function(v) { return v > 0 ? 'R$ ' + v.toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:0}) : '—'; };
    const card = function(label, valor, isReal) {
      const bg  = isReal ? 'var(--ok-bg)' : 'var(--surface)';
      const cor = isReal ? 'var(--ok)' : 'var(--text)';
      const brd = isReal ? '1px solid var(--ok)' : '1px solid var(--border)';
      return '<div style="background:' + bg + ';border:' + brd + ';border-radius:6px;padding:8px 10px;">' +
        '<div style="font-size:10px;color:' + (isReal ? 'var(--ok)' : 'var(--text-muted)') + ';font-weight:700;margin-bottom:4px;">' + label + '</div>' +
        '<div style="font-size:14px;font-weight:800;color:' + cor + ';">' + valor + '</div>' +
        '</div>';
    };
    wrap.innerHTML = cats.map(function([key, cat]) {
      const m = _metasCache[key] || {};
      const g = gastosReais[key] || { meses: {}, semanas: {}, total: 0 };

      // Médias reais mensais
      const mesesComDados = Object.values(g.meses).filter(function(v) { return v > 0; });
      const realMesMedia  = mesesComDados.length > 0 ? g.total / mesesComDados.length : 0;

      // Médias reais semanais
      // CORREÇÃO: fórmula anterior dividia soma parcial das semanas pelo count (registros sem data
      // ficam de fora e distorcem o numerador). A média semanal correta é realMesMedia / 4.33.
      const realSemMedia = realMesMedia > 0 ? realMesMedia / 4.33 : 0;

      const realAnual    = g.total;
      const metaAnoCalc  = parseFloat(m.metaAno) || (parseFloat(m.metaMes)||0) * 12;

      return '<div style="background:var(--surface);border-radius:10px;border:1px solid var(--border);margin-bottom:6px;overflow:hidden;">' +
        '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(255,255,255,0.03);border-bottom:1px solid var(--border);">' +
        '<span style="font-size:20px;">' + cat.icon + '</span>' +
        '<span style="font-weight:700;font-size:14px;">' + cat.nome + '</span>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--border);">' +

        // MENSAL
        '<div style="background:var(--surface);padding:12px 14px;">' +
        '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--lumen);margin-bottom:8px;">📅 MENSAL</div>' +
        card('Real Médio Mensal', fmtN(realMesMedia), true) +
        '<div style="margin-top:8px;"><label class="form-label" style="font-size:10px;">Meta Mensal (R$)</label>' +
        '<input type="number" class="form-input" id="meta-mes-' + key + '" value="' + (m.metaMes || '') + '" placeholder="0,00" min="0" step="100"></div>' +
        '</div>' +

        // SEMANAL
        '<div style="background:var(--surface);padding:12px 14px;">' +
        '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--lumen);margin-bottom:8px;">📆 SEMANAL</div>' +
        card('Real Médio Semanal', fmtN(realSemMedia), true) +
        '<div style="margin-top:8px;"><label class="form-label" style="font-size:10px;">Meta Semanal (R$)</label>' +
        '<input type="number" class="form-input" id="meta-sem-' + key + '" value="' + (m.metaSemana || '') + '" placeholder="0,00" min="0" step="100"></div>' +
        '</div>' +

        // ANUAL
        '<div style="background:var(--surface);padding:12px 14px;">' +
        '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--lumen);margin-bottom:8px;">📊 ANUAL</div>' +
        card('Real Acumulado ' + ano, fmtN(realAnual), true) +
        '<div style="margin-top:8px;"><label class="form-label" style="font-size:10px;">Meta Anual (R$)</label>' +
        '<input type="number" class="form-input" id="meta-ano-' + key + '" value="' + (m.metaAno || '') + '" placeholder="' + (metaAnoCalc > 0 ? metaAnoCalc.toLocaleString('pt-BR',{maximumFractionDigits:0}) : 'auto (mês×12)') + '" min="0" step="1000"></div>' +
        '</div>' +

        '</div></div>';
    }).join('');
  } catch(e) {
    wrap.innerHTML = `<div style="color:var(--danger);">Erro: ${e.message}</div>`;
  }
}

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
    await db.collection('metas').doc('categorias_' + ano).set(data, { merge: true });
    _metasCache = data;
    showToast('✅ Metas salvas com sucesso!');
  } catch(e) {
    showToast('❌ Erro ao salvar: ' + e.message);
  }
}

// ── Busca gastos reais do financeiro agrupados por categoria e mês ──
async function buscarGastosReais(ano) {
  if (_gastosCache[ano]) return _gastosCache[ano];

  const snap = await db.collection('compras_financeiro')
    .where('ano', '==', parseInt(ano))
    .get();

  const resultado = {};
  Object.keys(CATEGORIAS).forEach(k => {
    resultado[k] = { meses: {}, semanas: {}, total: 0 };
  });
  resultado['outros'] = { meses: {}, semanas: {}, total: 0 };

  snap.docs.forEach(doc => {
    const d   = doc.data();
    const val = parseFloat(d.valor) || 0;
    if (!val) return;

    const mes     = (d.mes || '').toUpperCase().trim();
    const classif = (d.classificacao || '').toLowerCase();
    let catKey    = 'outros';

    if (d.catKey && resultado[d.catKey]) {
      catKey = d.catKey;
    } else {
      for (const [k, cat] of Object.entries(CATEGORIAS)) {
        if (classif.includes(cat.nome.toLowerCase()) || cat.nome.toLowerCase().includes(classif)) {
          catKey = k; break;
        }
      }
    }

    if (!resultado[catKey]) resultado[catKey] = { meses: {}, semanas: {}, total: 0 };
    resultado[catKey].total += val;
    resultado[catKey].meses[mes] = (resultado[catKey].meses[mes] || 0) + val;

    // Agrupa por semana real usando dataCompraSerial ou vencimentoStr
    // CORREÇÃO: dataCompraSerial pode ser serial Excel (~45000) ou timestamp JS (~1746700000000)
    let dataRef = null;
    if (d.dataCompraSerial && d.dataCompraSerial > 0) {
      if (d.dataCompraSerial > 1000000000) {
        // Timestamp JS (milissegundos) — registros criados pelo sistema
        dataRef = new Date(d.dataCompraSerial);
      } else {
        // Serial Excel (dias desde 01/01/1900) — registros importados via planilha
        dataRef = excelSerialToDate(d.dataCompraSerial);
      }
    } else if (d.dataCompraStr) {
      // Tenta usar a string de data armazenada (formato dd/mm/aaaa ou yyyy-mm-dd)
      const parts = d.dataCompraStr.includes('/') ? d.dataCompraStr.split('/') : null;
      if (parts && parts.length === 3) {
        dataRef = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`);
      }
    }
    // Fallback: usa vencimentoStr apenas se não tiver data de compra
    if ((!dataRef || isNaN(dataRef)) && d.vencimentoStr) {
      dataRef = new Date(d.vencimentoStr + 'T00:00:00');
    }
    // Último recurso: createdAt (data de registro no sistema)
    if ((!dataRef || isNaN(dataRef)) && d.createdAt && d.createdAt.toDate) {
      dataRef = d.createdAt.toDate();
    }

    // Só adiciona à semana se a data pertencer ao ano correto
    if (dataRef && !isNaN(dataRef) && dataRef.getFullYear() === parseInt(ano)) {
      const dia  = dataRef.getDate();
      const mesK = MESES_PT[dataRef.getMonth()];
      const sem  = dia <= 7 ? 1 : dia <= 14 ? 2 : dia <= 21 ? 3 : 4;
      const semKey = mesK + '_' + sem; // ex: MAIO_2
      resultado[catKey].semanas[semKey] = (resultado[catKey].semanas[semKey] || 0) + val;
    }
  });

  _gastosCache[ano] = resultado;
  return resultado;
}

// ── Busca gastos por intervalo de datas exato (seg–dom real) ──
async function buscarGastosIntervalo(dataIni, dataFim) {
  const cacheKey = `int_${dataIni.getTime()}_${dataFim.getTime()}`;
  if (_gastosCache[cacheKey]) return _gastosCache[cacheKey];

  const resultado = {};
  Object.keys(CATEGORIAS).forEach(k => { resultado[k] = 0; });
  resultado['outros'] = 0;

  try {
    // Busca compras cujo ano cobre o intervalo (pode cruzar meses)
    const anos = [...new Set([dataIni.getFullYear(), dataFim.getFullYear()])];
    for (const ano of anos) {
      const snap = await db.collection('compras_financeiro')
        .where('ano', '==', ano)
        .get();

      snap.docs.forEach(doc => {
        const d   = doc.data();
        const val = parseFloat(d.valor) || 0;
        if (!val) return;

        let dataRef = null;
        if (d.dataCompraSerial)       dataRef = new Date(d.dataCompraSerial);
        else if (d.vencimentoStr)     dataRef = new Date(d.vencimentoStr + 'T00:00:00');
        else if (d.createdAt?.toDate) dataRef = d.createdAt.toDate();
        if (!dataRef || isNaN(dataRef)) return;
        if (dataRef < dataIni || dataRef > dataFim) return;

        const classif = (d.classificacao || '').toLowerCase();
        let catKey = 'outros';
        if (d.catKey && resultado[d.catKey] !== undefined) catKey = d.catKey;
        else {
          for (const [k, cat] of Object.entries(CATEGORIAS)) {
            if (classif.includes(cat.nome.toLowerCase())) { catKey = k; break; }
          }
        }
        resultado[catKey] = (resultado[catKey] || 0) + val;
      });
    }
  } catch(e) { console.warn('buscarGastosIntervalo error:', e); }

  _gastosCache[cacheKey] = resultado;
  return resultado;
}

// ── Análise de Desempenho ──
async function carregarAnalise() {
  const ano     = document.getElementById('analise-ano')?.value || '2026';
  // Limpa cache para garantir dados frescos ao mudar ano/período
  Object.keys(_gastosCache).filter(k => k.startsWith(ano) || k.startsWith('int_')).forEach(k => delete _gastosCache[k]);
  const periodo = document.getElementById('analise-periodo')?.value || 'mensal';
  const mesFilt = document.getElementById('analise-mes')?.value || '';
  const tbody   = document.getElementById('analise-tbody');
  if (!tbody) return;

  // ── Lê datas do intervalo semanal ──
  let dataIniSem = null, dataFimSem = null, mesSem = '';
  if (periodo === 'semanal') {
    const iniStr = document.getElementById('analise-data-ini')?.value;
    const fimStr = document.getElementById('analise-data-fim')?.value;
    if (!iniStr || !fimStr) { setSemanaAtual(); return; } // auto-preenche e chama de novo
    dataIniSem = new Date(iniStr + 'T00:00:00');
    dataFimSem = new Date(fimStr + 'T23:59:59');
    mesSem = MESES_PT[dataIniSem.getMonth()];
    atualizarLabelSemana(dataIniSem, dataFimSem);
  }

  try {
    const [snapMeta, gastos] = await Promise.all([
      db.collection('metas').doc('categorias_' + ano).get(),
      buscarGastosReais(ano)
    ]);
    const metas = snapMeta.exists ? snapMeta.data() : {};

    // Para período semanal, busca dados reais do intervalo de datas
    let gastosSemanais = {};
    if (periodo === 'semanal' && dataIniSem && dataFimSem) {
      gastosSemanais = await buscarGastosIntervalo(dataIniSem, dataFimSem);
    }

    const mesAtualIdx = new Date().getMonth();
    const fmt = v => 'R$ ' + Math.abs(v||0).toLocaleString('pt-BR', {minimumFractionDigits:2});
    const fmtV = (v, meta) => {
      if (meta <= 0) return '—';
      const pct = ((v/meta)-1)*100;
      const cor = pct > 0 ? 'var(--danger)' : 'var(--ok)';
      return '<span style="color:' + cor + ';font-weight:700;">' + (pct>0?'+':'') + pct.toFixed(1) + '%</span>';
    };
    const fmtDif = (real, meta) => {
      const d = real - meta;
      const cor = d > 0 ? 'var(--danger)' : 'var(--ok)';
      return '<span style="color:' + cor + ';font-weight:700;">' + (d>0?'+':'') + fmt(d) + '</span>';
    };

    let totalRealPer = 0, totalMetaPer = 0;
    const rows = [], labelsChart = [], dataReal = [], dataMeta = [];

    Object.entries(CATEGORIAS).forEach(([key, cat]) => {
      const m = metas[key] || {};
      const g = gastos[key] || { meses: {}, semanas: {}, total: 0 };

      const metaMes = parseFloat(m.metaMes) || 0;
      const metaSem = parseFloat(m.metaSemana) || 0;
      const metaAno = parseFloat(m.metaAno) || metaMes * 12;

      // Realizado mensal (mês de referência)
      const mesRef  = periodo === 'semanal' ? mesSem : (mesFilt || MESES_PT[mesAtualIdx]);
      const realMes = g.meses[mesRef] || 0;

      // Realizado semanal — dado REAL se período semanal, estimado se não
      const realSemReal = periodo === 'semanal' ? (gastosSemanais[key] || 0) : 0;
      const realSemEst  = realMes / 4.33; // estimativa quando não é filtro semanal

      // Realizado e meta do período selecionado
      let realPer = 0, metaPer = 0;
      if (periodo === 'semanal') {
        realPer = realSemReal;
        metaPer = metaSem;
      } else if (periodo === 'mensal') {
        realPer = realMes;
        metaPer = metaMes;
      } else {
        realPer = g.total;
        metaPer = metaMes * (mesAtualIdx + 1);
      }

      if (!metaMes && !metaSem && !realMes && !g.total) return;

      totalRealPer += realPer;
      totalMetaPer += metaPer;

      rows.push({ key, cat, metaPer, realPer, metaMes, realMes, metaSem, realSemReal, realSemEst });
      labelsChart.push(cat.icon + ' ' + cat.nome);
      dataReal.push(realPer);
      dataMeta.push(metaPer);
    });

    // Header é fixo no HTML — apenas atualiza o span do período se necessário

    // Cards resumo
    const economia     = totalMetaPer - totalRealPer;
    const variacaoTot  = totalMetaPer > 0 ? ((totalRealPer/totalMetaPer)-1)*100 : 0;
    document.getElementById('analise-total-real').textContent = fmt(totalRealPer);
    document.getElementById('analise-total-meta').textContent = fmt(totalMetaPer);
    document.getElementById('analise-variacao').innerHTML =
      '<span style="color:' + (variacaoTot>10?'var(--danger)':variacaoTot>0?'var(--warn)':'var(--ok)') + ';">' +
      (variacaoTot>0?'+':'') + variacaoTot.toFixed(1) + '%</span>';
    document.getElementById('analise-economia').innerHTML =
      '<span style="color:' + (economia>=0?'var(--ok)':'var(--danger)') + ';">' +
      (economia>=0?'💚 Economizou ':'🔴 Excesso ') + fmt(economia) + '</span>';

    // Tabela: Meta Mês | Real Mês | Var R$ | Var % | Meta Sem | Real Sem | Var R$ | Var % | Status
    tbody.innerHTML = rows.sort(function(a,b) { return b.realMes - a.realMes; }).map(function(r) {
      // Status baseado no mês (principal referência)
      const varMesR  = r.realMes - r.metaMes;
      const varMesP  = r.metaMes > 0 ? ((r.realMes/r.metaMes)-1)*100 : null;
      // Status baseado na semana se período semanal
      const varSemR  = r.realSemReal - r.metaSem;
      const varSemP  = r.metaSem > 0 && r.realSemReal > 0 ? ((r.realSemReal/r.metaSem)-1)*100 : null;

      // Status geral (usa mês como referência principal)
      const stRef = periodo === 'semanal' && r.metaSem > 0
  ? varSemP
  : (r.metaMes > 0 ? varMesP : null);
      const stLbl = stRef === null ? '<span style="color:var(--text-muted);">—</span>'
        : stRef > 15 ? '<span style="color:var(--danger);font-weight:700;">🔴 Acima</span>'
        : stRef > 0  ? '<span style="color:var(--warn);font-weight:700;">⚠️ Atenção</span>'
        : '<span style="color:var(--ok);font-weight:700;">✅ OK</span>';

      const realSemExib = r.realSemReal;
      const realSemLabel = realSemExib > 0 ? fmt(realSemExib)
        : (periodo === 'semanal' ? '<span style="color:var(--text-muted);font-size:11px;">Sem dados</span>' : '—');

      return '<tr>' +
        '<td style="font-weight:700;">' + r.cat.icon + ' ' + r.cat.nome + '</td>' +
        '<td style="text-align:right;background:#22c55e08;">' + (r.metaMes > 0 ? fmt(r.metaMes) : '—') + '</td>' +
        '<td style="text-align:right;font-weight:700;color:var(--lumen);background:#22c55e08;">' + (r.realMes > 0 ? fmt(r.realMes) : '—') + '</td>' +
        '<td style="text-align:right;background:#22c55e08;">' + (r.metaMes > 0 && r.realMes > 0 ? fmtDif(r.realMes, r.metaMes) : '—') + '</td>' +
        '<td style="text-align:right;background:#22c55e08;">' + (varMesP !== null ? fmtV(r.realMes, r.metaMes) : '—') + '</td>' +
        '<td style="text-align:right;background:#3b82f608;">' + (r.metaSem > 0 ? fmt(r.metaSem) : '—') + '</td>' +
        '<td style="text-align:right;font-weight:700;background:#3b82f608;">' + realSemLabel + '</td>' +
        '<td style="text-align:right;background:#3b82f608;">' + (r.metaSem > 0 && realSemExib > 0 ? fmtDif(realSemExib, r.metaSem) : '—') + '</td>' +
        '<td style="text-align:right;background:#3b82f608;">' + (varSemP !== null ? fmtV(realSemExib, r.metaSem) : '—') + '</td>' +
        '<td style="text-align:center;">' + stLbl + '</td>' +
        '</tr>';
    }).join('') || '<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--text-muted);">Nenhum dado encontrado. Cadastre metas e importe histórico financeiro.</td></tr>';

    // Gráfico
    const ctx = document.getElementById('chart-meta-cat').getContext('2d');
    if (chartMetaCat) chartMetaCat.destroy();
    chartMetaCat = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labelsChart,
        datasets: [
          { label: 'Realizado', data: dataReal, backgroundColor: '#3b82f688', borderColor: '#3b82f6', borderWidth: 2 },
          { label: 'Meta',      data: dataMeta, backgroundColor: '#22c55e44', borderColor: '#22c55e', borderWidth: 2 },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { ticks: { callback: v => 'R$' + (v/1000).toFixed(0) + 'k' } } }
      }
    });

  } catch(e) {
    console.error('carregarAnalise error:', e);
    showToast('Erro na análise: ' + e.message);
  }
}

// ── Projeção Anual ──
async function carregarProjecao() {
  const ano = document.getElementById('proj-ano')?.value || '2026';
  const tbody = document.getElementById('proj-tbody');

  try {
    const [snapMeta, gastos] = await Promise.all([
      db.collection('metas').doc('categorias_' + ano).get(),
      buscarGastosReais(ano)
    ]);
    const metas = snapMeta.exists ? snapMeta.data() : {};

    const mesAtualIdx = new Date().getMonth(); // 0-indexed
    const mesesDecorridos = mesAtualIdx + 1;
    const mesesRestantes  = 12 - mesesDecorridos;

    let totalGastoAte = 0, totalMetaAno = 0, totalProjetado = 0;
    const dadosMensais = {}; // { MÊS: total }
    const rows = [];

    // Agrupa gastos por mês (todos os cats)
    Object.values(gastos).forEach(g => {
      Object.entries(g.meses).forEach(([mes, val]) => {
        dadosMensais[mes] = (dadosMensais[mes] || 0) + val;
      });
      totalGastoAte += g.total;
    });

    // Por categoria
    Object.entries(CATEGORIAS).forEach(([key, cat]) => {
      const m = metas[key] || {};
      const g = gastos[key] || { meses: {}, total: 0 };
      const metaMes = parseFloat(m.metaMes) || 0;
      const metaAno = parseFloat(m.metaAno) || metaMes * 12;

      if (!metaMes && !g.total) return;

      totalMetaAno += metaAno;

      // Calcula meses com dados
      const mesesComDados = MESES_ORDEM.filter(m2 => g.meses[m2]);
      const pico   = mesesComDados.length > 0 ? Math.max(...mesesComDados.map(m2 => g.meses[m2])) : 0;
      const media  = mesesComDados.length > 0 ? g.total / mesesComDados.length : 0;
      const mediaSem = media / 4.33;

      // Projeção para o resto do ano
      const projetado = g.total + (media * mesesRestantes);
      totalProjetado += projetado;

      const tendencia = projetado > metaAno
        ? '<span style="color:var(--danger);">📈 Acima da meta</span>'
        : '<span style="color:var(--ok);">📉 Dentro da meta</span>';

      const fmt = v => 'R$ ' + v.toLocaleString('pt-BR', {minimumFractionDigits:0, maximumFractionDigits:0});

      rows.push(`<tr>
        <td style="font-weight:700;">${cat.icon} ${cat.nome}</td>
        <td style="text-align:right;font-weight:700;color:var(--danger);">${fmt(pico)}</td>
        <td style="text-align:right;">${fmt(media)}</td>
        <td style="text-align:right;">${fmt(mediaSem)}</td>
        <td style="text-align:right;font-weight:700;color:var(--ok);">${metaMes > 0 ? fmt(metaMes) : '—'}</td>
        <td style="text-align:right;font-weight:700;color:var(--ok);">${m.metaSemana > 0 ? fmt(m.metaSemana) : '—'}</td>
        <td style="text-align:center;font-size:12px;">${tendencia}</td>
      </tr>`);
    });

    if (tbody) tbody.innerHTML = rows.join('') || '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted);">Cadastre metas para ver a projeção.</td></tr>';

    // Cards
    const mediaGastoMes = mesesDecorridos > 0 ? totalGastoAte / mesesDecorridos : 0;
    const tendenciaGeral = totalProjetado <= totalMetaAno
      ? '<span style="color:var(--ok);">✅ Dentro da meta anual</span>'
      : `<span style="color:var(--danger);">⚠️ +R$${((totalProjetado-totalMetaAno)/1000).toFixed(0)}k acima da meta</span>`;

    const fmt2 = v => 'R$ ' + v.toLocaleString('pt-BR', {minimumFractionDigits:0, maximumFractionDigits:0});
    document.getElementById('proj-media-mes').textContent  = fmt2(mediaGastoMes);
    document.getElementById('proj-total-ano').textContent  = fmt2(totalProjetado);
    document.getElementById('proj-meta-ano').textContent   = fmt2(totalMetaAno);
    document.getElementById('proj-tendencia').innerHTML    = tendenciaGeral;

    // Gráfico evolução mensal
    const labelsMeses = MESES_ORDEM.map(m2 => m2.slice(0,3));
    const dataRealMes = MESES_ORDEM.map(m2 => dadosMensais[m2] || null);
    const dataMetaMes = MESES_ORDEM.map(() => {
      const totalMetaMes = Object.values(metas).reduce((s,m2) => s + (parseFloat(m2.metaMes)||0), 0);
      return totalMetaMes;
    });

    const ctx2 = document.getElementById('chart-proj-mensal').getContext('2d');
    if (chartProjMensal) chartProjMensal.destroy();
    chartProjMensal = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: labelsMeses,
        datasets: [
          { label: 'Realizado', data: dataRealMes, backgroundColor: '#3b82f688', borderColor: '#3b82f6', borderWidth: 2, type: 'bar' },
          { label: 'Meta Mensal', data: dataMetaMes, borderColor: '#22c55e', borderWidth: 2, borderDash: [6,4], type: 'line', fill: false, pointRadius: 3, tension: 0 },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { ticks: { callback: v => 'R$' + (v/1000).toFixed(0) + 'k' } } }
      }
    });

  } catch(e) {
    console.error('carregarProjecao error:', e);
    showToast('Erro na projeção: ' + e.message);
  }
}

function exportMetasExcel() {
  showToast('Em breve: exportação de metas em Excel!');
}

// ═══════════════════════════════════════════════════════════════
// 🔗 SINCRONIZAÇÃO TOTAL DO SISTEMA
// Integra: Pedidos → Financeiro → Fornecedor → Histórico
// ═══════════════════════════════════════════════════════════════

const MESES_PT = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO',
                  'JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];

async function sincronizarSistema() {
  if (!confirm(
    '🔗 SINCRONIZAÇÃO DO SISTEMA\n\n' +
    'Isso vai:\n' +
    '• Criar registros financeiros para todos os pedidos liberados que ainda não têm lançamento\n' +
    '• Atualizar limites dos fornecedores com base nos lançamentos não pagos\n' +
    '• Limpar registros duplicados\n\n' +
    'Deseja continuar?'
  )) return;

  showToast('⏳ Sincronizando sistema, aguarde...');

  let criados = 0, ignorados = 0, erros = 0;

  try {
    // ── 1. Busca todos os pedidos liberados ──
    const ordersSnap = await db.collection('orders')
      .where('status', 'in', ['pedido_liberado','concluido','aguardando_nf','pendente_pag'])
      .get();

    // ── 2. Busca lançamentos já existentes (para não duplicar) ──
    const finSnap = await db.collection('compras_financeiro').get();
    const pedidosJaLancados = new Set(
      finSnap.docs
        .map(d => d.data().pedidoRef)
        .filter(Boolean)
    );

    // ── 3. Busca fornecedores para calcular prazo ──
    const supSnap = await db.collection('suppliers').get();
    const supMap  = {};
    supSnap.docs.forEach(d => { supMap[d.id] = { id: d.id, ...d.data() }; });

    // ── 4. Para cada pedido sem lançamento, cria no financeiro ──
    const batch = db.batch();
    let batchCount = 0;

    for (const doc of ordersSnap.docs) {
      const o   = doc.data();
      const cod = o.code || doc.id;

      // Pula se já tem lançamento
      if (pedidosJaLancados.has(cod)) { ignorados++; continue; }

      const valor = parseFloat(o.nfValor || o.cotacaoValor || 0);
      const fornId   = o.fornecedorId   || o.cotacaoFornecedor?.id || '';
      const fornNome = o.fornecedorNome || o.cotacaoFornecedor     || '';

      if (!valor && !fornNome) { ignorados++; continue; }

      // Calcula vencimento se não tiver
      let vencimentoStr = o.boletoVencimento || '';
      if (!vencimentoStr && fornId && supMap[fornId]) {
        const prazoNum = parseInt(supMap[fornId].prazo) || 0;
        if (prazoNum > 0) {
          const refDate = o.liberadoEm?.toDate ? o.liberadoEm.toDate() : new Date();
          const vd = new Date(refDate);
          vd.setDate(vd.getDate() + prazoNum);
          vencimentoStr = vd.toISOString().slice(0,10);
        }
      }

      // Data de referência
      const refDate  = o.liberadoEm?.toDate ? o.liberadoEm.toDate()
                     : o.createdAt?.toDate  ? o.createdAt.toDate()
                     : new Date();
      const mesIdx   = refDate.getMonth();
      const anoNum   = refDate.getFullYear();

      // Categoria
      const cats = (o.categories || []);
      const classificacao = cats.map(c => CATEGORIAS[c]?.nome || c).join(', ') || 'Pedido';

      const newRef = db.collection('compras_financeiro').doc();
      batch.set(newRef, {
        fornecedor:      fornNome,
        fornecedorId:    fornId,
        classificacao,
        destinatario:    o.house || '',
        mes:             MESES_PT[mesIdx],
        ano:             anoNum,
        dataCompraSerial: refDate.getTime(),
        vencimentoStr,
        valor:           valor || 0,
        pago:            o.status === 'concluido' ? 'Sim' : '',
        pedidoRef:       cod,
        pedidoId:        doc.id,
        obs:             `Sincronizado automaticamente — ${cod}`,
        lancadoSP:       false,
        createdAt:       firebase.firestore.FieldValue.serverTimestamp(),
        syncedAt:        firebase.firestore.FieldValue.serverTimestamp(),
      });

      criados++;
      batchCount++;

      // Firestore batch limit = 500
      if (batchCount >= 490) {
        await batch.commit();
        batchCount = 0;
      }
    }

    if (batchCount > 0) await batch.commit();

    // ── 5. Recalcula limites dos fornecedores ──
    const finSnapAtual = await db.collection('compras_financeiro')
      .where('pago', '!=', 'Sim').get();

    const totaisPorId = {}, totaisPorNome = {};
    finSnapAtual.docs.forEach(doc => {
      const d = doc.data();
      const v = parseFloat(d.valor) || 0;
      if (!v) return;
      if (d.fornecedorId) totaisPorId[d.fornecedorId] = (totaisPorId[d.fornecedorId]||0) + v;
      else if (d.fornecedor) {
        const k = d.fornecedor.trim().toLowerCase();
        totaisPorNome[k] = (totaisPorNome[k]||0) + v;
      }
    });

    const supBatch = db.batch();
    supSnap.docs.forEach(doc => {
      const s = doc.data();
      let total = totaisPorId[doc.id] || 0;
      if (!total && s.nome) {
        const k = s.nome.trim().toLowerCase();
        total = totaisPorNome[k] || 0;
      }
      supBatch.update(doc.ref, { utilizado: total });
    });
    await supBatch.commit();

    // ── 6. Recarrega dados ──
    await finCarregarDados();
    if (typeof loadSuppliers === 'function') loadSuppliers();

    showToast(
      `✅ Sincronização concluída!\n` +
      `• ${criados} pedidos lançados no financeiro\n` +
      `• ${ignorados} já estavam lançados\n` +
      `• Limites dos fornecedores atualizados`
    );

    // Mostra resumo
    alert(
      `✅ SINCRONIZAÇÃO CONCLUÍDA\n\n` +
      `📦 Pedidos lançados no financeiro: ${criados}\n` +
      `⏭️ Já estavam lançados: ${ignorados}\n` +
      `💼 Limites dos fornecedores: atualizados\n\n` +
      `Os dados agora estão integrados!`
    );

  } catch(e) {
    console.error('sincronizarSistema error:', e);
    showToast('❌ Erro na sincronização: ' + e.message);
  }
}

// Auto-lança no financeiro quando pedido é liberado pelo gerente
// (já existe em opcGerenteDecisao, mas adicionamos também ao mudar status manualmente)
async function lancarPedidoNoFinanceiro(orderId, orderData) {
  try {
    // Verifica se já existe lançamento
    const existSnap = await db.collection('compras_financeiro')
      .where('pedidoRef', '==', orderData.code || orderId)
      .limit(1).get();

    if (!existSnap.empty) return; // já lançado

    const valor    = parseFloat(orderData.nfValor || orderData.cotacaoValor || 0);
    const fornId   = orderData.fornecedorId  || '';
    const fornNome = orderData.fornecedorNome || orderData.cotacaoFornecedor || '';

    if (!valor) return;

    const refDate = new Date();
    const mesIdx  = refDate.getMonth();

    const cats = (orderData.categories || []);
    const classificacao = cats.map(c => CATEGORIAS[c]?.nome || c).join(', ') || 'Pedido';

    await db.collection('compras_financeiro').add({
      fornecedor:       fornNome,
      fornecedorId:     fornId,
      classificacao,
      destinatario:     orderData.house || '',
      mes:              MESES_PT[mesIdx],
      ano:              refDate.getFullYear(),
      dataCompraSerial: refDate.getTime(),
      vencimentoStr:    orderData.boletoVencimento || '',
      valor,
      pago:             '',
      pedidoRef:        orderData.code || orderId,
      pedidoId:         orderId,
      centroCustoId:    orderData.centroCustoId   || '',
      centroCustoNome:  orderData.centroCustoNome || '',
      lancadoSP:        false,
      createdAt:        firebase.firestore.FieldValue.serverTimestamp(),
    });

    // Consome limite do fornecedor
    if (fornId && valor > 0) {
      await db.collection('suppliers').doc(fornId).update({
        utilizado: firebase.firestore.FieldValue.increment(valor)
      }).catch(() => {});
    }
  } catch(e) {
    console.warn('lancarPedidoNoFinanceiro error:', e);
  }
}

