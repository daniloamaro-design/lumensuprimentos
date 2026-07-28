#!/usr/bin/env node
/**
 * 00-contagem.mjs — FASE 0 da migração: conta documentos por coleção no Firestore.
 * Somente leitura. Usa a API REST com token do gcloud (sem service account).
 *
 * Uso:  TOKEN=$(gcloud auth print-access-token) node tools/migracao/00-contagem.mjs
 */

const PROJETO = 'automacao-logistica2040';
const TOKEN = process.env.TOKEN;
if (!TOKEN) {
  console.error('Defina TOKEN: TOKEN=$(gcloud auth print-access-token) node tools/migracao/00-contagem.mjs');
  process.exit(1);
}

const COLECOES = [
  // Transacionais
  'movements', 'orders', 'quotations', 'compras_financeiro', 'transferencias',
  'transferencias_financeiras', 'prices', 'prices_historico', 'percapitas', 'ajustes',
  'var_solicitacoes', 'var_orcamentos', 'var_propostas', 'var_setores', 'var_counters',
  'kanban_tasks', 'users', 'audit_logs', 'audit_log',
  // Config / master-data
  'houses', 'suppliers', 'produtos_config', 'produtos_removidos', 'categorias_config',
  'casas_config', 'casas_override', 'casas_removidas', 'casas_blocos', 'casas_tipo_compra',
  'cidades_config', 'cidades_override', 'cidades_removidas',
  'centros_custo', 'centro_custo_categorias', 'metas', 'metas_historico',
  'config', 'cardapioPlanos',
  // Modelo antigo das rules (verificar se tem dados)
  'usuarios_perfis',
];

const URL = `https://firestore.googleapis.com/v1/projects/${PROJETO}/databases/(default)/documents:runAggregationQuery`;

async function contar(colecao) {
  const body = {
    structuredAggregationQuery: {
      structuredQuery: { from: [{ collectionId: colecao }] },
      aggregations: [{ count: {}, alias: 'total' }],
    },
  };
  const resp = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) return `ERRO HTTP ${resp.status}`;
  const data = await resp.json();
  const r = Array.isArray(data) ? data.find(x => x.result) : null;
  return r ? Number(r.result.aggregateFields.total.integerValue) : 0;
}

let total = 0;
const resultados = [];
for (const c of COLECOES) {
  const n = await contar(c);
  resultados.push([c, n]);
  if (typeof n === 'number') total += n;
  console.log(String(n).padStart(8), ' ', c);
}
console.log('─'.repeat(30));
console.log(String(total).padStart(8), '  TOTAL de documentos');
