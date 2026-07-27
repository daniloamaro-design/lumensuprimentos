// Extraído de index.html (IA leitura de formulário + movimentação + estoque atual) em 2026-07-27
// ─────────────────────────────────────────────
// 🤖  LEITURA DE FORMULÁRIO COM IA (GEMINI)
// ─────────────────────────────────────────────

// Mapa de nomes do formulário físico → IDs do sistema
const NOME_PARA_ID = {};
Object.entries(CATEGORIAS).forEach(([catKey, cat]) => {
  cat.produtos.forEach(p => {
    // Normaliza: minúsculo, sem acento, sem parênteses para matching flexível
    const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,' ').trim();
    NOME_PARA_ID[norm(p.nome)] = { catKey, prodId: p.id, prodNome: p.nome };
    // Aliases comuns
    if (p.id === 'feijao') NOME_PARA_ID['feijao'] = { catKey, prodId: p.id, prodNome: p.nome };
    if (p.id === 'oleo')   NOME_PARA_ID['oleo']   = { catKey, prodId: p.id, prodNome: p.nome };
  });
});

function normalizeName(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,' ').trim();
}

function findProduct(nome) {
  const norm = normalizeName(nome);
  // Busca exata
  if (NOME_PARA_ID[norm]) return NOME_PARA_ID[norm];
  // Busca parcial — encontra o produto que mais se aproxima
  let best = null; let bestScore = 0;
  Object.entries(NOME_PARA_ID).forEach(([key, val]) => {
    const words = norm.split(' ').filter(w => w.length > 2);
    const matches = words.filter(w => key.includes(w)).length;
    if (matches > bestScore) { bestScore = matches; best = val; }
  });
  return bestScore > 0 ? best : null;
}

function onPhotoSelected() {
  const file = document.getElementById('mov-photo').files[0];
  if (file) {
    document.getElementById('mov-photo-camera').value = '';
    document.getElementById('mov-photo-preview-name').textContent = '📎 ' + file.name;
  }
  document.getElementById('btn-read-ai').disabled = !file;
  document.getElementById('ai-result-box').style.display = 'none';
}

function onCameraPhotoSelected() {
  const file = document.getElementById('mov-photo-camera').files[0];
  if (!file) return;
  // DataTransfer não é suportado no iOS/Safari WebView; nesse caso mantemos o
  // arquivo no input da câmera e deixamos readFormWithAI decidir qual usar.
  try {
    const dt = new DataTransfer();
    dt.items.add(file);
    document.getElementById('mov-photo').files = dt.files;
  } catch(e) {
    // fallback silencioso — readFormWithAI vai buscar em mov-photo-camera
    console.warn('DataTransfer nao suportado; arquivo ficará em mov-photo-camera.');
  }
  document.getElementById('mov-photo-preview-name').textContent = '📸 Foto tirada agora';
  document.getElementById('btn-read-ai').disabled = false;
  document.getElementById('ai-result-box').style.display = 'none';
}

// Comprimir a foto no navegador antes de enviar — evita o erro 413 (payload
// too large) porque Vercel Functions têm limite fixo de 4.5MB por requisição,
// e uma foto de câmera sem compressão facilmente passa disso em base64.
function compressImageFile(file, maxDim = 1600, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > height && width > maxDim) {
        height = Math.round(height * (maxDim / width));
        width = maxDim;
      } else if (height >= width && height > maxDim) {
        width = Math.round(width * (maxDim / height));
        height = maxDim;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error('Falha ao comprimir imagem')); return; }
        const reader = new FileReader();
        reader.onload = e => resolve({ base64: e.target.result.split(',')[1], mimeType: 'image/jpeg', sizeBytes: blob.size });
        reader.onerror = () => reject(new Error('Falha ao ler imagem comprimida'));
        reader.readAsDataURL(blob);
      }, 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível carregar a imagem para compressão')); };
    img.src = url;
  });
}

// Tenta compressão em 2 níveis; se mesmo assim ficar grande demais, quem chama
// decide o que fazer (ver checagem de tamanho em readFormWithAI).
async function compressImageForUpload(file) {
  let result = await compressImageFile(file, 1600, 0.75);
  const approxBytes = result.base64.length * 0.75; // base64 -> bytes aprox.
  if (approxBytes > 3.5 * 1024 * 1024) {
    result = await compressImageFile(file, 1200, 0.6);
  }
  return result;
}

