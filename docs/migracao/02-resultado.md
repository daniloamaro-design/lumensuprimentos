# FASE 2 — Resultado: estrutura no ar + segurança validada

Executada em 2026-07-28 contra o projeto Supabase `saalwqfjhnvleltqfftr`.

## O que foi feito e verificado ✅

### Schema aplicado (`02-aplicar.mjs`)
As 3 migrations rodaram limpas no Postgres:
- **32 tabelas**, **67 políticas RLS**, **5 funções**
- **Todas as tabelas com RLS ativo** (nenhuma exposta)

### Matriz de permissões validada papel a papel (`04-teste-matriz.mjs`)
**24 verificações, 0 falhas.** O teste entra como cada perfil (11 papéis + convidado
anônimo) e confirma que cada operação permitida passa e cada proibida é bloqueada.
Exemplos comprovados:
- convidado **cria** movimentação e solicitação de variedade, mas **não lê** pedidos nem financeiro
- estoque cria movimentação e lê pedidos, mas **não** altera preços nem vê financeiro
- financeiro vê/lança compras financeiras, mas **não** movimenta estoque
- compras lança preços/pedidos, mas **não** define metas (só gestão)
- coordenador/admin (gestão) fazem tudo, inclusive aprovar usuários

### Bucket de documentos (`05-storage.mjs`)
Bucket **`pedidos`** criado (privado, 10 MB, PDF/imagem) com políticas: leitura para
gestão/compras/estoque/financeiro; upload para gestão/compras/estoque.

## Descobertas importantes para a FASE 4 (conversão do front)

1. **Insert de convidado não pode pedir leitura de volta.** Um `insert().select()` do
   convidado falha porque ler a linha exigiria política de SELECT (que ele não tem).
   No código do front, a submissão de movimento/variedade pelo convidado deve inserir
   **sem** `.select()` de retorno (só confirmar sucesso). Alternativa futura: política de
   SELECT por `registered_uid = auth.uid()` para o autor ver a própria linha.
2. **`metas` tem chave composta (ano, cat_key)** — sem coluna `id`. Código que manipular
   metas não deve assumir `id`.

## Itens da FASE 2 deferidos (com justificativa)

- **Piloto de import de senhas scrypt** → movido para o INÍCIO da FASE 3. Motivo: exige os
  *password hash parameters* do Firebase (segredo que fica só na máquina do usuário) e um
  export real do Firebase Auth, que são insumos da migração de dados. Será a PRIMEIRA coisa
  validada na FASE 3 — se o scrypt não importar, sabemos antes da migração completa e
  acionamos o plano B (reset de senha em massa, indolor: são ~6 usuários ativos).
- **Templates de e-mail em PT-BR** (confirmação/reset) → ação rápida no painel do Supabase
  (Authentication → Email Templates), cosmética. Os templates padrão (inglês) já funcionam.
  Documentado para o usuário fazer quando quiser.

## Como reproduzir (scripts idempotentes)
```
node tools/migracao/02-aplicar.mjs         # aplica/valida o schema (--reset zera o public)
node tools/migracao/03-seed-teste.mjs      # cria usuários de teste (um por papel)
node tools/migracao/04-teste-matriz.mjs    # valida a matriz RLS (24 checagens)
node tools/migracao/05-storage.mjs         # bucket pedidos + policies
```
Todos leem segredos de `tools/migracao/.env` (gitignored).
