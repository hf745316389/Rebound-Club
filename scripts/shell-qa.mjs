// Product-shell QA (node scripts/shell-qa.mjs, needs the local server on :4173): loading cover, haptics, share card.
// Test-browser-only stubs record navigator.vibrate / navigator.share; game state is only read.
import {chromium,CHROME} from './qa-env.mjs';import assert from 'node:assert/strict';
const SAVE=JSON.stringify({unlocked:5,scores:{0:2200},perfect:{},tutorialDone:true});
const b=await chromium.launch({executablePath:CHROME,headless:true});
const R={},errors=[];
const watch=(p,tag)=>{p.on('pageerror',e=>errors.push(`${tag}: ${e.message}`));p.on('console',m=>{if(m.type()==='error')errors.push(`${tag}: ${m.text()}`);});};

// 1) Loading cover: visible and blocking while the 3D library is still downloading, gone once the game is ready.
{const p=await b.newPage({viewport:{width:390,height:844}});watch(p,'boot');
  await p.route('**/vendor/three.core.min.js',async r=>{await new Promise(res=>setTimeout(res,2000));await r.continue();});
  // Module scripts hold back DOMContentLoaded, so look as soon as the page has rendered its HTML.
  await p.goto('http://localhost:4173/',{waitUntil:'commit'});await p.waitForSelector('#start-match');await p.waitForTimeout(300);
  const during=await p.evaluate(()=>{const c=document.getElementById('boot'),r=c?.getBoundingClientRect(),s=document.getElementById('start-match').getBoundingClientRect(),top=document.elementFromPoint(s.x+s.width/2,s.y+s.height/2);
    return {cover:!!c&&getComputedStyle(c).visibility!=='hidden'&&r.width>=innerWidth-1,blocksStart:!!c&&c.contains(top),text:c?.textContent.trim()};});
  await p.waitForFunction(()=>document.body.dataset.booted==='1',null,{timeout:15000});
  // The fade is a CSS transition; software-rendered headless frames are slow, so allow it a few seconds.
  await p.waitForFunction(()=>getComputedStyle(document.getElementById('boot')).visibility==='hidden',null,{timeout:3000}).catch(()=>{});
  const after=await p.evaluate(()=>{const c=document.getElementById('boot');return {hidden:!c||getComputedStyle(c).visibility==='hidden'};});
  R.boot={during,after};await p.close();
  assert.ok(during.cover&&during.blocksStart,`载入期间遮罩 ${JSON.stringify(during)}`);assert.ok(/载入/.test(during.text),'载入文字');assert.ok(after.hidden,'载入后遮罩消失');}

// Real keyboard rally on level 1; returns once `count` more hits have landed.
async function rally(p,count){
  let held=null;const hold=async k=>{if(held===k)return;if(held)await p.keyboard.up(held);held=k;if(k)await p.keyboard.down(k);};
  const start=await p.evaluate(()=>__qa.game().hits),t0=Date.now();
  while(Date.now()-t0<40000){const s=await p.evaluate(()=>{const g=__qa.game();const pv=g.phase==='playing'&&g.ball.vz<0&&!g.swing?__qa.preview().kind:'none';return {phase:g.phase,hits:g.hits,bx:g.ball.x,bz:g.ball.z,vx:g.ball.vx,vz:g.ball.vz,px:g.player.x,kind:pv};});
    if(s.hits>=start+count)break;
    if(s.phase==='playing'&&s.vz<0){const dx=s.bx+s.vx*(2.1-s.bz)/s.vz-s.px;await hold(Math.abs(dx)>.12?(dx>0?'ArrowRight':'ArrowLeft'):null);if(s.kind==='clean'||s.kind==='perfect')await p.keyboard.press('Space');}
    else await hold(null);await p.waitForTimeout(5);}
  await hold(null);
}
// 2) Haptics: contacts vibrate (navigator.vibrate stubbed and recorded); with the sound toggle off they stay quiet.
{const p=await b.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});watch(p,'haptics');
  await p.addInitScript(v=>{localStorage.setItem('rebound-club-v2',v);window.__buzz=[];Object.defineProperty(navigator,'vibrate',{value:x=>{__buzz.push(x);return true;},configurable:true});},SAVE);
  await p.route('**/game.js',async r=>{const x=await r.fetch();await r.fulfill({response:x,body:(await x.text())+'\nwindow.__qa={game:()=>game,preview:()=>swingPreview(game)};'});});
  await p.goto('http://localhost:4173/');await p.waitForFunction(()=>document.body.dataset.booted==='1');
  await p.evaluate(()=>document.getElementById('start-match').click());await rally(p,2);
  const on=await p.evaluate(()=>__buzz.slice());
  await p.evaluate(()=>{document.getElementById('sound').click();__buzz.length=0;});await rally(p,2);
  const off=await p.evaluate(()=>__buzz.slice());R.haptics={on,off};await p.close();
  assert.ok(on.length>=2&&on.every(x=>typeof x==='number'?x>0&&x<=80:Array.isArray(x)),`击球震动 ${JSON.stringify(on)}`);
  assert.deepEqual(off,[],'关掉音效后不震动');}

// 3) Share card: on the result screen, "分享战绩" hands a 1080×1350 PNG to the system share sheet when files can be
// shared, and downloads it otherwise. The match is lost by standing still (no game state is written).
async function toResult(p){await p.evaluate(()=>document.getElementById('start-match').click());
  await p.waitForFunction(()=>document.body.dataset.screen==='result',null,{timeout:60000});await p.waitForSelector('#overlay-content [data-action=share]:not([disabled])',{timeout:5000});}
for(const canShare of [true,false]){
  const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,acceptDownloads:true}),p=await ctx.newPage();watch(p,`share-${canShare}`);
  await p.addInitScript(([v,can])=>{localStorage.setItem('rebound-club-v2',v);window.__shared=[];
    Object.defineProperty(navigator,'canShare',{value:d=>can&&!!d?.files?.length,configurable:true});
    Object.defineProperty(navigator,'share',{value:async d=>{const f=d.files[0],bmp=await createImageBitmap(f);__shared.push({name:f.name,type:f.type,size:f.size,w:bmp.width,h:bmp.height,text:d.text});},configurable:true});},[SAVE,canShare]);
  await p.goto('http://localhost:4173/');await p.waitForFunction(()=>document.body.dataset.booted==='1');await toResult(p);
  if(canShare){await p.click('#overlay-content [data-action=share]');await p.waitForFunction(()=>__shared.length>0,null,{timeout:5000});R.shared=await p.evaluate(()=>__shared[0]);
    await p.screenshot({path:'artifacts/share-result-390.png'});
    assert.ok(R.shared.type==='image/png'&&R.shared.w===1080&&R.shared.h===1350&&R.shared.size>20000,`分享图片 ${JSON.stringify(R.shared)}`);
    assert.ok(/第 1 关/.test(R.shared.text)&&/得分/.test(R.shared.text),'分享文字');}
  else{const [download]=await Promise.all([p.waitForEvent('download',{timeout:5000}),p.click('#overlay-content [data-action=share]')]);
    R.download=download.suggestedFilename();await download.saveAs('artifacts/share-card.png');assert.ok(/\.png$/.test(R.download),`下载文件 ${R.download}`);}
  await ctx.close();
}

console.log(JSON.stringify(R));assert.deepEqual(errors,[]);console.log('PASS');await b.close();
