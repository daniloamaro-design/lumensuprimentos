// Extraído de index.html (bloco Propostas Semanais) em 2026-07-27

// ═════════════════════════════════════════════════════════════════════════════
// 📊 MELHORIAS PARA PROPOSTAS SEMANAIS - VISUALIZAÇÃO, PDF E AUTORIZAÇÃO
// ═════════════════════════════════════════════════════════════════════════════

let propostaAtualId = null;
let propostaAtualData = null;

async function abrirPropostaDetalhes(propostaId) {
  propostaAtualId = propostaId;
  try {
    const doc = await db.collection('var_propostas').doc(propostaId).get();
    if (!doc.exists) { showToast('Proposta não encontrada!'); return; }
    propostaAtualData = { id: doc.id, ...doc.data() };

    document.getElementById('proposta-autor').textContent = propostaAtualData.autorNome || 'Desconhecido';
    document.getElementById('proposta-data').textContent  = propostaAtualData.criadoEm
      ? new Date(propostaAtualData.criadoEm.toDate()).toLocaleDateString('pt-BR') : '—';

    const itens = propostaAtualData.itens || [];

    // Calcula totais — valorEstimado JÁ é o total do orçamento para a quantidade inteira
    let totalPix = 0, totalPrazo = 0;
    itens.forEach(item => {
      if (typeof item === 'string') return;
      const valor = item.valorEstimado || 0; // total, não multiplicar pela quantidade
      if (item.formaPagamento === 'prazo') totalPrazo += valor;
      else                                 totalPix   += valor;
    });
    const totalGeral = totalPix + totalPrazo;
    const fmt = v => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });

    document.getElementById('proposta-total-pix').textContent   = fmt(totalPix);
    document.getElementById('proposta-total-prazo').textContent = fmt(totalPrazo);
    document.getElementById('proposta-total-geral').textContent = fmt(totalGeral);

    const tbody = document.getElementById('proposta-itens-tbody');
    if (!tbody) { openModal('modal-proposta-detalhes'); return; }

    if (!itens.length || itens.every(i => typeof i === 'string')) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text-muted);">Esta proposta foi criada no formato antigo (sem valores). Publique uma nova proposta para ver os detalhes.</td></tr>';
    } else {
      tbody.innerHTML = itens.map((item, idx) => {
        if (typeof item === 'string') return '';
        // valorEstimado = total do orçamento; valorUnitario = total / quantidade
        const totalItem  = item.valorEstimado || 0;
        const unitario   = item.valorUnitario  > 0
                           ? item.valorUnitario
                           : totalItem / (item.quantidade || 1);
        const pagto      = item.formaPagamento === 'prazo' ? '📅 Prazo' : '💳 PIX';
        const autorizado = item.autorizado ? '✅ Sim' : '❌ Não';
        return `
        <tr style="border-bottom:1px solid var(--border);">
          <td style="padding:8px;"><span style="font-size:11px;font-weight:700;color:var(--lumen);">${item.codigo||'—'}</span><br>${item.material||'—'}</td>
          <td style="padding:8px;font-size:12px;color:var(--text-muted);">${item.setor||'—'}</td>
          <td style="padding:8px;text-align:center;">${item.quantidade||1}</td>
          <td style="padding:8px;text-align:right;font-family:monospace;">${fmt(unitario)}</td>
          <td style="padding:8px;text-align:right;font-family:monospace;font-weight:700;color:var(--ok);">${fmt(totalItem)}</td>
          <td style="padding:8px;text-align:center;">${pagto}</td>
          <td style="padding:8px;text-align:center;">
            <button class="btn btn-sm" style="padding:4px 8px;font-size:11px;" onclick="autorizarItem(${idx})">${autorizado}</button>
          </td>
        </tr>`;
      }).filter(Boolean).join('');
    }
    openModal('modal-proposta-detalhes');
  } catch(e) { showToast('Erro ao carregar proposta: ' + e.message); console.error(e); }
}

