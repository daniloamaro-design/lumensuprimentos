-- ═══════════════════════════════════════════════════════════════════
-- 002_rls.sql — Row Level Security: matriz de 11 roles + convidado
-- Fonte da matriz: js/04-percapita.js:499 + pontos de escrita do código
-- Padrão por tabela: 1 policy de leitura + 1 policy de escrita (ALL).
-- Sem policy = negado. A service_role key (ETL) ignora RLS por design.
-- ═══════════════════════════════════════════════════════════════════

-- ── Papel do usuário logado ────────────────────────────────────────
-- users.status='approved' → role da tabela; autenticado sem linha aprovada
-- (anônimo ou cadastro pendente) → 'convidado'; sem sessão → null.
create or replace function public.papel()
returns text
language sql stable security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then null
    else coalesce(
      (select role from public.users where id = auth.uid()::text and status = 'approved'),
      'convidado')
  end
$$;

-- Grupos (espelham a matriz do front)
create or replace function public.eh_gestao() returns boolean
language sql stable as $$ select papel() in ('admin','diretor','gerente','coordenador') $$;

-- ── Habilita RLS em todas as tabelas ───────────────────────────────
alter table users                     enable row level security;
alter table cidades                   enable row level security;
alter table houses                    enable row level security;
alter table categorias                enable row level security;
alter table produtos                  enable row level security;
alter table suppliers                 enable row level security;
alter table centros_custo             enable row level security;
alter table centro_custo_categorias   enable row level security;
alter table movements                 enable row level security;
alter table movement_items            enable row level security;
alter table orders                    enable row level security;
alter table order_items               enable row level security;
alter table quotations                enable row level security;
alter table transferencias            enable row level security;
alter table transferencia_items       enable row level security;
alter table transferencias_financeiras enable row level security;
alter table compras_financeiro        enable row level security;
alter table prices                    enable row level security;
alter table prices_historico          enable row level security;
alter table percapitas                enable row level security;
alter table ajustes                   enable row level security;
alter table var_setores               enable row level security;
alter table var_solicitacoes          enable row level security;
alter table var_orcamentos            enable row level security;
alter table var_propostas             enable row level security;
alter table var_proposta_itens        enable row level security;
alter table kanban_tasks              enable row level security;
alter table metas                     enable row level security;
alter table metas_historico           enable row level security;
alter table config                    enable row level security;
alter table cardapio_planos           enable row level security;
alter table audit_logs                enable row level security;

-- ── users ──────────────────────────────────────────────────────────
-- Cada autenticado lê a própria linha; gestão lê e gerencia todas.
create policy users_select_propria on users for select
  using (id = auth.uid()::text or eh_gestao());
create policy users_insert_registro on users for insert
  with check (id = auth.uid()::text and status = 'pending' and role = 'usuario');
create policy users_gestao on users for all
  using (eh_gestao()) with check (eh_gestao());

-- ── Cadastros base: leitura ampla (inclusive convidado), escrita gestão+compras ─
create policy cidades_select on cidades for select using (papel() is not null);
create policy cidades_write  on cidades for all
  using (eh_gestao() or papel() = 'compras') with check (eh_gestao() or papel() = 'compras');

create policy houses_select on houses for select using (papel() is not null);
create policy houses_write  on houses for all
  using (eh_gestao() or papel() = 'compras') with check (eh_gestao() or papel() = 'compras');

create policy categorias_select on categorias for select using (papel() is not null);
create policy categorias_write  on categorias for all
  using (eh_gestao() or papel() = 'compras') with check (eh_gestao() or papel() = 'compras');

create policy produtos_select on produtos for select using (papel() is not null);
create policy produtos_write  on produtos for all
  using (eh_gestao() or papel() = 'compras') with check (eh_gestao() or papel() = 'compras');

create policy suppliers_select on suppliers for select
  using (eh_gestao() or papel() in ('compras','estoque','financeiro'));
create policy suppliers_write on suppliers for all
  using (eh_gestao() or papel() = 'compras') with check (eh_gestao() or papel() = 'compras');

