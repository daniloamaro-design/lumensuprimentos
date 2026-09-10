#!/usr/bin/env node
/** apply-023.mjs — aplica a migration 023 (nf_extras/boleto_extras em orders). Idempotente. */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { DATABASE_URL, exigir } from './env.mjs';

exigir('DATABASE_URL', DATABASE_URL);
const sql = readFileSync(new URL('../../supabase/migrations/023_order_nf_boleto_extras.sql', import.meta.url), 'utf8');
const db = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
await db.query(sql);
console.log('✅ Migration 023 aplicada (orders: nf_extras, boleto_extras).');
await db.end();
