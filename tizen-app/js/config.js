/* Global namespace and constants. */
var N = window.N = window.N || {};
N.config = {
  discoveryUrls: [
    'https://pub-ac69cf865ce145f8b4c1ed87dc2a9fb7.r2.dev/sdk-endpoint.json',
    'https://30update.s3.ir-thr-at1.arvanstorage.ir/sdk-endpoint.json'
  ],
  fallbackHosts: [
    { location: 'WORLD', host: 'https://world.hana-api.com/api/v2' },
    { location: 'IR', host: 'https://ir.kazem-api.com/api/v2' }
  ],
  // WEBTV key verified live (platform "WebTV"); ANDROIDTV key kept as fallback.
  apiKeys: ['83hRzBabjDnuv9SmV2GFaftpxjhZSHXYe7UnBuX5DdANdpzPvXu46jvKZHPb97As', 'VdapnkLG9EHsSmF8yeKcb4253RAuN6YX'],
  version: '1.0.0',
  // TMDB v4 "API Read Access Token" (Bearer) or v3 API Key. Keep empty here; js/tmdb-token.js or localStorage 'tmdbToken' (set from Settings) overrides. Empty = TMDB features off.
  tmdbToken: '',
  qrBase: 'https://30nama.com/auth/',
  qrPollMs: 5000,
  qrTimeoutMs: 60000,
  heartbeatMs: 10000,
  // Dev only: on localhost every outgoing request goes through tools/devserver.js.
  // Not under TizenBrew, which serves the app from http://127.0.0.1:8081/module/... on the TV itself.
  useProxy: (location.hostname === 'localhost' || location.hostname === '127.0.0.1') && location.pathname.indexOf('/module/') !== 0 && location.port !== '8081'
};
N.keys = {
  ENTER: 13, BACK: 10009, LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ESC: 27, BACKSPACE: 8, TAB: 9,
  PLAYPAUSE: 10252, PLAY: 415, PAUSE: 19, STOP: 413, FF: 417, RW: 412, IME_DONE: 65376, IME_CANCEL: 65385
};
N.store = {
  get: function (k, d) { try { var v = localStorage.getItem('n30.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set: function (k, v) { try { localStorage.setItem('n30.' + k, JSON.stringify(v)); } catch (e) {} },
  del: function (k) { try { localStorage.removeItem('n30.' + k); } catch (e) {} }
};
N.proxied = function (u) {
  if (N.config.useProxy && /^https?:/i.test(u)) return '/proxy?url=' + encodeURIComponent(u);
  return u;
};
N.$ = function (id) { return document.getElementById(id); };
N.el = function (tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = text;
  return e;
};
N.toast = function (msg, ms) {
  var t = N.$('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(N._tt); N._tt = setTimeout(function () { t.classList.remove('show'); }, ms || 3000);
};
N.fmtTime = function (s) {
  s = Math.max(0, Math.floor(s || 0)); var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  function p(n) { return n < 10 ? '0' + n : '' + n; }
  return (h ? h + ':' + p(m) : m) + ':' + p(x);
};
