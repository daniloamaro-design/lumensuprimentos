-- ═══════════════════════════════════════════════════════════════════
-- 019_transferencias_manual_fields.sql
-- A tela "Nova Transferência" (confirmarTransferencia em
-- js/09-indicadores-transf.js) grava dateStr, obs, registradoPor e
-- registradoPorUid, mas a tabela só tinha as colunas usadas pelo fluxo
-- automático (gerado em js/06-pedidos.js). Todo INSERT manual vinha
-- falhando no PostgREST por coluna inexistente — adiciona as colunas
-- que faltam, seguindo a mesma nomenclatura já usada em movements
-- (date_str, obs) e ajustada ao nome de campo que o próprio módulo já
-- lê de volta (registrado_por / registrado_por_uid).
-- ═══════════════════════════════════════════════════════════════════

alter table transferencias add column if not exists date_str            text;
alter table transferencias add column if not exists obs                 text;
alter table transferencias add column if not exists registrado_por      text;
alter table transferencias add column if not exists registrado_por_uid  text;

create index if not exists transferencias_date_str_idx on transferencias(date_str);
