/* Smart Hub Preview: the rows the TV shows above the 30nama tile on its home bar (.wgt installs only, not TizenBrew).
   Signed in: Continue watching (the 2 most recent series), Popular movies now, New releases. Guest: the last two.
   The app builds the preview JSON and hands it to service/preview.js, which calls webapis.preview.setPreviewData.
   A tile click relaunches (or resumes) the app with the tile's action_data in a PAYLOAD app control; route() opens it.
   Samsung asks for at least 10 minutes between setPreviewData calls, so changes inside that window wait (see want()). */
(function () {
  var PKG = 'Nama30TvAp', SVC = 'PreviewService';
  var GAP = 10 * 60 * 1000, MAX = 10, CW_MAX = 2, MIN_POP = 5, DONE = 0.95, POP_WAIT = 20000;
  var pv = N.preview = { last: null };
  var pending = null, pendT = null, gen = 0, handled = { k: '', t: 0 };

  function supported() {
    var p = location.pathname || '';
    return !!(window.tizen && tizen.application) && p.indexOf('/module/') !== 0 && String(location.port) !== '8081';
  }
  function packageId() {
    try { return tizen.application.getCurrentApplication().appInfo.packageId || PKG; } catch (e) { return PKG; }
  }

  /* ---------- tiles ---------- */
  // Smart Hub decodes JPG and PNG only; the webp variants the UI prefers are skipped
  function okImg(u) { return u && !/\.webp([?#]|$)/i.test(u) ? u : ''; }
  function isSeries(p) { return !!(p && p.options && p.options.is_series); }
  function tile(p, img, ratio, act, sub, play) {
    var t = { title: N.title(p), image_url: img, image_ratio: ratio, action_data: JSON.stringify(act), is_playable: !!play };
    if (sub) t.subtitle = sub;
    return t;
  }
  function posterTile(p) {
    var u = okImg(N.img(p, 'medium'));
    return u ? tile(p, u, '2by3', { a: 'details', id: p.id }) : null;
  }
  // same fields the Home row reads in cwNorm
  function cwTile(x) {
    var p = x && x.post ? x.post : x, c = (x && x.continue_watching) || x || {};
    if (!p || !p.id || !isSeries(p)) return null;
    var t = Number(c.time || c.position || 0), d = Number(c.duration || 0);
    var s = c.season || (c.info && c.info.season), e = c.episode || (c.info && c.info.episode);
    var done = d > 0 && t / d >= DONE, sub;
    if (done) sub = N.t('nextEpisode');
    else {
      var parts = [];
      if (s && e) parts.push('S' + s + ' · E' + N.ui.epLabel(e));
      if (d && t) parts.push(Math.max(1, Math.round((d - t) / 60)) + ' ' + N.t('minLeft'));
      sub = parts.join(' · ');
    }
    var act = { a: 'play', id: p.id }; if (done) act.next = 1;
    var cov = okImg(N.cover(p));
    if (cov) return tile(p, cov, '16by9', act, sub, true);
    var po = okImg(N.img(p, 'medium'));
    return po ? tile(p, po, '2by3', act, sub, true) : null;
  }
  function cwItems(raw) {
    if (!raw) return [];
    return raw.posts || raw.items || raw.list || (raw instanceof Array ? raw : []);
  }

  /* ---------- sources ---------- */
  function posts(h, k) { return (h && h[k] && h[k].posts) || []; }
  // the Home "Popular movies now" row (TMDB now playing + trending today, matched to 30nama), in TMDB order
  function tmdbPop() {
    if (!N.tmdb.enabled()) return Promise.resolve([]);
    return new Promise(function (res) {
      var f = N.tmdb.feed('pop'), fin = false, tm = null;
      function end() {
        if (fin) return; fin = true; clearTimeout(tm); f.unsubscribe(cb);
        res(f.items.slice().sort(function (a, b) { return a.i - b.i; }).map(function (it) { return it.post; }));
      }
      function cb() { if (f.done) end(); }
      tm = setTimeout(end, POP_WAIT); f.subscribe(cb);
    });
  }
  // without TMDB (or too few matches): 30nama's Top 10 minus series, topped up from its Movies list
  function popular(h) {
    return tmdbPop().then(function (ps) {
      ps = ps.filter(function (p) { return !isSeries(p); });
      if (ps.length >= MIN_POP) return ps;
      var out = [], seen = {};
      function add(p) { if (p && p.id && !seen[p.id] && !isSeries(p)) { seen[p.id] = 1; out.push(p); } }
      posts(h, 'top_10').forEach(add);
      if (out.length < MIN_POP) posts(h, 'movies').forEach(add);
      return out;
    });
  }

  // the guest home_stream has no new_releases: fall back to the latest Movies and Series, interleaved
  function newReleases(h) {
    var n = posts(h, 'new_releases');
    if (n.length) return n;
    var m = posts(h, 'movies'), s = posts(h, 'series'), out = [];
    for (var i = 0; i < Math.max(m.length, s.length); i++) { if (m[i]) out.push(m[i]); if (s[i]) out.push(s[i]); }
    return out;
  }

  /* ---------- build ---------- */
  // h: home_stream result; cwRaw: continue_watching result (ignored for guests). Resolves with the preview object, or null when empty.
  pv.build = function (h, cwRaw) {
    var seen = {}, secs = [];
    function pick(list, fn, max) {
      var out = [];
      for (var i = 0; i < list.length && out.length < max; i++) {
        var p = list[i] && list[i].post ? list[i].post : list[i];
        if (!p || !p.id || seen[p.id]) continue;
        var t = fn(list[i]); if (t) { seen[p.id] = 1; out.push(t); }
      }
      return out;
    }
    function add(title, tiles) { if (tiles.length) secs.push({ title: title, tiles: tiles }); }
    if (N.isLoggedIn()) add(N.t('continueWatching'), pick(cwItems(cwRaw), cwTile, CW_MAX));
    return popular(h).then(function (pop) {
      add(N.t('popularMovies'), pick(pop, posterTile, MAX));
      add(N.t('new_releases'), pick(newReleases(h), posterTile, MAX));
      return secs.length ? { sections: secs } : null;
    });
  };

  /* ---------- send ---------- */
  function note(ok, msg) { N.store.set('pvStatus', { t: Date.now(), ok: ok, msg: msg }); }
  function send(json) {
    if (!supported()) return;
    N.store.set('pvAt', Date.now());
    try {
      tizen.application.launchAppControl(
        new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/pick', null, null, null, [
          new tizen.ApplicationControlData('caller', ['ForegroundApp']),
          new tizen.ApplicationControlData('preview', [json])
        ]),
        packageId() + '.' + SVC,
        function () {},
        function (e) { note(false, 'launch: ' + (e && e.message)); },
        {
          onsuccess: function (data) {
            var st = '';
            for (var i = 0; i < (data || []).length; i++) if (data[i].key === 'status') st = String(data[i].value[0] || '');
            if (st === 'ok') { N.store.set('pvSent', json); note(true, 'ok'); } else note(false, st || 'no status');
          },
          onfailure: function () { note(false, 'service reply failed'); }
        });
    } catch (e) { note(false, 'launch threw: ' + (e && e.message)); }
  }
  function flush() { clearTimeout(pendT); pendT = null; if (!pending) return; var j = pending; pending = null; send(j); }
  // force: send now even inside the 10-minute window (sign-out must not leave the history on the TV's home screen)
  function want(json, force) {
    clearTimeout(pendT); pendT = null;
    if (json === N.store.get('pvSent', '')) { pending = null; return; } // already on the TV (or back to it)
    pending = json;
    var wait = force ? 0 : N.store.get('pvAt', 0) + GAP - Date.now();
    if (wait > 0) pendT = setTimeout(flush, wait); else flush();
  }
  pv.flush = flush;

  function update(h, cwRaw, force) {
    var g = ++gen;
    return pv.build(h, cwRaw).then(function (obj) {
      if (g !== gen || !obj) return;
      var json = JSON.stringify(obj);
      pv.last = obj;
      if (supported()) want(json, force);
    }).catch(function (e) { try { console.warn('preview', e && e.message); } catch (x) {} });
  }
  // Home already has both payloads
  pv.fromHome = function (h, cwRaw) { return update(h, cwRaw, false); };
  // after playback or sign-out: fetch fresh data
  pv.refresh = function (force) {
    var cw = N.isLoggedIn() ? N.api.get('continue_watching', {}, { bg: true }).catch(function () { return null; }) : Promise.resolve(null);
    return Promise.all([N.getHome(), cw]).then(function (r) { return update(r[0], r[1], force); }).catch(function () {});
  };

  /* ---------- tile clicks ---------- */
  // PAYLOAD value[0] is '{"values":"<action_data>"}'; action_data is itself a JSON string
  function readPayload() {
    try {
      var r = tizen.application.getCurrentApplication().getRequestedAppControl();
      var d = (r && r.appControl && r.appControl.data) || [];
      for (var i = 0; i < d.length; i++) {
        if (d[i].key !== 'PAYLOAD') continue;
        var v = JSON.parse(d[i].value[0]).values;
        return typeof v === 'string' ? JSON.parse(v) : v;
      }
    } catch (e) {}
    return null;
  }
  pv.route = function (a) {
    if (!a || !a.id) return false;
    var k = JSON.stringify(a);
    if (handled.k === k && Date.now() - handled.t < 3000) return true; // launch + appcontrol event for the same click
    handled = { k: k, t: Date.now() };
    if (N.player.open) N.player.close();
    if (N.closeModal) N.closeModal();
    N.go('details', { id: a.id, autoplay: a.a === 'play' ? 1 : 0, next: a.next ? 1 : 0 });
    N.splashReady();
    return true;
  };
  // called by boot once Home/login is on the stack; true when a tile click took over
  pv.onBoot = function () { return supported() ? pv.route(readPayload()) : false; };

  if (supported()) {
    window.addEventListener('appcontrol', function () { if (N.booted) pv.route(readPayload()); });
    // a change still waiting out the 10-minute window goes out when the app leaves the screen
    document.addEventListener('visibilitychange', function () { if (document.hidden) flush(); });
  }
})();
