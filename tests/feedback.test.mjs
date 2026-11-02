import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,startGame,stepGame,attack,inHitRange,hitZone,saveCause,WEAPONS,PLAYER_Z,KEEPER_REACH} from '../dist/core.mjs';
import {timingWord,SAVE_WHY} from '../dist/ui.mjs';

function play(level=0){const s=createGame(level);s.practiceLeft=0;startGame(s);stepGame(s,1,0);return s;}
function incoming(s,x=0,z=4){const v=s.level.speed*s.rally;s.ball={x,z,vx:0,vz:-v,z0:z,z1:PLAYER_Z};s.player.x=x;s.hitstop=0;}
const half=WEAPONS.glove.reach*.5,sweet=PLAYER_Z+half;
// Opens the active window when the ball is at timing t (share of the half box in front of the sweet spot).
function swingAt(s,t,axis=0){const z=sweet+t*half,w=WEAPONS.glove;for(let i=0;i<2000&&s.ball.z>z+Math.abs(s.ball.vz)*w.windup;i++)stepGame(s,1/120,0);attack(s);for(let i=0;i<30&&s.ball.vz<0&&!s.misses;i++)stepGame(s,1/120,axis);}

test('每一拍记下离甜点差多少毫秒：甜点内为 0，早为正、晚为负，和实际触球位置一致',()=>{
  let s=play();incoming(s);swingAt(s,0);assert.equal(s.lastShot,'perfect');assert.equal(s.shot.timing,0);
  for(const t of [.9,-.9]){s=play();incoming(s);const r=hitZone(s),v=Math.abs(s.ball.vz);swingAt(s,t,1);
    const want=t>0?(s.shot.z-r.sweetFar)/v*1000:(s.shot.z-r.sweetNear)/v*1000;
    assert.ok(Math.sign(s.shot.timing)===Math.sign(t),`t=${t} timing=${s.shot.timing}`);assert.ok(Math.abs(s.shot.timing-want)<=1,`t=${t} ${s.shot.timing} vs ${want.toFixed(1)}`);}
  assert.equal(timingWord(32),'早 32 毫秒');assert.equal(timingWord(-18),'晚 18 毫秒');assert.equal(timingWord(0),'');
});
test('被扑原因：看到方向、押中规律、正打在身上、追上了，按这个顺序判断',()=>{
  const at=(level,read)=>{const s=play(level);s.shot={read};return saveCause(s);};
  // Level 4 (index 3) reads the held side and leans on patterns; level 1 does neither.
  assert.equal(at(3,{shown:1,lean:0,kx:1.2,cross:1.6}),'read');
  assert.equal(at(3,{shown:-1,lean:0,kx:1.2,cross:1.6}),'body','按了反方向骗它：不算看到方向');
  assert.equal(at(3,{shown:0,lean:-1,kx:-1,cross:-1.7}),'pattern');
  assert.equal(at(0,{shown:1,lean:1,kx:1.2,cross:1.6}),'body','前两关的门将不读招也不猜规律');
  assert.equal(at(3,{shown:0,lean:0,kx:.3,cross:.3+KEEPER_REACH*.9}),'body');
  assert.equal(at(3,{shown:0,lean:0,kx:-1.5,cross:1.8}),'chase');
  assert.equal(saveCause(play(3)),'chase','没有射门信息（技能球）按追上了算');
  for(const k of ['read','pattern','body','chase'])assert.equal(SAVE_WHY[k].length,2);
});
test('实战里（晚打）：提前按住要打的方向会出现「看到方向」，挥击那一刻才按就从不出现',()=>{
  const causes=show=>{const out=[];
    for(let k=0;k<40;k++){const s=createGame(3);s.misses=-99;startGame(s);let side=0,planted=false;
      for(let f=0;f<120*60&&out.length<400&&!['won','lost'].includes(s.phase);f++){let axis=0;
        if(s.phase==='playing'&&s.ball.vz<0){
          if(!planted&&inHitRange(s)){planted=true;side=s.keeper.x>0?-1:1;}
          if(!planted){const dx=s.ball.x-s.player.x;axis=Math.abs(dx)>.08?Math.sign(dx):0;}
          else if(!s.swing)axis=show?side:0;
          if(planted&&!s.swing&&s.ball.z<=sweet-.35-(k%3)*.05+Math.abs(s.ball.vz)*.03)attack(s);
          if(s.swing&&!s.swing.hit)axis=side;}
        if(s.ball.vz>0)planted=false;
        stepGame(s,1/120,axis);if(s.events.includes('save'))out.push(s.saveCause);}}
    return out;};
  const honest=causes(true),hidden=causes(false);
  assert.ok(honest.includes('read'),JSON.stringify(honest.slice(0,20)));
  assert.ok(!hidden.includes('read'),JSON.stringify(hidden.slice(0,20)));
});
