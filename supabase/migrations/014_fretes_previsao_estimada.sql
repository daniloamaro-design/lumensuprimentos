-- ═══════════════════════════════════════════════════════════════════
-- 014_fretes_previsao_estimada.sql — flag pra distinguir previsão de
-- entrega REAL (informada por alguém) de previsão ESTIMADA (backfill
-- retroativo aplicado nos fretes antigos, que nunca tiveram esse campo
-- nem no sistema atual nem no antigo). Usado pelo indicador "% de
-- Entregas no Prazo" pra avisar quando o número inclui estimativa.
-- ═══════════════════════════════════════════════════════════════════

alter table fretes add column if not exists previsao_estimada boolean not null default false;
