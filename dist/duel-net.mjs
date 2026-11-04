// Duel sync between two copies of a match (P0: both in one page over a loopback; P1: the same clients over WebRTC or a
// WebSocket relay). Each copy decides only for its own player (duel-core.mjs `auth`): whoever the ball is flying at
// decides the strike, the goal or the bounce at its end, and sends the result; the other copy jumps its ball to that
// state, flown on by the message's age so both show the ball at the same place, and eases the jump on screen. With
// createClient's sync:'fullflight' a ball struck at this player is not flown on but flies its whole way here, and the
// round trip is hidden on the ball this player strikes, drawn slower on its way out (see createClient).
//
// transport: {send(msg), onMessage(fn(msg, arrivedAt)), close()}. Messages are plain JSON and arrive in order (a WebRTC
// reliable ordered channel or a WebSocket both give that). Clocks: every message carries its sender's clock `t`. Each
// side keeps the smallest (arrival − sent) of the recent messages it received and tells the other with every message
// (`mi`); half the difference of the two smallest is the clock offset, assuming the fastest trip takes as long both ways.
// With 30 position messages a second that settles within about a millisecond under symmetric jitter, where a single
// round trip (ping/pong, kept for the round-trip time) is off by half the jitter.
// Someone watching (createWatcher, arena rooms) gets both players' own messages from the room and replays them.
import {WEAPONS} from './core.mjs';
import {COURT,createDuel,startDuel,stepDuel,duelAttack,duelSkill,applyMessage,pauseDuel,resumeDuel,other,localBall,duelFigure} from './duel-core.mjs';
import {viewFor} from './duel-view.mjs';

function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
// Two connected ends in one process. Each message is delayed delayMs ± jitterMs (seeded) but never overtakes an earlier
// one, as on an ordered channel. Delivery happens in flush(), which the caller runs every frame with the same clock.
// delayNext(match, ms) holds back the next message matching `match` by an extra ms (and, being ordered, those behind it).
export function createLoopback({delayMs=0,jitterMs=0,seed=1,now}){
  const r=rng(seed),queues=[[],[]],last=[-Infinity,-Infinity],handlers=[null,null],extra=[];
  const end=i=>({send(msg){
      let at=now()+Math.max(0,delayMs+(r()*2-1)*jitterMs)/1000;
      const x=extra.findIndex(e=>e.match(msg));if(x>=0){at+=extra[x].ms/1000;extra.splice(x,1);}
      const to=1-i;at=Math.max(at,last[to]);last[to]=at;queues[to].push({at,data:JSON.stringify(msg)});},
    onMessage(fn){handlers[i]=fn;},close(){handlers[i]=null;}});
  const pair=[end(0),end(1)];
  pair.flush=()=>{const t=now();for(const i of [0,1]){const q=queues[i];while(q.length&&q[0].at<=t){const m=q.shift();handlers[i]?.(JSON.parse(m.data),m.at);}}};
  pair.delayNext=(match,ms)=>extra.push({match,ms});
  pair.setDelay=(ms,jitter=ms*.2)=>{delayMs=ms;jitterMs=jitter;};
  return pair;
}

