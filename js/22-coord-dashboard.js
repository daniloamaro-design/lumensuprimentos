// ─────────────────────────────────────────────────────────────────────────
// 22-coord-dashboard.js — Painel do Coordenador (Passagens + Fretes + Suprimentos)
// Visão operacional unificada: alertas, status em tempo real, custo do mês,
// calendário semanal. Projetado para tomada de decisão diária do coordenador.
// ─────────────────────────────────────────────────────────────────────────

const _cd = {
  BRL: v => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),
  hoje: () => new Date().toISOString().slice(0,10),
  mesAtual: () => { const d = new Date(); return { mes: d.getMonth()+1, ano: d.getFullYear() }; },
  diasAte: data => {
    if (!data) return null;
    const diff = new Date(data+'T00:00:00') - new Date(new Date().toDateString());
    return Math.round(diff / 86400000);
  },
  nomeMes: (mes, ano) => new Date(ano, mes-1, 1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'}),
  horasDesde: ts => {
    if (!ts) return 9999;
    try { return (Date.now() - ts.toDate().getTime()) / 3600000; } catch(e) { return 9999; }
  },
};

async function initCoordDashboard() {
  const el = document.getElementById('coord-dash-root');
  if (!el) return;
  el.innerHTML = `<div class="loading-state"><div class="spinner spinner-dark"></div>Carregando painel…</div>`;

  try {
    const { mes, ano } = _cd.mesAtual();
    const mesStr  = String(mes).padStart(2,'0');
    const mesStr2 = `${ano}-${mesStr}`;
    const prefixMes = mesStr2;
    // Início e fim do mês para query por timestamp
    const inicioMes = new Date(ano, mes - 1, 1);
    const fimMes    = new Date(ano, mes, 1);

    const [fretesSnap, pasSnap, ordersSnap, finSnap, quotSnap, frtMetasSnap, supMetasSnap, pasMetasSnap] = await Promise.all([
      db.collection('fretes').get(),
      db.collection('passagens_solicitacoes').get(),
      db.collection('orders').get(),
      db.collection('compras_financeiro').get(),
      // Busca todas as cotações aprovadas e filtra por data no client (evita problema com campos ausentes)
      db.collection('quotations').where('status','==','aprovado').get().catch(()=>({docs:[]})),
      db.collection('fretes_metas').orderBy('mes','desc').limit(12).get().catch(()=>({docs:[]})),
      db.collection('metas').doc('categorias_' + ano).get().catch(()=>null),
      db.collection('passagens_metas').orderBy('mes','desc').limit(12).get().catch(()=>({docs:[]})),
    ]);

    const fretes    = fretesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const passagens = pasSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const orders    = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const fin       = finSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Filtra cotações aprovadas do mês atual por qualquer campo de data disponível
    const _tsToDate = ts => {
      if (!ts) return null;
      if (typeof ts.toDate === 'function') return ts.toDate();
      if (ts.seconds) return new Date(ts.seconds * 1000);
      if (typeof ts === 'string') return new Date(ts);
      return null;
    };
    const allQuot = quotSnap.docs ? quotSnap.docs.map(d => ({ id: d.id, ...d.data() })) : [];
    const quotations = allQuot.filter(q => {
      const dataCandidates = [q.approvedAt, q.updatedAt, q.createdAt];
      for (const ts of dataCandidates) {
        const d = _tsToDate(ts);
        if (d && d >= inicioMes && d < fimMes) return true;
      }
      // Fallback: campo data em string YYYY-MM-DD ou DD/MM/YYYY
      if (q.data) {
        const s = String(q.data);
        if (s.startsWith(prefixMes)) return true;
        const p = s.split('/');
        if (p.length === 3) {
          const iso = `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
          if (iso.startsWith(prefixMes)) return true;
        }
      }
      return false;
    });
    const hoje = _cd.hoje();

    // Metas: suprimentos = soma de metaMes de todas as categorias
    const supMetasData = supMetasSnap?.data?.() || {};
    const metaSup = Object.values(supMetasData).reduce((s, m) => s + (Number(m?.metaMes) || 0), 0);

    // Metas: fretes = campo 'mensal' do mês atual
    const frtMetaDoc = frtMetasSnap.docs.map(d => d.data()).find(m => (m.mes||'').startsWith(mesStr2));
    const metaFrete = Number(frtMetaDoc?.mensal) || 0;

    // Metas: passagens = campo 'mensal' do mês atual (coleção passagens_metas)
    const pasMetaDoc = pasMetasSnap.docs.map(d => d.data()).find(m => (m.mes||'').startsWith(mesStr2));
    const metaPas = Number(pasMetaDoc?.mensal) || 0;

    el.innerHTML = [
      _cdAlertas(fretes, passagens, orders, hoje),
      _cdBlocos(fretes, passagens, orders),
      _cdCustoMes(fretes, fin, passagens, quotations, prefixMes, mes, ano, metaSup, metaPas, metaFrete),
      _cdCalendario(fretes, passagens, hoje),
    ].join('');

  } catch(e) {
    el.innerHTML = `<div class="card" style="padding:16px;color:var(--danger);">Erro ao carregar painel: ${e.message}</div>`;
    console.error(e);
  }
}
window.initCoordDashboard = initCoordDashboard;

// ── 1. ALERTAS ────────────────────────────────────────────────────────────
function _cdAlertas(fretes, passagens, orders, hoje) {
  const alertas = [];

  // Fretes atrasados (status=transporte, previsão < hoje)
  const fretesAtrasados = fretes.filter(f =>
    f.status === 'transporte' && f.previsaoEntrega && f.previsaoEntrega < hoje);
  if (fretesAtrasados.length)
    alertas.push({ cor: 'var(--danger)', icone: '🚨', msg:
      `<strong>${fretesAtrasados.length} frete(s) atrasado(s)</strong> — previsão de entrega já passou: ${fretesAtrasados.map(f=>`<a onclick="goPage('frt-lista')" style="cursor:pointer;text-decoration:underline;">${f.code||'—'}</a>`).join(', ')}` });

  // Fretes vencendo em até 2 dias
  const fretesVencendo = fretes.filter(f => {
    if (f.status !== 'transporte' || !f.previsaoEntrega || f.previsaoEntrega < hoje) return false;
    const dias = _cd.diasAte(f.previsaoEntrega);
    return dias !== null && dias <= 2;
  });
  if (fretesVencendo.length)
    alertas.push({ cor: 'var(--warn)', icone: '⏰', msg:
      `<strong>${fretesVencendo.length} frete(s) entregam em até 2 dias</strong>: ${fretesVencendo.map(f=>`${f.code||'—'} (${_cd.diasAte(f.previsaoEntrega)===0?'hoje':_cd.diasAte(f.previsaoEntrega)+'d'})`).join(', ')}` });

  // Passagens pendentes há mais de 48h sem cotação
  const pasSemCotacao = passagens.filter(p =>
    p.status === 'pendente' && _cd.horasDesde(p.createdAt) > 48);
  if (pasSemCotacao.length)
    alertas.push({ cor: 'var(--warn)', icone: '✈️', msg:
      `<strong>${pasSemCotacao.length} passagem(ns) sem cotação há mais de 48h</strong> — ${pasSemCotacao.map(p=>p.codigo||'—').join(', ')}` });

  // Passagens aprovadas aguardando compra há mais de 24h
  const pasAprovadas = passagens.filter(p =>
    p.status === 'aprovada' && _cd.horasDesde(p.createdAt) > 24);
  if (pasAprovadas.length)
    alertas.push({ cor: 'var(--warn)', icone: '🎫', msg:
      `<strong>${pasAprovadas.length} passagem(ns) aprovada(s) aguardando compra</strong> — ${pasAprovadas.map(p=>p.codigo||'—').join(', ')}` });

  // Pedidos de suprimentos em aberto há mais de 5 dias
  const ordensParadas = orders.filter(o => {
    if (!['solicitado','andamento'].includes(o.status)) return false;
    return _cd.horasDesde(o.createdAt) > 120; // 5 dias
  });
  if (ordensParadas.length)
    alertas.push({ cor: 'var(--text-muted)', icone: '📦', msg:
      `<strong>${ordensParadas.length} pedido(s) de suprimentos</strong> parado(s) há mais de 5 dias sem resolução` });

  // Fretes sem freteiro atribuído (status=solicitado)
  const fretosSemFreteiro = fretes.filter(f => f.status === 'solicitado');
  if (fretosSemFreteiro.length)
    alertas.push({ cor: 'var(--text-muted)', icone: '🚚', msg:
      `<strong>${fretosSemFreteiro.length} frete(s) aguardando atribuição de freteiro</strong>` });

  if (!alertas.length)
    return `<div class="card" style="padding:14px 18px;margin-bottom:16px;display:flex;align-items:center;gap:10px;">
      <span style="font-size:20px;">✅</span>
      <span style="font-weight:600;">Nenhum alerta no momento. Operação normalizada.</span>
    </div>`;

  return `
    <div style="margin-bottom:16px;">
      <div style="font-size:11px;font-weight:800;color:var(--danger);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px;">
        🚨 Alertas (${alertas.length})
      </div>
      ${alertas.map(a => `
        <div style="display:flex;gap:10px;align-items:flex-start;padding:10px 14px;border-radius:8px;
                    border-left:4px solid ${a.cor};background:var(--bg-card,var(--bg));
                    margin-bottom:6px;font-size:13px;">
          <span style="font-size:16px;flex-shrink:0;">${a.icone}</span>
          <span>${a.msg}</span>
        </div>`).join('')}
    </div>`;
}

// ── 2. BLOCOS OPERACIONAIS ────────────────────────────────────────────────
function _cdBlocos(fretes, passagens, orders) {
  // Fretes
  const fEmTransito    = fretes.filter(f => f.status === 'transporte').length;
  const fSemFreteiro   = fretes.filter(f => f.status === 'solicitado').length;
  const fPagPendente   = fretes.filter(f => ['pendente','parcial'].includes(f.statusPag) && f.status === 'entregue').length;

  // Passagens
  const pPendentes     = passagens.filter(p => p.status === 'pendente').length;
  const pEmAnalise     = passagens.filter(p => ['em_analise','Em Análise'].includes(p.status)).length;
  const pAprovadas     = passagens.filter(p => p.status === 'aprovada').length;

  // Suprimentos
  const oPendentes     = orders.filter(o => o.status === 'solicitado').length;
  const oAndamento     = orders.filter(o => o.status === 'andamento').length;
  const oAguardCot     = orders.filter(o => o.status === 'aguardando_cotacao').length;

  const bloco = (icone, titulo, cor, linhas) => `
    <div class="card" style="padding:16px 18px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;border-bottom:1px solid var(--border);padding-bottom:10px;">
        <span style="font-size:20px;">${icone}</span>
        <span style="font-weight:800;font-size:14px;color:${cor};">${titulo}</span>
        <button class="btn btn-outline btn-sm" style="margin-left:auto;font-size:11px;"
          onclick="goPage('${linhas._page}')">Ver tudo →</button>
      </div>
      ${linhas.items.map(([label, val, cor2]) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);">
          <span style="font-size:13px;color:var(--text-muted);">${label}</span>
          <span style="font-size:18px;font-weight:800;color:${cor2||'var(--text)'};">${val}</span>
        </div>`).join('')}
    </div>`;

  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin-bottom:16px;">
      ${bloco('🚚','Fretes','#0D9488',{_page:'frt-lista',items:[
        ['Em trânsito', fEmTransito, fEmTransito ? 'var(--ok)' : 'var(--text-muted)'],
        ['Aguardando freteiro', fSemFreteiro, fSemFreteiro ? 'var(--warn)' : 'var(--text-muted)'],
        ['Entregues — pagto. pendente', fPagPendente, fPagPendente ? 'var(--warn)' : 'var(--text-muted)'],
      ]})}
      ${bloco('✈️','Passagens','#7C3AED',{_page:'pas-solicitacoes',items:[
        ['Pendentes (sem cotação)', pPendentes, pPendentes ? 'var(--warn)' : 'var(--text-muted)'],
        ['Em análise (com cotação)', pEmAnalise, 'var(--ok)'],
        ['Aprovadas (aguard. compra)', pAprovadas, pAprovadas ? 'var(--lumen,#7c3aed)' : 'var(--text-muted)'],
      ]})}
      ${bloco('📦','Suprimentos','#0284C7',{_page:'all-orders',items:[
        ['Pedidos novos', oPendentes, oPendentes ? 'var(--warn)' : 'var(--text-muted)'],
        ['Em andamento', oAndamento, 'var(--ok)'],
        ['Aguardando cotação', oAguardCot, oAguardCot ? 'var(--warn)' : 'var(--text-muted)'],
      ]})}
    </div>`;
}

// ── 3. CUSTO DO MÊS ──────────────────────────────────────────────────────
// Verifica se um registro de compras_financeiro pertence ao mês/ano atual
// Os registros Excel não têm campo 'data' — usam dataCompraStr (DD/MM/YYYY), mes+ano, ou createdAt
const _MESES_PT = {
  JAN:1,FEV:2,MAR:3,ABR:4,MAI:5,JUN:6,JUL:7,AGO:8,SET:9,OUT:10,NOV:11,DEZ:12,
  JANEIRO:1,FEVEREIRO:2,'MARÇO':3,'MARCO':3,ABRIL:4,MAIO:5,JUNHO:6,JULHO:7,AGOSTO:8,SETEMBRO:9,OUTUBRO:10,NOVEMBRO:11,DEZEMBRO:12,
};
function _cdPertenceMes(f, prefixMes, mes, ano) {
  // 1. Campo data em ISO (registros criados pelo sistema)
  const d = f.data || '';
  if (d && d.startsWith(prefixMes)) return true;
  // 2. dataCompraStr no formato DD/MM/YYYY (importação Excel)
  if (f.dataCompraStr) {
    const p = String(f.dataCompraStr).split('/');
    if (p.length === 3) {
      const iso = `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
      if (iso.startsWith(prefixMes)) return true;
    }
  }
  // 3. Campos mes (nome) + ano (número) — ex: mes:"SETEMBRO" ano:2026
  if (f.ano && f.mes) {
    const chave = String(f.mes).toUpperCase().trim();
    const numMes = _MESES_PT[chave] || _MESES_PT[chave.slice(0,3)];
    if (Number(f.ano) === ano && numMes === mes) return true;
  }
  return false;
}

function _cdCustoMes(fretes, fin, passagens, quotations, prefixMes, mes, ano, metaSup, metaPas, metaFrete) {
  // Suprimentos: soma das cotações aprovadas no mês (fonte real do gasto de suprimentos)
  // + fallback para compras_financeiro caso haja registros manuais do módulo financeiro
  let custoSup = 0;
  quotations.forEach(q => { custoSup += Number(q.valor) || 0; });
  // Complementa com compras_financeiro (registros sem correspondência em quotations, ex: lançamentos manuais)
  let custoPas = 0;
  fin.forEach(f => {
    if (!_cdPertenceMes(f, prefixMes, mes, ano)) return;
    const val = Number(f.valor) || 0;
    if (f.modulo === 'passagens') custoPas += val;
    // Suprimentos via compras_financeiro só entra se não houver cotações (evita dupla contagem)
    else if ((f.modulo || 'suprimentos') === 'suprimentos' && quotations.length === 0) custoSup += val;
  });

  // Fretes vêm da coleção fretes (apenas entregues/em transporte, não cancelados)
  let custoFrete = 0;
  fretes.forEach(f => {
    const data = f.data || '';
    if (!data.startsWith(prefixMes) || f.status === 'cancelado') return;
    custoFrete += Number(f.valor) || 0;
  });

  const total     = custoSup + custoPas + custoFrete;
  const metaTotal = metaSup + metaPas + metaFrete;

  const moduloCard = (label, icone, cor, gasto, meta) => {
    const temMeta   = meta > 0;
    const saldo     = meta - gasto;
    const pct       = temMeta ? Math.min(Math.round((gasto / meta) * 100), 100) : 0;
    const corBarra  = pct >= 100 ? '#dc2626' : pct >= 85 ? '#d97706' : cor;
    const corSaldo  = saldo < 0 ? '#dc2626' : saldo < meta * 0.15 ? '#d97706' : '#16a34a';

    return `
      <div class="card" style="padding:16px 18px;flex:1;min-width:200px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <span style="font-size:18px;">${icone}</span>
          <span style="font-weight:800;font-size:13px;color:${cor};">${label}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);margin-bottom:4px;">
          <span>Gasto</span><strong style="color:var(--text);">${_cd.BRL(gasto)}</strong>
        </div>
        ${temMeta ? `
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);margin-bottom:4px;">
          <span>Orçamento</span><strong style="color:var(--text);">${_cd.BRL(meta)}</strong>
        </div>
        <div style="height:8px;border-radius:4px;background:var(--border);margin:8px 0;">
          <div style="height:8px;border-radius:4px;background:${corBarra};width:${pct}%;transition:width .4s;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-top:4px;">
          <span style="color:var(--text-muted);">${pct}% utilizado</span>
          <strong style="color:${corSaldo};">${saldo >= 0 ? 'Saldo: ' + _cd.BRL(saldo) : 'Excedido: ' + _cd.BRL(Math.abs(saldo))}</strong>
        </div>` : `
        <div style="font-size:11px;color:var(--text-muted);margin-top:6px;font-style:italic;">Meta não definida para este mês</div>`}
      </div>`;
  };

  const saldoTotal = metaTotal - total;
  const pctTotal   = metaTotal > 0 ? Math.min(Math.round((total / metaTotal) * 100), 100) : 0;
  const corSaldoTotal = saldoTotal < 0 ? '#dc2626' : saldoTotal < metaTotal * 0.15 ? '#d97706' : '#16a34a';

  return `
    <div class="card" style="padding:18px;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-weight:800;font-size:15px;">💰 Custo do Mês — ${_cd.nomeMes(mes, ano)}</div>
          <div style="font-size:12px;color:var(--text-muted);">Total comprometido nos 3 módulos</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:22px;font-weight:900;">${_cd.BRL(total)}</div>
          ${metaTotal > 0 ? `
          <div style="font-size:12px;color:${corSaldoTotal};font-weight:700;">${saldoTotal >= 0 ? '✅ Saldo: ' + _cd.BRL(saldoTotal) : '⚠️ Excedido: ' + _cd.BRL(Math.abs(saldoTotal))}</div>
          <div style="font-size:11px;color:var(--text-muted);">de ${_cd.BRL(metaTotal)} orçados (${pctTotal}% utilizado)</div>` : ''}
          <button class="btn btn-outline btn-sm" onclick="goPage('ind-geral')" style="font-size:11px;margin-top:6px;">Ver financeiro completo →</button>
        </div>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        ${moduloCard('Suprimentos', '📦', '#0284C7', custoSup, metaSup)}
        ${moduloCard('Passagens',   '✈️', '#7C3AED', custoPas, metaPas)}
        ${moduloCard('Fretes',      '🚚', '#0D9488', custoFrete, metaFrete)}
      </div>
    </div>`;
}

// ── 4. CALENDÁRIO SEMANAL ─────────────────────────────────────────────────
function _cdCalendario(fretes, passagens, hoje) {
  // Gera os próximos 14 dias
  const dias = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(hoje + 'T00:00:00');
    d.setDate(d.getDate() + i);
    dias.push(d.toISOString().slice(0, 10));
  }

  // Mapeia eventos por data
  const eventos = {}; // { 'YYYY-MM-DD': [{tipo, label, cor, icone}] }
  dias.forEach(d => { eventos[d] = []; });

  fretes.forEach(f => {
    if (f.previsaoEntrega && eventos[f.previsaoEntrega]) {
      eventos[f.previsaoEntrega].push({
        icone: '🚚', cor: '#0D9488',
        label: `${f.code||'Frete'} → ${f.destino||'—'}`,
        status: f.status,
      });
    }
    if (f.data && eventos[f.data] && f.data !== f.previsaoEntrega) {
      eventos[f.data].push({
        icone: '📤', cor: '#64748b',
        label: `Saída: ${f.code||'Frete'} (${f.origem||'—'})`,
        status: f.status,
      });
    }
  });

  passagens.forEach(p => {
    if (p.saida && eventos[p.saida]) {
      eventos[p.saida].push({
        icone: '✈️', cor: '#7C3AED',
        label: `${p.codigo||'Pass.'} — ${p.passageiro||'—'} (${p.origem||'?'} → ${p.destino||'?'})`,
        status: p.status,
      });
    }
  });

  const nomeDia = d => new Date(d+'T00:00:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit'});
  const isHoje  = d => d === hoje;

  const cols = dias.map(d => {
    const evs = eventos[d] || [];
    return `
      <div style="min-width:130px;flex:1;">
        <div style="font-size:11px;font-weight:${isHoje(d)?'900':'700'};
                    color:${isHoje(d)?'var(--lumen,#7c3aed)':'var(--text-muted)'};
                    text-transform:uppercase;margin-bottom:6px;padding-bottom:4px;
                    border-bottom:2px solid ${isHoje(d)?'var(--lumen,#7c3aed)':'var(--border)'};">
          ${nomeDia(d)}${isHoje(d)?' · Hoje':''}
        </div>
        ${evs.length === 0
          ? `<div style="font-size:11px;color:var(--border);padding:4px 0;">—</div>`
          : evs.map(ev => `
              <div style="font-size:11px;padding:4px 6px;border-radius:6px;margin-bottom:4px;
                          border-left:3px solid ${ev.cor};background:var(--bg);">
                ${ev.icone} ${ev.label}
              </div>`).join('')}
      </div>`;
  }).join('');

  return `
    <div class="card" style="padding:18px;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <div style="font-weight:800;font-size:15px;">📅 Calendário — Próximos 14 dias</div>
        <div style="display:flex;gap:10px;font-size:11px;color:var(--text-muted);">
          <span>🚚 Entrega de frete</span>
          <span>📤 Saída de frete</span>
          <span>✈️ Passagem</span>
        </div>
      </div>
      <div style="overflow-x:auto;">
        <div style="display:flex;gap:10px;min-width:max-content;padding-bottom:6px;">
          ${cols}
        </div>
      </div>
    </div>`;
}

// ── 5. SALDO DEVEDOR (Suprimentos / Passagens / Fretes) ─────────────────
// Acumulado geral por fornecedor: total pedido (todo lançamento financeiro
// já registrado) × total pago × saldo em aberto. Não olha período — é um
// extrato de "quanto devemos e pra quem" desde sempre.
async function initCoordSaldo() {
  ['coord-saldo-suprimentos', 'coord-saldo-passagens', 'coord-saldo-fretes'].forEach(id => {
    const tb = document.getElementById(id);
    if (tb) tb.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-muted);">Carregando…</td></tr>';
  });

  try {
    const [finSnap, fretesSnap, supSnap] = await Promise.all([
      db.collection('compras_financeiro').get(),
      db.collection('fretes').get(),
      db.collection('suppliers').get(),
    ]);
    const fin = finSnap.docs.map(d => d.data());
    const fretes = fretesSnap.docs.map(d => d.data());
    const limitesPorFornecedor = _cdMapaLimites(supSnap.docs.map(d => d.data()));

    _cdRenderSaldoTabela('coord-saldo-suprimentos', _cdAgregarFinanceiro(fin, 'suprimentos'), limitesPorFornecedor);
    _cdRenderSaldoTabela('coord-saldo-passagens', _cdAgregarFinanceiro(fin, 'passagens'), limitesPorFornecedor);
    _cdRenderSaldoTabela('coord-saldo-fretes', _cdAgregarFretes(fretes), limitesPorFornecedor);
  } catch (e) {
    console.error('initCoordSaldo', e);
    ['coord-saldo-suprimentos', 'coord-saldo-passagens', 'coord-saldo-fretes'].forEach(id => {
      const tb = document.getElementById(id);
      if (tb) tb.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--danger,#dc2626);">Erro ao carregar: ${frtEsc(e.message)}</td></tr>`;
    });
  }
}
window.initCoordSaldo = initCoordSaldo;

