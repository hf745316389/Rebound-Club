import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stepGame,attack,useSkill,PLAYER_Z,WEAPONS,EARLY_SPEED,LATE_SPEED} from '../dist/core.mjs';
import {createDuel,startDuel,stepDuel,duelAttack,duelSkill,toLocal,fromLocal,mirrorBall,localBall,COURT,DUEL,DUEL_ACTIVE} from '../dist/duel-core.mjs';

const near=(a,b,eps=1e-9)=>Math.abs(a-b)<eps;
// A duel in play with the ball placed in `side`'s own view.
function duelWith(side,ball,me=0,opp=0){
  const s=createDuel();s.phase='playing';const l={curve:null,kind:null,z0:ball.z,z1:PLAYER_Z,...ball};
  Object.assign(s.ball,side==='a'?l:mirrorBall(l));s.players[side].x=side==='a'?me:-me;s.players[side==='a'?'b':'a'].x=side==='a'?opp:-opp;return s;
}
// The single-player level 1 position at the duel's ball speed (design Amendments A3): the same rules, the same pace.
function singleWith(ball,me=0,keeper=0){const g=createGame(0);g.level={...g.level,speed:DUEL.speed};g.phase='playing';Object.assign(g.ball,{z0:ball.z,z1:PLAYER_Z,...ball});g.player.x=me;g.keeper.x=g.keeper.target=keeper;g.practiceLeft=0;return g;}
// Steps until the first contact and returns the outgoing velocity in the striker's own view. The duel has no height
// zones, so a clean single-player hit's timing pace (early lob slower, late drive quicker) is taken out.
function strikeSingle(g,axis,lead){
  for(let i=0;i<lead;i++)stepGame(g,1/120,axis);attack(g);for(let i=0;i<120&&!g.swing?.hit&&g.swing;i++)stepGame(g,1/120,axis);if(!g.swing?.hit)return null;
  const pace=g.lastShot==='straight'?(g.shot.zone==='top'?EARLY_SPEED:LATE_SPEED):1;return {vx:g.ball.vx/pace,vz:g.ball.vz/pace,kind:g.lastShot};
}
function strikeDuel(s,side,axis,lead){const ins=()=>({[side]:{axis}});for(let i=0;i<lead;i++)stepDuel(s,1/120,ins());duelAttack(s,side);
  for(let i=0;i<120&&s.players[side].swing&&!s.players[side].swing.hit;i++)stepDuel(s,1/120,ins());if(!s.players[side].swing?.hit)return null;const l=localBall(s,side);return {vx:l.vx,vz:l.vz,kind:s.players[side].lastShot};}

test('对战视角：B 的本地视角来回转换不变', ()=>{
  const s=createDuel();Object.assign(s.ball,{x:1.3,z:6.2,vx:-2.1,vz:4.4,curve:{k:.06,stopZ:8.1},kind:'spin',z0:2,z1:7.6});s.players.a.x=-.7;s.players.b.x=2.2;
  for(const side of ['a','b']){const back=fromLocal(toLocal(s,side),side);
    for(const k of ['x','z','vx','vz','z0','z1'])assert.ok(near(back.ball[k],s.ball[k]),`${side} ${k}`);
    assert.ok(near(back.ball.curve.k,s.ball.curve.k)&&near(back.ball.curve.stopZ,s.ball.curve.stopZ));
    assert.ok(near(back.players.a.x,s.players.a.x)&&near(back.players.b.x,s.players.b.x));}
  const l=toLocal(s,'b');assert.ok(near(l.ball.x,-1.3)&&near(l.ball.z,COURT-6.2)&&near(l.me.x,-2.2)&&near(l.opp.x,.7));
});

test('对战击球与单机一致：同一处境下两边的出球种类、角度都和单机相同，速度只差单机按时机改球路的倍数', ()=>{
  const sweet=PLAYER_Z+WEAPONS.glove.reach*.5;let cases=0;
  for(const lead of [0,8,13,18,25])for(const axis of [-1,0,1])for(const me of [-1.2,0,.8]){
    const ball={x:me+.3,z:sweet+1.2,vx:-.4,vz:-DUEL.speed};
    const single=strikeSingle(singleWith(ball,me,1),axis,lead);
    for(const side of ['a','b']){
      const duel=strikeDuel(duelWith(side,ball,me,1),side,axis,lead);
      assert.equal(!!duel,!!single,`lead ${lead} axis ${axis} ${side}: 是否击中`);if(!single)continue;
      assert.equal(duel.kind,single.kind,`lead ${lead} axis ${axis} ${side}: 种类`);
      assert.ok(near(duel.vx,single.vx)&&near(duel.vz,single.vz),`lead ${lead} axis ${axis} ${side}: 速度 ${duel.vx},${duel.vz} vs ${single.vx},${single.vz}`);
      cases++;}
  }
  assert.ok(cases>=40,`实际比对 ${cases} 组`);
  // Soft, clean and perfect all occur among the cases above, so each kind is covered.
  const kinds=new Set();for(const lead of [0,13,18,25]){const r=strikeSingle(singleWith({x:.3,z:sweet+1.2,vx:-.4,vz:-DUEL.speed},0,1),0,lead);if(r)kinds.add(r.kind==='straight'?'clean':r.kind);}
  assert.deepEqual([...kinds].sort(),['clean','perfect','soft']);
});

