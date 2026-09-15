#!/usr/bin/env node
/** apply-019.mjs — aplica a migration 019 (transferencias: campos da Nova
 * Transferência manual). Idempotente. */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { DATABASE_URL, exigir } from './env.mjs';

exigir('DATABASE_URL', DATABASE_URL);
const sql = readFileSync(new URL('../../supabase/migrations/019_transferencias_manual_fields.sql', import.meta.url), 'utf8');
const db = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
await db.query(sql);
console.log('✅ Migration 019 aplicada (transferencias: date_str, obs, registrado_por, registrado_por_uid).');
await db.end();
