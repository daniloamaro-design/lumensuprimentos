/* ══════════════════════════════════════════════════════════════════════
   js/18-erp.js — Shell do ERP unificado (U3)
   Alterna entre os módulos Suprimentos · Passagens · Fretes na sidebar.
   As seções da sidebar têm data-modulo; o CSS mostra só as do módulo ativo
   (nav#sidebar[data-mod="X"]). Aqui só trocamos o data-mod e navegamos para
   a primeira página visível do módulo escolhido. O login sempre começa em
   Suprimentos (definido em showApp, js/02-auth.js).
   ══════════════════════════════════════════════════════════════════════ */

function selecionarModulo(m) {
  const nav = document.getElementById('sidebar');
  if (!nav) return;
  nav.dataset.mod = m;

  // botão ativo
  document.querySelectorAll('.modulo-btn').forEach(b => {
    b.classList.toggle('ativo', b.dataset.mod === m);
  });

  // vai para a 1ª página visível (seção não escondida por perfil) do módulo
  const secoes = nav.querySelectorAll(`.sidebar-section[data-modulo="${m}"]`);
  for (const sec of secoes) {
    if (sec.offsetParent === null) continue;           // seção escondida por perfil
    const item = sec.querySelector('.sidebar-item[data-page]');
    if (item && item.dataset.page) { goPage(item.dataset.page); return; }
  }
}
window.selecionarModulo = selecionarModulo;
