// Extraído de index.html (categorias + centro de custo + color customizer + indicadores irmãos + histórico) em 2026-07-27
// ─────────────────────────────────────────────
// 🏷️  GERENCIAR CATEGORIAS (admin)
// ─────────────────────────────────────────────
const CATS_NATIVAS = ['cereal','higiene','proteina','missa_sf','lanches_csl'];
let editingCatKey = null;

async function initManageCats() {
  await renderCatsTable();
}

function catPreviewEmoji() {
  const nome  = document.getElementById('cat-nome')?.value || '';
  const emoji = document.getElementById('cat-emoji')?.value;
  const suggested = emoji || sugerirEmoji(nome);
  const prev  = document.getElementById('cat-emoji-preview');
  if (prev) prev.textContent = suggested || '📦';
  // Preenche automaticamente se o campo emoji estiver vazio
  if (!emoji && document.getElementById('cat-emoji')) {
    document.getElementById('cat-emoji').placeholder = sugerirEmoji(nome);
  }
}

async function renderCatsTable() {
  const tbody = document.getElementById('cats-tbody');
  if (!tbody) return;

  // Busca do Firestore para pegar dados completos
  let customCats = {};
  try {
    const snap = await db.collection('categorias_config').get();
    snap.docs.forEach(d => { customCats[d.data().key] = { docId: d.id, ...d.data() }; });
  } catch(e) { /* sem acesso ainda */ }

  tbody.innerHTML = Object.entries(CATEGORIAS).map(([k, c]) => {
    const isNativa = CATS_NATIVAS.includes(k);
    const qtd = c.produtos ? c.produtos.length : 0;
    const ordem = customCats[k]?.ordem || '—';
    return `<tr>
      <td style="font-size:24px;text-align:center;">${c.icon}</td>
      <td style="font-weight:600;">${c.nome}</td>
      <td><code style="font-size:11px;background:var(--bg);padding:2px 6px;border-radius:4px;">${k}</code></td>
      <td style="text-align:center;">${ordem}</td>
      <td><span class="badge ${isNativa ? 'badge-status-ok' : 'badge-status-warn'}">${isNativa ? '🔒 Nativa' : '✨ Custom'}</span></td>
      <td style="text-align:center;">${qtd}</td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="openEditCat('${k}')">Editar</button>
        ${!isNativa ? `<button class="btn btn-sm" style="background:var(--danger);color:#fff;border:none;margin-left:4px;" onclick="deleteCat('${k}')">Remover</button>` : ''}
      </td>
    </tr>`;
  }).join('');
}

function openEditCat(key) {
  const c = CATEGORIAS[key];
  if (!c) return;
  editingCatKey = key;
  document.getElementById('cat-nome').value  = c.nome;
  document.getElementById('cat-emoji').value = c.icon;
  document.getElementById('cat-emoji-preview').textContent = c.icon;
  document.getElementById('cat-form-title').textContent = `✏️ Editando: ${c.icon} ${c.nome}`;
  document.getElementById('btn-save-cat').textContent = '💾 Salvar Edição';
  document.getElementById('btn-cancel-cat').style.display = '';
  document.getElementById('cat-form-card').scrollIntoView({ behavior: 'smooth' });
}

function cancelEditCat() {
  editingCatKey = null;
  document.getElementById('cat-nome').value  = '';
  document.getElementById('cat-emoji').value = '';
  document.getElementById('cat-emoji-preview').textContent = '📦';
  document.getElementById('cat-form-title').textContent = '➕ Nova Categoria';
  document.getElementById('btn-save-cat').textContent = '+ Criar Categoria';
  document.getElementById('btn-cancel-cat').style.display = 'none';
}

async function saveCat() {
  const nome  = document.getElementById('cat-nome').value.trim();
  const emoji = document.getElementById('cat-emoji').value.trim() || sugerirEmoji(nome);
  const ordem = parseInt(document.getElementById('cat-ordem').value) || 10;
  const alertEl = document.getElementById('cat-alert');

  if (!nome) { showAlertInline('cat-alert', 'Informe o nome da categoria.', 'danger'); return; }

  // Gera chave: remove acentos, troca espaços por _, minúsculas
  const key = editingCatKey || nome.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]/g,'_').replace(/__+/g,'_').replace(/^_|_$/g,'');

  setBtnLoading('btn-save-cat', true);
  try {
    // Salva no Firestore
    await db.collection('categorias_config').doc(key).set({ key, nome, icon: emoji, ordem }, { merge: true });

    // Atualiza CATEGORIAS em memória
    if (!CATEGORIAS[key]) {
      CATEGORIAS[key] = { nome, icon: emoji, produtos: [], _custom: true };
    } else {
      CATEGORIAS[key].nome = nome;
      CATEGORIAS[key].icon = emoji;
    }

    showToast(`✅ Categoria "${emoji} ${nome}" salva com sucesso!`);
    cancelEditCat();
    await renderCatsTable();
  } catch(e) {
    showAlertInline('cat-alert', 'Erro ao salvar: ' + e.message, 'danger');
  }
  setBtnLoading('btn-save-cat', false);
}

async function deleteCat(key) {
  const c = CATEGORIAS[key];
  if (CATS_NATIVAS.includes(key)) { showToast('⛔ Categorias nativas não podem ser removidas.'); return; }
  if (!confirm(`Remover a categoria "${c?.icon} ${c?.nome}"?\n\nOs produtos desta categoria serão desvinculados.`)) return;
  try {
    await db.collection('categorias_config').doc(key).delete();
    delete CATEGORIAS[key];
    showToast(`🗑️ Categoria removida.`);
    await renderCatsTable();
  } catch(e) {
    showToast('Erro ao remover: ' + e.message);
  }
}

// ════════════════════════════════════════════════════════════
// 🏷️  GERENCIAR CENTRO DE CUSTO
// ════════════════════════════════════════════════════════════
let _ccCache = []; // cache local dos CCs para preencher selects sem nova query

async function initManageCC() {
  _ccCache = []; // reseta o cache para buscar dados frescos do Firestore
  _cccatCache = [];
  await _ccCarregarTabela();
  // Volta pra sub-aba padrão e recarrega a de categorias só se ela estiver visível
  const catVisivel = document.getElementById('cc-subtab-categorias')?.style.display !== 'none';
  if (catVisivel) await _cccatCarregarTabela();
}

