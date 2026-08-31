-- Adiciona o detalhamento por item de cada cotação de fornecedor (produto,
-- quantidade, valor unitário, valor total), pra permitir comparar preço
-- item a item entre fornecedores na tela de Orçamentos Pendentes -- antes só
-- existia o valor total do orçamento, sem abrir por produto.
alter table quotations add column if not exists itens jsonb not null default '[]'::jsonb;
