-- Corrige RLS de var_solicitacoes: convidado (usuário sem login, ex.:
-- Nova Solicitação de Variedades pública) conseguia INSERIR (var_sol_insert
-- permite), mas a policy de SELECT excluía explicitamente 'convidado'
-- inteiro. O client (supabase-js) grava via upsert(), que por padrão pede
-- a linha de volta (Prefer: return=representation) -- e como o SELECT da
-- linha recém-criada falhava pra 'convidado', o Postgres reporta isso como
-- "new row violates row-level security policy" no próprio insert, mesmo
-- var_sol_insert.with_check passando.
--
-- Fix: convidado pode ver as PRÓPRIAS solicitações (solicitante_uid = seu
-- uid), mas continua sem ver as dos outros. Mesmo padrão já usado em
-- 027_orders_write_requester.sql para orders/order_items.

drop policy if exists var_sol_select on var_solicitacoes;
create policy var_sol_select on var_solicitacoes for select
  using (
    (papel() is not null and papel() <> 'convidado')
    or (papel() = 'convidado' and solicitante_uid = auth.uid()::text)
  );
