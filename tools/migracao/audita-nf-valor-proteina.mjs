#!/usr/bin/env node
/**
 * audita-nf-valor-proteina.mjs — leitura-only. Igual a audita-nf-valor.mjs,
 * mas restrito aos pedidos que têm pelo menos um item da categoria Proteína
 * (order_items.cat_key = 'proteina'). Um pedido pode ter itens de várias
 * categorias — não é "pedido só de proteína", é "pedido que inclui proteína".
 */
import pg from 'pg';
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

const { rows: comProteina } = await db.query(
  `select o.id, o.code, o.house, o.nf_valor, o.nf_file_name, o.nf_file_url, o.nf_numero, o.nf_extras
     from orders o
     where exists (select 1 from order_items oi where oi.order_id = o.id and oi.cat_key = 'proteina')`
);

console.log(`${comProteina.length} pedidos têm pelo menos 1 item de Proteína.\n`);

const semNF = comProteina.filter(r => !r.nf_file_url);
const semNFmasComValor = semNF.filter(r => parseFloat(r.nf_valor) > 0);
const comNF = comProteina.filter(r => r.nf_file_url && parseFloat(r.nf_valor) > 0);

console.log(`Sem NF anexada: ${semNF.length} (desses, ${semNFmasComValor.length} têm valor orçado preenchido mas SEM arquivo real).`);
console.log(`Com NF anexada e valor preenchido: ${comNF.length}\n`);

const divergentes = [];
comNF.forEach(r => {
  const doNome = extrairValorDoNome(r.nf_file_name);
  if (doNome == null) return;
  const salvo = Number(r.nf_valor);
  if (Math.abs(doNome - salvo) > 0.01) divergentes.push({ code: r.code, house: r.house, salvo, doNome, nome: r.nf_file_name });
});

console.log(`${divergentes.length} com valor de nf_valor DIFERENTE do valor escrito no nome do arquivo da NF principal.\n`);
if (divergentes.length) {
  console.log('=== DIVERGENTES ===');
  divergentes.forEach(d => console.log(`  ${d.code} (${d.house}) | salvo: R$ ${d.salvo.toFixed(2)} | nome do arquivo: R$ ${d.doNome.toFixed(2)} | "${d.nome}"`));
}

if (semNF.length) {
  console.log('\n=== SEM NF ANEXADA ===');
  semNF.forEach(r => console.log(`  ${r.code} (${r.house})${parseFloat(r.nf_valor) > 0 ? ` — tem valor orçado: R$ ${parseFloat(r.nf_valor).toFixed(2)}` : ''}`));
}

await db.end();
