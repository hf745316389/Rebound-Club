import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoopback,createClient,createWatcher} from '../dist/duel-net.mjs';
import {createBot} from '../dist/duel-bot.mjs';
import {COURT,localBall} from '../dist/duel-core.mjs';

const DT=1/120,HITS=['hit','perfect','soft','spin','burst'];
// Two clients on one virtual clock over a loopback, each played by a bot from its own client's view.
// onBefore runs ahead of each step's clients, onStep after them. skew: B's clock runs that many seconds ahead of A's (two
// devices' clocks never agree), and what reaches B is stamped on it.
function match({delayMs=150,jitterMs=30,seed=1,cap=120*600,sync,skew=0,onBefore,onStep}={}){
  let T=0;const now=()=>T,loop=createLoopback({delayMs,jitterMs,seed,now});
  const toB=skew?{send:m=>loop[1].send(m),onMessage:fn=>loop[1].onMessage((m,at)=>fn(m,at+skew)),close(){}}:loop[1];
  const clients={a:createClient({side:'a',transport:loop[0],now,sync}),b:createClient({side:'b',transport:toB,now:()=>T+skew,sync})};
  const bots={a:createBot({seed:seed*2+1}),b:createBot({seed:seed*2+2})},goals={a:[],b:[]};
  for(const c of Object.values(clients))c.start();
  for(let f=0;f<cap&&!(clients.a.state.phase==='won'&&clients.b.state.phase==='won');f++){
    T+=DT;loop.flush();onBefore?.(clients,loop,f);
    for(const side of ['a','b']){const c=clients[side],d=bots[side].decide(c.view(),DT);c.step(DT,{axis:d.axis,swing:d.swing,skill:d.skill});
      for(const e of c.state.events)if(e.type==='goal')goals[side].push(e.side);}
    onStep?.(clients,loop,f);
    // Read once, like the page does: a finished match no longer steps, so its last events would otherwise linger.
    for(const c of Object.values(clients))c.state.events=[];
  }
  return {clients,goals};
}

test('回环 150±30 毫秒、双方都是机器人打 20 局：两边每局比分、胜者完全一致，每个进球两边各出现一次', ()=>{
  for(let m=0;m<20;m++){
    const {clients:{a,b},goals}=match({seed:m+1});
    assert.equal(a.state.phase,'won',`第 ${m+1} 局 A 端未结束`);assert.equal(b.state.phase,'won',`第 ${m+1} 局 B 端未结束`);
    assert.deepEqual(a.state.score,b.state.score,`第 ${m+1} 局比分`);assert.equal(a.state.winner,b.state.winner);
    const total=a.state.score.a+a.state.score.b;
    assert.equal(goals.a.length,total,`第 ${m+1} 局 A 端进球事件`);assert.equal(goals.b.length,total,`第 ${m+1} 局 B 端进球事件`);
    assert.deepEqual(goals.a,goals.b,`第 ${m+1} 局进球顺序`);
  }
});

test('收到击球消息追帧后，接收方的球与发送方同一时刻的球相差不超过 0.05 米（从第 3 条起）', ()=>{
  let worst=0,checked=0;const seen={a:0,b:0};
  for(let m=0;m<4;m++)match({seed:100+m,cap:120*120,onStep:(c)=>{
    for(const side of ['a','b']){const me=c[side].state,them=c[side==='a'?'b':'a'].state;
      for(const e of me.events)if(HITS.includes(e.type)&&e.side!==side&&++seen[side]>=3){
        const d=Math.hypot(me.ball.x-them.ball.x,me.ball.z-them.ball.z);worst=Math.max(worst,d);checked++;}}
  }});
  assert.ok(checked>=50,`只比对了 ${checked} 次`);assert.ok(worst<=.05,`最大偏差 ${worst.toFixed(4)} 米`);
});

