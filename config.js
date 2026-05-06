// ═══════════════════════════════════════════════════════════════════
//  LUMEN ESTOQUE — CONFIGURAÇÕES CENTRAIS
// ═══════════════════════════════════════════════════════════════════

window.FIREBASE_CONFIG = {
  apiKey:            "AIzaSyCJrEyqTInN2YzEwO1eOFibOTpj2Tj-LCQ",
  authDomain:        "automacao-logistica2040.firebaseapp.com",
  projectId:         "automacao-logistica2040",
  storageBucket:     "automacao-logistica2040.firebasestorage.app",
  messagingSenderId: "980133097947",
  appId:             "1:980133097947:web:4f778878f8e83b97f677fe"
};

window.EMAILJS_SERVICE_ID  = "service_3j9tbrr";
window.EMAILJS_TEMPLATE_ID = "template_p1hszi8";
window.EMAILJS_PUBLIC_KEY  = "UHnFUf7wjvrxJa2d2";

window.GEMINI_API_KEY    = "CHAVE_REMOVIDA_DO_HISTORICO";
window.GEMINI_URL_VISION = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${window.GEMINI_API_KEY}`;
window.GEMINI_URL_TEXT   = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${window.GEMINI_API_KEY}`;

window.ADMIN_EMAIL_FALLBACK = "daniloamaro@lumenserfeliz.org";
window.ADMIN_EMAIL = null;

window.callGemini = async function(prompt, maxTokens = 1000) {
  const resp = await fetch(window.GEMINI_URL_TEXT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: maxTokens }
    })
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Gemini erro ${resp.status}: ${err?.error?.message || 'sem detalhes'}`);
  }
  const data = await resp.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
};

window.v = function(id) {
  return document.getElementById(id)?.value?.trim() || '';
};

console.log('[Config] Configurações carregadas. Projeto:', window.FIREBASE_CONFIG.projectId);
firebase.initializeApp(window.FIREBASE_CONFIG);
window.auth    = firebase.auth();
window.db      = firebase.firestore();
window.storage = firebase.storage();
emailjs.init(window.EMAILJS_PUBLIC_KEY);
console.log('[Config] Firebase inicializado.');