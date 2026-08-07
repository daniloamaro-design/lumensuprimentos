#!/usr/bin/env node
/**
 * 17-import-passagens-planilha.mjs — importa o histórico de Passagens a
 * partir da planilha "Controle das passagens" (fonte da verdade escolhida
 * pelo usuário em 2026-08-06, substituindo os 830 lançamentos antigos
 * migrados do Firebase, que tinham duplicidade).
 *
 * Idempotente: ids são determinísticos (uuid v5 a partir da linha), então
 * rodar de novo faz upsert em vez de duplicar.
 *
 *   node tools/migracao/17-import-passagens-planilha.mjs           # dry-run (não grava)
 *   node tools/migracao/17-import-passagens-planilha.mjs --aplicar # grava de verdade
 */
import crypto from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import XLSX from 'xlsx';
import pg from 'pg';
import { DATABASE_URL, exigir } from './env.mjs';

exigir('DATABASE_URL', DATABASE_URL);
const APLICAR = process.argv.includes('--aplicar');
const ARQUIVO = 'C:\\Users\\compu\\Downloads\\Controle das passagens (3).xlsx';

const NS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
function uuidV5(nome) {
  const b = crypto.createHash('sha1').update(Buffer.from(NS.replace(/-/g, ''), 'hex')).update(String(nome)).digest().subarray(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50; b[8] = (b[8] & 0x3f) | 0x80; const h = b.toString('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

// Todas as colunas de data da planilha vêm formatadas M/D/AA (confirmado:
// "2/24/24" só faz sentido como mês=2/dia=24; "4/20/84" só como mês=4/dia=20).
function parseMDY(s) {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null; // ex.: "07/10" sem ano — fica como texto cru, não vira date
  let [, mo, d, y] = m;
  mo = parseInt(mo, 10); d = parseInt(d, 10); y = parseInt(y, 10);
  if (y < 100) y += 2000;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
const MESES = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];
function anoMes(iso) {
  if (!iso) return { ano: null, mes: null };
  const [y, m] = iso.split('-');
  return { ano: parseInt(y, 10), mes: MESES[parseInt(m, 10) - 1] };
}
function parseValor(s) {
  if (!s) return 0;
  const n = parseFloat(String(s).replace('R$', '').trim());
  return isNaN(n) ? 0 : n;
}

// Status da planilha → status do fluxo passagens_solicitacoes do ERP.
// Só "comprada"/"multa"/"" (finalizado) vira lançamento financeiro — as
// demais são solicitações em aberto (sem despesa realizada ainda).
function statusDe(raw) {
  const s = (raw || '').trim().toUpperCase();
  if (s === 'PASSAGEM COMPRADA' || s === 'MULTA' || s === '') return 'comprada';
  if (s === 'COMPRA LIBERADA') return 'aprovada';
  if (s === 'PENDENTE LIBERAÇÃO') return 'pendente';
  return 'pendente';
}

async function main() {
  const wb = XLSX.readFile(ARQUIVO);
  const sh = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sh, { header: 1, raw: false, defval: '' });
  const header = rows[0];
  const col = (name) => header.indexOf(name);
  const data = rows.slice(1).filter(r => r.some(c => String(c).trim() !== ''));
  console.log(`📄 ${data.length} linhas na planilha.`);

  const iSol = col('DATA DA SOLICITAÇÃO'), iNome = col('NOME'), iIda = col('PASSAGEM DE IDA'),
        iPartida = col('DATA DE PARTIDA'), iRetornoData = col('DATA DE RETORNO'), iVolta = col('PASSAGEM DE VOLTA'),
        iSolicitou = col('QUEM SOLICITOU'), iMotivo = col('MOTIVO DA PASSAGEM'), iObs = col('OBSERVAÇÃO/SUGESTÃO'),
        iStatus = col('STATUS DA PASSAGEM'), iCompra = col('DATA DA COMPRA'), iTransporte = col('MEIO DE TRANSPORTE'),
        iAgencia = col('AGENCIA'), iValor = col('VALOR'), iParcelas = col('PARCELADO (Nx)'),
        iValorParcela = col('VALOR PARCELA'), iVenc = col('VENCIMENTO');

  const solicitacoes = [];
  const financeiro = [];
  const agenciasSet = new Set();
  let semValor = 0;

  data.forEach((r, idx) => {
    const nome = (r[iNome] || '').trim();
    if (!nome) return; // linha sem passageiro — ignora
    const trecho = (r[iIda] || '').split(/\s*[-–]\s*/).map(s => s.trim()).filter(Boolean);
    const origem = trecho[0] || '';
    const destino = trecho[1] || '';
    const dataSolIso = parseMDY(r[iSol]);
    const dataPartidaIso = parseMDY(r[iPartida]);
    const dataCompraIso = parseMDY(r[iCompra]);
    const vencIso = parseMDY(r[iVenc]);
    const statusOrig = (r[iStatus] || '').trim();
    const status = statusDe(statusOrig);
    const agencia = (r[iAgencia] || '').trim();
    const valor = parseValor(r[iValor]);
    const motivo = (r[iMotivo] || '').trim();
    const solicitante = (r[iSolicitou] || '').trim();
    const meioTransporte = (r[iTransporte] || '').trim().toLowerCase();
    const parcelasN = (r[iParcelas] || '').trim();
    const volta = (r[iVolta] || '').trim();
    if (agencia) agenciasSet.add(agencia);

    const chave = `pas-planilha-${idx}-${nome}-${r[iSol]}`;
    const id = uuidV5(chave);
    const codigo = `PASS-IMP-${String(idx + 1).padStart(4, '0')}`;

    let obs = (r[iObs] || '').trim();
    if (volta) obs = (obs ? obs + ' | ' : '') + `Volta: ${volta} (${r[iRetornoData] || '—'})`;
    if (statusOrig.toUpperCase() === 'MULTA') obs = (obs ? obs + ' | ' : '') + 'MULTA (não é uma passagem normal)';
    if ((status === 'aprovada' || status === 'pendente') && valor > 0) {
      obs = (obs ? obs + ' | ' : '') + `Valor estimado na planilha: R$ ${valor.toFixed(2)}`;
    }

    const criadoEm = (dataSolIso ? dataSolIso + 'T00:00:00.000Z' : (dataCompraIso ? dataCompraIso + 'T00:00:00.000Z' : new Date().toISOString()));
    const hist = [{ acao: `Importado da planilha "Controle das passagens" (linha ${idx + 2})`, usuario: 'Sistema (importação)', ts: new Date().toISOString() }];

    solicitacoes.push({
      id, codigo, tipo: meioTransporte || null,
      solicitante: solicitante || null, solicitanteUid: null,
      passageiro: nome, origem, destino,
      saida: dataPartidaIso || (r[iPartida] || '') || null,
      retorno: (r[iRetornoData] || '') || null,
      turno: null, motivo: motivo || null, bagagem: null, pix: null,
      obs: obs || null,
      orcamentos: agencia ? [{ fornecedorNome: agencia, valor, selecionada: status !== 'pendente' }] : [],
      valorFinal: (status === 'comprada' && valor > 0) ? valor : null,
      fornecedor: agencia ? { nome: agencia } : null,
      dataCompra: (status === 'comprada' && dataCompraIso) ? dataCompraIso : null,
      numBilhete: null,
      status, historico: hist,
      motivoReprovacao: null, motivoCancelamento: null,
      criadoEm,
    });

    // Financeiro só para o que já foi efetivamente comprado (despesa real).
    if (status === 'comprada' && valor > 0) {
      const baseData = dataCompraIso || dataSolIso;
      const { ano, mes } = anoMes(baseData);
      financeiro.push({
        id: uuidV5(chave + '-fin'),
        ano, mes,
        destinatario: nome,
        fornecedor: agencia || null,
        valor,
        data_compra_str: r[iCompra] || null,
        data_compra: dataCompraIso,
        vencimento_str: r[iVenc] || null,
        vencimento: vencIso,
        pago: 'Sim',
        extra: {
          passageiro: nome, passagem: `${origem} - ${destino}`, dataSaida: dataPartidaIso || r[iPartida] || null,
          tipo: meioTransporte, status: statusOrig, solicitante, motivo,
          parcelado: parcelasN ? { n: parseInt(parcelasN, 10) || 1, valorParcela: parseValor(r[iValorParcela]) } : null,
          origemPlanilha: `linha ${idx + 2}`,
        },
      });
    } else if (status === 'comprada' && !(valor > 0)) {
      semValor++;
    }
  });

  console.log(`\n✅ ${solicitacoes.length} solicitações a importar.`);
  console.log(`💰 ${financeiro.length} lançamentos financeiros a importar (só status comprada/multa com valor).`);
  console.log(`⚠️  ${semValor} registros "comprada" sem valor na planilha (viram solicitação, sem lançamento financeiro).`);
  console.log(`🏢 ${agenciasSet.size} agências distintas: ${[...agenciasSet].join(', ')}`);
  const somaFin = financeiro.reduce((s, f) => s + f.valor, 0);
  console.log(`\nSoma financeiro a importar: R$ ${somaFin.toFixed(2)}`);

  if (!APLICAR) {
    console.log('\n🔎 DRY-RUN — nada foi gravado. Rode com --aplicar para gravar de verdade.');
    console.log('\nExemplo de solicitação (1ª linha):', JSON.stringify(solicitacoes[0], null, 2));
    console.log('\nExemplo de financeiro (1º com valor):', JSON.stringify(financeiro[0], null, 2));
    return;
  }

  const db = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  console.log('\n🔌 Conectado ao Supabase.');

  // ── Backup dos 830 lançamentos antigos antes de apagar ──
  const antigos = await db.query("select * from compras_financeiro where modulo='passagens'");
  mkdirSync(new URL('./data', import.meta.url), { recursive: true });
  const backupPath = new URL(`./data/backup-compras-financeiro-passagens-${Date.now()}.json`, import.meta.url);
  writeFileSync(backupPath, JSON.stringify(antigos.rows, null, 2));
  console.log(`💾 Backup de ${antigos.rows.length} lançamentos antigos salvo em ${backupPath.pathname}`);

  const somaAntiga = antigos.rows.reduce((s, r) => s + Number(r.valor || 0), 0);
  await db.query("delete from compras_financeiro where modulo='passagens'");
  console.log(`🗑️  ${antigos.rowCount} lançamentos antigos apagados (R$ ${somaAntiga.toFixed(2)}).`);

  // ── Fornecedores (agências) → suppliers, tipo passagens ──
  let fornNovos = 0, fornMerge = 0;
  for (const nomeAg of agenciasSet) {
    const ex = await db.query('select id, tipos from suppliers where lower(nome)=lower($1) limit 1', [nomeAg]);
    if (ex.rowCount) {
      const tipos = new Set([...(ex.rows[0].tipos || []), 'passagens']);
      await db.query('update suppliers set tipos=$1 where id=$2', [[...tipos], ex.rows[0].id]);
      fornMerge++;
    } else {
      await db.query(`insert into suppliers (id, nome, tipos, created_at) values ($1,$2,$3,now())`,
        [crypto.randomUUID(), nomeAg, ['passagens']]);
      fornNovos++;
    }
  }
  console.log(`🏢 suppliers: +${fornNovos} novas agências, ${fornMerge} mescladas.`);

  // ── passagens_solicitacoes ──
  for (const s of solicitacoes) {
    await db.query(`
      insert into passagens_solicitacoes (id,codigo,tipo,solicitante,solicitante_uid,passageiro,origem,destino,
        saida,retorno,turno,motivo,bagagem,pix,obs,orcamentos,valor_final,fornecedor,data_compra,ticket_img,
        num_bilhete,status,historico,motivo_reprovacao,motivo_cancelamento,criado_em)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
      on conflict (id) do update set status=excluded.status, historico=excluded.historico, valor_final=excluded.valor_final`,
      [s.id, s.codigo, s.tipo, s.solicitante, s.solicitanteUid, s.passageiro, s.origem, s.destino,
       s.saida, s.retorno, s.turno, s.motivo, s.bagagem, s.pix, s.obs,
       JSON.stringify(s.orcamentos), s.valorFinal != null ? JSON.stringify(s.valorFinal) : null,
       s.fornecedor ? JSON.stringify(s.fornecedor) : null, s.dataCompra != null ? JSON.stringify(s.dataCompra) : null,
       null, s.numBilhete != null ? JSON.stringify(s.numBilhete) : null,
       s.status, JSON.stringify(s.historico), s.motivoReprovacao, s.motivoCancelamento, s.criadoEm]);
  }
  console.log(`✅ passagens_solicitacoes: ${solicitacoes.length} importadas.`);

  // ── compras_financeiro ──
  for (const f of financeiro) {
    await db.query(`
      insert into compras_financeiro (id, modulo, ano, mes, destinatario, fornecedor, valor,
        data_compra_str, data_compra, vencimento_str, vencimento, pago, importado_em, extra)
      values ($1,'passagens',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now(),$12)
      on conflict (id) do update set valor=excluded.valor, pago=excluded.pago, extra=excluded.extra`,
      [f.id, f.ano, f.mes, f.destinatario, f.fornecedor, f.valor,
       f.data_compra_str, f.data_compra, f.vencimento_str, f.vencimento, f.pago, JSON.stringify(f.extra)]);
  }
  console.log(`✅ compras_financeiro: ${financeiro.length} lançamentos importados (R$ ${somaFin.toFixed(2)}).`);

  const check = await db.query("select count(*) n, coalesce(sum(valor),0) v from compras_financeiro where modulo='passagens'");
  console.log(`\n🔎 Conferência no banco: ${check.rows[0].n} lançamentos, R$ ${Number(check.rows[0].v).toFixed(2)}`);

  await db.end();
  console.log('\n🎉 Importação concluída.');
}

main().catch(e => { console.error('❌ Erro:', e.message, '\n', e.stack); process.exitCode = 1; });
