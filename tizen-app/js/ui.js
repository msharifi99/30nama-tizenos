/* Shared UI helpers: icons, cards, meta line, track/scroll layout. */
(function () {
  var el = N.el, ui = N.ui = {};
  var NS = 'http://www.w3.org/2000/svg', XL = 'http://www.w3.org/1999/xlink';

  ui.icon = function (name, cls) {
    var s = document.createElementNS(NS, 'svg'); s.setAttribute('class', 'ico' + (cls ? ' ' + cls : ''));
    var u = document.createElementNS(NS, 'use'); u.setAttributeNS(XL, 'xlink:href', '#i-' + name); u.setAttribute('href', '#i-' + name);
    s.appendChild(u); return s;
  };
  ui.setIcon = function (svg, name) {
    var u = svg.firstChild; u.setAttributeNS(XL, 'xlink:href', '#i-' + name); u.setAttribute('href', '#i-' + name);
  };
  ui.btn = function (text, fn, cls, icon) {
    var b = el('button', 'btn f fl' + (cls ? ' ' + cls : ''));
    if (icon) b.appendChild(ui.icon(icon));
    b.appendChild(el('span', '', text)); b.onclick = fn; return b;
  };
  ui.pill = function (text, fn, cur) {
    var b = el('button', 'pill f fl' + (cur ? ' cur' : ''), text); b.onclick = fn; return b;
  };
  ui.clock = function () {
    var c = el('div', 'clock tab');
    function tick() { var d = new Date(), h = d.getHours(), m = d.getMinutes(); c.textContent = (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m; }
    tick(); c._t = setInterval(tick, 20000); return c;
  };

  /* ---------- images ---------- */
  /* Prefer medium for row/grid cards — large over-fetches on 2018 SoCs. */
  ui.posterUrl = function (p) {
    var po = p && p.image && p.image.poster; if (!po) return '';
    return (po.webp && (po.webp.medium || po.webp.large)) || (po.jpg && (po.jpg.medium || po.jpg.large)) || '';
  };
  ui.coverUrl = function (p) { var c = p && p.image && p.image.cover; return c ? (c.webp || c.jpg || '') : ''; };
  /* Shared image helpers (adopt these in screens.js instead of hand-rolled `new Image()`):
       ui.preload(src, cb)  fetch + decode off-DOM; cb(ok) once ready (immediately when src is already known-loaded). Returns nothing.
       ui.mark(src)         record src as loaded (for code that loads images itself)
       ui.cached(src)       true when src finished loading earlier this session (in-memory LRU of URLs, 400 entries)
       ui.img(src, cls, cb) <img class="uimg cls" decoding=async> that fades in (class `in`) after it is decoded; cb(ok) optional.
                            Failed images are left empty (opacity 0), never a broken-image icon.
     All three degrade to plain onload when img.decode() is missing. */
  var seen = {}, seenN = 0, seenOld = {};
  function mark(src) {
    if (seen[src]) return;
    seen[src] = 1; if (++seenN > 400) { seenOld = seen; seen = {}; seenN = 0; } // two-generation LRU: cheap, no per-hit bookkeeping
  }
  ui.mark = mark;
  ui.cached = function (src) { return !!(src && (seen[src] || seenOld[src])); };
  function whenReady(im, cb) {
    var done = false;
    function ok() { if (!done) { done = true; cb(true); } }
    function ko() { if (!done) { done = true; cb(false); } }
    if (im.decode) im.decode().then(ok, function () { im.complete && im.naturalWidth ? ok() : ko(); });
    else if (im.complete && im.naturalWidth) ok();
    else { im.addEventListener('load', ok); im.addEventListener('error', ko); }
  }
  ui.preload = function (src, cb) {
    if (!src) { if (cb) cb(false); return; }
    if (ui.cached(src)) { mark(src); if (cb) cb(true); return; }
    var im = new Image(); im.decoding = 'async'; im.src = src;
    whenReady(im, function (ok) { if (ok) mark(src); if (cb) cb(ok); });
  };
  ui.img = function (src, cls, cb) {
    var im = el('img', 'uimg' + (cls ? ' ' + cls : '')); im.alt = ''; im.decoding = 'async';
    im.src = src;
    whenReady(im, function (ok) { if (ok) { mark(src); im.classList.add('in'); } if (cb) cb(ok); });
    return im;
  };
  /* card poster: reveal only after decode so the fade never runs on a half-decoded bitmap */
  ui.load = function (c) {
    if (c._on || !c._src) return; c._on = true;
    var im = c._im; if (!im) return;
    var src = c._src;
    im.onerror = function () { if (im.parentNode) im.parentNode.removeChild(im); c._im = null; c._on = false; if (!c._mq) c._mq = c._pt; };
    im.src = src;
    im.onload = function () { mark(src); if (c._on && c._im === im) im.classList.add('in'); };
  };
  ui.unload = function (c) {
    if (!c._on) return; c._on = false;
    var im = c._im; if (im) { im.classList.remove('in'); im.removeAttribute('src'); }
  };

  /* ---------- cards ---------- */
  // kind: poster | land | top | grid | tile ; returns the focusable .card element
  ui.card = function (post, kind, o) {
    o = o || {}; var c = el('div', 'card f k-' + (kind === 'poster' ? 'p' : kind)), po = post.options || {};
    var url = kind === 'land' ? (ui.coverUrl(post) || ui.posterUrl(post)) : ui.posterUrl(post);
    if (kind === 'tile') url = o.image || '';
    c._post = post; c._src = url;
    var holder = c;
    if (kind === 'top') {
      c.appendChild(el('div', 'rank', String(o.rank)));
      c.appendChild(el('div', 'rank hi', String(o.rank)));
      holder = el('div', 'pbox'); c.appendChild(holder);
      if (o.rank >= 10) c.classList.add('wide');
    }
    // the placeholder title only scrolls when no poster covers it
    var ph = el('div', 'ph'); c._pt = ui.mq(kind === 'tile' ? '' : N.title(post), 'pht mqv'); ph.appendChild(c._pt); holder.appendChild(ph);
    if (url) { var im = el('img', 'im'); im.alt = ''; im.decoding = 'async'; holder.appendChild(im); c._im = im; }
    else c._mq = c._pt;
    if (kind === 'tile') {
      c._mq = ui.mq(o.name, 'tn');
      c.appendChild(el('div', 'shade')); c.appendChild(c._mq); c.appendChild(el('div', 'tc tab', o.count !== undefined ? String(o.count) : ''));
    } else if (kind !== 'land') {
      ui.badge(holder, po);
    }
    return c;
  };
  ui.badge = function (c, po) {
    var b = null;
    if (po.coming_soon) { b = el('div', 'bdg soon', N.t('soon')); }
    else if (po.free_stream) { b = el('div', 'bdg free', N.t('free')); }
    if (b) c.appendChild(b);
  };
  // grid cell: poster + title under it. Returns the cell; cell.card is the focusable.
  ui.cell = function (post) {
    var cell = el('div', 'gcell'), c = ui.card(post, 'grid');
    c._mq = ui.mq(N.title(post), 'gt');
    cell.appendChild(c); cell.appendChild(c._mq); cell.card = c; c._cell = cell; return cell;
  };
  // episode tiles (typographic; the API has no stills, TMDB stills/titles are layered in by epTmdb)
  ui.epName = function (it) {
    var i = (it && it.info) || {}, t = i.title || i.name || (it && it.title);
    if (t && typeof t === 'object') t = (N.lang === 'fa' && t.local) ? t.local : (t.english || t.local);
    return t ? String(t) : '';
  };
  // episode numbers may be combined ("11,12"): order by the leading number, show "11–12"
  ui.epNum = function (v) { var n = parseInt(String(v === undefined || v === null ? '' : v), 10); return isNaN(n) ? 0 : n; };
  ui.epLabel = function (v, fallback) {
    var s = (v === undefined || v === null || v === '') ? String(fallback === undefined ? '' : fallback) : String(v);
    return s.replace(/\s*[,&+\-–]\s*/g, '–');
  };
  ui.epCmp = function (a, b) {
    var ai = (a && a.info) || {}, bi = (b && b.info) || {};
    return (ui.epNum(ai.season) - ui.epNum(bi.season)) || (ui.epNum(ai.episode) - ui.epNum(bi.episode));
  };
  ui.epTile = function (it, idx, o) {
    o = o || {}; var i = it.info || {}, n = ui.epLabel(i.episode, idx + 1), e = el('div', 'ep f');
    e._en = ui.epNum(i.episode) || idx + 1;
    e.appendChild(el('div', 'en tab' + (n.length > 3 ? ' sm' : ''), 'E' + (/^\d$/.test(n) ? '0' + n : n)));
    var nm = ui.epName(it), et = ui.mq(nm || (N.t('episode') + ' ' + n), 'et mqv');
    e.appendChild(et); e._et = e._mq = et; e._etDef = !nm;
    var dur = Number(i.duration || i.time || 0);
    if (o.watched) { var ck = ui.icon('check', 'chk'); e.appendChild(ck); }
    else if (dur) { if (dur > 600) dur = dur / 60; e.appendChild(el('div', 'ed tab', Math.round(dur) + ' ' + N.t('min'))); }
    if (o.progress > 0) { var pb = el('div', 'ep-p'), pi = el('i'); pi.style.transform = 'scaleX(' + Math.min(1, o.progress) + ')'; pb.appendChild(pi); e.appendChild(pb); }
    return e;
  };
  // TMDB extras for epTile elements of one season of `post`: the still as background, the title where 30nama has none
  ui.epTmdb = function (post, season, tiles) {
    if (!N.tmdb.enabled() || !tiles.length) return;
    N.tmdb.episodes(post, season).then(function (m) {
      tiles.forEach(function (t) {
        var x = m[t._en]; if (!x || !t.parentNode) return;
        if (x.n && t._etDef) { t._etDef = false; ui.mqText(t._et, x.n); }
        if (!x.s || t._st) return;
        var url = N.tmdb.img(x.s, 'w300'), st = el('div', 'st'); t._st = st;
        ui.preload(url, function (ok) { if (!ok) return; st.style.backgroundImage = 'url("' + url + '")'; t.insertBefore(st, t.firstChild); void st.offsetWidth; t.classList.add('has-st'); });
      });
    });
  };
  ui.skelCard = function (kind) { var c = el('div', 'card skel k-' + (kind || 'p')); return c; };

  /* ---------- marquee: one-line text that scrolls while its card has focus ---------- */
  ui.mq = function (text, cls) {
    var b = el('div', (cls ? cls + ' ' : '') + 'mq'); b.dir = 'auto';
    b.appendChild(el('span', '', text)); return b;
  };
  // measured lazily on first focus (needs layout + loaded fonts); cached on the element. `b` may be a list.
  ui.mqFit = function (b) {
    if (b && b.length) { for (var i = 0; i < b.length; i++) ui.mqFit(b[i]); return; }
    if (!b || b._mq !== undefined || !b.clientWidth) return;
    // .mqv: line-clamped text scrolls vertically, line by line
    if (b.classList.contains('mqv')) {
      var lh = parseFloat(getComputedStyle(b).lineHeight) || 1, extra = Math.round(b.scrollHeight / lh) - Math.round(b.clientHeight / lh);
      b._mq = extra > 0; if (!b._mq) return;
      b.style.setProperty('--mq-y', -(extra * lh) + 'px');
      b.style.setProperty('--mq-h', b.clientHeight + 'px');
      b.style.setProperty('--mq-t', (3 + extra * 1.2).toFixed(2) + 's');
      b.classList.add('mqv-on'); return;
    }
    var s = b.firstChild, w = s.offsetWidth, gap = 48, d = w + gap;
    b._mq = w > b.clientWidth + 1; if (!b._mq) return;
    var rtl = getComputedStyle(b).direction === 'rtl', move = d / 50;
    s.appendChild(el('span', 'mq-c', s.firstChild.nodeValue));
    b.style.setProperty('--mq-x', (rtl ? d : -d) + 'px');
    b.style.setProperty('--mq-t', (move / 0.88).toFixed(2) + 's');
    b.classList.add('mq-on'); if (rtl) b.classList.add('mq-rtl');
  };
  ui.mqText = function (b, text) {
    b.innerHTML = ''; b.appendChild(el('span', '', text));
    b._mq = undefined; b.classList.remove('mq-on', 'mq-rtl', 'mqv-on');
    if (N.nav.cur && N.nav.cur.contains(b)) ui.mqFit(b);
  };

  /* ---------- text bits ---------- */
  ui.typeLabel = function (post, withSeasons) {
    var po = post.options || {}, pi = post.info || {}, s;
    if (po.title_type === 'anime') s = N.t('anime'); else if (po.is_series) s = N.t('series'); else s = N.t('movie');
    if (withSeasons && po.is_series && pi.seasons) s += ' · ' + pi.seasons + ' ' + N.t('seasons');
    return s;
  };
  ui.duration = function (min) {
    min = Number(min); if (!min) return '';
    var h = Math.floor(min / 60), m = min % 60;
    if (N.lang === 'fa') return (h ? h + ' ساعت ' : '') + (m ? m + ' دقیقه' : '');
    return (h ? h + 'h ' : '') + (m ? m + 'm' : '');
  };
  // Meta line: [IMDb 7.8] ([RT 86%] [Metacritic 74] if allScores) 30nama-score · year · duration · [age] · genres
  ui.meta = function (post, nGenres, allScores) {
    var m = el('div', 'meta'), pi = post.info || {}, sc = post.score || {}, bits = 0;
    function dot() { if (m.lastChild) m.appendChild(el('i', 'dot-s')); }
    if (sc.imdb && sc.imdb.score) { m.appendChild(el('span', 'imdb tab', 'IMDb ' + sc.imdb.score)); }
    if (allScores && sc.rottentomatoes && sc.rottentomatoes.score) {
      var rt = el('span', 'crit rt tab'); rt.appendChild(ui.icon('tomato')); rt.appendChild(document.createTextNode(sc.rottentomatoes.score + '%')); m.appendChild(rt);
    }
    if (allScores && sc.metacritic && sc.metacritic.score) { m.appendChild(el('span', 'crit tab', 'Metacritic ' + sc.metacritic.score)); }
    if (sc['30nama'] && sc['30nama'].score) { var s3 = el('span', 'sc tab', String(sc['30nama'].score)); m.appendChild(s3); }
    if (pi.year) { dot(); m.appendChild(el('span', 'tab', pi.year + (pi.year_end && pi.year_end !== pi.year && (post.options || {}).is_series ? '–' + pi.year_end : ''))); }
    var d = ui.duration(pi.time && pi.time.default); if (d) { dot(); m.appendChild(el('span', 'tab', d)); }
    if (pi.age) { dot(); m.appendChild(el('span', 'age', pi.age)); }
    if (post.genre && post.genre.length) {
      dot(); m.appendChild(el('span', '', post.genre.slice(0, nGenres || 2).map(function (g) { return g.name; }).join(', ')));
    }
    return m;
  };

  /* ---------- layout: start-anchored tracks, vertical scroll ---------- */
  var START = 184;
  // cards: array of elements with known widths; sets card._x (logical start) and track._total
  ui.layoutTrack = function (track, cards, widths, gap) {
    var x = START; gap = gap === undefined ? 24 : gap;
    for (var i = 0; i < cards.length; i++) { cards[i]._x = x; x += widths[i] + gap; }
    track._total = x - gap; track._s = null;
  };
  ui.slideTo = function (track, x) {
    // Reserve 28px for focus enlargement and its ring at the far safe edge.
    var s = Math.max(0, x - START), max = Math.max(0, (track._total || 0) - 1796);
    if (s > max) s = max;
    if (track._s === s) return; track._s = s;
    track.style.transform = 'translateX(' + (N.isRtl() ? s : -s) + 'px)';
  };
  function topIn(e, box) { var t = 0; while (e && e !== box) { t += e.offsetTop; e = e.offsetParent; } return t; }
  ui.topIn = topIn;
  // keep `target` row at (at most) `anchor` px from the top of the screen
  ui.vscroll = function (box, target, anchor) {
    var ty = -Math.max(0, topIn(target, box) - anchor);
    if (box._ty === ty) return ty; box._ty = ty;
    box.style.transform = 'translateY(' + ty + 'px)'; return ty;
  };
  // is `dir` ('left'|'right') towards the end edge in the current direction?
  ui.step = function (dir) { var r = N.isRtl(); return (dir === 'right') !== r ? 1 : -1; };

  /* ---------- lite mode: cheaper effects on weak TVs ----------
     N.lite (bool) mirrors body.lite. Override: localStorage n30.lite = true|false (N.store 'lite'); anything else = auto.
     Auto = hardwareConcurrency <= 2, deviceMemory <= 2, Samsung model year <= 2017, or a median frame time > 28 ms
     measured over the first ~1.6 s (applies to that session; remembered once two boots in a row measure slow, 'liteAuto' = streak). ui.setLite(true|false|null) flips it live (null = back to auto). */
  function modelYear() {
    try {
      var m = window.webapis.productinfo.getRealModel() || window.webapis.productinfo.getModel() || '', x = /^(?:UE|QE|UN|QN)\d{2}([A-Z])/.exec(m);
      return x ? { H: 2014, J: 2015, K: 2016, M: 2017, N: 2018, R: 2019, T: 2020, A: 2021, B: 2022, C: 2023, D: 2024 }[x[1]] || 0 : 0;
    } catch (e) { return 0; }
  }
  function staticLite() {
    var y = modelYear();
    return false; // auto-detection misfired on real TVs (animations gone): lite is opt-in only (Settings > Display)
  }
  function applyLite(on) { N.lite = !!on; document.body.classList.toggle('lite', !!on); }
  ui.setLite = function (v) {
    if (v === true || v === false) N.store.set('lite', v); else N.store.del('lite');
    if (v !== true && v !== false) N.store.del('liteAuto');
    applyLite(v === true || v === false ? v : staticLite());
  };
  function probeFrames() {
    var ds = [], last = 0, t0 = 0;
    function f(t) {
      if (!t0) t0 = t;
      if (last) ds.push(t - last);
      last = t;
      if (t - t0 < 1600) { requestAnimationFrame(f); return; }
      ds = ds.slice(3); if (ds.length < 20) return;
      ds.sort(function (a, b) { return a - b; });
      if (N.store.get('lite', null) !== null) return;
      var slow = ds[ds.length >> 1] > 28; // one slow boot can be a busy start: count a streak, a smooth boot resets it
      N.store.set('liteAuto', slow ? (+N.store.get('liteAuto', 0) || 0) + 1 : 0);
      if (slow && !N.lite) applyLite(true);
    }
    requestAnimationFrame(f);
  }
  (function () {
    var o = N.store.get('lite', null);
    applyLite(o === true || o === false ? o : staticLite());
  })();
  // started by the app once the splash exits: boot-time parsing and the first requests must not count as slow frames
  var probed = false;
  ui.probeLite = function () {
    if (probed) return; probed = true;
    var o = N.store.get('lite', null);
    if (o !== true && o !== false && !N.lite) probeFrames();
  };

  // one-row pill strip (season tabs) that shows only the pills fitting in `room` px. The focused (or current) pill keeps
  // its neighbour on each side in view, so moving to an edge pill shifts the strip by one pill; pills outside fade out.
  ui.tabStrip = function (tabs, room) {
    var first = 0; room = room || 1360;
    tabs.reveal = function (t, now) {
      var c = tabs.children, n = c.length, i = Array.prototype.indexOf.call(c, t), x = [], w = [], p = 0, k;
      if (i < 0 || !t.offsetWidth) return; // not laid out yet
      for (k = 0; k < n; k++) { w.push(c[k].offsetWidth); x.push(p); p += w[k] + 12; } // 12 = .tabs .pill+.pill margin
      function end(f) { var e = f; while (e + 1 < n && x[e + 1] + w[e + 1] - x[f] <= room) e++; return e; }
      if (first >= n) first = 0;
      if (first > i - 1) first = Math.max(0, i - 1);
      while (first < i && end(first) < Math.min(n - 1, i + 1)) first++;
      while (first > 0 && x[n - 1] + w[n - 1] - x[first - 1] <= room) first--; // no empty room after the last pill
      var e = end(first);
      for (k = 0; k < n; k++) c[k].classList.toggle('out', k < first || k > e);
      if (now) tabs.style.transition = 'none';
      tabs.style.transform = first ? 'translateX(' + (N.isRtl() ? x[first] : -x[first]) + 'px)' : '';
      if (now) { void tabs.offsetWidth; tabs.style.transition = ''; }
    };
  };

  // Index-based grids remain predictable while their parent is animating.
  // Spatial rectangles alone can skip rows or jump back to a distant control.
  ui.gridNav = function (cards, index, cols, dir, edge) {
    var next = index;
    if (dir === 'left' || dir === 'right') {
      var step = ui.step(dir);
      if ((step < 0 && index % cols === 0) ||
          (step > 0 && (index % cols === cols - 1 || index === cards.length - 1))) {
        return edge ? edge(dir) : true;
      }
      next += step;
    } else if (dir === 'up') {
      if (index < cols) return edge ? edge(dir) : true;
      next -= cols;
    } else if (dir === 'down') {
      if (Math.floor(index / cols) === Math.floor((cards.length - 1) / cols)) return true;
      next = Math.min(cards.length - 1, index + cols);
    }
    return cards[next] || true;
  };
})();
