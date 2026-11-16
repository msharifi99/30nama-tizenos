/* Photo mode: pause on a moment, step frame by frame, keep the frame in the gallery.
   The TV draws <video>/AVPlay on a hardware plane that reads back black, so frames are decoded in
   software instead: fetch the HLS segment, demux the MPEG-TS, decode with WebCodecs VideoDecoder.
   Photo mode decodes about a second either side of the current frame into small previews to step
   through, then decodes the chosen frame again at full size on OK. Photos are stored by the
   background service (service/takeover.js), which also serves them read-only to the home network. */
(function () {
  var BASE = 'http://127.0.0.1:8097', K = N.keys, $ = N.$;
  var S = N.snap = {};
  var WIN = 90000, PREVIEW_W = 960; // window half-width (90 kHz ticks = 1 s), preview bitmap width

  /* ---------- service client ---------- */
  function req(method, path, body, cb) {
    var x = new XMLHttpRequest(), done = false;
    function fin(e, d) { if (!done) { done = true; cb(e, d); } }
    try {
      x.open(method, BASE + path, true); x.timeout = 15000;
      x.onload = function () { if (x.status >= 200 && x.status < 300) { try { fin(null, JSON.parse(x.responseText)); } catch (e) { fin(e); } } else fin(new Error('http ' + x.status)); };
      x.onerror = function () { fin(new Error('network')); }; x.ontimeout = function () { fin(new Error('timeout')); };
      if (body) x.setRequestHeader('Content-Type', 'application/json');
      x.send(body ? JSON.stringify(body) : null);
    } catch (e) { fin(e); }
  }
  // desktop dev talks to tools/takeover-mock.js, which is already running
  function ready(cb) { if (N.config.useProxy) return cb(null); N.takeover.ensureService(function (e) { cb(e); }); }
  S.list = function (cb) { ready(function (e) { if (e) return cb(e); req('GET', '/photos', null, cb); }); };
  S.del = function (id, cb) { req('POST', '/photos/delete', { id: id }, cb || function () {}); };
  S.src = function (id, thumb) { return BASE + (thumb ? '/t/' : '/p/') + id + '.jpg'; };

  /* ---------- HLS playlist -> segments ---------- */
  function get(url, bin) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return bin ? r.arrayBuffer() : r.text(); });
  }
  function attr(s, k) { var m = new RegExp(k + '=("([^"]*)"|[^,]*)').exec(s); return m ? (m[2] !== undefined ? m[2] : m[1]) : ''; }
  var plCache = {};
  function playlist(url) {
    if (plCache[url]) return plCache[url];
    var base = new URL(N.proxied(url), location.href).href;
    var p = plCache[url] = get(base).then(function (txt) {
      var ls = txt.split(/\r?\n/), best = null, bw = -1, codecs = '';
      for (var i = 0; i < ls.length; i++) if (/^#EXT-X-STREAM-INF/.test(ls[i])) {
        var b = +attr(ls[i], 'BANDWIDTH') || 0;
        if (b > bw) { bw = b; codecs = attr(ls[i], 'CODECS'); best = new URL(ls[i + 1].trim(), base).href; }
      }
      if (!best) return { txt: txt, base: base, codecs: '' };
      return get(best).then(function (t2) { return { txt: t2, base: best, codecs: codecs }; });
    }).then(function (pl) {
      if (/#EXT-X-MAP/.test(pl.txt)) throw new Error('fmp4');
      if (/#EXT-X-KEY:METHOD=(?!NONE)/.test(pl.txt)) throw new Error('encrypted');
      var ls = pl.txt.split(/\r?\n/), acc = 0, dur = 0, segs = [];
      for (var i = 0; i < ls.length; i++) {
        var m = /^#EXTINF:([\d.]+)/.exec(ls[i]);
        if (m) dur = +m[1];
        else if (ls[i] && ls[i][0] !== '#') { segs.push({ url: new URL(ls[i].trim(), pl.base).href, t0: acc, dur: dur }); acc += dur; }
      }
      return { segs: segs, codecs: pl.codecs, cache: {}, order: [] };
    });
    p.catch(function () { delete plCache[url]; });
    return p;
  }
  function segAt(pl, t) {
    for (var i = 0; i < pl.segs.length; i++) if (t < pl.segs[i].t0 + pl.segs[i].dur) return i;
    return pl.segs.length - 1;
  }

  /* ---------- MPEG-TS -> {type: 0x1b H.264 | 0x24 HEVC, units: [{pts 90 kHz, data Annex B}]} ---------- */
  function demuxTS(buf) {
    var d = new Uint8Array(buf), pmt = -1, vpid = -1, vtype = 0, pes = [], cur = null;
    for (var i = 0; i + 188 <= d.length; i += 188) {
      if (d[i] !== 0x47) throw new Error('not MPEG-TS');
      var pusi = d[i + 1] & 0x40, pid = ((d[i + 1] & 0x1f) << 8) | d[i + 2], afc = (d[i + 3] >> 4) & 3, o = i + 4;
      if (afc & 2) o += 1 + d[o];
      if (!(afc & 1) || o >= i + 188) continue;
      if (pid === 0 || pid === pmt) {
        if (pusi) o += 1 + d[o];
        var end = o + 3 + (((d[o + 1] & 0x0f) << 8) | d[o + 2]) - 4;
        if (pid === 0) { for (var p = o + 8; p < end; p += 4) if ((d[p] << 8 | d[p + 1]) !== 0) { pmt = ((d[p + 2] & 0x1f) << 8) | d[p + 3]; break; } }
        else for (var q = o + 12 + (((d[o + 10] & 0x0f) << 8) | d[o + 11]); q < end; q += 5 + (((d[q + 3] & 0x0f) << 8) | d[q + 4])) {
          if (vpid < 0 && (d[q] === 0x1b || d[q] === 0x24)) { vpid = ((d[q + 1] & 0x1f) << 8) | d[q + 2]; vtype = d[q]; }
        }
      } else if (pid === vpid) {
        if (pusi) { cur = { parts: [], len: 0 }; pes.push(cur); }
        if (cur) { cur.parts.push(d.subarray(o, i + 188)); cur.len += i + 188 - o; }
      }
    }
    var units = [];
    pes.forEach(function (x) {
      var b = new Uint8Array(x.len), k = 0;
      x.parts.forEach(function (p) { b.set(p, k); k += p.length; });
      if (!(b[7] & 0x80)) return; // no PTS
      var pts = (b[9] & 0x0e) * 536870912 + b[10] * 4194304 + (b[11] & 0xfe) * 16384 + b[12] * 128 + (b[13] >> 1);
      units.push({ pts: pts, data: b.subarray(9 + b[8]) });
    });
    return { type: vtype, units: units };
  }
  // keyframe? and the H.264 SPS profile/level for the codec string
  function nalInfo(b, hevc) {
    var key = false, avc = '';
    for (var i = 0; i + 4 < b.length; i++) if (b[i] === 0 && b[i + 1] === 0 && b[i + 2] === 1) {
      var o = i + 3;
      if (hevc) { var ht = (b[o] >> 1) & 0x3f; if (ht >= 16 && ht <= 21) key = true; }
      else {
        var t = b[o] & 0x1f;
        if (t === 5) key = true;
        if (t === 7) avc = 'avc1.' + [b[o + 1], b[o + 2], b[o + 3]].map(function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join('');
      }
      i += 2;
    }
    return { key: key, avc: avc };
  }

  // Segment i, fetched, demuxed and with its decoder config. Keeps the last 3 (stepping across an edge reuses them).
  function segment(pl, i) {
    if (pl.cache[i]) return pl.cache[i];
    var s = pl.segs[i];
    var p = pl.cache[i] = get(s.url, true).then(function (buf) {
      var d = demuxTS(buf), hevc = d.type === 0x24, avc = '';
      if (!d.type || !d.units.length) throw new Error('no video');
      var keys = d.units.map(function (u) { var n = nalInfo(u.data, hevc); if (n.avc && !avc) avc = n.avc; return n.key; });
      var pts = d.units.map(function (u) { return u.pts; });
      var seg = { i: i, t0: s.t0, units: d.units, keys: keys, hevc: hevc, minPts: Math.min.apply(null, pts), maxPts: Math.max.apply(null, pts) };
      if (pl.cfg) { seg.cfg = pl.cfg; return seg; }
      var codec = (pl.codecs.split(',').filter(function (c) { return /^(avc|hvc|hev)/.test(c.trim()); })[0] || '').trim() || avc || (hevc ? 'hvc1.1.6.L120.90' : 'avc1.640028');
      return [{ codec: codec, hardwareAcceleration: 'prefer-software' }, { codec: codec, hardwareAcceleration: 'no-preference' }].reduce(function (pr, cfg) {
        return pr.then(function (ok) { return ok || VideoDecoder.isConfigSupported(cfg).then(function (r) { return r.supported ? cfg : null; }); });
      }, Promise.resolve(null)).then(function (cfg) { if (!cfg) throw new Error('codec ' + codec); seg.cfg = pl.cfg = cfg; return seg; });
    });
    pl.order.push(i);
    if (pl.order.length > 3) delete pl.cache[pl.order.shift()];
    p.catch(function () { delete pl.cache[i]; });
    return p;
  }
  function us(pts) { return Math.round(pts * 100 / 9); }
  function tOf(seg, pts) { return seg.t0 + (pts - seg.minPts) / 90000; }

  // Decodes seg from the keyframe before fromPts; onFrame(VideoFrame) gets each frame in [fromPts, toPts] and must close it.
  function decodeRange(seg, fromPts, toPts, onFrame) {
    var k0 = -1, err = null, lo = us(fromPts), hi = us(toPts);
    for (var i = 0; i < seg.units.length; i++) if (seg.keys[i] && (k0 < 0 || seg.units[i].pts <= fromPts)) k0 = i;
    if (k0 < 0) return Promise.reject(new Error('no keyframe'));
    var dec = new VideoDecoder({
      output: function (f) { if (f.timestamp >= lo && f.timestamp <= hi) onFrame(f); else f.close(); },
      error: function (e) { err = e; }
    });
    dec.configure(seg.cfg);
    for (var j = k0; j < seg.units.length; j++) {
      if (seg.units[j].pts > toPts + 45000 && seg.keys[j]) break; // past the range and at a new GOP: nothing left to reorder in
      dec.decode(new EncodedVideoChunk({ type: j === k0 || seg.keys[j] ? 'key' : 'delta', timestamp: us(seg.units[j].pts), data: seg.units[j].data }));
    }
    return dec.flush().then(function () { try { dec.close(); } catch (e) {} if (err) throw err; });
  }
  function jpeg(src, w, h, q) {
    var c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(src, 0, 0, w, h);
    return c.toDataURL('image/jpeg', q).split(',')[1];
  }

  /* ---------- photo mode ---------- */
  var M = null; // {pl, seg, frames: [{pts, bmp}], idx, busy, el, cv, info, meta}
  S.can = function () { var P = N.player; return !!(P.open && P.be && !P.loading && P.snapUrl() && typeof VideoDecoder !== 'undefined'); };
  S.isOpen = function () { return !!M; };

  function freeFrames() { if (M && M.frames) M.frames.forEach(function (f) { try { f.bmp.close(); } catch (e) {} }); }
  function status(txt) { M.info.textContent = txt; }
  function draw() {
    M.el.classList.add('ready');
    var f = M.frames[M.idx], cv = M.cv, g = cv.getContext('2d'), w = f.bmp.width, h = f.bmp.height, s = Math.min(1920 / w, 1080 / h);
    g.fillStyle = '#000'; g.fillRect(0, 0, 1920, 1080);
    g.drawImage(f.bmp, (1920 - w * s) / 2, (1080 - h * s) / 2, w * s, h * s);
    var t = tOf(M.seg, f.pts), ms = Math.round((t % 1) * 1000);
    status(N.fmtTime(t) + '.' + ('00' + ms).slice(-3) + '   ' + N.t('pmHelp'));
  }
  // pickers: which preview frame to show after a window loads
  function near(pts) { return function (fr) { var i = 0; for (var k = 0; k < fr.length; k++) if (fr[k].pts <= pts) i = k; return i; }; }
  function after(pts) { return function (fr) { for (var k = 0; k < fr.length; k++) if (fr[k].pts > pts) return k; return fr.length - 1; }; }
  function before(pts) { return function (fr) { for (var k = fr.length - 1; k >= 0; k--) if (fr[k].pts < pts) return k; return 0; }; }
  // Loads the preview window around center(seg) in segment i, then shows the frame pick(frames) returns.
  function load(i, center, pick) {
    if (!M || M.busy) return;
    M.busy = true; M.el.classList.add('busy');
    var m = M;
    segment(m.pl, i).then(function (seg) {
      var c = center(seg), from = Math.max(seg.minPts, c - WIN), to = Math.min(seg.maxPts, c + WIN), pend = [];
      return decodeRange(seg, from, to, function (f) {
        var w = Math.min(PREVIEW_W, f.displayWidth), h = Math.round(f.displayHeight * w / f.displayWidth), pts = Math.round(f.timestamp * 9 / 100);
        pend.push(createImageBitmap(f, { resizeWidth: w, resizeHeight: h, resizeQuality: 'medium' }).then(function (bmp) { f.close(); return { pts: pts, bmp: bmp }; }, function (e) { f.close(); throw e; }));
      }).then(function () { return Promise.all(pend); }).then(function (frames) {
        if (M !== m) { frames.forEach(function (x) { x.bmp.close(); }); return; }
        if (!frames.length) throw new Error('no frames');
        frames.sort(function (a, b) { return a.pts - b.pts; });
        freeFrames(); m.seg = seg; m.frames = frames; m.idx = pick(frames);
        m.busy = false; m.el.classList.remove('busy'); draw();
      });
    }).catch(function (e) {
      try { console.warn('photo mode', e && e.message); } catch (x) {}
      if (M !== m) return;
      m.busy = false; m.el.classList.remove('busy');
      if (!m.frames) { S.close(); N.toast(N.t('photoNA')); } else { draw(); N.toast(N.t('photoFail')); }
    });
  }
  function at(pts) { return function () { return pts; }; }
  // Left/Right: one frame; past the loaded window, load the next one (in this segment or the neighbour)
  function step(d) {
    if (!M || M.busy || !M.frames) return;
    var j = M.idx + d, f = M.frames, seg = M.seg;
    if (j >= 0 && j < f.length) { M.idx = j; draw(); return; }
    if (d > 0) {
      var last = f[f.length - 1].pts;
      if (last < seg.maxPts) load(seg.i, at(last + WIN), after(last));
      else if (seg.i + 1 < M.pl.segs.length) load(seg.i + 1, function (s) { return s.minPts + WIN; }, function () { return 0; });
    } else {
      var first = f[0].pts;
      if (first > seg.minPts) load(seg.i, at(first - WIN), before(first));
      else if (seg.i > 0) load(seg.i - 1, function (s) { return s.maxPts - WIN; }, function (fr) { return fr.length - 1; });
    }
  }
  function jump(sec) {
    if (!M || M.busy || !M.frames) return;
    var t = Math.max(0, tOf(M.seg, M.frames[M.idx].pts) + sec);
    goTo(t);
  }
  function goTo(t) {
    var i = segAt(M.pl, t), pts = null;
    function c(seg) { pts = seg.minPts + (t - seg.t0) * 90000; return pts; }
    load(i, c, function (fr) { return near(pts)(fr); });
  }
  // Decodes the shown frame again at full size and saves it.
  function shoot() {
    if (!M || M.busy || !M.frames) return;
    var m = M, f = m.frames[m.idx], seg = m.seg, full = null;
    m.busy = true; status(N.t('photoTaking'));
    decodeRange(seg, f.pts, f.pts, function (vf) { if (full) vf.close(); else full = vf; }).then(function () {
      if (!full) throw new Error('no frame');
      var w = full.displayWidth, h = full.displayHeight, tw = 480, th = Math.round(h * tw / w);
      var body = { title: m.meta.title, sub: m.meta.sub, t: tOf(seg, f.pts), full: jpeg(full, w, h, 0.92), thumb: jpeg(full, tw, th, 0.8) };
      full.close(); full = null;
      req('POST', '/photos', body, function (e) {
        m.busy = false; if (M === m) draw();
        if (e) return N.toast(N.t('photoFail'));
        m.el.classList.remove('flash'); void m.el.offsetWidth; m.el.classList.add('flash');
        N.toast(N.t('photoSaved'));
      });
    }).catch(function () { if (full) full.close(); m.busy = false; if (M === m) draw(); N.toast(N.t('photoFail')); });
  }

  S.open = function () {
    var P = N.player;
    if (M) return;
    if (!S.can()) { N.toast(N.t('photoNA')); return; }
    if (!P.paused) P.togglePause();
    P.closeMenu(true); P.hideChrome();
    var el = N.el('div', 'busy'), cv = document.createElement('canvas'), info = N.el('div', 'pm-info');
    el.id = 'photomode'; cv.width = 1920; cv.height = 1080; el.appendChild(cv); el.appendChild(info); el.appendChild(N.el('div', 'pm-spin'));
    $('player').appendChild(el);
    M = { el: el, cv: cv, info: info, meta: { title: N.title(P.post), sub: $('osd-sub').textContent || '' } };
    status(N.t('pmLoading'));
    var t = P.be.time(), m = M;
    ready(function (e) {
      if (M !== m) return;
      if (e) { S.close(); N.toast(N.t('photoNA')); return; }
      if (P.curDirect) N.toast(N.t('pmStream'), 4000);
      playlist(P.snapUrl()).then(function (pl) {
        if (M !== m) return;
        m.pl = pl;
        goTo(t);
      }).catch(function () { if (M === m) { S.close(); N.toast(N.t('photoNA')); } });
    });
  };
  S.close = function () {
    if (!M) return;
    freeFrames(); if (M.el.parentNode) M.el.parentNode.removeChild(M.el); M = null;
  };
  // Keys while photo mode is open (all of them: nothing reaches the player underneath).
  S.key = function (k) {
    if (k === K.BACK || k === K.ESC || k === K.BACKSPACE) { S.close(); N.player.showOsd(); return true; }
    if (k === K.PLAY || k === K.PLAYPAUSE) { S.close(); if (N.player.paused) N.player.togglePause(); return true; }
    if (k === K.LEFT) step(-1);
    else if (k === K.RIGHT) step(1);
    else if (k === K.UP || k === K.FF) jump(1);
    else if (k === K.DOWN || k === K.RW) jump(-1);
    else if (k === K.ENTER || k === K.RED) shoot();
    return true;
  };
})();
