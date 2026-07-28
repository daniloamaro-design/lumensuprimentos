#!/usr/bin/env node
/**
 * 03-seed-teste.mjs — cria usuários de TESTE (um por papel) para validar a matriz RLS.
 * Idempotente: se o usuário já existe, apenas garante o perfil correto.
 * Usa a service_role key (ignora RLS). NÃO rodar em produção com dados reais.
 *
 *   node tools/migracao/03-seed-teste.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SERVICE_KEY, exigir } from './env.mjs';

exigir('SUPABASE_SERVICE_KEY', SERVICE_KEY);
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

export const ROLES = ['admin','diretor','gerente','coordenador','financeiro',
                      'compras','estoque','escritorio','csl','coord_csl','usuario'];
export const senhaDe = (role) => `Teste!${role}123`;
export const emailDe = (role) => `teste_${role}@lumen.local`;

async function acharUsuarioPorEmail(email) {
  // lista paginada (poucos usuários de teste)
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find(x => x.email === email);
    if (u) return u;
    if (data.users.length < 200) return null;
    page++;
  }
}

async function seedRole(role) {
  const email = emailDe(role);
  let user = await acharUsuarioPorEmail(email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email, password: senhaDe(role), email_confirm: true,
    });
    if (error) throw error;
    user = data.user;
    process.stdout.write(`  criado ${role.padEnd(12)} `);
  } else {
    // garante a senha conhecida
    await admin.auth.admin.updateUserById(user.id, { password: senhaDe(role) });
    process.stdout.write(`  existe ${role.padEnd(12)} `);
  }
  // perfil aprovado com o papel
  const { error: upErr } = await admin.from('users').upsert({
    id: user.id, email, name: `Teste ${role}`, role, status: 'approved',
  }, { onConflict: 'id' });
  if (upErr) throw upErr;
  console.log('perfil ok');
}

export async function seed() {
  console.log('Semeando usuários de teste (um por papel)…');
  for (const role of ROLES) await seedRole(role);
  console.log('\n✅ Seed concluído. Senhas: Teste!<papel>123 (ex.: Teste!admin123).');
}

// Só executa o seed quando rodado diretamente (não ao ser importado pelo teste).
import { argv } from 'node:process';
if (import.meta.url === new URL(`file://${argv[1].replace(/\\/g, '/')}`).href
    || argv[1]?.endsWith('03-seed-teste.mjs')) {
  seed().catch(e => { console.error('\n❌ Erro no seed:', e.message); process.exitCode = 1; });
}
