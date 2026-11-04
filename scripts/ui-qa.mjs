import {chromium,CHROME} from './qa-env.mjs';import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:CHROME,headless:true,args:process.argv.includes('--fallback')?['--disable-webgl']:[]});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],results=[];page.on('pageerror',e=>errors.push(e.message));
async function assertResultVisible(label){
  const fit=await page.evaluate(()=>{
    const card=document.getElementById('overlay-content'),court=document.getElementById('court-wrap'),button=card.querySelector('.primary-button');
    const c=court.getBoundingClientRect(),b=button.getBoundingClientRect(),r=card.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
    return {courtHeight:c.height,cardHeight:r.height,buttonTop:b.top,buttonBottom:b.bottom,courtTop:c.top,courtBottom:c.bottom,height:innerHeight,clickable:hit===button||button.contains(hit)};
  });
  if(fit.courtHeight<Math.min(240,fit.height*.4)||fit.buttonTop<fit.courtTop||fit.buttonBottom>fit.courtBottom||!fit.clickable)throw Error(label+' clipped or not hit-testable: '+JSON.stringify(fit));
  return fit;
}
if(process.argv.includes('--play'))await page.addInitScript(()=>{
  const original=window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame=callback=>original(time=>{window.qaReplay?.tick(time);callback(time);});
});
try{
  await mkdir('artifacts',{recursive:true});
  const response=await page.goto('http://localhost:4173');if(response.status()!==200)throw Error('Preview failed');
  await page.getByRole('button',{name:'单机对战'}).waitFor();
  const backend=await page.locator('#court').getAttribute('data-renderer');
  if(backend!==(process.argv.includes('--fallback')?'2d':'3d'))throw Error('Unexpected renderer: '+backend);
  results.push({backend});let contextLost=false;
  await page.screenshot({path:'artifacts/ui-ready-desktop.png',fullPage:true});
  for(const size of [{width:390,height:844},{width:360,height:640}]){
    await page.setViewportSize(size);await page.evaluate(()=>scrollTo(0,0));
    const ready=await page.locator('#start-match').boundingBox();
    if(ready.y+ready.height>size.height)throw Error('Ready CTA below fold: '+JSON.stringify({size,ready}));
    await page.screenshot({path:`artifacts/ui-ready-${size.width}.png`,fullPage:true});
    await page.getByRole('button',{name:/选择关卡/}).click();
    await page.locator('#levels').getByRole('button',{name:/第1关/}).click();
    if(!await page.locator('#levels .selected').evaluate(e=>e===document.activeElement))throw Error('Selection lost keyboard focus');
    await page.keyboard.press('Escape');
    if(await page.locator('[data-action="choose-gear"]').count())throw Error('Gear picker should be gone');
    await page.getByRole('button',{name:'单机对战'}).click();
    await page.waitForFunction(()=>document.body.dataset.screen==='match');await page.waitForTimeout(950);
    const fit=await page.evaluate(()=>{const b=id=>{const r=document.getElementById(id).getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};};return {screen:document.body.dataset.screen,scroll:document.documentElement.scrollWidth,width:innerWidth,height:innerHeight,court:b('court-wrap'),attack:b('attack'),footer:b('feedback'),prepVisible:document.querySelector('.prep-panel').getBoundingClientRect().height>0};});
    if(fit.scroll>size.width||fit.attack.bottom>size.height||fit.footer.bottom>size.height||fit.prepVisible)throw Error('Match layout failed: '+JSON.stringify(fit));
    results.push({viewport:size,readyCTA:ready.y+ready.height,fit});
    await page.screenshot({path:`artifacts/ui-match-${size.width}.png`,fullPage:true});
    if(process.argv.includes('--context-loss')&&!contextLost){
      await page.evaluate(()=>document.getElementById('court').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
      await page.waitForFunction(()=>document.getElementById('court').dataset.renderer==='2d'&&document.body.dataset.screen==='paused');
      await page.getByRole('button',{name:'继续防守'}).click();contextLost=true;results.push({contextLoss:'paused, switched to 2d, resumed'});
    }
    await page.getByRole('button',{name:'暂停游戏'}).click();
    const frozen=await page.locator('#court').screenshot();await page.waitForTimeout(200);if(!frozen.equals(await page.locator('#court').screenshot()))throw Error('Pause not frozen');
    await page.getByRole('button',{name:'查看玩法说明'}).click();await page.getByRole('button',{name:'明白了'}).click();
    if(await page.locator('body').getAttribute('data-screen')!=='paused')throw Error('Help resumed without player consent');
    await page.getByRole('button',{name:'继续防守'}).click();
    await page.getByRole('button',{name:'暂停游戏'}).click();
    await page.getByRole('button',{name:'返回俱乐部'}).click();
    if(await page.locator('body').getAttribute('data-screen')!=='ready')throw Error('Return to ready failed');
  }
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'单机对战'}).click();await page.waitForTimeout(300);
  if(await page.locator('#tutorial-bar').isVisible())await page.getByRole('button',{name:'跳过教学'}).click();await page.waitForTimeout(950);
  const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  const m=await page.locator('#move-right').boundingBox(),a=await page.locator('#attack').boundingBox(),left={id:1,x:m.x+m.width/2,y:m.y+m.height/2},right={id:2,x:a.x+a.width/2,y:a.y+a.height/2};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[left]});await page.waitForTimeout(60);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[left,right]});await page.waitForTimeout(50);
  if(await page.locator('#attack span').textContent()!=='收招')throw Error('Attack not triggered by second touch');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[right]});await page.waitForTimeout(50);if(await page.locator('#move-right').getAttribute('aria-pressed')!=='true')throw Error('Attack released movement');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(50);if(await page.locator('#move-right').getAttribute('aria-pressed')!=='false')throw Error('Movement stuck after release');results.push({touch:'independent direction buttons and swing'});
  await page.waitForFunction(()=>document.body.dataset.screen==='result',null,{timeout:40000});
  if(!/差一点/.test(await page.locator('#overlay-content h3').textContent()))throw Error('Expected natural defeat');
  for(const size of [{width:390,height:844},{width:360,height:640},{width:844,height:390}]){
    await page.setViewportSize(size);const fit=await page.locator('#overlay-content .primary-button').boundingBox();
    if(fit.y<0||fit.y+fit.height>size.height)throw Error('Result button clipped');
    results.push({result:await assertResultVisible('Defeat')});
    await page.screenshot({path:`artifacts/ui-result-${size.width}.png`,fullPage:true});
  }
  await page.getByRole('button',{name:'再来一局'}).click();await page.waitForFunction(()=>document.body.dataset.screen==='match');
  if(await page.locator('#progress').textContent()!=='0 / 2'){
    const progress=await page.locator('#progress').textContent();if(!progress.startsWith('0 /'))throw Error('Retry did not reset progress');
  }
  if(process.argv.includes('--play')){
    await page.getByRole('button',{name:'暂停游戏'}).click();await page.getByRole('button',{name:'返回俱乐部'}).click();
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(async()=>{
      const C=await import('/core.mjs');let s=C.createGame(0,'glove'),last=0,held=null,started=false;
      function key(type,value){window.dispatchEvent(new KeyboardEvent(type,{key:value,code:value===' '?'Space':value,bubbles:true,cancelable:true}));}
      function move(next){if(next===held)return;if(held)key('keyup',held);if(next)key('keydown',next);held=next;}
      window.qaReplay={tick(time){
        const dt=last?Math.min(.05,(time-last)/1000):0;last=time;
        if(document.body.dataset.screen!=='match'){move(null);return;}
        if(!started){C.startGame(s);started=true;}
        let axis=0;
        if(s.phase==='playing'&&s.ball.vz<0){const z=s.player.z+C.WEAPONS[s.weapon].reach*.5;const x=C.foldX(s.ball.x+s.ball.vx*(z-s.ball.z)/s.ball.vz),dx=x-s.player.x;axis=Math.abs(dx)>.05?Math.sign(dx):0;}
        move(axis<0?'ArrowLeft':axis>0?'ArrowRight':null);
        if(s.phase==='playing'&&!s.swing&&s.ball.vz<0){
          const p=C.swingPreview(s),c=C.crossingFrom(p.x??s.ball.x,p.z??s.ball.z,Math.sin(p.angle??0),Math.cos(p.angle??0),s);
          const emergency=s.ball.z<s.player.z+.12+Math.abs(s.ball.vz)*(C.WEAPONS[s.weapon].windup+.02);
          if((['clean','perfect'].includes(p.kind)&&c.inMouth&&!c.blocked)||(emergency&&['clean','perfect','soft'].includes(p.kind))){key('keydown',' ');key('keyup',' ');C.attack(s);}
        }
        C.stepGame(s,dt,axis);
      }};
    });
    await page.getByRole('button',{name:'单机对战'}).click();
    await page.waitForFunction(()=>document.body.dataset.screen==='result',null,{timeout:90000});
    const title=await page.locator('#overlay-content h3').textContent();
    if(!/拿下/.test(title))throw Error('Input replay did not win: '+title);
    await page.evaluate(()=>{window.qaReplay=null;});
    results.push({victory:title,stats:await page.locator('.result-stats').innerText()});
    for(const size of [{width:390,height:844},{width:360,height:640}]){await page.setViewportSize(size);await assertResultVisible('Victory');await page.screenshot({path:`artifacts/ui-victory-${size.width}.png`,fullPage:true});}
    await page.getByRole('button',{name:'挑战下一关'}).click();await page.waitForFunction(()=>document.body.dataset.screen==='match');
    if(!/02/.test(await page.locator('.game-top .mini-label').textContent()))throw Error('Next level did not advance');
    await page.getByRole('button',{name:'暂停游戏'}).click();await page.getByRole('button',{name:'返回俱乐部'}).click();
    results.push({nextLevel:'02'});
  }
  if(errors.length)throw Error(errors.join(';'));
  results.push({flow:'ready / selectors / match / pause / help / return / natural loss / retry',errors});
  await writeFile('artifacts/ui-qa.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{await browser.close();}
