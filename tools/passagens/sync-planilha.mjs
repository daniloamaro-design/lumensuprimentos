#!/usr/bin/env node
// tools/passagens/sync-planilha.mjs
//
// Sincroniza (SÓ LEITURA — Fase 1) a planilha Google Sheets "Controle das
// passagens" com o sistema. Lê 2 abas via export CSV público (mesma técnica
// de api/sync-passageiros.js — sem credencial Google), e grava:
//   - "Passagens pendentes" (só status em aberto: em branco / LIBERADO PARA
//     COTAÇÃO / COMPRA LIBERADA) → passagens_solicitacoes
//   - "Passagens compradas" (só compras NOVAS, feitas depois de CORTE_COMPRADAS
//     abaixo) → passagens_solicitacoes (status 'comprada') + compras_financeiro
//     (modulo 'passagens')
//
// IMPORTANTE: o histórico completo de "Passagens compradas" já foi importado
// uma vez em 2026-08-06 por tools/migracao/17-import-passagens-planilha.mjs
// (898 solicitações 'PASS-IMP-*' + 822 lançamentos em compras_financeiro).
// Reprocessar esse histórico aqui duplicaria tudo — por isso este script só
// olha pra compras feitas DEPOIS do corte. Descoberto e corrigido durante a
// primeira execução real (rodou e duplicou 936+857 registros; foi revertido
// manualmente — ver histórico de conversa/commits).
//
// Idempotente: cada linha vira uma "chave" composta (nome+data+trajeto),
// usada pra achar/atualizar o mesmo registro em reruns, sem duplicar.
//
// Uso:
//   node tools/passagens/sync-planilha.mjs           (aplica de verdade)
//   node tools/passagens/sync-planilha.mjs --dry-run  (só mostra o que faria)
//
// Conexão com o banco: usa DATABASE_URL (de tools/migracao/.env se rodar
// local, ou do ambiente se já estiver setado) — senão cai pras variáveis
// PG* padrão do libpq (é o que o workflow do GitHub Actions seta, mesmo
// esquema do backup-supabase.yml).

import pg from 'pg';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHEET_ID = '1odkhxMXJN4_1CDeoDxX0VoGuBqoGrBQ19FdvoF1iHeE';
const GID_PENDENTES = '53660011';
const GID_COMPRADAS = '1056078931';
// Só processa compras feitas A PARTIR desta data (exclusive do histórico já
// importado por tools/migracao/17-import-passagens-planilha.mjs em 06/08/2026).
const CORTE_COMPRADAS = '2026-08-07';

const DRY_RUN = process.argv.includes('--dry-run');

// ── Conexão ──────────────────────────────────────────────────────────
function lerDatabaseUrlLocal() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const aqui = dirname(fileURLToPath(import.meta.url));
  const envPath = join(aqui, '..', 'migracao', '.env');
  if (!existsSync(envPath)) return null;
  for (const linha of readFileSync(envPath, 'utf8').split('\n')) {
    const s = linha.trim();
    if (!s || s.startsWith('#')) continue;
    const i = s.indexOf('=');
    if (i === -1) continue;
    const chave = s.slice(0, i).trim();
    if (chave === 'DATABASE_URL') return s.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

function criarClient() {
  const url = lerDatabaseUrlLocal();
  if (url) return new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  // CI (GitHub Actions): usa PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE do ambiente.
  return new pg.Client({ ssl: { rejectUnauthorized: false } });
}

// ── CSV (mesmo parser RFC4180 de api/sync-passageiros.js) ──────────────
function parseCSV(texto) {
  const linhas = [];
  let linha = [], campo = '', dentroAspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (dentroAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; }
        else dentroAspas = false;
      } else campo += c;
    } else if (c === '"') {
      dentroAspas = true;
    } else if (c === ',') {
      linha.push(campo); campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo); campo = '';
      linhas.push(linha); linha = [];
    } else {
      campo += c;
    }
  }
  if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas.filter(l => l.some(c => c.trim() !== ''));
}

