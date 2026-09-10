-- NFs e boletos complementares por pedido (além da NF/boleto principal já existente).
-- Ex.: fornecedor manda 2 notas fiscais para o mesmo pedido.
alter table orders add column if not exists nf_extras jsonb not null default '[]'::jsonb;
alter table orders add column if not exists boleto_extras jsonb not null default '[]'::jsonb;
