// api/check-stock-alert.js — Vercel Cron Job
// Roda automaticamente a cada 6 horas para verificar estoque crítico
// e enviar alerta por e-mail via Resend

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Inicializa Firebase Admin (usa variáveis de ambiente do Vercel)
function getDb() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId:    process.env.FIREBASE_PROJECT_ID,
        clientEmail:  process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:   process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }
  return getFirestore();
}

// Per capitas padrão (espelho do front-end)
const PERCAPITAS_PADRAO = {
  cereal: {
    acucar: 0.045, arroz: 0.200, bolacha: 0.030, cafe: 0.014, comp_lacteo: 0.011,
    cremogema: 0.015, cuscuz: 0.200, farinha: 0.030, farinha_lactea: 0.015, feijao: 0.100,
    leite_po: 0.020, macarrao: 0.035, margarina: 0.005, mucilon: 0.000, oleo: 0.020,
    pao_integral: 0.001, sal: 0.009, suco_conc: 0.009, suco_po: 0.000
  },
  higiene: {
    absorvente: 0.030, agua_san: 0.022, aromatizador: 0.005, barbeador: 0.060,
    condicionador: 0.060, desgord: 0.022, desinfetante: 0.022, detergente: 0.015,
    escova_dente: 0.060, escovao: 0.006, esponja: 0.001, herbissimo: 0.060,
    pa: 0.001, palha_aco: 0.001, pano_chao: 0.001, papel_hig: 0.003,
    pasta_dente: 0.060, rodo: 0.001, sabao_barra: 0.006, sabao_po: 0.003,
    sabonete: 0.060, saco_100l: 0.036, saco_20l: 0.018, saco_50l: 0.027,
    shampoo: 0.060, vassoura: 0.001
  },
  proteina: {
    calabresa: 0.150, carne_moida: 0.150, coracao_boi: 0.100, coxa_sobrecoxa: 0.080,
    figado: 0.050, file_peixe: 0.100, frango: 0.250, linguica: 0.070,
    moela: 0.100, mortadela: 0.150, musculo: 0.000, ovo: 0.150,
    peixe_inteiro: 0.100, pernil: 0.050, salsicha: 0.150, soja: 0.200
  }
};