test('两台设备的时钟不一样（乙方快 5 秒、慢 5 秒、快 30 秒）：时钟差估得出来，接收方的球照样和发送方同一时刻的球对得上', ()=>{
  for(const skew of [5,-5,30]){
    let worst=0,checked=0;const seen={a:0,b:0};
    const {clients}=match({seed:200,skew,cap:120*120,onStep:(c)=>{
      for(const side of ['a','b']){const me=c[side].state,them=c[side==='a'?'b':'a'].state;
        for(const e of me.events)if(HITS.includes(e.type)&&e.side!==side&&++seen[side]>=3){
          const d=Math.hypot(me.ball.x-them.ball.x,me.ball.z-them.ball.z);worst=Math.max(worst,d);checked++;}}
    }});
    // offset is the other clock minus this one.
    assert.ok(Math.abs(clients.a.clock.offset-skew)<.01,`差 ${skew} 秒：A 估的 ${clients.a.clock.offset}`);
    assert.ok(Math.abs(clients.b.clock.offset+skew)<.01,`差 ${skew} 秒：B 估的 ${clients.b.clock.offset}`);
    assert.ok(checked>=50,`差 ${skew} 秒：只比对了 ${checked} 次`);assert.ok(worst<=.05,`差 ${skew} 秒：最大偏差 ${worst.toFixed(4)} 米`);
  }
});

// Watching (arena rooms): two bots play over a loopback, B's clock `skew` s ahead; each one's own messages are packed
// every 0.2 s as the link's feed does (B's offset only once it has one) and reach a watcher, whose clock is `wskew` off
// A's, after a room trip of `room` s give or take 30 ms; from `joinAfter` goals on. Every step while both are playing,
// the watcher's ball is compared with the ball of the copy that decided its flight (B's when it flies at A), at the
// same moment of A's clock. A sample is how far that is beyond the step a ball covers at its speed (1/120 s, with 5% to
// spare, and never under 0.15 m): the replay may sit one step off, so a fast ball (a streak's pace, combo.mjs) is further.
const FEED=['pos','serve','hit','wide','goal','burstStart'],seeded=seed=>{let a=seed;return()=>{a=a*16807%2147483647;return a/2147483647;};};
function watched({seed=1,delayMs=60,skew=5,wskew=-3,room=.12,joinAfter=0,cap=120*400}={}){
  let T=0;const loop=createLoopback({delayMs,jitterMs:delayMs*.2,seed,now:()=>T}),out={a:[],b:[]},jitter=seeded(seed+9);
  const tA={send:m=>{loop[0].send(m);out.a.push(m);},onMessage:fn=>loop[0].onMessage(fn),close(){}};
  const tB={send:m=>{loop[1].send(m);out.b.push(m);},onMessage:fn=>loop[1].onMessage((m,at)=>fn(m,at+skew)),close(){}};
  const c={a:createClient({side:'a',transport:tA,now:()=>T}),b:createClient({side:'b',transport:tB,now:()=>T+skew})};
  const bots={a:createBot({seed:seed*2+1}),b:createBot({seed:seed*2+2})};c.a.start();c.b.start();
  const w=createWatcher({now:()=>T+wskew}),inflight=[],past={a:[],b:[]},errs=[];let joined=false,goalsSeen=0,liveAtJoin=null;
  for(let f=0;f<cap;f++){
    T+=DT;loop.flush();
    for(const side of ['a','b']){const d=bots[side].decide(c[side].view(),DT);c[side].step(DT,{axis:d.axis,swing:d.swing,skill:d.skill});c[side].state.events=[];
      const s=c[side].state;past[side].push({x:s.ball.x,z:s.ball.z,phase:s.phase});}
    if(f%24===0)for(const side of ['a','b']){
      const msgs=out[side].splice(0).filter(m=>FEED.includes(m.type));
      if(!joined&&c.a.state.score.a+c.a.state.score.b>=joinAfter){joined=true;liveAtJoin=w.live;}
      if(joined&&msgs.length)inflight.push({at:T+room+(jitter()-.5)*.06,pack:{side,msgs,o:c[side].synced?c[side].clock.offset:null}});
    }
    for(let i=inflight.length-1;i>=0;i--)if(inflight[i].at<=T){const {pack,at}=inflight.splice(i,1)[0];w.push({...pack,at:at+wskew});}
    w.step();goalsSeen+=w.state.events.filter(e=>e.type==='goal').length;
    if(w.live&&w.state.phase==='playing'){const s=w.state,src=past[s.ball.vz<0?'b':'a'],h=src[Math.round(w.time/DT)-1];
      if(h?.phase==='playing')errs.push(Math.hypot(h.x-s.ball.x,h.z-s.ball.z)-Math.max(.15,Math.hypot(s.ball.vx,s.ball.vz)*DT*1.05));}
    if(c.a.state.phase==='won'&&c.b.state.phase==='won'&&w.state.phase==='won')break;
  }
  return {c,w,errs,goalsSeen,liveAtJoin};
}

