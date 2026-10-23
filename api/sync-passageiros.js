// api/sync-passageiros.js — Vercel Serverless Function
//
// Proxy de leitura da planilha Google Sheets "Lista Geral Acolhidos e
// Coords Lumen 2026" (aba LISTA GERAL), pública via link. Existe porque
// um fetch direto do navegador pra docs.google.com é bloqueado por CORS —
// aqui roda no servidor, sem essa restrição. Devolve só as 4 colunas que
// o módulo Passagens usa (nome/cpf/rg/nascimento) + status, filtradas
// pra status "Ativo" — a escrita no banco (Supabase) é feita pelo
// próprio front, com a sessão autenticada do usuário (RLS cuida de quem
// pode gravar), não aqui.

// Planilha de pessoas (primeira aba, gid=0). Compartilhada como "qualquer pessoa com o link" (leitor).
const SHEET_ID = '1HW3iCC6DFAwwktowuGJv94_p6k6EIH0vwV8WpMglo2Y';
const GID = '0';

// Parser CSV simples (RFC4180: aspas duplas, vírgula como separador,
// "" dentro de campo = aspas literal). A exportação do Sheets sempre
// aspeia os campos, então isso cobre o caso real sem precisar de lib.
function parseCSV(texto) {
  const linhas = [];
  let linha = [], campo = '', dentroAspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (dentroAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; }
        else dentroAspas = false;
      } else campo += c;
    } else if (c === '"') {
      dentroAspas = true;
    } else if (c === ',') {
      linha.push(campo); campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo); campo = '';
      linhas.push(linha); linha = [];
    } else {
      campo += c;
    }
  }
  if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas.filter(l => l.some(c => c.trim() !== ''));
}

function dataISO(br) {
  const m = String(br || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${GID}`;
    const resp = await fetch(url);
    if (!resp.ok) return res.status(502).json({ error: `Planilha respondeu ${resp.status}` });
    const csv = await resp.text();
    const linhas = parseCSV(csv);
    if (!linhas.length) return res.status(502).json({ error: 'Planilha vazia ou formato inesperado.' });

    const header = linhas[0].map(h => h.trim().toUpperCase());
    const iNome = header.indexOf('NOME');
    const iCpf = header.indexOf('CPF');
    const iRg = header.indexOf('RG');
    const iNasc = header.indexOf('DATA DE NASCIMENTO');
    const iStatus = header.indexOf('STATUS');
    if (iNome === -1) return res.status(502).json({ error: 'Coluna NOME não encontrada na planilha.' });

    const vistos = new Set();
    const pessoas = [];
    for (const l of linhas.slice(1)) {
      const nome = (l[iNome] || '').trim();
      if (!nome) continue;
      const status = (iStatus > -1 ? l[iStatus] : '').trim();
      if (status.toLowerCase() !== 'ativo') continue; // só Ativo: inativos, "Outros" e sem status ficam de fora
      const chave = nome.toLowerCase();
      if (vistos.has(chave)) continue; // dedupe (planilha pode ter linha repetida)
      vistos.add(chave);
      pessoas.push({
        nome,
        cpf: iCpf > -1 ? (l[iCpf] || '').trim() || null : null,
        rg: iRg > -1 ? (l[iRg] || '').trim() || null : null,
        dataNascimento: iNasc > -1 ? dataISO(l[iNasc]) : null,
        status,
      });
    }

    return res.status(200).json({ pessoas, total: pessoas.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
