#!/usr/bin/env node
/** apply-007.mjs — aplica a migration 007 (role_permissions) no Supabase. Idempotente. */
import pg from 'pg';
import { readFileSync } from 'node:fs';

let url = '';
for (const l of readFileSync(new URL('./.env', import.meta.url), 'utf8').split('\n')) {
  const m = l.match(/^\s*DATABASE_URL\s*=\s*(.+)/); if (m) url = m[1].trim().replace(/^["']|["']$/g, '');
}
const sql = readFileSync(new URL('../../supabase/migrations/007_role_permissions.sql', import.meta.url), 'utf8');
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
await db.query(sql);
console.log('✅ Migration 007 aplicada (role_permissions + RLS).');
await db.end();
