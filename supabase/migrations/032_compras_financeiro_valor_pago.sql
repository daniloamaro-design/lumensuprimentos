-- Suporte a pagamento parcial no Saldo Devedor unificado. `pago` continua
-- 'Sim'/'' pro caso binário (Suprimentos/Passagens, e Fretes quitado 100%);
-- valor_pago guarda quanto já foi pago quando é parcial (pago ainda '').
-- Sem essa coluna, um frete pago parcialmente só podia ser "tudo ou nada"
-- no saldo devedor, mesmo já tendo controle de valor parcial no próprio frete.
alter table compras_financeiro add column if not exists valor_pago numeric default 0;
