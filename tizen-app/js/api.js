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
          try { return JSON.parse(txt); }
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
  function schedule(bg, run) { return new Promise(function (res, rej) { (bg ? Q.bg : Q.core).push({ run: run, res: res, rej: rej }); pump(); }); }
  api.sched = function (name, params, opts) {
    var bg = !!(opts && opts.bg), tries = (opts && opts.noRetry) || NO_RETRY[name] ? 0 : BACKOFF.length;
    function attempt(n) {
      return schedule(bg, function () { return api.rawCall(name, params); }).catch(function (e) {
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
      api.host = r.host; api.key = r.key; api.keyIndex = r.ki; N.store.set('host', r.host);
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
  lib.toggle = function (group, id) {
    return lib.ready().then(function () {
      if (!lib.data[group]) lib.data[group] = {};
      var key = String(id), was = !!lib.data[group][key];
      if (was) delete lib.data[group][key]; else lib.data[group][key] = true;
      return api.get('user_list', { action: 'add', group: group, post_id: id }, { noRetry: true }).then(function () {
        return !was;
      }).catch(function (e) {
        if (was) lib.data[group][key] = true; else delete lib.data[group][key];
        throw e;
      });
    });
  };
  lib.list = function (group, page) {
    return api.get('user_list', { action: 'list', group: group, page: page || 1, orderby: 'add_list', order: 'DESC' });
  };

  /* Watch progress. The backend sometimes drops observer reports, so stream.continue_watching can point at an older episode.
     wpLocal = what we last reported per post, wpServer = what the server last returned; both carry `at`, the time that value
     last changed (for the server: when we first saw it). Details resumes from whichever is newer. */
  var wp = N.wp = {}, WP_MAX = 100;
  function wpRec(c, at) { return { file_id: String(c.file_id), time: Number(c.time) || 0, duration: Number(c.duration) || 0, at: at }; }
  function wpSame(a, b) { return !!(a && b) && String(a.file_id) === String(b.file_id) && Math.floor(Number(a.time) || 0) === Math.floor(Number(b.time) || 0); }
  function wpPut(key, postId, rec) {
    var m = N.store.get(key, {}), ids = Object.keys(m);
    m[String(postId)] = rec;
    if (ids.length >= WP_MAX) {
      ids.sort(function (a, b) { return (m[a].at || 0) - (m[b].at || 0); });
      for (var i = 0; i <= ids.length - WP_MAX; i++) if (ids[i] !== String(postId)) delete m[ids[i]];
    }
    N.store.set(key, m);
  }
  wp.observe = function (postId, c) {
    if (!postId || !c || !c.file_id) return;
    var cur = wpRec(c, Date.now()), prev = N.store.get('wpServer', {})[String(postId)];
    if (wpSame(prev, cur)) return;
    // a first sighting has no known time: it must not win (or rank in Continue Watching) just for being new to us.
    // Where it agrees with our own report the two are the same value anyway.
    if (!prev) cur.at = 0;
    wpPut('wpServer', postId, cur);
  };
  // compact copy of a post, enough for a Continue Watching card + billboard when the server's list lacks it
  var wpPostSaved = {};
  function wpSavePost(post) {
    if (!post || !post.id || wpPostSaved[post.id]) return;
    wpPostSaved[post.id] = 1;
    var m = N.store.get('wpPosts', {}), loc = N.store.get('wpLocal', {}), po = post.options || {};
    m[String(post.id)] = { id: post.id, title: post.title, plot: post.plot, image: post.image, score: post.score, info: post.info, genre: post.genre, options: { is_series: po.is_series } };
    Object.keys(m).forEach(function (k) { if (k !== String(post.id) && !loc[k]) delete m[k]; });
    N.store.set('wpPosts', m);
  }
  // record the server's current value first, so the local record written after it is always the newer one.
  // `info` (season/episode) and `post` are only kept locally, never sent with the report.
  wp.sync = function (p, info, post) {
    return timeout(api.call('stream', { post_id: p.post_id, free_stream: 0 }, { noRetry: true }), 5000, 'stream').then(function (j) {
      if (j && j.success && j.result) wp.observe(p.post_id, j.result.continue_watching);
    }).catch(function () {}).then(function () {
      var rec = wpRec(p, Date.now());
      if (info && info.season) rec.season = info.season;
      if (info && info.episode) rec.episode = info.episode;
      wpPut('wpLocal', p.post_id, rec);
      wpSavePost(post);
    });
  };
  wp.pick = function (postId, c) {
    wp.observe(postId, c);
    var loc = N.store.get('wpLocal', {})[String(postId)], srv = N.store.get('wpServer', {})[String(postId)];
    var r = loc && (!srv || loc.at >= srv.at) ? loc : srv;
    return r ? { file_id: r.file_id, time: r.time, duration: r.duration } : null;
  };
  /* Home's Continue Watching: apply our newer local progress to the server's list. Entries where the local record wins
     and disagrees with the server move up by the time we watched them (the server's order is kept among the rest);
     recent local watches the server has never shown us are added from the saved post copy. A post the server did
     show us before and now leaves out was removed or finished there, so it stays out.
     Returns { posts, raw } with raw[i] describing posts[i]. */
  var WP_ADD_MS = 14 * 864e5;
  wp.cw = function (posts, raw) {
    var loc = N.store.get('wpLocal', {}), now = Date.now(), seen = {}, front = [], rest = [];
    posts.forEach(function (p, i) {
      var r0 = raw[i] || p, c = r0.continue_watching || r0, id = String(p.id);
      seen[id] = 1;
      if (c && c.file_id) wp.observe(id, c);
      var l = loc[id], srv = N.store.get('wpServer', {})[id];
      if (l && (!srv || l.at >= srv.at) && !(c && c.file_id && wpSame(l, c))) {
        var m = { file_id: l.file_id, time: l.time, duration: l.duration, season: l.season, episode: l.episode };
        if (!m.season && c && String(c.file_id) === l.file_id) { m.season = c.season || (c.info && c.info.season); m.episode = c.episode || (c.info && c.info.episode); }
        front.push({ p: p, r: { continue_watching: m }, at: l.at });
      } else rest.push({ p: p, r: r0, at: (srv && srv.at) || 0 });
    });
    var saved = N.store.get('wpPosts', {});
    Object.keys(loc).forEach(function (id) {
      var l = loc[id], srv = N.store.get('wpServer', {})[id];
      if (seen[id] || srv || !saved[id] || now - (l.at || 0) > WP_ADD_MS) return;
      if (l.duration && l.time / l.duration >= 0.95) return; // finished: the server drops those too
      front.push({ p: saved[id], r: { continue_watching: l }, at: l.at });
    });
    front.sort(function (a, b) { return b.at - a.at; });
    var all = [], fi = 0, ri = 0;
    while (fi < front.length || ri < rest.length) {
      if (ri >= rest.length || (fi < front.length && front[fi].at >= rest[ri].at)) all.push(front[fi++]); else all.push(rest[ri++]);
    }
    return { posts: all.map(function (x) { return x.p; }), raw: all.map(function (x) { return x.r; }) };
  };
  wp.clear = function () { N.store.del('wpLocal'); N.store.del('wpServer'); N.store.del('wpPosts'); wpPostSaved = {}; };
  N.setSession = function (user) {
    N.session = { token: user.user_session, user: user };
    N.store.set('session', N.session);
  };
  N.logout = function (silent) {
    var p = N.isLoggedIn() ? api.call('logout', {}).catch(function () {}) : Promise.resolve();
    N.session = null; N.store.del('session'); lib.clear(); wp.clear();
    if (!silent && N.onLogout) N.onLogout();
    return p;
  };

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
