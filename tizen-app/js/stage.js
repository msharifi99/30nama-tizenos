/* Stage: one persistent full-bleed backdrop behind every screen. Two image layers crossfade. */
(function () {
  var S = N.stage = {};
  var layers = null, stageEl = null, dimEl = null, cur = -1, curSrc = null, curId = null;
  var timer = null, token = 0, cleanT = [null, null];

  function init() {
    if (layers) return;
    stageEl = N.$('stage'); dimEl = stageEl.querySelector('.stage-dim');
    layers = [stageEl.querySelector('.bd.a'), stageEl.querySelector('.bd.b')];
  }
  S.info = function (post) {
    var cover = post && post.image && post.image.cover;
    var c = cover && (cover.webp || cover.jpg);
    if (post && post._bd && (post._bdPref || !c)) return { src: post._bd, bleed: false, id: post.id };
    if (c) return { src: c, bleed: false, id: post.id };
    var po = post && post.image && post.image.poster, p = po && ((po.webp && (po.webp.medium || po.webp.large)) || (po.jpg && (po.jpg.medium || po.jpg.large)));
    if (p) return { src: p, bleed: true, id: post.id };
    return null;
  };
  S.currentId = function () { return curId; };

  function swap(info, done) {
    init();
    var my = ++token, next = cur === 0 ? 1 : 0, L = layers[next], old = cur >= 0 ? layers[cur] : null;
    clearTimeout(cleanT[next]);
    L.classList.remove('on', 'out'); L.className = 'bd';
    // Commit the hidden state even when the next backdrop is already cached.
    void L.offsetWidth;
    var finished = false;
    function show() {
      if (finished || my !== token) return; finished = true;
      L.className = 'bd' + (info.bleed ? ' bleed' : '') + ' kb' + (info.id % 4) + ' on';
      stageEl.classList.toggle('has-bleed', !!info.bleed);
      if (old) {
        old.classList.remove('on'); old.classList.add('out');
        (function (o, idx) { cleanT[idx] = setTimeout(function () { if (cur !== idx) { o.removeAttribute('src'); o.className = 'bd'; } }, 900); })(old, cur);
      }
      cur = next; curSrc = info.src; curId = info.id;
      if (done) done(true);
    }
    L.onload = null;
    L.src = info.src;
    var tm = setTimeout(function () { if (!finished && my === token) { finished = true; if (done) done(false); } }, 2500);
    var go = function () { clearTimeout(tm); show(); };
    if (L.decode) L.decode().then(go, go); else L.onload = go;
  }

  // opts: immediate (no debounce), done(ok)
  S.show = function (post, opts) {
    opts = opts || {}; init();
    var info = S.info(post); clearTimeout(timer);
    if (!info) return;
    if (info.src === curSrc) { token++; if (opts.done) opts.done(true); return; }
    if (opts.immediate) { swap(info, opts.done); return; }
    function go() { if (N.nav.isFast()) { timer = setTimeout(go, 120); return; } swap(info, opts.done); }
    timer = setTimeout(go, 350);
  };
  S.cancel = function () { clearTimeout(timer); };
  S.dim = function (level) { init(); dimEl.style.opacity = level; };
  S.details = function (on) { init(); stageEl.classList.toggle('details', !!on); };
  S.hide = function () { init(); stageEl.style.display = 'none'; };
  S.restore = function () { init(); stageEl.style.display = ''; };
})();
