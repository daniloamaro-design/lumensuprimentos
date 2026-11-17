-- 056_var_orcamentos_compras.sql — o perfil Compras também registra as cotações de Variedades
-- (como já faz nos pedidos de Suprimentos). Compras tem liberdade total no módulo (a tela e o Financeiro já permitem).
-- Obs.: lançamentos em compras_financeiro e var_solicitacoes já permitem o perfil compras (002_rls.sql).
drop policy if exists var_orc_write on var_orcamentos;
create policy var_orc_write on var_orcamentos for all
  using (eh_gestao() or papel() = 'compras')
  with check (eh_gestao() or papel() = 'compras');

notify pgrst, 'reload schema';
