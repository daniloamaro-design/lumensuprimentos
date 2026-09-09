-- ═══════════════════════════════════════════════════════════════════
-- 018_conferencia_carga_e_orcamentos_hist.sql
-- Duas features novas que precisavam de schema:
-- 1) Conferência de Carga (fretes vinculados a transferências, com
--    checagem do que foi planejado × carregado antes de liberar transporte)
-- 2) Histórico de Orçamentos Financeiros (orçamentos finalizados por casa)
-- ═══════════════════════════════════════════════════════════════════

-- ── 1) Conferência de Carga ──────────────────────────────────────────
alter table fretes add column if not exists transferencias_ids jsonb not null default '[]'::jsonb;
alter table fretes add column if not exists itens_carregados    jsonb;
alter table fretes add column if not exists taxa_cumprimento    numeric;
alter table fretes add column if not exists total_planejado     numeric;
alter table fretes add column if not exists total_carregado     numeric;

-- Rastreia a rota de frete à qual a transferência foi vinculada (não mexe
-- em "status": ele continua refletindo que o estoque já foi movimentado
-- na confirmação da transferência, independente do transporte físico).
alter table transferencias add column if not exists frete_code text;
create index if not exists transferencias_frete_code_idx on transferencias(frete_code);

-- ── 2) Histórico de Orçamentos Financeiros ───────────────────────────
create table if not exists orcamentos_financeiros (
  id          text primary key default (gen_random_uuid()::text),
  code        text,
  casa        text,
  city        text,
  bloco       text,
  tipo        text not null default 'compra',
  pessoas     numeric not null default 0,
  dias        numeric not null default 0,
  de          date,
  ate         date,
  total       numeric not null default 0,
  itens       jsonb not null default '[]'::jsonb,
  gerado_por  text,
  gerado_em   timestamptz not null default now(),
  status      text not null default 'finalizado'
);
create index if not exists orcamentos_financeiros_casa_idx on orcamentos_financeiros(casa);
create index if not exists orcamentos_financeiros_gerado_em_idx on orcamentos_financeiros(gerado_em);

alter table orcamentos_financeiros enable row level security;
create policy orcamentos_financeiros_select on orcamentos_financeiros for select
  using (eh_gestao() or papel() in ('compras','estoque','financeiro'));
create policy orcamentos_financeiros_write on orcamentos_financeiros for all
  using (eh_gestao() or papel() in ('compras','estoque'))
  with check (eh_gestao() or papel() in ('compras','estoque'));