test('观战：两个机器人打完一局，观众隔 1 秒回放；乙方时钟快 5 秒、观众时钟慢 3 秒，比分、胜者一致，球和判定方的对局相差不超过一步的距离', ()=>{
  for(const opts of [{seed:1},{seed:2,delayMs:150},{seed:3,room:.3},{seed:4,skew:-30,wskew:12}]){
    const {c,w,errs,goalsSeen}=watched(opts),what=JSON.stringify(opts);
    assert.equal(w.state.phase,'won',what);assert.deepEqual(w.state.score,c.a.state.score,what);assert.equal(w.state.winner,c.a.state.winner,what);
    assert.equal(goalsSeen,c.a.state.score.a+c.a.state.score.b,`${what}：每个进球观众端出现一次`);
    assert.ok(errs.length>3000,`${what}：只比对了 ${errs.length} 次`);assert.ok(Math.max(...errs)<=0,`${what}：超出一步 ${Math.max(...errs).toFixed(3)} 米`);
  }
});

test('观战：中途进来，先显示给定的比分，等下一次发球才放画面；最后比分一致', ()=>{
  const {c,w,errs,liveAtJoin}=watched({seed:5,joinAfter:2});
  assert.equal(liveAtJoin,false);assert.deepEqual(w.state.score,c.a.state.score);assert.ok(errs.length>1000);assert.ok(Math.max(...errs)<=0);
  // Given the room's score, it shows it until play reaches it; a rally's messages before a serve are not played.
  let T=0;const late=createWatcher({now:()=>T,score:{a:2,b:1}});
  late.push({side:'a',msgs:[{type:'hit',t:0,side:'a',event:'hit',ball:{x:0,z:3,vx:0,vz:5,curve:null},rally:1,energy:50,power:false,shot:{side:'a',kind:'hit'},stop:0}],at:0});
  T=2;late.step();assert.equal(late.live,false);assert.deepEqual(late.state.score,{a:2,b:1});assert.equal(late.state.phase,'ready');
});

test('观战：乙方的时钟差还没估出来的包放不进时间线，丢掉；暂停、继续跟着玩家的记录走', ()=>{
  // A's pack lands at 6 with stamps up to 5.8: the fastest trip is 0.2 s, so the replay runs 1.2 s behind this clock.
  let T=6;const w=createWatcher({now:()=>T,delay:1}),near=(a,b)=>Math.abs(a-b)<.02;
  w.push({side:'b',msgs:[{type:'pos',t:3,x:2,axis:0,swing:null}],at:T});assert.equal(w.time,null,'只有乙方没对时的包：还没有时间线');
  w.push({side:'a',msgs:[{type:'pos',t:5,x:1,axis:0,swing:null},{type:'serve',t:5.1,ball:{x:0,z:12,vx:0,vz:-6,curve:null,kind:null,z0:12,z1:1},serves:1},{type:'pause',t:5.3},{type:'resume',t:5.8}],at:T});
  w.step();T=6.4;w.step();assert.equal(w.state.players.a.x,1);assert.equal(w.state.players.b.x,0,'没对时的乙方消息被丢掉');
  assert.ok(w.live);assert.equal(w.state.phase,'playing');assert.ok(near(w.state.ball.z,12-6*.1),`发球后飞了 0.1 秒：${w.state.ball.z}`);
  T=6.6;w.step();assert.equal(w.state.phase,'paused');assert.ok(near(w.state.ball.z,12-6*.2));
  T=6.9;w.step();assert.ok(near(w.state.ball.z,12-6*.2),'暂停中不动');
  T=7.2;w.step();assert.equal(w.state.phase,'playing');assert.ok(near(w.state.ball.z,12-6*.4),'继续后接着飞');
});

