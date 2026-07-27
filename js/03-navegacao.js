// Extraído de index.html (navegação de páginas + cardápio diário) em 2026-07-27
// ─────────────────────────────────────────────
// 📄  PAGE NAVIGATION
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// 🍽️  CARDÁPIO DIÁRIO
// ─────────────────────────────────────────────
let cardapioHouse = null;
let cardapioHousePeople = 0;
let cardapioHouseStock = {};
let cardapioItens = { cafeManha: [], lancheManha: [], almoco: [], lancheTarde: [], janta: [] };
let cardapioFatoresConfig = {};
let cardapioEmbalagemConfig = {};
let cardapioPesoEmbalagemConfig = {};
let cardapioResultado = null;
let cardapioPlanoAtivo = null;
let _cardapioItemSeq = 0;

const FATORES_PADRAO_CARDAPIO = {
  'cereal__arroz': 2.5,
  'cereal__feijao': 2.5,
  'cereal__cuscuz': 2.5,
};
const PROTEINA_SEM_FATOR_CARDAPIO = ['ovo','mortadela','salsicha','linguica','calabresa'];
const EMBALAGEM_PADRAO_CARDAPIO = {
  'proteina__ovo': 30, // 1 bandeja = 30 ovos (contagem: consumo é em unidades inteiras)
};
// peso-embalagem: consumo é em GRAMAS por pessoa (igual arroz/feijão), mas a embalagem
// de compra não é Kg — converte pra fração da embalagem usando o peso real dela.
const PESO_EMBALAGEM_PADRAO_CARDAPIO = {
  'cereal__margarina':      3000, // Balde 3Kg
  'cereal__cremogema':      180,
  'cereal__mucilon':        180,
  'cereal__farinha_lactea': 160,
  'cereal__bolacha':        300,
  'cereal__macarrao':       400,
  'cereal__pao_integral':   25,   // peso de 1 unidade (fatia)
  // Suco concentrado e suco em pó: a pessoa consome VOLUME de suco pronto, não peso
  // de concentrado/pó — por isso o divisor aqui é o RENDIMENTO da embalagem (mL depois
  // de preparado), não o peso do produto seco. Ver UNIDADE_CONSUMO_CARDAPIO abaixo.
  'cereal__suco_conc':      1500, // 1 embalagem (500ml concentrado) rende 1,5L prontos
  'cereal__suco_po':        1000, // 1 embalagem (30-40g de pó) rende 1L pronto
};
// Marca quais itens do modo peso-embalagem são medidos em mL (consumo de bebida pronta)
// em vez de gramas — só muda o rótulo do campo, a conta é a mesma fórmula.
const UNIDADE_CONSUMO_ML_CARDAPIO = ['cereal__suco_conc', 'cereal__suco_po'];

function getUnidadeConsumoCardapio(catKey, prodId) {
  return UNIDADE_CONSUMO_ML_CARDAPIO.includes(`${catKey}__${prodId}`) ? 'ml' : 'g';
}

// Arredonda pra cima (nunca pra baixo) — usado só no total final (resumo/PDF e giro de
// estoque), nunca nas tabelas por refeição, que mostram o valor exato calculado.
// Epsilon evita que erro de ponto flutuante (ex: 6.9999999999) arredonde pra 7 à toa.
function arredondarCardapioParaCima(qtd) {
  return Math.ceil(qtd - 1e-9);
}

function getFatorPadraoCardapio(catKey, prodId) {
  const key = `${catKey}__${prodId}`;
  if (cardapioFatoresConfig[key] !== undefined) return cardapioFatoresConfig[key];
  if (FATORES_PADRAO_CARDAPIO[key] !== undefined) return FATORES_PADRAO_CARDAPIO[key];
  if (catKey === 'proteina' && !PROTEINA_SEM_FATOR_CARDAPIO.includes(prodId)) return 0.7;
  return 1;
}

// peso: Kg/Litro — input gramas/ml por pessoa, tem fator cru→pronto (cozimento).
// peso-embalagem: input gramas por pessoa, SEM fator de cocção, convertido direto
//   pra fração da embalagem usando o peso real dela (margarina, cremogema etc.).
// contagem: input unidades por pessoa (ex: 1 ovo), convertido pra embalagem
//   usando "unidades por embalagem" (ovo=30). Fallback pra qualquer item futuro
//   sem peso/rendimento de embalagem ainda confirmado.
function getCardapioModoProduto(catKey, prodId) {
  const prod = CATEGORIAS[catKey]?.produtos.find(p => p.id === prodId);
  if (!prod) return 'peso';
  if (prod.unidade === 'Kg' || prod.unidade === 'Litro') return 'peso';
  const key = `${catKey}__${prodId}`;
  if (cardapioPesoEmbalagemConfig[key] !== undefined || PESO_EMBALAGEM_PADRAO_CARDAPIO[key] !== undefined) return 'peso-embalagem';
  return 'contagem';
}

