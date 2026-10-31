import * as THREE from './vendor/three.module.min.js';
import {makeSurfaceTexture,softBoxGeometry,netGeometry,mergeRigidParts,mergeMeshGeometry} from './art.mjs';
import {LEVELS,WEAPONS,SKILLS,foldX,HIT_HEIGHT,ballHeight,hitZone,burstZone,swingPreview,skillStatus,spinPreview,predictFlight,goalLock,GOAL_CAM,KEEPER_Z,KEEPER_REACH,GOAL_Z,FAR_WALL,SIDE,PLAYER_Z} from './core.mjs';
import {hitFeel} from './ui.mjs';
import {buildSpectatorCrowd} from './crowd.mjs';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {loadCharacterAssets,createActor,toonMaterial,outlineMaterial,addOutline} from './actor.mjs';
import {CHARACTERS,DEFAULT_PLAYER,playerSpec} from './characters.mjs';

// The ball's wave print, one texture for every world the page builds (a figure change rebuilds the world). The ball's
// two materials share a shader program, and a disposed print from the old world got uploaded again by the new one, so
// the print is shared and never disposed with a world (userData.shared).
let BALL_WAVES;
function ballWavesTexture(){
  if(typeof document==='undefined')return null;if(BALL_WAVES)return BALL_WAVES;
  const c=document.createElement('canvas');c.width=256;c.height=128;const g=c.getContext('2d');g.fillStyle='#fff7e8';g.fillRect(0,0,256,128);g.lineWidth=14;
  for(const [col,off] of [['#ff6a2b',0],['#1d2a5c',64],['#ff6a2b',128],['#1d2a5c',192]]){g.strokeStyle=col;g.beginPath();for(let x=0;x<=256;x+=4){const y=64+Math.sin((x+off)/256*Math.PI*2)*38;x?g.lineTo(x,y):g.moveTo(x,y);}g.stroke();}
  BALL_WAVES=new THREE.CanvasTexture(c);BALL_WAVES.colorSpace=THREE.SRGBColorSpace;BALL_WAVES.userData.shared=true;return BALL_WAVES;
}

