# Plano: ERP Lumen unificado (Suprimentos + Passagens + Fretes)

## Contexto e objetivo
Hoje são 3 sistemas separados, cada um em sua pasta e (para Passagens/Fretes) em seu projeto
Firebase próprio. O objetivo é um **ERP único**: um login, um sistema, com os três como módulos,
tudo no mesmo banco (Supabase), e camadas transversais que cruzam os três — **financeiro
consolidado, indicadores gerais, metas, plano de ação e pendências**.

## Descoberta-chave (o que torna isso muito viável)
Os três são a MESMA família técnica (HTML/JS + Firebase + Vercel) — igual o Suprimentos era.
E, melhor ainda, **já compartilham os mesmos conceitos**:

| Conceito comum | Suprimentos | Passagens | Fretes |
|---|---|---|---|
| Financeiro (compras) | ✔ compras_financeiro | ✔ compras_financeiro | ✔ financeiro |
| Fornecedores | ✔ | ✔ | ✔ (freteiros) |
| Casas/unidades | ✔ | ✔ | ✔ |
| Indicadores | ✔ | ✔ | ✔ |
| Metas | ✔ | — | ✔ |
| Usuários/perfis | ✔ | ✔ | ✔ |
| Dashboard | ✔ | ✔ | ✔ |
| IA (Gemini) | ✔ | ✔ | — |

Módulos próprios de cada um:
- **Suprimentos** (já no Supabase): pedidos, estoque, movimentações, produtos, transferências, variedades, kanban.
- **Passagens** (`lumen-passagens`): solicitações, cotações, orçamento, calendário, alimentação/diárias.
- **Fretes** (`lumen-fretes`): fretes, rotas, freteiros, autorizações, importação de histórico.

**Fundação pronta:** o Suprimentos já está migrado para o Supabase e vira a base do ERP.
Já temos as ferramentas de migração (export/transform/load/verify), a camada de compatibilidade
(js/00-db.js) e o método provado.

## Arquitetura-alvo
```
UM app na Vercel (login único) — esqueleto modular (padrão do Suprimentos)
  Sidebar:
    ├─ MÓDULOS:  Suprimentos · Passagens · Fretes
    └─ TRANSVERSAL: Financeiro consolidado · Indicadores gerais · Metas · Plano de ação · Pendências
  ▼
UM banco Supabase (Postgres) — RLS por perfil e por módulo
  ├─ Tabelas COMPARTILHADAS: users, casas, fornecedores, compras_financeiro (com coluna "modulo")
  └─ Tabelas por módulo: (suprimentos) movements/orders… · (passagens) passagens_* · (fretes) fretes_*
```
Decisão central: o **financeiro dos 3 vira uma tabela só** (`compras_financeiro` com uma coluna
`modulo` = suprimentos|passagens|fretes). É isso que destrava o "financeiro consolidado" e os
indicadores gerais sem esforço — um SELECT já cruza tudo.

## Fases (aprovação por fase, como na migração)

### FASE U0 — Descoberta + modelagem unificada (2–3 sessões)
Inventário campo a campo de Passagens e Fretes (como fiz no Suprimentos). Desenhar o schema
unificado: o que é compartilhado (users/casas/fornecedores/financeiro) vs por módulo. Definir o
esqueleto do app único e o modelo de permissões (perfil + acesso por módulo). **Entrega:** mapa de
dados dos 3 + schema unificado + decisões de arquitetura.

### FASE U1 — Migrar Passagens para o Supabase (3–4 sessões)
Firebase→Supabase reusando o toolkit: migrations das tabelas passagens_*, ETL idempotente,
usuários (mesclando com os do Suprimentos — uma pessoa, um login), storage se houver, verificação.

### FASE U2 — Migrar Fretes para o Supabase (3–4 sessões)
Igual à U1, para as tabelas fretes_* (fretes, rotas, freteiros, autorizações).

### FASE U3 — App único (shell) (5–8 sessões)
Unir os três front-ends num sistema só: um login, um menu com os módulos, visual padronizado.
Reaproveitar a divisão modular do Suprimentos como base. Converter Passagens e Fretes para o
supabase-js (a camada de compatibilidade já resolve a maior parte).

### FASE U4 — Camadas transversais (o coração do ERP) (4–6 sessões)
- **Financeiro consolidado**: painel único com o financeiro dos 3 (filtro por módulo/casa/período)
- **Indicadores gerais**: visão gerencial cruzando os três
- **Metas** unificadas
- **Plano de ação e pendências**: novo módulo transversal (tarefas, responsáveis, prazos, status)

### FASE U5 — Validação + viradas (3–5 sessões)
Staging, checklist por perfil, comparação numérica. Virada de Passagens e Fretes (Suprimentos já
está no ar). Recuo de 30 dias para cada.

### FASE U6 — Análises (Looker Studio) (2–3 sessões)
Views SQL consolidadas + relatórios gerenciais do ERP inteiro.

## Esforço honesto
**~22–33 sessões (~2–3 meses em ritmo tranquilo).** É o maior projeto da série, mas com a maior
base a favor (Suprimentos pronto + toolkit + método). Feito em fases, cada uma entrega valor e
nada quebra o que já roda.

## Decisões do usuário (2026-07-30) — FECHADAS
1. **Onde mora:** o projeto do **Suprimentos vira O ERP** — Passagens e Fretes entram nele.
   Sem repo novo; evoluímos o repo/deploy atual (lumen-suprimentos).
2. **Casas e Fornecedores são os MESMOS nos 3** → **tabelas compartilhadas únicas**
   (`houses`, `suppliers` já existentes). Na migração, os cadastros de Passagens/Fretes são
   mesclados por nome (dedup); os três módulos passam a apontar para a mesma lista.
3. **Acesso:** por padrão o mesmo nos 3 módulos, MAS o ERP terá uma **TELA DE GESTÃO DE
   PERMISSÕES** (admin) onde se define, por perfil, o que cada um enxerga/navega. Ou seja:
   a matriz de permissões deixa de ser fixa no código e passa a ser **editável no próprio ERP**
   (guardada no banco). Isso é um recurso novo a construir (evolui o modelo de 11 perfis atual).

## Impacto dessas decisões no plano
- **FASE U0** ganha: desenho da tabela de **permissões editáveis** (perfil × módulo × página/ação)
  + a tela de administração dela.
- **U1/U2** (migração): mesclar `users`, `houses`, `suppliers` dos 3 nas tabelas já existentes,
  deduplicando por nome/email; dados de Passagens/Fretes referenciam esses cadastros compartilhados.
- **U3** (app único): o menu lateral passa a ser montado dinamicamente a partir das permissões do
  perfil (o que ele pode ver), não mais fixo.

## Estado atual
Suprimentos: ✅ em produção no Supabase. Este plano começa AGORA em paralelo, pela FASE U0
(descoberta + modelagem), sem tocar nos sistemas que estão rodando.
