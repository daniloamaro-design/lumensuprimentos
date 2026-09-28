-- Mesma causa do bug corrigido na migration 028 (var_solicitacoes), agora em
-- movements: convidado (modo "Entrada/Saída sem login") pode INSERIR
-- (movements_insert já permite), mas a policy de SELECT excluía 'convidado'
-- inteiro. O client grava via .add()/.insert(), que sempre pede a linha de
-- volta (select(pk).single() em js/00-db.js) — como o SELECT falha pra
-- 'convidado', o Postgres derruba o INSERT inteiro com erro (mesmo a linha
-- já tendo sido gravada antes do RETURNING falhar), e o usuário convidado vê
-- "Erro ao registrar" em toda movimentação, mesmo quando ela é salva.
--
-- Fix: convidado pode ver as PRÓPRIAS movimentações (registered_uid = seu
-- uid), continua sem ver as dos outros.
drop policy if exists movements_select on movements;
create policy movements_select on movements for select
  using (
    eh_gestao() or papel() in ('compras','estoque','csl','coord_csl')
    or (papel() = 'convidado' and registered_uid = auth.uid()::text)
  );
