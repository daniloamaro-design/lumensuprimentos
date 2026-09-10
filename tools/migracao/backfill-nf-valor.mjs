#!/usr/bin/env node
/**
 * backfill-nf-valor.mjs — preenche orders.nf_valor pros pedidos que já têm
 * NF anexada mas nunca tiveram o valor registrado. Duas fontes, nessa ordem:
 *   1. O próprio nome do arquivo (o time já nomeia os PDFs com o valor —
 *      ex: "NF - RAGNER - Belem - R$ 1.654,16.pdf"), sem custo de IA.
 *   2. Pros que sobrarem, deixa registrado pra revisão manual (não lê a
 *      imagem/PDF nesta primeira passada — ver observação no final).
 *
 *   node tools/migracao/backfill-nf-valor.mjs           # dry-run
 *   node tools/migracao/backfill-nf-valor.mjs --aplicar # grava de verdade
 */
import pg from 'pg';
import { DATABASE_URL, exigir } from './env.mjs';
exigir('DATABASE_URL', DATABASE_URL);
const APLICAR = process.argv.includes('--aplicar');

function extrairValorDoNome(nome) {
  if (!nome) return null;
  let m = nome.match(/R\$\s?([\d.]+,\d{2})/);
  if (m) return parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
  m = nome.match(/R_?([\d.]+)_(\d{2})(?:\.\w+)?$/);
  if (m) return parseFloat(m[1].replace(/\./g, '') + '.' + m[2]);
  // "R$ 1.600" ou "R$ 1600" — sem centavos, ponto é separador de milhar
  m = nome.match(/R\$\s?([\d]{1,3}(?:\.\d{3})*)(?!\d|,)/);
  if (m) return parseFloat(m[1].replace(/\./g, ''));
  return null;
}

const db = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
const { rows } = await db.query(`select id, code, nf_file_name from orders where nf_file_url is not null and (nf_valor is null or nf_valor = 0)`);

const comValor = [], semValor = [];
rows.forEach(r => {
  const v = extrairValorDoNome(r.nf_file_name);
  if (v) comValor.push({ ...r, valor: v }); else semValor.push(r);
});

console.log(`${rows.length} pedidos sem valor de NF.`);
console.log(`  → ${comValor.length} com valor extraído do nome do arquivo.`);
console.log(`  → ${semValor.length} sem padrão reconhecível — ficam pendentes de revisão manual:`);
semValor.forEach(r => console.log(`      ${r.code} | "${r.nf_file_name}"`));

if (!APLICAR) {
  console.log('\n🔎 DRY-RUN — nada gravado. Rode com --aplicar pra gravar de verdade.');
  console.log('\nAmostra do que seria gravado:');
  comValor.slice(0, 10).forEach(r => console.log(`  ${r.code}: R$ ${r.valor.toFixed(2)}`));
} else {
  for (const r of comValor) {
    await db.query('update orders set nf_valor = $1 where id = $2', [r.valor, r.id]);
  }
  console.log(`\n✅ ${comValor.length} pedidos atualizados com o valor da NF.`);
}

await db.end();
