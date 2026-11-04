// Skinned players: one merged body with an ink outline, toon shading, a palette swap, a back number and gloves.
// Poses are set from explicit clip times every frame (the mixer never runs on its own clock), so what is drawn is a
// function of the game state; procedural layers (look, lean, crouch, arm aim, ground contact) go on top.
import * as THREE from './vendor/three.module.min.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';
import {clone as cloneRig} from './vendor/SkeletonUtils.js';
import {buildGlove,mergeRigidParts} from './art.mjs';
import {CHARACTERS,DEFAULT_PLAYER,playerSpec} from './characters.mjs';

// Both characters as {scene, animations}; `load(url)` is GLTFLoader.loadAsync in the page and a file parser in tests.
// `player` picks the striker's figure (characters.mjs PLAYERS); if its file fails, the default figure is loaded instead.
// The result says which figure it holds (`player`).
export async function loadCharacterAssets(load,{player=DEFAULT_PLAYER}={}){
  const keeper=await load(CHARACTERS.keeper.file);
  let spec=playerSpec(player),striker;
  try{striker=await load(spec.file);}catch(e){if(spec.id===DEFAULT_PLAYER)throw e;spec=playerSpec(DEFAULT_PLAYER);striker=await load(spec.file);}
  return {striker,keeper,player:spec.id};
}