async function _ccCarregarTabela() {
  const tbody = document.getElementById('cc-tbody');
  const totalEl = document.getElementById('cc-total');
  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;"><div class="spinner spinner-dark"></div></td></tr>';
  try {
    const snap = await db.collection('centros_custo').orderBy('nome','asc').get();
    _ccCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (totalEl) totalEl.textContent = _ccCache.length + ' registro(s)';
    if (_ccCache.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-muted" style="text-align:center;padding:32px;">Nenhum centro de custo cadastrado ainda.</td></tr>';
      return;
    }
    tbody.innerHTML = _ccCache.map(cc => {
      const criado = cc.criadoEm?.toDate ? cc.criadoEm.toDate().toLocaleDateString('pt-BR') : '—';
      return `<tr>
        <td style="font-weight:600;">${cc.nome}</td>
        <td style="font-size:12px;color:var(--text-muted);">${cc.descricao || '—'}</td>
        <td style="font-size:12px;color:var(--text-muted);">${criado}</td>
        <td style="display:flex;gap:6px;">
          <button class="btn btn-secondary btn-sm" onclick="editCC('${cc.id}')">✏️ Editar</button>
          <button class="btn btn-outline btn-sm" style="color:var(--danger);border-color:var(--danger);" onclick="deleteCC('${cc.id}','${cc.nome.replace(/'/g,"\\'")}')">🗑️</button>
        </td>
      </tr>`;
    }).join('');
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--danger);">Erro: ${e.message}</td></tr>`;
  }
}

async function saveCC() {
  const nome = document.getElementById('cc-nome').value.trim();
  const desc = document.getElementById('cc-descricao').value.trim();
  const id   = document.getElementById('cc-editing-id').value;
  if (!nome) { showAlertInline('cc-alert','Informe o nome do centro de custo.','danger'); return; }
  setBtnLoading('btn-save-cc', true);
  try {
    if (id) {
      await db.collection('centros_custo').doc(id).update({ nome, descricao: desc });
      showToast(`✅ Centro de custo "${nome}" atualizado.`);
    } else {
      await db.collection('centros_custo').add({ nome, descricao: desc, criadoEm: firebase.firestore.FieldValue.serverTimestamp() });
      showToast(`✅ Centro de custo "${nome}" criado.`);
    }
    cancelEditCC();
    await _ccCarregarTabela();
    await _ccPopularSelects(); // atualiza os selects na Nova Solicitação e modal de pedido
  } catch(e) {
    showAlertInline('cc-alert','Erro ao salvar: ' + e.message,'danger');
  }
  setBtnLoading('btn-save-cc', false);
}

async function editCC(id) {
  const cc = _ccCache.find(c => c.id === id);
  if (!cc) return;
  document.getElementById('cc-nome').value = cc.nome;
  document.getElementById('cc-descricao').value = cc.descricao || '';
  document.getElementById('cc-editing-id').value = id;
  document.getElementById('cc-form-title').textContent = '✏️ Editar Centro de Custo';
  document.getElementById('btn-save-cc').textContent = 'Salvar';
  document.getElementById('btn-cancel-cc').style.display = '';
  document.getElementById('cc-nome').focus();
  document.getElementById('cc-nome').scrollIntoView({ behavior:'smooth', block:'center' });
}

function cancelEditCC() {
  document.getElementById('cc-nome').value = '';
  document.getElementById('cc-descricao').value = '';
  document.getElementById('cc-editing-id').value = '';
  document.getElementById('cc-form-title').textContent = '➕ Novo Centro de Custo';
  document.getElementById('btn-save-cc').textContent = '+ Criar';
  document.getElementById('btn-cancel-cc').style.display = 'none';
  const alertEl = document.getElementById('cc-alert');
  if (alertEl) alertEl.innerHTML = '';
}

async function deleteCC(id, nome) {
  if (!confirm(`Remover o centro de custo "${nome}"?\n\nPedidos que usam este centro não serão alterados.`)) return;
  try {
    await db.collection('centros_custo').doc(id).delete();
    showToast(`🗑️ Centro de custo "${nome}" removido.`);
    await _ccCarregarTabela();
    await _ccPopularSelects();
  } catch(e) {
    showToast('Erro ao remover: ' + e.message);
  }
}

// ── Preenche todos os selects de CC no sistema ──────────────────────────────
async function _ccPopularSelects() {
  if (_ccCache.length === 0) {
    try {
      const snap = await db.collection('centros_custo').orderBy('nome','asc').get();
      _ccCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch(e) { return; }
  }
  const opts = '<option value="">Selecione um centro de custo...</option>' +
    _ccCache.map(cc => `<option value="${cc.id}" data-nome="${cc.nome}">${cc.nome}</option>`).join('');

  const sel1 = document.getElementById('order-centro-custo');
  if (sel1) sel1.innerHTML = opts;

  const sel2 = document.getElementById('order-detail-cc');
  if (sel2) {
    const val = sel2.getAttribute('data-current') || '';
    sel2.innerHTML = '<option value="">🏷️ Centro de Custo</option>' +
      _ccCache.map(cc => `<option value="${cc.id}" data-nome="${cc.nome}" ${cc.id === val ? 'selected' : ''}>${cc.nome}</option>`).join('');
  }
}

// ── Salva o CC no pedido ao trocar no select do modal de detalhe ────────────
async function salvarCentroCustoNoPedido() {
  const sel   = document.getElementById('order-detail-cc');
  const ccId  = sel?.value || '';
  const ccNome = sel?.options[sel.selectedIndex]?.getAttribute('data-nome') || '';
  if (!currentDetailOrderId) return;
  try {
    await db.collection('orders').doc(currentDetailOrderId).update({ centroCustoId: ccId, centroCustoNome: ccNome });
    showToast(ccNome ? `✅ Centro de custo "${ccNome}" vinculado ao pedido.` : '✅ Centro de custo removido do pedido.');
    if (detailOrderData) {
      detailOrderData.centroCustoId   = ccId;
      detailOrderData.centroCustoNome = ccNome;
    }
  } catch(e) {
    showToast('Erro ao salvar: ' + e.message);
  }
}

// ─────────────────────────────────────────────
// 🏷️ CATEGORIAS DE CENTRO DE CUSTO (sub-aba de Gerenciar Centro de Custo)
// Namespace "cccat" isolado de propósito — já existe uma feature diferente
// chamada "Gerenciar Categorias" (categorias de PRODUTO) que usa os nomes
// saveCat/editCat/cancelEditCat/deleteCat e ids como cat-nome, cat-alert etc.
// Reaproveitar esses nomes aqui sobrescreveria as funções da outra página.
// ─────────────────────────────────────────────
let _cccatCache = [];

function setCcSubtab(nome) {
  document.querySelectorAll('.cc-subtab-btn').forEach(b => b.classList.toggle('active', b.dataset.subtab === nome));
  document.getElementById('cc-subtab-centros').style.display    = nome === 'centros'    ? '' : 'none';
  document.getElementById('cc-subtab-categorias').style.display = nome === 'categorias' ? '' : 'none';
  if (nome === 'categorias' && _cccatCache.length === 0) _cccatCarregarTabela();
}

async function _cccatCarregarTabela() {
  const tbody = document.getElementById('cccat-tbody');
  const totalEl = document.getElementById('cccat-total');
  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;"><div class="spinner spinner-dark"></div></td></tr>';
  try {
    const snap = await db.collection('centro_custo_categorias').orderBy('nome','asc').get();
    _cccatCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (totalEl) totalEl.textContent = _cccatCache.length + ' registro(s)';
    if (_cccatCache.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-muted" style="text-align:center;padding:32px;">Nenhuma categoria cadastrada ainda.</td></tr>';
      return;
    }
    tbody.innerHTML = _cccatCache.map(cat => {
      const criado = cat.criadoEm?.toDate ? cat.criadoEm.toDate().toLocaleDateString('pt-BR') : '—';
      return `<tr>
        <td style="font-weight:600;">${cat.nome}</td>
        <td style="font-size:12px;color:var(--text-muted);">${cat.descricao || '—'}</td>
        <td style="font-size:12px;color:var(--text-muted);">${criado}</td>
        <td style="display:flex;gap:6px;">
          <button class="btn btn-secondary btn-sm" onclick="editCcCat('${cat.id}')">✏️ Editar</button>
          <button class="btn btn-outline btn-sm" style="color:var(--danger);border-color:var(--danger);" onclick="deleteCcCat('${cat.id}','${cat.nome.replace(/'/g,"\\'")}')">🗑️</button>
        </td>
      </tr>`;
    }).join('');
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--danger);">Erro: ${e.message}</td></tr>`;
  }
}

