/* 30nama Smart Hub Preview service (Tizen TV Node runtime, `tizen` and `webapis` globals).
   Short-lived, as Samsung requires: set the preview, reply, exit.
   - Launched by the app (js/preview.js) with operation pick + data {caller: ForegroundApp, preview: <json>}:
     saves the JSON, calls webapis.preview.setPreviewData, replies {status: 'ok' | 'error: ...'}.
   - Launched by the TV on its own (roughly every 10 minutes): re-applies the last saved JSON.
   ES5 only: Tizen 3/4 ship an old Node. */
'use strict';
var fs = require('fs');

var FILE = process.env.PREVIEW_FILE || '/home/owner/share/30nama-preview.json'; // env override is for tools/preview-mock.js

function me() { return tizen.application.getCurrentApplication(); }
function exit() { try { me().exit(); } catch (e) {} }

function load() { try { return fs.readFileSync(FILE, 'utf8'); } catch (e) { return ''; } }
function save(json) { try { fs.writeFileSync(FILE, json); } catch (e) {} }

function setPreview(json, cb) {
  var w = typeof webapis !== 'undefined' ? webapis : null;
  if (!w || !w.preview || typeof w.preview.setPreviewData !== 'function') return cb('webapis.preview unavailable');
  try {
    w.preview.setPreviewData(json, function () { cb(null); }, function (e) { cb((e && (e.name + ' ' + e.message)) || 'setPreviewData failed'); });
  } catch (e) { cb('setPreviewData threw: ' + e.message); }
}

function reply(req, status) {
  try { req.replyResult([new tizen.ApplicationControlData('status', [status])]); } catch (e) {}
}

module.exports.onStart = function () {};

module.exports.onRequest = function () {
  var req = null, data = [], json = '', fromApp = false, i;
  try { req = me().getRequestedAppControl(); } catch (e) {}
  data = (req && req.appControl && req.appControl.data) || [];
  for (i = 0; i < data.length; i++) {
    if (data[i].key === 'caller' && data[i].value[0] === 'ForegroundApp') fromApp = true;
    if (data[i].key === 'preview') json = (data[i].value || []).join('');
  }
  if (fromApp && json) {
    try { JSON.parse(json); } catch (e) { reply(req, 'error: bad json'); return exit(); }
    save(json);
  } else json = load();
  if (!json) { if (fromApp) reply(req, 'error: no data'); return exit(); }
  setPreview(json, function (err) {
    if (fromApp) reply(req, err ? 'error: ' + err : 'ok');
    exit();
  });
};

module.exports.onExit = function () {};
