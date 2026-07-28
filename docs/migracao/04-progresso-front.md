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
| `js/00-db.js` (novo) | ✅ | Shim: db/auth/firebase + itens normalizados + aliases de campo |
| index.html | ✅ | CDNs Firebase → supabase-js + 00-db.js |
| 01-core | ✅ | Init via shim; `loadDynamicData` lê tabelas consolidadas |
| 02-auth | ✅ | Login ponta a ponta TESTADO |
| all-orders (04) | ✅ | 282 linhas, itens reconstruídos ("7 itens"), 0 erros |
| movement / stock-view / new-order | ✅ | Leitura OK (navegação sem erro) |
| transferencias / fornecedores | ✅ | Leitura OK |
| prices | ✅ | após alias cat→cat_key |
| manage-products (10) | ✅ | 25 produtos, após alias categoria→categoria_key |
| indicadores / metas / financeiro-compras / var-solicitacoes | 🟡 | navegação sem erro; funções profundas a validar |
| **Escrita com itens** | ✅ | round-trip TESTADO: add movimentação → split em movement_items → read reconstrói |
| 06-pedidos (Storage NF/boleto) | ✅ | shim `firebase.storage()` + `verArquivoPedido()` (URL assinada 1h); NF baixa 200/pdf; write de pedido com items map testado |
| 14-gestao (escrita casas/produtos) | ⏳ | escrever nas tabelas consolidadas com `ativo` |
| batches / runTransaction / aprovar_cotacao | ⏳ | ver pendências |

## Conversão snake↔camel: RASA (só nível de topo)
Corrigida para NÃO recursar em valores → campos JSONB (percapitas.values, stockEval,
cotacoes, peopleHistory) mantêm as chaves internas exatamente como o app gravou. Itens de
tabelas-filhas têm conversão própria.

## Aliases de campo já mapeados (shim `ALIAS`, por tabela)
`produtos.categoria→categoria_key` · `prices.cat→cat_key` · `prices_historico.cat→cat_key` ·
`orders.nfFileURL→nf_file_url` · `orders.boletoFileURL→boleto_file_url` · `movements.leituraIA→leitura_ia`.
Regra: campos com sigla (URL/IA) ou renomeados → adicionar em `ALIAS` (chave = nome exato no app).

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