async function autorizarItem(indice) {
  if (!propostaAtualId || !propostaAtualData) return;
  
  try {
    const itens = propostaAtualData.itens || [];
    if (indice >= itens.length) return;
    
    itens[indice].autorizado = !itens[indice].autorizado;
    
    await db.collection('var_propostas').doc(propostaAtualId).update({
      itens: itens
    });
    
    showToast(itens[indice].autorizado ? '✅ Item autorizado!' : '❌ Autorização removida!');
    
    await abrirPropostaDetalhes(propostaAtualId);
  } catch(e) {
    showToast('Erro ao autorizar item: ' + e.message);
  }
}

async function autorizarTodosItens() {
  if (!propostaAtualId || !propostaAtualData) return;
  
  if (!confirm('Deseja autorizar TODOS os itens desta proposta?')) return;
  
  try {
    const itens = propostaAtualData.itens || [];
    itens.forEach(item => {
      item.autorizado = true;
    });
    
    await db.collection('var_propostas').doc(propostaAtualId).update({
      itens: itens
    });
    
    showToast('✅ Todos os itens foram autorizados!');
    
    await abrirPropostaDetalhes(propostaAtualId);
  } catch(e) {
    showToast('Erro ao autorizar itens: ' + e.message);
  }
}

function abrirFormularioEmail() {
  document.getElementById('email-destinatario').value = '';
  document.getElementById('email-assunto').value = 'Proposta Semanal de Compras';
  document.getElementById('email-mensagem').value = '';
  openModal('modal-enviar-proposta-email');
}

async function enviarPropostaPorEmail() {
  const email = document.getElementById('email-destinatario').value.trim();
  const assunto = document.getElementById('email-assunto').value.trim();
  const mensagem = document.getElementById('email-mensagem').value.trim();
  
  if (!email) {
    showToast('Digite o e-mail do destinatário!');
    return;
  }
  
  if (!email.includes('@')) {
    showToast('E-mail inválido!');
    return;
  }
  
  const btn = document.getElementById('btn-enviar-email');
  btn.disabled = true;
  btn.textContent = '📨 Enviando...';
  
  try {
    const itens = propostaAtualData.itens || [];
    let totalPix = 0, totalPrazo = 0;
    
    itens.forEach(item => {
      const valor = (item.valorEstimado || 0); // valorEstimado já é o total
      if (item.formaPagamento === 'pix') {
        totalPix += valor;
      } else if (item.formaPagamento === 'prazo') {
        totalPrazo += valor;
      }
    });
    
    const totalGeral = totalPix + totalPrazo;
    
    const corpoEmail = `
Olá,

Segue em anexo a Proposta Semanal de Compras.

📊 RESUMO FINANCEIRO:
• Total PIX: R$ ${totalPix.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
• Total Prazo: R$ ${totalPrazo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
• Total Geral: R$ ${totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}

📦 Itens: ${itens.length}

${mensagem ? '\n📝 Mensagem:\n' + mensagem : ''}

---
Proposta criada por: ${propostaAtualData.autorNome || 'Sistema'}
Data: ${new Date(propostaAtualData.criadoEm.toDate()).toLocaleDateString('pt-BR')}
    `;
    
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_email: email,
      subject: assunto,
      message: corpoEmail,
      from_name: currentUserData.name || 'Sistema'
    });
    
    showToast('✅ Proposta enviada com sucesso para ' + email);
    closeModal('modal-enviar-proposta-email');
  } catch(e) {
    showToast('Erro ao enviar e-mail: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '📨 Enviar';
  }
}

