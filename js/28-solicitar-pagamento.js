/* ══════════════════════════════════════════════════════════════════════
   Solicitar Pagamento — abas de Suprimentos e Passagens
   Mesmo fluxo que Fretes já tinha (js/18-erp.js), agora uma aba por módulo.
   Lançamentos novos (a partir de 10/10/2026, regra no trigger
   compras_fin_marca_aguarda — migration 046) nascem com aguarda_solicitacao=true:
   ficam só aqui até alguém marcar "solicitado"; depois passam a aparecer no
   Financeiro (finCarregarDados esconde os que ainda aguardam).
   ══════════════════════════════════════════════════════════════════════ */

const _SPG = {
  sup: {
    modulo: 'suprimentos', pagina: 'sup-sol-pagamento', titulo: '📨 Solicitar Pagamento — Suprimentos',
    sub: 'Pedidos aprovados a partir de 10/10/2026 cujo pagamento ainda não foi solicitado. Depois de solicitado, o lançamento segue para o Financeiro.',
    // Categoria (Conta Azul) e centro de custo variam por pedido: escolhidos aqui, linha a linha.
    colunas: ['Pedido', 'Fornecedor', 'Casa / Destinatário', 'Categoria (Conta Azul) *', 'Centro de custo *', 'Vencimento', 'Valor'],
    editaveis: true,
    linha: l => [l.pedidoRef || '—', l.fornecedor || '—', l.destinatario || '—', vencBR(l.vencimentoStr) || '—'],
  },
  pas: {
    // Passagens: categoria e centro de custo são sempre os mesmos.
    fixos: { categoriaConta: '2.5.5 Transporte - Missionários', centroCustoNome: 'Set. Comunidade de Vida' },
    modulo: 'passagens', pagina: 'pas-sol-pagamento', titulo: '📨 Solicitar Pagamento — Passagens',
    sub: 'Passagens compradas a partir de 10/10/2026 cujo pagamento ainda não foi solicitado. Depois de solicitado, o lançamento segue para o Financeiro.',
    colunas: ['Código', 'Passageiro', 'Trajeto', 'Agência', 'Vencimento', 'Valor'],
    linha: l => {
      const s = (typeof _pasCache !== 'undefined' ? _pasCache : []).find(x => x.id === l.pedidoId || x.codigo === l.pedidoRef) || {};
      return [l.pedidoRef || s.codigo || '—', s.passageiro || l.destinatario || '—',
        s.origem ? `${s.origem} → ${s.destino || ''}` : '—', l.fornecedor || '—', vencBR(l.vencimentoStr) || '—'];
    },
  },
};
const _spgListas = { categorias: [], centros: [] };
const _spgEstado = { sup: { lista: [], sel: new Set() }, pas: { lista: [], sel: new Set() } };

function _spgMontarPaginas() {
  const ancora = document.getElementById('page-frt-pagamento');
  if (!ancora) return;
  Object.entries(_SPG).forEach(([k, c]) => {
    if (document.getElementById('page-' + c.pagina)) return;
    ancora.insertAdjacentHTML('afterend', `
  <div class="page" id="page-${c.pagina}">
    <div class="page-header"><h1 class="page-title">${c.titulo}</h1></div>
    <div class="page-sub" style="margin-bottom:16px;margin-top:-14px;">${c.sub}</div>
    <div class="stat-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px;">
      <div class="stat-card stat-card-warn"><div class="stat-label">📨 Pendentes</div><div class="stat-value" id="spg-${k}-qtd">—</div></div>
      <div class="stat-card stat-card-warn"><div class="stat-label">💰 Valor total</div><div class="stat-value" id="spg-${k}-total">—</div></div>
    </div>
    <div class="card"><div class="card-body">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-muted);cursor:pointer;">
          <input type="checkbox" id="spg-${k}-todos" onchange="spgMarcarTodos('${k}', this.checked)"> Selecionar todos
        </label>
        <button class="btn btn-outline btn-sm" id="spg-${k}-exportar" onclick="spgExportar('${k}')" disabled>📊 Exportar planilha (0)</button>
        <button class="btn btn-primary btn-sm" id="spg-${k}-solicitar" onclick="spgMarcarSolicitados('${k}')" disabled>Marcar selecionados como solicitados (0)</button>
      </div>
      <div class="table-wrap"><table class="fin-table">
        <thead><tr><th style="width:30px;"></th>${c.colunas.map((h, i) => `<th${i === c.colunas.length - 1 ? ' style="text-align:right;"' : ''}>${h}</th>`).join('')}</tr></thead>
        <tbody id="spg-${k}-tbody"><tr><td colspan="${c.colunas.length + 1}" style="text-align:center;padding:24px;color:var(--text-muted);">Carregando…</td></tr></tbody>
      </table></div>
    </div></div>
  </div>`);
  });
}

