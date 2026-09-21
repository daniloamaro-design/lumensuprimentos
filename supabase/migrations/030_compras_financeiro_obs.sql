-- O botão "Sincronizar Pedidos-Financeiro" (js/15-fornecedores-metas.js,
-- sincronizarSistema) grava um campo obs ("Sincronizado automaticamente —
-- <código>") em cada lançamento criado, mas a coluna nunca existiu no
-- schema Postgres — só no Firestore original, onde qualquer campo era
-- aceito sem declaração prévia. Causava 400 "Could not find the 'obs'
-- column" ao sincronizar.
alter table compras_financeiro add column if not exists obs text;
