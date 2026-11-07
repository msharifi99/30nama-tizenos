/* Boot, router, rail, modals, splash, back handling. */
(function () {
  var stack = [], current = null, rootEl = null, swapT = null, booted = false, $ = N.$, el = N.el;
  var content = null;
  var RAIL = [
    ['search', 'search', function () { N.go('search', {}, { reset: true }); }],
    ['home', 'home', function () { N.go('home', {}, { reset: true }); }],
    ['mylist', 'mylist', function () { N.go('mylist', {}, { reset: true }); }],
    ['movies', 'movies', function () { N.go('archive', { slug: 'movies', name: N.t('movies') }, { reset: true }); }],
    ['series', 'series', function () { N.go('archive', { slug: 'series', name: N.t('series') }, { reset: true }); }],
    ['anime', 'anime', function () { N.go('archive', { slug: 'anime', name: N.t('anime') }, { reset: true }); }],
    ['archive', 'archive', function () { N.go('archive', {}, { reset: true }); }],
    ['settings', 'settings', function () { N.go('settings', {}, { reset: true }); }]
  ];

  /* ---------------- home cache ---------------- */
  var hc = { t: 0, p: null };
  N.getHome = function () {
    if (hc.p && Date.now() - hc.t < 90000) return hc.p;
    hc.t = Date.now();
    hc.p = N.api.get('home_stream').then(function (r) { N.store.set('homeCache', r); return r; }).catch(function (e) {
      hc.p = null;
      var c = N.store.get('homeCache', null); // last good Home: show it instead of an error, and retry in the background
      if (c) { setTimeout(function () { N.getHome(); }, 15000); return c; }
      throw e;
    });
    return hc.p;
  };
  N.dropHome = function () { hc.p = null; };

  /* ---------------- splash ---------------- */
  var splash = { t0: Date.now(), done: false, dotsT: null, failT: null };
  function splashExit() {
    if (splash.done) return; splash.done = true; clearTimeout(splash.dotsT); clearTimeout(splash.failT);
    var s = $('splash'); s.classList.add('out');
    setTimeout(function () { s.style.display = 'none'; }, 450);
  }
  N.splashReady = function () {
    if (splash.done) return;
    var wait = Math.max(0, 1200 - (Date.now() - splash.t0));
    setTimeout(splashExit, wait);
  };

  /* ---------------- rail ---------------- */
  var rail = N.rail = { items: [], open: false, mem: null, pill: null, root: null };
  var Y0 = 288, PITCH = 72;
  function yOf(i) { return Y0 + i * PITCH; }
  rail.build = function () {
    var r = rail.root = $('rail'); r.innerHTML = ''; rail.items = [];
    r.appendChild(el('div', 'rail-base')); r.appendChild(el('div', 'rail-scrim'));
    r.appendChild(el('div', 'rail-panel')); var br = el('div', 'rail-brand'); br.appendChild(N.ui.logo()); r.appendChild(br);
    rail.pill = el('div', 'rail-pill'); r.appendChild(rail.pill);
    RAIL.forEach(function (m, i) {
      var b = el('button', 'ri'); b._key = m[0]; b._y = yOf(i); b.style.top = b._y + 'px';
      b.appendChild(N.ui.icon(m[1]));
      var lb = el('span', 'lb', N.t(m[0])); lb.style.transitionDelay = (i * 20) + 'ms'; b.appendChild(lb);
      b.onenter = function () { rail.go(m); };
      b.onclick = function () { rail.go(m); };
      b.onfocus2 = function () { rail.pill.style.transform = 'translateY(' + b._y + 'px)'; };
      b.onnav = function (dir) {
        if (dir === 'up') return rail.items[i - 1] || true;
        if (dir === 'down') return rail.items[i + 1] || true;
        if (N.ui.step(dir) > 0) { rail.close(true); return true; } // towards content
        return true;
      };
      r.appendChild(b); rail.items.push(b);
    });
    rail.mark();
  };
  rail.curKey = function () {
    var i = stack.length - 1, e = stack[i];
    while (e && e.name === 'details' && i > 0) { i--; e = stack[i]; }
    if (!e) return '';
    if (e.name === 'archive' && e.params && (e.params.slug === 'movies' || e.params.slug === 'series' || e.params.slug === 'anime')) return e.params.slug;
    return e.name;
  };
  rail.mark = function () {
    var k = rail.curKey();
    rail.items.forEach(function (b) { b.classList.toggle('cur', b._key === k); });
  };
  rail.visible = function () { return !!rail.root && !rail.root.classList.contains('gone'); };
  rail.enter = function () {
    if (!rail.visible() || rail.open) return;
    if (N.nav.cur && !rail.isRail(N.nav.cur)) rail.mem = N.nav.cur;
    rail.open = true; rail.root.classList.add('open');
    var k = rail.curKey(), t = rail.items[1];
    rail.items.forEach(function (b) { if (b._key === k) t = b; });
    rail.pill.style.transition = 'none'; rail.pill.style.transform = 'translateY(' + t._y + 'px)';
    void rail.pill.offsetWidth; rail.pill.style.transition = '';
    N.nav.focus(t, true); t.onfocus2();
  };
  rail.isRail = function (e) { return !!e && e.classList && e.classList.contains('ri'); };
  rail.close = function (restore) {
    if (!rail.open) return;
    rail.open = false; rail.root.classList.remove('open');
    var m = rail.mem; rail.mem = null;
    if (restore) {
      if (m && m.offsetWidth > 0 && rootEl && rootEl.contains(m)) N.nav.focus(m, true);
      else N.nav.focusFirst(rootEl || content);
    }
  };
  rail.go = function (m) {
    var same = rail.curKey() === m[0];
    rail.close(false);
    if (same && current && stack.length === 1) { rail.mem = null; if (N.nav.cur && rail.isRail(N.nav.cur)) N.nav.clear(); N.nav.focusFirst(rootEl); return; }
    m[2]();
  };
  // keep the expanded panel in sync with focus: leaving the rail by any route (pointer, modal return, screen change, player) collapses it
  N.nav.onFocusChange = function (e) {
    if (!rail.root) return;
    var inRail = rail.isRail(e);
    if (inRail && !rail.open && rail.visible()) { rail.open = true; rail.root.classList.add('open'); }
    else if (!inRail && rail.open && !modal) { rail.open = false; rail.root.classList.remove('open'); rail.mem = null; }
  };
  // start-edge press with nothing to the start side opens the rail
  N.nav.onEdge = function (dir) {
    if (rail.open || !rail.visible() || (dir !== 'left' && dir !== 'right')) return;
    if (N.ui.step(dir) < 0) rail.enter();
  };

  /* ---------------- modal (confirm sheet) ---------------- */
  var modal = null, exitSerial = 0;
  N.confirm = function (o) {
    if (modal) return;
    var m = el('div', 'modal' + (o.kind === 'exit' ? ' exit-confirm' : '')), box = el('div', 'box');
    box.appendChild(el('div', 'mt', o.title)); box.appendChild(el('div', 'mb', o.body || ''));
    if (o.kind === 'exit') {
      var titleID = 'exit-title-' + (++exitSerial);
      box.firstChild.id = titleID;
      m.setAttribute('role', 'alertdialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-labelledby', titleID);
    }
    var row = el('div', 'acts'), cancel = N.ui.btn(o.cancel || N.t('cancel'), function () { N.closeModal(); }, '');
    var ok = N.ui.btn(o.ok, function () { N.closeModal(); o.onOk(); }, o.danger ? 'danger' : 'primary');
    row.appendChild(cancel); row.appendChild(ok); box.appendChild(row); m.appendChild(box); document.body.appendChild(m);
    modal = { el: m, prev: N.nav.cur };
    N.nav.pushScope(m); void m.offsetWidth; m.classList.add('show'); N.nav.focus(cancel, true);
  };
  N.closeModal = function () {
    if (!modal) return; var m = modal; modal = null;
    N.nav.popScope(); m.el.classList.remove('show');
    setTimeout(function () { if (m.el.parentNode) m.el.parentNode.removeChild(m.el); }, 260);
    if (m.prev && m.prev.offsetWidth > 0) N.nav.focus(m.prev, true); else N.nav.clear();
  };
  function exitApp() {
    try { tizen.application.getCurrentApplication().exit(); } catch (e) { N.toast('Exit (not on Tizen)'); }
  }
  N.confirmExit = function () {
    N.confirm({ kind: 'exit', title: N.t('exitTitle'), body: N.t('exitBody'), ok: N.t('exit'), danger: false, onOk: exitApp });
  };

  /* ---------------- router ---------------- */
  function setChrome(name) {
    rail.root.classList.toggle('gone', name === 'login');
    N.stage.dim(0); N.stage.details(false);
  }
  function build(entry) {
    var oldCur = current, old = rootEl;
    if (oldCur && oldCur.destroy) { try { oldCur.destroy(); } catch (e) {} }
    if (old && old.parentNode) old.parentNode.removeChild(old);
    N.nav.clear(); N.nav.locked = false;
    var r = el('div', 'screen enter ' + entry.name); content.appendChild(r); rootEl = r;
    setChrome(entry.name);
    rail.mark();
    current = null; // a throwing screen must not leave the destroyed one in charge of Back
    current = N.screens[entry.name](r, entry.params || {}, entry.focus) || {};
  }
  function render(entry) {
    clearTimeout(swapT);
    if (rail.open) { rail.open = false; rail.root.classList.remove('open'); rail.mem = null; }
    if (rootEl && current) {
      rootEl.classList.add('leave'); N.nav.clear(); N.nav.locked = true;
      swapT = setTimeout(function () { build(entry); }, 150);
    } else build(entry);
  }
  // opts: reset (clear history), replace (swap top entry)
  N.go = function (name, params, opts) {
    opts = opts || {};
    var entry = { name: name, params: params || {} };
    if (opts.reset) stack = [entry];
    else if (opts.replace && stack.length) stack[stack.length - 1] = entry;
    else {
      if (stack.length && current && current.focusState) stack[stack.length - 1].focus = current.focusState();
      stack.push(entry);
    }
    render(entry);
  };
  N.onBack = function () {
    if (N.player.open) { N.player.close(); return; }
    if (modal) { N.closeModal(); return; }
    if (rail.open) { rail.close(true); return; } // Back on the menu: collapse it and return to the content
    if (current && current.back) {
      try { if (current.back()) return; } catch (e) { try { console.warn('back', e && e.message); } catch (x) {} }
    }
    if (stack.length > 1) { stack.pop(); render(stack[stack.length - 1]); return; }
    var top = stack[stack.length - 1];
    if (!top && !booted) { N.confirmExit(); return; } // splash / boot error: the API isn't up, Home can't load
    if (!top || (top.name !== 'home' && top.name !== 'login')) { N.go('home', {}, { reset: true }); return; } // empty history or another top-level screen: Home
    N.confirmExit(); // Home (or login): exit confirm
  };
  N.onLogout = function () { N.dropHome(); N.go('login', {}, { reset: true }); };
  N.onPlayerClosed = function () {
    N.stage.restore();
    if (current && current.onPlayerClosed) current.onPlayerClosed();
    else if (N.nav.cur === null && rootEl) N.nav.focusFirst(rootEl);
  };
  N.rerender = function () { // re-render the current screen (language change etc.)
    var e = stack[stack.length - 1]; if (e) { if (current && current.focusState) e.focus = current.focusState(); build(e); }
  };

  function bootError(e) {
    N.splashReady(); rail.root.classList.add('gone'); rootEl && (rootEl.innerHTML = '');
    var r = el('div', 'screen enter'); content.innerHTML = ''; content.appendChild(r); rootEl = r; current = null;
    var w = el('div', 'center-msg'); w.appendChild(N.ui.icon('warn'));
    try { console.warn('boot error', e && e.message); } catch (x) {}
    w.appendChild(el('div', 'm', N.t('error') + '. ' + N.t('tryAgain')));
    var b = N.ui.btn(N.t('retry'), boot, 'primary'); w.appendChild(b); r.appendChild(w); N.nav.focus(b, true);
  }
  function boot() {
    N.api.init().then(function () {
      booted = true;
      rail.build();
      var p = Promise.resolve();
      if (N.isLoggedIn()) {
        p = N.api.call('user', {}).then(function (j) {
          if (j && j.success && j.result) {
            var u = j.result.user_session ? j.result : (j.result.user || null);
            if (u && u.user_session) N.setSession(u); else { N.session.user = Object.assign({}, N.session.user, j.result); N.store.set('session', N.session); }
          }
        }).catch(function () {});
      }
      return p;
    }).then(function () {
      if (N.isLoggedIn() || N.store.get('guest', false) === true) N.go('home', {}, { reset: true });
      else N.go('login', {}, { reset: true });
    }).catch(bootError);
  }

  // Fit the 1920x1080 stage to the window for desktop preview. On TVs the viewport meta
  // pins layout to 1920 CSS px (UHD panels render it via devicePixelRatio), so s is 1 there.
  function fit() {
    var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080), r = document.documentElement;
    if (Math.abs(s - 1) < 0.01) { r.style.transform = ''; return; }
    r.style.transform = 'scale(' + s + ')'; r.style.transformOrigin = '0 0';
  }
  window.addEventListener('resize', fit);

  document.addEventListener('DOMContentLoaded', function () {
    fit();
    content = $('content');
    if (N.store.get('calm', false)) document.body.classList.add('calm');
    N.nav.registerKeys();
    // takeover is opt-in: the background service is only started if the user turned it on in Settings
    try { if (N.store.get('tkOn', false) === true) N.takeover.ensureService(function () {}); } catch (e) {}
    splash.dotsT = setTimeout(function () { var d = document.querySelector('#splash .dots3'); if (d) d.classList.add('on'); }, 1800);
    splash.failT = setTimeout(splashExit, 10000);
    boot();
  });
})();
