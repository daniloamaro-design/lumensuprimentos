// Extraído de index.html (bloco Detalhes de Movimentação) em 2026-07-27
// ─────────────────────────────────────────────
// 🔍 DETALHES DE MOVIMENTAÇÃO
// ─────────────────────────────────────────────
function verMovimento(id) {
  const docs = window._histDocs || [];
  const d = docs.find(x => x.id === id);
  if (!d) { showToast('Movimentação não encontrada.'); return; }

  const modal = document.getElementById('modal-mov-detalhe');
  const body  = document.getElementById('modal-mov-body');
  const title = document.getElementById('modal-mov-title');
  if (!modal) return;

  // Formata data/hora
  let dt = null;
  if (d.createdAt?.toDate) dt = d.createdAt.toDate();
  else if (d.date) dt = new Date(d.date + 'T00:00:00');
  const dataHora = dt && !isNaN(dt) ? dt.toLocaleString('pt-BR') : (d.dateStr || '—');

  const tipoIcon  = d.type === 'entrada' ? '📥' : '📤';
  const tipoCor   = d.type === 'entrada' ? 'var(--ok)' : 'var(--danger)';
  const tipoLabel = d.type === 'entrada' ? 'Entrada' : 'Saída';

  title.innerHTML = `${tipoIcon} ${tipoLabel} — ${d.house || ''}`;

  // Monta itens agrupados por categoria
  const itens = d.items || [];
  // Agrupa por catKey
  const porCat = {};
  itens.forEach(it => {
    const ck = it.catKey || 'outros';
    if (!porCat[ck]) porCat[ck] = [];
    porCat[ck].push(it);
  });

  const itensHtml = Object.entries(porCat).length > 0
    ? Object.entries(porCat).map(([ck, items]) => {
        const cat = window.CATEGORIAS?.[ck];
        const catLabel = cat ? `${cat.icon || ''} ${cat.nome}` : ck;
        const rows = items.map(it => {
          const nome = nomeProdutoAtual(ck, it.prodId, it.prodNome || it.prodName || it.productId) || '—';
          const qty  = parseFloat(it.qty) || 0;
          const un   = it.unidade || it.unit || '';
          return `<tr>
            <td style="padding:7px 10px;font-size:13px;">${nome}</td>
            <td style="padding:7px 10px;text-align:right;font-weight:700;font-size:13px;color:${tipoCor};">${qty}</td>
            <td style="padding:7px 10px;font-size:12px;color:var(--text-muted);">${un}</td>
          </tr>`;
        }).join('');
        return `<div style="margin-bottom:14px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);margin-bottom:6px;">${catLabel}</div>
          <table style="width:100%;border-collapse:collapse;background:var(--surface-raised,var(--surface));border-radius:8px;overflow:hidden;border:1px solid var(--border);">
            <thead><tr style="background:rgba(255,255,255,0.04);">
              <th style="padding:6px 10px;text-align:left;font-size:11px;color:var(--text-muted);font-weight:600;">Produto</th>
              <th style="padding:6px 10px;text-align:right;font-size:11px;color:var(--text-muted);font-weight:600;">Qtd</th>
              <th style="padding:6px 10px;font-size:11px;color:var(--text-muted);font-weight:600;">Un.</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
      }).join('')
    : '<div style="color:var(--text-muted);font-size:13px;padding:12px 0;">Nenhum produto registrado.</div>';

  const infoRows = [
    ['🗓️ Data / Hora', dataHora],
    ['🏠 Casa', d.house || '—'],
    ['👤 Registrado por', d.registeredBy || '—'],
    ['🔖 Código', d.code || '—'],
    d.isDonation ? ['🎁 Tipo', 'Doação'] : null,
    d.obs ? ['📝 Observação', d.obs] : null,
  ].filter(Boolean);

  body.innerHTML = `
    <!-- Info geral -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:18px;">
      ${infoRows.map(([label, val]) => `
        <div style="background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:8px;padding:8px 12px;">
          <div style="font-size:10px;color:var(--text-muted);font-weight:700;margin-bottom:2px;">${label}</div>
          <div style="font-size:13px;font-weight:600;">${val}</div>
        </div>`).join('')}
    </div>
    <!-- Produtos -->
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--lumen);margin-bottom:10px;">Produtos</div>
    ${itensHtml}
  `;

  modal.classList.remove('hidden');
}
