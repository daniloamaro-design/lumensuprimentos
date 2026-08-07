#!/usr/bin/env node
/** apply-012.mjs — aplica a migration 012 (leitura de metas/compras_financeiro aberta). Idempotente. */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { DATABASE_URL, exigir } from './env.mjs';

exigir('DATABASE_URL', DATABASE_URL);
const sql = readFileSync(new URL('../../supabase/migrations/012_leitura_metas_financeiro_aberta.sql', import.meta.url), 'utf8');
const db = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
await db.query(sql);
console.log('✅ Migration 012 aplicada (leitura de metas e compras_financeiro aberta a qualquer aprovado).');
await db.end();
