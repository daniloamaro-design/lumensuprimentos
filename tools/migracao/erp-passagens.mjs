#!/usr/bin/env node
/**
 * erp-passagens.mjs — migra o módulo Passagens (Firebase lumen-passagens) para o
 * Supabase do ERP. Idempotente. Reusa os padrões da migração do Suprimentos.
 *
 *   node tools/migracao/erp-passagens.mjs
 *
 * - compras_financeiro (830) → compras_financeiro (modulo='passagens', extra jsonb)
 * - passagens_solicitacoes (4) → tabela própria
 * - passagens_fornecedores (12) → suppliers (mescla por nome, tipos += 'passagens')
 * - users (6) → users (mescla por email)
 * - configuracoes → config
 */
import crypto from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import pg from 'pg';
import { initializeApp, cert, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { DATABASE_URL, exigir } from './env.mjs';

exigir('DATABASE_URL', DATABASE_URL);

// chave de serviço do Passagens
let saPath = '';
for (const l of readFileSync(new URL('./.env', import.meta.url), 'utf8').split('\n')) {
  const m = l.match(/^\s*FIREBASE_SA_PASSAGENS\s*=\s*(.+)/); if (m) saPath = m[1].trim().replace(/^["']|["']$/g, '');
}
if (!saPath || !existsSync(saPath)) { console.error('❌ FIREBASE_SA_PASSAGENS ausente/arquivo não existe'); process.exit(1); }
const app = initializeApp({ credential: cert(JSON.parse(readFileSync(saPath, 'utf8'))) }, 'passagens');
const fs = getFirestore(app);
const db = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

// helpers
const S = (v) => (v == null ? null : String(v));
const N = (v) => (v == null || v === '' ? null : Number(v));
const TS = (v) => (v && v.toDate ? v.toDate().toISOString() : (v == null || v === '' ? null : String(v)));
function dataQualquer(v) {                       // "DD/MM/YYYY" | "YYYY-MM-DD" | ISO
  if (!v) return null; const s = String(v);
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/); if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}
const NS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
function uuidV5(nome) {
  const b = crypto.createHash('sha1').update(Buffer.from(NS.replace(/-/g, ''), 'hex')).update(String(nome)).digest().subarray(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50; b[8] = (b[8] & 0x3f) | 0x80; const h = b.toString('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
const docs = async (col) => (await fs.collection(col).get()).docs.map(d => ({ _id: d.id, ...d.data() }));

async function main() {
  await db.connect();
  console.log('🔌 Conectado. Migrando Passagens…\n');

  // ── users (mescla por email) ──
  // Perfis válidos no ERP hoje; os do Passagens fora dessa lista viram 'usuario'
  // (a tela de permissões editáveis, na U4, ajusta depois).
  const ROLES_OK = new Set(['admin','diretor','gerente','coordenador','financeiro','compras','estoque','escritorio','csl','coord_csl','usuario']);
  let usersNovos = 0;
  for (const u of await docs('users')) {
    const email = S(u.email); if (!email) continue;
    const existe = await db.query('select 1 from users where lower(email)=lower($1)', [email]);
    if (existe.rowCount) continue; // já existe (provável mesma pessoa do Suprimentos)
    const role = ROLES_OK.has(u.role) ? u.role : 'usuario';
    await db.query(`insert into users (id,email,name,role,status) values ($1,$2,$3,$4,$5) on conflict (id) do nothing`,
      [uuidV5(u._id), email, S(u.name || u.nome), role, u.approved ? 'approved' : 'pending']);
    usersNovos++;
  }
  console.log(`users: +${usersNovos} novos (demais já existiam por email)`);

  // ── fornecedores → suppliers (mescla por nome; tipos += passagens) ──
  let fornNovos = 0, fornMerge = 0;
  for (const f of await docs('passagens_fornecedores')) {
    const nome = S(f.nome); if (!nome) continue;
    const ex = await db.query('select id, tipos from suppliers where lower(nome)=lower($1) limit 1', [nome]);
    if (ex.rowCount) {
      const tipos = new Set([...(ex.rows[0].tipos || []), 'passagens']);
      await db.query('update suppliers set tipos=$1 where id=$2', [[...tipos], ex.rows[0].id]);
      fornMerge++;
    } else {
      await db.query(`insert into suppliers (id,nome,cnpj,obs,tel,pix,tipos,created_at)
                      values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [f._id, nome, S(f.cnpj), S(f.obs), S(f.tel), S(f.pix), ['passagens'], TS(f.criadoEm) || new Date().toISOString()]);
      fornNovos++;
    }
  }
  console.log(`suppliers: +${fornNovos} novos, ${fornMerge} mesclados (tipo passagens)`);

  // ── compras_financeiro (modulo=passagens) ──
  let fin = 0;
  for (const d of await docs('compras_financeiro')) {
    await db.query(`
      insert into compras_financeiro (id, modulo, ano, mes, destinatario, fornecedor, valor,
        data_compra_str, data_compra, vencimento_str, vencimento, pago, importado_em, extra)
      values ($1,'passagens',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      on conflict (id) do update set modulo='passagens', valor=excluded.valor, pago=excluded.pago, extra=excluded.extra`,
      [d._id, N(d.ano), S(d.mes), S(d.destinatario), S(d.fornecedor), N(d.valor) || 0,
       S(d.dataCompra), dataQualquer(d.dataCompra), S(d.vencimento), dataQualquer(d.vencimento),
       S(d.pago), TS(d.importadoEm),
       JSON.stringify({ passageiro: d.passageiro, passagem: d.passagem, dataSaida: d.dataSaida,
         tipo: d.tipo, status: d.status, solicitante: d.solicitante, motivo: d.motivo, parcelado: d.parcelado })]);
    fin++;
  }
  console.log(`compras_financeiro: ${fin} lançamentos (modulo=passagens)`);

  // ── passagens_solicitacoes ──
  let sol = 0;
  for (const d of await docs('passagens_solicitacoes')) {
    await db.query(`
      insert into passagens_solicitacoes (id,codigo,tipo,solicitante,solicitante_uid,passageiro,origem,destino,
        saida,retorno,turno,motivo,bagagem,pix,obs,orcamentos,valor_final,fornecedor,data_compra,ticket_img,
        num_bilhete,status,historico,motivo_reprovacao,motivo_cancelamento,criado_em)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
      on conflict (id) do update set status=excluded.status, historico=excluded.historico`,
      [d._id, S(d.codigo), S(d.tipo), S(d.solicitante), S(d.solicitanteUid), S(d.passageiro), S(d.origem), S(d.destino),
       S(d.saida), S(d.retorno), S(d.turno), S(d.motivo), S(d.bagagem), S(d.pix), S(d.obs),
       JSON.stringify(d.orcamentos || []), d.valorFinal ? JSON.stringify(d.valorFinal) : null,
       d.fornecedor ? JSON.stringify(d.fornecedor) : null, d.dataCompra ? JSON.stringify(d.dataCompra) : null,
       d.ticketImg ? JSON.stringify(d.ticketImg) : null, d.numBilhete ? JSON.stringify(d.numBilhete) : null,
       S(d.status), JSON.stringify(d.historico || []), S(d.motivoReprovacao), S(d.motivoCancelamento), TS(d.criadoEm)]);
    sol++;
  }
  console.log(`passagens_solicitacoes: ${sol}`);

  // ── configuracoes → config ──
  for (const d of await docs('configuracoes')) {
    const { _id, ...resto } = d;
    await db.query(`insert into config (chave,valor,updated_at) values ($1,$2,now())
                    on conflict (chave) do update set valor=excluded.valor`,
      ['passagens_' + _id, JSON.stringify(resto)]);
  }
  console.log('config: passagens_* gravado');

  // ── verificação ──
  const vFire = (await fs.collection('compras_financeiro').get()).docs.reduce((s, d) => s + (Number(d.data().valor) || 0), 0);
  const vSupa = Number((await db.query("select coalesce(sum(valor),0) s from compras_financeiro where modulo='passagens'")).rows[0].s);
  console.log(`\n── Verificação financeiro Passagens ──`);
  console.log(`  Firebase Σ valor: R$ ${vFire.toFixed(2)}`);
  console.log(`  Supabase Σ valor: R$ ${vSupa.toFixed(2)}`);
  console.log(vFire.toFixed(2) === vSupa.toFixed(2) ? '  ✅ confere' : '  ❌ diverge');
  const consolidado = Number((await db.query('select coalesce(sum(valor),0) s from compras_financeiro')).rows[0].s);
  console.log(`\n💰 Financeiro CONSOLIDADO (todos os módulos): R$ ${consolidado.toFixed(2)}`);
}

main().catch(e => { console.error('❌ Erro:', e.message, '\n', e.stack); process.exitCode = 1; })
  .finally(async () => { await db.end(); await deleteApp(app); });
