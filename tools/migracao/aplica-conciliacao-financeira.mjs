#!/usr/bin/env node
// TEMPORÁRIO. Aplica a conciliação: marca pago='Sim' nos lançamentos que
// estavam em aberto no sistema mas sumiram da planilha semanal do
// financeiro (fornecedores resolvidos: Carnes Express, Pajuçara, Petisco,
// Gama e Cruz, Chip Viagens, Quadros Criativos). Faz backup antes.
import pg from 'pg';
import XLSX from 'xlsx';
import { writeFileSync, mkdirSync } from 'node:fs';
import { DATABASE_URL, exigir } from './env.mjs';
exigir('DATABASE_URL', DATABASE_URL);

const arquivos = [
  'C:\\Users\\compu\\Downloads\\visao_contas_a_pagar (5).xls',
  'C:\\Users\\compu\\Downloads\\visao_contas_a_pagar (7).xls',
  'C:\\Users\\compu\\Downloads\\visao_contas_a_pagar (8).xls',
];

const _CD_FORN_ALIASES = {
  'RAGNER': 'Carnes Express', 'CARNES EXPRESS': 'Carnes Express', 'CASA DAS CARNES E CIA LTDA': 'Carnes Express',
  'PAJUCARA': 'Pajuçara Distribuidora de Alimentos LTDA', 'PAJUCARA DISTRIBUIDORA DE ALIMENTOS LTDA': 'Pajuçara Distribuidora de Alimentos LTDA',
  'SKYLINE': 'Skyline', 'SKYLINE TOUR VIAGENS': 'Skyline', 'SKYLINE TOUR VIAGENS LTDA': 'Skyline',
  'GRANDES VIAGENS': 'Grandes Viagens', 'GRANDES VIAGENS TURISMO LTDA': 'Grandes Viagens',
  'CHIP VIAGENS': 'Chip Viagens',
  'GAMA E CRUZ COMERCIO': 'Gama e Cruz Comercio', 'GAMA E CRUZ COMERCIO VAREJISTA DE CARNES LTDA': 'Gama e Cruz Comercio',
  'QUADROS CRIATIVOS': 'Quadros Criativos', 'FRANCISCA LINDALVA LIMA DE OLIVEIRA': 'Quadros Criativos',
};
const norm = s => String(s || '').trim().toUpperCase().replace(/\s+/g, ' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const normCNPJ = s => String(s || '').replace(/\D/g, '');

function resolverFornecedor(nomeTexto, cnpjTexto, suppliers) {
  const cnpjNorm = normCNPJ(cnpjTexto);
  if (cnpjNorm) { const m = suppliers.find(s => normCNPJ(s.cnpj) === cnpjNorm); if (m) return m; }
  const chave = norm(nomeTexto);
  let m = suppliers.find(s => norm(s.nome) === chave);
  if (m) return m;
  const alias = _CD_FORN_ALIASES[chave];
  if (alias) { m = suppliers.find(s => norm(s.nome) === norm(alias)); if (m) return m; }
  return null;
}

const db = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

const { rows: suppliers } = await db.query(`select id, nome, cnpj from suppliers`);
const { rows: fin } = await db.query(`select id, fornecedor, fornecedor_id as "fornecedorId", valor, pago from compras_financeiro`);

let linhasPlanilha = [];
for (const f of arquivos) {
  const wb = XLSX.readFile(f);
  const sh = wb.Sheets['Visão Contas a Pagar'];
  const rows = XLSX.utils.sheet_to_json(sh, { header: 1, raw: false, defval: '' });
  const header = rows[0].map(h => String(h).trim());
  const idx = nome => header.indexOf(nome);
  const iCnpj = idx('Identificador do fornecedor'), iNome = idx('Nome do fornecedor'), iValorAberto = idx('Valor total da parcela em aberto (R$)');
  rows.slice(1).filter(r => r.some(c => String(c).trim() !== '')).forEach(r => {
    const valor = parseFloat(String(r[iValorAberto]).replace(',', '.')) || 0;
    if (valor > 0.005 && r[iNome]) linhasPlanilha.push({ cnpj: r[iCnpj], nomePlanilha: r[iNome], valor });
  });
}

const porFornecedor = {};
linhasPlanilha.forEach(l => {
  const s = resolverFornecedor(l.nomePlanilha, l.cnpj, suppliers);
  if (s) (porFornecedor[s.id] = porFornecedor[s.id] || { supplier: s, linhas: [] }).linhas.push(l);
});

const propostosPagar = [];
Object.values(porFornecedor).forEach(grupo => {
  const abertosSistema = fin.filter(f => {
    if (f.pago === 'Sim') return false;
    if (f.fornecedorId) return f.fornecedorId === grupo.supplier.id;
    const r = resolverFornecedor(f.fornecedor, null, suppliers);
    return r && r.id === grupo.supplier.id;
  });
  const restante = abertosSistema.slice();
  grupo.linhas.forEach(l => {
    const i = restante.findIndex(f => Math.abs((Number(f.valor)||0) - l.valor) < 0.01);
    if (i > -1) restante.splice(i, 1);
  });
  restante.forEach(f => propostosPagar.push({ id: f.id, fornecedor: grupo.supplier.nome, valor: Number(f.valor)||0 }));
});

console.log(`Vou marcar ${propostosPagar.length} lançamentos como pago, total R$ ${propostosPagar.reduce((s,p)=>s+p.valor,0).toFixed(2)}.`);

// Backup antes de gravar
const idsAlvo = propostosPagar.map(p => p.id);
const { rows: backup } = await db.query(`select * from compras_financeiro where id = any($1::text[])`, [idsAlvo]);
mkdirSync(new URL('./data', import.meta.url), { recursive: true });
const backupPath = new URL(`./data/backup-conciliacao-financeira-${Date.now()}.json`, import.meta.url);
writeFileSync(backupPath, JSON.stringify(backup, null, 2));
console.log(`💾 Backup de ${backup.length} registros salvo em ${backupPath.pathname}`);

// Aplica em lote
let ok = 0;
for (const p of propostosPagar) {
  await db.query(`update compras_financeiro set pago = 'Sim' where id = $1`, [p.id]);
  ok++;
}
console.log(`✅ ${ok} lançamentos marcados como pago.`);

// Resumo por fornecedor
const porForn = {};
propostosPagar.forEach(p => { porForn[p.fornecedor] = (porForn[p.fornecedor]||0) + p.valor; });
console.log('\nResumo por fornecedor:');
Object.entries(porForn).forEach(([f,v]) => console.log(`  ${f}: R$ ${v.toFixed(2)}`));

await db.end();
