#!/usr/bin/env node
/** apply-032.mjs — aplica a migration 032 (compras_financeiro.valor_pago). Idempotente. */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { DATABASE_URL, exigir } from './env.mjs';

exigir('DATABASE_URL', DATABASE_URL);
const sql = readFileSync(new URL('../../supabase/migrations/032_compras_financeiro_valor_pago.sql', import.meta.url), 'utf8');
const db = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
await db.query(sql);
console.log('✅ Migration 032 aplicada (compras_financeiro.valor_pago).');
await db.end();
