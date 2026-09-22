#!/usr/bin/env node
/** apply-031.mjs — aplica a migration 031 (movements.is_transferencia). Idempotente. */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { DATABASE_URL, exigir } from './env.mjs';

exigir('DATABASE_URL', DATABASE_URL);
const sql = readFileSync(new URL('../../supabase/migrations/031_movements_is_transferencia.sql', import.meta.url), 'utf8');
const db = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
await db.query(sql);
console.log('✅ Migration 031 aplicada (movements.is_transferencia).');
await db.end();
