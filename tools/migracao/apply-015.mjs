#!/usr/bin/env node
/** apply-015.mjs — aplica a migration 015 (var_solicitacoes.cancelado_em/por). Idempotente. */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { DATABASE_URL, exigir } from './env.mjs';

exigir('DATABASE_URL', DATABASE_URL);
const sql = readFileSync(new URL('../../supabase/migrations/015_var_solicitacoes_cancelamento.sql', import.meta.url), 'utf8');
const db = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
await db.query(sql);
console.log('✅ Migration 015 aplicada (var_solicitacoes.cancelado_em/cancelado_por).');
await db.end();