// Rendering uses (x,height,-physicsDepth); the game simulation remains unchanged.
// assets: the loaded characters ({striker, keeper} glTFs, see loadCharacterAssets); each world builds its own copies.
export function buildWorld(assets){
  // Night arena: a dark venue around a bright court, so the players and the ball carry the picture.
  const scene=new THREE.Scene();scene.background=new THREE.Color('#070b1d');scene.fog=new THREE.Fog('#0d1233',26,70);
  const camera=new THREE.PerspectiveCamera(34,.85,.1,100);
  camera.position.set(2.8,18.5,9.8);camera.lookAt(0,.15,-4.6);
  const mats=new Map();
  const material=(color,roughness=.8)=>{const key=color+roughness;if(!mats.has(key))mats.set(key,new THREE.MeshStandardMaterial({color,roughness}));return mats.get(key);};
  const mesh=(geometry,color,parent=scene,x=0,y=0,z=0,shadow=true)=>{const m=new THREE.Mesh(geometry,typeof color==='string'?material(color):color);m.position.set(x,y,z);m.castShadow=shadow;m.receiveShadow=true;parent.add(m);return m;};
  const box=(sx,sy,sz,color,parent,x,y,z)=>mesh(new THREE.BoxGeometry(sx,sy,sz),color,parent,x,y,z);
  const softBox=(sx,sy,sz,color,parent,x,y,z,r=.06)=>mesh(softBoxGeometry(sx,sy,sz,r),color,parent,x,y,z);
  const sphere=(r,color,parent,x,y,z,sx=1,sy=1,sz=1)=>{const m=mesh(new THREE.SphereGeometry(r,20,14),color,parent,x,y,z);m.scale.set(sx,sy,sz);return m;};
  const rod=(a,b,r,color,parent=scene)=>{const v1=new THREE.Vector3(...a),v2=new THREE.Vector3(...b),delta=v2.clone().sub(v1);const m=mesh(new THREE.CylinderGeometry(r,r,delta.length(),8),color,parent);m.position.copy(v1).add(v2).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return m;};
  // Court markings sit just above the stripe tops (y .030) so they never depth-fight with them, whatever the draw order.
  const floorLine=(x,z,width,depth,color='#f3f6ff')=>box(width,.016,depth,color,scene,x,.027,z);
  // Floodlight key (it keeps the name `sun` and casts the shadows), a cool sky fill and a warm fill from the camera side.
  const HEMI=1.15,SUN=3;
  const hemisphere=new THREE.HemisphereLight('#9fb4ff','#2a2140',HEMI);scene.add(hemisphere);
  const sun=new THREE.DirectionalLight('#fff2dc',SUN);sun.position.set(-7,15,5);sun.target.position.set(0,0,-4);scene.add(sun.target);scene.add(sun);
  sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-10;sun.shadow.camera.right=10;sun.shadow.camera.top=12;sun.shadow.camera.bottom=-10;sun.shadow.camera.near=1;sun.shadow.camera.far=40;sun.shadow.normalBias=.025;sun.shadow.bias=-.0002;
  const fill=new THREE.DirectionalLight('#ffc2a8',.45);fill.position.set(6,7,9);scene.add(fill);
  const ground=mesh(new THREE.PlaneGeometry(200,200),'#141a31',scene,0,-.65,-4,false);ground.rotation.x=-Math.PI/2;ground.name='ground';
  const platform=softBox(10.3,.55,13.6,'#1b2240',scene,0,-.3,-4.6,.13);platform.name='platform';
  const stone=makeSurfaceTexture('stone');
  softBox(10.45,.13,13.75,new THREE.MeshStandardMaterial({color:'#2a335f',map:stone,roughness:.95}),scene,0,-.08,-4.6,.04);
  const turf=makeSurfaceTexture('turf'),turfMaterials=new Map();
  function fieldMaterial(color){if(!turfMaterials.has(color))turfMaterials.set(color,new THREE.MeshStandardMaterial({color,map:turf,bumpMap:turf,bumpScale:.012,roughness:.94}));return turfMaterials.get(color);}
  const court=box(8.25,.06,10.2,fieldMaterial('#24974c'),scene,0,-.015,-4.9);court.name='court';
  // Ten stripes in two fixed greens, one mesh per tint (stripes[0] even rows, stripes[1] odd rows). The level's colour goes
  // to the LED boards and the rim light instead (see `accent`).
  const stripes=[0,1].map(parity=>{const rows=[];for(let i=parity;i<10;i+=2)rows.push(new THREE.Mesh(new THREE.BoxGeometry(8,.016,.97)).translateZ(-.45-i).translateY(.022));
    const m=new THREE.Mesh(mergeMeshGeometry(rows),fieldMaterial(parity?'#28a253':'#2fae5a'));rows.forEach(r=>r.geometry.dispose());m.name=`stripes-${parity}`;m.castShadow=true;m.receiveShadow=true;scene.add(m);return m;});
  const paving=[];for(let z=-10.4;z<2;z+=1.45)for(const side of [-1,1])paving.push(new THREE.Vector3(side*4.35,-.008,z),new THREE.Vector3(side*5.07,-.008,z));
  scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(paving),new THREE.LineBasicMaterial({color:'#2c3560',transparent:true,opacity:.6})));
  for(const x of [-3.75,3.75])floorLine(x,-4.9,.035,9.6);
  for(const z of [-.25,-4.9,-9.55])floorLine(0,z,7.5,.035);
  floorLine(-2.4,-1.25,.035,2);floorLine(2.4,-1.25,.035,2);floorLine(0,-2.25,4.8,.035);
  const centerRing=mesh(new THREE.RingGeometry(.95,.98,48),'#f3f6ff',scene,0,.036,-4.9,false);centerRing.rotation.x=-Math.PI/2;
  const centerDot=mesh(new THREE.CircleGeometry(.045,12),'#f3f6ff',scene,0,.038,-4.9,false);centerDot.rotation.x=-Math.PI/2;
  // LED boards: club messages on a dark strip, one canvas shared by the side and far walls (each with its own repeat),
  // scrolling on the scene clock. Without a DOM (node tests) they are plain blue panels.
  const ledCanvas=(()=>{if(typeof document==='undefined')return null;const c=document.createElement('canvas');c.width=2048;c.height=128;const g=c.getContext('2d');
    const blocks=[['REBOUND CLUB','#ff6a2b'],['反弹守卫','#1ec8b4'],['NIGHT CUP','#ffd23a'],['反弹守卫','#3a7bff']],bw=c.width/blocks.length;
    blocks.forEach(([text,col],i)=>{g.fillStyle='#0b1022';g.fillRect(i*bw,0,bw,128);g.fillStyle=col;g.fillRect(i*bw+6,12,bw-12,104);
      g.fillStyle='#0b1022';g.font='900 64px system-ui,"PingFang SC","Microsoft YaHei",sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(text,i*bw+bw/2,67);});return c;})();
  const ledMaterial=repeat=>{if(!ledCanvas)return new THREE.MeshBasicMaterial({color:'#2a3a7a'});const t=new THREE.CanvasTexture(ledCanvas);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=THREE.RepeatWrapping;t.repeat.set(repeat,1);return new THREE.MeshBasicMaterial({map:t,toneMapped:false});};
  const ledSide=ledMaterial(1.5),ledFar=ledMaterial(.35);let ledOffset=0;
  // Side walls: dark boards with the LED strip facing the court; low enough not to hide the incoming ball.
  for(const x of [-4.2,4.2]){
    box(.18,.62,10.6,'#141a33',scene,x,.31,-4.9);
    const face=mesh(new THREE.PlaneGeometry(10.4,.44),ledSide,scene,x-Math.sign(x)*.095,.33,-4.9,false);face.rotation.y=-Math.sign(x)*Math.PI/2;face.receiveShadow=false;
  }
  // The far wall is split around the goal mouth; both are rebuilt whenever the level's goal width changes.
  const farGoal=new THREE.Group();farGoal.position.set(0,0,-FAR_WALL);scene.add(farGoal);
  const farNet=new THREE.LineBasicMaterial({color:'#e8f0ff',transparent:true,opacity:.5});
  let farNetLines=null,netRest=null,netDirty=false;
  function buildFarGoal(g){
    for(const child of [...farGoal.children]){farGoal.remove(child);if(child!==sign)child.geometry?.dispose();}
    const edge=SIDE+.4,span=edge-g;
    for(const side of [-1,1]){
      box(span,.32,.65,'#141a33',farGoal,side*(g+span/2),.17,-.3);
      box(span,.95,.32,'#1a2142',farGoal,side*(g+span/2),.82,-.42);
      mesh(new THREE.PlaneGeometry(span-.08,.72),ledFar,farGoal,side*(g+span/2),.84,-.255,false).receiveShadow=false;
      const post=rod([side*g,.02,.1],[side*g,1.25,.1],.07,'#ffffff',farGoal);post.name=side<0?'post-left':'post-right';post.position.x=side*g;
      rod([side*g,1.25,.1],[side*g,.9,-.75],.045,'#e8edf8',farGoal);
      sphere(.078,'#ffffff',farGoal,side*g,1.25,.1,1,1,1).castShadow=false;
    }
    rod([-g,1.25,.1],[g,1.25,.1],.07,'#ffffff',farGoal);
    rod([-g,.9,-.75],[g,.9,-.75],.045,'#e8edf8',farGoal);
    farNetLines=new THREE.LineSegments(netGeometry(g,1.25,.9,.1,-.75),farNet);netRest=farNetLines.geometry.attributes.position.array.slice();netDirty=false;farGoal.add(farNetLines);
    mergeRigidParts(farGoal);
  }
  function label(value,width,height,color='#2c5745',background=null){
    // Without a DOM (node tests) the same-sized plane is built untextured, so its placement can still be checked.
    if(typeof document==='undefined')return new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));
    const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');
    if(background){ctx.fillStyle=background;ctx.fillRect(0,0,512,128);}ctx.fillStyle=color;ctx.font='bold 52px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(value,256,66);
    const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:texture,transparent:!background,depthWrite:false,toneMapped:false}));
  }
  // The club banner is a lit sign over the far stands.
  const sign=label('REBOUND CLUB',2.9,.45,'#ffb347','#0d1430');
  // A low transparent goal leaves the defender and the interception area visible.
  // The camera sits behind it, so it is drawn see-through: its crossbar and net never hide the defender or the ball.
  const goal=new THREE.Group();scene.add(goal);
  const ghost=(color,opacity)=>new THREE.MeshStandardMaterial({color,roughness:.7,transparent:true,opacity,depthWrite:false});
  const post=ghost('#fff2db',.42),bar=ghost('#fff7e3',.32),back=ghost('#e9e8c9',.28);
  for(const x of [-4,4]){
    rod([x,.02,.05],[x,1.04,.05],.065,post,goal);
    rod([x,1.04,.05],[x,.75,1.04],.045,back,goal);
    rod([x,.02,1.04],[x,.75,1.04],.045,back,goal);
  }
  rod([-4,1.04,.05],[4,1.04,.05],.065,bar,goal);
  rod([-4,.75,1.04],[4,.75,1.04],.045,back,goal);
  const netMat=new THREE.LineBasicMaterial({color:'#eee5cc',transparent:true,opacity:.16});
  goal.add(new THREE.LineSegments(netGeometry(4,1.04,.75,.05,1.04),netMat));
  for(const side of [-1,1]){const joint=sphere(.075,ghost('#e6ddc5',.4),goal,side*4,1.04,.05);joint.castShadow=false;const foot=softBox(.18,.05,.19,ghost('#2a3150',.45),goal,side*4,.015,.05,.015);foot.castShadow=false;}
  goal.traverse(o=>{if(o.isMesh)o.castShadow=false;});
  // Side stands: dark tiers beyond the walls frame the court (the crowd sits on the far stands).
  for(const side of [-1,1])for(let i=0;i<3;i++){const top=.45+i*.5,x=side*(5.05+i*.95);
    mesh(new THREE.BoxGeometry(.95,top,11.6),i%2?'#1d2550':'#1a2147',scene,x,top/2-.02,-5.2,false);mesh(new THREE.BoxGeometry(.95,.05,11.6),'#2c3a72',scene,x,top+.005,-5.2,false);}
  // Floodlight towers: poles and heads are static scenery (merged below); the lit panels, glows and beams come after.
  const FLOODS=[[-9.5,3],[9.5,3],[-9.5,-15],[9.5,-15]],floodHeads=[];
  for(const [x,z] of FLOODS){mesh(new THREE.CylinderGeometry(.16,.26,11.6,8),'#232a4a',scene,x,5.8,z,false);
    const head=new THREE.Object3D();head.position.set(x,11.8,z);head.lookAt(0,0,-5);head.updateMatrixWorld(true);floodHeads.push(head);
    const frame=mesh(new THREE.BoxGeometry(2.6,1.5,.25),'#232a4a',scene,0,0,0,false);frame.position.copy(head.position);frame.quaternion.copy(head.quaternion);}
  // Far stands: three tiers behind the far wall and a back wall carrying the club sign, so the top of a tall screen
  // shows a venue instead of bare ground. Built before the merge below, so they cost a couple of draws; no shadows.
  const STAND_Z=11.9,TIER=[.15,.7,1.25];
  TIER.forEach((top,i)=>{mesh(new THREE.BoxGeometry(13,top+.65,.9),i%2?'#1d2550':'#1a2147',scene,0,(top-.65)/2,-(STAND_Z+.9*i),false);mesh(new THREE.BoxGeometry(13,.06,.9),'#2c3a72',scene,0,top+.03,-(STAND_Z+.9*i),false);});
  mesh(new THREE.BoxGeometry(13.4,3.3,.3),'#141b38',scene,0,1,-(STAND_Z+2.75),false);
  for(const x of [-6.6,6.6])mesh(new THREE.BoxGeometry(.3,3.3,3),'#18203f',scene,x,1,-(STAND_Z+1.35),false);
  // The club banner hangs on two poles above the keeper's head. Only tall screens have room for it there; on wide ones
  // the keeper's head sits near the top edge and every spot beside its range (±4 with a dive) is cut off by the stands,
  // so it is not shown (the page header carries the name).
  const signPoles=[0,1].map(()=>{const pole=mesh(new THREE.CylinderGeometry(.035,.035,1,8),'#2a3150',scene,0,0,0,false);pole.name='sign-pole';return pole;});
  if(sign)scene.add(sign);
  function placeSign(aspect){
    if(!sign)return;const shown=aspect<1;sign.visible=shown;signPoles.forEach(pole=>pole.visible=shown);if(!shown)return;
    const [x,y,z,width]=[0,1.5,12,3.6],s=width/2.9,h=.45*s;
    sign.scale.setScalar(s);sign.position.set(x,y,-z);
    signPoles.forEach((pole,i)=>{const top=y-h/2,px=x+(i?1:-1)*width*.42;pole.scale.set(1,top+.65,1);pole.position.set(px,(top-.65)/2,-z-.02);});
  }
  // A cool rim light from the far end separates the players from the turf (no shadow, so no extra pass).
  const RIM='#7fb6ff',rim=new THREE.DirectionalLight(RIM,1.4);rim.name='rim';rim.position.set(3,6,-16);rim.target.position.set(0,0,-4);scene.add(rim,rim.target);
  // Everything above is static scenery: bake it into one mesh per material before any animated or pooled object exists.
  mergeRigidParts(scene);
  const courtText=label('REBOUND',4.4,.85,'#ffffff');if(courtText){courtText.rotation.x=-Math.PI/2;courtText.position.set(0,.04,-3.35);courtText.material.opacity=.12;scene.add(courtText);}
  // Sky: a gradient dome (deep blue overhead, a violet glow on the horizon) and a few stars; neither takes fog.
  const sky=new THREE.Mesh(new THREE.SphereGeometry(80,32,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,
    vertexShader:'varying vec3 p;void main(){p=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying vec3 p;void main(){float y=p.y;vec3 top=vec3(.02,.03,.09),hor=vec3(.17,.10,.32),low=vec3(.03,.04,.10);gl_FragColor=vec4(y>0.?mix(hor,top,smoothstep(0.,.55,y)):mix(hor,low,smoothstep(0.,.2,-y)),1.);}'}));
  sky.name='sky';sky.renderOrder=-1;scene.add(sky);
  const starPos=new Float32Array(240*3);for(let i=0;i<240;i++){const h=Math.sin(i*91.17)*43758.55,r1=h-Math.floor(h),h2=Math.sin(i*17.31)*24634.6,r2=h2-Math.floor(h2),a=r1*Math.PI*2,y=.25+r2*.75,rr=Math.sqrt(1-y*y);starPos.set([Math.cos(a)*rr*75,y*75,Math.sin(a)*rr*75],i*3);}
  const starGeo=new THREE.BufferGeometry();starGeo.setAttribute('position',new THREE.BufferAttribute(starPos,3));
  scene.add(new THREE.Points(starGeo,new THREE.PointsMaterial({color:'#dfe6ff',size:.35,fog:false,transparent:true,opacity:.8,depthWrite:false})));
  // Floodlights: lit panels (one mesh), soft glows (one point batch) and faint beams (one mesh), none of them shadowed.
  const glowTexture=(()=>{if(typeof document==='undefined')return null;const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d'),r=g.createRadialGradient(64,64,0,64,64,64);
    r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.25,'rgba(255,236,190,.45)');r.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=r;g.fillRect(0,0,128,128);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;})();
  // Placed on each head, then detached with their world transform as their own (mergeMeshGeometry uses local matrices).
  const panels=[],beams=[],glowPos=[];
  const onHead=(head,m)=>{head.add(m);m.updateMatrixWorld(true);head.remove(m);m.matrixWorld.decompose(m.position,m.quaternion,m.scale);return m;};
  for(const head of floodHeads){for(let i=0;i<3;i++)for(let j=0;j<2;j++){const p=new THREE.Mesh(new THREE.PlaneGeometry(.7,.55));p.position.set(-.85+i*.85,-.35+j*.7,.14);panels.push(onHead(head,p));}
    const beam=new THREE.Mesh(new THREE.CylinderGeometry(1.1,4.2,15,20,1,true));beam.rotation.x=Math.PI/2;beam.position.z=7.6;beams.push(onHead(head,beam));
    glowPos.push(...new THREE.Vector3(0,0,.6).applyMatrix4(head.matrixWorld).toArray());}
  const floodPanels=new THREE.Mesh(mergeMeshGeometry(panels),new THREE.MeshBasicMaterial({color:'#fffbe6',toneMapped:false,fog:false}));floodPanels.name='flood-panels';scene.add(floodPanels);
  const beamFade=(()=>{if(typeof document==='undefined')return null;const c=document.createElement('canvas');c.width=4;c.height=128;const g=c.getContext('2d'),l=g.createLinearGradient(0,0,0,128);
    l.addColorStop(0,'rgba(255,245,215,0)');l.addColorStop(.15,'rgba(255,245,215,.5)');l.addColorStop(1,'rgba(255,245,215,0)');g.fillStyle=l;g.fillRect(0,0,4,128);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;})();
  const floodBeams=new THREE.Mesh(mergeMeshGeometry(beams),new THREE.MeshBasicMaterial({map:beamFade,color:'#fff4d8',transparent:true,opacity:beamFade?.14:0,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,fog:false}));
  floodBeams.name='flood-beams';scene.add(floodBeams);
  for(const m of [...panels,...beams])m.geometry.dispose();
  const glowGeo=new THREE.BufferGeometry();glowGeo.setAttribute('position',new THREE.Float32BufferAttribute(glowPos,3));
  scene.add(new THREE.Points(glowGeo,new THREE.PointsMaterial({map:glowTexture,color:'#fff1d0',size:9,transparent:true,opacity:glowTexture?1:0,depthWrite:false,blending:THREE.AdditiveBlending,fog:false})));
  // A brighter pool of light on the court keeps the eye in the middle; the edges fall off into the dark venue.
  const poolTexture=(()=>{if(typeof document==='undefined')return null;const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d'),r=g.createRadialGradient(64,64,0,64,64,64);
    r.addColorStop(0,'rgba(255,250,230,.22)');r.addColorStop(.6,'rgba(255,240,210,.08)');r.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=r;g.fillRect(0,0,128,128);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;})();
  const pool=new THREE.Mesh(new THREE.CircleGeometry(7.5,40),new THREE.MeshBasicMaterial({map:poolTexture,transparent:true,opacity:poolTexture?1:0,depthWrite:false,blending:THREE.AdditiveBlending}));
  pool.rotation.x=-Math.PI/2;pool.position.set(0,.031,-4.8);pool.scale.set(.72,1.12,1);pool.name='court-light';scene.add(pool);
  // The level's colour as a lit accent: LED tint and rim light.
  const accent=new THREE.Color(),accentHSL={h:0,s:0,l:0};
  // Crowd on the far stands: seated toy spectators share eight unshadowed instance batches.
  // The original seat layout and body-instance interface remain unchanged.
  const seats=[];for(let i=0;i<TIER.length;i++)for(let c=0;c<14;c++){const h=Math.sin(i*12.9898+c*78.233)*43758.5453,r=h-Math.floor(h);if(r<.15)continue;seats.push({x:-5.6+c*.86+(r-.5)*.2,y:TIER[i],z:-(STAND_Z+.9*i)+.12,phase:r*6.28,lift:.22+.12*r});}
  const spectators=buildSpectatorCrowd(seats),crowd=spectators.body;scene.add(spectators.group);
  function cheer(now,reduceMotion){
    spectators.update(now,goalCam.goalAt,reduceMotion);
  }
  // Players: skinned characters (actor.mjs, characters.mjs) on the roots the scene always used: the striker's root
  // faces -z, the keeper's is turned to face it; root tilt and position keep their old meaning.
  const striker=createActor(assets.striker,playerSpec(assets.player),'striker'),goalie=createActor(assets.keeper,CHARACTERS.keeper,'keeper');
  const hero=striker.root,keeper=goalie.root;
  scene.add(hero);hero.position.set(0,0,-1.6);
  scene.add(keeper);keeper.rotation.y=Math.PI;keeper.position.set(0,0,-KEEPER_Z);
  // The right (punching) glove keeps the old `gear.glove` handle and carries the burst's hand glow.
  const gear={glove:striker.gloves[1].group};
  // The frame of each punch where the fist is furthest out, measured from the clips.
  const PUNCH={left:striker.measureReach('punchLeft'),right:striker.measureReach('punchRight')};
  // Punch clip time for a swing time: the fist is nearly out by the end of the 0.03 s wind-up (the rules leave no time
  // for a visible build-up), drifts through contact over the active window, then carries through over the recovery.
  const smooth=x=>{x=Math.min(1,Math.max(0,x));return x*x*(3-2*x);};
  const punchTime=(t,w,c)=>{const reach=w.windup+.02,A=w.windup+w.active;return t<=reach?c-.12+.12*smooth(t/reach):t<=A?c+(t-reach)*.4:c+(A-reach)*.4+(t-A)/w.recovery*.35;};
  const ball=new THREE.Group();scene.add(ball);
  // A power shot swells and burns orange-red for its whole flight, trail included.
  // Toon-shaded and inked like the players: a cream ball with club-orange and navy waves, so its spin reads. Without a DOM
  // (node tests) it is plain amber. A power shot burns orange through the same waves.
  const ballWaves=ballWavesTexture();
  const ballMat=toonMaterial(ballWaves?{map:ballWaves}:{color:'#ffbd35'},'#fff1c0',.35),powerMat=toonMaterial({color:'#ff7a3a',map:ballWaves,emissive:'#ff3d10',emissiveIntensity:.45},'#ffd7a0',.35);
  const ballBody=mesh(new THREE.SphereGeometry(.26,24,18),ballMat,ball),ballInk=addOutline(ballBody,outlineMaterial(.02));
  // The body and its ink take a stretch matrix (along the flight, about the centre) while the group keeps the spin.
  ballBody.matrixAutoUpdate=ballInk.matrixAutoUpdate=false;
  const stretchDir=new THREE.Vector3(),stretchQ=new THREE.Quaternion(),stretchM=new THREE.Matrix4();
  // Ground hints. Every shape is sized from the same numbers the rules use (hitZone, swingPreview, crossingFrom).
  const flat=(geometry,color,opacity,y)=>{const m=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,depthTest:false}));m.rotation.x=-Math.PI/2;m.position.y=y;m.renderOrder=5;scene.add(m);return m;};
  const unit=new THREE.PlaneGeometry(1,1);
  const zone={fill:flat(unit,'#e5efac',.1,.043),band:flat(unit,'#ff6a2b',.2,.046),edges:[0,1,2,3].map(()=>flat(unit,'#f6f8dc',.4,.048))};
  // Aim arrow: shaft plus head, pointing along local -z (towards the far goal). Like the other ground hints it draws over
  // the bodies, and it reaches past the defender's head so the held direction reads from behind.
  const aim=new THREE.Group();scene.add(aim);const aimMat=new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.85,depthWrite:false,depthTest:false});
  const shaft=new THREE.Mesh(unit,aimMat);shaft.rotation.x=-Math.PI/2;shaft.scale.set(.1,2.6,1);shaft.position.set(0,.06,-1.6);shaft.renderOrder=6;aim.add(shaft);
  const headShape=new THREE.Shape();headShape.moveTo(-.22,0);headShape.lineTo(.22,0);headShape.lineTo(0,.42);headShape.lineTo(-.22,0);
  const head=new THREE.Mesh(new THREE.ShapeGeometry(headShape),aimMat);head.rotation.x=-Math.PI/2;head.position.set(0,.06,-2.9);head.renderOrder=6;aim.add(head);aim.visible=false;
  // Outgoing shot: dotted route to the goal line (folding off side walls) and a verdict ring at the end.
  const routeMat=new THREE.MeshBasicMaterial({color:'#fff6d8',transparent:true,opacity:.75,depthWrite:false});
  const dotGeo=new THREE.CircleGeometry(.06,10),spinMat=new THREE.MeshBasicMaterial({color:'#37d6c0',transparent:true,opacity:.9,depthWrite:false,depthTest:false});
  const route=Array.from({length:48},()=>{const d=new THREE.Mesh(dotGeo,routeMat);d.rotation.x=-Math.PI/2;d.visible=false;scene.add(d);return d;});
  // Spin hint: the short arc a spin taken now would follow, from the same physics step as the real flight.
  const spinArc=Array.from({length:16},()=>{const d=new THREE.Mesh(dotGeo,spinMat);d.rotation.x=-Math.PI/2;d.scale.setScalar(1.25);d.renderOrder=6;d.visible=false;scene.add(d);return d;});
  // Depth-tested like the route: the ring lies on the far goal line behind the keeper, so drawn on top it would cover them.
  const target=flat(new THREE.RingGeometry(.3,.42,32),'#7ee08a',.9,.05);target.material.depthTest=true;target.visible=false;
  // What the keeper covers: drawn at its feet at the true save reach.
  const reachBar=flat(unit,'#9cc8ea',.28,.05);reachBar.scale.set(KEEPER_REACH*2,.38,1);
  // Burst's slightly wider catch frame, shown only while it is affordable, so the extra margin is never hidden.
  const burstEdges=[0,1,2,3].map(()=>flat(unit,'#ff9a3c',.6,.049));
  // Burst cinematic pieces: a charge ring at the defender's feet and a warm key light; both built once.
  const chargeRing=flat(new THREE.RingGeometry(.55,.66,40),'#ff8a3c',0,.055);chargeRing.visible=false;
  const keyLight=new THREE.PointLight('#ffd7a0',0,6,1.6);scene.add(keyLight);
  const cine={w:0,dim:0,side:1,theta:0,r:1},focus=new THREE.Vector3(),closePos=new THREE.Vector3(),lookAt=new THREE.Vector3();
  // Burst show, all built once: rising aura hoops and sparks round the defender, a glow on the striking hand,
  // a halo on the locked ball, a ground shockwave, and screen layers carried by the camera (vignette, speed
  // lines, a cut-in banner, a short flash). Everything is driven by the core's skill clock and hidden after.
  const glow=(color,extra={})=>new THREE.MeshBasicMaterial({color,transparent:true,opacity:0,depthWrite:false,...extra});
  const aura=new THREE.Group();aura.visible=false;scene.add(aura);
  const hoops=[0,1,2].map(()=>{const m=new THREE.Mesh(new THREE.TorusGeometry(.62,.035,6,44),glow('#ffb347'));m.rotation.x=Math.PI/2;aura.add(m);return m;});
  const sparks=new THREE.Group();sparks.visible=false;scene.add(sparks);
  const sparkGeo=new THREE.CircleGeometry(.06,4),sparkMat=glow('#ffd36b');
  const sparkList=Array.from({length:22},(_,i)=>{const m=new THREE.Mesh(sparkGeo,sparkMat);m.userData={a:i*2.39996,r:.42+(i*37%10)/22,o:i*.137%1};sparks.add(m);return m;});
  const handGlow=new THREE.Mesh(new THREE.SphereGeometry(.27,16,12),glow('#ff9a3c'));handGlow.visible=false;gear.glove.add(handGlow);
  const halo=new THREE.Mesh(new THREE.RingGeometry(.36,.46,36),glow('#fff1b0',{depthTest:false}));halo.renderOrder=7;halo.visible=false;scene.add(halo);
  const shock=new THREE.Mesh(new THREE.RingGeometry(.8,.98,56),glow('#ffb347'));shock.rotation.x=-Math.PI/2;shock.visible=false;scene.add(shock);
  function screenTexture(draw,w=512,h=512){if(typeof document==='undefined')return null;const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const tx=new THREE.CanvasTexture(c);tx.colorSpace=THREE.SRGBColorSpace;return tx;}
  const screenLayer=(map,color,order)=>{const m=new THREE.Mesh(unit,glow(color,{map,depthTest:false}));m.renderOrder=order;m.frustumCulled=false;m.visible=false;return m;};
  const hud=new THREE.Group();hud.position.z=-.5;camera.add(hud);scene.add(camera);
  const vignette=screenLayer(screenTexture((g,w,h)=>{const r=g.createRadialGradient(w/2,h/2,w*.22,w/2,h/2,w*.72);r.addColorStop(0,'rgba(13,42,34,0)');r.addColorStop(1,'rgba(13,42,34,0.92)');g.fillStyle=r;g.fillRect(0,0,w,h);}),'#ffffff',20);
  const lines=screenLayer(screenTexture((g,w,h)=>{g.translate(w/2,h/2);for(let i=0;i<56;i++){const a=i/56*Math.PI*2+(i%3)*.03,l=w*(.18+(i*7%5)*.03);g.rotate(Math.PI*2/56);g.fillStyle=i%2?'rgba(255,240,205,0.85)':'rgba(255,190,120,0.7)';g.beginPath();g.moveTo(w*.36,-1.5-(i%3));g.lineTo(w*.36+l,0);g.lineTo(w*.36,1.5+(i%3));g.fill();}}),'#ffffff',21);
  const banner=screenLayer(screenTexture((g,w,h)=>{g.fillStyle='#ee6943';g.beginPath();g.moveTo(w*.06,h*.12);g.lineTo(w,h*.12);g.lineTo(w*.94,h*.88);g.lineTo(0,h*.88);g.fill();
    g.fillStyle='#bf4f2f';g.fillRect(0,h*.82,w,h*.06);g.fillStyle='#fff3d7';g.font=`900 ${h*.52}px "PingFang SC","Microsoft YaHei",Arial`;g.textBaseline='middle';g.fillText('爆发',w*.14,h*.5);
    g.font=`800 ${h*.2}px Arial`;g.fillStyle='#ffe2b8';g.fillText('B U R S T',w*.47,h*.5);g.fillStyle='#fff3d7';for(let i=0;i<3;i++){const x=w*(.8+i*.045);g.beginPath();g.moveTo(x,h*.3);g.lineTo(x+h*.12,h*.5);g.lineTo(x,h*.7);g.lineTo(x+h*.05,h*.5);g.fill();}},1024,256),'#ffffff',22);
  const flash=screenLayer(null,'#fff6dc',23);hud.add(vignette,lines,banner,flash);
  const burstFx={aura,sparks,hand:handGlow,halo,shock,vignette,lines,banner,flash};let kick=0,lastReduce=false;
  const tint={whiff:['#f4f6df',.55,.1,.28],none:['#f4f6df',.5,.08,.25],soft:['#f3df8a',.85,.14,.28],clean:['#ffffff',1,.3,.45],perfect:['#ffffff',1,.22,.92]};
  const ballMarker=mesh(new THREE.RingGeometry(.25,.28,32),new THREE.MeshBasicMaterial({color:'#f6d97b',transparent:true,opacity:.6,depthWrite:false}),scene,0,.04,-4,false);ballMarker.rotation.x=-Math.PI/2;
  // A ground shadow under the airborne ball makes its depth and landing point readable.
  const ballShadow=mesh(new THREE.CircleGeometry(.22,24),new THREE.MeshBasicMaterial({color:'#05080f',transparent:true,opacity:.4,depthWrite:false}),scene,0,.038,-4,false);ballShadow.rotation.x=-Math.PI/2;
  const RIB=16,ribPts=Array.from({length:RIB},()=>new THREE.Vector3());let ribCount=0,ribHead=0;
  const ribGeo=new THREE.BufferGeometry(),ribPos=new Float32Array(RIB*6),ribCol=new Float32Array(RIB*8),ribIdx=[];for(let i=0;i<RIB-1;i++){const a=i*2;ribIdx.push(a,a+1,a+2,a+1,a+3,a+2);}
  ribGeo.setAttribute('position',new THREE.BufferAttribute(ribPos,3).setUsage(THREE.DynamicDrawUsage));ribGeo.setAttribute('color',new THREE.BufferAttribute(ribCol,4).setUsage(THREE.DynamicDrawUsage));ribGeo.setIndex(ribIdx);
  const ribbon=new THREE.Mesh(ribGeo,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));
  ribbon.name='ball-ribbon';ribbon.frustumCulled=false;ribbon.renderOrder=4;ribbon.visible=false;scene.add(ribbon);
  const ribColor=new THREE.Color(),ribSide=new THREE.Vector3(),ribDir=new THREE.Vector3(),ribCam=new THREE.Vector3();
  const trail=Array.from({length:7},(_,i)=>{const m=mesh(new THREE.SphereGeometry(.07+i*.012,8,6),new THREE.MeshBasicMaterial({color:'#ffda7d',transparent:true,opacity:(i+1)*.035,depthWrite:false,blending:THREE.AdditiveBlending}),scene,0,.68,-5,false);m.visible=false;return m;});
  // Contact flashes, built once and reused: the glove's burst with spikes, and a teal double ring for spin shots.
  // They face the camera, are hollow so the ball stays visible, and live for a fraction of a second.
  const fx=new THREE.Group();fx.visible=false;scene.add(fx);
  // Drawn over the defender (the camera sits behind them) but hollow, so the ball itself stays visible.
  const fxMat=()=>new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:0,depthWrite:false,depthTest:false});
  const fxParts={burst:new THREE.Group(),ring:new THREE.Group()};
  for(const g of Object.values(fxParts))fx.add(g);
  const fxLayer=o=>{o.renderOrder=7;};
  fxParts.burst.add(new THREE.Mesh(new THREE.RingGeometry(.2,.27,28),fxMat()),new THREE.Mesh(new THREE.CircleGeometry(.11,16),fxMat()));
  for(let i=0;i<8;i++){const spike=new THREE.Mesh(new THREE.PlaneGeometry(.045,.2),fxMat());const a=i/8*Math.PI*2;spike.position.set(Math.cos(a)*.42,Math.sin(a)*.42,0);spike.rotation.z=a-Math.PI/2;fxParts.burst.add(spike);}
  fxParts.ring.add(new THREE.Mesh(new THREE.RingGeometry(.22,.26,32),fxMat()),new THREE.Mesh(new THREE.RingGeometry(.36,.385,32),fxMat()));
  // Extra punch for each contact, also built once: a soft glow, a wide shock ring and sparks streaking out of the fist.
  const fxGlow=new THREE.Mesh(unit,new THREE.MeshBasicMaterial({map:glowTexture,color:'#ffe2a8',transparent:true,opacity:0,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending}));
  const fxShock=new THREE.Mesh(new THREE.RingGeometry(.86,1,48),fxMat()),sparkStreak=new THREE.PlaneGeometry(.035,.26);
  const fxSparks=Array.from({length:14},(_,i)=>{const m=new THREE.Mesh(sparkStreak,fxMat()),a=i/14*Math.PI*2+(i%3)*.21;m.userData={a,speed:.8+(i*37%10)/12};m.rotation.z=a-Math.PI/2;return m;});
  fx.add(fxGlow,fxShock,...fxSparks);
  fx.traverse(fxLayer);
  // Goal confetti, built once: paper bits thrown up out of the net, timed from the goal on the scene clock (a pause
  // freezes them mid-air); none with reduced motion.
  const CONF=120,confetti=new THREE.InstancedMesh(new THREE.PlaneGeometry(.09,.14),new THREE.MeshBasicMaterial({side:THREE.DoubleSide,toneMapped:false}),CONF);
  confetti.name='confetti';confetti.frustumCulled=false;confetti.visible=false;confetti.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(confetti);
  const confColors=['#ff6a2b','#ffd23a','#1ec8b4','#3a7bff','#ffffff','#ff4f7b'].map(c=>new THREE.Color(c)),confSeed=[];
  for(let i=0;i<CONF;i++){const r=k=>{const h=Math.sin(i*12.9898+k*78.233)*43758.5453;return h-Math.floor(h);};
    confSeed.push({x:(r(1)-.5)*3,vx:(r(2)-.5)*5,vy:3.5+r(3)*4.5,vz:1.2+r(4)*3.2,sx:r(5)*12-6,sy:r(6)*12-6,sz:r(7)*12-6});confetti.setColorAt(i,confColors[i%confColors.length]);}
  const confM=new THREE.Matrix4(),confQ=new THREE.Quaternion(),confE=new THREE.Euler(),confP=new THREE.Vector3(),confS=new THREE.Vector3();let confAt=-1,confGoals=0,confState=null;
  function throwConfetti(s,now,reduceMotion){
    if(confState!==s){confState=s;confAt=-1;confGoals=s.goals;}
    if(s.goals>confGoals){confGoals=s.goals;confAt=now;}
    const t=confAt>=0?now-confAt:9;confetti.visible=!reduceMotion&&t>=0&&t<2.6;if(!confetti.visible)return;
    const drag=(1-Math.exp(-1.6*t))/1.6,fade=Math.min(1,(2.6-t)/.5);
    for(let i=0;i<CONF;i++){const c=confSeed[i];
      confP.set(goalCam.x+c.x+c.vx*drag,Math.max(.03,1+c.vy*drag-1.1*t*t),-GOAL_Z+c.vz*drag);
      confM.compose(confP,confQ.setFromEuler(confE.set(c.sx*t,c.sy*t,c.sz*t)),confS.setScalar(fade));confetti.setMatrixAt(i,confM);}
    confetti.instanceMatrix.needsUpdate=true;
  }
  let fxShot=null,fxStart=-1,fxFeel=null,clock=0,wallClock=null;
  // Side-wall impact: a ring on the wall face at the contact point, growing and fading in 0.35 s (two pooled, built once).
  const wallFx=[0,1].map(()=>{const g=new THREE.Group(),mat=new THREE.MeshBasicMaterial({color:'#fff4d2',transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide});
    const outer=new THREE.Mesh(new THREE.RingGeometry(.2,.26,28),mat),inner=new THREE.Mesh(new THREE.RingGeometry(.08,.12,20),mat);outer.rotation.y=inner.rotation.y=Math.PI/2;g.add(outer,inner);
    g.visible=false;g.userData={start:-9,power:1,mat};scene.add(g);return g;});
  const wallSeen={state:null,vx:0,vz:0};let wallNext=0;
  function wallImpacts(s,now){
    const b=s.ball,seen=wallSeen;
    // A side-wall bounce flips only the sideways velocity, right at a wall; hits and saves also turn the ball back.
    if(seen.state===s&&s.phase==='playing'&&seen.vx!==0&&Math.sign(b.vx)!==Math.sign(seen.vx)&&Math.sign(b.vz)===Math.sign(seen.vz)&&Math.abs(b.x)>SIDE-.6){
      const fx=wallFx[wallNext];wallNext=(wallNext+1)%wallFx.length;
      fx.position.set(Math.sign(seen.vx)*(SIDE+.02),ball.position.y,ball.position.z);fx.userData.start=now;fx.userData.power=Math.min(1,Math.hypot(b.vx,b.vz)/10);
    }
    seen.state=s;seen.vx=b.vx;seen.vz=b.vz;
    for(const fx of wallFx){const u=(now-fx.userData.start)/.35;fx.visible=u>=0&&u<1;if(fx.visible){fx.scale.setScalar(.6+u*(1.2+1.2*fx.userData.power));fx.userData.mat.opacity=.85*(1-u);}}
  }
  // Ring buffer for the ball trail: positions are copied into fixed vectors, never allocated per frame.
  const history=Array.from({length:trail.length},()=>new THREE.Vector3());let historyCount=0,historyHead=0;
  let lastBall=null,lastLevel=-1,lastSwing=null,punchLeft=false;
  const swingEnd={at:-9,time:0},react={state:null,goals:0,misses:0,at:-9,kind:null},lookAt3=new THREE.Vector3();
  // Render pose: the sim runs in fixed 1/120 s steps, the screen at 60/90/120/144 Hz. Positions are carried forward by
  // the unspent part of the next step at the last step's velocity (no added latency); a jump (serve, reset) snaps.
  // Rolling: the ball turns about the axis across its travel by distance / radius, and spin shots add sidespin about the
  // vertical the way they bend. A jump (serve, reset) is not rolled. Driven by the drawn motion, so pauses stop it.
  const rolledFrom=new THREE.Vector3(),spinAxis=new THREE.Vector3(),spinTurn=new THREE.Quaternion();let rollReady=false,rollState=null;
  function rollBall(size){
    const dx=ball.position.x-rolledFrom.x,dz=ball.position.z-rolledFrom.z,dist=Math.hypot(dx,dz),c=rollState?.ball.curve;
    if(rollReady&&dist>1e-9&&dist<.5){
      const turn=dist/(.26*size),side=c&&rollState.ball.kind==='spin'?-Math.sign(c.k)*turn*.9:0;
      spinAxis.set(dz/dist*turn,side,-dx/dist*turn);const angle=spinAxis.length();
      ball.quaternion.premultiply(spinTurn.setFromAxisAngle(spinAxis.divideScalar(angle),angle));
    }
    rolledFrom.copy(ball.position);rollReady=true;
  }
  const posed={px:0,kx:0,bx:0,bz:0},heightProbe={ball:{z:0,z0:0,z1:0,vz:0}};
  function renderPose(s){
    const p=s.pose,a=p?s.accumulator*120:0,on=a>1e-6;
    const carry=(cur,prev)=>on&&Math.abs(cur-prev)<.5?cur+(cur-prev)*a:cur;
    posed.px=p?carry(s.player.x,p.px):s.player.x;posed.kx=p?carry(s.keeper.x,p.kx):s.keeper.x;
    const jump=!p||Math.abs(s.ball.x-p.bx)>=.5||Math.abs(s.ball.z-p.bz)>=.5;
    posed.bx=jump?s.ball.x:Math.max(-SIDE,Math.min(SIDE,carry(s.ball.x,p.bx)));posed.bz=jump?s.ball.z:carry(s.ball.z,p.bz);
    heightProbe.ball.z=posed.bz;heightProbe.ball.z0=s.ball.z0;heightProbe.ball.z1=s.ball.z1;heightProbe.ball.vz=s.ball.vz;
    return posed;
  }
  // Goal camera. When a goal becomes certain (goalLock) the camera blends toward a low chase shot behind the ball,
  // looking at where it will meet the net; key goals get the full shot and a hold, others a brief push (GOAL_CAM).
  // After the line the ball carries on into the net, which bulges and settles; the beaten keeper dives at it.
  // All of it runs on the render clock, so it keeps playing while the match sits in 'goal' or 'won'.
  const goalCam={w:0,on:false,key:false,start:0,goalAt:-1,x:0,dirX:0,dirZ:1,h:.73,goals:0,state:null,dive:0,diveDir:1,side:1},chasePos=new THREE.Vector3(),chaseAim=new THREE.Vector3();
  let keeperReady=0,keeperClock=null;
  // Keeper dive, staged like a real goalkeeper's save (presentation only: the rules decide save or goal at the line).
  // The body turns about the hips. A stretch a (0 set stance … 1 full dive) tips it toward the ball, drops the hips and
  // carries them sideways so the feet leave the ground, tucks the far leg and trails the near one. land (0…1) brings a
  // dive down onto its side: the hips sink to the ground and the body flattens while its leading edge stays put.
  // Returns the body's offset from its spot on the line. The arms are aimed separately (aimArms): this keeper's arms
  // are short for its head, so arms swung "overhead" end beside the head; pointing them at the ball reads as a reach.
  // Hip height and hip drops come from the model (the old 0.9 / 0.35 / 0.24 were for a 0.9 m hip). The old dive also slid
  // the hips 0.3 toward the ball; this placeholder's upper body is long enough that a full-length dive about its spot
  // already reaches as far as a beaten keeper may (keeperReach / beatenDive), so it does not slide.
  const HIP=goalie.hipHeight,ARM_SPAN=(goalie.height-HIP)*.7,HIP_DROP=.35*HIP/.9,HIP_DOWN=.24*HIP/.9,HIP_SLIDE=0,diveOffset={x:0,y:0};
  function poseKeeper(a,dir,land=0){
    const flat=land*Math.min(1,a*2);
    const t0=1.42*a**1.2,tilt=t0+(1.5-t0)*flat;
    keeper.rotation.z=dir*tilt;
    const hipX=dir*(HIP_SLIDE*a**1.3+ARM_SPAN*(Math.sin(t0)-Math.sin(tilt))),hipY=HIP-HIP_DROP*a-(HIP-HIP_DROP*a-HIP_DOWN)*flat;
    diveOffset.x=hipX-dir*HIP*Math.sin(tilt);diveOffset.y=hipY-HIP*Math.cos(tilt);return diveOffset;
  }
  // Both arms swing from the set stance toward a world point by weight w, so the hands arrive at the ball together.
  // Once a dive lands (land 0…1) the aim sinks to the turf, so the arms stretch along the ground rather than up.
  // The keeper's body for a frame, after its root is placed: the dive clip by stretch a (hips held, the root carries
  // the body), a shuffle or idle otherwise; knees fold by the root's sink so the feet stay down, the upper body leans in
  // when ready, the head follows the ball, and both arms swing toward the save point by weight w (sinking to the turf
  // once a dive lands). react: an extra [clip, time, weight] layer (a cheer).
  const armTarget=new THREE.Vector3();
  function poseGoalie(a,dir,land,w,tx,ready,sink,shuffle,t,look,react){
    const layers=[],k=Math.min(1,a*3),rw=a>0?0:react?react[2]:0;
    if(a>0)layers.push([dir>0?'diveLeft':'diveRight',.1+.18*Math.min(1,a/.6),k],['idle',t,1-k,true]);
    // A side shuffle is 70% side-step over idle, so the arms do not swing out past the save reach.
    else if(shuffle)layers.push([shuffle>0?'strafeLeft':'strafeRight',t*1.3,.7*(1-rw),true],['idle',t,.3*(1-rw),true]);
    else layers.push(['idle',t,1-rw,true]);
    if(rw>0)layers.push(react);
    goalie.pose(layers,{lockHips:a>0});
    goalie.crouch(sink);goalie.lean('spine',.16*ready*(1-a));
    if(look&&a<.15)goalie.look('head',look,.6);
    if(w>0){armTarget.set(tx,HIT_HEIGHT-(HIT_HEIGHT-.2)*land,-KEEPER_Z+.15);goalie.aimArm('L',armTarget,w);goalie.aimArm('R',armTarget,w);}
  }
  // How far the keeper's body reaches sideways at ball height (below 1.7) for each stretch with both arms reaching
  // out toward the ball side, measured once from the model.
  const keeperReach=(()=>{const out=[],x0=keeper.position.x,y0=keeper.position.y;
    for(let i=0;i<=10;i++){const o=poseKeeper(i/10,1);keeper.position.x=x0+o.x;keeper.position.y=y0+o.y;poseGoalie(i/10,1,0,1,x0+8,0,0,0,0,null,null);out.push(goalie.reach(x0));}
    poseKeeper(0,1);keeper.position.x=x0;keeper.position.y=y0;poseGoalie(0,1,0,0,0,0,0,0,0,null,null);return out;})();
  // A beaten keeper's fingertips just miss: the stretch stops 0.2 short of the ball's centre (about its radius).
  function beatenDive(gap){const room=Math.max(keeperReach[0],gap-.2);let d=0;while(d<10&&keeperReach[d+1]<=room)d++;return d/10;}
  // A save's stretch follows the ball's gap: a ball at the body is a step and a low block, one at the edge of the
  // 0.55 save reach a short dive; the arms go to the ball either way.
  function saveStretch(gap){return .12+.45*Math.max(0,Math.min(1,(gap-.1)/.45));}
  // The save timeline on the scene clock (so it freezes with a pause): from 0.24 s before the ball reaches the keeper
  // line a short side step loads the near leg and the knees give, the launch fills the last 0.14 s, the stretch holds
  // through contact, a big dive then lands on its side, and the keeper gets back up. A shot it can reach is met at its
  // gap; one it cannot (a goal) gets a full-effort dive that stops short of the ball's path. Shots heading clearly wide
  // are only watched. The rules' own save (keeper.dive restarting) fixes side, stretch and contact from the real save.
  const DIVE={load:.1,launch:.14,hold:.06,land:.22,up:.5},dive={state:null,on:false,locked:false,at:0,dir:1,amt:0,tx:0,lastK:0},diveOut={a:0,w:0,tx:0,land:0,crouch:0,step:0,dir:1};
  function trackDive(s,now,pose,sm){
    const d=dive,k=s.keeper,b=s.ball,o=diveOut;o.a=o.w=o.land=o.crouch=o.step=0;
    if(d.state!==s||s.phase==='ready')Object.assign(d,{state:s,on:false,locked:false,lastK:k.dive});
    const saved=k.dive>d.lastK+.01;d.lastK=k.dive;
    if(saved)Object.assign(d,{on:true,locked:true,at:d.on?Math.min(d.at,now):now,dir:k.diveDir,amt:saveStretch(Math.abs(pose.bx-pose.kx)),tx:pose.bx});
    else if(s.phase==='playing'&&b.vz>0&&b.z<KEEPER_Z&&!d.locked){
      const tk=(KEEPER_Z-b.z)/b.vz,goalX=foldX(b.x+b.vx*(GOAL_Z-b.z)/b.vz);
      if(tk<=DIVE.load+DIVE.launch&&Math.abs(goalX)<=s.level.goalHalf+.3){
        const cross=foldX(b.x+b.vx*tk),gap=cross-k.x,g=Math.abs(gap);
        Object.assign(d,{on:true,at:now+tk,dir:Math.sign(gap)||1,amt:g<=KEEPER_REACH?saveStretch(g):beatenDive(g),tx:cross});
      }
    }
    const big=d.amt>.6,end=DIVE.hold+(big?DIVE.land:0)+DIVE.up;
    if(d.on&&now-d.at>end){d.on=false;d.locked=false;}
    o.dir=d.dir;o.tx=d.tx;if(!d.on)return o;
    const u=now-d.at;
    if(u<-DIVE.launch){const p=sm((u+DIVE.launch+DIVE.load)/DIVE.load);o.crouch=.1*p;o.step=.07*p;o.w=.25*p;}
    else if(u<DIVE.hold){const p=Math.min(1,(u+DIVE.launch)/DIVE.launch),e=1-(1-p)**2;o.a=d.amt*e;o.w=.25+.75*e;o.crouch=.1*(1-e);o.step=.07*(1-e);}
    else if(big&&u<DIVE.hold+DIVE.land){o.a=d.amt;o.w=1;o.land=sm((u-DIVE.hold)/DIVE.land);}
    else{const p=sm((u-DIVE.hold-(big?DIVE.land:0))/DIVE.up);o.a=d.amt*(1-p);o.w=1-p;o.land=big?1-p:0;o.crouch=.06*Math.sin(Math.PI*p);}
    return o;
  }
  // Chosen by a search over near/far misses, both sides and portrait/landscape: fewest frames with the keeper or the
  // goal frame in front of the ball, ball near frame centre (dolly-in made the posts block it more often).
  const GC_POSE={back:2.6,side:2.4,height:2.4,dolly:0,center:false,dive:beatenDive};
  const restAt=new THREE.Vector3(),netLean=g=>Math.max(-1,Math.min(1,g.dirX/Math.max(.2,g.dirZ)))*.5;
  // Where the ball ends up inside the net (netShot's limit: .62 deep, resting low).
  function netRest3(g){return restAt.set(g.x+netLean(g)*.62,.3,-(GOAL_Z+.62));}
  function trackGoal(s,now,reduceMotion,pose,sm){
    const g=goalCam;
    if(g.state!==s||s.goals<g.goals||s.phase==='ready'){Object.assign(g,{on:false,goalAt:-1,w:0,dive:0,state:s,goals:s.goals});}
    if(g.goalAt>=0&&s.phase==='playing'){g.on=false;g.goalAt=-1;}
    const lock=s.phase==='playing'?goalLock(s):null;
    // The lens sits on the far side of the ball from the keeper, so a keeper lunging at it never fills the frame.
    const away=x=>GC_POSE.center?(x>0?-1:1):Math.sign(x-pose.kx)||(x>0?1:-1);
    if(lock&&lock.t<=GOAL_CAM.camStart&&!g.on){g.on=true;g.key=lock.key;g.start=now;g.goalAt=-1;g.x=lock.x;g.side=away(lock.x);}
    if(s.goals>g.goals){
      const L=s.lastGoal,v=Math.hypot(L.vx,L.vz)||1;g.goals=s.goals;
      if(!g.on){g.on=true;g.key=L.key;g.start=now;g.side=away(L.x);}
      g.goalAt=now;g.x=L.x;g.dirX=L.vx/v;g.dirZ=L.vz/v;g.h=ballHeight(s);
    }
    if(g.on&&g.goalAt<0&&!lock)g.on=false;
    let w=0;
    if(g.on){
      const pre=g.goalAt<0,t=pre?0:now-g.goalAt,blend=sm((now-g.start)/(g.key?.35:.25));
      const hold=g.key?GOAL_CAM.hold:.25,back=g.key?GOAL_CAM.back:.35,peak=g.key?1:GOAL_CAM.brief;
      w=peak*(pre||t<hold?blend:t<hold+back?blend*sm(1-(t-hold)/back):0);
      if(!pre&&t>=hold+back)g.on=false;
    }
    g.w=reduceMotion?0:w;
    // A beaten keeper reaches as far as the gap allows: a near miss is a stretch, only a wide one is a full dive, so no
    // part of it ever sweeps across the ball's path.
    const gap=Math.abs(g.x-pose.kx);
    g.dive=g.on||g.goalAt>=0?GC_POSE.dive(gap)*sm((now-g.start)/.25):0;g.diveDir=Math.sign(g.x-pose.kx)||1;
    if(g.w>0){
      // Behind the ball along its flight (frozen at the line once it scores), raised and offset away from the keeper;
      // after the line the aim settles on where the ball comes to rest in the net and the lens dollies in on it.
      const pre=g.goalAt<0,bx=pre?pose.bx:g.x,bz=pre?pose.bz:GOAL_Z,dx=pre?s.ball.vx:g.dirX,dz=pre?s.ball.vz:g.dirZ,l=Math.hypot(dx,dz)||1;
      const settle=pre?0:sm((now-g.goalAt)/GOAL_CAM.hold),back=GC_POSE.back-GC_POSE.dolly*settle;
      chasePos.set(bx-dx/l*back+g.side*GC_POSE.side,GC_POSE.height,-(bz-dz/l*back));const rest=netRest3(g);chaseAim.set(g.x*.92,.72,-(GOAL_Z+.3)).lerp(rest,settle);
    }
  }
  // Ball into the net after the line: it decelerates to the back, drops, and the net bulges around it, then settles.
  function netShot(s,now,reduceMotion,sm){
    const g=goalCam,t=now-g.goalAt,ta=g.key&&!reduceMotion?(t<.4?t*.4:.16+(t-.4)):t;
    const depth=.62*(1-Math.exp(-ta*9)),lat=netLean(g);
    ball.position.set(g.x+lat*depth,g.h+(.3-g.h)*sm(ta/.5),-(GOAL_Z+depth));
    if(!farNetLines)return;
    const a=farNetLines.geometry.attributes.position,arr=a.array;
    if(ta>1.2){restoreNet();return;}
    const env=ta<.1?ta/.1:Math.exp(-(ta-.1)*5)*Math.cos((ta-.1)*16);
    for(let i=0;i<arr.length;i+=3){const x=netRest[i],y=netRest[i+1],z=netRest[i+2],f=Math.max(0,(.1-z)/.85);arr[i+2]=z-.3*f*env*Math.exp(-((x-g.x)**2+(y-g.h)**2)/.3);}
    a.needsUpdate=true;netDirty=true;
  }
  function restoreNet(){if(!netDirty||!farNetLines)return;const a=farNetLines.geometry.attributes.position;a.array.set(netRest);a.needsUpdate=true;netDirty=false;}
  function update(s,axis=0,reduceMotion=false,time){
    // Scene clock: follows the caller's time but stands still while the match is paused, so every effect timed on it
    // (crowd, wall rings, net, camera blends, keeper easing) freezes with the pause and resumes where it was.
    const raw=time??(wallClock??0)+1/60,step=wallClock===null?0:Math.max(0,Math.min(.25,raw-wallClock));wallClock=raw;if(s.phase!=='paused')clock+=step;const now=clock;
    if(s.shot!==fxShot){fxShot=s.shot;if(s.shot&&s.elapsed-s.shot.at<.15){fxStart=now;fxFeel=hitFeel(s.weapon,['perfect','soft','spin','burst'].includes(s.shot.kind)?s.shot.kind:'hit');fx.position.set(s.shot.x,.73,-s.shot.z);for(const [key,g] of Object.entries(fxParts)){g.visible=key===fxFeel.flash;g.traverse(o=>o.material?.color.set(fxFeel.color));}for(const m of [fxShock,...fxSparks])m.material.color.set(fxFeel.color);fx.userData.flash=fxFeel.flash;fx.userData.peak=fxFeel.intensity;}}
    const fxAge=fxFeel?now-fxStart:9,fxU=fxFeel?fxAge/fxFeel.life:1,strong=fxFeel&&fxAge<.28?fxFeel.motion:1;
    if(lastLevel!==s.levelIndex){accent.set(s.level.color).getHSL(accentHSL);accent.setHSL(accentHSL.h,.7,.6);
      for(const m of [ledSide,ledFar])m.color.set('#ffffff').lerp(accent,m.map?.35:.5);rim.color.set(RIM).lerp(accent,.3);buildFarGoal(s.level.goalHalf);lastLevel=s.levelIndex;}
    // LED boards scroll on the scene clock (still while paused); with reduced motion they hold still.
    if(!reduceMotion)ledOffset=(now*.04)%1;for(const m of [ledSide,ledFar])if(m.map)m.map.offset.x=ledOffset;
    const pose=renderPose(s);rollState=s;
    // Burst: wind up from 0.08s, strike at 0.28–0.38s, settle by 0.50s — all from the core's skill clock.
    const B=SKILLS.burst,D=B.duration,sk=s.skill?.kind==='burst'?s.skill:null,kt=sk?Math.min(D,sk.time):0,kp=kt/D,sm=smooth;
    trackGoal(s,now,reduceMotion,pose,sm);
    const wind=sk?(kt<B.strike?sm((kt-B.freeze)/(B.strike-B.freeze)):Math.max(0,1-sm((kt-B.strike)/.05))):0,blow=sk?(kt<B.strike?0:kt<B.release?sm((kt-B.strike)/(B.release-B.strike)):1-sm((kt-B.release)/(D-B.release))):0;
    lastReduce=reduceMotion;
    // Character clocks: in play the match clock (it stops for pauses and hit-stops, so a pose is a function of the
    // state); in the lobby and on the result screen the scene clock, so the players keep breathing.
    const animT=['ready','won','lost'].includes(s.phase)?now:s.elapsed;
    lookAt3.set(pose.bx,ballHeight(heightProbe),-pose.bz);
    // Reactions to the score, shown while play is stopped: the striker cheers a goal and slumps at a miss, the keeper
    // cheers the miss.
    if(react.state!==s)Object.assign(react,{state:s,goals:s.goals,misses:s.misses,at:-9,kind:null});
    if(s.goals>react.goals){react.goals=s.goals;react.at=now;react.kind='goal';}
    if(s.misses>react.misses){react.misses=s.misses;react.at=now;react.kind='miss';}
    const showing=!!react.kind&&s.phase!=='playing'&&s.phase!=='skill';
    const reactEnv=(actor,clip)=>{const d=actor.duration(clip),u=now-react.at;return showing&&u>=0&&u<d?Math.min(1,u/.15,(d-u)/.3):0;};
    // Striker: idle or a side-step by the held direction; the punch follows the rules' swing clock (or the burst's).
    hero.position.set(pose.px,0,-s.player.z);follow=pose.px*FOLLOW;
    hero.rotation.z=s.phase==='playing'?-axis*.075:0;
    const moving=s.phase==='playing'&&Math.abs(axis)>.05,sw=s.swing,w=WEAPONS[s.weapon];
    if(sw!==lastSwing){if(lastSwing&&!sw)swingEnd.at=s.elapsed;else if(sw)punchLeft=s.ball.x<s.player.x-.08;lastSwing=sw;}
    if(sw)swingEnd.time=sw.time;
    const left=!sk&&punchLeft,c=left?PUNCH.left:PUNCH.right;let sTime=0,sWeight=0;
    if(sk){sTime=kt<B.strike?c.t*.55*wind:c.t*.55+(c.t+.25-c.t*.55)*blow;sWeight=1;}
    else if(sw){sTime=punchTime(sw.time,w,c.t);sWeight=Math.min(1,sw.time/.025);}
    else if(swingEnd.at>=0&&s.elapsed-swingEnd.at<.12){const e=s.elapsed-swingEnd.at;sTime=punchTime(swingEnd.time+e,w,c.t);sWeight=1-e/.12;}
    const rClip=react.kind==='goal'?'cheer':'hurt',rw=react.kind?reactEnv(striker,rClip)*(1-sWeight):0;
    // A short squash on contact (the hit-stop holds it); none with reduced motion. Set first: it moves the bones the
    // look-at below measures from.
    striker.setSquash(!reduceMotion&&fxFeel&&fxFeel.flash==='burst'&&fxAge<.14?(1-fxAge/.14)*.05*Math.min(1.5,fxFeel.intensity):0);
    striker.pose([[moving?(axis>0?'strafeRight':'strafeLeft'):'idle',moving?animT*1.25:animT,1-sWeight-rw,true],[left?'punchLeft':'punchRight',sTime,sWeight],[rClip,now-react.at,rw]]);
    if(sk)striker.twist('chest',-wind*.45+blow*.35);
    if(rw<.5){striker.look('chest',lookAt3,.2*(1-sWeight));striker.look('head',lookAt3,.45);}
    const k=s.keeper,dv=trackDive(s,now,pose,sm);
    // Ready stance while a shot comes at it: knees give a little and the upper body leans in, eased on the render clock.
    const readyTo=s.phase==='playing'&&s.ball.vz>0?1:0,since=keeperClock===null?0:Math.min(.1,Math.max(0,now-keeperClock));keeperClock=now;
    keeperReady+=(readyTo-keeperReady)*Math.min(1,since*9);
    const off=poseKeeper(dv.a,dv.dir,dv.land),sink=.07*keeperReady+dv.crouch;
    keeper.position.set(pose.kx+off.x+dv.dir*dv.step,off.y-sink,-KEEPER_Z);
    // Shuffling means actually moving: the keeper's step since the last simulation tick.
    const kStep=s.pose?k.x-s.pose.kx:0,shuffling=!dv.a&&Math.abs(kStep)>1e-4&&s.phase==='playing',kw=react.kind==='miss'?reactEnv(goalie,'cheer'):0;
    poseGoalie(dv.a,dv.dir,dv.land,dv.w,dv.tx,keeperReady,sink,shuffling?Math.sign(kStep):0,animT,lookAt3,kw>0?['cheer',now-react.at,kw]:null);
    // Big heads and gloves reach the turf first when the body lies on its side: lift the whole body by the deepest point.
    const low=goalie.lowestPoint();if(low<0){keeper.position.y-=low;keeper.updateMatrixWorld(true);}
    const height=ballHeight(heightProbe);
    ball.position.set(pose.bx,height,-pose.bz);
    if(goalCam.goalAt>=0&&(s.phase==='goal'||s.phase==='won'))netShot(s,now,reduceMotion,sm);else restoreNet();
    throwConfetti(s,now,reduceMotion);
    const powered=(s.power||s.ball.kind==='burst')&&s.ball.vz>0,spinning=s.ball.kind==='spin'&&s.ball.vz>0,size=powered?1.25:1,squash=!reduceMotion&&fxFeel&&fxAge<.09?(1-fxAge/.09)*Math.min(1,fxFeel.intensity*.6):0;
    ball.scale.setScalar(size);ballBody.material=powered?powerMat:ballMat;
    const burstTrail=s.ball.kind==='burst'&&s.ball.vz>0;
    // Speed reads in the trail: from 3 up to 10 it grows brighter and thicker (the gaps already widen with speed).
    const quick=Math.max(0,Math.min(1,(Math.hypot(s.ball.vx,s.ball.vz)-3)/7));
    trail.forEach((m,i)=>{m.material.color.set(powered?'#ff6a2b':spinning?'#37d6c0':'#ffda7d');m.material.opacity=(i+1)*(burstTrail?.09:.035*(1+1.4*quick));m.scale.setScalar(burstTrail?1.9:1+.6*quick);});rollBall(size);wallImpacts(s,now);cheer(now,reduceMotion);
    ball.visible=!['miss','lost'].includes(s.phase);
    const r=hitZone(s),incoming=s.phase==='playing'&&s.ball.vz<0,p=incoming&&!s.swing?swingPreview(s,axis):{kind:'none'};
    const [edgeColor,edgeOpacity,fillOpacity,bandOpacity]=tint[p.kind]||tint.none,dim=s.swing?.45:incoming?1:.5;
    const place=(m,l,rgt,n,f)=>{m.position.x=(l+rgt)/2;m.position.z=-(n+f)/2;m.scale.x=rgt-l;m.scale.y=f-n;};
    place(zone.fill,r.left,r.right,r.near,r.far);place(zone.band,r.left,r.right,r.sweetNear,r.sweetFar);
    const e=.06;place(zone.edges[0],r.left,r.right,r.near,r.near+e);place(zone.edges[1],r.left,r.right,r.far-e,r.far);
    place(zone.edges[2],r.left,r.left+e,r.near,r.far);place(zone.edges[3],r.right-e,r.right,r.near,r.far);
    zone.fill.material.opacity=fillOpacity*dim;zone.band.material.opacity=bandOpacity*dim;
    for(const edge of zone.edges){edge.material.color.set(edgeColor);edge.material.opacity=edgeOpacity*dim;}
    const showHints=['playing','serving','miss','goal','paused'].includes(s.phase);
    for(const m of [zone.fill,zone.band,...zone.edges])m.visible=showHints;
    // Before the swing: where pressing now would send the ball. Just after it: where it actually went.
    const recent=s.shot&&s.elapsed-s.shot.at<.6&&s.ball.vz>0;
    const arrow=p.kind==='clean'||p.kind==='perfect'?{x:p.x,z:p.z,angle:p.angle,kind:p.kind}:recent?s.shot:null;
    aim.visible=!!arrow&&showHints;
    if(arrow){aim.position.set(arrow.x,0,-arrow.z);aim.rotation.y=-arrow.angle;aimMat.color.set(arrow.kind==='perfect'?'#ff7a3d':arrow.kind==='soft'?'#d7d2b8':'#ffffff');aimMat.opacity=recent&&!(p.kind==='clean'||p.kind==='perfect')?.55:.85;}
    const outgoing=s.shot&&s.ball.vz>0&&(s.phase==='playing'||s.phase==='goal'||s.phase==='won');
    // The route and its end ring are ground hints for the normal view; the goal close-up hides them.
    const fl=outgoing&&goalCam.w<.3?predictFlight(s):null;
    if(fl){
      // Red/green only says whether the keeper covers that line right now; it is not a promise of a goal.
      route.forEach((d,i)=>{const on=i+1<fl.count&&fl.zs[i+1]>s.ball.z;d.visible=on;if(on)d.position.set(fl.xs[i+1],.052,-fl.zs[i+1]);});
      const gx=fl.goal??fl.xs[fl.count-1];routeMat.color.set(s.ball.kind==='spin'?'#9df0e2':'#fff6d8');
      target.position.set(gx,.05,-GOAL_Z);target.material.color.set(Math.abs(gx)>s.level.goalHalf?'#c9c9b8':Math.abs(gx-s.keeper.x)<=KEEPER_REACH?'#ff5a4a':'#5fe07a');target.visible=true;
    }else{route.forEach(d=>d.visible=false);target.visible=false;}
    const sp=incoming&&skillStatus(s,'spin').ok?spinPreview(s,axis):null;
    spinArc.forEach((d,i)=>{const on=!!sp&&i<sp.count;d.visible=on&&showHints;if(on)d.position.set(sp.xs[i],.055,-sp.zs[i]);});
    const showBurst=incoming&&!s.swing&&!s.tutorial&&s.energy>=SKILLS.burst.cost;
    if(showBurst){const bz=burstZone(s),be=.045;place(burstEdges[0],bz.left,bz.right,bz.near,bz.near+be);place(burstEdges[1],bz.left,bz.right,bz.far-be,bz.far);place(burstEdges[2],bz.left,bz.left+be,bz.near,bz.far);place(burstEdges[3],bz.right-be,bz.right,bz.near,bz.far);}
    burstEdges.forEach(m=>m.visible=showBurst&&showHints);
    // Cinematic weights: dim and key light for the whole lock, camera push only without reduced motion.
    cine.dim=sk?(kt<B.freeze?kt/B.freeze:kt<B.release?1:Math.max(0,1-(kt-B.release)/(D-B.release))):0;
    cine.w=sk&&!reduceMotion?(kt<B.freeze?0:kt<B.push?sm((kt-B.freeze)/(B.push-B.freeze)):kt<B.release?1:sm(1-(kt-B.release)/(D-B.release))):0;
    // The push-in sweeps ~50° round the defender, then the hold keeps easing closer until the strike.
    cine.theta=sk&&kt<B.push?(1-sm((kt-B.freeze)/(B.push-B.freeze)))*.9:0;cine.r=1-.04*sm((kt-B.push)/(B.strike-B.push));
    if(sk){focus.set((s.player.x+sk.x)/2,1.02,-(s.player.z+sk.z)/2);cine.side=s.player.x>0?-1:1;}
    hemisphere.intensity=HEMI*(1-.42*cine.dim);sun.intensity=SUN*(1-.3*cine.dim);
    keyLight.intensity=cine.dim*5;keyLight.position.set(s.player.x+cine.side*.8,2.3,-s.player.z+.9);
    chargeRing.visible=!!sk;if(sk){chargeRing.position.set(s.player.x,.055,-s.player.z);chargeRing.scale.setScalar(.7+.7*kp);chargeRing.material.opacity=.85*(1-kp*.5);}
    // Aura: hoops rise and fade on a loop, sparks stream upward; static when motion is reduced.
    const auraOn=!!sk&&kt>=B.freeze&&kt<B.release+.05,auraW=sk?sm((kt-B.freeze)/.1)*(1-sm((kt-B.release)/.05)):0;
    aura.visible=sparks.visible=auraOn;handGlow.visible=!!sk&&kt>=B.freeze&&kt<B.release+.1;
    if(auraOn){aura.position.set(s.player.x,0,-s.player.z);
      hoops.forEach((m,i)=>{const ph=reduceMotion?i/3:(kt*1.4+i/3)%1;m.position.y=.12+ph*2.1;m.scale.setScalar(1+.25*ph);m.material.opacity=(1-ph)*.85*auraW;});
      sparkMat.opacity=.9*auraW;sparkList.forEach(m=>{const u=m.userData,ph=reduceMotion?u.o:(kt*1.8+u.o)%1;m.position.set(s.player.x+Math.cos(u.a)*u.r,ph*2.3,-s.player.z+Math.sin(u.a)*u.r);m.quaternion.copy(camera.quaternion);m.scale.set(1-ph*.5,(1-ph*.5)*1.8,1);});}
    if(handGlow.visible){handGlow.material.opacity=Math.min(.85,.6*wind+.9*blow);handGlow.scale.setScalar(1+(reduceMotion?0:.22*Math.sin(kt*28))*wind+.5*blow);}
    // The locked ball charges from the hold onward and trembles after the strike, still at its frozen spot.
    halo.visible=!!sk&&kt>=B.push;if(halo.visible){halo.position.copy(ball.position);halo.quaternion.copy(camera.quaternion);halo.material.opacity=.4+.5*sm((kt-B.push)/.2);halo.scale.setScalar(1+(reduceMotion?0:.12*Math.sin(kt*22))+.5*blow);
      if(!reduceMotion&&kt>=B.strike)ball.position.x+=Math.sin(kt*95)*.025;}
    shock.visible=!!sk&&kt>=B.strike&&kt<B.strike+.3;if(shock.visible){const u=(kt-B.strike)/.3;shock.position.set(s.player.x,.06,-s.player.z);shock.scale.setScalar(reduceMotion?2:1+4.5*u);shock.material.opacity=(1-u)*.9;}
    // Screen layers: vignette for the whole lock, speed lines while pushing/holding, the cut-in banner, a short flash.
    vignette.visible=!!sk;vignette.material.opacity=.95*cine.dim;
    lines.visible=!!sk&&!reduceMotion&&kt>=B.freeze&&kt<B.release;if(lines.visible){lines.material.opacity=.4*sm((kt-B.freeze)/.15)*(1-sm((kt-B.strike)/.1));lines.rotation.z=kt*.5;}
    banner.visible=!!sk&&kt>=.02&&kt<D-.1;if(banner.visible){const inn=sm((kt-.02)/.12),out=sm((kt-B.release+.05)/.15),span=hudSize.w*1.25;
      banner.position.x=reduceMotion?0:(1-inn)*-span+out*span;banner.material.opacity=reduceMotion?Math.min(inn,1-out):1;}
    const opening=kt<.07,striking=kt>=B.strike&&kt<B.strike+.12;
    flash.visible=!!sk&&!reduceMotion&&(opening||striking);if(flash.visible)flash.material.opacity=opening?.4*(1-kt/.07):.5*(1-(kt-B.strike)/.12);
    // A short forward kick of the camera on contact (bigger for a perfect strike, biggest when the burst leaves); a render
    // offset like the shake, skipped with reduced motion.
    // Only the striker's own contacts kick (in play, struck near its line), not a serve.
    const struck=s.phase==='playing'&&fxShot&&fxShot.z<PLAYER_Z+2.5;
    kick=reduceMotion||!fxFeel?0:fxShot?.kind==='burst'&&fxAge<.3?(1-fxAge/.3)*.18:struck&&fxFeel.flash==='burst'&&fxAge<.22?(1-fxAge/.22)**2*(.06+.05*Math.min(2,fxFeel.intensity)):0;
    reachBar.position.set(s.keeper.x,.05,-KEEPER_Z);reachBar.visible=showHints||s.phase==='ready';
    reachBar.material.color.set(s.keeper.dive>0?'#ff5a4a':'#9cc8ea');reachBar.material.opacity=s.keeper.dive>0?.6:.28;
    ballMarker.position.set(pose.bx,.035,-pose.bz);ballMarker.visible=ball.visible&&s.phase==='playing';
    ballShadow.position.set(ball.position.x,.038,ball.position.z);ballShadow.scale.setScalar(1.25-(ball.position.y-.73)*.35);ballShadow.visible=ball.visible;
    if(s.phase!=='playing'&&s.phase!=='paused'){historyCount=0;lastBall=null;}
    else if(s.phase==='playing'&&!reduceMotion&&s.ball!==lastBall){lastBall=s.ball;}
    if(s.phase==='playing'&&!reduceMotion){history[historyHead].copy(ball.position);historyHead=(historyHead+1)%history.length;historyCount=Math.min(history.length,historyCount+1);}
    trail.forEach((m,i)=>{m.visible=!reduceMotion&&ball.visible&&historyCount>i;m.position.copy(i<historyCount?history[(historyHead-historyCount+i+history.length)%history.length]:ball.position);});
    // The ball stretches along its flight as it speeds up and flattens for an instant at contact (none with reduced motion).
    const flightSpeed=Math.hypot(s.ball.vx,s.ball.vz),st=reduceMotion||!ball.visible?0:Math.min(.3,Math.max(0,(flightSpeed-3)*.03))-.35*squash;
    if(Math.abs(st)>1e-4&&flightSpeed>1e-6){const v=stretchDir.set(s.ball.vx/flightSpeed,0,-s.ball.vz/flightSpeed).applyQuaternion(stretchQ.copy(ball.quaternion).invert()),a=1+st,p=1-st*.45,k=a-p;
      stretchM.set(p+k*v.x*v.x,k*v.x*v.y,k*v.x*v.z,0, k*v.y*v.x,p+k*v.y*v.y,k*v.y*v.z,0, k*v.z*v.x,k*v.z*v.y,p+k*v.z*v.z,0, 0,0,0,1);}
    else stretchM.identity();
    ballBody.matrix.copy(stretchM);ballInk.matrix.copy(stretchM);
    // The ribbon: a glowing tail through the last positions, as wide and bright as the same speed reading makes the beads.
    if(s.phase==='playing'&&!reduceMotion&&ball.visible){ribPts[ribHead].copy(ball.position);ribHead=(ribHead+1)%RIB;ribCount=Math.min(RIB,ribCount+1);}else if(s.phase!=='paused')ribCount=0;
    ribColor.set(powered?'#ff6a2b':spinning?'#37d6c0':'#ffc66a');camera.getWorldPosition(ribCam);
    for(let i=0;i<RIB;i++){const on=i<ribCount,p=on?ribPts[(ribHead-1-i+RIB)%RIB]:ball.position,n=i+1<ribCount?ribPts[(ribHead-2-i+RIB)%RIB]:p,f=1-i/(RIB-1);
      ribDir.subVectors(p,n);ribSide.subVectors(ribCam,p).cross(ribDir).normalize();const width=on&&ribDir.lengthSq()>1e-8?(.05+.09*quick)*(burstTrail?1.8:powered?1.3:1)*f:0;
      ribPos.set([p.x+ribSide.x*width,p.y+ribSide.y*width,p.z+ribSide.z*width,p.x-ribSide.x*width,p.y-ribSide.y*width,p.z-ribSide.z*width],i*6);
      const alpha=f*f*(.3+.5*quick);ribCol.set([ribColor.r,ribColor.g,ribColor.b,alpha,ribColor.r,ribColor.g,ribColor.b,alpha],i*8);}
    ribGeo.attributes.position.needsUpdate=ribGeo.attributes.color.needsUpdate=true;ribbon.visible=ribCount>1;
    // Contact flash: a short pop centred on the contact point, oldest first to fade.
    fx.visible=!!fxFeel&&fxU<1&&s.phase!=='ready';
    if(fx.visible){
      fx.quaternion.copy(camera.quaternion);const ease=1-(1-fxU)**3,peak=fxFeel.intensity,alpha=(1-fxU)**1.4*Math.min(1,.55+.25*peak);
      let scale=(reduceMotion?.9:.55+.75*ease)*(.7+.3*peak);
      if(fxFeel.flash==='ring'&&!reduceMotion)scale*=1+.18*Math.sin(fxU*18)*(1-fxU);
      fx.scale.setScalar(scale);
      fx.traverse(o=>{if(o.material)o.material.opacity=alpha;});
      // The glow and shock ring swell past the flash; sparks fly out (they stay put with reduced motion) and fade.
      const fly=reduceMotion?.5:ease,inv=1/scale;
      fxGlow.scale.setScalar((.9+1.6*fly)*(.8+.25*peak)*inv);fxGlow.material.opacity=glowTexture?(1-fxU)**2*.9:0;
      fxShock.scale.setScalar((.3+1.4*fly)*(.8+.3*peak)*inv);fxShock.material.opacity=alpha*.8;
      const sparkAlpha=alpha*(fxFeel.flash==='burst'?1:.6);
      for(const m of fxSparks){const r=.35+1.1*fly*m.userData.speed;m.position.set(Math.cos(m.userData.a)*r,Math.sin(m.userData.a)*r,0);m.scale.set(1,1+1.5*(1-fxU),1);m.material.opacity=sparkAlpha;}
    }
  }
  const PITCH_TALL=43,PITCH_PORTRAIT=39;
  function resize(aspect){
    camera.aspect=aspect;camera.updateProjectionMatrix();
    // Lower than a top-down view so the ball's arc and both goals read at once.
    // Portrait screens look down more steeply so the long court fills the frame; framing is the tightest
    // distance that still keeps both goals, the rails and the defender's whole zone in view.
    // Portrait looks down at ~37°, wide screens at ~30°, blended by aspect. The behind-the-defender view
    // shows bodies and swings instead of head-tops; the frame is the tightest one that still keeps both
    // goals, the side walls at the defender's depth and both players' heads in view. Only resize moves it.
    // A longer lens (33°) and pitch chosen by a search over the same visibility rules: the largest court that keeps
    // the players at least as tall as before. Wide screens look down at 28° (players ~1.35× larger): at 26° a full-window
    // landscape canvas let the defender's head cover the keeper.
    // Portrait is width-bound on a near-square court, where a long lens drew the keeper as tall as the defender and the
    // court read as short. It uses a wider 46° lens from closer and lower (39°), lets the near corners behind the
    // defender leave the frame (the near goal mouth stays), and so shows real depth: keeper ~0.89× the defender's
    // height, ~7% more screen between them, the defender a little taller, and the empty floor below filled by court.
    const wide=Math.min(1,Math.max(0,(aspect-.9)/.7)),tall=aspect<1;
    camera.fov=baseFov=tall?46:33;camera.updateProjectionMatrix();
    const target=aim0.set(0,tall?.8:.4*(1-wide),tall?-5.5:-3.6),pitch=(tall?PITCH_PORTRAIT:PITCH_TALL-(PITCH_TALL-28)*wide)*Math.PI/180;
    const offset=new THREE.Vector3(0,Math.sin(pitch),Math.cos(pitch)).multiplyScalar(12);
    const boundary=[];
    for(const x of [-4.35,4.35])boundary.push(new THREE.Vector3(x,0,-10.65),new THREE.Vector3(x,1.3,-9.7));
    for(const x of tall?[-1.6,1.6]:[-3.95,3.95])boundary.push(new THREE.Vector3(x,0,tall?.9:1.15),new THREE.Vector3(x,1.15,0));
    // The side walls at the defender's depth may leave the frame (user choice, 2026-10-27: a closer camera, players about
    // 1.4x larger); the camera slides along with the defender instead (follow, in shake) so it never leaves the screen.
    boundary.push(new THREE.Vector3(0,2.3,-PLAYER_Z),new THREE.Vector3(0,2.3,-KEEPER_Z));
    // The keeper's toes must clear the back of the defender's head: on a wide screen a close camera would otherwise blow
    // the defender up over it.
    const ndcY=v=>v.clone().project(camera).y,head=new THREE.Vector3(0,2.3,-PLAYER_Z-.45),keeperFeet=new THREE.Vector3(0,0,-KEEPER_Z+.45);
    const fits=()=>{camera.position.copy(target).addScaledVector(offset,distance);camera.lookAt(target);camera.updateMatrixWorld(true);
      return boundary.every(v=>{const p=v.clone().project(camera);return Math.abs(p.x)<.97&&Math.abs(p.y)<.97;})
        &&ndcY(keeperFeet)>ndcY(head)+.03;};
    let distance=.3;while(!fits()&&distance<4)distance*=1.02;
    base.copy(camera.position);baseQuat.copy(camera.quaternion);
    // Screen layers sit 0.5 in front of the lens, sized to the new frustum.
    hudSize.h=2*.5*Math.tan(camera.fov*Math.PI/360);hudSize.w=hudSize.h*aspect;
    placeSign(aspect);
    for(const m of [vignette,lines,flash])m.scale.set(hudSize.w*1.02,hudSize.h*1.02,1);lines.scale.setScalar(Math.max(hudSize.w,hudSize.h)*1.25);
    banner.scale.set(hudSize.w*.82,hudSize.w*.82/4,1);banner.position.y=hudSize.h*.36;
  }
  // Camera shake is a pure render offset around the framed position.
  let baseFov=39;
  // Sideways follow of the defender: a share of its x, as a pure slide (no turn), set every update.
  let follow=0;const FOLLOW=.4;
  const base=new THREE.Vector3(),jolt=new THREE.Vector3(),baseQuat=new THREE.Quaternion(),aim0=new THREE.Vector3(),hudSize={w:1,h:1};
  // Camera = the framed shot, blended toward a side close-up during a burst, plus any shake. The normal frame
  // always comes from the latest resize, so a close-up never restores an old screen shape.
  function shake(amount=0){camera.position.copy(base);camera.quaternion.copy(baseQuat);camera.position.x+=follow;
    if(cine.w>0){const a=cine.side*cine.theta,ox=cine.side*3.4*cine.r,oz=2.4*cine.r,ca=Math.cos(a),sa=Math.sin(a);closePos.set(focus.x+ox*ca+oz*sa,focus.y+1.2*cine.r,focus.z-ox*sa+oz*ca);camera.position.lerp(closePos,cine.w);lookAt.copy(aim0).lerp(focus,cine.w);camera.lookAt(lookAt);}
    else if(goalCam.w>0){camera.position.lerp(chasePos,goalCam.w);lookAt.copy(aim0).lerp(chaseAim,goalCam.w);camera.lookAt(lookAt);}
    // Close-ups open the lens (burst 40°, goal shot 52°) for a closer, more dynamic frame; exactly the framed lens otherwise.
    const fov=baseFov+(40-baseFov)*cine.w+(52-baseFov)*goalCam.w;if(camera.fov!==fov){camera.fov=fov;camera.updateProjectionMatrix();}
   if(kick>0)camera.position.addScaledVector(camera.getWorldDirection(jolt),kick);
   if(amount>0)camera.position.add(jolt.set(Math.random()-.5,(Math.random()-.5)*.6,Math.random()-.5).multiplyScalar(amount));}
  function project(x,z,height=.73){camera.updateMatrixWorld(true);const p=new THREE.Vector3(x,height,-z).project(camera);return {x:(p.x+1)*.5,y:(1-p.y)*.5};}
  buildFarGoal(LEVELS[0].goalHalf);resize(.85);
  return {scene,camera,sun,hero,keeper,actors:{striker,goalie},punch:PUNCH,led:{get offset(){return ledOffset;}},confetti,cameraFollow:FOLLOW,farGoal,nearGoal:goal,ball,platform,gear,zone,aim,target,reachBar,fx,spinArc,burstEdges,chargeRing,burstFx,trail,wallFx,crowd,sign,cine,goalCam,goalCamPose:GC_POSE,update,project,resize,shake};
}

