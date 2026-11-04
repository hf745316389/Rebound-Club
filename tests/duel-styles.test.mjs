import test from 'node:test';
import assert from 'node:assert/strict';
import {PLAYER_Z,WEAPONS,RALLY_STEP,POWER,RUN,SKILLS} from '../dist/core.mjs';
import {createDuel,stepDuel,duelAttack,duelSkill,duelSkillStatus,duelHitZone,duelBurstZone,duelFigure,localBall,mirrorBall,DUEL} from '../dist/duel-core.mjs';
import {createLoopback,createClient,createWatcher} from '../dist/duel-net.mjs';
import {viewFor} from '../dist/duel-view.mjs';
import {styleText} from '../dist/ui.mjs';
import {createBot} from '../dist/duel-bot.mjs';

const W=WEAPONS.glove,half=W.reach*.5,sweet=PLAYER_Z+half,near=(a,b,eps=1e-6)=>Math.abs(a-b)<eps;
function duel(figures){const s=createDuel({figures});s.phase='playing';return s;}
// Puts a ball coming at `side` in its own view, straight down its line, at the duel's serve pace.
function incoming(s,side,x=0){const l={x,z:4,vx:0,vz:-DUEL.speed,curve:null,kind:null,z0:4,z1:PLAYER_Z};Object.assign(s.ball,side==='a'?l:mirrorBall(l));
  s.players[side].x=side==='a'?x:-x;s.players[side].swing=null;s.hitstop=0;s.hold=false;}
// One return by `side` at timing t (0 = the sweet spot).
function hit(s,side,t){
  incoming(s,side);const z=sweet+t*half;
  for(let i=0;i<2000&&localBall(s,side).z>z+DUEL.speed*W.windup;i++)stepDuel(s,1/120,{});
  duelAttack(s,side);for(let i=0;i<40&&!s.players[side].swing?.hit;i++)stepDuel(s,1/120,{});
}
const speed=s=>Math.hypot(s.ball.vx,s.ball.vz),width=r=>r.right-r.left;
// How far `side` runs in 0.1 s holding right in its own view, the ball flying away from it.
function run(s,side){
  const l={x:0,z:6,vx:0,vz:DUEL.speed,curve:null,kind:null,z0:6,z1:9};Object.assign(s.ball,side==='a'?l:mirrorBall(l));s.players[side].x=0;
  for(let i=0;i<12;i++)stepDuel(s,1/120,{[side]:{axis:1}});return Math.abs(s.players[side].x);
}
// How long a connected swing stays out before the next one can start.
function swingTime(s,side){hit(s,side,0);let t=0;while(s.players[side].swing&&t<2){stepDuel(s,1/120,{});t+=1/120;}return t;}

