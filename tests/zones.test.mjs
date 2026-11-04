import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,startGame,stepGame,attack,useSkill,ballHeight,WEAPONS,PLAYER_Z,KEEPER_Z,GOAL_Z,SIDE,RALLY_STEP,POWER,SOFT,
  ZONES,GOAL_TOP,EARLY_SPEED,LATE_SPEED,GOAL_SCORE} from '../dist/core.mjs';

function play(level){const s=createGame(level);s.practiceLeft=0;startGame(s);stepGame(s,1,0);return s;}
function incoming(s,x=0,z=4){const v=s.level.speed*s.rally;s.ball={x,z,vx:0,vz:-v,z0:z,z1:PLAYER_Z};s.player.x=x;s.hitstop=0;}
const half=WEAPONS.glove.reach*.5,sweet=PLAYER_Z+half;
// Opens the active window when the ball is at depth `z` (t = share of the half box in front of the sweet spot).
function swingAt(s,t,axis=0){const z=sweet+t*half,w=WEAPONS.glove;for(let i=0;i<2000&&s.ball.z>z+Math.abs(s.ball.vz)*w.windup;i++)stepGame(s,1/120,0);attack(s);for(let i=0;i<30&&s.ball.vz<0&&!s.misses;i++)stepGame(s,1/120,axis);}
const speed=b=>Math.hypot(b.vx,b.vz);
// The keeper stands still far from the ball, so every shot reaches the goal line.
function clearKeeper(s,x=2.4){s.level={...s.level,keeper:{...s.level.keeper,speed:0}};s.keeper.x=s.keeper.target=x;}
// Flies the current shot to the goal line; returns the drawn height there and the highest point on the way.
function flyToGoal(s){let top=0,at=null;for(let i=0;i<600&&at===null;i++){const pz=s.ball.z,h=ballHeight(s);top=Math.max(top,h);stepGame(s,1/120,0);if(pz<GOAL_Z&&(s.ball.z>=GOAL_Z||s.events.includes('goal')))at=h;}return {at,top};}
const band=h=>['low','mid','top'][Math.min(2,Math.floor(h/(GOAL_TOP/3)))];

