-- js/variedades.js (salvarVarSolicitacao) sempre grava grupoId/grupoTotal em
-- toda solicitação (grupoId = null quando é item único, ou um id comum
-- quando vários itens são enviados juntos no mesmo lote) — mas a tabela
-- nunca teve essas colunas. Isso quebrava com 400 (PostgREST: coluna
-- inexistente) TODA solicitação de Variedades, não só as em lote.
alter table var_solicitacoes add column if not exists grupo_id text;
alter table var_solicitacoes add column if not exists grupo_total integer;

create index if not exists var_solicitacoes_grupo_id_idx on var_solicitacoes(grupo_id);