test('一条击球消息晚到 2 秒：接收方的球停在发送方的球门线上等待，收到后继续，比分不出错', ()=>{
  let armed=false,heldAt=null,crossed=false,released=false,before=null,struck=false;
  const {clients:{a,b}}=match({seed:7,delayMs:60,jitterMs:10,cap:120*400,onStep:(c,loop)=>{
    const s=c.a.state,sb=c.b.state;
    // After a few exchanges, hold back B's next strike.
    // A burst is left out: its launch ends a charge the receiver already freezes for ('skill'), not a line it holds at.
    if(!armed&&s.shots>=4&&s.ball.vz>0){armed=true;before=sb.shot;loop.delayNext(m=>m.type==='hit'&&m.side==='b'&&m.event!=='burst',2000);}
    // The watch starts once B has struck in its own copy: the bot misses now and then, and a ball it lets in (or a wide
    // ball off its end wall) is not the late strike; the held-back message is B's next strike, whenever it comes.
    if(armed&&!struck&&sb.shot!==before&&sb.shot?.side==='b'&&sb.shot.kind!=='burst')struck=true;
    if(struck&&!released){if(s.ball.z>COURT+1e-9)crossed=true;if(s.hold&&heldAt===null)heldAt=s.ball.z;if(heldAt!==null&&!s.hold)released=true;}
  }});
  assert.ok(armed,'没有触发延迟');assert.ok(heldAt!==null,'接收方没有停下等待');assert.ok(Math.abs(heldAt-COURT)<1e-6,`停在 z=${heldAt}`);
  assert.ok(!crossed,'球越过了发送方的球门线');assert.ok(released,'收到消息后没有继续');
  assert.equal(a.state.phase,'won');assert.deepEqual(a.state.score,b.state.score);
});

// AC21 stand-in report (2026-10-29): position and swing went out 30 times a second while a strike went at once, so about
// a third of returns turned on the receiver's screen before the far punch was drawn. A swing's start now goes out ahead.
test('对手的击球在本方生效时，本方画面里对手的拳已经在挥（0 / 150 / 250 毫秒）', ()=>{
  for(const delayMs of [0,150,250]){let seen=0,late=0;const last={a:null,b:null};
    match({seed:3,delayMs,jitterMs:delayMs*.2,cap:120*240,onStep:c=>{
      for(const side of ['a','b']){const st=c[side].state,shot=st.shot;if(shot===last[side])continue;last[side]=shot;
        if(!shot||shot.side===side)continue;seen++;if(!st.players[shot.side].swing)late++;}}});
    assert.ok(seen>=40,`${delayMs} 毫秒：只比对了 ${seen} 拍`);assert.equal(late,0,`${delayMs} 毫秒：${late}/${seen} 拍球先掉头、拳还没画`);}
});

// --- Full flight (createClient sync:'fullflight', Issue #3) -------------------------------------------------------
const FULL='fullflight',STRUCK=['hit','perfect','soft'];
// B's strikes as A's copy receives them: the ball, in B's view, against the point B struck it at.
const fromStrike=(s)=>{const l=localBall(s,'b');return {d:Math.hypot(l.x-s.shot.x,l.z-s.shot.z),v:Math.hypot(l.vx,l.vz)};};

