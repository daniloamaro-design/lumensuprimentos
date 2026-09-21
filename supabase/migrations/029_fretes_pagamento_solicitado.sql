-- Rastreia se a solicitação semanal de pagamento ao financeiro já foi feita
-- pra cada frete (processo hoje feito fora do sistema, sem nenhum registro).
-- NULL = ainda não solicitado.
alter table fretes add column if not exists pagamento_solicitado_em timestamptz;
