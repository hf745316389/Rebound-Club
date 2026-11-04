import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,startGame,stepGame,attack,useSkill,swingPreview,inHitRange,spinPreview,crossingFrom,WEAPONS,LEVELS,SKILLS,PLAYER_Z,PERFECT_BAND,POWER,RALLY_STEP,AIM_SHARE,PACE} from '../dist/core.mjs';

// Aim comes from the direction held at contact; timing decides power and height (zones.test.mjs).
function play(level=0,weapon='glove'){const s=createGame(level,weapon);s.practiceLeft=0;startGame(s);stepGame(s,1,0);return s;}
function incoming(s,x=0,z=4){const v=s.level.speed*s.rally;s.ball={x,z,vx:0,vz:-v,z0:z,z1:PLAYER_Z};s.player.x=x;s.hitstop=0;}
const sweet=s=>PLAYER_Z+WEAPONS[s.weapon].reach*.5;
// Walks up with no input, presses swing so the window opens at depth `z`, then holds `axis` until the swing resolves.
function swingAt(s,z,axis){const w=WEAPONS[s.weapon];for(let i=0;i<2000&&s.ball.z>z+Math.abs(s.ball.vz)*w.windup;i++)stepGame(s,1/120,0);attack(s);for(let i=0;i<30&&s.ball.vz<0&&!s.misses;i++)stepGame(s,1/120,axis);}
const goalX=s=>crossingFrom(s.ball.x,s.ball.z,s.ball.vx,s.ball.vz,s).x;
const speed=b=>Math.hypot(b.vx,b.vz);