const EASE=.15,W=WEAPONS.glove,BALL_EVENTS=['serve','hit','wide'],STRIKES=['hit','perfect','soft','spin','burst'];
// now(): this copy's clock in seconds. controller-free: the caller passes this player's input to step().
// sync: 'catchup' flies a decision from the other side on by its age, so both screens show the ball at the same place;
// the receiver then sees each return a one-way trip late and loses that much time to meet it. 'fullflight' (Issue #3)
// flies a ball struck at this player its whole way here instead, so the receiver's time does not shrink with latency,
// and hides the round trip on this player's own strike: drawn slower on its way out (the rules' ball is untouched), it
// reaches the other player as that player's return arrives. hideCap: the most of the round trip hidden that way (s).
// catchShare: of the round trip beyond hideCap, the share a receiver flies on; the outgoing ball waits out the rest.
// figure: this player's figure (characters.mjs PLAYERS); it goes out on every position message, so the other copy (and
// anyone watching) learns it at once, and again after a reconnect. rival: the other player's, if already known.
export function createClient({side,transport,now,posEvery=1/30,pingEvery=.25,sync='catchup',hideCap=.12,catchShare=.5,figure,rival}){
  const opp=other(side),s=createDuel({auth:{[side]:true,[opp]:false},figures:{[side]:figure,[opp]:rival}}),inbox=[],full=sync==='fullflight';
  // offset: the other clock minus ours. trips: our recent (arrival − sent); theirs: the other side's smallest, from `mi`.
  const clock={offset:0,rtt:null,trips:[],mine:Infinity,theirs:Infinity},ease={x:0,z:0,left:0},drawn={x:0,z:0};
  // This player's outgoing ball as drawn (fullflight): its path since the strike (match time e, this view's x/z), drawn
  // at k of the match time since, k chosen so it reaches the other player's sweet spot a hidden round trip late.
  const out={on:false,trail:[],i:0,t0:0,t:0,last:0,k:1},L0={},L1={};
  const hidden=()=>Math.min(clock.rtt??0,hideCap),beyond=()=>Math.max(0,(clock.rtt??0)-hideCap);
  function startOut(){
    const l=localBall(s,side,L0),F=Math.max(.1,(l.z1-l.z)/Math.max(.1,l.vz));
    Object.assign(out,{on:true,trail:[{e:s.elapsed,x:l.x,z:l.z}],i:0,t0:s.elapsed,t:0,last:s.elapsed,k:F/(F+hidden())});
  }
  function outAt(){
    const tr=out.trail,t=out.t0+out.t;while(out.i<tr.length-2&&tr[out.i+1].e<=t)out.i++;
    const a=tr[out.i],b=tr[Math.min(out.i+1,tr.length-1)],u=b.e>a.e?Math.min(1,Math.max(0,(t-a.e)/(b.e-a.e))):1;
    return {x:a.x+(b.x-a.x)*u,z:a.z+(b.z-a.z)*u};
  }
  let lastPos=-Infinity,lastPing=-Infinity,sentSwing=null;
  transport.onMessage((msg,at)=>inbox.push({msg,at:at??now()}));
  // stamp: the clock the message's state belongs to (now, unless it was decided before this step's tick ran).
  const send=(msg,stamp=now())=>{msg.t=stamp;if(Number.isFinite(clock.mine))msg.mi=clock.mine;transport.send(msg);};
  // Full flight: a strike carries the striker's swing, for the other screen to draw the punch with it.
  const withSwing=m=>{if(full&&m.type==='hit'){const sw=s.players[side].swing;m.swing=sw?{time:sw.time,hit:true,whiffed:false,armed:sw.armed}:null;}return m;};
  function trip(msg,arrived){
    clock.trips.push(arrived-msg.t);if(clock.trips.length>120)clock.trips.shift();clock.mine=Math.min(...clock.trips);
    if(Number.isFinite(msg.mi))clock.theirs=msg.mi;
    // mine ≈ (our clock − theirs) + the trip here, theirs ≈ (their clock − ours) + the trip there.
    if(Number.isFinite(clock.theirs))clock.offset=(clock.theirs-clock.mine)/2;
  }
  // at: when this step's tick starts (the decision is flown on to there; the tick then moves it with everything else).
  function receive({msg,at:arrived},at){
    if(msg.type!=='pong')trip(msg,arrived);
    if(msg.type==='ping'){transport.send({type:'pong',t0:msg.t,t1:arrived,t2:now()});return;}
    if(msg.type==='pong'){const rtt=(arrived-msg.t0)-(msg.t2-msg.t1);clock.rtt=clock.rtt===null?rtt:clock.rtt*.8+rtt*.2;return;}
    const age=at-(msg.t-clock.offset),o=s.players[opp];
    if(msg.type==='pos'){
      o.x=msg.x;o.held=msg.axis;if(msg.fig!==o.figure)duelFigure(s,opp,msg.fig);
      // A new swing starts its own clock (so the punch restarts); an ongoing one runs on (duel-core driftSwing). Full
      // flight draws the other player as its messages arrive, so the swing is not flown on either.
      if(msg.swing&&(!o.swing||msg.swing.time<o.swing.time-.05))o.swing={...msg.swing,time:msg.swing.time+(full?0:Math.max(0,age))};
      else if(!msg.swing&&o.swing&&!o.swing.hit)o.swing=null;
      return;
    }
    if(!full){
      // The other player's burst charge: this copy's ball flew on until the message came, past the point it was locked at;
      // it is drawn at that point for the charge (view), eased there from where it was drawn.
      if(msg.type==='burstStart'&&msg.side===opp){const before=drawnAt();applyMessage(s,msg,age);ease.left=0;
        const after=drawnAt(),dx=before.x-after.x,dz=before.z-after.z;if(Math.hypot(dx,dz)<4){ease.x=dx;ease.z=dz;ease.left=EASE;}return;}
      const before=localBall(s,side,L0);applyMessage(s,msg,age);
      // A strike whose punch this side has not drawn, or has drawn to its end already (a late message), shows its contact
      // frame as the ball turns and recovers from there: the fist meets the ball on screen whatever the delay. (Full flight
      // gets the same from the swing its strikes carry.)
      if(msg.type==='hit'&&msg.side===opp&&(!o.swing||o.swing.time>W.windup+W.active))o.swing={time:W.windup,hit:true,whiffed:false,armed:true};
      if(BALL_EVENTS.includes(msg.type)&&msg.type!=='serve'){const after=localBall(s,side,L1),dx=before.x-after.x,dz=before.z-after.z;
        if(Math.hypot(dx,dz)<4){ease.x=dx;ease.z=dz;ease.left=EASE;}}
      return;
    }
    // Full flight: a strike at this player, or a wide off its far wall, flies on only by its share of the round trip
    // beyond hideCap; a serve and a burst's charge play from their start. The strike brings its swing, so the punch is
    // drawn as the ball turns (position messages come 30 times a second, the strike at once). The ball eases from where
    // it was drawn (the outgoing ball's slower drawing ends here) to where it is drawn now.
    const flyOn=msg.type==='goal'?age:msg.type==='hit'||msg.type==='wide'?catchShare*beyond():0;
    if(msg.type==='hit'&&msg.swing&&(!o.swing||!o.swing.hit))o.swing={...msg.swing};
    const before=drawnAt();applyMessage(s,msg,flyOn);out.on=false;
    if(msg.type!=='serve'){ease.left=0;const after=drawnAt(),dx=before.x-after.x,dz=before.z-after.z;if(Math.hypot(dx,dz)<4){ease.x=dx;ease.z=dz;ease.left=EASE;}}
  }
  // The ball as drawn: the state's own, plus what is left of a late correction. During the other player's burst (either
  // sync) the point it locked the ball at, where the scene plays the charge round it, which this copy's ball, flying on
  // until the message came, may be past. Full flight: this player's outgoing ball where its slower drawing has got to.
  function view(){
    const k=ease.left/EASE;drawn.x=ease.x*k;drawn.z=ease.z*k;
    const l=localBall(s,side,L1),locked=s.phase==='skill'&&s.skill?.side===opp;
    if(locked){drawn.x+=-s.skill.x-l.x;drawn.z+=COURT-s.skill.z-l.z;}
    if(!full)return viewFor(s,side,k>0||locked?drawn:null);
    if(!locked&&out.on){const p=outAt();drawn.x+=p.x-l.x;drawn.z+=p.z-l.z;}
    return viewFor(s,side,drawn);
  }
  const drawnAt=()=>{const b=view().ball;return {x:b.x,z:b.z};};
  return {
    state:s,side,clock,
    get synced(){return Number.isFinite(clock.theirs)&&Number.isFinite(clock.mine);},
    start(){return startDuel(s);},
    // input: {axis, swing, skill} for this player, in its own view.
    step(dt,input={}){
      const t=now();
      if(s.phase!=='paused')for(const m of inbox.splice(0))receive(m,t-dt);
      // Position and swing go out posEvery, and at once when a swing starts, ahead of anything else this step sends: the
      // channel is ordered, so the other side draws the punch before the strike it makes (without that about a third
      // of returns turned before the far punch showed). A spin or a burst's launch starts its swing and strikes in one go.
      const pos=(stamp=now())=>{lastPos=t;const p=s.players[side],sw=p.swing;sentSwing=sw;send({type:'pos',x:p.x,axis:p.held,fig:p.figure,swing:sw?{time:sw.time,hit:sw.hit,whiffed:sw.whiffed,armed:sw.armed}:null},stamp);};
      const fresh=()=>{const sw=s.players[side].swing;return !!sw&&sw!==sentSwing;};
      // A spin leaves the glove at once, before this step's tick moves it: its message carries the step's start.
      if(input.skill)duelSkill(s,side,input.skill,input.axis||0);else if(input.swing)duelAttack(s,side);
      if(fresh())pos(t-dt);
      for(const m of s.outbox.splice(0))send(withSwing(m),t-dt);
      stepDuel(s,dt,{[side]:{axis:input.axis||0}});
      if(fresh())pos();
      for(const m of s.outbox.splice(0))send(withSwing(m));
      if(full){
        for(const e of s.events)if(STRIKES.includes(e.type)&&e.side===side)startOut();
        if(out.on){const l=localBall(s,side,L0);out.trail.push({e:s.elapsed,x:l.x,z:l.z});out.t+=(s.elapsed-out.last)*out.k;out.last=s.elapsed;
          if(out.trail.length>1200)out.on=false;}
      }
      if(t-lastPos>=posEvery)pos();
      if(t-lastPing>=pingEvery){lastPing=t;send({type:'ping'});}
      ease.left=Math.max(0,ease.left-dt);
    },
    pause(){pauseDuel(s);},resume(){resumeDuel(s);},
    sync,get outgoing(){return full&&out.on;},view
  };
}

