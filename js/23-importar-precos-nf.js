// ═══════════════════════════════════════════════════════════════════
// 📥  IMPORTAÇÃO HISTÓRICA DE PREÇOS VIA LEITURA DE NF COM GEMINI
// ═══════════════════════════════════════════════════════════════════

let _impState = { rodando: false, total: 0, processados: 0, salvos: 0, erros: 0, logs: [] };

function _impLog(msg, tipo = 'info') {
  _impState.logs.push({ msg, tipo, ts: new Date().toLocaleTimeString('pt-BR') });
  _impRenderLog();
}

function _impRenderLog() {
  const el = document.getElementById('imp-log');
  if (!el) return;
  el.innerHTML = _impState.logs.slice(-80).reverse().map(l => {
    const cor = l.tipo === 'ok' ? '#16a34a' : l.tipo === 'erro' ? '#dc2626' : l.tipo === 'warn' ? '#d97706' : 'var(--text-muted)';
    return `<div style="font-size:12px;color:${cor};padding:2px 0;border-bottom:1px solid rgba(255,255,255,.04);">
      <span style="opacity:.5;">${l.ts}</span> ${l.msg}
    </div>`;
  }).join('');
  _impAtualizarContadores();
}

function _impAtualizarContadores() {
  const s = _impState;
  const el = document.getElementById('imp-contadores');
  if (!el) return;
  const pct = s.total > 0 ? Math.round((s.processados / s.total) * 100) : 0;
  el.innerHTML = `
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:8px;">
      <span>📦 <b>${s.total}</b> pedidos com NF</span>
      <span>✅ <b>${s.processados}</b> processados</span>
      <span>💾 <b>${s.salvos}</b> preços salvos</span>
      <span style="color:#dc2626;">❌ <b>${s.erros}</b> erros</span>
    </div>
    <div style="background:rgba(255,255,255,.08);border-radius:4px;height:8px;overflow:hidden;">
      <div style="background:var(--lumen,#7c3aed);height:100%;width:${pct}%;transition:width .3s;"></div>
    </div>
    <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">${pct}% concluído</div>`;
}

async function initPageImportarPrecos() {
  _impState = { rodando: false, total: 0, processados: 0, salvos: 0, erros: 0, logs: [] };
  _impRenderLog();
  _impAtualizarContadores();
  const btn = document.getElementById('btn-imp-iniciar');
  if (btn) btn.disabled = false;
}
window.initPageImportarPrecos = initPageImportarPrecos;

async function impIniciar() {
  if (_impState.rodando) return;
  _impState = { rodando: true, total: 0, processados: 0, salvos: 0, erros: 0, logs: [] };
  const btn = document.getElementById('btn-imp-iniciar');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Importando...'; }

  try {
    // Últimos 2 meses
    const limite = new Date();
    limite.setMonth(limite.getMonth() - 2);

    _impLog('Buscando pedidos dos últimos 2 meses com nota fiscal...');
    const snap = await db.collection('orders')
      .where('createdAt', '>=', limite)
      .orderBy('createdAt', 'desc')
      .get();

    const pedidosComNF = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(o => o.nfFileURL);

    _impState.total = pedidosComNF.length;
    _impLog(`Encontrados ${pedidosComNF.length} pedidos com NF anexada.`, 'ok');

    if (!pedidosComNF.length) {
      _impLog('Nenhum pedido com NF nos últimos 2 meses.', 'warn');
      _impState.rodando = false;
      if (btn) { btn.disabled = false; btn.textContent = '▶ Iniciar Importação'; }
      return;
    }

    for (const pedido of pedidosComNF) {
      await _impProcessarPedido(pedido);
      _impState.processados++;
      _impRenderLog();
      // Pausa de 10s entre chamadas para respeitar o rate limit da API Gemini
      await new Promise(r => setTimeout(r, 10000));
    }

    _impLog(`✅ Importação concluída! ${_impState.salvos} preços salvos, ${_impState.erros} erros.`, 'ok');
  } catch (e) {
    _impLog('Erro fatal: ' + e.message, 'erro');
  }

  _impState.rodando = false;
  if (btn) { btn.disabled = false; btn.textContent = '▶ Iniciar Importação'; }
}
window.impIniciar = impIniciar;

