// Online link QA in a real browser (node scripts/online-qa.mjs, needs the local server on :4173, whose /api/ws is the
// rooms' stand-in). Two pages, each in its own browser context, meet in a room through dist/duel-link.mjs:
// 1. The host opens a room and the guest joins by its code; both reach a direct WebRTC channel (its candidate types and
//    the time it took are reported).
// 2. 200 messages each way arrive in order, once.
// 3. The host's direct channel goes dead: both fall back to the room's relay (times reported), and the 150 messages each
//    side sent across the fall arrive in order, once.
// 4. Duels over fresh links, catch-up and full flight: a bot plays in each page (createClient) until the first goal, and
//    both pages end with the same score.
// 5. The duel page's 好友联机, an arena room: the host (phone, portrait) opens a room, the guest (desktop) types its code
//    in lower case; both are called to the court and both say ready; the host's Esc pauses both (the guest sees why) and
//    the guest's 继续 resumes both after the hold. A third page on the invite link is queued and watches the match from
//    the next serve, without the controls, and can turn the view round. Nobody swings, so the match runs to 5: the
//    watcher's replay ends on the players' score, the footer tells direct and ping, the loser goes to the back of the
//    queue and the one queued comes on; when the winner's page goes away mid-match, the other player sees why.
// 6. In a fresh room of two, one player's page is loaded again mid-match: it gives the match up at once, the other's
//    result screen says why, and the one who left is called back for the next match. Then the winner back on the room's
//    panel before the loser's last goal has reached the room (both feeds held 3 s) is still the winner. No page errors
//    throughout.
import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const require=createRequire('C:/Users/HUFAN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/qa.cjs');
const {chromium}=require('playwright');
const b=await chromium.launch({executablePath:'C:/Users/HUFAN/AppData/Local/Google/Chrome/Application/chrome.exe',headless:true});
const errors=[],results={};
async function open(){
  const p=await (await b.newContext()).newPage();
  p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await p.goto('http://localhost:4173/duel.html');
  await p.evaluate(async()=>{
    window.L=await import('./duel-link.mjs');window.N=await import('./duel-net.mjs');window.B=await import('./duel-bot.mjs');
    // A link that keeps what it hears and when its mode changed.
    window.connect=async join=>{window.got=[];window.modes=[];window.link=L.createLink({join});
      link.onMessage(m=>got.push(m));link.onEvent(e=>{if(e.type==='mode')modes.push({mode:e.mode,at:performance.now()});});return link.ready;};
  });
  return p;
}
const both=fn=>Promise.all([host,guest].map(fn));
const host=await open(),guest=await open();
async function meet(){
  const {code}=await host.evaluate(()=>connect({create:true}));await guest.evaluate(code=>connect({code}),code);
  const t0=Date.now();await both(p=>p.waitForFunction(()=>link.mode==='direct',null,{timeout:20000}));return (Date.now()-t0)/1000;
}

// 1–2. Direct, and in order.
const seconds=await meet();
results.direct={seconds,host:await host.evaluate(()=>link.stats()),guest:await guest.evaluate(()=>link.stats())};
await both(p=>p.evaluate(()=>{for(let i=0;i<200;i++)link.send({i});}));
await both(p=>p.waitForFunction(()=>got.length>=200,null,{timeout:10000}));
for(const p of [host,guest])assert.deepEqual(await p.evaluate(()=>got.map(m=>m.i)),[...Array(200).keys()],'直连按序');

// 3. The fall: the host's channel stops dead while both keep sending, 30 a second for 5 s.
await both(p=>p.evaluate(()=>{got.length=0;}));
const mutedAt=await host.evaluate(()=>{link.debug.muteDirect();return performance.now();});
await both(p=>p.evaluate(()=>new Promise(r=>{let i=0;const id=setInterval(()=>{link.send({k:i++});if(i===150){clearInterval(id);r();}},33);})));
await both(p=>p.waitForFunction(()=>link.mode==='relay'&&got.length>=150,null,{timeout:10000}));
for(const p of [host,guest])assert.deepEqual(await p.evaluate(()=>got.map(m=>m.k)),[...Array(150).keys()],'切换前后按序、不缺不重');
const fell=async p=>p.evaluate(t=>{const m=modes.findLast(x=>x.mode==='relay');return m?+(((m.at-t)/1000).toFixed(2)):null;},mutedAt);
results.fall={hostToRelay:await fell(host),guestToRelay:await fell(guest)};
assert.ok(results.fall.hostToRelay<=4&&results.fall.guestToRelay<=4,JSON.stringify(results.fall));
await both(p=>p.evaluate(()=>link.close()));

