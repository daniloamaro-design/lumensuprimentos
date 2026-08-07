#!/usr/bin/env node
/** apply-013.mjs — aplica a migration 013 (fretes.previsao_entrega). Idempotente. */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { DATABASE_URL, exigir } from './env.mjs';

exigir('DATABASE_URL', DATABASE_URL);
const sql = readFileSync(new URL('../../supabase/migrations/013_fretes_previsao_entrega.sql', import.meta.url), 'utf8');
const db = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
await db.query(sql);
console.log('✅ Migration 013 aplicada (fretes.previsao_entrega).');
await db.end();
