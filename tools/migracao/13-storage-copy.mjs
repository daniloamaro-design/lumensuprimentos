#!/usr/bin/env node
/**
 * 13-storage-copy.mjs — copia NF/boletos do Firebase Storage para o bucket 'pedidos'
 * do Supabase e reescreve os caminhos nos pedidos. Idempotente (upsert).
 *
 *   node tools/migracao/13-storage-copy.mjs
 *
 * Estrutura de origem: pedidos/{orderId}/{nf_...|boleto_...}.pdf
 * Destino (bucket 'pedidos'): {orderId}/{filename}  (sem o prefixo 'pedidos/')
 * Colunas atualizadas: orders.nf_file_url / orders.boleto_file_url = caminho no bucket.
 * (A FASE 4 gera signed URLs a partir desse caminho — bucket é privado.)
 */
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { SUPABASE_URL, SERVICE_KEY, DATABASE_URL, exigir } from './env.mjs';

exigir('SUPABASE_SERVICE_KEY', SERVICE_KEY);
exigir('DATABASE_URL', DATABASE_URL);

// resolve chave de serviço (aceita pasta)
let sa = '';
for (const l of readFileSync(new URL('./.env', import.meta.url), 'utf8').split('\n')) {
  const m = l.match(/^\s*FIREBASE_SA_PATH\s*=\s*(.+)$/); if (m) sa = m[1].trim().replace(/^["']|["']$/g, '');
}
if (statSync(sa).isDirectory()) sa = join(sa, readdirSync(sa).find(f => f.endsWith('.json')));
const cred = JSON.parse(readFileSync(sa, 'utf8'));
initializeApp({ credential: cert(cred), storageBucket: cred.project_id + '.firebasestorage.app' });
const bucket = getStorage().bucket();

const supa = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const db = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

// Supabase Storage não aceita acentos, $, espaços, () etc. na chave.
// Higieniza mantendo extensão e legibilidade; orderId é alfanumérico (seguro).
function sanitize(nome) {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '')  // remove acentos
    .replace(/[^a-zA-Z0-9._-]/g, '_')                            // só caracteres seguros
    .replace(/_+/g, '_');                                        // colapsa __ repetidos
}

const [files] = await bucket.getFiles({ prefix: 'pedidos/' });
console.log(`Copiando ${files.length} arquivos…`);

const usados = new Set();
let copiados = 0, atualizados = 0, erros = 0;
for (const f of files) {
  const partes = f.name.split('/');            // pedidos / {orderId} / {filename}
  if (partes.length < 3) continue;
  const orderId = partes[1];
  const filename = sanitize(partes.slice(2).join('/'));
  const destino = `${orderId}/${filename}`;     // caminho dentro do bucket 'pedidos'
  usados.add(destino);
  const tipo = filename.startsWith('boleto') ? 'boleto' : 'nf';
  try {
    const [buf] = await f.download();
    const contentType = f.metadata.contentType || (filename.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');
    const { error: upErr } = await supa.storage.from('pedidos').upload(destino, buf, { contentType, upsert: true });
    if (upErr) { console.log('  ⚠️ upload', destino, upErr.message); erros++; continue; }
    copiados++;
    const col = tipo === 'boleto' ? 'boleto_file_url' : 'nf_file_url';
    const r = await db.query(`update orders set ${col}=$1 where id=$2`, [destino, orderId]);
    atualizados += r.rowCount;
  } catch (e) { console.log('  ⚠️', destino, e.message); erros++; }
  if (copiados % 50 === 0 && copiados) process.stdout.write(`   ${copiados}…\n`);
}

console.log(`\n✅ ${copiados} arquivos copiados, ${atualizados} links de pedido atualizados, ${erros} erros.`);

// Limpeza de órfãos: remove objetos no bucket que não estão no conjunto atual
// (ex.: chaves antigas não-higienizadas de execuções anteriores).
let orfaos = 0;
const { data: pastas } = await supa.storage.from('pedidos').list('', { limit: 1000 });
for (const p of (pastas || [])) {
  if (!p.id && p.name) { // é "pasta" (orderId)
    const { data: arqs } = await supa.storage.from('pedidos').list(p.name, { limit: 1000 });
    for (const a of (arqs || [])) {
      const chave = `${p.name}/${a.name}`;
      if (!usados.has(chave)) { await supa.storage.from('pedidos').remove([chave]); orfaos++; }
    }
  }
}
if (orfaos) console.log(`🧹 ${orfaos} objetos órfãos (chaves antigas) removidos.`);

await db.end();
process.exit(0);
