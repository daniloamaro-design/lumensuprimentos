#!/usr/bin/env node
/** apply-018.mjs — aplica a migration 018 (conferência de carga + orçamentos_financeiros). Idempotente. */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { DATABASE_URL, exigir } from './env.mjs';

exigir('DATABASE_URL', DATABASE_URL);
const sql = readFileSync(new URL('../../supabase/migrations/018_conferencia_carga_e_orcamentos_hist.sql', import.meta.url), 'utf8');
const db = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
await db.query(sql);
console.log('✅ Migration 018 aplicada (conferência de carga + orçamentos_financeiros).');
await db.end();
