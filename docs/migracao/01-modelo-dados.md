# FASE 1 — Modelo de dados: Firestore (37 coleções) → Postgres (~30 tabelas)

> Fonte da verdade dos CAMPOS: amostras reais coletadas em 2026-07-27
> (`tools/migracao/01-amostras.mjs`) + análise dos pontos de escrita no código.
> DDL correspondente: `supabase/migrations/001_schema.sql` (tabelas),
> `002_rls.sql` (segurança), `003_funcoes.sql` (funções/gatilhos).

## Convenções

- Colunas em `snake_case`, nomes próximos aos campos atuais (facilita a FASE 4).
- **PK preserva o ID do Firestore**: `id text primary key default (gen_random_uuid()::text)`.
  Linhas migradas recebem o doc ID original ⇒ o UPSERT do ETL usa `ON CONFLICT (id)`
  (cumpre o papel do `firestore_id` do plano sem coluna extra).
- `timestamp` Firestore → `timestamptz`; datas string "YYYY-MM-DD" → `date`.
- JSONB somente para estruturas de forma livre (configs, avaliações, históricos internos).
- O coração analítico é normalizado: `movement_items`, `order_items`, `transferencia_items`,
  `var_proposta_itens`.
- Gatilho `set_updated_at()` em toda tabela com `updated_at`.

## Decisões de limpeza (aprovadas na FASE 0/medições)

| Situação encontrada | Decisão |
|---|---|
| `audit_log` (101 docs, formato antigo) + `audit_logs` (23, novo) | Unificar em `audit_logs` com coluna `origem` ('legado'/'novo'); campos do legado mapeados aos novos |
| `usuarios_perfis` (3 docs, modelo fantasma das rules) | **Morre.** ETL confere se os 3 uids têm role equivalente em `users` |
| `casas_config` + `casas_override` + `casas_removidas` + `casas_blocos` + `casas_tipo_compra` | Consolidadas na tabela `houses` (colunas cidade, endereco, bloco, tipo_compra, ativo). ETL reproduz a lógica de merge do js/01-core.js |
| `cidades_config/override/removidas` (todas vazias) | Tabela única `cidades`; seed = lista CIDADES do js/01-core.js |
| `produtos_config` + `produtos_removidos` | Tabela `produtos` com `ativo boolean` (+ deleted_at/by preservados) |
| `var_counters` (1 doc, runTransaction) | **Morre.** Vira `sequence` + função `proximo_codigo_var()` |
| Coleções vazias com página ativa (`ajustes`, `transferencias_financeiras`) | Tabelas criadas a partir dos campos do ponto de escrita no código |
| `orders.status` — pipeline não tem lista fechada confirmada | Coluna TEXT sem CHECK na v1; ETL inventaria os valores distintos e a FASE 2 adiciona o CHECK |

## Mapa coleção → tabela (campo a campo)

### users  ←  users (6 docs)
| Firestore | Coluna | Tipo |
|---|---|---|
| (doc id = uid do Auth) | id | text PK |
| email | email | text UNIQUE |
| name | name | text |
| role | role | text CHECK (11 roles) |
| status | status | text CHECK (pending/approved/rejected) |
| house | house | text |
| createdAt/updatedAt/updatedBy | created_at/updated_at/updated_by | timestamptz/timestamptz/text |

### cidades  ←  cidades_config/override/removidas (vazias; seed do código)
`nome text PK · ativo boolean` — a página Gerenciar Cidades passa a operar nesta tabela.

### houses  ←  houses (20) + casas_config (14) + casas_override (17) + casas_blocos (27) + casas_tipo_compra (0)
| Origem | Coluna | Tipo |
|---|---|---|
| name / nome / novoNome (override vence) | nome | text UNIQUE NOT NULL |
| cidade (config/override) | cidade | text → cidades(nome) |
| endereco | endereco | text |
| bloco (casas_blocos, id = nome com _ ) | bloco | text |
| (casas_tipo_compra) | tipo_compra | text |
| acolhidos/coordenadores/extra/currentPeople | acolhidos/coordenadores/extra/current_people | int |
| peopleHistory | people_history | jsonb |
| (casas_removidas) | ativo | boolean |

### categorias  ←  categorias_config (4 docs; seed também do CATEGORIAS do 01-core)
`key text PK · nome text · icon text · ordem int · ativo boolean`

### produtos  ←  produtos_config (58) + produtos_removidos (1)
`id text PK (prodId) · categoria_key → categorias · nome · unidade · percapita numeric · ppp numeric · is_override bool · ativo bool · deleted_at/deleted_by · created_*/updated_*`

