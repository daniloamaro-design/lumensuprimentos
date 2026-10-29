-- 051_consumo_proteinas_semana.sql — Proteínas definidas pelo total da semana (Kg) dividido entre as proteínas.
-- Formato: {"total": 80, "itens": {"proteina__frango": 25, "proteina__carre": 15, ...}}
alter table consumo_planos add column if not exists proteinas_semana jsonb not null default '{}'::jsonb;
notify pgrst, 'reload schema';
