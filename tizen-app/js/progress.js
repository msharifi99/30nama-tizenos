/* Local watch progress per title. 30nama's continue_watching is not always saved (we only report to it, we can't make it persist),
   so the player also records the last position here; Details resumes from whichever of the two is further into the title. */
(function () {
  var KEY = 'prog', MAX = 300;
  var W = N.progress = {};
  function all() { var m = N.store.get(KEY, null); return m && typeof m === 'object' && !(m instanceof Array) ? m : {}; }
  // item: the playing item (its info carries file_id / season / episode)
  W.save = function (postId, item, time, duration) {
    if (!postId || !(duration > 0) || !(time >= 1)) return;
    var info = (item && item.info) || {}, m = all(), ks, i;
    m[postId] = { file_id: info.file_id, season: info.season, episode: info.episode, time: Math.floor(time), duration: Math.floor(duration), ts: Date.now() };
    ks = Object.keys(m);
    if (ks.length > MAX) { ks.sort(function (a, b) { return (m[a].ts || 0) - (m[b].ts || 0); }); for (i = 0; i < ks.length - MAX; i++) delete m[ks[i]]; }
    N.store.set(KEY, m);
  };
  W.get = function (postId) { return all()[postId] || null; };
  // index in items of a saved/backend position: by file_id, else by season + episode
  function indexOf(items, r) {
    var i, info;
    if (r.file_id !== undefined && r.file_id !== null && r.file_id !== '') for (i = 0; i < items.length; i++) { info = items[i].info; if (info && String(info.file_id) === String(r.file_id)) return i; }
    if (r.episode !== undefined && r.episode !== null) for (i = 0; i < items.length; i++) { info = items[i].info || {}; if (String(info.episode) === String(r.episode) && String(info.season || 1) === String(r.season || 1)) return i; }
    return -1;
  }
  // backend: continue_watching (or null); items sorted in episode order. Returns {file_id, time, duration, idx} or null.
  W.pick = function (postId, backend, items) {
    var c = [backend, W.get(postId)], best = null;
    c.forEach(function (r) {
      if (!r) return;
      var i = indexOf(items, r); if (i < 0) return;
      var t = Number(r.time) || 0;
      if (!best || i > best.idx || (i === best.idx && t > best.time)) best = { file_id: (items[i].info || {}).file_id, time: t, duration: Number(r.duration) || 0, idx: i };
    });
    return best;
  };
})();
