#!/usr/bin/env node
/**
 * erp-fretes.mjs — migra o módulo Fretes (Firebase lumen-fretes) para o Supabase do ERP.
 * Idempotente.
 *   node tools/migracao/erp-fretes.mjs
 *
 * - fretes (435) → fretes ; fretes_metas (18) → fretes_metas
 * - freteiros (10) → suppliers (mescla por nome, tipos += 'frete')
 * - casas_lumen (21) → houses (mescla por nome; garante cidade na tabela cidades)
 * - fretes_users (3) → users (mescla por email)
 * - fretes_counters/fretes_acertos/import_log: NÃO migram (contadores/vazios)
 */
import crypto from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import pg from 'pg';
import { initializeApp, cert, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { DATABASE_URL, exigir } from './env.mjs';

exigir('DATABASE_URL', DATABASE_URL);
let saPath = '';
for (const l of readFileSync(new URL('./.env', import.meta.url), 'utf8').split('\n')) {
  const m = l.match(/^\s*FIREBASE_SA_FRETES\s*=\s*(.+)/); if (m) saPath = m[1].trim().replace(/^["']|["']$/g, '');
}
if (!saPath || !existsSync(saPath)) { console.error('❌ FIREBASE_SA_FRETES ausente'); process.exit(1); }
const app = initializeApp({ credential: cert(JSON.parse(readFileSync(saPath, 'utf8'))) }, 'fretes');
const fs = getFirestore(app);
const db = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

const S = (v) => (v == null ? null : String(v));
const N = (v) => (v == null || v === '' ? null : Number(v));
const TS = (v) => (v && v.toDate ? v.toDate().toISOString() : (v == null || v === '' ? null : String(v)));
const AGORA = () => new Date().toISOString();
function dataQualquer(v) { if (!v) return null; const s = String(v); let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/); if (m) return `${m[3]}-${m[2]}-${m[1]}`; if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10); return null; }
const NS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
function uuidV5(nome) { const b = crypto.createHash('sha1').update(Buffer.from(NS.replace(/-/g, ''), 'hex')).update(String(nome)).digest().subarray(0, 16); b[6] = (b[6] & 0x0f) | 0x50; b[8] = (b[8] & 0x3f) | 0x80; const h = b.toString('hex'); return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`; }
const J = (v) => (v == null ? null : JSON.stringify(v));
const docs = async (col) => (await fs.collection(col).get()).docs.map(d => ({ _id: d.id, ...d.data() }));

async function main() {
  await db.connect();
  console.log('🔌 Conectado. Migrando Fretes…\n');
  const ROLES_OK = new Set(['admin','diretor','gerente','coordenador','financeiro','compras','estoque','escritorio','csl','coord_csl','usuario']);

  // ── users (mescla por email) ──
  let uNovos = 0;
  for (const u of await docs('fretes_users')) {
    const email = S(u.email); if (!email) continue;
    if ((await db.query('select 1 from users where lower(email)=lower($1)', [email])).rowCount) continue;
    await db.query('insert into users (id,email,name,role,status) values ($1,$2,$3,$4,$5) on conflict (id) do nothing',
      [uuidV5(u._id), email, S(u.name), ROLES_OK.has(u.role) ? u.role : 'usuario', S(u.status) === 'approved' ? 'approved' : 'pending']);
    uNovos++;
  }
  console.log(`users: +${uNovos} novos`);

  // ── freteiros → suppliers (tipo frete) ──
  let fNovos = 0, fMerge = 0;
  for (const f of await docs('freteiros')) {
    const nome = S(f.nome); if (!nome) continue;
    const ex = await db.query('select id,tipos from suppliers where lower(nome)=lower($1) limit 1', [nome]);
    if (ex.rowCount) {
      await db.query('update suppliers set tipos=$1 where id=$2', [[...new Set([...(ex.rows[0].tipos || []), 'frete'])], ex.rows[0].id]); fMerge++;
    } else {
      await db.query('insert into suppliers (id,nome,cnpj,obs,tel,pix,tipos,created_at) values ($1,$2,$3,$4,$5,$6,$7,$8)',
        [f._id, nome, S(f.cpf), S(f.obs), S(f.telefone), S(f.pix_chave), ['frete'], TS(f.createdAt) || AGORA()]); fNovos++;
    }
  }
  console.log(`suppliers: +${fNovos} novos, ${fMerge} mesclados (tipo frete)`);

  // ── casas_lumen → houses (mescla por nome; garante cidade) ──
  let cNovas = 0, cMerge = 0;
  for (const c of await docs('casas_lumen')) {
    const nome = S(c.nome); if (!nome) continue;
    const cidade = S(c.cidade);
    if (cidade) await db.query('insert into cidades (nome,ativo) values ($1,true) on conflict (nome) do nothing', [cidade]);
    const ex = await db.query('select id from houses where lower(nome)=lower($1) limit 1', [nome]);
    const endereco = [c.rua, c.numero, c.bairro, c.uf].filter(Boolean).join(', ') || null;
    if (ex.rowCount) { // enriquece o que estiver faltando
      await db.query('update houses set cidade=coalesce(cidade,$1), endereco=coalesce(endereco,$2) where id=$3', [cidade, endereco, ex.rows[0].id]); cMerge++;
    } else {
      await db.query('insert into houses (id,nome,cidade,endereco,ativo,acolhidos,coordenadores,extra,current_people,created_at) values ($1,$2,$3,$4,true,0,0,0,0,$5)',
        [c._id, nome, cidade, endereco, TS(c.createdAt) || AGORA()]); cNovas++;
    }
  }
  console.log(`houses: +${cNovas} novas, ${cMerge} mescladas`);

  // ── fretes ──
  let fr = 0;
  for (const d of await docs('fretes')) {
    await db.query(`insert into fretes (id,code,data,date_str,freteiro_id,freteiro_nome,origem,destino,motivo,
      tipo_carga,valor,valor_pago,status,status_pag,forma_pag,etapa_status,paradas,avaliacao,historico,
      importado,importado_planilha,solicitado_por,importado_por,created_by,created_by_uid,updated_by,obs,created_at,updated_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
      on conflict (id) do update set status=excluded.status, status_pag=excluded.status_pag, valor=excluded.valor, valor_pago=excluded.valor_pago, historico=excluded.historico`,
      [d._id, S(d.code), dataQualquer(d.data), S(d.dateStr), S(d.freteiro_id), S(d.freteiro_nome), S(d.origem), S(d.destino), S(d.motivo),
       J(d.tipo_carga), N(d.valor) || 0, N(d.valor_pago) || 0, S(d.status), S(d.status_pag), S(d.forma_pag), S(d.etapa_status),
       J(d.paradas || []), J(d.avaliacao), J(d.historico || []), !!d.importado, !!d.importadoPlanilha, S(d.solicitadoPor), S(d.importadoPor),
       S(d.createdBy), S(d.createdByUid), S(d.updatedBy), S(d.obs), TS(d.createdAt) || AGORA(), TS(d.updatedAt) || AGORA()]);
    fr++;
  }
  console.log(`fretes: ${fr}`);

  // ── fretes_metas ──
  let me = 0;
  for (const d of await docs('fretes_metas')) {
    await db.query(`insert into fretes_metas (id,mes,semanal,mensal,anual,obs,retroativa,criado_por,criado_em)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (id) do update set semanal=excluded.semanal, mensal=excluded.mensal, anual=excluded.anual`,
      [d._id, S(d.mes), N(d.semanal) || 0, N(d.mensal) || 0, N(d.anual) || 0, S(d.obs), !!d.retroativa, S(d.criadoPor), TS(d.criadoEm) || AGORA()]);
    me++;
  }
  console.log(`fretes_metas: ${me}`);

  // ── verificação ──
  const vFire = (await fs.collection('fretes').get()).docs.reduce((s, d) => s + (Number(d.data().valor) || 0), 0);
  const vSupa = Number((await db.query('select coalesce(sum(valor),0) s from fretes')).rows[0].s);
  console.log(`\n── Verificação valor dos fretes ──`);
  console.log(`  Firebase Σ: R$ ${vFire.toFixed(2)}  |  Supabase Σ: R$ ${vSupa.toFixed(2)}  ${vFire.toFixed(2) === vSupa.toFixed(2) ? '✅' : '❌'}`);
  const consol = Number((await db.query('select coalesce(sum(valor),0) s from compras_financeiro')).rows[0].s) + vSupa;
  console.log(`\n💰 Financeiro consolidado + fretes: R$ ${consol.toFixed(2)}`);
}
main().catch(e => { console.error('❌ Erro:', e.message, '\n', e.stack); process.exitCode = 1; })
  .finally(async () => { await db.end(); await deleteApp(app); });
