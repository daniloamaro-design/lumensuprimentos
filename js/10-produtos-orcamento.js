// Extraído de index.html (gerenciar produtos + orçamento financeiro + fornecedores + export) em 2026-07-27
// ─────────────────────────────────────────────
// 📦  GERENCIAR PRODUTOS
// ─────────────────────────────────────────────
let mpCat = 'cereal';
let mpEditingId = null;

async function initManageProducts() {
  renderMpPrecosGrid();
  // Regenera abas de gerenciar produtos
  const mpTabsEl = document.getElementById('mp-cat-tabs');
  if (mpTabsEl) {
    mpTabsEl.innerHTML = Object.entries(CATEGORIAS).map(([k,c],i) => `
      <button class="cat-tab ${i===0?'active':''}" data-cat="${k}" onclick="setMpCat('${k}')">
        ${c.icon} ${c.nome} <span class="cat-count" id="mp-count-${k}"></span>
      </button>`).join('');
  }
  setMpCat(Object.keys(CATEGORIAS)[0] || 'cereal');
  await loadMpProducts();
}

function renderMpPrecosGrid() {
  const grid = document.getElementById('mp-precos-grid');
  if (!grid) return;
  grid.innerHTML = CIDADES.map(cidade => `
    <div style="background:var(--bg);border-radius:8px;padding:10px 12px;">
      <div style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.3px;">${cidade}</div>
      <div style="display:flex;align-items:center;gap:4px;">
        <span style="font-size:12px;color:var(--text-muted);">R$</span>
        <input type="number" class="form-input" min="0" step="0.01"
          id="mp-preco-${cidade.replace(/[^a-zA-Z0-9]/g,'_')}"
          placeholder="0,00" style="padding:6px 8px;font-size:13px;">
      </div>
    </div>`).join('');
}

function setMpCat(cat) {
  mpCat = cat;
  document.querySelectorAll('#mp-cat-tabs .cat-tab').forEach(t => t.classList.toggle('active', t.dataset.cat === cat));
  const info = CATEGORIAS[cat];
  const titleEl = document.getElementById('mp-list-title');
  if (titleEl) titleEl.textContent = `${info.icon} Produtos de ${info.nome}`;
  // Popula o select de categoria do formulário
  populateCatSelect('mp-categoria', false, cat);
  loadMpProducts();
}

