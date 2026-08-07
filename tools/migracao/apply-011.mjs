#!/usr/bin/env node
/** apply-011.mjs — aplica a migration 011 (RLS fretes/passagens_solicitacoes abertas). Idempotente. */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { DATABASE_URL, exigir } from './env.mjs';

exigir('DATABASE_URL', DATABASE_URL);
const sql = readFileSync(new URL('../../supabase/migrations/011_fretes_passagens_write_aberta.sql', import.meta.url), 'utf8');
const db = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
await db.query(sql);
console.log('✅ Migration 011 aplicada (RLS fretes + passagens_solicitacoes abertas a qualquer aprovado).');
await db.end();
