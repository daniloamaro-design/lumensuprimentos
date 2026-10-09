-- "Solicitar pagamento" por módulo (Suprimentos e Passagens), igual ao que Fretes já tem.
-- Lançamentos NOVOS (a partir de 10/10/2026) nascem "aguardando solicitação": ficam
-- na aba Solicitar Pagamento do módulo e só aparecem no Financeiro depois de
-- marcados como solicitados. Lançamentos antigos não mudam.
alter table public.compras_financeiro add column if not exists aguarda_solicitacao boolean not null default false;
alter table public.compras_financeiro add column if not exists pagamento_solicitado_em timestamptz;
alter table public.compras_financeiro add column if not exists pagamento_solicitado_por text;

create index if not exists compras_fin_aguarda_idx on public.compras_financeiro (modulo)
  where aguarda_solicitacao and pagamento_solicitado_em is null;

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
    end if;
  end if;
  return new;
end $$;

drop trigger if exists compras_fin_marca_aguarda_trg on public.compras_financeiro;
create trigger compras_fin_marca_aguarda_trg before insert on public.compras_financeiro
  for each row execute function public.compras_fin_marca_aguarda();
