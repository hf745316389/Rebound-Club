import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,startGame,stepGame,attack,hitZone,skillStatus,useSkill,WEAPONS,PLAYER_Z,RALLY_STEP,POWER,RUN,STYLES,SKILLS} from '../dist/core.mjs';
import {PLAYERS,playerSpec} from '../dist/characters.mjs';
import {styleSummary} from '../dist/ui.mjs';

function play(style,level=0){const s=createGame(level,'glove',{style});s.practiceLeft=0;startGame(s);stepGame(s,1,0);return s;}
function incoming(s,x=0,z=4){const v=s.level.speed*s.rally;s.ball={x,z,vx:0,vz:-v,z0:z,z1:PLAYER_Z};s.player.x=x;s.hitstop=0;}
const half=WEAPONS.glove.reach*.5,sweet=PLAYER_Z+half;
// Opens the active window when the ball is at timing t, then lets the swing resolve.
function swingAt(s,t,axis=0){const z=sweet+t*half,w=WEAPONS.glove;for(let i=0;i<2000&&s.ball.z>z+Math.abs(s.ball.vz)*w.windup;i++)stepGame(s,1/120,0);attack(s);for(let i=0;i<30&&s.ball.vz<0&&!s.misses;i++)stepGame(s,1/120,axis);}
const speed=b=>Math.hypot(b.vx,b.vz);
const width=s=>{const r=hitZone(s);return r.right-r.left;};
// How far the defender runs in 0.1 s holding right, with no ball near.
function run(s){s.ball={x:0,z:8,vx:0,vz:-1,z0:8,z1:PLAYER_Z};s.player.x=0;for(let i=0;i<12;i++)stepGame(s,1/120,1);return s.player.x;}
// How long a hit swing stays out before the next one can start.
function swingTime(s){incoming(s);swingAt(s,0);let t=0;while(s.swing&&t<2){stepGame(s,1/120,0);t+=1/120;}return t;}
const near=(a,b,eps=1e-6)=>Math.abs(a-b)<eps;

test('每个人物打一种风格：游侠均衡，兜帽侠灵活，大胡子重拳，骑士守护，法师技巧',()=>{
  assert.deepEqual(Object.fromEntries(PLAYERS.map(p=>[p.id,p.style])),{rogue:'balanced',hooded:'agile',barbarian:'power',knight:'guard',mage:'skill'});
  for(const p of PLAYERS)assert.ok(STYLES[p.style],p.id);
  assert.equal(playerSpec('dragon').style,'balanced');
  assert.equal(createGame(0).style,'balanced');assert.equal(createGame(0,'glove',{style:'wizard'}).style,'balanced');
});
test('均衡不改任何手感：和不选风格完全一样',()=>{
  const a=play('balanced'),b=play();assert.equal(width(a),width(b));assert.equal(width(a),WEAPONS.glove.width*2);
  assert.ok(near(run(play('balanced')),RUN*.1));assert.ok(near(swingTime(play('balanced')),swingTime(play())));
  const s=play('balanced');incoming(s);swingAt(s,0);assert.ok(near(speed(s.ball),s.level.speed*RALLY_STEP*POWER));
});
test('灵活：移动快 10%，接球框窄 5%',()=>{
  assert.ok(near(run(play('agile')),RUN*.1*1.1));assert.ok(near(width(play('agile')),width(play())*.95));
});
test('重拳：重炮球速 +10%，收招慢 40%',()=>{
  const s=play('power');incoming(s);swingAt(s,0);assert.equal(s.lastShot,'perfect');assert.ok(near(speed(s.ball),s.level.speed*RALLY_STEP*POWER*1.1));
  const w=WEAPONS.glove,base=swingTime(play()),slow=swingTime(play('power'));
  assert.ok(near(slow-base,w.recovery*.4,1/60),`收招 ${base} → ${slow}`);
});
test('技巧：旋转只要 40 能量，重炮球速 −5%',()=>{
  for(const [style,ok] of [['skill',true],['balanced',false]]){
    const s=play(style,2);s.energy=40;incoming(s);for(let i=0;i<2000&&!(s.ball.z<=PLAYER_Z+WEAPONS.glove.reach*.9);i++)stepGame(s,1/120,0);
    assert.equal(skillStatus(s,'spin').ok,ok,style);if(ok){assert.equal(useSkill(s,'spin',1).ok,true);assert.equal(s.energy,0);}else assert.equal(skillStatus(s,'spin').reason,'energy');
  }
  // The energy cue fires when the spin becomes affordable, at 40 for this style.
  const s=play('skill',2);s.energy=30;incoming(s);swingAt(s,-.7);assert.ok(s.energy>=40&&s.energy<50);assert.ok(s.events.includes('energy50'));
  const p=play('skill');incoming(p);swingAt(p,0);assert.ok(near(speed(p.ball),p.level.speed*RALLY_STEP*POWER*.95));
  assert.equal(SKILLS.spin.cost,50);
});
test('守护：接球框宽 10%，移动慢 5%',()=>{
  assert.ok(near(width(play('guard')),width(play())*1.1));assert.ok(near(run(play('guard')),RUN*.1*.95));
  // The wider box really connects: a ball just outside the standard box is still hit.
  const edge=WEAPONS.glove.width*1.05;
  let s=play('guard');incoming(s,0);s.ball.x=edge;swingAt(s,0);assert.ok(s.ball.vz>0,'守护接得到');
  s=play();incoming(s,0);s.ball.x=edge;swingAt(s,0);assert.ok(!(s.ball.vz>0),'均衡接不到');
});
test('风格说明从数值生成：一项长处一项代价，均衡没有',()=>{
  assert.deepEqual(styleSummary('agile'),{name:'灵活',good:['移动快 10%'],bad:['接球框窄 5%']});
  assert.deepEqual(styleSummary('power'),{name:'重拳',good:['重炮球速 +10%'],bad:['收招慢 40%']});
  assert.deepEqual(styleSummary('skill'),{name:'技巧',good:['旋转只要 40 能量'],bad:['重炮球速 −5%']});
  assert.deepEqual(styleSummary('guard'),{name:'守护',good:['接球框宽 10%'],bad:['移动慢 5%']});
  assert.deepEqual(styleSummary('balanced'),{name:'均衡',good:[],bad:[]});
});