// Chave normalizada pro cabeçalho: tolera diferença de maiúscula/acento/
// espaço entre o nome exato da coluna na planilha e o que está hardcoded
// abaixo (mapeamento feito a olho a partir de uma leitura da planilha —
// vale conferir contra o log de cabeçalho impresso no início da execução).
const normKey = s => norm(s).replace(/\s+/g, ' ').trim();
// Lê uma coluna por nome "humano" (não sensível a maiúscula/acento/espaço).
function g(row, label) { return row[normKey(label)] || ''; }

async function baixarAba(gid) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${gid}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Planilha (gid=${gid}) respondeu ${resp.status}`);
  const csv = await resp.text();
  const linhas = parseCSV(csv);
  if (!linhas.length) throw new Error(`Aba (gid=${gid}) vazia ou formato inesperado.`);
  const header = linhas[0].map(h => h.trim());
  console.log(`  Cabeçalho: ${header.join(' | ')}`);
  const rows = linhas.slice(1).map(l => {
    const obj = {};
    header.forEach((h, i) => { obj[normKey(h)] = (l[i] || '').trim(); });
    return obj;
  });
  return rows;
}

// ── Normalização ─────────────────────────────────────────────────────
const norm = s => String(s || '').trim().toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '');

function dataISO(br) {
  const m = String(br || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function valorReais(s) {
  const n = String(s || '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3},)/g, '').replace(',', '.');
  const v = parseFloat(n);
  return Number.isFinite(v) ? v : null;
}

function splitTrajeto(s) {
  const partes = String(s || '').split(' - ');
  if (partes.length < 2) return { origem: (s || '').trim() || null, destino: null };
  return { origem: partes[0].trim() || null, destino: partes.slice(1).join(' - ').trim() || null };
}

// Chave composta pra passagens_solicitacoes (dedupe entre rodadas).
function chavePassagem(nome, dataSolic, trajeto, dataPartida) {
  return [nome, dataSolic, trajeto, dataPartida].map(norm).join('|');
}

// Mesma convenção já usada pelo importador financeiro de Suprimentos
// (js/12-financeiro-compras.js: finGerarChaveUnica) — reaproveitada aqui
// pra manter compras_financeiro consistente entre os dois importadores.
function chaveFinanceiro({ fornecedor, destinatario, dataCompra, valor, mes, ano }) {
  const forn  = norm(fornecedor).replace(/\s+/g, '_');
  const dest  = norm(destinatario).replace(/\s+/g, '_');
  const data  = String(dataCompra || '0').trim();
  const val   = String(parseFloat(valor) || 0);
  const m     = norm(mes).toUpperCase();
  const a     = String(parseInt(ano) || new Date().getFullYear());
  return `${forn}__${dest}__${data}__${val}__${m}__${a}`;
}

function tipoTransporte(s) {
  const n = norm(s);
  if (n.includes('avi')) return 'aviao';
  return 'onibus';
}

// ── Fornecedores (match por nome, tipos ∋ 'passagens') ──────────────
async function carregarFornecedores(db) {
  const { rows } = await db.query(`select id, nome from suppliers where 'passagens' = any(tipos)`);
  return rows;
}
function acharFornecedor(fornecedores, nome) {
  const alvo = norm(nome);
  if (!alvo) return null;
  let m = fornecedores.find(f => norm(f.nome) === alvo);
  if (m) return m;
  m = fornecedores.find(f => norm(f.nome).includes(alvo) || alvo.includes(norm(f.nome)));
  return m || null;
}

// ── Código único (o gerador do app não checa colisão — aqui checamos) ─
async function gerarCodigoUnico(db) {
  for (let i = 0; i < 20; i++) {
    const codigo = 'PASS-' + Math.floor(1000 + Math.random() * 9000);
    const { rows } = await db.query('select 1 from passagens_solicitacoes where codigo = $1', [codigo]);
    if (!rows.length) return codigo;
  }
  throw new Error('Não consegui gerar código único após 20 tentativas.');
}

// ── Aba "Passagens pendentes" → passagens_solicitacoes ───────────────
const STATUS_ABERTOS = new Set(['', 'LIBERADO PARA COTAÇÃO', 'COMPRA LIBERADA']);
const FORNECEDORES_ORCAMENTO = ['Skyline', 'Grandes Viagens', 'M3', 'Chip Viagens', 'WD Passagens', 'Sites'];

function mapearPendente(row) {
  const status = g(row, 'Status').toUpperCase();
  if (!STATUS_ABERTOS.has(status)) return null; // fora do escopo (CANCELADA, PASSAGEM COMPRADA, ...)

  const { origem, destino } = splitTrajeto(g(row, 'PASSAGEM DE IDA'));
  const orcamentos = FORNECEDORES_ORCAMENTO
    .map(nome => ({ nome, valor: valorReais(g(row, nome)) }))
    .filter(o => o.valor != null)
    .map(o => ({ fornecedorId: null, fornecedorNome: o.nome, valor: o.valor, obs: '', selecionada: false }));

  const empresaMenor = g(row, 'Empresa - Menor Orç.').trim();
  let valorFinal = null, fornecedorFinal = null;
  if (status === 'COMPRA LIBERADA' && empresaMenor) {
    const sel = orcamentos.find(o => norm(o.fornecedorNome) === norm(empresaMenor));
    if (sel) { sel.selecionada = true; valorFinal = sel.valor; fornecedorFinal = { id: null, nome: sel.fornecedorNome }; }
    else { valorFinal = valorReais(g(row, 'Menor orçamento')); fornecedorFinal = { id: null, nome: empresaMenor }; }
  }

  return {
    planilhaAba: 'pendentes',
    chave: chavePassagem(g(row, 'NOME'), g(row, 'DATA DE SOLICITAÇÃO'), g(row, 'PASSAGEM DE IDA'), g(row, 'DATA DE PARTIDA')),
    tipo: tipoTransporte(g(row, 'MEIO DE TRANSPORTE')),
    solicitante: g(row, 'QUEM SOLICITOU') || null,
    passageiro: g(row, 'NOME') || null,
    origem, destino,
    saida: dataISO(g(row, 'DATA DE PARTIDA')),
    retorno: '',
    motivo: g(row, 'MOTIVO DA PASSAGEM') || null,
    obs: g(row, 'OBSERVAÇÃO/SUGESTÃO') || null,
    criadoEm: dataISO(g(row, 'DATA DE SOLICITAÇÃO')),
    status: status === 'COMPRA LIBERADA' ? 'aprovada' : 'pendente',
    orcamentos,
    valorFinal, fornecedor: fornecedorFinal,
    dataCompra: null, numBilhete: null,
  };
}

// ── Aba "Passagens compradas" → passagens_solicitacoes + compras_financeiro ─
// Só compras a partir de CORTE_COMPRADAS (o resto já foi importado uma vez —
// ver comentário no topo do arquivo). Usa DATA DA COMPRA; se estiver em
// branco, cai pra DATA DA SOLICITAÇÃO; se as duas faltarem, ignora a linha
// (não dá pra saber se é histórico antigo já coberto ou não).
function mapearComprada(row) {
  const dataCompraISO = dataISO(g(row, 'DATA DA COMPRA'));
  const dataRef = dataCompraISO || dataISO(g(row, 'DATA DA SOLICITAÇÃO'));
  if (!dataRef || dataRef < CORTE_COMPRADAS) return null;

  const { origem, destino } = splitTrajeto(g(row, 'PASSAGEM DE IDA'));
  const valor = valorReais(g(row, 'VALOR'));
  const chave = chavePassagem(g(row, 'NOME'), g(row, 'DATA DA SOLICITAÇÃO'), g(row, 'PASSAGEM DE IDA'), g(row, 'DATA DE PARTIDA'));
  const agencia = g(row, 'AGENCIA');

  const solicitacao = {
    planilhaAba: 'compradas',
    chave,
    tipo: tipoTransporte(g(row, 'MEIO DE TRANSPORTE')),
    solicitante: g(row, 'QUEM SOLICITOU') || null,
    passageiro: g(row, 'NOME') || null,
    origem, destino,
    saida: dataISO(g(row, 'DATA DE PARTIDA')),
    retorno: dataISO(g(row, 'DATA DE RETORNO')) || '',
    motivo: g(row, 'MOTIVO DA PASSAGEM') || null,
    obs: g(row, 'OBSERVAÇÃO/SUGESTÃO') || null,
    criadoEm: dataISO(g(row, 'DATA DA SOLICITAÇÃO')),
    status: 'comprada',
    orcamentos: [],
    valorFinal: valor,
    fornecedor: agencia ? { id: null, nome: agencia } : null,
    dataCompra: dataCompraISO,
    numBilhete: null,
  };

  let financeiro = null;
  if (valor != null && agencia) {
    financeiro = {
      fornecedor: agencia,
      destinatario: g(row, 'NOME'),
      dataCompra: dataCompraISO,
      valor,
      mes: g(row, 'Mês') || null,
      ano: g(row, 'Ano') || null,
      vencimentoStr: g(row, 'VENCIMENTO') || null,
      pago: g(row, 'PAGO') || null,
      lancadoHyb: g(row, 'HYB') || null,
      lancadoSp: g(row, 'SP') || null,
      classificacao: 'Transporte - Missionários',
    };
    financeiro.chave = chaveFinanceiro(financeiro);
  }

  return { solicitacao, financeiro };
}

// ── Upsert ───────────────────────────────────────────────────────────
async function upsertSolicitacao(db, fornecedores, dados, contadores) {
  const { rows: existentes } = await db.query(
    'select id, codigo from passagens_solicitacoes where planilha_chave = $1', [dados.chave]
  );

  // Resolve fornecedorId nos orçamentos e no fornecedor final.
  dados.orcamentos.forEach(o => { const f = acharFornecedor(fornecedores, o.fornecedorNome); if (f) o.fornecedorId = f.id; });
  if (dados.fornecedor) { const f = acharFornecedor(fornecedores, dados.fornecedor.nome); if (f) dados.fornecedor.id = f.id; }

  const patch = {
    tipo: dados.tipo, solicitante: dados.solicitante, passageiro: dados.passageiro,
    origem: dados.origem, destino: dados.destino, saida: dados.saida, retorno: dados.retorno,
    motivo: dados.motivo, obs: dados.obs, status: dados.status,
    orcamentos: JSON.stringify(dados.orcamentos),
    valor_final: JSON.stringify(dados.valorFinal),
    fornecedor: JSON.stringify(dados.fornecedor),
    data_compra: JSON.stringify(dados.dataCompra),
    num_bilhete: JSON.stringify(dados.numBilhete),
    planilha_aba: dados.planilhaAba,
  };

  if (existentes.length) {
    contadores.atualizadas++;
    if (DRY_RUN) return;
    const histEntry = JSON.stringify([{ acao: 'Atualizado pela sincronização da planilha', usuario: 'Sync Planilha', ts: new Date().toISOString() }]);
    await db.query(
      `update passagens_solicitacoes set
         tipo=$1, solicitante=$2, passageiro=$3, origem=$4, destino=$5, saida=$6, retorno=$7,
         motivo=$8, obs=$9, status=$10, orcamentos=$11, valor_final=$12, fornecedor=$13,
         data_compra=$14, num_bilhete=$15, planilha_aba=$16,
         historico = coalesce(historico, '[]'::jsonb) || $17::jsonb
       where id = $18`,
      [patch.tipo, patch.solicitante, patch.passageiro, patch.origem, patch.destino, patch.saida, patch.retorno,
       patch.motivo, patch.obs, patch.status, patch.orcamentos, patch.valor_final, patch.fornecedor,
       patch.data_compra, patch.num_bilhete, patch.planilha_aba, histEntry, existentes[0].id]
    );
    return;
  }

  contadores.novas++;
  if (DRY_RUN) return;
  const codigo = await gerarCodigoUnico(db);
  const historico = JSON.stringify([{ acao: `Importado da planilha (aba ${dados.planilhaAba})`, usuario: 'Sync Planilha', ts: new Date().toISOString() }]);
  await db.query(
    `insert into passagens_solicitacoes
       (id, codigo, tipo, solicitante, passageiro, origem, destino, saida, retorno, motivo, obs, status,
        orcamentos, valor_final, fornecedor, data_compra, num_bilhete, historico,
        planilha_chave, planilha_aba, origem_planilha, criado_em)
     values (gen_random_uuid()::text, $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,true,
             coalesce($20::timestamptz, now()))`,
    [codigo, patch.tipo, patch.solicitante, patch.passageiro, patch.origem, patch.destino, patch.saida, patch.retorno,
     patch.motivo, patch.obs, patch.status, patch.orcamentos, patch.valor_final, patch.fornecedor,
     patch.data_compra, patch.num_bilhete, historico, dados.chave, dados.planilhaAba, dados.criadoEm]
  );
}

async function upsertFinanceiro(db, f, contadores) {
  if (!f) return;
  const { rows: existentes } = await db.query('select id from compras_financeiro where chave_unica = $1', [f.chave]);
  if (existentes.length) { contadores.finExistentes++; return; } // já lançado, não sobrescreve (financeiro é sensível)
  contadores.finNovos++;
  if (DRY_RUN) return;
  await db.query(
    `insert into compras_financeiro
       (id, fornecedor, destinatario, valor, data_compra, data_compra_str, mes, ano, vencimento_str,
        pago, lancado_hyb, lancado_sp, classificacao, modulo, chave_unica)
     values (gen_random_uuid()::text, $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'passagens',$13)`,
    [f.fornecedor, f.destinatario, f.valor, f.dataCompra, null, f.mes, f.ano, f.vencimentoStr,
     f.pago, f.lancadoHyb, f.lancadoSp, f.classificacao, f.chave]
  );
}

// ── Main ─────────────────────────────────────────────────────────────
async function main() {
  console.log(DRY_RUN ? '🔍 Modo dry-run (nada será gravado)\n' : '✍️  Modo aplicar\n');

  const db = criarClient();
  await db.connect();
  try {
    const fornecedores = await carregarFornecedores(db);

    console.log('Baixando aba "Passagens pendentes"...');
    const linhasPendentes = await baixarAba(GID_PENDENTES);
    console.log(`  ${linhasPendentes.length} linhas na planilha.`);

    const contPend = { novas: 0, atualizadas: 0 };
    let ignoradas = 0;
    for (const row of linhasPendentes) {
      const dados = mapearPendente(row);
      if (!dados) { ignoradas++; continue; }
      if (!dados.passageiro) continue; // linha vazia/lixo
      await upsertSolicitacao(db, fornecedores, dados, contPend);
    }
    console.log(`  → ${contPend.novas} novas, ${contPend.atualizadas} atualizadas, ${ignoradas} ignoradas (status fechado).\n`);

    console.log('Baixando aba "Passagens compradas"...');
    const linhasCompradas = await baixarAba(GID_COMPRADAS);
    console.log(`  ${linhasCompradas.length} linhas na planilha.`);

    const contCompr = { novas: 0, atualizadas: 0 };
    const contFin = { finNovos: 0, finExistentes: 0 };
    let ignoradasCompr = 0;
    for (const row of linhasCompradas) {
      const mapeado = mapearComprada(row);
      if (!mapeado) { ignoradasCompr++; continue; } // fora do corte (histórico já importado)
      const { solicitacao, financeiro } = mapeado;
      if (!solicitacao.passageiro) continue;
      await upsertSolicitacao(db, fornecedores, solicitacao, contCompr);
      await upsertFinanceiro(db, financeiro, contFin);
    }
    console.log(`  → ${contCompr.novas} novas, ${contCompr.atualizadas} atualizadas, ${ignoradasCompr} ignoradas (antes do corte de ${CORTE_COMPRADAS}).`);
    console.log(`  → financeiro: ${contFin.finNovos} lançamentos novos, ${contFin.finExistentes} já existiam.\n`);

    console.log(DRY_RUN ? '✅ Dry-run concluído.' : '✅ Sincronização concluída.');
  } finally {
    await db.end();
  }
}

main().catch(e => { console.error('❌ Erro:', e); process.exit(1); });