function getUnidadesPorEmbalagemPadrao(catKey, prodId) {
  const key = `${catKey}__${prodId}`;
  if (cardapioEmbalagemConfig[key] !== undefined) return cardapioEmbalagemConfig[key];
  if (EMBALAGEM_PADRAO_CARDAPIO[key] !== undefined) return EMBALAGEM_PADRAO_CARDAPIO[key];
  return 1;
}

function getPesoEmbalagemPadrao(catKey, prodId) {
  const key = `${catKey}__${prodId}`;
  if (cardapioPesoEmbalagemConfig[key] !== undefined) return cardapioPesoEmbalagemConfig[key];
  if (PESO_EMBALAGEM_PADRAO_CARDAPIO[key] !== undefined) return PESO_EMBALAGEM_PADRAO_CARDAPIO[key];
  return 1000;
}

async function loadFatoresConversaoConfig() {
  try {
    const doc = await db.collection('config').doc('fatoresConversaoCardapio').get();
    cardapioFatoresConfig = doc.exists ? (doc.data().valores || {}) : {};
  } catch(e) { cardapioFatoresConfig = {}; }
  try {
    const doc2 = await db.collection('config').doc('unidadesEmbalagemCardapio').get();
    cardapioEmbalagemConfig = doc2.exists ? (doc2.data().valores || {}) : {};
  } catch(e) { cardapioEmbalagemConfig = {}; }
  try {
    const doc3 = await db.collection('config').doc('pesoEmbalagemCardapio').get();
    cardapioPesoEmbalagemConfig = doc3.exists ? (doc3.data().valores || {}) : {};
  } catch(e) { cardapioPesoEmbalagemConfig = {}; }
}

async function salvarFatorCardapio(catKey, prodId, valor) {
  const key = `${catKey}__${prodId}`;
  cardapioFatoresConfig[key] = valor;
  try {
    await db.collection('config').doc('fatoresConversaoCardapio').set({ valores: cardapioFatoresConfig }, { merge:true });
  } catch(e) { showToast('⚠️ Não foi possível salvar o novo padrão de fator.'); }
}

async function salvarEmbalagemCardapio(catKey, prodId, valor) {
  const key = `${catKey}__${prodId}`;
  cardapioEmbalagemConfig[key] = valor;
  try {
    await db.collection('config').doc('unidadesEmbalagemCardapio').set({ valores: cardapioEmbalagemConfig }, { merge:true });
  } catch(e) { showToast('⚠️ Não foi possível salvar o novo padrão de embalagem.'); }
}

async function salvarPesoEmbalagemCardapio(catKey, prodId, valor) {
  const key = `${catKey}__${prodId}`;
  cardapioPesoEmbalagemConfig[key] = valor;
  try {
    await db.collection('config').doc('pesoEmbalagemCardapio').set({ valores: cardapioPesoEmbalagemConfig }, { merge:true });
  } catch(e) { showToast('⚠️ Não foi possível salvar o novo peso de embalagem.'); }
}

function getCardapioCatalogoProdutos() {
  const list = [];
  ['cereal','proteina'].forEach(catKey => {
    (CATEGORIAS[catKey]?.produtos || []).forEach(p => {
      if (catKey === 'cereal' && p.id === 'cafe') return; // café é tratado à parte (fixo)
      list.push({ catKey, prodId: p.id, nome: p.nome, unidade: p.unidade });
    });
  });
  return list;
}

async function initCardapioDiario() {
  await loadFatoresConversaoConfig();
  const houseSel = document.getElementById('card-house');
  if (houseSel) houseSel.value = '';
  document.getElementById('card-pessoas-box').style.display = 'none';
  document.getElementById('card-refeicoes-wrap').style.display = 'none';
  document.getElementById('card-alerta-populacao').style.display = 'none';
  document.getElementById('card-resultado-wrap').style.display = 'none';
  cardapioHouse = null;
  cardapioPlanoAtivo = null;
  cardapioItens = { cafeManha: [], lancheManha: [], almoco: [], lancheTarde: [], janta: [] };
  const mCk = document.getElementById('card-cafe-manha-toggle');
  const lCk = document.getElementById('card-cafe-lanche-toggle');
  if (mCk) mCk.checked = false;
  if (lCk) lCk.checked = false;
  ['cafeManha','lancheManha','almoco','lancheTarde','janta'].forEach(r => renderCardapioRefeicao(r));
}

