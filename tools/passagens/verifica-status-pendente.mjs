#!/usr/bin/env node
// tools/passagens/verifica-status-pendente.mjs — LEITURA-ONLY.
//
// Muitas solicitações aparecem com status='pendente' em passagens_solicitacoes
// mesmo já tendo sido compradas (estão na aba "Passagens compradas" da
// planilha). Causa: o sync roda 2x/dia e SEMPRE reprocessa a aba "Passagens
// pendentes" inteira, sem olhar se aquela pessoa/viagem já foi comprada —
// se a linha não foi removida da aba de pendentes depois da compra (o que
// parece ser o caso aqui), o sync fica reescrevendo status='pendente' pra
// sempre, porque a aba "Passagens compradas" só reprocessa compras NOVAS
// (a partir de CORTE_COMPRADAS) — nunca "resgata de volta" o histórico.
//
// Este script cruza toda solicitação com status IN ('pendente','aprovada')
// contra a aba "Passagens compradas" ATUAL (mesma chave usada pelo sync:
// nome + data da solicitação + trajeto de ida + data de partida) — se achar
// a mesma viagem lá, é prova de que já foi comprada. Só relatório, não grava.

import pg from 'pg';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHEET_ID = '1odkhxMXJN4_1CDeoDxX0VoGuBqoGrBQ19FdvoF1iHeE';
const GID_COMPRADAS = '1056078931';

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

function dataISO(br) {
  const m = String(br || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}
function valorReais(s) {
  const n = String(s || '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3},)/g, '').replace(',', '.');
  const v = parseFloat(n);
  return Number.isFinite(v) ? v : null;
}
function chavePassagem(nome, dataSolic, trajeto, dataPartida) {
  return [nome, dataSolic, trajeto, dataPartida].map(norm).join('|');
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

  console.log('Baixando aba "Passagens compradas"...');
  const compradas = await baixarAba(GID_COMPRADAS);
  console.log(`  ${compradas.length} linhas.\n`);

  // Índice da aba compradas pela MESMA chave usada pelo sync (nome + data
  // da solicitação + trajeto de ida + data de partida).
  const idxCompradas = new Map();
  compradas.forEach(row => {
    const chave = chavePassagem(g(row, 'NOME'), g(row, 'DATA DA SOLICITAÇÃO'), g(row, 'PASSAGEM DE IDA'), g(row, 'DATA DE PARTIDA'));
    if (!idxCompradas.has(chave)) idxCompradas.set(chave, row);
  });
  // Índice auxiliar mais solto: nome + trajeto de ida (sem as datas) — usado
  // só pra reportar "possível match" quando a chave exata não bate (datas
  // gravadas diferente entre as duas abas), nunca pra aplicar automático.
  const idxSolto = new Map();
  compradas.forEach(row => {
    const chave = [norm(g(row, 'NOME')), norm(g(row, 'PASSAGEM DE IDA'))].join('|');
    if (!idxSolto.has(chave)) idxSolto.set(chave, []);
    idxSolto.get(chave).push(row);
  });

  const { rows: pendentesDB } = await db.query(
    `select id, codigo, passageiro, origem, destino, saida, criado_em, planilha_chave, status
       from passagens_solicitacoes where status in ('pendente','aprovada')`
  );
  console.log(`${pendentesDB.length} solicitações com status pendente/aprovada no sistema.\n`);

  const confirmadasCompra = [];
  const possiveis = [];
  const realmentePendentes = [];

  pendentesDB.forEach(s => {
    if (s.planilha_chave && idxCompradas.has(s.planilha_chave)) {
      const row = idxCompradas.get(s.planilha_chave);
      confirmadasCompra.push({
        id: s.id, codigo: s.codigo, passageiro: s.passageiro, trajeto: `${s.origem || '?'} → ${s.destino || '?'}`,
        statusAtual: s.status, dataCompra: dataISO(g(row, 'DATA DA COMPRA')), valor: valorReais(g(row, 'VALOR')), agencia: g(row, 'AGENCIA'),
      });
      return;
    }
    const trajeto = `${s.origem || ''} - ${s.destino || ''}`;
    const chaveSolta = [norm(s.passageiro), norm(trajeto)].join('|');
    const candidatos = idxSolto.get(chaveSolta);
    if (candidatos && candidatos.length) {
      possiveis.push({
        id: s.id, codigo: s.codigo, passageiro: s.passageiro, trajeto: `${s.origem || '?'} → ${s.destino || '?'}`,
        statusAtual: s.status, candidatosNaPlanilha: candidatos.length,
      });
      return;
    }
    realmentePendentes.push({ id: s.id, codigo: s.codigo, passageiro: s.passageiro, trajeto: `${s.origem || '?'} → ${s.destino || '?'}`, statusAtual: s.status });
  });

  console.log(`✅ Confirmado como COMPRADA (chave exata bate com a planilha): ${confirmadasCompra.length}`);
  console.log(`🤔 Possível compra (nome+trajeto batem, mas a chave completa não — vale checar): ${possiveis.length}`);
  console.log(`⏳ Realmente sem match na planilha de compradas (provável pendente de verdade): ${realmentePendentes.length}\n`);

  mkdirSync(new URL('../migracao/data', import.meta.url), { recursive: true });
  writeFileSync(new URL('../migracao/data/status-confirmadas.json', import.meta.url), JSON.stringify(confirmadasCompra, null, 2));
  writeFileSync(new URL('../migracao/data/status-possiveis.json', import.meta.url), JSON.stringify(possiveis, null, 2));
  writeFileSync(new URL('../migracao/data/status-realmente-pendentes.json', import.meta.url), JSON.stringify(realmentePendentes, null, 2));
  console.log('💾 3 arquivos salvos em tools/migracao/data/status-*.json');

  await db.end();
}
main().catch(e => { console.error('❌ Erro:', e); process.exit(1); });
