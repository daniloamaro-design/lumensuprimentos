# FASE 3 — Resultado: ETL Firestore → Supabase

Executado em 2026-07-28. **Verificação 100% (25 tabelas + 3 somas de controle).**

## Números
- **3.741 documentos** exportados do Firestore (via chave de serviço, firebase-admin).
- **3.689 upserts** carregados no Postgres + **6.721 itens** de movimentação normalizados.
- Somas de controle idênticas Firestore × Postgres:
  - compras_financeiro Σ valor = **R$ 1.595.948,80**
  - quotations Σ valor = **R$ 282.126,67**
  - movement_items válidos = **6.721**

## Ajustes de mapeamento descobertos com dados reais (todos corrigidos)
1. **created_at nulo** em alguns docs → o carregador passou a OMITIR campos nulos, deixando
   o banco aplicar o DEFAULT (`now()`), em vez de violar NOT NULL.
2. **Cidades ausentes** → semeamos `cidades` a partir de TODAS as cidades usadas pelas casas
   antes de inserir `houses` (evita quebra de FK).
3. **Categorias base** (cereal/higiene/proteina/missa_sf/lanches_csl) vivem no código, não em
   `categorias_config` → semeadas explicitamente + qualquer categoria referenciada por produto.
4. **Itens malformados** (sem catKey/prodId) → pulados de propósito (17 itens-lixo).
5. **Status legado `comprada`** em var_solicitacoes (2 docs) → adicionado ao CHECK (preserva
   o dado original em vez de remapear às cegas).

## Diferenças intencionais (não são perda)
- `categorias`: tabela consolidada tem 8 (5 base + config + referenciadas) vs 4 em
  `categorias_config` — por design.
- `movement_items`: 6.721 (válidos) vs 6.738 no bruto — 17 itens malformados descartados.

## Limpeza pós-teste
Removidos do banco os 11 usuários de teste (FASE 2) e 1 movimentação de diagnóstico de RLS,
para que a verificação reflita só dados reais. (Reexecutar `03-seed-teste.mjs` recria os de
teste quando necessário — mas idealmente a FASE 5 usa os usuários REAIS migrados.)

## Idempotência confirmada
O carregador roda com UPSERT (ON CONFLICT). Rodou 6 vezes durante os ajustes, sem duplicar —
requisito para o sync final da virada (FASE 6).

## Ainda pendente na FASE 3
- **Import de usuários com senha (scrypt)** — os 6 usuários reais estão como PERFIL na tabela
  `users`, mas ainda SEM conta de login no Supabase Auth (com senha preservada). Próximo passo:
  exportar o Firebase Auth (`firebase auth:export`) + hash params e importar no GoTrue. Se o
  scrypt não importar, plano B = reset de senha para os 6 (indolor).
- **Cópia dos arquivos do Storage** (NF/boleto, 34 MB) → download do Firebase, upload no bucket
  `pedidos`, reescrever `nf_file_url`/`boleto_file_url`.

## Reproduzir
```
node tools/migracao/10-export.mjs        # exporta 37 coleções → data/*.ndjson
node tools/migracao/11-transform-load.mjs # carrega no Postgres (idempotente)
node tools/migracao/12-verificar.mjs     # confere contagens + somas
```
