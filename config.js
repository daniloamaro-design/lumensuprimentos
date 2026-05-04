// ═══════════════════════════════════════════════════════════════════
//  LUMEN ESTOQUE — CONFIGURAÇÕES CENTRAIS
//  Arquivo: config.js
//
//  ⚠️  ATENÇÃO: Este é o ÚNICO arquivo que contém chaves e configs.
//  Não compartilhe este arquivo publicamente.
//  No Firebase Hosting, este arquivo fica protegido por login —
//  mas para segurança extra, mova as chaves para o Firestore
//  seguindo o tutorial abaixo.
//
//  TUTORIAL — Como usar o Firestore para guardar o admin_email:
//  1. No Firebase Console → Firestore → crie a coleção "app_config"
//  2. Crie o documento de ID "geral"
//  3. Adicione o campo: admin_email (string) = seu@email.com
//  4. O sistema vai buscar automaticamente — não precisa mais ficar aqui.
// ═══════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// 🔥  FIREBASE
// ─────────────────────────────────────────────
// Pegue estes valores em: Firebase Console → Configurações do projeto → Seus apps
window.FIREBASE_CONFIG = {
  apiKey:            "AIzaSyCJrEyqTInN2YzEwO1eOFibOTpj2Tj-LCQ",
  authDomain:        "automacao-logistica2040.firebaseapp.com",
  projectId:         "automacao-logistica2040",
  storageBucket:     "automacao-logistica2040.firebasestorage.app",
  messagingSenderId: "980133097947",
  appId:             "1:980133097947:web:4f778878f8e83b97f677fe"
};

// ─────────────────────────────────────────────
// 📧  EMAILJS
// ─────────────────────────────────────────────
// Pegue em: emailjs.com → Account → API Keys
window.EMAILJS_SERVICE_ID  = "service_3j9tbrr";
window.EMAILJS_TEMPLATE_ID = "template_p1hszi8";
window.EMAILJS_PUBLIC_KEY  = "UHnFUf7wjvrxJa2d2";

// ─────────────────────────────────────────────
// 🤖  GEMINI (Google AI)
// ─────────────────────────────────────────────
// Pegue em: aistudio.google.com → Get API key
// Esta chave é usada para:
//   • Leitura de formulários por foto (já funcionava)
//   • Previsão de demanda com IA  (CORRIGIDO)
//   • Análise de fornecedores     (CORRIGIDO)
//   • Padrão crítico recorrente   (CORRIGIDO)
window.GEMINI_API_KEY = "AIzaSyA0aNhueUqE5qVEDLqyeGa5FaGb02cAjGs";
window.GEMINI_URL_VISION = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${window.GEMINI_API_KEY}`;
window.GEMINI_URL_TEXT   = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${window.GEMINI_API_KEY}`;

// ─────────────────────────────────────────────
// 👑  ADMIN — carregado do Firestore (seguro)
// ─────────────────────────────────────────────
// NÃO coloque o e-mail aqui. Ele é carregado automaticamente
// do Firestore (coleção app_config, documento geral, campo admin_email).
// Veja a função carregarAdminEmail() em lumen-auth.js.
// Este fallback só é usado se o Firestore não responder:
window.ADMIN_EMAIL_FALLBACK = "daniloamaro@lumenserfeliz.org";
window.ADMIN_EMAIL = null; // será preenchido pela função carregarAdminEmail()

// ─────────────────────────────────────────────
// 🔧  HELPER — chama Gemini com texto simples
// ─────────────────────────────────────────────
// Use esta função em qualquer lugar do sistema para chamar a IA:
//   const resposta = await callGemini("Seu prompt aqui");
window.callGemini = async function(prompt, maxTokens = 1000) {
  const resp = await fetch(window.GEMINI_URL_TEXT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: maxTokens
      }
    })
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Gemini erro ${resp.status}: ${err?.error?.message || 'sem detalhes'}`);
  }
  const data = await resp.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
};

console.log('[Config] Configurações carregadas. Projeto:', window.FIREBASE_CONFIG.projectId);
// Inicializa Firebase e expõe globalmente
firebase.initializeApp(window.FIREBASE_CONFIG);
window.auth = firebase.auth();
window.db   = firebase.firestore();
window.storage = firebase.storage();
emailjs.init(window.EMAILJS_PUBLIC_KEY);

console.log('[Config] Firebase inicializado.');
