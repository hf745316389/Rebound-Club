import {chromium,CHROME} from './qa-env.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:CHROME,headless:true,args:process.argv.includes('--fallback')?['--disable-webgl']:[]});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const results=[];
try{
  await mkdir('artifacts',{recursive:true});
  const response=await page.goto('http://localhost:4173');
  if(response.status()!==200)throw Error('Preview HTTP is not 200');
  await page.getByRole('button',{name:'单机对战'}).waitFor();
  const backend=await page.locator('#court').getAttribute('data-renderer');
  if(backend!==(process.argv.includes('--fallback')?'2d':'3d'))throw Error('Unexpected rendering backend: '+backend);
  results.push({backend});
  await page.screenshot({path:'artifacts/desktop.png',fullPage:true});
  for(const size of [{width:390,height:844},{width:360,height:640}]){
    await page.setViewportSize(size);
    const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,attack:document.getElementById('attack').getBoundingClientRect().bottom}));
    if(layout.scroll>size.width||layout.attack>size.height)throw Error('Mobile controls overflow: '+JSON.stringify({size,layout}));
    results.push({viewport:size,layout});
    await page.screenshot({path:`artifacts/mobile-${size.width}.png`,fullPage:true});
  }
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'查看玩法说明'}).click();
  await page.getByRole('button',{name:'明白了'}).click();
  await page.getByRole('button',{name:'单机对战'}).click();
  await page.waitForTimeout(1100);
  if(process.argv.includes('--touch')){
    await page.evaluate(()=>{window.qaTouchEvents=[];for(const name of ['pointerdown','pointerup','pointercancel','lostpointercapture'])document.addEventListener(name,e=>window.qaTouchEvents.push({name,id:e.pointerId,target:e.target.id,x:e.clientX}));});
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
    const m=await page.locator('#move-right').boundingBox(),a=await page.locator('#attack').boundingBox();
    const p={x:m.x+m.width/2,y:m.y+m.height/2,id:1};
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});
    await page.waitForTimeout(80);
    const moving=await page.locator('#move-right').getAttribute('aria-pressed');if(moving!=='true')throw Error('Direction button did not start movement');
    const q={x:a.x+a.width/2,y:a.y+a.height/2,id:2};
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p,q]});
    await page.waitForTimeout(50);
    if(await page.locator('#attack span').textContent()!=='收招')throw Error('Second touch did not swing');
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[q]});
    await page.waitForTimeout(50);
    const after=await page.locator('#move-right').getAttribute('aria-pressed');
    if(after!==moving)throw Error('Attack touch interrupted movement: '+JSON.stringify({moving,after,events:await page.evaluate(()=>window.qaTouchEvents)}));
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForTimeout(50);
    if(await page.locator('#move-right').getAttribute('aria-pressed')!=='false')throw Error('Touch release left movement active');
    results.push({multitouch:'move + swing + independent release'});
  }
  if(backend==='3d')await page.screenshot({path:'artifacts/3d-gameplay.png',fullPage:true});
  if(process.argv.includes('--context-loss')){
    await page.evaluate(()=>document.getElementById('court').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
    await page.waitForFunction(()=>document.getElementById('court').dataset.renderer==='2d');
    await page.getByRole('button',{name:'继续防守'}).waitFor();
    results.push({contextLoss:'paused and switched to 2d without a blank court'});
    await page.getByRole('button',{name:'继续防守'}).click();
  }
  await page.getByRole('button',{name:'暂停游戏'}).click();
  const paused=await page.locator('#court').screenshot();
  await page.waitForTimeout(250);
  const paused2=await page.locator('#court').screenshot();
  if(!paused.equals(paused2))throw Error('Paused court still moves');
  results.push({pause:'frozen canvas'});
  await page.getByRole('button',{name:'继续防守'}).click();
  await page.waitForTimeout(250);
  await page.screenshot({path:'artifacts/gameplay.png',fullPage:true});
  await page.getByRole('button',{name:'暂停游戏'}).click();
  await page.getByRole('button',{name:'重新开始本关'}).click();
  if(process.argv.includes('--play')){
    let held=null,lastShot=0,readings=[];const begin=Date.now();
    // Observe the rendered ball and jersey, then operate only the actual keyboard UI.
    while(Date.now()-begin<55000){
      const observation=await page.evaluate(async()=>{
        const canvas=document.getElementById('court'),w=canvas.width,h=canvas.height,is3D=canvas.dataset.renderer==='3d';
        const copy=document.createElement('canvas');copy.width=w;copy.height=h;const ctx=copy.getContext('2d');ctx.drawImage(canvas,0,0);
        const data=ctx.getImageData(0,0,w,h).data;let bx=0,by=0,bn=0,px=0,py=0,pn=0;
        for(let y=Math.floor(h*.22);y<h*.88;y+=2){for(let x=0;x<w;x+=2){const i=(y*w+x)*4,r=data[i],g=data[i+1],b=data[i+2];
          if(is3D?(r>225&&g>170&&g<220&&b<115):(r>235&&g>185&&g<220&&b>65&&b<130)){bx+=x;by+=y;bn++;}
          if(is3D?(y/h>.5&&r>200&&g>100&&g<170&&b<130):(y/h>.67&&y/h<.735&&r>228&&r<249&&g>222&&g<242&&b>182&&b<213)){px+=x;py+=y;pn++;}
        }}
        let ballX=bn?bx/bn/w*450:null,ballY=bn?by/bn/h*540:null,playerX=pn?px/pn/w*450:null;
        if(is3D){
          // Invert the visible pixels through a separate observer camera. This
          // observes rendering only; the running game's state is never exposed.
          const T=await import('/vendor/three.module.min.js');
          if(!window.qaObserver){const {buildWorld}=await import('/scene3d.mjs');window.qaObserver=buildWorld();}
          const observer=window.qaObserver;observer.resize(w/h);
          function point(x,y,height){const origin=observer.camera.position,dir=new T.Vector3(x/w*2-1,1-y/h*2,.5).unproject(observer.camera).sub(origin).normalize();return new T.Ray(origin,dir).intersectPlane(new T.Plane(new T.Vector3(0,1,0),-height),new T.Vector3());}
          if(bn){const p=point(bx/bn,by/bn,.73);ballX=p.x*42+225;ballY=470+p.z*36.4;}
          if(pn)playerX=point(px/pn,py/pn,.95).x*42+225;
        }
        return {bx:ballX,by:ballY,px:playerX,progress:document.getElementById('progress').textContent,result:document.querySelector('#overlay-content h3')?.textContent,overlay:!document.getElementById('overlay').hidden};
      });
      if(observation.overlay&&/守住了|完美防守/.test(observation.result)){results.push({uiWin:observation.progress,duration:Date.now()-begin});break;}
      if(observation.overlay&&/差一点/.test(observation.result))throw Error('Keyboard play lost: '+JSON.stringify(readings.slice(-12)));
      const direction=observation.bx!==null&&observation.px!==null&&Math.abs(observation.bx-observation.px)>8?(observation.bx>observation.px?'ArrowRight':'ArrowLeft'):null;
      if(direction!==held){if(held)await page.keyboard.up(held);if(direction)await page.keyboard.down(direction);held=direction;}
      if(observation.by>357&&observation.by<423&&Math.abs(observation.bx-observation.px)<36&&Date.now()-lastShot>440){await page.keyboard.press('Space');lastShot=Date.now();}
      readings.push(observation);await page.waitForTimeout(55);
    }
    if(held)await page.keyboard.up(held);
    if(!results.some(r=>r.uiWin))throw Error('Did not reach UI win: '+JSON.stringify(readings.slice(-12)));
    await page.screenshot({path:'artifacts/victory.png',fullPage:true});
    await page.setViewportSize({width:360,height:640});
    await page.screenshot({path:'artifacts/victory-360.png',fullPage:true});
    const winFit=await page.evaluate(()=>{const c=document.getElementById('court-wrap').getBoundingClientRect(),o=document.getElementById('overlay-content').getBoundingClientRect();return {courtTop:c.top,courtBottom:c.bottom,overlayTop:o.top,overlayBottom:o.bottom};});
    if(winFit.overlayTop<winFit.courtTop||winFit.overlayBottom>winFit.courtBottom)throw Error('Win overlay clipped on narrow screen: '+JSON.stringify(winFit));
    results.push({winFit});
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('button',{name:'选择关卡与装备'}).click();
    await page.getByRole('button',{name:/球拍/}).click();
    await page.getByRole('button',{name:'单机对战'}).click();
    await page.waitForFunction(()=>document.querySelector('#overlay-content h3')?.textContent.includes('差一点')&&!document.getElementById('overlay').hidden,{},{timeout:20000});
    results.push({uiLoss:'three misses',unlocked:await page.getByRole('button',{name:/第2关/}).isEnabled()});
    await page.setViewportSize({width:360,height:640});
    const lossFit=await page.evaluate(()=>{const c=document.getElementById('court-wrap').getBoundingClientRect(),o=document.getElementById('overlay-content').getBoundingClientRect();return {courtTop:c.top,courtBottom:c.bottom,overlayTop:o.top,overlayBottom:o.bottom};});
    if(lossFit.overlayTop<lossFit.courtTop||lossFit.overlayBottom>lossFit.courtBottom)throw Error('Loss overlay clipped: '+JSON.stringify(lossFit));
    results.push({lossFit});
    await page.screenshot({path:'artifacts/defeat.png',fullPage:true});
  }
  if(errors.length)throw Error('Browser errors: '+errors.join(';'));
  results.push({consoleErrors:errors});
  await writeFile('artifacts/browser-qa.json',JSON.stringify(results,null,2));
  console.log(JSON.stringify(results,null,2));
}finally{await browser.close();}
