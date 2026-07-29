-- ═══════════════════════════════════════════════════════════════════
-- 004_casas_tipo_compra.sql — tabela de configuração de compra por casa.
-- No Firestore era a coleção casas_tipo_compra {nome, tipo, coordenador, pix}
-- (estava vazia na migração; recriada para o módulo Orçamento Financeiro).
-- PK = nome (chave natural, casada com houses.nome).
-- ═══════════════════════════════════════════════════════════════════
create table if not exists casas_tipo_compra (
  nome        text primary key,
  tipo        text,           -- 'compra' | 'transferencia'
  coordenador text,
  pix         text,
  updated_at  timestamptz not null default now()
);

alter table casas_tipo_compra enable row level security;

-- Leitura: gestão + compras + estoque; escrita: gestão + compras.
create policy ctc_select on casas_tipo_compra for select
  using (eh_gestao() or papel() in ('compras','estoque'));
create policy ctc_write on casas_tipo_compra for all
  using (eh_gestao() or papel() = 'compras')
  with check (eh_gestao() or papel() = 'compras');
