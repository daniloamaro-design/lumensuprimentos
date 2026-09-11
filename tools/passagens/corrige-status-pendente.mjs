#!/usr/bin/env node
// tools/passagens/corrige-status-pendente.mjs
//
// Regra confirmada com o usuário: só é "pendente" de verdade quem ainda
// está na aba "Passagens pendentes" da planilha com status "LIBERADO PARA
// COTAÇÃO" ou "COMPRA LIBERADA" (coluna O / "Status"). Toda solicitação do
// sistema com status pendente/aprovada que NÃO aparece mais nessa aba já
// foi resolvida (comprada) — o sync só atualiza pra 'comprada' quem está
// na aba "Passagens compradas" DEPOIS do corte (07/08/2026); quem foi
// comprado antes disso e cuja linha ficou (ou ficava) na aba de pendentes
// nunca foi corrigido de volta.
//
// Este script: baixa a aba "Passagens pendentes" atual, e para toda
// solicitação com status pendente/aprovada que NÃO tem correspondência lá
// (por nome + trajeto de ida), marca status='comprada' (só isso — não mexe
// em valor/fornecedor/data de compra, que ficam null; quem quiser esses
// dados usa o "Ver" no pedido e confere manualmente, ou roda o sync depois
// que ajustar CORTE_COMPRADAS).
//
// Uso:
//   node tools/passagens/corrige-status-pendente.mjs           (dry-run)
//   node tools/passagens/corrige-status-pendente.mjs --aplicar (grava)

import pg from 'pg';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHEET_ID = '1odkhxMXJN4_1CDeoDxX0VoGuBqoGrBQ19FdvoF1iHeE';
const GID_PENDENTES = '53660011';
const APLICAR = process.argv.includes('--aplicar');

function lerDatabaseUrlLocal() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const aqui = dirname(fileURLToPath(import.meta.url));
  const envPath = join(aqui, '..', 'migracao', '.env');
  if (!existsSync(envPath)) return null;
  for (const linha of readFileSync(envPath, 'utf8').split('\n')) {
    const s = linha.trim();
    if (!s || s.startsWith('#')) continue;
    const i = s.indexOf('=');
    if (i === -1) continue;
    const chave = s.slice(0, i).trim();
    if (chave === 'DATABASE_URL') return s.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

function parseCSV(texto) {
  const linhas = [];
  let linha = [], campo = '', dentroAspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (dentroAspas) {
      if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else dentroAspas = false; }
      else campo += c;
    } else if (c === '"') { dentroAspas = true; }
    else if (c === ',') { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo); campo = ''; linhas.push(linha); linha = [];
    } else campo += c;
  }
  if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas.filter(l => l.some(c => c.trim() !== ''));
}

