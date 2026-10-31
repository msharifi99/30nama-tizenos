/* TMDB enrichment (optional). Every entry point is a no-op unless N.tmdb.enabled():
   a v4 read-access token in N.config.tmdbToken (or localStorage 'tmdbToken'), or localStorage 'tmdbMock'=1 (fixtures).
   Caches: in-memory LRU + localStorage ('n30.tc.*') with TTLs. */
(function () {
  var T = N.tmdb = {};
  var API = 'https://api.themoviedb.org/3', IMG = 'https://image.tmdb.org/t/p/';
  var HR = 3600 * 1000;
  var TTL = { details: 168 * HR, trend: 6 * HR, match: 168 * HR, miss: 24 * HR, res: 168 * HR, season: 24 * HR };
  var PFX = 'tc.';

  function lsRaw(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  T.token = function () { return String(lsRaw('tmdbToken') || N.config.tmdbToken || '').replace(/^\s+|\s+$/g, ''); };
  // v3 "API Key" (32 hex, sent as ?api_key=) or v4 "Read Access Token" (JWT, sent as Bearer)
  T.isKey = function (t) { return /^[0-9a-f]{32}$/i.test(t || ''); };
  T.source = function () { return T.mock() ? 'mock' : lsRaw('tmdbToken') ? 'stored' : N.config.tmdbToken ? 'bundled' : ''; };
  T.setToken = function (t) { try { if (t) localStorage.setItem('tmdbToken', t); else localStorage.removeItem('tmdbToken'); } catch (e) {} };
  T.mock = function () { return lsRaw('tmdbMock') === '1'; };
  T.enabled = function () { return T.mock() || !!T.token(); };
  T.img = function (path, size) { return path ? IMG + (size || 'w500') + path : ''; };

  /* ---------- cache ---------- */
  var mem = {}, memKeys = [], MEMMAX = 160;
  function touch(k) { var i = memKeys.indexOf(k); if (i >= 0) memKeys.splice(i, 1); memKeys.push(k); }
  function memPut(k, e) { mem[k] = e; touch(k); while (memKeys.length > MEMMAX) delete mem[memKeys.shift()]; }
  // ttl: ms or function(entry) -> ms. Returns the entry {t, v} or null.
  function cget(key, ttl) {
    var e = mem[key];
    if (!e) { e = N.store.get(PFX + key, null); if (e && e.t !== undefined) memPut(key, e); else e = null; }
    if (!e) return null;
    var life = typeof ttl === 'function' ? ttl(e) : ttl;
    if (Date.now() - e.t > life) return null;
    touch(key); return e;
  }
  function prune() {
    var list = [], i, k;
    try {
      for (i = 0; i < localStorage.length; i++) {
        k = localStorage.key(i);
        if (k && k.indexOf('n30.' + PFX) === 0) { var t = 0; try { t = JSON.parse(localStorage.getItem(k)).t || 0; } catch (e) {} list.push({ k: k, t: t }); }
      }
      list.sort(function (a, b) { return a.t - b.t; });
      for (i = 0; i < Math.ceil(list.length * 0.4); i++) localStorage.removeItem(list[i].k);
    } catch (e) {}
  }
  function cput(key, v) {
    var e = { t: Date.now(), v: v }; memPut(key, e);
    var s = JSON.stringify(e);
    try { localStorage.setItem('n30.' + PFX + key, s); } catch (x) { prune(); try { localStorage.setItem('n30.' + PFX + key, s); } catch (y) {} }
  }
  T.clearCache = function () {
    mem = {}; memKeys = [];
    try {
      var del = [];
      for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf('n30.' + PFX) === 0) del.push(k); }
      del.forEach(function (k) { localStorage.removeItem(k); });
      return del.length;
    } catch (e) { return 0; }
  };

  /* ---------- http ---------- */
  function timeout(p, ms) {
    return new Promise(function (res, rej) {
      var t = setTimeout(function () { rej(new Error('tmdb timeout')); }, ms);
      p.then(function (v) { clearTimeout(t); res(v); }, function (e) { clearTimeout(t); rej(e); });
    });
  }
  function qs(params) {
    var out = [], ks = Object.keys(params || {}).sort();
    ks.forEach(function (k) { if (params[k] !== undefined && params[k] !== null) out.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k])); });
    return out.join('&');
  }
  function mockFile(path) {
    var m;
    if (/^\/trending\//.test(path)) return 'trending';
    if (/^\/tv\/on_the_air/.test(path) || /^\/discover\/tv/.test(path)) return 'on_the_air';
    if (/^\/movie\/now_playing/.test(path)) return 'now_playing';
    if ((m = /^\/search\/(movie|tv)/.exec(path))) return 'search_' + m[1];
    if (/^\/find\//.test(path)) return 'find';
    if (/^\/(movie|tv)\/\d+\/images/.test(path)) return 'images';
    if (/^\/tv\/\d+\/season\//.test(path)) return 'empty';
    if ((m = /^\/(movie|tv)\/\d+/.exec(path))) return 'details_' + m[1];
    return 'empty';
  }
  function rq(path, params) {
    if (T.mock()) {
      return timeout(fetch('tools/fixtures/' + mockFile(path) + '.json').then(function (r) { if (!r.ok) throw new Error('fixture ' + r.status); return r.json(); }), 8000);
    }
    return timeout(authFetch(path, params, T.token())
      .then(function (r) { if (!r.ok) throw new Error('tmdb ' + r.status); return r.json(); }), 15000);
  }
  function authFetch(path, params, tok) {
    var q = qs(params), h = { Accept: 'application/json' };
    if (T.isKey(tok)) q += (q ? '&' : '') + 'api_key=' + tok; else h.Authorization = 'Bearer ' + tok;
    return fetch(API + path + (q ? '?' + q : ''), { headers: h });
  }
  // resolves true/false (TMDB accepted / rejected the credential); rejects on network failure
  T.verify = function (tok) {
    return timeout(authFetch('/authentication', null, tok).then(function (r) {
      if (r.status === 401 || r.status === 403) return false;
      if (!r.ok) throw new Error('tmdb ' + r.status);
      return true;
    }), 12000);
  };
  var inflight = {};
  // o: {ttl, slim(json), schema} (schema versions only the local normalized cache) ; the slimmed value is what is cached and returned
  T.get = function (path, params, o) {
    o = o || {}; var key = path + '?' + qs(params) + (o.schema ? '|schema=' + o.schema : '');
    var c = cget(key, o.ttl || TTL.details);
    if (c) return Promise.resolve(c.v);
    if (inflight[key]) return inflight[key];
    var p = rq(path, params).then(function (j) {
      delete inflight[key]; var v = o.slim ? o.slim(j) : j; cput(key, v); return v;
    }, function (e) { delete inflight[key]; throw e; });
    inflight[key] = p; return p;
  };

  /* ---------- text matching ---------- */
  function norm(s) {
    s = String(s || '').toLowerCase();
    try { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) {}
    return s.replace(/&/g, ' and ').replace(/[^a-z0-9؀-ۿ]+/g, ' ').replace(/^\s+|\s+$/g, '');
  }
  function stripYear(s) {
    s = String(s || ''); var r = s.replace(/\s*[\(\[]?\b(19|20)\d\d[\)\]]?\s*$/, '');
    return r.replace(/^\s+|\s+$/g, '') ? r.replace(/^\s+|\s+$/g, '') : s;
  }
  function sim(a, b) {
    a = norm(a); b = norm(b); if (!a || !b) return 0; if (a === b) return 1;
    var A = a.split(' '), B = b.split(' '), set = {}, i, inter = 0;
    for (i = 0; i < B.length; i++) set[B[i]] = 1;
    for (i = 0; i < A.length; i++) if (set[A[i]]) inter++;
    var d = 2 * inter / (A.length + B.length);
    if (a.indexOf(b + ' ') === 0 || b.indexOf(a + ' ') === 0) d = Math.max(d, 0.82);
    return d;
  }
  function yearOf(s) { var m = /^(\d{4})/.exec(s || ''); return m ? +m[1] : 0; }
  T._norm = norm; T._sim = sim; T._stripYear = stripYear;

  function slimItem(r, dk) {
    var kind = r.media_type || dk || (r.first_air_date !== undefined ? 'tv' : 'movie');
    return { id: r.id, kind: kind === 'tv' ? 'tv' : 'movie', title: r.title || r.name || '', orig: r.original_title || r.original_name || '',
      year: yearOf(r.release_date || r.first_air_date), bd: r.backdrop_path || '', pst: r.poster_path || '', pop: r.popularity || 0, vc: r.vote_count || 0 };
  }
  function listSlim(dk) {
    return function (j) {
      return (j.results || []).filter(function (r) { return r.media_type !== 'person' && r.id; }).map(function (r) { return slimItem(r, dk); });
    };
  }

  /* ---------- 30nama post -> TMDB id ---------- */
  function isTv(post) { return !!(post.options && post.options.is_series); }
  function postYear(post) { return +(post.info && post.info.year) || 0; }
  function postImdb(post) {
    var im = post.score && post.score.imdb, m = im && im.link && /tt\d{6,10}/.exec(im.link);
    if (m) return m[0];
    m = post.imdb_id && /tt\d{6,10}/.exec(post.imdb_id); return m ? m[0] : '';
  }
  function bestCand(cands, titles, year, tv) {
    var best = null, bs = 0, runner = 0;
    cands.forEach(function (c) {
      if (c.kind !== (tv ? 'tv' : 'movie')) return;
      var similarity = 0;
      titles.forEach(function (t) { similarity = Math.max(similarity, sim(t, c.title), c.orig ? sim(t, c.orig) : 0); });
      if (similarity < 0.9 || (!year && similarity < 1)) return;
      var score = similarity;
      if (year) {
        if (!c.year || Math.abs(year - c.year) > 1) return;
        score += year === c.year ? 0.25 : 0.1;
      }
      if (score > bs) { runner = bs; bs = score; best = c; }
      else runner = Math.max(runner, score);
    });
    return best && bs - runner >= 0.1 ? best : null;
  }
  T.match = function (post) {
    if (post._tm) return Promise.resolve(post._tm);
    var key = 'm3.' + post.id, c = cget(key, function (e) { return e.v ? TTL.match : TTL.miss; });
    if (c) return Promise.resolve(c.v || null);
    var tv = isTv(post), year = postYear(post), imdb = postImdb(post);
    var raw = (post.title && post.title.english) || '', titles = [stripYear(raw)];
    if (raw !== titles[0]) titles.push(raw);
    function viaImdb() {
      if (!imdb) return Promise.resolve(null);
      return T.get('/find/' + imdb, { external_source: 'imdb_id', language: 'en-US' }, { ttl: TTL.details, slim: function (j) {
        return { movie: (j.movie_results || []).map(function (r) { return slimItem(r, 'movie'); }), tv: (j.tv_results || []).map(function (r) { return slimItem(r, 'tv'); }) };
      } }).then(function (r) { var list = tv ? r.tv : r.movie, x = list.length === 1 ? list[0] : null; return x ? { id: x.id, kind: x.kind } : null; });
    }
    function search(withYear) {
      var p = { query: titles[0], include_adult: 'false', language: 'en-US' };
      if (withYear && year) p[tv ? 'first_air_date_year' : 'year'] = year;
      return T.get('/search/' + (tv ? 'tv' : 'movie'), p, { ttl: TTL.details, slim: listSlim(tv ? 'tv' : 'movie') })
        .then(function (list) { var b = bestCand(list, titles, year, tv); return b ? { id: b.id, kind: b.kind } : null; });
    }
    // An IMDb ID is authoritative: a missing or wrong-type result must not become a fuzzy match.
    var p = (imdb ? viaImdb() : search(true).then(function (m) { return m || (year ? search(false) : null); }))
      .then(function (m) { cput(key, m || 0); return m; });
    return p;
  };

  /* ---------- normalized details ---------- */
  function pickLogo(logos) {
    var l = (logos || []).filter(function (x) { return x.iso_639_1 === 'en' || !x.iso_639_1; });
    l.sort(function (a, b) { return ((b.iso_639_1 === 'en' ? 1 : 0) - (a.iso_639_1 === 'en' ? 1 : 0)) || ((b.vote_average || 0) - (a.vote_average || 0)) || ((b.width || 0) - (a.width || 0)); });
    return l[0] ? l[0].file_path : '';
  }
  function slimDetails(j, kind) {
    var cr = j.credits || {}, d = {
      id: j.id, kind: kind, title: j.title || j.name || '', tagline: j.tagline || '', overview: j.overview || '',
      releaseDate: j.release_date || j.first_air_date || '', status: j.status || '',
      runtime: kind === 'movie' ? (j.runtime || 0) : ((j.episode_run_time && j.episode_run_time[0]) || (j.last_episode_to_air && j.last_episode_to_air.runtime) || 0),
      bd: j.backdrop_path || '', logo: pickLogo(j.images && j.images.logos),
      imdb: (j.external_ids && j.external_ids.imdb_id) || j.imdb_id || '',
      seasons: j.number_of_seasons || 0, cast: [], crew: [], recs: [], nets: [], next: null, nextSeason: null
    };
    (cr.cast || []).slice(0, 16).forEach(function (c) { d.cast.push({ n: c.name, c: c.character || '', p: c.profile_path || '' }); });
    var seen = {};
    function addCrew(n, job, p) { if (!n || seen[n + job] || d.crew.length >= 8) return; seen[n + job] = 1; d.crew.push({ n: n, j: job, p: p || '' }); }
    (j.created_by || []).forEach(function (c) { addCrew(c.name, 'Creator', c.profile_path); });
    (cr.crew || []).forEach(function (c) { if (c.job === 'Director') addCrew(c.name, 'Director', c.profile_path); });
    var w = 0; (cr.crew || []).forEach(function (c) { if (w < 2 && /^(Screenplay|Writer|Story)$/.test(c.job)) { w++; addCrew(c.name, 'Writer', c.profile_path); } });
    var ep = 0; (cr.crew || []).forEach(function (c) { if (kind === 'tv' && ep < 2 && c.job === 'Executive Producer') { ep++; addCrew(c.name, 'Executive Producer', c.profile_path); } });
    (cr.crew || []).forEach(function (c) { if (kind === 'movie' && c.job === 'Original Music Composer') addCrew(c.name, 'Composer', c.profile_path); });
    var nets = kind === 'tv' ? (j.networks || []) : (j.production_companies || []);
    var ns = {}; nets.forEach(function (n) { if (n.name && !ns[n.name] && d.nets.length < 2) { ns[n.name] = 1; d.nets.push(n.name); } });
    ((j.recommendations && j.recommendations.results) || []).forEach(function (r) { if (r.id) d.recs.push(slimItem(r, kind)); });
    var now = new Date(), today = now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2) + '-' + ('0' + now.getDate()).slice(-2);
    function scheduled(iso) {
      if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso) || iso < today) return false;
      var date = new Date(iso + 'T00:00:00Z'); return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso;
    }
    if (kind === 'tv' && j.status !== 'Ended' && j.status !== 'Canceled') {
      var n = j.next_episode_to_air, lastSeason = +(j.last_episode_to_air && j.last_episode_to_air.season_number) || 0;
      if (n && n.season_number > 0 && n.episode_number > 0 && scheduled(n.air_date)) d.next = { d: n.air_date, s: n.season_number, e: n.episode_number };
      (j.seasons || []).forEach(function (season) {
        if (season.season_number <= lastSeason || season.season_number <= 0 || !scheduled(season.air_date)) return;
        if (!d.nextSeason || season.air_date < d.nextSeason.d) d.nextSeason = { d: season.air_date, s: season.season_number };
      });
      if (d.next && d.next.e === 1 && (!d.nextSeason || d.next.s < d.nextSeason.s)) d.nextSeason = { d: d.next.d, s: d.next.s };
    }
    return d;
  }
  T.details = function (post) {
    return T.match(post).then(function (m) {
      if (!m) return null;
      var base = T.get('/' + m.kind + '/' + m.id, { language: 'en-US', append_to_response: 'credits,images,recommendations,external_ids', include_image_language: 'en,null' },
        { ttl: m.kind === 'tv' ? 6 * HR : TTL.details, schema: m.kind === 'tv' ? 'schedule2' : '', slim: function (j) { return slimDetails(j, m.kind); } });
      var loc = N.lang === 'fa' ? T.get('/' + m.kind + '/' + m.id, { language: 'fa-IR' }, { ttl: TTL.details, slim: function (j) { return { tagline: j.tagline || '', overview: j.overview || '' }; } }).catch(function () { return null; }) : Promise.resolve(null);
      return Promise.all([base, loc]).then(function (r) {
        var d = r[0]; if (!r[1]) return d;
        d = Object.assign({}, d); if (r[1].tagline) d.tagline = r[1].tagline; if (r[1].overview) d.overview = r[1].overview; return d;
      });
    });
  };
  // title-logo URL for {id, kind}; '' when none
  T.logoFor = function (tm) {
    return T.get('/' + tm.kind + '/' + tm.id + '/images', { include_image_language: 'en,null' }, { ttl: TTL.details, slim: function (j) { return pickLogo(j.logos); } })
      .then(function (p) { return p ? IMG + 'w500' + p : ''; }).catch(function () { return ''; });
  };
  // TMDB fills untitled episodes with "Episode 3" / "قسمت ۳": treat those as no title
  function epTitle(n) { n = String(n || '').replace(/^\s+|\s+$/g, ''); return /^(episode|قسمت|اپیزود)\s*[0-9۰-۹]+$/i.test(n) ? '' : n; }
  // {episode number: {s: still path, n: title}} for one season of a series post (fa titles when available); {} when off/unmatched; never rejects
  T.episodes = function (post, season) {
    if (!T.enabled() || !isTv(post)) return Promise.resolve({});
    return T.match(post).then(function (m) {
      if (!m || m.kind !== 'tv') return {};
      function get(lang) {
        return T.get('/tv/' + m.id + '/season/' + season, { language: lang }, { ttl: TTL.season, slim: function (j) {
          var o = {}; (j.episodes || []).forEach(function (e) { if (e.episode_number) o[e.episode_number] = { s: e.still_path || '', n: epTitle(e.name) }; }); return o;
        } });
      }
      var loc = N.lang === 'fa' ? get('fa-IR').catch(function () { return {}; }) : Promise.resolve({});
      return Promise.all([get('en-US'), loc]).then(function (r) {
        var out = {};
        Object.keys(r[0]).forEach(function (k) { var l = r[1][k]; out[k] = { s: r[0][k].s, n: (l && l.n) || r[0][k].n }; });
        return out;
      });
    }).catch(function () { return {}; });
  };

  /* ---------- TMDB item -> 30nama post ---------- */
  // 30nama sits behind Cloudflare rate limiting (HTTP 429 / "error code: 1015" -> 'bad json'): keep concurrency low, space out starts, back off on errors.
  var q = [], active = 0, MAXC = 4, GAP = 150, lastStart = 0, pausedUntil = 0, pumpT = null;
  function pump() {
    if (pumpT || active >= MAXC || !q.length) return;
    var now = Date.now(), wait = Math.max(pausedUntil - now, lastStart + GAP - now, 0);
    if (wait > 0) { pumpT = setTimeout(function () { pumpT = null; pump(); }, wait); return; }
    var j = q.shift(); active++; lastStart = now;
    var p; try { p = Promise.resolve(j.fn()); } catch (e) { p = Promise.reject(e); }
    p.then(j.res, j.rej).then(function () { active--; pump(); });
    pump();
  }
  function pool(fn, foreground) { return new Promise(function (res, rej) { var job = { fn: fn, res: res, rej: rej, foreground: foreground }, i = 0; if (foreground) { while (i < q.length && q[i].foreground) i++; q.splice(i, 0, job); } else q.push(job); pump(); }); }
  function retrying(fn, tries) {
    return fn().catch(function (e) {
      if (tries > 0 && /bad json|timeout|429/.test(e && e.message || '')) {
        pausedUntil = Date.now() + 8000;
        return new Promise(function (r) { setTimeout(r, 8000); }).then(function () { return retrying(fn, tries - 1); });
      }
      throw e;
    });
  }

  function slimPost(p) {
    return { id: p.id, post_type: p.post_type, options: p.options, info: p.info, title: p.title, plot: p.plot, genre: p.genre, image: p.image, score: p.score };
  }
  function bestPost(posts, it) {
    var best = null, bs = 0, tv = it.kind === 'tv';
    posts.forEach(function (p) {
      if (!p || !p.id || !p.title) return;
      if (isTv(p) !== tv) return;
      if (p.options && p.options.coming_soon) return;
      var raw = p.title.english || '', s = 0;
      [it.title, it.orig].forEach(function (t) { if (!t) return; s = Math.max(s, sim(stripYear(raw), t), sim(raw, t)); });
      if (s < 0.9) return;
      var sc = s, py = postYear(p);
      if (it.year && py) {
        var d = Math.abs(it.year - py);
        if (d === 0) sc += 0.25; else if (d === 1) sc += 0.1; else return;
      }
      if (p.options && p.options.stream) sc += 0.1;
      if (sc > bs) { bs = sc; best = p; }
    });
    return best;
  }
  function resolveNet(it, foreground) {
    var qs2 = [it.title];
    if (it.orig && norm(it.orig) !== norm(it.title) && /[a-z]/i.test(it.orig)) qs2.push(it.orig);
    function go(i) {
      if (i >= qs2.length || !qs2[i]) return null;
      return N.api.get('search', { query: qs2[i], streamonly: 0, page: 1 }, { bg: !foreground }).then(function (r) {
        var post = bestPost((r && r.posts) || [], it);
        if (!post) return go(i + 1);
        if (it.imdb && postImdb(post) === it.imdb) return post;
        return T.match(post).then(function (m) { return m && m.id === it.id && m.kind === it.kind ? post : go(i + 1); });
      });
    }
    return go(0);
  }
  var rin = {};
  // it: slim TMDB item {id, kind, title, orig, year}; alive(): optional, false -> skipped (resolves null, uncached)
  T.resolve = function (it, alive, foreground) {
    var key = 'r3.' + it.kind + it.id;
    var c = cget(key, function (e) { return e.v ? TTL.res : TTL.miss; });
    if (c) return Promise.resolve(c.v ? Object.assign({}, c.v) : null);
    if (rin[key]) return rin[key].then(function (v) { return v ? Object.assign({}, v) : null; });
    var p = pool(function () {
      if (alive && !alive()) return { skipped: true };
      return retrying(function () { return resolveNet(it, foreground); }, 2).then(function (post) { return { post: post }; });
    }, foreground).then(function (r) {
      delete rin[key];
      if (r.skipped) return null;
      var sp = r.post ? slimPost(r.post) : null; cput(key, sp || 0); return sp;
    }, function () { delete rin[key]; return null; });
    rin[key] = p;
    return p.then(function (v) { return v ? Object.assign({}, v) : null; });
  };

  /* ---------- home feeds ---------- */
  var SRC = {
    trend: [{ path: '/trending/all/week', params: { language: 'en-US' }, dk: null }],
    fresh: function () {
      var d = new Date(Date.now() - 30 * 86400000), ds = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2), out = [];
      for (var pg = 1; pg <= 3; pg++) {
        out.push({ path: '/discover/tv', params: { language: 'en-US', 'air_date.gte': ds, sort_by: 'popularity.desc', 'vote_count.gte': 200, without_genres: '10767,10763,10764,10766', page: pg }, dk: 'tv' });
      }
      return out;
    },
    pop: [{ path: '/movie/now_playing', params: { language: 'en-US', region: 'US' }, dk: 'movie' }, { path: '/trending/movie/day', params: { language: 'en-US' }, dk: 'movie' }]
  };
  var CAP = { trend: 16, fresh: 14, pop: 14 };
  var feeds = {};
  function makeFeed(name) {
    var f = { name: name, t: Date.now(), items: [], done: false, subs: [], dead: false };
    function notify() { f.subs.slice().forEach(function (fn) { try { fn(f); } catch (e) {} }); }
    function finish() { f.done = true; notify(); }
    var srcs = typeof SRC[name] === 'function' ? SRC[name]() : SRC[name];
    Promise.all(srcs.map(function (s) {
      return T.get(s.path, s.params, { ttl: TTL.trend, slim: listSlim(s.dk) }).catch(function () { return []; });
    })).then(function (lists) {
      var seen = {}, cands = [];
      lists.forEach(function (l) { l.forEach(function (it) { var k = it.kind + it.id; if (!seen[k] && it.title && it.pst) { seen[k] = 1; cands.push(it); } }); });
      // fresh series: most popular (well-known) first, obscure titles dropped
      if (name === 'fresh') { cands = cands.filter(function (c) { return c.vc >= 200; }); cands.sort(function (a, b) { return (b.pop + Math.sqrt(b.vc) / 5) - (a.pop + Math.sqrt(a.vc) / 5); }); }
      if (!cands.length) return finish();
      var left = cands.length;
      cands.forEach(function (it, i) {
        T.resolve(it, function () { return f.items.length < CAP[name]; }).then(function (post) {
          if (post && f.items.length < CAP[name]) {
            post._tm = { id: it.id, kind: it.kind }; post._bd = it.bd ? IMG + 'w1280' + it.bd : '';
            f.items.push({ post: post, tm: it, i: i }); notify();
          }
          if (--left === 0) finish();
        });
      });
    }).catch(finish);
    f.subscribe = function (fn) { f.subs.push(fn); if (f.items.length || f.done) { setTimeout(function () { if (f.subs.indexOf(fn) >= 0) fn(f); }, 0); } };
    f.unsubscribe = function (fn) { var i = f.subs.indexOf(fn); if (i >= 0) f.subs.splice(i, 1); };
    return f;
  }
  T.feed = function (name) {
    var f = feeds[name];
    if (f && Date.now() - f.t < 10 * 60 * 1000 && !(f.done && !f.items.length)) return f;
    return (feeds[name] = makeFeed(name));
  };
  T.startHome = function () { T.feed('trend'); T.feed('fresh'); T.feed('pop'); };
  // Resolves with up to `n` trending posts that have a TMDB backdrop (fewer on timeout); never rejects.
  T.heroes = function (n, ms) {
    return new Promise(function (res) {
      var f = T.feed('trend'), done = false, tm;
      function pick() { return f.items.filter(function (x) { return x.post._bd; }).sort(function (a, b) { return a.i - b.i; }).slice(0, n).map(function (x) { var p = Object.assign({}, x.post); p._bdPref = true; p._hero = true; return p; }); }
      function fin() {
        if (done) return; done = true; clearTimeout(tm); f.unsubscribe(cb);
        var ps = pick(), lt = setTimeout(function () { res(ps); res = function () {}; }, 900);
        Promise.all(ps.map(function (p) { return T.logoFor(p._tm).then(function (u) { p._logo = u; }); })).then(function () { clearTimeout(lt); res(ps); });
      }
      function cb() { if (f.done || f.items.filter(function (x) { return x.post._bd; }).length >= n) fin(); }
      tm = setTimeout(fin, ms); f.subscribe(cb);
    });
  };
})();
