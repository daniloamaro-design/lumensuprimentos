-- Apelidos/nomes alternativos de um fornecedor (ex.: razão social diferente
-- da usada no financeiro, nome de quem atende). Usado pra resolver o
-- fornecedor certo no Saldo Devedor mesmo quando compras_financeiro guarda
-- um texto diferente do nome cadastrado.
alter table suppliers add column if not exists apelidos text[] not null default '{}';
