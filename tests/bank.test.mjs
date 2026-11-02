import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,startGame,stepGame,attack,predictFlight,WEAPONS,PLAYER_Z,SIDE,GOAL_Z,AIM_SHARE,LEVELS} from '../dist/core.mjs';
import {createMatchStats,recordMatchEvent,matchSummary} from '../dist/ui.mjs';

function play(level){const s=createGame(level);s.practiceLeft=0;startGame(s);stepGame(s,1,0);return s;}
function incoming(s,x=0,z=4){const v=s.level.speed*s.rally;s.ball={x,z,vx:0,vz:-v,z0:z,z1:PLAYER_Z};s.player.x=x;s.hitstop=0;}
const half=WEAPONS.glove.reach*.5,sweet=PLAYER_Z+half;
// Opens the active window when the ball is at depth `z` (t = share of the half box in front of the sweet spot).
function swingAt(s,t,axis=0){const z=sweet+t*half,w=WEAPONS.glove;for(let i=0;i<2000&&s.ball.z>z+Math.abs(s.ball.vz)*w.windup;i++)stepGame(s,1/120,0);attack(s);for(let i=0;i<30&&s.ball.vz<0&&!s.misses;i++)stepGame(s,1/120,axis);}
const mark=s=>s.level.goalHalf*AIM_SHARE;

test('第 3 关起，框前段出手并按住方向：球打向那侧墙，弹到另一侧门角',()=>{
  for(const level of [2,5])for(const d of [-1,1])for(const x of [-2.5,0,2.5]){
    const s=play(level);incoming(s,x);swingAt(s,.7,d);
    assert.equal(s.lastShot,'bank',`${level} ${d} ${x}`);assert.equal(Math.sign(s.ball.vx),d);
    const f=predictFlight(s);assert.equal(f.wall?.x,d*SIDE);assert.ok(Math.abs(f.goal+d*mark(s))<.05,`落点 ${f.goal}`);
  }
});
test('正中出手照旧是重炮，框后段出手按方向照旧直接打角',()=>{
  let s=play(2);incoming(s);swingAt(s,0,1);assert.equal(s.lastShot,'perfect');assert.equal(predictFlight(s).wall,null);
  s=play(2);incoming(s);swingAt(s,-.7,1);assert.equal(s.lastShot,'right');
  const f=predictFlight(s);assert.equal(f.wall,null);assert.ok(Math.abs(f.goal-mark(s))<.05);
});
test('前两关、不按方向、软球都不借墙',()=>{
  for(const level of [0,1]){const s=play(level);incoming(s);swingAt(s,.7,1);assert.equal(s.lastShot,'right');assert.equal(predictFlight(s).wall,null);}
  let s=play(2);incoming(s);swingAt(s,.7,0);assert.equal(s.lastShot,'straight');assert.equal(predictFlight(s).wall,null);
  // Swinging well before the ball reaches the box (past the swing grace) gives a soft contact: aimed, never banked.
  s=play(2);incoming(s);swingAt(s,2,1);assert.equal(s.lastShot,'soft');assert.equal(predictFlight(s).wall,null);
});
// Sends the ball from (0, 4) so its straight line crosses the goal line at `raw` (folded by the walls), keeper out of reach.
// The shot carries no height zone, so the bank tier alone is scored (zones.test.mjs multiplies it).
function shootAt(s,raw){
  const b=s.ball,z=4,angle=Math.atan2(raw,GOAL_Z-z),v=12;b.x=0;b.z=z;b.vx=Math.sin(angle)*v;b.vz=Math.cos(angle)*v;b.z0=z;b.z1=GOAL_Z;b.curve=null;
  s.level={...s.level,keeper:{...s.level.keeper,speed:0}};s.keeper.x=s.keeper.target=2.4;s.keeper.delay=0;s.keeper.err=0;
  s.lastShot='straight';s.shot={x:0,z,angle,kind:'straight',at:s.elapsed};s.swing=null;
  const before=s.score;for(let i=0;i<600&&!s.events.includes('goal');i++)stepGame(s,1/120,0);return s.score-before;
}
test('进球得分：直线 1000，借一次墙 1500，借两次墙 2500',()=>{
  let s=play(2);assert.equal(shootAt(s,0),1000);assert.equal(s.lastGoal.banks,0);
  s=play(2);assert.equal(shootAt(s,2*SIDE),1500);assert.equal(s.lastGoal.banks,1);
  s=play(2);assert.equal(shootAt(s,4*SIDE),2500);assert.equal(s.lastGoal.banks,2);
});
test('借墙球真实打进时按借墙得分，结算亮点记下借墙破门',()=>{
  const s=play(2);s.level={...s.level,keeper:{...s.level.keeper,speed:0}};s.keeper.x=s.keeper.target=1.5;
  incoming(s);swingAt(s,.7,1);const before=s.score;
  for(let i=0;i<600&&!s.events.includes('goal');i++)stepGame(s,1/120,0);
  // An early contact is a lob as well, so it lands in the top zone (zones.test.mjs).
  assert.equal(s.goals,1);assert.equal(s.score-before,1500*3);
  const stats=createMatchStats();recordMatchEvent(stats,'goal',s);assert.equal(stats.bankGoals,1);
  assert.equal(matchSummary({...s,phase:'won',bestCombo:1},stats).highlight,'借墙破门 1 次');
});
test('第 3 关的课文提到借墙',()=>{assert.match(LEVELS[2].lesson,/借/);});
