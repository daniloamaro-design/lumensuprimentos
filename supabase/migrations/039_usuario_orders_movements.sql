-- O perfil 'usuario' ("🏠 Usuário" — morador de casa/acolhimento, atribuível
-- pelo admin na tela de aprovação de cadastro, js/05-cadastros.js) tem acesso
-- de UI a "Nova Solicitação de Compra", "Entrada/Saída" e "Meus Pedidos"
-- (tanto no fallback padrão quanto no role_permissions já configurado em
-- produção — all-orders/movement/my-orders), mas nunca esteve nas policies
-- de orders/order_items/movements: só 'csl'/'coord_csl' (perfis parecidos,
-- de acesso operacional sem cargo de gestão) estavam liberados.
--
-- Resultado: um usuário com esse perfil vê a tela normalmente, preenche o
-- pedido ou a movimentação, e o INSERT é rejeitado pela RLS — toast genérico
-- "Erro ao enviar pedido", sem nenhuma pista de que é falta de permissão.
-- E mesmo que o registro existisse por outro caminho, o SELECT também
-- filtra pra zero linhas (My Pedidos sempre vazio, sem erro).
drop policy if exists orders_select on orders;
create policy orders_select on orders for select
  using (eh_gestao() or papel() in ('compras','estoque','financeiro','csl','coord_csl','usuario'));
drop policy if exists orders_insert on orders;
create policy orders_insert on orders for insert
  with check (eh_gestao() or papel() in ('compras','estoque','csl','coord_csl','usuario'));

drop policy if exists order_items_select on order_items;
create policy order_items_select on order_items for select
  using (eh_gestao() or papel() in ('compras','estoque','financeiro','csl','coord_csl','usuario'));
drop policy if exists order_items_insert on order_items;
create policy order_items_insert on order_items for insert
  with check (eh_gestao() or papel() in ('compras','estoque','csl','coord_csl','usuario'));

drop policy if exists movements_select on movements;
create policy movements_select on movements for select
  using (
    eh_gestao() or papel() in ('compras','estoque','csl','coord_csl','usuario')
    or (papel() = 'convidado' and registered_uid = auth.uid()::text)
  );
drop policy if exists movements_insert on movements;
create policy movements_insert on movements for insert
  with check (eh_gestao() or papel() in ('compras','estoque','csl','coord_csl','usuario','convidado'));

drop policy if exists movement_items_select on movement_items;
create policy movement_items_select on movement_items for select
  using (eh_gestao() or papel() in ('compras','estoque','csl','coord_csl','usuario'));
drop policy if exists movement_items_insert on movement_items;
create policy movement_items_insert on movement_items for insert
  with check (eh_gestao() or papel() in ('compras','estoque','csl','coord_csl','usuario','convidado'));

-- csl/coord_csl têm acesso a "Todos os Pedidos" (all-orders), cuja tela
-- (loadAllOrders, js/06-pedidos.js) consulta quotations como fallback pra
-- recuperar o nome do fornecedor de pedidos com cotação aprovada mas campo
-- órfão no próprio pedido — RLS filtrava pra zero linhas pra esses 2 papéis,
-- degradando essa recuperação silenciosamente (sem erro, só sem efeito).
drop policy if exists quotations_select on quotations;
create policy quotations_select on quotations for select
  using (eh_gestao() or papel() in ('compras','estoque','financeiro','csl','coord_csl'));
