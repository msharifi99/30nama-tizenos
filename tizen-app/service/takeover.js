/* 30nama button-takeover background service (Tizen TV Node runtime, `tizen` global).
   Watches which apps start / come to the foreground. When takeover is enabled and a
   trigger app activates (e.g. Samsung TV Plus, Prime Video), launches 30nama on top.
   UI talks to it over http://127.0.0.1:8097 (GET /state, POST /config, POST /clear,
   GET/POST /photos, POST /photos/delete, GET /p|t/<id>.jpg). Photos are also served read-only on LAN port 8090.
   ES5 only: Tizen 3/4 ship an old Node. */
'use strict';
var http = require('http');
var fs = require('fs');

var PORT = 8097;
var CFG_FILE = process.env.WATCHER_CFG || '/home/owner/share/30nama-takeover.json'; // env override is for tools/takeover-mock.js
var POLL_MS = 1000, DEBOUNCE_MS = 3000, KNOWN_REFRESH_MS = 600000;
var FALLBACK_TARGET = 'Nama30TvAp.Nama30TV';

var cfg = { enabled: false, triggers: [], target: FALLBACK_TARGET };
var log = [], seen = {}, running = {}, known = [];
var server = null, pollT = null, knownT = null, lastFire = 0, selfPkg = '', selfActive = false;
var stats = {
  startedAt: Date.now(), platform: '', selfAppId: '',
  pollOk: false, pollCount: 0, lastContexts: 0, otherAppsRunning: 0,
  listener: 'not tried', listenerEvents: 0, takeovers: 0, errors: 0
};

function add(type, msg) {
  log.push({ t: Date.now(), type: type, msg: msg });
  if (log.length > 300) log.shift();
  if (type === 'error') stats.errors++;
}

function loadCfg() {
  try {
    var c = JSON.parse(fs.readFileSync(CFG_FILE, 'utf8'));
    if (typeof c.enabled === 'boolean') cfg.enabled = c.enabled;
    if (Array.isArray(c.triggers)) cfg.triggers = c.triggers.filter(function (x) { return typeof x === 'string'; });
    add('info', 'config loaded');
  } catch (e) { add('info', 'no saved config (' + e.message + ')'); }
}
function saveCfg() {
  try { fs.writeFileSync(CFG_FILE, JSON.stringify({ enabled: cfg.enabled, triggers: cfg.triggers })); }
  catch (e) { add('error', 'save config: ' + e.message); }
}

function isSelf(appId) { return !!selfPkg && String(appId).indexOf(selfPkg + '.') === 0; }
function appName(appId) { try { return tizen.application.getAppInfo(appId).name; } catch (e) { return ''; } }

function note(appId, how) {
  var s = seen[appId];
  if (!s) s = seen[appId] = { name: appName(appId), first: Date.now(), last: 0, starts: 0, activations: 0 };
  s.last = Date.now();
  if (how === 'started') s.starts++; else s.activations++;
  add(how, appId + (s.name ? ' (' + s.name + ')' : ''));
  maybeTakeover(appId, how);
}

function maybeTakeover(appId, how) {
  if (how !== 'activated' && how !== 'started') return;
  if (!cfg.enabled || cfg.triggers.indexOf(appId) < 0 || appId === cfg.target || isSelf(appId)) return;
  if (selfActive) { add('info', 'ignored ' + appId + ': 30nama is already in the foreground'); return; }
  var now = Date.now();
  if (now - lastFire < DEBOUNCE_MS) return;
  lastFire = now; stats.takeovers++;
  add('takeover', appId + ' ' + how + ' -> launching ' + cfg.target);
  try {
    tizen.application.launch(cfg.target,
      function () { add('takeover', 'launched ' + cfg.target); },
      function (e) { add('error', 'launch ' + cfg.target + ': ' + e.name + ' ' + e.message); });
  } catch (e) { add('error', 'launch threw: ' + e.message); }
}

