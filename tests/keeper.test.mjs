import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,startGame,stepGame,attack,pauseGame,resumeGame,WEAPONS,LEVELS,PLAYER_Z,KEEPER_Z,FAR_WALL,ACTIVE_PHASES} from '../dist/core.mjs';

function play(level=0,weapon='glove'){const s=createGame(level,weapon);startGame(s);stepGame(s,1,0);return s;}
function incoming(s,x=0,z=4){const v=s.level.speed*s.rally;s.ball={x,z,vx:0,vz:-v,z0:z,z1:PLAYER_Z};s.player.x=x;s.hitstop=0;}
const sweet=s=>PLAYER_Z+WEAPONS[s.weapon].reach*.5;
function swingAt(s,z){const w=WEAPONS[s.weapon];for(let i=0;i<2000&&s.ball.z>z+Math.abs(s.ball.vz)*w.windup;i++)stepGame(s,1/120,0);attack(s);for(let i=0;i<30&&s.ball.vz<0&&!s.misses;i++)stepGame(s,1/120,0);}
function softAt(s){const w=WEAPONS[s.weapon],front=PLAYER_Z+w.reach,v=Math.abs(s.ball.vz);for(let i=0;i<2000&&s.ball.z>front+v*(w.windup+w.active*.5);i++)stepGame(s,1/120,0);attack(s);for(let i=0;i<60&&s.ball.vz<0;i++)stepGame(s,1/120,0);}
// Runs until the shot is resolved at the far end: returns 'goal', 'save' or 'wall'.
function resolve(s){const goals=s.goals;for(let i=0;i<1200;i++){stepGame(s,1/120,0);if(s.goals>goals)return 'goal';if(s.ball.vz<0)return s.keeper.dive>0?'save':'wall';}return 'none';}

test('第1关正中软直球基本都会被扑住',()=>{
  let saves=0;for(let i=0;i<6;i++){const s=play();s.shots=i;incoming(s);softAt(s);assert.equal(s.lastShot,'soft');if(resolve(s)==='save')saves++;}
  assert.ok(saves>=5,`扑住 ${saves}/6`);
});
test('第1关站边路打直线重炮能进门',()=>{
  let goals=0;for(let i=0;i<6;i++){const s=play();s.shots=i;incoming(s,1.9);swingAt(s,sweet(s));assert.equal(s.lastShot,'perfect');if(resolve(s)==='goal')goals++;}
  assert.ok(goals>=5,`进球 ${goals}/6`);
});
test('打到门口外的墙面正常反弹，守门员不参与',()=>{
  const s=play();s.ball={x:3.3,z:9,vx:0,vz:4,z0:2,z1:FAR_WALL};
  assert.equal(resolve(s),'wall');assert.equal(s.goals,0);assert.ok(s.ball.vz<0);
});
test('远端任何位置都不会穿出场地',()=>{
  for(let x=-3.8;x<=3.8;x+=.2){
    const s=play();s.ball={x,z:8.5,vx:0,vz:6,z0:2,z1:FAR_WALL};let maxZ=0;
    for(let i=0;i<240&&s.ball.vz>0&&s.phase==='playing';i++){stepGame(s,1/120,0);maxZ=Math.max(maxZ,s.ball.z);}
    assert.ok(maxZ<=FAR_WALL+1e-9,`x=${x} z=${maxZ}`);assert.ok(s.ball.vz<0||s.goals===1,`x=${x}`);
  }
});
test('守门员行为是确定性的',()=>{
  const run=()=>{const s=play(2);for(let i=0;i<5;i++){incoming(s,i-2);swingAt(s,sweet(s)+.2*(i%3-1));resolve(s);}return JSON.stringify(s);};
  assert.equal(run(),run());
});
test('进球计分，重炮走中区 ×2；进满目标立即通关',()=>{
  const s=play();s.goals=LEVELS[0].goals-1;incoming(s,1.9);swingAt(s,sweet(s));const before=s.score;
  assert.equal(resolve(s),'goal');assert.equal(s.phase,'won');assert.equal(s.score-before,2000);
});
test('进球后重置回合速度，倒数后从守门员处重新发球',()=>{
  const s=play();incoming(s,1.9);swingAt(s,sweet(s));assert.ok(s.rally>1);assert.equal(resolve(s),'goal');
  assert.equal(s.phase,'goal');assert.equal(s.rally,1);stepGame(s,1,0);stepGame(s,.5,0);assert.equal(s.phase,'playing');assert.ok(s.ball.vz<0);
});
test('进球倒数期间暂停可恢复',()=>{
  const s=play();incoming(s,1.9);swingAt(s,sweet(s));resolve(s);assert.equal(s.phase,'goal');assert.ok(ACTIVE_PHASES.includes('goal'));
  pauseGame(s);assert.equal(s.phase,'paused');const snap=JSON.stringify(s);stepGame(s,3,1);assert.equal(JSON.stringify(s),snap);
  resumeGame(s);assert.equal(s.phase,'goal');stepGame(s,1,0);stepGame(s,.5,0);assert.equal(s.phase,'playing');
});
test('结束后模拟和挥击都不再改变状态',()=>{
  const s=play();s.goals=LEVELS[0].goals-1;incoming(s,1.9);swingAt(s,sweet(s));resolve(s);assert.equal(s.phase,'won');
  const snap=JSON.stringify(s);stepGame(s,5,1);assert.equal(attack(s),false);assert.equal(JSON.stringify(s),snap);
});
test('进球在画出来的门线上判定，而不是守门员所在的线',()=>{
  const s=play();s.keeper.x=-2;s.ball={x:1,z:9,vx:0,vz:5,z0:2,z1:KEEPER_Z};
  for(let i=0;i<120&&s.goals===0;i++){stepGame(s,1/120,0);if(s.goals===0)assert.ok(s.ball.z<FAR_WALL-.1+1e-9);}
  assert.equal(s.goals,1);assert.ok(s.ball.z>=FAR_WALL-.1-1e-9,`进球时 z=${s.ball.z}`);
});
test('贴门柱向外斜出的球打在墙上，不算进球',()=>{
  const s=play();s.keeper.x=-2;const g=s.level.goalHalf;s.ball={x:g-.1,z:9.29,vx:2.4,vz:5,z0:2,z1:KEEPER_Z};
  for(let i=0;i<60&&s.ball.vz>0;i++)stepGame(s,1/120,0);assert.equal(s.goals,0);assert.ok(s.ball.vz<0);
});
test('球越过守门员后，守门员不会被误差拉向反方向',()=>{
  // A large misread exaggerates the sign flip of the fading error once the ball is behind the keeper.
  const s=play();s.keeper.x=.3;s.keeper.err=20;s.ball={x:1,z:9.4,vx:0,vz:3,z0:2,z1:KEEPER_Z};
  const x=s.keeper.x;stepGame(s,1/120,0);assert.ok(s.keeper.x>x,`守门员从 ${x} 移到 ${s.keeper.x}`);
});
test('封角：球飞向玩家时，后期门将会向接球一侧移动，第1关不会',()=>{
  for(const [level,moves] of [[0,false],[5,true]]){const s=play(level);s.keeper.x=0;s.ball={x:2.5,z:8,vx:0,vz:-4,z0:8,z1:PLAYER_Z};
    for(let i=0;i<60;i++)stepGame(s,1/120,0);assert.equal(s.keeper.x>.15,moves,`关${level+1} 门将 x=${s.keeper.x}`);}
});
