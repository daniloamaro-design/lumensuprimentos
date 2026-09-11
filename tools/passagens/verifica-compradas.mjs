#!/usr/bin/env node
// tools/passagens/verifica-compradas.mjs — LEITURA-ONLY.
//
// upsertFinanceiro() (sync-planilha.mjs) nunca atualiza um lançamento que já
// existe em compras_financeiro — "financeiro é sensível". Isso significa que
// o campo PAGO fica CONGELADO no valor que a planilha tinha na hora em que a
// linha foi importada pela 1ª vez. Se depois disso o financeiro atualizar a
// planilha (pagou uma passagem que estava "Pendente", por exemplo), o sistema
// nunca fica sabendo — ele continua mostrando "Pendente" pra sempre.
//
// Este script compara, linha a linha, o PAGO atual da planilha "Passagens
// compradas" com o pago gravado em compras_financeiro (mesma chave_unica
// usada pelo sync). Não grava nada — só reporta divergências.
//
// Uso: node tools/passagens/verifica-compradas.mjs

import pg from 'pg';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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
function chaveFinanceiro({ fornecedor, destinatario, dataCompra, valor, mes, ano }) {
  const forn = norm(fornecedor).replace(/\s+/g, '_');
  const dest = norm(destinatario).replace(/\s+/g, '_');
  const data = String(dataCompra || '0').trim();
  const val = String(parseFloat(valor) || 0);
  const m = norm(mes).toUpperCase();
  const a = String(parseInt(ano) || new Date().getFullYear());
  return `${forn}__${dest}__${data}__${val}__${m}__${a}`;
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

  const { rows: finRows } = await db.query(`select chave_unica, pago, destinatario, fornecedor, data_compra, valor from compras_financeiro where modulo = 'passagens'`);
  const finPorChave = new Map(finRows.map(r => [r.chave_unica, r]));

  const semLancamento = [];
  const divergentes = [];
  let comparados = 0;

  linhas.forEach(row => {
    const nome = g(row, 'NOME');
    const agencia = g(row, 'AGENCIA');
    const valor = valorReais(g(row, 'VALOR'));
    if (!nome || !agencia || valor == null) return; // linha sem dado suficiente pra formar a chave
    const dataCompra = dataISO(g(row, 'DATA DA COMPRA'));
    const pagoPlanilha = g(row, 'PAGO') || '(vazio)';
    const chave = chaveFinanceiro({
      fornecedor: agencia, destinatario: nome, dataCompra, valor,
      mes: g(row, 'Mês'), ano: g(row, 'Ano'),
    });
    const lanc = finPorChave.get(chave);
    if (!lanc) {
      semLancamento.push({ nome, agencia, dataCompra, valor, pagoPlanilha, statusPassagem: g(row, 'STATUS DA PASSAGEM') });
      return;
    }
    comparados++;
    const pagoSistema = lanc.pago || '(vazio)';
    if (norm(pagoSistema) !== norm(pagoPlanilha)) {
      divergentes.push({ nome, agencia, dataCompra, valor, pagoPlanilha, pagoSistema });
    }
  });

  console.log(`${comparados} linhas encontradas e comparadas no sistema.`);
  console.log(`${semLancamento.length} linhas da planilha SEM lançamento correspondente em compras_financeiro.`);
  console.log(`${divergentes.length} linhas com PAGO diferente entre planilha e sistema (planilha mudou depois da importação).\n`);

  if (divergentes.length) {
    console.log('=== PAGO DIVERGENTE (planilha x sistema) ===');
    divergentes.forEach(d => console.log(`  ${d.nome} | ${d.agencia} | ${d.dataCompra} | R$ ${d.valor.toFixed(2)} | planilha: "${d.pagoPlanilha}" | sistema: "${d.pagoSistema}"`));
  }
  if (semLancamento.length) {
    console.log('\n=== SEM LANÇAMENTO NO SISTEMA (amostra até 40) ===');
    semLancamento.slice(0, 40).forEach(d => console.log(`  ${d.nome} | ${d.agencia} | ${d.dataCompra || '(sem data)'} | R$ ${(d.valor||0).toFixed(2)} | planilha PAGO: "${d.pagoPlanilha}" | status: "${d.statusPassagem}"`));
    if (semLancamento.length > 40) console.log(`  ... e mais ${semLancamento.length - 40}.`);
  }

  writeFileSync(new URL('../migracao/data/verifica-compradas.json', import.meta.url), JSON.stringify({ divergentes, semLancamento }, null, 2));
  console.log('\n💾 Detalhe completo salvo em tools/migracao/data/verifica-compradas.json');

  await db.end();
}
main().catch(e => { console.error('❌ Erro:', e); process.exit(1); });
