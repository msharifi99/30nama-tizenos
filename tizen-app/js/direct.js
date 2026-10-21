/* Direct download files (mkv/mp4) as extra quality entries. Response shape of `download` is unverified, so extraction is a recursive walk. */
(function () {
  var D = N.direct = {};
  var EXT = /\.(mkv|mp4|m4v)$/i, SZ = ['size', 'file_size', 'filesize', 'bytes', 'volume'];

  var trim = D.trim = function (s) { return String(s).replace(/^\s+|\s+$/g, ''); };
  function fmtSize(v) {
    if (typeof v === 'string' && !/^\d+(\.\d+)?$/.test(v)) return /\d/.test(v) ? trim(v) : '';
    v = Number(v); if (!(v > 0)) return '';
    if (v >= 1073741824) return (v / 1073741824).toFixed(1) + ' GB';
    if (v >= 1048576) return Math.round(v / 1048576) + ' MB';
    return '';
  }
  // filename -> 'ok' | 'bad' | 'unknown': Tizen TVs cannot decode DTS / DTS-HD / TrueHD; AAC, AC3, EAC3 (incl. Atmos in DDP), Opus, MP3, FLAC are fine
  D.audioOf = function (name) {
    var a = ' ' + String(name).replace(/\.(mkv|mp4|m4v)\b/i, ' ').replace(/[._\-()\[\]\s]+/g, ' ') + ' ';
    var good = /\b(DDP|DD\+|E ?AC ?3|AC ?3|AAC|Opus|FLAC|MP3|DD ?[257]|DD)(?![A-Za-z])/i.test(a);
    var bad = /\bDTS|\bTrue ?HD|\bMLP\b/i.test(a) || (/\bAtmos\b/i.test(a) && !good);
    return good ? 'ok' : bad ? 'bad' : 'unknown';
  };
  // last path segment, decoded: stable key for a file whose URL (ip / expiry / hash) changes
  D.fname = function (url) {
    var seg = String(url).split(/[?#]/)[0].split('/').pop();
    try { return decodeURIComponent(seg); } catch (e) { return seg; }
  };
  D.verdicts = function () { var v = N.store.get('dlAudio', null); return v && typeof v === 'object' ? v : {}; };
  D.setVerdict = function (url, v) {
    var m = D.verdicts(), k = D.fname(url), ks;
    delete m[k]; m[k] = v; ks = Object.keys(m);
    while (ks.length > 300) delete m[ks.shift()];
    N.store.set('dlAudio', m);
  };
  // playable audio? tracks = webapis.avplay.getTotalTrackInfo(); returns {ok, select (track index to force, or -1)}
  D.trackBad = function (t) {
    var x = {}; try { x = JSON.parse(t.extra_info) || {}; } catch (e) {}
    var cc = trim(x.fourCC || x.fourcc || ''), c = String(x.codec || x.codec_name || x.audio_codec || '');
    return /^(dts.?|mlpa?|trhd)$/i.test(cc) || /dts|truehd|mlp/i.test(c) || /dts|truehd/i.test(cc);
  };
  D.audioCheck = function (tracks, curIdx) {
    var au = [], good = [], bad = 0, i, cur = null;
    for (i = 0; i < (tracks ? tracks.length : 0); i++) if (tracks[i] && tracks[i].type === 'AUDIO') au.push(tracks[i]);
    if (!au.length) return { ok: false, select: -1 };
    for (i = 0; i < au.length; i++) { if (D.trackBad(au[i])) bad++; else good.push(au[i]); if (au[i].index === curIdx) cur = au[i]; }
    if (!good.length) return { ok: false, select: -1 };
    return { ok: true, select: bad && (!cur || D.trackBad(cur)) ? good[0].index : -1 };
  };
  // download candidates: not known-bad, not failed this playback; best first (height, ok audio over unknown, HDR)
  D.cands = function (m, failed) {
    var vd = D.verdicts(), out = [], i, e, u, v;
    if (!(m instanceof Array)) return out;
    for (i = 0; i < m.length; i++) {
      e = m[i]; u = e && e.direct && (e['default'] || e.url); if (!u) continue;
      u = trim(u);
      if (failed && failed[u]) continue;
      v = vd[D.fname(u)] || e.a || 'unknown'; if (v === 'bad') continue;
      out.push({ e: e, url: u, ok: v === 'ok' ? 1 : 0, i: i });
    }
    out.sort(function (a, b) { return ((b.e.h || 0) - (a.e.h || 0)) || (b.ok - a.ok) || ((b.e.hdr ? 1 : 0) - (a.e.hdr ? 1 : 0)) || (a.i - b.i); });
    return out;
  };
  D.short = function (p) { return D.label(p || {}).split(' · ')[0]; };
  // filename -> metadata
  D.parse = function (url, hint) {
    var path = String(url).split(/[?#]/)[0], seg = path.split('/').pop(), raw = seg;
    try { raw = decodeURIComponent(seg); } catch (e) {}
    var ext = (EXT.exec(raw) || [''])[0].slice(1).toLowerCase();
    var hp = /HDR10(\+|Plus)/i.test(raw);
    var n = ' ' + raw.replace(/\.(mkv|mp4|m4v)$/i, '').replace(/[._\-+()\[\]]+/g, ' ') + ' ' + (hint ? ' ' + String(hint).replace(/[._\-+()\[\]]+/g, ' ') : '');
    var m, h = 0;
    if ((m = /\b(2160|1080|720|480)p\b/i.exec(n))) h = +m[1]; else if (/\b(UHD|4K)\b/i.test(n)) h = 2160;
    var hdr = hp || /\bHDR(10)?\b/i.test(n), dv = /\b(DV|DoVi|Dolby Vision)\b/i.test(n), b10 = /\b10 ?bit\b/i.test(n);
    var codec = /\b(x265|h 265|h265|hevc)\b/i.test(n) ? 'HEVC' : /\bav1\b/i.test(n) ? 'AV1' : /\b(x264|h 264|h264|avc)\b/i.test(n) ? 'H.264' : '';
    var src = /\bremux\b/i.test(n) ? 'Remux' : /\b(blu ?ray|bdrip|brrip)\b/i.test(n) ? 'BluRay' : /\bweb ?dl\b/i.test(n) ? 'WEB-DL' : /\bweb ?rip\b/i.test(n) ? 'WEBRip' : '';
    var se = /\bS(\d{1,2}) ?E(\d{1,3})\b/i.exec(n);
    return { audio: D.audioOf(raw + ' ' + (hint || '')), h: h, hdr: hdr || dv, hdr10p: hp, hdrOnly: hdr, dv: dv, b10: b10, codec: codec, src: src, ext: ext, season: se ? +se[1] : null, episode: se ? +se[2] : null };
  };
  D.label = function (p, size) {
    var a = [p.h ? p.h + 'p' : ''];
    var f = p.hdr10p ? 'HDR10+' : p.hdrOnly ? 'HDR' : ''; if (p.dv) f += (f ? ' ' : '') + 'DV'; if (!f && p.b10) f = '10bit';
    if (f) a.push(f);
    var parts = [trim(a.join(' '))];
    if (p.codec) parts.push(p.codec);
    if (p.src) parts.push(p.src);
    if (p.ext) parts.push(p.ext.toUpperCase());
    if (size) parts.push(size);
    return parts.filter(function (x) { return x; }).join(' · ');
  };
  // walk any JSON, collect {url, size, info} for each string ending in a video extension
  D.extract = function (res) {
    var out = [], seen = {}, cnt = 0;
    function add(url, ctx, key) {
      url = trim(url);
      if (!/^https?:\/\//i.test(url) || !EXT.test(url.split(/[?#]/)[0]) || seen[url]) return;
      seen[url] = 1;
      var size = '', info = '', i, k;
      if (ctx && typeof ctx === 'object' && !(ctx instanceof Array)) {
        for (i = 0; i < SZ.length; i++) if (ctx[SZ[i]] !== undefined && ctx[SZ[i]] !== null && (size = fmtSize(ctx[SZ[i]]))) break;
        ['label', 'quality', 'title', 'name'].forEach(function (f) { if (typeof ctx[f] === 'string') info += ' ' + ctx[f]; });
      }
      if (key && /(\d{3,4}p|4k|uhd)/i.test(key)) info += ' ' + key;
      var p = D.parse(url, info), meta = {};
      // ids / episode numbers next to the link (shape unverified): file_id feeds resume + progress reporting
      if (ctx && typeof ctx === 'object' && !(ctx instanceof Array)) {
        if (ctx.file_id !== undefined && ctx.file_id !== null && ctx.file_id !== '') meta.file_id = ctx.file_id;
        if (p.episode === null && parseInt(ctx.episode, 10) > 0) { p.episode = parseInt(ctx.episode, 10); p.season = parseInt(ctx.season, 10) || p.season; }
      }
      out.push({ url: url, size: size, p: p, label: D.label(p, size), meta: meta });
    }
    function walk(o, d, key) {
      if (d > 9 || ++cnt > 5000 || o === null || o === undefined) return;
      if (typeof o === 'string') { add(o, null, key); return; }
      if (typeof o !== 'object') return;
      var k;
      if (o instanceof Array) { for (var i = 0; i < o.length; i++) walk(o[i], d + 1, key); return; }
      for (k in o) if (o.hasOwnProperty(k)) {
        if (typeof o[k] === 'string') add(o[k], o, k); else walk(o[k], d + 1, k);
      }
    }
    try { walk(res, 0, ''); } catch (e) {}
    return out;
  };
  function toEntry(x) { return { label: x.label, 'default': x.url, direct: true, h: x.p.h, hdr: !!x.p.hdr, size: x.size, src: x.p.src, a: x.p.audio, p: x.p }; }
  function norm(m) { // m3u8 field -> array of entries
    if (m instanceof Array) return m.slice();
    if (m && typeof m === 'object') return [m];
    return m ? [{ label: 'HLS', 'default': m }] : [];
  }
  // attach extracted downloads to items; movie -> every link on the single item, series -> match by season+episode
  D.attach = function (items, ents, isSeries) {
    if (!items.length || !ents.length) return 0;
    var n = 0;
    items.forEach(function (it, ix) {
      var mine = ents.filter(function (x) {
        if (!isSeries && items.length === 1) return true;
        var inf = it.info || {}, s = parseInt(inf.season, 10) || 1, e = parseInt(inf.episode, 10);
        return x.p.episode !== null && (x.p.season || 1) === s && x.p.episode === e;
      });
      if (!mine.length) return;
      if (!it.file) it.file = {}; // stream item without a file object: downloads are its only source
      mine.sort(byQuality);
      it.file.m3u8 = norm(it.file.m3u8).concat(mine.map(toEntry)); n += mine.length;
    });
    return n;
  };
  function byQuality(a, b) { return (b.p.h - a.p.h) || ((b.p.hdr ? 1 : 0) - (a.p.hdr ? 1 : 0)); }
  // no stream items at all: build playable items from the download links alone (movie -> one item, series -> one per SxxEyy)
  D.synth = function (ents, isSeries) {
    var items = [], by = {}, any = [], loose = [];
    function mk(list, info) {
      list.sort(byQuality);
      for (var i = 0; i < list.length && info.file_id === undefined; i++) if (list[i].meta && list[i].meta.file_id !== undefined) info.file_id = list[i].meta.file_id;
      return { file: { m3u8: list.map(toEntry) }, info: info };
    }
    if (!ents.length) return items;
    if (!isSeries) return [mk(ents.slice(), {})];
    ents.forEach(function (x) {
      if (x.p.episode === null) { loose.push(x); return; }
      var s = x.p.season || 1, k = s + 'x' + x.p.episode;
      if (!by[k]) { by[k] = { s: s, e: x.p.episode, l: [] }; any.push(by[k]); }
      by[k].l.push(x);
    });
    if (!any.length) return [mk(loose, {})];
    any.forEach(function (g) { items.push(mk(g.l, { season: g.s, episode: g.e })); });
    return items.sort(N.ui.epCmp);
  };
  // quality tiers: heights >= 1080 (incl. 4K) share the '1080' tier for the saved preference
  D.tierOf = function (h) { return h >= 1080 ? '1080' : h >= 720 ? '720' : h > 0 ? '480' : ''; };
  // pick from arr by preferred quality: 'max' = tallest; a tier = exact height, else the tallest below it, else the shortest above it (first wins ties)
  D.pickTier = function (arr, hOf, pref) {
    var t = +pref || 0, best = null, bh = 0, i, h;
    for (i = 0; i < arr.length; i++) {
      h = hOf(arr[i]) || 0;
      if (!best) { best = arr[i]; bh = h; continue; }
      if (!t) { if (h > bh) { best = arr[i]; bh = h; } continue; }
      if (bh === t) break;
      if (h === t || (h < t ? (bh > t || h > bh) : (bh > t && h < bh))) { best = arr[i]; bh = h; }
    }
    return best;
  };
  // ranked candidates -> play order for pref: chosen first, then same height, then the rest as ranked
  D.order = function (cs, pref) {
    var c = D.pickTier(cs, function (x) { return x.e.h; }, pref), same = [], rest = [];
    if (!c) return [];
    cs.forEach(function (x) { if (x !== c) ((x.e.h || 0) === (c.e.h || 0) ? same : rest).push(x); });
    return [c].concat(same, rest);
  };
  // long: downloads are the only playable source, so wait for them (otherwise they are optional and capped at 6 s)
  D.fetch = function (post, wantStream, long) {
    var free = post.options && post.options.free_download;
    if (!(wantStream || free)) return Promise.resolve([]);
    var call = N.api.call('download', { post_id: post.id, free_download: wantStream ? 0 : 1 });
    var slow = new Promise(function (res, rej) { setTimeout(function () { rej(new Error('timeout')); }, long ? 20000 : 6000); });
    return Promise.race([call, slow]).then(function (j) {
      N.lastDownload = j;
      var r = (j && j.success) ? D.extract(j.result) : [];
      if (!(j && j.success)) r.failed = true;
      N.lastDownloadEntries = r; return r;
    }).catch(function (e) { N.lastDownload = { error: String(e && e.message || e) }; var r = []; r.failed = true; return r; }); // failed: timed out / errored (a clean empty result is not retried)
  };
})();
