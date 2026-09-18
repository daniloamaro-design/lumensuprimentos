#!/usr/bin/env node
/** apply-027.mjs — aplica a migration 027 (RLS: orders/order_items write
 * permitido também pro requester_uid do pedido). Idempotente. */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { DATABASE_URL, exigir } from './env.mjs';

exigir('DATABASE_URL', DATABASE_URL);
const sql = readFileSync(new URL('../../supabase/migrations/027_orders_write_requester.sql', import.meta.url), 'utf8');
const db = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
await db.query(sql);
console.log('✅ Migration 027 aplicada (orders/order_items: write liberado pro requester_uid).');
await db.end();