const norm = s => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const normKey = s => norm(s).replace(/\s+/g, ' ').trim();
function g(row, label) { return row[normKey(label)] || ''; }
// Trajeto tolerante: "Fortaleza/CE - Recife/PE" e "Fortaleza - CE - Recife - CE"
// e "Fortaleza-CE → Recife-PE" tudo vira "fortaleza recife" pra comparar.
function trajChave(s) {
  return norm(s).replace(/\/[a-z]{2}\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

async function baixarAba(gid) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${gid}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Planilha (gid=${gid}) respondeu ${resp.status}`);
  const csv = await resp.text();
  const linhas = parseCSV(csv);
  const header = linhas[0].map(h => h.trim());
  return linhas.slice(1).map(l => {
    const obj = {};
    header.forEach((h, i) => { obj[normKey(h)] = (l[i] || '').trim(); });
    return obj;
  });
}

async function main() {
  const url = lerDatabaseUrlLocal();
  const db = url ? new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } }) : new pg.Client({ ssl: { rejectUnauthorized: false } });
  await db.connect();

  console.log('Baixando aba "Passagens pendentes"...');
  const pendentesSheet = await baixarAba(GID_PENDENTES);
  console.log(`  ${pendentesSheet.length} linhas.\n`);

  const STATUS_ABERTOS = new Set(['', 'LIBERADO PARA COTAÇÃO', 'COMPRA LIBERADA']);
  const aindaAbertas = pendentesSheet.filter(row => STATUS_ABERTOS.has((g(row, 'Status') || '').toUpperCase()));
  console.log(`${aindaAbertas.length} linhas na planilha ainda com status aberto (Liberado p/ cotação ou Compra Liberada).\n`);

  // Chave inclui a data de partida quando dá pra ler — pessoa com várias
  // viagens parecidas (mesmo trajeto, datas diferentes) não pode "herdar"
  // o status aberto de uma viagem que não é a dela.
  function dataISO(br) {
    const m = String(br || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const idxAberto = new Set(aindaAbertas.map(row =>
    norm(g(row, 'NOME')) + '|' + trajChave(g(row, 'PASSAGEM DE IDA')) + '|' + (dataISO(g(row, 'DATA DE PARTIDA')) || '')
  ));
  // Fallback sem data (pra quando a data não bateu por formatação, mas
  // só usado quando existe EXATAMENTE 1 linha aberta pra aquele nome+trajeto
  // — se tiver mais de uma, não dá pra saber qual é sem a data, então não
  // arrisca (fica como "corrigir" e o usuário confere à mão).
  const contagemSemData = new Map();
  aindaAbertas.forEach(row => {
    const k = norm(g(row, 'NOME')) + '|' + trajChave(g(row, 'PASSAGEM DE IDA'));
    contagemSemData.set(k, (contagemSemData.get(k) || 0) + 1);
  });

  const { rows: pendentesDB } = await db.query(
    `select id, codigo, passageiro, origem, destino, saida, status from passagens_solicitacoes where status in ('pendente','aprovada')`
  );
  console.log(`${pendentesDB.length} solicitações com status pendente/aprovada no sistema.\n`);

  const corrigir = [];
  const mantemPendente = [];
  pendentesDB.forEach(s => {
    const trajKey = trajChave(`${s.origem || ''} - ${s.destino || ''}`);
    const dataSaida = s.saida ? String(s.saida).slice(0, 10) : '';
    const chaveComData = norm(s.passageiro) + '|' + trajKey + '|' + dataSaida;
    const chaveSemData = norm(s.passageiro) + '|' + trajKey;
    if (idxAberto.has(chaveComData)) { mantemPendente.push(s); return; }
    if (dataSaida && contagemSemData.has(chaveSemData) === false) { corrigir.push(s); return; }
    if (!dataSaida && contagemSemData.get(chaveSemData) === 1) { mantemPendente.push(s); return; }
    corrigir.push(s);
  });

  console.log(`✅ Mantém pendente (ainda aberta na planilha): ${mantemPendente.length}`);
  console.log(`🔧 Corrigir para 'comprada' (não está mais aberta na planilha): ${corrigir.length}\n`);

  console.log('=== A CORRIGIR ===');
  corrigir.forEach(s => console.log(`  ${s.codigo} | ${s.passageiro} | ${s.origem} → ${s.destino} | status atual: ${s.status}`));

  console.log('\n=== MANTÉM PENDENTE ===');
  mantemPendente.forEach(s => console.log(`  ${s.codigo} | ${s.passageiro} | ${s.origem} → ${s.destino} | status atual: ${s.status}`));

  mkdirSync(new URL('../migracao/data', import.meta.url), { recursive: true });
  writeFileSync(new URL('../migracao/data/status-a-corrigir.json', import.meta.url), JSON.stringify(corrigir, null, 2));

  if (APLICAR) {
    console.log('\n✍️  Aplicando...');
    for (const s of corrigir) {
      await db.query(
        `update passagens_solicitacoes set status='comprada', historico = coalesce(historico, '[]'::jsonb) || $1::jsonb where id = $2`,
        [JSON.stringify([{ acao: 'Status corrigido para comprada — não estava mais aberta na planilha de Passagens Pendentes', usuario: 'Verificação manual', ts: new Date().toISOString() }]), s.id]
      );
    }
    console.log(`✅ ${corrigir.length} solicitações corrigidas para 'comprada'.`);
  } else {
    console.log('\n(dry-run — nada foi gravado. Rode com --aplicar para efetivar.)');
  }

  await db.end();
}
main().catch(e => { console.error('❌ Erro:', e); process.exit(1); });