async function readFormWithAI() {
  // Tenta mov-photo primeiro; se vazio (iOS/DataTransfer falhou), usa mov-photo-camera
  const file = document.getElementById('mov-photo').files[0]
             || document.getElementById('mov-photo-camera').files[0];
  if (!file) { showToast('Selecione uma foto primeiro!'); return; }

  const btn = document.getElementById('btn-read-ai');
  const origText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Lendo...';

  const resultBox = document.getElementById('ai-result-box');
  const resultText = document.getElementById('ai-result-text');
  resultBox.style.display = 'none';

  try {
    // Converter foto para base64, comprimindo antes para não estourar o limite
    // de 4.5MB de payload das Vercel Functions (esse era o motivo do erro 413).
    let base64, mimeType;
    try {
      const compressed = await compressImageForUpload(file);
      base64 = compressed.base64;
      mimeType = compressed.mimeType;
      console.log(`Foto comprimida para ~${(compressed.sizeBytes/1024/1024).toFixed(2)}MB antes do envio (original: ${(file.size/1024/1024).toFixed(2)}MB).`);
    } catch (compErr) {
      console.warn('Falha ao comprimir imagem, tentando enviar original:', compErr);
      base64 = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = e => res(e.target.result.split(',')[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      mimeType = file.type || 'image/jpeg';
    }

    // Guarda final: se mesmo após comprimir o payload ainda estiver perto do
    // limite da Vercel, avisa com uma mensagem clara em vez de deixar estourar 413.
    const payloadBytesAprox = base64.length * 0.75;
    if (payloadBytesAprox > 4 * 1024 * 1024) {
      throw new Error('A foto continua grande demais mesmo após compressão. Tente tirar a foto com menos zoom/resolução ou em modo de qualidade menor na câmera.');
    }

    // Monta lista de todos os produtos para o prompt
    const todosProdutos = [];
    Object.entries(CATEGORIAS).forEach(([catKey, cat]) => {
      cat.produtos.forEach(p => todosProdutos.push(p.nome));
    });

    const prompt = `Você é um sistema de leitura de formulários da Obra Lumen, uma ONG.

Analise esta foto de um formulário físico de suprimentos preenchido à mão.
O formulário tem linhas com nomes de produtos e duas colunas: "Entrada" e "Saída".

Lista completa de produtos possíveis:
${todosProdutos.join(', ')}

Sua tarefa:
1. Identifique APENAS os produtos que têm algum número preenchido (não vazios)
2. Para cada produto preenchido, informe o valor na coluna Entrada e/ou Saída
3. Ignore linhas em branco ou ilegíveis

Retorne SOMENTE um JSON válido, sem markdown, sem explicação:
{"itens":[{"produto":"Nome exato do produto","entrada":numero_ou_null,"saida":numero_ou_null}]}

Exemplo: {"itens":[{"produto":"Arroz (Branco/Parboilizado)","entrada":50,"saida":null},{"produto":"Feijão (Corda/Carioca/Preto)","entrada":null,"saida":10}]}`;

    const payload = {
      contents: [{ parts: [
        { inline_data: { mime_type: mimeType, data: base64 } },
        { text: prompt }
      ]}],
      generationConfig: { temperature: 0.1 }
    };

    const resp = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      const errMsg = errData?.error?.message || `HTTP ${resp.status}`;
      console.error('Gemini API error:', errData);
      throw new Error(`Erro API: ${resp.status} — ${errMsg}`);
    }

    const data = await resp.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonStr = rawText.replace(/```json|```/g,'').trim();
    const parsed = JSON.parse(jsonStr);

    if (!parsed.itens?.length) {
      resultText.innerHTML = '⚠️ Nenhum item preenchido foi encontrado na foto. Verifique se a imagem está legível e tente novamente.';
      resultBox.style.display = 'block';
      resultBox.style.background = 'var(--warn-bg)';
      resultBox.style.borderColor = 'rgba(212,137,10,0.3)';
      btn.disabled = false; btn.innerHTML = origText;
      return;
    }

    // Preencher movItems com o que a IA leu
    // Reseta primeiro
    movItems = initItemObjects();

    let encontrados = 0;
    let naoEncontrados = [];
    const detalhes = { entrada: [], saida: [] };

    parsed.itens.forEach(item => {
      const prod = findProduct(item.produto);
      if (!prod) { naoEncontrados.push(item.produto); return; }

      if (item.entrada && item.entrada > 0) {
        if (!movItems[prod.catKey]) movItems[prod.catKey] = {};
        movItems[prod.catKey][prod.prodId] = item.entrada;
        detalhes.entrada.push(`${prod.prodNome}: ${item.entrada}`);
        encontrados++;
      }
      if (item.saida && item.saida > 0) {
        // Saídas ficam num objeto separado para registrar depois
        if (!movItems[prod.catKey]) movItems[prod.catKey] = {};
        // Se já tem entrada, prioriza a entrada; saída será registrada separada
        if (movItems[prod.catKey][prod.prodId] === undefined) {
          movItems[prod.catKey][prod.prodId] = item.saida;
        }
        detalhes.saida.push(`${prod.prodNome}: ${item.saida}`);
        encontrados++;
      }
    });

    // Detectar automaticamente se é entrada ou saída predominante
    const hasEntrada = detalhes.entrada.length > 0;
    const hasSaida   = detalhes.saida.length > 0;
    if (hasEntrada && !hasSaida) document.getElementById('mov-type').value = 'entrada';
    if (hasSaida && !hasEntrada) document.getElementById('mov-type').value = 'saida';

    // Atualiza a UI
    setMovCat(movCat); // re-render na aba atual

    // Mostra resultado
    let html = `<strong>✅ IA identificou ${encontrados} item(s) preenchido(s):</strong><br><br>`;
    if (detalhes.entrada.length) html += `<strong>📥 Entradas:</strong> ${detalhes.entrada.join(', ')}<br>`;
    if (detalhes.saida.length)   html += `<strong>📤 Saídas:</strong> ${detalhes.saida.join(', ')}<br>`;
    if (naoEncontrados.length)   html += `<br><span style="color:var(--warn);">⚠️ Não reconhecidos: ${naoEncontrados.join(', ')}</span>`;
    html += `<br><br><em>Revise os valores nas abas abaixo antes de confirmar.</em>`;
    resultText.innerHTML = html;
    resultBox.style.display = 'block';
    resultBox.style.background = 'var(--ok-bg)';
    resultBox.style.borderColor = 'rgba(26,122,68,0.3)';
    resultBox.style.color = 'var(--text)';

    // Vai para a aba com mais itens
    const catCounts = Object.entries(movItems).map(([k,v]) => ({ k, n: Object.keys(v).length }));
    const maxCat = catCounts.sort((a,b) => b.n - a.n)[0];
    if (maxCat?.n > 0) setMovCat(maxCat.k);

    showToast(`✅ IA preencheu ${encontrados} item(s). Revise e confirme!`);

  } catch(e) {
    console.error(e);
    resultText.innerHTML = `❌ Erro ao ler o formulário: ${e.message}. Verifique se a foto está nítida e tente novamente.`;
    resultBox.style.display = 'block';
    resultBox.style.background = 'var(--danger-bg)';
    resultBox.style.borderColor = '#f5c6c4';
    resultBox.style.color = 'var(--danger)';
  }

  btn.disabled = false;
  btn.innerHTML = origText;
}

// ─────────────────────────────────────────────
// 📥📤  MOVIMENTAÇÃO DE ESTOQUE
// ─────────────────────────────────────────────
let movCat = 'cereal';
let movItems = { cereal: {}, higiene: {}, proteina: {}, missa_sf: {}, lanches_csl: {} };

function setMovCat(cat) {
  movCat = cat;
  // Regenera abas dinamicamente
  const movTabsEl = document.querySelector('#page-movement .cat-tabs');
  if (movTabsEl) {
    movTabsEl.innerHTML = Object.entries(CATEGORIAS).map(([k,c]) => `
      <button class="cat-tab ${k===cat?'active':''}" data-cat="${k}" onclick="setMovCat('${k}')">
        ${c.icon} ${c.nome} <span class="cat-count" id="mcount-${k}"></span>
      </button>`).join('');
  }
  Object.keys(CATEGORIAS).forEach(k => { if (!movItems[k]) movItems[k] = {}; });
  const info = CATEGORIAS[cat];
  document.getElementById('mov-cat-header').querySelector('.card-header-title').textContent = `${info.icon} ${info.nome}`;
  renderMovProducts();
}

function renderMovProducts() {
  const cat = movCat;
  const prods = CATEGORIAS[cat].produtos;
  const el = document.getElementById('mov-products-list');
  el.innerHTML = prods.map(p => {
    const isChecked = movItems[cat][p.id] !== undefined;
    const qty = movItems[cat][p.id] || '';
    return `<div class="prod-row" onclick="toggleMovItem(event,'${cat}','${p.id}')">
      <div class="prod-checkbox ${isChecked ? 'checked' : ''}" id="mchk-${cat}-${p.id}"></div>
      <div class="prod-name">${p.nome}</div>
      <span class="prod-unit">${p.unidade}</span>
      ${isChecked
        ? `<input class="prod-qty-input" type="number" min="0.1" step="0.1" value="${qty}" onclick="event.stopPropagation()" onchange="setMovQty('${cat}','${p.id}',this.value)" placeholder="Qtd">`
        : '<span style="width:70px;"></span>'
      }
    </div>`;
  }).join('');
  updateMovSummary();
}

function toggleMovItem(event, cat, prodId) {
  if (event.target.tagName === 'INPUT') return;
  if (movItems[cat][prodId] !== undefined) {
    delete movItems[cat][prodId];
  } else {
    movItems[cat][prodId] = 1;
  }
  renderMovProducts();
}

function setMovQty(cat, prodId, val) {
  movItems[cat][prodId] = parseFloat(val) || 0;
  updateMovSummary();
}

function updateMovSummary() {
  let total = 0;
  Object.values(movItems).forEach(c => { total += Object.keys(c).length; });
  document.getElementById('mov-total-summary').textContent = `${total} item(s) selecionado(s)`;
  document.getElementById('btn-submit-mov').disabled = total === 0;
  Object.entries(CATEGORIAS).forEach(([k]) => {
    const count = Object.keys(movItems[k] || {}).length;
    const el = document.getElementById(`mcount-${k}`);
    if (el) el.textContent = count > 0 ? count : '';
  });
  // Totais gerais
  let tot2 = 0; Object.values(movItems).forEach(c => { tot2 += Object.keys(c).length; });
  const totEl = document.getElementById('mov-total-summary');
  if (totEl) totEl.textContent = `${tot2} item(s) selecionado(s)`;
}

function clearMovement() {
  movItems = initItemObjects();
  renderMovProducts();
}

async function submitMovement() {
  const house    = document.getElementById('mov-house').value;
  const type     = document.getElementById('mov-type').value;
  const date     = document.getElementById('mov-date').value;
  const obs      = document.getElementById('mov-obs').value;
  const photo    = document.getElementById('mov-photo').files[0]
                || document.getElementById('mov-photo-camera').files[0];
  const isDonation = document.getElementById('mov-is-donation').value === 'true';

  if (!house) { showToast('Selecione a casa!'); return; }
  if (!date)  { showToast('Informe a data!'); return; }

  let total = 0;
  Object.values(movItems).forEach(c => { total += Object.keys(c).length; });
  if (total === 0) { showToast('Adicione ao menos um item!'); return; }

  setBtnLoading('btn-submit-mov', true);

  // Converte foto para base64 para guardar no Firestore (até ~500KB recomendado)
  let photoBase64 = null;
  if (photo) {
    if (photo.size > 800000) {
      showToast('⚠️ Foto muito grande. Reduzindo qualidade para salvar...');
    }
    photoBase64 = await new Promise((res) => {
      const reader = new FileReader();
      reader.onload = e => res(e.target.result);
      reader.readAsDataURL(photo);
    });
  }

  // Monta lista de itens
  const entries = [];
  Object.entries(movItems).forEach(([catKey, prods]) => {
    Object.entries(prods).forEach(([prodId, qty]) => {
      const p = CATEGORIAS[catKey].produtos.find(x => x.id === prodId);
      if (p && qty > 0) entries.push({ catKey, prodId, prodNome: p.nome, unidade: p.unidade, qty });
    });
  });

  // Gera código da movimentação — prefixo = sigla da casa
  const dateStr = date.replace(/-/g,'');
  const todaySnap = await db.collection('movements').where('dateStr','==',dateStr).get();
  const seq = String(todaySnap.size + 1).padStart(3,'0');
  const typeCode = type === 'entrada' ? 'ENT' : 'SAI';
  const donCode  = isDonation ? '-DOA' : '';
  const prefixMov = siglaCasa(house); // sigla da casa no lugar de "LM"
  const code = `OB-${prefixMov}-${typeCode}${donCode}-${dateStr}-${seq}`;

  const movData = {
    code, house, type, date, dateStr, obs,
    isDonation,
    items: entries,
    photoBase64: photoBase64 ? photoBase64.substring(0, 900000) : null, // limite Firestore ~1MB
    leituraIA: document.getElementById('ai-result-box').style.display !== 'none',
    registeredBy: currentUserData.name,
    registeredUid: currentUser.uid,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    await db.collection('movements').add(movData);
    clearMovement();
    document.getElementById('mov-obs').value = '';
    document.getElementById('mov-photo').value = '';
    document.getElementById('mov-photo-camera').value = '';
    document.getElementById('mov-photo-preview-name').textContent = 'Nenhuma foto selecionada';
    document.getElementById('btn-read-ai').disabled = true;
    document.getElementById('ai-result-box').style.display = 'none';
    // Reset donation toggle
    const tog = document.getElementById('donation-toggle');
    if (tog) { tog.classList.remove('active'); document.getElementById('donation-toggle-label').textContent = 'Não — Compra/Regular'; document.getElementById('mov-is-donation').value='false'; }
    const donLabel = isDonation ? ' (Doação 🎁)' : '';
    showToast(`✅ ${type === 'entrada' ? 'Entrada' : 'Saída'}${donLabel} registrada! Código: ${code}`);
  } catch(e) {
    console.error(e);
    if (e.message?.includes('exceeds')) {
      showToast('Foto muito grande para salvar. Tente com uma imagem menor.');
    } else {
      showToast('Erro ao registrar. Verifique o console.');
    }
  }
  setBtnLoading('btn-submit-mov', false);
}

// ─────────────────────────────────────────────
// 📦  ESTOQUE ATUAL — GRADE DE CASAS
// ─────────────────────────────────────────────

// Paleta de cores para as casas (rotaciona)
const SV_COLORS = [
  '#2B9FA8','#7C3AED','#D4890A','#C0392B','#1560BD',
  '#0F6E56','#9B2335','#5B4FCF','#2E7D32','#00838F',
  '#6A1B9A','#E65100','#37474F','#AD1457','#1565C0',
  '#4E342E','#00695C'
];

function svStatusFromPct(pct) {
  if (pct >= 80) return { label:'Excelente', cls:'sv-excelente', bar:'sv-bar-excelente' };
  if (pct >= 60) return { label:'Ótimo',     cls:'sv-otimo',     bar:'sv-bar-otimo'     };
  if (pct >= 40) return { label:'Bom',       cls:'sv-bom',       bar:'sv-bar-bom'       };
  if (pct >= 20) return { label:'Atenção',   cls:'sv-atencao',   bar:'sv-bar-atencao'   };
  return             { label:'Urgência',  cls:'sv-urgencia',  bar:'sv-bar-urgencia'  };
}

function svStatusFromDays(days) {
  const pct = Math.min(Math.round((days / 20) * 100), 100);
  return { ...svStatusFromPct(pct), pct };
}

// Cache de movimentações para não recarregar ao abrir detalhe
let _svMovSnap = null;
let _svHousesData = {};

async function loadStockView() {
  document.getElementById('sv-loading').style.display = 'flex';
  document.getElementById('sv-houses-grid').innerHTML = '';
  document.getElementById('sv-screen-houses').classList.remove('hidden');
  document.getElementById('sv-screen-detail').classList.add('hidden');

  // Carrega movimentações e dados de pessoas em paralelo
  const [movSnap, housesSnap] = await Promise.all([
    db.collection('movements').get(),
    db.collection('houses').get()
  ]);
  _svMovSnap = movSnap;

  // Mapeia nome da casa → total de pessoas
  _svHousesData = {};
  housesSnap.docs.forEach(d => {
    const h = d.data();
    const nome = h.name || d.id;
    const total = (h.acolhidos || h.currentPeople || 0) + (h.coordenadores || 0) + (h.extra || 0);
    _svHousesData[nome] = { people: total || 1 };
  });

  // Agrega: saldo[casa][catKey][prodId] = { e, s, nome, unidade, ppp }
  const saldo = {};
  movSnap.docs.forEach(d => {
    const m = d.data();
    if (!m.house || !m.items) return;
    if (!saldo[m.house]) saldo[m.house] = {};
    m.items.forEach(item => {
      if (!item.catKey || !item.prodId) return;
      if (!saldo[m.house][item.catKey]) saldo[m.house][item.catKey] = {};
      if (!saldo[m.house][item.catKey][item.prodId]) {
        // Busca o ppp do produto no CATEGORIAS
        const catDef = CATEGORIAS[item.catKey];
        const prodDef = catDef ? catDef.produtos.find(p => p.id === item.prodId) : null;
        saldo[m.house][item.catKey][item.prodId] = {
          e: 0, s: 0,
          nome: nomeProdutoAtual(item.catKey, item.prodId, item.prodNome),
          unidade: item.unidade || '',
          ppp: prodDef ? (prodDef.ppp || 0) : 0
        };
      }
      if (m.type === 'entrada') saldo[m.house][item.catKey][item.prodId].e += (item.qty || 0);
      else                      saldo[m.house][item.catKey][item.prodId].s += (item.qty || 0);
    });
  });

  // Renderiza os cards das casas
  const grid = document.getElementById('sv-houses-grid');
  document.getElementById('sv-loading').style.display = 'none';

  if (Object.keys(saldo).length === 0) {
    grid.innerHTML = '<p class="text-muted" style="padding:24px;">Nenhuma movimentação registrada ainda.</p>';
    return;
  }

  // Garante que todas as casas apareçam (mesmo sem movimentações)
  CASAS.forEach(casa => { if (!saldo[casa]) saldo[casa] = {}; });

  const catKeys = Object.keys(CATEGORIAS);

  grid.innerHTML = Object.entries(saldo).map(([casa, cats], idx) => {
    const people = (_svHousesData[casa] && _svHousesData[casa].people) || 1;
    const color  = SV_COLORS[idx % SV_COLORS.length];
    const initial = casa.charAt(0).toUpperCase();

    // Saúde por categoria
    const catHealths = catKeys.map(catKey => {
      const catDef = CATEGORIAS[catKey];
      const prods  = cats[catKey] || {};
      const allProds = catDef ? catDef.produtos : [];

      if (allProds.length === 0 && Object.keys(prods).length === 0) return null;

      // Calcula pct de cada produto com movimentação
      const pcts = Object.entries(prods).map(([, d]) => {
        const stock = Math.max(d.e - d.s, 0);
        const dailyUse = d.ppp * people;
        if (dailyUse <= 0) return 100;
        const days = stock / dailyUse;
        return Math.min(Math.round((days / 20) * 100), 100);
      });

      if (pcts.length === 0) return { catKey, catDef, pct: 0 };
      const avg = Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
      return { catKey, catDef, pct: avg };
    }).filter(Boolean);

    const avgHealth = catHealths.length
      ? Math.round(catHealths.reduce((a, c) => a + c.pct, 0) / catHealths.length)
      : 0;

    const st = svStatusFromPct(avgHealth);

    const bars = catHealths.map(c => {
      const cst = svStatusFromPct(c.pct);
      const icon = c.catDef ? c.catDef.icon : '📦';
      const nome = c.catDef ? c.catDef.nome : c.catKey;
      return `<div class="sv-cat-row">
        <span class="sv-cat-label" title="${nome}">${icon} ${nome}</span>
        <div class="sv-bar-track"><div class="sv-bar-fill ${cst.bar}" style="width:${c.pct}%"></div></div>
        <span class="sv-cat-pct" style="color:var(--text-muted)">${c.pct}%</span>
      </div>`;
    }).join('');

    return `<div class="sv-house-card" onclick="svOpenHouse('${casa.replace(/'/g,"\\'")}')">
      <div class="sv-house-header">
        <div class="sv-house-avatar" style="background:${color}">${initial}</div>
        <div>
          <div class="sv-house-name">${casa}</div>
          <div class="sv-house-people">${people} pessoa${people !== 1 ? 's' : ''}</div>
        </div>
      </div>
      <div class="sv-cat-bars">${bars}</div>
      <div class="sv-house-score">
        <span class="sv-score-label">Saúde geral</span>
        <span class="sv-badge ${st.cls}">${avgHealth}% — ${st.label}</span>
      </div>
    </div>`;
  }).join('');
}

async function svOpenHouse(casa) {
  document.getElementById('sv-screen-houses').classList.add('hidden');
  document.getElementById('sv-screen-detail').classList.remove('hidden');
  document.getElementById('sv-detail-title').textContent = casa;

  const people = (_svHousesData[casa] && _svHousesData[casa].people) || 1;

  // Agrega produtos desta casa a partir do cache
  const prodMap = {}; // catKey+prodId → dados
  if (_svMovSnap) {
    _svMovSnap.docs.forEach(d => {
      const m = d.data();
      if (m.house !== casa || !m.items) return;
      m.items.forEach(item => {
        const key = (item.catKey || '') + '||' + (item.prodId || '');
        if (!prodMap[key]) {
          const catDef  = CATEGORIAS[item.catKey];
          const prodDef = catDef ? catDef.produtos.find(p => p.id === item.prodId) : null;
          prodMap[key] = {
            catKey: item.catKey, catDef,
            prodId: item.prodId,
            nome: nomeProdutoAtual(item.catKey, item.prodId, item.prodNome),
            unidade: item.unidade || '',
            ppp: prodDef ? (prodDef.ppp || 0) : 0,
            e: 0, s: 0
          };
        }
        if (m.type === 'entrada') prodMap[key].e += (item.qty || 0);
        else                      prodMap[key].s += (item.qty || 0);
      });
    });
  }

  // Load exclusion list for this house
  let _svExcluded = {};
  try {
    const exSnap = await db.collection('config').doc('stock_exclusions').get();
    if (exSnap.exists) _svExcluded = exSnap.data() || {};
  } catch(e) {}

  const rows = Object.values(prodMap)
    .filter(r => !_svExcluded[casa + '||' + r.catKey + '||' + r.prodId])
    .sort((a, b) => {
      if (a.catKey < b.catKey) return -1;
      if (a.catKey > b.catKey) return 1;
      return a.nome.localeCompare(b.nome);
    });

  // Meta chips
  // Health %: proteína usa dias compartilhados, demais usam ppp individual
  const _protDailyKg = people * 0.13 * 2;
  const _protTotalKg = rows.filter(r => r.catKey === 'proteina')
    .reduce((s, r) => s + Math.max(r.e - r.s, 0), 0);
  const _protDays = _protDailyKg > 0 ? _protTotalKg / _protDailyKg : 999;

  const avgPct = rows.length ? (() => {
    // Para proteína, todas as linhas compartilham o mesmo % (dias totais)
    const seenProt = new Set();
    const pcts = rows.map(r => {
      if (r.catKey === 'proteina') {
        if (seenProt.size > 0) return null; // conta proteína só uma vez
        seenProt.add(1);
        return Math.min(Math.round((_protDays / 20) * 100), 100);
      }
      const stock = Math.max(r.e - r.s, 0);
      const daily = r.ppp * people;
      if (daily <= 0) return 100;
      return Math.min(Math.round(((stock / daily) / 20) * 100), 100);
    }).filter(v => v !== null);
    return Math.round(pcts.reduce((a,b)=>a+b,0) / pcts.length);
  })() : 0;
  const metaSt = svStatusFromPct(avgPct);

  document.getElementById('sv-detail-meta').innerHTML =
    `<span class="sv-meta-chip">👥 ${people} pessoa${people !== 1 ? 's' : ''}</span>` +
    `<span class="sv-meta-chip">📊 Saúde: ${avgPct}%</span>` +
    `<span class="sv-badge ${metaSt.cls}" style="font-size:12px;padding:4px 12px;">${metaSt.label}</span>`;

  if (rows.length === 0) {
    document.getElementById('sv-detail-tbody').innerHTML =
      '<tr><td colspan="7" class="text-muted" style="text-align:center;padding:32px;">Nenhuma movimentação registrada para esta casa.</td></tr>';
    return;
  }

  // ── Proteína: soma todo o estoque e calcula dias pelo total ──────────────
  // Fórmula: totalKg / (pessoas × 0,13 kg/pessoa/refeição × 2 refeições/dia)
  const PROTEIN_KG_PESSOA_REFEICAO = 0.13;
  const PROTEIN_REFEICOES_DIA      = 2;
  const proteinDailyKg = people * PROTEIN_KG_PESSOA_REFEICAO * PROTEIN_REFEICOES_DIA;
  const proteinTotalKg = rows
    .filter(r => r.catKey === 'proteina')
    .reduce((sum, r) => sum + Math.max(r.e - r.s, 0), 0);
  const proteinDaysShared = proteinDailyKg > 0
    ? Math.round(proteinTotalKg / proteinDailyKg)
    : 999;
  // ──────────────────────────────────────────────────────────────────────────

  // Store rows for filtering
  _svAllRows = [];

  document.getElementById('sv-detail-tbody').innerHTML = rows.map(r => {
    const stock = Math.max(r.e - r.s, 0);

    // Proteína usa cálculo compartilhado (todos os tipos somados)
    let days, daily;
    if (r.catKey === 'proteina') {
      days  = proteinDaysShared;
      daily = proteinDailyKg; // para referência
    } else {
      daily = r.ppp * people;
      days  = daily > 0 ? Math.round(stock / daily) : 999;
    }

    const pct   = Math.min(Math.round((days / 20) * 100), 100);
    const st    = svStatusFromDays(days === 999 ? 20 : days);
    const catIcon = r.catDef ? r.catDef.icon : '📦';
    const catNome = r.catDef ? r.catDef.nome : r.catKey;
    const daysLabel = days >= 999 ? '∞' : days + 'd';
    const barPct = days >= 999 ? 100 : pct;
    const isAdminLvl = currentUserData && ['admin','diretor','gerente','coordenador'].includes(currentUserData.role);
    const delKey     = encodeURIComponent(casa + '||' + r.catKey + '||' + r.prodId);
    const isGhost    = !r.catDef || !r.catDef.produtos.find(p => p.id === r.prodId);
    const ghostBadge = isGhost ? `<span title="Produto não cadastrado" style="font-size:10px;color:var(--warn);margin-left:4px;">⚠️</span>` : '';
    const delBtn     = isAdminLvl
      ? `<button title="Excluir produto do estoque desta casa" onclick="svExcluirProduto('${casa}','${r.catKey}','${r.prodId}','${r.nome}')"
           style="background:none;border:none;cursor:pointer;font-size:14px;padding:2px 6px;border-radius:6px;color:var(--danger);opacity:0.7;"
           onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=0.7">🗑️</button>`
      : '';
    const _rowHtml = `<tr>
      <td style="font-weight:600">${r.nome}${ghostBadge}</td>
      <td><span style="font-size:12px;background:var(--lumen-lt,#E6F6F7);color:var(--lumen);padding:2px 8px;border-radius:99px;">${catIcon} ${catNome}</span></td>
      <td style="text-align:right;color:var(--ok);font-weight:600">+${r.e % 1 === 0 ? r.e : r.e.toFixed(2)} ${r.unidade}</td>
      <td style="text-align:right;color:var(--danger);font-weight:600">−${r.s % 1 === 0 ? r.s : r.s.toFixed(2)} ${r.unidade}</td>
      <td style="text-align:right;font-weight:700">${stock % 1 === 0 ? stock : stock.toFixed(2)} ${r.unidade}</td>
      <td style="text-align:right">
        <div style="display:inline-flex;align-items:center;gap:6px;">
          <div style="width:50px;height:5px;background:var(--border);border-radius:99px;overflow:hidden;">
            <div style="height:100%;border-radius:99px;width:${barPct}%" class="${st.bar}"></div>
          </div>
          <span style="font-weight:600">${daysLabel}</span>
        </div>
      </td>
      <td><span class="sv-badge ${st.cls}">${st.label}</span></td>
      <td style="text-align:center">${delBtn}</td>
    </tr>`;
    _svAllRows.push({ cat: r.catKey, nome: r.nome, html: _rowHtml });
    return _rowHtml;
  }).join('');

  // Apply any active filter (e.g. after refresh)
  svFilterRows();
}

// State for category filter
let _svCatFilter = 'todos';
let _svAllRows   = []; // stores full rendered TR HTML per row, with data-cat attr

function svGoBack() {
  _svCatFilter = 'todos';
  _svAllRows   = [];
  // Reset tab UI
  document.querySelectorAll('.sv-cat-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.cat === 'todos');
  });
  const si = document.getElementById('sv-search-prod');
  if (si) si.value = '';
  document.getElementById('sv-screen-detail').classList.add('hidden');
  document.getElementById('sv-screen-houses').classList.remove('hidden');
}