async function saveCcCat() {
  const nome = document.getElementById('cccat-nome').value.trim();
  const desc = document.getElementById('cccat-descricao').value.trim();
  const id   = document.getElementById('cccat-editing-id').value;
  if (!nome) { showAlertInline('cccat-alert','Informe o nome da categoria.','danger'); return; }
  setBtnLoading('btn-save-cccat', true);
  try {
    if (id) {
      await db.collection('centro_custo_categorias').doc(id).update({ nome, descricao: desc });
      showToast(`✅ Categoria "${nome}" atualizada.`);
    } else {
      await db.collection('centro_custo_categorias').add({ nome, descricao: desc, criadoEm: firebase.firestore.FieldValue.serverTimestamp() });
      showToast(`✅ Categoria "${nome}" criada.`);
    }
    cancelEditCcCat();
    await _cccatCarregarTabela();
    await _cccatPopularSelects(); // atualiza o select de Categoria no modal de pedido
  } catch(e) {
    showAlertInline('cccat-alert','Erro ao salvar: ' + e.message,'danger');
  }
  setBtnLoading('btn-save-cccat', false);
}

async function editCcCat(id) {
  const cat = _cccatCache.find(c => c.id === id);
  if (!cat) return;
  document.getElementById('cccat-nome').value = cat.nome;
  document.getElementById('cccat-descricao').value = cat.descricao || '';
  document.getElementById('cccat-editing-id').value = id;
  document.getElementById('cccat-form-title').textContent = '✏️ Editar Categoria';
  document.getElementById('btn-save-cccat').textContent = 'Salvar';
  document.getElementById('btn-cancel-cccat').style.display = '';
  document.getElementById('cccat-nome').focus();
  document.getElementById('cccat-nome').scrollIntoView({ behavior:'smooth', block:'center' });
}

function cancelEditCcCat() {
  document.getElementById('cccat-nome').value = '';
  document.getElementById('cccat-descricao').value = '';
  document.getElementById('cccat-editing-id').value = '';
  document.getElementById('cccat-form-title').textContent = '➕ Nova Categoria';
  document.getElementById('btn-save-cccat').textContent = '+ Criar';
  document.getElementById('btn-cancel-cccat').style.display = 'none';
  const alertEl = document.getElementById('cccat-alert');
  if (alertEl) alertEl.innerHTML = '';
}

async function deleteCcCat(id, nome) {
  if (!confirm(`Remover a categoria "${nome}"?\n\nPedidos que usam essa categoria não serão alterados.`)) return;
  try {
    await db.collection('centro_custo_categorias').doc(id).delete();
    showToast(`🗑️ Categoria "${nome}" removida.`);
    await _cccatCarregarTabela();
    await _cccatPopularSelects();
  } catch(e) {
    showToast('Erro ao remover: ' + e.message);
  }
}

// ── Preenche o select de Categoria no modal de detalhe do pedido ───────────
async function _cccatPopularSelects() {
  if (_cccatCache.length === 0) {
    try {
      const snap = await db.collection('centro_custo_categorias').orderBy('nome','asc').get();
      _cccatCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch(e) { return; }
  }
  const sel = document.getElementById('order-detail-cat');
  if (sel) {
    const val = sel.getAttribute('data-current') || '';
    sel.innerHTML = '<option value="">🏷️ Categoria</option>' +
      _cccatCache.map(cat => `<option value="${cat.id}" data-nome="${cat.nome}" ${cat.id === val ? 'selected' : ''}>${cat.nome}</option>`).join('');
  }
}

// ── Salva a Categoria no pedido ao trocar no select do modal de detalhe ────
async function salvarCategoriaNoPedido() {
  const sel     = document.getElementById('order-detail-cat');
  const catId   = sel?.value || '';
  const catNome = sel?.options[sel.selectedIndex]?.getAttribute('data-nome') || '';
  if (!currentDetailOrderId) return;
  try {
    await db.collection('orders').doc(currentDetailOrderId).update({ categoriaId: catId, categoriaNome: catNome });
    showToast(catNome ? `✅ Categoria "${catNome}" vinculada ao pedido.` : '✅ Categoria removida do pedido.');
    if (detailOrderData) {
      detailOrderData.categoriaId   = catId;
      detailOrderData.categoriaNome = catNome;
    }
  } catch(e) {
    showToast('Erro ao salvar: ' + e.message);
  }
}

function toggleTheme() {
  const body = document.body;
  // Cycle: light → dark → teal → light
  const isLight = !body.classList.contains('dark-mode') && !body.classList.contains('teal-mode');
  const isDark  = body.classList.contains('dark-mode');
  const isTeal  = body.classList.contains('teal-mode');

  body.classList.remove('dark-mode', 'teal-mode');

  let nextTheme;
  if (isLight)       nextTheme = 'dark';
  else if (isDark)   nextTheme = 'teal';
  else               nextTheme = 'light';

  if (nextTheme === 'dark') body.classList.add('dark-mode');
  if (nextTheme === 'teal') body.classList.add('teal-mode');

  localStorage.setItem('lumen-theme', nextTheme);
  _updateThemeIcon(nextTheme);
  // Re-renderiza o dropdown de casas para aplicar as cores corretas do novo tema
  initPrevCasaDropdown();
}

function _updateThemeIcon(theme) {
  const moon = document.querySelector('.theme-toggle .icon-moon');
  const sun  = document.querySelector('.theme-toggle .icon-sun');
  const wave = document.querySelector('.theme-toggle .icon-wave');
  if (!moon || !sun) return;
  moon.style.display = (theme === 'light') ? '' : 'none';
  sun.style.display  = (theme === 'dark')  ? '' : 'none';
  if (wave) wave.style.display = (theme === 'teal') ? '' : 'none';
}

// Apply saved theme on load
(function() {
  const saved = localStorage.getItem('lumen-theme');
  if (saved === 'dark')      document.body.classList.add('dark-mode');
  else if (saved === 'teal') document.body.classList.add('teal-mode');
  // Update icon after DOM ready
  document.addEventListener('DOMContentLoaded', function() {
    _updateThemeIcon(saved || 'light');
  });
})();

// ─────────────────────────────────────────────
// 🎨  COLOR THEME CUSTOMIZER
// ─────────────────────────────────────────────
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return {r,g,b};
}
function lightenHex(hex, amount=0.9) {
  const {r,g,b} = hexToRgb(hex);
  const lr = Math.round(r + (255-r)*amount);
  const lg = Math.round(g + (255-g)*amount);
  const lb = Math.round(b + (255-b)*amount);
  return `#${lr.toString(16).padStart(2,'0')}${lg.toString(16).padStart(2,'0')}${lb.toString(16).padStart(2,'0')}`;
}
function darkenHex(hex, amount=0.15) {
  const {r,g,b} = hexToRgb(hex);
  return `#${Math.round(r*(1-amount)).toString(16).padStart(2,'0')}${Math.round(g*(1-amount)).toString(16).padStart(2,'0')}${Math.round(b*(1-amount)).toString(16).padStart(2,'0')}`;
}

