import test from 'node:test';
import assert from 'node:assert/strict';
import {COMBO,comboState,comboTier,comboMult,comboBand,comboWidth,comboSpeed,comboContact,comboBreak,comboGoal} from '../dist/combo.mjs';

const at=n=>({...comboState(),n});
const near=(a,b)=>Math.abs(a-b)<1e-9;

test('判定分四档：甜点带内 Perfect，0.65 以内 Great，再远或软球 Good，技能算 Great',()=>{
  assert.equal(comboTier(.2,{band:.3}),'perfect');assert.equal(comboTier(-.3,{band:.3}),'perfect');
  assert.equal(comboTier(.5,{band:.3}),'great');assert.equal(comboTier(-.65,{band:.3}),'great');
  assert.equal(comboTier(.8,{band:.3}),'good');assert.equal(comboTier(0,{band:.3,soft:true}),'good');
  assert.equal(comboTier(.9,{band:.3,skill:true}),'great');
});
test('倍率按分段曲线：前 5 连快涨，8～25 连最陡，50 连封顶 3.0，甜点状态再加 0.5 但总数不超过 3.0',()=>{
  assert.ok(near(comboMult(at(0)),1));assert.ok(near(comboMult(at(5)),1.2));assert.ok(near(comboMult(at(8)),1.4));
  assert.ok(near(comboMult(at(25)),2.5));assert.ok(near(comboMult(at(50)),3));assert.ok(near(comboMult(at(80)),3));
  const slope=(a,b)=>(comboMult(at(b))-comboMult(at(a)))/(b-a);assert.ok(slope(8,25)>slope(0,5)&&slope(8,25)>slope(25,50));
  assert.ok(near(comboMult({...at(10),sweetLeft:1}),comboMult(at(10))+COMBO.sweetMult));
  assert.ok(near(comboMult({...at(45),sweetLeft:1}),3));
});
test('难度：每 5 连来球 +4%（最多 +25%），每 10 连甜点带 −5%（最多 −25%）',()=>{
  assert.ok(near(comboSpeed(at(4)),1));assert.ok(near(comboSpeed(at(5)),1.04));assert.ok(near(comboSpeed(at(20)),1.16));
  assert.ok(near(comboSpeed(at(30)),1.24));assert.ok(near(comboSpeed(at(35)),1.25));assert.ok(near(comboSpeed(at(99)),1.25));
  assert.ok(near(comboBand(at(9)),1));assert.ok(near(comboBand(at(10)),.95));assert.ok(near(comboBand(at(50)),.75));assert.ok(near(comboBand(at(90)),.75));
});
test('甜点状态和恢复期按球数放宽：甜点带 ×1.3；恢复期甜点带 ×1.2、接球框 ×1.1',()=>{
  assert.ok(near(comboBand({...at(0),sweetLeft:2}),1.3));assert.ok(near(comboBand({...at(0),recoverLeft:1}),1.2));
  assert.ok(near(comboWidth({...at(0),recoverLeft:1}),1.1));assert.ok(near(comboWidth(at(30)),1));
});
test('连续 3 次 Perfect 进入甜点状态，管接下来 2 次触球；连续 5 次拿到火球',()=>{
  const st=comboState();let notes=[];
  for(let i=0;i<3;i++)notes=comboContact(st,'perfect');assert.ok(notes.includes('sweetStart'));assert.equal(st.sweetLeft,2);
  notes=comboContact(st,'great');assert.equal(st.sweetLeft,1);assert.equal(st.perfects,0,'Great 断完美连击');
  notes=comboContact(st,'perfect');assert.ok(notes.includes('sweetEnd'));assert.equal(st.sweetLeft,0);
  const f=comboState();for(let i=0;i<5;i++)notes=comboContact(f,'perfect');assert.ok(notes.includes('fireReady'));assert.equal(f.fire,true);assert.equal(f.perfects,0);
  // A skill neither builds nor breaks the perfect run.
  const k=comboState();comboContact(k,'perfect');comboContact(k,'great',{skill:true});assert.equal(k.perfects,1);
});
test('每 5 连一个里程碑；积分 = 基础分 × 当时的倍率',()=>{
  const st=comboState();let seen=[];for(let i=1;i<=10;i++)if(comboContact(st,'great').includes('milestone'))seen.push(st.n);
  assert.deepEqual(seen,[5,10]);assert.equal(st.best,10);
  const p=comboState();comboContact(p,'perfect');assert.equal(p.points,Math.round(COMBO.points.perfect*comboMult(at(1))));
  const g=at(8);g.points=0;comboGoal(g);assert.equal(g.points,Math.round(COMBO.points.goal*comboMult(at(8))));
});
test('断连：连击、完美连击、甜点状态清零，进入 2 球恢复期，火球保留',()=>{
  const st={...at(18),perfects:2,sweetLeft:1,fire:true};assert.equal(comboBreak(st),18);
  assert.equal(st.n,0);assert.equal(st.perfects,0);assert.equal(st.sweetLeft,0);assert.equal(st.recoverLeft,2);assert.equal(st.fire,true);assert.equal(st.best,18);
  comboContact(st,'great');assert.equal(st.recoverLeft,1);comboContact(st,'great');assert.equal(st.recoverLeft,0);
});