test('按住左键击中打向球门左侧，右键打向右侧，落点固定在门宽 80% 处',()=>{
  for(const level of [0,5]){
    const g=LEVELS[level].goalHalf*AIM_SHARE;
    // Contact behind the sweet spot: from level 3 an early one with a side held banks instead (bank.test.mjs).
    for(const x of [-2,0,2]){
      let s=play(level);incoming(s,x);swingAt(s,sweet(s)-.3,-1);
      assert.ok(s.ball.vz>0);assert.equal(s.lastShot,'left');assert.ok(Math.abs(goalX(s)+g)<1e-6,`关${level+1} x=${x} 左 ${goalX(s)}`);
      s=play(level);incoming(s,x);swingAt(s,sweet(s)-.3,1);
      assert.equal(s.lastShot,'right');assert.ok(Math.abs(goalX(s)-g)<1e-6,`关${level+1} x=${x} 右 ${goalX(s)}`);
    }
  }
});
test('不按方向打直线，站在门框外侧时收进门内',()=>{
  const g=LEVELS[0].goalHalf*AIM_SHARE;
  let s=play();incoming(s,1);swingAt(s,sweet(s)+.3,0);assert.equal(s.lastShot,'straight');assert.equal(s.ball.vx,0);
  s=play();incoming(s,3.2);swingAt(s,sweet(s)+.3,0);assert.equal(s.lastShot,'straight');assert.ok(Math.abs(goalX(s)-g)<1e-6,`边路直线 ${goalX(s)}`);
});
test('出手早晚不改变方向，只决定是不是重炮',()=>{
  const half=WEAPONS.glove.reach*.5;
  for(const axis of [-1,0,1]){
    const early=play();incoming(early);swingAt(early,sweet(early)+half*.8,axis);
    const late=play();incoming(late);swingAt(late,sweet(late)-half*.8,axis);
    assert.ok(Math.abs(goalX(early)-goalX(late))<1e-6,`方向 ${axis}：早 ${goalX(early)} 晚 ${goalX(late)}`);
    assert.equal(early.power,false);assert.equal(late.power,false);
    const p=play();incoming(p);swingAt(p,sweet(p)+half*PERFECT_BAND*.5,axis);
    assert.equal(p.lastShot,'perfect');assert.equal(p.power,true);assert.ok(Math.abs(goalX(p)-goalX(early))<1e-6);
    assert.ok(Math.abs(speed(p.ball)-LEVELS[0].speed*RALLY_STEP*POWER)<1e-6);
  }
});
test('挥击判定期间角色原地不动，击中后恢复移动',()=>{
  const s=play(),w=WEAPONS.glove;incoming(s,0,6);
  for(let i=0;i<2000&&s.ball.z>sweet(s)+Math.abs(s.ball.vz)*w.windup;i++)stepGame(s,1/120,0);
  attack(s);for(let i=0;i<30&&!s.swing.hit;i++){stepGame(s,1/120,1);assert.equal(s.player.x,0,'判定期间不应滑动');}
  assert.equal(s.swing.hit,true);stepGame(s,s.hitstop+.1,1);assert.ok(s.player.x>.3,`击中后应能移动 ${s.player.x}`);
  const m=play();incoming(m,0,7);attack(m);for(let i=0;i<Math.round((w.windup+w.active)*120)-1;i++)stepGame(m,1/120,-1);
  assert.equal(m.player.x,0,'挥空的判定期间同样不动');
  for(let i=0;i<10;i++)stepGame(m,1/120,-1);assert.ok(m.player.x<0,'判定结束后恢复移动');
});
test('球进入亮框后角色站定，提前按住方向不会滑离来球',()=>{
  const s=play(),w=WEAPONS.glove;incoming(s,0,6);
  for(let i=0;i<2000&&!inHitRange(s);i++)stepGame(s,1/120,0);
  assert.equal(inHitRange(s),true);
  // 0.8 m of the ball's travel inside the box (24 ticks at the authored pace), held to the left.
  for(let i=0;i<Math.round(24/PACE);i++)stepGame(s,1/120,-1);assert.equal(s.player.x,0,'框内按住方向不移动');
  attack(s);for(let i=0;i<30&&s.ball.vz<0;i++)stepGame(s,1/120,-1);
  assert.equal(s.lastShot,'left');assert.ok(s.ball.vz>0,'提前按住方向仍能打中');
  const far=play();incoming(far,0,6);stepGame(far,.1,1);assert.ok(far.player.x>.5,`框外照常移动 ${far.player.x}`);
});
test('击球预判跟随当前按住的方向',()=>{
  const s=play();incoming(s,0,sweet(s)+.35);
  assert.ok(swingPreview(s,-1).angle<-.1);assert.ok(swingPreview(s,1).angle>.1);assert.equal(swingPreview(s,0).angle,0);
  assert.equal(swingPreview(s).angle,0,'默认不按方向');
});
test('旋转按方向拐弯，不按时拐向门将的另一侧',()=>{
  const at=(axis,keeperX=0)=>{const s=play();incoming(s,0,sweet(s)+.2);s.keeper.x=keeperX;s.energy=SKILLS.max;assert.equal(useSkill(s,'spin',axis).ok,true);return s;};
  assert.ok(at(-1).ball.curve.k<0);assert.ok(at(1).ball.curve.k>0);
  assert.ok(at(0,1).ball.curve.k<0);assert.ok(at(0,-1).ball.curve.k>0);
  const s=play();incoming(s,0,sweet(s)+.2);
  assert.equal(spinPreview(s,-1).dir,'left');assert.equal(spinPreview(s,1).dir,'right');
});
test('爆发在出球那一刻读取方向',()=>{
  const g=LEVELS[0].goalHalf*AIM_SHARE;
  for(const axis of [-1,1]){
    const s=play();incoming(s,0,sweet(s)+.2);s.energy=SKILLS.max;assert.equal(useSkill(s,'burst',-axis).ok,true);
    for(let i=0;i<240&&s.phase==='skill';i++)stepGame(s,1/120,axis);
    assert.equal(s.lastShot,'burst');assert.ok(Math.abs(goalX(s)-axis*g)<1e-6,`爆发 ${axis}：${goalX(s)}`);
  }
});
