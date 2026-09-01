// ─────────────────────────────────────────────────────────────────────────
// 21-inventario.js — Contagem física de inventário quinzenal
// Fluxo: estoquista conta → envia para aprovação → coordenador/gerente/diretor
//        autoriza → movimentações geradas automaticamente → acurácia calculada
// ─────────────────────────────────────────────────────────────────────────

// Estoque calculado em memória: { 'catKey|prodId|casa' → qty }
let _invEstoqueCalculado = {};
let _invCasaAtual = '';

// ── Inicializa a página ──────────────────────────────────────────────────
async function initPageInventario() {
  const sel = document.getElementById('inv-casa');
  if (sel) {
    sel.innerHTML = '<option value="">Selecione...</option>';
    (window.CASAS || []).forEach(c => {
      const o = document.createElement('option');
      o.value = c; o.textContent = c;
      if (c === (currentUserData?.house || '')) o.selected = true;
      sel.appendChild(o);
    });
  }
  const dataEl = document.getElementById('inv-data');
  if (dataEl && !dataEl.value) dataEl.value = new Date().toISOString().slice(0, 10);

  const respEl = document.getElementById('inv-responsavel');
  if (respEl && !respEl.value) respEl.value = currentUserData?.name || '';

  // Carrega histórico se já tiver casa selecionada
  if (sel?.value) await invCarregarHistorico(sel.value);
}
window.initPageInventario = initPageInventario;

// ── Carrega produtos e estoque calculado para a contagem ─────────────────
async function invCarregarProdutos() {
  const casa = document.getElementById('inv-casa').value;
  const data = document.getElementById('inv-data').value;
  if (!casa) { showToast('Selecione a casa.'); return; }
  if (!data) { showToast('Informe a data da contagem.'); return; }

  _invCasaAtual = casa;
  showToast('Carregando estoque calculado...');

  // Busca todos os movements da casa para calcular estoque atual
  try {
    const snap = await db.collection('movements').where('house', '==', casa).get();
    _invEstoqueCalculado = {};
    snap.docs.forEach(d => {
      const m = d.data();
      const mult = m.type === 'entrada' ? 1 : -1;
      (m.items || []).forEach(it => {
        const key = `${it.catKey}|${it.prodId}`;
        _invEstoqueCalculado[key] = (_invEstoqueCalculado[key] || 0) + (it.qty * mult);
      });
    });
  } catch(e) {
    showToast('Erro ao carregar estoque: ' + e.message);
    return;
  }

  // Monta formulário por categoria
  const wrap = document.getElementById('inv-categorias-lista');
  if (!wrap) return;
  wrap.innerHTML = '';

  if (!window.CATEGORIAS) { showToast('Categorias não carregadas.'); return; }

  Object.entries(CATEGORIAS).forEach(([catKey, cat]) => {
    const secao = document.createElement('div');
    secao.style.cssText = 'margin-bottom:20px;';
    secao.innerHTML = `
      <div style="font-size:12px;font-weight:800;color:var(--lumen,#7c3aed);text-transform:uppercase;
                  letter-spacing:.8px;margin-bottom:8px;padding-bottom:4px;
                  border-bottom:1px solid var(--border);">
        ${cat.nome}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px;">
        ${cat.produtos.map(p => {
          const key = `${catKey}|${p.id}`;
          const sistema = Math.max(0, _invEstoqueCalculado[key] || 0);
          return `
            <div class="card" style="padding:10px 12px;display:flex;align-items:center;gap:10px;">
              <div style="flex:1;min-width:0;">
                <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.nome}</div>
                <div style="font-size:11px;color:var(--text-muted);">
                  Sistema: <strong id="inv-sistema-${catKey}-${p.id}">${sistema.toFixed(2).replace('.',',')} ${p.unidade}</strong>
                </div>
              </div>
              <input type="number" min="0" step="0.01"
                class="form-input inv-qty-input"
                style="width:90px;text-align:right;"
                id="inv-qty-${catKey}-${p.id}"
                data-cat="${catKey}" data-prod="${p.id}" data-unidade="${p.unidade}"
                data-sistema="${sistema}" data-nome="${p.nome}"
                placeholder="${sistema.toFixed(2).replace('.',',')}"
                oninput="invAtualizarResumo()">
            </div>`;
        }).join('')}
      </div>`;
    wrap.appendChild(secao);
  });

  document.getElementById('inv-categorias-wrap').style.display = 'block';
  invAtualizarResumo();
  await invCarregarHistorico(casa);
  document.getElementById('inv-historico-wrap').style.display = 'block';
}