async function onCardapioHouseChange() {
  const house = v('card-house');
  cardapioHouse = house || null;
  cardapioItens = { cafeManha: [], lancheManha: [], almoco: [], lancheTarde: [], janta: [] };
  cardapioPlanoAtivo = null;
  document.getElementById('card-cafe-manha-toggle').checked = false;
  document.getElementById('card-cafe-lanche-toggle').checked = false;
  document.getElementById('card-resultado-wrap').style.display = 'none';
  cardapioResultado = null;

  if (!house) {
    document.getElementById('card-pessoas-box').style.display = 'none';
    document.getElementById('card-refeicoes-wrap').style.display = 'none';
    document.getElementById('card-alerta-populacao').style.display = 'none';
    ['cafeManha','lancheManha','almoco','lancheTarde','janta'].forEach(r => renderCardapioRefeicao(r));
    return;
  }

  const snap = await db.collection('houses').where('name','==',house).get();
  cardapioHousePeople = snap.empty ? 0 : (snap.docs[0].data().currentPeople || 0);
  document.getElementById('card-pessoas-atual').textContent = cardapioHousePeople;
  document.getElementById('card-pessoas-box').style.display = 'block';
  document.getElementById('card-refeicoes-wrap').style.display = 'block';

  // Estoque atual da casa (isolado do estoque usado em Nova Solicitação, pra não conflitar)
  cardapioHouseStock = {};
  const movSnap = await db.collection('movements').where('house','==',house).get();
  movSnap.docs.forEach(d => {
    const m = d.data();
    (m.items || []).forEach(item => {
      const key = `${item.catKey}__${item.prodId}`;
      if (!cardapioHouseStock[key]) cardapioHouseStock[key] = 0;
      if (m.type === 'entrada') cardapioHouseStock[key] += item.qty;
      else cardapioHouseStock[key] -= item.qty;
    });
  });

  // Último plano gerado pra essa casa — usado pra comparar população e pré-carregar itens
  const alertaEl = document.getElementById('card-alerta-populacao');
  try {
    const planoSnap = await db.collection('cardapioPlanos').where('house','==',house).orderBy('geradoEm','desc').limit(1).get();
    if (!planoSnap.empty) {
      const plano = planoSnap.docs[0].data();
      plano.id = planoSnap.docs[0].id;
      cardapioPlanoAtivo = plano;
      if ((plano.pessoas || 0) !== cardapioHousePeople) {
        alertaEl.style.display = 'block';
        alertaEl.textContent = `⚠️ A população mudou de ${plano.pessoas} para ${cardapioHousePeople} desde o último PDF gerado para esta casa. Recomenda-se recalcular e reemitir o PDF.`;
      } else {
        alertaEl.style.display = 'none';
      }
      cardapioItens = JSON.parse(JSON.stringify(plano.refeicoes || { cafeManha: [], lancheManha: [], almoco: [], lancheTarde: [], janta: [] }));
      ['cafeManha','lancheManha','almoco','lancheTarde','janta'].forEach(r => {
        (cardapioItens[r] || []).forEach(it => { it._seq = _cardapioItemSeq++; });
      });
      document.getElementById('card-cafe-manha-toggle').checked = !!plano.cafeManhaTemCafe;
      document.getElementById('card-cafe-lanche-toggle').checked = !!plano.lancheTardeTemCafe;
    } else {
      alertaEl.style.display = 'none';
    }
  } catch(e) {
    alertaEl.style.display = 'none';
  }

  ['cafeManha','lancheManha','almoco','lancheTarde','janta'].forEach(r => renderCardapioRefeicao(r));
  atualizarTotalCafeCardapio();
}

function atualizarTotalCafeCardapio() {
  const pessoas = cardapioHousePeople || 0;
  const manhaOn = document.getElementById('card-cafe-manha-toggle')?.checked;
  const lancheOn = document.getElementById('card-cafe-lanche-toggle')?.checked;
  document.getElementById('card-cafe-manha-total').textContent = manhaOn ? `${Math.round(pessoas*15)} g` : '0 g';
  document.getElementById('card-cafe-lanche-total').textContent = lancheOn ? `${Math.round(pessoas*15)} g` : '0 g';
}

function addCardapioItem(refeicao) {
  if (!cardapioHouse) { showToast('⚠️ Selecione uma casa primeiro.'); return; }
  cardapioItens[refeicao].push({ catKey:'', prodId:'', modo:'peso', gramasPessoa:0, fator:1, unidadesPessoa:0, unidadesPorEmbalagem:1, pesoEmbalagem:1000, _seq: _cardapioItemSeq++ });
  renderCardapioRefeicao(refeicao);
}

function removeCardapioItem(refeicao, seq) {
  cardapioItens[refeicao] = cardapioItens[refeicao].filter(it => it._seq !== seq);
  renderCardapioRefeicao(refeicao);
}

