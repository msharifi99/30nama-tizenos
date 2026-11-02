/* A slow background lookup must not block the catalogue request. */
const vm=require('vm'),fs=require('fs'),assert=require('assert');
const N={config:{apiKeys:['fixture']},store:{get:()=>null}};
vm.runInNewContext(fs.readFileSync(__dirname+'/../tizen-app/js/api.js','utf8'),{N,window:{},setTimeout,clearTimeout,Promise,Date});
(async()=>{
 const starts=[],pending=[];
 N.api.rawCall=(name)=>{starts.push(name);return new Promise(resolve=>pending.push(()=>resolve({success:true,result:{}})));};
 const bg1=N.api.get('background-one',{}, {bg:true}),bg2=N.api.get('background-two',{}, {bg:true});
 await new Promise(r=>setTimeout(r,150));
 assert.deepEqual(starts,['background-one']);
 const foreground=N.api.get('archive');
 await new Promise(r=>setTimeout(r,150));
 assert.deepEqual(starts,['background-one','archive']);
 pending.splice(0).forEach(fn=>fn());
 await foreground;await bg1;await new Promise(r=>setTimeout(r,150));
 assert.deepEqual(starts,['background-one','archive','background-two']);pending.splice(0).forEach(fn=>fn());await bg2;
 console.log('Foreground catalogue starts while background lookup is still pending.');
})().catch(e=>{console.error(e);process.exitCode=1;});
