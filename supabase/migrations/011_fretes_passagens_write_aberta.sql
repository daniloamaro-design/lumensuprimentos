-- ═══════════════════════════════════════════════════════════════════
-- 011_fretes_passagens_write_aberta.sql — corrige RLS: escrita em
-- fretes/passagens_solicitacoes estava restrita a gestão+compras, mas
-- as páginas Novo Frete / Nova Solicitação (Passagens) são abertas a
-- TODOS os perfis por design (_MOD_PAGES, js/18-erp.js) desde a U3.
-- Sem esse ajuste, qualquer outro perfil (estoque, csl, financeiro...)
-- leva 403 "new row violates row-level security policy" ao tentar criar.
-- Alinha a política de escrita com a de leitura (já aberta a todo
-- aprovado): qualquer usuário aprovado, não apenas gestão/compras.
-- ═══════════════════════════════════════════════════════════════════

drop policy if exists fretes_write on fretes;
create policy fretes_write on fretes for all
  using (papel() is not null and papel() <> 'convidado')
  with check (papel() is not null and papel() <> 'convidado');

drop policy if exists pas_sol_write on passagens_solicitacoes;
create policy pas_sol_write on passagens_solicitacoes for all
  using (papel() is not null and papel() <> 'convidado')
  with check (papel() is not null and papel() <> 'convidado');
