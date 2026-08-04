# FASE U3 — App único (juntar as 3 telas num ERP só)

Trabalho na branch `erp-app-unico` (produção `main` intocada). Os DADOS dos 3 já estão no
Supabase (U1/U2). Falta a INTERFACE: um login, um menu com os módulos.

## Base que já temos
- Suprimentos = o ERP (modular: js/00-db.js + 01–17), já no Supabase, sidebar com seções.
- Passagens e Fretes: dados no banco; UIs antigas são monólitos separados (~6.500 linhas cada).

## A decisão estratégica (fork de esforço)
Como trazer Passagens e Fretes para dentro do ERP:

- **(A) Portar as UIs antigas** inteiras para dentro do ERP (injetar HTML + converter JS p/
  supabase-js). Mais rápido de "ligar", mas re-importa o código monolítico e visual diferente.
- **(B) Reconstruir módulos enxutos e nativos** no padrão do ERP (telas limpas lendo as tabelas
  já migradas). Mais trabalho, resultado consistente e manutenível. Recomendado.
- **(C) Híbrido por uso real:** Fretes (435 fretes, ativo) ganha módulo nativo completo (B);
  Passagens (só 4 solicitações; é essencialmente financeiro, já consolidado) entra enxuto —
  talvez só as solicitações + cair no financeiro consolidado. **Recomendado pelo custo/benefício.**

## Arquitetura do shell (independe da opção)
- **Menu por módulos:** grupos Suprimentos · Passagens · Fretes + Transversal (Financeiro
  consolidado, Indicadores gerais, Plano de ação, Pendências — estes na U4).
- **Menu montado dinamicamente** a partir das permissões do perfil (prepara a U4). Por ora,
  seções por módulo com visibilidade por perfil.
- Login e cabeçalho únicos (já existem no Suprimentos).

## Passos previstos
1. Shell: reorganizar a sidebar em módulos (Suprimentos já vira um grupo) + preparar seções
   Passagens/Fretes. (não quebra nada — só agrupa)
2. Módulo Fretes nativo: páginas (lista de fretes, novo frete, freteiros, metas do frete) lendo
   as tabelas `fretes`/`fretes_metas`/`suppliers(tipo frete)`.
3. Módulo Passagens enxuto: solicitações (tabela passagens_solicitacoes) + atalho p/ financeiro.
4. Fornecedores: cadastro passa a ter seleção de tipos[] (produtos/passagens/frete).
5. Testes no preview + merge na main (produção) com Ctrl+F5 para a equipe.

## Decisão pendente do usuário
Qual opção (A / B / C) para trazer Passagens e Fretes? Recomendo **C** (Fretes completo nativo,
Passagens enxuto), pelo uso real de cada um.
