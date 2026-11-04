// Skill QA on the real page. Inputs are real keyboard / touch / clicks. Game state is only *read*, through a
// test-browser-only interception of game.js (window.__qa); nothing in dist/ exposes it. Energy for burst is
// earned by a keyboard bot returning balls, never written. Screenshots go to the ignored artifacts/ folder.
// Usage: node scripts/skill-qa.mjs   (needs the local server on :4173; uses this machine's Playwright + Chrome)
import {chromium,CHROME} from './qa-env.mjs';import {mkdir} from 'node:fs/promises';
const OUT='artifacts/skills';await mkdir(OUT,{recursive:true});
const R={},errors=[];
const SAVE=JSON.stringify({unlocked:5,scores:{0:2200},perfect:{},tutorialDone:true});
async function open(browser,{viewport={width:390,height:844},mobile=true,reducedMotion='no-preference',save=SAVE}={}){
  const ctx=await browser.newContext({viewport,deviceScaleFactor:2,isMobile:mobile,hasTouch:mobile,reducedMotion});const p=await ctx.newPage();
  p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  if(save)await p.addInitScript(v=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem('rebound-club-v2',v);sessionStorage.setItem('seeded','1');}},save);
  await p.route('**/game.js',async r=>{const x=await r.fetch();await r.fulfill({response:x,body:(await x.text())+'\nwindow.__qa={game:()=>game,preview:()=>swingPreview(game),status:k=>skillStatus(game,k)};'});});
  await p.goto('http://localhost:4173/');await p.waitForTimeout(400);return {ctx,p};
}
const st=p=>p.evaluate(()=>{const g=__qa.game();return {phase:g.phase,energy:g.energy,hits:g.hits,goals:g.goals,misses:g.misses,level:g.levelIndex,lastShot:g.lastShot,skill:g.skill&&{...g.skill},seq:g.skillSeq,px:g.player.x,bx:g.ball.x,bz:g.ball.z,vx:g.ball.vx,vz:g.ball.vz,kind:g.ball.kind||null,curve:!!g.ball.curve,elapsed:g.elapsed,tut:!!g.tutorial,renderer:document.getElementById('court').dataset.renderer};});
// Waits for the target first: the result card appears only after the winning goal's camera shot.
const click=async(p,sel)=>{await p.waitForSelector(sel,{state:'attached',timeout:5000});return p.evaluate(s=>document.querySelector(s).click(),sel);};
async function bot(p,{until,useSkills=false,ms=90000}){
  let held=null;const hold=async k=>{if(held===k)return;if(held)await p.keyboard.up(held);held=k;if(k)await p.keyboard.down(k);};const t0=Date.now();
  while(Date.now()-t0<ms){const s=await p.evaluate(()=>{const g=__qa.game();const pv=g.phase==='playing'&&g.ball.vz<0&&!g.swing?__qa.preview().kind:'none';return {phase:g.phase,energy:g.energy,bx:g.ball.x,bz:g.ball.z,vx:g.ball.vx,vz:g.ball.vz,px:g.player.x,kind:pv,goals:g.goals};});
    if(await until(s))break;
    if(s.phase==='playing'&&s.vz<0){const dx=s.bx+s.vx*(2.1-s.bz)/s.vz-s.px;await hold(Math.abs(dx)>.12?(dx>0?'ArrowRight':'ArrowLeft'):null);if(s.kind==='clean'||s.kind==='perfect')await p.keyboard.press('Space');}
    else await hold(null);await p.waitForTimeout(5);}
  await hold(null);
}
// Walk under the next ball and wait (without swinging) until a skill would be accepted.
async function waitReady(p,kind,ms=20000){
  let held=null;const hold=async k=>{if(held===k)return;if(held)await p.keyboard.up(held);held=k;if(k)await p.keyboard.down(k);};const t0=Date.now();
  while(Date.now()-t0<ms){const s=await p.evaluate(k=>{const g=__qa.game();return {ok:__qa.status(k).ok,phase:g.phase,bx:g.ball.x,bz:g.ball.z,vx:g.ball.vx,vz:g.ball.vz,px:g.player.x};},kind);
    if(s.ok){await hold(null);return true;}
    if(s.phase==='playing'&&s.vz<0){const dx=s.bx+s.vx*(2.1-s.bz)/s.vz-s.px;await hold(Math.abs(dx)>.1?(dx>0?'ArrowRight':'ArrowLeft'):null);}else await hold(null);
    await p.waitForTimeout(4);}
  await hold(null);return false;
}
// Earn 100 energy by plain returns. If the match ends first, start it again through the result card.
async function earnFull(p){for(let n=0;n<6;n++){await bot(p,{until:async s=>(s.energy>=100&&s.phase==='playing'&&s.vz>0)||s.phase==='won'||s.phase==='lost',ms:120000});
  const s=await st(p);if(s.energy>=100&&s.phase==='playing')return s.energy;await click(p,'#overlay-content [data-action=retry], #overlay-content .primary-button');await waitPhase(p,'playing');}return (await st(p)).energy;}