function setThemeColor(main, dark, light) {
  const root = document.documentElement;
  root.style.setProperty('--lumen', main);
  root.style.setProperty('--lumen-mid', lightenHex(main, 0.1));
  root.style.setProperty('--lumen-lt', light);
  root.style.setProperty('--lumen-dark', dark);
  localStorage.setItem('lumen-color-main', main);
  localStorage.setItem('lumen-color-dark', dark);
  localStorage.setItem('lumen-color-light', light);
}

function applyCustomColor(hex) {
  setThemeColor(hex, darkenHex(hex, 0.18), lightenHex(hex, 0.88));
}

function setAccentColor(main, dark) {
  document.documentElement.style.setProperty('--accent', main);
  document.documentElement.style.setProperty('--accent-dk', dark);
  localStorage.setItem('lumen-color-accent', main);
  localStorage.setItem('lumen-color-accent-dk', dark);
}

function applyCustomAccent(hex) {
  setAccentColor(hex, darkenHex(hex, 0.15));
}

function resetColors() {
  const root = document.documentElement;
  root.style.removeProperty('--lumen');
  root.style.removeProperty('--lumen-mid');
  root.style.removeProperty('--lumen-lt');
  root.style.removeProperty('--lumen-dark');
  root.style.removeProperty('--accent');
  root.style.removeProperty('--accent-dk');
  ['lumen-color-main','lumen-color-dark','lumen-color-light','lumen-color-accent','lumen-color-accent-dk'].forEach(k => localStorage.removeItem(k));
}

// ─────────────────────────────────────────────
// 👥 INDICADORES DOS IRMÃOS
// ─────────────────────────────────────────────
let chartIrmaos = null;

// ── Chips clicáveis de casas — sempre visíveis, sem flutuar por cima de nada ──
// (substitui o dropdown antigo, que ficava preso atrás de outros cards em temas
// com backdrop-filter por causa de contexto de empilhamento do CSS)
let irmCasasSelecionadas = new Set(); // vazio = todas

function renderIrmCasaChips() {
  const box = document.getElementById('irm-casa-chips');
  if (!box) return;
  box.innerHTML = '';
  CASAS.forEach(nome => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'irm-chip' + (irmCasasSelecionadas.has(nome) ? ' selected' : '');
    chip.textContent = nome;
    chip.dataset.casa = nome;
    chip.onclick = () => toggleIrmCasaChip(nome);
    box.appendChild(chip);
  });
  atualizarIrmCasaCount();
}

function toggleIrmCasaChip(nome) {
  if (irmCasasSelecionadas.has(nome)) irmCasasSelecionadas.delete(nome);
  else irmCasasSelecionadas.add(nome);
  const chip = document.querySelector(`.irm-chip[data-casa="${CSS.escape(nome)}"]`);
  if (chip) chip.classList.toggle('selected', irmCasasSelecionadas.has(nome));
  atualizarIrmCasaCount();
  loadIrmaosIndicadores();
}

function irmCasaSelectAll() {
  irmCasasSelecionadas = new Set(CASAS);
  document.querySelectorAll('.irm-chip').forEach(c => c.classList.add('selected'));
  atualizarIrmCasaCount();
  loadIrmaosIndicadores();
}

function irmCasaClearAll() {
  irmCasasSelecionadas = new Set();
  document.querySelectorAll('.irm-chip').forEach(c => c.classList.remove('selected'));
  atualizarIrmCasaCount();
  loadIrmaosIndicadores();
}

function filtrarIrmCasaChips(termo) {
  const t = (termo || '').toLowerCase().trim();
  document.querySelectorAll('.irm-chip').forEach(chip => {
    const nome = (chip.dataset.casa || '').toLowerCase();
    chip.style.display = (!t || nome.includes(t)) ? '' : 'none';
  });
}

function getIrmCasasSelecionadas() {
  // Convenção mantida: [] = todas as casas (nenhum filtro aplicado)
  return (irmCasasSelecionadas.size === 0 || irmCasasSelecionadas.size === CASAS.length)
    ? []
    : Array.from(irmCasasSelecionadas);
}

function atualizarIrmCasaCount() {
  const el = document.getElementById('irm-casa-count');
  if (!el) return;
  const n = irmCasasSelecionadas.size;
  el.textContent = (n === 0 || n === CASAS.length) ? '(todas as casas)' : `(${n} selecionada${n > 1 ? 's' : ''})`;
}

let irmRowsAtual = [];
let irmFiltroStatus = 'todos'; // 'todos' | 'down' | 'flat' | 'up' | 'nd'

function statusDaRow(r) {
  if (r.variacaoPeriodo === null) return 'nd';
  if (r.variacaoPeriodo > 0) return 'up';
  if (r.variacaoPeriodo < 0) return 'down';
  return 'flat';
}

function setIrmFiltroStatus(filtro) {
  irmFiltroStatus = filtro;
  document.querySelectorAll('.irm-status-filtro-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.filtro === filtro);
  });
  renderIrmTabela();
}

