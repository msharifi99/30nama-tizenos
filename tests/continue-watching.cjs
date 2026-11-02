/* Regression cases based on the field structure observed on the TV.
   No account identifiers, titles, credentials or media links are stored. */
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const source = fs.readFileSync(require('path').join(__dirname, '../tizen-app/js/screens.js'), 'utf8');
const start = source.indexOf('    function cwNorm('), end = source.indexOf('\n    }', start)+6;
const context = {N:{lang:'en',ui:{epLabel:String},t:()=> 'min left'}};
vm.createContext(context);vm.runInContext(source.slice(start,end),context);
for (const percent of ['5.3343','20.1417','36.0902']) {
 const result=context.cwNorm({data:{time:150,progress:percent,season:1,episode:8}});
 assert(result.known);assert(Math.abs(result.prog-Number(percent)/100)<1e-9);
 assert(!result.label.includes('%'));assert(result.label.includes('S1 · E8'));assert(!result.label.includes('min left'));
}
assert.equal(context.cwNorm({data:{progress:'0',time:0}}).known,true);
assert.equal(context.cwNorm({data:{progress:'100'}}).prog,1);
assert.equal(context.cwNorm({continue_watching:{time:120,duration:3600}}).prog,1/30);
assert.equal(context.cwNorm({data:{time:150}}).known,false);
console.log('Continue Watching response-shape regressions passed.');