export default async function handler(req, res) {
  // Verifica se é uma chamada autorizada do Vercel Cron
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  try {
    const db = getDb();
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'daniloamaro@lumenserfeliz.org';
    const RESEND_API_KEY = process.env.RESEND_API_KEY;

    // 1. Carrega todas as movimentações
    const movSnap = await db.collection('movements').get();
    const saldo = {};
    movSnap.docs.forEach(d => {
      const m = d.data();
      if (!saldo[m.house]) saldo[m.house] = {};
      (m.items || []).forEach(item => {
        const key = `${item.catKey}__${item.prodId}`;
        if (!saldo[m.house][key]) {
          saldo[m.house][key] = { qty: 0, nome: item.prodNome, unidade: item.unidade, catKey: item.catKey, prodId: item.prodId };
        }
        if (m.type === 'entrada') saldo[m.house][key].qty += item.qty;
        else saldo[m.house][key].qty -= item.qty;
      });
    });

    // 2. Carrega per capitas personalizados
    const pcSnap = await db.collection('percapitas').get();
    const allPc = {};
    pcSnap.docs.forEach(d => { allPc[d.data().house] = d.data().values || PERCAPITAS_PADRAO; });

    // 3. Carrega número de pessoas por casa
    const housesSnap = await db.collection('houses').get();
    const housePeople = {};
    housesSnap.docs.forEach(d => { housePeople[d.data().name] = d.data().currentPeople || 0; });

    // 4. Identifica itens críticos
    const criticos = [];
    Object.entries(saldo).forEach(([house, prods]) => {
      const pessoas = housePeople[house] || 0;
      if (pessoas === 0) return;
      const pc = allPc[house] || PERCAPITAS_PADRAO;

      Object.entries(prods).forEach(([key, data]) => {
        const ppcCat = pc[data.catKey] || {};
        const ppc = ppcCat[data.prodId] || 0;
        if (ppc === 0) return;

        const esperado7dias = 7 * pessoas * ppc;
        const limiteMin = esperado7dias * 0.3;

        if (data.qty < limiteMin) {
          criticos.push({
            house,
            produto: data.nome,
            unidade: data.unidade,
            saldoAtual: data.qty.toFixed(2),
            minimo: limiteMin.toFixed(2),
            esperado: esperado7dias.toFixed(2),
            status: data.qty <= 0 ? '🔴 ZERADO' : '🟠 CRÍTICO'
          });
        }
      });
    });

    if (criticos.length === 0) {
      console.log('✅ Nenhum item crítico encontrado.');
      return res.status(200).json({ ok: true, criticos: 0 });
    }

    // 5. Agrupa por casa
    const porCasa = {};
    criticos.forEach(c => {
      if (!porCasa[c.house]) porCasa[c.house] = [];
      porCasa[c.house].push(c);
    });

    // 6. Monta e-mail HTML
    const dataHoje = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    let casasHTML = '';
    Object.entries(porCasa).forEach(([house, itens]) => {
      const linhas = itens.map(i => `
        <tr style="background:${i.status.includes('ZERADO') ? '#FDEDEC' : '#FEF5E4'}">
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">${i.produto}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;font-weight:700;color:${i.status.includes('ZERADO') ? '#C0392B' : '#D4890A'}">${i.saldoAtual}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${i.minimo}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${i.esperado}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${i.status}</td>
        </tr>`).join('');

      casasHTML += `
        <div style="margin-bottom:20px;border-left:4px solid #003875;border-radius:0 8px 8px 0;overflow:hidden;">
          <div style="background:#003875;padding:10px 16px;">
            <span style="color:#fff;font-weight:700;font-size:15px;">🏠 ${house}</span>
            <span style="color:rgba(255,255,255,0.7);font-size:12px;margin-left:8px;">${itens.length} item(s) crítico(s)</span>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <tr style="background:#f0f3fa;">
              <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #003875;font-size:11px;text-transform:uppercase;">Produto</th>
              <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #003875;font-size:11px;text-transform:uppercase;">Saldo Atual</th>
              <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #003875;font-size:11px;text-transform:uppercase;">Mínimo (30%)</th>
              <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #003875;font-size:11px;text-transform:uppercase;">Esperado 7 dias</th>
              <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #003875;font-size:11px;text-transform:uppercase;">Status</th>
            </tr>
            ${linhas}
          </table>
        </div>`;
    });

    const htmlEmail = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f0f3fa;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f3fa;padding:30px 0;">
    <tr><td align="center">
      <table width="640" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr><td style="background:#C0392B;padding:24px 32px;">
          <div style="font-size:22px;font-weight:700;color:#fff;">🚨 Alerta de Estoque Crítico</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.8);margin-top:4px;">Obra Lumen — Verificação automática em ${dataHoje}</div>
        </td></tr>
        <tr><td style="padding:24px 32px 8px;">
          <div style="background:#FDEDEC;border-radius:8px;padding:14px 16px;margin-bottom:20px;">
            <strong style="color:#C0392B;">Resumo:</strong>
            <span style="color:#374151;"> ${criticos.length} item(s) em estado crítico em ${Object.keys(porCasa).length} casa(s)</span>
          </div>
          ${casasHTML}
        </td></tr>
        <tr><td style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <div style="font-size:12px;color:#9ca3af;text-align:center;">
            Verificação automática pelo Sistema Lumen Estoque •
            <span style="color:#003875;font-weight:600;">lumenserfeliz.org</span>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    // 7. Envia e-mail via Resend
    const emailResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:    'Lumen Estoque <onboarding@resend.dev>',
        to:      [ADMIN_EMAIL],
        subject: `🚨 [Lumen] ${criticos.length} item(s) crítico(s) em ${Object.keys(porCasa).length} casa(s) — ${dataHoje}`,
        html:    htmlEmail,
      }),
    });

    if (!emailResp.ok) {
      const err = await emailResp.json();
      throw new Error(err.message || 'Erro ao enviar e-mail');
    }

    console.log(`✅ Alerta enviado: ${criticos.length} itens críticos em ${Object.keys(porCasa).length} casas.`);
    return res.status(200).json({
      ok: true,
      criticos: criticos.length,
      casas: Object.keys(porCasa).length
    });

  } catch (err) {
    console.error('Erro no cron:', err);
    return res.status(500).json({ error: err.message });
  }
}
