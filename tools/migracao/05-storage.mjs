#!/usr/bin/env node
/**
 * 05-storage.mjs — cria o bucket de documentos de pedidos (NF/boleto) e suas policies.
 * Idempotente. Usa service_role key.
 *
 *   node tools/migracao/05-storage.mjs
 */
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { SUPABASE_URL, SERVICE_KEY, DATABASE_URL, exigir } from './env.mjs';

exigir('SUPABASE_SERVICE_KEY', SERVICE_KEY);
exigir('DATABASE_URL', DATABASE_URL);
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const BUCKET = 'pedidos';

// Cria o bucket (privado — acesso só via signed URL ou policy).
const { data: buckets } = await admin.storage.listBuckets();
if (buckets?.some(b => b.name === BUCKET)) {
  console.log(`Bucket "${BUCKET}" já existe.`);
} else {
  const { error } = await admin.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: '10MB',
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
  });
  if (error) { console.error('❌ Erro ao criar bucket:', error.message); process.exit(1); }
  console.log(`✅ Bucket "${BUCKET}" criado (privado, 10MB, PDF/imagem).`);
}

// Policies de Storage (tabela storage.objects) — quem pode subir/ler arquivos do bucket.
// Leitura e upload: gestão + compras + estoque (quem mexe em pedidos). Convidado: não.
const c = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const policySQL = `
  drop policy if exists pedidos_leitura on storage.objects;
  drop policy if exists pedidos_escrita on storage.objects;
  create policy pedidos_leitura on storage.objects for select
    using (bucket_id = 'pedidos'
           and (public.eh_gestao() or public.papel() in ('compras','estoque','financeiro')));
  create policy pedidos_escrita on storage.objects for all
    using (bucket_id = 'pedidos'
           and (public.eh_gestao() or public.papel() in ('compras','estoque')))
    with check (bucket_id = 'pedidos'
           and (public.eh_gestao() or public.papel() in ('compras','estoque')));
`;
try {
  await c.query(policySQL);
  console.log('✅ Policies de Storage aplicadas (leitura: gestão/compras/estoque/financeiro; escrita: gestão/compras/estoque).');
} catch (e) {
  console.error('❌ Erro nas policies de storage:', e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
