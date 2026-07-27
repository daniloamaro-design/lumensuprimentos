// Extraído de index.html (chat IA assistente — Gemini) em 2026-07-27
// ═══════════════════════════════════════════════════════════════
// 🤖 CHAT IA ASSISTENTE — GEMINI FULL SYSTEM ACCESS
// ═══════════════════════════════════════════════════════════════
let chatIAAberto = false;
let chatMessages = [];

function toggleChatIA() {
  chatIAAberto = !chatIAAberto;
  const panel = document.getElementById('chat-ia-panel');
  panel.style.display = chatIAAberto ? 'flex' : 'none';
  if (chatIAAberto) document.getElementById('chat-ia-input')?.focus();
}

function addChatMsg(texto, tipo) {
  const msgs = document.getElementById('chat-ia-msgs');
  const div = document.createElement('div');
  div.style.cssText = tipo === 'user'
    ? 'background:var(--lumen);color:#fff;border-radius:12px 12px 2px 12px;padding:10px 14px;font-size:13px;align-self:flex-end;max-width:85%;'
    : 'background:var(--surface);border:1px solid var(--border);border-radius:12px 12px 12px 2px;padding:10px 14px;font-size:13px;max-width:90%;white-space:pre-wrap;line-height:1.55;';
  div.innerHTML = texto;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}

// ── Coleta contexto rico do sistema ────────────────────────────
async function coletarContextoSistema() {
  try {
    const [housesSnap, movSnap, orcsSnap, todosMovSnap] = await Promise.all([
      db.collection('houses').get(),
      db.collection('movements').orderBy('createdAt','desc').limit(50).get(),
      db.collection('var_orcamentos').get(),
      db.collection('movements').get()  // todos os movimentos para calcular estoque atual
    ]);

    const casas = housesSnap.docs.map(d => ({
      id: d.id,
      nome: d.data().name,
      pessoas: d.data().currentPeople || 0,
      acolhidos: d.data().acolhidos || 0,
      coordenadores: d.data().coordenadores || 0,
      extra: d.data().extra || 0
    }));

    const movimentos = movSnap.docs.map(d => {
      const dd = d.data();
      return {
        id: d.id,
        code: dd.code,
        tipo: dd.type,
        casa: dd.house,
        data: dd.date,
        itens: (dd.items || []).map(it => `${it.product || it.prodNome}:${it.qty}${it.unit||it.unidade||''}`).join(', '),
        registradoPor: dd.registeredBy
      };
    });

    const orcamentos = orcsSnap.docs.map(d => ({
      id: d.id,
      status: d.data().status,
      casa: d.data().house,
      total: (d.data().cotacoes || []).reduce((s,c)=>s+(c.valorTotal||0),0)
    }));

    // ── Calcula estoque atual por casa (todos os movimentos) ──
    const estoquePorCasa = {};
    todosMovSnap.docs.forEach(d => {
      const mv = d.data();
      const casa = mv.house || '';
      if (!estoquePorCasa[casa]) estoquePorCasa[casa] = {};
      (mv.items || []).forEach(it => {
        const nome = it.prodNome || it.product || '';
        const qty  = parseFloat(it.qty) || 0;
        if (!nome) return;
        if (!estoquePorCasa[casa][nome]) estoquePorCasa[casa][nome] = 0;
        if (mv.type === 'entrada') estoquePorCasa[casa][nome] += qty;
        else                       estoquePorCasa[casa][nome] -= qty;
      });
    });
    // Converte para formato legível e remove quantidades <= 0
    const estoqueAtual = {};
    Object.entries(estoquePorCasa).forEach(([casa, itens]) => {
      estoqueAtual[casa] = Object.entries(itens)
        .filter(([,q]) => q > 0)
        .reduce((acc, [prod, qty]) => { acc[prod] = qty; return acc; }, {});
    });

    return {
      paginaAtual: document.querySelector('[id^="page-"]:not([style*="display: none"]) .page-title')?.textContent || '',
      usuarioNome: currentUserData?.name || '',
      usuarioPerfil: currentUserData?.role || '',
      totalFornecedores: suppliersCache?.length || 0,
      totalPedidosAndamento: document.getElementById('cnt-andamento')?.textContent || '',
      casas,
      ultimosMovimentos: movimentos,
      orcamentos,
      estoqueAtual  // ← estoque calculado por casa
    };
  } catch(e) {
    return {
      usuarioNome: currentUserData?.name || '',
      usuarioPerfil: currentUserData?.role || '',
      erro: e.message
    };
  }
}

