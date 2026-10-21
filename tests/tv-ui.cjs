/* Offline regression test. npm install --no-save playwright, then node tests/tv-ui.cjs.
   Set CHROME_PATH, ARTIFACT_DIR, BASELINE=1, or COMPAT85=1 as needed.
   COMPAT85 discards CSS properties absent from Chromium 85; it is NOT a Tizen emulator. */
const fs = require('fs'), path = require('path'), cp = require('child_process');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const out = process.env.ARTIFACT_DIR || path.join(root, 'test-results');
fs.mkdirSync(out, {recursive:true});
const baseline = !!process.env.BASELINE, compat = !!process.env.COMPAT85;
const unsupported = /(^|[;{])\s*(?:inset(?:-(?:inline|block)(?:-(?:start|end))?)?|(?:margin|padding)-(?:inline|block)(?!-))\s*:[^;}]+;?/g;
const results = [], errors=[];
function assert(ok, message, detail) { results.push({pass:!!ok,message,detail}); if (!ok) console.error('FAIL',message,detail || ''); }
function source(file) { return baseline ? cp.execFileSync('git',['show',(process.env.BASELINE_REF || '78f14ebe18fb933591a5f92a59e35c9ba1cd1a98')+':'+file],{cwd:root}).toString() : fs.readFileSync(path.join(root,file),'utf8'); }
const artwork = (poster,i=0) => `<svg xmlns="http://www.w3.org/2000/svg" width="${poster?360:1920}" height="${poster?540:1080}"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${poster?['#81263b','#205566','#4e3c7b','#89612e'][i%4]:'#e8edf1'}"/><stop offset="1" stop-color="${poster?'#101622':'#6689aa'}"/></linearGradient></defs><path fill="url(#g)" d="M0 0h1920v1080H0z"/><path fill="#fff" opacity=".2" d="M0 440L240 100l200 270L800 80l1120 600v400H0z"/><text x="24" y="${poster?450:900}" fill="white" font-family="sans-serif" font-size="${poster?34:80}">${poster?'TV FIXTURE '+(i+1):'OFFLINE LAYOUT TEST'}</text></svg>`;
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run']});
 try {
 for(const lang of ['en','fa']) {
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.pathname.startsWith('/art')) return route.fulfill({contentType:'image/svg+xml',body:artwork(u.pathname.includes('poster'),Number(u.searchParams.get('i')))});
   if(u.hostname!=='tv.test') return route.fulfill({status:404,body:''});
   let rel='tizen-app'+(u.pathname==='/'?'/index.html':u.pathname);
   if(rel.includes('..')) return route.abort();
   if(u.pathname.includes('$WEBAPIS') || u.pathname.endsWith('tmdb-token.js'))return route.fulfill({contentType:'application/javascript',body:''});
   try {
    let body=source(rel);
    if(rel.endsWith('.css') && compat) { for(let i=0;i<4;i++)body=body.replace(unsupported,'$1'); }
    if(rel.endsWith('/api.js')) body+= `\n(function(){
      var titles=['A deliberately long sample movie title','Another sample television series title','An example with a lengthy subtitle'];
      var posts=Array.from({length:35},function(_,i){return {id:i+1,title:{english:titles[i%titles.length]+' — Long title '+(i+1),local:'عنوان فارسی بسیار طولانی برای آزمون '+(i+1)},plot:{english:'Offline fixture for layout and remote control testing.',local:'آزمون چیدمان و کنترل تلویزیون'},info:{year:2022},options:{},image:{poster:{jpg:{medium:'/art/poster?i='+i}},cover:{jpg:'/art/backdrop'}}};});
      window.testPosts=posts;N.api.init=function(){return Promise.resolve();};
      N.api.get=function(action,p){
       if(action==='home_stream')return Promise.resolve({hero_header:{posts:posts.slice(0,3)},suggested:{posts:posts},movies:{posts:posts},new_releases:{posts:posts}});
       if(action==='search')return Promise.resolve({posts:p.query==='none'?[]:posts.slice(0,17)});
       if(action==='archive')return new Promise(function(resolve){setTimeout(function(){resolve({posts:posts.slice((p.page-1)*14,p.page*14),pages:3,total:35});},100);});
       if(action==='user_list' && p.action==='list')return Promise.resolve({posts:posts.slice(0,17),pages:1,total:17});
       if(action==='single')return Promise.resolve(Object.assign({},posts[0],{options:{free_stream:true,is_series:true}}));
       if(action==='menu')return Promise.resolve({categories:[{name:'Movies',slug:'movies'}],genres:[{id:1,name:'Drama',slug:'drama',count:35}]});
       return Promise.resolve({});
      };N.api.call=function(action){return Promise.resolve({success:true,result:action==='stream'?{hls:Array.from({length:10},function(_,i){return {info:{file_id:i+1,season:i<5?1:2,episode:i%5+1},file:{m3u8:'https://offline.invalid/test.m3u8'}};})}:{}});};
     })();`;
    if(/\.(png|woff2)$/.test(rel)) return route.fulfill({contentType:rel.endsWith('.png')?'image/png':'font/woff2',body:fs.readFileSync(path.join(root,rel))});
    return route.fulfill({contentType:rel.endsWith('.css')?'text/css':rel.endsWith('.js')?'application/javascript':'text/html',body});
   } catch(e) {return route.fulfill({status:404,body:''});}
 });
 await page.addInitScript(({lang})=>{localStorage.setItem('n30.guest','true');localStorage.setItem('n30.lang',JSON.stringify(lang));localStorage.setItem('n30.calm','true');},{lang});
 await page.goto('http://tv.test/'); await page.waitForSelector('.home .card'); await page.waitForTimeout(1600);
 const check=async (name,fn)=>{const r=await page.evaluate(fn);assert(r.ok,lang+': '+name,r);};
 await check('unofficial sidebar mark renders with visible dimensions',()=>{const e=document.querySelector('.rail-brand .mark'),r=e.getBoundingClientRect();return {ok:e.tagName.toLowerCase()==='svg'&&r.width>0&&r.height>0};});
 await check('Tab is prevented without changing focus or scrolling the TV canvas',()=>{const before=N.nav.cur,e=new KeyboardEvent('keydown',{keyCode:9,bubbles:true,cancelable:true});document.dispatchEvent(e);return {ok:e.defaultPrevented&&N.nav.cur===before&&window.scrollX===0&&window.scrollY===0};});
 await page.screenshot({path:path.join(out,lang+'-home.png')});
 if(!baseline) {
   await page.keyboard.press('ArrowDown');
   for(let i=0;i<38;i++)await page.keyboard.press(lang==='fa'?'ArrowLeft':'ArrowRight');
   await page.waitForTimeout(300);
   await check('home track reveals its last poster inside safe area',()=>{const r=N.nav.cur.getBoundingClientRect();return {ok:N.nav.cur._post.id===35&&r.left>=96&&r.right<=1824,left:r.left,right:r.right};});
   await page.screenshot({path:path.join(out,lang+'-home-browse.png')});
   for(let i=0;i<3;i++)await page.keyboard.press('ArrowDown');
   await check('home guest action remains reachable after the last row',()=>({ok:!!N.nav.cur.closest('.guest-note')&&document.querySelector('.rows').style.transform.indexOf('NaN')<0}));
   await page.keyboard.press('ArrowUp');
   await check('guest action returns to the last content row',()=>({ok:!!N.nav.cur.closest('.hrow')}));
 }

 await page.evaluate(()=>N.go('search',{}, {reset:true})); await page.waitForSelector('.rgrid .card');await page.waitForTimeout(350);
 await page.screenshot({path:path.join(out,lang+'-search.png')});
 await check('grid, captions, keyboard, rail and shading geometry',()=>{
   const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
   const grid=rect('.rgrid'),panel=rect('.search .panel'),title=rect('.gt'),card=rect('.rgrid .card'),dim=rect('.stage-dim'),rail=rect('.ri .ico');
   const keys=[...document.querySelectorAll('.kb .grid .key')]; const cols=N.lang==='fa'?8:7;
   const sameRow=keys.slice(0,cols).every(k=>k.offsetTop===keys[0].offsetTop)&&keys[cols].offsetTop>keys[0].offsetTop;
   const separate=N.isRtl()?grid.right<=panel.x-20:grid.x>=panel.right+20;
   return {ok:separate && title.width<=card.width && title.width>0 && dim.width===1920 && dim.height===1080 && sameRow && (N.isRtl()?rail.x>1800:rail.right<120),grid,panel,title,dim,sameRow,rail};
 });
 if(baseline) {await page.close();continue;}
 await check('search renders five columns matching vertical navigation',()=>{const a=[...document.querySelectorAll('.rgrid .gcell')];return {ok:a[4].offsetTop===a[0].offsetTop&&a[5].offsetTop>a[0].offsetTop};});
 // Traverse keyboard edge into results using actual key events.
 await page.evaluate(()=>N.nav.focus(document.querySelector('.kb .grid').children[N.lang==='fa'?7:6],true));
 await page.keyboard.press(lang==='fa'?'ArrowLeft':'ArrowRight');
 await check('keyboard edge enters first result',()=>({ok:N.nav.cur===document.querySelector('.rgrid .card')}));
 await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');await page.waitForTimeout(350);
 await check('last result row is fully visible with caption',()=>{const c=N.nav.cur, r=c.getBoundingClientRect(),t=c._cell.querySelector('.gt').getBoundingClientRect(),v=document.querySelector('.rgrid-viewport').getBoundingClientRect();return {ok:c===document.querySelectorAll('.rgrid .card')[10]&&r.top>=v.top+6&&t.bottom<=v.bottom-6,top:r.top,bottom:t.bottom};});
 await page.screenshot({path:path.join(out,lang+'-search-scrolled.png')});
 await page.keyboard.press(lang==='fa'?'ArrowRight':'ArrowLeft');
 await check('result start edge returns to remembered keyboard key',()=>({ok:N.nav.cur.closest('.kb')!==null}));
 await page.evaluate(()=>N.nav.focus(document.querySelector('.kb .grid').firstChild,true));
 await page.keyboard.press(lang==='fa'?'ArrowRight':'ArrowLeft');
 await check('keyboard start edge opens rail',()=>({ok:N.rail.open&&N.rail.isRail(N.nav.cur)}));
 await page.screenshot({path:path.join(out,lang+'-rail.png')});
 await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:10009,bubbles:true})));
 await check('Samsung Back restores content focus',()=>({ok:!N.rail.open&&!!N.nav.cur.closest('.kb')}));
 // Search repaint must preserve live focus.
 await page.evaluate(()=>N.nav.focus(document.querySelector('.rgrid .card')));
 await page.keyboard.type('test');await page.waitForTimeout(850);
 await check('search replacement keeps a live result focused',()=>({ok:document.body.contains(N.nav.cur)&&N.nav.cur.closest('.rgrid')!==null&&document.querySelectorAll('.rgrid .card').length===17}));
 await page.evaluate(()=>N.confirm({title:'Test',ok:'OK',onOk:function(){}}));
 await page.keyboard.press('ArrowRight');
 await check('modal traps navigation',()=>({ok:!!N.nav.cur.closest('.modal')}));
 await page.keyboard.press('Escape');
 await check('closing modal is excluded from focus candidates',()=>({ok:!N.nav.candidates().some(e=>e.closest('.modal'))}));
 await page.evaluate(()=>N.go('archive',{slug:'movies',name:'Movies'},{reset:true}));await page.waitForSelector('.ggrid .card');await page.waitForTimeout(350);
 await check('archive uses seven columns',()=>{const a=[...document.querySelectorAll('.ggrid .gcell')];return {ok:a[6].offsetTop===a[0].offsetTop&&a[7].offsetTop>a[0].offsetTop};});
 for(let i=0;i<18;i++)await page.keyboard.press('ArrowDown');await page.waitForTimeout(250);
 for(let i=0;i<8;i++)await page.keyboard.press('ArrowDown');await page.waitForTimeout(300);
 await check('rapid navigation loads every archive page once',()=>({ok:document.querySelectorAll('.ggrid .card').length===35,count:document.querySelectorAll('.ggrid .card').length}));
 await check('focused archive caption remains inside safe area',()=>{const r=N.nav.cur._cell.querySelector('.gt').getBoundingClientRect();return {ok:r.top>=54&&r.bottom<=1026,bottom:r.bottom};});
 await page.screenshot({path:path.join(out,lang+'-archive.png')});
 await page.evaluate(()=>{window.savedId=N.nav.cur._post.id;N.go('settings',{});});await page.waitForSelector('.slist');await page.waitForTimeout(250);await page.keyboard.press('Escape');await page.waitForSelector('.ggrid .card');await page.waitForTimeout(900);
 await check('Back restores deep archive focus and scroll',()=>{const r=N.nav.cur.getBoundingClientRect();return {ok:N.nav.cur._post.id===savedId&&r.top>=54&&r.bottom<1026,id:N.nav.cur._post.id};});
 // Hidden ancestors keep layout size; they must never be navigation candidates.
 await page.evaluate(()=>{const p=document.createElement('div');p.style.visibility='hidden';p.innerHTML='<button class="f" style="width:50px;height:50px">Hidden</button>';document.body.appendChild(p);window.hiddenFixture=p;});
 await check('visibility-hidden ancestors are skipped',()=>({ok:!N.nav.candidates().includes(hiddenFixture.firstChild)}));
 await page.evaluate(()=>N.go('details',{id:1}));await page.waitForSelector('.d-btns .btn');await page.waitForTimeout(300);
 await check('closed episode sheet cannot receive focus',()=>({ok:!N.nav.candidates().some(e=>e.closest('.sheet-eps'))}));
 await page.keyboard.press(lang==='fa'?'ArrowLeft':'ArrowRight');await page.keyboard.press('Enter');
 await check('episode action opens a scoped sheet',()=>({ok:!!N.nav.cur.closest('.sheet-eps')&&N.nav.scopes.length===1}));
 await page.keyboard.press('ArrowUp');await page.keyboard.press(lang==='fa'?'ArrowLeft':'ArrowRight');await page.keyboard.press('ArrowDown');await page.waitForTimeout(250);
 await check('season switching focuses a live episode',()=>({ok:!!N.nav.cur.closest('.sheet-eps')&&document.body.contains(N.nav.cur)&&N.nav.cur._idx===5}));
 await page.screenshot({path:path.join(out,lang+'-episodes.png')});
 await page.keyboard.press('Escape');
 await check('Back closes episode scope and restores the action',()=>({ok:!N.nav.scopes.length&&!!N.nav.cur.closest('.d-btns')}));
 // Preserve player.js; smoke-test AVPlay control wiring with a mock, not real streaming.
 await page.evaluate(()=>{
  window.avCalls=[];let listener;
  window.webapis={avplay:{open:u=>avCalls.push('open'),setDisplayRect:()=>{},setDisplayMethod:()=>{},setStreamingProperty:()=>{},setListener:l=>{listener=l;},prepareAsync:ok=>ok(),getDuration:()=>120000,getCurrentTime:()=>10000,getState:()=> 'PLAYING',play:()=>avCalls.push('play'),pause:()=>avCalls.push('pause'),stop:()=>avCalls.push('stop'),close:()=>avCalls.push('close'),seekTo:(v,ok)=>{if(ok)ok();},getTotalTrackInfo:()=>[],setSilentSubtitle:()=>{}}};
  N.player.start(testPosts[0],[{info:{file_id:'fixture'},file:{m3u8:'https://offline.invalid/test.m3u8'}}],0);
 });
 await page.keyboard.press('Enter');await page.keyboard.press('Enter');await page.keyboard.press('Escape');await page.keyboard.press('Escape');
 await check('AVPlay start, pause, resume, close and UI restoration',()=>({ok:!N.player.open&&!document.body.classList.contains('playing')&&avCalls.includes('open')&&avCalls.includes('pause')&&avCalls.includes('close')&&document.body.contains(N.nav.cur),calls:avCalls}));
 // Exercise the library controls merged from upstream using only mocked account APIs.
 await page.evaluate(()=>{N.isLoggedIn=function(){return true;};N.lib.clear();N.go('details',{id:1},{reset:true});});
 await page.waitForSelector('.lib-watchlist');await page.waitForTimeout(350);
 await page.evaluate(()=>N.nav.focus(document.querySelector('.lib-watchlist')));await page.waitForTimeout(250);
 await check('library action labels stay centered in English and Persian',()=>{const e=document.querySelector('.lib-watchlist'),b=e.getBoundingClientRect(),l=document.querySelector('.lib-watchlist .io-label').getBoundingClientRect();return {ok:Math.abs((b.left+b.width/2)-(l.left+l.width/2))<2&&getComputedStyle(e).width==='72px'&&l.width>0,button:b.toJSON(),label:l.toJSON()};});
 await page.keyboard.press('Enter');await page.waitForTimeout(100);
 await check('library action toggles through the existing API and keeps focus',()=>({ok:N.lib.has('watchlist',1)&&N.nav.cur.classList.contains('lib-watchlist')&&N.nav.cur.classList.contains('on')&&!N.nav.cur.classList.contains('busy')}));
 await page.evaluate(()=>N.go('mylist',{}, {reset:true}));await page.waitForSelector('.ggrid .card');await page.waitForTimeout(350);
 await page.keyboard.press('ArrowDown');
 await check('My List retains seven-column navigation after the merge',()=>{const a=[...document.querySelectorAll('.ggrid .card')];return {ok:a.length===17&&N.nav.cur===a[7]&&a[6]._cell.offsetTop===a[0]._cell.offsetTop&&a[7]._cell.offsetTop>a[0]._cell.offsetTop,count:a.length,index:a.indexOf(N.nav.cur)};});
 await page.close();
 }
 assert(errors.length===0,'No uncaught browser errors',errors);
 const report={browser:browser.version(),baseline,compatibilitySimulation:compat,viewport:'1920x1080',results};
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({browser:report.browser,baseline,compat,passed:results.filter(x=>x.pass).length,failed:results.filter(x=>!x.pass).length,errors},null,2));
 if(results.some(x=>!x.pass))process.exitCode=1;
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
