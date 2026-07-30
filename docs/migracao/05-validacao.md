# FASE 5 — Validação paralela (staging Supabase)

## Ambiente de teste (produção INTOCADA)
- **URL de teste (Supabase):** https://lumensuprimentos-d54j9pu1d-daniloamaro-designs-projects.vercel.app
  (deploy de preview da branch `migracao-supabase`; abre pedindo login na Vercel — use sua conta)
- **Produção (Firebase, atual):** continua no ar normalmente, sem qualquer mudança.
- **Login no sistema de teste:** as MESMAS senhas de sempre (foram preservadas na migração).
  Há também um usuário admin de teste: `teste-login@lumen.local` / `TesteLogin#2026` (será removido na virada).

> Importante: o ambiente de teste tem os dados **como estavam na data da migração (28/07/2026)**.
> A produção continuou recebendo lançamentos desde então, então pequenas diferenças de contagem
> vs. produção são ESPERADAS (dados novos). Antes da virada (FASE 6) faremos uma sincronização
> final para igualar tudo. Para uma comparação exata agora, avise que eu re-sincronizo o staging.

## Números de referência (o que o sistema de teste deve mostrar)
Estes vieram direto do banco novo. Servem para você cruzar com o sistema atual:

**Compras financeiras (por ano):**
- 2025: 890 compras, R$ 1.001.827,87
- 2026: 603 compras, R$ 594.120,93

**Pedidos por status:** concluído 219 · cancelado 24 · aguardando estoque 18 · compra realizada 13 · aguardando NF 6 · andamento 2

**Cotações:** aprovadas 225 (R$ 209.622,37) · recusadas 84 · pendentes 9

**Movimentações (itens):** entradas 3.651 · saídas 3.070

**Totais:** 20 casas ativas · 16 fornecedores · 58 produtos · ~11 usuários · 24 solicitações de variedades

## Checklist de validação — o que testar no ambiente de teste

### Fluxos gerais (qualquer perfil admin)
- [ ] **Login** com sua senha atual funciona (prova que as senhas foram preservadas)
- [ ] Dashboard abre com os indicadores
- [ ] Navegar por TODAS as páginas do menu — nenhuma tela em branco
- [ ] **Sair (logout)** e entrar de novo

### Operação (o coração do sistema)
- [ ] **Criar um pedido** de teste (nova solicitação) e conferir que aparece na lista
- [ ] **Registrar uma movimentação** de entrada e uma de saída
- [ ] **Gerar um PDF** de pedido
- [ ] **Abrir uma nota fiscal** já anexada (botão "Ver NF") — deve abrir o PDF
- [ ] **Anexar** uma nota fiscal/boleto num pedido
- [ ] **Estoque atual** (grade de casas) mostra os saldos
- [ ] **Transferência** entre casas
- [ ] **Aprovar uma cotação** (fluxo coordenador → gerente → pedido liberado)

### Financeiro / Relatórios
- [ ] **Financeiro — Compras**: os totais batem com os números de referência acima?
- [ ] **Indicadores** e gráficos aparecem
- [ ] **Metas**: valores por categoria corretos
- [ ] **Exportar um Excel** (qualquer relatório que tenha exportação)
- [ ] **Importar** uma planilha financeira (se usar essa função)

### Variedades
- [ ] Criar uma **solicitação de variedade** — o código (VAR-XXXX) é gerado em sequência
- [ ] Fluxo de orçamento → proposta → aprovação

### IA (só funciona no ambiente publicado, não no teste local)
- [ ] **Chat IA** (botão flutuante) responde
- [ ] **Leitura de formulário por foto** (IA) na movimentação
- [ ] **Previsão de demanda** / melhor fornecedor

### Por perfil (peça a 2–3 pessoas de perfis diferentes para entrar e testar o que usam)
- [ ] Um usuário **compras**, um **estoque**, um **financeiro** — cada um vê só o que deve e consegue fazer seu trabalho
- [ ] **Modo convidado** (acesso rápido para movimentação/solicitação sem login)

## Como reportar
Anote qualquer tela que der erro, número que não bata, ou botão que não funcione — com o nome da
página. Eu corrijo antes da virada. Se tudo passar, seguimos para a FASE 6 (virada).

## Comparação numérica automática (feita pelo Claude)
A integridade dos DADOS já foi verificada 100% na FASE 3 (contagens + somas conferiram entre
Firestore e Supabase). Os números de referência acima confirmam que os relatórios têm a mesma base.
A validação que resta é a HUMANA: abrir os relatórios nos dois sistemas e confirmar que os valores
exibidos são iguais.
