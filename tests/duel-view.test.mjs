import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import {buildWorld,DUEL_FAR_GLOVE} from '../dist/scene3d.mjs';
import {loadCharacters} from './helpers/characters.mjs';
import {WEAPONS,PLAYER_Z} from '../dist/core.mjs';
import {createDuel,startDuel,stepDuel,duelAttack,duelSkill,mirrorBall,OPP_Z,DUEL,SIDES} from '../dist/duel-core.mjs';
import {viewFor} from '../dist/duel-view.mjs';
import {createBot} from '../dist/duel-bot.mjs';
const assets=await loadCharacters();

function inPlay(){const s=createDuel();startDuel(s);for(let i=0;i<200&&s.phase!=='playing';i++)stepDuel(s,1/60);return s;}

test('对战画面：两边视角都是自己在近端、对手在远端对应位置；对手出拳几乎没有前摇；没有门将扑救范围条', ()=>{
  for(const side of ['a','b']){
    const w=buildWorld(assets,{duel:true}),opp=side==='a'?'b':'a',s=inPlay();
    s.players[side].x=side==='a'?.9:-.9;s.players[opp].x=side==='a'?-1.4:1.4;
    const v=viewFor(s,side);w.update(v,0,true,1);
    let body=null;w.hero.traverse(o=>{if(o.name==='jersey-body')body=o;});assert.ok(body,'近端是主角模型');
    assert.ok(Math.abs(w.hero.position.x-.9)<1e-9,`${side}: 自己在本地 x=0.9`);
    assert.ok(Math.abs(w.keeper.position.x+1.4)<1e-9&&Math.abs(w.keeper.position.z+OPP_Z)<1e-9,`${side}: 对手在本地 x=-1.4、远端站位`);
    assert.equal(w.reachBar.visible,false);
    // The opponent swings at a ball on the screen's right of it (its own left glove).
    const l={x:v.keeper.x+.6,z:OPP_Z-.6,vx:0,vz:4,curve:null,kind:null,z0:2,z1:OPP_Z};Object.assign(s.ball,side==='a'?l:mirrorBall(l));
    s.players[opp].swing={time:0};w.update(viewFor(s,side),0,true,1);
    s.players[opp].swing.time=WEAPONS.glove.windup;w.update(viewFor(s,side),0,true,1);
    const c=w.oppPunch.left,now=w.actors.goalie.handForward(c.side);
    assert.ok(now>=c.forward*.8,`${side}: 对手手前伸 ${now.toFixed(3)} / 最大 ${c.forward.toFixed(3)}`);
  }
});

test('对战画面：近端球门与远端同宽', ()=>{
  const w=buildWorld(assets,{duel:true}),box=new THREE.Box3().setFromObject(w.nearGoal);
  assert.ok(box.max.x<DUEL.goalHalf+.2&&box.max.x>DUEL.goalHalf,`近端球门半宽 ${box.max.x.toFixed(2)}`);
  const single=new THREE.Box3().setFromObject(buildWorld(assets).nearGoal);assert.ok(single.max.x>3.9,'单机近端球门不变');
});

test('对战画面：球门不画单机的上中下三区和倍数牌（对战没有三区）', ()=>{
  const bands=w=>{let n=0;w.farGoal.traverse(o=>{if(o.userData.zoneBand)n++;});return n;};
  assert.ok(bands(buildWorld(assets))>0,'单机画三区');assert.equal(bands(buildWorld(assets,{duel:true})),0);
});

const draws=w=>{let main=0,casters=0;w.scene.traverseVisible(o=>{if(o.isMesh||o.isLine||o.isPoints){main++;if(o.isMesh&&o.castShadow)casters++;}});return {main,casters};};
test('对战连续渲染 300 帧（有击中、进球）：不新建物体、几何体、材质', ()=>{
  const w=buildWorld(assets,{duel:true});w.resize(.46);const s=createDuel(),bots={a:createBot({seed:3}),b:createBot({seed:4})};startDuel(s);
  const count=()=>{let objects=0;const g=new Set(),m=new Set();w.scene.traverse(o=>{objects++;if(o.geometry)g.add(o.geometry.uuid);if(o.material)m.add(o.material.uuid);});return [objects,g.size,m.size];};
  w.update(viewFor(s,'a'),0,false,0);const before=count();const seen=new Set();
  for(let f=1;f<=300;f++){
    const ins={};for(const side of SIDES){const d=bots[side].decide(viewFor(s,side),1/60);ins[side]={axis:d.axis};if(d.skill)duelSkill(s,side,d.skill,d.axis);else if(d.swing)duelAttack(s,side);}
    // A goal inside the window: A is pulled far off a fast ball coming at it.
    if(f===150){s.players.a.x=3.4;Object.assign(s.ball,{x:-1,z:2.5,vx:0,vz:-9,curve:null,kind:null});}
    stepDuel(s,1/60,ins);for(const e of s.events)seen.add(e.type);
    w.update(viewFor(s,'a'),ins.a.axis,false,f/60);w.shake(.03);
  }
  assert.ok(seen.has('hit')||seen.has('perfect'),'期间有击中');assert.ok(seen.has('goal'),'期间有进球');
  assert.deepEqual(count(),before);
});

