/* 30nama button-takeover background service (Tizen TV Node runtime, `tizen` global).
   Watches which apps start / come to the foreground. When takeover is enabled and a
   trigger app activates (e.g. Samsung TV Plus, Prime Video), launches 30nama on top.
   UI talks to it over http://127.0.0.1:8097 (GET /state, POST /config, POST /clear).
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

function startServer() {
  server = http.createServer(function (req, res) {
    if (req.method === 'OPTIONS') return send(res, 204, {});
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
  startServer();
  listen();
  refreshKnown(); knownT = setInterval(refreshKnown, KNOWN_REFRESH_MS);
  poll(); pollT = setInterval(poll, POLL_MS);
};

// The UI always starts this service with operation/service. Any other launch (e.g. Smart Hub refreshing
// previews, which belong to PreviewService) must not leave a disabled takeover polling in the background.
module.exports.onRequest = function () {
  var op = '';
  try { var r = tizen.application.getCurrentApplication().getRequestedAppControl(); op = (r && r.appControl && r.appControl.operation) || ''; } catch (e) {}
  if (op && op !== 'http://tizen.org/appcontrol/operation/service' && !cfg.enabled) {
    add('info', 'onRequest ' + op + ' with takeover off: exiting');
    try { tizen.application.getCurrentApplication().exit(); } catch (e) {}
    return;
  }
  add('info', 'onRequest (UI pinged the service)');
};

module.exports.onExit = function () {
  clearInterval(pollT); clearInterval(knownT);
  try { if (server) server.close(); } catch (e) {}
};
