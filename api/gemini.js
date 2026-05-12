const https = require('https');

module.exports = async function handler(req, res) {
  // CORS para permitir chamadas do frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY não configurada no Vercel.' });
  }

  const body = JSON.stringify(req.body);
  const options = {
    hostname: 'generativelanguage.googleapis.com',
    path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  };

  return new Promise((resolve) => {
    const geminiReq = https.request(options, (geminiRes) => {
      let data = '';
      geminiRes.on('data', (chunk) => { data += chunk; });
      geminiRes.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          res.status(geminiRes.statusCode).json(parsed);
        } catch (e) {
          res.status(500).json({ error: 'Resposta inválida do Gemini', raw: data.slice(0, 200) });
        }
        resolve();
      });
    });

    geminiReq.on('error', (e) => {
      res.status(500).json({ error: 'Erro de conexão: ' + e.message });
      resolve();
    });

    geminiReq.write(body);
    geminiReq.end();
  });
};
