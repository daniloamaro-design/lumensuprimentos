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

## Arquivos do Storage — CONCLUÍDO ✅
320 arquivos (NF/boleto, 34 MB) copiados do Firebase Storage para o bucket `pedidos` do
Supabase (`13-storage-copy.mjs`), com nomes higienizados (Supabase rejeita acentos/`$`/espaços),
links `nf_file_url`/`boleto_file_url` religados e órfãos limpos. Verificado: signed URL baixa o
PDF (HTTP 200), 0 pedidos ainda apontando para o Firebase.

## Import de usuários com senha (scrypt) — CONCLUÍDO ✅
**As senhas foram PRESERVADAS** — ninguém precisa trocar de senha.
- **Mecanismo provado** (`14-teste-scrypt.mjs`): usuário fictício com hash no esquema Firebase
  logou com a senha correta e rejeitou a errada. Obstáculos resolvidos: (a) formato exato do
  GoTrue `$fbscrypt$v=1,n=<memCost>,r=<rounds>,p=1,ss=<saltSep>,sk=<signerKey>$<salt>$<hash>`
  (obtido do código-fonte do supabase/auth); (b) colunas de token de `auth.users`
  (confirmation_token etc.) precisam ser `''`, não NULL, senão o GoTrue dá erro 500.
- **Parâmetros de hash** obtidos programaticamente via conta de serviço (Identity Toolkit
  admin config) — o usuário não precisou colar segredos (`hashconfig.mjs`).
- **Import real** (`15-usuarios-auth.mjs`): 11 contas com senha importadas, 3 anônimas ignoradas.
  Como `auth.users.id` é UUID e o Firebase usa id de texto, geramos UUID v5 determinístico do
  uid e reescrevemos `users.id` + 1.259 referências `*_uid` (movements/orders/ajustes/variedades/
  audit). 5 contas antigas sem perfil ganharam perfil `pending` (logam, acesso de convidado até
  aprovação). Verificado: 0 perfis sem login, 0 uid no formato antigo, papéis corretos.

**Verificação final: `12-verificar.mjs` = tudo confere** (users banco=11 = 6 do Firestore + 5
pendentes criados; diferença intencional).

### Único ponto que só o usuário confirma
A prova de senha usou um hash gerado por `firebase-scrypt` (emulação fiel do Firebase). A
confirmação 100% end-to-end é um usuário REAL logar com a senha real no staging (FASE 5) —
altíssima confiança de que funciona, mas essa é a validação final.

## Reproduzir
```
node tools/migracao/10-export.mjs        # exporta 37 coleções → data/*.ndjson
node tools/migracao/11-transform-load.mjs # carrega no Postgres (idempotente)
node tools/migracao/12-verificar.mjs     # confere contagens + somas
```
