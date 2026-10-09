-- Categoria contábil (Conta Azul, ex.: "2.1.1 Alimentação - Proteínas - Casas") escolhida
-- na aba Solicitar Pagamento de Suprimentos; centro de custo usa centro_custo_id/nome.
alter table public.compras_financeiro add column if not exists categoria_conta text;
