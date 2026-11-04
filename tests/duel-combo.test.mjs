import test from 'node:test';
import assert from 'node:assert/strict';
import {PLAYER_Z,WEAPONS,RALLY_STEP,POWER,PERFECT_BAND,SKILLS} from '../dist/core.mjs';
import {createDuel,stepDuel,duelAttack,duelHitZone,localBall,mirrorBall,DUEL} from '../dist/duel-core.mjs';
import {COMBO,comboMult,comboSpeed} from '../dist/combo.mjs';
import {createLoopback,createClient} from '../dist/duel-net.mjs';
import {createBot} from '../dist/duel-bot.mjs';

const W=WEAPONS.glove,half=W.reach*.5,sweet=PLAYER_Z+half,near=(a,b,eps=1e-6)=>Math.abs(a-b)<eps;
function duel(){const s=createDuel();s.phase='playing';return s;}
// Puts a ball coming at `side` in its own view, straight down its line, at the duel's serve pace.
function incoming(s,side,x=0){const l={x,z:4,vx:0,vz:-DUEL.speed,curve:null,kind:null,z0:4,z1:PLAYER_Z};Object.assign(s.ball,side==='a'?l:mirrorBall(l));
  s.players[side].x=side==='a'?x:-x;s.players[side].swing=null;s.hitstop=0;s.hold=false;}
// One return by `side` at timing t (0 = the sweet spot), holding `axis`; returns every event raised on the way.
function hit(s,side,t,axis=0){
  incoming(s,side);const z=sweet+t*half,seen=[],ins={[side]:{axis}},step=()=>{stepDuel(s,1/120,ins);seen.push(...s.events);};
  for(let i=0;i<2000&&localBall(s,side).z>z+DUEL.speed*W.windup;i++)step();
  duelAttack(s,side);for(let i=0;i<40&&!s.players[side].swing?.hit;i++)step();
  return seen;
}
const speed=s=>Math.hypot(s.ball.vx,s.ball.vz);
// Lets the ball fly on untouched until a goal or 3 s; returns the events.
function flyOn(s){const seen=[];for(let i=0;i<360&&s.phase==='playing';i++){stepDuel(s,1/120,{});seen.push(...s.events);}return seen;}