async function spgCarregar(k) {
  const c = _SPG[k], st = _spgEstado[k];
  const tb = document.getElementById(`spg-${k}-tbody`);
  if (tb) tb.innerHTML = `<tr><td colspan="${c.colunas.length + 1}" style="text-align:center;padding:24px;color:var(--text-muted);">Carregando…</td></tr>`;
  st.sel = new Set();
  try {
    if (k === 'pas' && typeof _pasCache !== 'undefined' && !_pasCache.length && typeof loadPasSolic === 'function') { try { await loadPasSolic(); } catch (e) { /* só enriquece a lista */ } }
    const snap = await db.collection('compras_financeiro').where('modulo', '==', c.modulo).where('aguardaSolicitacao', '==', true).get();
    st.lista = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(l => !l.pagamentoSolicitadoEm)
      .sort((a, b) => String(a.vencimentoStr || '9999').localeCompare(String(b.vencimentoStr || '9999')));
    if (c.editaveis) await _spgPreparar(st.lista);
    spgRenderizar(k);
  } catch (e) {
    console.error('spgCarregar', e);
    if (tb) tb.innerHTML = `<tr><td colspan="${c.colunas.length + 1}" style="text-align:center;padding:24px;color:var(--danger,#dc2626);">Erro ao carregar: ${frtEsc(e.message)}</td></tr>`;
  }
}
window.loadSupSolPagamento = () => spgCarregar('sup');
window.loadPasSolPagamento = () => spgCarregar('pas');