test('出手时机决定球路：早出手高吊、正中重炮、晚出手低平快球、软球低球',()=>{
  const base=s=>s.level.speed*RALLY_STEP;
  let s=play(0);incoming(s);swingAt(s,.7,1);assert.equal(s.shot.zone,'top');assert.ok(Math.abs(speed(s.ball)-base(s)*EARLY_SPEED)<1e-6);
  s=play(0);incoming(s);swingAt(s,0,1);assert.equal(s.shot.zone,'mid');assert.ok(Math.abs(speed(s.ball)-base(s)*POWER)<1e-6);
  s=play(0);incoming(s);swingAt(s,-.7,1);assert.equal(s.shot.zone,'low');assert.ok(Math.abs(speed(s.ball)-base(s)*LATE_SPEED)<1e-6);
  s=play(0);incoming(s);swingAt(s,1.6,1);assert.equal(s.lastShot,'soft');assert.equal(s.shot.zone,'low');assert.ok(Math.abs(speed(s.ball)-base(s)*SOFT)<1e-6);
  assert.ok(EARLY_SPEED<1&&LATE_SPEED>1&&LATE_SPEED<POWER);
  // From level 3 an early contact with a side held banks, and the bank is a lob too.
  s=play(2);incoming(s);swingAt(s,.7,1);assert.equal(s.lastShot,'bank');assert.equal(s.shot.zone,'top');
});
test('球从所属得分区的高度进门，早出手的弧线比晚出手高',()=>{
  const tops={};
  for(const [t,zone] of [[.7,'top'],[0,'mid'],[-.7,'low']]){
    const s=play(0);clearKeeper(s);incoming(s);swingAt(s,t,-1);const {at,top}=flyToGoal(s);
    assert.ok(Math.abs(at-ZONES[zone].h)<.05,`${zone} 进门高度 ${at}`);assert.equal(band(at),zone);tops[zone]=top;
  }
  assert.ok(tops.top>tops.mid&&tops.top>tops.low,JSON.stringify(tops));
  assert.ok(GOAL_TOP>ZONES.top.h&&ZONES.top.h>ZONES.mid.h&&ZONES.mid.h>ZONES.low.h&&ZONES.low.h>0);
});
test('出球和被扑回来的球都从当时的高度接着飞，不跳变',()=>{
  const s=play(0);incoming(s);let prev=ballHeight(s),jump=0;
  // Strike early (top zone), then let the keeper save it and the return come back.
  const w=WEAPONS.glove,z=sweet+.7*half;
  for(let i=0;i<2000&&s.ball.z>z+Math.abs(s.ball.vz)*w.windup;i++){stepGame(s,1/120,0);prev=ballHeight(s);}
  attack(s);s.keeper.x=s.keeper.target=0;let saved=false;
  for(let i=0;i<900&&!s.misses&&!s.events.includes('goal');i++){
    stepGame(s,1/120,0);if(s.events.includes('save'))saved=true;
    const h=ballHeight(s);jump=Math.max(jump,Math.abs(h-prev));prev=h;if(saved&&s.ball.z<PLAYER_Z+1)break;
  }
  assert.ok(saved,'门将应该扑到正中的球');assert.ok(jump<.08,`最大跳变 ${jump}`);
});
// Sends the ball from (0, 4) so its straight line crosses the goal line at `raw` (folded by the walls), keeper out of reach.
function shootAt(s,raw,zone){
  const b=s.ball,z=4,angle=Math.atan2(raw,GOAL_Z-z),v=12;b.x=0;b.z=z;b.vx=Math.sin(angle)*v;b.vz=Math.cos(angle)*v;b.z0=z;b.z1=GOAL_Z;b.curve=null;
  clearKeeper(s);s.keeper.delay=0;s.keeper.err=0;
  s.lastShot='straight';s.shot={x:0,z,angle,kind:'straight',at:s.elapsed,zone};s.swing=null;
  const before=s.score;for(let i=0;i<600&&!s.events.includes('goal');i++)stepGame(s,1/120,0);return s.score-before;
}
test('进球分 = 借墙档 × 得分区倍数',()=>{
  assert.deepEqual([ZONES.low.mult,ZONES.mid.mult,ZONES.top.mult],[1,2,3]);
  for(const zone of ['low','mid','top'])for(const [raw,banks] of [[0,0],[2*SIDE,1],[4*SIDE,2]]){
    const s=play(2);assert.equal(shootAt(s,raw,zone),GOAL_SCORE[banks]*ZONES[zone].mult,`${zone} ${banks}`);
    assert.equal(s.lastGoal.zone,zone);assert.equal(s.lastGoal.banks,banks);
  }
});
test('重炮进球按中区 ×2 计分，不再另加 500',()=>{
  const s=play(0);clearKeeper(s);incoming(s);swingAt(s,0,-1);assert.equal(s.power,true);
  const before=s.score;flyToGoal(s);assert.equal(s.goals,1);assert.equal(s.score-before,GOAL_SCORE[0]*ZONES.mid.mult);
});
test('高吊借墙进球：上区 ×3 × 借一次墙',()=>{
  const s=play(2);clearKeeper(s,1.5);incoming(s);swingAt(s,.7,1);assert.equal(s.lastShot,'bank');
  const before=s.score;flyToGoal(s);assert.equal(s.goals,1);assert.equal(s.score-before,GOAL_SCORE[1]*ZONES.top.mult);
});
test('旋转和爆发技能走中区',()=>{
  let s=play(2);s.energy=100;incoming(s);
  for(let i=0;i<2000&&!(s.ball.z<=PLAYER_Z+WEAPONS.glove.reach*.9);i++)stepGame(s,1/120,0);
  assert.equal(useSkill(s,'spin',1).ok,true);assert.equal(s.shot.zone,'mid');
  s=play(2);s.energy=100;incoming(s);
  for(let i=0;i<2000&&!(s.ball.z<=PLAYER_Z+WEAPONS.glove.reach*.9);i++)stepGame(s,1/120,0);
  assert.equal(useSkill(s,'burst',1).ok,true);for(let i=0;i<300&&!(s.ball.vz>0);i++)stepGame(s,1/120,1);
  assert.equal(s.lastShot,'burst');assert.equal(s.shot.zone,'mid');
  const {at}=flyToGoal(s);if(at!==null)assert.equal(band(at),'mid');
});
test('进球高度不改变门将能不能扑到：同一路线，三个区都被扑',()=>{
  for(const t of [.7,0,-.7]){const s=play(0);incoming(s);s.keeper.x=s.keeper.target=0;
    s.level={...s.level,keeper:{...s.level.keeper,speed:0}};swingAt(s,t,0);
    let saved=false;for(let i=0;i<600&&!saved&&!s.events.includes('goal');i++){stepGame(s,1/120,0);saved=s.events.includes('save');}
    assert.ok(saved,`t=${t}`);assert.ok(KEEPER_Z<GOAL_Z);}
});