// Nome cadastrado do fornecedor (suppliers.nome) → limite de crédito
// (suppliers.limite, já usado no cadastro de Fornecedores). Também indexa
// pelos aliases conhecidos (_CD_FORN_ALIASES) para pegar o mesmo fornecedor
// mesmo quando compras_financeiro guarda um nome de pessoa/grafia diferente.
function _cdMapaLimites(suppliers) {
  const mapa = {};
  suppliers.forEach(s => {
    const limite = parseFloat(s.limite) || 0;
    if (!limite) return;
    mapa[_cdChaveFornecedor(s.nome)] = limite;
  });
  Object.entries(_CD_FORN_ALIASES).forEach(([alias, canonico]) => {
    const limite = mapa[_cdChaveFornecedor(canonico)];
    if (limite) mapa[_cdChaveFornecedor(alias)] = limite;
  });
  return mapa;
}

function coordSaldoSetTab(modulo) {
  ['suprimentos', 'passagens', 'fretes'].forEach(m => {
    document.getElementById(`coord-saldo-tab-${m}`)?.classList.toggle('active', m === modulo);
    document.getElementById(`coord-saldo-card-${m}`)?.classList.toggle('hidden', m !== modulo);
  });
}
window.coordSaldoSetTab = coordSaldoSetTab;

