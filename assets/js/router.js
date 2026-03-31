/* =============================================================
   router.js Nexus Admin SPA Shell Router
   Intercepts nav-item clicks, loads page content via fetch,
   swaps only <main>, keeping sidebar/header/logo persistent.
   No framework vanilla JS only.
   ============================================================= */
(function () {
  'use strict';

  // Scripts that belong to the persistent shell. Never re-loaded on navigation.
  const SHELL_SCRIPTS = new Set([
    'api.js', 'auth.js', 'ui.js', 'i18n.js',
    'dash.js', 'router.js', 'global_search.js',
  ]);

  let _injected = []; // DOM nodes injected by current page (cleaned up on next navigate)

  /* ── helpers ─────────────────────────────────────────────── */
  function basename(src) { return src.split('/').pop().split('?')[0]; }
  function isShell(src)  { return SHELL_SCRIPTS.has(basename(src)); }

  function cleanup() {
    _injected.forEach(node => { try { node.remove(); } catch (_) {} });
    _injected = [];
    // Remove any leftover modal overlays from the previous page
    document.querySelectorAll('.modal-overlay').forEach(m => m.remove());
    // Remove router-injected inline styles
    document.querySelectorAll('style[data-router-page]').forEach(s => s.remove());
  }

  function loadScript(src) {
    return new Promise(ok => {
      const s   = document.createElement('script');
      s.src     = src;
      s.onload  = ok;
      s.onerror = () => { console.warn('[Router] failed:', src); ok(); }; // non-fatal
      document.body.appendChild(s);
      _injected.push(s);
    });
  }

  /* ── core navigation ─────────────────────────────────────── */
  async function navigate(url, pushState = true) {
    const main = document.querySelector('main.main');
    if (!main) { location.href = url; return; }

    // Subtle fade-out to signal loading without jarring flash
    main.style.opacity    = '0.4';
    main.style.transition = 'opacity .12s ease';

    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);

      const html = await res.text();
      const doc  = new DOMParser().parseFromString(html, 'text/html');

      const newMain = doc.querySelector('main.main');
      if (!newMain) throw new Error('no-main-element');

      // Collect page-specific scripts (preserve order, skip shell scripts)
      const newScripts = [...doc.querySelectorAll('script[src]')]
        .map(s => s.getAttribute('src'))
        .filter(src => !isShell(src));

      // Collect inline <style> from the incoming page's <head>
      const headStyles = [...doc.querySelectorAll('head > style')]
        .map(s => s.textContent)
        .join('\n');

      // Collect modal overlays that live outside .shell
      const newModals = [...doc.querySelectorAll('body > .modal-overlay')];

      /* ── DOM surgery ─────────────────────────────────────── */
      cleanup();

      // Inject page-level styles (tagged so cleanup() can remove them)
      if (headStyles.trim()) {
        const styleEl = document.createElement('style');
        styleEl.setAttribute('data-router-page', '1');
        styleEl.textContent = headStyles;
        document.head.appendChild(styleEl);
        _injected.push(styleEl);
      }

      // Swap main content and attributes
      main.className = newMain.className;
      main.setAttribute('style', newMain.getAttribute('style') || '');
      main.innerHTML = newMain.innerHTML;
      window.scrollTo(0, 0);

      // Fade back in
      requestAnimationFrame(() => {
        main.style.opacity = '1';
      });

      // Inject modal overlays into body
      newModals.forEach(m => {
        const clone = document.importNode(m, true);
        document.body.appendChild(clone);
        _injected.push(clone);
      });

      // Update page title
      const t = doc.querySelector('title');
      if (t) document.title = t.textContent;

      // Update active nav item
      const file = url.split('/').pop().split('?')[0];
      document.querySelectorAll('.nav-item').forEach(a => {
        const h = (a.getAttribute('href') || '').split('?')[0].split('/').pop();
        a.classList.toggle('active', h === file);
      });

      // Push new URL to browser history BEFORE loading scripts
      // (so that window.location reflects the new URL when scripts read it)
      if (pushState) history.pushState({ url }, '', url);

      // Load page-specific scripts in sequence (order matters)
      for (const src of newScripts) {
        await loadScript(src);
      }

    } catch (err) {
      console.error('[Router] navigate error falling back to full load:', err);
      main.style.opacity = '1';
      location.href = url; // graceful degradation
    }
  }

  /* ── intercept nav-item clicks ───────────────────────────── */
  document.addEventListener('click', function (e) {
    // Walk up to find an anchor with href (covers clicks on icons inside <a>)
    const a = e.target.closest('a.nav-item[href]');
    if (!a) return;

    const href = a.getAttribute('href');
    if (!href) return;
    // Only intercept relative links to .html pages
    if (/^(https?:|\/\/|#|javascript)/.test(href)) return;

    const file = basename(href.split('?')[0]);
    if (!file.endsWith('.html')) return;

    e.preventDefault();
    navigate(href);
  }, true); // useCapture = true catches before other handlers

  /* ── browser back / forward ──────────────────────────────── */
  window.addEventListener('popstate', e => {
    if (e.state?.url) navigate(e.state.url, false);
  });

  /* ── register initial URL in history ─────────────────────── */
  history.replaceState(
    { url: location.pathname + location.search },
    '',
    location.pathname + location.search
  );

  /* ── public API ──────────────────────────────────────────── */
  window.Router = { navigate };

})();
