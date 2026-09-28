#!/usr/bin/env node
/** apply-036.mjs — aplica a migration 036 (módulo Segurança). Idempotente. */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { DATABASE_URL, exigir } from './env.mjs';

exigir('DATABASE_URL', DATABASE_URL);
const sql = readFileSync(new URL('../../supabase/migrations/036_seguranca.sql', import.meta.url), 'utf8');
const db = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
await db.query(sql);
console.log('✅ Migration 036 aplicada.');
await db.end();
