#!/usr/bin/env node
/** apply-022.mjs — aplica a migration 022 (colunas de rastreabilidade em prices_historico). Idempotente. */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { DATABASE_URL, exigir } from './env.mjs';

exigir('DATABASE_URL', DATABASE_URL);
const sql = readFileSync(new URL('../../supabase/migrations/022_prices_historico_rastreabilidade.sql', import.meta.url), 'utf8');
const db = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
await db.query(sql);
console.log('✅ Migration 022 aplicada (prices_historico: pedido_code, fornecedor_nome, nf_numero).');
await db.end();
