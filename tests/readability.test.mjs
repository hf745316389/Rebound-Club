import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,startGame,stepGame,attack,inHitRange,hitZone,swingPreview,predictCrossing,WEAPONS,LEVELS,PLAYER_Z,GOAL_Z,FAR_WALL,KEEPER_REACH} from '../dist/core.mjs';

function play(level=0,weapon='glove'){const s=createGame(level,weapon);startGame(s);stepGame(s,1,0);return s;}
function incoming(s,x=0,z=4){const v=s.level.speed*s.rally;s.ball={x,z,vx:0,vz:-v,z0:z,z1:PLAYER_Z};s.player.x=x;s.hitstop=0;}
const sweet=s=>PLAYER_Z+WEAPONS[s.weapon].reach*.5;
// Swings so the window opens at timing t (power and height only), holding `axis` (the aim) once the swing is under way.
function swingT(s,t,axis=0){const w=WEAPONS[s.weapon],z=sweet(s)+t*w.reach*.5;for(let i=0;i<2000&&s.ball.z>z+Math.abs(s.ball.vz)*w.windup;i++)stepGame(s,1/120,0);attack(s);for(let i=0;i<30&&s.ball.vz<0;i++)stepGame(s,1/120,axis);}
function resolve(s){const g=s.goals;for(let i=0;i<1200;i++){stepGame(s,1/120,0);if(s.goals>g)return 'goal';if(s.ball.vz<0)return s.keeper.dive>0?'save':'wide';}return 'none';}
// What actually happens if the player presses swing right now and then lets the frames run.
function outcome(s,axis=0){if(!attack(s))return 'busy';for(let i=0;i<120&&s.swing&&!s.swing.hit&&s.phase==='playing';i++)stepGame(s,1/60,axis);
  if(!s.swing?.hit&&s.ball.vz<0)return {kind:'whiff'};return {kind:s.lastShot==='soft'?'soft':s.lastShot==='perfect'?'perfect':'clean',angle:Math.atan2(s.ball.vx,s.ball.vz)};}