function renderIrmTabela() {
  const tbody = document.getElementById('irm-tbody');
  if (!tbody) return;

  const linhas = irmFiltroStatus === 'todos'
    ? irmRowsAtual
    : irmRowsAtual.filter(r => statusDaRow(r) === irmFiltroStatus);

  if (irmRowsAtual.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:32px;color:var(--text-muted);">Nenhum dado encontrado</td></tr>';
    return;
  }
  if (linhas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:32px;color:var(--text-muted);">Nenhuma casa nesse filtro.</td></tr>';
    return;
  }

  // Ordena pela variação (quem caiu mais primeiro) — casas sem dado suficiente vão para o final.
  const ordenadas = linhas.slice().sort((a, b) => {
    if (a.variacaoPeriodo === null && b.variacaoPeriodo === null) return b.total - a.total;
    if (a.variacaoPeriodo === null) return 1;
    if (b.variacaoPeriodo === null) return -1;
    return a.variacaoPeriodo - b.variacaoPeriodo;
  });

  tbody.innerHTML = ordenadas.map(r => {
    const status  = statusDaRow(r);
    const temDado = status !== 'nd';
    const cor        = status === 'up' ? 'var(--ok)' : status === 'down' ? 'var(--danger)' : 'var(--text-muted)';
    const seta       = status === 'up' ? '↑' : status === 'down' ? '↓' : status === 'flat' ? '=' : '—';
    const statusTxt  = status === 'up' ? 'Aumentou' : status === 'down' ? 'Diminuiu' : status === 'flat' ? 'Estável' : 'Sem dado suficiente';
    const badgeClass = status === 'up' ? 'badge-ok' : status === 'down' ? 'badge-danger' : status === 'flat' ? 'badge-info' : 'badge-gray';
    return `
      <tr>
        <td style="font-weight:600;">${r.name}</td>
        <td style="text-align:center;">${temDado ? r.inicioPeriodo : '—'}</td>
        <td style="text-align:center;">${temDado ? r.fimPeriodo : '—'}</td>
        <td style="text-align:center;color:${cor};font-weight:700;">${temDado ? seta + Math.abs(r.variacaoPeriodo) : '—'}</td>
        <td style="text-align:center;"><span class="badge ${badgeClass}">${statusTxt}</span></td>
        <td style="text-align:center;color:var(--ok);font-weight:700;">${r.acolhidos}</td>
        <td style="text-align:center;font-weight:700;">${r.coordenadores}</td>
        <td style="text-align:center;color:var(--text-muted);">${r.extra}</td>
        <td style="text-align:center;font-weight:700;font-size:15px;color:var(--lumen);">${r.total}</td>
        <td style="font-size:12px;color:var(--text-muted);">${r.updatedAt}</td>
        <td style="font-size:12px;color:var(--text-muted);">${r.updatedBy}</td>
      </tr>`;
  }).join('');
}

function exportIrmRelatorioPDF() {
  if (!irmRowsAtual || irmRowsAtual.length === 0) {
    showToast('Nenhum dado carregado. Clique em Atualizar antes de exportar.');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const blue = [0,56,117], lightBlue = [230,238,248], gray = [107,114,128];
  const green = [22,163,74], red = [220,38,38], dark = [17,17,17];

  // Cabeçalho
  doc.setFillColor(...blue); doc.rect(0,0,210,24,'F');
  doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(14);
  doc.text('Lumen Estoque — Indicadores dos Irmãos', 14, 12);
  doc.setFont('helvetica','normal'); doc.setFontSize(9);
  doc.text('Gerado em: ' + new Date().toLocaleString('pt-BR'), 14, 19);

  let y = 32;

  // Filtros aplicados
  const casasSel   = getIrmCasasSelecionadas();
  const casasTxt   = casasSel.length === 0 ? `Todas as casas (${CASAS.length})` : `${casasSel.length} selecionada(s): ${casasSel.join(', ')}`;
  const tipoTxt    = { todos:'Todos', acolhidos:'Acolhidos', coordenadores:'Coordenadores' }[document.getElementById('irm-tipo')?.value || 'todos'];
  const dataIniStr = document.getElementById('irm-data-ini')?.value || '';
  const dataFimStr = document.getElementById('irm-data-fim')?.value || '';
  const periodoTxt = (dataIniStr || dataFimStr)
    ? `${dataIniStr ? new Date(dataIniStr+'T00:00:00').toLocaleDateString('pt-BR') : 'início'} até ${dataFimStr ? new Date(dataFimStr+'T00:00:00').toLocaleDateString('pt-BR') : 'hoje'}`
    : 'Todo o histórico disponível';
  const amostraTxt = document.getElementById('irm-amostra-info')?.textContent || '';

  doc.setTextColor(...gray); doc.setFontSize(8); doc.setFont('helvetica','bold');
  doc.text('FILTROS APLICADOS', 14, y);
  y += 5;
  doc.setFont('helvetica','normal'); doc.setTextColor(...dark); doc.setFontSize(9);
  const casasLines = doc.splitTextToSize(`Casas: ${casasTxt}`, 182);
  doc.text(casasLines, 14, y); y += casasLines.length * 5;
  doc.text(`Tipo: ${tipoTxt}`, 14, y); y += 5;
  doc.text(`Período: ${periodoTxt}`, 14, y); y += 5;
  const amostraLines = doc.splitTextToSize(amostraTxt, 182);
  doc.text(amostraLines, 14, y); y += amostraLines.length * 5 + 4;

  // Resumo (KPIs)
  const varTxt = (document.getElementById('irm-variacao')?.textContent || '—').trim();
  const kpis = [
    { label: 'TOTAL DE IRMÃOS',      value: document.getElementById('irm-total')?.textContent || '—',     cor: dark  },
    { label: 'ACOLHIDOS',            value: document.getElementById('irm-acolhidos')?.textContent || '—', cor: green },
    { label: 'COORDENADORES',        value: document.getElementById('irm-coord')?.textContent || '—',     cor: dark  },
    { label: 'VARIAÇÃO NO PERÍODO',  value: varTxt.replace('↑','+').replace('↓','-'),
      cor: varTxt.includes('↓') ? red : varTxt.includes('↑') ? green : gray },
  ];
  const boxW = 44, boxH = 18, gapBox = 3, startX = 14;
  kpis.forEach((k, i) => {
    const x = startX + i * (boxW + gapBox);
    doc.setFillColor(245,247,250); doc.rect(x, y, boxW, boxH, 'F');
    doc.setTextColor(...gray); doc.setFontSize(6.5); doc.setFont('helvetica','bold');
    doc.text(k.label, x+3, y+6);
    doc.setTextColor(...k.cor); doc.setFontSize(13); doc.setFont('helvetica','bold');
    doc.text(String(k.value), x+3, y+14);
  });
  y += boxH + 10;

  // Tabelas agrupadas por status — substitui os botões de filtro que existem só na tela
  const grupos = [
    { key:'down', titulo:'Diminuíram'                            },
    { key:'flat', titulo:'Mantiveram'                            },
    { key:'up',   titulo:'Aumentaram'                            },
    { key:'nd',   titulo:'Sem dado suficiente no período'        },
  ];

  grupos.forEach(g => {
    const linhas = irmRowsAtual
      .filter(r => statusDaRow(r) === g.key)
      .sort((a,b) => g.key === 'nd' ? b.total - a.total : a.variacaoPeriodo - b.variacaoPeriodo);
    if (linhas.length === 0) return;

    if (y > 250) { doc.addPage(); y = 20; }

    const body = linhas.map(r => [
      r.name,
      r.inicioPeriodo === null ? '—' : String(r.inicioPeriodo),
      r.fimPeriodo === null ? '—' : String(r.fimPeriodo),
      r.variacaoPeriodo === null ? '—' : (r.variacaoPeriodo > 0 ? '+' : '') + r.variacaoPeriodo,
      String(r.acolhidos), String(r.coordenadores), String(r.extra), String(r.total),
      r.updatedAt, r.updatedBy,
    ]);

    doc.autoTable({
      startY: y,
      head: [
        [{ content: `${g.titulo} — ${linhas.length} casa(s)`, colSpan: 10, styles: { fillColor: blue, textColor: 255, halign: 'left', fontStyle: 'bold', fontSize: 9 } }],
        ['Casa','Início','Fim','Variação','Acolhidos','Coord.','Extra','Total','Últ. registro','Registrado por'],
      ],
      body,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1.6 },
      headStyles: { fillColor: lightBlue, textColor: [40,40,40], fontSize: 7 },
      margin: { left: 14, right: 14 },
      didDrawPage: () => { doc.setTextColor(...gray); doc.setFontSize(7); doc.text('Lumen Estoque — lumenserfeliz.org', 14, 290); },
    });
    y = doc.lastAutoTable.finalY + 8;
  });

  doc.save(`LM-Indicadores-Irmaos-${new Date().toISOString().slice(0,10)}.pdf`);
  showToast('✅ Relatório exportado com sucesso!');
}

