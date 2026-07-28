#!/usr/bin/env node
/**
 * 02-aplicar.mjs — aplica as migrations SQL no Postgres do Supabase.
 *
 *   node tools/migracao/02-aplicar.mjs           # aplica 001, 002, 003 em ordem
 *   node tools/migracao/02-aplicar.mjs --reset    # zera o schema public antes (staging!)
 *
 * Lê DATABASE_URL de tools/migracao/.env. Não imprime segredos.
 */
import pg from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATABASE_URL, exigir } from './env.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const DIR_MIGRATIONS = join(AQUI, '..', '..', 'supabase', 'migrations');
const reset = process.argv.includes('--reset');

exigir('DATABASE_URL', DATABASE_URL);

const RESET_SQL = `
  drop schema if exists public cascade;
  create schema public;
  grant usage on schema public to anon, authenticated, service_role;
  grant all on schema public to postgres, service_role;
  alter default privileges in schema public grant all on tables to postgres, service_role;
  alter default privileges in schema public grant all on sequences to postgres, service_role;
`;

const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  console.log('🔌 Conectado ao Postgres.');

  if (reset) {
    console.log('⚠️  --reset: apagando e recriando o schema public…');
    await client.query(RESET_SQL);
    console.log('   schema public zerado.');
  }

  const arquivos = readdirSync(DIR_MIGRATIONS).filter(f => f.endsWith('.sql')).sort();
  for (const arq of arquivos) {
    const sql = readFileSync(join(DIR_MIGRATIONS, arq), 'utf8');
    process.stdout.write(`▶️  ${arq} … `);
    await client.query(sql);
    console.log('ok');
  }

  // Relatório
  const tabelas = await client.query(
    `select count(*)::int n from information_schema.tables
      where table_schema='public' and table_type='BASE TABLE'`);
  const policies = await client.query(
    `select count(*)::int n from pg_policies where schemaname='public'`);
  const funcoes = await client.query(
    `select count(*)::int n from information_schema.routines
      where routine_schema='public' and routine_type='FUNCTION'`);
  const rlsOff = await client.query(
    `select string_agg(relname, ', ') nomes from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relkind='r' and c.relrowsecurity=false`);

  console.log('\n── Resultado ──');
  console.log(`  Tabelas:  ${tabelas.rows[0].n}`);
  console.log(`  Policies: ${policies.rows[0].n}`);
  console.log(`  Funções:  ${funcoes.rows[0].n}`);
  console.log(`  Tabelas SEM RLS: ${rlsOff.rows[0].nomes || '(nenhuma — ótimo)'}`);
  console.log('\n✅ Migrations aplicadas.');
} catch (e) {
  console.error('\n❌ Erro ao aplicar:', e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
