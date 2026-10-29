// Duel sync between two copies of a match (P0: both in one page over a loopback; P1: the same clients over WebRTC or a
// WebSocket relay). Each copy decides only for its own player (duel-core.mjs `auth`): whoever the ball is flying at
// decides the strike, the goal or the bounce at its end, and sends the result; the other copy jumps its ball to that
// state, flown on by the message's age so both show the ball at the same place, and eases the jump on screen.
//
// transport: {send(msg), onMessage(fn(msg, arrivedAt)), close()}. Messages are plain JSON and arrive in order (a WebRTC
// reliable ordered channel or a WebSocket both give that). Clocks: every message carries its sender's clock `t`. Each
// side keeps the smallest (arrival − sent) of the recent messages it received and tells the other with every message
// (`mi`); half the difference of the two smallest is the clock offset, assuming the fastest trip takes as long both ways.
// With 30 position messages a second that settles within about a millisecond under symmetric jitter, where a single
// round trip (ping/pong, kept for the round-trip time) is off by half the jitter.
import {createDuel,startDuel,stepDuel,duelAttack,duelSkill,applyMessage,pauseDuel,resumeDuel,other,localBall} from './duel-core.mjs';
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

const EASE=.15,BALL_EVENTS=['serve','hit','wide'];
// now(): this copy's clock in seconds. controller-free: the caller passes this player's input to step().
// picks: both players' fighters ({a, b}), the same on both ends (agreed before the match, like the room itself).
export function createClient({side,transport,now,picks={},posEvery=1/30,pingEvery=.25}){
  const opp=other(side),s=createDuel({auth:{[side]:true,[opp]:false},picks}),inbox=[];
  // offset: the other clock minus ours. trips: our recent (arrival − sent); theirs: the other side's smallest, from `mi`.
  const clock={offset:0,rtt:null,trips:[],mine:Infinity,theirs:Infinity},ease={x:0,z:0,left:0},drawn={x:0,z:0};
  let lastPos=-Infinity,lastPing=-Infinity;
  transport.onMessage((msg,at)=>inbox.push({msg,at:at??now()}));
  // stamp: the clock the message's state belongs to (now, unless it was decided before this step's tick ran).
  const send=(msg,stamp=now())=>{msg.t=stamp;if(Number.isFinite(clock.mine))msg.mi=clock.mine;transport.send(msg);};
  function trip(msg,arrived){
    clock.trips.push(arrived-msg.t);if(clock.trips.length>120)clock.trips.shift();clock.mine=Math.min(...clock.trips);
    if(Number.isFinite(msg.mi))clock.theirs=msg.mi;
    if(Number.isFinite(clock.theirs))clock.offset=(clock.mine-clock.theirs)/2;
  }
  // at: when this step's tick starts (the decision is flown on to there; the tick then moves it with everything else).
  function receive({msg,at:arrived},at){
    if(msg.type!=='pong')trip(msg,arrived);
    if(msg.type==='ping'){transport.send({type:'pong',t0:msg.t,t1:arrived,t2:now()});return;}
    if(msg.type==='pong'){const rtt=(arrived-msg.t0)-(msg.t2-msg.t1);clock.rtt=clock.rtt===null?rtt:clock.rtt*.8+rtt*.2;return;}
    const age=at-(msg.t-clock.offset),o=s.players[opp];
    if(msg.type==='pos'){
      o.x=msg.x;o.held=msg.axis;
      // A new swing starts its own clock (so the punch restarts); an ongoing one runs on (duel-core driftSwing).
      if(msg.swing&&(!o.swing||msg.swing.time<o.swing.time-.05))o.swing={...msg.swing,time:msg.swing.time+Math.max(0,age)};
      else if(!msg.swing&&o.swing&&!o.swing.hit)o.swing=null;
      return;
    }
    const before=localBall(s,side);applyMessage(s,msg,age);
    if(BALL_EVENTS.includes(msg.type)&&msg.type!=='serve'){const after=localBall(s,side),dx=before.x-after.x,dz=before.z-after.z;
      if(Math.hypot(dx,dz)<4){ease.x=dx;ease.z=dz;ease.left=EASE;}}
  }
  return {
    state:s,side,clock,
    get synced(){return Number.isFinite(clock.theirs)&&Number.isFinite(clock.mine);},
    start(){return startDuel(s);},
    // input: {axis, swing, skill} for this player, in its own view.
    step(dt,input={}){
      const t=now();
      if(s.phase!=='paused')for(const m of inbox.splice(0))receive(m,t-dt);
      // A spin leaves the glove at once, before this step's tick moves it: its message carries the step's start.
      if(input.skill)duelSkill(s,side,input.skill,input.axis||0);else if(input.swing)duelAttack(s,side);
      for(const m of s.outbox.splice(0))send(m,t-dt);
      stepDuel(s,dt,{[side]:{axis:input.axis||0}});
      for(const m of s.outbox.splice(0))send(m);
      if(t-lastPos>=posEvery){lastPos=t;const p=s.players[side],sw=p.swing;send({type:'pos',x:p.x,axis:p.held,swing:sw?{time:sw.time,hit:sw.hit,whiffed:sw.whiffed,armed:sw.armed}:null});}
      if(t-lastPing>=pingEvery){lastPing=t;send({type:'ping'});}
      ease.left=Math.max(0,ease.left-dt);
    },
    pause(){pauseDuel(s);},resume(){resumeDuel(s);},
    // The ball as drawn: the state's own, plus what is left of a late correction.
    view(){const k=ease.left/EASE;drawn.x=ease.x*k;drawn.z=ease.z*k;return viewFor(s,side,k>0?drawn:null);}
  };
}
