#!/usr/bin/env node
/** apply-020.mjs — aplica a migration 020 (sync planilha de passagens). Idempotente. */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { DATABASE_URL, exigir } from './env.mjs';

exigir('DATABASE_URL', DATABASE_URL);
const sql = readFileSync(new URL('../../supabase/migrations/020_passagens_planilha_sync.sql', import.meta.url), 'utf8');
const db = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
await db.query(sql);
console.log('✅ Migration 020 aplicada (sync planilha de passagens).');
await db.end();
