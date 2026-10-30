-- 052_suppliers_prazo_regra.sql — prazo de pagamento "por período da compra".
-- [{de:1, ate:10, dia:15, mes:0}, ...] : compras entre o dia `de` e `ate` vencem no dia `dia`
-- do mesmo mês (mes=0) ou do mês seguinte (mes=1). Usado quando suppliers.prazo = 'periodo'.
alter table suppliers add column if not exists prazo_regra jsonb;
notify pgrst, 'reload schema';
