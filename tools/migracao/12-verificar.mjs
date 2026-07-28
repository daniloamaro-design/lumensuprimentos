#!/usr/bin/env node
/**
 * 12-verificar.mjs — confere a carga: contagens e somas de controle (export × Postgres).
 *
 *   node tools/migracao/12-verificar.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { DATABASE_URL, exigir } from './env.mjs';

exigir('DATABASE_URL', DATABASE_URL);
const AQUI = dirname(fileURLToPath(import.meta.url));
const DATA = join(AQUI, 'data');
const conta = (col) => {
  const f = join(DATA, `${col}.ndjson`);
  return existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).length : 0;
};
const somaCampo = (col, campo) => {
  const f = join(DATA, `${col}.ndjson`);
  if (!existsSync(f)) return 0;
  let s = 0;
  for (const l of readFileSync(f, 'utf8').split('\n').filter(Boolean)) {
    const v = Number(JSON.parse(l)[campo]); if (!Number.isNaN(v)) s += v;
  }
  return Math.round(s * 100) / 100;
};

const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
let falhas = 0;
const linha = (nome, esperado, obtido) => {
  const ok = Number(esperado) === Number(obtido);
  if (!ok) falhas++;
  console.log(`  ${ok ? '✅' : '❌'} ${nome.padEnd(34)} export=${String(esperado).padStart(8)}  banco=${String(obtido).padStart(8)}`);
};

async function n(sql) { return Number((await client.query(sql)).rows[0].n); }

try {
  await client.connect();
  console.log('── Contagens (documento → linha) ──');
  // coleção Firestore → tabela: casos 1:1
  const map1 = {
    movements:'movements', orders:'orders', quotations:'quotations',
    compras_financeiro:'compras_financeiro', transferencias:'transferencias',
    transferencias_financeiras:'transferencias_financeiras', prices:'prices', prices_historico:'prices_historico',
    percapitas:'percapitas', ajustes:'ajustes', var_solicitacoes:'var_solicitacoes', var_orcamentos:'var_orcamentos',
    var_propostas:'var_propostas', var_setores:'var_setores', kanban_tasks:'kanban_tasks',
    suppliers:'suppliers', produtos_config:'produtos',
    centros_custo:'centros_custo', centro_custo_categorias:'centro_custo_categorias',
    metas_historico:'metas_historico', cardapioPlanos:'cardapio_planos', houses:'houses',
  };
  for (const [col, tab] of Object.entries(map1)) linha(col, conta(col), await n(`select count(*) n from ${tab}`));
  // auditoria unificada
  linha('audit_logs+audit_log', conta('audit_logs') + conta('audit_log'), await n('select count(*) n from audit_logs'));
  // users: perfis do Firestore + perfis 'pending' criados p/ contas de login sem perfil
  const usersFire = conta('users'), usersBanco = await n('select count(*) n from users');
  console.log(`  ${usersBanco >= usersFire ? '✅' : '❌'} users (perfis)               firestore=${String(usersFire).padStart(6)}  banco=${String(usersBanco).padStart(8)} (+pendentes de contas sem perfil)`);
  if (usersBanco < usersFire) falhas++;
  // categorias: tabela consolidada (base do código + config + referenciadas) — deve ser >= config
  const catCfg = conta('categorias_config'), catBanco = await n('select count(*) n from categorias');
  console.log(`  ${catBanco >= catCfg ? '✅' : '❌'} categorias (consolidada)         config=${String(catCfg).padStart(7)}  banco=${String(catBanco).padStart(8)} (base+config+referenciadas)`);
  if (catBanco < catCfg) falhas++;

  console.log('\n── Somas de controle ──');
  // itens de movimentação — conta só itens VÁLIDOS (com catKey e prodId), pois o
  // carregador pula os malformados de propósito.
  let qtdItens = 0;
  for (const l of readFileSync(join(DATA, 'movements.ndjson'), 'utf8').split('\n').filter(Boolean))
    for (const it of (JSON.parse(l).items || []))
      if (it && it.catKey != null && it.prodId != null) qtdItens++;
  linha('movement_items (válidos)', qtdItens, await n('select count(*) n from movement_items'));
  linha('compras_financeiro Σ valor', somaCampo('compras_financeiro', 'valor'),
        Math.round(await n('select coalesce(sum(valor),0) n from compras_financeiro') * 100) / 100);
  linha('quotations Σ valor', somaCampo('quotations', 'valor'),
        Math.round(await n('select coalesce(sum(valor),0) n from quotations') * 100) / 100);

  console.log(`\n${falhas ? '❌ ' + falhas + ' divergência(s) — investigar.' : '✅ Tudo confere.'}`);
  process.exitCode = falhas ? 1 : 0;
} catch (e) {
  console.error('❌ Erro:', e.message); process.exitCode = 1;
} finally {
  await client.end();
}
