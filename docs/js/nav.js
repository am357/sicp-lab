/* nav.js — shared site header and footer, injected on every page. */
(function () {
  'use strict';

  var page = location.pathname.replace(/^.*\//, '') || 'index.html';

  function link(href, text, opts) {
    opts = opts || {};
    var a = document.createElement('a');
    a.href = href;
    a.textContent = text;
    if (opts.cls) a.className = opts.cls;
    if (opts.external) { a.target = '_blank'; a.rel = 'noopener'; }
    if (opts.active === false) a.setAttribute('aria-current', 'page');
    return a;
  }

  // ── Header ──
  var nav = document.createElement('nav');
  nav.className = 'site-nav';
  nav.appendChild(link('/', 'SICP Lab', { cls: 'site-nav-brand' }));
  var spacer = document.createElement('span');
  spacer.className = 'site-nav-spacer';
  nav.appendChild(spacer);

  var links = [
    { href: 'reader.html', text: 'Reader', page: 'reader.html' },
    { href: 'playground.html', text: 'Playground', page: 'playground.html' },
    { href: 'https://github.com/am357/sicp-lab', text: 'GitHub ↗', external: true }
  ];

  links.forEach(function (l) {
    var a = link(l.href, l.text, { cls: 'site-nav-link', external: l.external });
    if (l.page && l.page === page) a.classList.add('active');
    nav.appendChild(a);
  });

  // ── Footer ──
  var footer = document.createElement('footer');
  footer.className = 'site-footer';
  footer.innerHTML = 'Text adapted from the <a href="https://github.com/sarabander/sicp" target="_blank" rel="noopener">sarabander edition</a> of SICP, licensed CC BY-SA 4.0. Abelson &amp; Sussman, MIT Press, 1996.' +
    ' · <a href="https://github.com/am357/sicp-lab" target="_blank" rel="noopener">Source on GitHub</a>';

  // ── Inject ──
  document.body.insertBefore(nav, document.body.firstChild);
  document.body.appendChild(footer);
})();
