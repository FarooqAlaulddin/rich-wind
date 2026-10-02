// Docs site behavior: theme toggle, mobile navigation, heading anchors,
// the "On this page" list, copy buttons, table wrappers and prev/next links.
(function () {
  var root = document.documentElement;
  var prose = document.querySelector('.prose');

  // Theme
  var themeBtn = document.querySelector('.theme-btn');
  function isDark() {
    var set = root.getAttribute('data-theme');
    if (set) return set === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  function syncThemeLabel() { if (themeBtn) themeBtn.textContent = isDark() ? 'Light' : 'Dark'; }
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var next = isDark() ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('rw-docs-theme', next); } catch (e) {}
      syncThemeLabel();
    });
  }
  syncThemeLabel();

  // Mobile navigation
  var menuBtn = document.querySelector('.menu-btn');
  var scrim = document.querySelector('.scrim');
  function setNav(open) {
    document.body.classList.toggle('nav-open', open);
    if (menuBtn) menuBtn.setAttribute('aria-expanded', String(open));
    if (scrim) scrim.hidden = !open;
  }
  if (menuBtn) menuBtn.addEventListener('click', function () { setNav(!document.body.classList.contains('nav-open')); });
  if (scrim) scrim.addEventListener('click', function () { setNav(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setNav(false); });

  if (!prose) return;

  // Tables scroll inside their own box on narrow screens
  prose.querySelectorAll('table').forEach(function (table) {
    var wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    table.parentNode.insertBefore(wrap, table);
    wrap.appendChild(table);
  });

  // Copy buttons
  prose.querySelectorAll('pre').forEach(function (pre) {
    var host = pre.closest('.highlighter-rouge') || pre;
    if (host.parentNode.classList.contains('code-wrap')) return;
    var wrap = document.createElement('div');
    wrap.className = 'code-wrap';
    host.parentNode.insertBefore(wrap, host);
    wrap.appendChild(host);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-btn';
    btn.textContent = 'Copy';
    btn.addEventListener('click', function () {
      var text = pre.innerText.replace(/\n$/, '');
      var done = function () {
        btn.textContent = 'Copied';
        btn.classList.add('is-done');
        setTimeout(function () { btn.textContent = 'Copy'; btn.classList.remove('is-done'); }, 1500);
      };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () {});
    });
    wrap.appendChild(btn);
  });

  // Heading anchors and the "On this page" list
  var headings = Array.prototype.slice.call(prose.querySelectorAll('h2[id], h3[id]'));
  var toc = document.querySelector('.toc');
  var tocList = toc && toc.querySelector('.toc-list');
  var tocLinks = [];
  headings.forEach(function (h) {
    var a = document.createElement('a');
    a.className = 'heading-anchor';
    a.href = '#' + h.id;
    a.setAttribute('aria-label', 'Link to this section');
    a.textContent = '#';
    h.insertBefore(a, h.firstChild);
    if (!tocList) return;
    var li = document.createElement('li');
    li.className = h.tagName === 'H3' ? 'toc-h3' : 'toc-h2';
    var link = document.createElement('a');
    link.href = '#' + h.id;
    link.textContent = h.textContent.replace(/^#/, '').trim();
    li.appendChild(link);
    tocList.appendChild(li);
    tocLinks.push(link);
  });
  if (toc && headings.length > 1) {
    toc.hidden = false;
    var setActive = function () {
      var current = 0;
      for (var i = 0; i < headings.length; i++) {
        if (headings[i].getBoundingClientRect().top < 120) current = i;
      }
      tocLinks.forEach(function (l, i) { l.classList.toggle('is-active', i === current); });
    };
    window.addEventListener('scroll', setActive, { passive: true });
    setActive();
  }

  // Previous and next page, in sidebar order
  var pager = document.querySelector('.pager');
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav-list a'))
    .filter(function (a) { return !/\.json$/.test(a.getAttribute('href')); });
  var index = navLinks.findIndex(function (a) { return a.getAttribute('aria-current') === 'page'; });
  if (pager && index !== -1) {
    var make = function (a, label, cls) {
      var el = document.createElement('a');
      el.className = cls;
      el.href = a.getAttribute('href');
      el.innerHTML = '<small>' + label + '</small><span></span>';
      el.querySelector('span').textContent = a.textContent;
      return el;
    };
    if (index > 0) pager.appendChild(make(navLinks[index - 1], 'Previous', 'prev'));
    if (index < navLinks.length - 1) pager.appendChild(make(navLinks[index + 1], 'Next', 'next'));
  }
})();