function onCardapioProdutoChange(refeicao, seq, value) {
  const [catKey, prodId] = value.split('__');
  const it = cardapioItens[refeicao].find(x => x._seq === seq);
  if (!it) return;
  it.catKey = catKey || '';
  it.prodId = prodId || '';
  if (catKey && prodId) {
    it.modo = getCardapioModoProduto(catKey, prodId);
    it.fator = getFatorPadraoCardapio(catKey, prodId);
    it.unidadesPorEmbalagem = getUnidadesPorEmbalagemPadrao(catKey, prodId);
    it.pesoEmbalagem = getPesoEmbalagemPadrao(catKey, prodId);
  } else {
    it.modo = 'peso';
  }
  renderCardapioRefeicao(refeicao);
}

function onCardapioGramasChange(refeicao, seq, value) {
  const it = cardapioItens[refeicao].find(x => x._seq === seq);
  if (!it) return;
  it.gramasPessoa = parseFloat(value) || 0;
}

function onCardapioFatorChange(refeicao, seq, value) {
  const it = cardapioItens[refeicao].find(x => x._seq === seq);
  if (!it) return;
  it.fator = parseFloat(value) || 1;
  if (it.catKey && it.prodId) salvarFatorCardapio(it.catKey, it.prodId, it.fator);
}

function onCardapioUnidadesChange(refeicao, seq, value) {
  const it = cardapioItens[refeicao].find(x => x._seq === seq);
  if (!it) return;
  it.unidadesPessoa = parseFloat(value) || 0;
}

function onCardapioEmbalagemChange(refeicao, seq, value) {
  const it = cardapioItens[refeicao].find(x => x._seq === seq);
  if (!it) return;
  it.unidadesPorEmbalagem = parseFloat(value) || 1;
  if (it.catKey && it.prodId) salvarEmbalagemCardapio(it.catKey, it.prodId, it.unidadesPorEmbalagem);
}

function onCardapioPesoEmbalagemChange(refeicao, seq, value) {
  const it = cardapioItens[refeicao].find(x => x._seq === seq);
  if (!it) return;
  it.pesoEmbalagem = parseFloat(value) || 1000;
  if (it.catKey && it.prodId) salvarPesoEmbalagemCardapio(it.catKey, it.prodId, it.pesoEmbalagem);
}

function renderCardapioRefeicao(refeicao) {
  const wrap = document.getElementById(`card-itens-${refeicao}`);
  if (!wrap) return;
  const catalogo = getCardapioCatalogoProdutos();
  const buildOpts = (sel) => `<option value="">Selecione o alimento...</option>` +
    catalogo.map(p => {
      const val = `${p.catKey}__${p.prodId}`;
      return `<option value="${val}" ${val===sel?'selected':''}>${p.nome}</option>`;
    }).join('');

  wrap.innerHTML = cardapioItens[refeicao].map(it => {
    const sel = it.catKey && it.prodId ? `${it.catKey}__${it.prodId}` : '';
    const prod = it.catKey && it.prodId ? CATEGORIAS[it.catKey]?.produtos.find(p => p.id === it.prodId) : null;
    const modo = it.modo || 'peso';

    if (modo === 'contagem') {
      const unidLabel = prod ? prod.unidade : 'unid.';
      return `<div class="cardapio-item-row">
        <select class="cardapio-select" onchange="onCardapioProdutoChange('${refeicao}', ${it._seq}, this.value)">${buildOpts(sel)}</select>
        <input type="number" class="cardapio-input" min="0" step="0.1" value="${it.unidadesPessoa || ''}" placeholder="0"
          oninput="onCardapioUnidadesChange('${refeicao}', ${it._seq}, this.value)">
        <span class="cardapio-unit-label">${unidLabel}/pessoa</span>
        <input type="number" class="cardapio-input" min="1" step="1" value="${it.unidadesPorEmbalagem || 1}"
          onchange="onCardapioEmbalagemChange('${refeicao}', ${it._seq}, this.value)" title="Quantas unidades tem em 1 ${unidLabel.toLowerCase()} (editável, vira o novo padrão)">
        <button type="button" class="cardapio-remove-btn" onclick="removeCardapioItem('${refeicao}', ${it._seq})">×</button>
      </div>`;
    }

    if (modo === 'peso-embalagem') {
      const unidLabel = prod ? prod.unidade : 'embalagem';
      const unidConsumo = it.catKey && it.prodId ? getUnidadeConsumoCardapio(it.catKey, it.prodId) : 'g';
      const tituloEmb = unidConsumo === 'ml' ? `Rendimento da embalagem em mL — 1 ${unidLabel}` : `Peso da embalagem em gramas — 1 ${unidLabel}`;
      return `<div class="cardapio-item-row">
        <select class="cardapio-select" onchange="onCardapioProdutoChange('${refeicao}', ${it._seq}, this.value)">${buildOpts(sel)}</select>
        <input type="number" class="cardapio-input" min="0" value="${it.gramasPessoa || ''}" placeholder="0"
          oninput="onCardapioGramasChange('${refeicao}', ${it._seq}, this.value)">
        <span class="cardapio-unit-label">${unidConsumo}/pessoa</span>
        <input type="number" class="cardapio-input" min="1" step="1" value="${it.pesoEmbalagem || 1000}"
          onchange="onCardapioPesoEmbalagemChange('${refeicao}', ${it._seq}, this.value)" title="${tituloEmb} (editável, vira o novo padrão)">
        <button type="button" class="cardapio-remove-btn" onclick="removeCardapioItem('${refeicao}', ${it._seq})">×</button>
      </div>`;
    }

    return `<div class="cardapio-item-row">
      <select class="cardapio-select" onchange="onCardapioProdutoChange('${refeicao}', ${it._seq}, this.value)">${buildOpts(sel)}</select>
      <input type="number" class="cardapio-input" min="0" value="${it.gramasPessoa || ''}" placeholder="0"
        oninput="onCardapioGramasChange('${refeicao}', ${it._seq}, this.value)">
      <span class="cardapio-unit-label">g/pessoa</span>
      <input type="number" class="cardapio-input" min="0" step="0.1" value="${it.fator}"
        onchange="onCardapioFatorChange('${refeicao}', ${it._seq}, this.value)" title="Fator cru→pronto (editável, vira o novo padrão desse produto)">
      <button type="button" class="cardapio-remove-btn" onclick="removeCardapioItem('${refeicao}', ${it._seq})">×</button>
    </div>`;
  }).join('') || '<div class="cardapio-empty">Nenhum alimento adicionado.</div>';
}