async function loadIrmaosIndicadores() {
  // Popula chips de casas na primeira vez
  const box = document.getElementById('irm-casa-chips');
  if (box && box.children.length === 0) renderIrmCasaChips();

  const casasSel = getIrmCasasSelecionadas(); // [] = todas
  const tipoSel  = document.getElementById('irm-tipo')?.value || 'todos';

  // Período de análise (opcional). Datas em <input type="date"> vêm como 'YYYY-MM-DD'.
  const dataIniStr = document.getElementById('irm-data-ini')?.value || '';
  const dataFimStr = document.getElementById('irm-data-fim')?.value || '';
  const dataIni = dataIniStr ? new Date(dataIniStr + 'T00:00:00') : null;
  const dataFim = dataFimStr ? new Date(dataFimStr + 'T23:59:59') : null;

  try {
    const snap = await db.collection('houses').get();

    let totalAcolhidos = 0, totalCoord = 0, totalExtra = 0;
    const rows = [];
    // timelineData: { casaName: [{ ts:Date, dateLabel:string, acolhidos, coordenadores, total }] }
    const timelineData = {};
    let totalAmostras = 0;

    snap.docs.forEach(doc => {
      const d = doc.data();
      const nomeCasa = d.name || doc.id;
      if (casasSel.length > 0 && !casasSel.includes(nomeCasa)) return;

      const acolhidos     = d.acolhidos     || 0;
      const coordenadores = d.coordenadores || 0;
      const extra         = d.extra         || 0;
      const total         = d.currentPeople || (acolhidos + coordenadores + extra);
      const history        = d.peopleHistory || [];
      const updatedAt      = d.updatedAt?.toDate ? d.updatedAt.toDate().toLocaleDateString('pt-BR') : '—';
      const updatedBy       = history.length > 0 ? (history[history.length-1].updatedBy || '—') : '—';

      totalAcolhidos += acolhidos;
      totalCoord     += coordenadores;
      totalExtra     += extra;

      // Filtra o histórico pelo período selecionado e ordena cronologicamente (data real, não string)
      const historyFiltrado = history
        .map(h => ({ ts: h.date ? new Date(h.date) : null, h }))
        .filter(x => x.ts && !isNaN(x.ts))
        .filter(x => (!dataIni || x.ts >= dataIni) && (!dataFim || x.ts <= dataFim))
        .sort((a, b) => a.ts - b.ts);

      let inicioPeriodo = null, fimPeriodo = null, variacaoPeriodo = null;
      if (historyFiltrado.length > 0) {
        totalAmostras += historyFiltrado.length;
        timelineData[nomeCasa] = historyFiltrado.map(x => ({
          ts:            x.ts,
          dateLabel:     x.ts.toLocaleDateString('pt-BR'),
          acolhidos:     x.h.acolhidos     || 0,
          coordenadores: x.h.coordenadores || 0,
          total:         x.h.count || 0,
        }));
        inicioPeriodo = historyFiltrado[0].h.count || 0;
        fimPeriodo    = historyFiltrado[historyFiltrado.length - 1].h.count || 0;
        if (historyFiltrado.length >= 2) variacaoPeriodo = fimPeriodo - inicioPeriodo;
      }

      rows.push({ name: nomeCasa, acolhidos, coordenadores, extra, total, updatedAt, updatedBy, inicioPeriodo, fimPeriodo, variacaoPeriodo });
    });

    // Atualiza cards (situação atual das casas selecionadas)
    const totalGeral = totalAcolhidos + totalCoord + totalExtra;
    document.getElementById('irm-total').textContent     = totalGeral;
    document.getElementById('irm-acolhidos').textContent = totalAcolhidos;
    document.getElementById('irm-coord').textContent     = totalCoord;

    // Variação no período: por casa, compara o primeiro e o último registro DENTRO do
    // período filtrado (não mistura registros de casas diferentes como antes).
    const casasComVariacao = Object.entries(timelineData).filter(([, h]) => h.length >= 2);
    let variacaoHtml = '—';
    if (casasComVariacao.length > 0) {
      const somaVariacao = casasComVariacao.reduce((acc, [, h]) => {
        return acc + ((h[h.length - 1].total || 0) - (h[0].total || 0));
      }, 0);
      const cor  = somaVariacao > 0 ? 'var(--ok)' : somaVariacao < 0 ? 'var(--danger)' : 'var(--text-muted)';
      const seta = somaVariacao > 0 ? '↑' : somaVariacao < 0 ? '↓' : '=';
      variacaoHtml = `<span style="color:${cor};">${seta}${Math.abs(somaVariacao)}</span>`;
    }
    document.getElementById('irm-variacao').innerHTML = variacaoHtml;

    // Info da amostra: quantos registros e quantas casas embasam a análise
    const infoEl = document.getElementById('irm-amostra-info');
    if (infoEl) {
      const nCasas = Object.keys(timelineData).length;
      if (totalAmostras === 0) {
        infoEl.textContent = 'Nenhum registro de histórico encontrado para o filtro selecionado.';
      } else {
        const periodoTxt = (dataIni || dataFim)
          ? `no período de ${dataIni ? dataIni.toLocaleDateString('pt-BR') : 'início'} até ${dataFim ? dataFim.toLocaleDateString('pt-BR') : 'hoje'}`
          : 'em todo o histórico disponível';
        infoEl.textContent = `Amostra: ${totalAmostras} registro(s) em ${nCasas} casa(s) ${periodoTxt}. ` +
          `${casasComVariacao.length} casa(s) com dados suficientes (no mínimo 2 registros) para calcular variação.`;
      }
    }

    // Tabela — guarda as linhas calculadas e delega o desenho pra renderIrmTabela(),
    // que sabe filtrar por status (diminuiu/manteve/aumentou/sem dado) sem refazer a consulta.
    irmRowsAtual = rows;
    renderIrmTabela();

    // Gráfico de evolução — agora suporta quantas casas o usuário selecionar
    // (antes limitado a 6) e o eixo X é ordenado por data real, não por ordem
    // de aparição nos dados (o que causava datas fora de ordem no eixo).
    const casasComHistory = Object.entries(timelineData);
    if (casasComHistory.length > 0) {
      // União de todos os timestamps, deduplicados por dia, ordenados cronologicamente
      const tsMap = new Map(); // 'YYYY-MM-DD' → { ts, label }
      casasComHistory.forEach(([, h]) => h.forEach(e => {
        const key = e.ts.toISOString().slice(0, 10);
        if (!tsMap.has(key)) tsMap.set(key, { ts: e.ts, label: e.dateLabel });
      }));
      const ordenados = [...tsMap.entries()].sort((a, b) => a[1].ts - b[1].ts);
      const labelKeys = ordenados.map(([key]) => key);
      const labels    = ordenados.map(([, v]) => v.label);

      const cores = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16','#f97316','#6366f1'];
      const datasets = casasComHistory.map(([casa, history], i) => {
        // índice por dia para lookup rápido
        const porDia = new Map(history.map(e => [e.ts.toISOString().slice(0, 10), e]));
        return {
          label: casa,
          data: labelKeys.map(key => {
            const entry = porDia.get(key);
            if (!entry) return null;
            return tipoSel === 'acolhidos' ? entry.acolhidos
              : tipoSel === 'coordenadores' ? entry.coordenadores
              : entry.total;
          }),
          borderColor: cores[i % cores.length],
          backgroundColor: cores[i % cores.length] + '22',
          tension: 0.3, fill: false, spanGaps: true,
        };
      });

      const ctx = document.getElementById('chart-irmaos').getContext('2d');
      if (chartIrmaos) chartIrmaos.destroy();
      chartIrmaos = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom' } },
          scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
      });
    } else {
      if (chartIrmaos) { chartIrmaos.destroy(); chartIrmaos = null; }
    }

  } catch(e) {
    console.error('loadIrmaosIndicadores error:', e);
    showToast('Erro ao carregar indicadores: ' + e.message);
  }
}