test('B 的门：门框内过线 A 得分、下一球发向 B；门框外打偏弹回、不得分', ()=>{
  const s=createDuel();s.phase='playing';Object.assign(s.ball,{x:1,z:COURT-.05,vx:0,vz:5,curve:null,kind:null});
  for(let i=0;i<4;i++)stepDuel(s,1/120);
  assert.deepEqual(s.score,{a:1,b:0});assert.equal(s.phase,'goal');assert.equal(s.serveTo,'b');
  for(let i=0;i<300&&s.phase!=='playing';i++)stepDuel(s,1/60);
  assert.equal(s.phase,'playing');assert.ok(localBall(s,'b').vz<0,'发球朝 B 飞');
  const w=createDuel();w.phase='playing';Object.assign(w.ball,{x:3,z:COURT-.05,vx:0,vz:5,curve:null,kind:null});const events=[];
  for(let i=0;i<20;i++){stepDuel(w,1/120);events.push(...w.events.map(e=>e.type));}
  assert.ok(events.includes('wide'));assert.ok(w.ball.vz<0,'弹回朝 A');assert.deepEqual(w.score,{a:0,b:0});assert.equal(w.phase,'playing');
});

test('先到 5 分获胜，之后对局不再推进', ()=>{
  const s=createDuel();s.phase='playing';s.score.b=DUEL.goals-1;Object.assign(s.ball,{x:0,z:.05,vx:0,vz:-5,curve:null,kind:null});
  for(let i=0;i<4;i++)stepDuel(s,1/120);
  assert.equal(s.phase,'won');assert.equal(s.winner,'b');assert.equal(s.score.b,DUEL.goals);assert.ok(!DUEL_ACTIVE.includes('won'));
  const t=s.elapsed,ball=JSON.stringify(s.ball);stepDuel(s,.5);assert.equal(s.elapsed,t);assert.equal(JSON.stringify(s.ball),ball);
});

test('球朝 A 飞时 B 挥击打不中，只算挥空', ()=>{
  const s=duelWith('b',{x:0,z:PLAYER_Z+.5,vx:0,vz:3},0,0);const events=[];
  assert.ok(duelAttack(s,'b'));for(let i=0;i<60;i++){stepDuel(s,1/120);events.push(...s.events);}
  assert.ok(events.some(e=>e.type==='whiff'&&e.side==='b'));assert.equal(s.shots,0);assert.ok(localBall(s,'b').vz>0,'球继续飞离 B');
});

test('B 放旋转：扣 50 能量，不按方向时往远离 A 的一侧拐，和单机按门将位置的规则一致', ()=>{
  const sweet=PLAYER_Z+WEAPONS.glove.reach*.5,ball={x:.2,z:sweet,vx:0,vz:-DUEL.speed};
  for(const opp of [-1,1]){
    const s=duelWith('b',ball,0,opp);s.players.b.energy=50;const r=duelSkill(s,'b','spin',0);assert.ok(r.ok,JSON.stringify(r));
    assert.equal(s.players.b.energy,0);const l=localBall(s,'b');assert.equal(l.kind,'spin');assert.equal(Math.sign(l.curve.k),opp>=0?-1:1);
    const g=singleWith(ball,0,opp);g.energy=50;assert.ok(useSkill(g,'spin',0).ok);
    assert.ok(near(l.vx,g.ball.vx)&&near(l.vz,g.ball.vz)&&near(l.curve.k,g.ball.curve.k)&&near(l.curve.stopZ,g.ball.curve.stopZ));
  }
});

test('开局发向 A，本机双方都由本地判定时不产生网络消息', ()=>{
  const s=createDuel();startDuel(s);for(let i=0;i<200&&s.phase!=='playing';i++)stepDuel(s,1/60);
  assert.equal(s.phase,'playing');assert.ok(localBall(s,'a').vz<0);assert.deepEqual(s.outbox,[]);
});
