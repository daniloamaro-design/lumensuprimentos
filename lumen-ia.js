// ═══════════════════════════════════════════════════════════════════
//  LUMEN ESTOQUE — MÓDULO IA (GEMINI)
//  Arquivo: lumen-ia.js
//
//  Todas as chamadas de IA foram migradas de /api/claude → Gemini.
//  Usa a função window.callGemini() definida em config.js.
//
//  Funções incluídas:
//  • readFormWithAI()       — leitura de formulário por foto (já existia)
//  • callAIPrevisao()       — análise de previsão de demanda (CORRIGIDO)
//  • runAIFornecedor()      — melhor fornecedor por categoria (CORRIGIDO)
//  • detectarPadraoCritico() — padrão crítico recorrente (CORRIGIDO)
// ═══════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// 🗺️  MAPA DE PRODUTOS (para leitura de formulário)
// ─────────────────────────────────────────────
// Construído dinamicamente a partir de CATEGORIAS

const NOME_PARA_ID = {};
function reconstruirNomesIA() {
  Object.entries(CATEGORIAS).forEach(([catKey, cat]) => {
    cat.produtos.forEach(p => {
      const norm = s => s.toLowerCase().normalize('NFD')
        .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,' ').trim();
      NOME_PARA_ID[norm(p.nome)] = { catKey, prodId: p.id, prodNome: p.nome };
      if (p.id === 'feijao') NOME_PARA_ID['feijao'] = { catKey, prodId: p.id, prodNome: p.nome };
      if (p.id === 'oleo')   NOME_PARA_ID['oleo']   = { catKey, prodId: p.id, prodNome: p.nome };
    });
  });
}

function normalizeName(s) {
  return s.toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,' ').trim();
}

function findProduct(nome) {
  const norm = normalizeName(nome);
  if (NOME_PARA_ID[norm]) return NOME_PARA_ID[norm];
  let best = null; let bestScore = 0;
  Object.entries(NOME_PARA_ID).forEach(([key, val]) => {
    const words = norm.split(' ').filter(w => w.length > 2);
    const matches = words.filter(w => key.includes(w)).length;
    if (matches > bestScore) { bestScore = matches; best = val; }
  });
  return bestScore > 0 ? best : null;
}

// ─────────────────────────────────────────────
// 📷  LEITURA DE FORMULÁRIO POR FOTO (Gemini Vision)
// ─────────────────────────────────────────────

function onPhotoSelected() {
  const file = document.getElementById('mov-photo')?.files[0];
  if (document.getElementById('btn-read-ai')) {
    document.getElementById('btn-read-ai').disabled = !file;
  }
  const box = document.getElementById('ai-result-box');
  if (box) box.style.display = 'none';
}

