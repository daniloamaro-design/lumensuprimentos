-- 053_coord_ferias.sql — Planejamento de férias da equipe do coordenador.
-- Leitura: qualquer usuário logado (não convidado). Escrita: gestão (admin/diretor/gerente/coordenador).
create table if not exists coord_ferias_pessoas (
  id         text primary key default (gen_random_uuid()::text),
  nome       text not null,
  ordem      int  not null default 0,
  admissao   date,          -- dia em que entrou na empresa
  nascimento date,          -- aniversário
  user_id    text,          -- login da pessoa no sistema (users.id), opcional
  pode_preencher boolean not null default false,  -- coordenador liberou a pessoa a preencher as próprias datas
  created_at timestamptz not null default now()
);
alter table coord_ferias_pessoas add column if not exists admissao   date;
alter table coord_ferias_pessoas add column if not exists nascimento date;
alter table coord_ferias_pessoas add column if not exists user_id text;
alter table coord_ferias_pessoas add column if not exists pode_preencher boolean not null default false;
create unique index if not exists coord_ferias_pessoas_user_idx on coord_ferias_pessoas(user_id) where user_id is not null;

create table if not exists coord_ferias_periodos (
  id         text primary key default (gen_random_uuid()::text),
  pessoa_id  text not null references coord_ferias_pessoas(id) on delete cascade,
  inicio     date not null,
  fim        date not null,
  obs        text,
  created_by text,
  created_at timestamptz not null default now(),
  constraint coord_ferias_periodos_ordem check (fim >= inicio)
);
create index if not exists coord_ferias_periodos_inicio_idx on coord_ferias_periodos(inicio);

alter table coord_ferias_pessoas  enable row level security;
alter table coord_ferias_periodos enable row level security;

drop policy if exists coord_ferias_pessoas_select on coord_ferias_pessoas;
create policy coord_ferias_pessoas_select on coord_ferias_pessoas for select using (papel() <> 'convidado');
drop policy if exists coord_ferias_pessoas_write on coord_ferias_pessoas;
create policy coord_ferias_pessoas_write on coord_ferias_pessoas for all using (eh_gestao()) with check (eh_gestao());

drop policy if exists coord_ferias_periodos_select on coord_ferias_periodos;
create policy coord_ferias_periodos_select on coord_ferias_periodos for select using (papel() <> 'convidado');
drop policy if exists coord_ferias_periodos_write on coord_ferias_periodos;
create policy coord_ferias_periodos_write on coord_ferias_periodos for all using (eh_gestao()) with check (eh_gestao());

-- A pessoa vinculada (e liberada pelo coordenador) preenche SÓ a própria admissão e nascimento.
-- Função SECURITY DEFINER: a política de escrita continua restrita à gestão, sem abrir a tabela inteira.
create or replace function public.coord_ferias_salvar_meus_dados(p_admissao date, p_nascimento date)
returns void language plpgsql security definer set search_path = public as $$
begin
  update coord_ferias_pessoas
     set admissao = p_admissao, nascimento = p_nascimento
   where user_id = auth.uid()::text and pode_preencher = true;
  if not found then
    raise exception 'Você não está liberado para preencher seus dados. Fale com o coordenador.';
  end if;
end $$;
revoke all on function public.coord_ferias_salvar_meus_dados(date, date) from public, anon;
grant execute on function public.coord_ferias_salvar_meus_dados(date, date) to authenticated;

notify pgrst, 'reload schema';
