// Extraído de index.html (config + dados do sistema + firebase init + state) em 2026-07-27
// DEVE ser o PRIMEIRO arquivo do bloco principal a carregar.
// ─────────────────────────────────────────────
// ⚙️  CONFIGURAÇÃO — PREENCHA ANTES DE USAR
// ─────────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyCJrEyqTInN2YzEwO1eOFibOTpj2Tj-LCQ",
  authDomain:        "automacao-logistica2040.firebaseapp.com",
  projectId:         "automacao-logistica2040",
  storageBucket:     "automacao-logistica2040.firebasestorage.app",
  messagingSenderId: "980133097947",
  appId:             "1:980133097947:web:4f778878f8e83b97f677fe"
};

// Email via EmailJS
const EMAILJS_SERVICE_ID  = "service_3j9tbrr";
const EMAILJS_TEMPLATE_ID = "template_p1hszi8";
const EMAILJS_PUBLIC_KEY  = "UHnFUf7wjvrxJa2d2";

// Gemini AI — para leitura automática dos formulários físicos
// GEMINI_API_KEY removida — agora é variável de ambiente no Vercel
const GEMINI_URL = "/api/gemini"; // chave segura no servidor Vercel

// E-mail do administrador geral
const ADMIN_EMAIL = "daniloamaro@lumenserfeliz.org";

// ─────────────────────────────────────────────
// 📦  DADOS DO SISTEMA (dinâmicos — carregados do Firebase)
// ─────────────────────────────────────────────

// Listas dinâmicas — preenchidas ao carregar o app
let CASAS = [
  'Dom Bosco','São Francisco','Fraternitas','São Gabriel',
  'Três Pastorinhos','Santa Dulce - CE','N. S. Lourdes',
  'Espírito Santo','Bom Samaritano','Filho Pródigo',
  'Coração Sagrado','Sítio Belém','Santa Dulce - SSA',
  'Fazenda Natal - SSA','Recanto Solidário - SSA',
  'Dom Helder - PE','Bom Jesus - SP'
];

let CIDADES = [
  'Fortaleza - CE',
  'Salvador - BA',
  'São Carlos - SP',
  'Jaboatão dos Guararapes - PE',
  'Simões Filho - BA',
  'Paulo Afonso - BA'
];

// Mapeamento casa → cidade (dinâmico)
let CASAS_CIDADES = {
  'Dom Bosco':              'Fortaleza - CE',
  'São Francisco':          'Fortaleza - CE',
  'Fraternitas':            'Fortaleza - CE',
  'São Gabriel':            'Fortaleza - CE',
  'Três Pastorinhos':       'Fortaleza - CE',
  'Santa Dulce - CE':       'Fortaleza - CE',
  'N. S. Lourdes':          'Fortaleza - CE',
  'Espírito Santo':         'Fortaleza - CE',
  'Bom Samaritano':         'Fortaleza - CE',
  'Filho Pródigo':          'Fortaleza - CE',
  'Coração Sagrado':        'Fortaleza - CE',
  'Sítio Belém':            'Fortaleza - CE',
  'Santa Dulce - SSA':      'Salvador - BA',
  'Fazenda Natal - SSA':    'Simões Filho - BA',
  'Recanto Solidário - SSA':'Paulo Afonso - BA',
  'Dom Helder - PE':        'Jaboatão dos Guararapes - PE',
  'Bom Jesus - SP':         'São Carlos - SP',
};

