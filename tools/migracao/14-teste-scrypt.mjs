#!/usr/bin/env node
/**
 * 14-teste-scrypt.mjs — PROVA que a importação de senhas Firebase→Supabase funciona.
 * Cria um usuário fictício com senha CONHECIDA, gera o hash no formato do Firebase,
 * insere direto em auth.users e tenta logar. Se logar, o mecanismo está validado.
 * Limpa o usuário de teste ao final.
 *
 *   node tools/migracao/14-teste-scrypt.mjs
 */
import crypto from 'node:crypto';
import { FirebaseScrypt } from 'firebase-scrypt';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { SUPABASE_URL, ANON_KEY, SERVICE_KEY, DATABASE_URL, exigir } from './env.mjs';
import { getHashConfig, fbscryptEncoded } from './hashconfig.mjs';

exigir('SUPABASE_SERVICE_KEY', SERVICE_KEY);
exigir('DATABASE_URL', DATABASE_URL);

const EMAIL = 'scrypt-teste@lumen.local';
const SENHA = 'SenhaConhecida#2026';

// Gera um hash com a config REAL do projeto (firebase-scrypt = implementação fiel do
// Firebase). Se o GoTrue aceitar este hash, aceitará também os hashes reais exportados.
const hc = await getHashConfig();
console.log(`Config real: SCRYPT rounds=${hc.rounds} memoryCost=${hc.memoryCost} (chaves ocultas)`);
const scrypt = new FirebaseScrypt({ memCost: hc.memoryCost, rounds: hc.rounds, saltSeparator: hc.saltSeparator, signerKey: hc.signerKey });
const salt = crypto.randomBytes(16).toString('base64');
const hash = await scrypt.hash(SENHA, salt);
const encrypted = fbscryptEncoded(hc, salt, hash);

// 2) insere o usuário direto em auth.users + auth.identities
const db = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
// limpa resíduo anterior (SQL direto; cascata para auth.identities)
await db.query('delete from auth.identities where user_id in (select id from auth.users where email=$1)', [EMAIL]);
await db.query('delete from auth.users where email=$1', [EMAIL]);

const id = crypto.randomUUID();
await db.query(`
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, $3,
    now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}',
    '', '', '', '', '', '', '', '')`,
  [id, EMAIL, encrypted]);
await db.query(`
  insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), $1, $2, $3, 'email', now(), now(), now())`,
  [id, id, JSON.stringify({ sub: id, email: EMAIL, email_verified: true })]);
console.log('Usuário de teste inserido em auth.users.');

// 3) tenta logar com a senha conhecida
const c = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
const { data, error } = await c.auth.signInWithPassword({ email: EMAIL, password: SENHA });
let ok = !error && !!data?.session;
console.log(ok ? '✅ LOGIN OK — o import de senha Firebase→Supabase FUNCIONA.' : '❌ Login falhou: ' + (error?.message || '?'));

// teste negativo: senha errada deve falhar
const { error: errW } = await c.auth.signInWithPassword({ email: EMAIL, password: 'errada' });
console.log(errW ? '✅ senha errada corretamente rejeitada.' : '❌ senha errada foi aceita (!)');

// 4) limpa
await db.query('delete from auth.identities where user_id=$1', [id]).catch(() => {});
await db.query('delete from auth.users where id=$1', [id]).catch(() => {});
await db.end();
process.exit(ok ? 0 : 1);
