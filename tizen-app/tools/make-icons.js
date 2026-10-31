// Restore packaged launcher icons from the circle-free source assets (no deps).
var fs = require('fs'), path = require('path');
var root = path.join(__dirname, '..');
fs.copyFileSync(path.join(root, 'icon-mark.png'), path.join(root, 'icon.png'));
fs.copyFileSync(path.join(root, 'icon-mark-512.png'), path.join(root, 'icon-512.png'));
console.log('icons restored from source artwork');