async function loadMpProducts() {
  const tbody = document.getElementById('mp-tbody');
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;"><div class="loading-state"><div class="spinner spinner-dark"></div></div></td></tr>';

  // Carrega produtos customizados/sobrescritos do Firebase (fonte de verdade para nomes)
  const snap = await db.collection('produtos_config').where('categoria','==',mpCat).get();
  const customProds = {};
  snap.docs.forEach(d => { customProds[d.id] = { id: d.id, ...d.data() }; });

  // Re-aplica overrides do Firebase em CATEGORIAS (para manter memória sincronizada)
  snap.docs.forEach(d => {
    const data = d.data();
    const idx = CATEGORIAS[mpCat]?.produtos.findIndex(p => p.id === d.id);
    if (idx >= 0) {
      CATEGORIAS[mpCat].produtos[idx] = {
        ...CATEGORIAS[mpCat].produtos[idx],
        nome: data.nome, unidade: data.unidade, ppp: data.percapita || 0, _overridden: true
      };
    }
  });

  // Carrega preços
  const pricesSnap = await db.collection('prices').where('cat','==',mpCat).get();
  const precosPorProd = {};
  pricesSnap.docs.forEach(d => {
    const p = d.data();
    if (!precosPorProd[p.prodId]) precosPorProd[p.prodId] = {};
    precosPorProd[p.prodId][p.city] = p.price;
  });

  // Produtos padrão — usa nome do Firebase se disponível, senão usa o padrão do código
  const padrao = CATEGORIAS[mpCat].produtos;
  const rows = [];

  padrao.forEach(p => {
    // Usa nome atualizado: do Firebase (customProds) se existir, senão do CATEGORIAS em memória
    const fb = customProds[p.id];
    const nome     = fb ? fb.nome     : p.nome;
    const unidade  = fb ? fb.unidade  : p.unidade;
    const percapita= fb ? (fb.percapita || p.ppp) : p.ppp;
    const precos   = precosPorProd[p.id] || {};
    const cidadesComPreco = Object.keys(precos).length;
    rows.push({ id: p.id, nome, unidade, percapita, precos, cidadesComPreco, tipo: 'padrao', status: fb?.status || 'ativo' });
  });

  // Customizados (não padrão)
  Object.values(customProds).forEach(p => {
    if (padrao.some(x => x.id === p.id)) return;
    const precos = precosPorProd[p.id] || {};
    const cidadesComPreco = Object.keys(precos).length;
    rows.push({ id: p.id, nome: p.nome, unidade: p.unidade, percapita: p.percapita || 0, precos, cidadesComPreco, tipo: 'custom', status: p.status || 'ativo', docId: p.id });
  });

  // Atualiza contadores nas abas
  Object.keys(CATEGORIAS).forEach(cat => {
    const el = document.getElementById(`mp-count-${cat}`);
    if (el) el.textContent = CATEGORIAS[cat].produtos.length;
  });

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-muted" style="text-align:center;padding:24px;">Nenhum produto nesta categoria.</td></tr>';
    return;
  }

  const mpSort = document.getElementById('mp-sort')?.value || 'alpha';
  rows.sort((a, b) => {
    if (mpSort === 'alpha-desc') return String(b.nome||'').localeCompare(String(a.nome||''), 'pt-BR');
    return String(a.nome||'').localeCompare(String(b.nome||''), 'pt-BR');
  });

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td><strong>${r.nome}</strong></td>
      <td><span class="badge badge-gray">${r.unidade}</span></td>
      <td style="font-family:monospace;font-size:12px;">${r.percapita || 0}</td>
      <td>
        ${r.cidadesComPreco > 0
          ? `<span class="badge badge-ok">${r.cidadesComPreco} cidade(s)</span>`
          : '<span class="badge badge-gray">Sem preço</span>'
        }
      </td>
      <td><span class="badge ${r.tipo==='padrao'?'badge-info':'badge-brand'}">${r.tipo==='padrao'?'Padrão':'Personalizado'}</span></td>
      <td><span class="badge ${r.status==='ativo'?'badge-ok':'badge-gray'}">${r.status==='ativo'?'Ativo':'Inativo'}</span></td>
      <td style="display:flex;gap:5px;">
        <button class="btn btn-secondary btn-sm" onclick="editProduct('${r.id}','${r.tipo}')">✏️ Editar</button>
        <button class="btn btn-danger btn-sm" onclick="deleteProduct('${r.tipo==='custom'?r.docId:r.id}','${r.nome.replace(/'/g,"\\'")}','${r.tipo}')">Remover</button>
      </td>
    </tr>`).join('');
}

async function saveProduct() {
  const nome      = document.getElementById('mp-nome').value.trim();
  const categoria = document.getElementById('mp-categoria').value;
  const unidade   = document.getElementById('mp-unidade').value;
  const percapita = parseFloat(document.getElementById('mp-percapita').value) || 0;
  const status    = document.getElementById('mp-status').value;

  if (!nome) { showToast('Digite o nome do produto!'); return; }

  setBtnLoading('btn-save-product', true);

  try {
    let prodId = mpEditingId;

    if (!prodId) {
      // Novo produto — gera ID único
      prodId = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'_').replace(/__+/g,'_');
      // Verifica se já existe nos padrões
      const existePadrao = CATEGORIAS[categoria].produtos.some(p => p.id === prodId || p.nome.toLowerCase() === nome.toLowerCase());
      if (existePadrao) { showToast('Este produto já existe como padrão!'); setBtnLoading('btn-save-product', false); return; }

      // Salva na tabela produtos (categoria→categoria_key via alias; status→ativo)
      await db.collection('produtos_config').doc(prodId).set({
        nome, categoria, unidade, percapita, ppp: percapita, ativo: status === 'ativo',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Adiciona ao CATEGORIAS em memória
      CATEGORIAS[categoria].produtos.push({ id: prodId, nome, unidade, ppp: percapita });
      showToast(`✅ Produto "${nome}" adicionado!`);
    } else {
      // Editando produto (upsert: cria a linha se for produto padrão sem registro)
      await db.collection('produtos_config').doc(prodId).set({
        nome, categoria, unidade, percapita, ppp: percapita, ativo: status === 'ativo',
        isOverride: true, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      // Atualiza memória local
      const prodIdx = CATEGORIAS[categoria].produtos.findIndex(p => p.id === prodId);
      if (prodIdx >= 0) {
        CATEGORIAS[categoria].produtos[prodIdx] = { ...CATEGORIAS[categoria].produtos[prodIdx], nome, unidade, ppp: percapita, _overridden: true };
      }
      showToast(`✅ Produto atualizado!`);
    }

    // Salva preços por cidade (sequencial; upsert manual pela chave cat+prod+cidade)
    for (const cidade of CIDADES) {
      const inputId = `mp-preco-${cidade.replace(/[^a-zA-Z0-9]/g,'_')}`;
      const inp = document.getElementById(inputId);
      if (!inp) continue;
      const price = parseFloat(inp.value);
      if (!price || price <= 0) continue;

      const existing = await db.collection('prices')
        .where('cat','==',categoria)
        .where('prodId','==',prodId)
        .where('city','==',cidade).get();

      const priceData = {
        cat: categoria, prodId, prodNome: nome, city: cidade,
        price, unidade,
        updatedBy: currentUserData.name,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      if (existing.empty) {
        await db.collection('prices').add(priceData);
      } else {
        await db.collection('prices').doc(existing.docs[0].id).update(priceData);
      }
    }

    cancelEditProduct();
    await loadMpProducts();
  } catch(e) {
    showToast('Erro: ' + e.message);
    console.error(e);
  }
  setBtnLoading('btn-save-product', false);
}

// Atualiza o "preço de referência" (aba Preços por Cidade) de um produto
// numa cidade + grava no histórico -- mesma tabela/lógica que o salvamento
// manual de preços já usa (js/melhorias.js). Reaproveitado pela aprovação
// de cotação (Orçamentos Pendentes) pra manter o preço sempre atualizado
// com a última compra de verdade, sem precisar digitar de novo à mão.
async function atualizarPrecoReferencia({ catKey, prodId, prodNome, unidade, cidade, price, usuario }) {
  if (!catKey || !prodId || !cidade || !(price > 0)) return;
  try {
    const existing = await db.collection('prices')
      .where('cat','==',catKey).where('prodId','==',prodId).where('city','==',cidade).get();
    const priceData = {
      cat: catKey, prodId, prodNome: prodNome || prodId, city: cidade,
      price, unidade: unidade || '',
      updatedBy: usuario || '',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (existing.empty) await db.collection('prices').add(priceData);
    else await db.collection('prices').doc(existing.docs[0].id).update(priceData);

    await db.collection('prices_historico').add({
      prodId, cat: catKey, city: cidade, price,
      savedAt: firebase.firestore.FieldValue.serverTimestamp(),
      savedBy: usuario || '',
      origem: 'cotacao_aprovada',
    });
  } catch (e) { console.warn('atualizarPrecoReferencia falhou:', e); }
}

async function editProduct(prodId, tipo) {
  mpEditingId = prodId;
  document.getElementById('mp-form-title').textContent = 'Editar Produto';
  document.getElementById('mp-btn-cancel-edit').classList.remove('hidden');
  document.getElementById('btn-save-product').textContent = 'Salvar Alterações';

  // Habilita edição de nome/unidade/percapita para todos (padrão e custom)
  document.getElementById('mp-nome').disabled = false;
  document.getElementById('mp-unidade').disabled = false;
  document.getElementById('mp-percapita').disabled = false;

  // Preenche campos — primeiro verifica override no Firebase, depois memória local
  let prod = null;
  const snapFb = await db.collection('produtos_config').doc(prodId).get();
  if (snapFb.exists) {
    prod = { id: prodId, ...snapFb.data(), ppp: snapFb.data().percapita || 0 };
  } else {
    prod = CATEGORIAS[mpCat].produtos.find(p => p.id === prodId);
  }

  if (prod) {
    document.getElementById('mp-nome').value = prod.nome || '';
    document.getElementById('mp-unidade').value = prod.unidade || 'Kg';
    document.getElementById('mp-percapita').value = prod.ppp || prod.percapita || 0;
    document.getElementById('mp-status').value = prod.status || 'ativo';
    document.getElementById('mp-categoria').value = mpCat;
  }

  // Carrega preços atuais
  const pricesSnap = await db.collection('prices')
    .where('cat','==',mpCat).where('prodId','==',prodId).get();
  const precos = {};
  pricesSnap.docs.forEach(d => { precos[d.data().city] = d.data().price; });

  CIDADES.forEach(cidade => {
    const inputId = `mp-preco-${cidade.replace(/[^a-zA-Z0-9]/g,'_')}`;
    const inp = document.getElementById(inputId);
    if (inp) inp.value = precos[cidade] || '';
  });

  // Scroll para o formulário
  document.getElementById('mp-form-title').scrollIntoView({ behavior: 'smooth' });
}

function cancelEditProduct() {
  mpEditingId = null;
  document.getElementById('mp-form-title').textContent = 'Adicionar Novo Produto';
  document.getElementById('mp-btn-cancel-edit').classList.add('hidden');
  document.getElementById('btn-save-product').textContent = '+ Adicionar Produto';
  document.getElementById('mp-nome').value = '';
  document.getElementById('mp-percapita').value = '';
  document.getElementById('mp-status').value = 'ativo';
  CIDADES.forEach(cidade => {
    const inputId = `mp-preco-${cidade.replace(/[^a-zA-Z0-9]/g,'_')}`;
    const inp = document.getElementById(inputId);
    if (inp) inp.value = '';
  });
}

async function deleteProduct(docId, nome, tipo) {
  if (!confirm(`Tem certeza que deseja remover "${nome}"?\n\nOs registros de movimentação existentes não serão apagados.`)) return;
  try {
    // Modelo consolidado: soft delete (ativo=false). Se a linha não existir
    // (produto padrão sem registro), cria-a inativa para "esconder" o padrão.
    const ref = db.collection('produtos_config').doc(docId);
    const snap = await ref.get();
    if (snap.exists) {
      await ref.update({ ativo: false, deletedAt: firebase.firestore.FieldValue.serverTimestamp(), deletedBy: currentUserData.name });
    } else {
      // Produto padrão sem registro: cria linha inativa (categoria obrigatória)
      let catKey = null;
      Object.keys(CATEGORIAS).forEach(c => { if (CATEGORIAS[c].produtos.some(p => p.id === docId)) catKey = c; });
      await ref.set({ nome, categoria: catKey || 'cereal', ativo: false, deletedAt: firebase.firestore.FieldValue.serverTimestamp(), deletedBy: currentUserData.name });
    }
    Object.keys(CATEGORIAS).forEach(cat => {
      CATEGORIAS[cat].produtos = CATEGORIAS[cat].produtos.filter(p => p.id !== docId);
    });
    showToast(`Produto "${nome}" removido.`);
    loadMpProducts();
  } catch(e) {
    showToast('Erro ao remover: ' + e.message);
  }
}

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) o.classList.add('hidden'); });
});

// Enter key on login
document.getElementById('login-password').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') doLogin();
});

// ── SPLASH SCREEN ──
(function initSplash() {
  var bar    = document.getElementById('splash-bar');
  var splash = document.getElementById('splash-screen');
  if (!splash) return;
  var pct = 0;
  var iv = setInterval(function() {
    pct = Math.min(pct + (pct < 70 ? 8 : 2), 95);
    if (bar) bar.style.width = pct + '%';
  }, 120);
  window._splashDone = function() {
    clearInterval(iv);
    if (bar) bar.style.width = '100%';
    setTimeout(function() {
      if (splash) splash.classList.add('hidden');
    }, 400);
  };
  setTimeout(function() { if (window._splashDone) window._splashDone(); }, 4000);
})();

// ─────────────────────────────────────────────
// 📱  MOBILE SIDEBAR TOGGLE
// ─────────────────────────────────────────────
function toggleSidebar() {
  if (window.innerWidth <= 640) {
    // Mobile: slide over content
    const sidebar  = document.getElementById('sidebar');
    const overlay  = document.getElementById('sidebar-overlay');
    const isOpen   = sidebar.classList.contains('open');
    if (isOpen) { closeSidebar(); } else { openSidebar(); }
  } else {
    // Desktop: collapse/expand pushing content
    document.body.classList.toggle('sidebar-collapsed');
  }
}

function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-overlay').classList.add('visible');
  document.body.style.overflow = 'hidden';
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('visible');
  document.body.style.overflow = '';
}

// Close sidebar when a nav item is clicked on mobile
function goPageMobile(page) {
  if (window.innerWidth <= 640) closeSidebar();
  goPage(page);
}

// Auto-close mobile sidebar on resize to desktop
window.addEventListener('resize', () => {
  if (window.innerWidth > 640) {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('visible');
    document.body.style.overflow = '';
  } else {
    // Going to mobile: remove desktop collapsed class
    document.body.classList.remove('sidebar-collapsed');
  }
});

// Swipe left to close sidebar on mobile
(function() {
  let startX = 0;
  const sidebar = document.getElementById('sidebar');
  sidebar.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
  sidebar.addEventListener('touchend',   e => {
    const dx = e.changedTouches[0].clientX - startX;
    if (dx < -60) closeSidebar();
  }, { passive: true });
})();

// ─────────────────────────────────────────────
// 💰  ORÇAMENTO FINANCEIRO
// ─────────────────────────────────────────────
let CASAS_TIPO    = {};  // casa → { tipo: 'compra'|'transferencia', coordenador, pix }
let orcResultData = [];  // last calculation result
let orcCasaAtual  = '';  // casa being configured/transferred

async function initOrcamentoFinanceiro() {
  // Load house types
  const snap = await db.collection('casas_tipo_compra').get();
  CASAS_TIPO = {};
  snap.docs.forEach(d => { CASAS_TIPO[d.data().nome] = d.data(); });

  // Default dates: next 15 days
  const hoje = new Date().toISOString().slice(0,10);
  const em15 = new Date(); em15.setDate(em15.getDate() + 14);
  const em15s = em15.toISOString().slice(0,10);
  if (!document.getElementById('orc-de').value)  document.getElementById('orc-de').value  = hoje;
  if (!document.getElementById('orc-ate').value) document.getElementById('orc-ate').value = em15s;

  // Populate casa select
  const sel = document.getElementById('orc-casa-especifica');
  sel.innerHTML = '<option value="">Selecione uma casa...</option>';
  (CASAS || []).sort().forEach(c => {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    sel.appendChild(opt);
  });
}

function orcModoFiltroChange() {
  const modo = document.getElementById('orc-modo-filtro').value;
  document.getElementById('orc-filtro-bloco-wrap').style.display = modo === 'bloco'  ? '' : 'none';
  document.getElementById('orc-filtro-casa-wrap').style.display  = modo === 'casa'   ? '' : 'none';
  document.getElementById('orc-filtro-tipo-wrap').style.display  = modo === 'casa'   ? 'none' : '';
}

// Shared data-loading helper to avoid duplication
async function _carregarDadosOrcamento() {
  const [tipoSnap, housesSnap, pcSnap, pricesSnap, movSnap] = await Promise.all([
    db.collection('casas_tipo_compra').get(),
    db.collection('houses').get(),
    db.collection('percapitas').get(),
    db.collection('prices').get(),
    db.collection('movements').get(),
  ]);

  CASAS_TIPO = {};
  tipoSnap.docs.forEach(d => { CASAS_TIPO[d.data().nome] = d.data(); });

  const housePeople = {};
  housesSnap.docs.forEach(d => { housePeople[d.data().name] = d.data().currentPeople || 0; });

  const pcMap = {};
  pcSnap.docs.forEach(d => { pcMap[d.data().house] = d.data().values || {}; });

  const pricesMap = {};
  pricesSnap.docs.forEach(d => {
    const p = d.data();
    const k = `${p.cat}__${p.prodId}`;
    if (!pricesMap[p.city]) pricesMap[p.city] = {};
    pricesMap[p.city][k] = p.price;
  });

  // Monta mapa de estoque atual: stockMap[casa][catKey__prodId] = saldo
  const stockMap = {};
  movSnap.docs.forEach(d => {
    const m = d.data();
    if (!stockMap[m.house]) stockMap[m.house] = {};
    (m.items || []).forEach(item => {
      const key = `${item.catKey}__${item.prodId}`;
      if (!stockMap[m.house][key]) stockMap[m.house][key] = 0;
      if (m.type === 'entrada') stockMap[m.house][key] += item.qty;
      else                      stockMap[m.house][key] -= item.qty;
    });
  });

  if (Object.keys(CASAS_BLOCOS).length === 0) {
    const bs = await db.collection('casas_blocos').get();
    bs.docs.forEach(d => { CASAS_BLOCOS[d.data().nome] = d.data().bloco; });
  }

  return { housePeople, pcMap, pricesMap, stockMap };
}

function _calcularLinhasCasa(casa, dias, housePeople, pcMap, pricesMap, stockMap) {
  const city    = CASAS_CIDADES[casa] || '';
  const pessoas = housePeople[casa] || 0;
  const pc      = pcMap[casa] || JSON.parse(JSON.stringify(PERCAPITAS_PADRAO));
  const prices  = pricesMap[city] || {};
  const stock   = (stockMap && stockMap[casa]) ? stockMap[casa] : {};
  const linhas  = [];
  let totalCasa = 0;

  Object.entries(CATEGORIAS).forEach(([catKey, cat]) => {
    cat.produtos.forEach(p => {
      const pcVal = (pc[catKey] && pc[catKey][p.id] !== undefined)
        ? pc[catKey][p.id]
        : (PERCAPITAS_PADRAO[catKey]?.[p.id] || 0);
      if (pcVal <= 0) return;

      let necessario;
      if (ITENS_HIGIENE_ESPECIAL.includes(p.id)) {
        necessario = Math.ceil(pessoas * 1.25);
      } else {
        necessario = Math.ceil(dias * pessoas * pcVal);
      }
      if (necessario <= 0) return;

      const priceKey     = `${catKey}__${p.id}`;
      const estoqueAtual = Math.max(0, Math.round((stock[priceKey] || 0) * 100) / 100);
      const aComprar     = Math.max(0, necessario - estoqueAtual);
      const unitPrice    = prices[priceKey] || 0;
      const subtotal     = aComprar * unitPrice;
      totalCasa         += subtotal;

      linhas.push({
        catKey, cat: cat.nome, icon: cat.icon, prodId: p.id,
        nome: p.nome, unidade: p.unidade,
        necessario, necessarioOriginal: necessario,
        estoqueAtual,
        aComprar, aComprarOriginal: aComprar,
        // manter compatibilidade: qtd = aComprar para os campos editáveis
        qtd: aComprar, qtdOriginal: aComprar,
        unitPrice, unitPriceOriginal: unitPrice,
        subtotal, removed: false
      });
    });
  });

  return { city, pessoas, linhas, totalCasa };
}

async function calcularOrcamento() {
  setBtnLoading('btn-calc-orc', true);
  const de    = document.getElementById('orc-de').value;
  const ate   = document.getElementById('orc-ate').value;
  const modo  = document.getElementById('orc-modo-filtro').value;
  const bloco = document.getElementById('orc-bloco').value;
  const filtro= document.getElementById('orc-tipo-filtro').value;

  if (!de || !ate) { showToast('Defina o período!'); setBtnLoading('btn-calc-orc', false); return; }

  const dias = Math.max(1, Math.round((new Date(ate) - new Date(de)) / 86400000) + 1);

  // Casa específica — abre modo de edição detalhada
  if (modo === 'casa') {
    const casa = document.getElementById('orc-casa-especifica').value;
    if (!casa) { showToast('Selecione uma casa!'); setBtnLoading('btn-calc-orc', false); return; }
    const dados = await _carregarDadosOrcamento();
    const { city, pessoas, linhas, totalCasa } = _calcularLinhasCasa(casa, dias, dados.housePeople, dados.pcMap, dados.pricesMap, dados.stockMap);
    const tipo = CASAS_TIPO[casa]?.tipo || (isCasaCE(casa) ? 'compra' : 'transferencia');
    const result = { casa, tipo, city, pessoas, totalCasa, linhas,
      coordenador: CASAS_TIPO[casa]?.coordenador || '',
      pix:         CASAS_TIPO[casa]?.pix || '',
      bloco:       CASAS_BLOCOS[casa] || '', dias, de, ate };

    // Esconde os painéis de resumo geral e mostra o editor
    document.getElementById('orc-summary').style.display    = 'none';
    document.getElementById('orc-export-bar').style.display = 'none';
    renderOrcDetalhado(result);
    setBtnLoading('btn-calc-orc', false);
    return;
  }

  const dados = await _carregarDadosOrcamento();

  // Filter houses
  let casasList = [...CASAS];
  if (modo === 'bloco' && bloco) casasList = casasList.filter(c => CASAS_BLOCOS[c] === bloco);

  const results = [];
  let totalCE = 0, totalTransf = 0, countCE = 0, countTransf = 0;

  for (const casa of casasList) {
    const tipo = CASAS_TIPO[casa]?.tipo || (isCasaCE(casa) ? 'compra' : 'transferencia');
    if (filtro === 'compra'        && tipo !== 'compra')        continue;
    if (filtro === 'transferencia' && tipo !== 'transferencia') continue;

    const { city, pessoas, linhas, totalCasa } = _calcularLinhasCasa(casa, dias, dados.housePeople, dados.pcMap, dados.pricesMap, dados.stockMap);

    if (tipo === 'compra') { totalCE += totalCasa; countCE++; }
    else                   { totalTransf += totalCasa; countTransf++; }

    results.push({ casa, tipo, city, pessoas, totalCasa, linhas,
      coordenador: CASAS_TIPO[casa]?.coordenador || '',
      pix:         CASAS_TIPO[casa]?.pix || '',
      bloco:       CASAS_BLOCOS[casa] || '' });
  }

  orcResultData = results;

  const fmt = v => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  document.getElementById('orc-total-geral').textContent   = fmt(totalCE + totalTransf);
  document.getElementById('orc-total-ce').textContent      = fmt(totalCE);
  document.getElementById('orc-total-transf').textContent  = fmt(totalTransf);
  document.getElementById('orc-total-casas').textContent   = `${results.length} casas`;
  document.getElementById('orc-casas-ce').textContent      = `${countCE} casas`;
  document.getElementById('orc-casas-transf').textContent  = `${countTransf} casas`;
  document.getElementById('orc-dias').textContent          = dias;
  document.getElementById('orc-periodo-label').textContent = `${new Date(de+'T00:00:00').toLocaleDateString('pt-BR')} → ${new Date(ate+'T00:00:00').toLocaleDateString('pt-BR')}`;

  document.getElementById('orc-summary').style.display    = 'grid';
  document.getElementById('orc-export-bar').style.display = 'flex';

  renderOrcResultados(results, de, ate, dias);
  setBtnLoading('btn-calc-orc', false);
}

// ── ORÇAMENTO DETALHADO EDITÁVEL (por casa) ──────────────
let orcDetalheData = null; // dados vivos do orçamento em edição

function renderOrcDetalhado(result) {
  orcDetalheData = JSON.parse(JSON.stringify(result)); // deep copy editável
  _renderOrcDetalhadoUI();
}

function _renderOrcDetalhadoUI() {
  const r    = orcDetalheData;
  const de   = r.de; const ate = r.ate;
  const fmt  = v => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const tipoCls   = r.tipo === 'compra' ? 'orca-tipo-ce' : 'orca-tipo-ext';
  const tipoLabel = r.tipo === 'compra' ? '🛒 Compra Direta' : '💸 Transferência';

  // Recalcula total somente das linhas não removidas
  let totalAtual = 0;
  r.linhas.forEach(l => { if (!l.removed) totalAtual += l.qtd * l.unitPrice; });

  // Agrupa por categoria
  const porCat = {};
  r.linhas.forEach((l, idx) => {
    if (!porCat[l.cat]) porCat[l.cat] = [];
    porCat[l.cat].push({ ...l, idx });
  });

  const removidos = r.linhas.filter(l => l.removed).length;

  let tableRows = '';
  Object.entries(porCat).forEach(([catNome, itens]) => {
    const icon = itens[0]?.icon || '';
    tableRows += `<tr class="orc-cat-header"><td colspan="9">${icon} ${catNome}</td></tr>`;
    itens.forEach(({ idx, ...l }) => {
      const sub     = l.removed ? 0 : (l.qtd * l.unitPrice);
      const changed = (l.qtd !== l.qtdOriginal || l.unitPrice !== l.unitPriceOriginal);
      const coberto = l.estoqueAtual >= l.necessario;
      const parcial = !coberto && l.estoqueAtual > 0;
      const estCor  = coberto ? 'color:var(--ok);font-weight:700;' : parcial ? 'color:var(--warn);font-weight:700;' : 'color:var(--text-muted);';
      tableRows += `<tr class="${l.removed ? 'row-removed' : ''}" id="orc-row-${idx}">
        <td style="font-size:13px;">${l.nome}</td>
        <td style="font-size:11px;color:var(--text-muted);">${l.unidade}</td>
        <td class="td-right" style="color:var(--text-muted);font-size:12px;">${l.necessario}</td>
        <td class="td-right" style="font-size:12px;${estCor}">${l.estoqueAtual > 0 ? l.estoqueAtual.toFixed(1) : '—'}</td>
        <td class="td-right">
          <input class="orc-edit-input ${changed && l.qtd !== l.qtdOriginal ? 'changed' : ''}"
            type="number" min="0" step="1" value="${l.qtd}"
            ${l.removed ? 'disabled' : ''}
            oninput="orcUpdateLinha(${idx},'qtd',this.value)"
            title="Original: ${l.qtdOriginal} | Necessário: ${l.necessario} | Estoque: ${l.estoqueAtual}">
        </td>
        <td class="td-right">
          <input class="orc-edit-input price-input ${changed && l.unitPrice !== l.unitPriceOriginal ? 'changed' : ''}"
            type="number" min="0" step="0.01" value="${l.unitPrice.toFixed(2)}"
            ${l.removed ? 'disabled' : ''}
            oninput="orcUpdateLinha(${idx},'unitPrice',this.value)"
            title="Preço original: R$ ${l.unitPriceOriginal.toFixed(2)}">
        </td>
        <td class="td-subtotal">${l.removed ? '—' : fmt(sub)}</td>
        <td style="white-space:nowrap;">
          ${changed && !l.removed ? `<button class="btn btn-outline btn-sm" style="padding:3px 8px;font-size:11px;" onclick="orcResetLinha(${idx})" title="Restaurar original">↩</button>` : ''}
        </td>
        <td>
          <button class="orc-remove-btn" onclick="orcToggleRemover(${idx})" title="${l.removed ? 'Restaurar item' : 'Remover item'}">
            ${l.removed ? '✅' : '✕'}
          </button>
        </td>
      </tr>`;
    });
  });

  const semPreco = r.linhas.filter(l => !l.removed && l.unitPrice === 0).length;
  const warnHtml = semPreco > 0
    ? `<div class="alert alert-warn visible" style="margin-bottom:12px;font-size:12px;">⚠️ ${semPreco} produto(s) sem preço — verifique em <strong>Preços por Cidade</strong>.</div>`
    : '';

  const html = `
    <div class="orc-detail-header">
      <div>
        <div class="orc-detail-title">📋 Orçamento — ${r.casa}</div>
        <div class="orc-detail-meta">
          <span class="orca-tipo-badge ${tipoCls}" style="font-size:11px;">${tipoLabel}</span>
          &nbsp;📍 ${r.city || '—'} &nbsp;|&nbsp; 👥 ${r.pessoas} pessoas &nbsp;|&nbsp; 📅 ${r.dias} dias
          &nbsp;|&nbsp; ${new Date(de+'T00:00:00').toLocaleDateString('pt-BR')} → ${new Date(ate+'T00:00:00').toLocaleDateString('pt-BR')}
          ${r.bloco ? `&nbsp;|&nbsp; Bloco ${r.bloco}` : ''}
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:12px;opacity:0.8;margin-bottom:4px;">Total atual</div>
        <div class="orc-detail-total" id="orc-det-total-header">${fmt(totalAtual)}</div>
      </div>
    </div>

    ${warnHtml}

    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-header-title">Insumos do Orçamento</div>
          <div class="card-header-sub">Edite quantidades e preços diretamente na tabela. Use ✕ para remover itens.</div>
        </div>
        <button class="btn btn-outline btn-sm" onclick="orcRestaurarTudo()" title="Restaurar todos os valores originais">↩ Restaurar tudo</button>
      </div>
      <div class="card-body" style="padding:0;">
        <div class="table-wrap">
          <table class="orc-edit-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Unidade</th>
                <th style="text-align:right;">Necessário</th>
                <th style="text-align:right;">Estoque Atual</th>
                <th style="text-align:right;">A Comprar</th>
                <th style="text-align:right;">Preço Unit. (R$)</th>
                <th style="text-align:right;">Subtotal</th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody id="orc-edit-tbody">${tableRows}</tbody>
          </table>
        </div>
        <div style="padding:16px 18px;">
          ${removidos > 0 ? `<div style="font-size:12px;color:var(--danger);margin-bottom:10px;">⚠️ ${removidos} item(s) removido(s) do orçamento.</div>` : ''}
          <div class="orc-actions-bar">
            <div>
              <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:3px;">Total do Orçamento</div>
              <div class="orc-total-chip" id="orc-det-total-bar">${fmt(totalAtual)}</div>
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
              <button class="btn btn-outline" onclick="exportOrcDetalhadoPDF()">
                📄 Exportar PDF
              </button>
              ${r.tipo === 'transferencia'
                ? `<button class="btn btn-primary" onclick="abrirTransfFinanceira('${r.casa}', ${totalAtual.toFixed(2)}, '${de}', '${ate}')">💸 Registrar Transferência</button>`
                : `<button class="btn btn-primary" onclick="finalizarOrcDetalhado()">✅ Finalizar Orçamento</button>`
              }
            </div>
          </div>
        </div>
      </div>
    </div>`;

  document.getElementById('orc-results').innerHTML = html;
}

function orcUpdateLinha(idx, campo, valor) {
  const l = orcDetalheData.linhas[idx];
  if (!l) return;
  if (campo === 'qtd')       { l.qtd = Math.max(0, parseFloat(valor) || 0); l.aComprar = l.qtd; }
  if (campo === 'unitPrice') l.unitPrice  = Math.max(0, parseFloat(valor) || 0);
  l.subtotal = l.qtd * l.unitPrice;
  // Atualiza totais no header e barra sem re-renderizar a tabela inteira
  const fmt = v => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let total = 0;
  orcDetalheData.linhas.forEach(x => { if (!x.removed) total += x.qtd * x.unitPrice; });
  const h = document.getElementById('orc-det-total-header');
  const b = document.getElementById('orc-det-total-bar');
  if (h) h.textContent = fmt(total);
  if (b) b.textContent = fmt(total);
  // Atualiza subtotal da linha
  const row = document.getElementById('orc-row-' + idx);
  if (row) {
    const subCell = row.querySelector('.td-subtotal');
    if (subCell) subCell.textContent = l.removed ? '—' : fmt(l.qtd * l.unitPrice);
  }
}

function orcToggleRemover(idx) {
  orcDetalheData.linhas[idx].removed = !orcDetalheData.linhas[idx].removed;
  _renderOrcDetalhadoUI();
}

function orcResetLinha(idx) {
  const l = orcDetalheData.linhas[idx];
  l.qtd       = l.qtdOriginal;
  l.unitPrice = l.unitPriceOriginal;
  l.subtotal  = l.qtd * l.unitPrice;
  _renderOrcDetalhadoUI();
}

function orcRestaurarTudo() {
  orcDetalheData.linhas.forEach(l => {
    l.qtd = l.qtdOriginal; l.unitPrice = l.unitPriceOriginal;
    l.subtotal = l.qtd * l.unitPrice; l.removed = false;
  });
  _renderOrcDetalhadoUI();
}

function finalizarOrcDetalhado() {
  showToast('✅ Orçamento finalizado! Exporte o PDF ou registre a transferência.');
}

function exportOrcDetalhadoPDF() {
  if (!orcDetalheData) return;
  const { jsPDF } = window.jspdf;
  const doc  = new jsPDF();
  const blue = [0,56,117]; const gray = [107,114,128]; const green = [26,122,68];
  const r    = orcDetalheData;
  const fmt  = v => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ── Cabeçalho ──
  doc.setFillColor(...blue); doc.rect(0,0,210,30,'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(14); doc.setFont('helvetica','bold');
  doc.text(`Obra Lumen — Orçamento: ${r.casa}`, 14, 12);
  doc.setFontSize(8); doc.setFont('helvetica','normal');
  doc.text(`Período: ${new Date(r.de+'T00:00:00').toLocaleDateString('pt-BR')} → ${new Date(r.ate+'T00:00:00').toLocaleDateString('pt-BR')}   |   ${r.pessoas} pessoas   |   ${r.dias} dias   |   ${r.city}`, 14, 20);
  doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 26);

  let y = 40;
  let totalFinal = 0;
  const linhasAtivas = r.linhas.filter(l => !l.removed);

  // Agrupa por categoria
  const porCat = {};
  linhasAtivas.forEach(l => {
    if (!porCat[l.cat]) porCat[l.cat] = [];
    porCat[l.cat].push(l);
  });

  // Acumulador de subtotais por categoria (para o resumo final)
  const subtotalPorCat = {};

  Object.entries(porCat).forEach(([catNome, itens]) => {
    if (y > 245) { doc.addPage(); y = 20; }

    // Título da categoria
    doc.setFillColor(230,238,248);
    doc.rect(10,y-4,190,8,'F');
    doc.setTextColor(...blue); doc.setFontSize(9); doc.setFont('helvetica','bold');
    doc.text(catNome, 14, y+1); y += 10;

    // Cabeçalho da tabela
    doc.setTextColor(...gray); doc.setFontSize(7); doc.setFont('helvetica','bold');
    doc.text('Produto',     14,  y);
    doc.text('Un.',         90,  y);
    doc.text('Necessário',  108, y, {align:'right'});
    doc.text('Estoque',     128, y, {align:'right'});
    doc.text('A Comprar',   148, y, {align:'right'});
    doc.text('Preco Un.',   170, y, {align:'right'});
    doc.text('Subtotal',    200, y, {align:'right'});
    y += 5;
    doc.setDrawColor(220,220,220); doc.line(10,y,200,y); y += 4;

    let catTotal = 0;

    itens.forEach(l => {
      if (y > 268) { doc.addPage(); y = 20; }
      const sub = l.qtd * l.unitPrice;
      totalFinal += sub;
      catTotal   += sub;

      doc.setTextColor(0,0,0); doc.setFont('helvetica','normal'); doc.setFontSize(8);
      doc.text(l.nome.substring(0,30), 14, y);
      doc.text(l.unidade, 90, y);
      // Necessário
      doc.setTextColor(...gray);
      doc.text(String(l.necessario), 108, y, {align:'right'});
      // Estoque
      const coberto = l.estoqueAtual >= l.necessario;
      const parcial = !coberto && l.estoqueAtual > 0;
      doc.setTextColor(coberto ? 26 : parcial ? 212 : 150, coberto ? 122 : parcial ? 137 : 150, coberto ? 68 : parcial ? 10 : 150);
      doc.text(l.estoqueAtual > 0 ? l.estoqueAtual.toFixed(1) : '—', 128, y, {align:'right'});
      // A Comprar
      if (l.qtd === 0) { doc.setTextColor(26,122,68); } else { doc.setTextColor(0,56,117); }
      doc.setFont('helvetica', l.qtd > 0 ? 'bold' : 'normal');
      doc.text(l.qtd === 0 ? 'OK' : String(l.qtd), 148, y, {align:'right'});
      // Preço unitário
      doc.setTextColor(...blue); doc.setFont('helvetica','normal');
      doc.text(l.unitPrice > 0 ? fmt(l.unitPrice) : '—', 170, y, {align:'right'});
      // Subtotal do item
      doc.setTextColor(...green);
      doc.text(sub > 0 ? fmt(sub) : '—', 200, y, {align:'right'});
      y += 6;
    });

    // ── Linha de subtotal da categoria ──
    if (y > 272) { doc.addPage(); y = 20; }
    doc.setDrawColor(180,200,230); doc.line(130,y,200,y); y += 3;
    doc.setTextColor(...blue); doc.setFont('helvetica','bold'); doc.setFontSize(7.5);
    doc.text(`Total ${catNome}:`, 130, y+1);
    doc.setTextColor(...green);
    doc.text(catTotal > 0 ? fmt(catTotal) : '—', 200, y+1, {align:'right'});
    subtotalPorCat[catNome] = catTotal;
    y += 8;
  });

  // ── Resumo por Categoria ──
  if (y > 220) { doc.addPage(); y = 20; }
  y += 4;
  doc.setFillColor(...blue); doc.rect(10,y-5,190,9,'F');
  doc.setTextColor(255,255,255); doc.setFontSize(10); doc.setFont('helvetica','bold');
  doc.text('GASTOS POR CATEGORIA', 14, y+1); y += 12;

  const catEntries = Object.entries(subtotalPorCat).sort((a,b) => b[1]-a[1]);
  catEntries.forEach(([catNome, valor], idx) => {
    if (y > 268) { doc.addPage(); y = 20; }
    if (idx % 2 === 0) { doc.setFillColor(248,250,255); doc.rect(10,y-4,190,7,'F'); }
    doc.setTextColor(0,0,0); doc.setFont('helvetica','normal'); doc.setFontSize(9);
    doc.text(catNome, 16, y+1);
    doc.setFont('helvetica','bold'); doc.setTextColor(...green);
    doc.text(valor > 0 ? fmt(valor) : '—', 200, y+1, {align:'right'});
    y += 7;
  });

  // ── Barra de total geral ──
  if (y > 262) { doc.addPage(); y = 20; }
  y += 4;
  doc.setFillColor(...blue); doc.rect(10,y,190,12,'F');
  doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(10);
  doc.text('TOTAL DO ORCAMENTO', 14, y+8);
  doc.text(fmt(totalFinal), 200, y+8, {align:'right'});

  doc.setTextColor(...gray); doc.setFontSize(7);
  doc.text('Suprimentos Obra Lumen — lumenserfeliz.org', 14, 290);
  doc.save(`LM-Orc-${r.casa.replace(/[^a-zA-Z0-9]/g,'-')}-${r.de}.pdf`);
  showToast('✅ PDF do orçamento exportado!');
}

function isCasaCE(casa) {
  return (CASAS_CIDADES[casa] || '').includes(' - CE') || (CASAS_CIDADES[casa] || '').includes('CE');
}

function renderOrcResultados(results, de, ate, dias) {
  const el = document.getElementById('orc-results');
  if (results.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🏠</div><div class="empty-state-title">Nenhuma casa encontrada com os filtros selecionados.</div></div>';
    return;
  }

  const fmt = v => v > 0
    ? 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '<span class="text-muted">Sem preço</span>';

  // Group by type
  const compras  = results.filter(r => r.tipo === 'compra');
  const transfs  = results.filter(r => r.tipo === 'transferencia');

  let html = '';

  if (compras.length > 0) {
    html += `<div class="orca-section">
      <div class="orca-section-title">
        <span>🛒 Compra Direta — Fortaleza/CE</span>
        <span class="badge badge-info">${compras.length} casa(s)</span>
        <span style="margin-left:auto;font-size:13px;font-weight:700;color:var(--lumen);">
          Total: R$ ${compras.reduce((s,r)=>s+r.totalCasa,0).toLocaleString('pt-BR',{minimumFractionDigits:2})}
        </span>
      </div>
      ${compras.map(r => renderOrcCard(r, fmt, de, ate)).join('')}
    </div>`;
  }

  if (transfs.length > 0) {
    html += `<div class="orca-section">
      <div class="orca-section-title">
        <span>💸 Transferência Financeira — Outros estados</span>
        <span class="badge" style="background:#FFF3E0;color:#E65100;">${transfs.length} casa(s)</span>
        <span style="margin-left:auto;font-size:13px;font-weight:700;color:var(--ok);">
          Total: R$ ${transfs.reduce((s,r)=>s+r.totalCasa,0).toLocaleString('pt-BR',{minimumFractionDigits:2})}
        </span>
      </div>
      ${transfs.map(r => renderOrcCard(r, fmt, de, ate)).join('')}
    </div>`;
  }

  el.innerHTML = html;
}

function renderOrcCard(r, fmt, de, ate) {
  const tipoCls   = r.tipo === 'compra' ? 'orca-tipo-ce' : 'orca-tipo-ext';
  const tipoLabel = r.tipo === 'compra' ? '🛒 Compra Direta' : '💸 Transferência';
  const semPreco  = r.linhas.filter(l => l.unitPrice === 0).length;
  const warnMsg   = semPreco > 0
    ? `<div class="alert alert-warn visible" style="margin-top:8px;padding:7px 12px;font-size:12px;">⚠️ ${semPreco} produto(s) sem preço cadastrado — valor pode estar incompleto. Cadastre os preços em <strong>Preços por Cidade</strong>.</div>`
    : '';

  const extraBtns = r.tipo === 'transferencia'
    ? `<button class="btn btn-primary btn-sm" onclick="abrirTransfFinanceira('${r.casa}', ${r.totalCasa.toFixed(2)}, '${de}', '${ate}')">💸 Registrar Transferência</button>`
    : `<button class="btn btn-secondary btn-sm" onclick="goPage('all-orders')">📋 Ver Cotações</button>`;

  const coordInfo = r.tipo === 'transferencia' && r.coordenador
    ? `<span class="text-muted text-sm" style="margin-left:8px;">Coord: ${r.coordenador}${r.pix ? ' | Pix: '+r.pix : ''}</span>`
    : '';

  return `<div class="orca-card">
    <div class="orca-card-header" onclick="toggleOrcCard('${r.casa.replace(/[^a-zA-Z0-9]/g,'_')}')">
      <div style="flex:1;">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <span class="orca-casa-name">${r.casa}</span>
          <span class="orca-tipo-badge ${tipoCls}">${tipoLabel}</span>
          ${r.bloco ? `<span class="block-badge">Bloco ${r.bloco}</span>` : ''}
        </div>
        <div style="margin-top:3px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <span class="orca-casa-city">📍 ${r.city || '—'} | 👥 ${r.pessoas} pessoas | 📦 ${r.linhas.length} produtos</span>
          ${coordInfo}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <span class="orca-valor-chip">${fmt(r.totalCasa)}</span>
        ${extraBtns}
        <button class="btn btn-outline btn-sm" onclick="event.stopPropagation();abrirConfigTipo('${r.casa}')">⚙️</button>
      </div>
    </div>
    <div id="orca-body-${r.casa.replace(/[^a-zA-Z0-9]/g,'_')}" style="display:none;">
      <div class="orca-body">
        ${warnMsg}
        <table class="orca-table">
          <thead><tr>
            <th>Categoria</th><th>Produto</th>
            <th style="text-align:right;">Necessário</th>
            <th style="text-align:right;">Estoque Atual</th>
            <th style="text-align:right;">A Comprar</th>
            <th>Un.</th><th style="text-align:right;">Preço Un.</th><th style="text-align:right;">Subtotal</th>
          </tr></thead>
          <tbody>
            ${r.linhas.map(l => {
              const coberto = l.estoqueAtual >= l.necessario;
              const parcial = !coberto && l.estoqueAtual > 0;
              const estCor  = coberto ? 'color:var(--ok);font-weight:700;' : parcial ? 'color:var(--warn);font-weight:700;' : 'color:var(--text-muted);';
              const compCor = l.aComprar === 0 ? 'color:var(--ok);' : 'color:var(--lumen);font-weight:700;';
              const subtotalCompra = l.aComprar * l.unitPrice;
              return `<tr>
                <td><span style="font-size:11px;">${l.icon} ${l.cat}</span></td>
                <td>${l.nome}</td>
                <td style="text-align:right;color:var(--text-muted);">${l.necessario}</td>
                <td style="text-align:right;${estCor}">${l.estoqueAtual > 0 ? l.estoqueAtual.toFixed(1) : '—'}</td>
                <td style="text-align:right;${compCor}">${l.aComprar > 0 ? l.aComprar : '<span style="color:var(--ok);">✓ OK</span>'}</td>
                <td class="text-muted">${l.unidade}</td>
                <td class="td-price">${l.unitPrice > 0 ? 'R$ '+l.unitPrice.toFixed(2) : '<span class="text-muted">—</span>'}</td>
                <td class="td-total">${l.aComprar > 0 && l.unitPrice > 0 ? 'R$ '+subtotalCompra.toFixed(2) : l.aComprar === 0 ? '<span style="color:var(--ok);">—</span>' : '—'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
        <div class="orca-total-bar">
          <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
            <span class="orca-total-label">Total a comprar para ${r.casa}</span>
            <span style="font-size:11px;display:flex;gap:10px;align-items:center;">
              <span style="color:var(--ok);font-weight:700;">■</span><span style="color:var(--text-muted);">Estoque suficiente</span>
              <span style="color:var(--warn);font-weight:700;">■</span><span style="color:var(--text-muted);">Estoque parcial</span>
              <span style="color:var(--lumen);font-weight:700;">■</span><span style="color:var(--text-muted);">A comprar</span>
            </span>
          </div>
          <span class="orca-total-value">${fmt(r.totalCasa)}</span>
        </div>
      </div>
    </div>
  </div>`;
}

function toggleOrcCard(hid) {
  const el = document.getElementById('orca-body-' + hid);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

// ── CONFIGURAR TIPO DA CASA ──────────────────
let orcTipoAtivo = 'compra';

async function abrirConfigTipo(casa) {
  orcCasaAtual = casa;
  document.getElementById('modal-tipo-casa-nome').textContent = casa;
  const cfg = CASAS_TIPO[casa] || {};
  orcTipoAtivo = cfg.tipo || (isCasaCE(casa) ? 'compra' : 'transferencia');
  setTipoAtivo(orcTipoAtivo);
  document.getElementById('tipo-coordenador-nome').value = cfg.coordenador || '';
  document.getElementById('tipo-pix').value              = cfg.pix || '';
  openModal('modal-tipo-casa');
}

function setTipoAtivo(tipo) {
  orcTipoAtivo = tipo;
  document.getElementById('tipo-btn-compra').classList.toggle('active', tipo === 'compra');
  document.getElementById('tipo-btn-transferencia').classList.toggle('active', tipo === 'transferencia');
  document.getElementById('tipo-extra-compra').style.display = tipo === 'compra' ? 'block' : 'none';
  document.getElementById('tipo-extra-transf').style.display = tipo === 'transferencia' ? 'block' : 'none';
}

async function salvarTipoCasa() {
  const coordenador = document.getElementById('tipo-coordenador-nome').value.trim();
  const pix         = document.getElementById('tipo-pix').value.trim();
  const data = {
    nome: orcCasaAtual, tipo: orcTipoAtivo, coordenador, pix,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  const hid = orcCasaAtual.replace(/[^a-zA-Z0-9]/g,'_');
  await db.collection('casas_tipo_compra').doc(hid).set(data, { merge: true });
  CASAS_TIPO[orcCasaAtual] = data;
  showToast(`✅ Configuração salva para ${orcCasaAtual}!`);
  closeModal('modal-tipo-casa');
  calcularOrcamento();
}

// ── REGISTRAR TRANSFERÊNCIA FINANCEIRA ──────
async function abrirTransfFinanceira(casa, valorSugerido, de, ate) {
  orcCasaAtual = casa;
  document.getElementById('modal-tf-casa').textContent    = casa;
  document.getElementById('tf-valor-sug').value           = valorSugerido.toFixed(2);
  document.getElementById('tf-valor').value               = valorSugerido.toFixed(2);
  document.getElementById('tf-data').value                = new Date().toISOString().slice(0,10);
  document.getElementById('tf-coordenador').value         = CASAS_TIPO[casa]?.coordenador || '';
  document.getElementById('tf-periodo').value             = `${new Date(de+'T00:00:00').toLocaleDateString('pt-BR')} → ${new Date(ate+'T00:00:00').toLocaleDateString('pt-BR')}`;

  const pixInfo = CASAS_TIPO[casa]?.pix;
  document.getElementById('modal-tf-infobox').innerHTML   =
    `Valor sugerido baseado no orçamento calculado por per capita.${pixInfo ? ` <strong>Pix:</strong> ${pixInfo}` : ''}`;

  // Load history
  await carregarHistoricoTransf(casa);
  openModal('modal-transf-financeira');
}

async function carregarHistoricoTransf(casa) {
  const histEl = document.getElementById('tf-historico');
  histEl.innerHTML = '<div class="loading-state" style="padding:12px;"><div class="spinner spinner-dark"></div></div>';
  try {
    const snap = await db.collection('transferencias_financeiras')
      .where('casa','==',casa).orderBy('createdAt','desc').limit(10).get();
    if (snap.empty) {
      histEl.innerHTML = '<div class="text-muted text-sm" style="padding:12px;">Nenhuma transferência registrada ainda.</div>';
      return;
    }
    histEl.innerHTML = snap.docs.map(d => {
      const t = d.data();
      const data = t.data || (t.createdAt?.toDate ? t.createdAt.toDate().toLocaleDateString('pt-BR') : '—');
      return `<div class="transf-history-item">
        <div class="transf-dot"></div>
        <div style="flex:1;">
          <span style="font-weight:700;">R$ ${parseFloat(t.valor).toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>
          <span class="text-muted" style="margin-left:8px;">${data}</span>
          ${t.coordenador ? `<span class="text-muted"> | ${t.coordenador}</span>` : ''}
        </div>
        <span class="text-muted text-sm">${t.periodo || ''}</span>
      </div>`;
    }).join('');
  } catch(e) { histEl.innerHTML = '<div class="text-muted text-sm" style="padding:12px;">Erro ao carregar.</div>'; }
}

async function salvarTransferenciaFinanceira() {
  const valor       = parseFloat(document.getElementById('tf-valor').value);
  const data        = document.getElementById('tf-data').value;
  const coordenador = document.getElementById('tf-coordenador').value.trim();
  const periodo     = document.getElementById('tf-periodo').value;
  const obs         = document.getElementById('tf-obs').value.trim();

  if (!valor || valor <= 0) { showToast('Informe o valor da transferência!'); return; }
  if (!data)  { showToast('Informe a data!'); return; }

  setBtnLoading('btn-salvar-tf', true);
  try {
    await db.collection('transferencias_financeiras').add({
      casa: orcCasaAtual, valor, data, coordenador, periodo, obs,
      registeredBy: currentUserData.name,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast(`✅ Transferência de R$ ${valor.toLocaleString('pt-BR',{minimumFractionDigits:2})} registrada para ${orcCasaAtual}!`);
    await carregarHistoricoTransf(orcCasaAtual);
    document.getElementById('tf-obs').value = '';
  } catch(e) { showToast('Erro: ' + e.message); }
  setBtnLoading('btn-salvar-tf', false);
}

// ── EXPORTAR ORÇAMENTO ───────────────────────
function exportOrcamentoPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const blue = [0,56,117]; const gray = [107,114,128]; const green = [26,122,68];
  const orange = [230,81,0];
  const de  = document.getElementById('orc-de').value;
  const ate = document.getElementById('orc-ate').value;
  const fmt = v => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ── Cabeçalho ──
  doc.setFillColor(...blue); doc.rect(0,0,210,28,'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(14); doc.setFont('helvetica','bold');
  doc.text('Obra Lumen — Orçamento Financeiro', 14, 12);
  doc.setFontSize(8); doc.setFont('helvetica','normal');
  doc.text(`Período: ${new Date(de+'T00:00:00').toLocaleDateString('pt-BR')} → ${new Date(ate+'T00:00:00').toLocaleDateString('pt-BR')} | Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 22);

  let y = 36;
  const compras = orcResultData.filter(r => r.tipo === 'compra');
  const transfs = orcResultData.filter(r => r.tipo === 'transferencia');

  // Acumulador global de gastos por categoria
  const totalPorCategoria = {};

  const drawSection = (list, title, cor) => {
    if (list.length === 0) return;
    if (y > 250) { doc.addPage(); y = 20; }
    // Título da seção
    doc.setFillColor(...cor); doc.rect(10,y-5,190,9,'F');
    doc.setTextColor(255,255,255); doc.setFontSize(10); doc.setFont('helvetica','bold');
    doc.text(title, 14, y+1); y += 12;

    list.forEach(r => {
      if (y > 255) { doc.addPage(); y = 20; }

      // Linha da casa
      doc.setFillColor(240,245,255); doc.rect(10,y-4,190,8,'F');
      doc.setTextColor(0,0,0); doc.setFont('helvetica','bold'); doc.setFontSize(9);
      doc.text(`${r.casa} — ${r.pessoas} pessoas | ${r.city}`, 14, y+1);
      doc.setFont('helvetica','bold'); doc.setTextColor(...cor);
      doc.text(fmt(r.totalCasa), 200, y+1, { align:'right' });
      y += 8;

      if (r.tipo === 'transferencia' && r.coordenador) {
        doc.setFont('helvetica','normal'); doc.setTextColor(...gray); doc.setFontSize(7);
        doc.text(`Coordenador: ${r.coordenador}${r.pix ? '  |  Pix: '+r.pix : ''}`, 18, y); y += 5;
      }

      // Agrupa linhas por categoria
      const porCat = {};
      r.linhas.forEach(l => {
        if (!porCat[l.cat]) porCat[l.cat] = { itens: [], subtotal: 0 };
        porCat[l.cat].itens.push(l);
        porCat[l.cat].subtotal += (l.qtd * l.unitPrice);
        // Acumula no total global
        if (!totalPorCategoria[l.cat]) totalPorCategoria[l.cat] = 0;
        totalPorCategoria[l.cat] += (l.qtd * l.unitPrice);
      });

      // Detalhe por categoria
      Object.entries(porCat).forEach(([catNome, dados]) => {
        if (y > 265) { doc.addPage(); y = 20; }
        // Título da categoria
        doc.setFillColor(230,238,248); doc.rect(14,y-3,182,6,'F');
        doc.setTextColor(...blue); doc.setFontSize(7.5); doc.setFont('helvetica','bold');
        doc.text(catNome, 17, y+1);
        doc.text(fmt(dados.subtotal), 196, y+1, { align:'right' });
        y += 7;

        // Itens da categoria
        dados.itens.forEach(l => {
          if (y > 270) { doc.addPage(); y = 20; }
          const sub = l.qtd * l.unitPrice;
          doc.setTextColor(50,50,50); doc.setFont('helvetica','normal'); doc.setFontSize(7);
          const nomeTrunc = l.nome.length > 36 ? l.nome.substring(0,36)+'…' : l.nome;
          doc.text(nomeTrunc, 20, y);
          doc.setTextColor(...gray);
          doc.text(`${l.qtd} ${l.unidade}`, 110, y, { align:'right' });
          if (l.unitPrice > 0) {
            doc.text(fmt(l.unitPrice), 148, y, { align:'right' });
            doc.setTextColor(...green);
            doc.text(fmt(sub), 196, y, { align:'right' });
          } else {
            doc.text('—', 196, y, { align:'right' });
          }
          y += 5;
        });
        y += 2;
      });
      y += 4;
    });
    y += 4;
  };

  drawSection(compras, 'Compra Direta — Fortaleza/CE', blue);
  drawSection(transfs, 'Transferencias Financeiras — Outros estados', orange);

  // ── Resumo por Categoria ──
  if (y > 220) { doc.addPage(); y = 20; }
  y += 4;
  doc.setFillColor(...blue); doc.rect(10,y-5,190,9,'F');
  doc.setTextColor(255,255,255); doc.setFontSize(10); doc.setFont('helvetica','bold');
  doc.text('GASTOS POR CATEGORIA', 14, y+1); y += 12;

  const catEntries = Object.entries(totalPorCategoria).sort((a,b) => b[1]-a[1]);
  catEntries.forEach(([catNome, valor], idx) => {
    if (y > 268) { doc.addPage(); y = 20; }
    if (idx % 2 === 0) { doc.setFillColor(248,250,255); doc.rect(10,y-4,190,7,'F'); }
    doc.setTextColor(0,0,0); doc.setFont('helvetica','normal'); doc.setFontSize(8.5);
    doc.text(catNome, 16, y+1);
    doc.setFont('helvetica','bold'); doc.setTextColor(...green);
    doc.text(fmt(valor), 200, y+1, { align:'right' });
    y += 7;
  });

  // ── Resumo Final ──
  if (y > 235) { doc.addPage(); y = 20; }
  y += 4;
  doc.setFillColor(230,238,248); doc.rect(10,y,190,34,'F');
  doc.setTextColor(...blue); doc.setFont('helvetica','bold'); doc.setFontSize(10);
  doc.text('RESUMO GERAL', 14, y+8);
  doc.setFontSize(9);
  const totalCompras = compras.reduce((s,r)=>s+r.totalCasa,0);
  const totalTransfs = transfs.reduce((s,r)=>s+r.totalCasa,0);
  const total = totalCompras + totalTransfs;
  doc.text(`Total Compra Direta:`, 14, y+16);
  doc.setTextColor(...blue);
  doc.text(fmt(totalCompras), 200, y+16, { align:'right' });
  doc.setTextColor(...blue);
  doc.text(`Total Transferencias:`, 14, y+23);
  doc.setTextColor(orange[0], orange[1], orange[2]);
  doc.text(fmt(totalTransfs), 200, y+23, { align:'right' });
  doc.setFillColor(...blue); doc.rect(10,y+26,190,8,'F');
  doc.setTextColor(255,255,255); doc.setFontSize(11); doc.setFont('helvetica','bold');
  doc.text('TOTAL GERAL:', 14, y+32);
  doc.text(fmt(total), 200, y+32, { align:'right' });

  doc.setTextColor(...gray); doc.setFontSize(7);
  doc.text('Suprimentos Obra Lumen — lumenserfeliz.org', 14, 290);
  doc.save(`LM-Orcamento-${de}.pdf`);
  showToast('✅ PDF do orçamento exportado!');
}

function exportOrcamentoCSV() {
  const de  = document.getElementById('orc-de').value;
  const ate = document.getElementById('orc-ate').value;
  const rows = [['Casa','Tipo','Cidade','Bloco','Pessoas','Produto','Categoria','Qtd','Un.','Preço Unit.','Subtotal']];
  orcResultData.forEach(r => {
    if (r.linhas.length === 0) {
      rows.push([r.casa, r.tipo, r.city, r.bloco, r.pessoas, '—','—',0,'—',0,0]);
    } else {
      r.linhas.forEach(l => {
        rows.push([`"${r.casa}"`, r.tipo, `"${r.city}"`, r.bloco, r.pessoas, `"${l.nome}"`, l.cat, l.qtd, l.unidade, l.unitPrice.toFixed(2), l.subtotal.toFixed(2)]);
      });
    }
  });
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `LM-Orcamento-${de}.csv`;
  a.click();
  showToast('✅ CSV exportado!');
}

// ─────────────────────────────────────────────
// 🎁  DONATION TOGGLE
// ─────────────────────────────────────────────
function toggleDonation() {
  const tog   = document.getElementById('donation-toggle');
  const lbl   = document.getElementById('donation-toggle-label');
  const inp   = document.getElementById('mov-is-donation');
  const isNow = inp.value === 'true';
  inp.value   = isNow ? 'false' : 'true';
  tog.classList.toggle('active', !isNow);
  lbl.textContent = isNow ? 'Não — Compra/Regular' : 'Sim — Esta é uma doação 🎁';
}

// ─────────────────────────────────────────────
// 🏢  FORNECEDORES
// ─────────────────────────────────────────────
let supplierEditId = null;
let suppliersCache = [];

async function loadSuppliers() {
  const wrap = document.getElementById('supplier-list-wrap');
  if (!wrap) return;
  wrap.innerHTML = '<div class="loading-state"><div class="spinner spinner-dark"></div>Carregando...</div>';

  // Regenera checkboxes de categoria no formulário de fornecedor
  const catsWrap = document.getElementById('sup-cats-wrap');
  if (catsWrap) {
    catsWrap.innerHTML = Object.entries(CATEGORIAS).map(([k,c]) => `
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;font-weight:500;padding:8px 14px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);transition:all 0.15s;" id="cat-check-${k}">
        <input type="checkbox" id="sup-cat-${k}" value="${k}" onchange="updateCatStyle('${k}')" style="accent-color:var(--lumen);width:16px;height:16px;">
        ${c.icon} ${c.nome}
      </label>`).join('');
  }

  // Popula select de categoria nos filtros de orçamento/estoque/preços
  ['stock-filter-cat','prices-cat','orc-cat'].forEach(id => populateCatSelect(id, true));

  try {
    const snap = await db.collection('suppliers').orderBy('nome').get();
    suppliersCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (snap.empty) {
      wrap.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🏢</div><div class="empty-state-title">Nenhum fornecedor cadastrado</div><div>Adicione o primeiro fornecedor acima.</div></div>';
      return;
    }
    renderSuppliersList();
    renderSuppDashboard();

    // Check 50% limit alerts
    suppliersCache.forEach(s => {
      if (s.limite > 0 && s.utilizado > 0) {
        const pct = s.utilizado / s.limite;
        if (pct >= 0.5) {
          showToast(`⚠️ Fornecedor "${s.nome}": ${Math.round(pct*100)}% do limite utilizado!`);
        }
      }
    });
  } catch(e) { wrap.innerHTML = `<div class="alert alert-danger visible">Erro: ${e.message}</div>`; }
}

function renderSuppliersList() {
  const wrap = document.getElementById('supplier-list-wrap');
  if (!wrap || !suppliersCache.length) return;
  const sort = document.getElementById('sup-sort')?.value || 'alpha';
  const lista = suppliersCache.slice().sort((a, b) => {
    if (sort === 'alpha-desc')  return String(b.nome||'').localeCompare(String(a.nome||''), 'pt-BR');
    if (sort === 'limite-desc') return (Number(b.limite)||0) - (Number(a.limite)||0);
    if (sort === 'limite-asc')  return (Number(a.limite)||0) - (Number(b.limite)||0);
    return String(a.nome||'').localeCompare(String(b.nome||''), 'pt-BR'); // alpha default
  });
  wrap.innerHTML = lista.map(s => renderSupplierCard(s)).join('');
}
window.renderSuppliersList = renderSuppliersList;

function renderSupplierCard(s) {
  const limite  = parseFloat(s.limite) || 0;
  const pct     = limite > 0 ? (parseFloat(s.utilizado) || 0) / limite * 100 : 0;
  const alertTag = pct >= 90 ? `<span class="badge badge-danger" style="font-size:11px;">🔴 Limite crítico</span>`
                 : pct >= 50 ? `<span class="badge badge-warn" style="font-size:11px;">⚠️ Acima de 50%</span>` : '';

  let ultimoContato = '<span style="color:var(--text-muted);font-size:12px;">Nunca contatado</span>';
  if (s.ultimoContato) {
    const uc = s.ultimoContato;
    const dataFmt = uc.data ? new Date(uc.data + 'T00:00:00').toLocaleDateString('pt-BR', { day:'2-digit', month:'short' }) : '—';
    ultimoContato = `<span style="font-size:12px;color:var(--text-muted);">📞 Último contato: <strong>${dataFmt}</strong> via ${uc.canal || '—'}${uc.obs ? ` — <em>${uc.obs.substring(0,40)}${uc.obs.length>40?'…':''}</em>` : ''}</span>`;
  }

  return `<div class="supplier-card" data-sup-id="${s.id}" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;padding:14px 18px;">
    <div style="display:flex;flex-direction:column;gap:4px;min-width:0;">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <span class="supplier-name" style="font-size:15px;font-weight:700;">${s.nome}</span>
        ${alertTag}
      </div>
      ${ultimoContato}
    </div>
    <div style="display:flex;gap:8px;flex-shrink:0;flex-wrap:wrap;">
      <button class="btn btn-primary btn-sm" onclick="abrirFornecedorModal('${s.id}')">Ver dados</button>
      <button class="btn btn-danger btn-sm" onclick="deleteSupplier('${s.id}','${s.nome.replace(/'/g,"\\'")}')">Remover</button>
    </div>
  </div>`;
}

// ── Modal de fornecedor (Informações + Contatos) ──────────────────────────────
let _supModalId = null;

async function abrirFornecedorModal(id) {
  _supModalId = id;
  const s = suppliersCache.find(x => x.id === id);
  if (!s) return;

  const prazoMap = { a_vista:'À vista', '7':'7 dias', '14':'14 dias', '21':'21 dias', '28':'28 dias', '30':'30 dias', '45':'45 dias', '60':'60 dias' };
  const limite    = parseFloat(s.limite) || 0;
  const utilizado = parseFloat(s.utilizado) || 0;
  const disponivel = Math.max(0, limite - utilizado);
  const pct       = limite > 0 ? (utilizado / limite * 100) : 0;
  const barClass  = pct >= 90 ? 'danger' : pct >= 50 ? 'warn' : 'safe';
  const cats      = (s.categorias || []).map(c => CATEGORIAS[c]?.icon + ' ' + CATEGORIAS[c]?.nome).join(', ') || '—';
  const tipos     = (s.tipos || []).join(', ') || '—';
  const tel       = s.contato || s.telefone || '';

  const hoje = new Date().toISOString().slice(0, 10);

  document.getElementById('forn-modal-titulo').textContent = s.nome;
  document.getElementById('forn-modal-body').innerHTML = `
    <!-- Abas -->
    <div style="display:flex;border-bottom:1px solid var(--border);margin-bottom:16px;">
      <button id="forn-tab-info" onclick="_supAba('info')" style="padding:8px 18px;border:none;background:none;cursor:pointer;font-weight:700;color:var(--lumen);border-bottom:2px solid var(--lumen);">Informações</button>
      <button id="forn-tab-contatos" onclick="_supAba('contatos')" style="padding:8px 18px;border:none;background:none;cursor:pointer;font-weight:500;color:var(--text-muted);border-bottom:2px solid transparent;">Contatos</button>
    </div>

    <!-- Aba Informações -->
    <div id="forn-aba-info">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 20px;font-size:13px;">
        <div><span style="color:var(--text-muted);">CNPJ</span><div style="font-weight:600;">${s.cnpj || '—'}</div></div>
        <div><span style="color:var(--text-muted);">Telefone</span><div style="font-weight:600;">${tel || '—'}</div></div>
        <div><span style="color:var(--text-muted);">E-mail</span><div style="font-weight:600;">${s.email || '—'}</div></div>
        <div><span style="color:var(--text-muted);">Contato</span><div style="font-weight:600;">${s.contatoNome || '—'}</div></div>
        <div><span style="color:var(--text-muted);">Prazo de pagamento</span><div style="font-weight:600;">${prazoMap[s.prazo] || s.prazo || '—'}</div></div>
        <div><span style="color:var(--text-muted);">Tipo</span><div style="font-weight:600;">${tipos}</div></div>
        <div style="grid-column:1/-1;"><span style="color:var(--text-muted);">Categorias</span><div style="font-weight:600;">${cats}</div></div>
        ${s.obs ? `<div style="grid-column:1/-1;"><span style="color:var(--text-muted);">Observações</span><div style="font-style:italic;">${s.obs}</div></div>` : ''}
      </div>
      ${limite > 0 ? `
      <div style="margin-top:14px;">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">Limite de crédito</div>
        <div style="background:rgba(255,255,255,.08);border-radius:6px;height:10px;overflow:hidden;margin-bottom:6px;">
          <div style="background:${pct>=90?'var(--danger)':pct>=50?'#d97706':'var(--ok,#16a34a)'};height:100%;width:${Math.min(100,pct).toFixed(1)}%;transition:width .3s;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;">
          <span>Utilizado: <strong>R$ ${utilizado.toFixed(2)}</strong></span>
          <span>Disponível: <strong>R$ ${disponivel.toFixed(2)}</strong></span>
          <span>Limite: <strong>R$ ${limite.toFixed(2)}</strong> (${pct.toFixed(0)}%)</span>
        </div>
      </div>` : ''}
      <div style="display:flex;gap:8px;margin-top:18px;flex-wrap:wrap;">
        ${tel ? `<button class="btn btn-outline btn-sm" onclick="abrirWhatsAppFornecedor('${tel.replace(/'/g,"\\'")}','${s.nome.replace(/'/g,"\\'")}')">📲 WhatsApp</button>` : ''}
        <button class="btn btn-outline btn-sm" onclick="abrirHistoricoFornecedor('${s.id}','${s.nome.replace(/'/g,"\\'")}')">📋 Histórico de compras</button>
        <button class="btn btn-primary btn-sm" onclick="closeModal('modal-fornecedor');editSupplier('${s.id}')">✏️ Editar dados</button>
      </div>
    </div>

    <!-- Aba Contatos -->
    <div id="forn-aba-contatos" style="display:none;">
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:16px;">
        <div style="font-weight:600;margin-bottom:10px;">📞 Registrar novo contato</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
          <div><label class="form-label">Data</label><input type="date" class="form-input" id="forn-cont-data" value="${hoje}"></div>
          <div><label class="form-label">Canal</label>
            <select class="form-input" id="forn-cont-canal">
              <option value="WhatsApp">WhatsApp</option>
              <option value="Telefone">Telefone</option>
              <option value="E-mail">E-mail</option>
              <option value="Visita">Visita</option>
              <option value="Outro">Outro</option>
            </select>
          </div>
        </div>
        <div style="margin-bottom:10px;"><label class="form-label">Observação (opcional)</label><input type="text" class="form-input" id="forn-cont-obs" placeholder="Ex: solicitou catálogo, negociamos prazo..."></div>
        <button class="btn btn-primary" onclick="salvarContatoFornecedor()">Salvar contato</button>
      </div>
      <div id="forn-contatos-lista" style="display:flex;flex-direction:column;gap:8px;">
        <div style="text-align:center;color:var(--text-muted);padding:16px;">Carregando histórico…</div>
      </div>
    </div>`;

  document.getElementById('modal-fornecedor').classList.remove('hidden');
  _supAba('info');
}
window.abrirFornecedorModal = abrirFornecedorModal;

function _supAba(aba) {
  document.getElementById('forn-aba-info').style.display      = aba === 'info'     ? '' : 'none';
  document.getElementById('forn-aba-contatos').style.display  = aba === 'contatos' ? '' : 'none';
  document.getElementById('forn-tab-info').style.cssText      = `padding:8px 18px;border:none;background:none;cursor:pointer;font-weight:${aba==='info'?'700':'500'};color:${aba==='info'?'var(--lumen)':'var(--text-muted)'};border-bottom:2px solid ${aba==='info'?'var(--lumen)':'transparent'};`;
  document.getElementById('forn-tab-contatos').style.cssText  = `padding:8px 18px;border:none;background:none;cursor:pointer;font-weight:${aba==='contatos'?'700':'500'};color:${aba==='contatos'?'var(--lumen)':'var(--text-muted)'};border-bottom:2px solid ${aba==='contatos'?'var(--lumen)':'transparent'};`;
  if (aba === 'contatos') _carregarContatosFornecedor();
}
window._supAba = _supAba;

async function _carregarContatosFornecedor() {
  const el = document.getElementById('forn-contatos-lista');
  if (!el) return;
  try {
    const snap = await db.collection('suppliers').doc(_supModalId).collection('contatos').orderBy('data', 'desc').get();
    const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!lista.length) {
      el.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:16px;">Nenhum contato registrado ainda.</div>';
      return;
    }
    const canalIcon = { WhatsApp:'📲', Telefone:'📞', 'E-mail':'✉️', Visita:'🤝', Outro:'📌' };
    el.innerHTML = lista.map(c => {
      const dataFmt = c.data ? new Date(c.data + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
      return `<div style="border:1px solid var(--border);border-radius:8px;padding:10px 14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <span style="font-weight:600;">${canalIcon[c.canal]||'📌'} ${c.canal || '—'}</span>
          <span style="font-size:12px;color:var(--text-muted);">${dataFmt}${c.registradoPor ? ' · ' + c.registradoPor : ''}</span>
        </div>
        ${c.obs ? `<div style="font-size:13px;margin-top:4px;color:var(--text-muted);font-style:italic;">${c.obs}</div>` : ''}
      </div>`;
    }).join('');
  } catch(e) {
    el.innerHTML = `<div style="color:var(--danger);padding:8px;">Erro: ${e.message}</div>`;
  }
}

async function salvarContatoFornecedor() {
  const data  = document.getElementById('forn-cont-data').value;
  const canal = document.getElementById('forn-cont-canal').value;
  const obs   = document.getElementById('forn-cont-obs').value.trim();
  if (!data) return showToast('⚠️ Informe a data do contato.');

  const registro = {
    data, canal, obs,
    registradoPor: (typeof currentUserData !== 'undefined' && currentUserData?.name) || null,
    criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
  };

  try {
    // Salva no histórico (subcoleção)
    await db.collection('suppliers').doc(_supModalId).collection('contatos').add(registro);
    // Atualiza o campo ultimoContato no documento principal (para exibir no card)
    await db.collection('suppliers').doc(_supModalId).update({ ultimoContato: { data, canal, obs, registradoPor: registro.registradoPor } });

    // Atualiza cache local
    const idx = suppliersCache.findIndex(x => x.id === _supModalId);
    if (idx !== -1) suppliersCache[idx].ultimoContato = { data, canal, obs, registradoPor: registro.registradoPor };

    showToast('✅ Contato registrado!');
    document.getElementById('forn-cont-obs').value = '';
    _carregarContatosFornecedor();

    // Atualiza card na lista sem recarregar tudo
    const cardEl = document.querySelector(`[data-sup-id="${_supModalId}"]`);
    if (cardEl) cardEl.outerHTML = renderSupplierCard(suppliersCache[idx]);
    else loadSuppliers();
  } catch(e) { console.error(e); showToast('❌ Erro: ' + e.message); }
}
window.salvarContatoFornecedor = salvarContatoFornecedor;

function onPrazoChange() {
  const val  = document.getElementById('sup-prazo').value;
  const wrap = document.getElementById('prazo-outros-wrap');
  if (wrap) wrap.style.display = val === 'outros' ? 'block' : 'none';
}

function updateCatStyle(cat) {
  const chk = document.getElementById('sup-cat-' + cat);
  const lbl = document.getElementById('cat-check-' + cat);
  if (!lbl) return;
  lbl.classList.toggle('cat-check-active', chk && chk.checked);
}

async function saveSupplier() {
  const nome          = document.getElementById('sup-nome').value.trim();
  const cnpj          = document.getElementById('sup-cnpj').value.trim();
  const contato       = document.getElementById('sup-contato').value.trim();
  const email         = document.getElementById('sup-email').value.trim();
  const contatoNome   = document.getElementById('sup-contato-nome').value.trim();
  const limite        = parseFloat(document.getElementById('sup-limite').value) || 0;
  const utilizado     = parseFloat(document.getElementById('sup-utilizado').value) || 0;
  const prazoBase     = document.getElementById('sup-prazo').value;
  const prazo         = prazoBase === 'outros'
    ? (document.getElementById('sup-prazo-outros').value + ' dias')
    : prazoBase;
  const obs           = document.getElementById('sup-obs').value.trim();
  const categorias    = ['cereal','higiene','proteina','missa_sf','lanches_csl']
    .filter(c => document.getElementById('sup-cat-' + c)?.checked);

  if (!nome) { showToast('Informe o nome do fornecedor!'); return; }
  setBtnLoading('btn-save-supplier', true);

  const data = { nome, cnpj, contato, email, contatoNome, limite, utilizado, prazo, obs, categorias,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp() };

  try {
    if (supplierEditId) {
      await db.collection('suppliers').doc(supplierEditId).update(data);
      showToast('✅ Fornecedor atualizado!');
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      data.createdBy = currentUserData.name;
      await db.collection('suppliers').add(data);
      showToast('✅ Fornecedor cadastrado!');
    }
    cancelEditSupplier();
    loadSuppliers();
  } catch(e) { showToast('Erro: ' + e.message); }
  setBtnLoading('btn-save-supplier', false);
}

function editSupplier(id) {
  const s = suppliersCache.find(x => x.id === id);
  if (!s) return;
  supplierEditId = id;
  document.getElementById('sup-nome').value          = s.nome || '';
  document.getElementById('sup-cnpj').value          = s.cnpj || '';
  document.getElementById('sup-contato').value       = s.contato || '';
  document.getElementById('sup-email').value         = s.email || '';
  document.getElementById('sup-contato-nome').value  = s.contatoNome || '';
  document.getElementById('sup-limite').value        = s.limite || '';
  document.getElementById('sup-utilizado').value     = s.utilizado || '';
  document.getElementById('sup-obs').value           = s.obs || '';
  // Handle prazo — if it is a custom value (e.g. "35 dias"), set "outros"
  const prazoValues = ['a_vista','7','14','21','28','30','45','60'];
  if (prazoValues.includes(s.prazo)) {
    document.getElementById('sup-prazo').value = s.prazo;
    document.getElementById('prazo-outros-wrap').style.display = 'none';
  } else {
    document.getElementById('sup-prazo').value = 'outros';
    document.getElementById('prazo-outros-wrap').style.display = 'block';
    document.getElementById('sup-prazo-outros').value = parseInt(s.prazo) || '';
  }
  // Checkboxes
  ['cereal','higiene','proteina','missa_sf','lanches_csl'].forEach(c => {
    const chk = document.getElementById('sup-cat-' + c);
    if (chk) { chk.checked = (s.categorias || []).includes(c); updateCatStyle(c); }
  });
  document.getElementById('supplier-form-title').textContent = 'Editar Fornecedor';
  document.getElementById('btn-cancel-supplier').classList.remove('hidden');
  document.getElementById('btn-save-supplier').textContent = 'Salvar Alterações';
  document.getElementById('supplier-form-card').scrollIntoView({ behavior:'smooth' });
}

function cancelEditSupplier() {
  supplierEditId = null;
  ['sup-nome','sup-cnpj','sup-contato','sup-email','sup-contato-nome','sup-limite','sup-utilizado','sup-obs','sup-prazo-outros'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('sup-prazo').value = 'a_vista';
  document.getElementById('prazo-outros-wrap').style.display = 'none';
  ['cereal','higiene','proteina','missa_sf','lanches_csl'].forEach(c => {
    const chk = document.getElementById('sup-cat-' + c);
    if (chk) { chk.checked = false; updateCatStyle(c); }
  });
  document.getElementById('supplier-form-title').textContent = 'Cadastrar Novo Fornecedor';
  document.getElementById('btn-cancel-supplier').classList.add('hidden');
  document.getElementById('btn-save-supplier').textContent = '+ Cadastrar Fornecedor';
}

async function deleteSupplier(id, nome) {
  if (!confirm(`Remover fornecedor "${nome}"?`)) return;
  await db.collection('suppliers').doc(id).delete();
  showToast(`Fornecedor "${nome}" removido.`);
  loadSuppliers();
}

function populateSupplierSelect(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = '<option value="">Selecione o fornecedor...</option>';
  suppliersCache.forEach(s => {
    const o = document.createElement('option');
    o.value = s.id; o.textContent = s.nome;
    sel.appendChild(o);
  });
  // Also load fresh if empty
  if (suppliersCache.length === 0) {
    db.collection('suppliers').orderBy('nome').get().then(snap => {
      suppliersCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      sel.innerHTML = '<option value="">Selecione o fornecedor...</option>';
      suppliersCache.forEach(s => {
        const o = document.createElement('option');
        o.value = s.id; o.textContent = s.nome;
        sel.appendChild(o);
      });
    });
  }
}


// ─────────────────────────────────────────────
// 📤  EXPORT FUNCTIONS
// ─────────────────────────────────────────────
function exportOrdersExcel() {
  // Build CSV with order data
  const tbody = document.getElementById('all-orders-tbody');
  if (!tbody) return;
  const rows = [['Código','Casa','Categorias','Itens','Solicitante','Data','Status','NF / Valor','Arquivo NF','Boleto Venc.']];
  tbody.querySelectorAll('tr').forEach(tr => {
    const cells = tr.querySelectorAll('td');
    if (cells.length < 2) return;
    rows.push(Array.from(cells).map(td => `"${td.innerText.replace(/"/g,'""')}"`));
  });
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `LM-Pedidos-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  showToast('✅ CSV exportado com sucesso!');
}

function exportOrdersPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('l', 'mm', 'a4'); // landscape
  const blue = [0,56,117]; const gray = [107,114,128];

  doc.setFillColor(...blue);
  doc.rect(0,0,297,20,'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(13); doc.setFont('helvetica','bold');
  doc.text('Obra Lumen — Relatório de Pedidos', 10, 13);
  doc.setFontSize(8); doc.setFont('helvetica','normal');
  doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 230, 13);

  let y = 30;
  const headers = ['Código','Casa','Categorias','Itens','Solicitante','Data','Status'];
  const widths  = [35,35,45,20,35,30,35];
  const xStarts = [10];
  widths.forEach((w,i) => { if(i>0) xStarts.push(xStarts[i-1]+widths[i-1]); });

  // Table header
  doc.setFillColor(230,238,248);
  doc.rect(10,y-5,280,8,'F');
  doc.setTextColor(...gray); doc.setFontSize(7); doc.setFont('helvetica','bold');
  headers.forEach((h,i) => doc.text(h, xStarts[i]+2, y));
  y += 8;

  const tbody = document.getElementById('all-orders-tbody');
  tbody.querySelectorAll('tr').forEach((tr,idx) => {
    if (y > 185) { doc.addPage(); y = 20; }
    const cells = tr.querySelectorAll('td');
    if (cells.length < 2) return;
    if (idx%2===0) { doc.setFillColor(250,251,252); doc.rect(10,y-5,280,7,'F'); }
    doc.setTextColor(0,0,0); doc.setFont('helvetica','normal'); doc.setFontSize(7);
    Array.from(cells).slice(0,7).forEach((td,i) => {
      const txt = td.innerText.substring(0,22);
      doc.text(txt, xStarts[i]+2, y);
    });
    y += 7;
  });

  doc.setTextColor(...gray); doc.setFontSize(7);
  doc.text('Suprimentos Obra Lumen — lumenserfeliz.org', 10, 200);

  // Monta nome do arquivo: LM-[Casa]-[Categoria]-[Data].pdf
  const normalize = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'');

  const filterHouseVal = (document.getElementById('filter-house') || {}).value || '';
  const filterCatVal   = (document.getElementById('filter-cat')   || {}).value || '';

  const housePart = filterHouseVal ? normalize(filterHouseVal) : 'TodasCasas';
  const catPart   = filterCatVal === 'mix' ? 'Mix'
                  : filterCatVal ? normalize(CATEGORIAS[filterCatVal]?.nome || filterCatVal)
                  : '';

  // Se há apenas 1 pedido na tabela, inclui o código do pedido no nome
  const rows = document.querySelectorAll('#all-orders-tbody tr');
  const codePart = rows.length === 1
    ? (() => { const c = rows[0].querySelector('td')?.innerText?.trim(); return c ? normalize(c) : ''; })()
    : '';

  const parts = ['LM', housePart, catPart, codePart, new Date().toISOString().slice(0,10)].filter(Boolean);
  doc.save(parts.join('-') + '.pdf');
  showToast('✅ PDF exportado com sucesso!');
}

function exportSuppliersReport() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const blue = [0,56,117]; const gray = [107,114,128];

  doc.setFillColor(...blue); doc.rect(0,0,210,28,'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(14); doc.setFont('helvetica','bold');
  doc.text('Obra Lumen — Relatório de Fornecedores em Aberto', 14, 12);
  doc.setFontSize(9); doc.setFont('helvetica','normal');
  doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 22);

  let y = 38;
  suppliersCache.forEach(s => {
    if (y > 260) { doc.addPage(); y = 20; }
    const limite = parseFloat(s.limite)||0;
    const utilizado = parseFloat(s.utilizado)||0;
    const disp = Math.max(0, limite - utilizado);
    const pct = limite > 0 ? ((utilizado/limite)*100).toFixed(0) : '—';
    const prazoMap = { a_vista:'À vista', '7':'7d', '14':'14d', '21':'21d', '28':'28d', '30':'30d', '45':'45d', '60':'60d' };

    doc.setFillColor(230,238,248);
    doc.rect(10,y-5,190,9,'F');
    doc.setTextColor(...blue); doc.setFontSize(10); doc.setFont('helvetica','bold');
    doc.text(s.nome, 14, y);
    y += 9;

    doc.setTextColor(0,0,0); doc.setFont('helvetica','normal'); doc.setFontSize(8);
    doc.text(`CNPJ: ${s.cnpj||'—'}  |  Contato: ${s.contato||'—'}  |  Prazo: ${prazoMap[s.prazo]||'—'}`, 14, y); y+=6;
    doc.text(`Limite: R$ ${limite.toFixed(2)}  |  Utilizado: R$ ${utilizado.toFixed(2)} (${pct}%)  |  Disponível: R$ ${disp.toFixed(2)}`, 14, y); y+=6;
    if (s.obs) { doc.setTextColor(...gray); doc.text(`Obs: ${s.obs}`, 14, y); y+=6; doc.setTextColor(0,0,0); }
    y += 4;
  });

  doc.setTextColor(...gray); doc.setFontSize(7);
  doc.text('Suprimentos Obra Lumen — lumenserfeliz.org', 14, 288);
  doc.save(`LM-Fornecedores-${new Date().toISOString().slice(0,10)}.pdf`);
  showToast('✅ Relatório de fornecedores exportado!');
}
