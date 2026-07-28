# FASE 4 — Progresso da conversão do front (Firebase → Supabase)

Branch: `migracao-supabase`. Produção (main) intocada. Checker verde a cada passo.

## Arquitetura escolhida: camada de compatibilidade (`js/00-db.js`)
Em vez de reescrever centenas de chamadas `db.collection(...)` nos 24 módulos, `00-db.js`
EMULA a API do Firebase sobre o Supabase. Assim os módulos mudam pouquíssimo. O que o shim faz:
- `db.collection(x).where().orderBy().limit().get()/.add()`; `.doc(id).get()/.set()/.update()/.delete()`
- `.onSnapshot()` → polling leve de 30s (retorna função de cancelamento)
- `auth.*` completo (login, registro, reset, anônimo, signOut, onAuthStateChanged, currentUser)
- `firebase.firestore.FieldValue.serverTimestamp()` → data ISO
- Conversão automática **snake_case ↔ camelCase** dos campos
- Datas timestamptz (ISO) viram objeto String com `.toDate()` → funcionam como texto E como
  Timestamp do Firestore
- Tradução de erros do Supabase para códigos estilo `auth/...` (p/ `friendlyAuthError`)
- Mapa de nomes p/ coleções renomeadas simples (categorias_config→categorias, etc.)

## Status por módulo
| Módulo | Status | Observação |
|---|---|---|
| `js/00-db.js` (novo) | ✅ | Camada de compatibilidade |
| index.html | ✅ | CDNs Firebase → supabase-js + 00-db.js |
| 01-core | ✅ | Init via shim; `loadDynamicData` lê tabelas consolidadas (houses/cidades/produtos/categorias) |
| 02-auth | ✅ | Funciona sem alteração (via shim) — login ponta a ponta TESTADO |
| 03-navegacao | ⏳ | |
| 04-percapita | 🟡 | dashboard testado OK; resto do módulo a validar |
| 05-cadastros | ⏳ | |
| 06-pedidos | ⏳ | precisa: normalização de `order.items` (map) + Storage (NF/boleto via signed URL) |
| 07-estoque-ia-form | ⏳ | precisa: normalização de `movement.items` (array) |
| 08–17, periféricos | ⏳ | |

## Pontos de conversão já identificados (a resolver por módulo)
1. **Itens normalizados**: `movements.items` (array) e `orders.items` (map {cat:{prod:qty}}) foram
   normalizados em `movement_items`/`order_items`. O shim precisa, para essas coleções, reconstruir
   `items` na leitura e desmembrar na escrita. → implementar readTransform/writeTransform por coleção.
2. **Storage** (06-pedidos): `firebase.storage()` → shim para `_sb.storage`; download via signed URL
   (os caminhos já estão em `nf_file_url`/`boleto_file_url`).
3. **Coleções consolidadas em escrita** (14-gestao: gerenciar casas/cidades/produtos/categorias) →
   escrever nas tabelas houses/cidades/produtos/categorias com coluna `ativo`.
4. **Batches** (`db.batch()`, 22 usos) → o shim ainda não emula batch; converter caso a caso
   (várias escritas sequenciais ou RPC).
5. **runTransaction** (variedades, contador) → usar a função SQL `proximo_codigo_var()`.
6. **`aprovar_cotacao`**: trocar os 2 updates do cliente pela RPC transacional.

## Teste de fumaça (2026-07-28)
Usuário de teste `teste-login@lumen.local` (admin) criado no Supabase. Login pela UI →
showApp → loadDynamicData (20 casas, 6 cidades, 8 categorias, 25 produtos cereal) →
dashboard com KPIs, **0 erros no console**. Remover esse usuário de teste na virada (FASE 6).

## Próximos passos
Converter em ordem: 05-cadastros → 06-pedidos (items+storage) → 07 (items) → 11 → variedades/
melhorias → 09/10/08 → 12/15/17 → resto do 04 → 13/16 → 14 → periféricos → 03/paginas-html.
Ao final: remover restos do Firebase, rodar checker, smoke test completo por perfil.
