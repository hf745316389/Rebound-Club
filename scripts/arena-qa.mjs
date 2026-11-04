// Night-arena QA on the real page (node scripts/arena-qa.mjs, needs the local server on :4173).
// 1. Portrait 390×844 and landscape 844×390: lobby, match and goal screenshots in artifacts/arena/. The goal is played
//    with key presses only; the injected hook reads the game state and never changes it.
// 2. The character models fail to load (every .glb request aborted): the page falls back to the 2D court, lifts the
//    loading cover and a match can still start.
import {chromium,CHROME} from './qa-env.mjs';import assert from 'node:assert/strict';import {mkdir} from 'node:fs/promises';
const OUT='artifacts/arena';await mkdir(OUT,{recursive:true});
const SAVE=JSON.stringify({unlocked:5,scores:{0:2200},perfect:{},tutorialDone:true});
const b=await chromium.launch({executablePath:CHROME,headless:true});
const errors=[],results={};
async function open(viewport,{blockModels=false}={}){
  const p=await (await b.newContext({viewport,deviceScaleFactor:2})).newPage();
  p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/glb|ERR_FAILED|Failed to load resource/.test(m.text()))errors.push(m.text());});
  await p.addInitScript(v=>localStorage.setItem('rebound-club-v2',v),SAVE);
  if(blockModels)await p.route('**/*.glb',r=>r.abort());
  await p.route('**/game.js',async r=>{const x=await r.fetch();await r.fulfill({response:x,body:(await x.text())+'\nwindow.__qa={game:()=>game};'});});
  await p.goto('http://localhost:4173/');await p.waitForFunction(()=>document.body.dataset.booted==='1',null,{timeout:30000});return p;
}
for(const viewport of [{width:390,height:844},{width:844,height:390}]){
  const p=await open(viewport),tag=`${viewport.width}x${viewport.height}`;
  assert.equal(await p.evaluate(()=>document.getElementById('court').dataset.renderer),'3d','3D 画面');
  await p.waitForTimeout(600);await p.screenshot({path:`${OUT}/lobby-${tag}.png`});
  await p.getByRole('button',{name:'单机对战'}).click();await p.waitForFunction(()=>__qa.game().phase==='playing',null,{timeout:20000});
  await p.waitForTimeout(500);await p.screenshot({path:`${OUT}/match-${tag}.png`});
  // Meet each ball and send it to the far side from the keeper until one goes in.
  let goal=false;const t0=Date.now();
  while(!goal&&Date.now()-t0<40000){
    const g=await p.evaluate(()=>{const g=__qa.game();return {bz:g.ball.z,bx:g.ball.x,px:g.player.x,vz:g.ball.vz,kx:g.keeper.x,goals:g.goals};});
    if(g.goals>0){goal=true;break;}
    const dx=g.bx-g.px;if(g.vz<0&&Math.abs(dx)>.25){const k=dx>0?'ArrowRight':'ArrowLeft';await p.keyboard.down(k);await p.waitForTimeout(40);await p.keyboard.up(k);}
    if(g.vz<0&&g.bz<2.6&&g.bz>1.7){const k=g.kx>0?'ArrowLeft':'ArrowRight';await p.keyboard.down(k);await p.keyboard.press('Space');await p.waitForTimeout(90);await p.keyboard.up(k);}
    await p.waitForTimeout(15);
  }
  assert.ok(goal,`${tag} 应打进一球`);await p.waitForTimeout(250);await p.screenshot({path:`${OUT}/goal-${tag}.png`});
  results[tag]='lobby / match / goal';await p.context().close();
}
{const p=await open({width:390,height:844},{blockModels:true});
  assert.equal(await p.evaluate(()=>document.getElementById('court').dataset.renderer),'2d','模型加载失败退回 2D');
  await p.waitForTimeout(400);assert.equal(await p.locator('#boot').isVisible(),false,'启动遮罩已撤（淡出 0.3 秒后）');
  await p.getByRole('button',{name:'单机对战'}).click();await p.waitForFunction(()=>__qa.game().phase==='playing',null,{timeout:20000});
  await p.screenshot({path:`${OUT}/fallback-390x844.png`});results.fallback='2d court, match running';await p.context().close();}
assert.deepEqual(errors,[]);console.log(JSON.stringify(results));console.log('PASS');await b.close();