// ─────────────────────────────────────────────
// 📋 HISTÓRICO DE MOVIMENTAÇÕES
// ─────────────────────────────────────────────

function movSetTab(tab, btn) {
  ['registro','historico'].forEach(t => {
    document.getElementById('mov-tab-' + t).style.display = t === tab ? '' : 'none';
    const b = document.getElementById('mov-tab-btn-' + t);
    if (b) {
      b.style.color       = t === tab ? 'var(--lumen)' : 'var(--text-muted)';
      b.style.fontWeight  = t === tab ? '700' : '600';
      b.style.borderBottom= t === tab ? '2px solid var(--lumen)' : 'none';
    }
  });
  if (tab === 'historico') {
    // Popula select de casas
    const sel = document.getElementById('hist-filtro-casa');
    if (sel && sel.options.length <= 1) {
      CASAS.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c; opt.textContent = c;
        sel.appendChild(opt);
      });
    }
    // Reseta filtros ao abrir a aba
    const tipoSel = document.getElementById('hist-filtro-tipo');
    if (tipoSel) tipoSel.value = ''; // garante "Todos"
    const userFilt = document.getElementById('hist-filtro-user');
    if (userFilt) userFilt.value = '';
    // Define datas padrão: início do ano atual até hoje
    const hoje = new Date();
    const inicioAno = new Date(hoje.getFullYear(), 0, 1); // 01/01/ano
    const de  = document.getElementById('hist-filtro-de');
    const ate = document.getElementById('hist-filtro-ate');
    if (de)  de.value  = inicioAno.toISOString().slice(0,10);
    if (ate) ate.value = hoje.toISOString().slice(0,10);
    loadMovHistory();
  }
}

async function loadMovHistory() {
  const tbody   = document.getElementById('hist-tbody');
  const countEl = document.getElementById('hist-count');
  tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:32px;"><div class="spinner spinner-dark"></div></td></tr>';

  try {
    const casa    = document.getElementById('hist-filtro-casa')?.value || '';
    const tipo    = document.getElementById('hist-filtro-tipo')?.value || '';
    const de      = document.getElementById('hist-filtro-de')?.value   || '';
    const ate     = document.getElementById('hist-filtro-ate')?.value  || '';
    const usuario = (document.getElementById('hist-filtro-user')?.value || '').toLowerCase();

    // Busca com fallback: tenta orderBy createdAt, se falhar (índice ausente) busca sem ordem
    let docs = [];
    try {
      let query = db.collection('movements').orderBy('createdAt', 'desc').limit(1000);
      if (casa) query = db.collection('movements').where('house', '==', casa).orderBy('createdAt', 'desc').limit(1000);
      const snap = await query.get();
      docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch(e1) {
      // Fallback sem orderBy (evita erro de índice composto)
      console.warn('Histórico: orderBy falhou, tentando sem ordenação.', e1.message);
      try {
        let q2 = casa
          ? db.collection('movements').where('house', '==', casa).limit(1000)
          : db.collection('movements').limit(1000);
        const snap2 = await q2.get();
        docs = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch(e2) {
        throw e2; // propaga para o catch externo
      }
    }
    // Ordena localmente por data (mais recente primeiro)
    docs.sort((a, b) => {
      const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.dateStr ? parseInt(a.dateStr) : 0);
      const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.dateStr ? parseInt(b.dateStr) : 0);
      return tb - ta;
    });

    // Filtros locais (sem índice composto)
    // dateStr é salvo como "20260508" (YYYYMMDD sem hífen) — converte filtro para o mesmo formato
    const deStr  = de  ? de.replace(/-/g, '')  : '';
    const ateStr = ate ? ate.replace(/-/g, '') : '';
    if (deStr)   docs = docs.filter(d => {
      const ds = d.dateStr || (d.date ? d.date.replace(/-/g,'') : '');
      return ds >= deStr;
    });
    if (ateStr)  docs = docs.filter(d => {
      const ds = d.dateStr || (d.date ? d.date.replace(/-/g,'') : '');
      return ds <= ateStr;
    });
    if (tipo)    docs = docs.filter(d => d.type === tipo);
    if (usuario) docs = docs.filter(d => (d.registeredBy || '').toLowerCase().includes(usuario));

    countEl.textContent = docs.length + ' registros';

    // Resumo de totais
    const totEnt   = docs.filter(d => d.type === 'entrada').length;
    const totSai   = docs.filter(d => d.type !== 'entrada').length;
    const casasSet = [...new Set(docs.map(d => d.house).filter(Boolean))];
    const usersSet = [...new Set(docs.map(d => d.registeredBy).filter(Boolean))];
    const resumoEl = document.getElementById('hist-resumo');
    if (resumoEl) {
      resumoEl.style.display = 'flex';
      document.getElementById('hist-total-ent').textContent = totEnt;
      document.getElementById('hist-total-sai').textContent = totSai;
    }
    // Guarda docs para exportação CSV e paginação (já vem ordenado do mais recente para o mais antigo)
    window._histDocs = docs;
    histPage = 1;
    renderHistTable();

  } catch(e) {
    console.error('loadMovHistory error:', e);
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--danger);">Erro ao carregar: ${e.message}<br><small style="color:var(--text-muted);">Se aparecer "requires an index", crie o índice no Firebase Console (link no console do navegador)</small></td></tr>`;
    document.getElementById('hist-pagination').style.display = 'none';
  }
}