// Measured at the moments perf.test.mjs measures the single-player court (lobby, just after the serve), same limits.
test('对战绘制数：准备状态与发球后，可见物体 ≤100、投影物体 ≤50（与 perf.test 的统计时机和阈值相同）', ()=>{
  const w=buildWorld(assets,{duel:true});w.resize(.46);
  for(const s of [createDuel(),inPlay()])for(const side of SIDES){w.update(viewFor(s,side),0,false,1);const c=draws(w);
    assert.ok(c.main<=100,`${side} 可见物体 ${c.main}`);assert.ok(c.casters<=50,`${side} 投影物体 ${c.casters}`);}
});

// The receiver of a burst used to see only a frozen opponent for the charge, as if the link had stalled: now the charge
// plays at the far end on the same clock, and the camera stays on the normal frame.
test('对手放爆发：接球方画面里，蓄力光圈和冲击波在对手脚下，球上有收拢的倒计时环、横幅切入，镜头不推近', ()=>{
  const w=buildWorld(assets,{duel:true});w.resize(.46);const s=inPlay(),B={freeze:.12,strike:.75};
  const sweet=PLAYER_Z+WEAPONS.glove.reach*.5;Object.assign(s.ball,mirrorBall({x:.3,z:sweet,vx:0,vz:-DUEL.speed,curve:null,kind:null,z0:sweet,z1:PLAYER_Z}));
  s.players.b.energy=100;s.players.b.x=-.3;assert.ok(duelSkill(s,'b','burst',0).ok);
  const fx=w.burstFx,at=t=>{while(s.skill&&s.skill.time<t)stepDuel(s,1/120);w.update(viewFor(s,'a'),0,false,t);};
  const frame0=w.camera.position.clone();
  at(.3);const v=viewFor(s,'a');
  assert.ok(fx.aura.visible&&fx.sparks.visible,'对手身上有光圈和火花');assert.ok(Math.abs(fx.aura.position.x-v.keeper.x)<1e-6&&Math.abs(fx.aura.position.z+OPP_Z)<1e-6,'光圈在对手脚下');
  assert.ok(fx.foeBanner.visible&&!fx.banner.visible,'切入的是对手横幅');assert.ok(fx.halo.visible,'球上有倒计时环');const wide=fx.halo.scale.x;
  assert.ok(w.camera.position.distanceTo(frame0)<.05,'镜头保持正常构图');
  at(B.strike+.05);assert.ok(fx.halo.scale.x<wide,'倒计时环在收拢');assert.ok(fx.shock.visible&&Math.abs(fx.shock.position.z+OPP_Z)<1e-6,'出手冲击波在对手那端');
  at(9);assert.equal(s.phase,'playing');w.update(viewFor(s,'a'),0,false,9);
  for(const k of ['aura','sparks','halo','foeBanner'])assert.equal(fx[k].visible,false,`${k} 球飞出后隐藏`);
});

// AC21 stand-in report: the far figure's near-white gloves hid the white ball at contact; in a duel they are deep navy.
test('对战远端人物的手套是深藏青，和白球分得开；单机门将的手套不变', ()=>{
  const color=w=>w.actors.goalie.gloves.map(g=>'#'+g.group.getObjectByName('glove-body').material.color.getHexString());
  assert.deepEqual(color(buildWorld(assets,{duel:true})),[DUEL_FAR_GLOVE,DUEL_FAR_GLOVE]);
  assert.deepEqual(color(buildWorld(assets)),['#f4f6ff','#f4f6ff']);
});
