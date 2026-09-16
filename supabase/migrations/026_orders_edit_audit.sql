-- Rastro de edição de pedido (feature "Editar Pedido", liberada só enquanto
-- o pedido ainda está aguardando avaliação do estoque).
alter table orders add column if not exists edited_at timestamptz;
alter table orders add column if not exists edited_by text;