// ── Paginação do histórico (30 em 30, mais recente primeiro) ──
const HIST_PAGE_SIZE = 30;
let histPage = 1;

function histTotalPages() {
  const total = (window._histDocs || []).length;
  return Math.max(1, Math.ceil(total / HIST_PAGE_SIZE));
}

function histGoToPage(p) {
  const max = histTotalPages();
  histPage = Math.min(Math.max(1, p), max);
  renderHistTable();
}

function histRowHtml(d) {
  let dt = null;
  if (d.createdAt?.toDate) {
    dt = d.createdAt.toDate();
  } else if (d.date) {
    dt = new Date(d.date + 'T00:00:00');
  }
  let dataHora = '—';
  if (dt && !isNaN(dt)) {
    dataHora = dt.toLocaleString('pt-BR');
  } else if (d.dateStr) {
    const ds = d.dateStr;
    if (ds.length === 8) dataHora = ds.slice(6,8) + '/' + ds.slice(4,6) + '/' + ds.slice(0,4);
    else dataHora = d.dateStr;
  }
  const tipo2 = d.type === 'entrada'
    ? '<span style="color:var(--ok);font-weight:700;">📥 Entrada</span>'
    : '<span style="color:var(--danger);font-weight:700;">📤 Saída</span>';

  const itens = d.items || [];
  const totalItens = itens.length;
  const qtdTotal   = itens.reduce((s,i) => s + (parseFloat(i.qty)||0), 0) || d.qty || 0;

  const canDelete = ['admin','diretor','gerente','coordenador','compras','estoque'].includes(currentUserData?.role);

  // Escapa o id para uso inline
  const eid = d.id.replace(/'/g, "\'");

  return `<tr style="cursor:default;">
    <td style="font-size:12px;white-space:nowrap;">${dataHora}</td>
    <td>${tipo2}</td>
    <td style="font-size:12px;">${d.house || '—'}</td>
    <td style="text-align:right;font-weight:700;">${totalItens > 0 ? totalItens + ' produto' + (totalItens > 1 ? 's' : '') + ' · ' + qtdTotal + ' un.' : (qtdTotal ? qtdTotal + ' un.' : '—')}</td>
    <td style="font-size:12px;color:var(--text-muted);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${(d.obs||'').replace(/"/g,'&quot;')}">${d.obs || '—'}</td>
    <td style="font-size:12px;color:var(--text-muted);">${d.registeredBy || '—'}</td>
    <td style="text-align:center;">
      <button onclick="verMovimento('${eid}')"
        style="background:rgba(var(--lumen-rgb,79,140,255),0.12);color:var(--lumen);border:1px solid rgba(var(--lumen-rgb,79,140,255),0.3);border-radius:6px;padding:3px 12px;font-size:11px;font-weight:700;cursor:pointer;">
        🔍 Ver
      </button>
    </td>
    <td style="text-align:center;">
      ${canDelete ? `<button onclick="deleteMovement('${eid}')"
        style="background:var(--danger-bg);color:var(--danger);border:1px solid var(--danger);border-radius:6px;padding:3px 10px;font-size:11px;font-weight:700;cursor:pointer;">
        🗑️
      </button>` : '—'}
    </td>
  </tr>`;
}

function renderHistTable() {
  const tbody = document.getElementById('hist-tbody');
  const pagWrap = document.getElementById('hist-pagination');
  const docs = window._histDocs || [];

  if (docs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted);">Nenhuma movimentação encontrada</td></tr>';
    pagWrap.style.display = 'none';
    return;
  }

  const totalPages = histTotalPages();
  if (histPage > totalPages) histPage = totalPages;
  const start = (histPage - 1) * HIST_PAGE_SIZE;
  const pageDocs = docs.slice(start, start + HIST_PAGE_SIZE);

  tbody.innerHTML = pageDocs.map(histRowHtml).join('');

  // Controles de paginação
  pagWrap.style.display = 'flex';
  document.getElementById('hist-pag-info').textContent =
    `Mostrando ${start + 1}–${Math.min(start + HIST_PAGE_SIZE, docs.length)} de ${docs.length}`;
  document.getElementById('hist-pag-pages').textContent = `Página ${histPage} de ${totalPages}`;
  document.getElementById('hist-pag-first').disabled = histPage === 1;
  document.getElementById('hist-pag-prev').disabled  = histPage === 1;
  document.getElementById('hist-pag-next').disabled  = histPage === totalPages;
  document.getElementById('hist-pag-last').disabled   = histPage === totalPages;
}

function exportHistoricoCSV() {
  const docs = window._histDocs || [];
  if (!docs.length) { showToast('Nenhum dado para exportar.'); return; }
  const header = ['Data/Hora','Tipo','Casa','Categoria','Produtos','Qtd Total','Observação','Usuário'];
  const rows = docs.map(d => {
    const dt = d.createdAt?.toDate ? d.createdAt.toDate() : (d.date ? new Date(d.date+'T00:00:00') : null);
    const dataHora = dt && !isNaN(dt) ? dt.toLocaleString('pt-BR') : (d.dateStr || '');
    const itens = d.items || [];
    const produtos = itens.map(it => `${it.prodName||it.productId}: ${it.qty} ${it.unit||''}`).join(' | ') || (d.prodName ? `${d.prodName}: ${d.qty}` : '');
    const qtdTotal = itens.reduce((s,i) => s + (parseFloat(i.qty)||0), 0) || d.qty || '';
    const catLabel = d.catKey ? (window.CATEGORIAS?.[d.catKey]?.nome || d.catKey) : (d.category || '');
    return [dataHora, d.type||'', d.house||'', catLabel, produtos, qtdTotal, d.obs||'', d.registeredBy||'']
      .map(v => `"${String(v).replace(/"/g,'""')}"`).join(',');
  });
  const csv = '\uFEFF' + [header.join(','), ...rows].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = `historico_movimentacoes_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  showToast('✅ CSV exportado!');
}

async function deleteMovement(id) {
  if (!confirm('Tem certeza que deseja excluir esta movimentação?\n\nAtenção: isso afetará o saldo do estoque!')) return;
  try {
    await db.collection('movements').doc(id).delete();
    showToast('✅ Movimentação excluída!');
    loadMovHistory();
  } catch(e) {
    showToast('❌ Erro ao excluir: ' + e.message);
  }
}

