import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,startGame,stepGame,attack,WEAPONS,PLAYER_Z} from '../dist/core.mjs';
import {createMatchStats,recordMatchEvent,matchSummary} from '../dist/ui.mjs';

function play(practice=0){const s=createGame(0);s.practiceLeft=practice;startGame(s);stepGame(s,1,0);return s;}
// Lets the incoming ball run out, collecting the events on the way.
function concede(s){const ev=[];for(let i=0;i<600&&!s.misses&&!ev.includes('practice');i++){stepGame(s,1/120,0);ev.push(...s.events);}return ev;}
const reachZ=PLAYER_Z+WEAPONS.glove.reach*.6;

test('丢球原因：球进过框却没挥拳是「没有出手」，球一直在框外是「没跑到位」',()=>{
  let s=play();s.ball={x:0,z:4,vx:0,vz:-6,z0:4,z1:PLAYER_Z};s.player.x=0;concede(s);
  assert.equal(s.misses,1);assert.equal(s.missCause,'idle');
  s=play();s.ball={x:2.5,z:4,vx:0,vz:-6,z0:4,z1:PLAYER_Z};s.player.x=0;concede(s);
  assert.equal(s.missCause,'reach');
});
test('丢球原因：挥空按真实位置分出手太早、出手太晚、没跑到位',()=>{
  let s=play();s.ball={x:0,z:6,vx:0,vz:-6,z0:6,z1:PLAYER_Z};s.player.x=0;attack(s);concede(s);
  assert.equal(s.missCause,'early');
  s=play();s.ball={x:0,z:PLAYER_Z-.3,vx:0,vz:-4,z0:6,z1:PLAYER_Z};s.player.x=0;attack(s);concede(s);
  assert.equal(s.missCause,'late');
  s=play();s.ball={x:2,z:reachZ,vx:0,vz:-4,z0:6,z1:PLAYER_Z};s.player.x=0;attack(s);concede(s);
  assert.equal(s.missCause,'reach');
});
test('球过身时拳还没出完，也算出手太晚',()=>{
  const s=play();s.ball={x:0,z:.04,vx:0,vz:-6,z0:6,z1:PLAYER_Z};s.player.x=0;attack(s);concede(s);
  assert.equal(s.misses,1);assert.equal(s.missCause,'late');
});
test('练习球丢了也记原因',()=>{
  const s=play(1);s.ball={x:0,z:4,vx:0,vz:-6,z0:4,z1:PLAYER_Z};s.player.x=0;const ev=concede(s);
  assert.ok(ev.includes('practice'));assert.equal(s.misses,0);assert.equal(s.missCause,'idle');
});
test('上一个来球的挥空不算到下一个来球头上',()=>{
  const s=play();s.ball={x:0,z:6,vx:0,vz:-6,z0:6,z1:PLAYER_Z};s.player.x=0;attack(s);
  for(let i=0;i<30;i++)stepGame(s,1/120,0);assert.equal(s.whiff?.reason,'early');
  // The ball goes back out (as if struck), then a fresh one comes in and is left alone.
  s.ball={x:0,z:3,vx:0,vz:6,z0:2,z1:9.3};stepGame(s,1/120,0);
  s.ball={x:0,z:4,vx:0,vz:-6,z0:4,z1:PLAYER_Z};for(let i=0;i<120&&s.swing;i++)stepGame(s,1/120,0);concede(s);
  assert.equal(s.misses,1);assert.equal(s.missCause,'idle');
});
test('结算按次数从多到少列出丢球原因（含练习球），没丢球就是空的',()=>{
  const s={phase:'lost',levelIndex:0,goals:1,misses:3,bestCombo:2,score:300,level:{goals:3,lesson:'观察门将'}};
  const stats=createMatchStats();assert.deepEqual(matchSummary(s,stats).conceded,[]);
  recordMatchEvent(stats,'miss',{missCause:'early'});recordMatchEvent(stats,'miss',{missCause:'reach'});
  recordMatchEvent(stats,'practice',{missCause:'reach'});recordMatchEvent(stats,'miss',{missCause:'idle'});
  assert.deepEqual(matchSummary(s,stats).conceded,[{cause:'reach',label:'没跑到位',n:2},{cause:'early',label:'出手太早',n:1},{cause:'idle',label:'没有出手',n:1}]);
  assert.equal(matchSummary(s,stats).practiceConceded,1);
  const odd=createMatchStats();recordMatchEvent(odd,'miss',{});
  assert.deepEqual(matchSummary(s,odd).conceded,[{cause:'unclear',label:'挥空',n:1}]);
});