async function exportarPropostaPDF() {
  try {
    const pdfBlob = await gerarPropostaPDF();
    
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Proposta_${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showToast('✅ PDF baixado com sucesso!');
  } catch(e) {
    showToast('Erro ao gerar PDF: ' + e.message);
  }
}

async function gerarPropostaPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const itens = (propostaAtualData.itens || []).filter(i => typeof i !== 'string');
  let totalPix = 0, totalPrazo = 0;
  itens.forEach(item => {
    const valor = item.valorEstimado || 0; // já é o total do orçamento
    if (item.formaPagamento === 'prazo') totalPrazo += valor;
    else                                 totalPix   += valor;
  });
  const totalGeral = totalPix + totalPrazo;
  const fmtR = v => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const dataStr = propostaAtualData.criadoEm
    ? new Date(propostaAtualData.criadoEm.toDate()).toLocaleDateString('pt-BR') : '—';

  // Header
  doc.setFillColor(43, 159, 168);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(16); doc.setFont(undefined,'bold');
  doc.text('PROPOSTA SEMANAL DE COMPRAS', 14, 13);
  doc.setFontSize(9); doc.setFont(undefined,'normal');
  doc.text('Lumen Estoque — Sistema de Controle', 14, 20);
  doc.setTextColor(0,0,0);

  // Info
  doc.setFontSize(10);
  doc.text(`Criada por: ${propostaAtualData.autorNome || 'Desconhecido'}`, 14, 38);
  doc.text(`Data: ${dataStr}`, 14, 45);
  doc.text(`Total de itens: ${itens.length}`, 14, 52);

  // Resumo financeiro
  doc.setFillColor(240, 250, 251);
  doc.rect(14, 58, 182, 28, 'F');
  doc.setFont(undefined,'bold'); doc.setFontSize(11);
  doc.text('RESUMO FINANCEIRO', 18, 67);
  doc.setFont(undefined,'normal'); doc.setFontSize(10);
  doc.text(`Total PIX:   ${fmtR(totalPix)}`, 18, 75);
  doc.text(`Total Prazo: ${fmtR(totalPrazo)}`, 90, 75);
  doc.setFont(undefined,'bold');
  doc.text(`Total Geral: ${fmtR(totalGeral)}`, 18, 82);
  doc.setFont(undefined,'normal');

  // Tabela
  const tableData = itens.map(item => {
    const totalItem = item.valorEstimado || 0;
    const unitario  = item.valorUnitario > 0
                      ? item.valorUnitario
                      : totalItem / (item.quantidade || 1);
    return [
    (item.codigo||'—') + '\n' + (item.material||'—'),
    item.setor || '—',
    String(item.quantidade || 1),
    fmtR(unitario),
    fmtR(totalItem),
    item.formaPagamento === 'prazo' ? 'Prazo' : 'PIX',
    item.autorizado ? 'Sim' : 'Nao',
  ];});

  doc.autoTable({
    head: [['Material / Código', 'Setor', 'Qtd', 'Valor Unit.', 'Total', 'Pagto', 'Autor.']],
    body: tableData,
    startY: 92,
    margin: { left: 14, right: 14 },
    headStyles: { fillColor: [43, 159, 168], textColor: [255,255,255], fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    alternateRowStyles: { fillColor: [242, 250, 251] },
    columnStyles: {
      0: { cellWidth: 55 }, 1: { cellWidth: 30 }, 2: { cellWidth: 12, halign: 'center' },
      3: { cellWidth: 28, halign: 'right' }, 4: { cellWidth: 28, halign: 'right' },
      5: { cellWidth: 18, halign: 'center' }, 6: { cellWidth: 11, halign: 'center' },
    },
    foot: [['', '', '', 'TOTAL', fmtR(totalGeral), '', '']],
    footStyles: { fillColor: [43, 159, 168], textColor: [255,255,255], fontStyle: 'bold', fontSize: 9 },
  });

  // Footer
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setTextColor(150,150,150);
    doc.text(`Lumen Estoque — Página ${i} de ${pageCount}`, 14, doc.internal.pageSize.height - 8);
    doc.text(new Date().toLocaleString('pt-BR'), 140, doc.internal.pageSize.height - 8);
  }

  return doc.output('blob');
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