function svSetCat(btn, cat) {
  _svCatFilter = cat;
  document.querySelectorAll('.sv-cat-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  svFilterRows();
}

function svFilterRows() {
  const search = (document.getElementById('sv-search-prod')?.value || '').toLowerCase().trim();
  const tbody  = document.getElementById('sv-detail-tbody');
  if (!tbody || !_svAllRows.length) return;

  const visible = _svAllRows.filter(r => {
    const catOk  = _svCatFilter === 'todos' || r.cat === _svCatFilter;
    const termOk = !search || r.nome.toLowerCase().includes(search);
    return catOk && termOk;
  });

  if (!visible.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-muted" style="text-align:center;padding:24px;">Nenhum produto encontrado para esta categoria.</td></tr>';
  } else {
    tbody.innerHTML = visible.map(r => r.html).join('');
  }
}

async function svRefreshDetail() {
  const casa = document.getElementById('sv-detail-title').textContent;
  if (!casa) return;

  // Spinning animation
  const icon = document.getElementById('sv-refresh-icon');
  const btn  = document.getElementById('sv-refresh-btn');
  if (icon) icon.style.animation = 'spin 0.7s linear infinite';
  if (btn)  btn.disabled = true;

  try {
    // Recarrega os movimentos do Firebase
    const [movSnap, housesSnap] = await Promise.all([
      db.collection('movements').get(),
      db.collection('houses').get()
    ]);

    _svMovSnap = movSnap;

    _svHousesData = {};
    housesSnap.docs.forEach(d => {
      const h    = d.data();
      const nome = h.name || d.id;
      const total = (h.acolhidos || h.currentPeople || 0) + (h.coordenadores || 0) + (h.extra || 0);
      _svHousesData[nome] = { people: total || 1 };
    });

    await svOpenHouse(casa);
    showToast('✅ Estoque atualizado!');
  } catch(e) {
    showToast('Erro ao atualizar: ' + e.message);
  } finally {
    if (icon) icon.style.animation = '';
    if (btn)  btn.disabled = false;
  }
}

async function svExcluirProduto(casa, catKey, prodId, nome) {
  if (!confirm(`Remover "${nome}" do estoque de "${casa}"?\n\nIsso não apaga as movimentações — apenas oculta o produto da tela. Pode ser revertido pelo Firebase.`)) return;
  try {
    const key = casa + '||' + catKey + '||' + prodId;
    await db.collection('config').doc('stock_exclusions').set(
      { [key]: true },
      { merge: true }
    );
    showToast(`✅ "${nome}" ocultado do estoque de "${casa}"!`);
    // Recarrega a tela de detalhe
    const btn = document.querySelector('#sv-detail-title');
    svOpenHouse(casa);
  } catch(e) {
    showToast('Erro ao excluir: ' + e.message);
    console.error(e);
  }
}

// ─────────────────────────────────────────────
// 📂  SUB-ABAS — ORÇAMENTOS PENDENTES
// ─────────────────────────────────────────────
function opcSetSubTab(tab) {
  ['pendentes','historico'].forEach(t => {
    document.getElementById(`opc-tab-${t}`).classList.toggle('active', t === tab);
    document.getElementById(`opc-screen-${t}`).classList.toggle('active', t === tab);
  });
  if (tab === 'historico') {
    // Popula select de casas no histórico
    const sel = document.getElementById('hist-filtro-casa');
    if (sel && sel.options.length <= 1) {
      CASAS.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; sel.appendChild(o); });
    }
    // Popula select de fornecedores
    histPopularFornecedores();
    // Define período padrão: últimas 2 semanas
    histSetQuick(document.querySelector('.hist-qbtn.active'), 14);
    // Mostra os cards e tabela
    document.getElementById('hist-stat-grid').style.display = 'grid';
    document.getElementById('hist-comp-card') && (document.getElementById('hist-comp-card').style.display = 'block');
    // Carrega seleção de casas válidas para orçamento (só na primeira vez)
    if (!_orcCasasAtivas) orcCasasCarregar();
  }
}

