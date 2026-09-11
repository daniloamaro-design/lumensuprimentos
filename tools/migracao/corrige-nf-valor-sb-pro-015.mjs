#!/usr/bin/env node
/** corrige-nf-valor-sb-pro-015.mjs — corrige o nf_valor de SB-PRO-20260518-015,
 * que foi duplicado por um bug em openAttachModal() (reabrir/salvar o anexo
 * somava a NF extra 2x). Correto: NF principal (R$1.654,16) + extra (R$239,85). */
import pg from 'pg';
import { DATABASE_URL, exigir } from './env.mjs';
exigir('DATABASE_URL', DATABASE_URL);
const db = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
const { rows } = await db.query(`select code, nf_valor from orders where code = 'SB-PRO-20260518-015'`);
console.log('Antes:', rows[0]);
await db.query(`update orders set nf_valor = 1894.01 where code = 'SB-PRO-20260518-015'`);
const { rows: depois } = await db.query(`select code, nf_valor from orders where code = 'SB-PRO-20260518-015'`);
console.log('Depois:', depois[0]);
await db.end();