async function readFormWithAI() {
  const file = document.getElementById('mov-photo')?.files[0];
  if (!file) { showToast('Selecione uma foto primeiro!'); return; }

  const btn      = document.getElementById('btn-read-ai');
  const origText = btn.innerHTML;
  btn.disabled   = true;
  btn.innerHTML  = '<div class="spinner"></div> Lendo...';

  const resultBox  = document.getElementById('ai-result-box');
  const resultText = document.getElementById('ai-result-text');
  if (resultBox) resultBox.style.display = 'none';

  try {
    // Garante que o mapa de nomes está atualizado
    reconstruirNomesIA();

    // Converte foto para base64
    const base64 = await new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload  = e => res(e.target.result.split(',')[1]);
      reader.onerror = rej;
      reader.readAsDataURL(file);
    });

    const mimeType = file.type || 'image/jpeg';

    const todosProdutos = [];
    Object.entries(CATEGORIAS).forEach(([, cat]) => {
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
{"itens":[{"produto":"Nome exato do produto","entrada":numero_ou_null,"saida":numero_ou_null}]}`;

    // Chamada ao Gemini Vision (suporta imagens)
    const resp = await fetch(window.GEMINI_URL_VISION, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { inline_data: { mime_type: mimeType, data: base64 } },
          { text: prompt }
        ]}],
        generationConfig: { temperature: 0.1 }
      })
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(`Gemini Vision erro ${resp.status}: ${errData?.error?.message || ''}`);
    }

    const data    = await resp.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonStr = rawText.replace(/```json|```/g,'').trim();
    const parsed  = JSON.parse(jsonStr);

    if (!parsed.itens?.length) {
      if (resultText) resultText.innerHTML = '⚠️ Nenhum item preenchido foi encontrado na foto. Verifique se a imagem está legível e tente novamente.';
      if (resultBox) {
        resultBox.style.display    = 'block';
        resultBox.style.background = 'var(--warn-bg)';
        resultBox.style.borderColor= 'rgba(212,137,10,0.3)';
      }
      btn.disabled = false; btn.innerHTML = origText;
      return;
    }

    movItems = initItemObjects();
    let encontrados = 0, naoEncontrados = [];
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
        if (!movItems[prod.catKey]) movItems[prod.catKey] = {};
        if (movItems[prod.catKey][prod.prodId] === undefined) {
          movItems[prod.catKey][prod.prodId] = item.saida;
        }
        detalhes.saida.push(`${prod.prodNome}: ${item.saida}`);
        encontrados++;
      }
    });

    const hasEntrada = detalhes.entrada.length > 0;
    const hasSaida   = detalhes.saida.length > 0;
    if (hasEntrada && !hasSaida) document.getElementById('mov-type').value = 'entrada';
    if (hasSaida   && !hasEntrada) document.getElementById('mov-type').value = 'saida';

    setMovCat(movCat);

    let html = `<strong>✅ IA identificou ${encontrados} item(s):</strong><br><br>`;
    if (detalhes.entrada.length) html += `<strong>📥 Entradas:</strong> ${detalhes.entrada.join(', ')}<br>`;
    if (detalhes.saida.length)   html += `<strong>📤 Saídas:</strong> ${detalhes.saida.join(', ')}<br>`;
    if (naoEncontrados.length)   html += `<br><span style="color:var(--warn);">⚠️ Não reconhecidos: ${naoEncontrados.join(', ')}</span>`;
    html += `<br><br><em>Revise os valores nas abas abaixo antes de confirmar.</em>`;
    if (resultText) resultText.innerHTML = html;
    if (resultBox) {
      resultBox.style.display    = 'block';
      resultBox.style.background = 'var(--ok-bg)';
      resultBox.style.borderColor= 'rgba(26,122,68,0.3)';
      resultBox.style.color      = 'var(--text)';
    }

    const catCounts = Object.entries(movItems).map(([k,v]) => ({ k, n: Object.keys(v).length }));
    const maxCat = catCounts.sort((a,b) => b.n - a.n)[0];
    if (maxCat?.n > 0) setMovCat(maxCat.k);

    showToast(`✅ IA preencheu ${encontrados} item(s). Revise e confirme!`);

  } catch(e) {
    console.error('[IA] readFormWithAI:', e);
    if (resultText) resultText.innerHTML = `❌ Erro ao ler: ${e.message}. Verifique se a foto está nítida.`;
    if (resultBox) {
      resultBox.style.display    = 'block';
      resultBox.style.background = 'var(--danger-bg)';
      resultBox.style.borderColor= '#f5c6c4';
      resultBox.style.color      = 'var(--danger)';
    }
  }

  btn.disabled = false;
  btn.innerHTML = origText;
}

// ─────────────────────────────────────────────
// 📊  IA — ANÁLISE DE PREVISÃO DE DEMANDA
//  (antes chamava /api/claude — agora usa Gemini)
// ─────────────────────────────────────────────

async function callAIPrevisao(janela, projecao, casa, catFiltro) {
  const aiCard = document.getElementById('prev-ai-card');
  const aiText = document.getElementById('prev-ai-text');
  if (!aiCard || !aiText) return;

  aiCard.style.display = '';
  aiText.textContent   = '🤖 Gemini analisando dados... aguarde.';

  try {
    const criticos = previsaoData.filter(d => d.risco === 'critico');
    const altos    = previsaoData.filter(d => d.risco === 'alto');
    const resumo   = previsaoData.slice(0,30).map(d =>
      `${d.house} | ${d.catNome} | ${d.nome}: média ${d.mediaDiaria.toFixed(2)}${d.unidade}/dia, ` +
      `previsão ${d.previsaoConsumo.toFixed(1)}${d.unidade} em ${projecao} dias, ` +
      `estoque ${d.estoqueAtual !== null ? d.estoqueAtual.toFixed(1)+d.unidade : 'desconhecido'}, ` +
      `cobertura ${d.diasCobertura !== null ? d.diasCobertura + ' dias' : '?'} [${d.risco}]`
    ).join('\n');

    const prompt = `Você é um especialista em gestão de estoques para casas assistenciais.

Analise os dados abaixo e gere um relatório executivo em português, direto e útil, com:
1. Situação geral em 2-3 linhas
2. Top 3 produtos/casas mais críticos com recomendação específica de reposição
3. Tendências observadas
4. Sugestão de ação imediata para os próximos ${projecao} dias

Parâmetros: janela histórica de ${janela} dias, projeção de ${projecao} dias.
Filtros: ${casa ? 'Casa: '+casa : 'Todas as casas'}, ${catFiltro ? 'Categoria: '+catFiltro : 'Todas as categorias'}.
Total críticos: ${criticos.length}, alto risco: ${altos.length}.

DADOS:
${resumo}

Seja objetivo e prático. Use emojis para destacar pontos importantes.`;

    const text = await window.callGemini(prompt, 1000);
    aiText.textContent = text || 'Sem resposta da IA.';

  } catch(e) {
    console.warn('[IA] callAIPrevisao:', e.message);
    aiText.textContent = '⚠️ IA temporariamente indisponível. Os dados da tabela e cards foram calculados localmente com base no histórico real.';
  }
}

// ─────────────────────────────────────────────
// 🏭  IA — MELHOR FORNECEDOR POR CATEGORIA
//  (antes chamava /api/claude — agora usa Gemini)
// ─────────────────────────────────────────────

function toggleAIFornCard() {
  const body  = document.getElementById('ai-forn-body');
  const chev  = document.getElementById('ai-forn-chevron');
  if (!body) return;
  const open  = body.style.display === '';
  body.style.display = open ? 'none' : '';
  if (chev) chev.style.transform = open ? '' : 'rotate(180deg)';
  if (!open) populateCatSelect('ai-forn-cat', false);
}

async function runAIFornecedor() {
  const cat      = document.getElementById('ai-forn-cat')?.value;
  const resultEl = document.getElementById('ai-forn-result');
  if (!cat) { showToast('Selecione uma categoria.'); return; }
  setBtnLoading('btn-ai-forn', true);
  if (resultEl) resultEl.textContent = '🤖 Gemini analisando histórico de compras...';

  try {
    const [ordersSnap] = await Promise.all([
      db.collection('orders').where('status','==','concluido').get()
    ]);

    let finSnap = { docs: [] };
    try { finSnap = await db.collection('compras_financeiro').get(); } catch(e) {}

    const fornMap = {};
    ordersSnap.docs.forEach(d => {
      const o    = d.data();
      const forn = o.fornecedorNome || o.supplier || null;
      if (!forn) return;
      const cats = Array.isArray(o.cats) ? o.cats : (o.cats ? [o.cats] : []);
      if (cat && !cats.includes(cat)) return;
      if (!fornMap[forn]) fornMap[forn] = { totalPedidos:0, totalValue:0, cats:new Set(), casas:new Set() };
      fornMap[forn].totalPedidos++;
      fornMap[forn].totalValue += parseFloat(o.totalValue || o.valorTotal || 0);
      cats.forEach(c => fornMap[forn].cats.add(c));
      if (o.house) fornMap[forn].casas.add(o.house);
    });

    finSnap.docs.forEach(d => {
      const f    = d.data();
      const forn = f.fornecedor || f.fornecedorNome;
      if (!forn) return;
      if (!fornMap[forn]) fornMap[forn] = { totalPedidos:0, totalValue:0, cats:new Set(), casas:new Set() };
      fornMap[forn].totalValue += parseFloat(f.valorTotal || f.valor || 0);
    });

    if (!suppliersCache.length) {
      const sup = await db.collection('suppliers').get();
      suppliersCache = sup.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    const fornResumo = Object.entries(fornMap).map(([nome, dados]) => {
      const supData = suppliersCache.find(s => s.nome === nome) || {};
      return {
        nome, totalPedidos: dados.totalPedidos,
        totalValue: dados.totalValue.toFixed(2),
        categorias: [...dados.cats].join(', ') || cat,
        casas: dados.casas.size,
        limite:    supData.limite    || 0,
        utilizado: supData.utilizado || 0,
        prazo:     supData.prazo     || 'não informado',
        obs:       supData.obs       || ''
      };
    });

    const catNome = CATEGORIAS[cat]?.nome || cat;
    const catIcon = CATEGORIAS[cat]?.icon || '📦';

    const prompt = `Você é um especialista em compras institucionais para casas assistenciais.

Analise os fornecedores abaixo que atendem a categoria "${catIcon} ${catNome}" e recomende:
1. O melhor fornecedor geral com justificativa (considere volume, valor médio, prazo, cobertura de casas)
2. Pontos de atenção sobre cada fornecedor
3. Se algum fornecedor está próximo do limite de crédito, destaque como risco
4. Sugestão de diversificação se houver poucos fornecedores

DADOS DOS FORNECEDORES:
${JSON.stringify(fornResumo, null, 2)}

Seja direto e prático. Use emojis. Máximo 350 palavras.`;

    const text = await window.callGemini(prompt, 800);
    if (resultEl) resultEl.textContent = text || 'Sem dados suficientes para análise.';

  } catch(e) {
    console.warn('[IA] runAIFornecedor:', e.message);
    if (resultEl) resultEl.textContent = '⚠️ Erro: ' + e.message;
  }
  setBtnLoading('btn-ai-forn', false);
}

// ─────────────────────────────────────────────
// 🔍  IA — PADRÃO CRÍTICO RECORRENTE
//  (antes chamava /api/claude — agora usa Gemini)
// ─────────────────────────────────────────────

async function detectarPadraoCritico() {
  try {
    const hoje   = new Date();
    const inicio = new Date(hoje); inicio.setDate(inicio.getDate() - 90);
    const deStr  = inicio.toISOString().slice(0,10);

    const snap = await db.collection('movements').where('date','>=',deStr).get();

    const saldoSemanal = {};
    snap.docs.forEach(d => {
      const m = d.data();
      if (!m.house || !m.date) return;
      const dt     = new Date(m.date);
      const semana = `${dt.getFullYear()}-W${Math.ceil(dt.getDate()/7)}`;
      (m.items || []).forEach(item => {
        if (!item?.catKey || !item?.prodId) return;
        const k = `${m.house}__${item.catKey}__${item.prodId}`;
        if (!saldoSemanal[k]) saldoSemanal[k] = {};
        if (!saldoSemanal[k][semana]) saldoSemanal[k][semana] = {
          qty: 0, nome: item.prodNome || item.prodId,
          catKey: item.catKey, house: m.house, unidade: item.unidade || ''
        };
        const qt = parseFloat(item.qty) || 0;
        saldoSemanal[k][semana].qty += (m.type === 'entrada' ? qt : -qt);
      });
    });

    const padroes = [];
    Object.entries(saldoSemanal).forEach(([, semanas]) => {
      const ordenadas = Object.entries(semanas).sort(([a],[b]) => a.localeCompare(b));
      const criticas  = ordenadas.filter(([,d]) => d.qty <= 0).length;
      if (criticas >= 3) {
        const ultimo = ordenadas[ordenadas.length-1][1];
        padroes.push({ ...ultimo, semanasProblema: criticas, totalSemanas: ordenadas.length });
      }
    });

    if (padroes.length === 0) return null;

    const prompt = `Analise estes produtos com padrão de estoque crítico RECORRENTE nas casas assistenciais (ficaram sem estoque em 3 ou mais semanas dos últimos 90 dias):

${padroes.slice(0,15).map(p =>
  `${p.house} | ${CATEGORIAS[p.catKey]?.nome||p.catKey} | ${p.nome}: ${p.semanasProblema} semanas críticas de ${p.totalSemanas}`
).join('\n')}

Gere um alerta executivo de 4-5 linhas destacando:
- Casas com padrão mais grave
- Possível causa estrutural (subabastecimento crônico?)
- Recomendação de ação urgente

Use emojis. Seja direto.`;

    try {
      const aiText = await window.callGemini(prompt, 400);
      return { padroes, aiText };
    } catch(e) {
      return { padroes, aiText: '' };
    }

  } catch(e) {
    return null;
  }
}

console.log('[IA] Módulo Gemini carregado. Todas as chamadas de IA ativas.');
