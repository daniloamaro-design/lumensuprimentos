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
  function toCamel(v) {
    if (typeof v === 'string' && RE_ISO.test(v)) return wrapData(v);
    if (Array.isArray(v)) return v.map(toCamel);
    if (v && typeof v === 'object' && v.constructor === Object) {
      const o = {};
      for (const [k, val] of Object.entries(v)) o[toCamelKey(k)] = toCamel(val);
      return o;
    }
    return v;
  }
  function toSnake(v) {
    if (Array.isArray(v)) return v.map(toSnake);
    if (v && typeof v === 'object' && v.constructor === Object) {
      const o = {};
      for (const [k, val] of Object.entries(v)) o[toSnakeKey(k)] = toSnake(val);
      return o;
    }
    return v;
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

  // Aliases de campo por coleção: campo do app (snake) → coluna real do banco.
  // Ex.: produtos usava "categoria"; a tabela tem "categoria_key".
  const ALIAS = {
    produtos:         { categoria: 'categoria_key' },
    prices:           { cat: 'cat_key' },
    prices_historico: { cat: 'cat_key' },
  };
  const aliasDe = (col) => ALIAS[tabelaDe(col)];
  const aliasCampo = (col, snakeKey) => { const a = aliasDe(col); return (a && a[snakeKey]) || snakeKey; };
  function aplicarAliasEscrita(col, obj) {
    const a = aliasDe(col); if (!a) return obj;
    const o = {};
    for (const [k, v] of Object.entries(obj)) o[a[k] || k] = v;
    return o;
  }
  function aplicarAliasLeitura(col, data) {
    const a = aliasDe(col); if (!a) return data;
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

  // Prepara dados de escrita: snake_case + resolve serverTimestamp + aplica aliases.
  const prepEscrita = (col, dados) => aplicarAliasEscrita(col, resolverSentinelas(toSnake(dados)));

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
    const docs = rows.map((r) => ({
      id: r.id,
      exists: true,
      data: () => rowToData(col, r),
    }));
    return {
      docs, empty: docs.length === 0, size: docs.length,
      forEach: (fn) => docs.forEach(fn),
    };
  }

  // ── Referência a um documento: db.collection(x).doc(id) ────────────
  function docRef(col, id) {
    const tab = tabelaDe(col);
    return {
      id,
      async get() {
        const { data, error } = await _sb.from(tab).select(selectClause(col)).eq('id', id).maybeSingle();
        if (error) throw traduzErro(error);
        return { exists: !!data, id, data: () => (data ? rowToData(col, data) : undefined) };
      },
      async set(dados, opts) {
        const { parent, itens } = splitItens(col, prepEscrita(col, dados));
        const { error } = await _sb.from(tab).upsert({ ...parent, id }, { onConflict: 'id' });
        if (error) throw traduzErro(error);
        await gravarFilhos(col, id, itens);
      },
      async update(dados) {
        const { parent, itens } = splitItens(col, prepEscrita(col, dados));
        if (Object.keys(parent).length) {
          const { error } = await _sb.from(tab).update(parent).eq('id', id);
          if (error) throw traduzErro(error);
        }
        await gravarFilhos(col, id, itens);
      },
      async delete() {
        const { error } = await _sb.from(tab).delete().eq('id', id);
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
      where(campo, op, val) { filtros.push([aliasCampo(col, toSnakeKey(campo)), OP[op] || 'eq', val]); return b; },
      orderBy(campo, dir = 'asc') { ordens.push([aliasCampo(col, toSnakeKey(campo)), dir]); return b; },
      limit(n) { _limit = n; return b; },
      doc(id) { return docRef(col, id); },
      async add(dados) {
        const { parent, itens } = splitItens(col, prepEscrita(col, dados));
        const { data, error } = await _sb.from(tab).insert(parent).select('id').single();
        if (error) throw traduzErro(error);
        await gravarFilhos(col, data.id, itens);
        return { id: data.id };
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

  // ── Globais que o restante do app espera ───────────────────────────
  window.db = { collection };
  window.auth = authShim;
  window.firebase = {
    firestore: Object.assign(function () { return window.db; }, {
      FieldValue: {
        serverTimestamp: () => SERVER_TS,
        delete: () => null,
      },
    }),
    auth: function () { return authShim; },
    // storage: definido quando o módulo de pedidos for convertido
  };
})();
