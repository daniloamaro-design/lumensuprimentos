#!/usr/bin/env node
/**
 * 15-usuarios-auth.mjs — importa os usuários do Firebase Auth para o Supabase Auth
 * PRESERVANDO as senhas (Firebase Scrypt → GoTrue $fbscrypt$).
 *
 *   node tools/migracao/15-usuarios-auth.mjs
 *
 * Como o auth.users.id do Supabase é UUID e o Firebase usa id de texto, geramos um
 * UUID DETERMINÍSTICO (uuid v5) a partir do uid do Firebase, e reescrevemos:
 *   - users.id (perfil)
 *   - todas as colunas *_uid das tabelas transacionais
 * Idempotente: uuid v5 é estável; inserts com ON CONFLICT; updates só afetam quem
 * ainda estava com o uid antigo. Ignora contas anônimas (convidados).
 *
 * Requer: tools/migracao/data/auth-users.json (firebase auth:export) já gerado.
 */
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { DATABASE_URL, exigir } from './env.mjs';
import { getHashConfig, fbscryptEncoded } from './hashconfig.mjs';

exigir('DATABASE_URL', DATABASE_URL);
const AQUI = dirname(fileURLToPath(import.meta.url));
const exportUsers = JSON.parse(readFileSync(join(AQUI, 'data', 'auth-users.json'), 'utf8')).users;

// UUID v5 determinístico (namespace fixo) a partir do uid do Firebase.
const NS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // namespace DNS padrão
function uuidV5(nome) {
  const nsBytes = Buffer.from(NS.replace(/-/g, ''), 'hex');
  const hash = crypto.createHash('sha1').update(nsBytes).update(nome).digest();
  const b = hash.subarray(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50; // versão 5
  b[8] = (b[8] & 0x3f) | 0x80; // variante
  const h = b.toString('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

// Colunas *_uid a remapear (tabela → colunas que guardam uid de usuário do Firebase).
const UID_COLS = {
  movements: ['registered_uid'], orders: ['requester_uid'], ajustes: ['solicitante_uid'],
  var_solicitacoes: ['solicitante_uid'], var_orcamentos: ['registrado_uid'],
  var_propostas: ['autor_uid'], audit_logs: ['usuario_uid'],
};

const hc = await getHashConfig();
const db = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

let comSenha = 0, anon = 0, perfis = 0, remaps = 0;
const mapa = {}; // firebaseUid → uuid

for (const u of exportUsers) {
  const fbUid = u.localId;
  const email = u.email;
  if (!email || !u.passwordHash || !u.salt) { anon++; continue; } // anônimos/sem senha: ignora
  const id = uuidV5(fbUid);
  mapa[fbUid] = id;
  const encrypted = fbscryptEncoded(hc, u.salt, u.passwordHash);
  const createdAt = u.createdAt ? new Date(Number(u.createdAt)).toISOString() : new Date().toISOString();

  await db.query(`
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change, email_change_token_new,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token)
    values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, $3,
      now(), $4, now(), '{"provider":"email","providers":["email"]}', '{}',
      '', '', '', '', '', '', '', '')
    on conflict (id) do update set encrypted_password = excluded.encrypted_password, email = excluded.email`,
    [id, email, encrypted, createdAt]);

  await db.query(`
    insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), $1, $2, $3, 'email', now(), now(), now())
    on conflict (provider_id, provider) do update set user_id = excluded.user_id, identity_data = excluded.identity_data`,
    [id, id, JSON.stringify({ sub: id, email, email_verified: true })]);
  comSenha++;
}

// Remapeia o perfil (users.id) e todas as referências *_uid.
for (const [fbUid, id] of Object.entries(mapa)) {
  const p = await db.query('update users set id = $1 where id = $2', [id, fbUid]);
  perfis += p.rowCount;
  for (const [tab, cols] of Object.entries(UID_COLS)) {
    for (const col of cols) {
      const r = await db.query(`update ${tab} set ${col} = $1 where ${col} = $2`, [id, fbUid]);
      remaps += r.rowCount;
    }
  }
  // se não havia perfil, cria um pendente (login funciona, acesso de convidado até aprovação)
  const existe = await db.query('select 1 from users where id = $1', [id]);
  if (!existe.rowCount) {
    const email = exportUsers.find(u => u.localId === fbUid)?.email;
    await db.query(`insert into users (id, email, name, role, status) values ($1, $2, $3, 'usuario', 'pending')
                    on conflict (id) do nothing`, [id, email, email]);
  }
}

console.log(`✅ Import de usuários concluído:`);
console.log(`   ${comSenha} contas com senha importadas (login preservado)`);
console.log(`   ${anon} contas anônimas ignoradas (convidados)`);
console.log(`   ${perfis} perfis remapeados para UUID; ${remaps} referências *_uid atualizadas`);

await db.end();
process.exit(0);