function calcularCardapioDiario() {
  if (!cardapioHouse) { showToast('⚠️ Selecione uma casa antes de calcular.'); return; }
  const pessoas = cardapioHousePeople || 0;
  const refeicoesKeys = ['cafeManha','lancheManha','almoco','lancheTarde','janta'];
  const porRefeicao = {};
  const totalCru = {};
  const totalPronto = {};

  refeicoesKeys.forEach(r => {
    porRefeicao[r] = [];
    cardapioItens[r].forEach(it => {
      if (!it.catKey || !it.prodId) return;
      const prod = CATEGORIAS[it.catKey]?.produtos.find(p => p.id === it.prodId);
      if (!prod) return;
      const key = `${it.catKey}__${it.prodId}`;
      const modo = it.modo || 'peso';

      if (modo === 'contagem') {
        if (!it.unidadesPessoa) return;
        const unidadesTotal = it.unidadesPessoa * pessoas;
        const embalagem = it.unidadesPorEmbalagem || 1;
        const cruQtd = unidadesTotal / embalagem;
        porRefeicao[r].push({
          catKey: it.catKey, prodId: it.prodId, nome: prod.nome, unidade: prod.unidade, modo,
          porPessoaLabel: `${it.unidadesPessoa} ${prod.unidade}`, fatorLabel: `${embalagem} un/${prod.unidade.toLowerCase()}`,
          cruQtd, prontoQtd: cruQtd
        });
        if (!totalCru[key]) totalCru[key] = { nome: prod.nome, unidade: prod.unidade, qtd: 0 };
        totalCru[key].qtd += cruQtd;
        if (!totalPronto[key]) totalPronto[key] = { nome: prod.nome, unidade: prod.unidade, qtd: 0 };
        totalPronto[key].qtd += cruQtd;
      } else if (modo === 'peso-embalagem') {
        if (!it.gramasPessoa) return;
        const gramasTotal = it.gramasPessoa * pessoas;
        const pesoEmb = it.pesoEmbalagem || 1000;
        const cruQtd = gramasTotal / pesoEmb;
        const unidConsumo = getUnidadeConsumoCardapio(it.catKey, it.prodId);
        porRefeicao[r].push({
          catKey: it.catKey, prodId: it.prodId, nome: prod.nome, unidade: prod.unidade, modo,
          porPessoaLabel: `${it.gramasPessoa} ${unidConsumo}`, fatorLabel: `${pesoEmb}${unidConsumo}/${prod.unidade.toLowerCase()}`,
          cruQtd, prontoQtd: cruQtd
        });
        if (!totalCru[key]) totalCru[key] = { nome: prod.nome, unidade: prod.unidade, qtd: 0 };
        totalCru[key].qtd += cruQtd;
        if (!totalPronto[key]) totalPronto[key] = { nome: prod.nome, unidade: prod.unidade, qtd: 0 };
        totalPronto[key].qtd += cruQtd;
      } else {
        if (!it.gramasPessoa) return;
        const gramasProntoTotal = it.gramasPessoa * pessoas;
        const fator = it.fator || 1;
        const gramasCruTotal = gramasProntoTotal / fator;
        porRefeicao[r].push({
          catKey: it.catKey, prodId: it.prodId, nome: prod.nome, unidade: 'Kg', modo,
          porPessoaLabel: `${it.gramasPessoa} g`, fatorLabel: String(fator),
          cruQtd: gramasCruTotal/1000, prontoQtd: gramasProntoTotal/1000
        });
        if (!totalCru[key]) totalCru[key] = { nome: prod.nome, unidade: 'Kg', qtd: 0 };
        totalCru[key].qtd += gramasCruTotal/1000;
        if (!totalPronto[key]) totalPronto[key] = { nome: prod.nome, unidade: 'Kg', qtd: 0 };
        totalPronto[key].qtd += gramasProntoTotal/1000;
      }
    });
  });

  const manhaOn = document.getElementById('card-cafe-manha-toggle').checked;
  const lancheOn = document.getElementById('card-cafe-lanche-toggle').checked;
  const cafeProd = CATEGORIAS.cereal.produtos.find(p => p.id === 'cafe');
  const cafeKey = 'cereal__cafe';
  if (manhaOn) {
    const g = 15 * pessoas;
    porRefeicao.cafeManha.push({ catKey:'cereal', prodId:'cafe', nome: cafeProd.nome, unidade:'Kg', modo:'peso', porPessoaLabel:'15 g', fatorLabel:'1', prontoQtd:g/1000, cruQtd:g/1000 });
    if (!totalCru[cafeKey]) totalCru[cafeKey] = { nome: cafeProd.nome, unidade:'Kg', qtd:0 };
    totalCru[cafeKey].qtd += g/1000;
  }
  if (lancheOn) {
    const g = 15 * pessoas;
    porRefeicao.lancheTarde.push({ catKey:'cereal', prodId:'cafe', nome: cafeProd.nome, unidade:'Kg', modo:'peso', porPessoaLabel:'15 g', fatorLabel:'1', prontoQtd:g/1000, cruQtd:g/1000 });
    if (!totalCru[cafeKey]) totalCru[cafeKey] = { nome: cafeProd.nome, unidade:'Kg', qtd:0 };
    totalCru[cafeKey].qtd += g/1000;
  }

  const itensFalta = [];
  Object.entries(totalCru).forEach(([key, info]) => {
    const estoque = cardapioHouseStock[key] || 0;
    if (estoque < info.qtd) itensFalta.push({ key, nome: info.nome, unidade: info.unidade, necessario: info.qtd, estoque, falta: info.qtd - estoque });
  });

  cardapioResultado = { casa: cardapioHouse, pessoas, porRefeicao, totalCru, totalPronto, itensFalta };
  renderCardapioResultado();
}

