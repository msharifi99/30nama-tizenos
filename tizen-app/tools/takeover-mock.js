/* Desktop harness: runs service/takeover.js under Node with a fake `tizen` global.
   Simulates a TV: apps running, then Samsung TV Plus activating every 8s.
   Run: node tizen-app/tools/takeover-mock.js   then curl http://127.0.0.1:8097/state */
'use strict';
var path = require('path');

var apps = {
  'Nama30TvAp.TakeoverService': '30namaTakeover', 'Nama30TvAp.Nama30TV': '30nama',
  'org.volt.apps': 'Smart Hub', 'org.tizen.primevideo': 'Prime Video',
  'mock.SamsungTVPlus': 'Samsung TV Plus', 'mock.Other': 'Some Other App'
};
var running = ['Nama30TvAp.TakeoverService', 'org.volt.apps'], statusCbs = [];
function emit(id, active) { statusCbs.forEach(function (cb) { cb(id, active); }); }

global.tizen = {
  systeminfo: { getCapability: function () { return 'mock-9.0'; } },
  application: {
    getAppInfo: function (id) {
      id = id || 'Nama30TvAp.TakeoverService';
      if (!apps[id]) throw new Error('NotFoundError');
      return { id: id, name: apps[id], packageId: id.split('.')[0] === 'org' || id.indexOf('mock.') === 0 ? id : id.split('.')[0] };
    },
    getAppsInfo: function (ok) {
      setTimeout(function () {
        ok(Object.keys(apps).map(function (id) { return { id: id, name: apps[id] }; }));
      }, 50);
    },
    getAppsContext: function (ok) { ok(running.map(function (id, i) { return { id: String(i), appId: id }; })); },
    addAppStatusChangeListener: function (cb) { statusCbs.push(cb); return 1; },
    launch: function (id, ok) {
      console.log('[mock] launch', id);
      if (running.indexOf(id) < 0) running.push(id);
      emit(id, true); if (ok) ok();
    }
  }
};

process.env.WATCHER_CFG = path.join(require('os').tmpdir(), '30nama-takeover-mock.json');
process.env.PHOTO_DIR = path.join(require('os').tmpdir(), '30nama-photos-mock');
require(path.join(__dirname, '..', 'service', 'takeover.js')).onStart();
console.log('service: http://127.0.0.1:8097/state');

setInterval(function () {
  var id = 'mock.SamsungTVPlus';
  console.log('[mock] user presses the Samsung TV Plus button');
  if (running.indexOf(id) < 0) running.push(id);
  emit(id, true);
  setTimeout(function () { emit('Nama30TvAp.Nama30TV', false); }, 1500); // 30nama goes to background
}, 8000);
