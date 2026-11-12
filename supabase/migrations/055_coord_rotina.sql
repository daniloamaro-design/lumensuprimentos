-- 055_coord_rotina.sql — Rotina semanal da equipe do coordenador.
-- Reaproveita a equipe cadastrada no Planejamento de Férias (coord_ferias_pessoas, com o vínculo ao login).
-- Gestão (admin/diretor/gerente/coordenador): lê e escreve tudo.
-- A pessoa vinculada: lê só as próprias linhas e age por funções (marcar concluída, pedir extra, sugerir).
-- Requer a migração 053 aplicada antes.

create table if not exists coord_rotina_modelo (
  id         text primary key default (gen_random_uuid()::text),
  pessoa_id  text not null references coord_ferias_pessoas(id) on delete cascade,
  dia_semana int  not null check (dia_semana between 0 and 6),   -- 0 = domingo ... 6 = sábado
  inicio     text not null,                                     -- 'HH:MM'
  fim        text not null,
  atividade  text not null,
  extra      boolean not null default false,                    -- fora do expediente / fim de semana
  created_at timestamptz not null default now()
);
create index if not exists coord_rotina_modelo_pessoa_idx on coord_rotina_modelo(pessoa_id, dia_semana);

create table if not exists coord_rotina_itens (
  id           text primary key default (gen_random_uuid()::text),
  pessoa_id    text not null references coord_ferias_pessoas(id) on delete cascade,
  data         date not null,
  inicio       text not null,
  fim          text not null,
  atividade    text not null,
  origem       text not null default 'modelo' check (origem in ('modelo', 'semana', 'extra')),
  modelo_id    text,
  extra        boolean not null default false,
  concluida    boolean not null default false,
  concluida_em timestamptz,
  cancelada    boolean not null default false,                  -- tirada só deste dia (não conta na produtividade)
  created_at   timestamptz not null default now()
);
create unique index if not exists coord_rotina_itens_modelo_uidx on coord_rotina_itens(pessoa_id, data, modelo_id) where modelo_id is not null;
create index if not exists coord_rotina_itens_pessoa_data_idx on coord_rotina_itens(pessoa_id, data);

