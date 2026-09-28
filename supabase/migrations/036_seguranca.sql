-- ═══════════════════════════════════════════════════════════════════
-- 036_seguranca.sql — módulo Segurança (solicitação de segurança pra
-- eventos/encontros). Solicitação pública (convidado, sem login, mesmo
-- padrão de var_solicitacoes), aprovação por gestão, financeiro
-- unificado em compras_financeiro (modulo='seguranca').
-- ═══════════════════════════════════════════════════════════════════

create table if not exists seguranca_solicitacoes (
  id                text primary key default (gen_random_uuid()::text),
  codigo            text,
  evento            text not null,
  data_evento       date,
  horario_inicio    text,
  horario_fim       text,
  local             text,
  casa              text,
  qtd_segurancas    integer not null default 1,
  obs               text,
  solicitante_uid   text,
  solicitante_nome  text,
  solicitante_contato text,
  status            text not null default 'pendente'
                    check (status in ('pendente','aprovado','recusado','contratado','concluido','cancelado')),
  fornecedor_id     text,
  fornecedor_nome   text,
  valor             numeric not null default 0,
  aprovado_em       timestamptz,
  aprovado_por      text,
  criado_em         timestamptz not null default now()
);
create index if not exists seguranca_sol_status_idx on seguranca_solicitacoes(status);

alter table seguranca_solicitacoes enable row level security;

-- convidado pode CRIAR solicitação (fluxo público do app, sem login)
create policy seguranca_sol_insert on seguranca_solicitacoes for insert
  with check (papel() is not null);
-- leitura: gestão (admin/diretor/gerente/coordenador) vê tudo; convidado só a própria
create policy seguranca_sol_select on seguranca_solicitacoes for select
  using (
    eh_gestao()
    or (papel() = 'convidado' and solicitante_uid = auth.uid()::text)
  );
-- gestão aprova/edita/contrata
create policy seguranca_sol_write on seguranca_solicitacoes for all
  using (eh_gestao()) with check (eh_gestao());

-- compras_financeiro passa a aceitar o módulo 'seguranca' (pagamento
-- unificado das contratações, mesmo padrão de passagens/frete)
alter table compras_financeiro drop constraint if exists compras_financeiro_modulo_check;
alter table compras_financeiro add constraint compras_financeiro_modulo_check
  check (modulo in ('suprimentos','passagens','frete','seguranca'));
