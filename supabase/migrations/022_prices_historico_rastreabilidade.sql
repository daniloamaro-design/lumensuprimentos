-- ═══════════════════════════════════════════════════════════════════
-- 022_prices_historico_rastreabilidade.sql
-- attachExtrairPrecosIA() (js/06-pedidos.js) grava pedidoCode/fornecedorNome/
-- nfNumero ao extrair preços da NF por IA, mas essas colunas nunca
-- existiram em prices_historico — todo uso desse botão falhava com 400
-- (PostgREST rejeita colunas desconhecidas no upsert). Descoberto ao usar
-- o botão em produção. Adiciona as colunas em vez de tirar os campos do
-- código: é rastreabilidade útil (de qual pedido/nota veio aquele preço).
-- ═══════════════════════════════════════════════════════════════════

alter table prices_historico add column if not exists pedido_code text;
alter table prices_historico add column if not exists fornecedor_nome text;
alter table prices_historico add column if not exists nf_numero text;