test('出球放慢：回环 0/40/80/150 毫秒（抖动 20%）各打 5 局，两边每局比分、胜者一致，每个进球两边各出现一次', ()=>{
  for(const delayMs of [0,40,80,150])for(let m=0;m<5;m++){
    const {clients:{a,b},goals}=match({sync:FULL,delayMs,jitterMs:delayMs*.2,seed:200+m}),tag=`${delayMs} 毫秒第 ${m+1} 局`;
    assert.equal(a.state.phase,'won',`${tag} A 端未结束`);assert.equal(b.state.phase,'won',`${tag} B 端未结束`);
    assert.deepEqual(a.state.score,b.state.score,`${tag} 比分`);assert.equal(a.state.winner,b.state.winner);
    const total=a.state.score.a+a.state.score.b;
    assert.equal(goals.a.length,total,`${tag} A 端进球事件`);assert.equal(goals.b.length,total,`${tag} B 端进球事件`);
    assert.deepEqual(goals.a,goals.b,`${tag} 进球顺序`);
  }
});

test('出球放慢：往返延迟在上限内时，收到击球那一刻球就在对手的击球点上（不追帧）；超出上限时只追超出部分的一半', ()=>{
  for(const [delayMs,share] of [[40,0],[150,.5]]){
    let worst=0,checked=0,rtt=0;
    for(let m=0;m<3;m++)match({sync:FULL,delayMs,jitterMs:delayMs*.2,seed:300+m,cap:120*120,onStep:(c)=>{
      const s=c.a.state;for(const e of s.events)if(STRUCK.includes(e.type)&&e.side==='b'&&s.shots>2){
        rtt=c.a.clock.rtt;const {d,v}=fromStrike(s),flown=share*Math.max(0,rtt-.12);
        // One step of flight on top: a strike that arrives mid-step is moved by the rest of that step.
        worst=Math.max(worst,d-v*(flown+DT));checked++;}
    }});
    assert.ok(checked>=30,`${delayMs} 毫秒只比对了 ${checked} 次`);assert.ok(worst<=1e-6,`${delayMs} 毫秒（往返约 ${(rtt*1000).toFixed(0)} 毫秒）：多飞了 ${worst.toFixed(3)} 米`);
  }
});

test('出球放慢：自己打出去的球画得慢些但从不停住，最慢也有规则球速的 0.7 倍；对手回球时画出来的球已经到了它面前', ()=>{
  let frames=0,stalls=0,slowest=1,jumps=[];let was=null;
  for(let m=0;m<3;m++)match({sync:FULL,delayMs:40,jitterMs:8,seed:400+m,cap:120*120,
    onBefore:(c)=>{const s=c.a.state;was={out:c.a.outgoing,ball:{...c.a.view().ball},still:s.hitstop>0||s.hold||s.phase!=='playing'};},
    onStep:(c)=>{
      const s=c.a.state,v=c.a.view().ball;
      if(was.out&&c.a.outgoing&&!was.still&&!(s.hitstop>0||s.hold)&&s.phase==='playing'){
        const d=Math.hypot(v.x-was.ball.x,v.z-was.ball.z),step=Math.hypot(s.ball.vx,s.ball.vz)*DT;frames++;
        if(d<1e-9)stalls++;else slowest=Math.min(slowest,d/step);}
      // The drawn ball as B's return arrives, against where the return starts (A's view).
      for(const e of s.events)if(STRUCK.includes(e.type)&&e.side==='b'&&was.out){const l=localBall(s,'a');jumps.push(Math.hypot(l.x-was.ball.x,l.z-was.ball.z));}
    }});
  jumps.sort((x,y)=>x-y);const p90=jumps[Math.floor(jumps.length*.9)];
  assert.ok(frames>=2000,`只看了 ${frames} 帧`);assert.equal(stalls,0,`停住 ${stalls} 帧`);
  assert.ok(slowest>=.7&&slowest<1,`最慢 ${slowest.toFixed(3)} 倍`);
  assert.ok(jumps.length>=30&&p90<=.5,`回球时跳了 ${p90?.toFixed(2)} 米（第 90 百分位，${jumps.length} 次）`);
});

