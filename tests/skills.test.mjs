import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,startGame,stepGame,attack,pauseGame,useSkill,skillStatus,hitZone,burstZone,SKILLS,WEAPONS,PLAYER_Z} from '../dist/core.mjs';
import {createMatchStats,recordMatchEvent,matchSummary} from '../dist/ui.mjs';

function play(level=0,weapon='glove'){const s=createGame(level,weapon);s.practiceLeft=0;startGame(s);stepGame(s,1,0);return s;}
const sweet=s=>PLAYER_Z+WEAPONS[s.weapon].reach*.5;
// Ball inside the normal hit zone, coming at the defender.
function inZone(s,dz=0,x=0){s.player.x=0;s.ball={x,z:sweet(s)+dz,vx:0,vz:-4,z0:6,z1:PLAYER_Z};s.hitstop=0;return s;}
function swingAt(s,z){const w=WEAPONS[s.weapon];s.ball={x:0,z:6,vx:0,vz:-4,z0:6,z1:PLAYER_Z};s.player.x=0;for(let i=0;i<2000&&s.ball.z>z+4*w.windup;i++)stepGame(s,1/120,0);attack(s);for(let i=0;i<40&&s.ball.vz<0&&!s.misses;i++)stepGame(s,1/120,0);}
const collect=(s,secs)=>{const ev=[];for(let i=0;i<Math.round(secs*120);i++){stepGame(s,1/120,0);ev.push(...s.events);}return ev;};

