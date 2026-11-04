// Figure picker checks in the browser (dev server on 4173): kit colour on every figure, picking in the lobby, the pick
// surviving a reload and playing a point, repeated switches not growing GPU memory, switch time, and a figure whose
// model fails falling back to the default. Screenshots go to artifacts/players/.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
const require=createRequire('C:/Users/HUFAN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/qa.cjs');
const {chromium}=require('playwright');
const OUT='artifacts/players';await mkdir(OUT,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Users/HUFAN/AppData/Local/Google/Chrome/Application/chrome.exe',headless:true});
const results={},failures=[];
// AC4 is reported for every figure before failing, so one run shows all of them.
const check=(ok,msg)=>{if(!ok)failures.push(msg);};
async function open(context){
  const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await p.goto('http://localhost:4173/');await p.waitForFunction(()=>document.body.dataset.booted==='1',null,{timeout:30000});
  await p.evaluate(()=>{localStorage.setItem('rebound-club-v2',JSON.stringify({...JSON.parse(localStorage.getItem('rebound-club-v2')||'{}'),tutorialDone:true}));});
  return {p,errors};
}
const shown=p=>p.evaluate(()=>({court:document.getElementById('court').dataset.player,button:document.getElementById('prep-player-name').textContent,
  worlds:qaCourt().worlds,memory:{...qaCourt().info.memory}}));

// AC4: the kit colour, averaged over the chest bone's vertices (chest+spine is reported too).
{const {p}=await open(await browser.newContext());
  results.kit=await p.evaluate(async()=>{
    const THREE=await import('/vendor/three.module.min.js'),{GLTFLoader}=await import('/vendor/GLTFLoader.js'),{createActor}=await import('/actor.mjs'),{PLAYERS,playerSpec}=await import('/characters.mjs');
    const out={};
    for(const pl of PLAYERS){const spec=playerSpec(pl.id),a=createActor(await new GLTFLoader().loadAsync('/'+spec.file),spec,'striker');
      const g=a.body.geometry,uv=g.attributes.uv,si=g.attributes.skinIndex,sw=g.attributes.skinWeight,bones=a.body.skeleton.bones,img=a.body.material.map.image;
      const px=img.getContext('2d',{willReadFrequently:true}).getImageData(0,0,img.width,img.height).data;
      const avg=set=>{let r=0,gg=0,b=0,n=0;for(let i=0;i<uv.count;i++){let k=0;for(let q=1;q<4;q++)if(sw.getComponent(i,q)>sw.getComponent(i,k))k=q;if(!set.includes(bones[si.getComponent(i,k)].name))continue;
        const x=Math.min(img.width-1,Math.floor(uv.getX(i)*img.width)),y=Math.min(img.height-1,Math.floor(uv.getY(i)*img.height)),o=(y*img.width+x)*4;r+=px[o];gg+=px[o+1];b+=px[o+2];n++;}
        const h={};new THREE.Color(r/n/255,gg/n/255,b/n/255).getHSL(h);return {h:Math.round(h.h*360),s:+h.s.toFixed(2),l:+h.l.toFixed(2)};};
      out[pl.id]={chestSpine:avg(['chest','spine']),chest:avg(['chest'])};}
    return out;});
  console.log('队服颜色',JSON.stringify(results.kit));
  // Judged on the chest alone (design Amendments A2): the waist carries belts and buckles on every figure.
  for(const [id,k] of Object.entries(results.kit))check(k.chest.h>=8&&k.chest.h<=30&&k.chest.s>=.6,`AC4 ${id} 胸口 ${JSON.stringify(k.chest)}`);
  await p.context().close();}

// AC6, AC9: pick the knight in the lobby; the court rebuilds with it within the time limit.
{const {p,errors}=await open(await browser.newContext({viewport:{width:390,height:844}}));
  await p.getByRole('button',{name:'选择人物'}).click();
  assert.equal(await p.locator('.player-options').isVisible(),true);assert.equal(await p.locator('.level-options').isVisible(),false,'只显示人物区块');
  assert.equal(await p.locator('#selection-title').textContent(),'选择人物');
  await p.screenshot({path:`${OUT}/dialog-390.png`});
  const before=await shown(p);await p.getByRole('button',{name:'骑士',exact:true}).click();
  await p.waitForFunction(()=>document.getElementById('court').dataset.player==='knight',null,{timeout:5000});
  assert.equal(await p.getByRole('button',{name:'骑士',exact:true}).getAttribute('aria-pressed'),'true');
  const after=await shown(p);assert.equal(after.button,'骑士');assert.ok(after.worlds===before.worlds+1,'换人重建了一次场景');
  await p.keyboard.press('Escape');await p.screenshot({path:`${OUT}/lobby-knight-390.png`});
  // Switch time to a figure already cached (the default, loaded at boot), measured from the click to the next frame.
  await p.getByRole('button',{name:'选择人物'}).click();
  const t0=Date.now();await p.getByRole('button',{name:'游侠',exact:true}).click();await p.waitForFunction(()=>document.getElementById('court').dataset.player==='rogue');
  await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));results.switchMs=Date.now()-t0;
  console.log('换回已缓存人物耗时',results.switchMs,'ms');assert.ok(results.switchMs<=600,`AC9 ${results.switchMs} ms`);
  await p.getByRole('button',{name:'骑士',exact:true}).click();await p.waitForFunction(()=>document.getElementById('court').dataset.player==='knight');
  assert.deepEqual(errors,[]);
  // AC7: the pick survives a reload, and a point plays with it.
  await p.reload();await p.waitForFunction(()=>document.body.dataset.booted==='1',null,{timeout:30000});
  assert.equal((await shown(p)).court,'knight');assert.equal((await shown(p)).button,'骑士');
  await p.getByRole('button',{name:'单机对战'}).click();await p.waitForFunction(()=>document.body.dataset.screen==='match');
  await p.waitForTimeout(2500);await p.screenshot({path:`${OUT}/match-knight-390.png`});
  results.reload={court:(await shown(p)).court,screen:await p.evaluate(()=>document.body.dataset.screen)};
  assert.deepEqual(errors,[]);await p.context().close();}