// ─────────────────────────────────────────────
// 📂  HISTÓRICO DE AUTORIZADOS
// ─────────────────────────────────────────────
const FMT_HIST = v => 'R$ ' + parseFloat(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});

function histSetQuick(btn, days) {
  document.querySelectorAll('.hist-qbtn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  if (!days) return;
  const fim = new Date();
  const ini = new Date(); ini.setDate(ini.getDate() - days);
  document.getElementById('hist-fim').value = fim.toISOString().split('T')[0];
  document.getElementById('hist-ini').value = ini.toISOString().split('T')[0];
}

async function histPopularFornecedores() {
  const sel = document.getElementById('hist-filtro-forn');
  if (!sel || sel.options.length > 1) return;
  try {
    const snap = await db.collection('suppliers').orderBy('nome').get();
    snap.docs.forEach(d => {
      const o = document.createElement('option');
      o.value = d.id; o.textContent = d.data().nome || d.id;
      sel.appendChild(o);
    });
  } catch(e) {}
}

async function histBuscar() {
  const ini  = document.getElementById('hist-ini').value;
  const fim  = document.getElementById('hist-fim').value;
  const casa = document.getElementById('hist-filtro-casa').value;
  const cat  = document.getElementById('hist-filtro-cat').value;
  const forn = document.getElementById('hist-filtro-forn').value;

  if (!ini || !fim) { showToast('Selecione o período para buscar.'); return; }

  const tbody   = document.getElementById('hist-tbody');
  const loading = document.getElementById('hist-loading');
  tbody.innerHTML = '';
  loading.style.display = 'flex';

  try {
    const dtIni = new Date(ini + 'T00:00:00');
    const dtFim = new Date(fim + 'T23:59:59');

    // Busca cotações aprovadas no período
    let query = db.collection('quotations')
      .where('status', '==', 'aprovado')
      .where('createdAt', '>=', dtIni)
      .where('createdAt', '<=', dtFim);

    const cotSnap = await query.get();
    const orderIds = [...new Set(cotSnap.docs.map(d => d.data().orderId).filter(Boolean))];

    // Busca pedidos relacionados
    const pedidoMap = {};
    const chunks = [];
    for (let i = 0; i < orderIds.length; i += 10) chunks.push(orderIds.slice(i, i+10));
    for (const chunk of chunks) {
      const s = await db.collection('orders').where(firebase.firestore.FieldPath.documentId(), 'in', chunk).get();
      s.docs.forEach(d => { pedidoMap[d.id] = d.data(); });
    }

    // Filtra e processa
    let rows = cotSnap.docs.map(d => {
      const q = { id: d.id, ...d.data() };
      const p = pedidoMap[q.orderId] || {};
      return { q, p };
    }).filter(({ q, p }) => {
      if (casa && p.house !== casa) return false;
      if (forn && q.fornecedorId !== forn) return false;
      if (cat) {
        const cats = p.categories || [];
        if (!cats.includes(cat)) return false;
      }
      return true;
    });

    loading.style.display = 'none';

    // Calcula indicadores
    let total = 0, totCereal = 0, totHigiene = 0, totProteina = 0;
    let economia = 0;
    const casasSet = new Set();
    let nCereal = 0, nHigiene = 0, nProteina = 0;

    rows.forEach(({ q, p }) => {
      const val = parseFloat(q.valor || 0);
      total += val;
      casasSet.add(p.house);
      (p.categories || []).forEach(c => {
        const div = (p.categories||[]).length || 1;
        if (c === 'cereal')   { totCereal   += val/div; nCereal++;   }
        if (c === 'higiene')  { totHigiene  += val/div; nHigiene++;  }
        if (c === 'proteina') { totProteina += val/div; nProteina++; }
      });
      // Economia: diferença para a cotação mais cara do mesmo pedido
      const allCots = cotSnap.docs.filter(d => d.data().orderId === q.orderId).map(d => parseFloat(d.data().valor||0));
      if (allCots.length > 1) economia += Math.max(...allCots) - val;
    });

    // Atualiza cards
    document.getElementById('hist-stat-grid').style.display = 'grid';
    const sv = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    sv('hist-s-total',     FMT_HIST(total));
    sv('hist-s-total-n',   `${rows.length} cotação${rows.length !== 1 ? 'ões' : ''}`);
    sv('hist-s-cereal',    FMT_HIST(totCereal));
    sv('hist-s-cereal-n',  `${nCereal} cotação${nCereal !== 1 ? 'ões' : ''}`);
    sv('hist-s-higiene',   FMT_HIST(totHigiene));
    sv('hist-s-higiene-n', `${nHigiene} cotação${nHigiene !== 1 ? 'ões' : ''}`);
    sv('hist-s-proteina',  FMT_HIST(totProteina));
    sv('hist-s-proteina-n',`${nProteina} cotação${nProteina !== 1 ? 'ões' : ''}`);
    sv('hist-s-economia',  FMT_HIST(economia));
    sv('hist-s-casas',     casasSet.size);
    sv('hist-s-casas-n',   `de ${CASAS.length} casas`);
    sv('hist-count-label', `${rows.length} registro${rows.length !== 1 ? 's' : ''}`);

    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;" class="text-muted">Nenhum orçamento autorizado encontrado neste período.</td></tr>';
      return;
    }

    // Renderiza tabela
    tbody.innerHTML = rows.map(({ q, p }) => {
      const val = parseFloat(q.valor || 0);
      const cats = (p.categories || []).map(c => CATEGORIAS[c] ? CATEGORIAS[c].icon + ' ' + CATEGORIAS[c].nome : c).join(', ');
      const data = q.createdAt?.toDate ? q.createdAt.toDate().toLocaleDateString('pt-BR') : '—';
      const autEm = q.gerenteEm?.toDate ? q.gerenteEm.toDate().toLocaleDateString('pt-BR')
                  : q.coordenadorEm?.toDate ? q.coordenadorEm.toDate().toLocaleDateString('pt-BR') : '—';
      const autPor = q.gerenteNome || q.coordenadorNome || q.createdBy || '—';
      const nivel  = (q.statusGerente === 'aprovado' && q.statusCoordenador === 'aprovado')
        ? '<span class="hist-nivel-ambos">Coord+Ger</span>'
        : q.statusGerente === 'aprovado'
        ? '<span class="hist-nivel-ambos">Gerente</span>'
        : '<span class="hist-nivel-coord">Coord.</span>';
      const allCots = cotSnap.docs.filter(d => d.data().orderId === q.orderId).map(d => parseFloat(d.data().valor||0));
      const isMenor = allCots.length > 1 && val === Math.min(...allCots);
      return `<tr>
        <td>
          <span style="font-size:12px;font-weight:700;color:var(--lumen);">${p.code||q.orderId||'—'}</span>
          <br><span style="font-size:10px;color:var(--text-muted);">${data}</span>
        </td>
        <td style="font-size:13px;">${p.house||'—'}</td>
        <td style="font-size:12px;">${cats||'—'}</td>
        <td style="font-size:12px;font-weight:700;">${q.fornecedorNome||'—'}${isMenor?'<br><span style="font-size:10px;color:var(--ok);font-weight:700;">★ menor preço</span>':''}</td>
        <td style="text-align:right;font-weight:700;color:var(--ok);">${FMT_HIST(val)}</td>
        <td style="font-size:12px;">${autPor}</td>
        <td style="font-size:12px;color:var(--text-muted);">${autEm}</td>
        <td style="text-align:center;">${nivel}</td>
      </tr>`;
    }).join('');

    // Guarda para export
    window._histRows = rows;

  } catch(e) {
    loading.style.display = 'none';
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--danger);">Erro ao buscar histórico: ${e.message}</td></tr>`;
  }
}

