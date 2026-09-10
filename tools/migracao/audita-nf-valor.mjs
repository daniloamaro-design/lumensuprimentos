#!/usr/bin/env node
/**
 * audita-nf-valor.mjs — leitura-only. Compara orders.nf_valor com o valor
 * que está escrito no próprio nome do arquivo da NF (convenção do time),
 * pra achar casos como digitação errada na hora de anexar (não só valor
 * ausente — esse já foi tratado por backfill-nf-valor.mjs).
 */
import pg from 'pg';
import { writeFileSync } from 'node:fs';
import { DATABASE_URL, exigir } from './env.mjs';
exigir('DATABASE_URL', DATABASE_URL);

function extrairValorDoNome(nome) {
  if (!nome) return null;
  let m = nome.match(/R\$\s?([\d.]+,\d{2})/);
  if (m) return parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
  m = nome.match(/R_?([\d.]+)_(\d{2})(?:\.\w+)?$/);
  if (m) return parseFloat(m[1].replace(/\./g, '') + '.' + m[2]);
  m = nome.match(/R\$\s?([\d]{1,3}(?:\.\d{3})*)(?!\d|,)/);
  if (m) return parseFloat(m[1].replace(/\./g, ''));
  return null;
}

const db = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
const { rows } = await db.query(`select id, code, nf_valor, nf_file_name from orders where nf_file_url is not null and nf_valor > 0`);

const divergentes = [];
rows.forEach(r => {
  const doNome = extrairValorDoNome(r.nf_file_name);
  if (doNome == null) return;
  const salvo = Number(r.nf_valor);
  if (Math.abs(doNome - salvo) > 0.01) divergentes.push({ id: r.id, code: r.code, salvo, doNome, nome: r.nf_file_name });
});

console.log(`${rows.length} pedidos com valor de NF preenchido.`);
console.log(`${divergentes.length} com valor DIFERENTE do que está escrito no nome do arquivo.\n`);

const pequenas = divergentes.filter(d => Math.abs(d.salvo - d.doNome) < 5);
const medias = divergentes.filter(d => Math.abs(d.salvo - d.doNome) >= 5 && Math.abs(d.salvo - d.doNome) / Math.max(d.salvo, d.doNome) < 0.15);
const grandes = divergentes.filter(d => Math.abs(d.salvo - d.doNome) >= 5 && Math.abs(d.salvo - d.doNome) / Math.max(d.salvo, d.doNome) >= 0.15);

console.log(`Diferença pequena (< R$5, provável ajuste de quantidade/arredondamento): ${pequenas.length}`);
console.log(`Diferença média (>= R$5, < 15% do valor): ${medias.length}`);
console.log(`Diferença grande (>= 15% do valor — forte suspeita de erro/arquivo errado): ${grandes.length}\n`);

console.log('=== GRANDES (revisar primeiro) ===');
grandes.forEach(d => console.log(`  ${d.code} | salvo: R$ ${d.salvo.toFixed(2)} | nome do arquivo: R$ ${d.doNome.toFixed(2)} | "${d.nome}"`));

console.log('\n=== MÉDIAS ===');
medias.forEach(d => console.log(`  ${d.code} | salvo: R$ ${d.salvo.toFixed(2)} | nome do arquivo: R$ ${d.doNome.toFixed(2)} | "${d.nome}"`));

writeFileSync(new URL('./data/auditoria-nf-valor.json', import.meta.url), JSON.stringify(divergentes, null, 2));
console.log(`\n💾 Salvo tools/migracao/data/auditoria-nf-valor.json (${divergentes.length} registros)`);

await db.end();