// Pick a level through the real selection dialog (level 6 needs 5 goals, so long rallies fit in one match).
async function pickLevel(p,i){await click(p,'[data-action=choose-level]');await click(p,`[data-level="${i}"]`);await click(p,'#selection-done');}
async function waitPhase(p,phase,ms=3000){const t0=Date.now();while(Date.now()-t0<ms){if((await st(p)).phase===phase)return true;await p.waitForTimeout(15);}return false;}

const browser=await chromium.launch({executablePath:CHROME,headless:true});
// 1) Layout at four sizes: controls visible, hit-testable, no horizontal scroll.
R.layout={};
for(const [name,viewport,mobile] of [['390x844',{width:390,height:844},true],['360x640',{width:360,height:640},true],['844x390',{width:844,height:390},true],['1440x1000',{width:1440,height:1000},false]]){
  const {ctx,p}=await open(browser,{viewport,mobile});await click(p,'#start-match');await waitPhase(p,'playing');
  R.layout[name]=await p.evaluate(()=>{const out={scrollW:document.documentElement.scrollWidth,w:innerWidth,h:innerHeight};
    for(const id of ['attack','skill-spin','skill-burst','energy','move-control']){const r=document.getElementById(id).getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      out[id]={w:Math.round(r.width),h:Math.round(r.height),inView:r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth,hit:!!hit&&(hit===document.getElementById(id)||document.getElementById(id).contains(hit))};}
    return out;});
  await waitReady(p,'spin');await p.screenshot({path:`${OUT}/spin-ready-${name}.png`});await ctx.close();
}
// 2) Phone: hold a direction button with one finger, tap spin with another.
{const {ctx,p}=await open(browser);await pickLevel(p,5);await click(p,'#start-match');await waitPhase(p,'playing');await waitReady(p,'spin');
  const cdp=await ctx.newCDPSession(p),mv=await p.locator('#move-right').boundingBox(),sp=await p.locator('#skill-spin').boundingBox();
  const m0={x:mv.x+mv.width/2,y:mv.y+mv.height/2,id:1},s0={x:sp.x+sp.width/2,y:sp.y+sp.height/2,id:2},before=await st(p);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[m0]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[m0,s0]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[s0]});
  await p.waitForTimeout(60);const mid=await st(p);await p.screenshot({path:`${OUT}/spin-route-390.png`});await p.waitForTimeout(250);const later=await st(p);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  R.twoFingerSpin={energy:[before.energy,mid.energy],lastShot:mid.lastShot,curving:mid.curve,kind:mid.kind,keptMoving:later.px>mid.px+.2};
  // Repeated burst presses: one charge, one launch.
  R.fullEnergy=await earnFull(p);await waitReady(p,'burst');const b0=await st(p);
  // A full bar lights the burst button and the bar (.charged) and spending the burst puts them out.
  const lit=()=>p.evaluate(()=>['skill-burst','energy'].map(id=>document.getElementById(id).classList.contains('charged')));const litFull=await lit();
  for(let i=0;i<3;i++)await p.keyboard.press('KeyK');await p.waitForTimeout(240);await p.screenshot({path:`${OUT}/burst-closeup-390.png`});
  const during=await st(p);await click(p,'#pause');const pa=await st(p);await p.waitForTimeout(600);const pb=await st(p);
  await click(p,'[data-action=resume]');await waitPhase(p,'playing');await p.waitForTimeout(70);await p.screenshot({path:`${OUT}/burst-launch-390.png`});const after=await st(p);
  R.charged={full:litFull,spent:await lit()};if(String(R.charged.full)!=='true,true'||String(R.charged.spent)!=='false,false')throw Error('满气提示 '+JSON.stringify(R.charged));
  R.burst={energy:[b0.energy,during.energy,after.energy],skillDuring:during.phase,seqDelta:after.seq-b0.seq,hitsDelta:after.hits-b0.hits,pausedFrozen:pa.skill?.time===pb.skill?.time&&pa.bx===pb.bx,lastShot:after.lastShot,ballSpeed:Math.hypot(after.vx,after.vz).toFixed(2),kind:after.kind};
  // Retry in the middle of a burst: clean new match, no stale launch.
  await earnFull(p);await waitReady(p,'burst');await p.keyboard.press('KeyK');await p.waitForTimeout(150);await click(p,'#pause');await click(p,'[data-action=retry]');
  await p.waitForTimeout(900);const re=await st(p);R.retryMidBurst={phase:re.phase,energy:re.energy,skill:re.skill,hits:re.hits};
  await p.screenshot({path:`${OUT}/retry-after-burst-390.png`});
  // Losing focus mid-burst pauses it; resuming finishes exactly once.
  await earnFull(p);await waitReady(p,'burst');const f0=await st(p);await p.keyboard.press('KeyK');await p.waitForTimeout(120);await p.evaluate(()=>window.dispatchEvent(new Event('blur')));
  const fb=await st(p);await p.waitForTimeout(500);const fc=await st(p);await click(p,'[data-action=resume]');await waitPhase(p,'playing');await p.waitForTimeout(80);const fd=await st(p);
  R.blurMidBurst={paused:fb.phase,frozen:fb.skill?.time===fc.skill?.time,launchedOnce:fd.seq-f0.seq===1&&fd.hits-f0.hits===1};
  // WebGL context lost mid-burst: falls back to 2D, keeps the remaining skill time, launches once.
  await earnFull(p);await waitReady(p,'burst');const c0=await st(p);await p.keyboard.press('KeyK');await p.waitForTimeout(150);
  await p.evaluate(()=>document.getElementById('court').getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext());await p.waitForTimeout(200);
  const c1=await st(p);await click(p,'[data-action=resume]');await waitPhase(p,'playing');await p.waitForTimeout(80);const c2=await st(p);await p.screenshot({path:`${OUT}/context-lost-2d-390.png`});
  R.contextLossMidBurst={renderer:c2.renderer,pausedPhase:c1.phase,skillKept:!!c1.skill,launchedOnce:c2.seq-c0.seq===1&&c2.hits-c0.hits===1,lastShot:c2.lastShot};
  await ctx.close();}