// Carrega casas e cidades extras do Firebase e mescla com os padrões
async function loadDynamicData() {
  // ── Coleções principais (já existem no Firestore) ──
  // ── Carrega categorias customizadas antes de tudo ──
  // No Supabase, casas/cidades/produtos foram consolidados nas tabelas houses/cidades/
  // produtos (com coluna `ativo` no lugar das antigas *_removidas/override/blocos).
  try {
    const catsSnap = await db.collection('categorias').orderBy('ordem').get();
    catsSnap.docs.forEach(d => {
      const c = d.data();
      if (c.ativo === false) return;
      if (!CATEGORIAS[c.key]) {
        CATEGORIAS[c.key] = { nome: c.nome, icon: c.icon || '📦', produtos: [], _custom: true };
      } else {
        CATEGORIAS[c.key].nome = c.nome;
        CATEGORIAS[c.key].icon = c.icon || CATEGORIAS[c.key].icon;
      }
    });
  } catch(e) { console.info('[loadDynamicData] categorias sem acesso:', e.code); }

  try {
    const [casasSnap, cidadesSnap, prodsSnap] = await Promise.all([
      db.collection('houses').get(),
      db.collection('cidades').get(),
      db.collection('produtos').get()
    ]);

    // Casas (nome/cidade/endereço/bloco já consolidados em houses)
    casasSnap.docs.forEach(d => {
      const data = d.data();
      if (data.ativo === false) return;
      if (!CASAS.includes(data.nome)) CASAS.push(data.nome);
      if (data.cidade)   CASAS_CIDADES[data.nome]  = data.cidade;
      if (data.endereco) CASAS_ENDERECOS[data.nome] = data.endereco;
      if (data.bloco)    CASAS_BLOCOS[data.nome]    = data.bloco;
    });

    // Cidades
    cidadesSnap.docs.forEach(d => {
      const data = d.data();
      if (data.ativo === false) return;
      if (!CIDADES.includes(data.nome)) CIDADES.push(data.nome);
    });

    // Produtos (inativos = ex-"removidos", ignorados)
    prodsSnap.docs.forEach(d => {
      const data = d.data();
      if (data.ativo === false) return;
      const cat = data.categoriaKey;
      if (!CATEGORIAS[cat]) return;
      const ppp = (data.percapita != null ? data.percapita : data.ppp) || 0;
      const existIdx = CATEGORIAS[cat].produtos.findIndex(p => p.id === d.id);
      if (existIdx >= 0) {
        CATEGORIAS[cat].produtos[existIdx] = {
          ...CATEGORIAS[cat].produtos[existIdx],
          nome: data.nome, unidade: data.unidade, ppp, _overridden: true
        };
      } else {
        CATEGORIAS[cat].produtos.push({ id: d.id, nome: data.nome, unidade: data.unidade, ppp, _custom: true });
      }
    });
  } catch(e) {
    console.warn('Erro ao carregar dados principais:', e);
  }

  // Ordena alfabeticamente
  CASAS.sort((a, b) => a.localeCompare(b, 'pt-BR'));
  CIDADES.sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

// Itens que usam fórmula especial: pessoas + 25%
const ITENS_HIGIENE_ESPECIAL = ['barbeador', 'escova_dente', 'herbissimo', 'pasta_dente', 'sabonete', 'shampoo', 'condicionador'];

// Per capitas por item (padrão global, pode ser sobrescrito por casa)
const PERCAPITAS_PADRAO = {
  cereal: {
    acucar: 0.045, arroz: 0.200, bolacha: 0.030, cafe: 0.014, comp_lacteo: 0.011,
    cremogema: 0.015, cuscuz: 0.200, farinha: 0.030, farinha_lactea: 0.015, feijao: 0.100,
    leite_po: 0.020, macarrao: 0.035, margarina: 0.005, mucilon: 0.000, oleo: 0.020,
    pao_integral: 0.001, sal: 0.009, suco_conc: 0.009, suco_po: 0.000
  },
  higiene: {
    absorvente: 0.030, agua_san: 0.022, aromatizador: 0.005, barbeador: 0.060, condicionador: 0.060,
    desgord: 0.022, desinfetante: 0.022, detergente: 0.015, escova_dente: 0.060, escovao: 0.006,
    esponja: 0.001, herbissimo: 0.060, pa: 0.001, palha_aco: 0.001, pano_chao: 0.001,
    papel_hig: 0.003, pasta_dente: 0.060, rodo: 0.001, sabao_barra: 0.006, sabao_po: 0.003,
    sabonete: 0.060, saco_100l: 0.036, saco_20l: 0.018, saco_50l: 0.027, shampoo: 0.060, vassoura: 0.001
  },
  proteina: {
    calabresa: 0.150, carne_moida: 0.150, coracao_boi: 0.100, coxa_sobrecoxa: 0.080, figado: 0.050,
    file_peixe: 0.100, frango: 0.250, linguica: 0.070, moela: 0.100, mortadela: 0.150,
    musculo: 0.000, ovo: 0.150, peixe_inteiro: 0.100, pernil: 0.050, salsicha: 0.150, soja: 0.200
  }
};

// ppp = quantidade sugerida por pessoa por semana
var CATEGORIAS = {
  cereal: {
    nome: 'Cereal', icon: '🌾',
    produtos: [
      { id: 'acucar',         nome: 'Açúcar',                    unidade: 'Kg',     ppp: 0.35 },
      { id: 'arroz',          nome: 'Arroz (Branco/Parboilizado)',unidade: 'Kg',     ppp: 1.5  },
      { id: 'bolacha',        nome: 'Bolacha',                   unidade: 'Unid.',  ppp: 0.5  },
      { id: 'cafe',           nome: 'Café',                      unidade: 'Kg',     ppp: 0.1  },
      { id: 'comp_lacteo',    nome: 'Composto Lácteo (pct 200g)',unidade: 'Kg',     ppp: 0.2  },
      { id: 'cremogema',      nome: 'Cremogema',                 unidade: 'Pacote', ppp: 0.15 },
      { id: 'cuscuz',         nome: 'Cuscuz',                    unidade: 'Kg',     ppp: 0.3  },
      { id: 'farinha',        nome: 'Farinha',                   unidade: 'Kg',     ppp: 0.2  },
      { id: 'farinha_lactea', nome: 'Farinha Láctea',            unidade: 'Pacote', ppp: 0.15 },
      { id: 'feijao',         nome: 'Feijão (Corda/Carioca/Preto)',unidade: 'Kg',  ppp: 0.6  },
      { id: 'leite_po',       nome: 'Leite em Pó (saco 200g)',   unidade: 'Kg',     ppp: 0.2  },
      { id: 'macarrao',       nome: 'Macarrão',                  unidade: 'Unid.',  ppp: 0.5  },
      { id: 'margarina',      nome: 'Margarina (Balde 3Kg)',      unidade: 'Balde 3Kg', ppp: 0.05},
      { id: 'mucilon',        nome: 'Mucilon',                   unidade: 'Pacote', ppp: 0.15 },
      { id: 'oleo',           nome: 'Óleo',                      unidade: 'Litro',  ppp: 0.3  },
      { id: 'pao_integral',   nome: 'Pão Integral',              unidade: 'Unid.',  ppp: 0.5  },
      { id: 'sal',            nome: 'Sal',                       unidade: 'Kg',     ppp: 0.1  },
      { id: 'suco_conc',      nome: 'Suco Concentrado',          unidade: 'Unid.',  ppp: 0.2  },
      { id: 'suco_po',        nome: 'Suco em Pó Variado',        unidade: 'Unid.',  ppp: 0.3  },
    ]
  },
  higiene: {
    nome: 'Higiene', icon: '🧴',
    produtos: [
      { id: 'absorvente',     nome: 'Absorvente',                unidade: 'Unid.',  ppp: 0.3  },
      { id: 'agua_san',       nome: 'Água Sanitária',            unidade: 'Unid.',  ppp: 0.2  },
      { id: 'aromatizador',   nome: 'Aromatizador',              unidade: 'Unid.',  ppp: 0.05 },
      { id: 'barbeador',      nome: 'Barbeador',                 unidade: 'Unid.',  ppp: 0.1  },
      { id: 'condicionador',  nome: 'Condicionador',             unidade: 'Unid.',  ppp: 0.15 },
      { id: 'desgord',        nome: 'Desengordurante',           unidade: 'Unid.',  ppp: 0.05 },
      { id: 'desinfetante',   nome: 'Desinfetante',              unidade: 'Unid.',  ppp: 0.2  },
      { id: 'detergente',     nome: 'Detergente',                unidade: 'Unid.',  ppp: 0.3  },
      { id: 'escova_dente',   nome: 'Escova de Dente',           unidade: 'Unid.',  ppp: 0.1  },
      { id: 'escovao',        nome: 'Escovão para Roupa',        unidade: 'Unid.',  ppp: 0.02 },
      { id: 'esponja',        nome: 'Esponja de Lavar Louça',    unidade: 'Unid.',  ppp: 0.1  },
      { id: 'herbissimo',     nome: 'Herbissimo (Desodorante)',   unidade: 'Unid.',  ppp: 0.2  },
      { id: 'pa',             nome: 'Pá',                        unidade: 'Unid.',  ppp: 0.01 },
      { id: 'palha_aco',      nome: 'Palha de Aço',              unidade: 'Unid.',  ppp: 0.1  },
      { id: 'pano_chao',      nome: 'Pano de Chão',              unidade: 'Unid.',  ppp: 0.05 },
      { id: 'papel_hig',      nome: 'Papel Higiênico',           unidade: 'Pacote', ppp: 0.5  },
      { id: 'pasta_dente',    nome: 'Pasta de Dente',            unidade: 'Unid.',  ppp: 0.1  },
      { id: 'rodo',           nome: 'Rodo',                      unidade: 'Unid.',  ppp: 0.02 },
      { id: 'sabao_barra',    nome: 'Sabão em Barra',            unidade: 'Unid.',  ppp: 0.2  },
      { id: 'sabao_po',       nome: 'Sabão em Pó',               unidade: 'Unid.',  ppp: 0.15 },
      { id: 'sabonete',       nome: 'Sabonete',                  unidade: 'Unid.',  ppp: 0.5  },
      { id: 'saco_100l',      nome: 'Saco de Lixo 100L',         unidade: 'Unid.',  ppp: 0.1  },
      { id: 'saco_20l',       nome: 'Saco de Lixo 20L',          unidade: 'Unid.',  ppp: 0.2  },
      { id: 'saco_50l',       nome: 'Saco de Lixo 50L',          unidade: 'Unid.',  ppp: 0.15 },
      { id: 'shampoo',        nome: 'Shampoo',                   unidade: 'Unid.',  ppp: 0.2  },
      { id: 'vassoura',       nome: 'Vassoura',                  unidade: 'Unid.',  ppp: 0.02 },
    ]
  },
  proteina: {
    nome: 'Proteína', icon: '🥩',
    produtos: [
      { id: 'calabresa',      nome: 'Calabresa',                 unidade: 'Kg',     ppp: 0.2  },
      { id: 'carne_moida',    nome: 'Carne Moída',               unidade: 'Kg',     ppp: 0.4  },
      { id: 'coracao_boi',    nome: 'Coração de Boi',            unidade: 'Kg',     ppp: 0.2  },
      { id: 'coxa_sobrecoxa', nome: 'Coxa e Sobrecoxa',          unidade: 'Kg',     ppp: 0.5  },
      { id: 'figado',         nome: 'Fígado',                    unidade: 'Kg',     ppp: 0.2  },
      { id: 'file_peixe',     nome: 'Filé de Peixe',             unidade: 'Kg',     ppp: 0.3  },
      { id: 'frango',         nome: 'Frango',                    unidade: 'Kg',     ppp: 0.5  },
      { id: 'linguica',       nome: 'Linguiça',                  unidade: 'Kg',     ppp: 0.2  },
      { id: 'moela',          nome: 'Moela',                     unidade: 'Kg',     ppp: 0.2  },
      { id: 'mortadela',      nome: 'Mortadela',                 unidade: 'Kg',     ppp: 0.15 },
      { id: 'musculo',        nome: 'Músculo',                   unidade: 'Kg',     ppp: 0.3  },
      { id: 'ovo',            nome: 'Ovo',                       unidade: 'Bandeja', ppp: 0.15},
      { id: 'peixe_inteiro',  nome: 'Peixe Inteiro',             unidade: 'Kg',     ppp: 0.3  },
      { id: 'pernil',         nome: 'Pernil Sem Osso',           unidade: 'Kg',     ppp: 0.3  },
      { id: 'salsicha',       nome: 'Salsicha',                  unidade: 'Kg',     ppp: 0.15 },
      { id: 'soja',           nome: 'Soja',                      unidade: 'Kg',     ppp: 0.2  },
    ]
  },
  missa_sf: {
    nome: 'Missa Ser Feliz', icon: '⛪',
    produtos: []
  },
  lanches_csl: {
    nome: 'Lanches - CSL', icon: '🥪',
    produtos: []
  }
};

// ─────────────────────────────────────────────
// 🏷️  NOME DO PRODUTO — FONTE ÚNICA DA VERDADE
// ─────────────────────────────────────────────
// Os documentos de movimentação guardam um snapshot do nome do produto
// (prodNome) da época em que foram registrados. Se o produto for renomeado
// no Gerenciamento de Produtos, os snapshots antigos ficam desatualizados.
// Para EXIBIÇÃO, sempre resolvemos o nome atual pelo prodId em CATEGORIAS
// (padrões + overrides do produtos_config) e usamos o snapshot apenas como
// fallback (produto removido do cadastro, por exemplo).
function nomeProdutoAtual(catKey, prodId, fallback) {
  const p = CATEGORIAS[catKey]?.produtos?.find(x => x.id === prodId);
  return (p && p.nome) || fallback || prodId || '';
}

// ─────────────────────────────────────────────
// 🔥  BANCO DE DADOS (Supabase via camada de compatibilidade js/00-db.js)
// ─────────────────────────────────────────────
// js/00-db.js (carregado antes) já criou window.db e window.auth emulando a API
// do Firebase sobre o Supabase. A persistência de sessão é configurada no cliente.
var auth = window.auth;
var db   = window.db;

// EmailJS init
emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });


