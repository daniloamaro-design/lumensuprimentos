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

### ⚠️ Ponto a confirmar com o usuário — "fornecedores"
Você disse que fornecedores são os mesmos nos 3. Mas os dados mostram 3 tipos:
- Suprimentos: `suppliers` (fornecedores de produtos)
- Passagens: `fornecedores` / `passagens_fornecedores` (agências/companhias)
- Fretes: `freteiros` (transportadores)
**Pergunta:** é UMA lista só de fornecedores (com um campo "tipo"), ou são listas distintas por
natureza? Provável: uma tabela `suppliers` compartilhada com coluna `tipo`
(produtos|passagens|frete) — assim o financeiro consolidado agrupa por fornecedor de verdade.

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

## Próximos passos da U0
1. Confirmar com o usuário o ponto dos "fornecedores" (lista única com tipo vs. separadas).
2. Fechar o desenho da tela de permissões editáveis.
3. Escrever as migrations SQL das tabelas novas (passagens_*, fretes_*, + colunas modulo/tipo).
4. Então seguir para U1 (migrar Passagens).
