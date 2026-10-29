import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import {buildWorld} from '../dist/scene3d.mjs';
import {LEVEL_BOSSES,ALL_CHARACTERS} from '../dist/characters.mjs';
import {loadCharacters} from './helpers/characters.mjs';
import {createGame,startGame,stepGame,LEVELS,KEEPER_Z} from '../dist/core.mjs';

// Every level's keeper wears a figure (characters.mjs LEVEL_BOSSES). How it plays stays the level's own settings; what
// each new figure must meet is what the club keeper meets: the save staging of keeper-dive.test.mjs and the reach of
// motion.test.mjs, so a figure's height never lets the drawn dive cover more than the rules' save reach.
const figures=[...new Set(LEVEL_BOSSES.map(b=>b.figure))];
const assets=await loadCharacters(['striker',...figures]);

test('每关都有门将：模型存在，名字、称号、说明都有', ()=>{
  assert.equal(LEVEL_BOSSES.length,LEVELS.length);
  for(const b of LEVEL_BOSSES){assert.ok(ALL_CHARACTERS[b.figure],b.figure);assert.ok(b.name&&b.title&&b.intro,JSON.stringify(b));}
  assert.ok(figures.length>=4,'至少四种外形');
});

// A still keeper faces a straight shot passing `gap` to its side, filmed at 60 Hz (keeper-dive.test.mjs). swap: the
// figure is put into a club world in place (setFigure, as a level change does) instead of being built with it.
function film(figure,gap,swap=false){
  let w;if(swap){w=buildWorld(assets);w.setFigure('far',assets[figure],ALL_CHARACTERS[figure]);}else w=buildWorld(assets,{cast:{near:'striker',far:figure}});
  const s=createGame(3);s.practiceLeft=0;startGame(s);for(let i=0;i<240&&s.phase!=='playing';i++)stepGame(s,1/120,0);
  s.level={...s.level,keeper:{...s.level.keeper,speed:0,delay:0,error:0,read:0,pattern:0}};s.keeper.x=s.keeper.target=0;s.keeper.err=0;s.keeper.delay=0;
  s.ball={x:gap,z:5.5,vx:0,vz:6,z0:5.5,z1:KEEPER_Z};s.shot={x:gap,z:5.5,angle:0,kind:'straight',at:s.elapsed};s.lastShot='straight';s.swing=null;
  const cross=(KEEPER_Z-5.5)/6,v=new THREE.Vector3(),frames=[];let t=1;
  for(let i=0;i<Math.round((cross+1.6)*120);i++){
    stepGame(s,1/120,0);if(i%2)continue;w.update(s,0,false,t+=1/60);w.scene.updateMatrixWorld(true);let reach=0;
    w.keeper.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position;
      for(let j=0;j<p.count;j+=2){(o.isSkinnedMesh?o.getVertexPosition(j,v):v.fromBufferAttribute(p,j)).applyMatrix4(o.matrixWorld);if(v.y<1.7)reach=Math.max(reach,v.x);}});
    frames.push({u:(i+1)/120-cross,tilt:Math.abs(w.keeper.rotation.z),reach,chestY:w.keeper.userData.chest.getWorldPosition(new THREE.Vector3()).y,saved:s.ball.vz<0,goal:s.goals>0});
  }
  const at=u=>frames.reduce((a,f)=>Math.abs(f.u-u)<Math.abs(a.u-u)?f:a);
  return {frames,at,peak:k=>Math.max(...frames.map(f=>f[k])),standing:frames[0].reach,w};
}

for(const [figure,swap] of figures.flatMap(f=>[[f,false],[f,true]]))test(`门将外形 ${figure}${swap?'（原地换上）':''}：扑救画面和原来的门将同一套标准，手套和球分得开`, ()=>{
  const edge=film(figure,.5,swap),wide=film(figure,1.8,swap);
  assert.ok(edge.frames.at(-1).saved&&wide.frames.at(-1).goal,'规则结果不变');
  assert.ok(wide.standing<=.72,`站立伸展 ${wide.standing.toFixed(2)}`);
  assert.ok(edge.at(-.06).reach>=edge.standing+.15,`触球前应已伸出 ${edge.at(-.06).reach.toFixed(2)}`);
  assert.ok(wide.peak('tilt')>=1.1,`飞身倾斜 ${wide.peak('tilt').toFixed(2)}`);
  assert.ok(wide.peak('reach')>=1.4&&wide.peak('reach')<=1.6,`飞身伸展 ${wide.peak('reach').toFixed(2)}`);
  assert.ok(wide.frames.some(f=>f.u>0&&f.chestY<.55),'全力扑出后落地');
  const end=wide.at(1.4);assert.ok(end.tilt<.05&&end.reach<=.72,'再爬起来');
  const glove=wide.w.keeper.getObjectByName('glove-body').material.color,ball=new THREE.Color('#ffbd35');
  assert.ok(Math.hypot(glove.r-ball.r,glove.g-ball.g,glove.b-ball.b)>.5,'手套和球颜色要分得开');
});

test('原地换人：旧模型离开场景，球场不重建；近端换人后拳套和爆发光跟到新模型上', ()=>{
  const w=buildWorld(assets),court=w.platform,oldKeeper=w.keeper;
  w.setFigure('far',assets.mage,ALL_CHARACTERS.mage);
  assert.notEqual(w.keeper,oldKeeper);assert.equal(w.keeper.parent,w.scene);assert.equal(oldKeeper.parent,null);assert.equal(w.platform,court);
  const d=buildWorld(assets,{duel:true}),oldHero=d.hero,glow=d.gear.glove.children.at(-1);
  d.setFigure('near',assets.knight,ALL_CHARACTERS.knight);
  assert.equal(oldHero.parent,null);assert.equal(d.hero.parent,d.scene);
  let inHero=false;d.hero.traverse(o=>{if(o===d.gear.glove)inHero=true;});assert.ok(inHero,'拳套在新模型上');
  assert.equal(glow.parent,d.gear.glove,'爆发的手部光晕跟到新拳套');
  assert.ok(Number.isFinite(d.punch.left.t)&&Number.isFinite(d.punch.right.t),'出拳接触帧重新测过');
});
