-- finTogglePago/pagMarcarSelecionados (js/12-financeiro-compras.js) gravam
-- pagoEm (data em que foi marcado como pago) em compras_financeiro, mas a
-- coluna nunca existiu no schema Postgres — resquício do Firestore, que
-- aceita campo não-declarado. Dava 400 "Could not find the 'pago_em'
-- column" ao tentar marcar/desmarcar pago pela tela Financeiro.
alter table compras_financeiro add column if not exists pago_em timestamptz;
