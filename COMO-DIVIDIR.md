# Guia Completo: Como Dividir o index.html em Arquivos Menores

## Por que dividir?

O `index.html` tem 12.742 linhas de código. Isso dificulta encontrar e corrigir qualquer coisa.
Dividindo em arquivos menores, cada arquivo tem um tema claro — você abre só o que precisa.

---

## Estrutura final de arquivos recomendada

```
lumen-estoque/
│
├── index.html               ← HTML + CSS (fica com ~4.000 linhas)
│
├── config.js                ← 🔑 CHAVES E CONFIGURAÇÕES (NOVO — já pronto)
├── lumen-auth.js            ← 🔐 Login, logout, registro (NOVO — já pronto)
├── lumen-ia.js              ← 🤖 Toda a IA (Gemini) (NOVO — já pronto)
├── lumen-rbac.js            ← 👑 Perfis e permissões (já entregue antes)
├── lumen-bi.js              ← 📊 Relatórios BI (já entregue antes)
│
├── js/
│   ├── lumen-pedidos.js     ← 📋 new-order, all-orders, my-orders
│   ├── lumen-estoque.js     ← 📦 movement, stock-view, transferencias
│   ├── lumen-financeiro.js  ← 💰 orcamento, financeiro-compras, pagamentos
│   ├── lumen-fornecedores.js← 🏭 suppliers, quotations, ind-fornecedores
│   ├── lumen-casas.js       ← 🏠 houses, manage-houses, percapita
│   ├── lumen-relatorios.js  ← 📈 indicadores, comparativo, calc-real, previsao
│   └── lumen-admin.js       ← ⚙️ users, manage-products, manage-cats
│
└── firestore.rules          ← 🛡️ Regras de segurança (já entregue)
```

---

## Passo a passo: Como fazer a divisão

### ETAPA 1 — Adicionar os scripts novos no index.html (JÁ FEITO)

Você já recebeu `config.js`, `lumen-auth.js` e `lumen-ia.js`.
No seu `index.html`, encontre a linha com `</body>` e substitua o bloco de scripts assim:

```html
<!-- ══ CONFIGURAÇÕES (deve ser o PRIMEIRO script) ══ -->
<script src="config.js"></script>

<!-- ══ MÓDULOS NOVOS (segurança + IA) ══ -->
<script src="lumen-auth.js"></script>
<script src="lumen-ia.js"></script>
<script src="lumen-rbac.js"></script>
<script src="lumen-bi.js"></script>

<!-- ══ SEU CÓDIGO ORIGINAL (o bloco <script> grande) ══ -->
<script>
  // ... (todo o código que já estava aqui)
</script>
```

**Importante:** `config.js` deve sempre ser o PRIMEIRO a carregar.

---

### ETAPA 2 — Remover do index.html o que foi para os arquivos novos

Agora que você tem `lumen-auth.js` e `lumen-ia.js`, remova do `index.html` as seções correspondentes.

#### O que remover do `<script>` do index.html:

**Substituído por config.js — REMOVA estas linhas do index.html:**
```js
const FIREBASE_CONFIG = { ... };          // linhas ~3730-3738
const EMAILJS_SERVICE_ID  = "...";        // linha ~3740
const EMAILJS_TEMPLATE_ID = "...";        // linha ~3741
const EMAILJS_PUBLIC_KEY  = "...";        // linha ~3742
const GEMINI_API_KEY = "...";             // linha ~3745
const GEMINI_URL = `...`;                 // linha ~3746
const ADMIN_EMAIL = "...";               // linha ~3749
firebase.initializeApp(FIREBASE_CONFIG); // linha ~4001
emailjs.init(EMAILJS_PUBLIC_KEY);        // linha ~4006
```
*(O `firebase.initializeApp` e o `emailjs.init` agora estão no config.js)*

**Substituído por lumen-auth.js — REMOVA estas funções do index.html:**
```js
auth.onAuthStateChanged(...)  // linhas ~4079-4104
showForm()                    // linhas ~4109-4113
showAuthScreen()              // linhas ~4115-4119
doLogin()                     // linhas ~4121-4133
doRegister()                  // linhas ~4135-4162
friendlyAuthError()           // linhas ~4164-4174
```

**Substituído por lumen-ia.js — REMOVA estas funções do index.html:**
```js
// Seção "LEITURA DE FORMULÁRIO COM IA (GEMINI)" — linhas ~6550-6902
const NOME_PARA_ID = {}       // linhas ~6553-6562
normalizeName()               // linhas ~6564-6567
findProduct()                 // linhas ~6569-6579
onPhotoSelected()             // linhas ~6581-6585
readFormWithAI()              // linhas ~6587-6748

// Seção "AGENTE IA — PREVISÃO DE DEMANDA" — linhas ~12112-12335
callAIPrevisao()              // linhas ~12289-12335

// Seção "AGENTE IA — MELHOR FORNECEDOR" — linhas ~12355-12459
toggleAIFornCard()            // linhas ~12358-12368
runAIFornecedor()             // linhas ~12370-12459

// Seção "AGENTE IA — PADRÃO CRÍTICO" — linhas ~12462-12530
detectarPadraoCritico()       // linhas ~12465-12530
```

