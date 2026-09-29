-- Feature "Contatos do Fornecedor" (aba dentro do modal de fornecedor,
-- js/10-produtos-orcamento.js) usava db.collection('suppliers').doc(id)
-- .collection('contatos') — subcoleção do Firestore, que o shim de
-- compatibilidade (js/00-db.js) nunca suportou (docRef() não tem método
-- .collection()). 100% quebrado: toda tentativa de registrar um contato
-- dava TypeError, nada era salvo, silenciosamente pro usuário (só via
-- toast de erro genérico).
--
-- Fix: mesma solução já usada pra outras "subcoleções" do Firestore
-- (movement_items, transferencia_items, order_items) — vira tabela própria
-- com FK, em vez de aninhada.
create table if not exists suppliers_contatos (
  id             text primary key default (gen_random_uuid()::text),
  fornecedor_id  text not null references suppliers(id) on delete cascade,
  data           date,
  canal          text,
  obs            text,
  registrado_por text,
  criado_em      timestamptz not null default now()
);
create index if not exists suppliers_contatos_forn_idx on suppliers_contatos(fornecedor_id);

alter table suppliers_contatos enable row level security;
create policy suppliers_contatos_select on suppliers_contatos for select
  using (eh_gestao() or papel() in ('compras','estoque','financeiro'));
create policy suppliers_contatos_write on suppliers_contatos for all
  using (eh_gestao() or papel() = 'compras')
  with check (eh_gestao() or papel() = 'compras');

-- "Último contato" exibido no card do fornecedor (também nunca existiu
-- como coluna real — a escrita em suppliers.update({ultimoContato:...})
-- também sempre falhou, junto com a subcoleção).
alter table suppliers add column if not exists ultimo_contato jsonb;
