-- ═══════════════════════════════════════════════════════════════════
-- 012_leitura_metas_financeiro_aberta.sql — abre a LEITURA de metas e
-- compras_financeiro pra qualquer usuário aprovado (mesma classe de bug
-- da migration 011: o Dashboard da Diretoria — página aberta a todos os
-- perfis por design — precisa ler essas duas tabelas para o indicador
-- "Desvio Orçamentário de Passagens" (orçamento em metas, gasto real em
-- compras_financeiro), mas a leitura estava restrita a
-- gestão/compras/financeiro. A ESCRITA continua restrita como estava
-- (só gestão define orçamento; só gestão/compras/financeiro lançam
-- financeiro) — só a leitura fica aberta.
-- ═══════════════════════════════════════════════════════════════════

drop policy if exists metas_all on metas;
create policy metas_select on metas for select
  using (papel() is not null and papel() <> 'convidado');
create policy metas_write on metas for insert with check (eh_gestao());
create policy metas_update on metas for update using (eh_gestao()) with check (eh_gestao());
create policy metas_delete on metas for delete using (eh_gestao());

drop policy if exists compras_fin_select on compras_financeiro;
create policy compras_fin_select on compras_financeiro for select
  using (papel() is not null and papel() <> 'convidado');
