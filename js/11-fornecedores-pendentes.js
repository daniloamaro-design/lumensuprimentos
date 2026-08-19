// Extraído de index.html (indicadores de fornecedores + painel de orçamentos pendentes) em 2026-07-27
// ─────────────────────────────────────────────
// 📊  INDICADORES DE FORNECEDORES
// ─────────────────────────────────────────────
let indFornecedoresData     = null;
let indFornecedoresFiltered = null;
let chartIndPagoAberto = null;
let chartIndCategoria  = null;
let chartIndCasas      = null;
let chartIndBlocos     = null;
const FMT_BRL = v => 'R$ ' + (v||0).toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 });

async function initIndFornecedores() {
  // Casas no filtro de detalhe
  const selCasa = document.getElementById('indf-filter-casa-detail');
  if (selCasa && selCasa.options.length <= 1) {
    CASAS.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; selCasa.appendChild(o); });
  }
  // Fornecedores no filtro
  const selForn = document.getElementById('indf-fornecedor');
  if (selForn) {
    selForn.innerHTML = '<option value="">Todos os fornecedores</option>';
    if (suppliersCache.length === 0) {
      const snap = await db.collection('suppliers').orderBy('nome').get();
      suppliersCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    suppliersCache.forEach(s => { const o = document.createElement('option'); o.value = s.id; o.textContent = s.nome; selForn.appendChild(o); });
  }
  // Datas padrão (último mês)
  const now = new Date(); const m1 = new Date(now); m1.setMonth(m1.getMonth()-1);
  const fmtD = d => d.toISOString().slice(0,10);
  const de = document.getElementById('indf-de'); const ate = document.getElementById('indf-ate');
  if (de && !de.value) de.value = fmtD(m1);
  if (ate && !ate.value) ate.value = fmtD(now);
  await loadIndFornecedores();
}

async function loadIndFornecedores() {
  setBtnLoading('btn-load-indf', true);
  try {
    if (suppliersCache.length === 0) {
      const snap = await db.collection('suppliers').orderBy('nome').get();
      suppliersCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    const [ordersSnap, blocoSnap] = await Promise.all([
      db.collection('orders').get(),
      db.collection('casas_blocos').get()
    ]);
    if (Object.keys(CASAS_BLOCOS).length === 0) {
      blocoSnap.docs.forEach(d => { CASAS_BLOCOS[d.data().nome] = d.data().bloco; });
    }
    const orders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const hoje = new Date();

    const fornecedoresEnriquecidos = suppliersCache.map(s => {
      const limite    = parseFloat(s.limite)    || 0;
      const utilizado = parseFloat(s.utilizado) || 0;
      const disponivel= Math.max(0, limite - utilizado);
      const pct       = limite > 0 ? (utilizado / limite) * 100 : 0;

      const pedidosForn = orders.filter(o =>
        o.supplierId === s.id ||
        (o.supplierNome && o.supplierNome.toLowerCase() === s.nome.toLowerCase())
      );

      const _calcVals = (peds) => {
        let pago=0, aberto=0, vencido=0;
        peds.forEach(o => {
          const val = parseFloat(o.valorEstimado || o.totalEstimado || o.valor || 0);
          const sp  = o.statusPagamento || o.status;
          const venc= o.boletoVencimento ? new Date(o.boletoVencimento) : null;
          if (sp === 'pago' || sp === 'concluido') pago += val;
          else if (venc && venc < hoje) vencido += val;
          else aberto += val;
        });
        if (peds.length === 0 && utilizado > 0) aberto = utilizado;
        return { pago, aberto, vencido };
      };

      const { pago: valorPago, aberto: valorAberto, vencido: valorVencido } = _calcVals(pedidosForn);

      // Por casa
      const porCasa = {};
      pedidosForn.forEach(o => {
        const casa = o.house || o.casa || '—';
        if (!porCasa[casa]) porCasa[casa] = { pago:0, aberto:0, vencido:0, total:0, bloco: CASAS_BLOCOS[casa] || '—' };
        const val = parseFloat(o.valorEstimado || o.totalEstimado || o.valor || 0);
        const sp  = o.statusPagamento || o.status;
        const venc= o.boletoVencimento ? new Date(o.boletoVencimento) : null;
        porCasa[casa].total += val;
        if (sp === 'pago' || sp === 'concluido') porCasa[casa].pago += val;
        else if (venc && venc < hoje) porCasa[casa].vencido += val;
        else porCasa[casa].aberto += val;
      });

      // Por bloco
      const porBloco = {};
      Object.entries(porCasa).forEach(([casa, vals]) => {
        const bloco = vals.bloco || '—';
        if (!porBloco[bloco]) porBloco[bloco] = { pago:0, aberto:0, vencido:0, total:0, casas:[] };
        porBloco[bloco].pago    += vals.pago;
        porBloco[bloco].aberto  += vals.aberto;
        porBloco[bloco].vencido += vals.vencido;
        porBloco[bloco].total   += vals.total;
        if (!porBloco[bloco].casas.includes(casa)) porBloco[bloco].casas.push(casa);
      });

      const prazoLabel = { a_vista:'À vista','7':'7d','14':'14d','21':'21d','28':'28d','30':'30d','45':'45d','60':'60d' }[s.prazo] || (s.prazo || '—');
      return { ...s, limite, utilizado, disponivel, pct, valorPago, valorAberto, valorVencido,
               totalMovimentado: valorPago+valorAberto+valorVencido, pedidosForn, porCasa, porBloco, prazoLabel };
    });

    indFornecedoresData = fornecedoresEnriquecidos;
    filterIndFornecedores();
  } catch(e) { showToast('Erro ao carregar: ' + e.message); console.error(e); }
  setBtnLoading('btn-load-indf', false);
}

function filterIndFornecedores() {
  if (!indFornecedoresData) return;
  const filtForn   = document.getElementById('indf-fornecedor')?.value   || '';
  const filtCat    = document.getElementById('indf-categoria')?.value    || '';
  const filtBloco  = document.getElementById('indf-bloco')?.value        || '';
  const filtStatus = document.getElementById('indf-status-pag')?.value   || '';
  const filtDe     = document.getElementById('indf-de')?.value           || '';
  const filtAte    = document.getElementById('indf-ate')?.value          || '';

  let filtered = indFornecedoresData;
  if (filtForn)   filtered = filtered.filter(s => s.id === filtForn);
  if (filtCat)    filtered = filtered.filter(s => (s.categorias||[]).includes(filtCat));
  if (filtBloco)  filtered = filtered.filter(s => Object.keys(s.porBloco).includes(filtBloco));
  if (filtStatus) {
    filtered = filtered.filter(s => {
      if (filtStatus === 'pago')    return s.valorPago > 0;
      if (filtStatus === 'aberto')  return s.valorAberto > 0;
      if (filtStatus === 'vencido') return s.valorVencido > 0;
      return true;
    });
  }
  // Filtro de datas — recalcula valores apenas para pedidos no período
  if (filtDe || filtAte) {
    const deD  = filtDe  ? new Date(filtDe)  : null;
    const ateD = filtAte ? new Date(filtAte)  : null;
    if (ateD) ateD.setHours(23,59,59);
    const hoje = new Date();
    filtered = filtered.map(s => {
      const peds = s.pedidosForn.filter(o => {
        const dt = o.createdAt?.toDate ? o.createdAt.toDate() : (o.createdAt ? new Date(o.createdAt) : null);
        if (!dt) return true;
        if (deD  && dt < deD)  return false;
        if (ateD && dt > ateD) return false;
        return true;
      });
      let valorPago=0, valorAberto=0, valorVencido=0;
      peds.forEach(o => {
        const val = parseFloat(o.valorEstimado||o.totalEstimado||o.valor||0);
        const sp  = o.statusPagamento||o.status;
        const venc= o.boletoVencimento ? new Date(o.boletoVencimento) : null;
        if (sp==='pago'||sp==='concluido') valorPago+=val;
        else if (venc&&venc<hoje) valorVencido+=val;
        else valorAberto+=val;
      });
      if (peds.length===0 && s.utilizado>0) valorAberto=s.utilizado;
      return { ...s, valorPago, valorAberto, valorVencido, totalMovimentado: valorPago+valorAberto+valorVencido };
    });
  }
  indFornecedoresFiltered = filtered;
  renderIndFornecedores();
}

function renderIndFornecedores() {
  const data = indFornecedoresFiltered || [];
  const totalLimite    = data.reduce((s,x)=>s+x.limite,0);
  const totalUtilizado = data.reduce((s,x)=>s+x.utilizado,0);
  const totalPago      = data.reduce((s,x)=>s+x.valorPago,0);
  const totalAberto    = data.reduce((s,x)=>s+x.valorAberto,0);
  const totalVencido   = data.reduce((s,x)=>s+x.valorVencido,0);
  const totalDisp      = Math.max(0, totalLimite-totalUtilizado);

  // KPIs
  document.getElementById('indf-kpi-total-sup').textContent     = data.length;
  document.getElementById('indf-kpi-total-sup-sub').textContent  = data.length===1?'fornecedor':'fornecedores';
  document.getElementById('indf-kpi-pago').textContent           = FMT_BRL(totalPago);
  document.getElementById('indf-kpi-pago-sub').textContent       = data.filter(x=>x.valorPago>0).length+' com pagamento';
  document.getElementById('indf-kpi-aberto').textContent         = FMT_BRL(totalAberto);
  document.getElementById('indf-kpi-aberto-sub').textContent     = data.filter(x=>x.valorAberto>0).length+' em aberto';
  document.getElementById('indf-kpi-vencido').textContent        = FMT_BRL(totalVencido);
  document.getElementById('indf-kpi-vencido-sub').textContent    = data.filter(x=>x.valorVencido>0).length+' com vencimento';
  document.getElementById('indf-kpi-limite').textContent         = FMT_BRL(totalLimite);
  const pctUtilizado = totalLimite > 0 ? (totalUtilizado / totalLimite * 100) : 0;
  document.getElementById('indf-kpi-limite-sub').textContent     = pctUtilizado.toFixed(0) + '% utilizado';
  const barEl = document.getElementById('indf-kpi-limite-bar');
  if (barEl) {
    barEl.style.width = Math.min(pctUtilizado, 100) + '%';
    barEl.className = 'stat-progress-bar' + (pctUtilizado >= 90 ? ' danger' : pctUtilizado >= 70 ? ' warn' : ' ok');
  }
  document.getElementById('indf-kpi-disponivel').textContent     = FMT_BRL(totalDisp);
  document.getElementById('indf-kpi-disponivel-sub').textContent = 'de ' + FMT_BRL(totalLimite) + ' total';

  // Tabela
  const tbody = document.getElementById('indf-tbody');
  document.getElementById('indf-table-sub').textContent = data.length+' fornecedor(es)';
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="text-muted" style="text-align:center;padding:32px;">Nenhum fornecedor encontrado.</td></tr>';
  } else {
    tbody.innerHTML = data.map(s => {
      const pct = s.limite>0 ? Math.min(100,(s.utilizado/s.limite*100)) : 0;
      const barColor = pct>=90?'var(--danger)':pct>=50?'var(--warn)':'var(--ok)';
      const cats = (s.categorias||[]).map(c=>CATEGORIAS[c]?.icon+' '+CATEGORIAS[c]?.nome).join(', ')||'—';
      let statusBadge = s.valorVencido>0
        ? '<span class="badge badge-danger">🔴 Vencido</span>'
        : s.valorAberto>0
          ? '<span class="badge badge-warn">🟡 Em Aberto</span>'
          : s.valorPago>0
            ? '<span class="badge badge-ok">✅ Pago</span>'
            : '<span class="badge badge-gray">Sem movim.</span>';
      return `<tr>
        <td><strong>${s.nome}</strong><div style="font-size:11px;color:var(--text-muted);">${s.prazoLabel}</div></td>
        <td style="font-size:12px;">${cats}</td>
        <td style="font-weight:700;color:var(--lumen);">${s.limite>0?FMT_BRL(s.limite):'—'}</td>
        <td style="font-weight:700;">${FMT_BRL(s.utilizado)}</td>
        <td style="font-weight:700;color:var(--ok);">${FMT_BRL(s.valorPago)}</td>
        <td style="font-weight:700;color:var(--warn);">${FMT_BRL(s.valorAberto)}</td>
        <td style="font-weight:700;color:var(--lumen);">${FMT_BRL(s.disponivel)}</td>
        <td style="min-width:110px;">
          <div style="display:flex;align-items:center;gap:6px;">
            <div style="flex:1;background:var(--border);border-radius:4px;height:6px;overflow:hidden;">
              <div style="width:${pct.toFixed(1)}%;height:100%;background:${barColor};border-radius:4px;"></div>
            </div>
            <span style="font-size:11px;font-weight:700;color:${barColor};min-width:30px;">${pct.toFixed(0)}%</span>
          </div>
        </td>
        <td><span class="badge badge-gray">${s.prazoLabel}</span></td>
        <td>${statusBadge}</td>
      </tr>`;
    }).join('');
  }

  _renderChartPagoAberto(data);
  _renderChartCategoria(data);
  _renderChartCasas(data);
  _renderChartBlocos(data);
  renderIndFornecedoresCasaDetail();
  renderIndFornecedoresBlocos();
}

