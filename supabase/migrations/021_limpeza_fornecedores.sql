-- ═══════════════════════════════════════════════════════════════════
-- 021_limpeza_fornecedores.sql
-- Unifica fornecedores que apareciam sob nomes diferentes no cadastro
-- (suppliers) e no financeiro (compras_financeiro.fornecedor, texto livre)
-- — descoberto ao cruzar com a planilha "Visão Contas a Pagar" do
-- financeiro. Confirmado com o usuário em 2026-09-10.
-- ═══════════════════════════════════════════════════════════════════

-- "Ragner" = "CARNES EXPRESS" (planilha) = "Casa das Carnes e CIA LTDA"
-- (como já aparecia em compras_financeiro) — mesmo CNPJ 42461348000126.
update suppliers set nome = 'Carnes Express', cnpj = coalesce(cnpj, '42461348000126')
  where nome = 'Ragner';
update compras_financeiro set fornecedor = 'Carnes Express'
  where fornecedor in ('Ragner', 'RAGNER', 'Casa das Carnes e CIA LTDA', 'CARNES EXPRESS');

-- "Pajuçara" e "Pajuçara Distribuidora de Alimentos LTDA" já eram o mesmo
-- CNPJ 12440090000110 — unifica o texto gravado em compras_financeiro.
update compras_financeiro set fornecedor = 'Pajuçara Distribuidora de Alimentos LTDA'
  where fornecedor in ('Pajuçara', 'PAJUÇARA', 'PAJUÇARA DISTRIBUIDORA DE ALIMENTOS LTDA');

-- Fornecedor novo: Quadros Criativos (CNPJ fica no nome da própria Francisca
-- Lindalva, que é quem assina — confirmado com o usuário).
insert into suppliers (id, nome, cnpj, contato_nome, tipos, created_at)
select gen_random_uuid()::text, 'Quadros Criativos', '60039235000119', 'Francisca Lindalva Lima de Oliveira', '{produtos}', now()
where not exists (select 1 from suppliers where cnpj = '60039235000119');
