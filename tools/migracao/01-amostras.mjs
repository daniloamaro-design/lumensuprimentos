#!/usr/bin/env node
/**
 * 01-amostras.mjs — FASE 1: coleta amostras de documentos por coleção (somente leitura)
 * e imprime um resumo de campos/tipos para a modelagem do schema Postgres.
 *
 * Uso: TOKEN=$(gcloud auth print-access-token) node tools/migracao/01-amostras.mjs [colecao]
 */

const PROJETO = 'automacao-logistica2040';
const TOKEN = process.env.TOKEN;
if (!TOKEN) { console.error('Defina TOKEN'); process.exit(1); }

const COLECOES = process.argv[2] ? [process.argv[2]] : [
  'movements', 'orders', 'quotations', 'compras_financeiro', 'transferencias',
  'prices', 'prices_historico', 'percapitas',
  'var_solicitacoes', 'var_orcamentos', 'var_propostas', 'var_setores', 'var_counters',
  'kanban_tasks', 'users', 'audit_logs', 'audit_log',
  'houses', 'suppliers', 'produtos_config', 'produtos_removidos', 'categorias_config',
  'casas_config', 'casas_override', 'casas_blocos',
  'centros_custo', 'centro_custo_categorias', 'metas', 'metas_historico',
  'config', 'cardapioPlanos', 'usuarios_perfis',
];

const URL = `https://firestore.googleapis.com/v1/projects/${PROJETO}/databases/(default)/documents:runQuery`;

function tipoDe(v) {
  if ('stringValue' in v) return 'string';
  if ('integerValue' in v) return 'int';
  if ('doubleValue' in v) return 'double';
  if ('booleanValue' in v) return 'bool';
  if ('timestampValue' in v) return 'timestamp';
  if ('nullValue' in v) return 'null';
  if ('mapValue' in v) return 'map{' + Object.keys(v.mapValue.fields || {}).slice(0, 12).join(',') + '}';
  if ('arrayValue' in v) {
    const arr = v.arrayValue.values || [];
    return arr.length ? `array<${tipoDe(arr[0])}>` : 'array<vazio>';
  }
  if ('referenceValue' in v) return 'ref';
  return '?';
}
function valorCurto(v) {
  if ('stringValue' in v) return JSON.stringify(v.stringValue.slice(0, 40));
  if ('integerValue' in v) return v.integerValue;
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  return '';
}

for (const col of COLECOES) {
  const resp = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: col }], limit: 3 } }),
  });
  const data = await resp.json();
  const docs = (Array.isArray(data) ? data : []).filter(x => x.document).map(x => x.document);
  console.log(`\n══════ ${col} (${docs.length} amostras) ══════`);
  if (!docs.length) { console.log('  (vazia ou erro)'); continue; }
  // União dos campos de todas as amostras
  const campos = new Map();
  for (const d of docs) {
    for (const [nome, val] of Object.entries(d.fields || {})) {
      const t = tipoDe(val);
      if (!campos.has(nome)) campos.set(nome, { tipos: new Set(), exemplo: valorCurto(val) });
      campos.get(nome).tipos.add(t);
    }
  }
  console.log('  id exemplo:', docs[0].name.split('/').pop());
  for (const [nome, info] of [...campos.entries()].sort()) {
    console.log(`  ${nome.padEnd(26)} ${[...info.tipos].join(' | ').padEnd(30)} ${info.exemplo}`);
  }
}
