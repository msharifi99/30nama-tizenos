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
 await page.emulateMedia({reducedMotion:process.env.REDUCED_MOTION ? 'reduce' : 'no-preference'});
 await page.addInitScript(({lang,motion})=>{localStorage.setItem('n30.guest','true');localStorage.setItem('n30.lang',JSON.stringify(lang));localStorage.setItem('n30.calm',JSON.stringify(!motion));},{lang,motion:!!process.env.MOTION});
 await page.goto('http://tv.test/'); await page.waitForSelector('.home .card'); await page.waitForTimeout(1600);
 const check=async (name,fn)=>{const r=await page.evaluate(fn);assert(r.ok,lang+': '+name,r);};
 await check('unofficial sidebar mark renders with visible dimensions',()=>{const e=document.querySelector('.rail-brand .mark'),r=e.getBoundingClientRect();return {ok:e.tagName.toLowerCase()==='img'&&r.width>0&&r.height>0};});
 await check('Tab is prevented without changing focus or scrolling the TV canvas',()=>{const before=N.nav.cur,e=new KeyboardEvent('keydown',{keyCode:9,bubbles:true,cancelable:true});document.dispatchEvent(e);return {ok:e.defaultPrevented&&N.nav.cur===before&&window.scrollX===0&&window.scrollY===0};});
 await check('motion respects the selected preference',()=>{
   const reduced=document.body.classList.contains('calm');
   const duration=parseFloat(getComputedStyle(document.querySelector('.screen')).animationDuration);
   return {ok:reduced ? duration<=0.001 : duration>0.1,reduced,duration};
 });
 await page.screenshot({path:path.join(out,lang+'-home.png')});
 if(!baseline) {
   await page.keyboard.press('ArrowDown');
   const forward=lang==='fa'?'ArrowLeft':'ArrowRight', backward=lang==='fa'?'ArrowRight':'ArrowLeft';
   await page.keyboard.press(forward);await page.waitForTimeout(420);
   await check('Home row clips scrolling artwork before the sidebar',()=>{
     const viewport=N.nav.cur.closest('.home-track-window'),r=viewport.getBoundingClientRect();
     return {ok:getComputedStyle(viewport).overflow==='hidden'&&(N.isRtl()?r.right===1768:r.left===152),left:r.left,right:r.right};
   });
   await check('Home advances exactly one card without entering the menu',()=>({ok:N.nav.cur._post.id===2&&!N.rail.open}));
   await check('Home slides the incoming card toward the selection anchor',()=>({ok:N.nav.cur.closest('.track')._s>0}));
   await check('Home selected card grows while its neighbour returns to rest',()=>{
     const active=N.nav.cur,previous=active.previousElementSibling;
     const scale=e=>new DOMMatrix(getComputedStyle(e).transform).a;
     return {ok:scale(active)>1.1&&Math.abs(scale(previous)-1)<0.01};
   });
   await page.keyboard.down(backward);await page.keyboard.down(backward);
   await check('held arrow at the first Home card cannot open the menu',()=>({ok:!N.rail.open&&N.nav.cur._post.id===1}));
   await page.keyboard.up(backward);
   await page.keyboard.press(backward);
   await check('a deliberate edge press opens the menu',()=>({ok:N.rail.open&&N.rail.isRail(N.nav.cur)}));
   await page.keyboard.press(forward);
   await check('leaving the menu restores the selected Home card',()=>({ok:!N.rail.open&&N.nav.cur._post.id===1}));
   await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:10252,bubbles:true})));
   await check('Play/Pause opens the browsing menu',()=>({ok:N.rail.open&&N.rail.isRail(N.nav.cur)}));
   await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:10252,repeat:true,bubbles:true})));
   await check('holding the menu shortcut does not toggle repeatedly',()=>({ok:N.rail.open}));
   await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:10252,bubbles:true})));
   await check('Play/Pause closes the menu and restores the card',()=>({ok:!N.rail.open&&N.nav.cur._post.id===1}));
   const samples=await page.evaluate(async()=>{
     const tr=N.nav.cur.closest('.track'),cs=[...tr.querySelectorAll('.card')];
     N.nav.focus(cs[10]);
     const positions=[];
     for(let i=0;i<8;i++){await new Promise(r=>setTimeout(r,30));positions.push(new DOMMatrix(getComputedStyle(tr).transform).m41);}
     return {positions,target:tr._s*(N.isRtl()?1:-1),calm:document.body.classList.contains('calm')};
   });
   assert(samples.calm||new Set(samples.positions.map(v=>Math.round(v))).size>=4,lang+': Home carousel moves through intermediate positions',samples);
   await page.waitForTimeout(100);
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
 await check('episode action opens a scoped sheet with the shared artwork cards',()=>({ok:!!N.nav.cur.closest('.sheet-eps')&&N.nav.scopes.length===1&&N.nav.cur.classList.contains('episode-card')&&!!N.nav.cur.querySelector('.episode-art')&&getComputedStyle(document.querySelector('.sheet-eps')).backgroundImage==='none'}));
 await page.keyboard.press('ArrowUp');await page.keyboard.press(lang==='fa'?'ArrowLeft':'ArrowRight');await page.keyboard.press('ArrowDown');await page.waitForTimeout(250);
 await check('season switching focuses a live episode',()=>({ok:!!N.nav.cur.closest('.sheet-eps')&&document.body.contains(N.nav.cur)&&N.nav.cur._idx===5}));
 await page.screenshot({path:path.join(out,lang+'-episodes.png')});
 await page.keyboard.press('Escape');
 await check('closing episode sheet rejects focus immediately',()=>({ok:!N.nav.candidates().some(e=>e.closest('.sheet-eps'))}));
 await check('Back closes episode scope and restores the action',()=>({ok:!N.nav.scopes.length&&!!N.nav.cur.closest('.d-btns')}));
 // Preserve player.js; smoke-test AVPlay control wiring with a mock, not real streaming.
 await page.evaluate(()=>{
  window.avCalls=[];let listener;
  window.webapis={avplay:{open:u=>avCalls.push('open'),setDisplayRect:()=>{},setDisplayMethod:()=>{},setStreamingProperty:()=>{},setListener:l=>{listener=l;},prepareAsync:ok=>ok(),getDuration:()=>120000,getCurrentTime:()=>10000,getState:()=> 'PLAYING',play:()=>avCalls.push('play'),pause:()=>avCalls.push('pause'),stop:()=>avCalls.push('stop'),close:()=>avCalls.push('close'),seekTo:(v,ok)=>{window.lastSeek=v;if(ok)ok();},getTotalTrackInfo:()=>[],setSilentSubtitle:()=>{}}};
  N.player.start(testPosts[0],[{info:{file_id:'fixture'},file:{m3u8:'https://offline.invalid/test.m3u8'}}],0);
 });
 await page.keyboard.press('ArrowUp');await page.waitForTimeout(350);
 await check('Up displays playback options below the timeline without opening the sidebar',()=>{const r=document.querySelector('#player-menu').getBoundingClientRect();return {ok:N.player.menuOpen&&!N.rail.open&&r.width>1500&&r.top>document.querySelector('#scrub').getBoundingClientRect().bottom&&r.bottom<=1080&&r.height<200};});
 await page.keyboard.press('ArrowDown');
 await check('Down keeps playback options available for navigation',()=>({ok:N.player.menuOpen&&N.player.open}));
 await page.keyboard.press('Escape');
 await page.keyboard.press('Enter');await page.keyboard.press('Enter');await page.keyboard.press('Escape');await page.keyboard.press('Escape');
 await check('AVPlay start, pause, resume, close and UI restoration',()=>({ok:!N.player.open&&!document.body.classList.contains('playing')&&avCalls.includes('open')&&avCalls.includes('pause')&&avCalls.includes('close')&&document.body.contains(N.nav.cur),calls:avCalls}));
 // The toolbar retains upstream quality switching, subtitle sync and season navigation.
 await page.evaluate(()=>{N.store.set('dlMode','menu');const items=[1,2].map((s,i)=>({info:{file_id:i+100,season:s,episode:1},file:{m3u8:[{label:'1080p',default:'https://offline.invalid/1080.m3u8'},{label:'2160p',default:'https://offline.invalid/2160.m3u8'}],subtitle:{en:'https://offline.invalid/en.vtt',fa:'https://offline.invalid/fa.vtt'}}}));N.player.start(testPosts[0],items,0);N.player.be.audioTracks=()=>[{id:0,label:'English',sel:true},{id:1,label:'Persian'}];});
 await check('playback defaults to the highest stream quality',()=>({ok:N.player.curUrl.includes('/2160.')}));
 await page.keyboard.press('ArrowUp');await page.waitForTimeout(220);
 await check('toolbar order keeps audio last and category pills do not overlap',()=>{const b=[...document.querySelectorAll('#player-menu .category')],r=b.map(e=>e.getBoundingClientRect());return {bounds:r.map(x=>({left:x.left,right:x.right})),labels:b.map(x=>x.textContent),ok:b[0].textContent.includes(N.t('quality'))&&b[1].textContent.includes(N.t('subtitles'))&&b[b.length-1].textContent.includes(N.t('audio'))&&r.every((x,i)=>x.left>=96&&x.right<=1824&&(!i||Math.min(x.right,r[i-1].right)<=Math.max(x.left,r[i-1].left)))};});
 await page.keyboard.press('Enter');
 await check('quality choices are isolated from the toolbar',()=>({ok:!!N.player.choices&&N.nav.scopes.length===2}));
 await page.keyboard.press('ArrowDown');
 await check('Down navigates quality options instead of closing them',()=>({ok:N.player.menuOpen&&!!N.player.choices}));
 await page.evaluate(()=>{N.player.be.time=()=>75;N.nav.focus(document.querySelector('.player-choices .opt'));});await page.keyboard.press('Enter');
 await check('quality switch preserves the current playback position',()=>({ok:!N.player.menuOpen&&N.player.curUrl.includes('/1080.')&&lastSeek===75000&&!N.nav.scopes.length}));
 await page.evaluate(()=>{N.player.subLang='en';N.player.openMenu();N.nav.focus([...document.querySelectorAll('#player-menu .category')].find(e=>e.textContent.includes(N.t('subtitles'))));});await page.keyboard.press('Enter');
 await page.evaluate(()=>N.nav.focus(document.querySelector('.player-choices .sync')));await page.keyboard.press('ArrowRight');
 await check('subtitle sync remains available inside subtitle choices',()=>({ok:!!N.player.choices&&Math.abs(N.player.subOffV)===.5}));
 await page.keyboard.press('Escape');await page.keyboard.press('Escape');await page.keyboard.press('ArrowDown');await page.waitForTimeout(250);
 await check('multi-season episode picker keeps the timeline clear of its tabs',()=>{const bar=document.querySelector('#scrub').getBoundingClientRect(),tabs=document.querySelector('#player-eps .tabs').getBoundingClientRect();return {ok:document.querySelector('#player').classList.contains('episodes-multi')&&bar.bottom<tabs.top&&document.querySelectorAll('#player-eps .tabs .pill').length===2&&!!N.nav.cur.querySelector('.episode-art')};});
 await page.keyboard.press('ArrowUp');await page.keyboard.press(lang==='fa'?'ArrowLeft':'ArrowRight');await page.keyboard.press('ArrowDown');
 await check('remote can select an episode in a different season',()=>({ok:N.nav.cur._idx===1&&!!N.nav.cur.closest('#player-eps')}));
 await page.keyboard.press('Enter');
 await check('playing a selected season closes the picker',()=>({ok:N.player.index===1&&!document.querySelector('#player').classList.contains('episodes-on')}));
 await page.evaluate(()=>{N.player.close();N.store.set('subOff',{});});
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
 // Catalogue pages use 30nama alone, including migration of the old digital sort.
 await page.evaluate(()=>{window.digitalCalls=[];N.tmdb.enabled=()=>true;N.tmdb.digitalPage=()=>{digitalCalls.push(1);throw Error('TMDB must not run here');};N.store.set('archiveSort.movies','digital');N.go('archive',{slug:'movies',name:N.t('movies')},{reset:true});});
 await page.waitForSelector('.ggrid .card');await page.waitForTimeout(300);
 await check('Movies migrates Release date to Updated without calling TMDB',()=>({ok:!digitalCalls.length&&document.querySelector('.sorts .cur')._k==='update'&&N.store.get('archiveSort.movies')==='update'&&!document.querySelector('.release-date')&&![...document.querySelectorAll('.sorts .pill')].some(e=>e._k==='digital')}));
 // A dropdown uses the same remote focus model as the rest of the TV UI.
 await page.evaluate(()=>{window.originalApiGet=N.api.get;window.filterCalls=[];N.api.get=function(action,p){if(action!=='archive')return originalApiGet(action,p);filterCalls.push(p.page);return Promise.resolve({pages:3,posts:p.page===1?[Object.assign({},testPosts[0],{info:{year:2024}}),Object.assign({},testPosts[1],{info:{year:2025},options:{coming_soon:true}})]:[Object.assign({},testPosts[p.page+1],{info:{year:2025}})]});};N.nav.focus(document.querySelector('.year-filter'));});
 await page.keyboard.press('Enter');
 await check('year dropdown traps remote focus and defaults to All years',()=>({ok:N.nav.scopes.length===1&&!!N.nav.cur.closest('.year-menu')&&N.nav.cur.textContent===N.t('allYears')}));
 await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await page.waitForTimeout(200);
 await check('year selection filters results, skips empty pages and hides SOON',()=>{const c=[...document.querySelectorAll('.ggrid .card')];return {ok:!N.nav.scopes.length&&!document.querySelector('.year-menu')&&N.store.get('archiveYear.movies')==='2025'&&filterCalls.includes(2)&&c.length>0&&c.every(e=>e._post.info.year===2025&&!e._post.options.coming_soon),calls:filterCalls};});
 await page.evaluate(()=>N.nav.focus(document.querySelector('.year-filter')));await page.keyboard.press('Enter');
 for(let i=0;i<25;i++)await page.keyboard.press('ArrowDown');
 await check('long year list scrolls the remote selection into view',()=>{const r=N.nav.cur.getBoundingClientRect(),m=document.querySelector('.year-menu').getBoundingClientRect();return {ok:r.top>=m.top&&r.bottom<=m.bottom};});
 await page.keyboard.press('Escape');
 await check('Back closes the year menu and restores the filter',()=>({ok:!document.querySelector('.year-menu')&&!N.nav.scopes.length&&N.nav.cur.classList.contains('year-filter')}));
 await page.evaluate(()=>N.go('settings',{}, {reset:true}));await page.waitForSelector('.slist');
 await page.evaluate(()=>N.go('archive',{slug:'movies',name:N.t('movies')},{reset:true}));await page.waitForSelector('.ggrid .card');
 await check('year and sort choices survive reopening',()=>({ok:N.store.get('archiveYear.movies')==='2025'&&document.querySelector('.year-filter').textContent.includes('2025')&&document.querySelector('.sorts .cur')._k==='update'}));
 await check('Year precedes Updated and TMDB release sorting is absent',()=>{const y=document.querySelector('.year-filter'),u=[...document.querySelectorAll('.sorts .pill')].find(e=>e._k==='update');return {ok:y.nextSibling===u&&u.textContent===N.t('updated')&&![...document.querySelectorAll('.sorts .pill')].some(e=>e._k==='digital')&&Math.abs(y.getBoundingClientRect().top-u.getBoundingClientRect().top)<2};});
 await page.screenshot({path:path.join(out,lang+'-year-filter.png')});
 await page.evaluate(()=>{N.nav.focus(document.querySelector('.year-filter'));document.querySelector('.year-filter').click();document.querySelector('.year-menu .pill').click();});await page.waitForTimeout(150);
 await check('All years clears the year restriction',()=>({ok:N.store.get('archiveYear.movies')===''&&document.querySelector('.year-filter').textContent.includes(N.t('allYears'))}));
 // Expiry dates arrive as structured values on some 30nama API versions.
 for(const value of [{date:'2027-06-15 12:00:00',timezone:'UTC'},{value:{expires_at:'2027-06-15T12:00:00Z'}},1813017600,{unexpected:'unknown'}]) {
   await page.evaluate(v=>{N.session={user:{user_name:'Offline fixture',user_expire:v}};N.go('settings',{section:'account'},{reset:true});},value);await page.waitForSelector('.spane .orow');
   await check('subscription expiry formats '+JSON.stringify(value),()=>{const text=document.querySelectorAll('.spane .orow')[2].textContent;return {ok:!text.includes('[object')&&(text.includes('2027-06-15')||text.includes(N.t('unknown'))),text};});
 }
 await page.evaluate(()=>{N.api.get=originalApiGet;N.tmdb.details=()=>Promise.resolve({tagline:'',logo:'',next:null,nets:[],cast:[],crew:[],recs:[],rating:9.8,votes:999,reviews:[{author:'Old cached review',text:'Hidden review fixture'}]});N.go('details',{id:1},{reset:true});});await page.waitForSelector('.d-btns');await page.waitForTimeout(100);
 await check('cached TMDB rating and reviews are absent from details',()=>({ok:!document.querySelector('.tm-rating,.rev-card,.review')&&!document.body.textContent.includes('Old cached review')}));
 await page.evaluate(()=>{const y=new Date().getFullYear()+1;N.tmdb.details=()=>Promise.resolve({tagline:'',logo:'',next:{s:2,e:5,d:y+'-02-10'},nextSeason:{s:3,d:y+'-09-15'},nets:[],cast:[],crew:[],recs:[]});N.go('details',{id:1},{reset:true});});await page.waitForSelector('.d-schedule');await page.waitForTimeout(200);
 await check('series details show both announced episode and season dates without overlap',()=>{const a=[...document.querySelectorAll('.d-schedule .d-next')],schedule=document.querySelector('.d-schedule').getBoundingClientRect(),plot=document.querySelector('.d-plot').getBoundingClientRect(),button=document.querySelector('.d-btns').getBoundingClientRect();return {ok:a.length===2&&a[0].textContent.includes(N.t('nextEp'))&&a[1].textContent.includes(N.t('nextSeason'))&&schedule.bottom<=plot.top&&button.bottom<=1026};});
 await page.screenshot({path:path.join(out,lang+'-next-air-dates.png')});
 await page.evaluate(()=>{N.tmdb.details=()=>Promise.resolve({tagline:'',logo:'',next:{s:2,e:5,d:'2020-01-01'},nextSeason:null,nets:[],cast:[],crew:[],recs:[]});N.go('details',{id:1},{reset:true});});await page.waitForTimeout(300);
 await check('expired cached episode dates are hidden',()=>({ok:!document.querySelector('.d-schedule')}));
 await page.evaluate(()=>{const y=new Date().getFullYear()+1;N.tmdb.details=()=>Promise.resolve({tagline:'',logo:'',next:{s:3,e:1,d:y+'-09-15'},nextSeason:{s:3,d:y+'-09-15'},nets:[],cast:[],crew:[],recs:[]});N.go('details',{id:1},{reset:true});});await page.waitForSelector('.d-schedule');await page.waitForTimeout(200);
 await check('a season premiere appears once rather than duplicating the next episode',()=>({ok:document.querySelectorAll('.d-schedule .d-next').length===1&&document.querySelector('.d-schedule').textContent.includes(N.t('nextSeason'))}));
 // Status and streaming facts are grouped before Play; cast remains actual names.
 await page.evaluate(()=>{testPosts[0].score={imdb:{score:8.2},'30nama':{score:8.0}};testPosts[0].info={year:2026,time:{default:117},age:'R'};testPosts[0].genre=[{name:'Crime'},{name:'Drama'}];window.beforeFactsCall=N.api.call;N.api.call=function(action,p){return beforeFactsCall(action,p).then(j=>{if(action==='stream')j.result.hls.forEach(it=>{it.file.m3u8=[{label:'1080p',default:'https://offline.invalid/1080.m3u8'},{label:'2160p',default:'https://offline.invalid/2160.m3u8'}];it.file.subtitle={en:'https://offline.invalid/en.vtt',fa:'https://offline.invalid/fa.vtt'};});return j;});};N.tmdb.details=()=>Promise.resolve({tagline:'',logo:'',status:'Ended',runtime:50,next:null,nextSeason:null,nets:['Example Network'],cast:[{n:'Example Actor',p:'',c:'Example role'}],crew:[],recs:[]});N.go('details',{id:1},{reset:true});});
 await page.waitForSelector('.d-fact');await page.waitForTimeout(300);
 await check('status, network, quality and subtitles appear above Play',()=>{const f=document.querySelector('.d-facts'),b=document.querySelector('.d-btns');return {ok:f.getBoundingClientRect().bottom<=b.getBoundingClientRect().top&&f.textContent.includes(N.t('titleStatus'))&&f.textContent.includes('Example Network')&&f.textContent.includes('2160p')&&f.textContent.includes(N.t('subtitles'))};});
 await check('description extends beyond half the screen while retaining artwork space',()=>{const r=document.querySelector('.d-plot').getBoundingClientRect();return {ok:r.width>1000&&r.width<1300&&r.left>=96&&r.right<=1824};});
 await check('details metadata labels both scores and fits the column',()=>{const m=document.querySelector('.d-meta'),r=m.getBoundingClientRect();return {ok:m.querySelectorAll('.rating-badge').length===2&&m.textContent.includes('IMDb')&&m.textContent.includes('30nama')&&m.textContent.includes('2026')&&[...m.children].every(e=>{const b=e.getBoundingClientRect();return b.left>=r.left-1&&b.right<=r.right+1;})};});
 await check('cast text line is removed and cast cards follow details closely',()=>{const c=document.querySelector('.det-col').getBoundingClientRect(),x=document.querySelector('.d-x').getBoundingClientRect();return {ok:!document.querySelector('.d-cast')&&document.querySelector('.d-x .fnm').textContent.includes('Example Actor')&&Math.abs(x.top-c.bottom-32)<2};});
 await page.screenshot({path:path.join(out,lang+'-details-organized.png')});
 await page.evaluate(()=>{N.api.call=beforeFactsCall;});
 await page.evaluate(()=>{window.popularRequests=[];window.beforePopularCheck=N.api.get;N.api.get=function(action,p){if(action==='archive')popularRequests.push(p);return beforePopularCheck(action,p);};N.store.set('archiveSort.movies','favorite');N.go('archive',{slug:'movies',name:N.t('movies')},{reset:true});});await page.waitForSelector('.ggrid .card');
 await check('Popular uses the original 30nama favorite order',()=>({ok:popularRequests.length>0&&popularRequests.every(p=>p.orderby==='favorite'&&p.order==='desc')&&document.querySelector('.sorts .cur')._k==='favorite'}));
 // Popular uses the original 30nama order; errors retain the user's filters.
 await page.evaluate(()=>{window.beforePopularError=N.api.get;N.api.get=function(action,p){if(action==='archive'&&p.orderby==='favorite')return Promise.reject(new Error('fixture popular unavailable'));return beforePopularError(action,p);};N.store.set('archiveSort.movies','favorite');N.go('archive',{slug:'movies',name:N.t('movies')},{reset:true});});await page.waitForSelector('.archive-error');
 await check('Movies catalog failure retains Year and all sorting controls',()=>({ok:!!document.querySelector('.year-filter')&&document.querySelectorAll('.sorts .pill').length===3&&!!document.querySelector('.archive-error .pill')}));
 await page.evaluate(()=>[...document.querySelectorAll('.sorts .pill')].find(e=>e._k==='update').click());await page.waitForSelector('.ggrid .card');
 await check('Updated remains usable after Movies popularity fails',()=>({ok:document.querySelector('.sorts .cur')._k==='update'&&!document.querySelector('.archive-error')}));
 await page.evaluate(()=>{N.store.set('archiveSort.series','favorite');N.go('archive',{slug:'series',name:N.t('series')},{reset:true});});await page.waitForSelector('.archive-error');
 await check('Series popularity failure retains its sort controls',()=>({ok:!!document.querySelector('.year-filter')&&[...document.querySelectorAll('.sorts .pill')].some(e=>e._k==='update')}));
 await page.evaluate(()=>N.rail.items.find(e=>e._key==='account').click());await page.waitForSelector('.slist');await page.waitForTimeout(200);
 await check('Account is the single settings entry and retains every preferences section',()=>({ok:!N.rail.items.some(e=>e._key==='settings')&&N.rail.items.filter(e=>e._key==='account').length===1&&N.rail.curKey()==='account'&&document.querySelector('.set .h-xl').textContent===N.t('account')&&document.querySelectorAll('.srow').length===7}));
 // A slow catalogue is reused on reopening, with filter and session isolation.
 for(const slug of ['movies','series','anime']) {
   await page.evaluate(slug=>{window.cacheCalls=0;N.store.set('archiveSort.'+slug,'update');N.store.set('archiveYear.'+slug,'');N.api.get=function(action){if(action!=='archive')return Promise.resolve({});cacheCalls++;return new Promise(resolve=>setTimeout(()=>resolve({posts:testPosts.slice(0,14),pages:1}),600));};N.go('archive',{slug:slug,name:slug},{reset:true});},slug);
   await page.waitForTimeout(160);await page.waitForSelector('.ggrid .card:not(.skel)');
   await page.evaluate(()=>N.go('settings',{}, {reset:true}));await page.waitForSelector('.slist');
   await page.evaluate(slug=>N.go('archive',{slug:slug,name:slug},{reset:true}),slug);
   await page.waitForTimeout(160);await page.waitForSelector('.ggrid .card:not(.skel)',{timeout:500});
   await check(slug+' reopens from the short cache without another catalogue request',()=>({ok:cacheCalls===1&&!digitalCalls.length,calls:cacheCalls}));
   await page.evaluate(slug=>{N.session={token:'different-offline-session',user:{}};N.go('archive',{slug:slug,name:slug},{reset:true});},slug);
   await page.waitForTimeout(160);await page.waitForSelector('.ggrid .card:not(.skel)');
   await check(slug+' does not reuse another session catalogue',()=>({ok:cacheCalls===2,calls:cacheCalls}));
 }
 await page.close();
 }
 assert(errors.length===0,'No uncaught browser errors',errors);
 const report={browser:browser.version(),baseline,compatibilitySimulation:compat,viewport:'1920x1080',results};
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({browser:report.browser,baseline,compat,passed:results.filter(x=>x.pass).length,failed:results.filter(x=>!x.pass).length,errors},null,2));
 if(results.some(x=>!x.pass))process.exitCode=1;
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
