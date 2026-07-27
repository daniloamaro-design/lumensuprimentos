-- ═══════════════════════════════════════════════════════════════════
-- 003_funcoes.sql — Funções, sequences e gatilhos
-- ═══════════════════════════════════════════════════════════════════

-- ── updated_at automático ──────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger trg_users_updated      before update on users          for each row execute function set_updated_at();
create trigger trg_houses_updated     before update on houses         for each row execute function set_updated_at();
create trigger trg_produtos_updated   before update on produtos       for each row execute function set_updated_at();
create trigger trg_suppliers_updated  before update on suppliers      for each row execute function set_updated_at();
create trigger trg_orders_updated     before update on orders         for each row execute function set_updated_at();
create trigger trg_kanban_updated     before update on kanban_tasks   for each row execute function set_updated_at();
create trigger trg_prices_updated     before update on prices         for each row execute function set_updated_at();
create trigger trg_percapitas_updated before update on percapitas     for each row execute function set_updated_at();
create trigger trg_config_updated     before update on config         for each row execute function set_updated_at();

-- ── Código sequencial das solicitações de variedades ───────────────
-- Substitui var_counters + runTransaction do Firestore.
-- ETL final: select setval('var_codigo_seq', <último migrado>);
create sequence if not exists var_codigo_seq start 1;

create or replace function public.proximo_codigo_var()
returns text
language plpgsql security definer
set search_path = public
as $$
begin
  if papel() is null then
    raise exception 'Não autenticado';
  end if;
  return 'VAR-' || lpad(nextval('var_codigo_seq')::text, 4, '0');
end $$;

-- ── Aprovação transacional de cotação ──────────────────────────────
-- Substitui a Cloud Function nunca deployada e os 2 updates não-atômicos
-- do cliente (js/melhorias.js:564): cotação aprovada + pedido liberado
-- acontecem num único commit — ou tudo, ou nada.
create or replace function public.aprovar_cotacao(p_quotation_id text, p_aprovador text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_order_id text;
  v_forn     text;
  v_valor    numeric;
  v_forn_id  text;
begin
  if not (eh_gestao() or papel() = 'compras') then
    raise exception 'Sem permissão para aprovar cotações';
  end if;

  select order_id, fornecedor_nome, fornecedor_id, valor
    into v_order_id, v_forn, v_forn_id, v_valor
    from quotations
   where id = p_quotation_id
   for update;

  if not found then
    raise exception 'Cotação % não encontrada', p_quotation_id;
  end if;

  update quotations
     set status = 'aprovado'
   where id = p_quotation_id;

  update orders
     set status              = 'pedido_liberado',
         liberado_em         = now(),
         cotacao_aprovada_id = p_quotation_id,
         cotacao_fornecedor  = v_forn,
         cotacao_valor       = v_valor,
         fornecedor_id       = coalesce(v_forn_id, fornecedor_id),
         fornecedor_nome     = coalesce(v_forn, fornecedor_nome)
   where id = v_order_id
     and status = 'andamento';
end $$;
