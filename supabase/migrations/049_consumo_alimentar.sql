-- ═══════════════════════════════════════════════════════════════════
-- 049_consumo_alimentar.sql — Novo método de consumo (Cereais e Proteínas).
--  consumo_planos: por casa, o consumo por refeição (6 refeições) de cada item
--                  de cereal + o cardápio semanal de proteínas.
--  consumo_baixas: uma linha por casa/dia baixado do estoque, guardando o
--                  previsto x o real (base dos gráficos de evolução).
-- Acesso: compras + gestão (admin/diretor/gerente/coordenador).
-- ═══════════════════════════════════════════════════════════════════

create table if not exists consumo_planos (
  id             text primary key default (gen_random_uuid()::text),
  house          text not null unique,
  pessoas_base   integer,                         -- população com que as quantidades foram digitadas
  dias_mes       integer not null default 30,
  itens          jsonb not null default '{}'::jsonb,  -- {"cereal__arroz": {cafe:0, merendaManha:0, almoco:0, merendaTarde:0, janta:0, ceia:0}}
  cardapio       jsonb not null default '{}'::jsonb,  -- {seg:{cafe:{key:'proteina__frango', qtd:1.5}, ...}, ...}
  atualizado_em  timestamptz not null default now(),
  atualizado_por text
);

create table if not exists consumo_baixas (
  id              text primary key default (gen_random_uuid()::text),
  house           text not null,
  data            date not null,
  pessoas         integer,                        -- pessoas usadas nesta baixa (editável: eventos)
  pessoas_padrao  integer,                        -- população base do plano
  previsto        jsonb not null default '{}'::jsonb,  -- {"cereal__arroz": {nome, unidade, qtd}}
  real            jsonb not null default '{}'::jsonb,  -- o que de fato foi baixado
  editado         boolean not null default false,
  movement_id     text,
  obs             text,
  registrado_por  text,
  registrado_uid  text,
  created_at      timestamptz not null default now(),
  unique (house, data)
);
create index if not exists consumo_baixas_house_data_idx on consumo_baixas(house, data);

alter table consumo_planos enable row level security;
alter table consumo_baixas enable row level security;

drop policy if exists consumo_planos_all on consumo_planos;
create policy consumo_planos_all on consumo_planos for all
  using (eh_gestao() or papel() = 'compras') with check (eh_gestao() or papel() = 'compras');
drop policy if exists consumo_baixas_all on consumo_baixas;
create policy consumo_baixas_all on consumo_baixas for all
  using (eh_gestao() or papel() = 'compras') with check (eh_gestao() or papel() = 'compras');

-- Permissão da nova página (aparece também na tela Permissões)
update role_permissions
   set pages = pages || '["consumo-alimentar"]'::jsonb
 where role in ('diretor','gerente','coordenador','compras')
   and not (pages ? 'consumo-alimentar');

notify pgrst, 'reload schema';
