#!/usr/bin/env node
/** lista-fornecedores.mjs — leitura-only. Lista todos os nomes de fornecedor
 * distintos usados no sistema (suppliers.nome, compras_financeiro.fornecedor,
 * orders.fornecedorNome), com contagem de uso, pra achar duplicatas por
 * digitação/variação de nome. Não altera nada. */
import pg from 'pg';
import { DATABASE_URL, exigir } from './env.mjs';
exigir('DATABASE_URL', DATABASE_URL);
const db = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

const [sup, fin, ord] = await Promise.all([
  db.query(`select nome, cnpj from suppliers order by nome`),
  db.query(`select fornecedor, count(*) as n, sum(coalesce(valor,0)) as total from compras_financeiro where fornecedor is not null and fornecedor <> '' group by fornecedor order by fornecedor`),
  db.query(`select fornecedor_nome, count(*) as n from orders where fornecedor_nome is not null and fornecedor_nome <> '' group by fornecedor_nome order by fornecedor_nome`),
]);

console.log(`=== suppliers (cadastro) — ${sup.rows.length} ===`);
sup.rows.forEach(r => console.log(`  "${r.nome}"${r.cnpj ? ' | CNPJ ' + r.cnpj : ''}`));

console.log(`\n=== compras_financeiro.fornecedor (texto livre) — ${fin.rows.length} distintos ===`);
fin.rows.forEach(r => console.log(`  "${r.fornecedor}" | ${r.n} lançamento(s) | R$ ${Number(r.total).toFixed(2)}`));

console.log(`\n=== orders.fornecedorNome (texto livre, Suprimentos) — ${ord.rows.length} distintos ===`);
ord.rows.forEach(r => console.log(`  "${r.fornecedor_nome}" | ${r.n} pedido(s)`));

// ── Agrupamento aproximado (achar prováveis duplicatas) ──
function norm(s) {
  return String(s || '')
    .toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
    .replace(/\bLTDA\b|\bME\b|\bEPP\b|\bEIRELI\b/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

const todosNomes = new Set([
  ...sup.rows.map(r => r.nome),
  ...fin.rows.map(r => r.fornecedor),
  ...ord.rows.map(r => r.fornecedor_nome),
]);
const lista = [...todosNomes].filter(Boolean).map(nome => ({ nome, n: norm(nome) }));

console.log(`\n=== POSSÍVEIS DUPLICATAS (nomes parecidos, ${lista.length} nomes únicos no total) ===`);
const jaAgrupado = new Set();
for (let i = 0; i < lista.length; i++) {
  if (jaAgrupado.has(lista[i].nome)) continue;
  const grupo = [lista[i]];
  for (let j = i + 1; j < lista.length; j++) {
    if (jaAgrupado.has(lista[j].nome)) continue;
    const a = lista[i].n, b = lista[j].n;
    const dist = levenshtein(a, b);
    const parecido = dist <= 2 || a.includes(b) || b.includes(a) ||
      (a.split(' ')[0] === b.split(' ')[0] && a.split(' ')[0].length >= 4);
    if (parecido) grupo.push(lista[j]);
  }
  if (grupo.length > 1) {
    grupo.forEach(g => jaAgrupado.add(g.nome));
    console.log(`  ${grupo.map(g => `"${g.nome}"`).join('  ~~  ')}`);
  }
}

await db.end();
