-- ═══════════════════════════════════════════════════════════════════
-- 005_erp_passagens.sql — ERP U1: estrutura para o módulo Passagens.
-- Consolida o financeiro do Passagens no compras_financeiro (modulo) e
-- os fornecedores no suppliers (tipos[]). Cria a tabela de solicitações.
-- ═══════════════════════════════════════════════════════════════════

-- ── compras_financeiro: vira multi-módulo ──────────────────────────
alter table compras_financeiro
  add column if not exists modulo text not null default 'suprimentos'
    check (modulo in ('suprimentos','passagens','frete')),
  add column if not exists extra jsonb;   -- campos específicos do módulo (ex.: passageiro, passagem)
create index if not exists compras_fin_modulo_idx on compras_financeiro(modulo);

-- ── suppliers: lista única com tipos múltiplos ─────────────────────
alter table suppliers
  add column if not exists tipos text[] not null default '{produtos}',  -- produtos|passagens|frete
  add column if not exists pix  text,
  add column if not exists tel  text;
-- os fornecedores já existentes (Suprimentos) são de produtos:
update suppliers set tipos = '{produtos}' where tipos = '{}' or tipos is null;

-- ── metas: multi-módulo (para Fretes na U2) ────────────────────────
alter table metas add column if not exists modulo text not null default 'suprimentos';

-- ── passagens_solicitacoes (fluxo próprio do módulo) ───────────────
create table if not exists passagens_solicitacoes (
  id            text primary key default (gen_random_uuid()::text),
  codigo        text,
  tipo          text,
  solicitante   text,
  solicitante_uid text,
  passageiro    text,
  origem        text,
  destino       text,
  saida         text,
  retorno       text,
  turno         text,
  motivo        text,
  bagagem       text,
  pix           text,
  obs           text,
  orcamentos    jsonb,
  valor_final   jsonb,
  fornecedor    jsonb,
  data_compra   jsonb,
  ticket_img    jsonb,
  num_bilhete   jsonb,
  status        text,
  historico     jsonb,
  motivo_reprovacao  text,
  motivo_cancelamento text,
  criado_em     timestamptz not null default now()
);

alter table passagens_solicitacoes enable row level security;
-- Acesso amplo p/ autenticados aprovados (refinado na tela de permissões — U4).
create policy pas_sol_select on passagens_solicitacoes for select
  using (papel() is not null and papel() <> 'convidado');
create policy pas_sol_write on passagens_solicitacoes for all
  using (eh_gestao() or papel() = 'compras')
  with check (eh_gestao() or papel() = 'compras');