create policy cc_select on centros_custo for select
  using (eh_gestao() or papel() in ('compras','estoque','csl','coord_csl','financeiro'));
create policy cc_write on centros_custo for all
  using (eh_gestao()) with check (eh_gestao());

create policy ccc_select on centro_custo_categorias for select
  using (eh_gestao() or papel() in ('compras','estoque','csl','coord_csl','financeiro'));
create policy ccc_write on centro_custo_categorias for all
  using (eh_gestao()) with check (eh_gestao());

-- ── movements: convidado pode INSERIR (modo convidado do app) ──────
create policy movements_select on movements for select
  using (eh_gestao() or papel() in ('compras','estoque','csl','coord_csl'));
create policy movements_insert on movements for insert
  with check (eh_gestao() or papel() in ('compras','estoque','csl','coord_csl','convidado'));
create policy movements_write on movements for all
  using (eh_gestao() or papel() in ('compras','estoque'))
  with check (eh_gestao() or papel() in ('compras','estoque'));

create policy movement_items_select on movement_items for select
  using (eh_gestao() or papel() in ('compras','estoque','csl','coord_csl'));
create policy movement_items_insert on movement_items for insert
  with check (eh_gestao() or papel() in ('compras','estoque','csl','coord_csl','convidado'));
create policy movement_items_write on movement_items for all
  using (eh_gestao() or papel() in ('compras','estoque'))
  with check (eh_gestao() or papel() in ('compras','estoque'));

-- ── orders ─────────────────────────────────────────────────────────
create policy orders_select on orders for select
  using (eh_gestao() or papel() in ('compras','estoque','financeiro','csl','coord_csl'));
create policy orders_insert on orders for insert
  with check (eh_gestao() or papel() in ('compras','estoque','csl','coord_csl'));
create policy orders_write on orders for all
  using (eh_gestao() or papel() in ('compras','estoque'))
  with check (eh_gestao() or papel() in ('compras','estoque'));

create policy order_items_select on order_items for select
  using (eh_gestao() or papel() in ('compras','estoque','financeiro','csl','coord_csl'));
create policy order_items_insert on order_items for insert
  with check (eh_gestao() or papel() in ('compras','estoque','csl','coord_csl'));
create policy order_items_write on order_items for all
  using (eh_gestao() or papel() in ('compras','estoque'))
  with check (eh_gestao() or papel() in ('compras','estoque'));

-- ── quotations ─────────────────────────────────────────────────────
create policy quotations_select on quotations for select
  using (eh_gestao() or papel() in ('compras','estoque','financeiro'));
create policy quotations_write on quotations for all
  using (eh_gestao() or papel() = 'compras')
  with check (eh_gestao() or papel() = 'compras');

-- ── transferencias ─────────────────────────────────────────────────
create policy transf_select on transferencias for select
  using (eh_gestao() or papel() in ('compras','estoque'));
create policy transf_write on transferencias for all
  using (eh_gestao() or papel() in ('compras','estoque'))
  with check (eh_gestao() or papel() in ('compras','estoque'));

create policy transf_items_select on transferencia_items for select
  using (eh_gestao() or papel() in ('compras','estoque'));
create policy transf_items_write on transferencia_items for all
  using (eh_gestao() or papel() in ('compras','estoque'))
  with check (eh_gestao() or papel() in ('compras','estoque'));

create policy transf_fin_all on transferencias_financeiras for all
  using (eh_gestao() or papel() = 'compras')
  with check (eh_gestao() or papel() = 'compras');
create policy transf_fin_select on transferencias_financeiras for select
  using (eh_gestao() or papel() in ('compras','estoque'));

-- ── compras_financeiro ─────────────────────────────────────────────
create policy compras_fin_select on compras_financeiro for select
  using (eh_gestao() or papel() in ('compras','financeiro'));
create policy compras_fin_write on compras_financeiro for all
  using (eh_gestao() or papel() in ('compras','financeiro'))
  with check (eh_gestao() or papel() in ('compras','financeiro'));

