/* Screens: login(QR), home, details, search, archive, settings. Each returns {destroy, back?, focusState?}. */
(function () {
  var S = N.screens = {};
  var el = N.el, ui = N.ui;

  function extractPosts(r) {
    if (!r) return [];
    var a = r.posts || r.items || r.list || (r instanceof Array ? r : []);
    return a.map(function (x) { return x && x.post ? x.post : x; }).filter(function (x) { return x && x.id; });
  }
  function userObj(r) { return (r && r.user_session) ? r : (r && r.user && r.user.user_session ? r.user : null); }
  function errorView(root, e, retry) {
    root.innerHTML = '';
    var w = el('div', 'center-msg'); w.appendChild(ui.icon('warn'));
    try { console.warn('screen error', e && e.message); } catch (x) {}
    w.appendChild(el('div', 'm', N.t('error') + '. ' + N.t('tryAgain')));
    var b = ui.btn(N.t('retry'), retry, 'primary'); w.appendChild(b); root.appendChild(w); N.nav.focus(b, true);
  }
  function instant(root, fn) { root.classList.add('noanim'); fn(); void root.offsetWidth; root.classList.remove('noanim'); }
  function skeletonHome(root) {
    var w = el('div', 'skel-wrap'), b = el('div', 'sk-bb');
    [[600, 64, 0], [420, 28, 20], [760, 28, 20], [760, 28, 12]].forEach(function (s) { var x = el('div', 'bar'); x.style.width = s[0] + 'px'; x.style.height = s[1] + 'px'; x.style.marginTop = s[2] + 'px'; b.appendChild(x); });
    w.appendChild(b);
    var r = el('div', 'sk-rows'); r.style.top = '640px';
    for (var i = 0; i < 7; i++) r.appendChild(ui.skelCard());
    w.appendChild(r); root.appendChild(w); return w;
  }
  function other(p) { var t = p.title || {}, o = N.lang === 'fa' ? t.english : t.local; return o && o !== N.title(p) ? o : ''; }

  /* ================= QR login ================= */
  S.login = function (root) {
    var dead = false, pollT = null, startT = 0, code = null;
    root.classList.add('login');
    N.stage.dim(0.55);
    var col = el('div', 'col'); root.appendChild(col);
    col.appendChild(el('div', 'eyebrow', N.t('signIn')));
    col.appendChild(el('div', 'h-xl', N.t('scanTitle')));
    var steps = el('div', 'steps');
    ['step1', 'step2', 'step3'].forEach(function (k, i) { var s = el('div', 'step'); s.appendChild(el('b', '', String(i + 1))); s.appendChild(el('span', '', N.t(k))); steps.appendChild(s); });
    col.appendChild(steps);
    var alt = el('div', 'alt'), codeEl = el('span', 'code', '');
    (function () { var parts = N.t('orVisit').split('30nama.com/auth'); alt.appendChild(document.createTextNode(parts[0])); alt.appendChild(el('span', 'latin', '30nama.com/auth')); alt.appendChild(document.createTextNode(parts[1] || '')); })();
    alt.appendChild(codeEl); col.appendChild(alt);
    var acts = el('div', 'acts'), guestB = ui.btn(N.t('guest'), function () { cleanup(); N.go('home', {}, { reset: true }); }, 'primary');
    var newB = ui.btn(N.t('refresh'), function () { cleanup(); dead = false; begin(); }, '');
    acts.appendChild(guestB); acts.appendChild(newB); col.appendChild(acts);
    var tile = el('div', 'qr-tile'), qrBox = el('div', 'qr'), okBox = el('div', 'ok'), exp = el('div', 'exp', N.t('expired'));
    okBox.appendChild(ui.icon('check')); tile.appendChild(qrBox); tile.appendChild(exp); tile.appendChild(okBox); root.appendChild(tile);
    var status = el('div', 'qr-status'); status.appendChild(el('i')); var stTxt = el('span', '', N.t('waiting')); status.appendChild(stTxt); root.appendChild(status);
    N.nav.focus(guestB, true);

    // backdrop: first hero cover (guest payload)
    N.getHome().then(function (h) {
      if (dead) return;
      var ps = (h.hero_header && h.hero_header.posts) || [], p = null;
      for (var i = 0; i < ps.length; i++) if (ui.coverUrl(ps[i])) { p = ps[i]; break; }
      if (p) N.stage.show(p, { immediate: true, done: function () { N.splashReady(); } }); else N.splashReady();
    }).catch(function () { N.splashReady(); });

    function cleanup() { dead = true; clearInterval(pollT); }
    function begin() {
      tile.classList.remove('dim', 'done'); qrBox.innerHTML = ''; codeEl.textContent = ''; status.style.visibility = 'visible';
      N.api.get('qrlogin_code').then(function (r) {
        if (dead) return;
        code = r.code; var link = r.url || (N.config.qrBase + code);
        var qr = qrcode(0, 'M'); qr.addData(link); qr.make();
        qrBox.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
        codeEl.textContent = code;
        startT = Date.now(); clearInterval(pollT);
        pollT = setInterval(function () {
          if (dead) return;
          if (Date.now() - startT > N.config.qrTimeoutMs) { // expired
            clearInterval(pollT); tile.classList.add('dim'); status.style.visibility = 'hidden'; N.nav.focus(newB, true); return;
          }
          N.api.call('qrlogin_login', { auth_code: code }).then(function (j) {
            if (dead || !j || !j.success) return; // CODE_NOT_USED -> keep polling
            var u = userObj(j.result);
            var token = u ? u.user_session : (j.result && (j.result.token || j.result.user_session));
            if (!token) return;
            cleanup();
            N.setSession(u || { user_session: token });
            // qrlogin_login returns only {token}; fetch the profile with it
            N.api.call('user', {}).then(function (uj) {
              var rr = uj && uj.success && uj.result;
              var full = rr && (rr.user_session ? rr : (rr.user || rr));
              if (full) { if (!full.user_session) full.user_session = token; N.setSession(full); }
            }).catch(function () {}).then(function () {
              tile.classList.add('done'); status.style.visibility = 'hidden'; N.dropHome();
              N.toast(N.t('welcome') + ' ' + ((N.session.user && N.session.user.user_name) || ''));
              setTimeout(function () { N.go('home', {}, { reset: true }); }, 400);
            });
          }).catch(function () {});
        }, N.config.qrPollMs);
      }).catch(function (e) {
        if (dead) return; tile.classList.add('dim'); exp.textContent = N.t('error'); status.style.visibility = 'hidden'; N.nav.focus(newB, true);
      });
    }
    begin();
    return { destroy: cleanup };
  };

  /* ================= Home ================= */
  S.home = function (root, params, restore) {
    var dead = false, st = { mode: 'hero', row: 0 };
    var heroes = [], defs = [], rowEls = [], tracks = [], cards = [], mem = [], tops = [], cwIds = {}, rowObjs = [], shownHero = null;
    var bb, bbE, dotsEl, playBtn, detBtn, heroUi, rowsEl, noteBtn = null, noteEl = null;
    var curPost = null, curEb = '', curImm = false, shownKey = '', fT = null, bbT = null, flip = false, lastAct = Date.now(), advT = null, rowsTy = null, heroIdx = 0, heroNav = 0, heroT = null, chPrev = null, chNext = null;
    root.classList.add('home');
    var sk = skeletonHome(root);
    function act() { lastAct = Date.now(); }
    document.addEventListener('keydown', act);

    function load() {
      var cw = N.isLoggedIn() ? N.api.get('continue_watching').catch(function () { return null; }) : Promise.resolve(null);
      var tmOn = N.tmdb.enabled(), tmH = Promise.resolve([]);
      if (tmOn) { root.classList.add('tm'); N.tmdb.startHome(); tmH = N.tmdb.heroes(6, 3200).catch(function () { return []; }); }
      Promise.all([N.getHome(), cw, tmH]).then(function (res) { if (!dead) build(res[0], extractPosts(res[1]), res[1], res[2]); })
        .catch(function (e) { if (dead) return; N.splashReady(); errorView(root, e, function () { root.innerHTML = ''; sk = skeletonHome(root); load(); }); });
    }

    function cwNorm(x0, raw) {
      var c = x0.continue_watching || x0, t = Number(c.time || c.position || 0), d = Number(c.duration || 0);
      var season = c.season || (c.info && c.info.season), ep = c.episode || (c.info && c.info.episode);
      var parts = [];
      if (season && ep) parts.push('S' + season + ' · E' + N.ui.epLabel(ep));
      if (d && t) parts.push(Math.max(1, Math.round((d - t) / 60)) + ' ' + N.t('minLeft'));
      return { prog: d ? Math.min(1, t / d) : 0, label: parts.join(' · ') };
    }

    function build(h, cwPosts, cwRaw, tmHeroes) {
      root.removeChild(sk);
      heroes = ((h.hero_header && h.hero_header.posts) || []).slice(0, 8);
      if (tmHeroes && tmHeroes.length >= 3) heroes = tmHeroes;
      var cwList = (cwRaw && (cwRaw.posts || cwRaw.items || cwRaw.list || (cwRaw instanceof Array ? cwRaw : []))) || [];
      cwPosts.forEach(function (p) { cwIds[p.id] = true; });
      if (cwPosts.length) defs.push({ key: 'cw', title: N.t('continueWatching'), kind: 'land', posts: cwPosts, raw: cwList });
      ['new_releases', 'suggested', 'top_10', 'movies', 'series', 'anime'].forEach(function (k) {
        var ps = h[k] && h[k].posts; if (ps && ps.length) defs.push({ key: k, title: N.t(k), kind: k === 'top_10' ? 'top' : 'poster', posts: k === 'top_10' ? ps.slice(0, 10) : ps });
      });
      root.appendChild(ui.clock());
      // billboard
      bb = el('div', 'bb'); bbE = {};
      ['eb:bb-eyebrow', 'title:bb-title', 'sub:bb-sub', 'meta:bb-i', 'plot:bb-plot'].forEach(function (s) {
        var p = s.split(':'), e = el('div', 'bb-i ' + p[1]); bbE[p[0]] = e; bb.appendChild(e);
      });
      bbE.meta.className = 'bb-i';
      root.appendChild(bb);
      // hero buttons + dots
      heroUi = el('div', 'hero-ui');
      playBtn = ui.btn(N.t('play'), function () { goDetails(heroes[heroIdx], true); }, 'primary', 'play');
      detBtn = ui.btn(N.t('details'), function () { goDetails(heroes[heroIdx], false); }, '', 'info');
      var br = el('div', 'br'); br.appendChild(playBtn); br.appendChild(detBtn); heroUi.appendChild(br);
      dotsEl = el('div', 'dots'); heroes.forEach(function () { dotsEl.appendChild(el('i')); }); heroUi.appendChild(dotsEl);
      root.appendChild(heroUi);
      if (heroes.length > 1) {
        chPrev = el('button', 'chev prev f'); chNext = el('button', 'chev next f');
        chPrev.onclick = function () { heroStep(-1); }; chNext.onclick = function () { heroStep(1); };
        chPrev.onfocus2 = chNext.onfocus2 = function () { if (st.mode !== 'hero') exitBrowse(); heroNav = lastAct = Date.now(); };
        root.appendChild(chPrev); root.appendChild(chNext);
      }
      playBtn.onfocus2 = detBtn.onfocus2 = function () { if (st.mode !== 'hero') exitBrowse(); else { curPost = heroes[heroIdx]; } };
      // rows
      rowsEl = el('div', 'rows'); root.appendChild(rowsEl);
      defs.forEach(function (d) { var r = makeRow(d); pushRow(r); });
      if (!N.isLoggedIn()) {
        noteEl = el('div', 'guest-note'); noteEl.appendChild(el('div', 'gn-t', N.t('loginRequired')));
        noteBtn = ui.btn(N.t('signIn'), function () { N.go('login', {}, { reset: true }); }, '');
        noteBtn.onfocus2 = function () { if (st.mode !== 'browse') { st.mode = 'browse'; root.classList.add('browse'); } setRow(defs.length); curPost = null; };
        noteEl.appendChild(noteBtn); rowsEl.appendChild(noteEl);
      }
      recalcTops();
      root.onnav = onnav;
      N.nav.onSettle(follow);
      // initial state
      var start = 0, br = restore && restore.mode === 'browse' && cards[restore.row] && cards[restore.row][restore.idx];
      if (restore && typeof restore.hero === 'number' && heroes[restore.hero]) start = restore.hero;
      instant(root, function () { setRowsRest(); });
      if (heroes.length) setHero(start, true, !!br);
      else if (!br) N.splashReady();
      if (br) instant(root, function () { N.nav.focus(br, true); });
      else if (heroes.length) N.nav.focus(playBtn, true);
      else if (cards[0]) N.nav.focus(cards[0][0], true);
      advT = setInterval(autoAdvance, 1000);
      tmSetup();
    }

    // one row = {d, row, tr, cs, ws}; d.posts are cards in order. Closures resolve the row index lazily (rows can be inserted above).
    function addCard(r, p, i) {
      var d = r.d, c = ui.card(p, d.kind, { rank: i + 1 });
      if (d.kind === 'land') {
        var n = cwNorm(d.raw[i] || p), lb = n.label || N.title(p);
        c._mq = ui.mq(lb, 'lbl'); c.appendChild(c._mq);
        if (n.prog > 0) { var pb = el('div', 'prog'), pi = el('i'); pi.style.transform = 'scaleX(' + n.prog.toFixed(3) + ')'; pb.appendChild(pi); c.appendChild(pb); }
      }
      c.onfocus2 = function () { onCardFocus(defs.indexOf(d), i); };
      c.onclick = function () { goDetails(p, false); };
      r.tr.appendChild(c); r.cs.push(c); r.ws.push(d.kind === 'land' ? 400 : d.kind === 'top' ? (i + 1 >= 10 ? 420 : 300) : 200);
      if (i < 10) ui.load(c);
    }
    function makeRow(d) {
      var row = el('div', 'hrow'), hd = el('div', 'hrow-h', d.title), tr = el('div', 'track'), r = { d: d, row: row, tr: tr, cs: [], ws: [] };
      row.appendChild(hd); row.appendChild(tr);
      d.posts.forEach(function (p, i) { addCard(r, p, i); });
      ui.layoutTrack(tr, r.cs, r.ws);
      return r;
    }
    function pushRow(r) { rowEls.push(r.row); tracks.push(r.tr); cards.push(r.cs); mem.push(0); rowsEl.appendChild(r.row); rowObjs.push(r); }
    function recalcTops() { tops.length = 0; for (var k = 0; k < rowEls.length; k++) tops.push(rowEls[k].offsetTop); if (noteEl) tops.push(noteEl.offsetTop); }
    // insert a TMDB row at index `at`, keeping the current view stable
    function insertRowAt(r, at) {
      var curD = st.mode === 'browse' && defs[st.row] ? defs[st.row] : null;
      defs.splice(at, 0, r.d); rowEls.splice(at, 0, r.row); tracks.splice(at, 0, r.tr); cards.splice(at, 0, r.cs); mem.splice(at, 0, 0); rowObjs.splice(at, 0, r);
      rowsEl.insertBefore(r.row, rowEls[at + 1] || noteEl || null);
      recalcTops();
      instant(root, function () {
        if (curD) { st.row = -1; rowsTy = null; setRow(defs.indexOf(curD)); } else if (st.mode === 'hero') setRowsRest();
      });
      for (var k = 0; k < r.cs.length && k < 10; k++) ui.load(r.cs[k]);
    }
    var tmRows = {}, tmFeeds = [];
    function tmSetup() {
      if (!N.tmdb.enabled()) return;
      var TD = [['trend', 'trendingWeek', 5], ['fresh', 'newSeries', 5], ['pop', 'popularMovies', 5]];
      TD.forEach(function (x) {
        var f = N.tmdb.feed(x[0]); tmFeeds.push(f);
        function cb() {
          if (dead) return;
          var items = f.items.slice().sort(function (a, b) { return a.i - b.i; }), r = tmRows[x[0]];
          if (!r) {
            if (items.length < x[2]) return;
            var d = { key: 'tm_' + x[0], title: N.t(x[1]), kind: 'poster', posts: items.map(function (it) { return it.post; }) };
            r = tmRows[x[0]] = makeRow(d); r.n = items.length;
            var at = 0; while (at < defs.length && (defs[at].key === 'cw' || defs[at].key.indexOf('tm_') === 0)) at++;
            // keep trend < fresh < pop order
            var order = { tm_trend: 0, tm_fresh: 1, tm_pop: 2 };
            at = 0; while (at < defs.length && (defs[at].key === 'cw' || (order[defs[at].key] !== undefined && order[defs[at].key] < order[d.key]))) at++;
            insertRowAt(r, at);
          } else {
            var seen = {}; r.d.posts.forEach(function (p) { seen[p.id] = 1; });
            items.forEach(function (it) { if (!seen[it.post.id]) { seen[it.post.id] = 1; r.d.posts.push(it.post); addCard(r, it.post, r.d.posts.length - 1); } });
            ui.layoutTrack(r.tr, r.cs, r.ws);
          }
          if (f.done) f.unsubscribe(cb);
        }
        f.subscribe(cb);
      });
    }

    function goDetails(p, play) { if (p) N.go('details', { id: p.id, autoplay: play ? 1 : 0 }); }

    /* ---- billboard + stage follow ---- */
    function eyebrowFor(p, key, rank) {
      if (key === 'hero') return (p._hero ? N.t('trendingNow') : N.t('featured')) + ' · ' + ui.typeLabel(p, true);
      if (key === 'top_10') return N.t('top10') + ' · #' + rank;
      if (key === 'cw') return N.t('continueWatching');
      return ui.typeLabel(p, true);
    }
    function fill(p, eb) {
      bbE.eb.textContent = eb; bbE.title.textContent = N.title(p);
      var o = other(p); bbE.sub.textContent = o; bbE.sub.style.display = o ? '' : 'none';
      bbE.meta.innerHTML = ''; bbE.meta.appendChild(ui.meta(p, 2)); bbE.plot.textContent = N.plot(p);
      bbE.title.classList.remove('has-logo'); shownHero = p;
      if (p._logo) {
        var im = el('img', 'logo'); im.alt = ''; im.decoding = 'async'; bbE.title.appendChild(im); bbE.title.classList.add('has-logo');
        im.onload = function () { im.classList.add('in'); };
        im.onerror = function () { if (im.parentNode) im.parentNode.removeChild(im); bbE.title.classList.remove('has-logo'); };
        im.src = p._logo;
      }
    }
    function swapBB(p, eb, first) {
      clearTimeout(bbT);
      if (first || document.body.classList.contains('calm')) { fill(p, eb); bb.classList.remove('out'); return; }
      bb.classList.add('out');
      bbT = setTimeout(function () {
        if (dead) return; fill(p, eb); bb.classList.remove('out', 'in-a', 'in-b'); bb.classList.add(flip ? 'in-a' : 'in-b'); flip = !flip;
      }, 120);
    }
    function follow() { clearTimeout(fT); if (dead || !curPost) return; if (N.nav.isFast()) return; fT = setTimeout(function () { apply(false); }, 60); }
    function apply(first) {
      if (dead || !curPost) return;
      var key = curPost.id + '|' + curEb;
      if (key !== shownKey) { var f = !shownKey; shownKey = key; swapBB(curPost, curEb, f); }
      N.stage.show(curPost, (curImm || first) ? { immediate: true, done: first ? function () { N.splashReady(); } : null } : {});
      curImm = false;
    }

    /* ---- hero mode ---- */
    function setHero(i, first, uiOnly) {
      heroIdx = i; var p = heroes[i]; if (!p) return;
      var kids = dotsEl.children; for (var k = 0; k < kids.length; k++) kids[k].classList.toggle('on', k === i);
      playBtn.lastChild.textContent = cwIds[p.id] ? N.t('resume') : N.t('play');
      if (uiOnly || st.mode !== 'hero') return;
      curPost = p; curEb = eyebrowFor(p, 'hero'); curImm = true; clearTimeout(fT); apply(!!first);
    }
    // manual slide change: dots/buttons update at once, billboard + backdrop settle after a short debounce
    function heroStep(d) {
      if (heroes.length < 2) return;
      var i = (heroIdx + d + heroes.length) % heroes.length;
      heroNav = lastAct = Date.now();
      heroIdx = i; var p = heroes[i];
      var kids = dotsEl.children; for (var k = 0; k < kids.length; k++) kids[k].classList.toggle('on', k === i);
      playBtn.lastChild.textContent = cwIds[p.id] ? N.t('resume') : N.t('play');
      curPost = p; curEb = eyebrowFor(p, 'hero'); curImm = true; clearTimeout(fT); clearTimeout(heroT);
      heroT = setTimeout(function () { if (!dead && st.mode === 'hero') apply(false); }, 200);
    }
    function autoAdvance() {
      if (dead || st.mode !== 'hero' || heroes.length < 2 || document.body.classList.contains('calm') || N.player.open || N.nav.cur === chPrev || N.nav.cur === chNext || rail_open() || document.querySelector('.modal')) return;
      if (Date.now() - lastAct < 9000 || Date.now() - heroNav < 12000) return;
      lastAct = Date.now(); setHero((heroIdx + 1) % heroes.length, false);
    }
    function rail_open() { return N.rail.open; }
    function setRowsRest() {
      rowsTy = 860 - (tops[0] || 0); rowsEl.style.transform = 'translateY(' + rowsTy + 'px)';
      for (var k = 0; k < rowEls.length; k++) { rowEls[k].classList.remove('past'); rowEls[k].classList.remove('cur'); }
      st.row = 0;
    }
    function exitBrowse() {
      st.mode = 'hero'; root.classList.remove('browse'); setRowsRest();
      var p = heroes[heroIdx]; curPost = p; curEb = eyebrowFor(p, 'hero'); curImm = true; lastAct = Date.now();
      clearTimeout(fT); apply(false);
    }

    /* ---- browse mode ---- */
    function windowRow(k, center) {
      var cs = cards[k], from = Math.max(0, center - 2), to = Math.min(cs.length - 1, center + 9);
      for (var i = from; i <= to; i++) ui.load(cs[i]);
    }
    function windowRows(ri) {
      for (var k = 0; k < cards.length; k++) {
        var d = Math.abs(k - ri);
        if (d <= 2) windowRow(k, mem[k] || 0);
        else if (d > 4) for (var i = 0; i < cards[k].length; i++) ui.unload(cards[k][i]);
      }
    }
    function setRow(ri) {
      var ty = 640 - tops[ri];
      if (rowsTy !== ty) { rowsTy = ty; rowsEl.style.transform = 'translateY(' + ty + 'px)'; }
      if (st.row !== ri || !rowEls[ri] || !rowEls[ri].classList.contains('cur')) {
        for (var k = 0; k < rowEls.length; k++) { rowEls[k].classList.toggle('past', k < ri); rowEls[k].classList.toggle('cur', k === ri); }
        st.row = ri; windowRows(ri);
      }
    }
    function onCardFocus(ri, i) {
      if (st.mode !== 'browse') { st.mode = 'browse'; root.classList.add('browse'); }
      mem[ri] = i; setRow(ri); ui.slideTo(tracks[ri], cards[ri][i]._x); windowRow(ri, i);
      var p = cards[ri][i]._post; curPost = p; curEb = eyebrowFor(p, defs[ri].key, i + 1);
      follow();
    }
    function onnav(dir, cur) {
      var s = (dir === 'left' || dir === 'right') ? ui.step(dir) : 0;
      if (cur === playBtn || cur === detBtn) {
        if (dir === 'down') { if (cards.length) return cards[0][mem[0] || 0]; return true; }
        if (dir === 'up') return chPrev || true;
        if (cur === playBtn) { if (s > 0) return detBtn; N.rail.enter(); return true; }
        if (s < 0) return playBtn; return true;
      }
      if (cur === chPrev || cur === chNext) {
        if (dir === 'down') return playBtn;
        if (dir === 'up') return true;
        if (cur === chPrev) { if (s > 0) return chNext; N.rail.enter(); return true; }
        if (s < 0) return chPrev; return true;
      }
      if (cur === noteBtn) {
        if (dir === 'up') return cards[cards.length - 1][mem[cards.length - 1] || 0];
        if (s < 0) { N.rail.enter(); } return true;
      }
      var ri = -1, i = -1;
      for (var r = 0; r < cards.length && ri < 0; r++) { var ix = cards[r].indexOf(cur); if (ix >= 0) { ri = r; i = ix; } }
      if (ri < 0) return false;
      if (s) {
        var ni = i + s;
        if (ni < 0) { N.rail.enter(); return true; }
        if (ni >= cards[ri].length) return true;
        return cards[ri][ni];
      }
      if (dir === 'down') {
        if (ri + 1 < cards.length) return cards[ri + 1][Math.min(mem[ri + 1] || 0, cards[ri + 1].length - 1)];
        return noteBtn || true;
      }
      if (dir === 'up') {
        if (ri === 0) return heroes.length ? playBtn : true;
        return cards[ri - 1][Math.min(mem[ri - 1] || 0, cards[ri - 1].length - 1)];
      }
      return true;
    }

    load();
    return {
      destroy: function () {
        dead = true; clearTimeout(fT); clearTimeout(bbT); clearTimeout(heroT); clearInterval(advT); document.removeEventListener('keydown', act);
        N.nav.offSettle(follow); N.stage.cancel();
        var c = root.querySelector('.clock'); if (c) clearInterval(c._t);
      },
      focusState: function () {
        if (st.mode === 'browse' && N.nav.cur) { for (var r = 0; r < cards.length; r++) { var ix = cards[r].indexOf(N.nav.cur); if (ix >= 0) return { mode: 'browse', row: r, idx: ix, hero: heroIdx }; } }
        return { mode: 'hero', hero: heroIdx };
      }
    };
  };

  /* ================= Details ================= */
  S.details = function (root, params) {
    var dead = false, epsOpen = false, lastFocus = null, swT = null, curS = null, sheetScope = null;
    root.classList.add('det');
    N.stage.details(true); N.stage.dim(0);
    var sk = el('div', 'skel-wrap'), skb = el('div', 'sk-bb'); skb.style.top = '240px';
    [[640, 64, 0], [420, 28, 20], [760, 28, 20]].forEach(function (s) { var x = el('div', 'bar'); x.style.width = s[0] + 'px'; x.style.height = s[1] + 'px'; x.style.marginTop = s[2] + 'px'; skb.appendChild(x); });
    sk.appendChild(skb); root.appendChild(sk);

    function load() {
      var wantStream = N.isLoggedIn();
      N.api.get('single', { post_id: params.id }).then(function (post) {
        if (dead) return;
        N.stage.show(post, { immediate: true });
        var free = post.options && post.options.free_stream;
        var sp = (wantStream || free) ? N.api.call('stream', { post_id: post.id, free_stream: wantStream ? 0 : 1 }).then(function (j) {
          return (j && j.success) ? j.result : null;
        }).catch(function () { return null; }) : Promise.resolve(null);
        var dp = N.player.dlMode() === 'off' ? Promise.resolve([]) : N.direct.fetch(post, wantStream);
        return Promise.all([sp, dp]).then(function (r) {
          if (dead) return;
          var st = r[0];
          try { if (st && st.hls && r[1].length) N.direct.attach(st.hls, r[1], !!(post.options && post.options.is_series)); } catch (e) {}
          render(post, st);
        });
      }).catch(function (e) { if (!dead) errorView(root, e, function () { root.innerHTML = ''; root.appendChild(sk); load(); }); });
    }
    function render(post, st) {
      root.removeChild(sk);
      var items = (st && st.hls ? st.hls.slice() : []);
      items.sort(ui.epCmp);
      var resume = st && st.continue_watching && st.continue_watching.file_id ? st.continue_watching : null;
      var po = post.options || {}, isSeries = !!po.is_series;
      var tmOn = N.tmdb.enabled(), dpage = el('div', 'd-page'), col = el('div', 'det-col');
      if (tmOn) root.classList.add('tm');
      var eb = el('div', 'd-eyebrow d-fade', ui.typeLabel(post, true));
      if (po.persian_subtitle) eb.appendChild(el('em', '', N.t('persianSub')));
      col.appendChild(eb);
      var titleEl = el('div', 'd-title', N.title(post)); col.appendChild(titleEl);
      if (tmOn) { titleEl.textContent = ''; titleEl.appendChild(el('span', 'tt', N.title(post))); }
      var o = other(post); if (o) col.appendChild(el('div', 'd-alt', o));
      var tagEl = null; if (tmOn) { tagEl = el('div', 'd-tag'); tagEl.dir = 'auto'; col.appendChild(tagEl); }
      var meta = ui.meta(post, 3, true); meta.classList.add('d-meta'); col.appendChild(meta);
      var plot = el('div', 'd-plot d-fade', N.plot(post)); col.appendChild(plot);
      var btns = el('div', 'd-btns d-fade'); col.appendChild(btns);
      var castEl = null;
      if (post.cast && post.cast.length) { castEl = el('div', 'd-cast d-fade', N.t('cast') + ': ' + post.cast.slice(0, 6).map(function (x) { return x.name; }).join(', ')); col.appendChild(castEl); }
      dpage.appendChild(col); root.appendChild(dpage);

      var startIdx = 0;
      if (resume) items.forEach(function (it, i) { if (it.info && String(it.info.file_id) === String(resume.file_id)) startIdx = i; });
      function play(i, withResume) {
        // leaving for the player: remember where we were, and fully hide the episodes sheet (it would otherwise be drawn over the video)
        backToSheet = epsOpen; lastFocus = epsOpen ? null : N.nav.cur; if (epsOpen) { epMem[curS] = i; clearTimeout(swT); swT = null; hideEps(); }
        N.player.start(post, items, i, withResume ? resume : null);
      }
      function playLabel() {
        var info0 = items[startIdx] && items[startIdx].info || {};
        return resume ? N.t('resume') + (isSeries ? ' S' + (info0.season || 1) + '·E' + ui.epLabel(info0.episode, startIdx + 1) : '') : N.t('play');
      }
      var playB;
      if (items.length) playB = ui.btn(playLabel(), function () { play(startIdx, true); }, 'primary', 'play');
      else playB = ui.btn(N.t('play'), function () { N.toast(N.isLoggedIn() ? N.t('noStream') : N.t('playLogin'), 3500); }, 'primary', 'play');
      btns.appendChild(playB);
      var epB = null;
      if (isSeries && items.length) { epB = ui.btn(N.t('episodes'), function () { openEps(); }, '', 'list'); btns.appendChild(epB); }
      if (N.isLoggedIn()) {
        ['watchlist', 'favorite'].forEach(function (group) {
          var icon = group === 'watchlist' ? 'eye' : 'heart';
          var b = ui.btn('', function () {
            if (b._busy) return;
            b._busy = true; b.classList.add('busy');
            N.lib.toggle(group, post.id).then(function (added) {
              paint(); N.toast(N.t(added ? (group === 'watchlist' ? 'addedWatch' : 'addedFav') : (group === 'watchlist' ? 'removedWatch' : 'removedFav')));
            }).catch(function () {
              paint(); N.toast(N.t('listFailed'));
            }).then(function () { b._busy = false; b.classList.remove('busy'); });
          }, 'io lib-' + group, icon);
          b._label = el('span', 'io-label', N.t(group)); b.appendChild(b._label);
          function paint() { b.classList.toggle('on', N.lib.has(group, post.id)); }
          b.onfocus2 = function () { heroFocus(); };
          btns.appendChild(b); N.lib.ready().then(function () { if (!dead) paint(); });
        });
      }

      /* episodes sheet */
      var sheet = null, tabs = null, wrap = null, track = null, tmeta = null, seasons = [], map = {}, epMem = {}, tileBy = {}, backToSheet = false;
      if (epB) {
        sheet = el('div', 'sheet-eps'); tabs = el('div', 'tabs'); wrap = el('div', 'eptrack-w'); track = el('div', 'eptrack'); wrap.appendChild(track);
        tmeta = el('div', 'tabs-meta tab'); sheet.appendChild(tabs); sheet.appendChild(tmeta); sheet.appendChild(wrap); root.appendChild(sheet);
        items.forEach(function (it, i) { var s = (it.info && it.info.season) || 1; if (!map[s]) { map[s] = []; seasons.push(s); } map[s].push(i); });
        seasons.forEach(function (s, si) {
          var t = ui.pill(N.t('season') + ' ' + s, function () { focusEp(); }, false); t._s = s;
          t.onfocus2 = function () { showSeason(s); };
          t.onnav = function (dir) {
            if (dir === 'down') { flush(); return epTarget(curS) || true; }
            if (dir === 'up') return true;
            var d = ui.step(dir), n = tabs.children[si + d]; return n || true;
          };
          tabs.appendChild(t);
        });
      }
      // tile to focus when entering season s: the remembered episode (an index, never a node: tiles are rebuilt on every season switch), else the first
      function epTarget(s) { var i = epMem[s]; return (i !== undefined && tileBy[i]) || track.firstChild; }
      function buildSeason(s) {
        track.innerHTML = ''; tileBy = {}; var tiles = [];
        map[s].forEach(function (idx) {
          var it = items[idx], prog = 0;
          if (resume && it.info && String(it.info.file_id) === String(resume.file_id) && Number(resume.duration) > 0) prog = Number(resume.time) / Number(resume.duration);
          var t = ui.epTile(it, idx, { progress: prog });
          t.onclick = function () { play(idx, true); };
          t.onfocus2 = function () { ui.slideTo(track, t._x); epMem[s] = idx; };
          t.onnav = function (dir) {
            if (dir === 'up') { for (var q = 0; q < tabs.children.length; q++) if (tabs.children[q]._s === curS) return tabs.children[q]; return true; }
            if (dir === 'down') return true;
            var d = ui.step(dir), i = tiles.indexOf(t); return tiles[i + d] || true;
          };
          t._idx = idx; tileBy[idx] = t; track.appendChild(t); tiles.push(t);
        });
        ui.layoutTrack(track, tiles, tiles.map(function () { return 360; }));
        ui.epTmdb(post, s, tiles);
        // position the track for the remembered tile (no animation, nothing carried over from another season)
        var tg = epTarget(s);
        track.style.transition = 'none'; track._s = null; track.style.transform = ''; ui.slideTo(track, tg ? tg._x : 184); void track.offsetWidth; track.style.transition = '';
        tmeta.textContent = tiles.length + ' ' + N.t('episodes');
      }
      function showSeason(s, now) {
        if (s === curS) return; curS = s;
        for (var q = 0; q < tabs.children.length; q++) tabs.children[q].classList.toggle('cur', tabs.children[q]._s === s);
        clearTimeout(swT); swT = null;
        if (now) { buildSeason(s); wrap.classList.remove('sw'); return; }
        wrap.classList.add('sw'); swT = setTimeout(function () { swT = null; buildSeason(s); wrap.classList.remove('sw'); }, 160);
      }
      function flush() { if (swT) { clearTimeout(swT); swT = null; buildSeason(curS); wrap.classList.remove('sw'); } }
      function focusEp() { flush(); var t = epTarget(curS); if (t) N.nav.focus(t, true); }
      // open the sheet on episode index idx (default: resume/start episode); inst = no slide animation (restoring after playback)
      function openEps(idx, inst) {
        if (epsOpen || !sheet) return; epsOpen = true;
        if (idx === undefined || idx === null || !items[idx]) idx = startIdx;
        var s0 = (items[idx].info && items[idx].info.season) || seasons[0];
        epMem[s0] = idx; curS = null; showSeason(s0, true);
        if (inst) { root.classList.add('inst'); }
        root.classList.add('eps'); sheetScope = sheet; N.nav.pushScope(sheet);
        if (inst) { void root.offsetWidth; setTimeout(function () { root.classList.remove('inst'); }, 60); }
        N.nav.focus(epTarget(s0), true);
      }
      // hide the sheet completely (leave it for playback): visibility is hidden as soon as .eps goes away
      function hideEps() {
        if (!epsOpen) return; epsOpen = false; root.classList.remove('eps'); N.nav.popScope(); sheetScope = null;
      }
      function closeEps() {
        if (!epsOpen) return; epsOpen = false; root.classList.remove('eps'); N.nav.popScope(); sheetScope = null;
        N.nav.focus(epB, true);
      }
      btns.onnav = function (dir, cur) {
        if (dir === 'down') { var fx = xFirst(); if (fx) return fx; if (epB) { openEps(); return true; } return true; }
        if (dir === 'up') return true;
        return false;
      };
      function heroFocus() { setX(false); }
      playB.onfocus2 = heroFocus; if (epB) epB.onfocus2 = heroFocus;
      current.back = function () {
        if (rvOpen) { closeReview(); return true; }
        if (epsOpen) { closeEps(); return true; }
        if (xOn) { N.nav.focus(playB, true); heroFocus(); return true; }
        return false;
      };
      current.closeRv = function () { if (rvOpen) { N.nav.popScope(); rvOpen = null; } };

      /* ---------- TMDB extras (progressive; absent without a token) ---------- */
      var xEl = null, xRows = [], xOn = false, rvOpen = null;
      function setX(on) {
        if (on === xOn) return; xOn = on; root.classList.toggle('xs', on); N.stage.dim(on ? 0.55 : 0);
        if (!on) { dpage._ty = 0; dpage.style.transform = ''; for (var k = 0; k < xRows.length; k++) { xRows[k].tr.style.transition = 'none'; xRows[k].tr._s = null; ui.slideTo(xRows[k].tr, 0); xRows[k].mem = 0; xRows[k].el.classList.remove('cur'); void xRows[k].tr.offsetWidth; xRows[k].tr.style.transition = ''; } }
      }
      function xFirst() { var r = xRows[0]; return r ? r.cs[Math.min(r.mem, r.cs.length - 1)] : null; }
      function fmtDate(iso) {
        try { var d = new Date(iso + 'T12:00:00'); return d.toLocaleDateString(N.lang === 'fa' ? 'fa-IR' : 'en-US', { month: 'short', day: 'numeric' }); } catch (e) { return iso; }
      }
      function statusText(s) {
        if (N.lang !== 'fa') return s;
        var m = { 'Returning Series': 'در حال پخش', 'Ended': 'پایان‌یافته', 'Canceled': 'لغو شده', 'In Production': 'در حال تولید', 'Planned': 'برنامه‌ریزی‌شده', 'Pilot': 'پایلوت' };
        return m[s] || s;
      }
      function xRowAdd(key, title, height) {
        var row = el('div', 'hrow'), hd = el('div', 'hrow-h', title), tr = el('div', 'track'), r = { key: key, el: row, tr: tr, cs: [], ws: [], mem: 0 };
        row.style.height = height + 'px'; row.appendChild(hd); row.appendChild(tr);
        xRows.push(r); xEl.appendChild(row); return r;
      }
      function xCard(r, c, w) {
        var i = r.cs.length;
        c.onfocus2 = function () { r.mem = i; ui.slideTo(r.tr, c._x); setX(true); ui.vscroll(dpage, r.el, 250); for (var k = 0; k < xRows.length; k++) xRows[k].el.classList.toggle('cur', xRows[k] === r); };
        r.tr.appendChild(c); r.cs.push(c); r.ws.push(w); ui.layoutTrack(r.tr, r.cs, r.ws);
      }
      function initials(n) { var p = String(n || '').split(/\s+/); return ((p[0] || '').charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase(); }
      function faceCard(p, role) {
        var c = el('div', 'card f k-face'), ph = el('div', 'fph');
        ph.appendChild(el('span', '', initials(p.n)));
        if (p.p) { var im = el('img', 'im'); im.alt = ''; im.decoding = 'async'; im.onload = function () { im.classList.add('in'); }; im.src = N.tmdb.img(p.p, 'w185'); ph.appendChild(im); }
        c._mq = [ui.mq(p.n, 'fnm'), ui.mq(role || '', 'frl')];
        c.appendChild(ph); c.appendChild(c._mq[0]); c.appendChild(c._mq[1]);
        return c;
      }
      function revCard(rv) {
        var c = el('div', 'card f k-rev'), h = el('div', 'rvh');
        c._mq = ui.mq(rv.a || '-', 'rva'); h.appendChild(c._mq);
        if (rv.r) h.appendChild(el('span', 'rvr tab', '★ ' + rv.r));
        c.appendChild(h); c.appendChild(el('div', 'rvt', rv.t.replace(/\s+/g, ' ')));
        c.onclick = function () { openReview(rv); };
        return c;
      }
      function openReview(rv) {
        if (rvOpen) return;
        var m = el('div', 'rv-sheet'), box = el('div', 'rv-box'), hd = el('div', 'rv-h'), bodyW = el('div', 'rv-body'), txt = el('div', 'rv-text', rv.t), off = 0;
        txt.dir = 'auto';
        hd.appendChild(el('span', 'rva', rv.a || '-')); if (rv.r) hd.appendChild(el('span', 'rvr tab', '★ ' + rv.r)); if (rv.d) hd.appendChild(el('span', 'rvd tab', rv.d));
        bodyW.appendChild(txt); box.appendChild(hd); box.appendChild(bodyW);
        var cb = ui.btn(N.t('close'), function () { closeReview(); }, 'primary');
        cb.onnav = function (dir) {
          if (dir === 'up' || dir === 'down') {
            var mx = Math.max(0, txt.offsetHeight - bodyW.offsetHeight); off = Math.max(0, Math.min(mx, off + (dir === 'down' ? 200 : -200)));
            txt.style.transform = 'translateY(' + (-off) + 'px)'; return true;
          }
          return true;
        };
        var ft = el('div', 'rv-f'); ft.appendChild(cb); ft.appendChild(el('span', 'rv-hint', N.t('scrollHint'))); box.appendChild(ft);
        m.appendChild(box); root.appendChild(m); rvOpen = { el: m, prev: N.nav.cur };
        N.nav.pushScope(m); void m.offsetWidth; m.classList.add('show'); N.nav.focus(cb, true);
      }
      function closeReview() {
        if (!rvOpen) return; var o = rvOpen; rvOpen = null; N.nav.popScope(); o.el.classList.remove('show');
        setTimeout(function () { if (o.el.parentNode) o.el.parentNode.removeChild(o.el); }, 260);
        if (o.prev && o.prev.offsetWidth > 0) N.nav.focus(o.prev, true);
      }
      function xNav(dir, cur) {
        var ri = -1, i = -1, k;
        for (k = 0; k < xRows.length && ri < 0; k++) { var ix = xRows[k].cs.indexOf(cur); if (ix >= 0) { ri = k; i = ix; } }
        if (ri < 0) return false;
        var s2 = (dir === 'left' || dir === 'right') ? ui.step(dir) : 0;
        if (s2) { var ni = i + s2; if (ni < 0) { N.rail.enter(); return true; } return xRows[ri].cs[ni] || true; }
        if (dir === 'down') { var nr = xRows[ri + 1]; return nr ? nr.cs[Math.min(nr.mem, nr.cs.length - 1)] : true; }
        if (dir === 'up') { if (ri === 0) return playB; var pr = xRows[ri - 1]; return pr.cs[Math.min(pr.mem, pr.cs.length - 1)]; }
        return true;
      }
      function paintTmdb(d) {
        if (tagEl && d.tagline) { tagEl.textContent = d.tagline; tagEl.classList.add('in'); }
        if (d.logo) {
          var li = el('img', 'logo'); li.alt = ''; li.decoding = 'async';
          li.onload = function () { if (dead) return; titleEl.appendChild(li); void li.offsetWidth; li.classList.add('in'); titleEl.classList.add('has-logo'); };
          li.src = N.tmdb.img(d.logo, 'w500');
        }
        if (d.votes >= 5 && d.rating) { meta.appendChild(el('span', 'tmdb tab fadein', 'TMDB ' + d.rating.toFixed(1))); }
        if (d.next && isSeries) {
          eb.appendChild(el('span', 'd-next fadein', (d.next.e === 1 ? N.t('newSeason') + (d.next.s > 1 ? ' ' + d.next.s : '') : N.t('nextEp') + ' · ⁦S' + d.next.s + 'E' + d.next.e + '⁩') + ' · ' + fmtDate(d.next.d)));
        }
        var bits = [];
        if (isSeries && d.status) bits.push(statusText(d.status));
        if (!(post.info && post.info.time && post.info.time.default) && d.runtime) bits.push(ui.duration(d.runtime));
        if (d.nets.length) bits.push(d.nets.join(', '));
        if (bits.length && d.cast.length) {
          if (!castEl) { castEl = el('div', 'd-cast d-fade'); col.appendChild(castEl); }
          castEl.textContent = bits.join(' · '); castEl.classList.add('fadein');
        }
        if (d.bd) {
          var tb = N.tmdb.img(d.bd, 'w1280'), cv = ui.coverUrl(post);
          if (!cv) { post._bd = tb; N.stage.show(post, { immediate: true }); }
          else {
            var ci = new Image();
            ci.onload = function () { if (dead) return; if (ci.naturalWidth && ci.naturalWidth < 1280) { post._bd = tb; post._bdPref = true; N.stage.show(post, { immediate: true }); } };
            ci.src = cv;
          }
        }
        xEl = el('div', 'd-x'); xEl.appendChild(el('div', 'd-x-bg')); xEl.onnav = xNav; dpage.appendChild(xEl);
        if (d.cast.length) { var rc2 = xRowAdd('cast', N.t('cast'), 364); d.cast.forEach(function (p) { xCard(rc2, faceCard(p, p.c), 180); }); }
        if (d.crew.length) { var rr = xRowAdd('crew', N.t('crew'), 364); d.crew.forEach(function (p) { xCard(rr, faceCard(p, N.t(p.j)), 180); }); }
        if (d.reviews.length) { var rv = xRowAdd('rev', N.t('reviews'), 388); d.reviews.forEach(function (x) { xCard(rv, revCard(x), 520); }); }
        if (d.recs.length) {
          var recRow = null, got = {}, n = 0, queued = [];
          var addRec = function (p) {
            var c = ui.card(p, 'poster'); c.onclick = function () { N.go('details', { id: p.id }); }; xCard(recRow, c, 200); ui.load(c);
          };
          d.recs.slice(0, 20).forEach(function (it) {
            N.tmdb.resolve(it, function () { return !dead && n < 12; }).then(function (p) {
              if (dead || !p || p.id === post.id || got[p.id] || n >= 12) return;
              got[p.id] = 1; n++;
              if (!recRow) {
                queued.push(p); if (queued.length < 3) return;
                recRow = xRowAdd('rec', N.t('moreLikeThis'), 396); queued.forEach(addRec); return;
              }
              addRec(p);
            });
          });
        }
      }
      if (tmOn) N.tmdb.details(post).then(function (d) { if (!dead && d) paintTmdb(d); }).catch(function () {});
      current.onPlayerClosed = function () {
        var last = N.player.last, found = -1;
        if (last && String(last.post_id) === String(post.id)) {
          items.forEach(function (it, i) {
            if (it.info && String(it.info.file_id) === String(last.file_id)) found = i;
          });
          if (found >= 0) {
            resume = { file_id: last.file_id, time: last.time, duration: last.duration };
            startIdx = found;
            playB.lastChild.textContent = playLabel();
          }
        }
        if (backToSheet && sheet) { backToSheet = false; openEps(N.player.index, true); return; } // same season, on the episode just played (or the one autoplay moved to)
        var t = lastFocus && document.body.contains(lastFocus) && lastFocus.offsetWidth > 0 ? lastFocus : playB; N.nav.focus(t, true);
      };
      N.nav.focus(playB, true);
      if (params.autoplay) {
        params.autoplay = 0; // params is the history entry: returning here with Back must not start playback again
        if (items.length) play(startIdx, true); else N.toast(N.isLoggedIn() ? N.t('noStream') : N.t('playLogin'), 3500);
      }
    }
    var current = { destroy: function () { dead = true; clearTimeout(swT); if (sheetScope) { N.nav.popScope(); sheetScope = null; } if (current.closeRv) current.closeRv(); } };
    load();
    return current;
  };

  /* ================= Search ================= */
  var KB = {
    en: { cols: 7, keys: 'abcdefghijklmnopqrstuvwxyz0123456789'.split('') },
    fa: { cols: 8, keys: 'ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی۰۱۲۳۴۵۶۷۸۹'.split('') }
  };
  S.search = function (root) {
    var dead = false, seq = 0, timer = null, q = '', kbLang = N.lang === 'fa' ? 'fa' : 'en', swT = null;
    root.classList.add('search');
    N.stage.dim(0.72);
    var panel = el('div', 'panel'); root.appendChild(panel);
    var field = el('div', 'qfield'), qt = el('span', 'qt'), ph = el('span', 'ph-t', N.t('searchPh')), caret = el('i', 'caret');
    field.appendChild(qt); field.appendChild(ph); field.appendChild(caret); panel.appendChild(field);
    var kb = el('div', 'kb ' + kbLang), grid = el('div', 'grid'), fn = el('div', 'fn');
    kb.appendChild(grid); kb.appendChild(fn); panel.appendChild(kb);
    panel.appendChild(el('div', 'kb-hint', N.t('kbHint')));
    var hid = el('input'); hid.type = 'text'; hid.setAttribute('autocomplete', 'off'); hid.style.cssText = 'position:absolute;left:-2000px;top:0;width:10px;height:10px';
    root.appendChild(hid);

    var res = el('div', 'results'), rh = el('div', 'rh'), rw = el('div', 'rgrid-w'), rg = el('div', 'rgrid');
    var viewport = el('div', 'rgrid-viewport'), resultCards = [], keyboardMem = null;
    var RESULT_COLS = 5; // Must match .rgrid width / (.rgrid .gcell width + margin) in app.css.
    rw.appendChild(rg); viewport.appendChild(rw); res.appendChild(rh); res.appendChild(viewport); root.appendChild(res);
    rw.reveal = function (e) { ui.vscroll(rw, e._cell || e, 20); };

    function key(label, cls, fn2) {
      var k = el('button', 'key f fl' + (cls ? ' ' + cls : ''));
      if (typeof label === 'string') k.textContent = label; else k.appendChild(label);
      k.onclick = fn2; return k;
    }
    function layout() {
      grid.innerHTML = ''; fn.innerHTML = ''; kb.className = 'kb ' + kbLang;
      var L = KB[kbLang]; grid.style.width = (L.cols * 76) + 'px'; grid.dir = kbLang === 'fa' ? 'rtl' : 'ltr';
      L.keys.forEach(function (c) { grid.appendChild(key(c, '', function () { type(c); })); });
      Array.prototype.forEach.call(grid.children, function (k, i) {
        k.onnav = function (dir) {
          // Keyboard order follows its own language, independently of the UI language.
          var mapped = dir;
          if ((kbLang === 'fa') !== N.isRtl() && (dir === 'left' || dir === 'right')) mapped = dir === 'left' ? 'right' : 'left';
          if (dir === 'down' && Math.floor(i / L.cols) === Math.floor((L.keys.length - 1) / L.cols)) return fn.firstChild;
          return ui.gridNav(Array.prototype.slice.call(grid.children), i, L.cols, mapped, function () { return panelEdge(dir, k); });
        };
      });
      var sp = key(N.t('space'), 'sp', function () { type(' '); });
      fn.appendChild(sp);
      fn.appendChild(key('⌫', '', function () { q = q.slice(0, -1); changed(); }));
      fn.appendChild(key(N.t('clearK'), '', function () { q = ''; changed(); }));
      var lk = key(kbLang === 'en' ? 'فا' : 'EN', '', function () { kbLang = kbLang === 'en' ? 'fa' : 'en'; layout(); N.nav.focus(fn.children[3], true); });
      fn.appendChild(lk);
      var mic = key(ui.icon('mic'), '', function () { hid.value = q; N.nav.focus(hid); });
      fn.appendChild(mic);
      Array.prototype.forEach.call(fn.children, function (k, i) {
        k.onnav = function (dir) {
          if (dir === 'up') return grid.children[Math.max(0, L.keys.length - L.cols + i)];
          if (dir === 'down') return true;
          return fn.children[i + (dir === 'right' ? 1 : -1)] || panelEdge(dir, k);
        };
      });
      fn.style.width = (L.cols * 76) + 'px';
    }
    function panelEdge(dir, cur) {
      if (dir === 'left' || dir === 'right') {
        if (ui.step(dir) > 0) { keyboardMem = cur; return resultCards[0] || true; }
        N.rail.enter();
      }
      return true;
    }
    panel.onnav = function (dir, cur) {
      if (dir === 'down') return true;
      return panelEdge(dir, cur);
    };
    function type(c) { if (q.length < 60) { q += c; changed(); } }
    function changed() {
      seq++; clearTimeout(swT); rg.classList.remove('sw');
      qt.textContent = q; ph.style.display = q ? 'none' : '';
      clearTimeout(timer); timer = setTimeout(run, 500);
    }
    hid.oninput = function () { q = hid.value; changed(); };
    hid.onenter = function () { hid.blur(); var mic = fn.lastChild; N.nav.focus(mic, true); clearTimeout(timer); run(); };
    // physical keyboard (desktop testing / USB keyboards)
    function onKeyDown(e) {
      if (document.activeElement === hid || e.ctrlKey || e.altKey || e.metaKey || !e.key || e.key.length !== 1) return;
      if (N.player.open || N.rail.open || document.querySelector('.modal')) return;
      type(e.key.toLowerCase());
    }
    document.addEventListener('keydown', onKeyDown);

    function show(posts, header, msg) {
      clearTimeout(swT); rg.classList.add('sw');
      swT = setTimeout(function () {
        if (dead) return;
        var restoreIndex = resultCards.indexOf(N.nav.cur);
        rg.innerHTML = ''; resultCards = []; rh.textContent = header;
        if (msg) { var m = el('div', 'nores', msg); m.style.flexBasis = '100%'; m.style.position = 'relative'; m.style.top = '0'; m.style.marginBottom = '24px'; rg.appendChild(m); }
        posts.forEach(function (p, i) {
          var cell = ui.cell(p); if (i < 12) { cell.classList.add('fadein'); cell.style.animationDelay = (i * 15) + 'ms'; }
          cell.card.onclick = function () { N.go('details', { id: p.id }); };
          resultCards.push(cell.card);
          cell.card.onnav = function (dir) {
            return ui.gridNav(resultCards, i, RESULT_COLS, dir, function (edge) {
              if (edge === 'left' || edge === 'right') {
                if (ui.step(edge) < 0) return keyboardMem && root.contains(keyboardMem) ? keyboardMem : grid.firstChild;
              }
              return true;
            });
          };
          cell.card.onfocus2 = function () {
            var lo = Math.max(0, i - 4), hi = Math.min(rg.children.length, i + 12);
            for (var k = lo; k < hi; k++) { var cc = rg.children[k].card; if (cc) ui.load(cc); }
          };
          rg.appendChild(cell);
        });
        for (var k = 0; k < rg.children.length && k < 12; k++) if (rg.children[k].card) ui.load(rg.children[k].card);
        rw.style.transition = 'none'; rw._ty = null; rw.style.transform = ''; void rw.offsetWidth; rw.style.transition = '';
        rg.classList.remove('sw');
        if (restoreIndex >= 0) N.nav.focus(resultCards[Math.min(restoreIndex, resultCards.length - 1)] || grid.firstChild);
      }, 120);
    }
    function popular(msg, generation) {
      var my = generation === undefined ? seq : generation;
      N.getHome().then(function (h) { if (dead || my !== seq) return; var ps = (h.suggested && h.suggested.posts) || (h.movies && h.movies.posts) || []; show(ps.slice(0, 15), N.t('popularNow'), msg); }).catch(function () {});
    }
    function run() {
      var qq = q.trim(); var my = ++seq;
      if (!qq) { popular('', my); return; }
      N.api.get('search', { query: qq, streamonly: 0, page: 1 }).then(function (r) {
        if (dead || my !== seq) return;
        if (!r.posts || !r.posts.length) { popular(N.t('nothingFor') + ' “' + qq + '”', my); return; }
        show(r.posts, N.t('topResults'), '');
      }).catch(function (e) { if (!dead && my === seq) popular(N.t('error') + '. ' + N.t('tryAgain'), my); });
    }
    layout(); popular('');
    N.nav.focus(grid.firstChild, true);
    return { destroy: function () { dead = true; clearTimeout(timer); clearTimeout(swT); document.removeEventListener('keydown', onKeyDown); } };
  };

  /* ================= Archive ================= */
  var menuCache = null;
  S.archive = function (root, params, restore) {
    if (params && params.slug) return archiveList(root, params, restore);
    var dead = false;
    root.classList.add('archive'); N.stage.dim(0.72);
    var box = el('div', 'arch'); root.appendChild(box);
    box.reveal = function (e) { var ty = ui.vscroll(box, e, 260); box.classList.toggle('scrolled', ty < 0); };
    var sk = el('div', 'msg', N.t('loading')); sk.style.cssText = 'position:absolute;top:300px;left:184px'; root.appendChild(sk);
    function show(m) {
      if (dead) return; root.removeChild(sk);
      box.appendChild(el('div', 'ah head', N.t('browse')));
      var cats = el('div', 'cats'); box.appendChild(cats);
      (m.categories || []).forEach(function (c) { cats.appendChild(ui.pill(c.name, function () { N.go('archive', { slug: c.slug, name: c.name }); }, false)); });
      box.appendChild(el('div', 'sec-h', N.t('genres')));
      var tiles = el('div', 'tiles'); box.appendChild(tiles);
      var all = [];
      (m.genres || []).forEach(function (g, i) {
        var im = g.image || {}, u = (im.webp && (im.webp.full || im.webp.thumb)) || (im.jpg && (im.jpg.full || im.jpg.thumb)) || '';
        var c = ui.card({ id: g.id, title: { english: g.name } }, 'tile', { image: u, name: g.name, count: g.count });
        c.onclick = function () { N.go('archive', { slug: g.slug, name: g.name }); };
        c.onfocus2 = function () { for (var k = Math.max(0, i - 4); k < Math.min(all.length, i + 12); k++) ui.load(all[k]); };
        tiles.appendChild(c); all.push(c); if (i < 8) ui.load(c);
      });
      N.nav.focus(cats.firstChild, true);
    }
    if (menuCache) show(menuCache);
    else N.api.get('menu').then(function (m) { menuCache = m; show(m); }).catch(function (e) { if (!dead) errorView(root, e, function () { N.go('archive', {}, { replace: true }); }); });
    return { destroy: function () { dead = true; } };
  };

  var SORTS = [['date', 'newest'], ['favorite', 'popular'], ['update', 'updated']];
  function pagedGrid(root, o, restore) {
    var dead = false, page = 1, pages = 1, loading = false, total = 0, cells = [], skels = [], tab = (restore && restore.tab) || o.tabs[0][0], wantIdx = restore && restore.idx || 0, restoring = !!(restore && restore.idx > 0), gen = 0, COLS = 7;
    root.classList.add('archive', 'gridpage'); N.stage.dim(0.72);
    var box = el('div', 'arch'); root.appendChild(box);
    var head = el('div', 'head ah'); head.textContent = o.title(); var cnt = el('small', 'tab', ''); head.appendChild(cnt); box.appendChild(head);
    var sorts = el('div', 'sorts head'); box.appendChild(sorts);
    var grid = el('div', 'ggrid'); box.appendChild(grid);
    box.reveal = function (e) { var ty = ui.vscroll(box, e._cell || e, 260); box.classList.toggle('scrolled', ty < 0); };
    o.tabs.forEach(function (s) {
      var p = ui.pill(N.t(s[1]), function () { if (tab === s[0]) return; tab = s[0]; paint(); reset(); }, tab === s[0]); p._k = s[0]; sorts.appendChild(p);
      p.onnav = function (dir) { if (dir === 'down') return cells[0] ? cells[0].card : true; if (dir === 'up') return true; return false; };
    });
    function paint() { for (var i = 0; i < sorts.children.length; i++) sorts.children[i].classList.toggle('cur', sorts.children[i]._k === tab); }
    function addSkels(n) { for (var i = 0; i < n; i++) { var c = el('div', 'gcell'); c.appendChild(ui.skelCard('grid')); skels.push(c); grid.appendChild(c); } }
    function clearSkels() { skels.forEach(function (s) { if (s.parentNode) s.parentNode.removeChild(s); }); skels = []; }
    function reset() {
      gen++; loading = false; page = 1; pages = 1; cells = []; grid.innerHTML = ''; skels = []; box.style.transition = 'none'; box._ty = null; box.style.transform = ''; void box.offsetWidth; box.style.transition = ''; box.classList.remove('scrolled');
      wantIdx = 0; restoring = false; load();
    }
    function load() {
      if (loading) return; loading = true; var my = gen; addSkels(page === 1 ? 14 : 7);
      o.fetch(tab, page).then(function (r) {
        if (dead || my !== gen) return;
        loading = false; clearSkels();
        var first = cells.length === 0;
        total = r.total || total; pages = r.pages || 1; if (total) cnt.textContent = Number(total).toLocaleString('en-US') + ' ' + N.t('results');
        (r.posts || []).forEach(function (p) {
          var cell = ui.cell(p), idx = cells.length, c = cell.card;
          c.onclick = function () { N.go('details', { id: p.id }); };
          c.onnav = function (dir) {
            return ui.gridNav(cells.map(function (it) { return it.card; }), idx, COLS, dir, function (edge) {
              if (edge === 'up') return sorts.firstChild;
              if ((edge === 'left' || edge === 'right') && ui.step(edge) < 0) N.rail.enter();
              return true;
            });
          };
          c.onfocus2 = function () {
            var row = Math.floor(idx / COLS), rows = Math.ceil(cells.length / COLS);
            for (var k = Math.max(0, (row - 1) * COLS); k < Math.min(cells.length, (row + 3) * COLS); k++) ui.load(cells[k].card);
            if (row >= rows - 2 && page < pages && !loading) { page++; load(); }
          };
          cells.push(cell); grid.appendChild(cell);
        });
        if (first && !cells.length && o.empty) {
          var empty = el('div', 'list-empty'); empty.appendChild(el('div', 'm', N.t(o.empty[tab])));
          empty.appendChild(el('div', 'hint', N.t('emptyHint'))); grid.appendChild(empty);
        }
        for (var k = 0; k < Math.min(cells.length, 3 * COLS); k++) ui.load(cells[k].card);
        if (first && !restoring) N.nav.focus(cells[0] ? cells[0].card : sorts.firstChild, true);
        if (restoring) {
          if (wantIdx < cells.length) { restoring = false; instant(root, function () { N.nav.focus(cells[wantIdx].card); }); }
          else if (page < pages) { page++; load(); } else { restoring = false; N.nav.focus(cells[0] ? cells[0].card : sorts.firstChild, true); }
        }
      }).catch(function (e) { if (!dead && my === gen) { loading = false; clearSkels(); if (!cells.length) errorView(root, e, function () { o.retry(); }); } });
    }
    load();
    return {
      destroy: function () { dead = true; },
      focusState: function () { for (var i = 0; i < cells.length; i++) if (cells[i].card === N.nav.cur) return { idx: i, tab: tab }; return { tab: tab }; }
    };
  }
  function archiveList(root, params, restore) {
    return pagedGrid(root, {
      title: function () { return params.name || params.slug; },
      tabs: SORTS,
      fetch: function (sort, page) { return N.api.get('archive', { slugs: params.slug, streamonly: 1, page: page, orderby: sort, order: 'desc' }); },
      retry: function () { N.go('archive', params, { replace: true }); }
    }, restore && { idx: restore.idx, tab: restore.sort });
  }

  S.mylist = function (root, params, restore) {
    if (!N.isLoggedIn()) {
      root.classList.add('archive'); N.stage.dim(0.72);
      var m = el('div', 'center-msg'), text = el('div', 'm', N.t('listLogin'));
      var signIn = ui.btn(N.t('signIn'), function () { N.go('login', {}, { reset: true }); }, 'primary');
      m.appendChild(text); m.appendChild(signIn); root.appendChild(m); N.nav.focus(signIn, true);
      return {};
    }
    return pagedGrid(root, {
      title: function () { return N.t('mylist'); },
      tabs: [['watchlist', 'watchlist'], ['favorite', 'favorites']],
      empty: { watchlist: 'emptyWatch', favorite: 'emptyFav' },
      fetch: function (group, page) { return N.lib.list(group, page); },
      retry: function () { N.go('mylist', {}, { replace: true }); }
    }, restore);
  };

  /* ================= Settings ================= */
  S.settings = function (root, params, restore) {
    var dead = false, sec = (restore && restore.sec) || (params && params.section) || 'account', swT = null, paneOff = null, secs = ['account', 'language', 'playback', 'display', 'tmdb', 'takeover', 'about'];
    root.classList.add('set'); N.stage.dim(0.72);
    root.appendChild(el('div', 'h-xl t', N.t('settings')));
    var list = el('div', 'slist'), pane = el('div', 'spane'); root.appendChild(list); root.appendChild(pane);
    var rows = {};
    function fmtExpire(v) {
      if (v === undefined || v === null || v === '') return N.t('unknown');
      if (typeof v === 'number' || /^\d{9,13}$/.test(String(v))) { var n = Number(v); if (n < 1e11) n *= 1000; return new Date(n).toISOString().slice(0, 10); }
      return String(v);
    }
    // option row. opts: values [{v,label}], get(), set(v)
    function opt(label, values, get, set) {
      var r = el('div', 'orow f fl'), v = el('div', 'v'), val = el('span', ''), hint = el('span', 'hint', '‹ ›');
      r.appendChild(el('span', '', label)); v.appendChild(hint); v.appendChild(val); r.appendChild(v);
      function paintV() { var cur = get(); for (var i = 0; i < values.length; i++) if (values[i].v === cur) { val.textContent = values[i].label; return i; } val.textContent = values[0].label; return 0; }
      function cycle(d) { var i = paintV(); i = (i + d + values.length) % values.length; set(values[i].v); paintV(); }
      paintV(); r.onenter = r.onclick = function () { cycle(1); };
      r.onnav = function (dir) { if (dir === 'left' || dir === 'right') { cycle(ui.step(dir)); return true; } return false; };
      return r;
    }
    function info(label, value) { var r = el('div', 'orow nof'); r.appendChild(el('span', '', label)); r.appendChild(el('div', 'v', value)); return r; }
    function action(label, fn, danger) { var r = el('div', 'orow f fl' + (danger ? ' danger' : '')); r.appendChild(el('span', '', label)); r.onclick = r.onenter = fn; return r; }
    var onOff = [{ v: true, label: N.t('on') }, { v: false, label: N.t('off') }];
    var builders = {
      account: function (p) {
        var u = N.session && N.session.user;
        p.appendChild(info(N.t('account'), u ? (u.user_name || u.user_email || 'user') : N.t('guestAcc')));
        if (u) {
          p.appendChild(info(N.t('userType'), u.user_type !== undefined ? String(u.user_type) : '-'));
          p.appendChild(info(N.t('expires'), fmtExpire(u.user_expire)));
          p.appendChild(action(N.t('logout'), function () {
            N.confirm({ title: N.t('logoutTitle'), body: N.t('logoutBody'), ok: N.t('logout'), danger: true, onOk: function () { N.logout(); } });
          }, true));
        } else p.appendChild(action(N.t('login'), function () { N.go('login', {}, { reset: true }); }));
      },
      language: function (p) {
        p.appendChild(opt(N.t('language'), [{ v: 'en', label: 'English' }, { v: 'fa', label: 'فارسی' }], function () { return N.lang; }, function (v) {
          N.setLang(v); N.dropHome(); N.rail.build();
          var idx = 0; for (var i = 0; i < pane.children.length; i++) if (pane.children[i] === N.nav.cur) idx = i;
          N.rerender();
        }));
      },
      playback: function (p) {
        p.appendChild(opt(N.t('defSubs'), [{ v: 'off', label: N.t('off') }, { v: 'fa', label: N.t('persian') }, { v: 'en', label: N.t('english') }],
          function () { return N.store.get('sub', 'off'); }, function (v) { N.store.set('sub', v); }));
        var sample = el('div', 'subsample', N.t('sample')); sample.style.fontSize = N.store.get('subSize', 46) + 'px';
        p.appendChild(opt(N.t('subSize'), [{ v: 38, label: N.t('small') }, { v: 46, label: N.t('medium') }, { v: 54, label: N.t('large') }],
          function () { return N.store.get('subSize', 46); }, function (v) { N.store.set('subSize', v); sample.style.fontSize = v + 'px'; }));
        p.appendChild(sample);
        p.appendChild(opt(N.t('dlMode'), [{ v: 'off', label: N.t('dlOff') }, { v: 'menu', label: N.t('dlMenu') }, { v: 'auto', label: N.t('dlAuto') }],
          function () { return N.player.dlMode(); }, function (v) { N.store.set('dlMode', v); }));
        p.appendChild(opt(N.t('autoplay'), onOff, function () { return N.store.get('autoplay', true); }, function (v) { N.store.set('autoplay', v); }));
      },
      display: function (p) {
        p.appendChild(opt(N.t('reduce'), onOff.slice().reverse().map(function (x) { return x; }), function () { return N.store.get('calm', false); }, function (v) {
          N.store.set('calm', v); document.body.classList.toggle('calm', v);
        }));
      },
      takeover: function (p) {
        var tk = N.takeover, st = el('div', 'note tkst', N.t('tkChecking')), body = el('div', 'tkbody scroll');
        p.appendChild(el('div', 'note tkh', N.t('tkTitle'))); p.appendChild(st); p.appendChild(body);
        function status(txt, bad) { st.textContent = txt; st.classList.toggle('bad', !!bad); }
        function trow(label, sub, on, fn) {
          var r = el('div', 'orow sm f fl'), l = el('span', 'tkl', label); if (sub) l.appendChild(el('small', 'tkid', sub));
          var v = el('div', 'v', ''); r.appendChild(l); r.appendChild(v);
          function paint() { v.textContent = on ? '★ ' + N.t('on') : N.t('off'); r.classList.toggle('tkon', on); }
          paint(); r.onenter = r.onclick = function () { on = !on; paint(); fn(on); };
          return r;
        }
        function paint(s) {
          if (dead || !pane.contains(body)) return;
          var keep = N.nav.cur && body.contains(N.nav.cur) ? Array.prototype.indexOf.call(body.querySelectorAll('.f'), N.nav.cur) : -1;
          body.innerHTML = ''; var cfg = s.cfg || {}, trig = cfg.triggers || [];
          status(N.t('tkRunning'));
          body.appendChild(trow(N.t('tkEnable'), '', !!cfg.enabled, function (on) { N.store.set('tkOn', on); push({ enabled: on }); }));
          var seen = {}, apps = [], i, a;
          function add(id, name) { if (!id) return; if (seen[id]) { if (!seen[id].name && name) seen[id].name = name; return; } seen[id] = { id: id, name: name || '' }; apps.push(seen[id]); }
          for (i = 0; i < (s.known || []).length; i++) add(s.known[i].id, s.known[i].name);
          for (var id in (s.seen || {})) add(id, s.seen[id] && s.seen[id].name);
          for (i = 0; i < trig.length; i++) add(trig[i], '');
          apps.sort(function (x, y) { return String(x.name || x.id).localeCompare(String(y.name || y.id)); });
          body.appendChild(el('div', 'note tkh', N.t('tkApps')));
          if (!apps.length) body.appendChild(el('div', 'note', N.t('tkNoApps')));
          apps.forEach(function (app) {
            body.appendChild(trow(app.name || app.id, app.name ? app.id : '', trig.indexOf(app.id) >= 0, function (on) {
              var t = (cfg.triggers || []).filter(function (x) { return x !== app.id; }); if (on) t.push(app.id); cfg.triggers = t; trig = t; push({ triggers: t });
            }));
          });
          body.appendChild(el('div', 'note', N.t('tkHelp')));
          if (keep >= 0) { var fs = body.querySelectorAll('.f'); if (fs[keep]) N.nav.focus(fs[keep], true); }
        }
        function push(c) { tk.setConfig(c, function (err, s) { if (dead) return; if (err) { status(N.t('tkErr') + (err.message ? ': ' + err.message : ''), true); return; } if (s) paint(s); }); }
        function fail(err) { if (dead) return; body.innerHTML = ''; if (err && err.message === 'unsupported') status(N.t('tkUnsupported')); else status(N.t('tkErr') + (err && err.message ? ': ' + err.message : ''), true); }
        function load() { tk.state(function (err, s) { if (dead) return; if (err || !s) return tk.ensureService(function (e2) { if (e2) return fail(e2); tk.state(function (e3, s3) { if (e3 || !s3) fail(e3); else paint(s3); }); }); paint(s); }); }
        if (!tk) { status(N.t('tkUnsupported')); return; }
        load();
      },
      about: function (p) {
        p.appendChild(info('30nama TV', ''));
        p.appendChild(info(N.t('version'), N.config.version));
        p.appendChild(info(N.t('unofficial'), ''));
        p.appendChild(info(N.t('apiHost'), (N.api.host || '').replace(/^https?:\/\//, '').replace(/\/api.*$/, '')));
        p.appendChild(info(N.t('tmdb'), N.tmdb.mock() ? N.t('tmdbMock') : (N.tmdb.token() ? N.t('tmdbOn') : N.t('tmdbOff'))));
        if (N.tmdb.enabled()) p.appendChild(el('div', 'note', N.t('tmdbCredit')));
      },
      tmdb: tmdbPane
    };
    // TMDB credential entry. A v3 API Key is 32 hex chars, so a 16-key pad covers it; the long v4 token comes in through the IME or a paste.
    function tmdbPane(p) {
      var HEX = '0123456789abcdef', LEN = 32, buf = '', state = '', busy = false, gone = false;
      var st = info(N.t('status'), ''), stV = st.lastChild; p.appendChild(st);
      var strip = el('div', 'tkey latin'); p.appendChild(strip);
      var body = el('div', 'tk-body'), pad = el('div', 'tk-pad latin'); body.appendChild(pad); p.appendChild(body);
      function key(label, cls, fn) {
        var k = el('button', 'key f fl' + (cls ? ' ' + cls : ''));
        if (typeof label === 'string') k.textContent = label; else k.appendChild(label);
        k.onclick = fn; return k;
      }
      for (var r0 = 0; r0 < 2; r0++) {
        var row = el('div', 'row');
        HEX.slice(r0 * 8, r0 * 8 + 8).split('').forEach(function (c) { row.appendChild(key(c, '', function () { type(c); })); });
        pad.appendChild(row);
      }
      var fnRow = el('div', 'row fn'), kbdK = key(ui.icon('kbd'), 'fnk', openIme);
      kbdK.appendChild(el('span', '', N.t('tmdbKbd')));
      fnRow.appendChild(key('⌫', 'fnk', function () { edit(buf.slice(0, -1)); }));
      fnRow.appendChild(key(N.t('clearK'), 'fnk', function () { edit(''); }));
      fnRow.appendChild(kbdK); pad.appendChild(fnRow);
      var qr = el('div', 'tk-qr'), tile = el('div', 'tile');
      try { var q = qrcode(0, 'M'); q.addData('https://www.themoviedb.org/settings/api'); q.make(); tile.innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); } catch (e) {}
      qr.appendChild(tile); qr.appendChild(el('div', 'cap', N.t('tmdbScan'))); body.appendChild(qr);
      var acts = el('div', 'tk-acts'); p.appendChild(acts);
      p.appendChild(el('div', 'note', N.t('tmdbHelp')));
      var hid = el('input'); hid.type = 'text'; hid.setAttribute('autocomplete', 'off'); hid.setAttribute('spellcheck', 'false');
      hid.style.cssText = 'position:absolute;left:-2000px;top:0;width:10px;height:10px'; p.appendChild(hid);

      function clean(t) { return String(t || '').replace(/\s+/g, '').slice(0, 512); }
      function isHex(t) { return /^[0-9a-f]*$/i.test(t); }
      function paintStatus() {
        var tok = N.tmdb.token(), src = N.tmdb.source(), cls = '', txt;
        stV.innerHTML = '';
        if (state === 'checking') txt = N.t('tmdbChecking');
        else if (state === 'bad') { txt = N.t('tmdbBad'); cls = 'bad'; }
        else if (state === 'net') { txt = N.t('tmdbNet'); cls = 'bad'; }
        else if (state === 'empty') txt = N.t('tmdbEmpty');
        else if (src === 'mock') txt = N.t('tmdbMock');
        else if (src === 'bundled') { txt = N.t('tmdbBuiltIn'); cls = 'ok'; }
        else if (tok) { stV.appendChild(el('span', '', N.t('tmdbEnding'))); stV.appendChild(el('span', 'latin tail', tok.slice(-4))); cls = 'ok'; }
        else txt = N.t('tmdbOff');
        if (txt) stV.textContent = txt;
        stV.className = 'v' + (cls ? ' ' + cls : '');
      }
      // empty buffer shows the saved credential, masked except its tail
      function paintStrip() {
        var saved = !buf && N.tmdb.source() === 'stored', s = saved ? N.tmdb.token() : buf, long = s.length > LEN || !isHex(s);
        strip.innerHTML = ''; strip.className = 'tkey latin' + (long ? ' long' : '') + (saved ? ' saved' : '') + (state === 'bad' ? ' bad' : '');
        if (long) {
          var box = el('div', 'tk-long');
          box.appendChild(el('span', 'tx', saved ? '••••••••••…' + s.slice(-6) : s.slice(0, 14) + '…' + s.slice(-8)));
          box.appendChild(el('span', 'n', s.length + ' ' + N.t('tmdbChars')));
          strip.appendChild(box); return;
        }
        for (var g = 0; g < 4; g++) {
          var grp = el('div', 'tk-g');
          for (var i = 0; i < 8; i++) {
            var idx = g * 8 + i, c = s.charAt(idx), cls = 'tk-c';
            if (c) cls += saved && idx < LEN - 4 ? ' dot' : ' on'; else if (idx === s.length && !saved) cls += ' next';
            grp.appendChild(el('span', cls, c ? (saved && idx < LEN - 4 ? '•' : c) : ''));
          }
          strip.appendChild(grp);
        }
      }
      function paintActs() {
        var keep = N.nav.cur && acts.contains(N.nav.cur) ? N.nav.cur.getAttribute('data-a') : null;
        acts.innerHTML = '';
        var bs = [ui.btn(N.t('tmdbConnect'), connect, 'primary', 'check')]; bs[0].setAttribute('data-a', 'connect');
        if (N.tmdb.source() === 'stored') { var rm = ui.btn(N.t('tmdbRemove'), removeKey, 'danger'); rm.setAttribute('data-a', 'remove'); bs.push(rm); }
        if (N.tmdb.enabled()) { var cc = ui.btn(N.t('clearCache'), function () { N.tmdb.clearCache(); N.toast(N.t('cleared')); }); cc.setAttribute('data-a', 'cache'); bs.push(cc); }
        bs.forEach(function (b) { acts.appendChild(b); });
        if (keep) N.nav.focus(acts.querySelector('[data-a="' + keep + '"]') || bs[0], true);
      }
      function paint() { paintStatus(); paintStrip(); }
      function edit(v) { buf = v; if (state && state !== 'checking') state = ''; paint(); }
      function type(c) {
        var b = (buf.length > LEN || !isHex(buf)) ? '' : buf;
        if (b.length >= LEN) return;
        edit(b + c);
        if (buf.length === LEN) N.nav.focus(acts.firstChild, true);
      }
      function openIme() { hid.value = buf; N.nav.focus(hid); }
      hid.oninput = function () { edit(clean(hid.value)); };
      hid.onenter = function () { hid.blur(); N.nav.focus(kbdK, true); if (buf) connect(); };
      hid.onback = function () { hid.blur(); N.nav.focus(kbdK, true); return true; };
      function connect() {
        if (busy) return;
        var t = clean(buf);
        if (N.tmdb.isKey(t)) t = t.toLowerCase();
        if (!t) { state = 'empty'; paint(); N.nav.focus(pad.querySelector('.key'), true); return; }
        busy = true; state = 'checking'; paint();
        N.tmdb.verify(t).then(function (ok) {
          busy = false; if (gone) return;
          if (!ok) { state = 'bad'; paint(); return; }
          N.tmdb.setToken(t); N.dropHome(); buf = ''; state = ''; paint(); paintActs(); N.toast(N.t('tmdbSaved'));
        }, function () { busy = false; if (gone) return; state = 'net'; paint(); });
      }
      function removeKey() {
        N.confirm({ title: N.t('tmdbRemoveTitle'), body: N.t('tmdbRemoveBody'), ok: N.t('tmdbRemove'), danger: true, onOk: function () {
          N.tmdb.setToken(''); N.dropHome(); buf = ''; state = ''; paint(); paintActs(); N.toast(N.t('tmdbRemoved'));
          if (!gone) N.nav.focus(acts.firstChild, true);
        } });
      }
      // hardware input: remote number keys, USB/desktop keyboards, and paste on desktop
      function onKey(e) {
        if (document.activeElement === hid || e.ctrlKey || e.altKey || e.metaKey || N.player.open || document.querySelector('.modal')) return false;
        if (e.keyCode === N.keys.BACKSPACE && buf) { edit(buf.slice(0, -1)); return true; }
        var c = e.keyCode >= 48 && e.keyCode <= 57 ? String(e.keyCode - 48) : (e.key && e.key.length === 1 ? e.key.toLowerCase() : '');
        if (c && HEX.indexOf(c) >= 0) { type(c); return true; }
        return false;
      }
      function onPaste(e) {
        if (document.activeElement === hid) return;
        var t = clean(e.clipboardData && e.clipboardData.getData('text'));
        if (t) { edit(t); N.nav.focus(acts.firstChild, true); }
      }
      N.nav.pushHandler(onKey); document.addEventListener('paste', onPaste);
      paint(); paintActs();
      return function () { gone = true; N.nav.popHandler(onKey); document.removeEventListener('paste', onPaste); };
    }
    function paintPane(s) {
      if (paneOff) { paneOff(); paneOff = null; }
      pane.innerHTML = ''; paneOff = builders[s](pane) || null; pane.classList.remove('sw');
    }
    function showPane(s, now) {
      if (s === sec && pane.firstChild) return; sec = s;
      for (var k in rows) rows[k].classList.toggle('cur', k === s);
      clearTimeout(swT);
      if (now) paintPane(s); else { pane.classList.add('sw'); swT = setTimeout(function () { if (!dead) paintPane(s); }, 120); }
    }
    secs.forEach(function (s) {
      var r = el('button', 'srow f fl' + (s === sec ? ' cur' : ''), N.t(s)); rows[s] = r;
      r.onfocus2 = function () { showPane(s); };
      r.onnav = function (dir) { if (dir === 'right' || dir === 'left') { if (ui.step(dir) > 0) { if (swT) { clearTimeout(swT); swT = null; paintPane(sec); } var f = pane.querySelector('.f'); return f || true; } return false; } return false; };
      list.appendChild(r);
    });
    showPane(sec, true);
    var restoreIdx = restore && restore.idx;
    if (restoreIdx !== undefined && restoreIdx !== null && pane.children[restoreIdx] && pane.children[restoreIdx].classList.contains('f')) N.nav.focus(pane.children[restoreIdx], true);
    else N.nav.focus(rows[sec], true);
    return {
      destroy: function () { dead = true; clearTimeout(swT); if (paneOff) { paneOff(); paneOff = null; } },
      back: function () {
        if (N.nav.cur && N.nav.cur.onback && N.nav.cur.onback()) return true;
        if (N.nav.cur && pane.contains(N.nav.cur)) { N.nav.focus(rows[sec], true); return true; }
        return false;
      },
      focusState: function () {
        var idx = null; if (N.nav.cur && pane.contains(N.nav.cur)) for (var i = 0; i < pane.children.length; i++) if (pane.children[i] === N.nav.cur) idx = i;
        return { sec: sec, idx: idx };
      }
    };
  };
})();
