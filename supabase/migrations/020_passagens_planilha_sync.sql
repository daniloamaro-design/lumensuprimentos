-- ═══════════════════════════════════════════════════════════════════
-- 020_passagens_planilha_sync.sql
-- Suporte à sincronização (leitura) da planilha Google Sheets "Controle
-- das passagens" → passagens_solicitacoes. Fase 1: só leitura (planilha
-- manda); cada linha importada é rastreada por uma chave composta pra
-- evitar duplicar em reruns. Ver tools/passagens/sync-planilha.mjs.
-- ═══════════════════════════════════════════════════════════════════

alter table passagens_solicitacoes add column if not exists planilha_chave text;
alter table passagens_solicitacoes add column if not exists planilha_aba text;
alter table passagens_solicitacoes add column if not exists origem_planilha boolean not null default false;

-- Só uma linha por chave entre as importadas da planilha (linhas criadas
-- pelo próprio sistema, sem origem_planilha, não entram nessa restrição).
create unique index if not exists passagens_sol_planilha_chave_idx
  on passagens_solicitacoes(planilha_chave) where origem_planilha;