// 4. Duels: one bot per page, playing its own copy, until the first goal.
for(const sync of ['catchup','fullflight']){
  await meet();
  await both(p=>p.evaluate(sync=>{
    const side=link.role==='host'?'a':'b',now=()=>performance.now()/1000,bot=B.createBot({seed:side==='a'?5:6});
    window.c=N.createClient({side,transport:link,now,sync});let last=now();c.start();window.stop=false;
    const tick=()=>{const t=now(),dt=Math.min(.05,t-last);last=t;const d=bot.decide(c.view(),dt);c.step(dt,{axis:d.axis,swing:d.swing,skill:d.skill});c.state.events=[];
      if(!stop)requestAnimationFrame(tick);};
    requestAnimationFrame(tick);
  },sync));
  await both(p=>p.waitForFunction(()=>c.state.score.a+c.state.score.b>0,null,{timeout:60000}));
  await new Promise(r=>setTimeout(r,500));
  const scores=await Promise.all([host,guest].map(p=>p.evaluate(()=>{stop=true;return {...c.state.score};})));
  assert.deepEqual(scores[0],scores[1],`${sync} 两边比分`);
  results[sync]={score:scores[0],mode:await host.evaluate(()=>link.mode),rtt:await host.evaluate(()=>c.clock.rtt)};
  await both(p=>p.evaluate(()=>link.close()));
}
// 5. The page itself.
async function page(viewport){
  const ctx=await b.newContext({viewport}),p=await ctx.newPage();
  p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await p.route('**/duel.js',async r=>{const x=await r.fetch();await r.fulfill({response:x,body:(await x.text())+'\nwindow.__qa={match:()=>match,room:()=>room};'});});
  return p;
}
const said=(p,re,ms=10000)=>p.waitForFunction(re=>new RegExp(re).test(document.getElementById('online-status').textContent),re.source,{timeout:ms});
const H=await page({width:390,height:844}),G=await page({width:1280,height:800});
for(const p of [H,G]){await p.goto('http://localhost:4173/duel.html');await p.waitForFunction(()=>document.body.dataset.booted==='1',null,{timeout:30000});await p.getByRole('radio',{name:'好友联机'}).click();}
await H.fill('#online-name','房主');await H.getByRole('button',{name:'创建房间',exact:true}).click();
await H.waitForFunction(()=>/^[2-9A-Z]{5}$/.test(document.getElementById('room-code').textContent),null,{timeout:10000});
const roomCode=await H.locator('#room-code').textContent();await said(H,/等对手进房/);
await G.fill('#online-name','访客');await G.fill('#join-code',roomCode.toLowerCase());await G.getByRole('button',{name:'加入',exact:true}).click();
for(const p of [H,G])await said(p,/轮到你上场/);
assert.equal(await G.locator('#sync-group').isHidden(),true,'只有房主选同步方式');assert.equal(await G.locator('#rotation-group').isHidden(),true,'只有房主选轮换');
assert.equal(await H.locator('#rotation-group').isHidden(),false);
assert.deepEqual(await H.locator('#room-members li').allInnerTexts().then(t=>t.map(x=>x.replace(/\s+/g,' '))),['房主（我） 房主 · 场上 · 甲方','访客 场上 · 乙方']);
assert.equal(await G.locator('#start-match').isDisabled(),false,'两人都能点准备');
await H.screenshot({path:'artifacts/duel/online-room-390x844.png',fullPage:true});await G.screenshot({path:'artifacts/duel/online-guest-1280x800.png'});
await H.locator('#start-match').click();await said(H,/已准备/);await G.locator('#start-match').click();
for(const p of [H,G])await p.waitForFunction(()=>__qa.match()?.mode==='online'&&__qa.match().state.phase!=='ready',null,{timeout:15000});
assert.deepEqual([await H.evaluate(()=>__qa.match().me),await G.evaluate(()=>__qa.match().me)],['a','b']);
await H.waitForFunction(()=>__qa.match().state.phase==='playing',null,{timeout:10000});await H.keyboard.press('Escape');
await G.waitForFunction(()=>__qa.match().state.phase==='paused'&&/对方暂停了/.test(document.getElementById('overlay-content').textContent),null,{timeout:5000});
const t0=Date.now();await G.getByRole('button',{name:'继续对战'}).click();
for(const p of [H,G])await p.waitForFunction(()=>__qa.match().state.phase!=='paused',null,{timeout:5000});
const held=(Date.now()-t0)/1000;assert.ok(held>=.7,`继续前先等 ${held} 秒`);
// A third, by the invite link: queued, and watching the match a second behind, from the next serve on.
const W=await page({width:390,height:844});await W.goto(H.url());await W.waitForFunction(()=>document.body.dataset.booted==='1',null,{timeout:30000});
await said(W,/排队中，第 1 位 · 场上：房主 对 访客/);
await W.waitForFunction(()=>__qa.match()?.mode==='watch'&&__qa.match().watcher.live,null,{timeout:30000});
assert.equal(await W.locator('#watch-bar').isVisible(),true);assert.equal(await W.locator('#attack').isVisible(),false,'观战时没有挥击按钮');
await W.waitForFunction(()=>__qa.match().state.phase==='playing',null,{timeout:15000});await W.screenshot({path:'artifacts/duel/online-watch-390x844.png'});
await W.getByRole('button',{name:'换个方向看'}).click();assert.equal(await W.evaluate(()=>__qa.match().view),'b');
assert.match(await W.locator('#score').textContent(),/观战中/);
// Nobody swings, so every serve scores: the match runs to 5, and the watcher's replay ends on the same score.
for(const p of [H,G])await p.waitForFunction(()=>__qa.match()?.state.phase==='won',null,{timeout:120000});
await W.waitForFunction(()=>__qa.match()?.state.phase==='won',null,{timeout:10000});
const scores=await Promise.all([H,G,W].map(p=>p.evaluate(()=>__qa.match().state.score)));
assert.deepEqual(scores[0],scores[1],'两人比分');assert.deepEqual(scores[2],scores[0],'观众回放的比分');
const footer=await G.locator('#score').textContent();assert.match(footer,/直连 · ping \d+/);
// The loser to the back of the queue, the one queued on against the winner.
const won=scores[0].a>scores[0].b?{p:H,name:'房主'}:{p:G,name:'访客'},lost=won.p===H?{p:G,name:'访客'}:{p:H,name:'房主'};
await W.waitForFunction(()=>/准备下一局/.test(document.getElementById('overlay-content').textContent),null,{timeout:8000});
await lost.p.waitForFunction(()=>/你排在第 1 位/.test(document.getElementById('overlay-content').textContent),null,{timeout:8000});
await W.screenshot({path:'artifacts/duel/online-watch-result-390x844.png'});
await W.getByRole('button',{name:'准备下一局'}).click();await won.p.getByRole('button',{name:'准备下一局'}).click();
for(const p of [W,won.p])await p.waitForFunction(()=>__qa.match()?.mode==='online'&&__qa.match().state.phase!=='ready',null,{timeout:15000});
// The loser, its result screen still up, is moved on to watching the next match as it starts.
await lost.p.waitForFunction(()=>__qa.match()?.mode==='watch'&&__qa.match().n===2,null,{timeout:15000});
// The winner's page goes away mid-match: the one it played sees why play stopped.
await won.p.context().close();
await W.waitForFunction(()=>/对方断开了/.test(document.getElementById('overlay-content').textContent),null,{timeout:15000});
await W.screenshot({path:'artifacts/duel/online-gone-390x844.png'});
results.page={code:roomCode,held,scores,footer};
// 6. A reload mid-match, then a winner back on the panel early.
const A=await page({width:390,height:844}),B=await page({width:1280,height:800});
const booted=p=>p.waitForFunction(()=>document.body.dataset.booted==='1',null,{timeout:30000});
for(const p of [A,B]){await p.goto('http://localhost:4173/duel.html');await booted(p);await p.getByRole('radio',{name:'好友联机'}).click();}
await A.fill('#online-name','阿杰');await A.getByRole('button',{name:'创建房间',exact:true}).click();
await A.waitForFunction(()=>/^[2-9A-Z]{5}$/.test(document.getElementById('room-code').textContent),null,{timeout:10000});
await B.fill('#online-name','小美');await B.fill('#join-code',await A.locator('#room-code').textContent());await B.getByRole('button',{name:'加入',exact:true}).click();
for(const p of [A,B])await said(p,/轮到你上场/);
for(const p of [A,B])await p.locator('#start-match').click();
for(const p of [A,B])await p.waitForFunction(()=>__qa.match()?.mode==='online'&&__qa.match().state.phase==='playing',null,{timeout:15000});
const reloadAt=Date.now();await B.reload();
await A.waitForFunction(()=>__qa.match()?.state.phase==='won'&&/对方离开了对局，判你赢/.test(document.getElementById('overlay-content').textContent),null,{timeout:15000});
const told=(Date.now()-reloadAt)/1000;assert.ok(told<10,`对手 ${told} 秒后才收到结果`);
await said(B,/^你离开了对局，这一局判负。轮到你上场/);
const room1=await A.evaluate(()=>{const r=__qa.room(),l=r.snap.last;return {how:l.how,winnerIsMe:l.winner===r.info.member,n:r.snap.match.n,phase:r.snap.match.phase};});
assert.deepEqual(room1,{how:'left',winnerIsMe:true,n:2,phase:'ready'});
await A.screenshot({path:'artifacts/duel/online-left-result-390x844.png'});await B.screenshot({path:'artifacts/duel/online-left-room-1280x800.png'});
// Match 2 to match point; from there every feed pack (the loser's last goal goes in one) waits 3 s on its way to the room.
await booted(B);await A.getByRole('button',{name:'准备下一局'}).click();await B.locator('#start-match').click();
for(const p of [A,B])await p.waitForFunction(()=>__qa.match()?.mode==='online'&&__qa.match().n===2&&__qa.match().state.phase==='playing',null,{timeout:15000});
await A.waitForFunction(()=>Math.max(__qa.match().state.score.a,__qa.match().state.score.b)>=4,null,{timeout:120000});
for(const p of [A,B])await p.evaluate(()=>{const send=WebSocket.prototype.send;WebSocket.prototype.send=function(d){if(typeof d==='string'&&d.startsWith('{"type":"feed"')){setTimeout(()=>send.call(this,d),3000);return;}return send.call(this,d);};});
await A.waitForFunction(()=>__qa.match().state.phase==='won',null,{timeout:120000});
const winner=await A.evaluate(()=>__qa.match().state.winner===__qa.match().me)?A:B;
await winner.waitForFunction(()=>__qa.match()?.state.phase==='won',null,{timeout:10000});
assert.equal(await winner.evaluate(()=>__qa.room().snap.match.phase),'playing','房间还没收到最后一球');
await winner.getByRole('button',{name:'返回房间'}).click();
await winner.waitForFunction(()=>__qa.room().snap.last?.n===2,null,{timeout:10000});
const room2=await winner.evaluate(()=>{const r=__qa.room(),l=r.snap.last;return {how:l.how,winnerIsMe:l.winner===r.info.member};});
assert.deepEqual(room2,{how:'score',winnerIsMe:true},'早回面板的赢家照样是赢家');
results.left={told,room1,room2};
assert.deepEqual(errors,[]);
console.log(JSON.stringify(results,null,1));console.log('PASS');
await b.close();