test('AC1 能量：新局50，普通+12、完美+25（不叠加），软球/挥空0，上限100，漏球保留，新局重置',()=>{
  const s=play();assert.equal(s.energy,SKILLS.start);assert.equal(SKILLS.start,50);
  const half=WEAPONS.glove.reach*.5;
  swingAt(s,sweet(s)+half*.6);assert.equal(s.lastShot,'straight');assert.equal(s.energy,62);
  let p=play();swingAt(p,sweet(p));assert.equal(p.lastShot,'perfect');assert.equal(p.energy,75);
  let soft=play();soft.ball={x:0,z:4,vx:0,vz:-4,z0:4,z1:PLAYER_Z};soft.player.x=0;const w=WEAPONS.glove,front=PLAYER_Z+w.reach;
  for(let i=0;i<2000&&soft.ball.z>front+4*(w.windup+w.active*.8);i++)stepGame(soft,1/120,0);attack(soft);for(let i=0;i<60&&soft.ball.vz<0;i++)stepGame(soft,1/120,0);
  assert.equal(soft.lastShot,'soft');assert.equal(soft.energy,50);
  const wf=play();wf.ball={x:0,z:7,vx:0,vz:-4,z0:7,z1:PLAYER_Z};attack(wf);collect(wf,.4);assert.equal(wf.energy,50);
  p=play();p.energy=95;swingAt(p,sweet(p));assert.equal(p.energy,100);
  const m=play();m.energy=74;m.ball.z=.01;m.ball.vz=-4;stepGame(m,1/120,0);assert.equal(m.misses,1);assert.equal(m.energy,74);
  assert.equal(createGame(0).energy,50);assert.equal(createGame(3).energy,50);
});
test('AC1 技能回击不回能，满能量放旋转后剩50',()=>{
  const s=inZone(play(),.2);s.energy=100;assert.equal(useSkill(s,'spin').ok,true);assert.equal(s.energy,50);collect(s,.5);assert.equal(s.energy,50);
  const b=inZone(play(),.1);b.energy=100;assert.equal(useSkill(b,'burst').ok,true);assert.equal(b.energy,0);collect(b,1);assert.equal(b.energy,0);
});
test('AC2 接受条件：能量门槛、阶段、来球方向、击球区；失败零扣费',()=>{
  let s=inZone(play());s.energy=49;assert.deepEqual(useSkill(s,'spin'),{ok:false,reason:'energy'});assert.equal(s.energy,49);
  s.energy=50;assert.equal(useSkill(s,'spin').ok,true);assert.equal(s.energy,0);
  s=inZone(play());s.energy=99;assert.equal(useSkill(s,'burst').reason,'energy');assert.equal(s.energy,99);
  s.energy=100;assert.equal(skillStatus(s,'spin').ok,true);assert.equal(skillStatus(s,'burst').ok,true);
  s=play();s.energy=100;s.phase='serving';assert.equal(useSkill(s,'spin').reason,'state');
  s=inZone(play());s.energy=100;pauseGame(s);assert.equal(useSkill(s,'burst').reason,'state');assert.equal(s.energy,100);
  s=inZone(play());s.energy=100;s.ball.vz=4;assert.equal(useSkill(s,'spin').reason,'window');
  s=inZone(play(),2.5);s.energy=100;assert.equal(useSkill(s,'spin').reason,'window');
  s=inZone(play());s.energy=100;s.ball.z=hitZone(s).near-.05;assert.equal(useSkill(s,'burst').reason,'window','后端不扩展');
  s=inZone(play());s.energy=100;attack(s);assert.equal(useSkill(s,'spin').reason,'busy');assert.equal(s.energy,100);
  const t=createGame(0,'glove',{tutorial:true});startGame(t);stepGame(t,1,0);inZone(t);t.energy=100;assert.equal(useSkill(t,'spin').reason,'tutorial');
});
test('AC2 爆发的接球区横向×1.15、前端+0.15，旋转等于普通击球区',()=>{
  const w=WEAPONS.glove;let s=inZone(play(),0,w.width*1.1);s.energy=100;
  assert.equal(skillStatus(s,'spin').reason,'window');assert.equal(skillStatus(s,'burst').ok,true);
  s=inZone(play(),0,w.width*1.2);s.energy=100;assert.equal(skillStatus(s,'burst').reason,'window');
  s=inZone(play());s.energy=100;s.ball.z=hitZone(s).far+.1;assert.equal(skillStatus(s,'spin').reason,'window');assert.equal(skillStatus(s,'burst').ok,true);
  const r=hitZone(s),b=burstZone(s);assert.ok(Math.abs((b.right-b.left)-(r.right-r.left)*1.15)<1e-9);assert.ok(Math.abs(b.far-r.far-.15)<1e-9);assert.equal(b.near,r.near);
});
test('AC3 重复输入：同帧只认第一个动作，只扣一次、只击一次、无补发',()=>{
  let s=inZone(play(),.2);s.energy=100;assert.equal(useSkill(s,'spin').ok,true);assert.equal(useSkill(s,'spin').reason,'busy');assert.equal(attack(s),false);assert.equal(useSkill(s,'burst').reason,'busy');
  assert.equal(s.energy,50);let ev=collect(s,.6);assert.equal(ev.filter(e=>e==='spin').length,1);assert.equal(s.hits,1);
  s=inZone(play(),.2);s.energy=100;assert.equal(attack(s),true);assert.equal(useSkill(s,'spin').reason,'busy');assert.equal(s.energy,100);
  s=inZone(play(),.2);s.energy=100;assert.equal(useSkill(s,'burst').ok,true);assert.equal(useSkill(s,'burst').reason,'charging');assert.equal(attack(s),false);assert.equal(s.energy,0);
  ev=collect(s,1.2);assert.equal(ev.filter(e=>e==='burstStart').length,1);assert.equal(ev.filter(e=>e==='burst').length,1);assert.equal(s.hits,1);assert.equal(s.swing?.hit??true,true);
});
test('AC10 统计：旋转/爆发不冒充完美，各自计数；技能接触记100分',()=>{
  const s=inZone(play(),.2);s.energy=100;const before=s.score;useSkill(s,'spin');collect(s,.1);assert.equal(s.lastShot,'spin');assert.equal(s.score-before,100);assert.equal(s.power,false);
  const stats=createMatchStats();recordMatchEvent(stats,'spin',s);recordMatchEvent(stats,'goal',s);recordMatchEvent(stats,'burst',{lastShot:'burst'});recordMatchEvent(stats,'goal',{lastShot:'burst'});
  assert.equal(stats.powerHits,0);assert.equal(stats.powerGoals,0);assert.equal(stats.spinShots,1);assert.equal(stats.spinGoals,1);assert.equal(stats.burstShots,1);assert.equal(stats.burstGoals,1);
  const r=matchSummary({phase:'won',levelIndex:0,goals:2,misses:0,bestCombo:1,score:2200,level:{goals:2,lesson:''}},stats);assert.doesNotMatch(r.highlight,/重炮/);
});
