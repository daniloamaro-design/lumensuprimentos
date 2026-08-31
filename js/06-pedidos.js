// Extraído de index.html (pedidos: novo/todos/entrega/meus + PDF + email) em 2026-07-27
// ─────────────────────────────────────────────
// 📋  NEW ORDER
// ─────────────────────────────────────────────
async function onOrderHouseChange() {
  const house = v('order-house');
  if (!house) {
    document.getElementById('order-house-details').style.display='none';
    document.getElementById('order-people-info').style.display='none';
    return;
  }

  // Load house data
  const snap = await db.collection('houses').where('name','==',house).get();
  if (snap.empty) {
    currentHousePeople = 0;
    currentHouseData = null;
  } else {
    currentHouseData = snap.docs[0].data();
    currentHouseData.id = snap.docs[0].id;
    currentHousePeople = currentHouseData.currentPeople || 0;
  }

  // Load percapita for this house from Firestore
  const pcSnap = await db.collection('percapitas').where('house','==',house).get();
  if (!pcSnap.empty) {
    housePercapitas[house] = pcSnap.docs[0].data().values || JSON.parse(JSON.stringify(PERCAPITAS_PADRAO));
  } else {
    housePercapitas[house] = JSON.parse(JSON.stringify(PERCAPITAS_PADRAO));
  }

  // Load current stock for this house
  currentHouseStockData = {};
  const movSnap = await db.collection('movements').where('house','==',house).get();
  movSnap.docs.forEach(d => {
    const m = d.data();
    (m.items || []).forEach(item => {
      const key = `${item.catKey}__${item.prodId}`;
      if (!currentHouseStockData[key]) currentHouseStockData[key] = 0;
      if (m.type === 'entrada') currentHouseStockData[key] += item.qty;
      else currentHouseStockData[key] -= item.qty;
    });
  });

  // Load prices for this house's city
  const city = CASAS_CIDADES[house] || '';
  currentHousePrices = {};
  if (city) {
    const prSnap = await db.collection('prices').where('city','==',city).get();
    prSnap.docs.forEach(d => {
      const p = d.data();
      currentHousePrices[`${p.cat}__${p.prodId}`] = p.price;
    });
  }

  const today = new Date().toISOString().slice(0,10);
  document.getElementById('order-people-display').value = currentHousePeople;
  document.getElementById('order-date-start').value = today;
  document.getElementById('order-duration-days').value = 7;
  onOrderDurationChange();

  document.getElementById('order-house-details').style.display = 'grid';
  document.getElementById('order-people-info').style.display = currentHousePeople > 0 ? 'block' : 'none';

  // Show city info
  const city2 = CASAS_CIDADES[house];
  const cityEl = document.getElementById('order-city-info');
  if (cityEl) cityEl.textContent = city2 ? `Cidade: ${city2} — preços carregados automaticamente` : '';

  renderOrderProducts();
}

function onOrderDurationChange() {
  const days = parseInt(document.getElementById('order-duration-days').value) || 7;
  const startDate = new Date(document.getElementById('order-date-start').value);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + days);
  document.getElementById('order-date-end').value = endDate.toISOString().slice(0,10);
  renderOrderProducts();
}

function setOrderCat(cat) {
  currentOrderCat = cat;
  document.querySelectorAll('.cat-tab').forEach(t => t.classList.toggle('active', t.dataset.cat === cat));
  const info = CATEGORIAS[cat];
  document.getElementById('order-cat-header').querySelector('.card-header-title').textContent = `${info.icon} ${info.nome}`;
  renderOrderProducts();
}

function renderOrderProducts() {
  // Regenera abas dinamicamente para incluir categorias custom
  const orderTabsEl = document.querySelector('#page-new-order .cat-tabs');
  if (orderTabsEl) {
    orderTabsEl.innerHTML = Object.entries(CATEGORIAS).map(([k,c]) => `
      <button class="cat-tab ${k===currentOrderCat?'active':''}" data-cat="${k}" onclick="setOrderCat('${k}')">
        ${c.icon} ${c.nome} <span class="cat-count" id="count-${k}">0</span>
      </button>`).join('');
  }
  // Garante que orderItems tem chaves para todas as categorias
  Object.keys(CATEGORIAS).forEach(k => { if (!orderItems[k]) orderItems[k] = {}; });

  const cat = currentOrderCat;
  const prods2 = CATEGORIAS[cat].produtos;
  const el = document.getElementById('order-products-list');
  const house = v('order-house');
  const days = parseInt(document.getElementById('order-duration-days')?.value) || 7;
  const percapitas = housePercapitas[house] || PERCAPITAS_PADRAO;

  el.innerHTML = prods2.map(p => {
    const isChecked = orderItems[cat][p.id] !== undefined;
    const qty = orderItems[cat][p.id] || '';

    // Sugestão baseada em percapita
    let suggested = null;
    if (currentHousePeople > 0 && percapitas[cat] && percapitas[cat][p.id] !== undefined) {
      const ppc = percapitas[cat][p.id];
      if (ITENS_HIGIENE_ESPECIAL.includes(p.id)) {
        suggested = Math.ceil(currentHousePeople * 1.25);
      } else {
        suggested = Math.ceil(days * currentHousePeople * ppc);
      }
    }

    // Estoque atual da casa
    const stockKey = `${cat}__${p.id}`;
    const stockQty = currentHouseStockData[stockKey];
    const hasStock = stockQty !== undefined;
    const stockColor = hasStock
      ? (stockQty <= 0 ? 'color:var(--danger);font-weight:700;' : stockQty < (suggested || 5) * 0.3 ? 'color:var(--warn);font-weight:600;' : 'color:var(--ok);')
      : 'color:var(--text-muted);';

    // Preço da cidade
    const priceKey = `${cat}__${p.id}`;
    const unitPrice = currentHousePrices[priceKey];
    const totalPrice = unitPrice && qty ? (parseFloat(qty) * unitPrice).toFixed(2) : null;

    return `<div class="prod-row" onclick="toggleOrderItem(event,'${cat}','${p.id}')">
      <div class="prod-checkbox ${isChecked ? 'checked' : ''}" id="chk-${cat}-${p.id}"></div>
      <div class="prod-name">${p.nome}</div>
      <span class="prod-unit">${p.unidade}</span>
      <span style="font-size:11px;min-width:70px;text-align:right;${stockColor}">
        ${hasStock ? `Estq: ${stockQty.toFixed(1)}` : '—'}
      </span>
      ${suggested !== null
        ? `<span class="prod-suggested" style="min-width:80px;">Sug: ${suggested}</span>`
        : '<span style="min-width:80px;"></span>'
      }
      ${unitPrice ? `<span style="font-size:11px;color:var(--text-muted);min-width:70px;text-align:right;">R$ ${unitPrice.toFixed(2)}</span>` : '<span style="min-width:70px;"></span>'}
      ${isChecked
        ? `<input class="prod-qty-input" type="number" min="1" value="${qty}" onclick="event.stopPropagation()" onchange="setOrderQty('${cat}','${p.id}',this.value)" placeholder="Qtd">`
        : '<span style="width:70px;"></span>'
      }
      ${isChecked && totalPrice ? `<span style="font-size:11px;font-weight:700;color:var(--lumen);min-width:70px;text-align:right;">R$ ${totalPrice}</span>` : '<span style="min-width:70px;"></span>'}
    </div>`;
  }).join('');

  updateOrderSummary();
}

function toggleOrderItem(event, cat, prodId) {
  if (event.target.tagName === 'INPUT') return;
  if (orderItems[cat][prodId] !== undefined) {
    delete orderItems[cat][prodId];
  } else {
    const p = CATEGORIAS[cat].produtos.find(x => x.id === prodId);
    const house = v('order-house');
    const days = parseInt(document.getElementById('order-duration-days').value) || 7;
    const percapitas = housePercapitas[house] || PERCAPITAS_PADRAO;
    const ppc = percapitas[cat] && percapitas[cat][p.id] !== undefined ? percapitas[cat][p.id] : 0;
    
    let suggested = 1;
    if (currentHousePeople > 0 && ppc !== undefined) {
      if (ITENS_HIGIENE_ESPECIAL.includes(p.id)) {
        suggested = Math.ceil(currentHousePeople * 1.25);
      } else if (cat === 'proteina') {
        suggested = Math.ceil(days * currentHousePeople * ppc);
      } else {
        suggested = Math.ceil(days * currentHousePeople * ppc);
      }
    }
    // Descontar estoque atual da casa
    const stockKey2 = `${cat}__${prodId}`;
    const stockQty2 = currentHouseStockData[stockKey2];
    if (stockQty2 !== undefined && stockQty2 > 0) {
      suggested = Math.max(0, suggested - stockQty2);
    }
    orderItems[cat][prodId] = suggested;
  }
  renderOrderProducts();
}

function setOrderQty(cat, prodId, val) {
  orderItems[cat][prodId] = parseFloat(val) || 0;
  updateOrderSummary();
}

function autoFillSuggested() {
  if (currentHousePeople <= 0) { showToast('Salve a quantidade de pessoas da casa primeiro!'); return; }
  const cat = currentOrderCat;
  const house = v('order-house');
  const days = parseInt(document.getElementById('order-duration-days').value) || 7;
  const percapitas = housePercapitas[house] || PERCAPITAS_PADRAO;
  
  CATEGORIAS[cat].produtos.forEach(p => {
    if (orderItems[cat][p.id] === undefined) {
      const ppc = percapitas[cat] && percapitas[cat][p.id] !== undefined ? percapitas[cat][p.id] : 0;
      let suggested = 1;
      if (currentHousePeople > 0 && ppc !== undefined) {
        if (ITENS_HIGIENE_ESPECIAL.includes(p.id)) {
          suggested = Math.ceil(currentHousePeople * 1.25);
        } else if (cat === 'proteina') {
          suggested = Math.ceil(days * currentHousePeople * ppc);
        } else {
          suggested = Math.ceil(days * currentHousePeople * ppc);
        }
      }
      // Descontar estoque atual da casa
      const stockKeyAF = `${cat}__${p.id}`;
      const stockQtyAF = currentHouseStockData[stockKeyAF];
      if (stockQtyAF !== undefined && stockQtyAF > 0) {
        suggested = Math.max(0, suggested - stockQtyAF);
      }
      orderItems[cat][p.id] = suggested;
    }
  });
  renderOrderProducts();
}

function updateOrderSummary() {
  let total = 0;
  Object.values(orderItems).forEach(cat => { total += Object.keys(cat).length; });
  document.getElementById('order-total-summary').textContent = `${total} item(s) selecionado(s)`;
  document.getElementById('btn-submit-order').disabled = total === 0;

  // Update cat counts
  Object.entries(CATEGORIAS).forEach(([catKey]) => {
    const count = Object.keys(orderItems[catKey] || {}).length;
    const el = document.getElementById(`count-${catKey}`);
    if (el) el.textContent = count > 0 ? count : '';
  });
}

function clearOrder() {
  orderItems = initItemObjects();
  renderOrderProducts();
  const ccSel = document.getElementById('order-centro-custo');
  if (ccSel) ccSel.value = '';
}

function previewOrder() {
  const house = v('order-house');
  if (!house) { showToast('Selecione a casa!'); return; }
  document.getElementById('modal-preview-body').innerHTML = buildOrderHTML(house, orderItems, false);
  openModal('modal-preview');
}


// Gera sigla da casa para o código do pedido
// Estratégia: iniciais de todas as palavras (sem artigos/preposições curtas)
// Palavra única: 4 primeiras letras. 2+ palavras: iniciais, máx 4 chars.
function siglaCasa(nome) {
  if (!nome) return 'XX';
  const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const normU = s => norm(s).toUpperCase();
  // Remove sufixos geográficos somente se 3 letras maiúsculas após hífen: "- SP", "- SSA"
  const semSufixo = nome.replace(/\s*-\s*[A-Z]{2,3}\s*$/,'').trim();
  // Filtra apenas artigos/preposições de até 2 letras
  const skip = new Set(['de','da','do','e','a','o']);
  const palavras = semSufixo.split(/[\s.]+/).filter(p => p.length >= 1 && !skip.has(norm(p)));
  let sigla;
  if (palavras.length === 0) {
    sigla = normU(semSufixo.replace(/\s/g,'')).slice(0,4);
  } else if (palavras.length === 1) {
    sigla = normU(palavras[0]).slice(0,4);
  } else {
    sigla = palavras.map(p => normU(p)[0]).join('').slice(0,4);
  }
  return sigla;
}

