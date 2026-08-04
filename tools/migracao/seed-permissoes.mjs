#!/usr/bin/env node
/**
 * seed-permissoes.mjs — ERP U4: popula role_permissions com o comportamento
 * ATUAL (mesmo acesso de hoje), para que o deploy não mude nada. O admin
 * depois ajusta na tela "Permissões". Idempotente: ON CONFLICT DO NOTHING
 * (não sobrescreve ajustes feitos pelo admin).
 *   node tools/migracao/seed-permissoes.mjs
 *
 * 'admin' NÃO é semeado: acesso total é garantido no código.
 */
import pg from 'pg';
import { readFileSync } from 'node:fs';

let url = '';
for (const l of readFileSync(new URL('./.env', import.meta.url), 'utf8').split('\n')) {
  const m = l.match(/^\s*DATABASE_URL\s*=\s*(.+)/); if (m) url = m[1].trim().replace(/^["']|["']$/g, '');
}
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

// páginas dos módulos — hoje abertas a todos os perfis (o admin restringe depois)
const MOD = ['pas-solicitacoes', 'frt-lista', 'frt-novo', 'frt-freteiros', 'frt-metas'];

// todas as páginas do Suprimentos (para os perfis de gestão)
const SUP = ['dashboard', 'users', 'houses', 'manage-houses', 'manage-cities', 'manage-products',
  'manage-cats', 'percapita-financeiro', 'manage-cc', 'all-orders', 'produtividade', 'kanban',
  'new-order', 'movement', 'stock-view', 'transferencias', 'orcamento-financeiro', 'orc-pendentes',
  'fornecedores', 'my-orders', 'prices', 'percapita', 'calc-real', 'previsao', 'rotina-estoque',
  'cardapio-diario', 'financeiro-compras', 'indicadores', 'irmaos', 'ind-fornecedores', 'metas',
  'var-solicitacoes', 'var-orcamento', 'var-proposta', 'var-historico', 'var-setores', 'solicitar-ajuste'];
const TODAS = [...SUP, ...MOD];

// matriz atual (espelha js/04-percapita.js goPage) + páginas de módulo p/ todos
const MATRIZ = {
  diretor:     TODAS,
  gerente:     TODAS,
  coordenador: TODAS,
  compras: ['new-order', 'movement', 'all-orders', 'prices', 'orcamento-financeiro', 'orc-pendentes',
    'fornecedores', 'kanban', 'houses', 'manage-houses', 'manage-cities', 'manage-products',
    'manage-cats', 'manage-cc', 'financeiro-compras', 'percapita', 'stock-view', 'transferencias',
    'previsao', 'calc-real', 'my-orders', 'var-solicitacoes', ...MOD],
  estoque: ['new-order', 'movement', 'all-orders', 'prices', 'orcamento-financeiro', 'orc-pendentes',
    'fornecedores', 'kanban', 'stock-view', 'transferencias', 'percapita', 'previsao', 'my-orders',
    'var-solicitacoes', ...MOD],
  financeiro: ['financeiro-compras', 'fornecedores', 'var-solicitacoes', ...MOD],
  escritorio: ['var-solicitacoes', ...MOD],
  csl: ['new-order', 'movement', 'all-orders', 'stock-view', 'my-orders', 'solicitar-ajuste', ...MOD],
  coord_csl: ['new-order', 'movement', 'all-orders', 'stock-view', 'my-orders', ...MOD],
  usuario: ['movement', 'my-orders', 'new-order', ...MOD],
};

async function main() {
  await db.connect();
  let n = 0;
  for (const [role, pages] of Object.entries(MATRIZ)) {
    const uniq = [...new Set(pages)];
    const r = await db.query(
      `insert into role_permissions (role, pages, atualizado_por) values ($1, $2::jsonb, 'seed U4')
       on conflict (role) do nothing`,
      [role, JSON.stringify(uniq)]);
    if (r.rowCount) n++;
  }
  const tot = (await db.query('select role, jsonb_array_length(pages) q from role_permissions order by role')).rows;
  console.log(`✅ Seed concluído. ${n} perfis inseridos (novos).`);
  console.table(tot);
}
main().catch(e => { console.error('❌', e.message); process.exitCode = 1; })
  .finally(() => db.end());