// 1) Polling: which apps are running at all.
function poll() {
  try {
    tizen.application.getAppsContext(function (ctxs) {
      var now = {}, others = 0, i, id;
      stats.pollOk = true; stats.pollCount++; stats.lastContexts = ctxs.length;
      for (i = 0; i < ctxs.length; i++) {
        id = ctxs[i].appId; now[id] = true;
        if (!isSelf(id)) others++;
      }
      stats.otherAppsRunning = others;
      if (stats.pollCount > 1) { // first poll is the baseline, not "started"
        for (id in now) if (!running[id] && !isSelf(id)) note(id, 'started');
        for (id in running) if (!now[id] && !isSelf(id)) add('stopped', id);
      } else {
        add('info', 'baseline: ' + Object.keys(now).join(', '));
        for (id in now) if (!isSelf(id) && !seen[id]) seen[id] = { name: appName(id), first: Date.now(), last: 0, starts: 0, activations: 0 };
      }
      running = now;
    }, function (e) { stats.pollOk = false; add('error', 'getAppsContext: ' + e.name + ' ' + e.message); });
  } catch (e) { stats.pollOk = false; add('error', 'getAppsContext threw: ' + e.message); }
}

// 2) Status listener (Tizen 4.0+): foreground/background changes, also for apps already resident.
function listen() {
  try {
    if (typeof tizen.application.addAppStatusChangeListener !== 'function') { stats.listener = 'not available'; return; }
    tizen.application.addAppStatusChangeListener(function (appId, isActive) {
      stats.listenerEvents++;
      if (isSelf(appId)) { selfActive = !!isActive; return; }
      // another app in front means 30nama no longer is; its own "deactivated" event can arrive after this one
      if (isActive) { selfActive = false; note(appId, 'activated'); } else add('deactivated', appId);
    });
    stats.listener = 'registered';
  } catch (e) { stats.listener = 'failed: ' + e.message; add('error', 'addAppStatusChangeListener: ' + e.message); }
}

// 3) Installed suggestions (async, cached).
var NAME_RE = /tv ?plus|prime|netflix|youtube|disney/i;
function refreshKnown() {
  var out = [], ids = {};
  function push(id, name) { if (!ids[id] && !isSelf(id)) { ids[id] = true; out.push({ id: id, name: name || id }); } }
  try { var p = tizen.application.getAppInfo('org.tizen.primevideo'); push(p.id || 'org.tizen.primevideo', p.name); } catch (e) {}
  try {
    tizen.application.getAppsInfo(function (list) {
      var i;
      for (i = 0; i < list.length; i++) if (NAME_RE.test(list[i].name || '')) push(list[i].id, list[i].name);
      known = out;
    }, function (e) { known = out; add('error', 'getAppsInfo: ' + e.name + ' ' + e.message); });
  } catch (e) { known = out; add('error', 'getAppsInfo threw: ' + e.message); }
}

function state() {
  return {
    now: Date.now(), stats: stats, cfg: cfg, seen: seen, known: known,
    running: Object.keys(running), log: log.slice(-120)
  };
}

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' });
  res.end(JSON.stringify(obj));
}