function _destroyChart(ref) { if(ref){try{ref.destroy();}catch(e){}} return null; }

function _renderChartPagoAberto(data) {
  chartIndPagoAberto = _destroyChart(chartIndPagoAberto);
  const ctx = document.getElementById('chart-indf-pago-aberto'); if(!ctx) return;
  const labels  = data.map(s=>s.nome.length>16?s.nome.slice(0,14)+'…':s.nome);
  chartIndPagoAberto = new Chart(ctx, {
    type:'bar',
    data:{ labels, datasets:[
      { label:'Pago',     data:data.map(s=>s.valorPago),   backgroundColor:'rgba(26,122,68,0.75)',  borderRadius:4 },
      { label:'Em Aberto',data:data.map(s=>s.valorAberto), backgroundColor:'rgba(212,137,10,0.75)', borderRadius:4 },
      { label:'Vencido',  data:data.map(s=>s.valorVencido),backgroundColor:'rgba(192,57,43,0.75)',  borderRadius:4 }
    ]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{position:'bottom',labels:{font:{size:11}}},
        tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${FMT_BRL(c.raw)}`}}},
      scales:{ x:{stacked:true,ticks:{font:{size:10}}}, y:{stacked:true,ticks:{callback:v=>'R$'+v.toLocaleString('pt-BR'),font:{size:10}}} }
    }
  });
}

function _renderChartCategoria(data) {
  chartIndCategoria = _destroyChart(chartIndCategoria);
  const ctx = document.getElementById('chart-indf-categoria'); if(!ctx) return;
  const catMap = {};
  data.forEach(s=>(s.categorias||[]).forEach(c=>{ catMap[c]=(catMap[c]||0)+(s.utilizado||0); }));
  const labels = Object.keys(catMap).map(c=>(CATEGORIAS[c]?.icon||'')+' '+(CATEGORIAS[c]?.nome||c));
  const colors = ['rgba(43,159,168,0.8)','rgba(232,200,50,0.85)','rgba(192,57,43,0.8)','rgba(26,122,68,0.8)','rgba(107,114,128,0.7)'];
  chartIndCategoria = new Chart(ctx, {
    type:'doughnut',
    data:{ labels, datasets:[{data:Object.values(catMap), backgroundColor:colors, hoverOffset:8}]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{legend:{position:'bottom',labels:{font:{size:11}}},
        tooltip:{callbacks:{label:c=>`${c.label}: ${FMT_BRL(c.raw)}`}}}
    }
  });
}

function _renderChartCasas(data) {
  chartIndCasas = _destroyChart(chartIndCasas);
  const ctx = document.getElementById('chart-indf-casas'); if(!ctx) return;
  const casaMap = {};
  data.forEach(s=>Object.entries(s.porCasa).forEach(([casa,vals])=>{
    if(!casaMap[casa]) casaMap[casa]={pago:0,aberto:0,vencido:0};
    casaMap[casa].pago+=vals.pago; casaMap[casa].aberto+=vals.aberto; casaMap[casa].vencido+=vals.vencido;
  }));
  const sorted = Object.entries(casaMap).sort((a,b)=>(b[1].pago+b[1].aberto+b[1].vencido)-(a[1].pago+a[1].aberto+a[1].vencido)).slice(0,10);
  chartIndCasas = new Chart(ctx, {
    type:'bar', indexAxis:'y',
    data:{ labels:sorted.map(([c])=>c.length>14?c.slice(0,12)+'…':c), datasets:[
      { label:'Pago',     data:sorted.map(([,v])=>v.pago),   backgroundColor:'rgba(26,122,68,0.75)',  borderRadius:4 },
      { label:'Em Aberto',data:sorted.map(([,v])=>v.aberto), backgroundColor:'rgba(212,137,10,0.75)', borderRadius:4 },
      { label:'Vencido',  data:sorted.map(([,v])=>v.vencido),backgroundColor:'rgba(192,57,43,0.75)',  borderRadius:4 }
    ]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{legend:{position:'bottom',labels:{font:{size:10}}},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${FMT_BRL(c.raw)}`}}},
      scales:{x:{stacked:true,ticks:{callback:v=>'R$'+v.toLocaleString('pt-BR'),font:{size:9}}},y:{stacked:true,ticks:{font:{size:9}}}}
    }
  });
}

