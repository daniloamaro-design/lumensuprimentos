#!/usr/bin/env node
/** backfill-contato-freteiros.mjs — a tela de Freteiros gravava telefone em
 * suppliers.tel; a tela geral de Fornecedores usa suppliers.contato. Ao
 * unificar as duas telas numa só, copia tel -> contato onde contato estiver
 * vazio, pra não perder o telefone já cadastrado dos freteiros existentes. */
import pg from 'pg';
import { DATABASE_URL, exigir } from './env.mjs';
exigir('DATABASE_URL', DATABASE_URL);
const db = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
const { rows } = await db.query(`select id, nome, contato, tel from suppliers where tel is not null and tel <> '' and (contato is null or contato = '')`);
console.log(`${rows.length} fornecedores com tel preenchido e contato vazio:`);
rows.forEach(r => console.log(`  ${r.nome}: ${r.tel}`));
if (rows.length) {
  await db.query(`update suppliers set contato = tel where tel is not null and tel <> '' and (contato is null or contato = '')`);
  console.log(`✅ ${rows.length} atualizados.`);
}
await db.end();
