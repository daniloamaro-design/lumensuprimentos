#!/usr/bin/env node
// TEMPORÁRIO, leitura-only. Simula a lógica de coordConcProcessar() do
// navegador (js/22-coord-dashboard.js) pra validar antes de confiar na UI.
import pg from 'pg';
import XLSX from 'xlsx';
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
  if (cnpjNorm) {
    const porCnpj = suppliers.find(s => normCNPJ(s.cnpj) === cnpjNorm);
    if (porCnpj) return porCnpj;
  }
  const chave = norm(nomeTexto);
  let m = suppliers.find(s => norm(s.nome) === chave);
  if (m) return m;
  const alias = _CD_FORN_ALIASES[chave];
  if (alias) {
    m = suppliers.find(s => norm(s.nome) === norm(alias));
    if (m) return m;
  }
  return null;
}

const db = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

const { rows: suppliers } = await db.query(`select id, nome, cnpj from suppliers`);
const { rows: fin } = await db.query(`select id, fornecedor, fornecedor_id as "fornecedorId", valor, pago, modulo from compras_financeiro`);

// Lê as 3 planilhas
let linhasPlanilha = [];
for (const f of arquivos) {
  const wb = XLSX.readFile(f);
  const sh = wb.Sheets['Visão Contas a Pagar'];
  const rows = XLSX.utils.sheet_to_json(sh, { header: 1, raw: false, defval: '' });
  const header = rows[0].map(h => String(h).trim());
  const idx = nome => header.indexOf(nome);
  const iCnpj = idx('Identificador do fornecedor'), iNome = idx('Nome do fornecedor'),
        iVenc = idx('Data de vencimento'), iDescricao = idx('Descrição'),
        iValorAberto = idx('Valor total da parcela em aberto (R$)');
  rows.slice(1).filter(r => r.some(c => String(c).trim() !== '')).forEach(r => {
    const valor = parseFloat(String(r[iValorAberto]).replace(',', '.')) || 0;
    if (valor > 0.005 && r[iNome]) {
      linhasPlanilha.push({ cnpj: r[iCnpj], nomePlanilha: r[iNome], vencimento: r[iVenc], descricao: r[iDescricao], valor });
    }
  });
}
console.log(`Total linhas planilha (3 arquivos): ${linhasPlanilha.length}`);

// Resolve + agrupa
const porFornecedor = {};
const naoIdent = {};
linhasPlanilha.forEach(l => {
  const s = resolverFornecedor(l.nomePlanilha, l.cnpj, suppliers);
  if (s) (porFornecedor[s.id] = porFornecedor[s.id] || { supplier: s, linhas: [] }).linhas.push(l);
  else { const k = norm(l.nomePlanilha); (naoIdent[k] = naoIdent[k] || { nome: l.nomePlanilha, linhas: [] }).linhas.push(l); }
});

console.log(`\nFornecedores resolvidos: ${Object.keys(porFornecedor).length}`);
Object.values(porFornecedor).forEach(g => console.log(`  - ${g.supplier.nome}: ${g.linhas.length} linha(s), R$ ${g.linhas.reduce((s,l)=>s+l.valor,0).toFixed(2)}`));
console.log(`\nNão identificados: ${Object.keys(naoIdent).length}`);
Object.values(naoIdent).forEach(g => console.log(`  - "${g.nome}": ${g.linhas.length} linha(s), R$ ${g.linhas.reduce((s,l)=>s+l.valor,0).toFixed(2)}`));

// Compara
const propostosPagar = [];
const soNaPlanilha = [];
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
    else soNaPlanilha.push({ fornecedor: grupo.supplier.nome, descricao: l.descricao, valor: l.valor, vencimento: l.vencimento });
  });
  restante.forEach(f => propostosPagar.push({ fornecedor: grupo.supplier.nome, id: f.id, valor: Number(f.valor)||0 }));
});

console.log(`\n=== PROPOSTOS PRA MARCAR PAGO: ${propostosPagar.length} — total R$ ${propostosPagar.reduce((s,p)=>s+p.valor,0).toFixed(2)} ===`);
propostosPagar.forEach(p => console.log(`  ${p.fornecedor} | id=${p.id} | R$ ${p.valor.toFixed(2)}`));

console.log(`\n=== SÓ NA PLANILHA, NÃO ACHADO NO SISTEMA: ${soNaPlanilha.length} — total R$ ${soNaPlanilha.reduce((s,p)=>s+p.valor,0).toFixed(2)} ===`);
soNaPlanilha.slice(0,15).forEach(p => console.log(`  ${p.fornecedor} | ${p.descricao} | R$ ${p.valor.toFixed(2)}`));
if (soNaPlanilha.length > 15) console.log(`  ... e mais ${soNaPlanilha.length - 15}`);

await db.end();