// ── Atualiza resumo de divergências no topo ──────────────────────────────
function invAtualizarResumo() {
  const inputs = document.querySelectorAll('.inv-qty-input');
  let totalItens = 0, itensOk = 0, itensDiverg = 0;
  inputs.forEach(inp => {
    if (inp.value === '') return; // não contado ainda
    totalItens++;
    const fisico = parseFloat(inp.value) || 0;
    const sistema = parseFloat(inp.dataset.sistema) || 0;
    if (Math.abs(fisico - sistema) < 0.01) itensOk++;
    else itensDiverg++;
    // Destaca a linha se divergente
    inp.style.borderColor = (inp.value !== '' && Math.abs(fisico - sistema) >= 0.01)
      ? 'var(--danger)' : '';
  });
  const pct = totalItens > 0 ? ((itensOk / totalItens) * 100).toFixed(1) : '—';
  const cor = pct === '—' ? 'var(--text-muted)' : pct >= 95 ? 'var(--ok)' : pct >= 90 ? 'var(--warn)' : 'var(--danger)';
  document.getElementById('inv-resumo-topo').innerHTML = `
    <div class="card" style="padding:12px 16px;display:flex;gap:20px;flex-wrap:wrap;align-items:center;">
      <div style="font-size:13px;color:var(--text-muted);">
        Itens contados: <strong>${totalItens}</strong>
      </div>
      <div style="font-size:13px;color:var(--ok);">✓ Corretos: <strong>${itensOk}</strong></div>
      <div style="font-size:13px;color:var(--danger);">✗ Divergentes: <strong>${itensDiverg}</strong></div>
      <div style="font-size:15px;font-weight:800;color:${cor};margin-left:auto;">
        Acurácia parcial: ${pct}${pct !== '—' ? '%' : ''}
      </div>
    </div>`;
}