function renderCardapioResultado() {
  const r = cardapioResultado;
  if (!r) return;
  document.getElementById('card-resultado-wrap').style.display = 'block';

  const totalItens = Object.keys(r.totalCru).length;
  document.getElementById('card-resumo-cards').innerHTML = `
    <div class="cardapio-summary-card">
      <div class="cardapio-summary-label">Itens no cardápio do dia</div>
      <div class="cardapio-summary-value">${totalItens}</div>
    </div>
    <div class="cardapio-summary-card">
      <div class="cardapio-summary-label">Itens com estoque insuficiente</div>
      <div class="cardapio-summary-value" style="${r.itensFalta.length ? 'color:var(--danger);' : ''}">${r.itensFalta.length}</div>
    </div>
    <div class="cardapio-summary-card">
      <div class="cardapio-summary-label">Pessoas consideradas</div>
      <div class="cardapio-summary-value">${r.pessoas}</div>
    </div>`;

  const nomesRef = { cafeManha:'Café da manhã', lancheManha:'Lanche da manhã', almoco:'Almoço', lancheTarde:'Lanche da tarde', janta:'Janta' };
  let html = '';
  ['cafeManha','lancheManha','almoco','lancheTarde','janta'].forEach(rk => {
    const itens = r.porRefeicao[rk];
    if (!itens.length) return;
    html += `<div class="cardapio-card">
      <h3>${nomesRef[rk]}</h3>
      <table class="cardapio-table">
        <thead><tr>
          <th>Alimento</th><th>Por pessoa</th><th>Fator/embalagem</th><th>Cru total</th><th>Pronto total</th>
        </tr></thead>
        <tbody>` +
      itens.map(it => {
        const key = `${it.catKey}__${it.prodId}`;
        const falta = r.itensFalta.find(f => f.key === key);
        return `<tr>
          <td>${it.nome}</td>
          <td>${it.porPessoaLabel}</td>
          <td>${it.fatorLabel}</td>
          <td style="text-align:right;" class="${falta ? 'cardapio-warn-cell' : ''}">${it.cruQtd.toFixed(2)} ${it.unidade}</td>
          <td style="text-align:right;">${it.prontoQtd.toFixed(2)} ${it.unidade}</td>
        </tr>` +
        (falta ? `<tr><td colspan="5" class="cardapio-warn-note">⚠️ Estoque atual: ${falta.estoque.toFixed(2)} ${falta.unidade} — falta comprar ${falta.falta.toFixed(2)} ${falta.unidade}</td></tr>` : '');
      }).join('') +
      `</tbody></table></div>`;
  });
  document.getElementById('card-resultado-detalhe').innerHTML = html;
}

