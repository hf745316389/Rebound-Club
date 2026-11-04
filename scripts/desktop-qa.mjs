// Desktop match layout QA (node scripts/desktop-qa.mjs, needs the local server on :4173): on wide screens the court
// takes the full height between side columns, every control stays visible and clickable, no horizontal scroll.
import {chromium,CHROME} from './qa-env.mjs';import assert from 'node:assert/strict';import {mkdir} from 'node:fs/promises';
const OUT='artifacts/desktop';await mkdir(OUT,{recursive:true});
const SAVE=JSON.stringify({unlocked:5,scores:{0:2200},perfect:{},tutorialDone:true});
// Court size on the stacked layout before this change (main d41f762), CSS pixels.
const BEFORE={'1280x800':[770,495],'1440x900':[770,595],'1920x1080':[770,775]};
const b=await chromium.launch({executablePath:CHROME,headless:true});
const R={},errors=[];
for(const [name,[cw,ch]] of Object.entries(BEFORE)){
  const [w,h]=name.split('x').map(Number),p=await b.newPage({viewport:{width:w,height:h}});
  p.on('pageerror',e=>errors.push(`${name}: ${e.message}`));p.on('console',m=>{if(m.type()==='error')errors.push(`${name}: ${m.text()}`);});
  await p.addInitScript(v=>localStorage.setItem('rebound-club-v2',v),SAVE);
  await p.goto('http://localhost:4173/');await p.waitForTimeout(500);await p.evaluate(()=>document.getElementById('start-match').click());await p.waitForTimeout(900);
  R[name]=await p.evaluate(()=>{const c=document.getElementById('court').getBoundingClientRect(),out={court:[Math.round(c.width),Math.round(c.height)],scrollW:document.documentElement.scrollWidth,w:innerWidth,controls:{}};
    for(const id of ['move-left','move-right','attack','skill-spin','skill-burst','energy','pause','sound']){const r=document.getElementById(id).getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      out.controls[id]={inView:r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth&&r.width>0,hit:!!hit&&(hit===document.getElementById(id)||document.getElementById(id).contains(hit))};}
    return out;});
  await p.screenshot({path:`${OUT}/match-${name}.png`});await p.close();
  const r=R[name],gain=r.court[0]*r.court[1]/(cw*ch);r.gain=+gain.toFixed(2);
  assert.ok(gain>=1.35,`${name} 球场面积只有原来的 ${gain.toFixed(2)} 倍 ${JSON.stringify(r.court)}`);
  assert.ok(r.scrollW<=r.w,`${name} 横向滚动`);
  for(const [id,c] of Object.entries(r.controls))assert.ok(c.inView&&c.hit,`${name} ${id} 不可见或点不到`);
}
console.log(JSON.stringify(R));assert.deepEqual(errors,[]);console.log('PASS');await b.close();