-- ── prices ─────────────────────────────────────────────────────────
create policy prices_select on prices for select
  using (eh_gestao() or papel() in ('compras','estoque'));
create policy prices_write on prices for all
  using (eh_gestao() or papel() = 'compras')
  with check (eh_gestao() or papel() = 'compras');

create policy prices_hist_select on prices_historico for select
  using (eh_gestao() or papel() in ('compras','estoque'));
create policy prices_hist_write on prices_historico for all
  using (eh_gestao() or papel() = 'compras')
  with check (eh_gestao() or papel() = 'compras');

-- ── percapitas ─────────────────────────────────────────────────────
create policy percapitas_select on percapitas for select
  using (eh_gestao() or papel() in ('compras','estoque'));
create policy percapitas_write on percapitas for all
  using (eh_gestao() or papel() = 'compras')
  with check (eh_gestao() or papel() = 'compras');

-- ── ajustes: qualquer autenticado cria a própria; gestão gerencia ──
create policy ajustes_insert on ajustes for insert
  with check (papel() is not null and papel() <> 'convidado'
              and solicitante_uid = auth.uid()::text);
create policy ajustes_select on ajustes for select
  using (eh_gestao() or solicitante_uid = auth.uid()::text);
create policy ajustes_gestao on ajustes for all
  using (eh_gestao()) with check (eh_gestao());

-- ── Variedades ─────────────────────────────────────────────────────
create policy var_setores_select on var_setores for select using (papel() is not null);
create policy var_setores_write  on var_setores for all
  using (eh_gestao() or papel() = 'compras')
  with check (eh_gestao() or papel() = 'compras');

-- convidado pode CRIAR solicitação (fluxo público do app)
create policy var_sol_insert on var_solicitacoes for insert
  with check (papel() is not null);
create policy var_sol_select on var_solicitacoes for select
  using (papel() is not null and papel() <> 'convidado');
create policy var_sol_write on var_solicitacoes for all
  using (eh_gestao() or papel() = 'compras')
  with check (eh_gestao() or papel() = 'compras');

create policy var_orc_select on var_orcamentos for select
  using (eh_gestao() or papel() = 'compras');
create policy var_orc_write on var_orcamentos for all
  using (eh_gestao()) with check (eh_gestao());

create policy var_prop_select on var_propostas for select
  using (eh_gestao() or papel() = 'compras');
create policy var_prop_write on var_propostas for all
  using (eh_gestao()) with check (eh_gestao());

create policy var_prop_itens_select on var_proposta_itens for select
  using (eh_gestao() or papel() = 'compras');
create policy var_prop_itens_write on var_proposta_itens for all
  using (eh_gestao()) with check (eh_gestao());

-- ── kanban ─────────────────────────────────────────────────────────
create policy kanban_all on kanban_tasks for all
  using (eh_gestao() or papel() in ('compras','estoque'))
  with check (eh_gestao() or papel() in ('compras','estoque'));

-- ── metas ──────────────────────────────────────────────────────────
create policy metas_all on metas for all
  using (eh_gestao()) with check (eh_gestao());
create policy metas_hist_all on metas_historico for all
  using (eh_gestao()) with check (eh_gestao());

-- ── config ─────────────────────────────────────────────────────────
create policy config_select on config for select
  using (papel() is not null and papel() <> 'convidado');
create policy config_write on config for all
  using (eh_gestao() or papel() = 'compras')
  with check (eh_gestao() or papel() = 'compras');

-- ── cardápio ───────────────────────────────────────────────────────
create policy cardapio_all on cardapio_planos for all
  using (eh_gestao()) with check (eh_gestao());

-- ── auditoria: INSERT para todos autenticados; leitura só gestão;
--    imutável (sem policy de update/delete) ─────────────────────────
create policy audit_insert on audit_logs for insert
  with check (papel() is not null);
create policy audit_select on audit_logs for select
  using (eh_gestao());