async function submitOrder() {
  closeModal('modal-preview');
  const house = v('order-house');
  const recipient = v('order-recipient');
  if (!house) { showToast('Selecione a casa antes de enviar!'); return; }

  let totalItems = 0;
  Object.values(orderItems).forEach(c => { totalItems += Object.keys(c).length; });
  if (totalItems === 0) { showToast('Adicione ao menos um item!'); return; }

  setBtnLoading('btn-submit-order', true);

  const catsUsed = Object.entries(orderItems).filter(([,v]) => Object.keys(v).length > 0).map(([k]) => k);
  const catType = catsUsed.length > 1 ? 'MIX' : catsUsed[0].toUpperCase().slice(0,3);
  const dateStr = new Date().toISOString().slice(0,10).replace(/-/g,'');

  // Get next sequence for today
  const todayOrders = await db.collection('orders')
    .where('dateStr','==',dateStr).get();
  const seq    = String(todayOrders.size + 1).padStart(3,'0');
  const prefix = siglaCasa(house); // sigla da casa substitui "LM"
  const code   = `OB-${prefix}-${catType}-${dateStr}-${seq}`;

  const ccSel  = document.getElementById('order-centro-custo');
  const ccId   = ccSel?.value || '';
  const ccNome = ccSel?.options[ccSel.selectedIndex]?.getAttribute('data-nome') || '';

  const orderData = {
    code,
    house,
    dateStr,
    categories: catsUsed,
    items: orderItems,
    people: currentHousePeople,
    observations: v('order-obs'),
    requesterUid:  currentUser.uid,
    requesterName: currentUserData.name,
    requesterEmail:currentUser.email,
    recipient: recipient || '',
    centroCustoId:   ccId,
    centroCustoNome: ccNome,
    status: 'aguardando_estoque',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    await db.collection('orders').add(orderData);

    // Send email
    if (recipient) {
      await sendOrderEmail(orderData, recipient);
    }

    clearOrder();
    showToast(`✅ Pedido ${code} enviado com sucesso!`);
    if (!['admin','diretor','gerente','coordenador'].includes(currentUserData.role)) goPage('my-orders');
    else { goPage('all-orders'); loadDashboard(); }
  } catch(e) {
    console.error(e);
    showToast('Erro ao enviar pedido. Verifique o console.');
  }
  setBtnLoading('btn-submit-order', false);
}

// ─────────────────────────────────────────────
// 📋  ALL ORDERS
// ─────────────────────────────────────────────
let currentOrderStatusFilter = '';