async function _impProcessarPedido(pedido) {
  const code = pedido.code || pedido.id;
  const city = pedido.city || CASAS_CIDADES?.[pedido.house] || '';

  // Monta lista de itens do pedido
  const itens = [];
  Object.entries(pedido.items || {}).forEach(([catKey, prods]) => {
    const cat = CATEGORIAS?.[catKey];
    Object.entries(prods || {}).forEach(([prodId, qty]) => {
      const p = cat?.produtos?.find(x => x.id === prodId);
      if (p) itens.push({ catKey, prodId, nome: p.nome, unidade: p.unidade || '', qty });
    });
  });

  if (!itens.length) {
    _impLog(`${code} — sem itens identificados, pulando.`, 'warn');
    return;
  }

  _impLog(`${code} — processando ${itens.length} item(ns)... (${city || 'cidade não identificada'})`);

  try {
    // Baixa o arquivo da NF via fetch para converter em base64
    let base64, mimeType;
    try {
      const fileResp = await fetch(pedido.nfFileURL);
      if (!fileResp.ok) throw new Error(`HTTP ${fileResp.status}`);
      const blob = await fileResp.blob();
      mimeType = blob.type || 'application/pdf';
      base64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = e => res(e.target.result.split(',')[1]);
        r.onerror = rej;
        r.readAsDataURL(blob);
      });
    } catch (e) {
      _impLog(`${code} — erro ao baixar NF: ${e.message}`, 'erro');
      _impState.erros++;
      return;
    }

    const listaComId = itens.map(i => `prodId="${i.prodId}" | ${i.nome} (${i.unidade})`).join('\n');
    const promptFinal = `Analise esta nota fiscal brasileira (NF-e ou cupom fiscal) e extraia o preço unitário de cada produto listado abaixo.

PRODUTOS PARA ENCONTRAR:
${listaComId}

INSTRUÇÕES:
- Procure na coluna "Valor Unit.", "Vl. Unit.", "Preço Unit." ou similar da nota
- Use o prodId exato de cada linha acima
- Se o produto não estiver na nota, omita-o
- Valores em reais, use ponto como decimal (ex: 3.89)
- Se a nota tiver apenas valor total por item, divida pelo quantidade para obter o unitário

Retorne APENAS este JSON, sem texto adicional:
{"itens":[{"prodId":"id_exato","precoUnitario":valor_numerico}]}`;

    const payload = {
      contents: [{ parts: [
        { inline_data: { mime_type: mimeType, data: base64 } },
        { text: promptFinal }
      ]}],
      generationConfig: { temperature: 0.1 }
    };

    // Tenta até 3x com backoff em caso de rate limit (429)
    let resp;
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      resp = await geminiFetch({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (resp.status === 429) {
        const espera = tentativa * 15000;
        _impLog(`${code} — rate limit (429), aguardando ${espera/1000}s antes de tentar novamente (tentativa ${tentativa}/3)...`, 'warn');
        await new Promise(r => setTimeout(r, espera));
        continue;
      }
      break;
    }
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    _impLog(`${code} — resposta IA: ${rawText.substring(0, 120)}...`);

    let parsed;
    try {
      parsed = JSON.parse(rawText.replace(/```json|```/g, '').trim());
    } catch(parseErr) {
      _impLog(`${code} — IA retornou texto não-JSON: "${rawText.substring(0, 200)}"`, 'warn');
      return;
    }

    if (!parsed.itens?.length) {
      _impLog(`${code} — IA não encontrou nenhum dos produtos na NF.`, 'warn');
      return;
    }

    // Salva em prices_historico
    const dataCompra = pedido.createdAt?.toDate?.() || new Date();
    const batch = db.batch();
    let salvosNestePedido = 0;

    parsed.itens.forEach(({ prodId, nome, precoUnitario }) => {
      if (!prodId || !precoUnitario || precoUnitario <= 0) return;
      const item = itens.find(i => i.prodId === prodId);
      if (!item) return;

      const ref = db.collection('prices_historico').doc();
      batch.set(ref, {
        prodId,
        cat: item.catKey,
        city: city || '',
        price: Number(precoUnitario),
        savedAt: firebase.firestore.Timestamp.fromDate(dataCompra),
        savedBy: 'importacao-nf',
        pedidoCode: code,
        fornecedorNome: pedido.fornecedorNome || '',
        nfNumero: pedido.nfNumero || '',
      });
      salvosNestePedido++;
    });

    await batch.commit();
    _impState.salvos += salvosNestePedido;
    _impLog(`${code} — ✅ ${salvosNestePedido} preço(s) salvo(s) de ${parsed.itens.length} extraído(s).`, 'ok');

  } catch (e) {
    _impLog(`${code} — ❌ ${e.message}`, 'erro');
    _impState.erros++;
  }
}
