-- U6 — Views SQL consolidadas para BI (Looker Studio ou similar) + role
-- somente-leitura dedicada. Não expõe o service_role nem tabelas cruas —
-- só estas 3 views agregadas/normalizadas.

-- ── vw_financeiro_erp ────────────────────────────────────────────────
-- Financeiro dos 3 módulos numa linha só, com 'pago' já normalizado
-- (Suprimentos grava 'Sim'/'Não', Passagens migrado grava 'Pago'/'Pendente';
-- ver js/12-financeiro-compras.js FIN_PAGO). Fretes tem tabela própria.
create or replace view vw_financeiro_erp as
select
  id,
  modulo,
  coalesce(data_compra, vencimento)                          as data,
  extract(year  from coalesce(data_compra, vencimento))::int as ano,
  extract(month from coalesce(data_compra, vencimento))::int as mes_num,
  fornecedor,
  destinatario                                               as casa,
  classificacao,
  valor,
  (pago in ('Sim', 'Pago'))                                  as pago
from compras_financeiro
union all
select
  id,
  'frete'                          as modulo,
  data,
  extract(year  from data)::int    as ano,
  extract(month from data)::int    as mes_num,
  freteiro_nome                    as fornecedor,
  null                             as casa,
  'Frete'                          as classificacao,
  valor,
  (status_pag = 'pago')            as pago
from fretes;

-- ── vw_financeiro_mensal ─────────────────────────────────────────────
-- Pré-agregado por módulo/ano/mês — mais leve p/ gráficos de série temporal.
create or replace view vw_financeiro_mensal as
select
  modulo, ano, mes_num,
  count(*)                              as qtd,
  sum(valor)                            as valor_total,
  sum(valor) filter (where pago)        as valor_pago,
  sum(valor) filter (where not pago)    as valor_pendente
from vw_financeiro_erp
group by modulo, ano, mes_num;

-- ── vw_operacional_mensal ────────────────────────────────────────────
-- Volume (contagem) de fretes e solicitações de passagem por mês.
create or replace view vw_operacional_mensal as
select 'frete' as modulo, extract(year from data)::int as ano, extract(month from data)::int as mes_num, count(*) as qtd
from fretes
group by 1, 2, 3
union all
select 'passagens' as modulo, extract(year from criado_em)::int as ano, extract(month from criado_em)::int as mes_num, count(*) as qtd
from passagens_solicitacoes
group by 1, 2, 3;

-- ── Role somente-leitura p/ ferramenta de BI ─────────────────────────
-- IMPORTANTE: troque a senha abaixo por uma sua (forte) ANTES de usar —
-- não deixe o placeholder. As views foram criadas pelo dono das tabelas
-- (que ignora RLS por ser dono), então bi_readonly enxerga os dados
-- agregados nelas sem precisar de sessão autenticada/auth.uid().
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'bi_readonly') then
    create role bi_readonly login password 'TROQUE_ESTA_SENHA_AGORA';
  end if;
end $$;

grant usage on schema public to bi_readonly;
grant select on vw_financeiro_erp, vw_financeiro_mensal, vw_operacional_mensal to bi_readonly;
-- Garante que views/roles futuras não fiquem acessíveis por engano:
revoke all on all tables in schema public from bi_readonly;
grant select on vw_financeiro_erp, vw_financeiro_mensal, vw_operacional_mensal to bi_readonly;
