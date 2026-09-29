#!/usr/bin/env node
/** apply-039.mjs — aplica a migration 039 (perfil 'usuario' em orders/order_items/movements/movement_items). Idempotente. */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { DATABASE_URL, exigir } from './env.mjs';

exigir('DATABASE_URL', DATABASE_URL);
const sql = readFileSync(new URL('../../supabase/migrations/039_usuario_orders_movements.sql', import.meta.url), 'utf8');
const db = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
await db.query(sql);
console.log('✅ Migration 039 aplicada.');
await db.end();
