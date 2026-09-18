-- A feature "Editar Pedido" (js/06-pedidos.js) deixa quem FEZ o pedido
-- editá-lo enquanto ainda está "aguardando_estoque", mesmo sem cargo de
-- gestão — mas a policy de escrita em orders/order_items só liberava
-- eh_gestao() ou papel() in ('compras','estoque'). Resultado: o UPDATE
-- rodava sem erro (RLS simplesmente não achava a linha pra atualizar) e a
-- edição não gravava nada — sem aviso nenhum pro usuário.
drop policy if exists orders_write on orders;
create policy orders_write on orders for all
  using (eh_gestao() or papel() in ('compras','estoque') or requester_uid = auth.uid()::text)
  with check (eh_gestao() or papel() in ('compras','estoque') or requester_uid = auth.uid()::text);

drop policy if exists order_items_write on order_items;
create policy order_items_write on order_items for all
  using (
    eh_gestao() or papel() in ('compras','estoque')
    or exists (select 1 from orders o where o.id = order_items.order_id and o.requester_uid = auth.uid()::text)
  )
  with check (
    eh_gestao() or papel() in ('compras','estoque')
    or exists (select 1 from orders o where o.id = order_items.order_id and o.requester_uid = auth.uid()::text)
  );