async function gerarPDFCardapio() {
  if (!cardapioResultado) { showToast('⚠️ Calcule o consumo antes de gerar o PDF.'); return; }
  const r = cardapioResultado;

  const planoData = {
    house: r.casa,
    pessoas: r.pessoas,
    refeicoes: cardapioItens,
    cafeManhaTemCafe: document.getElementById('card-cafe-manha-toggle').checked,
    lancheTardeTemCafe: document.getElementById('card-cafe-lanche-toggle').checked,
    cruCalculado: Object.fromEntries(Object.entries(r.totalCru).map(([k,v]) => [k, v.qtd])),
    geradoEm: firebase.firestore.FieldValue.serverTimestamp(),
    geradoPor: currentUserData?.name || '—'
  };
  try {
    if (cardapioPlanoAtivo?.id) {
      await db.collection('cardapioPlanos').doc(cardapioPlanoAtivo.id).set(planoData, { merge:true });
      planoData.id = cardapioPlanoAtivo.id;
    } else {
      const docRef = await db.collection('cardapioPlanos').add(planoData);
      planoData.id = docRef.id;
    }
    cardapioPlanoAtivo = planoData;
  } catch(e) {
    showToast('⚠️ Não foi possível salvar o plano antes de gerar o PDF.');
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const nomesRef = { cafeManha:'Café da manhã', lancheManha:'Lanche da manhã', almoco:'Almoço', lancheTarde:'Lanche da tarde', janta:'Janta' };
  const dataStr = new Date().toLocaleDateString('pt-BR');

  const desenhaCabecalho = () => {
    doc.setFontSize(14);
    doc.text('Obra Lumen — Cardápio Diário', 14, 13);
    doc.setFontSize(10);
    doc.text(`Casa: ${r.casa}   |   Pessoas: ${r.pessoas}   |   Data: ${dataStr}`, 14, 20);
  };

  ['cafeManha','lancheManha','almoco','lancheTarde','janta'].forEach((rk, idx) => {
    if (idx > 0) doc.addPage();
    desenhaCabecalho();
    doc.setFontSize(12);
    doc.text(nomesRef[rk], 14, 30);
    const rows = r.porRefeicao[rk].map(it => [
      it.nome, it.porPessoaLabel, it.fatorLabel, `${it.cruQtd.toFixed(2)} ${it.unidade}`, `${it.prontoQtd.toFixed(2)} ${it.unidade}`
    ]);
    doc.autoTable({
      startY: 35,
      head: [['Alimento','Por pessoa','Fator/embalagem','Cru total','Pronto total']],
      body: rows.length ? rows : [['Nenhum alimento selecionado nesta refeição.', '', '', '', '']],
      styles: { fontSize: 9 }
    });
  });

  doc.addPage();
  desenhaCabecalho();
  doc.setFontSize(12);
  doc.text('Total a retirar do estoque para o dia seguinte', 14, 30);
  const ORDEM_CATEGORIAS_RESUMO = ['cereal','proteina'];
  const resumoRows = [];
  ORDEM_CATEGORIAS_RESUMO.forEach(catKey => {
    const nomeCat = CATEGORIAS[catKey]?.nome || catKey;
    const itensCat = Object.entries(r.totalCru).filter(([key]) => key.startsWith(`${catKey}__`));
    if (!itensCat.length) return;
    resumoRows.push([{ content: nomeCat, colSpan: 2, styles: { fontStyle: 'bold', fillColor: [230,230,230] } }]);
    itensCat.forEach(([key, info]) => {
      resumoRows.push([info.nome, `${arredondarCardapioParaCima(info.qtd)} ${info.unidade}`]);
    });
  });
  doc.autoTable({
    startY: 35,
    head: [['Alimento','Quantidade crua total (arredondada)']],
    body: resumoRows,
    styles: { fontSize: 9 }
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.text(`Lumen Estoque — Página ${i} de ${pageCount}`, 14, doc.internal.pageSize.height - 8);
  }

  doc.save(`Cardapio_${r.casa.replace(/\s+/g,'_')}_${dataStr.replace(/\//g,'-')}.pdf`);
  showToast('✅ PDF do cardápio gerado.');
}

async function giroEstoqueCardapio() {
  if (!cardapioHouse) { showToast('⚠️ Selecione uma casa antes de fazer o giro.'); return; }
  if (!cardapioPlanoAtivo || !cardapioPlanoAtivo.refeicoes) {
    showToast('⚠️ Gere o PDF do cardápio dessa casa pelo menos uma vez antes de fazer o giro de estoque.');
    return;
  }

  const snap = await db.collection('houses').where('name','==',cardapioHouse).get();
  const pessoasAtual = snap.empty ? 0 : (snap.docs[0].data().currentPeople || 0);

  const totalCru = {};
  ['cafeManha','lancheManha','almoco','lancheTarde','janta'].forEach(r => {
    (cardapioPlanoAtivo.refeicoes[r] || []).forEach(it => {
      if (!it.catKey || !it.prodId) return;
      const prod = CATEGORIAS[it.catKey]?.produtos.find(p => p.id === it.prodId);
      if (!prod) return;
      const key = `${it.catKey}__${it.prodId}`;
      const modo = it.modo || 'peso';
      let qtdCru = 0;
      let unidade = 'Kg';
      if (modo === 'contagem') {
        if (!it.unidadesPessoa) return;
        const embalagem = it.unidadesPorEmbalagem || 1;
        qtdCru = (it.unidadesPessoa * pessoasAtual) / embalagem;
        unidade = prod.unidade;
      } else if (modo === 'peso-embalagem') {
        if (!it.gramasPessoa) return;
        const pesoEmb = it.pesoEmbalagem || 1000;
        qtdCru = (it.gramasPessoa * pessoasAtual) / pesoEmb;
        unidade = prod.unidade;
      } else {
        if (!it.gramasPessoa) return;
        qtdCru = (it.gramasPessoa * pessoasAtual) / (it.fator || 1) / 1000;
        unidade = 'Kg';
      }
      if (!totalCru[key]) totalCru[key] = { catKey: it.catKey, prodId: it.prodId, nome: prod.nome, unidade, qtd: 0 };
      totalCru[key].qtd += qtdCru;
    });
  });
  if (cardapioPlanoAtivo.cafeManhaTemCafe || cardapioPlanoAtivo.lancheTardeTemCafe) {
    const cafeProd = CATEGORIAS.cereal.produtos.find(p => p.id === 'cafe');
    const vezes = (cardapioPlanoAtivo.cafeManhaTemCafe ? 1 : 0) + (cardapioPlanoAtivo.lancheTardeTemCafe ? 1 : 0);
    const key = 'cereal__cafe';
    const g = 15 * pessoasAtual * vezes;
    if (!totalCru[key]) totalCru[key] = { catKey:'cereal', prodId:'cafe', nome: cafeProd.nome, unidade:'Kg', qtd: 0 };
    totalCru[key].qtd += g / 1000;
  }

  const linhas = Object.values(totalCru).filter(it => it.qtd > 0);
  if (!linhas.length) { showToast('⚠️ Nada a debitar — cardápio vazio.'); return; }

  const resumoTxt = linhas.map(l => `${l.nome}: ${arredondarCardapioParaCima(l.qtd)} ${l.unidade}`).join('\n');
  const avisoPop = pessoasAtual !== (cardapioPlanoAtivo.pessoas || 0)
    ? `\n\n⚠️ Atenção: a população atual (${pessoasAtual}) é diferente da população do último PDF gerado (${cardapioPlanoAtivo.pessoas}). O giro vai debitar com base na população ATUAL.`
    : '';

  if (!confirm(`Confirma a baixa de estoque de "${cardapioHouse}" para o dia seguinte?\n\n${resumoTxt}${avisoPop}`)) return;

  const entries = linhas.map(l => ({ catKey: l.catKey, prodId: l.prodId, prodNome: l.nome, unidade: l.unidade, qty: arredondarCardapioParaCima(l.qtd) }));
  const dateStr = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const todaySnap = await db.collection('movements').where('dateStr','==',dateStr).get();
  const seq = String(todaySnap.size + 1).padStart(3,'0');
  const prefixMov = siglaCasa(cardapioHouse);
  const code = `OB-${prefixMov}-SAI-CARDAPIO-${dateStr}-${seq}`;

  try {
    await db.collection('movements').add({
      code, house: cardapioHouse, type: 'saida', date: new Date().toISOString().slice(0,10), dateStr,
      obs: 'Baixa automática — Cardápio Diário', isDonation: false,
      items: entries,
      registeredBy: currentUserData?.name || '—',
      registeredUid: currentUser?.uid || null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast('✅ Giro de estoque realizado.');
    onCardapioHouseChange();
  } catch(e) {
    showToast('⚠️ Erro ao registrar o giro de estoque.');
  }
}

