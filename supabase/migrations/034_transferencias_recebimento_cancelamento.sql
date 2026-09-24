-- Mesma causa das colunas obs/is_transferencia/pago_em já corrigidas antes:
-- código escrevendo campos que nunca existiram no schema Postgres.
--
-- confirmarRecebimentoTransf() (js/melhorias.js) grava recebido/recebidoEm/
-- recebidoPor — dava 400 ao clicar "Confirmar recebimento" em qualquer
-- transferência (reproduzido: PATCH transferencias?id=eq.XXX).
--
-- cancelarTransferencia() (js/09-indicadores-transf.js) grava canceladoEm/
-- canceladoPor/canceladoPorUid em transferencias, e isEstorno nos dois
-- movimentos de estorno que cria — mesmo problema, ainda não reportado mas
-- ia quebrar do mesmo jeito ao cancelar uma transferência.
alter table transferencias add column if not exists recebido boolean;
alter table transferencias add column if not exists recebido_em timestamptz;
alter table transferencias add column if not exists recebido_por text;
alter table transferencias add column if not exists cancelado_em timestamptz;
alter table transferencias add column if not exists cancelado_por text;
alter table transferencias add column if not exists cancelado_por_uid text;
alter table movements add column if not exists is_estorno boolean;
