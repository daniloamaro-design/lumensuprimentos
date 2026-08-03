-- ═══════════════════════════════════════════════════════════════════
-- 006_erp_fretes.sql — ERP U2: estrutura para o módulo Fretes.
-- fretes (pedidos de frete) + fretes_metas. Freteiros → suppliers (tipo frete),
-- casas_lumen → houses, users → users (feito no ETL). fretes_counters (271) NÃO
-- migra (são contadores diários de código; o ERP usará sequence).
-- ═══════════════════════════════════════════════════════════════════

create table if not exists fretes (
  id                text primary key default (gen_random_uuid()::text),
  code              text,
  data              date,
  date_str          text,
  freteiro_id       text,
  freteiro_nome     text,
  origem            text,
  destino           text,
  motivo            text,
  tipo_carga        jsonb,
  valor             numeric not null default 0,
  valor_pago        numeric not null default 0,
  status            text,
  status_pag        text,
  forma_pag         text,
  etapa_status      text,
  paradas           jsonb,
  avaliacao         jsonb,
  historico         jsonb,
  importado         boolean not null default false,
  importado_planilha boolean not null default false,
  solicitado_por    text,
  importado_por     text,
  created_by        text,
  created_by_uid    text,
  updated_by        text,
  obs               text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists fretes_freteiro_idx on fretes(freteiro_id);
create index if not exists fretes_data_idx on fretes(data);

create table if not exists fretes_metas (
  id          text primary key default (gen_random_uuid()::text),
  mes         text,
  semanal     numeric not null default 0,
  mensal      numeric not null default 0,
  anual       numeric not null default 0,
  obs         text,
  retroativa  boolean not null default false,
  criado_por  text,
  criado_em   timestamptz not null default now()
);

alter table fretes enable row level security;
alter table fretes_metas enable row level security;
-- Acesso amplo p/ autenticados aprovados (refinado na tela de permissões — U4).
create policy fretes_select on fretes for select using (papel() is not null and papel() <> 'convidado');
create policy fretes_write on fretes for all
  using (eh_gestao() or papel() = 'compras') with check (eh_gestao() or papel() = 'compras');
create policy fretes_metas_select on fretes_metas for select using (papel() is not null and papel() <> 'convidado');
create policy fretes_metas_write on fretes_metas for all
  using (eh_gestao()) with check (eh_gestao());
