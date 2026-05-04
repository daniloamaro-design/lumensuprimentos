// api/send-email.js — Vercel Serverless Function
// Recebe os dados do pedido, gera o HTML do e-mail e envia via Resend com PDF em anexo

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) return res.status(500).json({ error: 'RESEND_API_KEY não configurada' });

  try {
    const {
      to, orderCode, house, requester, date,
      categories, summary, observations, people, pdfBase64
    } = req.body;

    if (!to) return res.status(400).json({ error: 'Destinatário não informado' });

    // Corpo HTML do e-mail
    const htmlBody = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f0f3fa;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f3fa;padding:30px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- HEADER -->
        <tr><td style="background:#003875;padding:28px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <div style="font-size:20px;font-weight:700;color:#fff;">🌟 Obra Lumen</div>
                <div style="font-size:13px;color:rgba(255,255,255,0.75);margin-top:2px;">Sistema de Controle de Estoque</div>
              </td>
              <td align="right">
                <div style="background:rgba(255,255,255,0.15);border-radius:8px;padding:8px 14px;display:inline-block;">
                  <div style="font-size:11px;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.5px;">Código</div>
                  <div style="font-size:14px;font-weight:700;color:#FFD700;font-family:monospace;">${orderCode}</div>
                </div>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- TITLE -->
        <tr><td style="padding:24px 32px 0;">
          <div style="font-size:18px;font-weight:700;color:#1a1f2e;">Solicitação de Compras</div>
          <div style="font-size:13px;color:#6b7280;margin-top:4px;">Pedido gerado em ${date}</div>
        </td></tr>

        <!-- INFO CARDS -->
        <tr><td style="padding:16px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="48%" style="background:#f0f3fa;border-radius:8px;padding:12px 16px;">
                <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Casa / Unidade</div>
                <div style="font-size:14px;font-weight:600;color:#003875;margin-top:4px;">🏠 ${house}</div>
              </td>
              <td width="4%"></td>
              <td width="48%" style="background:#f0f3fa;border-radius:8px;padding:12px 16px;">
                <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Solicitante</div>
                <div style="font-size:14px;font-weight:600;color:#1a1f2e;margin-top:4px;">👤 ${requester}</div>
              </td>
            </tr>
            <tr><td colspan="3" style="padding-top:8px;"></td></tr>
            <tr>
              <td width="48%" style="background:#f0f3fa;border-radius:8px;padding:12px 16px;">
                <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Categorias</div>
                <div style="font-size:14px;font-weight:600;color:#1a1f2e;margin-top:4px;">${categories}</div>
              </td>
              <td width="4%"></td>
              <td width="48%" style="background:#f0f3fa;border-radius:8px;padding:12px 16px;">
                <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Pessoas na Casa</div>
                <div style="font-size:14px;font-weight:600;color:#1a1f2e;margin-top:4px;">👥 ${people}</div>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- ITEMS -->
        <tr><td style="padding:0 32px 16px;">
          <div style="font-size:13px;font-weight:700;color:#003875;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">Itens Solicitados</div>
          <div style="background:#f8fafc;border-radius:8px;padding:16px;font-family:monospace;font-size:13px;color:#374151;white-space:pre-wrap;line-height:1.7;">${summary}</div>
        </td></tr>

        <!-- OBSERVATIONS -->
        ${observations && observations !== 'Nenhuma' ? `
        <tr><td style="padding:0 32px 16px;">
          <div style="background:#fef5e4;border-left:4px solid #d4890a;border-radius:0 8px 8px 0;padding:12px 16px;">
            <div style="font-size:11px;font-weight:700;color:#d4890a;text-transform:uppercase;margin-bottom:4px;">Observações</div>
            <div style="font-size:13px;color:#374151;">${observations}</div>
          </div>
        </td></tr>` : ''}

        <!-- PDF NOTE -->
        ${pdfBase64 ? `
        <tr><td style="padding:0 32px 16px;">
          <div style="background:#e6eef8;border-radius:8px;padding:12px 16px;display:flex;align-items:center;">
            <span style="font-size:20px;margin-right:10px;">📄</span>
            <div>
              <div style="font-size:13px;font-weight:600;color:#003875;">PDF em anexo</div>
              <div style="font-size:12px;color:#6b7280;">O pedido completo está anexado a este e-mail.</div>
            </div>
          </div>
        </td></tr>` : ''}

        <!-- FOOTER -->
        <tr><td style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e5e7eb;">
          <div style="font-size:12px;color:#9ca3af;text-align:center;">
            Este e-mail foi gerado automaticamente pelo Sistema Lumen Estoque.<br>
            <span style="color:#003875;font-weight:600;">lumenserfeliz.org</span>
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    // Monta o payload para o Resend
    const emailPayload = {
      from:    'Lumen Estoque <onboarding@resend.dev>',
      to:      [to],
      subject: `[Lumen] Pedido ${orderCode} — ${house}`,
      html:    htmlBody,
    };

    // Adiciona o PDF como anexo se foi enviado
    if (pdfBase64) {
      emailPayload.attachments = [{
        filename: `LM-Pedido-${house.replace(/\s/g,'-')}-${date.replace(/\//g,'-')}.pdf`,
        content:  pdfBase64,
      }];
    }

    // Envia via Resend API
    const response = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(emailPayload),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Resend error:', result);
      return res.status(response.status).json({ error: result.message || 'Erro ao enviar e-mail' });
    }

    return res.status(200).json({ success: true, id: result.id });

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