// pago === 'Sim' é o único valor que representa "quitado" em compras_financeiro
// (os demais — vazio, 'Não', ausente — contam como em aberto).
// Chave de agrupamento tolerante a maiúscula/espaço (ex.: "Ragner" e "RAGNER"
// são o mesmo fornecedor) — o nome exibido fica com a grafia da 1ª ocorrência.
function _cdChaveFornecedor(nome) {
  return (nome || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

function _cdAgregarFinanceiro(fin, modulo) {
  const porFornecedor = {};
  fin.forEach(f => {
    if ((f.modulo || 'suprimentos') !== modulo) return;
    const nomeExibicao = (f.fornecedor || '').trim() || '(sem fornecedor)';
    const chave = _cdChaveFornecedor(nomeExibicao);
    const alvo = porFornecedor[chave] || (porFornecedor[chave] = { nome: nomeExibicao, pedido: 0, pago: 0 });
    const valor = Number(f.valor) || 0;
    alvo.pedido += valor;
    if (f.pago === 'Sim') alvo.pago += valor;
  });
  return _cdOrdenarSaldo(porFornecedor);
}

// Fretes cancelados não entram (não houve serviço, não gera dívida).
// valorPago já é parcial-aware (o mesmo campo usado no restante do módulo).
function _cdAgregarFretes(fretes) {
  const porFreteiro = {};
  fretes.forEach(f => {
    if (f.status === 'cancelado') return;
    const nomeExibicao = (f.freteiroNome || '').trim() || '(sem freteiro)';
    const chave = _cdChaveFornecedor(nomeExibicao);
    const alvo = porFreteiro[chave] || (porFreteiro[chave] = { nome: nomeExibicao, pedido: 0, pago: 0 });
    alvo.pedido += Number(f.valor) || 0;
    alvo.pago += Number(f.valorPago) || 0;
  });
  return _cdOrdenarSaldo(porFreteiro);
}

function _cdOrdenarSaldo(porFornecedor) {
  return Object.values(porFornecedor)
    .map(v => ({ fornecedor: v.nome, pedido: v.pedido, pago: v.pago, saldo: v.pedido - v.pago }))
    .sort((a, b) => b.saldo - a.saldo);
}

function _cdRenderSaldoTabela(tbodyId, linhas, limitesPorFornecedor) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  if (!linhas.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-muted);">Nenhum lançamento encontrado.</td></tr>';
    return;
  }
  const mapa = limitesPorFornecedor || {};
  const totais = linhas.reduce((s, l) => ({ pedido: s.pedido + l.pedido, pago: s.pago + l.pago, saldo: s.saldo + l.saldo }), { pedido: 0, pago: 0, saldo: 0 });
  const linha = (l, destaque) => {
    const limite = destaque ? 0 : (mapa[_cdChaveFornecedor(l.fornecedor)] || 0);
    // % do limite já consumido pelo que ainda está em aberto (saldo devedor).
    // Saldo negativo (pagamos mais do que devemos) não "libera" limite negativo — trava em 0%.
    const pct = limite > 0 ? Math.max(0, l.saldo) / limite * 100 : null;
    const corPct = pct === null ? '' : pct >= 90 ? 'color:var(--danger,#dc2626);' : pct >= 50 ? 'color:#d97706;' : '';
    return `
    <tr${destaque ? ' style="border-top:2px solid var(--border);font-weight:700;"' : ''}>
      <td>${frtEsc(l.fornecedor)}</td>
      <td style="text-align:right;">${_cd.BRL(l.pedido)}</td>
      <td style="text-align:right;color:var(--ok,#16a34a);">${_cd.BRL(l.pago)}</td>
      <td style="text-align:right;font-weight:${destaque ? 700 : 600};${l.saldo > 0.005 ? 'color:var(--danger,#dc2626);' : ''}">${_cd.BRL(l.saldo)}</td>
      <td style="text-align:right;">${destaque ? '' : (limite > 0 ? _cd.BRL(limite) : '<span style="color:var(--text-muted);">—</span>')}</td>
      <td style="text-align:right;font-weight:600;${corPct}">${destaque ? '' : (pct === null ? '<span style="color:var(--text-muted);">—</span>' : pct.toFixed(0) + '%')}</td>
    </tr>`;
  };
  tbody.innerHTML = linhas.map(l => linha(l, false)).join('') + linha({ fornecedor: 'Total', ...totais }, true);
}

