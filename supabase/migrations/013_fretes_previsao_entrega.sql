-- ═══════════════════════════════════════════════════════════════════
-- 013_fretes_previsao_entrega.sql — ERP: campo de previsão de entrega
-- no frete, para calcular o indicador real "% de Entregas no Prazo"
-- (Dashboard da Diretoria): compara a data prevista com a data real
-- em que o frete foi marcado como entregue.
-- ═══════════════════════════════════════════════════════════════════

alter table fretes add column if not exists previsao_entrega date;
