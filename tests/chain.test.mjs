import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,startGame,stepGame,attack,useSkill,goalLock,WEAPONS,PLAYER_Z,KEEPER_Z,CHAIN} from '../dist/core.mjs';
import {createMatchStats,recordMatchEvent,matchSummary} from '../dist/ui.mjs';

function play(level=0,options={}){const s=createGame(level,'glove',options);s.practiceLeft=0;startGame(s);stepGame(s,1,0);return s;}
function incoming(s,x=0,z=4){const v=s.level.speed*s.rally;s.ball={x,z,vx:0,vz:-v,z0:z,z1:PLAYER_Z};s.player.x=x;s.hitstop=0;s.swing=null;}
const half=WEAPONS.glove.reach*.5,sweet=PLAYER_Z+half;
// One return: opens the active window when the ball is at timing t (0 = the sweet spot, a perfect), lets the swing
// resolve, and returns every event raised on the way.
function hit(s,t,axis=0){
  incoming(s);const z=sweet+t*half,w=WEAPONS.glove,seen=[],step=a=>{stepGame(s,1/120,a);seen.push(...s.events);};
  for(let i=0;i<2000&&s.ball.z>z+Math.abs(s.ball.vz)*w.windup;i++)step(0);
  attack(s);for(let i=0;i<30&&s.ball.vz<0&&!s.misses;i++)step(axis);
  return seen;
}
// Lets the current shot fly out; the keeper stands at `kx` and does not move.
function resolve(s,kx){s.level={...s.level,keeper:{...s.level.keeper,speed:0}};s.keeper.x=s.keeper.target=kx;const seen=[];
  for(let i=0;i<600&&s.ball.vz>0&&!['goal','won'].includes(s.phase);i++){stepGame(s,1/120,0);seen.push(...s.events);}
  return {result:s.phase==='goal'||s.phase==='won'?'goal':s.ball.vz<0?'save':'other',seen};}

test('完美连击：连续打在甜点上累计，打早、打晚、软球都会断',()=>{
  const s=play();
  for(let i=1;i<=2;i++){hit(s,0);assert.equal(s.lastShot,'perfect');assert.equal(s.chain,i);}
  hit(s,-.7);assert.equal(s.chain,0,'晚出手断');
  hit(s,0);hit(s,.7);assert.equal(s.chain,0,'早出手断');
  hit(s,0);hit(s,1.6);assert.equal(s.lastShot,'soft');assert.equal(s.chain,0,'软球断');
});
test('进球、被扑不断连击；丢球断连击',()=>{
  const s=play();hit(s,0);assert.equal(resolve(s,3).result,'goal');assert.equal(s.chain,1,'进球不断');
  s.phase='playing';hit(s,0);assert.equal(resolve(s,0).result,'save');assert.equal(s.chain,2,'被扑不断');
  incoming(s);for(let i=0;i<600&&!s.misses;i++)stepGame(s,1/120,0);assert.equal(s.misses,1);assert.equal(s.chain,0,'丢球断');
});
test('连到 3 次加分并提示，连到 5 次拿到火球、连击重新算',()=>{
  const s=play();let before=s.score;
  hit(s,0);hit(s,0);const third=hit(s,0);assert.ok(third.includes('chain3'));assert.equal(s.score-before,150*3+CHAIN.bonusScore);
  hit(s,0);assert.equal(s.fire,false);const fifth=hit(s,0);
  assert.ok(fifth.includes('fireReady'));assert.equal(s.fire,true);assert.equal(s.chain,0);assert.equal(CHAIN.fire,5);assert.equal(CHAIN.bonus,3);
  assert.equal(s.shot.fire,false,'第 5 下本身不是火球');
});
test('火球：下一次触球用掉它，门将正挡在线上也挡不住',()=>{
  // Control: the same straight ball at a keeper standing on its line is saved.
  let s=play();hit(s,-.7);assert.equal(resolve(s,0).result,'save');
  s=play();s.fire=true;hit(s,-.7);assert.equal(s.shot.fire,true);assert.equal(s.fire,false,'用掉了');
  const r=resolve(s,0);assert.equal(r.result,'goal');assert.ok(r.seen.includes('pierce'),'穿过门将');assert.equal(s.lastGoal.fire,true);
});
test('火球用在技能上也算，技能不影响完美连击',()=>{
  const s=play(2);s.energy=100;s.fire=true;s.chain=2;incoming(s);
  for(let i=0;i<2000&&!(s.ball.z<=PLAYER_Z+WEAPONS.glove.reach*.9);i++)stepGame(s,1/120,0);
  assert.equal(useSkill(s,'spin',1).ok,true);assert.equal(s.shot.fire,true);assert.equal(s.fire,false);assert.equal(s.chain,2);
});
test('丢球不丢火球；教学里不攒连击',()=>{
  const s=play();s.fire=true;incoming(s);for(let i=0;i<600&&!s.misses;i++)stepGame(s,1/120,0);assert.equal(s.fire,true);
  const t=createGame(0,'glove',{tutorial:true});startGame(t);stepGame(t,1,0);
  for(let i=0;i<5;i++){hit(t,0);assert.equal(t.lastShot,'perfect');assert.equal(t.chain,0);}assert.equal(t.fire,false);
});
test('火球进门框就锁定为必进，放关键球特写',()=>{
  const s=play();s.fire=true;hit(s,-.7);s.level={...s.level,keeper:{...s.level.keeper,speed:0}};s.keeper.x=s.keeper.target=0;
  for(let i=0;i<5;i++)stepGame(s,1/120,0);const lock=goalLock(s);assert.ok(lock,'锁定');assert.equal(lock.key,true);
});
test('结算亮点记下火球破门',()=>{
  const s=play();s.fire=true;hit(s,-.7);resolve(s,0);const stats=createMatchStats();recordMatchEvent(stats,'goal',s);
  assert.equal(stats.fireGoals,1);assert.equal(matchSummary({...s,phase:'won',bestCombo:1},stats).highlight,'火球破门 1 次');
});
