#!/usr/bin/env node
/**
 * 11-transform-load.mjs — transforma os NDJSON exportados e carrega no Postgres.
 * Idempotente: UPSERT por chave (ON CONFLICT). Rode quantas vezes quiser.
 *
 *   node tools/migracao/11-transform-load.mjs
 *
 * Requer: 10-export.mjs já rodado (tools/migracao/data/*.ndjson) + DATABASE_URL no .env.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import pg from 'pg';
import { DATABASE_URL, exigir } from './env.mjs';

// UUID v5 determinístico do uid do Firebase — MESMA função de 15-usuarios-auth.mjs.
// Necessário para que re-sincronizações batam com os ids remapeados (auth.users é UUID).
const NS_UUID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
function uuidV5(nome) {
  const nsBytes = Buffer.from(NS_UUID.replace(/-/g, ''), 'hex');
  const hash = crypto.createHash('sha1').update(nsBytes).update(String(nome)).digest();
  const b = hash.subarray(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50; b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

exigir('DATABASE_URL', DATABASE_URL);
const AQUI = dirname(fileURLToPath(import.meta.url));
const DATA = join(AQUI, 'data');

const ler = (col) => {
  const f = join(DATA, `${col}.ndjson`);
  if (!existsSync(f)) return [];
  return readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
};

// ── helpers de conversão ───────────────────────────────────────────
const S = (v) => (v == null ? null : String(v));
const N = (v) => (v == null || v === '' ? null : Number(v));
const B = (v) => (typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : !!v);
const TS = (v) => (v == null || v === '' ? null : v);           // ISO string ok p/ timestamptz
function dataISO(v) {                                            // "YYYY-MM-DD" | ISO
  if (!v) return null;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}
function dataBR(v) {                                            // "DD/MM/YYYY" → date
  if (!v) return null;
  const m = String(v).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : dataISO(v);
}

const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
let totalLinhas = 0;

// upsert genérico: cols = {coluna: valor}. conflito por `conflito` (array de colunas).
// Campos com valor null/undefined são OMITIDOS → o banco aplica o DEFAULT da coluna
// (ex.: created_at → now()), evitando violar NOT NULL com colunas que têm default.
async function upsert(tabela, cols, conflito = ['id']) {
  const nomes = Object.keys(cols).filter(n => cols[n] !== null && cols[n] !== undefined);
  const vals = nomes.map(n => cols[n]);
  const ph = nomes.map((_, i) => `$${i + 1}`);
  const set = nomes.filter(n => !conflito.includes(n)).map(n => `${n}=excluded.${n}`);
  const sql = set.length
    ? `insert into ${tabela} (${nomes.join(',')}) values (${ph.join(',')})
       on conflict (${conflito.join(',')}) do update set ${set.join(',')}`
    : `insert into ${tabela} (${nomes.join(',')}) values (${ph.join(',')})
       on conflict (${conflito.join(',')}) do nothing`;
  await client.query(sql, vals);
  totalLinhas++;
}

async function main() {
  await client.connect();
  console.log('🔌 Conectado. Carregando…\n');

  // ── users ──
  for (const d of ler('users')) {
    await upsert('users', {
      id: uuidV5(d._id), email: S(d.email), name: S(d.name), role: S(d.role) || 'usuario',
      status: S(d.status) || 'pending', house: S(d.house),
      created_at: TS(d.createdAt), updated_at: TS(d.updatedAt) || TS(d.createdAt), updated_by: S(d.updatedBy),
    });
  }
  console.log('users');

  // ── houses (base) + enriquecimento casas_* ──
  const overridePorNome = {};
  for (const d of ler('casas_override')) overridePorNome[S(d.originalNome || d.novoNome)] = d;
  const configPorNome = {};
  for (const d of ler('casas_config')) configPorNome[S(d.nome)] = d;
  const blocoPorNome = {};
  for (const d of ler('casas_blocos')) blocoPorNome[S(d.nome)] = S(d.bloco);
  const tipoPorNome = {};
  for (const d of ler('casas_tipo_compra')) tipoPorNome[S(d.nome)] = S(d.tipo || d.tipoCompra);
  const removidas = new Set(ler('casas_removidas').map(d => S(d.nome)));

  // Monta as linhas de casas em memória e coleta TODAS as cidades usadas.
  const casasRows = [];
  const cidadesUsadas = new Set();
  for (const d of ler('houses')) {
    const nome = S(d.name);
    const ov = overridePorNome[nome] || {};
    const cfg = configPorNome[nome] || {};
    const cidade = S(ov.cidade || cfg.cidade);
    if (cidade) cidadesUsadas.add(cidade);
    casasRows.push({
      id: d._id, nome, cidade,
      endereco: S(ov.endereco || cfg.endereco), bloco: blocoPorNome[nome] || null,
      tipo_compra: tipoPorNome[nome] || null,
      acolhidos: N(d.acolhidos) || 0, coordenadores: N(d.coordenadores) || 0,
      extra: N(d.extra) || 0, current_people: N(d.currentPeople) || 0,
      people_history: JSON.stringify(d.peopleHistory || []),
      ativo: !removidas.has(nome),
      created_at: TS(d.createdAt), updated_at: TS(d.updatedAt) || TS(d.createdAt),
    });
  }
  // também cidades declaradas em cidades_config/override e casas_config
  for (const d of [...ler('cidades_config'), ...ler('cidades_override')]) {
    const nm = S(d.nome || d.novoNome || d.originalNome); if (nm) cidadesUsadas.add(nm);
  }
  for (const d of ler('casas_config')) if (d.cidade) cidadesUsadas.add(S(d.cidade));
  for (const nome of cidadesUsadas) await upsert('cidades', { nome, ativo: true }, ['nome']);
  console.log('cidades');

  for (const row of casasRows) await upsert('houses', row, ['nome']);
  console.log('houses');

  // ── categorias: base do código + customizadas + referenciadas por produtos ──
  const CORE_CAT = {
    cereal: { nome: 'Cereal', icon: '🌾' }, higiene: { nome: 'Higiene', icon: '🧴' },
    proteina: { nome: 'Proteína', icon: '🥩' }, missa_sf: { nome: 'Missa Ser Feliz', icon: '⛪' },
    lanches_csl: { nome: 'Lanches - CSL', icon: '🥪' },
  };
  const catVistas = new Set();
  for (const [key, v] of Object.entries(CORE_CAT)) { await upsert('categorias', { key, nome: v.nome, icon: v.icon, ordem: 0, ativo: true }, ['key']); catVistas.add(key); }
  for (const d of ler('categorias_config')) { await upsert('categorias', { key: d._id, nome: S(d.nome), icon: S(d.icon), ordem: N(d.ordem) || 0, ativo: true }, ['key']); catVistas.add(d._id); }
  // qualquer categoria referenciada por produtos que ainda falte
  for (const d of ler('produtos_config')) {
    const k = S(d.categoria);
    if (k && !catVistas.has(k)) { await upsert('categorias', { key: k, nome: k, icon: '📦', ordem: 99, ativo: true }, ['key']); catVistas.add(k); }
  }
  console.log('categorias');

  // ── produtos (config + removidos) ──
  const removProd = {};
  for (const d of ler('produtos_removidos')) removProd[S(d.prodId)] = d;
  for (const d of ler('produtos_config')) {
    await upsert('produtos', {
      id: d._id, categoria_key: S(d.categoria), nome: S(d.nome), unidade: S(d.unidade),
      percapita: N(d.percapita), ppp: N(d.ppp), is_override: B(d.isOverride), ativo: S(d.status) !== 'removido',
      created_at: TS(d.createdAt), created_by: S(d.createdBy), updated_at: TS(d.updatedAt), updated_by: S(d.updatedBy),
    }, ['id']);
  }
  for (const [prodId, d] of Object.entries(removProd)) {
    // marca removido se existir; senão cria mínimo inativo
    await client.query(`update produtos set ativo=false, deleted_at=$2, deleted_by=$3 where id=$1`,
      [prodId, TS(d.deletedAt), S(d.deletedBy)]);
  }
  console.log('produtos');

  // ── suppliers ──
  for (const d of ler('suppliers')) {
    await upsert('suppliers', {
      id: d._id, nome: S(d.nome), cnpj: S(d.cnpj), contato: S(d.contato), contato_nome: S(d.contatoNome),
      email: S(d.email), obs: S(d.obs), prazo: S(d.prazo), limite: N(d.limite) || 0, utilizado: N(d.utilizado) || 0,
      categorias: d.categorias || [], created_at: TS(d.createdAt), created_by: S(d.createdBy), updated_at: TS(d.updatedAt),
    });
  }
  console.log('suppliers');

  // ── centros de custo ──
  for (const d of ler('centros_custo'))
    await upsert('centros_custo', { id: d._id, nome: S(d.nome), descricao: S(d.descricao), criado_em: TS(d.criadoEm) });
  for (const d of ler('centro_custo_categorias'))
    await upsert('centro_custo_categorias', { id: d._id, nome: S(d.nome), descricao: S(d.descricao), criado_em: TS(d.criadoEm) });
  console.log('centros_custo / categorias');

  // ── movements + items ──
  for (const d of ler('movements')) {
    await upsert('movements', {
      id: d._id, code: S(d.code), type: S(d.type), house: S(d.house),
      date: dataISO(d.date), date_str: S(d.dateStr), obs: S(d.obs), is_donation: B(d.isDonation),
      leitura_ia: B(d.leituraIA), photo_base64: S(d.photoBase64),
      registered_by: S(d.registeredBy), registered_uid: S(d.registeredUid), created_at: TS(d.createdAt),
    });
    await client.query('delete from movement_items where movement_id=$1', [d._id]);
    for (const it of (d.items || [])) {
      if (!it || it.catKey == null || it.prodId == null) continue; // pula item malformado
      await client.query(
        'insert into movement_items (movement_id,cat_key,prod_id,prod_nome,unidade,qty) values ($1,$2,$3,$4,$5,$6)',
        [d._id, S(it.catKey), S(it.prodId), S(it.prodNome), S(it.unidade), N(it.qty) || 0]);
    }
  }
  console.log('movements + items');

  // ── orders + items (items é map {cat:{prod:qty}}) ──
  for (const d of ler('orders')) {
    await upsert('orders', {
      id: d._id, code: S(d.code), house: S(d.house), status: S(d.status) || 'andamento',
      people: N(d.people), recipient: S(d.recipient), observations: S(d.observations), attach_obs: S(d.attachObs),
      date_str: S(d.dateStr), categories: d.categories || [],
      categoria_id: S(d.categoriaId), categoria_nome: S(d.categoriaNome),
      centro_custo_id: S(d.centroCustoId), centro_custo_nome: S(d.centroCustoNome),
      fornecedor_id: S(d.fornecedorId), fornecedor_nome: S(d.fornecedorNome),
      cotacao_aprovada_id: S(d.cotacaoAprovadaId), cotacao_fornecedor: S(d.cotacaoFornecedor), cotacao_valor: N(d.cotacaoValor),
      liberado_em: TS(d.liberadoEm), entregue: B(d.entregue), entregue_at: TS(d.entregueAt), entregue_by: S(d.entregueBy),
      nf_file_name: S(d.nfFileName), nf_file_url: S(d.nfFileURL), nf_numero: S(d.nfNumero), nf_valor: N(d.nfValor),
      boleto_file_name: S(d.boletoFileName), boleto_file_url: S(d.boletoFileURL), boleto_vencimento: dataISO(d.boletoVencimento),
      requester_uid: S(d.requesterUid), requester_name: S(d.requesterName), requester_email: S(d.requesterEmail),
      stock_eval: d.stockEval ? JSON.stringify(d.stockEval) : null, stock_eval_at: TS(d.stockEvalAt),
      stock_eval_by: S(d.stockEvalBy), stock_eval_estoque: S(d.stockEvalEstoque),
      purchase_items: d.purchaseItems ? JSON.stringify(d.purchaseItems) : null,
      created_at: TS(d.createdAt), updated_at: TS(d.updatedAt) || TS(d.createdAt),
    });
    await client.query('delete from order_items where order_id=$1', [d._id]);
    const items = d.items || {};
    for (const [catKey, prods] of Object.entries(items)) {
      if (prods && typeof prods === 'object') {
        for (const [prodId, qty] of Object.entries(prods)) {
          if (typeof qty === 'number' || typeof qty === 'string') {
            await client.query('insert into order_items (order_id,cat_key,prod_id,qty) values ($1,$2,$3,$4)',
              [d._id, catKey, prodId, N(qty) || 0]);
          }
        }
      }
    }
  }
  console.log('orders + items');

  // ── quotations ──
  for (const d of ler('quotations')) {
    await upsert('quotations', {
      id: d._id, order_id: S(d.orderId), fornecedor_id: S(d.fornecedorId), fornecedor_nome: S(d.fornecedorNome),
      valor: N(d.valor) || 0, validade: S(d.validade), obs: S(d.obs), status: S(d.status) || 'pendente',
      status_coordenador: S(d.statusCoordenador), coordenador_nome: S(d.coordenadorNome), coordenador_em: TS(d.coordenadorEm),
      status_gerente: S(d.statusGerente), gerente_nome: S(d.gerenteNome), gerente_em: TS(d.gerenteEm),
      created_at: TS(d.createdAt), created_by: S(d.createdBy),
    });
  }
  console.log('quotations');

  // ── transferencias + items ──
  for (const d of ler('transferencias')) {
    await upsert('transferencias', {
      id: d._id, code: S(d.code), origem: S(d.origem), destino: S(d.destino), data: dataISO(d.data),
      status: S(d.status) || 'pendente', order_id: S(d.orderId), order_code: S(d.orderCode),
      gerada_automaticamente: B(d.geradaAutomaticamente), criada_por: S(d.criadaPor), created_at: TS(d.createdAt),
    });
    await client.query('delete from transferencia_items where transferencia_id=$1', [d._id]);
    for (const it of (d.items || [])) {
      if (!it || it.catKey == null || it.prodId == null) continue;
      await client.query(
        'insert into transferencia_items (transferencia_id,cat_key,prod_id,prod_nome,unidade,qty) values ($1,$2,$3,$4,$5,$6)',
        [d._id, S(it.catKey), S(it.prodId), S(it.prodNome), S(it.unidade), N(it.qty) || 0]);
    }
  }
  console.log('transferencias + items');

  for (const d of ler('transferencias_financeiras')) {
    await upsert('transferencias_financeiras', {
      id: d._id, casa: S(d.casa), valor: N(d.valor) || 0, data: dataISO(d.data), coordenador: S(d.coordenador),
      periodo: S(d.periodo), obs: S(d.obs), registered_by: S(d.registeredBy), created_at: TS(d.createdAt),
    });
  }
  console.log('transferencias_financeiras');

  // ── compras_financeiro ──
  for (const d of ler('compras_financeiro')) {
    await upsert('compras_financeiro', {
      id: d._id, ano: N(d.ano), mes: S(d.mes), cat_key: S(d.catKey), classificacao: S(d.classificacao),
      centro_custo_id: S(d.centroCustoId), centro_custo_nome: S(d.centroCustoNome), chave_unica: S(d.chaveUnica),
      data_compra_str: S(d.dataCompraStr), data_compra: dataBR(d.dataCompraStr), data_compra_serial: N(d.dataCompraSerial),
      destinatario: S(d.destinatario), dias_prazo: N(d.diasPrazo), fornecedor: S(d.fornecedor), fornecedor_id: S(d.fornecedorId),
      importado_em: TS(d.importadoEm), lancado_hyb: S(d.lancadoHYB), lancado_sp: S(d.lancadoSP),
      nf_recebidas: S(d.nfRecebidas), pago: S(d.pago), pedido_id: S(d.pedidoId), pedido_realizado: S(d.pedidoRealizado),
      pedido_ref: S(d.pedidoRef), valor: N(d.valor) || 0, valor_nf: S(d.valorNF),
      vencimento_str: S(d.vencimentoStr), vencimento: dataISO(d.vencimentoStr), vencimento_serial: N(d.vencimentoSerial),
      created_at: TS(d.createdAt),
    });
  }
  console.log('compras_financeiro');

  // ── prices + historico ──
  for (const d of ler('prices')) {
    await upsert('prices', {
      id: d._id, cat_key: S(d.cat), prod_id: S(d.prodId), prod_nome: S(d.prodNome), unidade: S(d.unidade),
      city: S(d.city), price: N(d.price) || 0, updated_at: TS(d.updatedAt), updated_by: S(d.updatedBy),
    });
  }
  for (const d of ler('prices_historico')) {
    await upsert('prices_historico', {
      id: d._id, cat_key: S(d.cat), prod_id: S(d.prodId), city: S(d.city), price: N(d.price) || 0,
      saved_at: TS(d.savedAt), saved_by: S(d.savedBy),
    });
  }
  console.log('prices + historico');

  // ── percapitas ──
  for (const d of ler('percapitas')) {
    await upsert('percapitas', {
      id: d._id, house: S(d.house), values: JSON.stringify(d.values || {}), updated_at: TS(d.updatedAt), updated_by: S(d.updatedBy),
    }, ['house']);
  }
  console.log('percapitas');

  // ── ajustes ──
  for (const d of ler('ajustes')) {
    await upsert('ajustes', {
      id: d._id, tipo: S(d.tipo), descricao: S(d.descricao), urgencia: S(d.urgencia), status: S(d.status) || 'pendente',
      solicitante_uid: S(d.solicitanteUid), solicitante_nome: S(d.solicitanteNome), solicitante_email: S(d.solicitanteEmail),
      casa: S(d.casa), created_at: TS(d.createdAt),
    });
  }
  console.log('ajustes');

  // ── variedades ──
  for (const d of ler('var_setores'))
    await upsert('var_setores', { id: d._id, nome: S(d.nome), criado_em: TS(d.criadoEm) });
  for (const d of ler('var_solicitacoes')) {
    await upsert('var_solicitacoes', {
      id: d._id, codigo: S(d.codigo), material: S(d.material), quantidade: N(d.quantidade) || 0, unidade: S(d.unidade),
      setor: S(d.setor), prioridade: S(d.prioridade) || 'normal', status: S(d.status) || 'pendente',
      data_limite: dataISO(d.dataLimite), valor_estimado: N(d.valorEstimado) || 0, obs: S(d.obs),
      fornecedor: d.fornecedor ? JSON.stringify(d.fornecedor) : null, proposta_id: S(d.propostaId),
      solicitante_uid: S(d.solicitanteUid), solicitante_nome: S(d.solicitanteNome),
      criado_em: TS(d.criadoEm), editado_em: TS(d.editadoEm), editado_por: S(d.editadoPor),
      pedido_liberado_em: TS(d.pedido_liberadoEm), pedido_liberado_por: S(d.pedido_liberadoPor),
      compra_realizada_em: TS(d.compra_realizadaEm), compra_realizada_por: S(d.compra_realizadaPor),
      comprada_em: TS(d.compradaEm), comprada_por: S(d.compradaPor),
      concluido_em: TS(d.concluidoEm), concluido_por: S(d.concluidoPor),
    });
  }
  for (const d of ler('var_orcamentos')) {
    await upsert('var_orcamentos', {
      id: d._id, solicitacao_id: S(d.solicitacaoId), cotacoes: JSON.stringify(d.cotacoes || []),
      opcao_escolhida: N(d.opcaoEscolhida), status: S(d.status) || 'Pendente', aprovado_em: TS(d.aprovadoEm),
      aprovado_por: S(d.aprovadoPor), registrado_por: S(d.registradoPor), registrado_uid: S(d.registradoUid), criado_em: TS(d.criadoEm),
    });
  }
  for (const d of ler('var_propostas')) {
    await upsert('var_propostas', { id: d._id, autor_nome: S(d.autorNome), autor_uid: S(d.autorUid), criado_em: TS(d.criadoEm) });
    await client.query('delete from var_proposta_itens where proposta_id=$1', [d._id]);
    for (const it of (d.itens || [])) {
      await client.query(
        `insert into var_proposta_itens (proposta_id,solicitacao_id,codigo,material,setor,prioridade,quantidade,valor_estimado,valor_unitario,fornecedor,prazo_entrega,forma_pagamento,autorizado)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [d._id, S(it.solicitacaoId), S(it.codigo), S(it.material), S(it.setor), S(it.prioridade),
         N(it.quantidade) || 0, N(it.valorEstimado) || 0, N(it.valorUnitario) || 0, S(it.fornecedor),
         S(it.prazoEntrega), S(it.formaPagamento), B(it.autorizado)]);
    }
  }
  console.log('variedades (setores/solicitacoes/orcamentos/propostas+itens)');

  // ── kanban ──
  for (const d of ler('kanban_tasks')) {
    await upsert('kanban_tasks', {
      id: d._id, title: S(d.title), description: S(d.description), status: S(d.status) || 'pendente',
      urgency: S(d.urgency), assigned_role: S(d.assignedRole), deadline: dataISO(d.deadline),
      created_at: TS(d.createdAt), created_by: S(d.createdBy), updated_at: TS(d.updatedAt), completed_at: TS(d.completedAt),
    });
  }
  console.log('kanban_tasks');

  // ── metas (doc "categorias_ANO" → linhas por categoria) ──
  for (const d of ler('metas')) {
    const ano = N((d._id.match(/(\d{4})/) || [])[1]) || 0;
    for (const [catKey, m] of Object.entries(d)) {
      if (catKey === '_id' || !m || typeof m !== 'object') continue;
      await upsert('metas', {
        ano, cat_key: catKey, meta_semana: N(m.metaSemana) || 0, meta_mes: N(m.metaMes) || 0, meta_ano: N(m.metaAno) || 0,
      }, ['ano', 'cat_key']);
    }
  }
  for (const d of ler('metas_historico')) {
    await upsert('metas_historico', {
      id: d._id, ano: N(d.ano), data: JSON.stringify(d.data || {}), atualizado_em: TS(d.atualizadoEm), atualizado_por: S(d.atualizadoPor),
    });
  }
  console.log('metas + historico');

  // ── config (doc de forma livre → key/value) ──
  for (const d of ler('config')) {
    const { _id, ...resto } = d;
    await upsert('config', { chave: _id, valor: JSON.stringify(resto), updated_at: TS(resto.updatedAt) || new Date().toISOString() }, ['chave']);
  }
  console.log('config');

  // ── cardapio_planos ──
  for (const d of ler('cardapioPlanos')) {
    await upsert('cardapio_planos', {
      id: d._id, house: S(d.house), pessoas: N(d.pessoas), refeicoes: JSON.stringify(d.refeicoes || {}),
      cru_calculado: JSON.stringify(d.cruCalculado || {}), cafe_manha_tem_cafe: B(d.cafeManhaTemCafe),
      lanche_tarde_tem_cafe: B(d.lancheTardeTemCafe), gerado_em: TS(d.geradoEm), gerado_por: S(d.geradoPor),
    });
  }
  console.log('cardapio_planos');

  // ── auditoria (audit_logs novo + audit_log legado) ──
  for (const d of ler('audit_logs')) {
    await upsert('audit_logs', {
      id: d._id, origem: 'novo', acao: S(d.acao), colecao: S(d.colecao), doc_id: S(d.docId),
      detalhe: S(d.detalhe), data: dataISO(d.data), usuario: S(d.usuario), usuario_uid: S(d.usuarioUid),
      user_agent: null, ts: TS(d.ts),
    });
  }
  for (const d of ler('audit_log')) {
    await upsert('audit_logs', {
      id: d._id, origem: 'legado', acao: S(d.acao),
      colecao: null, doc_id: null,
      detalhe: [S(d.descricao), d.perfil ? `perfil=${d.perfil}` : null].filter(Boolean).join(' | ') || null,
      data: dataISO(d.dataHora), usuario: S(d.nome), usuario_uid: S(d.uid),
      user_agent: S(d.userAgent), ts: TS(d.timestamp) || TS(d.dataHora),
    });
  }
  console.log('audit_logs (novo + legado)');

  // ── sequence do código de variedades ──
  const maxVar = await client.query(
    `select coalesce(max((regexp_replace(codigo,'\\D','','g'))::int),0) m from var_solicitacoes where codigo ~ 'VAR-'`);
  await client.query(`select setval('var_codigo_seq', $1)`, [Math.max(1, (maxVar.rows[0].m || 0))]);
  console.log('var_codigo_seq ajustada');

  console.log(`\n✅ Carga concluída. ${totalLinhas} upserts (fora tabelas de itens).`);
}

main().catch(e => { console.error('❌ Erro:', e.message, '\n', e.stack); process.exitCode = 1; })
  .finally(() => client.end());