---

### ETAPA 3 — Divisão avançada (opcional, quando quiser)

Quando o sistema estiver estável com os arquivos novos, você pode fazer a divisão
avançada do código restante. Faça **um arquivo por vez**, testando sempre no navegador.

#### Como fazer cada arquivo:

1. Abra o `index.html` no editor
2. Encontre o bloco de funções listado abaixo
3. Recorte (Ctrl+X) e cole em um novo arquivo `.js`
4. Adicione `<script src="js/lumen-xxx.js"></script>` no `index.html`
5. Abra o sistema no navegador e teste se tudo funciona
6. Só aí passe para o próximo

---

#### Arquivo: `js/lumen-pedidos.js`
**Linhas aproximadas: 5.011–5.597**
**Funções:**
- `renderOrderProducts()`
- `onOrderHouseChange()`
- `submitOrder()`
- `loadAllOrders()`
- `showOrderDetail()`
- `updateOrderStatus()`
- `loadMyOrders()`
- `makeOrderPDF()`

---

#### Arquivo: `js/lumen-estoque.js`
**Linhas aproximadas: 6.904–7.654 + 7.997–8.304**
**Funções:**
- `setMovCat()` / `loadMovCat()` / `saveMovement()`
- `loadStockView()`
- `checkCriticalStock()`
- `initTransferencias()` / `saveTransferencia()`

---

#### Arquivo: `js/lumen-financeiro.js`
**Linhas aproximadas: 8.670–9.830 + 11.234–12.106**
**Funções:**
- `initOrcamentoFinanceiro()` / `calcularOrcamento()`
- `renderOrcDetalhado()`
- `initFinanceiroCompras()` / `finCarregarDados()`
- `finAplicarFiltros()` / `finAtualizarGraficos()`
- `finExportarSP()` / `finImportar()`
- `pagFiltrar()` / `pagMarcarSelecionados()`

---

#### Arquivo: `js/lumen-fornecedores.js`
**Linhas aproximadas: 9.606–9.830 + 10.295–10.783**
**Funções:**
- `loadSuppliers()` / `saveSupplier()` / `deleteSupplier()`
- `initIndFornecedores()`
- `initOrcPendentes()` / `opcRenderizar()` / `opcSalvarDecisao()`

---

#### Arquivo: `js/lumen-casas.js`
**Linhas aproximadas: 4.859–5.010 + 7.282–7.654**
**Funções:**
- `loadHouses()` / `addHouse()` / `updateHousePeople()`
- `loadManageHouses()` / `saveAllBlocks()`
- `addNewHouse()` / `deleteHouse()`
- `loadPercapitaPage()` / `savePercapita()`

---

#### Arquivo: `js/lumen-relatorios.js`
**Linhas aproximadas: 7.655–7.996 + 9.831–10.187 + 12.112–12.530**
**Funções:**
- `initIndicadores()`
- `initComparativo()` / `loadComparativo()`
- `loadCalcReal()`
- `initPrevisao()` / `runPrevisao()` / `renderPrevisaoCards()`
- `renderPrevisaoTabela()` / `exportPrevisaoCSV()`

---

#### Arquivo: `js/lumen-admin.js`
**Linhas aproximadas: 4.747–4.858 + 8.305–8.620 + 12.533–12.668**
**Funções:**
- `loadUsers()` / `updateUserStatus()` / `loadAjustesBadge()`
- `initManageProducts()` / `loadMpProducts()` / `saveProduct()`
- `deleteProduct()` / `editProduct()`
- `initManageCats()` / `renderCatsTable()` / `saveCat()` / `deleteCat()`

---

## Dica: Como testar depois de cada mudança

1. Salve o arquivo
2. Abra o sistema no navegador (ou recarregue — Ctrl+F5)
3. Abra o DevTools (F12) → aba Console
4. Se aparecer erro em vermelho: o erro vai indicar qual função está faltando
5. Verifique se você removeu algo que não deveria, ou se o arquivo não carregou

**Erros comuns:**
- `ReferenceError: xxx is not defined` → a função foi removida mas ainda é chamada. Verifique se o arquivo .js foi adicionado no `<script>` do index.html
- `404 (Not Found)` no Console → o arquivo .js está no lugar errado ou o nome está diferente
- Nada aparece na tela → o índice JS quebrou antes de renderizar. Olhe o Console.

---

## Resumo do que você já tem pronto

| Arquivo | Status | O que faz |
|---|---|---|
| `config.js` | ✅ Pronto | Todas as chaves, sem ADMIN_EMAIL no código |
| `lumen-auth.js` | ✅ Pronto | Login seguro, admin_email do Firestore |
| `lumen-ia.js` | ✅ Pronto | Gemini em todas as funções de IA |
| `lumen-rbac.js` | ✅ Pronto | Perfis e audit log |
| `lumen-bi.js` | ✅ Pronto | Relatórios gerenciais |
| `firestore.rules` | ✅ Pronto | Regras de segurança |
| `tutorial.html` | ✅ Pronto | Guia visual passo a passo |
| `js/lumen-*.js` | ⏳ Quando quiser | Divisão avançada do código |