// ── 6. CONCILIAÇÃO FINANCEIRA (planilha "Visão Contas a Pagar" do financeiro) ─
// Toda semana o financeiro manda um export do que ainda está em aberto.
// Comparamos, POR FORNECEDOR RESOLVIDO (nunca no geral), contra
// compras_financeiro com pago != 'Sim': o que sumiu da planilha o
// financeiro já pagou → proposto pra marcar como pago (com confirmação).
// Fornecedor que a planilha não cita fica totalmente intocado.

// Aliases conhecidos: o mesmo fornecedor aparece com grafias diferentes na
// planilha do financeiro, no cadastro (suppliers) e no texto livre gravado
// em compras_financeiro.fornecedor ao longo do tempo. Chave = nome
// normalizado (_cdChaveFornecedor) → nome canônico do supplier.
const _CD_FORN_ALIASES = {
  'RAGNER': 'Carnes Express', 'CARNES EXPRESS': 'Carnes Express', 'CASA DAS CARNES E CIA LTDA': 'Carnes Express',
  'PAJUCARA': 'Pajuçara Distribuidora de Alimentos LTDA', 'PAJUCARA DISTRIBUIDORA DE ALIMENTOS LTDA': 'Pajuçara Distribuidora de Alimentos LTDA',
  'SKYLINE': 'Skyline', 'SKYLINE TOUR VIAGENS': 'Skyline', 'SKYLINE TOUR VIAGENS LTDA': 'Skyline',
  'GRANDES VIAGENS': 'Grandes Viagens', 'GRANDES VIAGENS TURISMO LTDA': 'Grandes Viagens',
  'CHIP VIAGENS': 'Chip Viagens',
  'GAMA E CRUZ COMERCIO': 'Gama e Cruz Comercio', 'GAMA E CRUZ COMERCIO VAREJISTA DE CARNES LTDA': 'Gama e Cruz Comercio',
  'QUADROS CRIATIVOS': 'Quadros Criativos', 'FRANCISCA LINDALVA LIMA DE OLIVEIRA': 'Quadros Criativos',
};

