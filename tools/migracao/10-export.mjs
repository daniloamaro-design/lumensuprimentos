#!/usr/bin/env node
/**
 * 10-export.mjs — exporta TODAS as coleções do Firestore para NDJSON (uma linha/doc).
 * Somente leitura. Usa uma chave de conta de serviço (não expira).
 * Saída: tools/migracao/data/<colecao>.ndjson  (pasta gitignored)
 *
 *   node tools/migracao/10-export.mjs
 *
 * Requer FIREBASE_SA_PATH em tools/migracao/.env apontando para o JSON da conta de serviço.
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import admin from 'firebase-admin';

const AQUI = dirname(fileURLToPath(import.meta.url));
const DATA = join(AQUI, 'data');
mkdirSync(DATA, { recursive: true });

// lê FIREBASE_SA_PATH do .env
import { readFileSync } from 'node:fs';
const envFile = join(AQUI, '.env');
let saPath = process.env.FIREBASE_SA_PATH || '';
if (!saPath && existsSync(envFile)) {
  for (const l of readFileSync(envFile, 'utf8').split('\n')) {
    const m = l.match(/^\s*FIREBASE_SA_PATH\s*=\s*(.+)$/);
    if (m) saPath = m[1].trim().replace(/^["']|["']$/g, '');
  }
}
if (!saPath) { console.error('❌ Falta FIREBASE_SA_PATH no tools/migracao/.env'); process.exit(1); }
if (!isAbsolute(saPath)) saPath = join(AQUI, saPath);
if (!existsSync(saPath)) { console.error('❌ Chave de serviço não encontrada em:', saPath); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(saPath, 'utf8'))) });
const db = admin.firestore();

const COLECOES = [
  'movements','orders','quotations','compras_financeiro','transferencias','transferencias_financeiras',
  'prices','prices_historico','percapitas','ajustes',
  'var_solicitacoes','var_orcamentos','var_propostas','var_setores','var_counters',
  'kanban_tasks','users','audit_logs','audit_log',
  'houses','suppliers','produtos_config','produtos_removidos','categorias_config',
  'casas_config','casas_override','casas_removidas','casas_blocos','casas_tipo_compra',
  'cidades_config','cidades_override','cidades_removidas',
  'centros_custo','centro_custo_categorias','metas','metas_historico',
  'config','cardapioPlanos','usuarios_perfis',
];

// Timestamps → ISO string; resto do JSON normal.
function serialize(obj) {
  return JSON.stringify(obj, (_k, v) => {
    if (v && typeof v === 'object' && typeof v.toDate === 'function') return v.toDate().toISOString();
    return v;
  });
}

let total = 0;
for (const col of COLECOES) {
  const snap = await db.collection(col).get();
  const linhas = snap.docs.map(d => serialize({ _id: d.id, ...d.data() }));
  writeFileSync(join(DATA, `${col}.ndjson`), linhas.join('\n') + (linhas.length ? '\n' : ''));
  total += linhas.length;
  console.log(String(linhas.length).padStart(6), col);
}
console.log('─'.repeat(30));
console.log(String(total).padStart(6), 'documentos exportados →', DATA);
process.exit(0);
