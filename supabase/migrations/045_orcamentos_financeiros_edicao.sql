-- Histórico de Orçamentos Financeiros: permite editar um orçamento já gerado;
-- guarda quem editou e quando.
alter table public.orcamentos_financeiros add column if not exists editado_por text;
alter table public.orcamentos_financeiros add column if not exists editado_em timestamptz;