// A match as someone watching it sees it (arena rooms, Issue #9): both players' own messages, as the room passes them on
// (the feed, duel-link.mjs), replayed `delay` seconds behind on one clock. Nothing is decided here (auth is off for
// both): the ball flies and holds at a line until the deciding side's message, as on a player's copy for the other
// side, so it only replays, and by `delay` everything due has come. The clock is A's: B's packs carry B's estimate of
// the other clock (createClient clock.offset; none until it has one, and such a pack cannot be placed), which turns B's
// stamps into A's. A's clock is taken to this one by the smallest arrival − stamp of A's messages, the fastest trip; it
// only ever goes down, as a rising one would set the replay back and stall it. Joined mid-rally, it plays from the next
// serve or goal on, with the score it was given until then. now(): this page's clock in seconds.
export function createWatcher({now,delay=1,score=null}){
  const s=createDuel({auth:{a:false,b:false}}),queue=[];let base=null,play=null,live=false;
  if(score)s.score={a:score.a|0,b:score.b|0};
  // A pack from `side` (msgs and o as the feed sends them), arrived at `at` on this clock.
  function push({side,msgs,o,at=now()}){
    if(side==='b'&&!Number.isFinite(o))return;
    const shift=side==='b'?o:0;
    for(const m of Array.isArray(msgs)?msgs:[]){
      if(!Number.isFinite(m?.t))continue;const t=m.t+shift;queue.push({side,m,t});
      if(side==='a')base=base===null?at-t:Math.min(base,at-t);
    }
    queue.sort((p,q)=>p.t-q.t);
  }
  function apply({side,m}){
    if(m.type==='pos'){
      const o=s.players[side];o.x=m.x;o.held=m.axis;if(m.fig!==o.figure)duelFigure(s,side,m.fig);
      if(m.swing&&(!o.swing||m.swing.time<o.swing.time-.05))o.swing={...m.swing};else if(!m.swing&&o.swing&&!o.swing.hit)o.swing=null;
      return;
    }
    if(m.type==='pause'){pauseDuel(s);return;}
    if(m.type==='resume'){resumeDuel(s);return;}
    if(!live){if(m.type!=='serve'&&m.type!=='goal')return;live=true;}
    applyMessage(s,m,0);
    // The strike's contact frame, if its punch was not drawn (as the players' copies do).
    const p=m.type==='hit'&&s.players[m.side];if(p&&(!p.swing||p.swing.time>W.windup+W.active))p.swing={time:W.windup,hit:true,whiffed:false,armed:true};
  }
  return {
    state:s,
    // Live: playing the match (not waiting for the next serve). time: how far the replay has got, on A's clock.
    get live(){return live;},get time(){return play;},
    push,
    // The replay moves on to now − delay, a message at a time; the events of all its steps are left on state.events.
    step(){
      if(base===null)return;
      const target=now()-base-delay,events=[];
      if(play===null)play=target;
      const run=dt=>{if(dt>0){stepDuel(s,Math.min(dt,1));events.push(...s.events);}};
      while(queue.length&&queue[0].t<=target){const q=queue.shift();if(q.t>play){run(q.t-play);play=q.t;}apply(q);}
      if(target>play){run(target-play);play=target;}
      s.events=[...events,...s.queued.splice(0)];
    },
    view(side='a'){return viewFor(s,side);}
  };
}
