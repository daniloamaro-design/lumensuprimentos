-- Aprovação por produto: pedido pode ser dividido entre fornecedores.
-- divisao_fornecedores = [{quotationId, fornecedorId, fornecedorNome, valor, itens:[chave], pedidoRef}]
alter table public.orders add column if not exists divisao_fornecedores jsonb;
