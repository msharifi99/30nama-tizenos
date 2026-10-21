/* API layer: endpoint discovery, RPC calls, session. */
(function () {
  var C = N.config;
  var api = N.api = { host: null, key: C.apiKeys[0], keyIndex: 0 };
  N.session = N.store.get('session', null); // {token, user}

  function timeout(p, ms, label) {
    return new Promise(function (res, rej) {
      var t = setTimeout(function () { rej(new Error('timeout ' + (label || ''))); }, ms);
      p.then(function (v) { clearTimeout(t); res(v); }, function (e) { clearTimeout(t); rej(e); });
    });
  }
  function enc(params) {
    var out = [];
    for (var k in params) if (params.hasOwnProperty(k) && params[k] !== undefined && params[k] !== null)
      out.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
    return out.join('&');
  }
  api.raw = function (host, key, name, params, token) {
    // dev/test hook: tools-video/eps-test.js injects window.__mock = {action: fn(params) -> envelope}
    if (window.__mock && window.__mock[name]) return Promise.resolve(window.__mock[name](params || {}));
    var headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'c-api-key': key,
      'c-token': token || '',
      'c-version-number': C.version,
      'c-language': N.lang
    };
    return timeout(fetch(N.proxied(host + '/action/' + name), { method: 'POST', headers: headers, body: enc(params || {}) }), 20000, name)
      .then(function (r) {
        var ra = parseFloat(r.headers && r.headers.get && r.headers.get('retry-after'));
        return r.text().then(function (txt) {
          try { var j = JSON.parse(txt); api.lastOk = Date.now(); return j; }
          catch (e) { var er = new Error((r.status === 429 ? '429 ' : r.status >= 500 ? '5xx ' : '') + 'bad json from ' + name); er.retry = true; er.retryAfter = isNaN(ra) ? 0 : Math.min(ra, 10) * 1000; throw er; }
        });
      }, function (e) { e.retry = true; throw e; });
  };

  /* ---------- global request scheduler ----------
     30nama sits behind Cloudflare rate limiting (HTTP 429 / HTML "error code: 1015"). All 30nama calls go through one queue: max 2 in flight,
     small spacing, core screen calls before background (TMDB resolution) calls, and transient failures (non-JSON, 429, 5xx, timeout) are retried with backoff. */
  var Q = { core: [], bg: [] }, inflight = 0, MAXF = 2, GAPMS = 100, lastStart = 0, pausedUntil = 0, pumpT = null, BACKOFF = [1000, 3000];
  var NO_RETRY = { observer: 1, logout: 1, qrlogin_login: 1 };
  function pump() {
    if (pumpT || inflight >= MAXF || !(Q.core.length || Q.bg.length)) return;
    var now = Date.now(), wait = Math.max(pausedUntil - now, lastStart + GAPMS - now, 0);
    if (wait > 0) { pumpT = setTimeout(function () { pumpT = null; pump(); }, wait); return; }
    var j = Q.core.length ? Q.core.shift() : Q.bg.shift();
    inflight++; lastStart = now;
    j.run().then(function (v) { inflight--; j.res(v); pump(); }, function (e) { inflight--; j.rej(e); pump(); });
    pump();
  }
  // tag: lets a queued background job be promoted when a screen needs it (api.promote); front: jump the background line (a prefetch behind a pile of TMDB lookups would be useless)
  function schedule(bg, run, tag, front) {
    return new Promise(function (res, rej) {
      var q = bg ? Q.bg : Q.core, j = { run: run, res: res, rej: rej, tag: tag };
      if (front) q.unshift(j); else q.push(j);
      pump();
    });
  }
  api.promote = function (tag) {
    for (var i = 0; i < Q.bg.length; i++) if (Q.bg[i].tag === tag) { Q.core.push(Q.bg.splice(i, 1)[0]); break; }
    pump();
  };
  api.busy = function () { return inflight >= MAXF || Q.core.length > 0; };
  api.sched = function (name, params, opts) {
    var bg = !!(opts && opts.bg), tries = (opts && opts.noRetry) || NO_RETRY[name] ? 0 : BACKOFF.length;
    function attempt(n) {
      return schedule(bg, function () { return api.rawCall(name, params); }, opts && opts.tag, opts && opts.front).catch(function (e) {
        if (n < tries && e && e.retry) {
          var d = Math.max(BACKOFF[n], e.retryAfter || 0);
          pausedUntil = Math.max(pausedUntil, Date.now() + d);
          return new Promise(function (r) { setTimeout(r, d); }).then(function () { return attempt(n + 1); });
        }
        throw e;
      });
    }
    return attempt(0);
  };
  api.rawCall = function (name, params) { return api.raw(api.host, api.key, name, params, N.session ? N.session.token : ''); };

  // Try a discovery URL (CORS may block it in a browser; fall back to hardcoded hosts).
  function discover() {
    var tries = C.discoveryUrls.map(function (u) {
      return timeout(fetch(N.proxied(u + '?t=' + Date.now())).then(function (r) { return r.json(); }), 6000, 'discovery')
        .then(function (list) { if (!list || !list.length) throw new Error('empty'); return list; });
    });
    // first success wins
    return new Promise(function (res) {
      var left = tries.length, done = false;
      tries.forEach(function (p) {
        p.then(function (l) { if (!done) { done = true; res(l); } }, function () { if (--left === 0 && !done) res(C.fallbackHosts); });
      });
    });
  }

  // Probe `test` on all hosts with each key; choose the first that answers successfully.
  api.init = function () {
    return discover().then(function (list) {
      var seen = {}, hosts = [];
      list.concat(C.fallbackHosts).forEach(function (h) { if (!seen[h.host]) { seen[h.host] = 1; hosts.push(h.host); } });
      var cached = N.store.get('host', null);
      if (cached && !seen[cached]) hosts.unshift(cached);
      function tryKey(ki) {
        if (ki >= C.apiKeys.length) return Promise.reject(new Error('no endpoint reachable'));
        var key = C.apiKeys[ki];
        return new Promise(function (res, rej) {
          var left = hosts.length, done = false;
          hosts.forEach(function (h) {
            timeout(api.raw(h, key, 'test', {}), 8000, 'test').then(function (j) {
              if (j && j.success && !done) { done = true; res({ host: h, key: key, ki: ki }); }
              else if (--left === 0 && !done) rej(new Error('rejected'));
            }, function () { if (--left === 0 && !done) rej(new Error('unreachable')); });
          });
        }).catch(function () { return tryKey(ki + 1); });
      }
      return tryKey(0);
    }).then(function (r) {
      api.host = r.host; api.key = r.key; api.keyIndex = r.ki; N.store.set('host', r.host); N.store.set('hostKey', r.ki);
      return r;
    });
  };

  // Generic action. Resolves with envelope; rejects on network errors.
  api.call = function (name, params, opts) {
    return api.sched(name, params, opts).then(function (j) {
      if (j && !j.success && /login required/i.test(j.msg || '') && N.session) {
        // session invalid/expired
        N.logout(true);
      }
      return j;
    });
  };
  // Resolves with result or rejects with Error(msg)
  api.get = function (name, params, opts) {
    return api.call(name, params, opts).then(function (j) {
      if (!j || !j.success) { var e = new Error((j && j.msg) || 'error'); e.msg = j && j.msg; throw e; }
      return j.result;
    });
  };

  /* ---------- response cache ----------
     api.cached(name, params, o) -> Promise(result): api.get, remembered. Values are shared by reference: treat them as read-only.
       ttl      ms the entry is fresh (served with no request)
       swr      ms past ttl in which the stale value is still served at once, while a background refresh fills the cache for the next call
       sie      stale-if-error: max age (ms) of an entry returned when the request fails
       persist  also keep in localStorage (one bounded blob 'ac', newest entries win), so the next app start has it; slim(v): smaller copy to persist
       user     session-dependent: keyed by guest/logged-in and wiped on login/logout (api.dropUser)
       bg       low-priority queue; fresh: skip the cache read; onUpdate(v): called after a swr refresh when the data changed
     Concurrent calls for a key share one request; failures are never cached; the language is part of the key. */
  var cmem = {}, cin = {}, epoch = 0, cstore = null, flushT = null, MEMMAX = 160, PMAX = 60, PCHARS = 900000, PONE = 400000, PSINGLE = 25;
  function ckey(name, params, o) {
    var ks = [], k;
    for (k in params) if (params.hasOwnProperty(k) && params[k] !== undefined && params[k] !== null) ks.push(k);
    ks.sort();
    return name + '?' + ks.map(function (x) { return x + '=' + params[x]; }).join('&') + '|' + N.lang + (o.user ? (N.isLoggedIn() ? '|u' : '|g') : '');
  }
  function pload() {
    if (!cstore) {
      cstore = N.store.get('ac', null);
      if (!cstore || typeof cstore !== 'object' || cstore instanceof Array) cstore = {};
      N.store.del('homeCache'); // superseded
    }
    return cstore;
  }
  function pwrite(o) { try { localStorage.setItem('n30.ac', JSON.stringify(o)); return true; } catch (e) { return false; } }
  function pflush() {
    clearTimeout(flushT); flushT = null; if (!cstore) return;
    if (N.nav && N.nav.isFast && N.nav.isFast() && !pflush.now) { flushT = setTimeout(pflush, 1500); return; } // don't stringify ~900 KB while the user is scrolling
    // eviction order: home/menu pinned first, then the newest PSINGLE singles, then the rest, newest first; whatever fits the char budget stays
    var ks = Object.keys(cstore).sort(function (a, b) { return cstore[b].t - cstore[a].t; }), pin = [], one = [], rest = [], order, keep = {}, size = 0, n = 0, i;
    ks.forEach(function (k) { if (/^(home|menu)\?/.test(k)) pin.push(k); else if (k.indexOf('single?') === 0) { if (one.length < PSINGLE) one.push(k); } else rest.push(k); });
    order = pin.concat(one, rest);
    order.forEach(function (k) {
      var e = cstore[k], z = (e.n || 0) + k.length + 24;
      if (n < PMAX && size + z <= PCHARS) { keep[k] = e; size += z; n++; }
    });
    cstore = keep;
    order = order.filter(function (k) { return keep[k]; });
    for (i = 0; i < 4; i++) { // quota: drop the older half (pinned entries last) and retry; the last trim is attempted too
      if (pwrite(keep)) return;
      if (i < 3) {
        order.slice(Math.ceil(order.length / 2)).forEach(function (k) { delete keep[k]; });
        order = order.slice(0, Math.ceil(order.length / 2));
      }
    }
    cstore = {}; N.store.del('ac');
  }
  function psave() { if (!flushT) flushT = setTimeout(pflush, 2000); }
  try { document.addEventListener('visibilitychange', function () { if (document.hidden && flushT) pflush(); }); } catch (e) {}
  function cput(key, v, o, ep) {
    if (o.user && ep !== epoch) return; // the session changed while the request was in flight
    var e = { t: Date.now(), v: v, u: o.user ? 1 : 0 }, ks, k, old = null;
    if (cmem[key]) delete cmem[key];
    else { ks = Object.keys(cmem); if (ks.length >= MEMMAX) { for (k = 0; k < ks.length; k++) if (!old || cmem[ks[k]].t < cmem[old].t) old = ks[k]; delete cmem[old]; } }
    cmem[key] = e;
    if (o.persist) pput(key, e, o); else e.np = 1; // not persisted (a prefetch): written out once the entry is really used (cached)
  }
  function pput(key, e, o) {
    var pe = e, v = e.v;
    delete e.np;
    try { if (o.slim) pe = { t: e.t, u: e.u, v: o.slim(v) }; pe.n = JSON.stringify(pe.v).length; } catch (x) { pe.n = PONE + 1; }
    if (pe.n <= PONE) { pload()[key] = pe; psave(); }
  }
  function cget(key, o) {
    var e = cmem[key];
    if (!e && o.persist) { e = pload()[key]; if (e && e.t !== undefined) cmem[key] = e; else e = null; }
    return e || null;
  }
  function cload(key, name, params, o) {
    var f = cin[key];
    if (f) { if (!o.bg) api.promote(key); return f.p; }
    var ep = epoch;
    f = cin[key] = { u: !!o.user };
    f.p = api.get(name, params, { bg: !!o.bg, front: !!o.front, tag: key, noRetry: o.noRetry }).then(function (v) {
      if (cin[key] === f) delete cin[key];
      cput(key, v, o, ep); return v;
    }, function (e) { if (cin[key] === f) delete cin[key]; throw e; });
    return f.p;
  }
  api.cached = function (name, params, o) {
    o = o || {}; params = params || {};
    var key = ckey(name, params, o), old = cget(key, o), e = o.fresh ? null : old, ttl = o.ttl || 0;
    if (old && old.np && o.persist) pput(key, old, o);
    if (e) {
      var age = Date.now() - e.t;
      if (age < ttl) return Promise.resolve(e.v);
      if (age < ttl + (o.swr || 0)) { // stale but usable: answer now, refresh for the next call
        cload(key, name, params, { bg: true, user: o.user, persist: o.persist, slim: o.slim }).then(function (v) {
          if (o.onUpdate && JSON.stringify(v) !== JSON.stringify(e.v)) o.onUpdate(v);
        }, function () {});
        return Promise.resolve(e.v);
      }
    }
    return cload(key, name, params, o).catch(function (err) {
      if (old && Date.now() - old.t < (o.sie || 0)) return old.v;
      throw err;
    });
  };
  // true when an entry within ttl exists (nothing to fetch)
  api.fresh = function (name, params, o) {
    o = o || {}; var e = cget(ckey(name, params || {}, o), o);
    return !!e && Date.now() - e.t < (o.ttl || 0);
  };
  // forget cached entries of the given endpoint name(s)
  api.drop = function (names) {
    names = names instanceof Array ? names : [names];
    function hit(k) { return names.some(function (n) { return k.indexOf(n + '?') === 0; }); }
    var k, d = false;
    for (k in cmem) if (hit(k)) delete cmem[k];
    for (k in cin) if (hit(k)) delete cin[k];
    if (cstore) for (k in cstore) if (hit(k)) { delete cstore[k]; d = true; }
    if (d) psave();
  };
  // login/logout: forget everything that depends on who is signed in (results of requests still in flight are not stored either)
  api.dropUser = function () {
    epoch++; var k;
    for (k in cmem) if (cmem[k].u) delete cmem[k];
    for (k in cin) if (cin[k].u) delete cin[k];
    pload(); for (k in cstore) if (cstore[k].u) delete cstore[k];
    pflush.now = true; try { pflush(); } finally { pflush.now = false; } // at once: the old account's entries must not survive an app kill
  };
  api.clearCache = function () { cmem = {}; cstore = {}; N.store.del('ac'); };
  // rewrite cached results of one endpoint in place: fn(key, value) -> new value, or undefined to drop the entry
  api.patch = function (name, fn) {
    var done = [], k, e, nv;
    [cmem, pload()].forEach(function (m) {
      for (k in m) if (k.indexOf(name + '?') === 0) {
        e = m[k]; if (done.indexOf(e) >= 0) continue; // one object can sit in both maps
        nv = fn(k, e.v);
        if (nv === undefined) { delete cmem[k]; delete cstore[k]; continue; }
        done.push(e); e.v = nv; if (e.n) e.n = JSON.stringify(nv).length;
      }
    });
    psave();
  };

  N.isLoggedIn = function () { return !!(N.session && N.session.token); };
  var lib = N.lib = { data: null, promise: null };
  function emptyLibrary() { return { watchlist: {}, favorite: {} }; }
  function normalizeLibrary(raw) {
    var out = emptyLibrary();
    ['watchlist', 'favorite'].forEach(function (group) {
      var ids = raw && raw[group] && raw[group].post;
      if (!(ids instanceof Array)) return;
      ids.forEach(function (id) { out[group][String(id)] = true; });
    });
    return out;
  }
  lib.clear = function () { lib.data = null; lib.promise = null; };
  lib.ready = function () {
    if (!N.isLoggedIn()) return Promise.resolve(emptyLibrary());
    if (lib.data) return Promise.resolve(lib.data);
    if (!lib.promise) {
      lib.promise = api.get('user_mylist').then(function (raw) {
        lib.data = normalizeLibrary(raw); return lib.data;
      }).catch(function () {
        lib.data = emptyLibrary(); return lib.data;
      });
    }
    return lib.promise;
  };
  lib.has = function (group, id) { return !!(lib.data && lib.data[group] && lib.data[group][String(id)]); };
  // Optimistic: the flag flips (and onFlip(added) runs) before the request; a failure flips it back and rejects. post (optional) patches the cached My List pages.
  lib.toggle = function (group, id, post, onFlip) {
    return lib.ready().then(function () {
      if (!lib.data[group]) lib.data[group] = {};
      var key = String(id), was = !!lib.data[group][key];
      if (was) delete lib.data[group][key]; else lib.data[group][key] = true;
      listPatch(group, id, post, !was);
      if (onFlip) onFlip(!was);
      return api.get('user_list', { action: 'add', group: group, post_id: id }, { noRetry: true }).then(function () {
        return !was;
      }).catch(function (e) {
        if (was) lib.data[group][key] = true; else delete lib.data[group][key];
        api.drop('user_list');
        throw e;
      });
    });
  };
  // cached My List pages of the group: page 1 gets the post added/removed in place, later pages would shift so they are dropped (refetched when opened)
  function listPatch(group, id, post, added) {
    api.patch('user_list', function (k, v) {
      if (k.indexOf('group=' + group + '&') < 0) return v;
      if (k.indexOf('&page=1|') < 0) return undefined;
      var ps = (v && v.posts) || [], out = ps.filter(function (x) { return String((x.post || x).id) !== String(id); }), had = out.length < ps.length, nv = Object.assign({}, v);
      if (added) { if (!post) return undefined; out.unshift(post); if (!had && v.pages > 1) out.pop(); }
      nv.posts = out;
      if (v.total !== undefined) nv.total = Math.max(0, Number(v.total) + (added ? (had ? 0 : 1) : (had ? -1 : 0)));
      return nv;
    });
  }
  lib.listParams = function (group, page) { return { action: 'list', group: group, page: page || 1, orderby: 'add_list', order: 'DESC' }; };
  lib.list = function (group, page) { return api.cached('user_list', lib.listParams(group, page), { ttl: 300000, user: true }); };
  N.setSession = function (user) {
    var prev = N.session && N.session.token;
    N.session = { token: user.user_session, user: user };
    N.store.set('session', N.session);
    if (prev !== user.user_session) api.dropUser(); // the boot-time profile refresh keeps the same token: nothing to forget
  };
  N.logout = function (silent) {
    var p = N.isLoggedIn() ? api.call('logout', {}).catch(function () {}) : Promise.resolve();
    N.session = null; N.store.del('session'); lib.clear(); api.dropUser();
    if (!silent && N.onLogout) N.onLogout();
    return p;
  };

  /* ---------- endpoint cache policies (one place) ----------
     single/home/menu persist (instant cold start); lists live in memory; stream/continue_watching are short-lived and memory-only
     (stream URLs expire and may be bound to the client, and both carry the resume position). */
  var MIN = 60000, HR = 3600000;
  // Home payload is ~260 KB of full posts; the persisted copy keeps what cards, billboard and meta line use (plots cut)
  var KEEP = ['id', 'post_type', 'options', 'info', 'title', 'genre', 'image', 'score'];
  function slimPost(p) { var o = {}, t; KEEP.forEach(function (k) { o[k] = p[k]; }); t = p.plot; if (typeof t === 'string') o.plot = t.slice(0, 320); else if (t) { o.plot = {}; for (var k in t) o.plot[k] = typeof t[k] === 'string' ? t[k].slice(0, 320) : t[k]; } return o; }
  function slimHome(h) {
    var o = {}, k;
    for (k in h) o[k] = (h[k] && h[k].posts instanceof Array) ? Object.assign({}, h[k], { posts: h[k].posts.map(slimPost) }) : h[k];
    return o;
  }
  api.P = {
    home: { ttl: 90000, swr: 3 * HR, sie: 7 * 24 * HR, persist: true, user: true, slim: slimHome },
    single: { ttl: 10 * MIN, swr: 24 * HR, sie: 7 * 24 * HR, persist: true, user: true },
    menu: { ttl: 6 * HR, swr: 7 * 24 * HR, sie: 7 * 24 * HR, persist: true },
    list: { ttl: 5 * MIN, swr: HR, user: true },
    search: { ttl: 10 * MIN, user: true },
    stream: { ttl: 90000, user: true },
    cw: { ttl: 45000, user: true }
  };
  function mix(base, extra) { var o = {}, k; for (k in base) o[k] = base[k]; for (k in extra) o[k] = extra[k]; return o; }
  api.single = function (id, extra) { return api.cached('single', { post_id: id }, extra ? mix(api.P.single, extra) : api.P.single); };

  /* ---------- prefetch ----------
     A poster that rests under focus (~400 ms, not while the key repeats) gets its `single` and cover image warmed, so opening Details is instant.
     At most one prefetch runs at a time (the latest wait-listed one wins), only when the request queue is idle, never stream/download. */
  var pf = N.prefetch = { t: null, busy: false, next: null, last: 0, pause: 0 }, PF_GAP = 1500, PF_PAUSE = 60000;
  function warmImg(u) {
    if (!u) return;
    if (N.ui && N.ui.preload) { N.ui.preload(u); return; }
    var im = new Image(); im.src = u; if (im.decode) im.decode().catch(function () {});
  }
  function pfRun(p) {
    if (N.nav && N.nav.isFast && N.nav.isFast()) { pf.t = setTimeout(function () { pf.t = null; pfRun(p); }, 300); return; }
    if (pf.busy) { pf.next = p; return; }
    warmImg(N.ui && N.ui.coverUrl(p));
    if (api.fresh('single', { post_id: p.id }, api.P.single) || api.busy() || !api.host) return;
    var now = Date.now(), wait = Math.max(pf.pause - now, pf.last + PF_GAP - now); // spaced out; paused after a failure (rate limit / server trouble)
    if (wait > 0) { pf.t = setTimeout(function () { pf.t = null; pfRun(p); }, wait); return; }
    pf.busy = true; pf.last = now;
    function done(bad) { pf.busy = false; pf.last = Date.now(); if (bad) pf.pause = pf.last + PF_PAUSE; var n = pf.next; pf.next = null; if (n) pfRun(n); }
    api.single(p.id, { bg: true, front: true, noRetry: true, persist: false }).then(function (post) { warmImg(N.ui && N.ui.coverUrl(post)); done(); }, function () { done(true); });
  }
  pf.focus = function (p) {
    clearTimeout(pf.t); pf.t = null; pf.next = null;
    if (p && p.id) pf.t = setTimeout(function () { pf.t = null; pfRun(p); }, 400);
  };
  pf.cancel = function () { clearTimeout(pf.t); pf.t = null; pf.next = null; };

  // helpers over post objects
  N.img = function (p, size) {
    var po = p && p.image && p.image.poster;
    if (!po) return '';
    return (po.jpg && (po.jpg[size || 'medium'] || po.jpg.large)) || (po.webp && po.webp.medium) || '';
  };
  N.cover = function (p) { var c = p && p.image && p.image.cover; return c ? (c.jpg || c.webp || '') : ''; };
  N.title = function (p) {
    var t = p.title || {};
    return (N.lang === 'fa' && t.local) ? t.local : (t.english || t.local || '');
  };
  N.plot = function (p) { var t = p.plot || {}; return (N.lang === 'fa' && t.local) ? t.local : (t.english || t.local || ''); };
})();
