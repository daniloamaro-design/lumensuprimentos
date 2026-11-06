-- 054_variedades_financeiro.sql — Compras de Variedades vira módulo com Solicitar Pagamento próprio.
-- 1) compras_financeiro aceita modulo='variedades'
-- 2) lançamentos de variedades nascem "aguardando solicitação" (aba Solicitar Pagamento do módulo)
-- 3) nota fiscal por lançamento (variedades pode dividir um pedido em vários fornecedores)

alter table public.compras_financeiro drop constraint if exists compras_financeiro_modulo_check;
alter table public.compras_financeiro add constraint compras_financeiro_modulo_check
  check (modulo in ('suprimentos','passagens','frete','seguranca','variedades'));

alter table public.compras_financeiro add column if not exists nf_file_url  text;
alter table public.compras_financeiro add column if not exists nf_file_name text;
alter table public.compras_financeiro add column if not exists nf_numero    text;
alter table public.compras_financeiro add column if not exists nf_valor     numeric;

create or replace function public.compras_fin_marca_aguarda() returns trigger
language plpgsql as $$
begin
  if new.aguarda_solicitacao is not true and new.pagamento_solicitado_em is null then
    if new.modulo = 'passagens'
       and coalesce(new.data_compra, (new.created_at at time zone 'America/Sao_Paulo')::date) >= date '2026-10-10' then
      new.aguarda_solicitacao := true;
    elsif new.modulo = 'suprimentos'
       and new.created_at >= timestamptz '2026-10-10 00:00:00-03'
       and coalesce(new.data_compra, (new.created_at at time zone 'America/Sao_Paulo')::date) >= date '2026-10-10' then
      new.aguarda_solicitacao := true;
    elsif new.modulo = 'variedades' then
      new.aguarda_solicitacao := true;
    end if;
  end if;
  return new;
end $$;

notify pgrst, 'reload schema';
