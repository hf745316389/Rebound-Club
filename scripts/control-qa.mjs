import assert from 'node:assert/strict';
import {chromium,CHROME} from './qa-env.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:CHROME,headless:true});
const results=[],errors=[];
await mkdir('artifacts/controls',{recursive:true});
try{
  for(const viewport of [{width:390,height:844},{width:360,height:640},{width:320,height:568},{width:844,height:390},{width:1440,height:1000}]){
    const context=await browser.newContext({viewport,hasTouch:true,isMobile:viewport.width<700});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    // Read-only observation injected only in the test browser, never shipped in dist.
    await page.route('**/game.js',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text())+'\nwindow.__controlsQA=()=>({x:game.player.x,phase:game.phase,axis:input.axis(),swing:!!game.swing});'});});
    await page.addInitScript(()=>localStorage.setItem('rebound-club-v2',JSON.stringify({unlocked:0,scores:{},perfect:{},tutorialDone:true})));
    const response=await page.goto('http://localhost:4173/');assert.equal(response.status(),200);
    await page.evaluate(()=>{window.__touchTrace=[];for(const name of ['pointerdown','pointerup','pointercancel','lostpointercapture'])document.addEventListener(name,e=>window.__touchTrace.push({type:e.type,id:e.pointerId,target:e.target.id}),true);});
    await page.getByRole('button',{name:'单机对战'}).click();
    await page.waitForFunction(()=>window.__controlsQA?.().phase==='playing');
    const state=()=>page.evaluate(()=>window.__controlsQA());
    const layout=await page.evaluate(()=>{
      const ids=['move-left','move-right','skill-spin','skill-burst','attack'];
      return {overflow:document.documentElement.scrollWidth>innerWidth,buttons:ids.map(id=>{
        const element=document.getElementById(id),r=element.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
        return {id,x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right,hit:hit===element||element.contains(hit)};
      })};
    });
    assert.equal(layout.overflow,false);
    for(const b of layout.buttons){assert.ok(b.hit&&b.x>=0&&b.y>=0&&b.right<=viewport.width&&b.bottom<=viewport.height,JSON.stringify({viewport,b}));if(b.id.startsWith('move-'))assert.ok(b.width>=60&&b.height>=68,JSON.stringify(b));}
    const leftBox=layout.buttons[0],rightBox=layout.buttons[1];assert.ok(rightBox.x-leftBox.right>=8);
    await page.screenshot({path:'artifacts/controls/directions-'+viewport.width+'.png'});
    const cdp=await context.newCDPSession(page);
    const touch=(type,touchPoints)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints});
    const point=(id,pid)=>{const b=layout.buttons.find(b=>b.id===id);return {id:pid,x:b.x+b.width/2,y:b.y+b.height/2};};
    const left=point('move-left',1),right=point('move-right',2),attack=point('attack',3),spin=point('skill-spin',4);
    const start=await state();
    await touch('touchStart',[left]);await page.waitForTimeout(130);const held=await state();assert.ok(held.x<start.x-.25);assert.equal(held.axis,-1);
    await touch('touchStart',[left,attack]);await page.waitForTimeout(45);assert.equal((await state()).swing,true);
    // CDP touchEnd names the contacts to release (an empty list releases all).
    await touch('touchEnd',[attack]);await page.waitForTimeout(65);const continuing=await state();assert.equal(continuing.axis,-1,JSON.stringify(await page.evaluate(()=>window.__touchTrace)));assert.ok(continuing.x<held.x);
    await touch('touchEnd',[]);await page.waitForTimeout(30);const stopped=await state();await page.waitForTimeout(80);assert.equal((await state()).axis,0);assert.equal((await state()).x,stopped.x);
    await touch('touchStart',[right]);await page.waitForTimeout(100);assert.ok((await state()).x>stopped.x+.2);
    await touch('touchStart',[right,spin]);await page.waitForTimeout(20);await touch('touchEnd',[spin]);assert.equal((await state()).axis,1);
    await touch('touchMove',[{...right,x:viewport.width/2,y:170}]);await page.waitForTimeout(40);
    await touch('touchEnd',[]);await page.waitForTimeout(30);assert.equal((await state()).axis,0,'Release outside captured button must stop movement');
    await touch('touchStart',[left,right]);await page.waitForTimeout(30);const both=await state();assert.equal(both.axis,0);
    await page.waitForTimeout(50);assert.equal((await state()).x,both.x);
    await touch('touchEnd',[left]);await page.waitForTimeout(60);assert.equal((await state()).axis,1);
    await touch('touchCancel',[]);await page.waitForTimeout(30);assert.equal((await state()).axis,0);
    // Pausing while held clears input; resume must not resurrect the previous touch.
    await touch('touchStart',[left]);await page.waitForTimeout(30);await page.keyboard.press('Escape');
    assert.equal((await state()).phase,'paused');assert.equal((await state()).axis,0);
    await touch('touchEnd',[]);await page.getByRole('button',{name:'继续防守'}).click();assert.equal((await state()).axis,0);
    // Focused arrow buttons respond to keyboard hold without also swinging.
    await page.waitForTimeout(650);await page.locator('#move-left').focus();await page.keyboard.down('Enter');await page.waitForTimeout(50);
    assert.equal((await state()).axis,-1);assert.equal((await state()).swing,false);await page.keyboard.up('Enter');assert.equal((await state()).axis,0);
    await page.locator('#move-right').focus();await page.keyboard.down('Space');await page.waitForTimeout(50);
    assert.equal((await state()).axis,1);assert.equal((await state()).swing,false);await page.keyboard.up('Space');assert.equal((await state()).axis,0);
    await page.locator('#court').focus();await page.keyboard.down('ArrowRight');await page.waitForTimeout(30);assert.equal((await state()).axis,1);await page.keyboard.up('ArrowRight');
    await touch('touchStart',[left]);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal((await state()).phase,'paused');assert.equal((await state()).axis,0);await touch('touchEnd',[]);
    // A long press anywhere (court, HUD text, beside the buttons) opens no text-selection menu (iOS / WeChat).
    // Chrome drops the iOS-only -webkit-touch-callout when parsing, so it is read from the stylesheet source. The
    // targets are collected after that await: the HUD re-renders meanwhile, and a detached node's events reach nothing.
    const press=await page.evaluate(async()=>{const css=await (await fetch(document.querySelector('link[href*="styles.css"]').href)).text();
      const style=getComputedStyle(document.body),targets=[document.getElementById('court'),document.body,...document.querySelectorAll('.hud *,.game-footer *')];
      return {select:style.userSelect||style.webkitUserSelect,callout:/body\{[^}]*-webkit-touch-callout:none/.test(css)?'none':'missing',
        open:targets.filter(t=>['contextmenu','selectstart'].some(type=>t.dispatchEvent(new Event(type,{bubbles:true,cancelable:true})))).map(t=>t.id||t.className||t.tagName)};});
    assert.deepEqual(press,{select:'none',callout:'none',open:[]},JSON.stringify(press));
    results.push({viewport,buttons:layout.buttons.map(({id,width,height})=>({id,width,height})),checks:'hold/release, dual touch swing/skill, opposites, outside release, cancel, pause, blur, keyboard, long press'});
    await context.close();
  }
  assert.deepEqual(errors,[]);await writeFile('artifacts/controls/qa.json',JSON.stringify({results,errors},null,2));
  console.log(JSON.stringify({results,errors},null,2));
}finally{await browser.close();}

