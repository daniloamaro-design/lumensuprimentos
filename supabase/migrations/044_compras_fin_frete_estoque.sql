-- Perfil "estoque" cria fretes (módulo Fretes) mas não podia gravar o lançamento
-- correspondente no Financeiro: o INSERT era barrado pela RLS e o erro passava
-- em silêncio (18 de 46 fretes dele desde ago/2026 ficaram sem lançamento).
-- Libera SÓ a criação (INSERT) de lançamento de frete para esse perfil.
drop policy if exists compras_fin_frete_estoque on public.compras_financeiro;
create policy compras_fin_frete_estoque on public.compras_financeiro
  for insert
  with check (papel() = 'estoque' and modulo = 'frete');
