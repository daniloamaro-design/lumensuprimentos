#!/usr/bin/env node
/** 025_unifica_ragner_carnes_express.mjs — unifica "Ragner Queiroz",
 * "Ragner" e "Carne Express" (variações de digitação/nome) em "Carnes
 * Express" — confirmado com o usuário em 2026-09-14. Atualiza o texto
 * gravado em compras_financeiro.fornecedor e orders.fornecedor_nome, e
 * adiciona os apelidos no cadastro (suppliers.apelidos) pra qualquer
 * lançamento futuro com esses nomes já cair automaticamente junto. */
import pg from 'pg';
import { DATABASE_URL, exigir } from './env.mjs';
exigir('DATABASE_URL', DATABASE_URL);
const db = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

const VARIANTES = ['Carne Express', 'Ragner Queiroz', 'Ragner'];
const CANONICO = 'Carnes Express';

console.log(`=== ANTES ===`);
const { rows: finAntes } = await db.query(`select fornecedor, count(*) n, sum(valor) total from compras_financeiro where fornecedor = any($1::text[]) group by fornecedor`, [VARIANTES]);
console.log('compras_financeiro:', finAntes);
const { rows: ordAntes } = await db.query(`select fornecedor_nome, count(*) n from orders where fornecedor_nome = any($1::text[]) group by fornecedor_nome`, [VARIANTES]);
console.log('orders:', ordAntes);

const { rowCount: finN } = await db.query(`update compras_financeiro set fornecedor = $1 where fornecedor = any($2::text[])`, [CANONICO, VARIANTES]);
const { rowCount: ordN } = await db.query(`update orders set fornecedor_nome = $1 where fornecedor_nome = any($2::text[])`, [CANONICO, VARIANTES]);

const { rows: sup } = await db.query(`select id, apelidos from suppliers where nome = $1`, [CANONICO]);
if (sup.length) {
  const novos = [...new Set([...(sup[0].apelidos || []), ...VARIANTES])];
  await db.query(`update suppliers set apelidos = $1 where id = $2`, [novos, sup[0].id]);
  console.log(`\napelidos de "${CANONICO}" agora:`, novos);
} else {
  console.log(`\n⚠️  Fornecedor "${CANONICO}" não encontrado no cadastro — apelidos não gravados.`);
}

console.log(`\n✅ compras_financeiro: ${finN} registro(s) renomeado(s) para "${CANONICO}".`);
console.log(`✅ orders: ${ordN} registro(s) renomeado(s) para "${CANONICO}".`);

await db.end();
