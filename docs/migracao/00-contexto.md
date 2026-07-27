# FASE 0 — Contexto e preparação da migração Firebase → Supabase

> **MUDANÇA DE DESTINO (2026-07-27):** o plano Google Cloud foi substituído por **Supabase
> (plano gratuito)** quando o usuário definiu o requisito de custo zero — o Cloud SQL
> (~US$12–30/mês) inviabilizou a stack GCP. O Supabase entrega Postgres/SQL (análise),
> RLS (segurança), Auth com import de senhas e Storage, tudo sem cartão.
> Estratégia mantida: versão paralela + virada única, aprovação por fase.

## Medições oficiais (2026-07-27)

**3.730 documentos** no Firestore (maiores: compras_financeiro 1.493, movements 800,
quotations 318, orders 278, transferencias 225) + **34,43 MB** no Storage
(`gs://automacao-logistica2040.firebasestorage.app`). Cabe com folga no free tier do
Supabase (500 MB banco / 1 GB storage / 50k MAU). Contagem por coleção: rodar
`TOKEN=$(gcloud auth print-access-token) node tools/migracao/00-contagem.mjs`.

Achados extras da contagem: existe `audit_log` (101 docs, nome antigo) além de
`audit_logs` (23) — unificar na migração; `usuarios_perfis` tem só 3 docs (modelo
fantasma das rules, será abandonado); coleções `cidades_*` e `casas_tipo_compra`/
`casas_removidas`/`transferencias_financeiras`/`ajustes` estão VAZIAS (verificar se
entram no schema novo ou morrem).

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

- [x] **1. Reautenticar o gcloud**: FEITO em 2026-07-27 (medições executadas).
- [x] **2. Billing GCP**: CANCELADO — destino mudou para Supabase (custo zero, sem cartão).
- [x] **2-NOVO. Criar o projeto no Supabase: FEITO em 2026-07-27.** ✅
      - Project URL: `https://saalwqfjhnvleltqfftr.supabase.co`
      - Publishable key (pública por design): `sb_publishable_N23E2SHI9SBehB8-f-OF3g_W_8T2JEk`
      - Anonymous sign-ins: HABILITADO (validado via /auth/v1/settings)
      - Auth API: saudável (GoTrue v2.194.0). REST responde (401 no endpoint de schema é
        esperado com chave publishable — restrito a secret keys).
      - service_role/secret key e senha do banco: guardadas pelo usuário fora do repo.
      Passo a passo original (referência):
      (a) https://supabase.com → "Start your project" → entrar com a conta GitHub
          (daniloamaro-design);
      (b) New project → nome `lumen-suprimentos` → região **South America (São Paulo)**
          → gerar/guardar a senha do banco (Database Password) em local seguro;
      (c) Depois de criado: Settings → API → copiar a **Project URL** e a **anon public key**
          e enviar no chat (a anon key é pública por design, pode enviar);
      (d) A **service_role key** (mesma tela): guardar em local seguro FORA da pasta do
          projeto — será usada só nos scripts locais de migração, nunca no site;
      (e) Authentication → Sign In / Providers → habilitar **Anonymous sign-ins**
          (para o modo convidado do sistema).
- [x] **3. Checkpoint Fretes/Passagens: RESOLVIDO em 2026-07-27.** Confirmação do usuário:
      todos os sistemas (Fretes, Passagens, Almoxarifado) rodam em PROJETOS SEPARADOS.
      As regras deles no firestore.rules do `automacao-logistica2040` ficaram por descuido
      e são SOBRAS — podem ser limpas sem risco. ⇒ O risco nº 1 do plano está eliminado.
      NOTA FUTURA: o usuário quer avaliar, após a migração, juntar os 3 projetos em 1.
- [ ] **4. Parâmetros de hash de senha** (para migrar usuários SEM trocar senhas):
      Console Firebase → Authentication → aba Users → menu ⋮ (três pontos) →
      "Password hash parameters" → copiar e guardar em local seguro (NÃO colar no chat,
      NÃO commitar — guardar num arquivo local fora da pasta do projeto).

## Pendências da FASE 0 executadas pelo Claude
- [x] Medir: contagem de documentos por coleção — 3.730 docs (2026-07-27)
- [x] Medir: tamanho do Storage — 34,43 MB (2026-07-27)
- [x] Registrar checkpoint Fretes — resolvido, projetos separados
- [ ] Validar acesso ao projeto Supabase quando o usuário criar (item 2-NOVO acima)
