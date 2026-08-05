-- Corrige a PK de metas para incluir 'modulo', evitando que Passagens/Fretes
-- sobrescrevam uma meta do Suprimentos que use o mesmo cat_key+ano.
-- (fretes_metas continua separada por enquanto — modelo de histórico distinto,
-- fusão fica para quando definirmos o design junto com o usuário.)

alter table metas drop constraint metas_pkey;
alter table metas add primary key (ano, cat_key, modulo);
