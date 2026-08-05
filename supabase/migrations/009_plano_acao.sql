-- Plano de ação / pendências — módulo transversal novo (U4).
-- Quadro simples de tarefas, compartilhado entre os 3 módulos do ERP.

create table if not exists plano_acao (
  id               text primary key default (gen_random_uuid()::text),
  titulo           text not null,
  descricao        text,
  responsavel_id   text references users(id),
  responsavel_nome text,
  prazo            date,
  status           text not null default 'a_fazer'
                     check (status in ('a_fazer', 'em_andamento', 'concluido')),
  modulo           text not null default 'geral'
                     check (modulo in ('geral', 'suprimentos', 'passagens', 'frete')),
  criado_por       text,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);
create index if not exists plano_acao_status_idx on plano_acao(status);
create index if not exists plano_acao_modulo_idx on plano_acao(modulo);

alter table plano_acao enable row level security;

-- Aberto a todos os autenticados aprovados: todos veem e criam/editam
-- (decisão do usuário — quadro de equipe compartilhado, sem restrição de dono).
create policy plano_acao_select on plano_acao for select
  using (papel() is not null and papel() <> 'convidado');
create policy plano_acao_write on plano_acao for all
  using (papel() is not null and papel() <> 'convidado')
  with check (papel() is not null and papel() <> 'convidado');
