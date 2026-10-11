/* Player: Tizen AVPlay when available, else <video> + hls.js. Own WebVTT overlay. */
(function () {
  var K = N.keys, $ = N.$;
  var P = N.player = {
    open: false, items: [], index: 0, post: null, be: null, paused: false,
    cues: [], subLang: 'off', subCache: {}, hbTimer: null, tickTimer: null, osdTimer: null,
    menuOpen: false, seekAcc: 0, seekTimer: null, skip: null, resume: null
  };
  var hasAV = function () { return !!(window.webapis && window.webapis.avplay); };

  /* ---------- backends ---------- */
  function avBackend() {
    var av = webapis.avplay, state = { dur: 0, cur: 0 };
    return {
      name: 'avplay',
      load: function (url, startSec, cb) {
        $('avplayObj').style.display = 'block';
        document.body.classList.add('av'); document.documentElement.classList.add('avh');
        try { av.close(); } catch (e) {}
        try { av.open(String(url)); } catch (e) { P.onError('open ' + (e && e.message || e)); return; }
        av.setDisplayRect(0, 0, 1920, 1080);
        try { av.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX'); } catch (e) {}
        av.setListener({
          onbufferingstart: function () { P.spin(true); },
          onbufferingcomplete: function () { P.spin(false); },
          oncurrentplaytime: function (ms) { state.cur = ms / 1000; },
          onstreamcompleted: function () { P.onEnded(); },
          onevent: function () {},
          onerror: function (err) { P.onError(String(err)); },
          onsubtitlechange: function () {}
        });
        av.prepareAsync(function () {
          try { state.dur = av.getDuration() / 1000; } catch (e) {}
          av.play();
          if (startSec > 5) { try { av.seekTo(Math.floor(startSec * 1000)); } catch (e) {} }
          P.spin(false);
          if (cb) cb();
        }, function (err) { P.onError(String(err)); });
      },
      play: function () { try { av.play(); } catch (e) {} },
      pause: function () { try { av.pause(); } catch (e) {} },
      seek: function (sec) { try { state.cur = sec; av.seekTo(Math.max(0, Math.floor(sec * 1000))); } catch (e) {} },
      time: function () { return state.cur; },
      buffered: function () { return 0; },
      duration: function () { return state.dur; },
      audioTracks: function () {
        var out = [];
        try {
          var info = av.getTotalTrackInfo();
          for (var i = 0; i < info.length; i++) if (info[i].type === 'AUDIO') {
            var lang = ''; try { lang = JSON.parse(info[i].extra_info).language; } catch (e) {}
            out.push({ id: info[i].index, label: langName(lang) || ('Track ' + (out.length + 1)) });
          }
        } catch (e) {}
        return out;
      },
      setAudio: function (id) { try { av.setSelectTrack('AUDIO', id); } catch (e) {} },
      stop: function () {
        try { av.stop(); } catch (e) {}
        try { av.close(); } catch (e) {}
        $('avplayObj').style.display = 'none'; document.body.classList.remove('av'); document.documentElement.classList.remove('avh');
      }
    };
  }
  function videoBackend() {
    var v = $('video'), hls = null;
    return {
      name: 'video',
      load: function (url, startSec, cb) {
        var started = false;
        function go() {
          if (started) return; started = true;
          if (startSec > 5) { try { v.currentTime = startSec; } catch (e) {} }
          var pr = v.play(); if (pr && pr.catch) pr.catch(function () {});
          P.spin(false); if (cb) cb();
        }
        v.onwaiting = function () { P.spin(true); };
        v.onplaying = function () { P.spin(false); };
        v.onended = function () { P.onEnded(); };
        v.onerror = function () { P.onError('video error'); };
        v.onloadedmetadata = go;
        var src = N.proxied(url);
        if (window.Hls && Hls.isSupported()) {
          hls = new Hls({ enableWorker: false });
          hls.on(Hls.Events.ERROR, function (ev, d) { if (d && d.fatal) P.onError('hls ' + d.details); });
          hls.on(Hls.Events.MANIFEST_PARSED, function () { setTimeout(go, 0); });
          hls.loadSource(src); hls.attachMedia(v);
        } else { v.src = src; }
      },
      play: function () { v.play(); },
      pause: function () { v.pause(); },
      seek: function (s) { v.currentTime = Math.max(0, s); },
      time: function () { return v.currentTime || 0; },
      buffered: function () { try { var b = v.buffered, t = v.currentTime || 0; for (var i = 0; i < b.length; i++) if (b.start(i) <= t + 0.5 && b.end(i) >= t) return b.end(i); } catch (e) {} return 0; },
      duration: function () { return isFinite(v.duration) ? v.duration : 0; },
      audioTracks: function () {
        if (!hls || !hls.audioTracks) return [];
        return hls.audioTracks.map(function (t, i) { return { id: i, label: langName(t.lang) || t.name || ('Track ' + (i + 1)) }; });
      },
      setAudio: function (id) { if (hls) hls.audioTrack = id; },
      stop: function () {
        try { v.pause(); } catch (e) {}
        if (hls) { hls.destroy(); hls = null; }
        v.removeAttribute('src'); try { v.load(); } catch (e) {}
      }
    };
  }
  var LANGS = { eng: 'English', en: 'English', per: 'Persian', fas: 'Persian', fa: 'Persian', fre: 'French', fra: 'French', ger: 'German', deu: 'German', spa: 'Spanish', jpn: 'Japanese', ja: 'Japanese', kor: 'Korean', tur: 'Turkish', ara: 'Arabic', rus: 'Russian' };
  function langName(l) { if (!l) return ''; var s = String(l).toLowerCase(); return LANGS[s] || LANGS[s.slice(0, 3)] || String(l); }

  /* m3u8 may be a string, or an array of quality entries {label, default|6ch|2ch} (original app maps over it, 'Auto' = adaptive). */
  function entryUrl(e) {
    if (!e) return null;
    if (typeof e === 'string') return e;
    if (e instanceof Array) return entryUrl(e[0]);
    return entryUrl(e['default'] || e.file || e.url || e.src || e.link || e.m3u8 || e.path || e.source);
  }
  P.pickUrl = function (m) {
    if (!(m instanceof Array)) return entryUrl(m);
    // Always prefer the highest fixed quality (e.g. 2160p); Auto only as fallback
    var best = null, bestH = -1, auto = null, i, e, u;
    for (i = 0; i < m.length; i++) {
      e = m[i]; u = entryUrl(e); if (!u) continue;
      if (e && /^(auto|خودکار)$/i.test(String(e.label || ''))) { auto = u; continue; }
      var h = parseInt(String(e && e.label || '').replace(/\D/g, ''), 10) || 0;
      if (h > bestH) { best = u; bestH = h; }
    }
    return best || auto;
  };

  /* ---------- subtitles ---------- */
  function subUrl(v) {
    if (!v) return null;
    if (typeof v === 'string') return v;
    if (v instanceof Array) return subUrl(v[0]);
    return v.url || v.file || v.src || v.link || v.vtt || null;
  }
  function ts(s) {
    var m = /^(?:(\d+):)?(\d+):(\d+)[.,](\d+)$/.exec(s.trim()); if (!m) return null;
    return (+m[1] || 0) * 3600 + (+m[2]) * 60 + (+m[3]) + Number('0.' + m[4]);
  }
  P.parseVTT = function (text) {
    var cues = [], blocks = text.replace(/\r/g, '').replace(/^﻿/, '').split(/\n\n+/);
    blocks.forEach(function (b) {
      var lines = b.split('\n'), i = 0;
      while (i < lines.length && lines[i].indexOf('-->') < 0) i++;
      if (i >= lines.length) return;
      var parts = lines[i].split('-->'), s = ts(parts[0]), e = ts(parts[1].trim().split(/\s+/)[0]);
      if (s === null || e === null) return;
      var txt = lines.slice(i + 1).join('\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\{\\an?\d\}/g, '');
      cues.push({ s: s, e: e, t: txt });
    });
    cues.sort(function (a, b) { return a.s - b.s; });
    return cues;
  };
  P.setSub = function (lang) {
    P.subLang = lang; P.cues = []; $('subtitle').textContent = '';
    if (lang === 'off') return Promise.resolve();
    var item = P.items[P.index], u = item && item.file && subUrl(item.file.subtitle && item.file.subtitle[lang]);
    if (!u) return Promise.resolve();
    if (P.subCache[u]) { P.cues = P.subCache[u]; return Promise.resolve(); }
    return fetch(N.proxied(u)).then(function (r) { return r.text(); }).then(function (t) {
      P.subCache[u] = P.parseVTT(t); if (P.subLang === lang) P.cues = P.subCache[u];
    }).catch(function () { N.toast(N.t('subFailed')); });
  };
  function renderSub(t) {
    var cs = P.cues, txt = '';
    if (cs.length) {
      var lo = 0, hi = cs.length - 1, idx = -1;
      while (lo <= hi) { var mid = (lo + hi) >> 1; if (cs[mid].s <= t) { idx = mid; lo = mid + 1; } else hi = mid - 1; }
      for (var j = idx; j >= 0 && j > idx - 4; j--) if (cs[j].e > t) { txt = cs[j].t; break; }
    }
    var el = $('subtitle'); if (el._t !== txt) { el._t = txt; el.textContent = txt; }
  }
  function availableSubs(item) {
    var s = item && item.file && item.file.subtitle, out = [];
    if (s) ['en', 'fa'].forEach(function (l) { if (subUrl(s[l])) out.push(l); });
    return out;
  }

  /* ---------- lifecycle ---------- */
  var SCRUB_W = 1728, glyphT = null, unState = null, epsOpen = false;
  P.spin = function (on) { $('player-spin').classList.toggle('hidden', !on); };
  P.start = function (post, items, index, resume) {
    P.post = post; P.items = items; P.resume = resume || null; P.open = true;
    $('player').classList.remove('hidden');
    $('subtitle').style.fontSize = N.store.get('subSize', 46) + 'px';
    document.body.classList.add('playing');
    N.nav.pushHandler(P.onKey);
    P.playIndex(index);
    clearInterval(P.tickTimer); P.tickTimer = setInterval(P.tick, 250);
  };
  function seriesLine(item, i) {
    var info = item.info || {};
    if (P.items.length > 1 || info.season) return 'S' + (info.season || 1) + ' · E' + (info.episode || (i + 1)) + (N.ui.epName(item) ? ' — ' + N.ui.epName(item) : '');
    return '';
  }
  P.playIndex = function (i) {
    var item = P.items[i]; if (!item) return;
    P.reportNow();
    if (P.be) P.be.stop();
    P.index = i; P.paused = false; P.cues = []; P.subLang = N.store.get('sub', 'off');
    $('subtitle').textContent = ''; P.hideSkip(); P.hideUpNext(true); P.closeEps(true);
    var m3u8 = item.file && P.pickUrl(item.file.m3u8);
    if (typeof m3u8 === 'string') m3u8 = m3u8.replace(/^\s+|\s+$/g, '');
    if (!m3u8 || typeof m3u8 !== 'string') { var raw = ''; try { raw = JSON.stringify(item.file && item.file.m3u8).slice(0, 160); } catch (e) {} N.toast(N.t('noStream') + ' ' + raw, 6000); return P.close(); }
    $('osd-title').textContent = N.title(P.post);
    $('osd-sub').textContent = seriesLine(item, i);
    $('osd-hint').textContent = P.items.length > 1 ? N.t('hintPlayerEps') : N.t('hintPlayer');
    var start = 0, info = item.info || {};
    if (P.resume && String(P.resume.file_id) === String(info.file_id)) start = Number(P.resume.time) || 0;
    P.resume = null;
    P.be = hasAV() ? avBackend() : videoBackend();
    P.spin(true); P.glyph(false);
    clearTimeout(P.loadT);
    var be0 = P.be;
    P.loadT = setTimeout(function () { if (P.be === be0 && P.loading) P.onError('timeout'); }, 25000);
    P.loading = true;
    try { P.be.load(m3u8, start, function () {
      P.loading = false; clearTimeout(P.loadT);
      var subs = availableSubs(item);
      var want = P.subLang; if (want !== 'off' && subs.indexOf(want) < 0) want = 'off';
      P.setSub(want); P.showOsd();
    }); } catch (e) { P.onError(String(e && e.message || e)); }
    clearInterval(P.hbTimer); P.hbTimer = setInterval(P.report, N.config.heartbeatMs);
    P.seekAcc = 0; $('scrub').classList.remove('seeking');
    P.tick();
  };
  P.close = function () {
    if (!P.open) return;
    P.reportNow();
    clearInterval(P.hbTimer); clearInterval(P.tickTimer); clearTimeout(P.osdTimer); clearTimeout(P.seekTimer);
    if (P.be) P.be.stop();
    P.be = null;
    P.closeMenu(true); P.closeEps(true); P.hideUpNext(true); P.hideSkip();
    P.open = false; $('player').classList.add('hidden'); document.body.classList.remove('playing');
    $('player').classList.remove('osd-on'); $('osd').classList.add('off');
    $('subtitle').textContent = '';
    N.nav.popHandler(P.onKey);
    if (N.onPlayerClosed) N.onPlayerClosed();
  };
  P.onError = function (m) { P.loading = false; clearTimeout(P.loadT); N.toast(N.t('playErr') + ': ' + m, 6000); P.spin(false); P.showOsd(); };
  P.onEnded = function () { if (P.index + 1 < P.items.length) P.playIndex(P.index + 1); else P.close(); };

  /* ---------- progress reporting (observer) ---------- */
  P.report = function () {
    if (!P.be || !N.isLoggedIn()) return;
    var item = P.items[P.index], info = item.info || {}, u = N.session.user || {};
    N.api.call('observer', {
      post_id: info.post_id || (P.post && P.post.id), file_id: info.file_id,
      user_id: u.user_id || u.id || '', time: Math.floor(P.be.time()), duration: Math.floor(P.be.duration()),
      token: (item.options && item.options.token) || ''
    }).catch(function () {});
  };
  P.reportNow = function () { if (P.be && P.be.time() > 1) P.report(); };

  /* ---------- scrubber / OSD ---------- */
  function setT(id, txt) { var e = $(id); if (e._t !== txt) { e._t = txt; e.textContent = txt; } }
  function drawScrub(t, d, buf) {
    var f = d ? Math.max(0, Math.min(1, t / d)) : 0, b = d ? Math.max(0, Math.min(1, buf / d)) : 0, sc = $('scrub');
    sc.querySelector('.fill').style.transform = 'scaleX(' + f.toFixed(4) + ')';
    sc.querySelector('.buf').style.transform = 'scaleX(' + b.toFixed(4) + ')';
    var x = f * SCRUB_W; sc.querySelector('.thumb').style.transform = 'translateX(' + x.toFixed(1) + 'px)';
    return x;
  }
  function clockNow() { var d = new Date(), h = d.getHours(), m = d.getMinutes(); return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m; }
  function tn(v) { if (typeof v === 'string' && v.indexOf(':') > 0) { var p = v.split(':'), r = 0; for (var i = 0; i < p.length; i++) r = r * 60 + (parseFloat(p[i]) || 0); return r; } return Number(v); }
  P.tick = function () {
    if (!P.be) return;
    var t = P.be.time(), d = P.be.duration(), tt = t;
    renderSub(t);
    if (P.seekAcc && d) tt = Math.max(0, Math.min(d, t + P.seekAcc));
    var x = drawScrub(tt, d, P.be.buffered());
    setT('osd-t1', N.fmtTime(tt)); setT('osd-t2', d ? '-' + N.fmtTime(Math.max(0, d - tt)) : '');
    setT('osd-clock', clockNow());
    if (P.seekAcc) {
      setT('bub-t', N.fmtTime(tt)); setT('bub-d', (P.seekAcc > 0 ? '+' : '') + P.seekAcc + 's');
      $('scrub').querySelector('.bubble').style.transform = 'translateX(' + x.toFixed(1) + 'px)';
    }
    var o = (P.items[P.index] || {}).options || {}, show = null;
    var isS = tn(o.intro_end) > 0 && t >= tn(o.intro_start) && t < tn(o.intro_end) - 1;
    var isP = !isS && tn(o.previously_end) > 0 && t >= tn(o.previously_start) && t < tn(o.previously_end) - 1;
    if (isS) show = { label: N.t('skipIntro'), to: tn(o.intro_end) };
    else if (isP) show = { label: N.t('skipRecap'), to: tn(o.previously_end) };
    P.skip = show;
    if (show) P.showSkip(show.label + '  ⏭'); else P.hideSkip();
    // up next at credits
    var hasNext = P.index + 1 < P.items.length;
    if (hasNext && tn(o.end) > 0 && t >= tn(o.end) && !unState) P.showUpNext();
    else if (unState && tn(o.end) > 0 && t < tn(o.end) - 3 && !unState.dismissed) P.hideUpNext(true);
  };
  P.showSkip = function (label) { var b = $('skip-btn'); if (b._l !== label) { b._l = label; b.textContent = label; } b.classList.add('show'); };
  P.hideSkip = function () { $('skip-btn').classList.remove('show'); P.skip = null; };
  P.showOsd = function () {
    $('osd').classList.remove('off'); $('player').classList.add('osd-on'); $('scrub').classList.add('act'); clearTimeout(P.osdTimer);
    P.osdTimer = setTimeout(function () {
      if (!P.paused && !P.menuOpen && !epsOpen) P.hideOsd();
    }, 4000);
  };
  P.hideOsd = function () {
    clearTimeout(P.osdTimer);
    $('osd').classList.add('off'); $('player').classList.remove('osd-on'); $('scrub').classList.remove('act');
  };
  P.osdVisible = function () { return !$('osd').classList.contains('off'); };
  P.glyph = function (kind) { // kind: 'play' | 'pause' | false
    var g = $('pglyph'); clearTimeout(glyphT);
    g.classList.remove('pulse', 'hold');
    if (!kind) return;
    N.ui.setIcon(g.firstChild, kind);
    void g.offsetWidth;
    if (kind === 'pause') { g.classList.add('pulse'); glyphT = setTimeout(function () { g.classList.remove('pulse'); g.classList.add('hold'); }, 600); }
    else g.classList.add('pulse');
  };
  P.togglePause = function () {
    if (!P.be) return;
    P.paused = !P.paused;
    if (P.paused) P.be.pause(); else P.be.play();
    P.glyph(P.paused ? 'pause' : 'play');
    P.showOsd();
  };
  P.seekBy = function (sec) {
    if (!P.be) return;
    P.seekAcc += sec; clearTimeout(P.seekTimer);
    $('scrub').classList.add('seeking'); P.showOsd(); P.tick();
    P.seekTimer = setTimeout(function () {
      var d = P.be.duration(), t = P.be.time() + P.seekAcc; P.seekAcc = 0;
      $('scrub').classList.remove('seeking');
      if (d) t = Math.min(t, d - 2);
      P.be.seek(Math.max(0, t));
    }, 700);
  };

  /* ---------- up next ---------- */
  P.showUpNext = function () {
    var next = P.items[P.index + 1]; if (!next) return;
    var u = $('upnext'), auto = N.store.get('autoplay', true);
    var info = next.info || {};
    u.querySelector('.u1').textContent = N.t('nextEpisode');
    u.querySelector('.u2').textContent = 'S' + (info.season || 1) + ' · E' + (info.episode || (P.index + 2));
    u.querySelector('.u3').textContent = N.ui.epName(next) || N.title(P.post);
    var cv = N.ui.coverUrl(P.post) || N.ui.posterUrl(P.post);
    u.querySelector('.th').style.backgroundImage = cv ? 'url("' + cv + '")' : '';
    $('un-play').textContent = N.t('playNow'); $('un-cred').textContent = N.t('credits');
    unState = { sel: 'play', dismissed: false, auto: auto };
    uSel();
    u.classList.remove('hold', 'count'); u.classList.add('show');
    if (auto) { void u.offsetWidth; u.classList.add('count'); }
    u.querySelector('.cd').style.display = auto ? '' : 'none';
    u.querySelector('.cd').onanimationend = function () { if (unState && unState.auto) { P.hideUpNext(true); P.playIndex(P.index + 1); } };
  };
  function uSel() {
    $('un-play').classList.toggle('focus', !unState || unState.sel === 'play');
    $('un-cred').classList.toggle('focus', !!unState && unState.sel === 'cred');
  }
  P.hideUpNext = function (force) {
    var u = $('upnext');
    u.classList.remove('show', 'count', 'hold');
    if (force) unState = null; else if (unState) unState.dismissed = true;
  };

  /* ---------- menu (audio / subs) : end-side sheet ---------- */
  P.openMenu = function () {
    var m = $('player-menu'); m.innerHTML = ''; var item = P.items[P.index];
    function section(title, opts, onPick) {
      if (title) m.appendChild(N.el('div', 'h', title));
      opts.forEach(function (o) {
        var b = N.el('div', 'opt f fl' + (o.sel ? ' sel' : '')); b.appendChild(N.ui.icon('check')); b.appendChild(N.el('span', '', o.label));
        b.onclick = function () { onPick(o); P.closeMenu(); };
        m.appendChild(b);
      });
    }
    var audio = P.be.audioTracks();
    if (audio.length) section(N.t('audio'), audio, function (o) { P.be.setAudio(o.id); });
    var sopts = [{ id: 'off', label: N.t('off'), sel: P.subLang === 'off' }];
    availableSubs(item).forEach(function (l) { sopts.push({ id: l, label: l === 'en' ? N.t('english') : N.t('persian'), sel: P.subLang === l }); });
    section(N.t('subtitles'), sopts, function (o) { N.store.set('sub', o.id); P.setSub(o.id); });
    m.classList.add('open'); P.menuOpen = true; N.nav.pushScope(m);
    var sel = m.querySelector('.opt.sel'); N.nav.focus(sel || m.querySelector('.opt'), true);
    $('osd').classList.remove('off'); $('player').classList.add('osd-on');
  };
  P.closeMenu = function (silent) {
    if (!P.menuOpen) return;
    $('player-menu').classList.remove('open'); P.menuOpen = false; N.nav.popScope(); N.nav.clear(); if (!silent) P.showOsd();
  };

  /* ---------- episodes sheet (series, Down) ---------- */
  P.openEps = function () {
    if (P.items.length < 2) return;
    var box = $('player-eps'), tr = box.querySelector('.eptrack'); tr.innerHTML = '';
    var cur = P.items[P.index], season = (cur.info && cur.info.season) || 1, tiles = [], focusEl = null;
    P.items.forEach(function (it, i) {
      if (((it.info && it.info.season) || 1) !== season) return;
      var t = N.ui.epTile(it, i, {}); t.onclick = function () { P.closeEps(); P.playIndex(i); };
      t.onfocus2 = function () { N.ui.slideTo(tr, t._x); };
      tr.appendChild(t); tiles.push(t); if (i === P.index) focusEl = t;
    });
    N.ui.layoutTrack(tr, tiles, tiles.map(function () { return 360; }));
    box.classList.add('open'); epsOpen = true; N.nav.pushScope(box);
    N.nav.focus(focusEl || tiles[0]); $('osd').classList.remove('off'); $('player').classList.add('osd-on');
  };
  P.closeEps = function (silent) {
    if (!epsOpen) return;
    $('player-eps').classList.remove('open'); epsOpen = false; N.nav.popScope(); N.nav.clear(); if (!silent) P.showOsd();
  };

  /* ---------- keys ---------- */
  P.onKey = function (e) {
    if (!P.open) return false;
    var k = e.keyCode;
    if (P.menuOpen) {
      if (k === K.BACK || k === K.ESC || k === K.BACKSPACE) { P.closeMenu(); return true; }
      return false; // let spatial nav handle arrows/enter inside the menu scope
    }
    if (epsOpen) {
      if (k === K.BACK || k === K.ESC || k === K.BACKSPACE || k === K.DOWN) { P.closeEps(); return true; }
      return false;
    }
    if (k === K.BACK || k === K.ESC || k === K.BACKSPACE) {
      if (P.osdVisible()) { P.hideOsd(); return true; } // first Back only dismisses the bar
      P.close(); return true;
    }
    if (k === K.STOP) { P.close(); return true; }
    P.showOsd();
    if (unState && $('upnext').classList.contains('show')) {
      if (k === K.ENTER) {
        var sel = unState.sel; P.hideUpNext(sel !== 'cred');
        if (sel === 'play') P.playIndex(P.index + 1);
        return true;
      }
      if (k !== K.PLAYPAUSE) $('upnext').classList.add('hold');
      if (k === K.LEFT || k === K.RIGHT) { unState.sel = unState.sel === 'play' ? 'cred' : 'play'; uSel(); return true; }
    }
    if (k === K.PLAYPAUSE) { P.togglePause(); return true; }
    if (k === K.PLAY) { if (P.paused) P.togglePause(); return true; }
    if (k === K.PAUSE) { if (!P.paused) P.togglePause(); return true; }
    if (k === K.ENTER) {
      if (P.skip) { P.be.seek(P.skip.to); return true; }
      P.togglePause(); return true;
    }
    if (k === K.LEFT) { P.seekBy(-10); return true; }
    if (k === K.RIGHT) { P.seekBy(10); return true; }
    if (k === K.RW) { P.seekBy(-30); return true; }
    if (k === K.FF) { P.seekBy(30); return true; }
    if (k === K.UP) { P.openMenu(); return true; }
    if (k === K.DOWN) { if (P.items.length > 1) P.openEps(); return true; }
    return true;
  };
})();