function _renderChartBlocos(data) {
  chartIndBlocos = _destroyChart(chartIndBlocos);
  const ctx = document.getElementById('chart-indf-blocos'); if(!ctx) return;
  const blocoMap = {};
  data.forEach(s=>Object.entries(s.porBloco).forEach(([bloco,vals])=>{
    if(!blocoMap[bloco]) blocoMap[bloco]={pago:0,aberto:0,vencido:0};
    blocoMap[bloco].pago+=vals.pago; blocoMap[bloco].aberto+=vals.aberto; blocoMap[bloco].vencido+=vals.vencido;
  }));
  const toN = x=>isNaN(x)?999:parseInt(x);
  const sorted = Object.entries(blocoMap).sort((a,b)=>toN(a[0])-toN(b[0]));
  chartIndBlocos = new Chart(ctx, {
    type:'bar',
    data:{ labels:sorted.map(([b])=>b==='—'?'S/ Bloco':`Bloco ${b}`), datasets:[
      { label:'Pago',     data:sorted.map(([,v])=>v.pago),   backgroundColor:'rgba(26,122,68,0.75)',  borderRadius:4 },
      { label:'Em Aberto',data:sorted.map(([,v])=>v.aberto), backgroundColor:'rgba(212,137,10,0.75)', borderRadius:4 },
      { label:'Vencido',  data:sorted.map(([,v])=>v.vencido),backgroundColor:'rgba(192,57,43,0.75)',  borderRadius:4 }
    ]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{legend:{position:'bottom',labels:{font:{size:10}}},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${FMT_BRL(c.raw)}`}}},
      scales:{x:{stacked:true,ticks:{font:{size:10}}},y:{stacked:true,ticks:{callback:v=>'R$'+v.toLocaleString('pt-BR'),font:{size:9}}}}
    }
  });
}

function renderIndFornecedoresCasaDetail() {
  const data = indFornecedoresFiltered||[]; const el=document.getElementById('indf-casas-detail'); if(!el) return;
  const filtCasa = document.getElementById('indf-filter-casa-detail')?.value||'';
  const casaMap = {};
  data.forEach(s=>Object.entries(s.porCasa).forEach(([casa,vals])=>{
    if(filtCasa&&casa!==filtCasa) return;
    if(!casaMap[casa]) casaMap[casa]={pago:0,aberto:0,vencido:0,fornecedores:[],bloco:vals.bloco};
    casaMap[casa].pago+=vals.pago; casaMap[casa].aberto+=vals.aberto; casaMap[casa].vencido+=vals.vencido;
    casaMap[casa].fornecedores.push({nome:s.nome,...vals});
  }));
  if(!Object.keys(casaMap).length) {
    el.innerHTML = '<div class="empty-state" style="padding:24px;"><div class="empty-state-icon">🏠</div><div class="empty-state-title">Nenhum pedido vinculado a fornecedor por casa.<br><span style="font-size:12px;color:var(--text-muted);">Valores calculados via limite de crédito cadastrado.</span></div></div>';
    return;
  }
  const sorted = Object.entries(casaMap).sort((a,b)=>(b[1].pago+b[1].aberto+b[1].vencido)-(a[1].pago+a[1].aberto+a[1].vencido));
  el.innerHTML = sorted.map(([casa,vals])=>{
    const total=vals.pago+vals.aberto+vals.vencido;
    const pctPago=total>0?(vals.pago/total*100):0;
    const bloco=vals.bloco&&vals.bloco!=='—'?`<span class="block-badge" style="font-size:10px;">Bloco ${vals.bloco}</span>`:'';
    return `<div style="border-bottom:1px solid var(--border);padding:14px 20px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap;">
        <span style="font-weight:700;font-size:14px;">${casa}</span>${bloco}
        <div style="display:flex;gap:12px;margin-left:auto;flex-wrap:wrap;">
          <span style="font-size:12px;color:var(--ok);font-weight:700;">✅ ${FMT_BRL(vals.pago)}</span>
          <span style="font-size:12px;color:var(--warn);font-weight:700;">🟡 ${FMT_BRL(vals.aberto)}</span>
          ${vals.vencido>0?`<span style="font-size:12px;color:var(--danger);font-weight:700;">🔴 ${FMT_BRL(vals.vencido)}</span>`:''}
          <span style="font-size:12px;font-weight:700;">Total: ${FMT_BRL(total)}</span>
        </div>
      </div>
      <div style="background:var(--border);border-radius:4px;height:6px;overflow:hidden;margin-bottom:10px;">
        <div style="width:${pctPago.toFixed(1)}%;height:100%;background:var(--ok);border-radius:4px;"></div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${vals.fornecedores.map(f=>`<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-size:12px;flex:1;min-width:150px;">
          <div style="font-weight:700;margin-bottom:4px;">${f.nome}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${f.pago>0?`<span style="color:var(--ok);">✅ ${FMT_BRL(f.pago)}</span>`:''}
            ${f.aberto>0?`<span style="color:var(--warn);">🟡 ${FMT_BRL(f.aberto)}</span>`:''}
            ${f.vencido>0?`<span style="color:var(--danger);">🔴 ${FMT_BRL(f.vencido)}</span>`:''}
            ${f.pago===0&&f.aberto===0&&f.vencido===0?'<span class="text-muted">Sem movim.</span>':''}
          </div>
        </div>`).join('')}
      </div>
    </div>`;
  }).join('');
}

function renderIndFornecedoresBlocos() {
  const data = indFornecedoresFiltered||[]; const el=document.getElementById('indf-blocos-detail'); if(!el) return;
  const blocoMap = {};
  data.forEach(s=>Object.entries(s.porBloco).forEach(([bloco,vals])=>{
    if(!blocoMap[bloco]) blocoMap[bloco]={pago:0,aberto:0,vencido:0,casas:[],fornecedores:{}};
    blocoMap[bloco].pago+=vals.pago; blocoMap[bloco].aberto+=vals.aberto; blocoMap[bloco].vencido+=vals.vencido;
    vals.casas.forEach(c=>{ if(!blocoMap[bloco].casas.includes(c)) blocoMap[bloco].casas.push(c); });
    if(!blocoMap[bloco].fornecedores[s.nome]) blocoMap[bloco].fornecedores[s.nome]={pago:0,aberto:0,vencido:0};
    blocoMap[bloco].fornecedores[s.nome].pago+=vals.pago;
    blocoMap[bloco].fornecedores[s.nome].aberto+=vals.aberto;
    blocoMap[bloco].fornecedores[s.nome].vencido+=vals.vencido;
  }));
  if(!Object.keys(blocoMap).length) {
    el.innerHTML='<div class="empty-state" style="padding:24px;"><div class="empty-state-icon">🏗️</div><div class="empty-state-title">Nenhum dado por bloco disponível</div></div>';
    return;
  }
  const toN=x=>isNaN(x)?999:parseInt(x);
  const sorted=Object.entries(blocoMap).sort((a,b)=>toN(a[0])-toN(b[0]));
  el.innerHTML=sorted.map(([bloco,vals])=>{
    const total=vals.pago+vals.aberto+vals.vencido;
    const pctPago=total>0?(vals.pago/total*100):0;
    const nomBloco=bloco==='—'?'Sem Bloco Definido':`Bloco ${bloco}`;
    const fornEntries=Object.entries(vals.fornecedores).filter(([,v])=>v.pago+v.aberto+v.vencido>0);
    return `<div style="border-bottom:1px solid var(--border);padding:16px 20px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap;">
        <span class="block-badge" style="font-size:12px;padding:4px 12px;">🏗️ ${nomBloco}</span>
        <span style="font-size:12px;color:var(--text-muted);">${vals.casas.length} casa(s) · ${fornEntries.length} fornecedor(es)</span>
        <span style="margin-left:auto;font-weight:700;color:var(--lumen);">Total: ${FMT_BRL(total)}</span>
      </div>
      <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:8px;">
        <span style="font-size:13px;color:var(--ok);font-weight:700;">✅ Pago: ${FMT_BRL(vals.pago)}</span>
        <span style="font-size:13px;color:var(--warn);font-weight:700;">🟡 Em Aberto: ${FMT_BRL(vals.aberto)}</span>
        ${vals.vencido>0?`<span style="font-size:13px;color:var(--danger);font-weight:700;">🔴 Vencido: ${FMT_BRL(vals.vencido)}</span>`:''}
      </div>
      <div style="background:var(--border);border-radius:4px;height:6px;overflow:hidden;margin-bottom:10px;">
        <div style="width:${pctPago.toFixed(1)}%;height:100%;background:var(--ok);border-radius:4px;"></div>
      </div>
      ${fornEntries.length>0?`<div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${fornEntries.map(([nome,v])=>`<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-size:12px;flex:1;min-width:150px;">
          <div style="font-weight:700;margin-bottom:4px;">${nome}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${v.pago>0?`<span style="color:var(--ok);">✅ ${FMT_BRL(v.pago)}</span>`:''}
            ${v.aberto>0?`<span style="color:var(--warn);">🟡 ${FMT_BRL(v.aberto)}</span>`:''}
            ${v.vencido>0?`<span style="color:var(--danger);">🔴 ${FMT_BRL(v.vencido)}</span>`:''}
          </div>
        </div>`).join('')}
      </div>`:`<div style="font-size:12px;color:var(--text-muted);">Casas: ${vals.casas.slice(0,8).join(', ')}${vals.casas.length>8?'…':''}</div>`}
    </div>`;
  }).join('');
}

function exportIndFornecedoresCSV() {
  const data=indFornecedoresFiltered||[];
  if(!data.length){showToast('Nenhum dado para exportar!');return;}
  const rows=[['Fornecedor','Categorias','Limite (R$)','Utilizado (R$)','Pago (R$)','Em Aberto (R$)','Vencido (R$)','Disponível (R$)','Uso do Limite (%)','Prazo']];
  data.forEach(s=>{
    const cats=(s.categorias||[]).map(c=>CATEGORIAS[c]?.nome||c).join('; ');
    rows.push([`"${s.nome}"`,`"${cats}"`,s.limite.toFixed(2),s.utilizado.toFixed(2),s.valorPago.toFixed(2),s.valorAberto.toFixed(2),s.valorVencido.toFixed(2),s.disponivel.toFixed(2),s.pct.toFixed(1),s.prazoLabel]);
  });
  const csv=rows.map(r=>r.join(',')).join('\n');
  const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`LM-Indicadores-Fornecedores-${new Date().toISOString().slice(0,10)}.csv`; a.click();
  showToast('✅ CSV exportado!');
}

function exportIndFornecedoresPDF() {
  const data=indFornecedoresFiltered||[];
  if(!data.length){showToast('Nenhum dado para exportar!');return;}
  const {jsPDF}=window.jspdf; const doc=new jsPDF();
  const blue=[0,56,117],gray=[107,114,128],green=[26,122,68],orange=[212,137,10];
  doc.setFillColor(...blue); doc.rect(0,0,210,28,'F');
  doc.setTextColor(255,255,255); doc.setFontSize(14); doc.setFont('helvetica','bold');
  doc.text('Obra Lumen — Indicadores de Fornecedores',14,12);
  doc.setFontSize(8); doc.setFont('helvetica','normal');
  doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}  |  ${data.length} fornecedor(es)`,14,22);
  let y=38;
  const totPago=data.reduce((s,x)=>s+x.valorPago,0);
  const totAberto=data.reduce((s,x)=>s+x.valorAberto,0);
  const totVenc=data.reduce((s,x)=>s+x.valorVencido,0);
  const totLim=data.reduce((s,x)=>s+x.limite,0);
  doc.setFillColor(230,238,248); doc.rect(10,y-4,190,22,'F');
  doc.setTextColor(...blue); doc.setFontSize(9); doc.setFont('helvetica','bold');
  doc.text('RESUMO GERAL',14,y+1); y+=8;
  doc.setFont('helvetica','normal'); doc.setFontSize(8);
  doc.setTextColor(...green);  doc.text(`Pago: R$ ${totPago.toLocaleString('pt-BR',{minimumFractionDigits:2})}`,14,y);
  doc.setTextColor(...orange); doc.text(`Em Aberto: R$ ${totAberto.toLocaleString('pt-BR',{minimumFractionDigits:2})}`,75,y);
  doc.setTextColor(192,57,43); doc.text(`Vencido: R$ ${totVenc.toLocaleString('pt-BR',{minimumFractionDigits:2})}`,140,y);
  y+=12;
  doc.setFillColor(43,159,168); doc.rect(10,y-5,190,8,'F');
  doc.setTextColor(255,255,255); doc.setFontSize(7); doc.setFont('helvetica','bold');
  doc.text('Fornecedor',13,y); doc.text('Limite',80,y,{align:'right'});
  doc.text('Utilizado',105,y,{align:'right'}); doc.text('Pago',130,y,{align:'right'});
  doc.text('Em Aberto',157,y,{align:'right'}); doc.text('Disponível',198,y,{align:'right'}); y+=8;
  data.forEach((s,idx)=>{
    if(y>270){doc.addPage();y=20;}
    if(idx%2===0){doc.setFillColor(248,250,252);doc.rect(10,y-5,190,7,'F');}
    doc.setTextColor(0,0,0); doc.setFont('helvetica','normal'); doc.setFontSize(7);
    doc.text(s.nome.slice(0,28),13,y);
    doc.text(`R$${s.limite.toLocaleString('pt-BR',{minimumFractionDigits:2})}`,80,y,{align:'right'});
    doc.text(`R$${s.utilizado.toLocaleString('pt-BR',{minimumFractionDigits:2})}`,105,y,{align:'right'});
    doc.setTextColor(...green);  doc.text(`R$${s.valorPago.toLocaleString('pt-BR',{minimumFractionDigits:2})}`,130,y,{align:'right'});
    doc.setTextColor(...orange); doc.text(`R$${s.valorAberto.toLocaleString('pt-BR',{minimumFractionDigits:2})}`,157,y,{align:'right'});
    doc.setTextColor(...blue);   doc.text(`R$${s.disponivel.toLocaleString('pt-BR',{minimumFractionDigits:2})}`,198,y,{align:'right'});
    y+=7;
  });
  doc.setTextColor(...gray); doc.setFontSize(7);
  doc.text('Suprimentos Obra Lumen — lumenserfeliz.org',14,288);
  doc.save(`LM-Indicadores-Fornecedores-${new Date().toISOString().slice(0,10)}.pdf`);
  showToast('✅ PDF de indicadores exportado!');
}


// ─────────────────────────────────────────────
// 📋  PAINEL DE ORÇAMENTOS PENDENTES
// ─────────────────────────────────────────────

let opcGrupo = 'casa';
let opcPedidos = [];       // pedidos com status 'andamento'
let opcCotacoes = {};      // { orderId: [ {fornecedorNome, valor, status, validade, obs, id} ] }
let opcAutorizados = {};   // { cotacaoId: true | false | null }

const FMT_OPC = v => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function initOrcPendentes() {
  opcPedidos   = [];
  opcCotacoes  = {};
  opcAutorizados = {};

  document.getElementById('opc-totais').style.display = 'none';
  document.getElementById('opc-filtros').style.display = 'none';
  const opcResultados = document.getElementById('opc-resultados');
  // Só mostra o placeholder de "buscando" no primeiro carregamento: em
  // atualizações automáticas (onSnapshot a cada 30s) trocar o conteúdo
  // colapsa a altura da lista e "puxa" a página pra cima enquanto o
  // usuário está rolando.
  if (!opcResultados.dataset.loaded) {
    opcResultados.innerHTML =
      '<div class="empty-state"><div class="empty-state-icon">⏳</div>' +
      '<div class="empty-state-title">Buscando orçamentos em andamento...</div></div>';
  }

  try {
    // 1. Busca pedidos em orçamento
    const pedidosSnap = await db.collection('orders')
      .where('status', '==', 'andamento')
      .orderBy('createdAt', 'desc')
      .get();

    opcPedidos = pedidosSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (opcPedidos.length === 0) {
      opcResultados.dataset.loaded = '1';
      opcResultados.innerHTML =
        '<div class="empty-state"><div class="empty-state-icon">✅</div>' +
        '<div class="empty-state-title">Nenhum pedido em andamento no momento!</div></div>';
      return;
    }

    // 2. Busca todas as cotações de uma vez
    const cotacoesSnap = await db.collection('quotations')
      .orderBy('valor', 'asc')
      .get();

    const orderIds = new Set(opcPedidos.map(p => p.id));

    // Corrige dados históricos: cotações onde o código antigo gravou statusGerente='recusado'
    // automaticamente quando o coordenador recusou — sem o gerente ter decidido de fato.
    // Detecta pelo critério: statusCoordenador='recusado' E gerenteNome está vazio/ausente.
    const correcoesBatch = db.batch();
    let totalCorrecoes = 0;
    cotacoesSnap.docs.forEach(d => {
      const q = d.data();
      const gerenteDecidiuDeFato = q.gerenteNome && q.gerenteNome.trim() !== '';
      if (q.statusGerente === 'recusado' && q.statusCoordenador === 'recusado' && !gerenteDecidiuDeFato) {
        correcoesBatch.update(d.ref, { statusGerente: 'pendente' });
        totalCorrecoes++;
      }
    });
    if (totalCorrecoes > 0) {
      await correcoesBatch.commit();
      console.log(`✅ ${totalCorrecoes} cotação(ões) corrigidas: statusGerente resetado para pendente`);
    }

    cotacoesSnap.docs.forEach(d => {
      const q = { id: d.id, ...d.data() };
      // Aplica correção local imediatamente sem esperar nova leitura do Firebase
      if (q.statusGerente === 'recusado' && q.statusCoordenador === 'recusado' && !(q.gerenteNome && q.gerenteNome.trim())) {
        q.statusGerente = 'pendente';
      }
      if (!orderIds.has(q.orderId)) return;
      if (!opcCotacoes[q.orderId]) opcCotacoes[q.orderId] = [];
      opcCotacoes[q.orderId].push(q);
      if (opcAutorizados[q.id] === undefined) {
        opcAutorizados[q.id] = q.statusCoordenador === 'aprovado' ? true : q.statusCoordenador === 'recusado' ? false : null;
      }
    });

    // Atualiza badge no menu
    const n = opcPedidos.length;
    ['badge-orc-pendentes', 'badge-orc-pendentes2'].forEach(bid => {
      const el = document.getElementById(bid);
      if (!el) return;
      if (n > 0) { el.textContent = n; el.classList.remove('hidden'); }
      else { el.classList.add('hidden'); }
    });

    document.getElementById('opc-totais').style.display = '';
    document.getElementById('opc-filtros').style.display = '';

    // Carrega dados da quinzena anterior para comparativo
    try {
      const hoje = new Date();
      const quinzenaAtras = new Date(hoje);
      quinzenaAtras.setDate(hoje.getDate() - 15);
      const quinzStrStart = quinzenaAtras.toISOString();
      const quinzStrEnd   = hoje.toISOString();

      // Busca pedidos aprovados nos últimos 15-30 dias
      const quinzSnap = await db.collection('orders')
        .where('status', '==', 'pedido_liberado')
        .where('liberadoEm', '>=', new firebase.firestore.Timestamp.fromDate(new Date(hoje.getTime() - 30*24*60*60*1000)))
        .where('liberadoEm', '<', new firebase.firestore.Timestamp.fromDate(quinzenaAtras))
        .get().catch(() => ({ docs: [] }));

      window.opcQuinzenaAnterior = {};
      quinzSnap.docs.forEach(d => {
        const data = d.data();
        const cats = (data.categories || []).map(c => (window.CATEGORIAS?.[c]?.nome || c)).join(' + ') || 'Sem categoria';
        const val  = parseFloat(data.cotacaoValor || data.nfValor || 0);
        window.opcQuinzenaAnterior[cats] = (window.opcQuinzenaAnterior[cats] || 0) + val;
      });
    } catch(e) { window.opcQuinzenaAnterior = {}; }

    await opcCarregarMetasSemana();
    opcRenderizar();

  } catch(e) {
    console.error('initOrcPendentes error:', e);
    document.getElementById('opc-resultados').innerHTML =
      '<div class="empty-state"><div class="empty-state-icon">❌</div>' +
      '<div class="empty-state-title">Erro ao carregar: ' + e.message + '</div></div>';
  }
}

function opcSetGrupo(grupo, btn) {
  opcGrupo = grupo;
  document.querySelectorAll('#opc-filtros .status-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  opcRenderizar();
}

function opcToggleCotacao(cotId, valor) {
  opcAutorizados[cotId] = opcAutorizados[cotId] === valor ? null : valor;
  opcAtualizarTotais();
  const rowEl = document.getElementById('opc-cot-' + cotId);
  if (rowEl) opcEstilizarLinhaCotacao(rowEl, opcAutorizados[cotId]);
}

function opcEstilizarLinhaCotacao(rowEl, estado) {
  rowEl.style.background = estado === true ? 'var(--ok-bg)' : estado === false ? 'var(--danger-bg)' : '';
  const btnSim = rowEl.querySelector('.opc-btn-sim');
  const btnNao = rowEl.querySelector('.opc-btn-nao');
  if (btnSim) { btnSim.style.background = estado === true ? 'var(--ok)' : 'var(--ok-bg)'; btnSim.style.color = estado === true ? '#fff' : 'var(--ok)'; }
  if (btnNao) { btnNao.style.background = estado === false ? 'var(--danger)' : 'var(--danger-bg)'; btnNao.style.color = estado === false ? '#fff' : 'var(--danger)'; }
}

async function opcSalvarDecisao(cotId, valor) {
  // Coordenador faz análise — salva statusCoordenador
  // Pedido SÓ avança quando o Gerente aprovar
  try {
    const novoStatus = valor === true ? 'aprovado' : valor === false ? 'recusado' : 'pendente';
    await db.collection('quotations').doc(cotId).update({
      status: novoStatus, // legado
      statusCoordenador: novoStatus,
      coordenadorNome: currentUserData?.name || '',
      coordenadorEm: firebase.firestore.FieldValue.serverTimestamp(),
      // Reseta aprovação do gerente se coordenador mudar decisão
      statusGerente: 'pendente', // gerente sempre decide por conta própria
    });

    opcRenderizar();
    showToast(valor === true ? '✅ Coordenador aprovou! Aguardando gerente.' : valor === false ? '❌ Coordenador recusou.' : '↩️ Decisão removida.');
  } catch(e) {
    console.error('Erro ao salvar decisão:', e);
    showToast('Erro ao salvar decisão. Verifique o console.');
  }
}

// Gerente aprova ou recusa — libera o pedido
async function opcGerenteDecisao(cotId, valor) {
  try {
    const novoStatus = valor === true ? 'aprovado' : 'recusado';
    const role = currentUserData?.role || '';

    // Busca cotação atual
    const cotSnap = await db.collection('quotations').doc(cotId).get();
    const cotData = cotSnap.data() || {};

    // Gerente/admin/diretor/coordenador podem aprovar diretamente sem depender do coordenador
    const isGerentePlus = ['admin', 'diretor', 'gerente', 'coordenador'].includes(role);

    if (valor === true && !isGerentePlus && cotData.statusCoordenador !== 'aprovado') {
      showToast('⚠️ O coordenador ainda não aprovou esta cotação!');
      return;
    }

    // Se gerente aprova direto, marca coordenador como aprovado também (para consistência)
    const updateData = {
      statusGerente: novoStatus,
      gerenteNome: currentUserData?.name || '',
      gerenteEm: firebase.firestore.FieldValue.serverTimestamp(),
      status: novoStatus, // atualiza status final
    };

    if (valor === true && isGerentePlus && cotData.statusCoordenador !== 'aprovado') {
      updateData.statusCoordenador = 'aprovado';
      updateData.coordenadorNome = currentUserData?.name || '';
      updateData.coordenadorEm = firebase.firestore.FieldValue.serverTimestamp();
    }

    await db.collection('quotations').doc(cotId).update(updateData);

    // Se gerente aprovou, libera o pedido e salva dados financeiros
    if (valor === true) {
      const orderId = cotData.orderId;
      if (orderId) {
        const orderSnap = await db.collection('orders').doc(orderId).get();
        if (orderSnap.exists && orderSnap.data().status === 'andamento') {

          // Calcula vencimento pelo prazo do fornecedor
          let boletoVencimento = '';
          try {
            const fornId = cotData.fornecedorId;
            if (fornId) {
              let sup = (window.suppliersCache || []).find(s => s.id === fornId);
              if (!sup) {
                const supSnap = await db.collection('suppliers').doc(fornId).get();
                if (supSnap.exists) sup = { id: fornId, ...supSnap.data() };
              }
              if (sup) {
                const prazoNum = sup.prazo === 'a_vista' ? 0 : parseInt(sup.prazo) || 0;
                if (prazoNum > 0) {
                  const venc = new Date();
                  venc.setDate(venc.getDate() + prazoNum);
                  boletoVencimento = venc.toISOString().slice(0, 10);
                }
              }
            }
          } catch(e) { console.warn('Erro prazo:', e); }

          const orderUpdateData = {
            status: 'pedido_liberado',
            liberadoEm: firebase.firestore.FieldValue.serverTimestamp(),
            cotacaoAprovadaId: cotId,
            cotacaoFornecedor: cotData.fornecedorNome || '',
            cotacaoValor: cotData.valor || 0,
            fornecedorId: cotData.fornecedorId || '',
            fornecedorNome: cotData.fornecedorNome || '',
            nfValor: parseFloat(cotData.valor) || 0,
            boletoVencimento: boletoVencimento || null,
          };
          await db.collection('orders').doc(orderId).update(orderUpdateData);

          // Lança automaticamente no financeiro
          await lancarPedidoNoFinanceiro(orderId, {
            ...orderSnap.data(),
            ...orderUpdateData,
          });

          // Lança no financeiro e consome limite do fornecedor
          const valor2 = parseFloat(cotData.valor) || 0;
          if (valor2 > 0 && cotData.fornecedorId) {
            try {
              // CORREÇÃO: incluir catKey e classificação correta para aparecer nas métricas por categoria
              const _orderDataOpc = orderSnap.data();
              const _catsOpc = (_orderDataOpc.categories || []);
              const _classifOpc = _catsOpc.map(c => (typeof CATEGORIAS !== 'undefined' && CATEGORIAS[c]) ? CATEGORIAS[c].nome : c).join(', ') || 'Pedido';
              const _refDateOpc = new Date();
              await db.collection('compras_financeiro').add({
                fornecedor: cotData.fornecedorNome || '',
                fornecedorId: cotData.fornecedorId || '',
                classificacao: _classifOpc,
                catKey: _catsOpc[0] || '',
                destinatario: _orderDataOpc.house || '',
                valor: valor2,
                vencimentoStr: boletoVencimento || '',
                dataCompraSerial: _refDateOpc.getTime(),
                mes: _refDateOpc.toLocaleString('pt-BR',{month:'long'}).toUpperCase(),
                ano: _refDateOpc.getFullYear(),
                pago: '',
                pedidoRef: _orderDataOpc.code || orderId,
                pedidoId: orderId,
                centroCustoId:   _orderDataOpc.centroCustoId   || '',
                centroCustoNome: _orderDataOpc.centroCustoNome || '',
                lancadoSP: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
              });
              await db.collection('suppliers').doc(cotData.fornecedorId).update({
                utilizado: firebase.firestore.FieldValue.increment(valor2)
              });
            } catch(e) { console.warn('Erro financeiro:', e); }
          }

          showToast('✅ Gerente aprovou! Pedido liberado e lançado no financeiro.');
        }
      }
    } else {
      showToast('❌ Gerente recusou a cotação.');
    }

    opcRenderizar();
  } catch(e) {
    console.error('Erro na decisão do gerente:', e);
    showToast('Erro ao salvar decisão do gerente.');
  }
}

function opcToggleESalvar(cotId, valor) {
  opcToggleCotacao(cotId, valor);
  opcSalvarDecisao(cotId, opcAutorizados[cotId]);
}

function opcAutorizarGrupoCotacoes(cotIds, valor) {
  cotIds.forEach(id => { opcAutorizados[id] = valor; });
  cotIds.forEach(id => {
    opcSalvarDecisao(id, valor);
    const rowEl = document.getElementById('opc-cot-' + id);
    if (rowEl) opcEstilizarLinhaCotacao(rowEl, valor);
  });
  opcAtualizarTotais();
  // Atualiza badges dos grupos sem re-renderizar
  document.querySelectorAll('.opc-grp-stats').forEach(el => {
    const ids = JSON.parse(el.dataset.ids || '[]');
    const nAut  = ids.filter(id => opcAutorizados[id] === true).length;
    const nNaut = ids.filter(id => opcAutorizados[id] === false).length;
    el.innerHTML = ids.length + ' cotação(ões) &nbsp;·&nbsp; <span style="color:var(--ok);">✅ ' + nAut + ' aut.</span> &nbsp;·&nbsp; <span style="color:var(--danger);">❌ ' + nNaut + ' recus.</span>';
  });
}

function opcAtualizarTotais() {
  let totalGeral = 0, totalAut = 0, totalNaut = 0, totalPend = 0, totalGer = 0;
  let nAut = 0, nNaut = 0, nPend = 0, nGer = 0;
  const porForn = {}; // { nome: total }
  const porCat  = {}; // { catNome: { total, autorizado } }

  Object.entries(opcCotacoes).forEach(([orderId, cots]) => {
    const pedido = opcPedidos.find(p => p.id === orderId);
    const cats   = pedido?.categories || [];

    cots.forEach(q => {
      const val  = parseFloat(q.valor) || 0;
      const forn = q.fornecedorNome || 'Sem fornecedor';
      totalGeral += val;

      if      (opcAutorizados[q.id] === true)  { totalAut  += val; nAut++;  }
      else if (opcAutorizados[q.id] === false)  { totalNaut += val; nNaut++; }
      else                                      { totalPend += val; nPend++; }

      // Gerente
      if (q.statusGerente === 'aprovado') { totalGer += val; nGer++; }

      // Por fornecedor
      porForn[forn] = (porForn[forn] || 0) + val;

      // Por categoria
      const catLabel = cats.length > 0
        ? cats.map(c => (window.CATEGORIAS?.[c]?.nome || c)).join(' + ')
        : 'Sem categoria';
      if (!porCat[catLabel]) porCat[catLabel] = { total: 0, autorizado: 0 };
      porCat[catLabel].total      += val;
      if (opcAutorizados[q.id] === true) porCat[catLabel].autorizado += val;
    });
  });

  document.getElementById('opc-total-geral').textContent = FMT_OPC(totalGeral);
  document.getElementById('opc-total-aut').textContent   = FMT_OPC(totalAut);
  document.getElementById('opc-total-naut').textContent  = FMT_OPC(totalNaut);
  document.getElementById('opc-total-pend').textContent  = FMT_OPC(totalPend);
  document.getElementById('opc-total-ger').textContent   = FMT_OPC(totalGer);
  document.getElementById('opc-n-pedidos').textContent   = opcPedidos.length + ' pedido(s)';
  document.getElementById('opc-n-aut').textContent  = nAut + ' cotações';
  document.getElementById('opc-n-naut').textContent = nNaut + ' cotações';
  document.getElementById('opc-n-pend').textContent = nPend + ' cotações';
  document.getElementById('opc-n-ger').textContent  = nGer + ' cotações';

  // Chips por fornecedor
  const fornWrap = document.getElementById('opc-forn-chips');
  if (fornWrap) {
    const sorted = Object.entries(porForn).sort(([,a],[,b]) => b - a);
    fornWrap.innerHTML = sorted.map(([nome, val]) =>
      `<span style="display:inline-flex;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:5px 14px;font-size:12px;font-weight:700;">
        <span style="color:var(--text-muted);">${nome}</span>
        <span style="color:var(--lumen);">${FMT_OPC(val)}</span>
      </span>`
    ).join('');
    document.getElementById('opc-totais-forn').style.display = sorted.length ? '' : 'none';
  }

  // Chips por categoria com comparativo quinzena
  const catWrap = document.getElementById('opc-cat-chips');
  if (catWrap) {
    const catEntries = Object.entries(porCat).sort(([,a],[,b]) => b.total - a.total);
    catWrap.innerHTML = catEntries.map(([nome, dados]) => {
      const quinzenaAnterior = window.opcQuinzenaAnterior?.[nome] || 0;
      let compHtml = '';
      if (quinzenaAnterior > 0) {
        const diff = dados.total - quinzenaAnterior;
        const pct  = ((diff / quinzenaAnterior) * 100).toFixed(1);
        const cor  = diff > 0 ? 'var(--danger)' : 'var(--ok)';
        const seta = diff > 0 ? '↑' : '↓';
        compHtml = `<span style="color:${cor};font-size:11px;">${seta}${Math.abs(pct)}% vs ant.</span>`;
      }
      return `<span style="display:inline-flex;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:5px 14px;font-size:12px;font-weight:700;">
        <span style="color:var(--text-muted);">${nome}</span>
        <span style="color:var(--lumen);">${FMT_OPC(dados.total)}</span>
        ${compHtml}
      </span>`;
    }).join('');
    document.getElementById('opc-totais-cat').style.display = catEntries.length ? '' : 'none';
  }
}

function opcRenderizar() {
  const el = document.getElementById('opc-resultados');
  el.dataset.loaded = '1';

  // Monta grupos principais
  const grupos = {}; // chaveGrupo -> [{ pedido, cotacao }]

  opcPedidos.forEach(p => {
    const cots = opcCotacoes[p.id] || [];
    if (cots.length === 0) {
      const grpNome = opcGetGrpNome(p, null);
      if (!grupos[grpNome]) grupos[grpNome] = [];
      grupos[grpNome].push({ pedido: p, cotacao: null });
    } else {
      // Mostra TODAS as cotações (aprovadas e recusadas pelo coord) — só some quando GERENTE decidir
      const cotsVisiveis = cots.filter(q => q.statusGerente !== 'aprovado' && q.statusGerente !== 'recusado');
      cotsVisiveis.forEach(q => {
        const grpNome = opcGetGrpNome(p, q);
        if (!grupos[grpNome]) grupos[grpNome] = [];
        if (!grupos[grpNome].find(x => x.pedido.id === p.id && x.cotacao?.id === q.id)) {
          grupos[grpNome].push({ pedido: p, cotacao: q });
        }
      });
      // Se todas recusadas, mostra o pedido sem cotação
      if (cotsVisiveis.length === 0) {
        const grpNome = opcGetGrpNome(p, null);
        if (!grupos[grpNome]) grupos[grpNome] = [];
        grupos[grpNome].push({ pedido: p, cotacao: null });
      }
    }
  });

  if (Object.keys(grupos).length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><div class="empty-state-title">Nenhum item a exibir</div></div>';
    opcAtualizarTotais();
    return;
  }

  let html = '';
  Object.entries(grupos).sort(([a], [b]) => a.localeCompare(b, 'pt-BR')).forEach(([grpNome, entradas]) => {
    const cotsDoGrupo = entradas.filter(e => e.cotacao).map(e => e.cotacao);
    const totalGrp    = cotsDoGrupo.reduce((s, q) => s + (parseFloat(q.valor)||0), 0);
    const cotIds      = cotsDoGrupo.map(q => q.id);
    const nAutGrp     = cotIds.filter(id => opcAutorizados[id] === true).length;
    const nNautGrp    = cotIds.filter(id => opcAutorizados[id] === false).length;

    html += `<div class="orca-card" style="margin-bottom:14px;">
      <div class="orca-card-header" style="cursor:default;">
        <div style="flex:1;">
          <div class="orca-casa-name">${grpNome}</div>
          <div class="opc-grp-stats" data-ids='${JSON.stringify(cotIds)}' style="font-size:12px;color:var(--text-muted);margin-top:3px;">
            ${cotsDoGrupo.length} cotação(ões) &nbsp;·&nbsp; <span style="color:var(--ok);">✅ ${nAutGrp} aut.</span> &nbsp;·&nbsp; <span style="color:var(--danger);">❌ ${nNautGrp} recus.</span>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          ${cotIds.length > 0 ? `
          <button onclick="opcAprovarLoteCasa('${grpNome}','coord')"
            style="background:var(--ok-bg);color:var(--ok);border:1px solid var(--ok);border-radius:6px;padding:5px 12px;font-size:12px;font-weight:700;cursor:pointer;">
            ✅ Coord. Aprovar tudo
          </button>
          <button onclick="opcAprovarLoteCasa('${grpNome}','gerente')"
            style="background:#f0fdf4;color:#22c55e;border:1px solid #22c55e;border-radius:6px;padding:5px 12px;font-size:12px;font-weight:700;cursor:pointer;">
            ✅ Gerente Aprovar tudo
          </button>
          <button onclick="opcAutorizarGrupoCotacoes(${JSON.stringify(cotIds)}, false)"
            style="background:var(--danger-bg);color:var(--danger);border:1px solid var(--danger);border-radius:6px;padding:5px 12px;font-size:12px;font-weight:700;cursor:pointer;">
            ❌ Recusar todos
          </button>` : ''}
          ${totalGrp > 0 ? `<span class="orca-valor-chip">${FMT_OPC(totalGrp)}</span>` : ''}
        </div>
      </div>
      <div class="orca-body" style="padding:0;">`;

    // ── Agrupamento por categoria dentro do fornecedor ──────────────────
    if (opcGrupo === 'fornecedor') {
      // Agrupa as entradas por categoria
      const porCat = {}; // catLabel -> [entrada]
      entradas.forEach(e => {
        const cats = (e.pedido.categories || []);
        const catKeys = cats.length > 0 ? cats : ['_sem_cat'];
        catKeys.forEach(ck => {
          const cat = CATEGORIAS[ck];
          const catLabel = cat ? cat.icon + ' ' + cat.nome : ck === '_sem_cat' ? '📦 Sem categoria' : ck;
          if (!porCat[catLabel]) porCat[catLabel] = [];
          // Evita duplicar entrada se pedido tem múltiplas categorias
          if (!porCat[catLabel].find(x => x.pedido.id === e.pedido.id && (x.cotacao?.id === e.cotacao?.id))) {
            porCat[catLabel].push(e);
          }
        });
      });

      Object.entries(porCat).sort(([a],[b]) => a.localeCompare(b,'pt-BR')).forEach(([catLabel, catEntradas]) => {
        const cotsCat   = catEntradas.filter(e => e.cotacao).map(e => e.cotacao);
        const totalCat  = cotsCat.reduce((s, q) => s + (parseFloat(q.valor)||0), 0);
        const cotIdsCat = cotsCat.map(q => q.id);
        const nAutCat   = cotIdsCat.filter(id => opcAutorizados[id] === true).length;

        html += `
        <div style="border-bottom:1px solid var(--border);">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 18px;background:var(--lumen-lt);">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:13px;font-weight:700;color:var(--lumen);">${catLabel}</span>
              <span style="font-size:11px;color:var(--text-muted);">${cotsCat.length} pedido(s) · ${nAutCat} autorizado(s)</span>
            </div>
            ${totalCat > 0 ? `<span style="font-size:14px;font-weight:700;color:var(--lumen);">${FMT_OPC(totalCat)}</span>` : ''}
          </div>
          <div class="table-wrap">
          <table class="orca-table" style="width:100%;">
            <thead><tr>
              <th>Pedido</th>
              <th>Casa</th>
              <th style="text-align:right;">Valor</th>
              <th>Validade</th>
              <th>Obs</th>
              <th style="text-align:center;">Status</th>
              <th style="text-align:center;">Decisão</th>
            </tr></thead>
            <tbody>`;

        catEntradas.forEach(({ pedido: p, cotacao: q }) => {
          const dataP = p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString('pt-BR') : (p.dateStr || '—');

          if (!q) {
            html += `<tr style="background:var(--warn-bg);">
              <td><span style="font-size:12px;font-weight:700;color:var(--lumen);">${p.code||p.id}</span><br><span style="font-size:11px;color:var(--text-muted);">${dataP}</span></td>
              <td>${p.house||'—'}</td>
              <td colspan="5" style="font-size:12px;color:var(--warn);font-weight:700;">⚠️ Sem cotação</td>
            </tr>`;
            return;
          }

          const estado = opcAutorizados[q.id];
          const corRow = estado === true ? 'background:var(--ok-bg);' : estado === false ? 'background:var(--danger-bg);' : '';
          const statusBadge = q.status === 'aprovado'
            ? '<span class="badge badge-ok">✅ Aprovado</span>'
            : q.status === 'recusado'
            ? '<span class="badge badge-danger">❌ Recusado</span>'
            : '<span class="badge badge-gray">⏳ Pendente</span>';
          const menorPreco = (opcCotacoes[p.id]||[]).length > 1 && parseFloat(q.valor) === Math.min(...(opcCotacoes[p.id]||[]).map(x => parseFloat(x.valor)));

          html += `<tr id="opc-cot-${q.id}" style="${corRow}">
            <td>
              <span style="font-size:12px;font-weight:700;color:var(--lumen);">${p.code||p.id}</span>
              <br><span style="font-size:11px;color:var(--text-muted);">${dataP}</span>
            </td>
            <td style="font-size:13px;">${p.house||'—'}</td>
            <td class="td-total" style="text-align:right;font-size:14px;">
              ${q.valor > 0 ? FMT_OPC(parseFloat(q.valor)) : '—'}
              ${menorPreco ? '<br><span style="font-size:10px;color:var(--ok);font-weight:700;">★ Menor preço</span>' : ''}
            </td>
            <td style="font-size:12px;color:var(--text-muted);">${q.validade || '—'}</td>
            <td style="font-size:12px;color:var(--text-muted);max-width:160px;">${q.obs || '—'}</td>
            <td style="text-align:center;">${statusBadge}</td>
            <td style="text-align:center;white-space:nowrap;padding:6px 8px;">
              <!-- COORD -->
              <div style="font-size:10px;text-align:center;color:var(--text-muted);font-weight:700;margin-bottom:3px;">COORD.</div>
              <div style="display:flex;gap:3px;margin-bottom:6px;">
                <button onclick="opcToggleESalvar('${q.id}', true)"
                  style="padding:3px 9px;border-radius:5px;font-size:11px;font-weight:700;cursor:pointer;border:1px solid ${q.statusCoordenador==='aprovado'?'var(--ok)':'var(--border)'};background:${q.statusCoordenador==='aprovado'?'var(--ok)':'var(--ok-bg)'};color:${q.statusCoordenador==='aprovado'?'#fff':'var(--ok)'};">✅</button>
                <button onclick="opcToggleESalvar('${q.id}', false)"
                  style="padding:3px 9px;border-radius:5px;font-size:11px;font-weight:700;cursor:pointer;border:1px solid ${q.statusCoordenador==='recusado'?'var(--danger)':'var(--border)'};background:${q.statusCoordenador==='recusado'?'var(--danger)':'var(--danger-bg)'};color:${q.statusCoordenador==='recusado'?'#fff':'var(--danger)'};">❌</button>
              </div>
              <!-- GERENTE -->
              <div style="font-size:10px;text-align:center;color:var(--text-muted);font-weight:700;margin-bottom:3px;">GERENTE</div>
              <div style="display:flex;gap:3px;">
                <button onclick="opcGerenteDecisao('${q.id}', true)"
                  style="padding:3px 9px;border-radius:5px;font-size:11px;font-weight:700;cursor:pointer;border:1px solid ${q.statusGerente==='aprovado'?'var(--ok)':'var(--border)'};background:${q.statusGerente==='aprovado'?'var(--ok)':'var(--ok-bg)'};color:${q.statusGerente==='aprovado'?'#fff':'var(--ok)'};">✅</button>
                <button onclick="opcGerenteDecisao('${q.id}', false)"
                  style="padding:3px 9px;border-radius:5px;font-size:11px;font-weight:700;cursor:pointer;border:1px solid ${q.statusGerente==='recusado'?'var(--danger)':'var(--border)'};background:${q.statusGerente==='recusado'?'var(--danger)':'var(--danger-bg)'};color:${q.statusGerente==='recusado'?'#fff':'var(--danger)'};">❌</button>
              </div>
            </td>
          </tr>`;
        });

        html += `</tbody></table></div></div>`;
      });

    } else {
      // ── Modo padrão (casa ou categoria): tabela plana ─────────────────
      html += `<div class="table-wrap">
        <table class="orca-table" style="width:100%;">
          <thead><tr>
            <th>Pedido</th>
            <th>Casa</th>
            <th>Categorias</th>
            <th>Fornecedor</th>
            <th style="text-align:right;">Valor</th>
            <th>Validade</th>
            <th>Obs</th>
            <th style="text-align:center;">Status</th>
            <th style="text-align:center;">Decisão</th>
          </tr></thead>
          <tbody>`;

      entradas.forEach(({ pedido: p, cotacao: q }) => {
        const cats = (p.categories || []).map(c => CATEGORIAS[c] ? CATEGORIAS[c].icon + ' ' + CATEGORIAS[c].nome : c).join(', ');
        const dataP = p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString('pt-BR') : (p.dateStr || '—');

        if (!q) {
          html += `<tr style="background:var(--warn-bg);">
            <td><span style="font-size:12px;font-weight:700;color:var(--lumen);">${p.code||p.id}</span><br><span style="font-size:11px;color:var(--text-muted);">${dataP}</span></td>
            <td style="font-size:13px;">${p.house||'—'}</td>
            <td style="font-size:12px;color:var(--text-muted);">${cats}</td>
            <td colspan="5" style="font-size:12px;color:var(--warn);font-weight:700;">⚠️ Nenhuma cotação cadastrada ainda</td>
          </tr>`;
          return;
        }

        const estado = opcAutorizados[q.id];
        const corRow = estado === true ? 'background:var(--ok-bg);' : estado === false ? 'background:var(--danger-bg);' : '';
        const statusBadge = q.status === 'aprovado'
          ? '<span class="badge badge-ok">✅ Aprovado</span>'
          : q.status === 'recusado'
          ? '<span class="badge badge-danger">❌ Recusado</span>'
          : '<span class="badge badge-gray">⏳ Pendente</span>';
        const menorPreco = (opcCotacoes[p.id]||[]).length > 1 && parseFloat(q.valor) === Math.min(...(opcCotacoes[p.id]||[]).map(x => parseFloat(x.valor)));

        html += `<tr id="opc-cot-${q.id}" style="${corRow}">
          <td>
            <span style="font-size:12px;font-weight:700;color:var(--lumen);">${p.code||p.id}</span>
            <br><span style="font-size:11px;color:var(--text-muted);">${dataP}</span>
          </td>
          <td style="font-size:13px;">${p.house||'—'}</td>
          <td style="font-size:12px;color:var(--text-muted);">${cats}</td>
          <td style="font-size:13px;font-weight:700;">
            ${q.fornecedorNome||'—'}
            ${menorPreco ? '<br><span style="font-size:10px;color:var(--ok);font-weight:700;">★ Menor preço</span>' : ''}
          </td>
          <td class="td-total" style="text-align:right;font-size:15px;">${q.valor > 0 ? FMT_OPC(parseFloat(q.valor)) : '—'}</td>
          <td style="font-size:12px;color:var(--text-muted);">${q.validade || '—'}</td>
          <td style="font-size:12px;color:var(--text-muted);max-width:180px;">${q.obs || '—'}</td>
          <td style="text-align:center;">${statusBadge}</td>
          <td style="text-align:center;white-space:nowrap;padding:6px 8px;">
              <!-- COORD -->
              <div style="font-size:10px;text-align:center;color:var(--text-muted);font-weight:700;margin-bottom:3px;">COORD.</div>
              <div style="display:flex;gap:3px;margin-bottom:6px;">
                <button onclick="opcToggleESalvar('${q.id}', true)"
                  style="padding:3px 9px;border-radius:5px;font-size:11px;font-weight:700;cursor:pointer;border:1px solid ${q.statusCoordenador==='aprovado'?'var(--ok)':'var(--border)'};background:${q.statusCoordenador==='aprovado'?'var(--ok)':'var(--ok-bg)'};color:${q.statusCoordenador==='aprovado'?'#fff':'var(--ok)'};">✅</button>
                <button onclick="opcToggleESalvar('${q.id}', false)"
                  style="padding:3px 9px;border-radius:5px;font-size:11px;font-weight:700;cursor:pointer;border:1px solid ${q.statusCoordenador==='recusado'?'var(--danger)':'var(--border)'};background:${q.statusCoordenador==='recusado'?'var(--danger)':'var(--danger-bg)'};color:${q.statusCoordenador==='recusado'?'#fff':'var(--danger)'};">❌</button>
              </div>
              <!-- GERENTE -->
              <div style="font-size:10px;text-align:center;color:var(--text-muted);font-weight:700;margin-bottom:3px;">GERENTE</div>
              <div style="display:flex;gap:3px;">
                <button onclick="opcGerenteDecisao('${q.id}', true)"
                  style="padding:3px 9px;border-radius:5px;font-size:11px;font-weight:700;cursor:pointer;border:1px solid ${q.statusGerente==='aprovado'?'var(--ok)':'var(--border)'};background:${q.statusGerente==='aprovado'?'var(--ok)':'var(--ok-bg)'};color:${q.statusGerente==='aprovado'?'#fff':'var(--ok)'};">✅</button>
                <button onclick="opcGerenteDecisao('${q.id}', false)"
                  style="padding:3px 9px;border-radius:5px;font-size:11px;font-weight:700;cursor:pointer;border:1px solid ${q.statusGerente==='recusado'?'var(--danger)':'var(--border)'};background:${q.statusGerente==='recusado'?'var(--danger)':'var(--danger-bg)'};color:${q.statusGerente==='recusado'?'#fff':'var(--danger)'};">❌</button>
              </div>
          </td>
        </tr>`;
      });

      html += `</tbody></table></div>`;
    }

    html += `</div></div>`;
  });

  el.innerHTML = html;
  opcAtualizarTotais();
}

function opcGetGrpNome(p, q) {
  if (opcGrupo === 'casa') return p.house || 'Sem casa';
  if (opcGrupo === 'categoria') {
    const cats = (p.categories || []);
    if (cats.length === 0) return 'Sem categoria';
    return cats.map(c => CATEGORIAS[c] ? CATEGORIAS[c].icon + ' ' + CATEGORIAS[c].nome : c).join(' + ');
  }
  // fornecedor
  return q?.fornecedorNome || 'Sem fornecedor';
}

function opcExportarCSV() {
  const rows = [['Pedido','Data','Casa','Categorias','Fornecedor','Valor (R$)','Validade','Observações','Status cotação','Decisão']];

  opcPedidos.forEach(p => {
    const cots = opcCotacoes[p.id] || [];
    const cats = (p.categories||[]).map(c => CATEGORIAS[c]?.nome||c).join('; ');
    const dataP = p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString('pt-BR') : (p.dateStr||'');

    if (cots.length === 0) {
      rows.push([`"${p.code||p.id}"`, dataP, `"${p.house||''}"`, `"${cats}"`, '(sem cotação)', 0, '', '', '', 'Sem cotação']);
    } else {
      cots.forEach(q => {
        const decisao = opcAutorizados[q.id] === true ? 'Autorizado' : opcAutorizados[q.id] === false ? 'Não Autorizado' : 'Pendente';
        rows.push([`"${p.code||p.id}"`, dataP, `"${p.house||''}"`, `"${cats}"`, `"${q.fornecedorNome||''}"`,
          parseFloat(q.valor||0).toFixed(2), q.validade||'', `"${q.obs||''}"`, q.status||'pendente', decisao]);
      });
    }
  });

  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'LM-Orcamentos-Andamento-' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
  showToast('✅ CSV exportado!');
}



