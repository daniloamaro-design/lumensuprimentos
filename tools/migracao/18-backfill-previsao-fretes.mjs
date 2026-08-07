#!/usr/bin/env node
/**
 * 18-backfill-previsao-fretes.mjs — estima previsao_entrega pros fretes
 * antigos já ENTREGUES que nunca tiveram esse campo (nem no sistema atual
 * nem no antigo, que também não tinha). Regra combinada com o usuário
 * (2026-08-07): previsao_entrega = data do frete + N dias, marcada como
 * previsao_estimada=true (distingue de previsão real informada por alguém).
 * Só mexe em fretes com status='entregue' e previsao_entrega ainda nula —
 * nunca sobrescreve uma previsão real já informada, nem mexe em fretes
 * ainda em transporte (esses devem receber previsão real, não estimada).
 *
 *   node tools/migracao/18-backfill-previsao-fretes.mjs             # dry-run
 *   node tools/migracao/18-backfill-previsao-fretes.mjs --aplicar   # grava
 */
import pg from 'pg';
import { DATABASE_URL, exigir } from './env.mjs';

exigir('DATABASE_URL', DATABASE_URL);
const APLICAR = process.argv.includes('--aplicar');
const DIAS = parseInt(process.argv.find(a => /^--dias=/.test(a))?.split('=')[1] || '2', 10);

async function main() {
  const db = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();

  const alvo = await db.query(
    `select id, code, data from fretes where status='entregue' and previsao_entrega is null and data is not null order by data`
  );
  console.log(`📄 ${alvo.rowCount} fretes entregues sem previsão (regra: data + ${DIAS} dia(s)).`);
  if (!alvo.rowCount) { await db.end(); return; }

  console.log('Exemplo:', alvo.rows[0]);

  if (!APLICAR) {
    console.log('\n🔎 DRY-RUN — nada foi gravado. Rode com --aplicar para gravar de verdade.');
    await db.end();
    return;
  }

  const hist = JSON.stringify({
    acao: `Previsão de entrega estimada retroativamente: data + ${DIAS} dia(s) (frete antigo, sem previsão real registrada)`,
    por: 'Sistema (backfill)', data: new Date().toISOString(),
  });

  const r = await db.query(
    `update fretes
       set previsao_entrega = (data + $1::int)::date,
           previsao_estimada = true,
           historico = coalesce(historico, '[]'::jsonb) || jsonb_build_array($2::jsonb)
     where status='entregue' and previsao_entrega is null and data is not null`,
    [DIAS, hist]
  );
  console.log(`✅ ${r.rowCount} fretes atualizados com previsão estimada.`);

  await db.end();
}

main().catch(e => { console.error('❌ Erro:', e.message, '\n', e.stack); process.exitCode = 1; });
