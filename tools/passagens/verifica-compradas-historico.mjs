#!/usr/bin/env node
// tools/passagens/verifica-compradas-historico.mjs — LEITURA-ONLY.
//
// A importação histórica (tools/migracao/17-import-passagens-planilha.mjs,
// 2026-08-06) gravou TODO lançamento de passagem comprada com pago='Sim',
// hardcoded — nunca olhou a coluna PAGO da planilha de verdade. Isso deixou
// o financeiro mostrando "pago" para passagens que na planilha real estavam
// (e talvez ainda estejam) "Pendente".
//
// Esses ~800 registros não têm chave_unica (só os importados depois de
// 2026-08-07 pelo sync-planilha.mjs têm) — então o cruzamento aqui é por
// destinatário + fornecedor + data da compra + valor (mesmos campos, sem
// chave pronta).
//
// Não grava nada — só reporta.

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
  const linhas = await baixarAba(GID_COMPRADAS);
  console.log(`  ${linhas.length} linhas na planilha.\n`);

  const { rows: hist } = await db.query(
    `select id, destinatario, fornecedor, valor, data_compra, pago from compras_financeiro where modulo = 'passagens' and chave_unica is null`
  );
  console.log(`${hist.length} lançamentos históricos (sem chave_unica) em compras_financeiro.\n`);

  // índice por (destinatario|fornecedor|data|valor) normalizado — pode ter
  // mais de um lançamento igual (parcelas com mesmo valor no mesmo dia), por
  // isso guarda uma LISTA e consome (shift) a cada match pra não reusar o
  // mesmo lançamento em 2 linhas da planilha.
  const idx = new Map();
  hist.forEach(r => {
    const dataStr = r.data_compra ? new Date(r.data_compra).toISOString().slice(0, 10) : '';
    const chave = [norm(r.destinatario), norm(r.fornecedor), dataStr, Number(r.valor).toFixed(2)].join('|');
    if (!idx.has(chave)) idx.set(chave, []);
    idx.get(chave).push(r);
  });

  let comparados = 0, semMatch = 0;
  const divergentes = [];
  linhas.forEach(row => {
    const nome = g(row, 'NOME');
    const agencia = g(row, 'AGENCIA');
    const valor = valorReais(g(row, 'VALOR'));
    const dataCompra = dataISO(g(row, 'DATA DA COMPRA'));
    const pagoPlanilha = g(row, 'PAGO') || '(vazio)';
    if (!nome || !agencia || valor == null || !dataCompra) return;
    const chave = [norm(nome), norm(agencia), dataCompra, valor.toFixed(2)].join('|');
    const candidatos = idx.get(chave);
    if (!candidatos || !candidatos.length) { semMatch++; return; }
    const lanc = candidatos.shift();
    comparados++;
    // "Pago" (planilha) e "Sim" (sistema) significam a mesma coisa — só é
    // divergência de verdade quando a planilha diz algo que NÃO é "pago"
    // (Pendente/Indefinido/vazio) mas o sistema ainda mostra 'Sim'.
    const planilhaDizPago = norm(pagoPlanilha) === 'pago' || norm(pagoPlanilha) === 'sim';
    const sistemaDizPago = norm(lanc.pago) === 'pago' || norm(lanc.pago) === 'sim';
    if (planilhaDizPago !== sistemaDizPago) {
      divergentes.push({ id: lanc.id, nome, agencia, dataCompra, valor, pagoPlanilha, pagoSistema: lanc.pago });
    }
  });

  console.log(`${comparados} linhas da planilha casadas com um lançamento histórico.`);
  console.log(`${semMatch} linhas da planilha SEM lançamento histórico correspondente (podem já ter sido cobertas pelo sync pós-corte, ou realmente faltando).`);
  console.log(`${divergentes.length} com PAGO diferente entre planilha e sistema — o sistema mostra "${'Sim (hardcoded na importação)'}" mas a planilha diz outra coisa.\n`);

  if (divergentes.length) {
    console.log('=== PAGO DIVERGENTE (planilha x sistema — histórico) ===');
    divergentes.forEach(d => console.log(`  ${d.nome} | ${d.agencia} | ${d.dataCompra} | R$ ${d.valor.toFixed(2)} | planilha: "${d.pagoPlanilha}" | sistema: "${d.pagoSistema}"`));
  }

  mkdirSync(new URL('../migracao/data', import.meta.url), { recursive: true });
  writeFileSync(new URL('../migracao/data/verifica-compradas-historico.json', import.meta.url), JSON.stringify(divergentes, null, 2));
  console.log('\n💾 Detalhe salvo em tools/migracao/data/verifica-compradas-historico.json');

  await db.end();
}
main().catch(e => { console.error('❌ Erro:', e); process.exit(1); });
