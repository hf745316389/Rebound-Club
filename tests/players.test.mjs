import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import * as THREE from '../dist/vendor/three.module.min.js';
import {PLAYERS,DEFAULT_PLAYER,CHARACTERS,playerSpec} from '../dist/characters.mjs';
import {createActor} from '../dist/actor.mjs';
import {buildWorld} from '../dist/scene3d.mjs';
import {createGame,startGame,stepGame,HIT_HEIGHT} from '../dist/core.mjs';
import {loadCharacters} from './helpers/characters.mjs';

const loaded=new Map();
const assetsFor=async id=>{if(!loaded.has(id))loaded.set(id,await loadCharacters({player:id}));return loaded.get(id);};
const HATS={barbarian:'Barbarian_Hat',knight:'Knight_Helmet',mage:'Mage_Hat'};
// The glTF JSON of a shipped model: which nodes still carry a mesh, and whether it is skinned.
function meshNodes(file){const b=readFileSync(new URL('../dist/'+file,import.meta.url)),j=JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)));
  return j.nodes.filter(n=>n.mesh!=null).map(n=>({name:n.name,skinned:n.skin!=null}));}

test('五个可选人物：名单、默认游侠、不认识的 id 回到游侠',()=>{
  assert.deepEqual(PLAYERS.map(p=>p.id),['rogue','hooded','barbarian','knight','mage']);
  assert.equal(DEFAULT_PLAYER,'rogue');assert.equal(playerSpec('rogue').file,CHARACTERS.striker.file,'游侠仍用原来的 striker.glb');
  for(const id of ['dragon',undefined,null,7])assert.equal(playerSpec(id).id,'rogue');
  for(const p of PLAYERS){const s=playerSpec(p.id);assert.equal(s.height,CHARACTERS.striker.height);assert.equal(s.number,'01');assert.deepEqual(s.clips,CHARACTERS.striker.clips);assert.equal(s.hat,HATS[p.id]);}
});

test('打包结果：每个人物不超过 700 KB，只留身体和指定的帽子；门将没有任何挂件',()=>{
  for(const p of PLAYERS){const s=playerSpec(p.id),kb=statSync(new URL('../dist/'+s.file,import.meta.url)).size/1024;assert.ok(kb<=700,`${p.id} ${kb.toFixed(0)} KB`);
    const rigid=meshNodes(s.file).filter(n=>!n.skinned).map(n=>n.name);assert.deepEqual(rigid,HATS[p.id]?[HATS[p.id]]:[],p.id);}
  assert.deepEqual(meshNodes(CHARACTERS.keeper.file).filter(n=>!n.skinned),[]);
});

// Height as a bounding box reads it (the default figure measures 1.975 this way): every figure within 0.02 of it
// (design Amendments A2).
test('每个人物都能建出来：队服、背号、拳套、帽子挂在头上，身高和游侠一样，出拳接触帧在动作内',async()=>{
  const height=a=>{a.root.updateMatrixWorld(true);return new THREE.Box3().setFromObject(a.body).max.y;};
  const base=height(createActor((await assetsFor('rogue')).striker,playerSpec('rogue'),'striker'));
  for(const p of PLAYERS){const assets=await assetsFor(p.id);assert.equal(assets.player,p.id);
    const a=createActor(assets.striker,playerSpec(p.id),'striker');
    for(const name of ['jersey-body','jersey-number'])assert.ok(a.root.getObjectByName(name),`${p.id} ${name}`);
    assert.equal(a.gloves.length,2);
    const hat=a.root.getObjectByName('player-hat');
    if(HATS[p.id]){assert.ok(hat,p.id);let o=hat.parent;while(o&&o!==a.bones.head)o=o.parent;assert.equal(o,a.bones.head,`${p.id} 帽子在 head 骨骼下`);}
    else assert.equal(hat,undefined,p.id);
    const top=height(a);assert.ok(Math.abs(top-base)<=.02,`${p.id} 身高 ${top.toFixed(3)}，游侠 ${base.toFixed(3)}`);
    for(const clip of ['punchLeft','punchRight']){const r=a.measureReach(clip);assert.ok(r.t>0&&r.t<a.duration(clip),`${p.id} ${clip} ${r.t}`);}}
});

test('场景按选中的人物建主角，门将不变',async()=>{
  const w=buildWorld(await assetsFor('knight'));assert.ok(w.hero.getObjectByName('player-hat'));
  assert.equal(w.keeper.getObjectByName('player-hat'),undefined);
  const plain=buildWorld(await assetsFor('rogue'));assert.equal(plain.hero.getObjectByName('player-hat'),undefined);
});

// AC16 (design Amendments A2): from the camera, a hat hides no ball in the striker's hitting area that the head and
// body leave visible. The full-size knight helmet may add the six far points right behind the head it was measured
// to add; the other hats none.
const ALLOWED={barbarian:0,knight:6,mage:0};
test('帽子不新增遮挡：各种画面比例、站位、待机和出拳姿势下，头和身体挡不住的球，帽子也不挡',async()=>{
  const ray=new THREE.Raycaster(),blocked=[];
  for(const id of Object.keys(HATS)){const w=buildWorld(await assetsFor(id)),a=w.actors.striker,hat=w.hero.getObjectByName('player-hat'),body=w.hero.getObjectByName('jersey-body'),mine=[];
    for(const aspect of [.46,.62,.87,1.45,2.2])for(const px of [0,-2,2])for(const stance of ['idle','punch']){
      const s=createGame();startGame(s);stepGame(s,1,0);s.player.x=px;w.resize(aspect);w.update(s,0,true,0);w.shake(0);
      if(stance==='punch')a.pose([['punchRight',w.punch.right.t,1]]);else a.pose([['idle',.3,1,true]]);
      w.scene.updateMatrixWorld(true);w.camera.updateMatrixWorld(true);
      for(const z of [1.2,1.8,2.4])for(const dx of [-1.2,-.4,.4,1.2]){
        const ball=new THREE.Vector3(px+dx,HIT_HEIGHT,-z),dir=ball.clone().sub(w.camera.position),dist=dir.length();
        ray.set(w.camera.position,dir.normalize());ray.far=dist;
        if(ray.intersectObject(hat,false).length&&!ray.intersectObject(body,false).length)mine.push(`${id} 比例${aspect} 站位${px} ${stance} 球(${(px+dx).toFixed(1)},${z})`);}}
    if(mine.length>ALLOWED[id])blocked.push(...mine);}
  assert.deepEqual(blocked,[],`帽子新增遮挡 ${blocked.length} 处：\n`+blocked.slice(0,12).join('\n'));
});
