-- Passagens: dados do passageiro (vindos da planilha de pessoas) e quem pediu a passagem
-- (diferente de "solicitante", que é quem digitou a solicitação no sistema).
alter table public.passagens_solicitacoes add column if not exists cpf text;
alter table public.passagens_solicitacoes add column if not exists rg text;
alter table public.passagens_solicitacoes add column if not exists data_nascimento text;
alter table public.passagens_solicitacoes add column if not exists pessoa_solicitou text;
