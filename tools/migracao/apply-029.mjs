#!/usr/bin/env node
/** apply-029.mjs — aplica a migration 029 (fretes.pagamento_solicitado_em). Idempotente. */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { DATABASE_URL, exigir } from './env.mjs';

exigir('DATABASE_URL', DATABASE_URL);
const sql = readFileSync(new URL('../../supabase/migrations/029_fretes_pagamento_solicitado.sql', import.meta.url), 'utf8');
const db = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
await db.query(sql);
console.log('✅ Migration 029 aplicada (fretes.pagamento_solicitado_em).');
await db.end();
