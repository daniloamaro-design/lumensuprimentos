/* ══════════════════════════════════════════════════════════════════════
   Abrir em nova guia — menu lateral e seletor de módulos
   • Botão direito num item → menu "Abrir em nova guia" / "Copiar link".
   • Clique do meio ou Ctrl/Cmd+clique → abre direto em nova guia.
   • A nova guia abre em  #/p/<página>  (ou  #/m/<módulo>)  e, depois do login,
     o sistema vai direto para a tela certa (pulando a tela inicial).
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  const base = () => location.origin + location.pathname;
  const urlDoItem = el => {
    if (el.dataset.page) return base() + '#/p/' + encodeURIComponent(el.dataset.page);
    if (el.dataset.mod) return base() + '#/m/' + encodeURIComponent(el.dataset.mod);
    return null;
  };
  const alvoDe = t => t && t.closest ? t.closest('.sidebar-item[data-page], .modulo-btn[data-mod]') : null;
  const abrirNovaGuia = url => { if (url) window.open(url, '_blank', 'noopener'); };

  let menu = null;
  function fecharMenu() { if (menu) { menu.remove(); menu = null; } }
  function abrirMenu(x, y, url) {
    fecharMenu();
    menu = document.createElement('div');
    menu.style.cssText = 'position:fixed;z-index:100000;min-width:200px;background:var(--surface,#fff);color:var(--text,#111);border:1px solid var(--border,#ccc);border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.35);padding:6px;font-size:13px;';
    const item = (txt, fn) => {
      const b = document.createElement('div');
      b.textContent = txt;
      b.style.cssText = 'padding:8px 12px;border-radius:6px;cursor:pointer;';
      b.onmouseenter = () => { b.style.background = 'var(--bg,rgba(128,128,128,.18))'; };
      b.onmouseleave = () => { b.style.background = ''; };
      b.onclick = e => { e.stopPropagation(); fecharMenu(); fn(); };
      menu.appendChild(b);
    };
    item('↗ Abrir em nova guia', () => abrirNovaGuia(url));
    item('🔗 Copiar link', () => {
      try { navigator.clipboard.writeText(url); if (typeof showToast === 'function') showToast('Link copiado.'); } catch (e) { /* sem permissão de área de transferência */ }
    });
    document.body.appendChild(menu);
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 4)) + 'px';
    menu.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 4)) + 'px';
  }

  document.addEventListener('contextmenu', e => {
    const el = alvoDe(e.target), url = el && urlDoItem(el);
    if (!url) { fecharMenu(); return; }
    e.preventDefault();
    abrirMenu(e.clientX, e.clientY, url);
  });
  document.addEventListener('click', e => {
    if (menu && !menu.contains(e.target)) fecharMenu();
    // Ctrl/Cmd + clique: nova guia (sem navegar nesta)
    if (e.ctrlKey || e.metaKey) {
      const el = alvoDe(e.target), url = el && urlDoItem(el);
      if (url) { e.preventDefault(); e.stopPropagation(); abrirNovaGuia(url); }
    }
  }, true);
  document.addEventListener('auxclick', e => {
    if (e.button !== 1) return;
    const el = alvoDe(e.target), url = el && urlDoItem(el);
    if (url) { e.preventDefault(); abrirNovaGuia(url); }
  });
  document.addEventListener('scroll', fecharMenu, true);
  window.addEventListener('blur', fecharMenu);
  window.addEventListener('keydown', e => { if (e.key === 'Escape') fecharMenu(); });

  // Chamada após o login (js/02-auth.js): se a guia foi aberta com #/p/... ou #/m/..., vai direto para lá.
  // Devolve true quando navegou (a tela inicial de escolha de módulo é pulada).
  window.abrirPaginaDoHash = function () {
    const m = /^#\/([pm])\/(.+)$/.exec(location.hash || '');
    if (!m) return false;
    const valor = decodeURIComponent(m[2]);
    try {
      const nav = document.getElementById('sidebar');
      if (m[1] === 'm') {
        if (typeof selecionarModulo === 'function') selecionarModulo(valor); else return false;
      } else {
        const item = nav && [...nav.querySelectorAll('.sidebar-item[data-page]')].find(i => i.dataset.page === valor);
        const sec = item && item.closest('.sidebar-section[data-modulo]');
        if (sec) {
          nav.dataset.mod = sec.dataset.modulo;
          document.querySelectorAll('.modulo-btn').forEach(b => b.classList.toggle('ativo', b.dataset.mod === sec.dataset.modulo));
        }
        if (typeof goPage === 'function') goPage(valor); else return false;
      }
      return true;
    } catch (e) { console.warn('abrirPaginaDoHash', e); return false; }
  };
})();
