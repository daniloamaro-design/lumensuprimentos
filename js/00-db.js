// ═══════════════════════════════════════════════════════════════════
// js/00-db.js — Camada de compatibilidade Firebase → Supabase
// Emula a API do Firebase (db.collection, auth, firebase.firestore.*) sobre o
// Supabase, para que os módulos 01–17 mudem o mínimo possível.
// Carregar DEPOIS do CDN do supabase-js e ANTES de js/01-core.js.
// ═══════════════════════════════════════════════════════════════════
(function () {
  const SUPABASE_URL = 'https://saalwqfjhnvleltqfftr.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_N23E2SHI9SBehB8-f-OF3g_W_8T2JEk';

  const _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  window._sb = _sb; // acesso direto quando precisar de recursos nativos

  // ── Conversão de nomes de campo snake_case ↔ camelCase ─────────────
  const toCamelKey = (k) => k.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
  const toSnakeKey = (k) => k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());

  // Datas timestamptz vêm como string ISO. O código do app às vezes chama .toDate()
  // (herança do Firestore). Envolvemos strings ISO com hora num objeto String que
  // TAMBÉM tem .toDate() — assim funciona como texto (slice, comparação, template,
  // JSON) E como Timestamp do Firestore.
  const RE_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
  function wrapData(iso) {
    const s = new String(iso);
    s.toDate = () => new Date(iso);
    s.seconds = Math.floor(new Date(iso).getTime() / 1000);
    return s;
  }
  // Conversão RASA (só o nível de cima). Valores de colunas JSONB (stockEval,
  // percapitas, cotações, peopleHistory…) passam intactos — preservando as chaves
  // internas exatamente como o app as gravou. Strings ISO de topo viram objeto data.
  function toCamel(row) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
    const o = {};
    for (const [k, v] of Object.entries(row)) {
      o[toCamelKey(k)] = (typeof v === 'string' && RE_ISO.test(v)) ? wrapData(v) : v;
    }
    return o;
  }
  function toSnake(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
    const o = {};
    for (const [k, v] of Object.entries(obj)) o[toSnakeKey(k)] = v;
    return o;
  }

  // Sentinela de serverTimestamp → data atual em ISO (timestamptz aceita).
  const SERVER_TS = '__SERVER_TIMESTAMP__';
  function resolverSentinelas(obj) {
    const o = {};
    for (const [k, val] of Object.entries(obj)) {
      o[k] = (val === SERVER_TS) ? new Date().toISOString() : val;
    }
    return o;
  }

  // Nome da coleção (Firestore) → tabela (Postgres). Só os renomeados simples.
  const TABELA = {
    categorias_config: 'categorias',
    produtos_config: 'produtos',
    cidades_config: 'cidades',
    cardapioPlanos: 'cardapio_planos',
  };
  const tabelaDe = (col) => TABELA[col] || col;

  // Chave primária por tabela (default 'id'). Algumas usam chave natural.
  const PK = { cidades: 'nome', categorias: 'key', casas_tipo_compra: 'nome' };
  const pkDe = (col) => PK[tabelaDe(col)] || 'id';

  // Aliases: nome EXATO do campo no app (camelCase) → coluna real do banco (snake).
  // Necessário para renomeações (categoria→categoria_key) e siglas que a conversão
  // genérica não acerta (nfFileURL→nf_file_url, leituraIA→leitura_ia).
  const ALIAS = {
    produtos:         { categoria: 'categoria_key' },
    prices:           { cat: 'cat_key' },
    prices_historico: { cat: 'cat_key' },
    orders:           { nfFileURL: 'nf_file_url', boletoFileURL: 'boleto_file_url' },
    movements:        { leituraIA: 'leitura_ia' },
  };
  const aliasDe = (col) => ALIAS[tabelaDe(col)] || {};
  // campo do app → coluna do banco (where/orderBy)
  const campoParaColuna = (col, campo) => aliasDe(col)[campo] || toSnakeKey(campo);
  // objeto do app → objeto p/ o banco (chaves via alias/snake; valores intactos)
  function objParaBanco(col, obj) {
    const a = aliasDe(col);
    const o = {};
    for (const [k, v] of Object.entries(obj)) o[a[k] || toSnakeKey(k)] = v;
    return o;
  }
  // linha do banco → adiciona os nomes que o app espera (ex.: data.nfFileURL)
  function aplicarAliasLeitura(col, data) {
    const a = aliasDe(col);
    for (const [appKey, dbCol] of Object.entries(a)) data[appKey] = data[toCamelKey(dbCol)];
    return data;
  }

  // Operadores Firestore → Supabase (PostgREST)
  const OP = { '==': 'eq', '!=': 'neq', '>': 'gt', '>=': 'gte', '<': 'lt', '<=': 'lte', 'in': 'in', 'array-contains': 'cs' };

  // ── Coleções cujos "itens" foram normalizados em tabela-filha ──────
  // O shim reconstrói o campo na leitura e desmembra na escrita.
  const CHILDREN = {
    movements:      { table: 'movement_items',      fk: 'movement_id',      field: 'items', shape: 'array' },
    orders:         { table: 'order_items',         fk: 'order_id',         field: 'items', shape: 'orderMap' },
    transferencias: { table: 'transferencia_items', fk: 'transferencia_id', field: 'items', shape: 'array' },
    var_propostas:  { table: 'var_proposta_itens',  fk: 'proposta_id',      field: 'itens', shape: 'array' },
  };
  const selectClause = (col) => (CHILDREN[col] ? `*, ${CHILDREN[col].table}(*)` : '*');

  // Linha do banco → objeto que o app espera (camelCase + itens reconstruídos).
  function rowToData(col, row) {
    const cfg = CHILDREN[col];
    if (!cfg) return aplicarAliasLeitura(col, toCamel(row));
    const filhos = row[cfg.table] || [];
    const parent = { ...row }; delete parent[cfg.table];
    const data = toCamel(parent);
    if (cfg.shape === 'array') {
      data[cfg.field] = filhos.map((f) => { const c = toCamel(f); delete c.id; delete c[toCamelKey(cfg.fk)]; return c; });
    } else if (cfg.shape === 'orderMap') {
      const m = {};
      for (const f of filhos) { (m[f.cat_key] = m[f.cat_key] || {})[f.prod_id] = f.qty; }
      data[cfg.field] = m;
    }
    return aplicarAliasLeitura(col, data);
  }

  // Prepara dados de escrita: alias + snake nas chaves de topo + resolve serverTimestamp.
  const prepEscrita = (col, dados) => resolverSentinelas(objParaBanco(col, dados));

  // Dados de escrita → { parent (sem itens), itens (linhas p/ tabela-filha) }
  function splitItens(col, dados) {
    const cfg = CHILDREN[col];
    if (!cfg || dados[cfg.field] === undefined) return { parent: dados, itens: null };
    const parent = { ...dados }; const bruto = parent[cfg.field]; delete parent[cfg.field];
    let itens = [];
    if (cfg.shape === 'array') {
      itens = (bruto || []).map((it) => toSnake(it));
    } else if (cfg.shape === 'orderMap') {
      for (const [catKey, prods] of Object.entries(bruto || {})) {
        for (const [prodId, qty] of Object.entries(prods || {})) {
          if (typeof qty === 'number' || typeof qty === 'string') itens.push({ cat_key: catKey, prod_id: prodId, qty: Number(qty) || 0 });
        }
      }
    }
    return { parent, itens };
  }
  async function gravarFilhos(col, id, itens) {
    const cfg = CHILDREN[col];
    if (!cfg || itens == null) return;
    await _sb.from(cfg.table).delete().eq(cfg.fk, id);
    if (itens.length) {
      const linhas = itens.map((it) => ({ ...it, [cfg.fk]: id }));
      const { error } = await _sb.from(cfg.table).insert(linhas);
      if (error) throw traduzErro(error);
    }
  }

  // ── Snapshot (resultado de .get()) ─────────────────────────────────
  function fazerSnapshot(col, rows) {
    const pk = pkDe(col);
    const docs = rows.map((r) => ({
      id: r[pk],
      exists: true,
      data: () => rowToData(col, r),
      get ref() { return docRef(col, r[pk]); },
    }));
    return {
      docs, empty: docs.length === 0, size: docs.length,
      forEach: (fn) => docs.forEach(fn),
    };
  }

  // ── Referência a um documento: db.collection(x).doc(id) ────────────
  function docRef(col, id) {
    const tab = tabelaDe(col);
    const pk = pkDe(col);

    // Caso especial: metas. No Firestore era 1 doc 'categorias_ANO' com um mapa
    // {catKey: {metaSemana, metaMes, metaAno}}. No Postgres virou linhas (ano, cat_key).
    // O shim reconstrói o mapa na leitura e explode em linhas na escrita.
    if (tab === 'metas') {
      const ano = parseInt(String(id).replace(/\D/g, ''), 10) || 0;
      const gravar = async (dados) => {
        for (const [catKey, m] of Object.entries(dados)) {
          if (!m || typeof m !== 'object') continue;
          const { error } = await _sb.from('metas').upsert(
            { ano, cat_key: catKey, meta_semana: m.metaSemana || 0, meta_mes: m.metaMes || 0, meta_ano: m.metaAno || 0 },
            { onConflict: 'ano,cat_key' });
          if (error) throw traduzErro(error);
        }
      };
      return {
        id,
        async get() {
          const { data, error } = await _sb.from('metas').select('*').eq('ano', ano);
          if (error) throw traduzErro(error);
          const obj = {};
          for (const r of (data || [])) obj[r.cat_key] = { metaSemana: r.meta_semana, metaMes: r.meta_mes, metaAno: r.meta_ano };
          return { exists: !!(data && data.length), id, data: () => obj };
        },
        set: gravar,
        update: gravar,
        async delete() { await _sb.from('metas').delete().eq('ano', ano); },
      };
    }

    return {
      id,
      async get() {
        const { data, error } = await _sb.from(tab).select(selectClause(col)).eq(pk, id).maybeSingle();
        if (error) throw traduzErro(error);
        return { exists: !!data, id, data: () => (data ? rowToData(col, data) : undefined) };
      },
      async set(dados, opts) {
        const { parent, itens } = splitItens(col, prepEscrita(col, dados));
        const { error } = await _sb.from(tab).upsert({ ...parent, [pk]: id }, { onConflict: pk });
        if (error) throw traduzErro(error);
        await gravarFilhos(col, id, itens);
      },
      async update(dados) {
        const { parent, itens } = splitItens(col, prepEscrita(col, dados));
        if (Object.keys(parent).length) {
          const { error } = await _sb.from(tab).update(parent).eq(pk, id);
          if (error) throw traduzErro(error);
        }
        await gravarFilhos(col, id, itens);
      },
      async delete() {
        const { error } = await _sb.from(tab).delete().eq(pk, id);
        if (error) throw traduzErro(error);
      },
    };
  }

  // ── Query builder: db.collection(x).where().orderBy().limit().get() ─
  function collection(col) {
    const tab = tabelaDe(col);
    const filtros = [];
    const ordens = [];
    let _limit = null;
    const b = {
      where(campo, op, val) { filtros.push([campoParaColuna(col, campo), OP[op] || 'eq', val]); return b; },
      orderBy(campo, dir = 'asc') { ordens.push([campoParaColuna(col, campo), dir]); return b; },
      limit(n) { _limit = n; return b; },
      // doc() sem id → gera um id (UUID) no cliente para inserção via .set()
      doc(id) {
        if (id == null) id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : ('id-' + Date.now() + Math.random().toString(36).slice(2));
        return docRef(col, id);
      },
      async add(dados) {
        const pk = pkDe(col);
        const { parent, itens } = splitItens(col, prepEscrita(col, dados));
        const { data, error } = await _sb.from(tab).insert(parent).select(pk).single();
        if (error) throw traduzErro(error);
        await gravarFilhos(col, data[pk], itens);
        return { id: data[pk] };
      },
      async get() {
        let q = _sb.from(tab).select(selectClause(col));
        for (const [c, op, val] of filtros) q = q[op](c, val);
        for (const [c, dir] of ordens) q = q.order(c, { ascending: dir === 'asc' });
        if (_limit != null) q = q.limit(_limit);
        const { data, error } = await q;
        if (error) throw traduzErro(error);
        return fazerSnapshot(col, data || []);
      },
      // onSnapshot: implementado por polling leve (30s) — os listeners do app são,
      // na prática, detectores de mudança. Retorna função de cancelamento.
      onSnapshot(cb, errCb) {
        let ativo = true;
        const rodar = async () => {
          try { if (ativo) cb(await b.get()); }
          catch (e) { if (errCb) errCb(e); }
        };
        rodar();
        const timer = setInterval(rodar, 30000);
        return () => { ativo = false; clearInterval(timer); };
      },
    };
    return b;
  }

  // ── Tradução de erros Supabase → códigos estilo Firebase ───────────
  function traduzErro(error) {
    const msg = (error && (error.message || error.msg || '')) + '';
    const m = msg.toLowerCase();
    let code = error?.code || '';
    if (/invalid login credentials/.test(m)) code = 'auth/invalid-credential';
    else if (/email not confirmed/.test(m)) code = 'auth/email-not-verified';
    else if (/user already registered|already been registered/.test(m)) code = 'auth/email-already-in-use';
    else if (/invalid email/.test(m)) code = 'auth/invalid-email';
    else if (/password should be at least/.test(m)) code = 'auth/weak-password';
    else if (/rate limit|too many/.test(m)) code = 'auth/too-many-requests';
    const e = new Error(msg);
    e.code = code || error?.code || 'unknown';
    return e;
  }

  // ── Shim de autenticação (auth.*) ──────────────────────────────────
  function mapUser(u) {
    if (!u) return null;
    return { uid: u.id, email: u.email || '', displayName: u.user_metadata?.name || '', isAnonymous: !!u.is_anonymous };
  }
  const authShim = {
    get currentUser() { return mapUser(authShim._user); },
    _user: null,
    onAuthStateChanged(cb) {
      // dispara o estado atual e escuta mudanças
      _sb.auth.getSession().then(({ data }) => {
        authShim._user = data.session?.user || null;
        cb(mapUser(authShim._user));
      });
      const { data: sub } = _sb.auth.onAuthStateChange((_event, session) => {
        authShim._user = session?.user || null;
        cb(mapUser(authShim._user));
      });
      return () => sub.subscription.unsubscribe();
    },
    async signInWithEmailAndPassword(email, password) {
      const { data, error } = await _sb.auth.signInWithPassword({ email, password });
      if (error) throw traduzErro(error);
      return { user: mapUser(data.user) };
    },
    async createUserWithEmailAndPassword(email, password) {
      const { data, error } = await _sb.auth.signUp({ email, password });
      if (error) throw traduzErro(error);
      return { user: mapUser(data.user) };
    },
    async sendPasswordResetEmail(email) {
      const { error } = await _sb.auth.resetPasswordForEmail(email);
      if (error) throw traduzErro(error);
    },
    async signInAnonymously() {
      const { data, error } = await _sb.auth.signInAnonymously();
      if (error) throw traduzErro(error);
      return { user: mapUser(data.user) };
    },
    async signOut() {
      await _sb.auth.signOut();
      authShim._user = null;
    },
  };

  // ── Shim de Storage (firebase.storage) → bucket 'pedidos' do Supabase ─
  // Emula storage.ref(path).put(file) → getDownloadURL(). O bucket é PRIVADO;
  // getDownloadURL() devolve o CAMINHO no bucket (não uma URL pública). A
  // visualização gera URL assinada sob demanda via window.urlArquivoPedido().
  function storageShim() {
    return {
      ref(path) {
        const key = String(path).replace(/^pedidos\//, '');
        return {
          fullPath: key,
          put: async (file) => {
            const { error } = await _sb.storage.from('pedidos').upload(key, file, { upsert: true, contentType: file.type || undefined });
            if (error) throw error;
            return { ref: { fullPath: key, getDownloadURL: async () => key } };
          },
          getDownloadURL: async () => key,
        };
      },
    };
  }
  // Gera URL assinada (1h) para um caminho do bucket; repassa URLs http legadas.
  window.urlArquivoPedido = async function (pathOrUrl) {
    if (!pathOrUrl) return null;
    if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
    const key = String(pathOrUrl).replace(/^pedidos\//, '');
    const { data } = await _sb.storage.from('pedidos').createSignedUrl(key, 3600);
    return data?.signedUrl || null;
  };
  // Abre (ou baixa) um arquivo de pedido a partir do caminho salvo no banco.
  window.verArquivoPedido = async function (path, nome, download) {
    const url = await window.urlArquivoPedido(path);
    if (!url) { if (window.showToast) showToast('Arquivo indisponível.'); return; }
    if (download) {
      const a = document.createElement('a'); a.href = url; a.download = nome || ''; a.target = '_blank';
      document.body.appendChild(a); a.click(); a.remove();
    } else {
      window.open(url, '_blank', 'noopener');
    }
  };

  // ── Batch (db.batch()) → executa as operações em sequência ─────────
  // Não é atômico como o Firestore, mas equivale para a migração. Operações
  // que exigem atomicidade real (aprovar cotação) usam funções SQL (RPC).
  function makeBatch() {
    const ops = [];
    return {
      set(ref, data, opts) { ops.push(() => ref.set(data, opts)); return this; },
      update(ref, data) { ops.push(() => ref.update(data)); return this; },
      delete(ref) { ops.push(() => ref.delete()); return this; },
      async commit() { for (const op of ops) await op(); },
    };
  }

  // ── Globais que o restante do app espera ───────────────────────────
  window.db = { collection, batch: makeBatch };
  window.auth = authShim;
  window.firebase = {
    firestore: Object.assign(function () { return window.db; }, {
      FieldValue: {
        serverTimestamp: () => SERVER_TS,
        delete: () => null,
      },
    }),
    auth: function () { return authShim; },
    storage: storageShim,
  };
})();
