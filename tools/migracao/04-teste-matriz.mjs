#!/usr/bin/env node
/**
 * 04-teste-matriz.mjs — valida a matriz de permissões (RLS) papel a papel.
 * Entra como cada usuário de teste (03-seed-teste) + convidado (anônimo) e confere
 * que cada operação permitida passa e cada proibida é bloqueada.
 *
 *   node tools/migracao/04-teste-matriz.mjs
 *
 * Requer: migrations aplicadas (02) + usuários semeados (03).
 * Nota: inserts NÃO usam .select() de volta — ler a linha inserida exigiria a
 * política de SELECT (que o convidado legitimamente não tem). Verificamos só o
 * sucesso/erro da escrita. Leitura é testada à parte com marcadores.
 */
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, ANON_KEY, SERVICE_KEY, exigir } from './env.mjs';
import { emailDe, senhaDe } from './03-seed-teste.mjs';

exigir('SUPABASE_SERVICE_KEY', SERVICE_KEY);
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const MARK = 'MARKER-TESTE';
const TAG  = 'TESTE_MATRIZ';
const rnd  = () => Math.random().toString(36).slice(2, 8);

let passes = 0, falhas = 0;

async function cliente(role) {
  const c = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  if (role === 'convidado') {
    const { error } = await c.auth.signInAnonymously();
    if (error) throw new Error('anon sign-in falhou: ' + error.message);
  } else {
    const { error } = await c.auth.signInWithPassword({ email: emailDe(role), password: senhaDe(role) });
    if (error) throw new Error(`login ${role} falhou: ` + error.message);
  }
  return c;
}

function reg(role, desc, ok) {
  if (ok) passes++;
  else { falhas++; console.log(`  ❌ [${role}] ${desc}`); }
}

// INSERT sem leitura de volta: mede só se a escrita foi aceita.
async function insertEsperado(role, c, tabela, payload, esperado) {
  const { error } = await c.from(tabela).insert(payload);
  const permitiu = !error;
  reg(role, `INSERT ${tabela} deveria ${esperado}` + (error && esperado === 'permitir' ? ` (erro: ${error.message})` : ''),
      permitiu === (esperado === 'permitir'));
}

// SELECT de um marcador pré-inserido via service (ignora RLS).
async function selectMarker(role, c, tabela, coluna, esperado) {
  const { data, error } = await c.from(tabela).select('id').eq(coluna, MARK);
  const viu = !error && data && data.length > 0;
  reg(role, `SELECT ${tabela} (marker) deveria ${esperado}`, viu === (esperado === 'permitir'));
}

async function limpar() {
  await admin.from('movements').delete().eq('house', TAG);
  await admin.from('movements').delete().eq('house', MARK);
  await admin.from('var_solicitacoes').delete().eq('material', TAG);
  await admin.from('orders').delete().eq('house', TAG);
  await admin.from('orders').delete().eq('house', MARK);
  await admin.from('compras_financeiro').delete().eq('fornecedor', TAG);
  await admin.from('compras_financeiro').delete().eq('fornecedor', MARK);
  await admin.from('prices').delete().eq('city', TAG);
  await admin.from('metas').delete().eq('ano', 2099);
  await admin.from('houses').delete().like('nome', TAG + '%');
  await admin.from('users').delete().like('id', 'teste-matriz%');
}

async function main() {
  await limpar(); // estado limpo
  // Marcadores visíveis (via service, ignora RLS) para testar LEITURA
  await admin.from('orders').insert({ house: MARK, code: MARK });
  await admin.from('compras_financeiro').insert({ fornecedor: MARK, valor: 1 });

  // ── convidado (anônimo): pode criar movimento e solicitação; não lê dados ──
  {
    const c = await cliente('convidado');
    await insertEsperado('convidado', c, 'movements', { type: 'saida', house: TAG, date_str: rnd() }, 'permitir');
    await insertEsperado('convidado', c, 'var_solicitacoes', { material: TAG, quantidade: 1 }, 'permitir');
    await insertEsperado('convidado', c, 'prices', { cat_key: 'x', prod_id: 'y' + rnd(), city: TAG }, 'negar');
    await selectMarker('convidado', c, 'orders', 'house', 'negar');
    await selectMarker('convidado', c, 'compras_financeiro', 'fornecedor', 'negar');
  }
  // ── usuario ──
  {
    const c = await cliente('usuario');
    await insertEsperado('usuario', c, 'var_solicitacoes', { material: TAG, quantidade: 1 }, 'permitir');
    await insertEsperado('usuario', c, 'movements', { type: 'saida', house: TAG, date_str: rnd() }, 'negar');
    await selectMarker('usuario', c, 'orders', 'house', 'negar');
  }
  // ── estoque ──
  {
    const c = await cliente('estoque');
    await insertEsperado('estoque', c, 'movements', { type: 'entrada', house: TAG, date_str: rnd() }, 'permitir');
    await selectMarker('estoque', c, 'orders', 'house', 'permitir');
    await insertEsperado('estoque', c, 'prices', { cat_key: 'x', prod_id: 'y' + rnd(), city: TAG }, 'negar');
    await selectMarker('estoque', c, 'compras_financeiro', 'fornecedor', 'negar');
  }
  // ── financeiro ──
  {
    const c = await cliente('financeiro');
    await selectMarker('financeiro', c, 'compras_financeiro', 'fornecedor', 'permitir');
    await insertEsperado('financeiro', c, 'compras_financeiro', { fornecedor: TAG, valor: 1 }, 'permitir');
    await insertEsperado('financeiro', c, 'movements', { type: 'saida', house: TAG, date_str: rnd() }, 'negar');
  }
  // ── compras ──
  {
    const c = await cliente('compras');
    await insertEsperado('compras', c, 'prices', { cat_key: 'x', prod_id: 'y' + rnd(), city: TAG }, 'permitir');
    await insertEsperado('compras', c, 'orders', { house: TAG }, 'permitir');
    await selectMarker('compras', c, 'compras_financeiro', 'fornecedor', 'permitir');
    await insertEsperado('compras', c, 'metas', { ano: 2099, cat_key: 't' + rnd() }, 'negar');
  }
  // ── coordenador (gestão) ──
  {
    const c = await cliente('coordenador');
    await insertEsperado('coordenador', c, 'metas', { ano: 2099, cat_key: 't' + rnd() }, 'permitir');
    await insertEsperado('coordenador', c, 'houses', { nome: TAG + '-' + rnd() }, 'permitir');
    await selectMarker('coordenador', c, 'compras_financeiro', 'fornecedor', 'permitir');
  }
  // ── admin (gestão): aprovar/gerenciar usuários ──
  {
    const c = await cliente('admin');
    await insertEsperado('admin', c, 'users',
      { id: 'teste-matriz-' + rnd(), email: rnd() + '@t.local', role: 'usuario', status: 'approved' }, 'permitir');
    await selectMarker('admin', c, 'orders', 'house', 'permitir');
  }

  await limpar();

  console.log(`\n── Matriz RLS: ${passes} passaram, ${falhas} falharam ──`);
  if (falhas) { console.log('❌ Há políticas incorretas — revisar 002_rls.sql.'); process.exitCode = 1; }
  else console.log('✅ Todas as permissões e bloqueios conferidos.');
}

main().catch(e => { console.error('❌ Erro:', e.message); process.exitCode = 1; });
