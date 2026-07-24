// api/gemini.js — Vercel Serverless Function

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  // Debug temporário — remover depois
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY não encontrada no ambiente.' });
  }

  const model = req.body?.model || 'gemini-2.5-flash';
  const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // Remove o campo 'model' do body antes de repassar ao Google
  const { model: _m, ...bodyToSend } = req.body || {};

  try {
    const geminiResp = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyToSend),
    });

    const data = await geminiResp.json();

    if (!geminiResp.ok) {
      return res.status(geminiResp.status).json(data);
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