const _cdNormCNPJ = s => String(s || '').replace(/\D/g, '');

// Resolve um texto de fornecedor (da planilha OU de compras_financeiro) pro
// supplier canônico: CNPJ exato → nome normalizado exato → alias conhecido
// → mapeamento manual feito pelo usuário nesta sessão (resolvidosManual).
function _cdResolverFornecedor(nomeTexto, cnpjTexto, suppliers, resolvidosManual) {
  const cnpjNorm = _cdNormCNPJ(cnpjTexto);
  if (cnpjNorm) {
    const porCnpj = suppliers.find(s => _cdNormCNPJ(s.cnpj) === cnpjNorm);
    if (porCnpj) return porCnpj;
  }
  const chave = _cdChaveFornecedor(nomeTexto);
  if (resolvidosManual && resolvidosManual[chave]) {
    const m = suppliers.find(s => s.id === resolvidosManual[chave]);
    if (m) return m;
  }
  let m = suppliers.find(s => _cdChaveFornecedor(s.nome) === chave);
  if (m) return m;
  const aliasNome = _CD_FORN_ALIASES[chave];
  if (aliasNome) {
    m = suppliers.find(s => _cdChaveFornecedor(s.nome) === _cdChaveFornecedor(aliasNome));
    if (m) return m;
  }
  return null;
}

