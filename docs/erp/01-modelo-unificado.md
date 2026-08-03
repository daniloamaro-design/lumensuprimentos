# FASE U0 — Modelo de dados unificado do ERP

Desenho de como os 3 sistemas viram UM banco Supabase. Baseado no inventário das coleções
reais de cada projeto Firebase.

## Coleções de origem (por sistema)

**Suprimentos** (já no Supabase, ~25 tabelas): movements, orders, quotations, transferencias,
compras_financeiro, prices, percapitas, houses, suppliers, produtos, categorias, centros_custo,
metas, ajustes, var_* (variedades), kanban_tasks, cardapio_planos, users, audit_logs.

**Passagens** (`lumen-passagens`): passagens_solicitacoes, passagens_cotacoes,
passagens_fornecedores, passagens_fornecedor_transacoes, passagens_counters, passagens_log,
compras_financeiro, alimentacao_diarias, fornecedores, configuracoes, users.

**Fretes** (`lumen-fretes`): fretes, freteiros, casas_lumen, fretes_metas, fretes_acertos,
fretes_import_log, fretes_users, fretes_counters.

## Schema unificado

### 🔗 Tabelas COMPARTILHADAS (uma só para os 3 módulos)
- **users** — já existe. Mesclar os users de Passagens e fretes_users por e-mail (uma pessoa,
  um login). Ganha o modelo de permissões editável (abaixo).
- **houses** — já existe. Mesclar `casas_lumen` (Fretes) e as casas de Passagens por nome.
- **compras_financeiro** — já existe. Adicionar coluna **`modulo`** (suprimentos|passagens|fretes).
  Recebe o financeiro dos 3 → **é o que destrava o "financeiro consolidado"**. O
  `fretes_acertos` (acertos com freteiros) entra aqui como lançamentos do módulo fretes.
- **metas** — já existe. Adicionar `modulo`; recebe `fretes_metas`.
- **audit_logs** — já existe. Recebe os logs dos 3 (passagens_log etc.) com `modulo`.

### 📦 Tabelas por MÓDULO
- **Suprimentos:** (as ~25 já existentes) movements, orders, quotations, produtos, variedades…
- **Passagens:** `passagens_solicitacoes`, `passagens_cotacoes`, `passagens_fornecedores`,
  `passagens_fornecedor_transacoes`, `alimentacao_diarias`. (+ counters → sequence)
- **Fretes:** `fretes`, `rotas`, `freteiros`, `fretes_acertos` (ou consolidar no financeiro),
  `fretes_import_log`. (+ counters → sequence)

### Fornecedores — DECIDIDO (opção A, tipos múltiplos)
UMA tabela `suppliers` compartilhada, com coluna **`tipos text[]`** (multi-seleção):
`produtos` | `passagens` | `frete`. Um fornecedor pode ter 2+ tipos (ex.: ['produtos','frete']).
Na migração, mesclar por nome/CNPJ os fornecedores dos 3 e marcar os tipos correspondentes;
os `freteiros` (Fretes) e `passagens_fornecedores` (Passagens) entram como suppliers com o
tipo respectivo. O cadastro de fornecedor no ERP terá seleção múltipla de tipos.
(A tabela suppliers já tem `categorias text[]`; adiciona-se `tipos text[]`.)

### 🔐 Permissões editáveis (recurso novo pedido pelo usuário)
Hoje a matriz perfil→páginas é fixa no código. No ERP vira dados editáveis:
- **roles** (id, nome) — os perfis (admin, compras, estoque, financeiro, …)
- **role_permissions** (role, modulo, pagina, pode_ver, pode_editar) — o que cada perfil acessa
- Tela de admin "Gestão de Permissões" para editar isso no próprio ERP
- O menu lateral é montado dinamicamente a partir dessas permissões
- `users.role` aponta para `roles`

### Sequences (substituem os *_counters)
`passagens_counters` e `fretes_counters` → sequences Postgres + funções (como já fizemos com
`var_codigo_seq` no Suprimentos).

## O que a migração de cada módulo vai reusar
Todo o toolkit do Suprimentos: `tools/migracao/` (export/transform/load/verify), a camada de
compatibilidade `js/00-db.js` (com paginação, batch, transforms, aliases, PKs naturais). Para
cada módulo novo: gerar migrations das tabelas, ETL, mesclar users/houses/suppliers.

## Insumos que o usuário precisará fornecer (U1/U2)
- **Chave de conta de serviço** dos projetos Firebase `lumen-passagens` e `lumen-fretes`
  (Firebase Console → Configurações → Contas de serviço → Gerar nova chave), como foi feito no
  Suprimentos. Sem isso não dá para exportar os dados deles.
- **Password hash parameters** de cada projeto (para preservar as senhas dos usuários), OU
  aceitar reset de senha para os usuários exclusivos de Passagens/Fretes.

## Inventário real (2026-07-30, via chaves de serviço)
**Passagens (854 docs):** compras_financeiro **830** · passagens_fornecedores 12 · users 6 ·
passagens_solicitacoes 4 · configuracoes 1 · counters 1. (cotacoes/log/alimentacao/fornecedores = 0)
→ **Passagens é, na prática, um sistema FINANCEIRO** (830 lançamentos); o fluxo de solicitações
é pouco usado (4). O grosso vai para o `compras_financeiro` unificado (modulo=passagens).

**Fretes (759 docs):** fretes **435** · fretes_counters 271 · casas_lumen 21 · fretes_metas 18 ·
freteiros 10 · fretes_users 3 · import_log 1. (rotas/acertos = 0)
→ Núcleo são os 435 fretes + metas. `fretes_counters` (271) investigar na U1/U2 (vira sequence).

**Volumes pequenos** (854 + 759) → migrações rápidas. Chaves de serviço dos 2 projetos
validadas e funcionando (FIREBASE_SA_PASSAGENS / FIREBASE_SA_FRETES no .env).

**Financeiro consolidado (a grande motivação):** Suprimentos 1.493 + Passagens 830 = ~2.323
lançamentos financeiros já ficam numa tabela só → relatórios cruzados imediatos.

**Cadastros a mesclar:** users (Sup 11 + Pas 6 + Fre 3, por email) · casas (Sup 20 + Fre 21, por
nome) · fornecedores (Sup 16 + Pas 12 + Fre 10, com tipos[]).

## Próximos passos da U0
1. Confirmar com o usuário o ponto dos "fornecedores" (lista única com tipo vs. separadas).
2. Fechar o desenho da tela de permissões editáveis.
3. Escrever as migrations SQL das tabelas novas (passagens_*, fretes_*, + colunas modulo/tipo).
4. Então seguir para U1 (migrar Passagens).