test('对战里每名玩家打自己人物的风格；没选或不认识的人物按游侠（均衡）',()=>{
  const s=createDuel({figures:{a:'hooded',b:'knight'}});
  assert.deepEqual([s.players.a.figure,s.players.a.style,s.players.b.figure,s.players.b.style],['hooded','agile','knight','guard']);
  const d=createDuel({figures:{a:'dragon'}});assert.deepEqual([d.players.a.figure,d.players.a.style,d.players.b.style],['rogue','balanced','balanced']);
  assert.equal(duelFigure(d,'b','mage'),true);assert.equal(d.players.b.style,'skill');
  assert.equal(duelFigure(d,'b','dragon'),false,'不认识的人物不改');assert.equal(d.players.b.figure,'mage');
});
test('接球框：骑士宽 10%、兜帽侠窄 5%，只改自己的框，爆发框跟着变',()=>{
  const s=duel({a:'knight',b:'hooded'}),plain=duel();
  assert.ok(near(width(duelHitZone(s,'a')),width(duelHitZone(plain,'a'))*1.1));assert.ok(near(width(duelHitZone(s,'b')),width(duelHitZone(plain,'b'))*.95));
  assert.ok(near(width(duelBurstZone(s,'a')),width(duelBurstZone(plain,'a'))*1.1));
  assert.ok(near(width(duelHitZone(plain,'a')),W.width*2),'游侠就是拳套');
});
test('跑速：兜帽侠快 10%、骑士慢 5%，两边视角都一样',()=>{
  for(const side of ['a','b']){
    assert.ok(near(run(duel(),side),RUN*.1));
    assert.ok(near(run(duel({[side]:'hooded'}),side),RUN*.1*1.1));assert.ok(near(run(duel({[side]:'knight'}),side),RUN*.1*.95));
  }
});
test('重炮：对战只算单机加减的三成，大胡子的完美击球快 3%，法师慢 1.5%；普通击球不变；设置页写的是对战的数',()=>{
  const power=DUEL.speed*RALLY_STEP*POWER;assert.equal(DUEL.stylePower,.3);
  let s=duel({a:'barbarian'});hit(s,'a',0);assert.equal(s.shot.tier,'perfect');assert.ok(near(speed(s),power*1.03),`${speed(s)}`);
  s=duel({b:'mage'});hit(s,'b',0);assert.ok(near(speed(s),power*.985));
  assert.equal(styleText('power',{powerShare:DUEL.stylePower}),'重拳：重炮球速 +3%；代价：收招慢 40%');
  assert.equal(styleText('skill',{powerShare:DUEL.stylePower}),'技巧：旋转只要 40 能量；代价：重炮球速 −1.5%');
  assert.equal(styleText('power'),'重拳：重炮球速 +10%；代价：收招慢 40%','单机不变');
  s=duel({a:'barbarian'});hit(s,'a',-.5);assert.ok(near(speed(s),DUEL.speed*RALLY_STEP));
});
test('收招：大胡子收招慢 40%，别人不变',()=>{
  const base=swingTime(duel(),'a'),slow=swingTime(duel({a:'barbarian'}),'a');
  assert.ok(Math.abs(slow-base-W.recovery*.4)<1.5/120,`${base} → ${slow}`);
  assert.ok(Math.abs(swingTime(duel({b:'barbarian'}),'a')-base)<1/240,'只改自己');
});
test('旋转：法师 40 能量就能放并扣 40，游侠 40 能量还不够',()=>{
  const ready=s=>{incoming(s,'a');for(let i=0;i<2000&&localBall(s,'a').z>duelHitZone(s,'a').far-.05;i++)stepDuel(s,1/120,{});};
  const m=duel({a:'mage'});m.players.a.energy=40;ready(m);assert.equal(duelSkillStatus(m,'a','spin').ok,true);
  duelSkill(m,'a','spin');assert.equal(m.players.a.energy,0);
  const r=duel();r.players.a.energy=40;ready(r);assert.deepEqual(duelSkillStatus(r,'a','spin'),{ok:false,reason:'energy'});
});
test('联机：人物随位置消息传过去，两份副本里双方的人物一致；整局打完比分和连击也一致',()=>{
  let T=0;const DT=1/120,now=()=>T,loop=createLoopback({delayMs:80,jitterMs:16,seed:5,now});
  const c={a:createClient({side:'a',transport:loop[0],now,figure:'barbarian'}),b:createClient({side:'b',transport:loop[1],now,figure:'knight'})};
  const bots={a:createBot({seed:11}),b:createBot({seed:12})};for(const x of Object.values(c))x.start();
  for(let f=0;f<120*600&&!(c.a.state.phase==='won'&&c.b.state.phase==='won');f++){
    T+=DT;loop.flush();
    for(const side of ['a','b']){const d=bots[side].decide(c[side].view(),DT);c[side].step(DT,{axis:d.axis,swing:d.swing,skill:d.skill});}
    for(const x of Object.values(c))x.state.events=[];
  }
  for(const x of Object.values(c))assert.deepEqual([x.state.players.a.figure,x.state.players.a.style,x.state.players.b.figure,x.state.players.b.style],['barbarian','power','knight','guard']);
  assert.equal(c.a.state.phase,'won');assert.deepEqual(c.a.state.score,c.b.state.score);
  for(const side of ['a','b'])assert.deepEqual(c.a.state.players[side].streak,c.b.state.players[side].streak);
  const v=c.b.view();assert.deepEqual([v.figure,v.style,v.opponent.figure,v.opponent.style],['knight','guard','barbarian','power']);
});
test('观战：从观战流的位置消息拿到双方人物；不认识的人物不改',()=>{
  let T=0;const w=createWatcher({now:()=>T});
  w.push({side:'a',msgs:[{type:'pos',t:0,x:0,axis:0,swing:null,fig:'mage'}],o:0,at:0});
  w.push({side:'b',msgs:[{type:'pos',t:0,x:0,axis:0,swing:null,fig:'hooded'},{type:'pos',t:.01,x:0,axis:0,swing:null,fig:'dragon'}],o:0,at:0});
  T=1.2;w.step();
  assert.deepEqual([w.state.players.a.figure,w.state.players.b.figure,w.state.players.b.style],['mage','hooded','agile']);
  const v=viewFor(w.state,'b');assert.deepEqual([v.figure,v.opponent.figure],['hooded','mage']);
});
