-- Formulário de Segurança: sai a pergunta "Qtd. de Seguranças" (decidida
-- depois, na contratação), entra "Quantidade de pessoas no evento/grupo/
-- retiro?" — pergunta nova, coluna própria (qtd_segurancas continua na
-- tabela, só não é mais perguntada no formulário; fica com o default 1).
alter table seguranca_solicitacoes add column if not exists qtd_pessoas integer;
