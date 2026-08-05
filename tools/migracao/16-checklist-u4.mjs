#!/usr/bin/env node
/**
 * 16-checklist-u4.mjs — checklist pós-U4: confere schema (PK de metas, tabela
 * plano_acao) e mostra os números atuais do financeiro consolidado por módulo.
 *
 *   node tools/migracao/16-checklist-u4.mjs
 */
import pg from 'pg';
import { DATABASE_URL, exigir } from './env.mjs';

exigir('DATABASE_URL', DATABASE_URL);
const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
const BRL = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
let falhas = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? '✅' : '❌'} ${msg}`); if (!cond) falhas++; };

try {
  await client.connect();

  console.log('── Schema ──');
  const pkMetas = await client.query(`
    select string_agg(a.attname, ',' order by k.ord) as cols
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join unnest(c.conkey) with ordinality as k(attnum, ord) on true
    join pg_attribute a on a.attrelid = t.oid and a.attnum = k.attnum
    where t.relname = 'metas' and c.contype = 'p'
    group by c.conname`);
  ok(pkMetas.rows[0]?.cols === 'ano,cat_key,modulo', `PK de metas = (ano, cat_key, modulo) — obtido: ${pkMetas.rows[0]?.cols || 'TABELA/PK NÃO ENCONTRADA'}`);

  const planoAcaoExiste = await client.query(`select to_regclass('public.plano_acao') is not null as existe`);
  ok(planoAcaoExiste.rows[0].existe, 'Tabela plano_acao existe');

  if (planoAcaoExiste.rows[0].existe) {
    const rls = await client.query(`select relrowsecurity from pg_class where relname = 'plano_acao'`);
    ok(rls.rows[0]?.relrowsecurity === true, 'RLS habilitada em plano_acao');
    const policies = await client.query(`select count(*)::int as n from pg_policies where tablename = 'plano_acao'`);
    ok(policies.rows[0].n >= 2, `Policies em plano_acao (esperado >=2, obtido ${policies.rows[0].n})`);
  }

  console.log('\n── Financeiro consolidado (compras_financeiro, por módulo) ──');
  const porModulo = await client.query(`
    select modulo, count(*)::int as qtd, coalesce(sum(valor),0) as total,
           coalesce(sum(valor) filter (where pago = 'Sim'),0) as pago
    from compras_financeiro group by modulo order by modulo`);
  let totalGeral = 0, pagoGeral = 0;
  for (const r of porModulo.rows) {
    totalGeral += Number(r.total); pagoGeral += Number(r.pago);
    console.log(`  ${r.modulo.padEnd(12)} qtd=${String(r.qtd).padStart(5)}   total=${BRL(r.total).padStart(18)}   pago=${BRL(r.pago).padStart(18)}   pendente=${BRL(r.total - r.pago).padStart(18)}`);
  }
  console.log(`  ${'TOTAL'.padEnd(12)} ${' '.repeat(9)}   total=${BRL(totalGeral).padStart(18)}   pago=${BRL(pagoGeral).padStart(18)}   pendente=${BRL(totalGeral - pagoGeral).padStart(18)}`);

  console.log('\n── Volume operacional ──');
  const fretes = await client.query(`select count(*)::int as n, coalesce(sum(valor),0) as v from fretes`);
  const pas = await client.query(`select status, count(*)::int as n from passagens_solicitacoes group by status order by status`);
  console.log(`  Fretes cadastrados: ${fretes.rows[0].n}  (Σ valor ${BRL(fretes.rows[0].v)})`);
  console.log(`  Passagens por status: ${pas.rows.map(r => `${r.status}=${r.n}`).join(', ') || '(nenhuma)'}`);

  const planoAcaoQtd = planoAcaoExiste.rows[0].existe
    ? (await client.query(`select status, count(*)::int as n from plano_acao group by status`)).rows
    : [];
  console.log(`  Plano de ação por status: ${planoAcaoQtd.map(r => `${r.status}=${r.n}`).join(', ') || '(nenhuma tarefa ainda)'}`);

  console.log(`\n${falhas ? '❌ ' + falhas + ' item(ns) de schema com problema — investigar.' : '✅ Schema OK.'}`);
  process.exitCode = falhas ? 1 : 0;
} catch (e) {
  console.error('❌ Erro:', e.message); process.exitCode = 1;
} finally {
  await client.end();
}
