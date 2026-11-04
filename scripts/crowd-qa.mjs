import {chromium,CHROME} from './qa-env.mjs';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:CHROME,headless:true});
const errors=[];await mkdir('artifacts/crowd',{recursive:true});
try{
 const p=await browser.newPage({viewport:{width:1200,height:700}});p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/game.js',r=>r.fulfill({status:200,contentType:'text/javascript',body:''}));await p.goto('http://localhost:4173');
 await p.evaluate(async()=>{
  const T=await import('/vendor/three.module.min.js'),{buildSpectatorCrowd}=await import('/crowd.mjs');
  document.body.removeAttribute('data-screen');document.body.style.margin='0';document.body.innerHTML='<div style="position:absolute;left:42px;top:28px;color:#285543;font-family:Arial,Microsoft YaHei"><small style="letter-spacing:3px">REBOUND CLUB · SPECTATORS</small><h1 style="font-size:26px;margin:12px 0">潮玩观众 · 三种造型</h1><p style="font-size:12px;opacity:.65">实际3D模型 · 休息与进球欢呼</p></div><canvas id="crowd-preview"></canvas>';
  const renderer=new T.WebGLRenderer({canvas:document.getElementById('crowd-preview'),antialias:true});renderer.setSize(1200,700);renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
  const scene=new T.Scene();scene.background=new T.Color('#f4f1e8');scene.add(new T.HemisphereLight('#fff5df','#80927c',2));
  const sun=new T.DirectionalLight('#fff0db',2.4);sun.position.set(-3,8,6);scene.add(sun);
  const seats=Array.from({length:6},(_,i)=>({x:(i-2.5)*.85,y:.1,z:0,phase:i*1.23,lift:.28}));
  const crowd=buildSpectatorCrowd(seats);scene.add(crowd.group);
  const bench=new T.Mesh(new T.BoxGeometry(5.25,.10,.58),new T.MeshStandardMaterial({color:'#c4cdb4',roughness:.9}));bench.position.set(0,.15,-.06);scene.add(bench);
  const floor=new T.Mesh(new T.PlaneGeometry(200,200),new T.MeshStandardMaterial({color:'#f4f1e8',roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.10;scene.add(floor);
  const camera=new T.PerspectiveCamera(32,1200/700,.1,100);camera.position.set(.15,2.15,6);camera.lookAt(0,.52,0);
  window.__crowdPreview={renderer,scene,camera,crowd};renderer.render(scene,camera);
 });
 await p.screenshot({path:'artifacts/crowd/spectators-rest.png'});
 await p.evaluate(()=>{const a=window.__crowdPreview;a.crowd.update(.34,0,false);document.querySelector('h1').textContent='进球欢呼 · 鼓掌与挥手';a.renderer.render(a.scene,a.camera);});
 await p.screenshot({path:'artifacts/crowd/spectators-cheer.png'});
 if(errors.length)throw Error(errors.join(';'));console.log(JSON.stringify({rest:true,cheer:true,errors}));
}finally{await browser.close();}

