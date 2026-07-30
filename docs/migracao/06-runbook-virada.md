# FASE 6 — Runbook da virada (Firebase → Supabase)

Passo a passo da troca definitiva. Fazer numa **janela de baixo uso** (noite/fim de semana).
Produção só é tocada nos passos marcados 🔴. Rollback de 1 comando disponível por 30 dias.

## Pré-requisitos (antes do dia da virada)
- [ ] Validação da FASE 5 concluída (você + 2–3 perfis testaram os fluxos principais no staging)
- [ ] **Chat de IA testado no staging** (só funciona no deploy, não no local) — mandar 1 pergunta
- [ ] Secret `SUPABASE_DB_URL` criado no GitHub (para o backup automático) — ver
      `.github/workflows/backup-supabase.yml`
- [ ] Avisar a equipe: "sistema em manutenção das HH às HH do dia X"
- [ ] Confirmar acesso: conta Vercel (deploy) e Firebase (publicar rules read-only)

## Runbook (dia da virada)

### 1. Congelar e fazer backup
- [ ] Avisar a equipe para PARAR de usar o sistema (mensagem no grupo)
- [ ] 🟢 Disparar backup do Supabase: GitHub → Actions → "Backup do banco Supabase" → Run
- [ ] 🟢 Guardar também um export final do Firebase como arquivo morto (segurança):
      `node tools/migracao/10-export.mjs` (salva os NDJSON)

### 2. Sincronização final dos dados (Firestore → Supabase)
- [ ] 🟢 `node tools/migracao/10-export.mjs` (dados mais recentes)
- [ ] 🟢 `node tools/migracao/11-transform-load.mjs` (carga idempotente)
- [ ] 🟢 `node tools/migracao/15-usuarios-auth.mjs` (usuários + remapeamento de uid)
- [ ] 🟢 `node tools/migracao/13-storage-copy.mjs` (arquivos novos: NF/boleto)
- [ ] 🟢 `node tools/migracao/12-verificar.mjs` → deve dar "✅ Tudo confere"

### 3. Publicar em produção 🔴
- [ ] 🔴 Merge da branch `migracao-supabase` na `main`
- [ ] 🔴 Vercel publica a `main` automaticamente (produção passa a usar o Supabase)
- [ ] Smoke test em produção: login (2–3 perfis) · Financeiro total (R$ 1.595.948,80 +
      lançamentos novos) · criar 1 pedido de teste · abrir 1 NF · chat IA

### 4. Blindar o Firebase (rollback preservado) 🔴
- [ ] 🔴 Publicar no Firestore regras "somente leitura" APENAS nas coleções do Suprimentos
      (`movements`, `orders`, etc.) — impede escrita acidental no banco antigo.
      NÃO desligar Auth, nem tocar nas coleções de outros sistemas.
- [ ] Manter assim por 30 dias como janela de recuo.

### 5. Pós-virada
- [ ] Remover o usuário de teste `teste-login@lumen.local` do Supabase Auth
- [ ] Configurar templates de e-mail do Supabase em PT-BR (Authentication → Email Templates)
- [ ] Acompanhar de perto a 1ª semana (erros no console, relatos da equipe)

## 🔙 Rollback (se algo grave nos primeiros dias)
Decidir em até ~72h. Um comando reverte a produção para o Firebase:
- [ ] Reverter o merge na Vercel (redeploy do commit anterior da `main`) → volta ao Firebase
- [ ] Republicar as regras normais do Firestore (escrita liberada)
- Custo assumido: lançamentos feitos no Supabase durante a janela precisam ser refeitos
  (por isso o acompanhamento intenso na 1ª semana).

## Encerramento (após 30 dias sem rollback)
- [ ] Arquivar o export final do Firebase (JSON) em local seguro
- [ ] Opcional: limpar as coleções do Suprimentos no Firebase (o projeto continua vivo p/ outros sistemas)
- [ ] Teste de restauração do backup Supabase (baixar 1 .dump e restaurar num banco vazio) — 1x, documentado
