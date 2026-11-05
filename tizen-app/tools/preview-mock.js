/* Desktop harness: runs service/preview.js under Node with fake `tizen` / `webapis` globals.
   Run: node tizen-app/tools/preview-mock.js [preview.json]
   1) the app's launch (caller ForegroundApp + preview JSON): prints the setPreviewData payload and the reply
   2) the TV's own periodic launch (no data): re-applies the saved JSON
   3) bad JSON: replies an error and does not overwrite the saved copy */
'use strict';
var path = require('path'), fs = require('fs'), os = require('os');

var file = process.argv[2];
var sample = file ? fs.readFileSync(file, 'utf8') : JSON.stringify({ sections: [{ title: 'Continue watching', tiles: [
  { title: 'Sample', subtitle: 'S1 · E2 · 20 min left', image_url: 'https://example.com/a.jpg', image_ratio: '16by9', action_data: '{"a":"play","id":1}', is_playable: true }
] }] });

process.env.PREVIEW_FILE = path.join(os.tmpdir(), '30nama-preview-mock.json');
try { fs.unlinkSync(process.env.PREVIEW_FILE); } catch (e) {}

var req = null, exits = 0, sets = [];
function Data(key, value) { this.key = key; this.value = value; }
global.tizen = {
  ApplicationControlData: Data,
  application: {
    getCurrentApplication: function () {
      return {
        getRequestedAppControl: function () { return req; },
        exit: function () { exits++; }
      };
    }
  }
};
global.webapis = { preview: { setPreviewData: function (json, ok, err) {
  try { JSON.parse(json); } catch (e) { return err({ name: 'InvalidValuesError', message: 'not json' }); }
  sets.push(json); ok();
} } };

var svc = require(path.join(__dirname, '..', 'service', 'preview.js'));
function launch(data) {
  var replied = null;
  req = { appControl: { operation: 'http://tizen.org/appcontrol/operation/pick', data: data || [] },
    replyResult: function (d) { replied = d[0].key + '=' + d[0].value[0]; } };
  svc.onStart(); svc.onRequest();
  return replied;
}
function check(name, cond) { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) process.exitCode = 1; }

var r1 = launch([new Data('caller', ['ForegroundApp']), new Data('preview', [sample])]);
check('app launch replies ok (' + r1 + ')', r1 === 'status=ok');
check('app launch sets the given preview', sets[0] === sample);
check('app launch exits', exits === 1);

var r2 = launch([]);
check('TV launch sends no reply', r2 === null);
check('TV launch re-applies the saved preview', sets[1] === sample);

var r3 = launch([new Data('caller', ['ForegroundApp']), new Data('preview', ['{nope'])]);
check('bad json replies an error (' + r3 + ')', /^status=error/.test(r3));
check('bad json keeps the saved copy', fs.readFileSync(process.env.PREVIEW_FILE, 'utf8') === sample);
check('every launch exits', exits === 3);

console.log('\nsetPreviewData payload:\n' + JSON.stringify(JSON.parse(sets[0]), null, 2));