// Carrega as listas de Gerenciar Categorias / Gerenciar Centro de Custo e sugere o valor
// de cada linha (categoria pela categoria do pedido; centro de custo pelo do pedido).
async function _spgPreparar(lista) {
  if (!_spgListas.categorias.length) {
    const sc = await db.collection('categorias').get();
    _spgListas.categorias = sc.docs.map(d => ({ key: d.id, ...d.data() })).filter(x => x.ativo !== false && x.nome && /^d/.test(x.nome));
    const nomes = [...new Set(_spgListas.categorias.map(x => x.nome))].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
    _spgListas.nomesCategoria = nomes;
  }
  if (!_spgListas.centros.length) {
    const cc = await db.collection('centros_custo').orderBy('nome', 'asc').get();
    _spgListas.centros = cc.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  for (const l of lista) {
    if (!l.categoriaConta) {
      const cat = _spgListas.categorias.find(x => x.key === l.catKey);
      if (cat) { l.categoriaConta = cat.nome; l._sugCat = true; }
    }
    if (!l.centroCustoId && !l.centroCustoNome && l.pedidoId) {
      try {
        const o = await db.collection('orders').doc(l.pedidoId).get();
        const od = o.exists ? o.data() : null;
        if (od?.centroCustoId || od?.centroCustoNome) { l.centroCustoId = od.centroCustoId || ''; l.centroCustoNome = od.centroCustoNome || ''; l._sugCc = true; }
      } catch (e) { /* sem sugestão */ }
    }
  }
}

function _spgSelects(k, l) {
  const optsCat = '<option value="">Selecione…</option>' + (_spgListas.nomesCategoria || []).map(n => `<option ${n === l.categoriaConta ? 'selected' : ''}>${frtEsc(n)}</option>`).join('');
  const optsCc = '<option value="">Selecione…</option>' + _spgListas.centros.map(x => `<option value="${x.id}" ${(x.id === l.centroCustoId || (!l.centroCustoId && x.nome === l.centroCustoNome)) ? 'selected' : ''}>${frtEsc(x.nome)}</option>`).join('');
  const bad = 'border:1px solid var(--danger,#dc2626);';
  return `<td><select class="form-select" style="min-width:230px;${l.categoriaConta ? '' : bad}" onchange="spgEscolher('${k}','${l.id}','cat',this.value)">${optsCat}</select></td>
        <td><select class="form-select" style="min-width:200px;${(l.centroCustoId || l.centroCustoNome) ? '' : bad}" onchange="spgEscolher('${k}','${l.id}','cc',this.value)">${optsCc}</select></td>`;
}

async function spgEscolher(k, id, campo, valor) {
  const l = _spgEstado[k].lista.find(x => x.id === id);
  if (!l) return;
  let upd;
  if (campo === 'cat') { l.categoriaConta = valor; upd = { categoriaConta: valor }; }
  else {
    const cc = _spgListas.centros.find(x => x.id === valor);
    l.centroCustoId = cc?.id || ''; l.centroCustoNome = cc?.nome || '';
    upd = { centroCustoId: l.centroCustoId, centroCustoNome: l.centroCustoNome };
  }
  try { await db.collection('compras_financeiro').doc(id).update(upd); }
  catch (e) { console.error('spgEscolher', e); showToast('❌ Não consegui salvar a escolha: ' + e.message); }
  spgRenderizar(k);
}
window.spgEscolher = spgEscolher;

// Linhas selecionadas sem categoria/centro de custo (só Suprimentos)
function _spgIncompletas(k) {
  const st = _spgEstado[k];
  if (!_SPG[k].editaveis) return [];
  return st.lista.filter(l => st.sel.has(l.id) && (!l.categoriaConta || !(l.centroCustoId || l.centroCustoNome)));
}
function _spgBloquear(k) {
  const f = _spgIncompletas(k);
  if (!f.length) return false;
  showToast(`⚠️ Preencha Categoria e Centro de custo em ${f.length} pedido(s): ${f.slice(0, 3).map(l => l.pedidoRef || l.fornecedor).join(', ')}${f.length > 3 ? '…' : ''}`);
  return true;
}

function spgRenderizar(k) {
  const c = _SPG[k], st = _spgEstado[k];
  const tb = document.getElementById(`spg-${k}-tbody`);
  if (!tb) return;
  const total = st.lista.reduce((s, l) => s + (Number(l.valor) || 0), 0);
  document.getElementById(`spg-${k}-qtd`).textContent = st.lista.length;
  document.getElementById(`spg-${k}-total`).textContent = frtBRL(total);
  if (!st.lista.length) {
    tb.innerHTML = `<tr><td colspan="${c.colunas.length + 1}" style="text-align:center;padding:24px;color:var(--text-muted);">Nenhum pagamento aguardando solicitação. 🎉</td></tr>`;
  } else {
    tb.innerHTML = st.lista.map(l => {
      const cel = c.linha(l);
      return `<tr>
        <td><input type="checkbox" ${st.sel.has(l.id) ? 'checked' : ''} onchange="spgToggle('${k}','${l.id}',this.checked)"></td>
        ${cel.slice(0, 3).map(v => `<td>${frtEsc(v)}</td>`).join('')}
        ${c.editaveis ? _spgSelects(k, l) : ''}
        ${cel.slice(3).map(v => `<td>${frtEsc(v)}</td>`).join('')}
        <td style="text-align:right;font-weight:600;">${frtBRL(l.valor)}</td>
      </tr>`;
    }).join('');
  }
  spgAtualizarBotoes(k);
}

function spgAtualizarBotoes(k) {
  const st = _spgEstado[k], n = st.sel.size;
  const ex = document.getElementById(`spg-${k}-exportar`), so = document.getElementById(`spg-${k}-solicitar`);
  if (ex) { ex.disabled = !n; ex.innerHTML = `📊 Exportar planilha (${n})`; }
  if (so) { so.disabled = !n; so.innerHTML = `Marcar selecionados como solicitados (${n})`; }
  const todos = document.getElementById(`spg-${k}-todos`);
  if (todos) todos.checked = st.lista.length > 0 && st.lista.every(l => st.sel.has(l.id));
}
function spgToggle(k, id, marcado) { const st = _spgEstado[k]; if (marcado) st.sel.add(id); else st.sel.delete(id); spgAtualizarBotoes(k); }
function spgMarcarTodos(k, marcar) {
  const st = _spgEstado[k];
  st.lista.forEach(l => { if (marcar) st.sel.add(l.id); else st.sel.delete(l.id); });
  spgRenderizar(k);
}
window.spgToggle = spgToggle; window.spgMarcarTodos = spgMarcarTodos;

async function spgExportar(k) {
  const c = _SPG[k], st = _spgEstado[k];
  const sel = st.lista.filter(l => st.sel.has(l.id));
  if (!sel.length || _spgBloquear(k)) return;
  await _caGarantirFornecedores();
  const mapaDocs = _caMapaDocs();
  const iso = v => { // aceita ISO ou dd/mm/aaaa
    const s = String(v || '').trim();
    let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`);
    m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s); if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00`);
    return null;
  };
  const header = ['Data de Competência', 'Data de Vencimento', 'Data de Pagamento', 'Valor', 'Categoria', 'Descrição', 'Cliente/Fornecedor', 'CNPJ/CPF Cliente/Fornecedor', 'Centro de Custo', 'Observações'];
  const linhas = [header];
  sel.forEach(l => {
    const cel = c.linha(l);
    const dtComp = iso(l.dataCompra && l.dataCompra.toDate ? l.dataCompra.toDate().toISOString() : l.dataCompra) || iso(l.createdAt && l.createdAt.toDate ? l.createdAt.toDate().toISOString() : l.createdAt) || new Date();
    const dtVenc = iso(l.vencimentoStr) || new Date(dtComp.getTime() + 7 * 86400000);
    const desc = k === 'pas' ? `Passagem ${cel[0]} — ${cel[1]} (${cel[2]})` : `Pedido ${cel[0]} — ${l.fornecedor || ''}`;
    linhas.push([dtComp, dtVenc, '', -Math.abs(Number(l.valor) || 0), c.fixos ? c.fixos.categoriaConta : (l.categoriaConta || ''), desc,
      l.fornecedor || '', mapaDocs.get(_caNorm(l.fornecedor)) || '', c.fixos ? c.fixos.centroCustoNome : (l.centroCustoNome || ''), l.obs || '']);
  });
  const ws = XLSX.utils.aoa_to_sheet(linhas, { cellDates: true });
  for (let r = 1; r < linhas.length; r++) {
    ['A', 'B'].forEach(col => { const cc = ws[col + (r + 1)]; if (cc && cc.v instanceof Date) { cc.t = 'd'; cc.z = 'dd/mm/yyyy'; } });
    const h = ws['H' + (r + 1)]; if (h && h.v !== undefined && h.v !== '') { h.t = 's'; h.v = String(h.v); }
  }
  ws['!cols'] = [{ wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 26 }, { wch: 44 }, { wch: 30 }, { wch: 24 }, { wch: 24 }, { wch: 30 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Dados');
  XLSX.writeFile(wb, `${c.modulo}-Pagamento-${new Date().toISOString().slice(0, 10)}.xlsx`, { cellDates: true });
}
window.spgExportar = spgExportar;

async function spgMarcarSolicitados(k) {
  const c = _SPG[k], st = _spgEstado[k];
  const ids = [...st.sel];
  if (!ids.length || _spgBloquear(k)) return;
  if (!confirm(`Marcar ${ids.length} lançamento(s) como "pagamento solicitado"? Eles passam a aparecer no Financeiro.`)) return;
  const nome = (typeof currentUserData !== 'undefined' && currentUserData?.name) || null;
  const agora = new Date().toISOString();
  const btn = document.getElementById(`spg-${k}-solicitar`);
  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner"></div> Aguarde...'; }
  try {
    for (const id of ids) {
      await db.collection('compras_financeiro').doc(id).update({ pagamentoSolicitadoEm: agora, pagamentoSolicitadoPor: nome, ...(c.fixos || {}) });
    }
    st.lista = st.lista.filter(l => !st.sel.has(l.id));
    st.sel = new Set();
    showToast(`✅ ${ids.length} pagamento(s) solicitado(s) — já estão no Financeiro.`);
    spgRenderizar(k);
  } catch (e) {
    console.error('spgMarcarSolicitados', e);
    showToast('❌ Erro: ' + e.message);
    spgRenderizar(k);
  }
}
window.spgMarcarSolicitados = spgMarcarSolicitados;

_spgMontarPaginas();
