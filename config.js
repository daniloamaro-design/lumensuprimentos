// ═══════════════════════════════════════════════════════════════════
//  LUMEN ESTOQUE — CONFIGURAÇÕES CENTRAIS
//  Arquivo: config.js
//  ⚠️  Substitua os valores entre [ ] pelos seus dados reais.
//  ⚠️  NUNCA compartilhe este arquivo publicamente.
// ═══════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// 🔥  FIREBASE
// ─────────────────────────────────────────────
window.FIREBASE_CONFIG = {
  apiKey:            "[SUA_FIREBASE_API_KEY]",
  authDomain:        "automacao-logistica2040.firebaseapp.com",
  projectId:         "automacao-logistica2040",
  storageBucket:     "automacao-logistica2040.firebasestorage.app",
  messagingSenderId: "980133097947",
  appId:             "[SEU_APP_ID]"
};

// ─────────────────────────────────────────────
// 📧  EMAILJS
// ─────────────────────────────────────────────
window.EMAILJS_SERVICE_ID  = "[SEU_EMAILJS_SERVICE_ID]";
window.EMAILJS_TEMPLATE_ID = "[SEU_EMAILJS_TEMPLATE_ID]";
window.EMAILJS_PUBLIC_KEY  = "[SUA_EMAILJS_PUBLIC_KEY]";

// ─────────────────────────────────────────────
// 🤖  GEMINI (Google AI)
// ─────────────────────────────────────────────
window.GEMINI_API_KEY    = "[SUA_NOVA_GEMINI_API_KEY]";
window.GEMINI_URL_VISION = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${window.GEMINI_API_KEY}`;
window.GEMINI_URL_TEXT   = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${window.GEMINI_API_KEY}`;

// ─────────────────────────────────────────────
// 👑  ADMIN — carregado do Firestore (seguro)
// ─────────────────────────────────────────────
window.ADMIN_EMAIL_FALLBACK = "daniloamaro@lumenserfeliz.org";
window.ADMIN_EMAIL = null;

// ─────────────────────────────────────────────
// 🔧  HELPER — chama Gemini com texto simples
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// 🚀  INICIALIZAÇÃO
// ─────────────────────────────────────────────
console.log('[Config] Configurações carregadas. Projeto:', window.FIREBASE_CONFIG.projectId);
firebase.initializeApp(window.FIREBASE_CONFIG);
window.auth    = firebase.auth();
window.db      = firebase.firestore();
window.storage = firebase.storage();
emailjs.init(window.EMAILJS_PUBLIC_KEY);
console.log('[Config] Firebase inicializado.');