// ─────────────────────────────────────────────
// 🏠  STATE
// ─────────────────────────────────────────────
var currentUser     = null;   // var = global entre blocos <script>
var currentUserData = null;
var guestMode       = false;
var guestName       = null;
var currentOrderCat = 'cereal';
// ─────────────────────────────────────────────
// 🏷️  CATEGORIAS DINÂMICAS — helpers globais
// ─────────────────────────────────────────────

/** Gera sugestão de emoji com base no nome da categoria */
function sugerirEmoji(nome) {
  const n = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if (/cereal|grao|milho|trigo|arroz|farinha/.test(n))  return '🌾';
  if (/higiene|limpe|limpez|sabao|deterg|produto/.test(n)) return '🧴';
  if (/prote[ií]na|carne|frango|peixe|ovo|soja/.test(n))  return '🥩';
  if (/missa|igreja|liturg|capel|religio/.test(n))        return '⛪';
  if (/lanche|snack|biscoito|pao|bolacha|cafe/.test(n))   return '🥪';
  if (/fruta|legume|verdura|hortal/.test(n))              return '🥦';
  if (/bebida|suco|agua|leite|refrig/.test(n))            return '🥤';
  if (/doce|sobrem|sorvete|bolo|torta/.test(n))           return '🍰';
  if (/material|escola|escolar|papelaria/.test(n))        return '📚';
  if (/roupa|vestua|uniforme|calcado/.test(n))            return '👕';
  if (/medicina|medic|reméd|farmac/.test(n))              return '💊';
  if (/ferrament|manut|conserto/.test(n))                 return '🔧';
  return '📦';
}