// Adaptive quality: sustained slow frames step the renderer down one tier at a time. It never steps back up within a
// session, so it cannot oscillate; single spikes and tab-switch gaps (>100 ms) are ignored.
export const QUALITY_TIERS=[{pixelRatio:1.6,shadowMap:1024},{pixelRatio:1.25,shadowMap:1024},{pixelRatio:1,shadowMap:512}];
export function createQualityGovernor({slowMs=22,holdMs=2000}={}){
  let ema=16.7,slow=0;
  return {tier:0,sample(ms){
    if(!(ms>0)||ms>100)return false;
    ema=ema*.9+ms*.1;if(ema<=slowMs){slow=0;return false;}
    slow+=ms;if(slow<holdMs||this.tier>=QUALITY_TIERS.length-1)return false;
    this.tier++;slow=0;ema=16.7;return true;
  }};
}
// Returns at once; `ready` settles when the characters are loaded and the world is built (nothing is drawn before).
// A failed load rejects `ready`, and the caller falls back to the 2D court. `player` picks the striker's figure (a
// figure that fails to load falls back to the default one); `player` on the renderer says which one is shown.
export function create3DRenderer(canvas,load=url=>new GLTFLoader().loadAsync(url),{player=DEFAULT_PLAYER}={}){
  // No preserveDrawingBuffer: tiled mobile GPUs would otherwise copy the whole frame every time.
  const context=canvas.getContext('webgl2',{antialias:true,alpha:false});
  if(!context)throw new Error('WebGL2 is unavailable');
  const renderer=new THREE.WebGLRenderer({canvas,context,antialias:true});
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
  const governor=createQualityGovernor();let world=null,width=0,height=0,size=null,last=0;
  function applyQuality(){
    const q=QUALITY_TIERS[governor.tier];renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,q.pixelRatio));
    const shadow=world.sun.shadow;if(shadow.mapSize.x!==q.shadowMap){shadow.mapSize.set(q.shadowMap,q.shadowMap);shadow.map?.dispose();shadow.map=null;}
    width=0;
  }
  // Each model file is fetched and parsed once; a figure change rebuilds the world around the cached rigs.
  const files=new Map(),cached=url=>{if(!files.has(url))files.set(url,load(url).catch(e=>{files.delete(url);throw e;}));return files.get(url);};
  let assets=null,worlds=0;
  // Everything a world put on the GPU: geometry, materials and their maps (except shared ones), skeletons (their bone textures) and the
  // lights' shadow maps.
  const disposeWorld=w=>w?.scene.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material]){if(!m.map?.userData.shared)m.map?.dispose();m.dispose();}}
    if(o.isSkinnedMesh)o.skeleton.dispose();if(o.isLight&&o.shadow?.map){o.shadow.map.dispose();o.shadow.map=null;}});
  const ready=loadCharacterAssets(cached,{player}).then(a=>{assets=a;world=buildWorld(assets);worlds++;applyQuality();});
  // Shows another figure (the lobby's pick). Resolves to the figure actually shown: a file that fails keeps the
  // current one. Changes arriving while one is loading are applied in order; the last one wins.
  let queue=Promise.resolve();
  function setPlayer(id){
    queue=queue.then(()=>ready).then(async()=>{
      const spec=playerSpec(id);if(spec.id===assets.player)return assets.player;
      let striker;try{striker=await cached(spec.file);}catch{return assets.player;}
      const next={...assets,striker,player:spec.id},old=world;
      world=buildWorld(next);worlds++;assets=next;disposeWorld(old);applyQuality();return assets.player;
    });
    return queue;
  }
  // The canvas size is read only when it changes (ResizeObserver), not every frame, so rendering never forces layout.
  const measure=()=>{const r=canvas.getBoundingClientRect();size=[r.width,r.height];};
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(measure):null;observer?.observe(canvas);
  return {
    ready,setPlayer,
    get player(){return assets?.player??null;},
    get info(){return renderer.info;},
    get worlds(){return worlds;},
    get quality(){return governor.tier;},
    render(state,axis,reduceMotion,shake=0){
      if(!world)return;if(!observer||!size)measure();const [w,h]=size;if(!w||!h)return;
      const now=performance.now();if(last&&governor.sample(now-last))applyQuality();last=now;
      if(w!==width||h!==height){width=w;height=h;renderer.setSize(width,height,false);world.resize(width/height);}
      world.update(state,axis,reduceMotion,now/1000);world.shake(reduceMotion?0:shake);renderer.render(world.scene,world.camera);
    },
    dispose(){observer?.disconnect();disposeWorld(world);renderer.dispose();}
  };
}
