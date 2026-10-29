import test from 'node:test';
import assert from 'node:assert/strict';
import {PLAYER_Z,WEAPONS,POWER,AIM_SHARE} from '../dist/core.mjs';
import {createDuel,stepDuel,duelAttack,duelHitZone,mirrorBall,localBall,fighterKit,FIGHTERS,FIGHTER_IDS,DUEL} from '../dist/duel-core.mjs';
import {createLoopback,createClient} from '../dist/duel-net.mjs';
import {FIGHTER_LOOKS,ALL_CHARACTERS} from '../dist/characters.mjs';

const near=(a,b,eps=1e-9)=>Math.abs(a-b)<eps;
// A duel in play with the given picks and the ball placed in `side`'s own view.
function duelWith(picks,side,ball){
  const s=createDuel({picks});s.phase='playing';const l={curve:null,kind:null,z0:ball.z,z1:PLAYER_Z,...ball};
  Object.assign(s.ball,side==='a'?l:mirrorBall(l));return s;
}

test('全能就是单机的拳套：数值相同，未知的角色也按全能处理', ()=>{
  const g=WEAPONS.glove;
  for(const id of ['allround','nobody',undefined]){
    const k=fighterKit(id);assert.equal(k.id,'allround');
    for(const key of ['width','reach','windup','active','recovery','whiff'])assert.equal(k[key],g[key],key);
    assert.deepEqual([k.run,k.shot,k.power,k.aim,k.energy],[1,1,POWER,AIM_SHARE,1]);assert.equal(k.sweet,PLAYER_Z+g.reach*.5);
  }
});

test('每个角色都有名字、定位、对应的模型，而且一项强点配一项弱点（全能除外）', ()=>{
  assert.deepEqual(Object.keys(FIGHTER_LOOKS).sort(),[...FIGHTER_IDS].sort());
  for(const id of FIGHTER_IDS){
    const f=FIGHTERS[id];assert.ok(f.name&&f.role,id);assert.ok(ALL_CHARACTERS[FIGHTER_LOOKS[id]],`${id} 的模型`);
    if(id!=='allround')assert.ok(f.role.includes('；'),`${id} 的定位要写出强点和弱点`);
  }
});

test('击球框和出球速度按各自的角色算', ()=>{
  const z=duelHitZone(createDuel({picks:{a:'wall'}}),'a'),w=fighterKit('wall');
  assert.ok(near(z.right-z.left,2*w.width)&&near(z.far,PLAYER_Z+w.reach));
  // A perfect strike in each fighter's own sweet spot leaves at DUEL.speed × power × shot.
  for(const id of FIGHTER_IDS){
    const k=fighterKit(id),s=duelWith({a:id},'a',{x:0,z:k.sweet+.02,vx:0,vz:-DUEL.speed});
    duelAttack(s,'a');s.players.a.swing.armed=true;s.players.a.swing.time=k.windup;stepDuel(s,1/120,{a:{axis:0}});
    const l=localBall(s,'a');assert.equal(s.players.a.lastShot,'perfect',id);
    assert.ok(near(Math.hypot(l.vx,l.vz),DUEL.speed*1.05*k.power*k.shot,1e-6),`${id} ${Math.hypot(l.vx,l.vz)}`);
  }
});

test('进球判定和角色无关：同一记球换边、换角色，结果一样', ()=>{
  for(let i=0;i<200;i++){
    const a=(i%15-7)*.1,x=(i%9-4)*.8,v=5+i%7,ball={x,z:4+i%3,vx:Math.sin(a)*v,vz:Math.cos(a)*v,curve:null,kind:null,z0:4,z1:4};
    const run=(picks,side)=>{const s=createDuel({picks});s.phase='playing';Object.assign(s.ball,side==='a'?ball:mirrorBall(ball));
      for(let f=0;f<600;f++){stepDuel(s,1/120);const e=s.events.find(e=>e.type==='goal'||e.type==='wide');if(e)return [e.type,e.side===side,s.lastGoal?.x??null];}return ['none'];};
    assert.deepEqual(run({a:'power',b:'wall'},'a'),run({a:'speed',b:'trick'},'b'));
  }
});

test('联机两端用同样的角色建局', ()=>{
  let t=0;const now=()=>t,loop=createLoopback({now}),picks={a:'trick',b:'power'};
  const A=createClient({side:'a',transport:loop[0],now,picks}),B=createClient({side:'b',transport:loop[1],now,picks});
  for(const c of [A,B])assert.deepEqual([c.state.players.a.kit.id,c.state.players.b.kit.id],['trick','power']);
});
