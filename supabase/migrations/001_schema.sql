-- ═══════════════════════════════════════════════════════════════════
-- 001_schema.sql — Lumen Suprimentos: schema Postgres (FASE 1)
-- Mapa completo: docs/migracao/01-modelo-dados.md
-- Convenção: id text PK preserva o doc ID do Firestore (ETL: ON CONFLICT (id))
-- ═══════════════════════════════════════════════════════════════════

-- ── Usuários (uid do Firebase Auth preservado) ─────────────────────
create table users (
  id          text primary key,
  email       text unique,
  name        text,
  role        text not null default 'usuario'
              check (role in ('admin','diretor','gerente','coordenador','financeiro',
                              'compras','estoque','escritorio','csl','coord_csl','usuario')),
  status      text not null default 'pending'
              check (status in ('pending','approved','rejected')),
  house       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text
);

-- ── Cadastros base ─────────────────────────────────────────────────
create table cidades (
  nome        text primary key,
  ativo       boolean not null default true
);

create table houses (
  id              text primary key default (gen_random_uuid()::text),
  nome            text not null unique,
  cidade          text references cidades(nome),
  endereco        text,
  bloco           text,
  tipo_compra     text,
  acolhidos       integer not null default 0,
  coordenadores   integer not null default 0,
  extra           integer not null default 0,
  current_people  integer not null default 0,
  people_history  jsonb not null default '[]'::jsonb,
  ativo           boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table categorias (
  key         text primary key,
  nome        text not null,
  icon        text,
  ordem       integer not null default 0,
  ativo       boolean not null default true
);

create table produtos (
  id             text primary key,          -- prodId (ex.: 'arroz')
  categoria_key  text not null references categorias(key),
  nome           text not null,
  unidade        text,
  percapita      numeric,
  ppp            numeric,
  is_override    boolean not null default false,
  ativo          boolean not null default true,
  deleted_at     timestamptz,
  deleted_by     text,
  created_at     timestamptz not null default now(),
  created_by     text,
  updated_at     timestamptz not null default now(),
  updated_by     text
);

create table suppliers (
  id           text primary key default (gen_random_uuid()::text),
  nome         text not null,
  cnpj         text,
  contato      text,
  contato_nome text,
  email        text,
  obs          text,
  prazo        text,
  limite       numeric not null default 0,
  utilizado    numeric not null default 0,
  categorias   text[] not null default '{}',
  created_at   timestamptz not null default now(),
  created_by   text,
  updated_at   timestamptz not null default now()
);

create table centros_custo (
  id         text primary key default (gen_random_uuid()::text),
  nome       text not null,
  descricao  text,
  criado_em  timestamptz not null default now()
);

create table centro_custo_categorias (
  id         text primary key default (gen_random_uuid()::text),
  nome       text not null,
  descricao  text,
  criado_em  timestamptz not null default now()
);

-- ── Movimentações de estoque ───────────────────────────────────────
create table movements (
  id             text primary key default (gen_random_uuid()::text),
  code           text,
  type           text not null check (type in ('entrada','saida')),
  house          text not null,
  date           date,
  date_str       text,
  obs            text,
  is_donation    boolean not null default false,
  leitura_ia     boolean not null default false,
  photo_base64   text,
  registered_by  text,
  registered_uid text,
  created_at     timestamptz not null default now()
);
create index movements_house_idx on movements(house);
create index movements_date_idx  on movements(date);

create table movement_items (
  id           bigint generated always as identity primary key,
  movement_id  text not null references movements(id) on delete cascade,
  cat_key      text not null,
  prod_id      text not null,
  prod_nome    text,
  unidade      text,
  qty          numeric not null default 0
);
create index movement_items_mov_idx  on movement_items(movement_id);
create index movement_items_prod_idx on movement_items(cat_key, prod_id);

-- ── Pedidos ────────────────────────────────────────────────────────
create table orders (
  id                  text primary key default (gen_random_uuid()::text),
  code                text,
  house               text not null,
  status              text not null default 'andamento',
  -- CHECK de status será adicionado na FASE 2 após inventário do ETL (v. modelo de dados)
  people              integer,
  recipient           text,
  observations        text,
  attach_obs          text,
  date_str            text,
  categories          text[] not null default '{}',
  categoria_id        text,
  categoria_nome      text,
  centro_custo_id     text,
  centro_custo_nome   text,
  fornecedor_id       text,
  fornecedor_nome     text,
  cotacao_aprovada_id text,
  cotacao_fornecedor  text,
  cotacao_valor       numeric,
  liberado_em         timestamptz,
  entregue            boolean not null default false,
  entregue_at         timestamptz,
  entregue_by         text,
  nf_file_name        text,
  nf_file_url         text,
  nf_numero           text,
  nf_valor            numeric,
  boleto_file_name    text,
  boleto_file_url     text,
  boleto_vencimento   date,
  requester_uid       text,
  requester_name      text,
  requester_email     text,
  stock_eval          jsonb,
  stock_eval_at       timestamptz,
  stock_eval_by       text,
  stock_eval_estoque  text,
  purchase_items      jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index orders_status_idx on orders(status);
create index orders_house_idx  on orders(house);

create table order_items (
  id        bigint generated always as identity primary key,
  order_id  text not null references orders(id) on delete cascade,
  cat_key   text not null,
  prod_id   text not null,
  qty       numeric not null default 0
);
create index order_items_order_idx on order_items(order_id);

-- ── Cotações ───────────────────────────────────────────────────────
create table quotations (
  id                 text primary key default (gen_random_uuid()::text),
  order_id           text not null references orders(id) on delete cascade,
  fornecedor_id      text,
  fornecedor_nome    text,
  valor              numeric not null default 0,
  validade           text,
  obs                text,
  status             text not null default 'pendente',
  status_coordenador text,
  coordenador_nome   text,
  coordenador_em     timestamptz,
  status_gerente     text,
  gerente_nome       text,
  gerente_em         timestamptz,
  created_at         timestamptz not null default now(),
  created_by         text
);
create index quotations_order_idx on quotations(order_id);

-- ── Transferências ─────────────────────────────────────────────────
create table transferencias (
  id                     text primary key default (gen_random_uuid()::text),
  code                   text,
  origem                 text not null,
  destino                text not null,
  data                   date,
  status                 text not null default 'pendente',
  order_id               text,
  order_code             text,
  gerada_automaticamente boolean not null default false,
  criada_por             text,
  created_at             timestamptz not null default now()
);

create table transferencia_items (
  id               bigint generated always as identity primary key,
  transferencia_id text not null references transferencias(id) on delete cascade,
  cat_key          text not null,
  prod_id          text not null,
  prod_nome        text,
  unidade          text,
  qty              numeric not null default 0
);
create index transferencia_items_tr_idx on transferencia_items(transferencia_id);

create table transferencias_financeiras (
  id            text primary key default (gen_random_uuid()::text),
  casa          text not null,
  valor         numeric not null default 0,
  data          date,
  coordenador   text,
  periodo       text,
  obs           text,
  registered_by text,
  created_at    timestamptz not null default now()
);

-- ── Financeiro — compras ───────────────────────────────────────────
create table compras_financeiro (
  id                 text primary key default (gen_random_uuid()::text),
  ano                integer,
  mes                text,
  cat_key            text,
  classificacao      text,
  centro_custo_id    text,
  centro_custo_nome  text,
  chave_unica        text,
  data_compra_str    text,
  data_compra        date,
  data_compra_serial bigint,
  destinatario       text,
  dias_prazo         integer,
  fornecedor         text,
  fornecedor_id      text,
  importado_em       timestamptz,
  lancado_hyb        text,
  lancado_sp         text,
  nf_recebidas       text,
  pago               text,
  pedido_id          text,
  pedido_realizado   text,
  pedido_ref         text,
  valor              numeric not null default 0,
  valor_nf           text,
  vencimento_str     text,
  vencimento         date,
  vencimento_serial  integer,
  created_at         timestamptz not null default now()
);
create index compras_fin_chave_idx      on compras_financeiro(chave_unica);
create index compras_fin_ano_idx        on compras_financeiro(ano);
create index compras_fin_fornecedor_idx on compras_financeiro(fornecedor);

-- ── Preços ─────────────────────────────────────────────────────────
create table prices (
  id         text primary key default (gen_random_uuid()::text),
  cat_key    text not null,
  prod_id    text not null,
  prod_nome  text,
  unidade    text,
  city       text not null,
  price      numeric not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  unique (cat_key, prod_id, city)
);

create table prices_historico (
  id       text primary key default (gen_random_uuid()::text),
  cat_key  text not null,
  prod_id  text not null,
  city     text not null,
  price    numeric not null default 0,
  saved_at timestamptz not null default now(),
  saved_by text
);

-- ── Per capitas por casa ───────────────────────────────────────────
create table percapitas (
  id         text primary key default (gen_random_uuid()::text),
  house      text not null unique,
  values     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- ── Solicitações de ajuste ─────────────────────────────────────────
create table ajustes (
  id                text primary key default (gen_random_uuid()::text),
  tipo              text,
  descricao         text,
  urgencia          text,
  status            text not null default 'pendente',
  solicitante_uid   text,
  solicitante_nome  text,
  solicitante_email text,
  casa              text,
  created_at        timestamptz not null default now()
);

-- ── Módulo Variedades ──────────────────────────────────────────────
create table var_setores (
  id        text primary key default (gen_random_uuid()::text),
  nome      text not null unique,
  criado_em timestamptz not null default now()
);

create table var_solicitacoes (
  id                  text primary key default (gen_random_uuid()::text),
  codigo              text,
  material            text not null,
  quantidade          numeric not null default 0,
  unidade             text,
  setor               text,
  prioridade          text not null default 'normal',
  status              text not null default 'pendente'
                      check (status in ('pendente','em_proposta','pedido_liberado',
                                        'compra_realizada','comprada','concluido','cancelado')),
  data_limite         date,
  valor_estimado      numeric not null default 0,
  obs                 text,
  fornecedor          jsonb,
  proposta_id         text,
  solicitante_uid     text,
  solicitante_nome    text,
  criado_em           timestamptz not null default now(),
  editado_em          timestamptz,
  editado_por         text,
  pedido_liberado_em  timestamptz,
  pedido_liberado_por text,
  compra_realizada_em timestamptz,
  compra_realizada_por text,
  comprada_em         timestamptz,
  comprada_por        text,
  concluido_em        timestamptz,
  concluido_por       text
);

create table var_orcamentos (
  id              text primary key default (gen_random_uuid()::text),
  solicitacao_id  text references var_solicitacoes(id) on delete set null,
  cotacoes        jsonb not null default '[]'::jsonb,
  opcao_escolhida integer,
  status          text not null default 'Pendente',
  aprovado_em     timestamptz,
  aprovado_por    text,
  registrado_por  text,
  registrado_uid  text,
  criado_em       timestamptz not null default now()
);

create table var_propostas (
  id         text primary key default (gen_random_uuid()::text),
  autor_nome text,
  autor_uid  text,
  criado_em  timestamptz not null default now()
);

create table var_proposta_itens (
  id              bigint generated always as identity primary key,
  proposta_id     text not null references var_propostas(id) on delete cascade,
  solicitacao_id  text,
  codigo          text,
  material        text,
  setor           text,
  prioridade      text,
  quantidade      numeric not null default 0,
  valor_estimado  numeric not null default 0,
  valor_unitario  numeric not null default 0,
  fornecedor      text,
  prazo_entrega   text,
  forma_pagamento text,
  autorizado      boolean not null default false
);
create index var_prop_itens_prop_idx on var_proposta_itens(proposta_id);

-- ── Kanban ─────────────────────────────────────────────────────────
create table kanban_tasks (
  id            text primary key default (gen_random_uuid()::text),
  title         text not null,
  description   text,
  status        text not null default 'pendente',
  urgency       text,
  assigned_role text,
  deadline      date,
  created_at    timestamptz not null default now(),
  created_by    text,
  updated_at    timestamptz not null default now(),
  completed_at  timestamptz
);

-- ── Metas ──────────────────────────────────────────────────────────
create table metas (
  ano         integer not null,
  cat_key     text not null,
  meta_semana numeric not null default 0,
  meta_mes    numeric not null default 0,
  meta_ano    numeric not null default 0,
  primary key (ano, cat_key)
);

create table metas_historico (
  id            text primary key default (gen_random_uuid()::text),
  ano           integer,
  data          jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);

-- ── Configurações de forma livre ───────────────────────────────────
create table config (
  chave      text primary key,           -- doc id do Firestore (ex.: stock_exclusions)
  valor      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ── Cardápio ───────────────────────────────────────────────────────
create table cardapio_planos (
  id                    text primary key default (gen_random_uuid()::text),
  house                 text not null,
  pessoas               integer,
  refeicoes             jsonb not null default '{}'::jsonb,
  cru_calculado         jsonb not null default '{}'::jsonb,
  cafe_manha_tem_cafe   boolean not null default false,
  lanche_tarde_tem_cafe boolean not null default false,
  gerado_em             timestamptz not null default now(),
  gerado_por            text
);

-- ── Auditoria (unifica audit_logs + audit_log legado) ─────────────
create table audit_logs (
  id          text primary key default (gen_random_uuid()::text),
  origem      text not null default 'novo' check (origem in ('novo','legado')),
  acao        text not null,
  colecao     text,
  doc_id      text,
  detalhe     text,
  data        date,
  usuario     text,
  usuario_uid text,
  user_agent  text,
  ts          timestamptz not null default now()
);
create index audit_logs_ts_idx on audit_logs(ts);
