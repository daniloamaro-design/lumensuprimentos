-- autorizarInventario() (js/04-percapita.js) gera movimentações de ajuste
-- pra cada item divergente ao autorizar um inventário, gravando is_ajuste/
-- is_inventario/inventario_id — nenhuma das 3 colunas existia em movements
-- (mesma causa de obs/is_transferencia/is_estorno corrigidos antes: campo
-- que existia no Firestore mas nunca virou coluna real no Postgres). Dava
-- 400 "Could not find the 'inventario_id' column" ao clicar "Autorizar"
-- num inventário com alguma divergência.
alter table movements add column if not exists is_ajuste boolean;
alter table movements add column if not exists is_inventario boolean;
alter table movements add column if not exists inventario_id text;
