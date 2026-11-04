// Release package QA: node scripts/release-qa.mjs release/<name>
// Serves <name>/site at a sub-path on rebound.localhost (not plain localhost, so the page registers its service worker;
// Chrome always maps *.localhost to loopback as a secure context, while 127.0.0.2 is unreachable on macOS and some
// Windows setups) and checks:
// install manifest + icons, the offline cache holding the whole release, and a full start while offline.
import {chromium,CHROME} from './qa-env.mjs';import assert from 'node:assert/strict';import http from 'node:http';import {readFile} from 'node:fs/promises';import path from 'node:path';
const dir=path.resolve(process.argv[2]||'.'),site=path.join(dir,'site'),BASE='/games/rebound/',PORT=4195;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.json':'application/json','.webmanifest':'application/manifest+json'};
const server=http.createServer(async(req,res)=>{try{let p=decodeURIComponent(new URL(req.url,'http://x').pathname);if(!p.startsWith(BASE)){res.writeHead(404).end();return;}p=p.slice(BASE.length)||'index.html';if(p.endsWith('/'))p+='index.html';
  const file=path.resolve(site,p);if(!file.startsWith(site)){res.writeHead(403).end();return;}const body=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'}).end(body);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(PORT,'127.0.0.1',r));
const URL_=`http://rebound.localhost:${PORT}${BASE}`,version=JSON.parse(await readFile(path.join(site,'version.json'),'utf8')).name;
const b=await chromium.launch({executablePath:CHROME,headless:true});
const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),p=await ctx.newPage(),errors=[];
p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const R={};
try{
  await p.goto(URL_);await p.waitForFunction(()=>document.body.dataset.booted==='1');
  await p.evaluate(()=>navigator.serviceWorker.ready);await p.reload();await p.waitForFunction(()=>document.body.dataset.booted==='1');
  R.controlled=await p.evaluate(()=>!!navigator.serviceWorker.controller);
  const sw=await readFile(path.join(site,'sw.js'),'utf8'),files=JSON.parse(sw.match(/FILES=(\[.*?\]);/)[1]);
  R.cache=await p.evaluate(async v=>{const keys=await caches.keys(),c=await caches.open(v);return {keys,entries:(await c.keys()).length};},version);
  R.files=files.length;
  const manifest=await p.evaluate(async()=>{const href=document.querySelector('link[rel=manifest]').href,m=await (await fetch(href)).json();
    const icons=[];for(const i of m.icons){const r=await fetch(new URL(i.src,href));icons.push({src:i.src,ok:r.ok,type:r.headers.get('content-type'),purpose:i.purpose||'any'});}return {name:m.name,start:new URL(m.start_url,href).pathname,display:m.display,icons};});
  R.manifest=manifest;
  await ctx.setOffline(true);await p.reload();await p.waitForFunction(()=>document.body.dataset.booted==='1',null,{timeout:10000});
  await p.evaluate(()=>document.getElementById('start-match').click());await p.waitForTimeout(800);
  R.offline={screen:await p.evaluate(()=>document.body.dataset.screen),renderer:await p.evaluate(()=>document.getElementById('court').dataset.renderer)};
}finally{await b.close();server.close();}
console.log(JSON.stringify(R));
assert.ok(R.controlled,'离线缓存接管页面');
assert.ok(R.cache.keys.includes(version)&&R.cache.entries===R.files,`缓存整套文件 ${R.cache.entries}/${R.files}`);
assert.equal(R.manifest.start,BASE,'子路径下的启动地址');assert.equal(R.manifest.display,'standalone');
assert.ok(R.manifest.icons.length>=3&&R.manifest.icons.every(i=>i.ok&&i.type==='image/png')&&R.manifest.icons.some(i=>i.purpose==='maskable'),'图标');
assert.ok(['match','ready'].includes(R.offline.screen)&&R.offline.renderer,'断网后仍能进入比赛');assert.equal(R.offline.screen,'match');
assert.deepEqual(errors,[]);console.log('PASS');
