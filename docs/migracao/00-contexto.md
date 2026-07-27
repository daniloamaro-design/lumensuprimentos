# FASE 0 — Contexto e preparação da migração Firebase → Google Cloud

> Migração total: Firestore/Auth/Storage → Cloud SQL (Postgres) + Cloud Run + Identity Platform + BigQuery.
> Estratégia: versão paralela + virada única. Plano completo aprovado em 2026-07-27.

## Apurado em 2026-07-27

### Projetos Google/Firebase da conta (daniloamaro@lumenserfeliz.org)
| Projeto | Uso |
|---|---|
| `automacao-logistica2040` | **Lumen Suprimentos (este sistema)** — Firestore com as 37 coleções, Auth, Storage |
| `lumen-fretes` | Sistema de fretes — PROJETO PRÓPRIO (ver checkpoint abaixo) |
| `lumen-passagens` | Sistema de passagens — PROJETO PRÓPRIO |
| `lumen-almoxarifado` | (uso a confirmar) |

### Descoberta que reduz risco (a confirmar no checkpoint)
O `firestore.rules` do projeto `automacao-logistica2040` contém regras de coleções do
Fretes/Passagens (`fretes_*`, `freteiros`, `passagens_*`, `casas_lumen`), MAS existem
projetos separados `lumen-fretes` e `lumen-passagens`. Hipótese: esses sistemas migraram
para projetos próprios e as regras aqui são SOBRAS. Se confirmado, o risco nº 1 do plano
(quebrar o Fretes ao desativar coleções) praticamente desaparece.

### Cloud Function
`firebase functions:list` falha no projeto (API nunca habilitada — coerente com plano
Spark). **Confirmado na prática: a function `liberarPedidoAoAprovarCotacao` nunca foi
deployada.** O fluxo aprovação→liberação é feito no cliente (js/melhorias.js:564, dois
updates não-atômicos). No backend novo vira transação SQL — ganho de integridade.

### Ferramentas na máquina
- `firebase` CLI: instalado e AUTENTICADO ✅
- `gcloud`/`gsutil`: instalados; exigem `CLOUDSDK_PYTHON` apontando para o Python
  embutido do SDK (correção permanente: `setx CLOUDSDK_PYTHON "C:\Users\compu\AppData\Local\Google\Cloud SDK\google-cloud-sdk\platform\bundledpython\python.exe"`).
  Token EXPIRADO — precisa `gcloud auth login` (ação do usuário).
- Node v24 ✅

### Custos aceitos no plano aprovado
~US$ 15–40/mês (Cloud SQL menor instância + Cloud Run free tier + GCS + GCIP/BigQuery
free tiers). Orçamento com alertas 50/90/100% será criado junto com o billing.

## Checklist de ações do USUÁRIO (bloqueiam o restante da FASE 0)

- [ ] **1. Reautenticar o gcloud**: rodar `gcloud auth login` no terminal (abre o navegador).
      Depois disso o Claude roda as medições (contagem das 37 coleções + tamanho do Storage).
- [ ] **2. Billing**: criar/vincular conta de faturamento no console GCP
      (https://console.cloud.google.com/billing) — cartão necessário. NÃO vincular ao
      projeto antigo `automacao-logistica2040` (ele continua gratuito).
- [x] **3. Checkpoint Fretes/Passagens: RESOLVIDO em 2026-07-27.** Confirmação do usuário:
      todos os sistemas (Fretes, Passagens, Almoxarifado) rodam em PROJETOS SEPARADOS.
      As regras deles no firestore.rules do `automacao-logistica2040` ficaram por descuido
      e são SOBRAS — podem ser limpas sem risco. ⇒ O risco nº 1 do plano está eliminado.
      NOTA FUTURA: o usuário quer avaliar, após a migração, juntar os 3 projetos em 1.
- [ ] **4. Parâmetros de hash de senha** (para migrar usuários SEM trocar senhas):
      Console Firebase → Authentication → aba Users → menu ⋮ (três pontos) →
      "Password hash parameters" → copiar e guardar em local seguro (NÃO colar no chat,
      NÃO commitar — guardar num arquivo local fora da pasta do projeto).

## Pendências da FASE 0 executadas pelo Claude (após o item 1 acima)
- [ ] Medir: contagem de documentos por coleção (`tools/migracao/00-contagem.mjs`)
- [ ] Medir: tamanho do bucket de Storage (`gsutil du -sh`)
- [ ] Criar projeto `lumen-suprimentos-prod` + habilitar APIs (após billing existir)
- [ ] Registrar as respostas do checkpoint Fretes neste documento
