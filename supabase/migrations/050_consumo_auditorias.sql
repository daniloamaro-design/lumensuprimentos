-- 050_consumo_auditorias.sql — Auditoria de estoque (contagem real x sistema) do Consumo Alimentar.
create table if not exists consumo_auditorias (
  id             text primary key default (gen_random_uuid()::text),
  house          text not null,
  data           date not null,
  itens          jsonb not null default '{}'::jsonb,   -- {"cereal__arroz": {nome, unidade, sistema, real, dif}}
  total_sistema  numeric not null default 0,
  total_diverg   numeric not null default 0,           -- soma das diferenças em módulo
  movement_id    text,
  obs            text,
  registrado_por text,
  registrado_uid text,
  created_at     timestamptz not null default now()
);
create index if not exists consumo_auditorias_house_data_idx on consumo_auditorias(house, data);
alter table consumo_auditorias enable row level security;
drop policy if exists consumo_auditorias_all on consumo_auditorias;
create policy consumo_auditorias_all on consumo_auditorias for all
  using (eh_gestao() or papel() = 'compras') with check (eh_gestao() or papel() = 'compras');
notify pgrst, 'reload schema';