// ── Executa ações retornadas pela IA ───────────────────────────
async function executarAcoesIA(acoes) {
  if (!acoes || !Array.isArray(acoes)) return [];
  const resultados = [];

  for (const acao of acoes) {
    try {
      if (acao.tipo === 'entrada_estoque' || acao.tipo === 'saida_estoque') {
        const tipo = acao.tipo === 'entrada_estoque' ? 'entrada' : 'saida';
        const dateStr = (acao.data || new Date().toISOString().slice(0,10)).replace(/-/g,'');
        const todaySnap = await db.collection('movements').where('dateStr','==',dateStr).get();
        const seq = String(todaySnap.size + 1).padStart(3,'0');
        const typeCode = tipo === 'entrada' ? 'ENT' : 'SAI';
        const casa = acao.casa || '';
        const prefixMov = casa.substring(0,3).toUpperCase();
        const code = `${prefixMov}-${typeCode}-${dateStr}-${seq}`;

        const itensMapeados = (acao.itens || []).map(it => {
          const prod = (typeof findProduct === 'function') ? findProduct(it.produto) : null;
          if (prod) {
            return {
              catKey:   prod.catKey,
              prodId:   prod.prodId,
              prodNome: prod.prodNome || it.produto,
              unidade:  prod.unidade  || it.unidade || 'un',
              qty:      parseFloat(it.quantidade) || 0
            };
          }
          // fallback: salva com campos básicos (não contabiliza no estoque mas preserva o registro)
          return {
            catKey:   it.catKey   || '',
            prodId:   it.prodId   || '',
            prodNome: it.produto  || '',
            unidade:  it.unidade  || 'un',
            qty:      parseFloat(it.quantidade) || 0
          };
        }).filter(it => it.qty > 0);

        const movData = {
          code, house: casa, type: tipo,
          date: acao.data || new Date().toISOString().slice(0,10),
          dateStr,
          obs: acao.obs || `Registrado pelo Assistente IA — ${currentUserData?.name}`,
          isDonation: false,
          items: itensMapeados,
          registeredBy: currentUserData?.name || 'IA',
          registeredUid: currentUser?.uid || '',
          leituraIA: true,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        await db.collection('movements').add(movData);
        resultados.push(`✅ ${tipo === 'entrada' ? 'Entrada' : 'Saída'} registrada com código <strong>${code}</strong> para <strong>${casa}</strong>.`);

      } else if (acao.tipo === 'atualizar_pessoas') {
        const houseName = acao.casa;
        const acolhidos = parseInt(acao.acolhidos) || 0;
        const coordenadores = parseInt(acao.coordenadores) || 0;
        const extra = parseInt(acao.extra) || 0;
        const count = acolhidos + coordenadores + extra;
        const ts = firebase.firestore.FieldValue.serverTimestamp();
        const histEntry = { count, acolhidos, coordenadores, extra, date: new Date().toISOString(), updatedBy: currentUserData?.name || 'IA' };

        const snap = await db.collection('houses').where('name','==',houseName).get();
        if (!snap.empty) {
          await snap.docs[0].ref.update({
            currentPeople: count, acolhidos, coordenadores, extra, updatedAt: ts,
            peopleHistory: firebase.firestore.FieldValue.arrayUnion(histEntry)
          });
          resultados.push(`✅ Pessoas atualizadas em <strong>${houseName}</strong>: ${count} total (${acolhidos} acolhidos, ${coordenadores} coord., ${extra} extra).`);
        } else {
          resultados.push(`❌ Casa "<strong>${houseName}</strong>" não encontrada.`);
        }

      } else if (acao.tipo === 'relatorio_estoque') {
        const snap = await db.collection('movements').get();
        const casaFiltro = acao.casa || null;
        const movs = snap.docs.map(d=>d.data()).filter(d => !casaFiltro || d.house === casaFiltro);
        const entradas = movs.filter(m=>m.type==='entrada').length;
        const saidas = movs.filter(m=>m.type==='saida').length;
        resultados.push(`📦 <strong>Relatório de Estoque${casaFiltro?' — '+casaFiltro:''}</strong><br>Total de movimentos: ${movs.length}<br>Entradas: ${entradas} | Saídas: ${saidas}`);

      } else if (acao.tipo === 'relatorio_financeiro') {
        const snap = await db.collection('var_orcamentos').get();
        const orcs = snap.docs.map(d=>d.data());
        const aprovados = orcs.filter(o=>o.status==='Aprovada').length;
        const total = orcs.reduce((s,o)=>(o.cotacoes||[]).reduce((ss,c)=>ss+(c.valorTotal||0),s),0);
        resultados.push(`💰 <strong>Relatório Financeiro</strong><br>Total de orçamentos: ${orcs.length}<br>Aprovados: ${aprovados} | Pendentes: ${orcs.length-aprovados}<br>Valor total: R$ ${total.toLocaleString('pt-BR',{minimumFractionDigits:2})}`);

      } else if (acao.tipo === 'relatorio_casas') {
        const snap = await db.collection('houses').get();
        const casas = snap.docs.map(d=>d.data());
        const totalPessoas = casas.reduce((s,c)=>s+(c.currentPeople||0),0);
        resultados.push(`🏠 <strong>Relatório de Casas</strong><br>Total de casas: ${casas.length}<br>Total de pessoas: ${totalPessoas}<br><br>${casas.map(c=>`• <strong>${c.name}</strong>: ${c.currentPeople||0} pessoas`).join('<br>')}`);

      } else if (acao.tipo === 'consultar_estoque_casa') {
        const casa = acao.casa;
        const movSnap = await db.collection('movements').where('house','==',casa).get();
        const movs = movSnap.docs.map(d=>d.data());
        const estoque = {};
        movs.forEach(m => {
          (m.items||[]).forEach(it => {
            if (!estoque[it.product]) estoque[it.product] = 0;
            if (m.type==='entrada') estoque[it.product] += parseFloat(it.qty)||0;
            else estoque[it.product] -= parseFloat(it.qty)||0;
          });
        });
        const itens = Object.entries(estoque).filter(([,q])=>q>0).map(([p,q])=>`• ${p}: ${q}`).join('<br>');
        resultados.push(`📦 <strong>Estoque atual — ${casa}</strong><br>${itens || 'Nenhum item em estoque.'}`);

      } else if (acao.tipo === 'ajustar_estoque_meta') {
        // Calcula automaticamente as entradas/saídas necessárias para atingir uma meta de estoque
        const casa = acao.casa;
        const meta = acao.meta || {}; // { "Arroz": 100, "Feijão": 30, ... }

        // Busca estoque atual da casa
        const movSnap2 = await db.collection('movements').where('house','==',casa).get();
        const estoqueAtual2 = {};
        movSnap2.docs.forEach(d => {
          const mv = d.data();
          (mv.items || []).forEach(it => {
            const nome = it.prodNome || it.product || '';
            const qty  = parseFloat(it.qty) || 0;
            if (!nome) return;
            if (!estoqueAtual2[nome]) estoqueAtual2[nome] = 0;
            if (mv.type === 'entrada') estoqueAtual2[nome] += qty;
            else                       estoqueAtual2[nome] -= qty;
          });
        });

        const itensEntrada = [];
        const itensSaida   = [];
        const resumo       = [];

        Object.entries(meta).forEach(([produto, quantidadeMeta]) => {
          const atual = estoqueAtual2[produto] || 0;
          const diff  = quantidadeMeta - atual;
          if (diff > 0) {
            itensEntrada.push({ produto, quantidade: diff, unidade: acao.unidades?.[produto] || 'un' });
            resumo.push(`📥 ${produto}: +${diff} (atual ${atual} → meta ${quantidadeMeta})`);
          } else if (diff < 0) {
            itensSaida.push({ produto, quantidade: Math.abs(diff), unidade: acao.unidades?.[produto] || 'un' });
            resumo.push(`📤 ${produto}: ${diff} (atual ${atual} → meta ${quantidadeMeta})`);
          } else {
            resumo.push(`✔️ ${produto}: já em ${atual} (meta atingida)`);
          }
        });

        const dateStr = new Date().toISOString().slice(0,10).replace(/-/g,'');
        const prefixMov = casa.substring(0,3).toUpperCase();

        // Registra entrada se necessário
        if (itensEntrada.length > 0) {
          const todaySnapE = await db.collection('movements').where('dateStr','==',dateStr).get();
          const seqE = String(todaySnapE.size + 1).padStart(3,'0');
          const codeE = `${prefixMov}-ENT-${dateStr}-${seqE}`;
          const itensMapeadosE = itensEntrada.map(it => {
            const prod = (typeof findProduct === 'function') ? findProduct(it.produto) : null;
            return prod
              ? { catKey: prod.catKey, prodId: prod.prodId, prodNome: prod.prodNome || it.produto, unidade: prod.unidade || it.unidade, qty: it.quantidade }
              : { catKey: '', prodId: '', prodNome: it.produto, unidade: it.unidade, qty: it.quantidade };
          }).filter(it => it.qty > 0);
          await db.collection('movements').add({
            code: codeE, house: casa, type: 'entrada',
            date: new Date().toISOString().slice(0,10), dateStr,
            obs: acao.obs || `Ajuste para meta de estoque — ${currentUserData?.name}`,
            isDonation: false, items: itensMapeadosE,
            registeredBy: currentUserData?.name || 'IA',
            registeredUid: currentUser?.uid || '',
            leituraIA: true,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          resultados.push(`✅ Entrada registrada (${codeE}): ${itensEntrada.map(i=>`${i.produto} +${i.quantidade}`).join(', ')}`);
        }

        // Registra saída se necessário
        if (itensSaida.length > 0) {
          const todaySnapS = await db.collection('movements').where('dateStr','==',dateStr).get();
          const seqS = String(todaySnapS.size + 1).padStart(3,'0');
          const codeS = `${prefixMov}-SAI-${dateStr}-${seqS}`;
          const itensMapeadosS = itensSaida.map(it => {
            const prod = (typeof findProduct === 'function') ? findProduct(it.produto) : null;
            return prod
              ? { catKey: prod.catKey, prodId: prod.prodId, prodNome: prod.prodNome || it.produto, unidade: prod.unidade || it.unidade, qty: it.quantidade }
              : { catKey: '', prodId: '', prodNome: it.produto, unidade: it.unidade, qty: it.quantidade };
          }).filter(it => it.qty > 0);
          await db.collection('movements').add({
            code: codeS, house: casa, type: 'saida',
            date: new Date().toISOString().slice(0,10), dateStr,
            obs: acao.obs || `Ajuste para meta de estoque — ${currentUserData?.name}`,
            isDonation: false, items: itensMapeadosS,
            registeredBy: currentUserData?.name || 'IA',
            registeredUid: currentUser?.uid || '',
            leituraIA: true,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          resultados.push(`✅ Saída registrada (${codeS}): ${itensSaida.map(i=>`${i.produto} -${i.quantidade}`).join(', ')}`);
        }

        if (itensEntrada.length === 0 && itensSaida.length === 0) {
          resultados.push(`✔️ Estoque de <strong>${casa}</strong> já está igual à meta. Nenhum ajuste necessário.`);
        } else {
          resultados.push(`📊 <strong>Resumo do ajuste em ${casa}:</strong><br>${resumo.join('<br>')}`);
        }

      } else if (acao.tipo === 'navegar') {
        const secao = acao.secao;
        if (typeof showPage === 'function') showPage(secao);
        resultados.push(`🧭 Navegando para a seção <strong>${secao}</strong>.`);

      } else if (acao.tipo === 'relatorio_pdf') {
        await gerarRelatorioPDFIA(acao);
        resultados.push(`📄 Relatório PDF gerado e download iniciado.`);
      }
    } catch(err) {
      resultados.push(`❌ Erro ao executar ação "${acao.tipo}": ${err.message}`);
    }
  }
  return resultados;
}

// ── Gera PDF via IA ────────────────────────────────────────────
async function gerarRelatorioPDFIA(acao) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const titulo = acao.titulo || 'Relatório Lumen';
  const linhas = (acao.linhas || []);

  doc.setFillColor(43,159,168);
  doc.rect(0,0,210,28,'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(16);
  doc.setFont(undefined,'bold');
  doc.text(titulo, 14, 18);
  doc.setFontSize(9);
  doc.setFont(undefined,'normal');
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')} por ${currentUserData?.name||'IA'}`, 14, 25);

  doc.setTextColor(30,30,30);
  let y = 38;
  linhas.forEach(linha => {
    if (y > 270) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.text(String(linha), 14, y);
    y += 7;
  });

  doc.save(`${titulo.replace(/\s+/g,'-')}-${Date.now()}.pdf`);
}

// ── Função principal ────────────────────────────────────────────
async function enviarMsgIA() {
  const input = document.getElementById('chat-ia-input');
  const msg   = input.value.trim();
  if (!msg) return;
  input.value = '';
  chatMessages.push({ role: 'user', text: msg });
  addChatMsg(msg, 'user');
  const loadingDiv = addChatMsg('⏳ Consultando o Gemini...', 'ia');

  // Coleta contexto rico do sistema
  const ctx = await coletarContextoSistema();

  const systemPrompt = `Você é o Assistente Gemini da Obra Lumen — IA com acesso total ao sistema de gestão de suprimentos.
Usuário atual: ${ctx.usuarioNome} (perfil: ${ctx.usuarioPerfil}).

═══════════════════════════════════════
SEÇÕES DO SISTEMA:
- ADMINISTRAÇÃO: Painel Geral, Usuários, Casas e Pessoas, Gerenciar Casas/Cidades/Produtos/Categorias, Todos os Pedidos, Ajustes Solicitados
- ESTOQUE: Nova Solicitação, Entrada/Saída, Estoque Atual, Meus Pedidos, Per Capita por Casa, Preços por Cidade, Verificar Estoque Crítico, Solicitar Ajuste, Transferências
- INDICADORES: Indicadores, Ind. dos Irmãos
- FINANCEIRO: Orçamento Financeiro, Orç. Pendentes, Financeiro, Fornecedores, Indicadores Fornec., Metas e Análise

═══════════════════════════════════════
DADOS AO VIVO DO SISTEMA:
Casas cadastradas: ${JSON.stringify(ctx.casas)}
Últimos movimentos: ${JSON.stringify(ctx.ultimosMovimentos)}
Orçamentos: ${JSON.stringify(ctx.orcamentos)}
Total de fornecedores: ${ctx.totalFornecedores}

ESTOQUE ATUAL POR CASA (calculado de todos os movimentos):
${JSON.stringify(ctx.estoqueAtual || {}, null, 2)}

═══════════════════════════════════════
AÇÕES QUE VOCÊ PODE EXECUTAR:
Quando o usuário pedir uma ação, inclua no final da resposta um bloco JSON assim (apenas se houver ação a executar):
<ACOES>
[
  {
    "tipo": "entrada_estoque",
    "casa": "Nome da Casa",
    "data": "YYYY-MM-DD",
    "obs": "Observação",
    "itens": [{"produto": "Arroz", "quantidade": 10, "unidade": "kg"}]
  }
]
</ACOES>

Tipos de ação disponíveis:
- "entrada_estoque": registra entrada de produtos. Campos: casa, data, obs, itens[{produto,quantidade,unidade}]
- "saida_estoque": registra saída de produtos. Mesmos campos que entrada_estoque.
- "atualizar_pessoas": atualiza nº de pessoas em uma casa. Campos: casa, acolhidos, coordenadores, extra
- "relatorio_estoque": gera relatório de movimentos. Campo opcional: casa
- "relatorio_financeiro": gera relatório financeiro.
- "relatorio_casas": gera relatório de casas e pessoas.
- "consultar_estoque_casa": calcula estoque atual de uma casa. Campo: casa
- "navegar": navega para uma seção. Campo: secao (ex: "page-movement", "page-stock", "page-houses")
- "relatorio_pdf": gera PDF. Campos: titulo, linhas[]
- "ajustar_estoque_meta": calcula automaticamente entradas e saídas necessárias para que o estoque de uma casa atinja quantidades-alvo. Campos: casa (string), meta (objeto {produto: quantidade_desejada}), unidades (objeto opcional {produto: unidade}), obs (string opcional). USE ESTA AÇÃO quando o usuário informar as quantidades finais desejadas para cada produto (ex: "quero que o estoque fique assim: Arroz 100kg, Feijão 30kg..."). O sistema consulta o estoque atual, calcula automaticamente o que precisa entrar ou sair, e registra os movimentos. NUNCA peça ao usuário para informar o estoque atual — você já tem essa informação em ESTOQUE ATUAL POR CASA acima.

REGRAS:
- Responda SEMPRE em português brasileiro.
- Seja direto, útil e amigável.
- Se o usuário pedir para registrar entrada/saída, extraia os dados da mensagem e coloque no bloco <ACOES>.
- Se o usuário informar quantidades finais desejadas por produto (meta de estoque), use SEMPRE a ação "ajustar_estoque_meta" — NUNCA peça o estoque atual, pois você já possui o ESTOQUE ATUAL POR CASA.
- Se faltar informação obrigatória (casa), peça ao usuário antes de agir.
- Máximo 250 palavras por resposta (sem contar o bloco ACOES).
- O bloco <ACOES> deve conter JSON válido.`;

  // Monta contents com histórico
  const rawHistory = chatMessages
    .filter(m => m.text && (m.role === 'user' || m.role === 'model'))
    .slice(-18);

  const contents = [];
  let lastRole = null;
  rawHistory.forEach(m => {
    if (m.role !== lastRole) {
      contents.push({ role: m.role, parts: [{ text: m.text }] });
      lastRole = m.role;
    }
  });

  if (lastRole !== 'user') {
    contents.push({ role: 'user', parts: [{ text: msg }] });
  }

  while (contents.length > 0 && contents[0].role !== 'user') contents.shift();

  // Tenta até 2 vezes para lidar com timeouts ocasionais (504)
  let tentativas = 0;
  const maxTentativas = 2;

  while (tentativas < maxTentativas) {
    tentativas++;
    try {
      const resp = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: contents.length ? contents : [{ role: 'user', parts: [{ text: msg }] }]
        })
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        const status = resp.status;
        if (status === 504 && tentativas < maxTentativas) {
          loadingDiv.innerHTML = '⏳ Servidor demorou, tentando novamente...';
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }
        throw new Error(`${status}: ${errData?.error?.message || resp.statusText}`);
      }

      const data = await resp.json();
      let resposta = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Desculpe, não consegui processar sua solicitação.';

      // Extrai e executa ações embutidas na resposta
      const acoesMatch = resposta.match(/<ACOES>([\s\S]*?)<\/ACOES>/);
      let resultadosAcoes = [];
      if (acoesMatch) {
        try {
          const acoes = JSON.parse(acoesMatch[1].trim());
          resultadosAcoes = await executarAcoesIA(acoes);
        } catch(parseErr) {
          console.warn('Erro ao parsear ações:', parseErr);
        }
        resposta = resposta.replace(/<ACOES>[\s\S]*?<\/ACOES>/, '').trim();
      }

      // Monta resposta final
      let respostaFinal = resposta;
      if (resultadosAcoes.length > 0) {
        respostaFinal += '<br><br><div style="border-top:1px solid var(--border);margin-top:8px;padding-top:8px;">' + resultadosAcoes.join('<br>') + '</div>';
        if (typeof loadDashboard === 'function') setTimeout(loadDashboard, 800);
        if (typeof loadHouses === 'function') setTimeout(loadHouses, 800);
      }

      loadingDiv.innerHTML = respostaFinal;
      chatMessages.push({ role: 'model', text: resposta });
      break;

    } catch(e) {
      if (tentativas < maxTentativas && (e.message.includes('504') || e.message.includes('Failed to fetch'))) {
        loadingDiv.innerHTML = '⏳ Servidor demorou, tentando novamente...';
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }
      const msgErro = e.message.includes('504')
        ? '❌ O servidor demorou demais para responder (timeout). Tente novamente em instantes.'
        : '❌ Erro: ' + e.message;
      loadingDiv.innerHTML = msgErro;
      console.error('Gemini error:', e);
      break;
    }
  }
}

