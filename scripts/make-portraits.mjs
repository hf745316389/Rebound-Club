// Renders the lobby's figure portraits (dist/portraits/<id>.png, 256×256) from the packed models with the game's own
// actor code, so kit colours, gloves and hats match the court. Needs the dev server (npm start) on port 4173.
// Re-run after changing a figure in dist/characters.mjs or re-packing the models:  node scripts/make-portraits.mjs
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire('C:/Users/HUFAN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/qa.cjs');
const {chromium}=require('playwright');
const browser=await chromium.launch({executablePath:'C:/Users/HUFAN/AppData/Local/Google/Chrome/Application/chrome.exe',headless:true});
const page=await browser.newPage({viewport:{width:256,height:256}});
page.on('pageerror',e=>{throw e;});
// A blank same-origin page: the lobby's game loop would keep drawing into a replaced body.
await page.route('http://localhost:4173/__portraits',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><body></body>'}));
await page.goto('http://localhost:4173/__portraits');
const shots=await page.evaluate(async()=>{
  document.body.innerHTML='<canvas id="shot" width="256" height="256"></canvas>';
  const THREE=await import('/vendor/three.module.min.js'),{GLTFLoader}=await import('/vendor/GLTFLoader.js');
  const {createActor}=await import('/actor.mjs'),{PLAYERS,playerSpec}=await import('/characters.mjs');
  const renderer=new THREE.WebGLRenderer({canvas:document.getElementById('shot'),antialias:true,alpha:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(1);renderer.setSize(256,256,false);renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;renderer.setClearColor(0,0);
  const out={};
  for(const p of PLAYERS){
    const spec=playerSpec(p.id),scene=new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#9fb4ff','#2a2140',1.15));const key=new THREE.DirectionalLight('#fff2dc',3);key.position.set(-2,5,6);scene.add(key);
    const actor=createActor(await new GLTFLoader().loadAsync('/'+spec.file),spec,'striker');
    // Facing the camera (the actor faces -z), a little turned, in its idle stance.
    actor.root.rotation.y=Math.PI-.35;actor.pose([['idle',.3,1,true]]);scene.add(actor.root);
    // Head and shoulders, the tallest hat included: the same frame around the head bone for every figure.
    const head=actor.bones.head.getWorldPosition(new THREE.Vector3()),aim=head.y+.38,camera=new THREE.PerspectiveCamera(26,1,.1,50);
    camera.position.set(0,aim+.1,2.2/2/Math.tan(13*Math.PI/180));camera.lookAt(0,aim,0);
    renderer.render(scene,camera);out[p.id]=renderer.domElement.toDataURL('image/png');
  }
  return out;
});
await mkdir(new URL('../dist/portraits/',import.meta.url),{recursive:true});
const report=[];
for(const [id,url] of Object.entries(shots)){
  const buf=Buffer.from(url.split(',')[1],'base64');await writeFile(new URL(`../dist/portraits/${id}.png`,import.meta.url),buf);
  report.push({id,kb:Math.round(buf.length/1024)});
}
console.log(JSON.stringify(report));
await browser.close();