/* ---------- photos: JPEGs the UI captured, stored on disk, browsable from the LAN ---------- */
var PHOTO_DIR = process.env.PHOTO_DIR || '/home/owner/share/30nama-photos';
var LAN_PORT = 8090;
var photos = [], lanServer = null;
function photoIndex() { return PHOTO_DIR + '/index.json'; }
function loadPhotos() {
  try { fs.mkdirSync(PHOTO_DIR); } catch (e) {} // exists already, or the write below reports it
  try { photos = JSON.parse(fs.readFileSync(photoIndex(), 'utf8')) || []; } catch (e) { photos = []; }
}
function savePhotos() {
  try { fs.writeFileSync(photoIndex(), JSON.stringify(photos)); } catch (e) { add('error', 'save photos: ' + e.message); }
}
function b64(s) { return Buffer.from ? Buffer.from(s, 'base64') : new Buffer(s, 'base64'); }
function lanUrl() {
  try {
    var ifs = require('os').networkInterfaces(), k, i;
    for (k in ifs) for (i = 0; i < ifs[k].length; i++) {
      var a = ifs[k][i];
      if ((a.family === 'IPv4' || a.family === 4) && !a.internal) return 'http://' + a.address + ':' + LAN_PORT + '/';
    }
  } catch (e) {}
  return '';
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function clock(t) { t = Math.floor(t || 0); var h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return (h ? h + ':' : '') + (m < 10 && h ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s; }
function lanPage() {
  var by = {}, groups = [];
  photos.slice().reverse().forEach(function (p) { // newest first; a title's section sits where its newest photo is
    var k = p.title || '-';
    if (!by[k]) { by[k] = []; groups.push({ title: k, items: by[k] }); }
    by[k].push(p);
  });
  var body = groups.map(function (g) {
    return '<section><h2>' + esc(g.title) + ' <small>' + g.items.length + '</small></h2><div class="g">' + g.items.map(function (p) {
      var cap = (p.sub ? esc(p.sub) + ' · ' : '') + clock(p.t);
      return '<figure data-q="' + esc((p.title + ' ' + p.sub).toLowerCase()) + '"><a href="p/' + p.id + '.jpg"><img loading="lazy" src="t/' + p.id + '.jpg" alt=""></a>' +
        '<figcaption>' + cap + ' <a download="30nama-' + p.id + '.jpg" href="p/' + p.id + '.jpg">Download</a></figcaption></figure>';
    }).join('') + '</div></section>';
  }).join('');
  // search filters photos by title / episode; a section with no match hides
  var js = 'var q=document.getElementById("q");q.oninput=function(){var v=q.value.trim().toLowerCase();' +
    '[].forEach.call(document.querySelectorAll("section"),function(s){var n=0;[].forEach.call(s.querySelectorAll("figure"),function(f){var on=!v||f.getAttribute("data-q").indexOf(v)>=0;f.hidden=!on;if(on)n++;});s.hidden=!n;});};';
  return '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>30nama photos</title>' +
    '<style>body{margin:0;padding:16px;background:#0b0c10;color:#e8e8ee;font:15px system-ui,sans-serif}h1{font-size:20px;margin:0 0 12px}' +
    'h2{font-size:17px;margin:24px 0 10px}h2 small{color:#aab;font-weight:400}input{width:100%;max-width:420px;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid #333;background:#16181f;color:inherit;font:inherit}' +
    '.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}figure{margin:0}img{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:8px;background:#222;display:block}' +
    'figcaption{margin-top:6px;color:#aab}a{color:#ffb347}[hidden]{display:none!important}</style><h1>30nama photos (' + photos.length + ')</h1>' +
    (photos.length ? '<input id="q" type="search" placeholder="Search titles">' + body + '<script>' + js + '</script>' : '<p>No photos yet. While watching, press Up and pick Photo mode, or press the red button.</p>');
}
// GET routes shared by the loopback API and the LAN server: /p/<id>.jpg (full), /t/<id>.jpg (thumbnail)
function servePhotoFile(req, res) {
  var m = /^\/(p|t)\/(\d+)\.jpg$/.exec(req.url);
  if (!m) return false;
  fs.readFile(PHOTO_DIR + '/' + m[2] + (m[1] === 't' ? '_t' : '') + '.jpg', function (e, buf) {
    if (e) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'max-age=31536000' });
    res.end(buf);
  });
  return true;
}
function readBody(req, max, cb) {
  var parts = [], n = 0;
  req.on('data', function (c) { n += c.length; if (n > max) { req.destroy(); return; } parts.push(c); });
  req.on('end', function () { cb(Buffer.concat(parts).toString('utf8')); });
}
function photoApi(req, res) {
  if (req.method === 'GET' && req.url === '/photos') { send(res, 200, { photos: photos, lan: lanServer ? lanUrl() : '' }); return true; }
  if (req.method === 'POST' && req.url === '/photos') {
    readBody(req, 20e6, function (body) {
      try {
        var b = JSON.parse(body), id = Date.now();
        if (!b.full || !b.thumb) throw new Error('missing image');
        fs.writeFileSync(PHOTO_DIR + '/' + id + '.jpg', b64(b.full));
        fs.writeFileSync(PHOTO_DIR + '/' + id + '_t.jpg', b64(b.thumb));
        photos.push({ id: id, title: String(b.title || ''), sub: String(b.sub || ''), t: +b.t || 0 });
        savePhotos(); send(res, 200, { id: id });
      } catch (e) { add('error', 'save photo: ' + e.message); send(res, 500, { error: e.message }); }
    });
    return true;
  }
  if (req.method === 'POST' && req.url === '/photos/delete') {
    readBody(req, 1e4, function (body) {
      var id; try { id = +JSON.parse(body).id; } catch (e) { return send(res, 400, { error: 'bad json' }); }
      photos = photos.filter(function (p) { return p.id !== id; });
      try { fs.unlinkSync(PHOTO_DIR + '/' + id + '.jpg'); } catch (e) {}
      try { fs.unlinkSync(PHOTO_DIR + '/' + id + '_t.jpg'); } catch (e) {}
      savePhotos(); send(res, 200, { ok: true });
    });
    return true;
  }
  return servePhotoFile(req, res);
}
// Read-only on purpose: anyone on the home network can view and download, only the TV UI (loopback) can add or delete.
function startLan() {
  lanServer = http.createServer(function (req, res) {
    if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
    if (req.url === '/' || req.url === '/index.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(lanPage()); }
    if (!servePhotoFile(req, res)) { res.writeHead(404); res.end(); }
  });
  lanServer.on('error', function (e) { add('error', 'lan http: ' + e.message); lanServer = null; });
  lanServer.listen(LAN_PORT, '0.0.0.0');
}

function startServer() {
  server = http.createServer(function (req, res) {
    if (req.method === 'OPTIONS') return send(res, 204, {});
    if (photoApi(req, res)) return;
    if (req.method === 'GET' && req.url === '/state') return send(res, 200, state());
    if (req.method === 'POST' && (req.url === '/config' || req.url === '/clear')) {
      var body = '';
      req.on('data', function (c) { body += c; if (body.length > 1e5) req.destroy(); });
      req.on('end', function () {
        if (req.url === '/clear') { log = []; return send(res, 200, state()); }
        try {
          var c = JSON.parse(body || '{}');
          if (typeof c.enabled === 'boolean') cfg.enabled = c.enabled;
          if (Array.isArray(c.triggers)) cfg.triggers = c.triggers.filter(function (x) { return typeof x === 'string'; });
          saveCfg(); add('info', 'config: takeover ' + (cfg.enabled ? 'ON' : 'off') + ', triggers [' + cfg.triggers.join(', ') + ']');
          send(res, 200, state());
        } catch (e) { send(res, 400, { error: e.message }); }
      });
      return;
    }
    send(res, 404, { error: 'not found' });
  });
  server.on('error', function (e) { add('error', 'http: ' + e.message); });
  server.listen(PORT, '127.0.0.1');
}

module.exports.onStart = function () {
  try { stats.platform = tizen.systeminfo.getCapability('http://tizen.org/feature/platform.version'); } catch (e) { stats.platform = '?'; }
  try {
    var me = tizen.application.getAppInfo();
    stats.selfAppId = me.id; selfPkg = me.packageId;
    cfg.target = selfPkg + '.Nama30TV';
  } catch (e) { selfPkg = FALLBACK_TARGET.split('.')[0]; cfg.target = FALLBACK_TARGET; }
  add('info', 'service start, Tizen ' + stats.platform + ', target ' + cfg.target);
  loadCfg();
  loadPhotos();
  startServer();
  startLan();
  listen();
  refreshKnown(); knownT = setInterval(refreshKnown, KNOWN_REFRESH_MS);
  poll(); pollT = setInterval(poll, POLL_MS);
};

module.exports.onRequest = function () { add('info', 'onRequest (UI pinged the service)'); };

module.exports.onExit = function () {
  clearInterval(pollT); clearInterval(knownT);
  try { if (server) server.close(); } catch (e) {}
  try { if (lanServer) lanServer.close(); } catch (e) {}
};
