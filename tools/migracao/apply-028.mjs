#!/usr/bin/env node
/** apply-028.mjs — aplica a migration 028 (RLS: convidado pode ver a
 * própria solicitação de variedades, corrigindo o upsert que exige
 * RETURNING). Idempotente. */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { DATABASE_URL, exigir } from './env.mjs';

exigir('DATABASE_URL', DATABASE_URL);
const sql = readFileSync(new URL('../../supabase/migrations/028_var_solicitacoes_convidado_select_propria.sql', import.meta.url), 'utf8');
const db = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
await db.query(sql);
console.log('✅ Migration 028 aplicada (var_solicitacoes: convidado pode ver a própria solicitação).');
await db.end();