### suppliers  ←  suppliers (16)
`id text PK · nome · cnpj · contato · contato_nome · email · obs · prazo · limite numeric · utilizado numeric · categorias text[] · created_*/updated_*`

### centros_custo (27) e centro_custo_categorias (6)
`id text PK · nome · descricao · criado_em timestamptz`

### movements (800) → movements + movement_items
movements: `id PK · code · type CHECK(entrada/saida) · house · date date · date_str · obs · is_donation bool · leitura_ia bool · photo_base64 text (ETL: verificar se algum doc tem base64 gigante; se sim, mover p/ Storage) · registered_by · registered_uid · created_at`
movement_items (do array items): `id identity PK · movement_id FK cascade · cat_key · prod_id · prod_nome · unidade · qty numeric`

### orders (278) → orders + order_items
orders (campos planos da amostra): `id PK · code · house · status TEXT (v. decisão) · people int · recipient · observations · attach_obs · date_str · categories text[] · categoria_id/categoria_nome (→ centro_custo_categorias) · centro_custo_id/centro_custo_nome · fornecedor_id/fornecedor_nome · cotacao_aprovada_id/cotacao_fornecedor/cotacao_valor numeric · liberado_em · entregue bool/entregue_at/entregue_by · nf_file_name/nf_file_url/nf_numero/nf_valor numeric · boleto_file_name/boleto_file_url/boleto_vencimento date · requester_uid/name/email · stock_eval jsonb · stock_eval_at/by/estoque · purchase_items jsonb · created_at/updated_at`
order_items (do map aninhado `items: {catKey: {prodId: qty}}`): `id identity PK · order_id FK cascade · cat_key · prod_id · qty numeric`
*(ETL reconstrói o map para exibição; helper de leitura na FASE 4 remonta o objeto.)*

### quotations (318)
`id PK · order_id → orders · fornecedor_id/fornecedor_nome · valor numeric · validade text · obs · status · status_coordenador/coordenador_nome/coordenador_em · status_gerente/gerente_nome/gerente_em · created_at/created_by`

### transferencias (225) → transferencias + transferencia_items
`id PK · code · origem · destino · data date · status · order_id/order_code · gerada_automaticamente bool · criada_por · created_at` + items igual a movement_items.

### transferencias_financeiras (vazia; campos do js/10:1155)
`id PK · casa · valor numeric · data date · coordenador · periodo · obs · registered_by · created_at`

### compras_financeiro (1.493)
`id PK · ano int · mes text · cat_key · classificacao · centro_custo_id/nome · chave_unica (índice NÃO-único; a deduplicação continua lógica) · data_compra_str (original) · data_compra date (ETL converte "DD/MM/YYYY") · data_compra_serial bigint · destinatario · dias_prazo int · fornecedor/fornecedor_id · importado_em · lancado_hyb text · lancado_sp text (ETL normaliza bool|string) · nf_recebidas text · pago text · pedido_id/pedido_ref · valor numeric · valor_nf text · vencimento_str · vencimento date · vencimento_serial int (serial Excel — manter bruto) · created_at`

### prices (106) e prices_historico (70)
prices: `id PK · cat_key · prod_id · prod_nome · unidade · city · price numeric · updated_at/by` + UNIQUE(cat_key, prod_id, city)
prices_historico: `id PK · cat_key · prod_id · city · price numeric · saved_at/saved_by`

### percapitas (18)
`id PK · house UNIQUE · values jsonb ({cat:{prodId:num}}) · updated_at/by` *(JSONB na v1; normalizar depois só se a análise pedir)*

### ajustes (vazia; campos do js/04:660)
`id PK · tipo · descricao · urgencia · status default 'pendente' · solicitante_uid/nome/email · casa · created_at`

### var_solicitacoes (24)
`id PK · codigo · material · quantidade numeric · unidade · setor · prioridade · status CHECK (pendente/em_proposta/pedido_liberado/compra_realizada/concluido/cancelado) · data_limite date · valor_estimado numeric · obs · fornecedor jsonb · proposta_id · solicitante_uid/nome · criado_em · editado_em/por · timeline: pedido_liberado_em/por · compra_realizada_em/por · comprada_em/por · concluido_em/por`

### var_orcamentos (21)
`id PK · solicitacao_id → var_solicitacoes · cotacoes jsonb (array {fornecedor,valorTotal,prazoEntrega,obs}) · opcao_escolhida int · status · aprovado_em/por · registrado_por/uid · criado_em`

