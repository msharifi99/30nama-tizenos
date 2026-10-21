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
  ui.load = function (c) {
    if (c._on || !c._src) return; c._on = true;
    var im = c._im; if (!im) return;
    im.onload = function () { im.classList.add('in'); };
    im.onerror = function () { if (im.parentNode) im.parentNode.removeChild(im); c._im = null; if (!c._mq) c._mq = c._pt; };
    im.src = c._src;
  };
  ui.unload = function (c) {
    if (!c._on) return; c._on = false;
    var im = c._im; if (im) { im.classList.remove('in'); im.onload = null; im.removeAttribute('src'); }
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
        var url = N.tmdb.img(x.s, 'w300'), st = el('div', 'st'), im = new Image(); t._st = st;
        im.onload = function () { st.style.backgroundImage = 'url("' + url + '")'; t.insertBefore(st, t.firstChild); void st.offsetWidth; t.classList.add('has-st'); };
        im.src = url;
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