function setOrderStatusFilter(btn, status) {
  currentOrderStatusFilter = status;
  document.querySelectorAll('.status-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadAllOrders();
}

function getStatusBadge(status) {
  const map = {
    'aberto':              ['badge-status-estoque',     '🏪 Análise Estoque'],
    'aguardando_estoque':  ['badge-status-estoque',     '🏪 Análise Estoque'],
    'estoque_avaliado':    ['badge-status-stk-ok',      '✅ Estoque Avaliado'],
    'aguardando_compra':   ['badge-status-progress',    '📊 Análise Orçam.'],
    'andamento':           ['badge-status-progress',    '📊 Análise Orçam.'],
    'concluido':           ['badge-status-done',        '🟢 Concluído'],
    'cancelado':           ['badge-status-cancelled',   '⚫ Cancelado'],
    'aguardando_nf':       ['badge-status-estoque',     '🏪 Análise Estoque'],
    'pendente_pag':        ['badge-status-pending-pay', '🔴 Pend. Pag.'],
    'pedido_liberado':     ['badge-status-liberado',    '🟩 Pedido Liberado'],
  };
  const [cls, label] = map[status] || ['badge-gray','🔵 Em aberto'];
  return `<span class="badge ${cls}">${label}</span>`;
}

// ─── Pipeline de status (para exibir barra de progresso) ───
const ORDER_PIPELINE = [
  { key: 'aguardando_estoque', label: 'Análise Estoque', icon: '🏪' },
  { key: 'estoque_avaliado',   label: 'Avaliado',        icon: '✅' },
  { key: 'andamento',          label: 'Análise Orçam.',  icon: '📊' },
  { key: 'pedido_liberado',    label: 'Ped. Liberado',   icon: '🟩' },
  { key: 'concluido',          label: 'Concluído',       icon: '🟢' },
];

function buildPipelineBar(currentStatus) {
  if (currentStatus === 'cancelado') {
    return `<div style="padding:8px 0;text-align:center;">
      <span class="badge badge-status-cancelled">⚫ Cancelado</span>
    </div>`;
  }
  // Mapeia status legados para o pipeline atual
  if (currentStatus === 'aberto' || currentStatus === 'pendente_pag') currentStatus = 'aguardando_estoque';
  if (currentStatus === 'aguardando_nf') currentStatus = 'pedido_liberado';
  if (currentStatus === 'aguardando_compra') currentStatus = 'andamento';
  const steps = ORDER_PIPELINE;
  const curIdx = steps.findIndex(s => s.key === currentStatus);
  return `<div class="pipeline-bar">
    ${steps.map((s, i) => {
      const done = i < curIdx;
      const active = i === curIdx;
      return `<div class="pipeline-step ${done ? 'done' : ''} ${active ? 'active' : ''}">
        <div class="pipeline-dot">${done ? '✓' : s.icon}</div>
        <div class="pipeline-label">${s.label}</div>
      </div>${i < steps.length - 1 ? '<div class="pipeline-connector ' + (done ? 'done' : '') + '"></div>' : ''}`;
    }).join('')}
  </div>`;
}

// ─────────────────────────────────────────────
// 📦  TOGGLE ENTREGA
// ─────────────────────────────────────────────
async function toggleDelivery(orderId, isCurrentlyDelivered) {
  const novoEstado = !isCurrentlyDelivered;
  try {
    await db.collection('orders').doc(orderId).update({
      entregue: novoEstado,
      entregueAt: novoEstado ? firebase.firestore.FieldValue.serverTimestamp() : null,
      entregueBy: novoEstado ? (currentUser?.displayName || currentUser?.email || 'Usuário') : null
    });
    showToast(novoEstado ? '✅ Pedido marcado como entregue!' : '📦 Marcado como pendente.');
    loadAllOrders();
  } catch(e) {
    showToast('Erro ao atualizar entrega: ' + e.message);
  }
}

async function loadAllOrders() {
  const tbody = document.getElementById('all-orders-tbody');
  // Só mostra o spinner no primeiro carregamento: em atualizações automáticas
  // (onSnapshot a cada 30s) trocar o conteúdo por um placeholder colapsa a
  // altura da tabela e "puxa" a página pra cima — parece o scroll se mexendo
  // sozinho enquanto o usuário está rolando a lista.
  if (!tbody.dataset.loaded) {
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:24px;"><div class="loading-state"><div class="spinner spinner-dark"></div>Carregando...</div></td></tr>';
  }

  let query = db.collection('orders').orderBy('createdAt','desc');
  const filterHouse = v('filter-house');
  const filterCat   = v('filter-cat');
  if (filterHouse) query = query.where('house','==',filterHouse);

  const snap = await query.get();
  let docs = snap.docs;
  if (filterCat) {
    if (filterCat === 'mix') {
      docs = docs.filter(d => (d.data().categories || []).length > 1);
    } else {
      docs = docs.filter(d => (d.data().categories || []).includes(filterCat));
    }
  }
  if (currentOrderStatusFilter) {
    docs = docs.filter(d => (d.data().status || 'aberto') === currentOrderStatusFilter);
  }
  const filterEntrega = (document.getElementById('filter-entrega') || {}).value || '';
  if (filterEntrega === 'entregue') {
    docs = docs.filter(d => d.data().entregue === true);
  } else if (filterEntrega === 'pendente') {
    docs = docs.filter(d => d.data().entregue !== true);
  }

  // Update status counts
  const allDocs = snap.docs;
  const statuses = ['aguardando_estoque','estoque_avaliado','andamento','pedido_liberado','compra_realizada','concluido','cancelado'];
  document.getElementById('cnt-all').textContent = allDocs.length;
  statuses.forEach(s => {
    const el = document.getElementById(`cnt-${s}`);
    if (el) el.textContent = allDocs.filter(d => (d.data().status || 'aberto') === s).length;
  });

  if (docs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" class="text-muted" style="text-align:center;padding:24px;">Nenhum pedido encontrado.</td></tr>';
    tbody.dataset.loaded = '1';
    window._allOrdersCache = [];
    comprasSelecionadas.clear();
    updateComprasExportBtn();
    return;
  }

  window._allOrdersCache = docs.map(d => ({ id: d.id, ...d.data() }));
  // Remove da seleção qualquer pedido que não esteja mais na lista atual (ex: mudou o filtro)
  const idsAtuais = new Set(window._allOrdersCache.map(o => o.id));
  [...comprasSelecionadas].forEach(id => { if (!idsAtuais.has(id)) comprasSelecionadas.delete(id); });

  // Fallback para bug conhecido: quando a aprovação da cotação não pegou o pedido
  // com status==='andamento' no momento exato, o fornecedorNome nunca é gravado no
  // pedido, mesmo com uma cotação aprovada existindo em `quotations`. Aqui a gente
  // detecta isso só para efeito de seleção/exportação — NÃO grava nada no pedido.
  try {
    const idsParaChecar = window._allOrdersCache
      .filter(o => !(o.fornecedorNome && o.fornecedorNome.trim()))
      .map(o => o.id);
    const cotacaoPorPedido = {};
    const CHUNK = 10; // limite do operador 'in' do Firestore
    for (let i = 0; i < idsParaChecar.length; i += CHUNK) {
      const chunk = idsParaChecar.slice(i, i + CHUNK);
      if (chunk.length === 0) continue;
      const qSnap = await db.collection('quotations')
        .where('orderId', 'in', chunk)
        .where('status', '==', 'aprovado')
        .get();
      qSnap.docs.forEach(qd => {
        const q = qd.data();
        const atual = cotacaoPorPedido[q.orderId];
        if (!atual || (q.createdAt?.seconds || 0) > (atual.createdAt?.seconds || 0)) {
          cotacaoPorPedido[q.orderId] = q;
        }
      });
    }
    window._allOrdersCache.forEach(o => {
      const temDireto = !!(o.fornecedorNome && o.fornecedorNome.trim());
      const cot = cotacaoPorPedido[o.id];
      o._fornecedorNomeEfetivo = temDireto ? o.fornecedorNome : (cot?.fornecedorNome || '');
      o._fornecedorIdEfetivo   = o.fornecedorId || cot?.fornecedorId || '';
      o._fornecedorViaCotacaoOrfa = !temDireto && !!cot;
    });
  } catch(e) {
    console.warn('Erro ao checar cotações aprovadas órfãs:', e);
    window._allOrdersCache.forEach(o => { o._fornecedorNomeEfetivo = (o.fornecedorNome && o.fornecedorNome.trim()) ? o.fornecedorNome : ''; });
  }
  const efetivoPorId = {};
  window._allOrdersCache.forEach(o => { efetivoPorId[o.id] = o; });

  tbody.dataset.loaded = '1';
  tbody.innerHTML = docs.map(d => {
    const o = d.data();
    const itemCount = Object.values(o.items || {}).reduce((a,c) => a + Object.keys(c).length, 0);
    const status = o.status || 'aberto';
    // Estimate total value from prices
    let estimatedTotal = 0;
    Object.entries(o.items || {}).forEach(([catKey, prods]) => {
      Object.entries(prods).forEach(([prodId, qty]) => {
        const priceKey = `${catKey}__${prodId}`;
        const p = (o.prices || {})[priceKey];
        if (p) estimatedTotal += parseFloat(qty) * p;
      });
    });
    const nfStr = o.nfNumero
      ? `<span style="font-size:11px;font-weight:700;color:var(--ok);">📎 NF ${o.nfNumero}</span><br><span style="font-size:11px;color:var(--text-muted);">R$ ${parseFloat(o.nfValor||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>`
      : '<span style="font-size:11px;color:var(--text-muted);">—</span>';
    const hasAttach = ''; // incorporado na coluna NF
    const entregue = o.entregue === true;
    const entregaBtn = entregue
      ? `<button class="btn btn-sm delivery-btn delivered" onclick="toggleDelivery('${d.id}', true)" title="Clique para marcar como não entregue" style="background:var(--ok-bg);color:var(--ok);border:1.5px solid var(--ok);min-width:100px;">✅ Entregue</button>`
      : `<button class="btn btn-sm delivery-btn" onclick="toggleDelivery('${d.id}', false)" title="Clique para confirmar entrega" style="background:var(--warn-bg);color:var(--warn);border:1.5px solid var(--warn);min-width:100px;">📦 Pendente</button>`;
    const oEfetivo = efetivoPorId[d.id] || o;
    const temFornecedor = !!(oEfetivo._fornecedorNomeEfetivo && oEfetivo._fornecedorNomeEfetivo.trim());
    const tituloOrfa = oEfetivo._fornecedorViaCotacaoOrfa
      ? ` title="Fornecedor recuperado da cotação aprovada (${oEfetivo._fornecedorNomeEfetivo}) — o pedido não teve o campo sincronizado automaticamente"`
      : '';
    const checkboxCompra = temFornecedor
      ? `<input type="checkbox" class="compra-row-check" data-id="${d.id}" ${comprasSelecionadas.has(d.id) ? 'checked' : ''} onchange="comprasToggleCheck('${d.id}', this.checked)"${tituloOrfa}>`
      : `<input type="checkbox" disabled title="Sem fornecedor definido — finalize o orçamento antes de incluir no PDF de compras">`;
    return `<tr style="${entregue ? 'opacity:0.7;' : ''}">
      <td>${checkboxCompra}</td>
      <td><span class="order-code">${o.code}</span> ${hasAttach}</td>
      <td>${o.house}</td>
      <td>${formatCats(o.categories)}</td>
      <td>${itemCount} itens</td>
      <td>${o.requesterName || '—'}</td>
      <td>${formatDate(o.createdAt)}</td>
      <td>${getStatusBadge(status)}</td>
      <td>${nfStr}</td>
      <td style="text-align:center;">${entregaBtn}</td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="showOrderDetail('${d.id}')">Ver</button>
      </td>
    </tr>`;
  }).join('');

  const headerCheck = document.getElementById('all-orders-check-all');
  if (headerCheck) {
    const selecionaveis = window._allOrdersCache.filter(o => o._fornecedorNomeEfetivo && o._fornecedorNomeEfetivo.trim());
    headerCheck.checked = selecionaveis.length > 0 && selecionaveis.every(o => comprasSelecionadas.has(o.id));
  }
  updateComprasExportBtn();
}

// ── Seleção múltipla de pedidos p/ PDF de compras em lote ──
let comprasSelecionadas = new Set();

function comprasToggleCheck(orderId, checked) {
  if (checked) comprasSelecionadas.add(orderId); else comprasSelecionadas.delete(orderId);
  updateComprasExportBtn();
  const headerCheck = document.getElementById('all-orders-check-all');
  if (headerCheck) {
    const selecionaveis = (window._allOrdersCache||[]).filter(o => o._fornecedorNomeEfetivo && o._fornecedorNomeEfetivo.trim());
    headerCheck.checked = selecionaveis.length > 0 && selecionaveis.every(o => comprasSelecionadas.has(o.id));
  }
}

function comprasToggleAll(checked) {
  const selecionaveis = (window._allOrdersCache||[]).filter(o => o._fornecedorNomeEfetivo && o._fornecedorNomeEfetivo.trim());
  selecionaveis.forEach(o => { if (checked) comprasSelecionadas.add(o.id); else comprasSelecionadas.delete(o.id); });
  document.querySelectorAll('.compra-row-check').forEach(cb => { cb.checked = checked; });
  updateComprasExportBtn();
}

function updateComprasExportBtn() {
  const btn = document.getElementById('btn-compras-export-pdf');
  if (!btn) return;
  const n = comprasSelecionadas.size;
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> 📦 PDF Compras (${n})`;
  btn.disabled = n === 0;
  btn.style.opacity = n === 0 ? '0.5' : '1';
}

// ── PDF de compras em lote (mesma lógica visual do PDF de transferências) ──
// Nota: não mostro "autorizado por" o orçamento porque esse dado vive numa coleção
// separada (quotations) e exigiria uma consulta extra por pedido; mostro quem
// solicitou o pedido (campo já existente em orders), que é o dado confiável que tenho aqui.
function desenharCompraNoPDF(doc, order, itensCompra) {
  const blue = [0, 56, 117];
  const gray = [107, 114, 128];

  // Header
  doc.setFillColor(...blue);
  doc.rect(0, 0, 210, 30, 'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(15); doc.setFont('helvetica','bold');
  doc.text('Suprimentos Obra Lumen — Compra de Produtos', 14, 13);
  doc.setFontSize(9); doc.setFont('helvetica','normal');
  doc.text(`Pedido: ${order.code}   |   Data: ${formatDate(order.createdAt)}`, 14, 21);
  doc.text(`Solicitante: ${order.requesterName || '—'}`, 14, 27);

  let y = 42;
  doc.setTextColor(0,0,0);

  const colW = 86;
  const leftX = 14, rightX = 14 + colW + 14;
  doc.setFillColor(245,247,250);
  doc.roundedRect(leftX, y-6, colW, 20, 2, 2, 'F');
  doc.roundedRect(rightX, y-6, colW, 20, 2, 2, 'F');
  doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(...gray);
  doc.text('FORNECEDOR (ORIGEM)', leftX + 4, y);
  doc.text('DESTINATÁRIO', rightX + 4, y);
  doc.setFontSize(12); doc.setFont('helvetica','bold'); doc.setTextColor(...blue);
  doc.text(order.fornecedorNome || order._fornecedorNomeEfetivo || '—', leftX + 4, y + 8);
  doc.text(order.house || '—', rightX + 4, y + 8);

  const midX = leftX + colW + 7;
  doc.setDrawColor(...blue); doc.setLineWidth(0.8);
  doc.line(midX - 4, y + 1, midX + 4, y + 1);
  doc.triangle(midX + 4, y - 1.5, midX + 4, y + 3.5, midX + 7, y + 1, 'F');

  y += 24;

  const cats = {};
  itensCompra.forEach(item => {
    if (!cats[item.catKey]) cats[item.catKey] = [];
    cats[item.catKey].push(item);
  });

  if (Object.keys(cats).length === 0) {
    doc.setFontSize(10); doc.setFont('helvetica','italic'); doc.setTextColor(...gray);
    doc.text('Nenhum item de compra encontrado (avaliação de estoque não realizada para este pedido).', 14, y);
    y += 10;
  }

  Object.entries(cats).forEach(([catKey, items]) => {
    const cat = CATEGORIAS[catKey];
    if (y > 250) { doc.addPage(); y = 20; }

    doc.setFillColor(...blue);
    doc.rect(12, y-5, 186, 9, 'F');
    doc.setTextColor(255,255,255);
    doc.setFontSize(10); doc.setFont('helvetica','bold');
    doc.text(`${cat?.nome || catKey}`, 16, y+1);
    y += 11;

    doc.setFillColor(230,238,248);
    doc.rect(12, y-4, 186, 8, 'F');
    doc.setTextColor(...gray);
    doc.setFontSize(8); doc.setFont('helvetica','bold');
    doc.text('PRODUTO', 16, y+1);
    doc.text('QUANTIDADE', 160, y+1);
    y += 8;

    items.forEach((i, idx) => {
      if (y > 270) { doc.addPage(); y = 20; }
      if (idx % 2 === 0) { doc.setFillColor(250,251,252); doc.rect(12, y-4, 186, 8, 'F'); }
      doc.setTextColor(0,0,0); doc.setFont('helvetica','normal'); doc.setFontSize(9);
      doc.text(i.prodNome, 16, y+1);
      doc.setFont('helvetica','bold'); doc.setTextColor(...blue);
      doc.text(`${i.qty} ${i.unidade}`, 160, y+1);
      y += 8;
    });
    y += 6;
  });

  if (y > 240) { doc.addPage(); y = 20; }
  y += 14;
  doc.setDrawColor(180,180,180); doc.setLineWidth(0.3);
  doc.line(14, y, 110, y);
  doc.setFontSize(8); doc.setTextColor(...gray); doc.setFont('helvetica','normal');
  doc.text('Assinatura de quem recebeu', 14, y + 5);

  y += 18;
  doc.setFontSize(10); doc.setTextColor(0,0,0); doc.setFont('helvetica','normal');
  doc.text('(   ) Coordenador(a)', 14, y);
  doc.text('(   ) Ponto de Luz', 84, y);
  doc.text('(   ) Acolhido(a)', 150, y);
}

async function exportarComprasSelecionadasPDF() {
  if (comprasSelecionadas.size === 0) { showToast('Selecione ao menos um pedido.'); return; }

  const selecionadas = (window._allOrdersCache || []).filter(o => comprasSelecionadas.has(o.id) && o._fornecedorNomeEfetivo && o._fornecedorNomeEfetivo.trim());
  if (selecionadas.length === 0) { showToast('Nenhum pedido selecionado tem fornecedor definido.'); return; }

  const btn = document.getElementById('btn-compras-export-pdf');
  if (btn) { btn.disabled = true; btn.textContent = 'Gerando PDF...'; }

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    let algumTemItens = false;

    selecionadas.forEach((o, i) => {
      const itensCompra = o.stockEval
        ? Object.values(o.stockEval)
            .filter(ev => !ev.transfer || ev.qty <= 0)
            .map(ev => {
              const cat = CATEGORIAS[ev.catKey];
              const p = cat?.produtos.find(x => x.id === ev.prodId);
              if (!p) return null;
              return { catKey: ev.catKey, prodNome: p.nome, unidade: p.unidade, qty: ev.needed };
            })
            .filter(Boolean)
        : [];
      if (itensCompra.length > 0) algumTemItens = true;
      if (i > 0) doc.addPage();
      desenharCompraNoPDF(doc, o, itensCompra);
    });

    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8); doc.setTextColor(150,150,150);
      doc.text(`Suprimentos Obra Lumen — Página ${i} de ${pageCount}`, 14, doc.internal.pageSize.height - 8);
      doc.text(new Date().toLocaleString('pt-BR'), 140, doc.internal.pageSize.height - 8);
    }

    // Nome do arquivo: COMP-DATA-CASA(S)-CATEGORIA(S), mesmo esquema de dedupe/teto usado nas transferências
    const sanitizarNomeArquivo = s => (s || '').toString().replace(/[\/\\:*?"<>|]/g, '').replace(/\s+/g, '_').trim();
    const agora = new Date();
    const dataExport = agora.toISOString().slice(0,10).replace(/-/g,'');
    const MAX_CASAS_NO_NOME = 3;
    const casasUnicas = [...new Set(selecionadas.map(o => o.house).filter(Boolean))];
    const casaNome = casasUnicas.length <= MAX_CASAS_NO_NOME
      ? casasUnicas.join('-')
      : `${casasUnicas.slice(0, MAX_CASAS_NO_NOME).join('-')}-e-mais-${casasUnicas.length - MAX_CASAS_NO_NOME}casas`;

    const catsPorPedido = selecionadas.map(o => (o.categories || []).map(k => CATEGORIAS[k]?.nome || k).slice().sort().join(','));
    const catsIguais = catsPorPedido.every(c => c === catsPorPedido[0]);
    const categoriaStr = catsIguais && catsPorPedido[0] ? catsPorPedido[0].replace(/,/g,'-') : 'Diversas-Categorias';

    const nomeArquivo = `COMP-${dataExport}-${sanitizarNomeArquivo(casaNome)}-${sanitizarNomeArquivo(categoriaStr)}.pdf`;
    doc.save(nomeArquivo);

    showToast(algumTemItens
      ? `✅ PDF gerado com ${selecionadas.length} pedido(s) de compra.`
      : '⚠️ PDF gerado, mas nenhum item de compra foi encontrado (avaliação de estoque pendente nesses pedidos?).');
  } catch(e) {
    console.error(e);
    showToast('Erro ao gerar PDF: ' + e.message);
  }

  updateComprasExportBtn();
}

// ── BACKFILL: corrige pedidos com cotação aprovada mas fornecedorNome vazio ──
// Isso NÃO relança nada no financeiro (compras_financeiro, boletoVencimento) —
// só grava fornecedorNome/fornecedorId/cotacaoFornecedor/cotacaoValor no pedido,
// que é exatamente o campo que ficou órfão pelo bug de sincronização.
// Rode window.backfillFornecedorNomeOrfaos() no console (modo dry-run por padrão,
// só lista o que seria corrigido). Rode window.backfillFornecedorNomeOrfaos(true)
// pra aplicar de verdade, depois de revisar a lista impressa.
window.backfillFornecedorNomeOrfaos = async function(aplicar = false) {
  console.log(`Iniciando checagem (${aplicar ? 'MODO APLICAR' : 'MODO DRY-RUN — nada será gravado'})...`);

  const qSnap = await db.collection('quotations').where('status', '==', 'aprovado').get();
  const cotacaoPorPedido = {};
  qSnap.docs.forEach(qd => {
    const q = qd.data();
    if (!q.orderId) return;
    const atual = cotacaoPorPedido[q.orderId];
    if (!atual || (q.createdAt?.seconds || 0) > (atual.createdAt?.seconds || 0)) {
      cotacaoPorPedido[q.orderId] = q;
    }
  });

  const orderIds = Object.keys(cotacaoPorPedido);
  const candidatos = [];
  for (const orderId of orderIds) {
    const orderSnap = await db.collection('orders').doc(orderId).get();
    if (!orderSnap.exists) continue;
    const o = orderSnap.data();
    if (o.fornecedorNome && o.fornecedorNome.trim()) continue; // já está ok, não mexe
    const cot = cotacaoPorPedido[orderId];
    candidatos.push({ orderId, code: o.code, house: o.house, status: o.status, fornecedorNome: cot.fornecedorNome, fornecedorId: cot.fornecedorId, valor: cot.valor });
  }

  if (candidatos.length === 0) {
    console.log('✅ Nenhum pedido órfão encontrado. Nada a corrigir.');
    return candidatos;
  }

  console.table(candidatos);
  console.log(`${candidatos.length} pedido(s) com cotação aprovada mas fornecedorNome vazio no documento do pedido.`);

  if (!aplicar) {
    console.log('Modo dry-run: nada foi gravado. Revise a lista acima e rode backfillFornecedorNomeOrfaos(true) para aplicar.');
    return candidatos;
  }

  const batch = db.batch();
  candidatos.forEach(c => {
    batch.update(db.collection('orders').doc(c.orderId), {
      fornecedorNome: c.fornecedorNome || '',
      fornecedorId: c.fornecedorId || '',
      cotacaoFornecedor: c.fornecedorNome || '',
      cotacaoValor: parseFloat(c.valor) || 0,
    });
  });
  await batch.commit();
  console.log(`✅ ${candidatos.length} pedido(s) corrigido(s). Lembre-se: isso NÃO cria lançamento em compras_financeiro — verifique manualmente se esses pedidos já têm registro financeiro antes de assumir que está tudo certo.`);
  return candidatos;
};

// ─────────────────────────────────────────────
// 📋  MY ORDERS
// ─────────────────────────────────────────────
async function loadMyOrders() {
  const tbody = document.getElementById('my-orders-tbody');
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;"><div class="loading-state"><div class="spinner spinner-dark"></div>Carregando...</div></td></tr>';

  const snap = await db.collection('orders')
    .where('requesterUid','==',currentUser.uid)
    .orderBy('createdAt','desc').get();

  if (snap.empty) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-muted" style="text-align:center;padding:24px;">Nenhum pedido realizado ainda.</td></tr>';
    return;
  }
  tbody.innerHTML = snap.docs.map(d => {
    const o = d.data();
    const itemCount = Object.values(o.items || {}).reduce((a,c) => a + Object.keys(c).length, 0);
    const status = o.status || 'aguardando_estoque';
    return `<tr>
      <td><span class="order-code">${o.code}</span></td>
      <td>${o.house}</td>
      <td>${formatCats(o.categories)}</td>
      <td>${itemCount} itens</td>
      <td>${getStatusBadge(status)}</td>
      <td>${formatDate(o.createdAt)}</td>
      <td><button class="btn btn-secondary btn-sm" onclick="showOrderDetail('${d.id}')">Ver</button></td>
    </tr>`;
  }).join('');
}

// ─────────────────────────────────────────────
// 🔍  ORDER DETAIL
// ─────────────────────────────────────────────
let currentDetailOrderId = null;

async function showOrderDetail(docId) {
  currentDetailOrderId = docId;
  document.getElementById('modal-order-detail-body').innerHTML = '<div class="loading-state"><div class="spinner spinner-dark"></div>Carregando...</div>';
  openModal('modal-order-detail');

  const snap = await db.collection('orders').doc(docId).get();
  if (!snap.exists) {
    closeModal('modal-order-detail');
    showToast('Pedido não encontrado.');
    return;
  }
  const o = snap.data();
  o.id = docId; // Firestore não inclui o id em .data() — guarda aqui pra evitar essa
                // mesma armadilha em código futuro que use detailOrderData.id
  detailOrderData = o;
  document.getElementById('modal-order-detail-title').textContent = o.code;

  // Build pipeline bar + order HTML
  // Se já foi avaliado pelo estoque, mostra só os itens a comprar no corpo do pedido
  const pipelineHTML = buildPipelineBar(o.status || 'aberto');
  let orderBodyItems = o.items;
  let purchaseNotice = '';

  if (o.stockEval) {
    // Reconstrói apenas os itens que vão para compra
    const purchaseMap = {};
    Object.values(o.stockEval).forEach(ev => {
      if (!ev.transfer || ev.qty <= 0) {
        if (!purchaseMap[ev.catKey]) purchaseMap[ev.catKey] = {};
        const buyQty = ev.needed - (ev.transfer ? (ev.qty||0) : 0);
        purchaseMap[ev.catKey][ev.prodId] = Math.max(1, buyQty || ev.needed);
      }
    });
    const hasAnyPurchase = Object.values(purchaseMap).some(c => Object.keys(c).length > 0);
    orderBodyItems = hasAnyPurchase ? purchaseMap : {};

    // Conta os itens transferidos
    const transfCount = Object.values(o.stockEval).filter(ev => ev.transfer && ev.qty > 0).length;
    if (transfCount > 0) {
      purchaseNotice = `<div class="info-box" style="margin-bottom:12px;background:var(--ok-bg);border-color:rgba(26,122,68,0.3);">
        ✅ <strong>${transfCount} item(s)</strong> já foram encaminhados para <strong>Transferência automática</strong> do estoque.
        O conteúdo abaixo mostra apenas os itens a <strong>comprar externamente</strong>.
      </div>`;
    }
  }

  document.getElementById('modal-order-detail-body').innerHTML = pipelineHTML + purchaseNotice + buildOrderHTML(o.house, orderBodyItems, true, o);

  // Show transfer/purchase summary if evaluated
  if (o.stockEval) {
    const evalDiv = buildStockEvalSummaryHTML(o.stockEval, o.items);
    document.getElementById('modal-order-detail-body').insertAdjacentHTML('beforeend', evalDiv);
  }

  // Set current status
  const sel = document.getElementById('order-status-select');
  if (sel) sel.value = o.status || 'aberto';

  // Preenche e pré-seleciona o select de Centro de Custo
  const ccSel = document.getElementById('order-detail-cc');
  if (ccSel) {
    ccSel.setAttribute('data-current', o.centroCustoId || '');
    await _ccPopularSelects();
    if (o.centroCustoId) ccSel.value = o.centroCustoId;
  }

  // Preenche e pré-seleciona o select de Categoria
  const catSel = document.getElementById('order-detail-cat');
  if (catSel) {
    catSel.setAttribute('data-current', o.categoriaId || '');
    await _cccatPopularSelects();
    if (o.categoriaId) catSel.value = o.categoriaId;
  }

  // Button visibility based on role
  const role = currentUserData?.role || 'usuario';
  const btnEval = document.getElementById('btn-eval-stock');
  const btnQuot = document.getElementById('btn-open-quotation');
  const btnNF   = document.getElementById('btn-attach-nf');
  if (btnEval) btnEval.style.display = ['admin','diretor','gerente','coordenador','estoque','compras'].includes(role) ? 'inline-flex' : 'none';
  if (btnQuot) btnQuot.style.display = ['admin','diretor','gerente','coordenador','compras'].includes(role) ? 'inline-flex' : 'none';
  if (btnNF)   btnNF.style.display   = ['admin','diretor','gerente','coordenador','compras'].includes(role) ? 'inline-flex' : 'none';
  if (sel)     sel.style.display     = ['admin','diretor','gerente','coordenador','compras','estoque'].includes(role) ? 'inline-flex' : 'none';

  // Show NF info if present
  if (o.nfNumero || o.nfFileURL || o.boletoFileURL || o.boletoVencimento) {
    const _esc = (s) => String(s || '').replace(/'/g, "\\'");
    const btnNFVer = o.nfFileURL
      ? `<button type="button" onclick="verArquivoPedido('${_esc(o.nfFileURL)}')" class="btn btn-secondary btn-sm">👁 Ver NF</button>`
      : '';
    const btnNFBaixar = o.nfFileURL
      ? `<button type="button" onclick="verArquivoPedido('${_esc(o.nfFileURL)}','${_esc(o.nfFileName||'nota-fiscal')}',true)" class="btn btn-outline btn-sm">⬇ Baixar</button>`
      : '';
    const btnBoletoVer = o.boletoFileURL
      ? `<button type="button" onclick="verArquivoPedido('${_esc(o.boletoFileURL)}')" class="btn btn-secondary btn-sm">👁 Ver Boleto</button>`
      : '';
    const btnBoletoBaixar = o.boletoFileURL
      ? `<button type="button" onclick="verArquivoPedido('${_esc(o.boletoFileURL)}','${_esc(o.boletoFileName||'boleto')}',true)" class="btn btn-outline btn-sm">⬇ Baixar</button>`
      : '';

    const attachInfo = `
      <div style="margin-top:16px;border:1px solid var(--border);border-radius:12px;overflow:hidden;">
        <div style="padding:10px 16px;background:var(--lumen-lt);border-bottom:1px solid var(--border);font-size:12px;font-weight:700;color:var(--lumen);text-transform:uppercase;letter-spacing:.5px;">
          📎 Documentos Anexados
        </div>
        ${o.nfNumero || o.nfFileURL ? `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border);flex-wrap:wrap;gap:8px;">
          <div>
            <div style="font-size:13px;font-weight:700;color:var(--text);">📄 Nota Fiscal</div>
            <div style="font-size:12px;color:var(--text-muted);">
              ${o.nfNumero ? `NF ${o.nfNumero}` : ''}
              ${o.nfValor ? ` — R$ ${parseFloat(o.nfValor).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : ''}
              ${o.nfFileName ? ` <span style="color:var(--lumen);">(${o.nfFileName})</span>` : ''}
              ${!o.nfFileURL && o.nfFileName ? ' <span style="color:var(--warn);font-size:11px;">⚠️ arquivo não enviado ao servidor</span>' : ''}
            </div>
          </div>
          <div style="display:flex;gap:6px;">
            ${btnNFVer}${btnNFBaixar}
          </div>
        </div>` : ''}
        ${o.boletoVencimento || o.boletoFileURL ? `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;flex-wrap:wrap;gap:8px;">
          <div>
            <div style="font-size:13px;font-weight:700;color:var(--text);">🗓 Boleto</div>
            <div style="font-size:12px;color:var(--text-muted);">
              ${o.boletoVencimento ? `Vencimento: <strong>${new Date(o.boletoVencimento+'T00:00:00').toLocaleDateString('pt-BR')}</strong>` : ''}
              ${o.boletoFileName ? ` <span style="color:var(--lumen);">(${o.boletoFileName})</span>` : ''}
              ${!o.boletoFileURL && o.boletoFileName ? ' <span style="color:var(--warn);font-size:11px;">⚠️ arquivo não enviado ao servidor</span>' : ''}
            </div>
          </div>
          <div style="display:flex;gap:6px;">
            ${btnBoletoVer}${btnBoletoBaixar}
          </div>
        </div>` : ''}
        ${o.fornecedorNome || o.attachObs ? `
        <div style="padding:8px 16px;background:var(--bg);font-size:12px;color:var(--text-muted);">
          ${o.fornecedorNome ? `🏪 ${o.fornecedorNome}` : ''}
          ${o.attachObs ? ` · 💬 ${o.attachObs}` : ''}
        </div>` : ''}
      </div>`;
    document.getElementById('modal-order-detail-body').insertAdjacentHTML('beforeend', attachInfo);
  }
}

async function updateOrderStatus() {
  if (!currentDetailOrderId) return;
  const status = document.getElementById('order-status-select').value;
  try {
    await db.collection('orders').doc(currentDetailOrderId).update({ status, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    showToast(`✅ Status atualizado: ${status}`);
    loadAllOrders();
  } catch(e) { showToast('Erro ao atualizar status: ' + e.message); }
}

// ─────────────────────────────────────────────
// 🏪  AVALIAÇÃO DE ESTOQUE
// ─────────────────────────────────────────────
let stockEvalData = {}; // { catKey__prodId: { transfer: bool, qty: number } }
let centralStockData = {}; // estoque central (casa = 'Central' ou todas somadas exceto a solicitante)

async function openStockEvalModal() {
  if (!detailOrderData) return;
  const role = currentUserData?.role || 'usuario';
  if (!['admin','diretor','gerente','coordenador','estoque','compras'].includes(role)) {
    showToast('⛔ Apenas Estoque, Compras ou Admin podem avaliar.');
    return;
  }

  stockEvalData = {};
  centralStockData = {};
  document.getElementById('modal-se-code').textContent = detailOrderData.code;
  document.getElementById('stock-eval-body').innerHTML = '<div class="loading-state"><div class="spinner spinner-dark"></div>Carregando estoque central...</div>';
  document.getElementById('btn-export-transfer-pdf').style.display = 'none';
  document.getElementById('btn-export-purchase-pdf').style.display = 'none';
  openModal('modal-stock-eval');

  // Se já tem avaliação salva, pré-carregar
  const existingEval = detailOrderData.stockEval || null;

  // Carregar estoque central: soma de todos os movimentos de casas "Central" ou casas diferentes da solicitante
  // Aqui pegamos todos os movimentos e calculamos o saldo por produto (independente de casa, como estoque geral disponível)
  // Usa svCarregarMovements() (07-estoque-ia-form.js) em vez de db.collection('movements').get():
  // o select=*,movement_items(*) embutido trava com "statement timeout" no Supabase quando a
  // tabela cresce (mesmo problema já corrigido na tela Estoque Atual — ver PR #44/#45). Sem essa
  // troca, o erro era engolido pelo catch abaixo e TODO item aparecia com estoque 0.0, mesmo
  // tendo saldo real, fazendo a caixinha de transferência ficar sempre desabilitada.
  try {
    const movSnap = await svCarregarMovements();
    movSnap.docs.forEach(d => {
      const m = d.data();
      // Considera estoque central = tudo exceto a casa que está solicitando
      if (m.house === detailOrderData.house) return;
      (m.items || []).forEach(item => {
        const key = `${item.catKey}__${item.prodId}`;
        if (!centralStockData[key]) centralStockData[key] = 0;
        if (m.type === 'entrada') centralStockData[key] += (item.qty || 0);
        else centralStockData[key] -= (item.qty || 0);
      });
    });
  } catch(e) { console.warn('Erro ao carregar estoque central:', e); }

  renderStockEvalBody(existingEval);
}

function renderStockEvalBody(existingEval) {
  const items = detailOrderData.items || {};
  let totalItems = 0;
  Object.values(items).forEach(c => { totalItems += Object.keys(c).length; });

  if (totalItems === 0) {
    document.getElementById('stock-eval-body').innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-title">Nenhum item nesta solicitação</div></div>';
    return;
  }

  // Escapa pra uso seguro dentro de atributo HTML (data-catkey/data-prodid) —
  // catKey/prodId vêm do cadastro de produtos (categorias.key / produtos.id) e
  // podiam conter aspas ou outros caracteres que quebravam o onchange="...('${..}')"
  // antigo: o checkbox ficava com aparência normal mas o clique não disparava
  // nada, porque o atributo virava JS inválido.
  const escAttr = s => String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

  let html = '';
  let rowIdx = 0;
  Object.entries(items).forEach(([catKey, prods]) => {
    const keys = Object.keys(prods);
    if (!keys.length) return;
    const cat = CATEGORIAS[catKey];
    html += `<div class="stk-section-title">${cat.icon} ${cat.nome}</div>`;

    keys.forEach(prodId => {
      const p = cat.produtos.find(x => x.id === prodId);
      if (!p) return;
      const needed = parseFloat(prods[prodId]) || 0;
      const stockKey = `${catKey}__${prodId}`;
      const avail = Math.max(0, centralStockData[stockKey] || 0);
      const maxTransfer = Math.min(needed, avail);
      // "canTransfer" indicava estoque central > 0 e travava a caixinha quando
      // zerado. Quem avalia pode saber de estoque que o cálculo automático não
      // capturou (ex.: acabou de chegar), então a seleção fica sempre liberada
      // — avail continua exibido só como referência, não bloqueia mais nada.
      const hasStock = avail > 0;

      // Pre-fill from existing eval
      const prevEval = existingEval?.[stockKey];
      const isChecked = prevEval ? prevEval.transfer : hasStock;
      const prevQty = prevEval ? prevEval.qty : (hasStock ? maxTransfer : needed);

      const stockColor = avail <= 0 ? 'color:var(--danger);font-weight:700;' : avail < needed ? 'color:var(--warn);font-weight:600;' : 'color:var(--ok);';

      // id único por índice de renderização — evita colisão de ids que a
      // normalização antiga (regex sobre o id do produto) podia causar.
      const rid = rowIdx++;
      const dataAttrs = `data-catkey="${escAttr(catKey)}" data-prodid="${escAttr(prodId)}"`;

      html += `<div class="stk-eval-row ${isChecked ? 'transferable' : (hasStock ? '' : 'no-stock')}" id="se-row-${rid}">
        <input type="checkbox" class="stk-eval-check" id="se-chk-${rid}" ${dataAttrs}
          ${isChecked ? 'checked' : ''}
          onchange="onSeCheckChange(this)">
        <div class="stk-eval-name">${p.nome} <span style="font-size:11px;color:var(--text-muted);">${p.unidade}</span></div>
        <div class="stk-eval-stock" style="${stockColor}">Estq: ${avail.toFixed(1)}</div>
        <div class="stk-eval-needed" style="color:var(--text-muted);">Solicit: ${needed}</div>
        <input type="number" class="form-input stk-eval-qty" id="se-qty-${rid}" ${dataAttrs}
          min="0" max="${needed}" step="0.1" value="${prevQty.toFixed(1)}"
          onchange="onSeQtyChange(this)"
          onclick="event.stopPropagation()">
        ${!hasStock ? '<span class="purchase-tag">Comprar</span>' : ''}
        ${hasStock && avail < needed ? '<span style="font-size:10px;color:var(--warn);font-weight:600;">Parcial</span>' : ''}
      </div>`;

      // Initialize stockEvalData
      stockEvalData[stockKey] = {
        transfer: isChecked,
        qty: prevQty,
        needed,
        avail,
        catKey,
        prodId
      };
    });
  });

  document.getElementById('stock-eval-body').innerHTML = html;
  document.getElementById('stock-eval-summary-bar').style.display = 'flex';
  document.getElementById('btn-export-transfer-pdf').style.display = 'inline-flex';
  document.getElementById('btn-export-purchase-pdf').style.display = 'inline-flex';
  updateSeCounters();
}

function onSeCheckChange(chk) {
  const { catkey: catKey, prodid: prodId } = chk.dataset;
  const stockKey = `${catKey}__${prodId}`;
  const row = chk.closest('.stk-eval-row');
  if (!stockEvalData[stockKey]) return;
  stockEvalData[stockKey].transfer = chk.checked;
  if (chk.checked) row.classList.add('transferable');
  else row.classList.remove('transferable');
  updateSeCounters();
}

function onSeQtyChange(inp) {
  const { catkey: catKey, prodid: prodId } = inp.dataset;
  const stockKey = `${catKey}__${prodId}`;
  if (!stockEvalData[stockKey]) return;
  stockEvalData[stockKey].qty = parseFloat(inp.value) || 0;
  updateSeCounters();
}

function updateSeCounters() {
  let transfer = 0, purchase = 0;
  const total = Object.keys(stockEvalData).length;
  Object.values(stockEvalData).forEach(ev => {
    if (ev.transfer && ev.qty > 0) transfer++;
    else purchase++;
  });
  document.getElementById('se-count-transfer').textContent = transfer;
  document.getElementById('se-count-purchase').textContent = purchase;
  document.getElementById('se-count-total').textContent = total;
}

async function saveStockEval() {
  if (!currentDetailOrderId) return;
  setBtnLoading('btn-save-stock-eval', true);
  try {
    const evalToSave = {};
    Object.entries(stockEvalData).forEach(([key, ev]) => {
      evalToSave[key] = { transfer: ev.transfer, qty: ev.qty, needed: ev.needed, avail: ev.avail, catKey: ev.catKey, prodId: ev.prodId };
    });

    const transferItems = Object.values(evalToSave).filter(ev => ev.transfer && ev.qty > 0);
    const purchaseItems = Object.values(evalToSave).filter(ev => !ev.transfer || ev.qty <= 0);
    const casaEstoque   = document.getElementById('se-estoque-select')?.value || 'Estoque';

    // Sempre avança para "andamento" — compras cotará só o que não foi transferido
    const newStatus = 'andamento';

    // Mapa dos itens a comprar
    const purchaseItemsMap = {};
    purchaseItems.forEach(ev => {
      if (!purchaseItemsMap[ev.catKey]) purchaseItemsMap[ev.catKey] = {};
      purchaseItemsMap[ev.catKey][ev.prodId] = ev.needed;
    });

    const o = detailOrderData;

    // ── 1. Salva avaliação no pedido ────────────────────────
    await db.collection('orders').doc(currentDetailOrderId).update({
      stockEval: evalToSave,
      stockEvalBy: currentUserData.name,
      stockEvalEstoque: casaEstoque,
      stockEvalAt: firebase.firestore.FieldValue.serverTimestamp(),
      purchaseItems: purchaseItemsMap,
      status: newStatus,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // ── 2. Gera transferência AUTOMÁTICA (sem trabalho extra) ─
    if (transferItems.length > 0) {
      const transfItemsFormatted = transferItems.map(ev => {
        const cat = CATEGORIAS[ev.catKey];
        const p = cat?.produtos.find(x => x.id === ev.prodId);
        return {
          catKey: ev.catKey,
          prodId: ev.prodId,
          prodNome: p?.nome || ev.prodId,
          unidade: p?.unidade || '',
          qty: ev.qty
        };
      });

      const transfCode = 'OB-TRF-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' + Math.random().toString(36).slice(2,6).toUpperCase();
      await db.collection('transferencias').add({
        code: transfCode,
        orderId: currentDetailOrderId,
        orderCode: o.code,
        origem: casaEstoque,
        destino: o.house,
        items: transfItemsFormatted,
        status: 'confirmada',   // já confirmada automaticamente
        geradaAutomaticamente: true,
        criadaPor: currentUserData.name,
        data: new Date().toISOString().slice(0, 10),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      const msg = purchaseItems.length > 0
        ? `✅ Transferência ${transfCode} gerada automaticamente! ${purchaseItems.length} item(s) encaminhado(s) para Compras.`
        : `✅ Transferência ${transfCode} gerada! Todos os itens serão transferidos do estoque.`;
      showToast(msg);
    } else {
      showToast(`✅ Avaliação salva! ${purchaseItems.length} item(s) encaminhado(s) para Compras.`);
    }

    detailOrderData = { ...detailOrderData, stockEval: evalToSave, purchaseItems: purchaseItemsMap, stockEvalEstoque: casaEstoque, status: newStatus };
    closeModal('modal-stock-eval');
    showOrderDetail(currentDetailOrderId);
    loadAllOrders();
  } catch(e) {
    showToast('Erro ao salvar: ' + e.message);
    console.error(e);
  }
  setBtnLoading('btn-save-stock-eval', false);
}

function buildStockEvalSummaryHTML(evalData, orderItems) {
  const transferItems = [], purchaseItems = [];
  Object.entries(evalData).forEach(([key, ev]) => {
    const cat = CATEGORIAS[ev.catKey];
    const p = cat?.produtos.find(x => x.id === ev.prodId);
    if (!p) return;
    const entry = { nome: p.nome, unidade: p.unidade, needed: ev.needed, qty: ev.qty, cat: cat.nome };
    if (ev.transfer && ev.qty > 0) transferItems.push(entry);
    else purchaseItems.push(entry);
  });

  let html = `<div style="margin-top:20px;">
    <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:12px;">📊 Resultado da Avaliação de Estoque</div>`;

  if (transferItems.length) {
    html += `<div style="background:var(--ok-bg);border:1px solid rgba(26,122,68,0.2);border-radius:10px;padding:12px;margin-bottom:12px;">
      <div style="font-size:12px;font-weight:700;color:var(--ok);margin-bottom:8px;">📦 Itens para TRANSFERÊNCIA (${transferItems.length})</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <tr style="border-bottom:1px solid rgba(26,122,68,0.2);"><th style="text-align:left;padding:4px 6px;color:var(--ok);">Produto</th><th style="text-align:right;padding:4px 6px;color:var(--ok);">Qtd Transferir</th><th style="text-align:right;padding:4px 6px;color:var(--ok);">Solicitado</th></tr>
        ${transferItems.map(i => `<tr><td style="padding:5px 6px;">${i.nome} <span style="color:var(--text-muted);font-size:10px;">${i.unidade}</span></td><td style="text-align:right;padding:5px 6px;font-weight:700;color:var(--ok);">${i.qty}</td><td style="text-align:right;padding:5px 6px;color:var(--text-muted);">${i.needed}</td></tr>`).join('')}
      </table>
    </div>`;
  }

  if (purchaseItems.length) {
    html += `<div style="background:var(--danger-bg);border:1px solid rgba(192,57,43,0.2);border-radius:10px;padding:12px;">
      <div style="font-size:12px;font-weight:700;color:var(--danger);margin-bottom:8px;">🛒 Itens para COMPRA (${purchaseItems.length})</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <tr style="border-bottom:1px solid rgba(192,57,43,0.2);"><th style="text-align:left;padding:4px 6px;color:var(--danger);">Produto</th><th style="text-align:right;padding:4px 6px;color:var(--danger);">Qtd Necessária</th></tr>
        ${purchaseItems.map(i => `<tr><td style="padding:5px 6px;">${i.nome} <span style="color:var(--text-muted);font-size:10px;">${i.unidade}</span></td><td style="text-align:right;padding:5px 6px;font-weight:700;color:var(--danger);">${i.needed}</td></tr>`).join('')}
      </table>
    </div>`;
  }

  html += `</div>`;
  return html;
}

function exportTransferPDF() {
  const transferItems = Object.values(stockEvalData).filter(ev => ev.transfer && ev.qty > 0);
  if (!transferItems.length) { showToast('Nenhum item marcado para transferência!'); return; }
  makeTransferPDF(detailOrderData, transferItems, stockEvalData);
}

function exportTransferPDFFromView() {
  if (!detailOrderData?.stockEval) return;
  const items = Object.values(detailOrderData.stockEval).filter(ev => ev.transfer && ev.qty > 0);
  makeTransferPDF(detailOrderData, items, detailOrderData.stockEval);
}

function makeTransferPDF(order, transferItems, evalData) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const green = [26, 122, 68]; const gray = [107, 114, 128]; const blue = [0,56,117];

  doc.setFillColor(...green);
  doc.rect(0, 0, 210, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15); doc.setFont('helvetica', 'bold');
  doc.text('Obra Lumen — Pedido de Transferência de Estoque', 14, 13);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(`Ref. Pedido: ${order.code}   |   Casa Destino: ${order.house}   |   Data: ${new Date().toLocaleDateString('pt-BR')}`, 14, 22);
  if (order.stockEvalBy) doc.text(`Avaliado por: ${order.stockEvalBy}`, 14, 29);

  let y = 44;
  doc.setFillColor(230, 245, 236);
  doc.rect(12, y-5, 186, 10, 'F');
  doc.setTextColor(...green); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
  doc.text('PRODUTO', 16, y+2);
  doc.text('QTD TRANSFERIR', 120, y+2);
  doc.text('SOLICITADO', 158, y+2);
  doc.text('UNIDADE', 185, y+2);
  y += 12;

  // Group by cat
  const byCat = {};
  transferItems.forEach(ev => {
    if (!byCat[ev.catKey]) byCat[ev.catKey] = [];
    byCat[ev.catKey].push(ev);
  });

  Object.entries(byCat).forEach(([catKey, evs]) => {
    if (y > 240) { doc.addPage(); y = 20; }
    const cat = CATEGORIAS[catKey];
    doc.setFillColor(...blue);
    doc.rect(12, y-5, 186, 9, 'F');
    doc.setTextColor(255,255,255); doc.setFontSize(9); doc.setFont('helvetica','bold');
    doc.text(`${cat.nome}`, 16, y+1);
    y += 12;

    evs.forEach((ev, idx) => {
      if (y > 265) { doc.addPage(); y = 20; }
      const p = cat.produtos.find(x => x.id === ev.prodId);
      if (!p) return;
      if (idx % 2 === 0) { doc.setFillColor(245, 251, 247); doc.rect(12, y-4, 186, 8, 'F'); }
      doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      doc.text(p.nome, 16, y+1);
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...green);
      doc.text(String(ev.qty), 130, y+1);
      doc.setTextColor(...gray); doc.setFont('helvetica', 'normal');
      doc.text(String(ev.needed), 165, y+1);
      doc.text(p.unidade, 185, y+1);
      y += 8;
    });
    y += 4;
  });

  doc.setTextColor(...gray); doc.setFontSize(7);
  doc.text('Gerado pelo Sistema Suprimentos Obra Lumen — lumenserfeliz.org', 14, 290);
  doc.save(`LM-Transferencia-${order.house.replace(/\s/g,'-')}-${new Date().toISOString().slice(0,10)}.pdf`);
  showToast('✅ PDF de Transferência gerado!');
}

function exportPurchaseOnlyPDF() {
  const purchaseItems = Object.values(stockEvalData).filter(ev => !ev.transfer || ev.qty <= 0);
  if (!purchaseItems.length) { showToast('Nenhum item para compra!'); return; }
  makePurchasePDF(detailOrderData, purchaseItems);
}

function exportPurchaseOnlyPDFFromView() {
  if (!detailOrderData?.stockEval) return;
  const items = Object.values(detailOrderData.stockEval).filter(ev => !ev.transfer || ev.qty <= 0);
  makePurchasePDF(detailOrderData, items);
}

function makePurchasePDF(order, purchaseItems) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const red = [192, 57, 43]; const gray = [107, 114, 128]; const blue = [0,56,117];

  doc.setFillColor(...red);
  doc.rect(0, 0, 210, 32, 'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(15); doc.setFont('helvetica', 'bold');
  doc.text('Obra Lumen — Itens para Compra', 14, 13);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(`Ref. Pedido: ${order.code}   |   Casa: ${order.house}   |   Data: ${new Date().toLocaleDateString('pt-BR')}`, 14, 22);
  doc.text('Estes itens NÃO estão disponíveis no estoque central e devem ser adquiridos.', 14, 29);

  let y = 44;
  doc.setFillColor(253, 237, 236);
  doc.rect(12, y-5, 186, 10, 'F');
  doc.setTextColor(...red); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
  doc.text('PRODUTO', 16, y+2);
  doc.text('QUANTIDADE NECESSÁRIA', 120, y+2);
  doc.text('UNIDADE', 185, y+2);
  y += 12;

  const byCat = {};
  purchaseItems.forEach(ev => {
    if (!byCat[ev.catKey]) byCat[ev.catKey] = [];
    byCat[ev.catKey].push(ev);
  });

  Object.entries(byCat).forEach(([catKey, evs]) => {
    if (y > 240) { doc.addPage(); y = 20; }
    const cat = CATEGORIAS[catKey];
    doc.setFillColor(...blue);
    doc.rect(12, y-5, 186, 9, 'F');
    doc.setTextColor(255,255,255); doc.setFontSize(9); doc.setFont('helvetica','bold');
    doc.text(`${cat.nome}`, 16, y+1);
    y += 12;

    evs.forEach((ev, idx) => {
      if (y > 265) { doc.addPage(); y = 20; }
      const p = cat.produtos.find(x => x.id === ev.prodId);
      if (!p) return;
      if (idx % 2 === 0) { doc.setFillColor(255, 250, 250); doc.rect(12, y-4, 186, 8, 'F'); }
      doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      doc.text(p.nome, 16, y+1);
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...red);
      doc.text(String(ev.needed), 135, y+1);
      doc.setTextColor(...gray); doc.setFont('helvetica', 'normal');
      doc.text(p.unidade, 185, y+1);
      y += 8;
    });
    y += 4;
  });

  doc.setTextColor(...gray); doc.setFontSize(7);
  doc.text('Gerado pelo Sistema Suprimentos Obra Lumen — lumenserfeliz.org', 14, 290);

  // Nome: LM-Compras-[Casa]-[Categoria do Pedido]-[Data]-[Código].pdf
  const normalizeStr = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'');
  const housePart = normalizeStr(order.house);
  const orderCats = (order.categories || []);
  const catsPart  = orderCats.length > 0 ? orderCats.map(k => normalizeStr(CATEGORIAS[k]?.nome || k)).join('-') : '';
  const datePart  = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const rawCode   = order.code || '';
  const codePart  = rawCode.match(/(\d+)$/) ? rawCode.match(/(\d+)$/)[1].padStart(3,'0') : normalizeStr(rawCode);
  const parts = ['LM-Compras', housePart, catsPart, datePart, codePart].filter(Boolean);
  doc.save(parts.join('-') + '.pdf');
  showToast('✅ PDF de Compras gerado!');
}

let currentQuotationOrderId = null;

function openQuotationModal() {
  currentQuotationOrderId = currentDetailOrderId;
  const code = detailOrderData?.code || '';
  document.getElementById('modal-quot-title').textContent = `Orçamentos — ${code}`;
  // Populate supplier select
  populateSupplierSelect('quot-supplier');
  loadQuotations(currentQuotationOrderId);
  openModal('modal-quotation');
}

async function loadQuotations(orderId) {
  const listEl = document.getElementById('quotation-list');
  if (!orderId) return;
  const snap = await db.collection('quotations').where('orderId','==',orderId).orderBy('valor','asc').get();
  if (snap.empty) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">💰</div><div class="empty-state-title">Nenhuma cotação cadastrada</div></div>';
    return;
  }
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const minVal = Math.min(...docs.map(d => d.valor));
  listEl.innerHTML = docs.map((q, i) => {
    const isBest = q.valor === minVal;
    const statusMap = { pendente: 'badge-gray', aprovado: 'badge-ok', recusado: 'badge-danger' };
    return `<div class="quot-row ${isBest ? 'best' : ''}">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <div>
          <div class="quot-supplier-name">${q.fornecedorNome || '—'}
            ${isBest ? '<span class="quot-badge-best">✓ Menor preço</span>' : ''}
          </div>
          <div class="text-sm text-muted">${q.obs || ''} ${q.validade ? '| Validade: '+q.validade : ''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
          <div class="quot-value">R$ ${parseFloat(q.valor).toFixed(2)}</div>
          <span class="badge ${statusMap[q.status] || 'badge-gray'}">${q.status}</span>
          <button class="btn btn-danger btn-sm" onclick="deleteQuotation('${q.id}')">✕</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function saveQuotation() {
  const orderId = currentQuotationOrderId;
  if (!orderId) return;
  const supSel = document.getElementById('quot-supplier');
  const fornecedorId   = supSel.value;
  const fornecedorNome = supSel.options[supSel.selectedIndex]?.text || '';
  const valor          = parseFloat(document.getElementById('quot-valor').value);
  const status         = document.getElementById('quot-status').value;
  const validade       = document.getElementById('quot-validade').value;
  const obs            = document.getElementById('quot-obs').value;
  if (!fornecedorId || !valor) { showToast('Selecione o fornecedor e informe o valor!'); return; }
  await db.collection('quotations').add({
    orderId, fornecedorId, fornecedorNome, valor, status, validade, obs,
    createdBy: currentUserData.name,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  document.getElementById('quot-valor').value = '';
  document.getElementById('quot-obs').value = '';
  showToast('✅ Cotação adicionada!');
  loadQuotations(orderId);
}

async function deleteQuotation(qId) {
  if (!confirm('Remover esta cotação?')) return;
  await db.collection('quotations').doc(qId).delete();
  loadQuotations(currentQuotationOrderId);
}

// Attach NF/Boleto
function openAttachModal() {
  populateSupplierSelect('attach-supplier');
  document.getElementById('attach-nf-num').value        = detailOrderData?.nfNumero || '';
  document.getElementById('attach-nf-valor').value      = detailOrderData?.nfValor  || '';
  document.getElementById('attach-boleto-venc').value   = detailOrderData?.boletoVencimento || '';
  document.getElementById('attach-obs').value           = detailOrderData?.attachObs || '';

  // Mostra arquivos já anexados
  const nfExisting     = document.getElementById('attach-nf-existing');
  const boletoExisting = document.getElementById('attach-boleto-existing');

  if (detailOrderData?.nfFileURL) {
    nfExisting.style.display = 'flex';
    document.getElementById('attach-nf-existing-name').textContent  = detailOrderData.nfFileName || 'nota-fiscal';
    { const _l = document.getElementById('attach-nf-existing-link'); const _p = detailOrderData.nfFileURL;
      _l.href = '#'; _l.onclick = (e) => { e.preventDefault(); verArquivoPedido(_p); }; }
    document.getElementById('attach-nf-label').textContent = 'Substituir arquivo';
  } else {
    nfExisting.style.display = 'none';
    document.getElementById('attach-nf-label').textContent = 'Clique para selecionar';
  }

  if (detailOrderData?.boletoFileURL) {
    boletoExisting.style.display = 'flex';
    document.getElementById('attach-boleto-existing-name').textContent = detailOrderData.boletoFileName || 'boleto';
    { const _l = document.getElementById('attach-boleto-existing-link'); const _p = detailOrderData.boletoFileURL;
      _l.href = '#'; _l.onclick = (e) => { e.preventDefault(); verArquivoPedido(_p); }; }
    document.getElementById('attach-boleto-label').textContent = 'Substituir arquivo';
  } else {
    boletoExisting.style.display = 'none';
    document.getElementById('attach-boleto-label').textContent = 'Clique para selecionar';
  }

  // Restaura fornecedor salvo
  const fornId = detailOrderData?.fornecedorId || '';
  if (fornId) {
    setTimeout(() => {
      const sel = document.getElementById('attach-supplier');
      if (sel) sel.value = fornId;
    }, 200);
  }
  openModal('modal-attach');
}

function onAttachFileChange(type) {
  const file = document.getElementById(`attach-${type}-file`).files[0];
  const area = document.getElementById(`attach-${type}-area`);
  const nameEl = document.getElementById(`attach-${type}-filename`);
  if (file) {
    area.classList.add('has-file');
    nameEl.textContent = file.name;
  } else {
    area.classList.remove('has-file');
    nameEl.textContent = '';
  }
}

async function saveAttachment() {
  if (!currentDetailOrderId) return;
  const orderId = currentDetailOrderId; // captura já aqui: currentDetailOrderId pode mudar
                                         // (usuário abre outro pedido) enquanto o upload roda
  setBtnLoading('btn-save-attach', true);
  const nfNumero   = document.getElementById('attach-nf-num').value.trim();
  const nfValor    = document.getElementById('attach-nf-valor').value;
  const boletoVenc = document.getElementById('attach-boleto-venc').value;
  const attachObs  = document.getElementById('attach-obs').value;
  const supSel         = document.getElementById('attach-supplier');
  const fornecedorId   = supSel.value || '';
  const fornecedorNome = fornecedorId
    ? (supSel.options[supSel.selectedIndex]?.text || '')
    : (detailOrderData?.fornecedorNome || '');

  const update = {
    nfNumero, nfValor: parseFloat(nfValor)||0,
    boletoVencimento: boletoVenc || null,
    fornecedorId, fornecedorNome, attachObs,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  // Upload de arquivos para Firebase Storage
  const nfFile     = document.getElementById('attach-nf-file').files[0];
  const boletoFile = document.getElementById('attach-boleto-file').files[0];

  try {
    const storage = firebase.storage();
    if (nfFile) {
      const nfRef = storage.ref(`pedidos/${orderId}/nf_${Date.now()}_${nfFile.name}`);
      const snap = await nfRef.put(nfFile);
      update.nfFileName = nfFile.name;
      update.nfFileURL  = await snap.ref.getDownloadURL();
    }
    if (boletoFile) {
      const bolRef = storage.ref(`pedidos/${orderId}/boleto_${Date.now()}_${boletoFile.name}`);
      const snap = await bolRef.put(boletoFile);
      update.boletoFileName = boletoFile.name;
      update.boletoFileURL  = await snap.ref.getDownloadURL();
    }
  } catch(storageErr) {
    console.warn('Storage upload error (saving metadata only):', storageErr);
    if (nfFile)     update.nfFileName     = nfFile.name;
    if (boletoFile) update.boletoFileName = boletoFile.name;
  }

  await db.collection('orders').doc(orderId).update(update);
  // Só sincroniza o painel/detalhe aberto se ainda for o mesmo pedido;
  // se o usuário já trocou de pedido, não mexe no que está na tela agora.
  if (currentDetailOrderId === orderId) {
    detailOrderData = { ...detailOrderData, ...update };
    showOrderDetail(orderId);
  }
  showToast('✅ Informações de NF/Boleto salvas com sucesso!');
  closeModal('modal-attach');
  loadAllOrders();
  setBtnLoading('btn-save-attach', false);
}

function buildOrderHTML(house, items, compact, orderMeta) {
  const date = new Date().toLocaleDateString('pt-BR');
  let html = `<div style="margin-bottom:16px;">
    <div style="font-size:13px;color:#6B7280;margin-bottom:4px;">Casa: <strong>${house}</strong></div>
    ${orderMeta ? `<div style="font-size:13px;color:#6B7280;">Código: <span style="font-family:monospace;font-weight:700;color:#003875;">${orderMeta.code}</span></div>` : ''}
    ${orderMeta ? `<div style="font-size:13px;color:#6B7280;">Solicitante: ${orderMeta.requesterName}</div>` : ''}
    ${orderMeta?.observations ? `<div style="font-size:13px;color:#6B7280;margin-top:4px;"><strong>Obs:</strong> ${orderMeta.observations}</div>` : ''}
  </div>`;

  Object.entries(items).forEach(([catKey, prods]) => {
    const keys = Object.keys(prods);
    if (keys.length === 0) return;
    const cat = CATEGORIAS[catKey];
    html += `<div style="margin-bottom:16px;">
      <div style="background:#E6EEF8;padding:8px 12px;border-radius:6px;font-weight:700;font-size:13px;color:#003875;margin-bottom:8px;">${cat.icon} ${cat.nome}</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr style="background:#f8f9fa;"><th style="padding:7px 10px;text-align:left;border-bottom:1px solid #e0e0e0;font-weight:600;font-size:11px;color:#6B7280;text-transform:uppercase;">Produto</th><th style="padding:7px 10px;text-align:right;border-bottom:1px solid #e0e0e0;font-weight:600;font-size:11px;color:#6B7280;text-transform:uppercase;">Qtd</th><th style="padding:7px 10px;text-align:left;border-bottom:1px solid #e0e0e0;font-weight:600;font-size:11px;color:#6B7280;text-transform:uppercase;">Unid.</th></tr>
        ${keys.map(prodId => {
          const p = cat.produtos.find(x => x.id === prodId);
          if (!p) return '';
          return `<tr><td style="padding:8px 10px;border-bottom:1px solid #eee;">${p.nome}</td><td style="padding:8px 10px;text-align:right;border-bottom:1px solid #eee;font-weight:700;color:#003875;">${prods[prodId]}</td><td style="padding:8px 10px;border-bottom:1px solid #eee;color:#6B7280;">${p.unidade}</td></tr>`;
        }).join('')}
      </table>
    </div>`;
  });
  return html;
}

// ─────────────────────────────────────────────
// 📄  PDF GENERATION
// ─────────────────────────────────────────────
function generatePDFFromDetail() {
  if (!detailOrderData) return;

  // Se já foi avaliado pelo estoque → PDF só com itens a comprar
  if (detailOrderData.stockEval) {
    // Prioridade 1: usar purchaseItems já calculados e salvos no Firestore
    // Prioridade 2: recalcular a partir do stockEval (fallback)
    let purchaseMap = detailOrderData.purchaseItems || null;

    if (!purchaseMap) {
      // Fallback: reconstruir a partir do stockEval
      const purchaseItems = Object.values(detailOrderData.stockEval)
        .filter(ev => !ev.transfer || ev.qty <= 0);
      purchaseMap = {};
      purchaseItems.forEach(ev => {
        if (!purchaseMap[ev.catKey]) purchaseMap[ev.catKey] = {};
        // Qtd a comprar = solicitado menos o que será transferido (nunca negativo)
        const buyQty = ev.needed - (ev.transfer ? (ev.qty || 0) : 0);
        purchaseMap[ev.catKey][ev.prodId] = Math.max(0, buyQty || ev.needed);
      });
    }

    // Verifica se há itens de compra
    const hasItems = Object.values(purchaseMap).some(cat => Object.keys(cat).length > 0);
    if (!hasItems) {
      showToast('✅ Todos os itens foram transferidos pelo estoque — nada a comprar!');
      return;
    }

    makePDF(detailOrderData.house, purchaseMap, detailOrderData, true);
  } else {
    makePDF(detailOrderData.house, detailOrderData.items, detailOrderData, false);
  }
}

function generatePDF() { makePDF(v('order-house'), orderItems, null, false); }

function makePDF(house, items, meta, isPurchaseOnly) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const blue = [0, 56, 117];
  const orange = [192, 57, 43];
  const headerColor = isPurchaseOnly ? orange : blue;
  const gray = [107, 114, 128];
  const dateStr = meta ? (meta.createdAt?.toDate ? meta.createdAt.toDate().toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR')) : new Date().toLocaleDateString('pt-BR');

  // Header
  doc.setFillColor(...headerColor);
  doc.rect(0, 0, 210, 34, 'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(15); doc.setFont('helvetica','bold');
  doc.text(isPurchaseOnly ? 'Obra Lumen — Itens para COMPRA' : 'Obra Lumen — Solicitação de Compras', 14, 13);
  doc.setFontSize(9); doc.setFont('helvetica','normal');
  doc.text(`Casa: ${house}   |   Data: ${dateStr}${meta ? `   |   Código: ${meta.code}` : ''}`, 14, 22);
  const endCasa = (typeof CASAS_ENDERECOS !== 'undefined' && CASAS_ENDERECOS[house]) || '';
  let yBase = 29;
  if (endCasa) {
    doc.text(`End.: ${endCasa}`, 14, 28);
    yBase = 34;
  }
  if (meta?.requesterName) { doc.text(`Solicitante: ${meta.requesterName}`, 14, yBase); yBase += 6; }
  if (isPurchaseOnly) {
    doc.setFontSize(8);
    doc.text('⚠ Itens não disponíveis no estoque — necessário adquirir externamente', 14, yBase);
    yBase += 6;
  }

  let y = yBase + 4;
  doc.setTextColor(0,0,0);

  Object.entries(items).forEach(([catKey, prods]) => {
    const keys = Object.keys(prods);
    if (keys.length === 0) return;
    const cat = CATEGORIAS[catKey];

    if (y > 240) { doc.addPage(); y = 20; }

    // Category header
    doc.setFillColor(...headerColor);
    doc.rect(12, y-5, 186, 10, 'F');
    doc.setTextColor(255,255,255);
    doc.setFontSize(10); doc.setFont('helvetica','bold');
    doc.text(`${cat.nome}`, 16, y+2);
    y += 12;

    // Table header
    doc.setFillColor(isPurchaseOnly ? 253 : 230, isPurchaseOnly ? 237 : 238, isPurchaseOnly ? 236 : 248);
    doc.rect(12, y-4, 186, 8, 'F');
    doc.setTextColor(...gray);
    doc.setFontSize(8); doc.setFont('helvetica','bold');
    doc.text('PRODUTO', 16, y+1);
    doc.text('QTD A COMPRAR', 140, y+1);
    doc.text('UNIDADE', 176, y+1);
    y += 8;

    keys.forEach((prodId, idx) => {
      if (y > 265) { doc.addPage(); y = 20; }
      const p = cat.produtos.find(x => x.id === prodId);
      if (!p) return;
      if (idx % 2 === 0) { doc.setFillColor(250,251,252); doc.rect(12, y-4, 186, 8, 'F'); }
      doc.setTextColor(0,0,0); doc.setFont('helvetica','normal'); doc.setFontSize(9);
      doc.text(p.nome, 16, y+1);
      doc.setFont('helvetica','bold');
      doc.setTextColor(...(isPurchaseOnly ? orange : blue));
      doc.text(String(prods[prodId]), 158, y+1, { align: 'right' });
      doc.setFont('helvetica','normal'); doc.setTextColor(...gray);
      doc.text(p.unidade, 176, y+1);
      y += 8;
    });
    y += 8;
  });

  // Footer
  const label = isPurchaseOnly ? 'Documento de COMPRA — apenas itens não cobertos pelo estoque' : 'Gerado pelo Sistema Suprimentos Obra Lumen — lumenserfeliz.org';
  doc.setTextColor(...gray); doc.setFontSize(8);
  doc.text(label, 14, 285);
  doc.text('lumenserfeliz.org', 14, 290);

  const prefix = isPurchaseOnly ? 'LM-COMPRA' : 'LM-Pedido';
  const normalize = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'');
  const housePart = normalize(house);
  const orderCats = (meta?.categories || []);
  const catsPart  = orderCats.length > 0 ? orderCats.map(k => normalize(CATEGORIAS[k]?.nome || k)).join('-') : '';
  const datePart  = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const rawCode   = meta?.code || '';
  const codePart  = rawCode.match(/(\d+)$/) ? rawCode.match(/(\d+)$/)[1].padStart(3,'0') : normalize(rawCode);
  const fileParts = [prefix, housePart, catsPart, datePart, codePart].filter(Boolean);
  doc.save(fileParts.join('-') + '.pdf');
}

// ─────────────────────────────────────────────
// 📧  EMAIL SENDING (via Vercel Function + Resend)
// ─────────────────────────────────────────────
async function sendOrderEmail(orderData, recipient) {
  let summary = '';
  Object.entries(orderData.items).forEach(([catKey, prods]) => {
    const keys = Object.keys(prods);
    if (keys.length === 0) return;
    const cat = CATEGORIAS[catKey];
    summary += `\n--- ${cat.nome.toUpperCase()} ---\n`;
    keys.forEach(pid => {
      const p = cat.produtos.find(x => x.id === pid);
      if (p) summary += `  • ${p.nome}: ${prods[pid]} ${p.unidade}\n`;
    });
  });

  // Gera PDF em base64 para anexar
  let pdfBase64 = '';
  try {
    pdfBase64 = makePDFBase64(orderData.house, orderData.items, orderData);
  } catch(e) {
    console.warn('Erro ao gerar PDF:', e);
  }

  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_email:     recipient,
      to_name:      'Equipe Lumen',
      from_name:    'Sistema Suprimentos Obra Lumen',
      reply_to:     ADMIN_EMAIL,
      subject:      `📦 Pedido ${orderData.code} — ${orderData.house}`,
      message:      `Pedido: ${orderData.code}\nCasa: ${orderData.house}\nSolicitante: ${orderData.requesterName || '—'}\nData: ${new Date().toLocaleDateString('pt-BR')}\nCategorias: ${formatCats(orderData.categories)}\nPessoas: ${orderData.people || '—'}\n\nItens:\n${summary}\n\nObservações: ${orderData.observations || 'Nenhuma'}`,
    });
    showToast('✅ E-mail enviado com sucesso!');
  } catch(e) {
    console.warn('Erro ao enviar e-mail via EmailJS:', e);
    showToast(`⚠️ E-mail não enviado: ${e.message}`);
  }
}

async function sendAlertEmail(subject, body) {
  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_email:  ADMIN_EMAIL,
      to_name:   'Administrador',
      from_name: 'Sistema Lumen',
      reply_to:  ADMIN_EMAIL,
      subject:   subject,
      message:   body,
    });
  } catch(e) {
    console.warn('Erro ao enviar alerta:', e);
  }
}

// ─────────────────────────────────────────────
// 📄  PDF BASE64 (para anexar no email)
// ─────────────────────────────────────────────
function makePDFBase64(house, items, meta) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const blue   = [0, 56, 117];
  const orange = [192, 57, 43];
  const gray   = [107, 114, 128];
  const dateStr = meta
    ? (meta.createdAt?.toDate ? meta.createdAt.toDate().toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR'))
    : new Date().toLocaleDateString('pt-BR');

  // Se o pedido já foi avaliado, usa só os itens a comprar
  let renderItems = items;
  let isPurchaseOnly = false;
  if (meta?.stockEval) {
    isPurchaseOnly = true;
    // Prioridade: purchaseItems já salvo no Firestore; fallback: recalcular do stockEval
    if (meta.purchaseItems) {
      renderItems = meta.purchaseItems;
    } else {
      const map = {};
      Object.values(meta.stockEval)
        .filter(ev => !ev.transfer || ev.qty <= 0)
        .forEach(ev => {
          if (!map[ev.catKey]) map[ev.catKey] = {};
          const buyQty = ev.needed - (ev.transfer ? (ev.qty || 0) : 0);
          map[ev.catKey][ev.prodId] = Math.max(0, buyQty || ev.needed);
        });
      renderItems = map;
    }
  }

  const headerColor = isPurchaseOnly ? orange : blue;

  doc.setFillColor(...headerColor);
  doc.rect(0, 0, 210, isPurchaseOnly ? 38 : 32, 'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(16); doc.setFont('helvetica','bold');
  doc.text(isPurchaseOnly ? 'Obra Lumen — Itens para COMPRA' : 'Obra Lumen — Solicitação de Compras', 14, 14);
  doc.setFontSize(9); doc.setFont('helvetica','normal');
  doc.text(`Casa: ${house}   |   Data: ${dateStr}${meta ? `   |   Código: ${meta.code}` : ''}`, 14, 24);
  if (meta?.requesterName) doc.text(`Solicitante: ${meta.requesterName}`, 14, 30);
  if (isPurchaseOnly) { doc.setFontSize(8); doc.text('Itens nao disponiveis no estoque - necessario adquirir externamente', 14, 36); }

  let y = isPurchaseOnly ? 50 : 44;
  doc.setTextColor(0,0,0);

  Object.entries(renderItems).forEach(([catKey, prods]) => {
    const keys = Object.keys(prods).filter(pid => prods[pid] > 0);
    if (keys.length === 0) return;
    const cat = CATEGORIAS[catKey];

    if (y > 240) { doc.addPage(); y = 20; }

    doc.setFillColor(...headerColor);
    doc.rect(12, y-5, 186, 10, 'F');
    doc.setTextColor(255,255,255);
    doc.setFontSize(10); doc.setFont('helvetica','bold');
    doc.text(`${cat.nome}`, 16, y+2);
    y += 12;

    doc.setFillColor(isPurchaseOnly ? 253 : 230, isPurchaseOnly ? 237 : 238, isPurchaseOnly ? 236 : 248);
    doc.rect(12, y-4, 186, 8, 'F');
    doc.setTextColor(...gray);
    doc.setFontSize(8); doc.setFont('helvetica','bold');
    doc.text('PRODUTO', 16, y+1);
    doc.text(isPurchaseOnly ? 'QTD A COMPRAR' : 'QTD', 140, y+1);
    doc.text('UNIDADE', 168, y+1);
    y += 8;

    keys.forEach((prodId, idx) => {
      if (y > 265) { doc.addPage(); y = 20; }
      const p = cat.produtos.find(x => x.id === prodId);
      if (!p) return;
      if (idx % 2 === 0) { doc.setFillColor(250,251,252); doc.rect(12, y-4, 186, 8, 'F'); }
      doc.setTextColor(0,0,0); doc.setFont('helvetica','normal'); doc.setFontSize(9);
      doc.text(p.nome, 16, y+1);
      doc.setFont('helvetica','bold'); doc.setTextColor(...(isPurchaseOnly ? orange : blue));
      doc.text(String(prods[prodId]), isPurchaseOnly ? 158 : 150, y+1, isPurchaseOnly ? { align: 'right' } : {});
      doc.setFont('helvetica','normal'); doc.setTextColor(...gray);
      doc.text(p.unidade, 168, y+1);
      y += 8;
    });
    y += 8;
  });

  const label = isPurchaseOnly
    ? 'Documento de COMPRA — apenas itens nao cobertos pelo estoque | lumenserfeliz.org'
    : 'Gerado pelo Sistema Suprimentos Obra Lumen — lumenserfeliz.org';
  doc.setTextColor(...gray); doc.setFontSize(8);
  doc.text(label, 14, 290);

  // Retorna base64 puro (sem o prefixo data:application/pdf;base64,)
  return doc.output('datauristring').split(',')[1];
}

async function notifyAdminNewUser(name, email) {
  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_email:  ADMIN_EMAIL,
      to_name:   'Administrador',
      from_name: 'Sistema Lumen',
      reply_to:  ADMIN_EMAIL,
      subject:   '🆕 Novo usuário aguardando aprovação — ' + name,
      message:   `Novo usuário cadastrado:\nNome: ${name}\nE-mail: ${email}\n\nAcesse o sistema para aprovar ou recusar e atribuir a casa.`,
    });
  } catch(e) {
    console.warn('Notif admin err:', e);
  }
}

// ─────────────────────────────────────────────
// 🛠️  UTILITIES
// ─────────────────────────────────────────────
function v(id) { return document.getElementById(id)?.value?.trim() || ''; }

function showAlert(id, msg, type) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.className = `alert alert-${type} visible`;
}
function hideAlert(id) { document.getElementById(id)?.classList.remove('visible'); }

function setBtnLoading(id, loading) {
  const btn = document.getElementById(id);
  if (!btn) return;
  if (loading) {
    btn.disabled = true;
    btn.dataset.orig = btn.innerHTML;
    btn.innerHTML = '<div class="spinner"></div> Aguarde...';
  } else {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.orig || btn.innerHTML;
  }
}

function openModal(id)  { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function formatDate(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

function formatCats(cats) {
  if (!cats?.length) return '—';
  return cats.map(c => CATEGORIAS[c]?.icon + ' ' + CATEGORIAS[c]?.nome).join(', ');
}

function showToast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  Object.assign(t.style, {
    position:'fixed', bottom:'24px', right:'24px', background:'#1a1f2e', color:'#fff',
    padding:'12px 20px', borderRadius:'8px', fontSize:'13px', fontWeight:'600',
    zIndex:'9999', boxShadow:'0 4px 16px rgba(0,0,0,0.2)', maxWidth:'320px',
    animation:'none', transition:'opacity 0.3s'
  });
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; setTimeout(() => t.remove(), 400); }, 3000);
}