### var_propostas (5) → var_propostas + var_proposta_itens
var_propostas: `id PK · autor_nome/autor_uid · criado_em`
var_proposta_itens (do array itens): `id identity PK · proposta_id FK cascade · solicitacao_id · codigo · material · setor · prioridade · quantidade numeric · valor_estimado numeric · valor_unitario numeric · fornecedor · prazo_entrega · forma_pagamento · autorizado bool`

### var_setores (11)
`id PK · nome UNIQUE · criado_em`

### kanban_tasks (18)
`id PK · title · description · status · urgency · assigned_role · deadline date · created_at/created_by · updated_at · completed_at`

### metas (2 docs "categorias_ANO") → metas
`ano int · cat_key text · meta_semana/meta_mes/meta_ano numeric · PK(ano, cat_key)` — ETL explode o doc por categoria.

### metas_historico (13)
`id PK · ano int · data jsonb · atualizado_em/por`

### config (2 docs de forma livre) → config
`chave text PK (doc id) · valor jsonb (campos do doc) · updated_at`

### cardapio_planos  ←  cardapioPlanos (2)
`id PK · house · pessoas int · refeicoes jsonb · cru_calculado jsonb · cafe_manha_tem_cafe bool · lanche_tarde_tem_cafe bool · gerado_em/por`

### audit_logs  ←  audit_logs (23) + audit_log (101, legado)
`id PK · origem CHECK(novo/legado) · acao · colecao · doc_id · detalhe · data date · usuario · usuario_uid · user_agent · ts timestamptz`
Mapeamento do legado: dataHora→ts · descricao→detalhe · nome→usuario · uid→usuario_uid · perfil→(prefixo em detalhe).

## Matriz de permissões (RLS) — fonte: js/04-percapita.js:499 + pontos de escrita

Papel resolvido pela função `papel()`: linha em `users` aprovada → role; autenticado sem
linha (anônimo/pendente) → `convidado`; sem sessão → sem acesso.

| Grupo | Roles | Acesso |
|---|---|---|
| **gestao** | admin, diretor, gerente, coordenador | Leitura e escrita em TUDO |
| **compras** | compras | RW: movements(+items), orders(+items), quotations, transferencias(+items), prices(+hist), percapitas, suppliers, kanban_tasks, var_* , compras_financeiro, houses, produtos, categorias, centros_custo(+cats), cardapio_planos · R: resto |
| **estoque** | estoque | RW: movements, transferencias, orders(criar/ler), kanban_tasks, var_solicitacoes(criar) · R: prices, houses, produtos, categorias, percapitas, suppliers, quotations |
| **financeiro** | financeiro | RW: compras_financeiro · R: suppliers, orders, quotations · var_solicitacoes(criar) |
| **csl / coord_csl** | csl, coord_csl | RW: movements, orders(criar/ler) · R: houses, produtos, categorias |
| **escritorio / usuario** | escritorio, usuario | var_solicitacoes(criar/ler próprias) · R: var_setores · ajustes(criar próprias) |
| **convidado** (anônimo) | — | INSERT movements e var_solicitacoes · R: categorias, produtos, houses(nomes), var_setores |
| Todos autenticados | — | R da própria linha em users; ajustes: criar própria; audit_logs: INSERT (gravado sempre), leitura só gestao |

Escrita em `users` (aprovar/role): **somente gestao** (aprovação de cadastro).
`audit_logs`: INSERT permitido a todos autenticados; UPDATE/DELETE: ninguém (imutável).

## Funções SQL (003_funcoes.sql)

1. `set_updated_at()` — gatilho genérico de `updated_at`.
2. `papel()` — resolve o papel do usuário logado (base de todas as policies).
3. `proximo_codigo_var()` — sequence + formatação "VAR-0000" (substitui runTransaction).
4. `aprovar_cotacao(quotation_id, aprovador)` — **transacional**: marca a cotação aprovada,
   grava fornecedor/valor no pedido e muda status andamento→pedido_liberado num único
   commit (substitui a Cloud Function nunca deployada e os 2 updates não-atômicos do cliente).

## Critérios de conclusão da FASE 1
- [x] Amostras reais de todas as coleções com dados analisadas (32/32)
- [x] Campos das 2 coleções vazias com página ativa extraídos do código
- [x] DDL escrito e revisado (001_schema: 32 tabelas · 002_rls: papel()/eh_gestao() + ~60
      policies · 003_funcoes: set_updated_at, proximo_codigo_var, aprovar_cotacao)
- [ ] Validação de execução: primeira ação da FASE 2, aplicando no projeto Supabase vazio
      (sem Postgres local na máquina — critério transferido com aval do plano)
