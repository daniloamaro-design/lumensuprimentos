// env.mjs — lê tools/migracao/.env (arquivo LOCAL, gitignored) sem imprimir valores.
// Nunca faça console.log das chaves. Este módulo só as expõe para outros scripts.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const CAMINHO = join(AQUI, '.env');

if (!existsSync(CAMINHO)) {
  console.error('❌ Arquivo tools/migracao/.env não encontrado.');
  console.error('   Crie-o a partir de tools/migracao/.env.exemplo (instruções no cabeçalho).');
  process.exit(1);
}

const env = {};
for (const linha of readFileSync(CAMINHO, 'utf8').split('\n')) {
  const s = linha.trim();
  if (!s || s.startsWith('#')) continue;
  const i = s.indexOf('=');
  if (i === -1) continue;
  env[s.slice(0, i).trim()] = s.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}

export const SUPABASE_URL   = env.SUPABASE_URL   || 'https://saalwqfjhnvleltqfftr.supabase.co';
export const SERVICE_KEY    = env.SUPABASE_SERVICE_KEY || '';
export const ANON_KEY       = env.SUPABASE_ANON_KEY || 'sb_publishable_N23E2SHI9SBehB8-f-OF3g_W_8T2JEk';
export const DATABASE_URL   = env.DATABASE_URL   || '';

export function exigir(nome, valor) {
  if (!valor) {
    console.error(`❌ Falta ${nome} no tools/migracao/.env`);
    process.exit(1);
  }
  return valor;
}
