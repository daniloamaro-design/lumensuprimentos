-- A tabela `inventarios` (Contagem de Inventário) foi criada fora do fluxo
-- normal de migrations, com colunas em minúsculo sem underscore
-- (createdat, totalitens, itensok, codigosmovimento) em vez do padrão
-- snake_case do resto do schema. O conversor genérico camelCase→snake_case
-- de js/00-db.js espera `created_at`, não `createdat` — dava 400
-- "Could not find the 'created_at' column" ao enviar um inventário pra
-- aprovação. Faltavam também solicitante_uid/solicitante_nome, e os campos
-- que aprovarInventario()/recusarInventario() (js/04-percapita.js) realmente
-- gravam (resolvidoAt/resolvidoPor) não tinham coluna nenhuma — só existia
-- updatedat/updatedby, que o código nunca usa pra essa tabela.
alter table inventarios rename column createdat to created_at;
alter table inventarios rename column totalitens to total_itens;
alter table inventarios rename column itensok to itens_ok;
alter table inventarios rename column codigosmovimento to codigos_movimento;
alter table inventarios drop column if exists updatedat;
alter table inventarios drop column if exists updatedby;
alter table inventarios add column if not exists solicitante_uid text;
alter table inventarios add column if not exists solicitante_nome text;
alter table inventarios add column if not exists resolvido_at timestamptz;
alter table inventarios add column if not exists resolvido_por text;
