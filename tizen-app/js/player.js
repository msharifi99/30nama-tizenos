/* Player: Tizen AVPlay when available, else <video> + hls.js. Own WebVTT overlay. */
(function () {
  var K = N.keys, $ = N.$, ui = N.ui;
  var P = N.player = {
    open: false, items: [], index: 0, post: null, be: null, paused: false,
    speed: 1, cues: [], subLang: 'off', subCache: {}, hbTimer: null, tickTimer: null, osdTimer: null,
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
      // Speed: AVPlay's setSpeed() is documented for integer factors only (-8..8). Many models throw on 1.25/1.5
      // (and some mute audio at 2x), so we try the value as given, and report failure so the caller can fall back to 1x.
      setSpeed: function (x) { try { av.setSpeed(x); return true; } catch (e) { return false; } },
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
        if (isDirectUrl(url)) { v.src = src; } // plain mp4/mkv file: no hls.js
        else if (window.Hls && Hls.isSupported()) {
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
      setSpeed: function (x) { try { v.playbackRate = x; v.defaultPlaybackRate = x; return true; } catch (e) { return false; } },
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
  var trim = function (s) { return N.direct.trim(s); };
  var hOfLabel = function (e) { return parseInt(String(e && e.label || '').replace(/\D/g, ''), 10) || 0; };
  var isAuto = function (e) { return !!e && /^(auto|خودکار)$/i.test(String(e.label || '')); };
  // stream (HLS) entries of a quality list: everything that is not a download file
  function hlsEntries(m) {
    var out = [];
    if (!(m instanceof Array)) { var u0 = entryUrl(m); return u0 ? [{ url: trim(u0), label: 'HLS' }] : out; }
    m.forEach(function (e) { var u = entryUrl(e); if (u && !(e && e.direct)) out.push({ url: trim(u), label: (e && e.label) || 'HLS', e: e }); });
    return out;
  }
  P.hasHls = function (item) { return hlsEntries(item && item.file && item.file.m3u8).length > 0; };
  P.hasDirect = function (item) { var m = item && item.file && item.file.m3u8; return m instanceof Array && m.some(function (e) { return e && e.direct; }); };
  P.playable = function (item) { return P.hasHls(item) || P.hasDirect(item); };
  // persisted preferred quality: 'max' | '1080' | '720' | '480'; unset -> max when download files play first, else 1080
  P.qPref = function () {
    var v = String(N.store.get('qPref', ''));
    return v === 'max' || v === '1080' || v === '720' || v === '480' ? v : (P.dlMode() === 'auto' ? 'max' : '1080');
  };
  // download files this backend may play for m, in play order for pref (default: the saved one). P.failed = urls already failed for this item.
  // AVPlay: unless the mode is 'off' (then only when the item has no stream). <video>: only as the no-stream fallback, .mp4 first.
  P.directOrder = function (m, pref) {
    if (!(m instanceof Array)) return [];
    var noHls = !hlsEntries(m).length;
    if (hasAV() ? (P.dlMode() === 'off' && !noHls) : !noHls) return [];
    var cs = N.direct.cands(m, P.failed); pref = pref || P.qPref();
    if (hasAV()) return N.direct.order(cs, pref);
    var mp4 = cs.filter(function (x) { return !!(x.e.p && x.e.p.ext === 'mp4'); });
    return N.direct.order(mp4, pref).concat(N.direct.order(cs.filter(function (x) { return mp4.indexOf(x) < 0; }), pref));
  };
  // preferred stream entry; 'Auto' only when no fixed quality exists
  function pickHls(m, pref) {
    var fixed = hlsEntries(m).filter(function (x) { return !isAuto(x.e); }), c = N.direct.pickTier(fixed, function (x) { return hOfLabel(x); }, pref);
    if (c) return c.url;
    var au = hlsEntries(m).filter(function (x) { return isAuto(x.e); })[0];
    return au && au.url;
  }
  // HLS playlist photo mode reads frames from. Download files (Max) are usually 10-bit HEVC, which this TV can't decode in a
  // readable way (WebCodecs HEVC errors, ffmpeg.wasm ran at 3 fps), so they borrow the best stream of the same title.
  P.snapUrl = function () {
    if (!P.curDirect) return P.curUrl;
    var item = P.items[P.index], m = item && item.file && item.file.m3u8;
    return (m instanceof Array && pickHls(m, '1080')) || null;
  };
  // noDirect: HLS only (used for the fallback after a direct file fails)
  P.pickUrl = function (m, noDirect) {
    if (!(m instanceof Array)) return entryUrl(m);
    var dl = noDirect ? [] : P.directOrder(m), hls = pickHls(m, P.qPref());
    if (dl.length && (P.dlMode() === 'auto' || !hls)) return dl[0].url;
    return hls || (dl[0] && dl[0].url);
  };
  // download files setting: 'off' (not listed, unless there is no stream) | 'menu' (Quality menu only) | 'auto' (play best file first)
  P.dlMode = function () { var v = N.store.get('dlMode', null); if (v === null) v = N.store.get('preferDl', false) === true ? 'auto' : 'menu'; return v; };
  // Quality menu entries: {url, label, key} key = value saved as qPref when picked (null = don't save); max marks the "Max" row
  P.qualities = function (item) {
    var m = item && item.file && item.file.m3u8, out = [], mx = P.directOrder(m, 'max')[0], tiers = [];
    if (!(m instanceof Array)) return out;
    if (mx) {
      tiers.push({ url: mx.url, label: N.t('maxQ') + ' · ' + (N.direct.short(mx.e.p) || 'MKV'), key: 'max', max: true });
      ['1080', '720', '480'].forEach(function (t) {
        var c = P.directOrder(m, t)[0];
        if (c && String(c.e.h) === t) tiers.push({ url: c.url, label: t + 'p · ' + N.t('fileQ'), key: t });
      });
    }
    hlsEntries(m).forEach(function (x) { out.push({ url: x.url, label: x.label + (tiers.length ? ' · ' + N.t('streamQ') : ''), key: isAuto(x.e) ? null : N.direct.tierOf(hOfLabel(x)) || null }); });
    return tiers.concat(out);
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
    if (!o.keepSub) P.speed = 1; // speed resets per playback (new title / episode); quality switches and fallbacks keep it
    P.index = i; P.paused = false; P.cues = []; P.subLang = o.keepSub ? P.subLang : N.store.get('sub', 'off');
    $('subtitle').textContent = ''; P.hideSkip(); P.hideUpNext(true); P.closeEps(true);
    var m3u8 = o.url || (item.file && P.pickUrl(item.file.m3u8));
    if (typeof m3u8 === 'string') m3u8 = trim(m3u8);
    if (!m3u8 || typeof m3u8 !== 'string') { var raw = ''; try { raw = JSON.stringify(item.file && item.file.m3u8).slice(0, 160); } catch (e) {} N.toast(N.t('noStream') + ' ' + raw, 6000); return P.close(); }
    // download file: make sure it really holds this episode (some uploads carry the wrong SxxEyy); swap to the right file, or skip it
    if (isDirectUrl(m3u8) && !o.verified) {
      var tok = P.vTok = {}; P.spin(true);
      N.direct.resolve(P.items, i, m3u8).then(function (u) {
        if (P.vTok !== tok || !P.open) return;
        var ok = !!u; // resolve's answer is already checked; the next pick after a skip is not
        if (!u) { P.failed[m3u8] = 1; u = P.pickUrl(item.file.m3u8); }
        P.playIndex(i, Object.assign({}, o, { url: u, verified: ok, keepFail: true }));
      });
      return;
    }
    P.vTok = null;
    $('osd-title').textContent = N.title(P.post);
    $('osd-sub').textContent = seriesLine(item, i);
    $('osd-hint').textContent = P.items.length > 1 ? N.t('hintPlayerEps') : N.t('hintPlayer');
    var start = 0, info = item.info || {};
    if (P.resume && (P.resume.idx === i || (info.file_id !== undefined && String(P.resume.file_id) === String(info.file_id)))) start = Number(P.resume.time) || 0;
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
      P.setSub(want); P.applySpeed(P.speed, true); P.showOsd();
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
  // apply playback speed to the backend; if it refuses (AVPlay fractional), revert to 1x and tell the user
  P.applySpeed = function (x, quiet) {
    if (!P.be || !P.be.setSpeed) return false;
    if (x === 1 && quiet) return true; // nothing to restore
    if (P.be.setSpeed(x)) { P.speed = x; return true; }
    P.speed = 1; P.be.setSpeed(1);
    if (!quiet) N.toast(N.t('speedNA'), 3000);
    return false;
  };
  P.close = function () {
    if (!P.open) return;
    // a throw here would leave P.open set and every later Back stuck on a dead player
    try { P.reportNow(); } catch (e) {}
    clearInterval(P.hbTimer); clearInterval(P.tickTimer); clearTimeout(P.osdTimer); clearTimeout(P.seekTimer); clearTimeout(P.loadT); clearTimeout(P.reportT);
    try { if (P.be) P.be.stop(); } catch (e) {}
    P.be = null; P.loading = false;
    N.snap.close(); P.closeMenu(true); P.closeEps(true); P.hideUpNext(true); P.hideSkip();
    P.open = false; $('player').classList.add('hidden'); document.body.classList.remove('playing');
    $('player').classList.remove('osd-on'); $('osd').classList.add('off');
    $('subtitle').textContent = '';
    N.nav.popHandler(P.onKey);
    if (N.onPlayerClosed) N.onPlayerClosed();
  };
  P.onError = function (m) {
    // a direct file failed: try the next download file (same height first, each URL once), then fall back to the best HLS entry at the same position
    if (P.open && P.curDirect) {
      var item = P.items[P.index], t = Math.max((P.be && P.be.time()) || 0, P.loadStart || 0), cm = item && item.file && item.file.m3u8, fh = 0;
      P.failed[trim(P.curUrl)] = 1;
      if (cm instanceof Array) cm.forEach(function (e) { if (e && e.direct && trim(e['default'] || e.url || '') === trim(P.curUrl)) fh = e.h || 0; });
      var nx = P.directOrder(cm), same = nx.filter(function (x) { return (x.e.h || 0) === fh; });
      nx = same.concat(nx.filter(function (x) { return same.indexOf(x) < 0; }))[0];
      if (nx) { P.playIndex(P.index, { url: nx.url, start: t, keepSub: true, keepFail: true }); return; }
      var u = item && item.file && P.pickUrl(cm, true);
      if (u && !isDirectUrl(u)) {
        N.toast(N.t('dlFallback'), 4000);
        P.playIndex(P.index, { url: trim(u), start: t, keepSub: true }); return;
      }
    }
    P.loading = false; clearTimeout(P.loadT); N.toast(N.t('playErr') + ': ' + m, 6000); P.spin(false); P.showOsd(); };
  P.onEnded = function () { if (P.index + 1 < P.items.length) P.playIndex(P.index + 1); else P.close(); };

  /* ---------- progress reporting (observer) ---------- */
  var wpChain = Promise.resolve(), wpBusy = 0;
  function sameEpisode(p) {
    var item = P.items[P.index], info = item && item.info;
    return !!(info && info.file_id !== undefined && String(info.file_id) === String(p.file_id));
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
    if (!P.be || P.loading) return;
    var item = P.items[P.index]; if (!item) return;
    var info = item.info || {}, u = N.session.user || {};
    try { N.progress.save(info.post_id || (P.post && P.post.id), item, P.be.time(), P.be.duration()); } catch (e) {}
    if (!N.isLoggedIn()) return;
    if (info.file_id === undefined || info.file_id === null || info.file_id === '') return; // synthesized from download links: nothing to report against
    var time = Math.floor(P.be.time()), duration = Math.floor(P.be.duration());
    if (!isFinite(time) || !isFinite(duration) || time < 1 || duration <= 0) return;
    var p = {
      post_id: info.post_id || (P.post && P.post.id), file_id: info.file_id,
      user_id: u.user_id || u.id || '', time: time, duration: duration,
      token: (item.options && item.options.token) || ''
    };
    // Details can use this immediately after Back, before a fresh stream response.
    P.last = { post_id: p.post_id, file_id: p.file_id, time: time, duration: duration };
    // N.wp.sync reads the server's value before storing ours. Reports stay in order on one chain; a heartbeat
    // that finds the previous one still syncing is dropped (the next comes soon), final reports always queue.
    if (wpBusy && !final) return;
    wpBusy++;
    function send() { wpBusy--; sendReport(p, !!final, 0); }
    wpChain = wpChain.then(function () { return N.wp.sync(p, info, P.post); }).then(send, send);
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
  // Up menu: a row of icon tabs (quality, audio, speed, subtitles, photo mode); the focused tab shows its options below.
  P.openMenu = function () {
    var m = $('player-menu'); m.innerHTML = ''; var item = P.items[P.index], tabs = [], cur = null;
    var bar = N.el('div', 'pm-tabs'), head = N.el('div', 'pm-h'), body = N.el('div', 'pm-body'), w = N.el('div', 'pm-in');
    m.appendChild(bar); m.appendChild(head); m.appendChild(body); body.appendChild(w);
    w.reveal = function (e) { ui.vscroll(w, e, 160); }; // clipped by pm-body; scrolled with translateY as focus moves
    function opts(list, onPick) {
      return function () {
        list.forEach(function (o) {
          var b = N.el('div', 'opt f fl' + (o.sel ? ' sel' : '')); b.appendChild(N.ui.icon('check')); b.appendChild(N.el('span', '', o.label));
          b.onclick = function () { onPick(o); P.closeMenu(); };
          w.appendChild(b);
        });
      };
    }
    function tab(key, icon, title, fill, enter) { tabs.push({ key: key, icon: icon, title: title, fill: fill, enter: enter }); }

    var q = P.qualities(item), urls = {}, pf = P.qPref(), qc = null;
    q.forEach(function (x) { urls[x.url] = 1; if (x.url === P.curUrl && (!qc || x.key === pf)) qc = x; }); // equal URLs (Max = 1080p file): mark the row matching the saved preference
    if (Object.keys(urls).length > 1) {
      q.forEach(function (x) { x.sel = x === qc; });
      tab('quality', 'hd', N.t('quality'), opts(q, function (o) {
        if (o.key) N.store.set('qPref', o.key);
        if (!o.sel) P.playIndex(P.index, { url: o.url, start: P.be.time(), keepSub: true });
      }));
    }
    var audio = P.be.audioTracks();
    if (audio.length) tab('audio', 'audio', N.t('audio'), opts(audio, function (o) { P.be.setAudio(o.id); }));
    tab('speed', 'speed', N.t('speed'), opts([1, 1.25, 1.5, 2].map(function (x) { return { id: x, label: x + 'x', sel: P.speed === x }; }), function (o) { P.applySpeed(o.id); }));
    var sopts = [{ id: 'off', label: N.t('off'), sel: P.subLang === 'off' }];
    availableSubs(item).forEach(function (l) { sopts.push({ id: l, label: l === 'en' ? N.t('english') : N.t('persian'), sel: P.subLang === l }); });
    var subFill = opts(sopts, function (o) { N.store.set('sub', o.id); P.setSub(o.id); });
    tab('subs', 'cc', N.t('subtitles'), function () {
      subFill();
      if (P.subLang === 'off') return;
      var r = N.el('div', 'opt f fl sync'), val = N.el('span', 'v');
      var paint = function () { var v = P.subOffV || 0; val.textContent = '\u2039 ' + (v > 0 ? '+' : '') + v.toFixed(1) + 's \u203a'; };
      r.appendChild(N.ui.icon('check')); r.appendChild(N.el('span', '', N.t('subSync'))); r.appendChild(val); paint();
      r.onnav = function (dir) { if (dir === 'left' || dir === 'right') { P.setSubOff((P.subOffV || 0) + 0.5 * ui.step(dir)); paint(); return true; } return false; };
      r.onclick = function () { P.setSubOff(0); paint(); };
      w.appendChild(r); w.appendChild(N.el('div', 'hint', N.t('subSyncHint')));
    });
    if (N.snap.can()) tab('photo', 'camera', N.t('photoMode'), function () {
      var b = N.el('div', 'opt f fl'); b.appendChild(N.ui.icon('camera')); b.appendChild(N.el('span', '', N.t('pmOpen')));
      b.onclick = function () { N.snap.open(); };
      w.appendChild(b);
    }, function () { N.snap.open(); });

    function show(t) {
      if (cur === t) return; cur = t; P.menuTab = t.key;
      tabs.forEach(function (x) { x.el.classList.toggle('cur', x === t); });
      head.textContent = t.title; w.innerHTML = ''; w._ty = null; w.style.transform = ''; t.fill();
      var first = w.querySelector('.opt');
      if (first) { var own = first.onnav; first.onnav = function (dir) { if (dir === 'up') return t.el; return own ? own(dir) : false; }; }
    }
    function into() { return w.querySelector('.opt.sel') || w.querySelector('.opt') || true; }
    tabs.forEach(function (t, i) {
      var b = t.el = N.el('div', 'pmt f fl'); b.appendChild(N.ui.icon(t.icon)); bar.appendChild(b);
      b.onfocus2 = function () { show(t); };
      b.onclick = function () { if (t.enter) t.enter(); else { var d = into(); if (d !== true) N.nav.focus(d); } };
      b.onnav = function (dir) {
        if (dir === 'down') return into();
        if (dir === 'up') return true;
        var n = tabs[i + ui.step(dir)]; return n ? n.el : true;
      };
    });
    var start = tabs[0];
    tabs.forEach(function (t) { if (t.key === P.menuTab) start = t; });
    show(start);
    m.classList.add('open'); P.menuOpen = true; N.nav.pushScope(m);
    N.nav.focus(start.el);
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
    if (N.snap.isOpen()) return N.snap.key(k);
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
    if (k === K.RED) { N.snap.open(); return true; } // before showOsd so the controls stay hidden
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