let _coordConc = { linhasPlanilha: [], suppliers: [], naoIdentificados: [], resolvidosManual: {}, propostosPagar: [], soNaPlanilha: [] };

async function initCoordConciliacao() {
  _coordConc = { linhasPlanilha: [], suppliers: [], naoIdentificados: [], resolvidosManual: {}, propostosPagar: [], soNaPlanilha: [] };
  document.getElementById('coord-conc-resumo').innerHTML = '';
  ['coord-conc-card-naoident', 'coord-conc-card-pagar', 'coord-conc-card-naosistema'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = 'none';
  });
  const fileInput = document.getElementById('coord-conc-file');
  if (fileInput) fileInput.value = '';
}
window.initCoordConciliacao = initCoordConciliacao;

function coordConcHandleDrop(ev) {
  ev.preventDefault();
  ev.currentTarget.classList.remove('dragover');
  const f = ev.dataTransfer.files[0];
  if (f) coordConcLerArquivo(f);
}
window.coordConcHandleDrop = coordConcHandleDrop;

function coordConcLerArquivo(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const nomeAba = wb.SheetNames.find(n => n.toLowerCase().includes('contas a pagar')) || wb.SheetNames[0];
      const sh = wb.Sheets[nomeAba];
      const rows = XLSX.utils.sheet_to_json(sh, { header: 1, raw: false, defval: '' });
      const header = (rows[0] || []).map(h => String(h).trim().toLowerCase());
      const idx = nome => header.indexOf(nome.toLowerCase());
      const iCnpj = idx('Identificador do fornecedor'), iNome = idx('Nome do fornecedor'),
            iVenc = idx('Data de vencimento'), iDescricao = idx('Descrição'),
            iValorAberto = idx('Valor total da parcela em aberto (R$)') > -1 ? idx('Valor total da parcela em aberto (R$)') : idx('Valor da parcela em aberto (R$)');
      if (iNome === -1 || iValorAberto === -1) { showToast('❌ Não reconheci as colunas — confira se é a planilha "Visão Contas a Pagar".'); return; }

      const linhas = rows.slice(1)
        .filter(r => r.some(c => String(c).trim() !== ''))
        .map(r => ({
          cnpj: r[iCnpj] || '', nomePlanilha: r[iNome] || '',
          vencimento: r[iVenc] || '', descricao: r[iDescricao] || '',
          valor: parseFloat(String(r[iValorAberto]).replace(',', '.')) || 0,
        }))
        .filter(l => l.valor > 0.005 && l.nomePlanilha);

      if (!linhas.length) { showToast('⚠️ Nenhuma linha com valor em aberto encontrada no arquivo.'); return; }

      const suppSnap = await db.collection('suppliers').get();
      _coordConc.suppliers = suppSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Acumula com o que já foi lido antes (permite subir mais de um arquivo em sequência)
      _coordConc.linhasPlanilha = _coordConc.linhasPlanilha.concat(linhas);
      showToast(`📄 ${linhas.length} linhas lidas de "${file.name}".`);
      await coordConcProcessar();
    } catch (err) {
      console.error('coordConcLerArquivo', err);
      showToast('❌ Erro ao ler o arquivo: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}
window.coordConcLerArquivo = coordConcLerArquivo;

async function coordConcProcessar() {
  const { suppliers, resolvidosManual } = _coordConc;
  const porFornecedor = {}; // supplierId -> { supplier, linhas: [] }
  const naoIdent = {};      // chave normalizada -> { nome, cnpj, linhas: [] }

  _coordConc.linhasPlanilha.forEach(l => {
    const s = _cdResolverFornecedor(l.nomePlanilha, l.cnpj, suppliers, resolvidosManual);
    if (s) {
      (porFornecedor[s.id] = porFornecedor[s.id] || { supplier: s, linhas: [] }).linhas.push(l);
    } else {
      const chave = _cdChaveFornecedor(l.nomePlanilha);
      (naoIdent[chave] = naoIdent[chave] || { nome: l.nomePlanilha, cnpj: l.cnpj, linhas: [] }).linhas.push(l);
    }
  });
  _coordConc.naoIdentificados = Object.values(naoIdent);
  _coordConcRenderNaoIdentificados();

  const finSnap = await db.collection('compras_financeiro').get();
  const fin = finSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const propostosPagar = [];
  const soNaPlanilha = [];

  Object.values(porFornecedor).forEach(grupo => {
    // Abertos do sistema que resolvem pro MESMO fornecedor (usa o mesmo
    // resolvedor nos dois lados — cobre o texto livre histórico de
    // compras_financeiro.fornecedor, que nem sempre bate com o nome do
    // cadastro, ex.: "SKYLINE TOUR VIAGENS LTDA" → resolve pra "Skyline").
    const abertosSistema = fin.filter(f => {
      if (f.pago === 'Sim') return false;
      if (f.fornecedorId) return f.fornecedorId === grupo.supplier.id;
      const r = _cdResolverFornecedor(f.fornecedor, null, suppliers, resolvidosManual);
      return r && r.id === grupo.supplier.id;
    });
    // Casamento por valor (dentro do mesmo fornecedor) — data não é chave
    // rígida (formatos diferentes entre planilha e sistema); o que importa
    // pro saldo é o valor total baixado, não qual linha específica "é" qual.
    const restante = abertosSistema.slice();
    grupo.linhas.forEach(l => {
      const i = restante.findIndex(f => Math.abs((Number(f.valor) || 0) - l.valor) < 0.01);
      if (i > -1) restante.splice(i, 1);
      else soNaPlanilha.push({ fornecedor: grupo.supplier.nome, descricao: l.descricao, valor: l.valor, vencimento: l.vencimento });
    });
    restante.forEach(f => propostosPagar.push({ id: f.id, fornecedor: grupo.supplier.nome, descricao: f.destinatario || f.pedidoRef || '—', valor: Number(f.valor) || 0, vencimento: f.vencimentoStr || '—' }));
  });

  _coordConc.propostosPagar = propostosPagar;
  _coordConc.soNaPlanilha = soNaPlanilha;
  _cdRenderPropostosPagar(propostosPagar);
  _cdRenderSoNaPlanilha(soNaPlanilha);
  _cdRenderResumoConciliacao();
}

function _cdRenderResumoConciliacao() {
  const { linhasPlanilha, naoIdentificados, propostosPagar } = _coordConc;
  const totalPagar = propostosPagar.reduce((s, p) => s + p.valor, 0);
  document.getElementById('coord-conc-resumo').innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-body" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;">
        <div><div style="font-size:11px;color:var(--text-muted);">LINHAS NA PLANILHA</div><div style="font-size:20px;font-weight:700;">${linhasPlanilha.length}</div></div>
        <div><div style="font-size:11px;color:var(--text-muted);">FORNECEDORES NÃO IDENTIFICADOS</div><div style="font-size:20px;font-weight:700;${naoIdentificados.length ? 'color:var(--warn,#d97706);' : ''}">${naoIdentificados.length}</div></div>
        <div><div style="font-size:11px;color:var(--text-muted);">PROPOSTOS PRA MARCAR PAGO</div><div style="font-size:20px;font-weight:700;color:var(--ok,#16a34a);">${propostosPagar.length} (${_cd.BRL(totalPagar)})</div></div>
      </div>
    </div>`;
}

function _coordConcRenderNaoIdentificados() {
  const card = document.getElementById('coord-conc-card-naoident');
  const lista = document.getElementById('coord-conc-naoident-lista');
  const itens = _coordConc.naoIdentificados;
  if (!itens.length) { card.style.display = 'none'; return; }
  card.style.display = '';
  const opcoesSuppliers = _coordConc.suppliers.slice().sort((a,b) => (a.nome||'').localeCompare(b.nome||'','pt-BR'))
    .map(s => `<option value="${s.id}">${frtEsc(s.nome)}</option>`).join('');
  lista.innerHTML = itens.map((it, i) => {
    const totalItem = it.linhas.reduce((s,l)=>s+l.valor,0);
    return `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 10px;border:1px solid var(--border);border-radius:6px;">
      <div style="flex:1;min-width:200px;">
        <div style="font-weight:600;">${frtEsc(it.nome)}</div>
        <div style="font-size:11px;color:var(--text-muted);">CNPJ ${frtEsc(it.cnpj || '—')} · ${it.linhas.length} linha(s) · ${_cd.BRL(totalItem)}</div>
      </div>
      <select class="form-select" style="max-width:260px;" id="coord-conc-sel-${i}">
        <option value="">— selecionar fornecedor —</option>
        ${opcoesSuppliers}
      </select>
      <button class="btn btn-outline btn-sm" onclick="coordConcIdentificar(${i})">Usar este</button>
      <button class="btn btn-outline btn-sm" onclick="coordConcNovoFornecedor(${i})">+ Cadastrar novo</button>
    </div>`;
  }).join('');
}

function coordConcIdentificar(i) {
  const it = _coordConc.naoIdentificados[i];
  const sel = document.getElementById(`coord-conc-sel-${i}`);
  if (!sel || !sel.value) return showToast('⚠️ Selecione um fornecedor.');
  _coordConc.resolvidosManual[_cdChaveFornecedor(it.nome)] = sel.value;
  showToast(`✅ "${it.nome}" associado. Clique em "Recalcular" quando terminar.`);
}
window.coordConcIdentificar = coordConcIdentificar;

async function coordConcNovoFornecedor(i) {
  const it = _coordConc.naoIdentificados[i];
  const nome = (prompt('Nome do novo fornecedor:', it.nome) || '').trim();
  if (!nome) return;
  try {
    const { id } = await db.collection('suppliers').add({
      nome, cnpj: it.cnpj || null, tipos: ['produtos'], createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    _coordConc.suppliers.push({ id, nome, cnpj: it.cnpj || null });
    _coordConc.resolvidosManual[_cdChaveFornecedor(it.nome)] = id;
    showToast(`✅ Fornecedor "${nome}" cadastrado e associado. Clique em "Recalcular" quando terminar.`);
    _coordConcRenderNaoIdentificados();
  } catch (e) {
    console.error('coordConcNovoFornecedor', e);
    showToast('❌ Erro ao cadastrar: ' + e.message);
  }
}
window.coordConcNovoFornecedor = coordConcNovoFornecedor;

async function coordConcRecalcular() { await coordConcProcessar(); }
window.coordConcRecalcular = coordConcRecalcular;

function _cdRenderPropostosPagar(linhas) {
  const card = document.getElementById('coord-conc-card-pagar');
  const tbody = document.getElementById('coord-conc-pagar-tbody');
  if (!linhas.length) { card.style.display = 'none'; return; }
  card.style.display = '';
  tbody.innerHTML = linhas.map((l, i) => `
    <tr>
      <td><input type="checkbox" class="coord-conc-check" data-i="${i}" checked></td>
      <td>${frtEsc(l.fornecedor)}</td>
      <td style="max-width:320px;">${frtEsc(l.descricao)}</td>
      <td style="text-align:right;">${_cd.BRL(l.valor)}</td>
      <td>${frtEsc(l.vencimento)}</td>
    </tr>`).join('');
  document.getElementById('coord-conc-pagar-total').textContent = `Total: ${_cd.BRL(linhas.reduce((s,l)=>s+l.valor,0))}`;
}

function coordConcToggleAll(checked) {
  document.querySelectorAll('.coord-conc-check').forEach(c => { c.checked = checked; });
}
window.coordConcToggleAll = coordConcToggleAll;

function _cdRenderSoNaPlanilha(linhas) {
  const card = document.getElementById('coord-conc-card-naosistema');
  const tbody = document.getElementById('coord-conc-naosistema-tbody');
  if (!linhas.length) { card.style.display = 'none'; return; }
  card.style.display = '';
  tbody.innerHTML = linhas.map(l => `
    <tr>
      <td>${frtEsc(l.fornecedor)}</td>
      <td style="max-width:320px;">${frtEsc(l.descricao)}</td>
      <td style="text-align:right;">${_cd.BRL(l.valor)}</td>
      <td>${frtEsc(l.vencimento)}</td>
    </tr>`).join('');
}

async function coordConcAplicar() {
  const marcados = Array.from(document.querySelectorAll('.coord-conc-check:checked')).map(c => _coordConc.propostosPagar[Number(c.dataset.i)]);
  if (!marcados.length) return showToast('⚠️ Nenhum item marcado.');
  if (!confirm(`Marcar ${marcados.length} lançamento(s) como pago, totalizando ${_cd.BRL(marcados.reduce((s,l)=>s+l.valor,0))}?`)) return;

  const btn = document.getElementById('coord-conc-btn-aplicar');
  if (btn) { btn.disabled = true; btn.textContent = 'Aplicando…'; }
  let ok = 0, erro = 0;
  for (const l of marcados) {
    try {
      await db.collection('compras_financeiro').doc(l.id).update({ pago: 'Sim' });
      ok++;
    } catch (e) { console.error('coordConcAplicar', l, e); erro++; }
  }
  if (btn) { btn.disabled = false; btn.textContent = 'Confirmar e marcar como pago'; }
  showToast(`✅ ${ok} marcado(s) como pago${erro ? `, ${erro} com erro` : ''}.`);
  await coordConcProcessar();
}
window.coordConcAplicar = coordConcAplicar;