test('出球放慢：一条击球消息晚到 2 秒，画出来的球也停在对手的球门线前等，收到后继续，比分不出错', ()=>{
  let armed=false,held=false,crossed=false,released=false,before=null,struck=false;
  const {clients:{a,b}}=match({sync:FULL,seed:7,delayMs:60,jitterMs:10,cap:120*400,onStep:(c,loop)=>{
    const s=c.a.state,sb=c.b.state,drawn=c.a.view().ball;
    if(!armed&&s.shots>=4&&s.ball.vz>0){armed=true;before=sb.shot;loop.delayNext(m=>m.type==='hit'&&m.side==='b'&&m.event!=='burst',2000);}
    if(armed&&!struck&&sb.shot!==before&&sb.shot?.side==='b'&&sb.shot.kind!=='burst')struck=true;
    if(struck&&!released){if(drawn.z>COURT+1e-9||s.ball.z>COURT+1e-9)crossed=true;if(s.hold)held=true;if(held&&!s.hold)released=true;}
  }});
  assert.ok(armed,'没有触发延迟');assert.ok(held,'没有停下等待');assert.ok(!crossed,'球越过了对手的球门线');assert.ok(released,'收到消息后没有继续');
  assert.equal(a.state.phase,'won');assert.deepEqual(a.state.score,b.state.score);
});

test('出球放慢：对手击球的那一刻，它的出拳已经画出来（击球消息带着挥拳）', ()=>{
  let turns=0,shown=0;
  for(let m=0;m<3;m++)match({sync:FULL,delayMs:80,jitterMs:16,seed:500+m,cap:120*120,onStep:(c)=>{
    const s=c.a.state;for(const e of s.events)if(STRUCK.includes(e.type)&&e.side==='b'){turns++;if(s.players.b.swing?.hit)shown++;}
  }});
  assert.ok(turns>=30,`只看了 ${turns} 次`);assert.equal(shown,turns,`${turns-shown} 次球掉头时没有画出拳`);
});

test('出球放慢：对手放爆发蓄力时，画出来的球停在它锁住球的那一点（场景的倒计时环画在球上）', ()=>{
  let bursts=0,checked=0,worst=0,seen=null;
  for(let m=0;m<8&&bursts<3;m++)match({sync:FULL,delayMs:40,jitterMs:8,seed:600+m,cap:120*240,onStep:(c)=>{
    const s=c.a.state,k=s.phase==='skill'&&s.skill?.side==='b'?s.skill:null;if(!k)return;
    if(k!==seen){seen=k;bursts++;}
    // Past the 0.15 s ease from where the ball was drawn when the charge began.
    if(k.time>=.2){const v=c.a.view().ball;worst=Math.max(worst,Math.hypot(v.x+k.x,v.z-(COURT-k.z)));checked++;}
  }});
  assert.ok(bursts>=3&&checked>=30,`只看到 ${bursts} 次爆发、${checked} 帧`);assert.ok(worst<=1e-9,`偏离锁球点 ${worst.toFixed(3)} 米`);
});

// Found by PR #4: with the catch-up sync the receiver's ball flew on past the lock point until the charge's message came,
// so the charge was played round a ball about half a metre behind the far figure's lock (at 40 ms one way).
test('追帧：对手放爆发蓄力时，画出来的球也停在它锁住球的那一点（40 / 150 毫秒）', ()=>{
  for(const delayMs of [40,150]){let bursts=0,checked=0,worst=0,seen=null;
    for(let m=0;m<8&&bursts<3;m++)match({delayMs,jitterMs:delayMs*.2,seed:600+m,cap:120*240,onStep:(c)=>{
      const s=c.a.state,k=s.phase==='skill'&&s.skill?.side==='b'?s.skill:null;if(!k)return;
      if(k!==seen){seen=k;bursts++;}
      if(k.time>=.2+delayMs/1000){const v=c.a.view().ball;worst=Math.max(worst,Math.hypot(v.x+k.x,v.z-(COURT-k.z)));checked++;}
    }});
    assert.ok(bursts>=3&&checked>=30,`${delayMs} 毫秒：只看到 ${bursts} 次爆发、${checked} 帧`);assert.ok(worst<=1e-9,`${delayMs} 毫秒：偏离锁球点 ${worst.toFixed(3)} 米`);}
});
