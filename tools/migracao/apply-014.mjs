#!/usr/bin/env node
/** apply-014.mjs — aplica a migration 014 (fretes.previsao_estimada). Idempotente. */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { DATABASE_URL, exigir } from './env.mjs';

exigir('DATABASE_URL', DATABASE_URL);
const sql = readFileSync(new URL('../../supabase/migrations/014_fretes_previsao_estimada.sql', import.meta.url), 'utf8');
const db = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
await db.query(sql);
console.log('✅ Migration 014 aplicada (fretes.previsao_estimada).');
await db.end();