// ── Envia inventário para aprovação ─────────────────────────────────────
async function invEnviarParaAprovacao() {
  const casa        = document.getElementById('inv-casa').value;
  const data        = document.getElementById('inv-data').value;
  const responsavel = document.getElementById('inv-responsavel').value.trim();

  if (!casa) { showToast('Selecione a casa.'); return; }
  if (!data) { showToast('Informe a data.'); return; }

  const inputs = document.querySelectorAll('.inv-qty-input');
  const itens = [];
  inputs.forEach(inp => {
    if (inp.value === '') return;
    const fisico  = parseFloat(inp.value) || 0;
    const sistema = parseFloat(inp.dataset.sistema) || 0;
    itens.push({
      catKey:    inp.dataset.cat,
      prodId:    inp.dataset.prod,
      prodNome:  inp.dataset.nome,
      unidade:   inp.dataset.unidade,
      qtyFisico: fisico,
      qtySistema: sistema,
      diferenca: parseFloat((fisico - sistema).toFixed(4)),
    });
  });

  if (itens.length === 0) { showToast('Nenhum item contado.'); return; }

  const totalItens  = itens.length;
  const itensOk     = itens.filter(i => Math.abs(i.diferenca) < 0.01).length;
  const acuracia    = parseFloat(((itensOk / totalItens) * 100).toFixed(2));

  document.getElementById('btn-inv-enviar').disabled = true;
  try {
    await db.collection('inventarios').add({
      casa, data, responsavel, itens, totalItens, itensOk, acuracia,
      status: 'pendente',
      solicitanteUid:  currentUser?.uid || '',
      solicitanteNome: currentUserData?.name || '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast(`✅ Inventário enviado para aprovação! Acurácia: ${acuracia.toFixed(1)}%`);
    invLimpar();
    await invCarregarHistorico(casa);
  } catch(e) {
    showToast('Erro ao enviar: ' + e.message);
    console.error(e);
  }
  document.getElementById('btn-inv-enviar').disabled = false;
}

function invLimpar() {
  document.getElementById('inv-categorias-wrap').style.display = 'none';
  document.getElementById('inv-categorias-lista').innerHTML = '';
  _invEstoqueCalculado = {};
}

// ── Histórico de inventários ─────────────────────────────────────────────
async function invCarregarHistorico(casa) {
  const wrap = document.getElementById('inv-historico-lista');
  if (!wrap) return;
  wrap.innerHTML = '<div class="loading-state"><div class="spinner spinner-dark"></div>Carregando...</div>';

  try {
    const snap = await db.collection('inventarios')
      .where('casa', '==', casa)
      .orderBy('createdAt', 'desc')
      .get();

    if (snap.empty) {
      wrap.innerHTML = '<div style="font-size:13px;color:var(--text-muted);">Nenhum inventário registrado para esta casa.</div>';
      return;
    }

    const statusMap = { pendente: '🟡 Aguardando aprovação', autorizado: '✅ Autorizado', recusado: '❌ Recusado' };
    wrap.innerHTML = snap.docs.map(d => {
      const inv = d.data();
      const cor = inv.acuracia >= 98 ? 'var(--ok)' : inv.acuracia >= 95 ? 'var(--warn)' : 'var(--danger)';
      const dataFmt = inv.data ? new Date(inv.data + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
      const divergentes = (inv.itens || []).filter(i => Math.abs(i.diferenca) >= 0.01);
      return `
        <div class="card" style="margin-bottom:10px;padding:14px 16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
            <div>
              <div style="font-weight:700;font-size:13px;">${dataFmt} — ${inv.responsavel || inv.solicitanteNome}</div>
              <div style="font-size:11px;color:var(--text-muted);">${statusMap[inv.status] || inv.status} · ${inv.totalItens} itens contados</div>
            </div>
            <div style="font-size:22px;font-weight:900;color:${cor};">${inv.acuracia?.toFixed(1)}%</div>
          </div>
          ${divergentes.length > 0 ? `
            <div style="margin-top:10px;font-size:12px;">
              <div style="font-weight:700;color:var(--text-muted);margin-bottom:4px;">Divergências (${divergentes.length}):</div>
              ${divergentes.map(i => `
                <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--border);">
                  <span>${i.prodNome}</span>
                  <span style="color:${i.diferenca > 0 ? 'var(--ok)' : 'var(--danger)'};">
                    Sistema: ${i.qtySistema.toFixed(2).replace('.',',')} ${i.unidade} →
                    Físico: ${i.qtyFisico.toFixed(2).replace('.',',')} ${i.unidade}
                    (${i.diferenca > 0 ? '+' : ''}${i.diferenca.toFixed(2).replace('.',',')} ${i.unidade})
                  </span>
                </div>`).join('')}
            </div>` : ''}
        </div>`;
    }).join('');
    document.getElementById('inv-historico-wrap').style.display = 'block';
  } catch(e) {
    wrap.innerHTML = `<div style="font-size:12px;color:var(--danger);">Erro ao carregar histórico: ${e.message}</div>`;
  }
}

// ── KPI de Acurácia para Dashboard da Diretoria ──────────────────────────
async function dashdirAtualizarAcuracia() {
  const valorEl = document.getElementById('dashdir-kpi-acuracia-valor');
  const deltaEl = document.getElementById('dashdir-kpi-acuracia-delta');
  const metaEl  = document.getElementById('dashdir-kpi-acuracia-meta');
  const card    = document.getElementById('dashdir-kpi-acuracia-card');
  if (!valorEl) return;

  valorEl.textContent = '…';
  if (deltaEl) { deltaEl.textContent = ''; deltaEl.className = 'dashdir-kpi-delta'; }

  try {
    // Busca os 2 últimos inventários autorizados (qualquer casa) para comparar
    const snap = await db.collection('inventarios')
      .where('status', '==', 'autorizado')
      .orderBy('data', 'desc')
      .limit(10)
      .get();

    if (snap.empty) {
      valorEl.textContent = '—';
      if (metaEl) metaEl.textContent = 'Nenhum inventário autorizado ainda';
      return;
    }

    // Acurácia média do inventário mais recente e do anterior
    const docs = snap.docs.map(d => d.data());
    const ultimo    = docs[0];
    const anterior  = docs.length > 1 ? docs[1] : null;

    const pct     = ultimo.acuracia;
    const pctAnt  = anterior?.acuracia ?? null;
    const dataFmt = ultimo.data ? new Date(ultimo.data + 'T00:00:00').toLocaleDateString('pt-BR') : '—';

    valorEl.textContent = pct.toFixed(1).replace('.', ',') + '%';

    // Cor do card: verde ≥ 98, amarelo 95–98, vermelho < 95
    if (card) {
      card.classList.remove('alerta', 'critico');
      if (pct < 95)       card.classList.add('critico');
      else if (pct < 98)  card.classList.add('alerta');
    }
    valorEl.style.color = pct >= 98 ? 'var(--ok)' : pct >= 95 ? 'var(--warn)' : 'var(--danger)';

    if (deltaEl && pctAnt !== null) {
      const diff = pct - pctAnt;
      const sinal = diff >= 0 ? '↑ +' : '↓ ';
      deltaEl.innerHTML = `${sinal}${Math.abs(diff).toFixed(1).replace('.',',')} p.p. <span>vs. contagem anterior</span>`;
      deltaEl.className = 'dashdir-kpi-delta ' + (diff >= 0 ? 'good' : 'ruim');
    } else if (deltaEl) {
      deltaEl.textContent = 'Primeira contagem registrada';
    }

    if (metaEl) metaEl.textContent = `Meta: > 95% · Última contagem: ${dataFmt} (${ultimo.casa})`;
  } catch(e) {
    if (valorEl) valorEl.textContent = '—';
    console.error('Erro KPI acurácia:', e);
  }
}
window.dashdirAtualizarAcuracia = dashdirAtualizarAcuracia;