// 3) Reduced motion: same rules and timing, simplified show.
{const {ctx,p}=await open(browser,{reducedMotion:'reduce'});await pickLevel(p,5);await click(p,'#start-match');await waitPhase(p,'playing');await earnFull(p);await waitReady(p,'burst');
  const a=await st(p);await p.keyboard.press('KeyK');await p.waitForTimeout(250);await p.screenshot({path:`${OUT}/burst-reduced-motion-390.png`});await waitPhase(p,'playing');const b=await st(p);
  R.reducedMotion={launchedOnce:b.seq-a.seq===1&&b.hits-a.hits===1,energy:[a.energy,b.energy],lastShot:b.lastShot};await ctx.close();}
// 4) Tutorial: skills hidden and refused, no energy earned.
{const {ctx,p}=await open(browser,{save:null});await click(p,'#start-match');await waitPhase(p,'playing');
  await p.keyboard.press('KeyJ');await p.keyboard.press('KeyK');const s=await st(p);
  R.tutorial={tut:s.tut,energy:s.energy,dockHidden:await p.evaluate(()=>getComputedStyle(document.getElementById('skill-dock')).visibility==='hidden')};await ctx.close();}
// 5) Plain play only (no skills): win level 1, then go to level 2.
{const {ctx,p}=await open(browser,{save:JSON.stringify({unlocked:0,scores:{},perfect:{},tutorialDone:true})});await click(p,'#start-match');
  await bot(p,{until:async s=>s.phase==='won'||s.phase==='lost'});const w=await st(p);await p.screenshot({path:`${OUT}/plain-win-390.png`});
  await click(p,'#overlay-content [data-action=next]');await p.waitForTimeout(200);const n=await st(p);
  R.plainPlay={phase:w.phase,goals:w.goals,usedSkills:w.seq,nextLevel:n.level,nextEnergy:n.energy};await ctx.close();}
await browser.close();
// 6) 2D fallback (no WebGL): skills work with the simplified show.
{const b2=await chromium.launch({executablePath:CHROME,headless:true,args:['--disable-webgl','--disable-webgl2']});
  const {ctx,p}=await open(b2);await pickLevel(p,5);await click(p,'#start-match');await waitPhase(p,'playing');await waitReady(p,'spin');const a=await st(p);await p.keyboard.press('KeyJ');await p.waitForTimeout(80);
  await p.screenshot({path:`${OUT}/spin-2d-390.png`});const b=await st(p);await earnFull(p);await waitReady(p,'burst');const c=await st(p);await p.keyboard.press('KeyK');await p.waitForTimeout(250);
  await p.screenshot({path:`${OUT}/burst-2d-390.png`});await waitPhase(p,'playing');const d=await st(p);
  R.fallback2d={renderer:b.renderer,spin:{energy:[a.energy,b.energy],lastShot:b.lastShot},burstOnce:d.seq-c.seq===1&&d.hits-c.hits===1};await ctx.close();await b2.close();}
console.log(JSON.stringify({R,errors},null,1));
