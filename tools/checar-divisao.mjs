#!/usr/bin/env node
/**
 * checar-divisao.mjs — Rede de segurança da divisão do index.html
 *
 * Valida que a extração de blocos <script> para arquivos js/*.js não quebrou nada:
 *  (a) todo handler inline (onclick= etc., inclusive em HTML gerado por JS) continua
 *      tendo a função definida em algum arquivo carregado;
 *  (b) nenhum let/const de topo é redeclarado em dois arquivos (SyntaxError na carga);
 *  (c) cada wrapper _origXxx = funcao carrega DEPOIS (ou no mesmo arquivo) do original;
 *  (d) as tags <script src="js/NN-..."> aparecem em ordem numérica.
 *
 * Uso:
 *   node tools/checar-divisao.mjs --baseline   # grava tools/baseline.json (rodar no monólito)
 *   node tools/checar-divisao.mjs              # compara estado atual com a baseline
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = join(ROOT, 'index.html');
const BASELINE = join(ROOT, 'tools', 'baseline.json');
const modoBaseline = process.argv.includes('--baseline');

const html = readFileSync(INDEX, 'utf8');

// ── 1. Montar as "unidades de carga" na ordem do documento ─────────────────
// Cada unidade = um <script> inline ou um arquivo local referenciado por src.
const unidades = []; // { nome, conteudo }
const reScript = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let m;
while ((m = reScript.exec(html)) !== null) {
  const attrs = m[1];
  const corpo = m[2];
  const srcMatch = attrs.match(/src\s*=\s*["']([^"']+)["']/i);
  if (srcMatch) {
    const src = srcMatch[1].split('?')[0];
    if (/^https?:\/\//i.test(src)) continue; // CDN — fora do escopo
    const caminho = join(ROOT, src);
    if (!existsSync(caminho)) {
      falhas.push(`ARQUIVO AUSENTE: <script src="${srcMatch[1]}"> aponta para ${src}, que não existe.`);
      continue;
    }
    unidades.push({ nome: src, conteudo: readFileSync(caminho, 'utf8') });
  } else if (corpo.trim()) {
    unidades.push({ nome: `index.html (inline @${posLinha(m.index)})`, conteudo: corpo });
  }
}
function posLinha(idx) { return 'L' + (html.slice(0, idx).split('\n').length); }

var falhas = [];
var avisos = [];

// ── 2. Definições de topo por unidade (heurística: coluna 0) ───────────────
const defsPorUnidade = unidades.map(u => {
  const defs = new Set();
  const letConstTop = new Set();
  for (const linha of u.conteudo.split('\n')) {
    let mm;
    if ((mm = linha.match(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/))) defs.add(mm[1]);
    else if ((mm = linha.match(/^var\s+([A-Za-z_$][\w$]*)/))) defs.add(mm[1]);
    else if ((mm = linha.match(/^(let|const)\s+([A-Za-z_$][\w$]*)/))) { defs.add(mm[2]); letConstTop.add(mm[2]); }
    else if ((mm = linha.match(/^window\.([A-Za-z_$][\w$]*)\s*=/))) defs.add(mm[1]);
  }
  // Definições em qualquer profundidade (para resolução generosa de handlers):
  const defsProfundas = new Set(defs);
  let mm2;
  const reFn = /(?:^|\s)(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g;
  while ((mm2 = reFn.exec(u.conteudo)) !== null) defsProfundas.add(mm2[1]);
  const reWin = /window\.([A-Za-z_$][\w$]*)\s*=/g;
  while ((mm2 = reWin.exec(u.conteudo)) !== null) defsProfundas.add(mm2[1]);
  const reAtrib = /(?:^|[\s;{(])([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>)/g;
  while ((mm2 = reAtrib.exec(u.conteudo)) !== null) defsProfundas.add(mm2[1]);
  return { nome: u.nome, defs, letConstTop, defsProfundas };
});

const todasDefs = new Set();
for (const d of defsPorUnidade) for (const x of d.defsProfundas) todasDefs.add(x);

// ── 3. (a) Handlers inline — no HTML e em HTML gerado dentro do JS ─────────
const NATIVOS = new Set([
  'if','for','while','switch','return','function','typeof','new','this','event','alert','confirm',
  'prompt','parseInt','parseFloat','String','Number','Boolean','Array','Object','JSON','Math','Date',
  'console','document','window','encodeURIComponent','decodeURIComponent','encodeURI','setTimeout',
  'setInterval','requestAnimationFrame','open','print','stopPropagation','preventDefault','focus','blur',
  'getElementById','querySelector','querySelectorAll','classList','toggle','add','remove','contains',
  'value','trim','toLowerCase','toUpperCase','replace','split','join','includes','indexOf','slice',
  'localStorage','sessionStorage','getItem','setItem','scrollIntoView','submit','reset','click','close'
]);
function extrairChamadas(codigo) {
  const nomes = new Set();
  let mm;
  const re = /([A-Za-z_$][\w$]*)\s*\(/g;
  while ((mm = re.exec(codigo)) !== null) {
    const nome = mm[1];
    const antes = codigo.slice(Math.max(0, mm.index - 1), mm.index);
    if (antes === '.') continue; // chamada de método (obj.metodo) — ignora
    if (!NATIVOS.has(nome)) nomes.add(nome);
  }
  return nomes;
}
const handlers = new Set();
const conteudoTotal = html + '\n' + unidades.map(u => u.conteudo).join('\n');
const reHandler = /\bon(?:click|change|input|submit|keyup|keydown|dblclick)\s*=\s*(?:\\?")((?:[^"\\]|\\.)*?)\\?"|\bon(?:click|change|input|submit|keyup|keydown|dblclick)\s*=\s*(?:\\?')((?:[^'\\]|\\.)*?)\\?'/g;
while ((m = reHandler.exec(conteudoTotal)) !== null) {
  const codigo = (m[1] ?? m[2] ?? '');
  for (const n of extrairChamadas(codigo)) handlers.add(n);
}
const naoResolvidos = [...handlers].filter(h => !todasDefs.has(h)).sort();

// ── 4. (b) Redeclaração de let/const de topo entre unidades ────────────────
const vistos = new Map();
for (const d of defsPorUnidade) {
  for (const nome of d.letConstTop) {
    if (vistos.has(nome) && vistos.get(nome) !== d.nome) {
      falhas.push(`REDECLARAÇÃO: let/const "${nome}" declarado em "${vistos.get(nome)}" E em "${d.nome}" — SyntaxError na carga.`);
    } else vistos.set(nome, d.nome);
  }
}

// ── 5. (c) Wrappers _origXxx devem carregar depois do original ─────────────
for (let i = 0; i < unidades.length; i++) {
  const reWrap = /(?:const|let|var)\s+(_orig\w+|__orig\w+)\s*=\s*(?:window\.)?([A-Za-z_$][\w$]*)\s*;/g;
  let mw;
  while ((mw = reWrap.exec(unidades[i].conteudo)) !== null) {
    const original = mw[2];
    if (['function', 'async', 'null', 'undefined'].includes(original)) continue;
    const definidoAntes = defsPorUnidade.slice(0, i + 1).some(d => d.defsProfundas.has(original));
    if (!definidoAntes) {
      falhas.push(`WRAPPER FORA DE ORDEM: "${mw[1]} = ${original}" em "${unidades[i].nome}", mas "${original}" só é definido em arquivo carregado DEPOIS (ou nunca).`);
    }
  }
}

// ── 6. (d) Ordem numérica das tags js/NN-*.js ──────────────────────────────
const ordem = [...html.matchAll(/src\s*=\s*["']js\/(\d{2})-[^"']*["']/g)].map(x => parseInt(x[1], 10));
for (let i = 1; i < ordem.length; i++) {
  if (ordem[i] < ordem[i - 1]) {
    falhas.push(`ORDEM DAS TAGS: js/${String(ordem[i]).padStart(2, '0')}-*.js aparece depois de js/${String(ordem[i - 1]).padStart(2, '0')}-*.js no index.html.`);
  }
}

// ── 7. Baseline: gravar ou comparar ────────────────────────────────────────
const estado = {
  handlers: [...handlers].sort(),
  naoResolvidos,
  globais: [...todasDefs].sort(),
  unidades: unidades.map(u => u.nome),
};

if (modoBaseline) {
  writeFileSync(BASELINE, JSON.stringify(estado, null, 2));
  console.log(`✅ Baseline gravada em tools/baseline.json`);
  console.log(`   Unidades de carga: ${unidades.length}`);
  console.log(`   Handlers inline distintos: ${handlers.size}`);
  console.log(`   Globais definidos: ${todasDefs.size}`);
  if (naoResolvidos.length) {
    console.log(`   ⚠️  ${naoResolvidos.length} handlers já sem definição NO MONÓLITO (pré-existentes, não são regressão):`);
    console.log('      ' + naoResolvidos.join(', '));
  }
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error('❌ Baseline não encontrada. Rode primeiro: node tools/checar-divisao.mjs --baseline');
  process.exit(1);
}
const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
const baseNaoResolvidos = new Set(base.naoResolvidos);
const regressoesHandlers = naoResolvidos.filter(h => !baseNaoResolvidos.has(h));
if (regressoesHandlers.length) {
  falhas.push(`HANDLERS QUEBRADOS (definição sumiu após a extração): ${regressoesHandlers.join(', ')}`);
}
const globaisAtuais = new Set(estado.globais);
const globaisSumidos = base.globais.filter(g => !globaisAtuais.has(g));
if (globaisSumidos.length) {
  falhas.push(`GLOBAIS DESAPARECIDOS vs baseline: ${globaisSumidos.join(', ')}`);
}

// ── Resultado ──────────────────────────────────────────────────────────────
console.log(`Unidades de carga: ${unidades.length} | Handlers: ${handlers.size} | Globais: ${todasDefs.size}`);
for (const a of avisos) console.log('⚠️  ' + a);
if (falhas.length) {
  console.error('\n❌ FALHAS:');
  for (const f of falhas) console.error('   • ' + f);
  process.exit(1);
}
console.log('✅ Tudo certo — nenhuma regressão detectada.');