test('挥击预判与实际挥击结果完全一致（种类与方向，含按住左右）',()=>{
  for(const id of Object.keys(WEAPONS))for(let z=4;z>.6;z-=.03)for(const dx of [0,WEAPONS[id].width*.9,WEAPONS[id].width*1.1])for(const axis of [-1,0,1]){
    const s=play(0,id);incoming(s,0,z);s.player.x=dx;stepGame(s,1/60,0);
    const p=swingPreview(s,axis),real=outcome(s,axis);
    assert.equal(p.kind,real.kind,`${id} z=${z.toFixed(2)} dx=${dx} axis=${axis}`);
    if(real.angle!==undefined)assert.ok(Math.abs(p.angle-real.angle)<1e-9,`${id} z=${z.toFixed(2)} axis=${axis} 方向`);
  }
});
test('挥击预判不会改动真实状态',()=>{const s=play();incoming(s,0,2.4);const snap=JSON.stringify(s);swingPreview(s);assert.equal(JSON.stringify(s),snap);});
test('击球区矩形与真实判定一致，甜点带位于区内',()=>{
  for(const id of Object.keys(WEAPONS)){const s=play(0,id);s.player.x=.7;const r=hitZone(s);
    assert.ok(r.sweetNear>r.near&&r.sweetFar<r.far);
    for(let x=-1.5;x<=2.9;x+=.05)for(let z=0;z<=3.5;z+=.05){s.ball={x,z,vx:0,vz:-4};
      const inside=x>=r.left&&x<=r.right&&z>=r.near&&z<=r.far;assert.equal(inHitRange(s),inside,`${id} x=${x.toFixed(2)} z=${z.toFixed(2)}`);}}
});
test('射门路线预测（含借侧墙）与实际过门线位置一致',()=>{
  // The last case turns the struck ball onto a steep heading by hand: held directions alone never reach a side wall.
  for(const [x,t,axis,steer] of [[0,0,0],[0,.8,-1],[0,-.8,1],[-2.5,.9,1],[2.8,-.9,-1],[3,.9,0],[2.5,.6,0,.6]]){
    const s=play();s.level={...s.level,keeper:{...s.level.keeper,speed:0}};s.keeper.x=-9;incoming(s,x);swingT(s,t,axis);
    if(steer){const v=Math.hypot(s.ball.vx,s.ball.vz);s.ball.vx=Math.sin(steer)*v;s.ball.vz=Math.cos(steer)*v;}
    const p=predictCrossing(s);let prev=s.ball.z;
    for(let i=0;i<600&&s.ball.vz>0&&s.ball.z<GOAL_Z;i++){prev=s.ball.z;const bx=s.ball.x;stepGame(s,1/120,0);if(s.goals||s.ball.z>=GOAL_Z||s.ball.vz<0){assert.ok(Math.abs(bx-p.x)<.12,`x=${x} t=${t} 预测 ${p.x.toFixed(2)} 实际 ${bx.toFixed(2)}`);break;}}
  }
});
test('打在门外的墙上发出打偏事件，扑救与进球各有事件',()=>{
  const s=play();s.ball={x:3.3,z:9.5,vx:0,vz:4,z0:2,z1:FAR_WALL};const ev=[];for(let i=0;i<30;i++){stepGame(s,1/120,0);ev.push(...s.events);}
  assert.ok(ev.includes('wide'));assert.equal(s.goals,0);
});
test('练习保护：前几次丢球不扣机会，用完后正常扣',()=>{
  assert.ok(LEVELS[0].practice>0);assert.equal(LEVELS[5].practice,0);
  const s=play();const n=s.practiceLeft;assert.equal(n,LEVELS[0].practice);
  for(let k=0;k<n;k++){s.ball.z=.01;s.ball.vz=-4;stepGame(s,1/120,0);assert.equal(s.misses,0);assert.equal(s.practiceLeft,n-k-1);assert.ok(s.events.includes('practice'));stepGame(s,1,0);stepGame(s,.5,0);}
  s.ball.z=.01;s.ball.vz=-4;stepGame(s,1/120,0);assert.equal(s.misses,1);
});
test('前三关的球速和门宽保持不变，只有门将逐关变强',()=>{
  for(const i of [1,2]){assert.equal(LEVELS[i].speed,LEVELS[0].speed);assert.equal(LEVELS[i].goalHalf,LEVELS[0].goalHalf);
    assert.ok(LEVELS[i].keeper.speed>LEVELS[i-1].keeper.speed);assert.ok(LEVELS[i].keeper.delay<LEVELS[i-1].keeper.delay);}
  assert.equal(LEVELS.length,6);for(const l of LEVELS)assert.ok(l.lesson&&l.goals>0);
});
test('第1关：从正中按住左或右的普通回击就能进球',()=>{
  let g=0;for(let i=0;i<6;i++){const s=play(0);s.shots=i;incoming(s,0);swingT(s,.6,i%2?1:-1);if(resolve(s)==='goal')g++;}assert.ok(g>=5,`进 ${g}/6`);
});
test('第2关：正中直线重炮会被扑住，左右变向能进',()=>{
  let saved=0,goals=0;for(let i=0;i<6;i++){let s=play(1);s.shots=i;incoming(s,0);swingT(s,0);if(resolve(s)==='save')saved++;
    s=play(1);s.shots=i;incoming(s,0);swingT(s,.6,i%2?1:-1);if(resolve(s)==='goal')goals++;}
  assert.ok(saved>=5,`正中重炮被扑 ${saved}/6`);assert.ok(goals>=4,`变向进球 ${goals}/6`);
});
test('第3关：正中普通变向多被扑住，边路重炮或正中重炮变向能进',()=>{
  let normal=0,edge=0,power=0;for(let i=0;i<6;i++){let s=play(2);s.shots=i;incoming(s,0);swingT(s,.6,i%2?1:-1);if(resolve(s)==='goal')normal++;
    s=play(2);s.shots=i;incoming(s,i%2?1.9:-1.9);swingT(s,0);if(resolve(s)==='goal')edge++;
    s=play(2);s.shots=i;incoming(s,0);swingT(s,0,i%2?1:-1);if(resolve(s)==='goal')power++;}
  assert.ok(normal<=2,`普通变向 ${normal}/6`);assert.ok(edge>=4,`边路重炮 ${edge}/6`);assert.ok(power>=3,`重炮变向 ${power}/6`);
});
