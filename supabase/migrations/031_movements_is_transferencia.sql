-- confirmarTransferencia() (js/09-indicadores-transf.js) grava isTransferencia
-- em cada movimento de saída/entrada que cria, mas a coluna nunca existia no
-- schema Postgres (resquício do Firestore, onde campo não-declarado é aceito
-- de graça). Causava 400 "Could not find the 'isTransferencia' column" —
-- quebrando a confirmação de transferência manual.
alter table movements add column if not exists is_transferencia boolean default false;
