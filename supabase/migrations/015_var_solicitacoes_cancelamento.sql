-- ═══════════════════════════════════════════════════════════════════
-- 015_var_solicitacoes_cancelamento.sql — var_solicitacoes tinha colunas
-- de data/autor para cada transição de status (pedido_liberado_em/por,
-- compra_realizada_em/por, comprada_em/por, concluido_em/por), menos
-- para "cancelado" — cancelarVarSol() (js/variedades.js) tentava gravar
-- cancelado_em/cancelado_por e o Postgres recusava (colunas inexistentes,
-- erro 400), impedindo o perfil "compras" de cancelar uma solicitação.
-- ═══════════════════════════════════════════════════════════════════

alter table var_solicitacoes
  add column if not exists cancelado_em  timestamptz,
  add column if not exists cancelado_por text;
