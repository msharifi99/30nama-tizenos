/* Player: Tizen AVPlay when available, else <video> + hls.js. Own WebVTT overlay. */
(function () {
  var K = N.keys, $ = N.$, ui = N.ui;
  var P = N.player = {
    open: false, items: [], index: 0, post: null, be: null, paused: false,
    cues: [], subLang: 'off', subCache: {}, hbTimer: null, tickTimer: null, osdTimer: null,
    menuOpen: false, seekAcc: 0, seekTimer: null, skip: null, resume: null, last: null, reportT: null
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
        // Direct download files (mkv/mp4, often 4K HDR remuxes): allow UHD decode and buffer deeper for high bitrates
        if (!/\.m3u8(\?|$)/i.test(String(url))) {
          try { av.setStreamingProperty('SET_MODE_4K', 'TRUE'); } catch (e) {}
          try { av.setBufferingParam('PLAYER_BUFFER_FOR_PLAY', 'PLAYER_BUFFER_SIZE_IN_SECOND', 10); } catch (e) {}
          try { av.setBufferingParam('PLAYER_BUFFER_FOR_RESUME', 'PLAYER_BUFFER_SIZE_IN_SECOND', 15); } catch (e) {}
        }
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
          if (isDirectUrl(url)) { // TVs can't decode DTS / TrueHD: no playable audio track = skip this file
            var chk = null;
            try {
              var ci = -1; try { var cs = av.getCurrentStreamInfo(); for (var q = 0; q < cs.length; q++) if (cs[q].type === 'AUDIO') ci = cs[q].index; } catch (e) {}
              chk = N.direct.audioCheck(av.getTotalTrackInfo(), ci);
            } catch (e) {}
            if (chk) {
              N.direct.setVerdict(url, chk.ok ? 'ok' : 'bad');
              if (!chk.ok) { P.onError('no playable audio'); return; }
              if (chk.select >= 0) { try { av.setSelectTrack('AUDIO', chk.select); } catch (e) {} }
            }
          }
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
  var isDirectUrl = function (u) { return /\.(mkv|mp4|m4v)([?#]|$)/i.test(String(u)); };
  // best playable download file ("Max"): see N.direct.cands; P.failed = urls already tried-and-failed for this item
  P.failed = {};
  function bestDirect(m) { var c = N.direct.cands(m, P.failed)[0]; return c && c.url; }
  // noDirect: HLS only (used for the fallback after a direct file fails)
  P.pickUrl = function (m, noDirect) {
    if (!(m instanceof Array)) return entryUrl(m);
    var mode = P.dlMode(), dl = hasAV() && !noDirect && mode !== 'off' ? bestDirect(m) : null;
    if (dl && mode === 'auto') return dl;
    // Always prefer the highest fixed quality (e.g. 2160p); Auto only as fallback
    var best = null, bestH = -1, auto = null, i, e, u;
    for (i = 0; i < m.length; i++) {
      e = m[i]; u = entryUrl(e); if (!u || (e && e.direct)) continue;
      if (e && /^(auto|خودکار)$/i.test(String(e.label || ''))) { auto = u; continue; }
      var h = parseInt(String(e && e.label || '').replace(/\D/g, ''), 10) || 0;
      if (h > bestH) { best = u; bestH = h; }
    }
    return best || auto || dl;
  };
  // download files setting: 'off' (not fetched/listed) | 'menu' (Quality menu only) | 'auto' (play best file first)
  P.dlMode = function () { var v = N.store.get('dlMode', null); if (v === null) v = N.store.get('preferDl', false) === true ? 'auto' : 'menu'; return v; };
  // quality entries the current backend can play
  P.qualities = function (item) {
    var m = item && item.file && item.file.m3u8, out = [];
    if (!(m instanceof Array)) return out;
    m.forEach(function (e) { var u = entryUrl(e); if (u && !(e && e.direct)) out.push({ url: String(u).replace(/^\s+|\s+$/g, ''), label: (e && e.label) || 'HLS' }); });
    var c = hasAV() && P.dlMode() !== 'off' ? N.direct.cands(m, P.failed)[0] : null; // one "Max" entry: best playable download file
    if (c) out.unshift({ url: c.url, label: N.t('maxQ') + ' · ' + (N.direct.short(c.e.p) || 'MKV'), max: true });
    return out;
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
  // subtitle sync offset (s, + = subtitles later), remembered per title + source (stream vs each download file)
  function offKey() {
    var item = P.items[P.index], id = (item && item.info && item.info.file_id) || '';
    return id + '|' + (P.curDirect ? decodeURIComponent(String(P.curUrl || '').split(/[?#]/)[0].split('/').pop()) : 'hls');
  }
  P.subOff = function () { return Number((N.store.get('subOff', {}) || {})[offKey()]) || 0; };
  P.setSubOff = function (v) {
    var m = N.store.get('subOff', {}) || {}, k = offKey(); v = Math.round(v * 10) / 10;
    delete m[k]; if (v) m[k] = v;
    var ks = Object.keys(m); while (ks.length > 300) delete m[ks.shift()];
    N.store.set('subOff', m); P.subOffV = v; renderSub(P.be ? P.be.time() : 0);
  };
  function renderSub(t) {
    var cs = P.cues, txt = ''; t -= P.subOffV || 0;
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
    if (N.rail && N.rail.open) N.rail.close(false);
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
    if (P.items.length > 1 || info.season) return 'S' + (info.season || 1) + ' · E' + N.ui.epLabel(info.episode, i + 1) + (N.ui.epName(item) ? ' — ' + N.ui.epName(item) : '');
    return '';
  }
  // o (optional): {url, start, keepSub} for quality switches / fallback
  P.playIndex = function (i, o) {
    o = o || {};
    var item = P.items[i]; if (!item) return;
    P.reportNow();
    clearTimeout(P.reportT);
    if (P.be) P.be.stop();
    if (!o.keepFail) P.failed = {};
    P.index = i; P.paused = false; P.cues = []; P.subLang = o.keepSub ? P.subLang : N.store.get('sub', 'off');
    $('subtitle').textContent = ''; P.hideSkip(); P.hideUpNext(true); P.closeEps(true);
    var m3u8 = o.url || (item.file && P.pickUrl(item.file.m3u8));
    if (typeof m3u8 === 'string') m3u8 = m3u8.replace(/^\s+|\s+$/g, '');
    if (!m3u8 || typeof m3u8 !== 'string') { var raw = ''; try { raw = JSON.stringify(item.file && item.file.m3u8).slice(0, 160); } catch (e) {} N.toast(N.t('noStream') + ' ' + raw, 6000); return P.close(); }
    $('osd-title').textContent = N.title(P.post);
    $('osd-sub').textContent = seriesLine(item, i);
    $('osd-hint').textContent = P.items.length > 1 ? N.t('hintPlayerEps') : N.t('hintPlayer');
    var start = 0, info = item.info || {};
    if (P.resume && String(P.resume.file_id) === String(info.file_id)) start = Number(P.resume.time) || 0;
    P.resume = null;
    if (o.start !== undefined) start = o.start;
    P.curUrl = m3u8; P.curDirect = isDirectUrl(m3u8); P.loadStart = start; P.subOffV = P.subOff();
    P.be = hasAV() ? avBackend() : videoBackend();
    P.spin(true); P.glyph(false);
    clearTimeout(P.loadT);
    var be0 = P.be;
    P.loadT = setTimeout(function () { if (P.be === be0 && P.loading) P.onError('timeout'); }, P.curDirect ? 45000 : 25000);
    P.loading = true;
    try { P.be.load(m3u8, start, function () {
      P.loading = false; clearTimeout(P.loadT);
      var subs = availableSubs(item);
      var want = P.subLang; if (want !== 'off' && subs.indexOf(want) < 0) want = 'off';
      P.setSub(want); P.showOsd();
      // The first regular heartbeat is 10 s away. Report shortly after playback
      // begins so a newly autoplayed episode is persisted even when it is exited
      // before that first heartbeat.
      clearTimeout(P.reportT);
      P.reportT = setTimeout(function () { if (P.be === be0) P.report(); }, 3000);
      clearInterval(P.hbTimer); P.hbTimer = setInterval(P.report, N.config.heartbeatMs);
    }); } catch (e) { P.onError(String(e && e.message || e)); }
    P.seekAcc = 0; P.seekN = 0; P.seekDir = 0; $('scrub').classList.remove('seeking');
    P.tick();
  };
  P.close = function () {
    if (!P.open) return;
    // a throw here would leave P.open set and every later Back stuck on a dead player
    try { P.reportNow(); } catch (e) {}
    clearInterval(P.hbTimer); clearInterval(P.tickTimer); clearTimeout(P.osdTimer); clearTimeout(P.seekTimer); clearTimeout(P.loadT); clearTimeout(P.reportT);
    try { if (P.be) P.be.stop(); } catch (e) {}
    P.be = null; P.loading = false;
    P.closeMenu(true); P.closeEps(true); P.hideUpNext(true); P.hideSkip();
    P.open = false; $('player').classList.add('hidden'); document.body.classList.remove('playing');
    $('player').classList.remove('osd-on'); $('osd').classList.add('off');
    $('subtitle').textContent = '';
    N.nav.popHandler(P.onKey);
    if (N.onPlayerClosed) N.onPlayerClosed();
  };
  P.onError = function (m) {
    // a direct file failed: try the next-ranked download file (each URL once), then fall back to the best HLS entry at the same position
    if (P.open && P.curDirect) {
      var item = P.items[P.index], t = Math.max((P.be && P.be.time()) || 0, P.loadStart || 0);
      P.failed[String(P.curUrl).replace(/^\s+|\s+$/g, '')] = 1;
      var nx = item && item.file && bestDirect(item.file.m3u8);
      if (nx) { P.playIndex(P.index, { url: nx, start: t, keepSub: true, keepFail: true }); return; }
      var u = item && item.file && P.pickUrl(item.file.m3u8, true);
      if (u && !isDirectUrl(u)) {
        N.toast(N.t('dlFallback'), 4000);
        P.playIndex(P.index, { url: String(u).replace(/^\s+|\s+$/g, ''), start: t, keepSub: true }); return;
      }
    }
    P.loading = false; clearTimeout(P.loadT); N.toast(N.t('playErr') + ': ' + m, 6000); P.spin(false); P.showOsd(); };
  P.onEnded = function () { if (P.index + 1 < P.items.length) P.playIndex(P.index + 1); else P.close(); };

  /* ---------- progress reporting (observer) ---------- */
  function sameEpisode(p) {
    var item = P.items[P.index], info = item && item.info;
    return !!(info && String(info.file_id) === String(p.file_id));
  }
  function sendReport(p, final, tryNo) {
    N.api.call('observer', p).then(function (j) {
      if (!j || !j.success) throw new Error((j && j.msg) || 'observer failed');
    }).catch(function (e) {
      // A heartbeat will soon replace a failed non-final report. Retrying an episode
      // after playback moved on could make that old episode look like the last seen.
      if (final && tryNo < 2 && (!P.open || sameEpisode(p))) {
        setTimeout(function () { sendReport(p, true, tryNo + 1); }, 2000);
      } else {
        try { console.warn('observer failed', e && e.message || e); } catch (x) {}
      }
    });
  }
  P.report = function (final) {
    if (!P.be || !N.isLoggedIn() || P.loading) return;
    var item = P.items[P.index]; if (!item) return;
    var info = item.info || {}, u = N.session.user || {};
    var time = Math.floor(P.be.time()), duration = Math.floor(P.be.duration());
    if (!isFinite(time) || !isFinite(duration) || time < 1 || duration <= 0) return;
    var p = {
      post_id: info.post_id || (P.post && P.post.id), file_id: info.file_id,
      user_id: u.user_id || u.id || '', time: time, duration: duration,
      token: (item.options && item.options.token) || ''
    };
    // Details can use this immediately after Back, before a fresh stream response.
    P.last = { post_id: p.post_id, file_id: p.file_id, time: time, duration: duration };
    sendReport(p, !!final, 0);
  };
  P.reportNow = function () { if (P.be && P.be.time() > 1) P.report(true); };

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
  function fmtDelta(s) {
    s = Math.round(s); var u = function (k) { return N.t(k); }, h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60;
    if (h) return h + u('uH') + (m ? ' ' + m + u('uM') : '');
    if (m) return m + u('uM') + (r ? ' ' + r + u('uS') : '');
    return r + u('uS');
  }
  P.tick = function () {
    if (!P.be) return;
    var t = P.be.time(), d = P.be.duration(), tt = t;
    renderSub(t);
    if (P.seekAcc && d) tt = Math.max(0, Math.min(d, t + P.seekAcc));
    var x = drawScrub(tt, d, P.be.buffered());
    setT('osd-t1', N.fmtTime(tt)); setT('osd-t2', d ? '-' + N.fmtTime(Math.max(0, d - tt)) : '');
    setT('osd-clock', clockNow());
    if (P.seekAcc) {
      setT('bub-t', N.fmtTime(tt)); setT('bub-d', (P.seekAcc > 0 ? '+' : '-') + fmtDelta(Math.abs(P.seekAcc)));
      $('scrub').querySelector('.bubble').style.transform = 'translateX(' + x.toFixed(1) + 'px)';
    }
    var o = (P.items[P.index] || {}).options || {}, show = null;
    var isS = tn(o.intro_end) > 0 && t >= tn(o.intro_start) && t < tn(o.intro_end) - 1;
    var isP = !isS && tn(o.previously_end) > 0 && t >= tn(o.previously_start) && t < tn(o.previously_end) - 1;
    if (isS) show = { label: N.t('skipIntro'), to: tn(o.intro_end) };
    else if (isP) show = { label: N.t('skipRecap'), to: tn(o.previously_end) };
    P.skip = show;
    if (show) P.showSkip(show.label); else P.hideSkip();
    // up next at credits
    var hasNext = P.index + 1 < P.items.length;
    if (hasNext && tn(o.end) > 0 && t >= tn(o.end) && !unState) P.showUpNext();
    else if (unState && tn(o.end) > 0 && t < tn(o.end) - 3 && !unState.dismissed) P.hideUpNext(true);
  };
  // the pill never takes focus by itself: OK keeps toggling pause; Up focuses it (then OK skips; Down/Back/seek keys release it)
  P.skipFocus = false;
  P.showSkip = function (label) {
    var b = $('skip-btn'), txt = P.skipFocus ? 'OK  \u00b7  ' + label + '  \u23ed' : '\u25b2  ' + label;
    if (b._l !== txt) { b._l = txt; b.textContent = txt; }
    b.classList.toggle('focus', P.skipFocus); b.classList.add('show');
  };
  P.hideSkip = function () { P.skipFocus = false; var b = $('skip-btn'); b.classList.remove('show', 'focus'); b._l = null; P.skip = null; };
  P.setSkipFocus = function (on) { P.skipFocus = on; if (P.skip) P.showSkip(P.skip.label); };
  P.showOsd = function () {
    $('osd').classList.remove('off'); $('player').classList.add('osd-on'); $('scrub').classList.add('act'); clearTimeout(P.osdTimer);
    P.osdTimer = setTimeout(function () {
      if (!P.paused && !P.menuOpen && !epsOpen) { $('osd').classList.add('off'); $('player').classList.remove('osd-on'); $('scrub').classList.remove('act'); }
    }, 4000);
  };
  P.hideChrome = function () {
    clearTimeout(P.osdTimer); $('osd').classList.add('off'); $('player').classList.remove('osd-on'); $('scrub').classList.remove('act');
    if ($('upnext').classList.contains('show')) P.hideUpNext(); // keeps autoplay countdown semantics: dismissed
  };
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
  var SEEK_STEPS = [10, 10, 10, 10, 10, 20, 30, 60, 120, 180, 300]; // per consecutive press; last repeats (cap 300s, x3 for FF/RW -> cap 600s)
  P.seekN = 0; P.seekDir = 0;
  P.seekBy = function (dir, mult) {
    if (!P.be) return;
    if (dir !== P.seekDir) { P.seekDir = dir; P.seekN = 0; }
    var sec = dir * Math.min(SEEK_STEPS[Math.min(P.seekN++, SEEK_STEPS.length - 1)] * (mult || 1), 600);
    P.seekAcc += sec; clearTimeout(P.seekTimer);
    $('scrub').classList.add('seeking'); P.showOsd(); P.tick();
    P.seekTimer = setTimeout(function () {
      var d = P.be.duration(), t = P.be.time() + P.seekAcc; P.seekAcc = 0; P.seekN = 0; P.seekDir = 0;
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
    u.querySelector('.u2').textContent = 'S' + (info.season || 1) + ' · E' + N.ui.epLabel(info.episode, P.index + 2);
    var u3 = N.ui.mq(N.ui.epName(next) || N.title(P.post), 'u3'), o3 = u.querySelector('.u3'); o3.parentNode.replaceChild(u3, o3);
    var cv = N.ui.coverUrl(P.post) || N.ui.posterUrl(P.post);
    u.querySelector('.th').style.backgroundImage = cv ? 'url("' + cv + '")' : '';
    $('un-play').textContent = N.t('playNow'); $('un-cred').textContent = N.t('credits');
    unState = { sel: 'play', dismissed: false, auto: auto, active: false };
    uSel();
    u.classList.remove('hold', 'count'); u.classList.add('show'); N.ui.mqFit(u3);
    if (auto) { void u.offsetWidth; u.classList.add('count'); }
    u.querySelector('.cd').style.display = auto ? '' : 'none';
    u.querySelector('.cd').onanimationend = function () { if (unState && unState.auto) { P.hideUpNext(true); P.playIndex(P.index + 1); } };
  };
  function uSel() {
    var on = !!unState && unState.active;
    $('un-play').classList.toggle('focus', on && unState.sel === 'play');
    $('un-cred').classList.toggle('focus', on && unState.sel === 'cred');
  }
  P.hideUpNext = function (force) {
    var u = $('upnext');
    u.classList.remove('show', 'count', 'hold');
    if (force) unState = null; else if (unState) unState.dismissed = true;
  };

  /* ---------- menu (audio / subs) : end-side sheet ---------- */
  P.openMenu = function () {
    var m = $('player-menu'); m.innerHTML = ''; var item = P.items[P.index];
    var w = N.el('div', 'pm-in'); m.appendChild(w); // clipped by the sheet; scrolled with translateY as focus moves (same as the other vertical panes)
    w.reveal = function (e) { ui.vscroll(w, e, 220); };
    function section(title, opts, onPick) {
      if (title) w.appendChild(N.el('div', 'h', title));
      opts.forEach(function (o) {
        var b = N.el('div', 'opt f fl' + (o.sel ? ' sel' : '')); b.appendChild(N.ui.icon('check')); b.appendChild(N.el('span', '', o.label));
        b.onclick = function () { onPick(o); P.closeMenu(); };
        w.appendChild(b);
      });
    }
    var audio = P.be.audioTracks();
    if (audio.length) section(N.t('audio'), audio, function (o) { P.be.setAudio(o.id); });
    var q = P.qualities(item);
    if (q.length > 1) {
      q.forEach(function (x) { x.sel = x.max ? !!P.curDirect : x.url === P.curUrl; });
      section(N.t('quality'), q, function (o) { if (!o.sel) P.playIndex(P.index, { url: o.url, start: P.be.time(), keepSub: true }); });
    }
    var sopts = [{ id: 'off', label: N.t('off'), sel: P.subLang === 'off' }];
    availableSubs(item).forEach(function (l) { sopts.push({ id: l, label: l === 'en' ? N.t('english') : N.t('persian'), sel: P.subLang === l }); });
    section(N.t('subtitles'), sopts, function (o) { N.store.set('sub', o.id); P.setSub(o.id); });
    if (P.subLang !== 'off') {
      var r = N.el('div', 'opt f fl sync'), val = N.el('span', 'v');
      var paint = function () { var v = P.subOffV || 0; val.textContent = '‹ ' + (v > 0 ? '+' : '') + v.toFixed(1) + 's ›'; };
      r.appendChild(N.ui.icon('check')); r.appendChild(N.el('span', '', N.t('subSync'))); r.appendChild(val); paint();
      r.onnav = function (dir) { if (dir === 'left' || dir === 'right') { P.setSubOff((P.subOffV || 0) + 0.5 * ui.step(dir)); paint(); return true; } return false; };
      r.onclick = function () { P.setSubOff(0); paint(); };
      w.appendChild(r); w.appendChild(N.el('div', 'hint', N.t('subSyncHint')));
    }
    m.classList.add('open'); P.menuOpen = true; N.nav.pushScope(m);
    var sel = m.querySelector('.opt.sel'); N.nav.focus(sel || m.querySelector('.opt'));
    $('osd').classList.remove('off'); $('player').classList.add('osd-on');
  };
  P.closeMenu = function (silent) {
    if (!P.menuOpen) return;
    $('player-menu').classList.remove('open'); P.menuOpen = false; N.nav.popScope(); N.nav.clear(); if (!silent) P.showOsd();
  };

  /* ---------- episodes sheet (series, Down) ---------- */
  P.openEps = function () {
    if (P.items.length < 2) return;
    var box = $('player-eps'), tr = box.querySelector('.eptrack'), cur = P.items[P.index], curS = (cur.info && cur.info.season) || 1, shown = null, tiles = [];
    var hd = box.querySelector('.peps-h'); if (!hd) { hd = N.el('div', 'peps-h'); box.insertBefore(hd, tr); }
    var tabs = box.querySelector('.tabs'); if (!tabs) { tabs = N.el('div', 'tabs'); box.insertBefore(tabs, tr); }
    tabs.innerHTML = '';
    var map = {}, seasons = [];
    P.items.forEach(function (it, i) { var s = (it.info && it.info.season) || 1; if (!map[s]) { map[s] = []; seasons.push(s); } map[s].push(i); });
    var multi = seasons.length > 1; box.classList.toggle('ms', multi);
    // tile to focus when entering a season: the playing episode if it is in there, else the first
    function target() { for (var q = 0; q < tiles.length; q++) if (tiles[q]._idx === P.index) return tiles[q]; return tiles[0]; }
    function build(s) {
      shown = s; tr.innerHTML = ''; tiles = [];
      map[s].forEach(function (i) {
        var it = P.items[i], t = N.ui.epTile(it, i, {}); t._idx = i; t.onclick = function () { P.closeEps(); if (i === P.index) { if (P.paused) P.togglePause(); } else P.playIndex(i); };
        t.onfocus2 = function () { N.ui.slideTo(tr, t._x); };
        if (multi) t.onnav = function (dir) {
          if (dir !== 'up') return false;
          for (var q = 0; q < tabs.children.length; q++) if (tabs.children[q]._s === shown) return tabs.children[q];
          return true;
        };
        if (i === P.index) { t.classList.add('now'); t.appendChild(N.el('div', 'np', N.t('nowPlaying'))); }
        tr.appendChild(t); tiles.push(t);
      });
      for (var q = 0; q < tabs.children.length; q++) if (tabs.children[q].classList.toggle('cur', tabs.children[q]._s === s) && tabs.reveal) tabs.reveal(tabs.children[q], !box.classList.contains('open'));
      hd.textContent = (multi ? '' : N.t('season') + ' ' + s + '  ·  ') + tiles.length + ' ' + N.t('episodes');
      N.ui.layoutTrack(tr, tiles, tiles.map(function () { return 360; }));
      N.ui.epTmdb(P.post, s, tiles);
      // start from a clean transform (nothing left over from a previous season); put the target episode at the start edge without animating
      var f0 = target();
      tr.style.transition = 'none'; tr.style.transform = ''; tr._s = null; N.ui.slideTo(tr, f0 ? f0._x : 184); void tr.offsetWidth; tr.style.transition = '';
    }
    if (multi) seasons.forEach(function (s, si) {
      var t = N.ui.pill(N.t('season') + ' ' + s, function () { N.nav.focus(target(), true); }, false); t._s = s;
      t.onfocus2 = function () { if (s !== shown) build(s); };
      t.onnav = function (dir) {
        if (dir === 'down') return target() || true;
        if (dir === 'up') return true;
        return tabs.children[si + N.ui.step(dir)] || true;
      };
      tabs.appendChild(t);
    });
    if (multi) N.ui.tabStrip(tabs);
    build(curS);
    box.classList.add('open'); epsOpen = true; N.nav.pushScope(box);
    N.nav.focus(target(), true); $('osd').classList.remove('off'); $('player').classList.add('osd-on');
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
      if (k === K.BACK || k === K.ESC || k === K.BACKSPACE) { P.closeEps(); return true; }
      if (k === K.DOWN && !(N.nav.cur && N.nav.cur.classList.contains('pill'))) { P.closeEps(); return true; } // Down on the season row falls through to nav (-> episodes)
      return false;
    }
    if (k === K.BACK || k === K.ESC || k === K.BACKSPACE) {
      // Back first dismisses whatever is on screen (controls / up-next card); only a bare player exits
      if (P.skipFocus) { P.setSkipFocus(false); return true; }
      if (unState && unState.active) { unState.active = false; uSel(); return true; }
      if (!$('osd').classList.contains('off') || $('upnext').classList.contains('show')) { P.hideChrome(); return true; }
      P.close(); return true;
    }
    if (k === K.STOP) { P.close(); return true; }
    P.showOsd();
    var unShown = unState && $('upnext').classList.contains('show');
    if (k === K.UP && !P.skipFocus && !(unShown && unState.active) && (unShown || P.skip)) {
      // Up focuses the pill / Up Next card (instead of opening the audio menu)
      if (unShown) { unState.active = true; $('upnext').classList.add('hold'); uSel(); } else P.setSkipFocus(true);
      return true;
    }
    if (P.skipFocus) {
      if (k === K.ENTER) { if (P.skip) P.be.seek(P.skip.to); P.setSkipFocus(false); return true; }
      if (k === K.DOWN) { P.setSkipFocus(false); return true; }
      P.setSkipFocus(false); // any other key releases it and keeps its normal meaning
    }
    if (unShown && unState.active) {
      if (k === K.DOWN || k === K.UP) { unState.active = false; uSel(); return true; }
    }
    if (unShown) {
      if (k === K.ENTER && unState.active) {
        var sel = unState.sel; P.hideUpNext(sel !== 'cred');
        if (sel === 'play') P.playIndex(P.index + 1);
        return true;
      }
      if (k !== K.PLAYPAUSE) $('upnext').classList.add('hold');
      if (unState.active && (k === K.LEFT || k === K.RIGHT)) { unState.sel = unState.sel === 'play' ? 'cred' : 'play'; uSel(); return true; }
    }
    if (k === K.PLAYPAUSE) { P.togglePause(); return true; }
    if (k === K.PLAY) { if (P.paused) P.togglePause(); return true; }
    if (k === K.PAUSE) { if (!P.paused) P.togglePause(); return true; }
    if (k === K.ENTER) { P.togglePause(); return true; }
    if (k === K.LEFT) { P.seekBy(-1); return true; }
    if (k === K.RIGHT) { P.seekBy(1); return true; }
    if (k === K.RW) { P.seekBy(-1, 3); return true; }
    if (k === K.FF) { P.seekBy(1, 3); return true; }
    if (k === K.UP) { P.openMenu(); return true; }
    if (k === K.DOWN) { if (P.items.length > 1) P.openEps(); return true; }
    return true;
  };
})();