// AC8: ten switches (each figure twice) leave GPU geometry and texture counts where they were.
{const {p,errors}=await open(await browser.newContext({viewport:{width:1280,height:800}}));
  await p.getByRole('button',{name:'选择人物'}).click();
  const names=['游侠','兜帽侠','大胡子','骑士','法师'];
  for(const n of names){await p.getByRole('button',{name:n,exact:true}).click();await p.waitForFunction(id=>document.getElementById('court').dataset.player===id,{游侠:'rogue',兜帽侠:'hooded',大胡子:'barbarian',骑士:'knight',法师:'mage'}[n]);}
  await p.getByRole('button',{name:'游侠',exact:true}).click();await p.waitForFunction(()=>document.getElementById('court').dataset.player==='rogue');
  await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const start=await shown(p);
  for(const n of [...names.slice(1),...names.slice(1),'游侠','游侠'].slice(0,10)){await p.getByRole('button',{name:n,exact:true}).click();
    await p.waitForFunction(id=>document.getElementById('court').dataset.player===id,{游侠:'rogue',兜帽侠:'hooded',大胡子:'barbarian',骑士:'knight',法师:'mage'}[n]);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));}
  await p.getByRole('button',{name:'游侠',exact:true}).click();await p.waitForFunction(()=>document.getElementById('court').dataset.player==='rogue');
  await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const end=await shown(p);results.memory={start:start.memory,end:end.memory,worlds:end.worlds-start.worlds};console.log('换人前后显存对象',JSON.stringify(results.memory));
  assert.ok(Math.abs(end.memory.geometries-start.memory.geometries)<=2&&Math.abs(end.memory.textures-start.memory.textures)<=2,`AC8 ${JSON.stringify(results.memory)}`);
  await p.screenshot({path:`${OUT}/dialog-1280.png`});assert.deepEqual(errors,[]);await p.context().close();}

// AC10: the saved pick's model fails to load: the court still comes up in 3D, with the default figure.
{const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.addInitScript(()=>{try{localStorage.setItem('rebound-club-v2',JSON.stringify({player:'knight',tutorialDone:true}));}catch{}});
  await context.route('**/models/player-knight.glb',r=>r.fulfill({status:404,body:'missing'}));
  const p=await context.newPage();await p.goto('http://localhost:4173/');await p.waitForFunction(()=>document.body.dataset.booted==='1',null,{timeout:30000});
  results.fallback=await p.evaluate(()=>({renderer:document.getElementById('court').dataset.renderer,court:document.getElementById('court').dataset.player,button:document.getElementById('prep-player-name').textContent}));
  console.log('骑士模型 404 时',JSON.stringify(results.fallback));
  assert.deepEqual(results.fallback,{renderer:'3d',court:'rogue',button:'游侠'});await context.close();}

console.log(JSON.stringify(results));
assert.deepEqual(failures,[],failures.join('; '));console.log('PASS');
await browser.close();