/** Reinicia os objetos de itens para incluir todas as categorias */
function initItemObjects() {
  const fresh = {};
  Object.keys(CATEGORIAS).forEach(k => { fresh[k] = {}; });
  return fresh;
}

/** Renderiza as abas de categoria dinamicamente em qualquer container */
function renderCatTabs(containerId, activeKey, onclickFn, countPrefix) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = Object.entries(CATEGORIAS).map(([k, c]) => `
    <button class="cat-tab ${k === activeKey ? 'active' : ''}" data-cat="${k}" onclick="${onclickFn}('${k}')">
      ${c.icon} ${c.nome} <span class="cat-count" id="${countPrefix}-${k}"></span>
    </button>`).join('');
}

/** Popula <select> de categoria em qualquer lugar */
function populateCatSelect(selectId, includeAll = false, currentVal = '') {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const prev = sel.value || currentVal;
  sel.innerHTML = includeAll ? '<option value="">Todas</option>' : '';
  Object.entries(CATEGORIAS).forEach(([k, c]) => {
    const o = document.createElement('option');
    o.value = k; o.textContent = `${c.icon} ${c.nome}`;
    sel.appendChild(o);
  });
  if (prev) sel.value = prev;
}

let orderItems      = initItemObjects();
let currentHousePeople = 0;
let currentHouseData = null; // Dados completos da casa selecionada
let currentHouseStockData = {}; // Estoque atual da casa
let currentHousePrices = {};   // Preços da cidade da casa
let housePercapitas = {}; // Per capitas por casa (carregado do Firebase)
let detailOrderData = null; // for PDF from modal