create table if not exists coord_rotina_pedidos (
  id          text primary key default (gen_random_uuid()::text),
  pessoa_id   text not null references coord_ferias_pessoas(id) on delete cascade,
  data        date not null,
  inicio      text not null,
  fim         text not null,
  atividade   text not null,
  motivo      text,
  status      text not null default 'pendente' check (status in ('pendente', 'aprovado', 'recusado')),
  resposta    text,
  decidido_por text,
  decidido_em timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists coord_rotina_pedidos_status_idx on coord_rotina_pedidos(status);

create table if not exists coord_rotina_sugestoes (
  id         text primary key default (gen_random_uuid()::text),
  pessoa_id  text not null references coord_ferias_pessoas(id) on delete cascade,
  item_id    text,
  texto      text not null,
  lida       boolean not null default false,
  resposta   text,
  created_at timestamptz not null default now()
);
create index if not exists coord_rotina_sugestoes_lida_idx on coord_rotina_sugestoes(lida);

alter table coord_rotina_modelo    enable row level security;
alter table coord_rotina_itens     enable row level security;
alter table coord_rotina_pedidos   enable row level security;
alter table coord_rotina_sugestoes enable row level security;

-- Função auxiliar: ids de pessoa ligados ao login atual
create or replace function public.rotina_minhas_pessoas()
returns setof text language sql stable security definer set search_path = public as $$
  select id from coord_ferias_pessoas where user_id = auth.uid()::text
$$;
revoke all on function public.rotina_minhas_pessoas() from public, anon;
grant execute on function public.rotina_minhas_pessoas() to authenticated;

-- Gestão: tudo. Pessoa vinculada: só leitura das próprias linhas.
do $$
declare t text;
begin
  foreach t in array array['coord_rotina_modelo','coord_rotina_itens','coord_rotina_pedidos','coord_rotina_sugestoes'] loop
    execute format('drop policy if exists %I on %I', t || '_gestao', t);
    execute format('create policy %I on %I for all using (eh_gestao()) with check (eh_gestao())', t || '_gestao', t);
    execute format('drop policy if exists %I on %I', t || '_propria', t);
    execute format('create policy %I on %I for select using (pessoa_id in (select rotina_minhas_pessoas()))', t || '_propria', t);
  end loop;
end $$;

-- Gera os itens de uma semana (segunda a domingo) a partir do modelo. Idempotente.
-- Pode ser chamada pela gestão ou pela própria pessoa.
create or replace function public.rotina_gerar_semana(p_pessoa text, p_segunda date)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (eh_gestao() or p_pessoa in (select rotina_minhas_pessoas())) then
    raise exception 'Sem permissão para esta rotina.';
  end if;
  insert into coord_rotina_itens (pessoa_id, data, inicio, fim, atividade, origem, modelo_id, extra)
  select m.pessoa_id, (p_segunda + ((case when m.dia_semana = 0 then 6 else m.dia_semana - 1 end))::int), m.inicio, m.fim, m.atividade, 'modelo', m.id, m.extra
    from coord_rotina_modelo m
   where m.pessoa_id = p_pessoa
  on conflict do nothing;
end $$;
revoke all on function public.rotina_gerar_semana(text, date) from public, anon;
grant execute on function public.rotina_gerar_semana(text, date) to authenticated;

-- A pessoa marca / desmarca uma atividade dela como concluída.
create or replace function public.rotina_marcar(p_item text, p_concluida boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update coord_rotina_itens
     set concluida = p_concluida,
         concluida_em = case when p_concluida then now() else null end
   where id = p_item and cancelada = false
     and (eh_gestao() or pessoa_id in (select rotina_minhas_pessoas()));
  if not found then raise exception 'Atividade não encontrada ou sem permissão.'; end if;
end $$;
revoke all on function public.rotina_marcar(text, boolean) from public, anon;
grant execute on function public.rotina_marcar(text, boolean) to authenticated;

-- A pessoa pede uma atividade extra (fica pendente até o coordenador aprovar).
create or replace function public.rotina_pedir_extra(p_data date, p_inicio text, p_fim text, p_atividade text, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_pessoa text;
begin
  select id into v_pessoa from coord_ferias_pessoas where user_id = auth.uid()::text limit 1;
  if v_pessoa is null then raise exception 'Seu login não está vinculado a nenhuma pessoa da equipe.'; end if;
  if coalesce(trim(p_atividade), '') = '' then raise exception 'Descreva a atividade.'; end if;
  insert into coord_rotina_pedidos (pessoa_id, data, inicio, fim, atividade, motivo)
  values (v_pessoa, p_data, p_inicio, p_fim, trim(p_atividade), nullif(trim(coalesce(p_motivo, '')), ''));
end $$;
revoke all on function public.rotina_pedir_extra(date, text, text, text, text) from public, anon;
grant execute on function public.rotina_pedir_extra(date, text, text, text, text) to authenticated;

-- A pessoa envia uma sugestão (geral ou sobre uma atividade).
create or replace function public.rotina_sugerir(p_item text, p_texto text)
returns void language plpgsql security definer set search_path = public as $$
declare v_pessoa text;
begin
  select id into v_pessoa from coord_ferias_pessoas where user_id = auth.uid()::text limit 1;
  if v_pessoa is null then raise exception 'Seu login não está vinculado a nenhuma pessoa da equipe.'; end if;
  if coalesce(trim(p_texto), '') = '' then raise exception 'Escreva a sugestão.'; end if;
  insert into coord_rotina_sugestoes (pessoa_id, item_id, texto) values (v_pessoa, nullif(p_item, ''), trim(p_texto));
end $$;
revoke all on function public.rotina_sugerir(text, text) from public, anon;
grant execute on function public.rotina_sugerir(text, text) to authenticated;

notify pgrst, 'reload schema';