test('每名玩家各有连击：回球累计，自己进球不断；被进球就断、记下长度并进入恢复期',()=>{
  const s=duel();for(let i=0;i<3;i++)hit(s,'a',-.5);assert.equal(s.players.a.streak.n,3);assert.equal(s.players.b.streak.n,0);
  s.players.b.streak.n=6;const seen=flyOn(s);
  assert.equal(s.score.a,1,'A 进球');assert.equal(s.players.a.streak.n,3,'进球不断自己的连击');
  assert.equal(s.players.b.streak.n,0);assert.equal(s.players.b.streak.recoverLeft,COMBO.recoverBalls);
  const b=seen.find(e=>e.type==='comboBreak');assert.ok(b);assert.equal(b.side,'b');assert.equal(b.n,6);
});
test('判定写进出球：甜点带内 Perfect、近一点 Great、远一点 Good；积分按当时倍率累加',()=>{
  let s=duel();hit(s,'a',0);assert.equal(s.shot.tier,'perfect');assert.equal(s.players.a.streak.points,Math.round(COMBO.points.perfect*comboMult({n:1,sweetLeft:0})));
  s=duel();hit(s,'a',-.5);assert.equal(s.shot.tier,'great');
  s=duel();hit(s,'a',-.85);assert.equal(s.shot.tier,'good');
});
test('来球加速只作用在连击方：B 连到 10，A 打给 B 的球快 8%；A 自己的连击不让自己的出球变快',()=>{
  const base=DUEL.speed*RALLY_STEP;
  let s=duel();s.players.b.streak.n=10;hit(s,'a',-.5);assert.ok(near(speed(s),base*comboSpeed({n:10})),`${speed(s)}`);assert.ok(near(comboSpeed({n:10}),1.08));
  s=duel();s.players.a.streak.n=10;hit(s,'a',-.5);assert.ok(near(speed(s),base));
});
test('连击方自己的甜点带收窄；恢复期甜点带和接球框放宽；场上画的框跟着变',()=>{
  const s=duel(),band=r=>r.sweetFar-r.sweetNear,width=r=>r.right-r.left,plain=duelHitZone(s,'a');
  assert.ok(near(band(plain),2*PERFECT_BAND*half));
  s.players.a.streak.n=20;assert.ok(near(band(duelHitZone(s,'a')),band(plain)*.9));
  s.players.a.streak.n=0;s.players.a.streak.recoverLeft=2;const r=duelHitZone(s,'a');
  assert.ok(near(band(r),band(plain)*1.2));assert.ok(near(width(r),width(plain)*1.1));
  assert.ok(near(width(duelHitZone(s,'b')),width(plain)),'对手不受影响');
});
test('连续 3 次 Perfect 进入甜点状态，之后 2 次触球倍率 +0.5、甜点带 ×1.3',()=>{
  const s=duel();let seen=[];for(let i=0;i<3;i++)seen=hit(s,'a',0);
  assert.ok(seen.some(e=>e.type==='sweetStart'&&e.side==='a'));assert.equal(s.players.a.streak.sweetLeft,2);
  const before=s.players.a.streak.points;hit(s,'a',-.5);
  assert.equal(s.players.a.streak.points-before,Math.round(COMBO.points.great*(comboMult({n:4,sweetLeft:0})+COMBO.sweetMult)));
});
test('火球能接：连 5 次 Perfect 后下一击球速 ×1.25；对手用 Perfect 接住算破火，加分加能量',()=>{
  const s=duel();let seen=[];for(let i=0;i<5;i++)seen=hit(s,'a',0);assert.ok(seen.some(e=>e.type==='fireReady'));assert.equal(s.players.a.streak.fire,true);
  const rally=s.rally;seen=hit(s,'a',-.5);assert.equal(s.shot.fire,true);assert.equal(s.players.a.streak.fire,false);
  assert.ok(near(speed(s),DUEL.speed*Math.min(1.6,rally*RALLY_STEP)*COMBO.fireSpeed));assert.ok(seen.some(e=>e.type==='fireShot'));
  // B returns that fireball in its power band (the shot record still says fire when B strikes).
  const energy=s.players.b.energy;seen=hit(s,'b',0);assert.ok(seen.some(e=>e.type==='breakFire'&&e.side==='b'),'破火');
  assert.equal(s.players.b.energy,Math.min(SKILLS.max,energy+SKILLS.gainPerfect+COMBO.breakFireEnergy));
  assert.ok(s.players.b.streak.points>=COMBO.points.perfect+COMBO.points.breakFire);assert.equal(s.shot.fire,false);
});
test('联机：两份副本经 160 毫秒回环对打一局，双方的连击状态和积分完全一致',()=>{
  let T=0;const DT=1/120,now=()=>T,loop=createLoopback({delayMs:80,jitterMs:16,seed:3,now});
  const c={a:createClient({side:'a',transport:loop[0],now}),b:createClient({side:'b',transport:loop[1],now})},bots={a:createBot({seed:7}),b:createBot({seed:8})};
  for(const x of Object.values(c))x.start();let streaks=0;
  for(let f=0;f<120*600&&!(c.a.state.phase==='won'&&c.b.state.phase==='won');f++){
    T+=DT;loop.flush();
    for(const side of ['a','b']){const d=bots[side].decide(c[side].view(),DT);c[side].step(DT,{axis:d.axis,swing:d.swing,skill:d.skill});}
    for(const x of Object.values(c))x.state.events=[];
    streaks=Math.max(streaks,c.a.state.players.a.streak.best);
  }
  assert.equal(c.a.state.phase,'won');assert.equal(c.b.state.phase,'won');assert.ok(streaks>=5,`最高连击 ${streaks}`);
  for(const side of ['a','b'])assert.deepEqual(c.a.state.players[side].streak,c.b.state.players[side].streak,`${side} 的连击状态`);
});
