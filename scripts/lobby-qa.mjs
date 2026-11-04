import assert from 'node:assert/strict';
import {chromium,CHROME} from './qa-env.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:CHROME,headless:true});
const errors=[],results=[];await mkdir('artifacts/lobby',{recursive:true});
try{
 const context=await browser.newContext();
 await context.addInitScript(()=>localStorage.setItem('rebound-club-v2',JSON.stringify({unlocked:2,scores:{0:2500},perfect:{},tutorialDone:true})));
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:4173/');await page.getByRole('button',{name:'单机对战'}).waitFor();
 await page.waitForFunction(()=>document.getElementById('court').dataset.renderer==='3d');
 for(const viewport of [{width:1756,height:860},{width:1440,height:1000},{width:1280,height:720},{width:768,height:1024},{width:390,height:844},{width:360,height:640},{width:320,height:568},{width:844,height:390}]){
  await page.setViewportSize(viewport);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const fit=await page.evaluate(()=>{
   const ids=['start-match','prep-level-name','prep-player-name','help','sound'];
   return {overflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight+1,targets:ids.map(id=>{
    const el=document.getElementById(id),button=el.closest('button')||el,r=button.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return {id,x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right,clickable:button===hit||button.contains(hit)};
   }),courtHeight:document.getElementById('court').getBoundingClientRect().height};
  });
  assert.equal(fit.overflow,false,JSON.stringify({viewport,fit}));
  for(const t of fit.targets)assert.ok(t.clickable&&t.bottom<=viewport.height&&t.right<=viewport.width&&t.x>=0&&t.y>=0,JSON.stringify({viewport,t}));
  assert.ok(fit.courtHeight>=240,JSON.stringify({viewport,fit}));
  await page.screenshot({path:'artifacts/lobby/home-'+viewport.width+'.png',fullPage:true});
  await page.getByRole('button',{name:'选择关卡',exact:true}).click();assert.equal(await page.locator('#selection-dialog').isVisible(),true);await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'选择人物',exact:true}).click();assert.equal(await page.locator('.player-options').isVisible(),true,'人物按钮打开人物区块');await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-action="choose-gear"]').count(),0,'大厅不再有装备入口');
  await page.getByRole('button',{name:'单机对战'}).click();await page.waitForFunction(()=>document.body.dataset.screen==='match');
  assert.equal(await page.locator('.lobby-menu').isVisible(),false);
  if(viewport.width===390)await page.screenshot({path:'artifacts/lobby/match-390.png'});
  await page.getByRole('button',{name:'暂停游戏'}).click();await page.getByRole('button',{name:'返回俱乐部'}).click();
  assert.equal(await page.locator('body').getAttribute('data-screen'),'ready');results.push({viewport,...fit});
 }
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'选择关卡',exact:true}).click();await page.locator('[data-level="1"]').click();await page.keyboard.press('Escape');
 assert.equal(await page.locator('#prep-stage').textContent(),'第 02 关');assert.equal(await page.locator('#prep-level-name').textContent(),'左右开弓');assert.equal(await page.locator('#best-record').isVisible(),false);
 await page.getByRole('button',{name:'查看玩法说明'}).click();assert.equal(await page.locator('#help-dialog').isVisible(),true);await page.getByRole('button',{name:'明白了'}).click();
 assert.equal(await page.locator('#save-note').isVisible(),false);
 // Storage failure must still have an honest, visible notice and a usable play button.
 const unavailable=await browser.newPage({viewport:{width:360,height:640}});
 unavailable.on('pageerror',e=>errors.push(e.message));
 await unavailable.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new Error('storage denied');}}));
 await unavailable.goto('http://localhost:4173/');
 await unavailable.getByRole('button',{name:'单机对战'}).waitFor();
 assert.equal(await unavailable.locator('#save-note').isVisible(),true);
 assert.equal(await unavailable.locator('#best-record').isVisible(),false);
 await unavailable.getByRole('button',{name:'单机对战'}).click();await unavailable.locator('#tutorial-bar').waitFor({state:'visible'});
 await unavailable.getByRole('button',{name:'跳过教学'}).click();assert.equal(await unavailable.locator('.lobby-menu').isVisible(),false);
 assert.deepEqual(errors,[]);await writeFile('artifacts/lobby/qa.json',JSON.stringify({results,errors,flows:'selection / gear / start / pause / return / help / storage-denied / tutorial'},null,2));
 console.log(JSON.stringify({viewports:results.map(r=>({viewport:r.viewport,courtHeight:r.courtHeight,start:r.targets[0]})),errors,flows:'passed'},null,2));
}finally{await browser.close();}