const toonRamp=(()=>{const t=new THREE.DataTexture(new Uint8Array([110,190,255]),3,1,THREE.RedFormat);t.minFilter=t.magFilter=THREE.NearestFilter;t.generateMipmaps=false;t.needsUpdate=true;return t;})();
// Three-step toon shading plus a soft rim so bodies separate from the dark arena.
export function toonMaterial(opts,rim='#5f8cff',strength=.45){
  const m=new THREE.MeshToonMaterial({gradientMap:toonRamp,...opts}),k=strength.toFixed(3);
  m.onBeforeCompile=s=>{s.uniforms.uRim={value:new THREE.Color(rim)};
    s.fragmentShader='uniform vec3 uRim;\n'+s.fragmentShader.replace('#include <opaque_fragment>',
      `float rimF=pow(1.-clamp(dot(normalize(normal),normalize(vViewPosition)),0.,1.),3.);outgoingLight+=uRim*rimF*${k};\n#include <opaque_fragment>`);};
  m.customProgramCacheKey=()=>'toon-rim-'+k;
  return m;
}
// Inverted-hull ink: back faces pushed out along averaged normals (hard-edged parts would otherwise split at corners).
export function outlineMaterial(width,color='#0d1022'){
  const m=new THREE.MeshBasicMaterial({color,side:THREE.BackSide});
  m.onBeforeCompile=s=>{s.uniforms.uInk={value:width};
    s.vertexShader='uniform float uInk;\nattribute vec3 outlineNormal;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed+=normalize(outlineNormal)*uInk;');};
  m.customProgramCacheKey=()=>'ink';
  return m;
}
function smoothNormals(geo){
  if(geo.attributes.outlineNormal)return;
  const p=geo.attributes.position,n=geo.attributes.normal,acc=new Map(),keys=new Array(p.count);
  for(let i=0;i<p.count;i++){const k=`${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;keys[i]=k;
    const a=acc.get(k)||[0,0,0];a[0]+=n.getX(i);a[1]+=n.getY(i);a[2]+=n.getZ(i);acc.set(k,a);}
  const out=new Float32Array(p.count*3);
  for(let i=0;i<p.count;i++){const a=acc.get(keys[i]),l=Math.hypot(a[0],a[1],a[2])||1;out[i*3]=a[0]/l;out[i*3+1]=a[1]/l;out[i*3+2]=a[2]/l;}
  geo.setAttribute('outlineNormal',new THREE.BufferAttribute(out,3));
}
export function addOutline(mesh,mat){
  smoothNormals(mesh.geometry);
  const o=mesh.isSkinnedMesh?new THREE.SkinnedMesh(mesh.geometry,mat):new THREE.Mesh(mesh.geometry,mat);
  if(mesh.isSkinnedMesh)o.bind(mesh.skeleton,mesh.bindMatrix);
  o.position.copy(mesh.position);o.quaternion.copy(mesh.quaternion);o.scale.copy(mesh.scale);
  o.name=mesh.name?mesh.name+'-ink':'ink';o.frustumCulled=false;o.castShadow=o.receiveShadow=false;o.raycast=()=>{};
  mesh.parent.add(o);return o;
}

function rgb2hsl(r,g,b){const mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2;if(mx===mn)return [0,0,l];const d=mx-mn,s=l>.5?d/(2-mx-mn):d/(mx+mn);
  const h=mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4;return [h*60,s,l];}
// Palette swap on the colour atlas, once at load. Without a DOM (node tests) textures are not loaded at all.
function recolor(tex,rule){
  if(typeof document==='undefined'||!tex?.image)return tex;
  const img=tex.image,c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);
  const d=g.getImageData(0,0,c.width,c.height),px=d.data,col=new THREE.Color();
  for(let i=0;i<px.length;i+=4){const [h,s,l]=rgb2hsl(px[i]/255,px[i+1]/255,px[i+2]/255),o=rule(h,s,l);if(!o)continue;
    col.setHSL(((o[0]%360)+360)%360/360,Math.min(1,o[1]),Math.min(1,o[2]));px[i]=col.r*255;px[i+1]=col.g*255;px[i+2]=col.b*255;}
  g.putImageData(d,0,0);const t=new THREE.CanvasTexture(c);
  Object.assign(t,{flipY:tex.flipY,colorSpace:THREE.SRGBColorSpace,wrapS:tex.wrapS,wrapT:tex.wrapT,magFilter:tex.magFilter,minFilter:tex.minFilter});
  return t;
}
function numberMaterial(text){
  if(typeof document==='undefined')return new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false});
  const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');
  g.font='italic 900 92px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';g.lineJoin='round';g.lineWidth=14;
  g.strokeStyle='#0d1022';g.strokeText(text,64,70);g.fillStyle='#fff7ea';g.fillText(text,64,70);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4});
}

const v1=new THREE.Vector3(),v2=new THREE.Vector3(),v3=new THREE.Vector3(),q1=new THREE.Quaternion(),q2=new THREE.Quaternion(),m1=new THREE.Matrix4();
const UP=new THREE.Vector3(0,1,0);
const qa=new THREE.Quaternion(),qb=new THREE.Quaternion(),qc=new THREE.Quaternion();
// Turns a bone about a world axis by `angle`, keeping its parent as is.
function turnBone(bone,axis,angle){
  if(!angle)return;
  bone.parent.updateWorldMatrix(true,false);bone.parent.getWorldQuaternion(qa);
  qb.copy(qa).multiply(bone.quaternion);qc.setFromAxisAngle(axis,angle).multiply(qb);
  bone.quaternion.copy(qa.invert().multiply(qc));bone.updateMatrixWorld(true);
}

// Builds an actor from a loaded glTF, on its own copy of the rig (the loaded asset can build any number of worlds).
// The root follows the game's old convention: a root with no rotation faces -z.
export function createActor(gltf,spec,name){
  const model=cloneRig(gltf.scene),found={};
  model.traverse(o=>{if(o.isBone)found[o.name]=o;});
  const bones={};for(const [k,v] of Object.entries(spec.bones)){if(!found[v])throw Error(`${name}: missing bone ${v}`);bones[k]=found[v];}
  // Each bone's clip value as of the last pose() (the bind pose to begin with).
  const allBones=Object.values(found),rest=allBones.map(b=>({b,p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()}));
  model.updateMatrixWorld(true);

  // One skinned body: the parts share a skeleton and an atlas, so they merge into a single draw (plus its outline).
  // The one prop the spec keeps (a hat on the head bone) stays a rigid mesh of its own; every other prop is hidden.
  const parts=[];let hat=null;model.traverse(o=>{if(o.isSkinnedMesh)parts.push(o);else if(o.isMesh){if(spec.hat&&o.name===spec.hat)hat=o;else o.visible=false;}});
  if(spec.hat&&!hat)throw Error(`${name}: missing hat ${spec.hat}`);
  if(!parts.length)throw Error(`${name}: no skinned body`);
  const first=parts[0],keep=['position','normal','uv','skinIndex','skinWeight'];
  for(const p of parts)if(!p.bindMatrix.equals(first.bindMatrix))throw Error(`${name}: body parts are bound differently`);
  const merged=mergeGeometries(parts.map(p=>{const g=p.geometry.clone();for(const k of Object.keys(g.attributes))if(!keep.includes(k))g.deleteAttribute(k);g.morphAttributes={};return g;}),false);
  if(!merged)throw Error(`${name}: body parts cannot be merged`);
  let map=first.material.map??null;if(map&&spec.recolor)map=recolor(map,spec.recolor);
  const body=new THREE.SkinnedMesh(merged,toonMaterial(map?{map}:{color:'#d9d2c3'},spec.rim));
  body.name='jersey-body';body.castShadow=true;body.frustumCulled=false;
  first.parent.add(body);body.bind(first.skeleton,first.bindMatrix);
  for(const p of parts){p.parent.remove(p);p.geometry.dispose();p.material.dispose?.();}
  // Raycasts (goal-camera visibility checks) must see the current pose, not the bind pose.
  body.raycast=function(r,i){this.computeBoundingSphere();THREE.SkinnedMesh.prototype.raycast.call(this,r,i);};

  // Size from the bind pose: model space is the glTF's own (+y up, facing +z).
  const pos=merged.attributes.position,si=merged.attributes.skinIndex,sw=merged.attributes.skinWeight;
  let top=0;for(let i=0;i<pos.count;i++)top=Math.max(top,v1.fromBufferAttribute(pos,i).applyMatrix4(body.matrixWorld).y);
  const scale=spec.height/top,joint=b=>first.skeleton.bones.indexOf(b);
  const dominant=i=>{let best=0;for(let k=1;k<4;k++)if(sw.getComponent(i,k)>sw.getComponent(i,best))best=k;return si.getComponent(i,best);};
  // Local boxes of the head and torso, from the vertices each bone mainly carries.
  const localBox=(bone)=>{const j=joint(bone),box=new THREE.Box3();m1.copy(bone.matrixWorld).invert();
    for(let i=0;i<pos.count;i++)if(dominant(i)===j)box.expandByPoint(v1.fromBufferAttribute(pos,i).applyMatrix4(body.matrixWorld).applyMatrix4(m1));return box;};
  const headBox=localBox(bones.head),chestBox=new THREE.Box3();
  for(let i=0;i<pos.count;i++){const j=dominant(i);if(j===joint(bones.chest)||j===joint(bones.spine))chestBox.expandByPoint(v1.fromBufferAttribute(pos,i).applyMatrix4(body.matrixWorld));}

  const ink=outlineMaterial((spec.outline??.022)/scale);addOutline(body,ink);
  // The hat keeps the atlas as shipped (the kit recolour is for clothes), and its size never counts toward the height.
  if(hat){const old=hat.material;hat.material=toonMaterial(old.map?{map:old.map}:{color:'#d9d2c3'},spec.rim);old.dispose?.();
    hat.name='player-hat';hat.castShadow=true;hat.receiveShadow=true;if(spec.hatScale)hat.scale.multiplyScalar(spec.hatScale);
    hat.updateMatrixWorld(true);addOutline(hat,ink);}

  // Back number on the chest, placed in the bind pose then carried by the chest bone.
  if(spec.number){const size=.4/scale,tag=new THREE.Mesh(new THREE.PlaneGeometry(size,size),numberMaterial(spec.number));
    tag.name='jersey-number';tag.position.set((chestBox.min.x+chestBox.max.x)/2,chestBox.min.y+(chestBox.max.y-chestBox.min.y)*.55,chestBox.min.z-.012);tag.rotation.y=Math.PI;
    model.add(tag);model.updateMatrixWorld(true);bones.chest.attach(tag);}

  // Gloves: the existing glove model (cuff up, knuckles to -z) turned so its fingers run wrist->hand and its knuckles
  // face forward; the thumb goes to the inside of each hand.
  const gloves=[],gloveProbe=[];
  for(const side of ['L','R']){
    const hand=bones['hand'+side],wrist=bones['wrist'+side];
    hand.getWorldPosition(v1);wrist.getWorldPosition(v2);const along=v1.clone().sub(v2).normalize();
    const fwd=new THREE.Vector3(0,0,1).addScaledVector(along,-along.z).normalize();
    const yAxis=along.clone().negate(),zAxis=fwd.clone().negate(),xAxis=new THREE.Vector3().crossVectors(yAxis,zAxis).normalize();
    const inward=-Math.sign(v1.x)||1,thumb=Math.sign(xAxis.x*inward)||1;
    const g=buildGlove(spec.glove.color,-thumb);
    // The mitt is toon-shaded and inked; the small details (thumb, cuff, strap, patch) bake into one mesh and the seam
    // lines are dropped, so a glove costs three draws.
    g.body.material=toonMaterial({color:spec.glove.color},spec.rim);g.body.receiveShadow=false;
    for(const o of [...g.details.children]){if(o.isLine||o.isLineSegments){g.details.remove(o);o.geometry.dispose();continue;}
      o.castShadow=o.receiveShadow=false;if(o.position.y>.1&&o.geometry.type!=='CircleGeometry')o.material=new THREE.MeshStandardMaterial({color:spec.glove.cuff,roughness:.8});}
    mergeRigidParts(g.details);
    g.group.quaternion.setFromRotationMatrix(m1.makeBasis(xAxis,yAxis,zAxis));
    g.group.position.copy(v1).addScaledVector(along,.05*1/scale);g.group.scale.setScalar(spec.glove.size*2/.38/scale);
    model.add(g.group);model.updateMatrixWorld(true);hand.attach(g.group);addOutline(g.body,ink);
    gloves.push(g);gloveProbe.push({bone:hand,local:hand.worldToLocal(g.body.getWorldPosition(new THREE.Vector3())),r:spec.glove.size*1.05});
  }

  // Root (world placement and the old tilt/lean conventions) > turn (faces -z) > squash > model (scaled glTF).
  const root=new THREE.Group();root.name=name;const turn=new THREE.Group();turn.rotation.y=Math.PI;const squash=new THREE.Group();
  root.add(turn);turn.add(squash);squash.add(model);model.scale.setScalar(scale);
  root.userData.chest=bones.chest;root.userData.torso=bones.spine;

  const mixer=new THREE.AnimationMixer(model),actions=new Map();
  for(const [logical,clipName] of Object.entries(spec.clips)){
    const clip=gltf.animations.find(c=>c.name===clipName);if(!clip)throw Error(`${name}: missing clip ${clipName}`);
    const a=mixer.clipAction(clip);a.play();a.setEffectiveWeight(0);actions.set(logical,a);
  }
  const hipsRest=bones.hips.position.clone();
  // The pelvis around the hip joint: half its depth, from the torso box.
  const hipRadius=(chestBox.max.z-chestBox.min.z)*.35*scale;
  // Head probes: the eight corners of its box; the gloves by their centre and size.
  const headProbe=[];for(const x of [headBox.min.x,headBox.max.x])for(const y of [headBox.min.y,headBox.max.y])for(const z of [headBox.min.z,headBox.max.z])headProbe.push(new THREE.Vector3(x,y,z));
  // Measured with the model already scaled, so these are metres.
  root.updateMatrixWorld(true);
  const legLen=side=>{bones['upperLeg'+side].getWorldPosition(v1);bones['lowerLeg'+side].getWorldPosition(v2);bones['foot'+side].getWorldPosition(v3);return [v1.distanceTo(v2),v2.distanceTo(v3)];};
  const legs={L:legLen('L'),R:legLen('R')};
  bones.hips.getWorldPosition(v1);const hipHeight=v1.y;

  const actor={
    root,model,body,hat,gloves,bones,mixer,scale,hipHeight,height:spec.height,
    duration:logical=>actions.get(logical).getClip().duration,
    // layers: [logicalClip, time, weight]; weights should add up to 1. Loops wrap; one-shots clamp to their end.
    // The mixer only writes a bone whose blended value changed since its last update, so every bone first goes back to
    // its clip value from the last call (undoing that frame's procedural edits); untouched bones stay in the bind pose.
    pose(layers,{lockHips=false}={}){
      for(const r of rest){r.b.position.copy(r.p);r.b.quaternion.copy(r.q);r.b.scale.copy(r.s);}
      for(const a of actions.values())a.setEffectiveWeight(0);
      for(const [n,t,w,loop] of layers){if(!(w>0))continue;const a=actions.get(n),d=a.getClip().duration;
        a.time=loop?((t%d)+d)%d:Math.min(Math.max(0,t),d-1e-4);a.setEffectiveWeight(w);}
      mixer.update(0);
      for(const r of rest){r.p.copy(r.b.position);r.q.copy(r.b.quaternion);r.s.copy(r.b.scale);}
      if(lockHips){bones.hips.position.x=hipsRest.x;bones.hips.position.z=hipsRest.z;}
      root.updateMatrixWorld(true);
    },
    // Where a clip has a hand furthest forward (model +z): the contact frame of a punch, measured not guessed.
    measureReach(logical){
      const d=actions.get(logical).getClip().duration;let best={forward:-Infinity};
      for(let t=0;t<=d;t+=1/120){actor.pose([[logical,t,1]]);
        for(const side of ['L','R']){const f=actor.handForward(side);if(f>best.forward)best={t,side,forward:f};}}
      return best;
    },
    // A hand's reach in front of the body, in metres along the actor's facing.
    handForward(side){model.updateMatrixWorld(true);bones['hand'+side].getWorldPosition(v1);model.worldToLocal(v1);return v1.z*scale;},
    // Turns the bone toward a world point about world up, by a share of the remaining yaw (clamped).
    look(boneKey,target,share,limit=1.1){
      const bone=bones[boneKey];bone.getWorldPosition(v1);v2.copy(target).sub(v1);v2.y=0;if(v2.lengthSq()<1e-6)return;
      root.getWorldDirection(v3).negate();v3.y=0;v3.normalize();
      const yaw=Math.atan2(v3.z*v2.x-v3.x*v2.z,v3.x*v2.x+v3.z*v2.z);turnBone(bone,UP,Math.max(-limit,Math.min(limit,yaw))*share);
    },
    // Turns a bone about world up (a twist of the chest, say).
    twist(boneKey,angle){turnBone(bones[boneKey],UP,angle);},
    // Leans a bone toward the facing direction (positive) about the actor's side axis.
    lean(boneKey,angle){root.getWorldDirection(v3).negate();v3.y=0;v3.normalize();turnBone(bones[boneKey],v1.crossVectors(UP,v3).normalize(),angle);},
    // Lowers the hips by `drop` with the feet kept down: thighs swing the knees forward, shins fold back under.
    crouch(drop){
      if(!(drop>0))return;root.getWorldDirection(v3).negate();v3.y=0;v3.normalize();const axis=v2.crossVectors(UP,v3).normalize().negate().clone();
      for(const side of ['L','R']){const [a,b]=legs[side],ang=Math.acos(Math.max(-1,Math.min(1,1-drop/(a+b))));
        turnBone(bones['upperLeg'+side],axis,ang);turnBone(bones['lowerLeg'+side],axis,-2*ang);}
    },
    // Swings an upper arm so the hand points at a world point, blended by w; the elbow keeps the clip's bend.
    aimArm(side,target,w){
      if(!(w>0))return;const upper=bones['upperArm'+side];upper.getWorldPosition(v1);bones['hand'+side].getWorldPosition(v2);
      const from=v2.sub(v1).normalize(),to=v3.copy(target).sub(v1).normalize();
      q1.setFromUnitVectors(from,to);q2.identity().slerp(q1,w);
      upper.parent.updateWorldMatrix(true,false);upper.parent.getWorldQuaternion(qa);qb.copy(qa).multiply(upper.quaternion);
      upper.quaternion.copy(qa.invert().multiply(q2.multiply(qb)));upper.updateMatrixWorld(true);
    },
    setSquash(a){squash.scale.set(1+a*.5,1-a,1+a*.5);},
    // Lowest point of the head, gloves and hips (big heads and gloves reach the turf first when the body is on its side).
    lowestPoint(){
      root.updateMatrixWorld(true);let low=bones.hips.getWorldPosition(v1).y-hipRadius;
      for(const p of headProbe)low=Math.min(low,v1.copy(p).applyMatrix4(bones.head.matrixWorld).y);
      for(const g of gloveProbe)low=Math.min(low,v1.copy(g.local).applyMatrix4(g.bone.matrixWorld).y-g.r);
      return low;
    },
    // Furthest world x of the drawn body and gloves to one side of x0 at heights below maxY (skinned vertices).
    reach(x0,maxY=1.7,step=3){
      root.updateMatrixWorld(true);let out=0;
      for(let i=0;i<pos.count;i+=step){body.getVertexPosition(i,v1).applyMatrix4(body.matrixWorld);if(v1.y<maxY)out=Math.max(out,v1.x-x0);}
      for(const g of gloves){const p=g.body.geometry.attributes.position;for(let i=0;i<p.count;i+=step){v1.fromBufferAttribute(p,i).applyMatrix4(g.body.matrixWorld);if(v1.y<maxY)out=Math.max(out,v1.x-x0);}}
      return out;
    }
  };
  actor.pose([['idle',0,1]]);
  return actor;
}
