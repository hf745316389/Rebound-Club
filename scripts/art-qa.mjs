// Character close-ups from the real assets (node scripts/art-qa.mjs, needs the local server on :4173): the striker idle
// and at its measured punch contact, the keeper idle and mid-dive, lit like the night arena. Writes
// artifacts/character-sheet.png (git-ignored); nothing is added to the game for it (game.js is blanked in the test browser).
import {chromium,CHROME} from './qa-env.mjs';import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:CHROME,headless:true});
const page=await browser.newPage({viewport:{width:1200,height:760}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  await mkdir('artifacts',{recursive:true});
  await page.route('**/game.js',route=>route.fulfill({status:200,contentType:'text/javascript',body:''}));
  await page.goto('http://localhost:4173');
  const result=await page.evaluate(async()=>{
    const T=await import('/vendor/three.module.min.js'),{GLTFLoader}=await import('/vendor/GLTFLoader.js'),A=await import('/actor.mjs'),{CHARACTERS}=await import('/characters.mjs');
    const labels=['01 / 主角待机','02 / 主角出拳（实测击球帧）','03 / 门将待机','04 / 门将飞扑'];
    document.body.innerHTML=`<div style="width:1200px;height:760px;background:#0b1022;position:relative;font-family:system-ui,'Microsoft YaHei',sans-serif;color:#f4f1ea">
      <div style="position:absolute;left:48px;top:34px;z-index:2"><div style="font-size:11px;letter-spacing:3px;color:#9aa6c9">REBOUND CLUB · CHARACTER SHEET</div>
      <h1 style="margin:10px 0 4px;font-size:28px;font-style:italic;font-weight:900">卡通动感竞技风 · 角色近景</h1><p style="margin:0;font-size:12px;color:#9aa6c9">实际游戏模型（占位：KayKit CC0）· 卡通着色 + 描边 + 轮廓光</p></div>
      <canvas id="art-view" style="position:absolute;inset:0;width:1200px;height:760px"></canvas>
      ${labels.map((t,i)=>`<span style="position:absolute;bottom:40px;left:${80+i*280}px;width:240px;text-align:center;font-size:13px;color:#cfd6ef">${t}</span>`).join('')}</div>`;
    const canvas=document.getElementById('art-view'),renderer=new T.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});renderer.setSize(1200,760,false);renderer.setPixelRatio(1);
    renderer.shadowMap.enabled=true;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
    const scene=new T.Scene();scene.background=new T.Color('#0b1022');scene.add(new T.HemisphereLight('#9fb4ff','#2a2140',1.15));
    const key=new T.DirectionalLight('#fff2dc',3);key.position.set(-3,8,6);key.castShadow=true;key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-7,right:7,top:5,bottom:-3});scene.add(key);
    const rim=new T.DirectionalLight('#7fb6ff',1.4);rim.position.set(2,5,-8);scene.add(rim);
    const assets=await A.loadCharacterAssets(url=>new GLTFLoader().loadAsync(url));
    const slot=i=>(i-1.5)*2.8;
    for(let i=0;i<4;i++){const stand=new T.Mesh(new T.CylinderGeometry(.9,.95,.12,48),new T.MeshStandardMaterial({color:'#1a2147',roughness:.9}));stand.position.set(slot(i),-.06,0);stand.receiveShadow=true;scene.add(stand);}
    const place=(a,i,turn)=>{a.root.position.set(slot(i),0,0);a.root.rotation.y=turn;scene.add(a.root);};
    const idle=A.createActor(assets.striker,CHARACTERS.striker,'striker');place(idle,0,Math.PI+.35);idle.pose([['idle',.3,1,true]]);
    const punch=A.createActor(assets.striker,CHARACTERS.striker,'striker');place(punch,1,Math.PI+.9);const c=punch.measureReach('punchRight');punch.pose([['punchRight',c.t,1]]);
    const keep=A.createActor(assets.keeper,CHARACTERS.keeper,'keeper');place(keep,2,Math.PI-.35);keep.pose([['idle',.3,1,true]]);keep.crouch(.07);keep.lean('spine',.16);
    const dive=A.createActor(assets.keeper,CHARACTERS.keeper,'keeper');place(dive,3,Math.PI);dive.root.rotation.z=1.1;dive.root.position.set(slot(3)-1.1,.45,0);
    dive.pose([['diveRight',.28,1]],{lockHips:true});const at=new T.Vector3(slot(3)+3,.9,.3);dive.aimArm('L',at,1);dive.aimArm('R',at,1);
    const low=dive.lowestPoint();if(low<0)dive.root.position.y-=low;
    const camera=new T.PerspectiveCamera(30,1200/760,.1,100);camera.position.set(0,3,12.5);camera.lookAt(0,1,0);renderer.render(scene,camera);
    return {preview:'actual 3D assets',webgl:!!renderer.getContext(),punchContact:+c.t.toFixed(3)};
  });
  await page.screenshot({path:'artifacts/character-sheet.png'});
  if(errors.length)throw Error(errors.join(';'));console.log(JSON.stringify({...result,errors}));
}finally{await browser.close();}
