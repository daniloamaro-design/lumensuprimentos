-- ═══════════════════════════════════════════════════════════════════
-- 007_role_permissions.sql — ERP U4: permissões editáveis (perfil × página).
-- Uma linha por perfil, com a lista de páginas que ele pode acessar.
-- O perfil 'admin' NÃO é armazenado: tem acesso total garantido no código
-- (salvaguarda para nunca travar o administrador). Os demais perfis são
-- editáveis na tela "Permissões" do ERP (somente admin edita).
-- ═══════════════════════════════════════════════════════════════════

create table if not exists role_permissions (
  role           text primary key,
  pages          jsonb not null default '[]'::jsonb,
  atualizado_por text,
  atualizado_em  timestamptz not null default now()
);

alter table role_permissions enable row level security;

-- Leitura: qualquer usuário autenticado aprovado (o app carrega no login).
drop policy if exists role_permissions_select on role_permissions;
create policy role_permissions_select on role_permissions for select
  using (papel() is not null and papel() <> 'convidado');

-- Escrita: somente admin (a tela de gestão é restrita ao admin).
drop policy if exists role_permissions_write on role_permissions;
create policy role_permissions_write on role_permissions for all
  using (papel() = 'admin') with check (papel() = 'admin');
