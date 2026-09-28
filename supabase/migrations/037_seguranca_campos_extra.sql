-- Campos extras pedidos pro formulário de Segurança: endereço (separado do
-- nome do local), se vai ter menores de idade, grupo e serviço de quem
-- solicita. "Tipo" (Grupo/Evento/Retiro/Outro) e "é em casa/centro social do
-- Lumen? (Sim/Não)" não precisam de coluna nova — tipo é gravado na própria
-- coluna evento (já existente) e a pergunta Sim/Não só controla, na tela, se
-- o campo casa (já existente) aparece ou fica vazio.
alter table seguranca_solicitacoes add column if not exists endereco text;
alter table seguranca_solicitacoes add column if not exists tem_menores boolean;
alter table seguranca_solicitacoes add column if not exists grupo text;
alter table seguranca_solicitacoes add column if not exists servico text;
