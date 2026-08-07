-- ═══════════════════════════════════════════════════════════════════
-- 016_pessoas_passagens.sql — cadastro de pessoas sincronizado a partir
-- da planilha Google Sheets "Lista Geral Acolhidos e Coords Lumen 2026"
-- (aba LISTA GERAL), usado pra alimentar a lista suspensa de "Nome do
-- passageiro" em Passagens > Nova Solicitação. Tabela é um CACHE — a
-- fonte da verdade é a planilha; cada sincronização substitui todo o
-- conteúdo (ver js/18-erp.js sincronizarPessoasPassagens()).
-- ═══════════════════════════════════════════════════════════════════

create table if not exists pessoas_passagens (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,
  cpf              text,
  rg               text,
  data_nascimento  date,
  status           text,
  sincronizado_em  timestamptz not null default now()
);
create index if not exists pessoas_passagens_nome_idx on pessoas_passagens(nome);

alter table pessoas_passagens enable row level security;

-- Leitura: qualquer usuário aprovado (mesmo nível de passagens_solicitacoes).
create policy pessoas_passagens_select on pessoas_passagens for select
  using (papel() is not null and papel() <> 'convidado');

-- Escrita (a sincronização): gestão ou compras, mesmo perfil que já
-- cadastra fornecedores/freteiros.
create policy pessoas_passagens_write on pessoas_passagens for all
  using (eh_gestao() or papel() = 'compras')
  with check (eh_gestao() or papel() = 'compras');
