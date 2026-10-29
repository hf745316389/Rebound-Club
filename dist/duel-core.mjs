// Two-player duel (P0): each player guards one goal and strikes back at the other's. Strike, power, aim, whiff and skill
// rules are the single-player striker's (core.mjs, left untouched), applied in each player's own view of the court:
// state is kept in A's coordinates and B's view is A's turned half round (x→-x, z→COURT-z), so in its own view each
// player stands at PLAYER_Z, strikes toward +z and defends the line at z=0.
// Authority (duel-net.mjs): `auth[side]` says whether this copy of the match decides for that player. A player's swings
// and skills, the serve to it and whatever happens at its goal line are decided only where auth[side] is set; elsewhere
// the ball just flies, and holds at that line until the deciding side's message arrives (applyMessage). Decisions are
// queued on `outbox` whenever some side is decided elsewhere.
import {WEAPONS,PACE,RUN,PLAYER_Z,PERFECT_BAND,RALLY_STEP,RALLY_CAP,POWER,SOFT,AIM_SHARE,SPIN_SHARE,GOAL_Z,FAR_WALL,KEEPER_Z,SKILLS,LEVELS,advanceBall,aimAngle} from './core.mjs';

export const COURT=GOAL_Z,OPP_Z=COURT-PLAYER_Z;
// One fixed court: level 1's ball speed, goal width and colour; first to `goals` wins.
export const DUEL={goals:5,speed:LEVELS[0].speed,goalHalf:LEVELS[0].goalHalf,color:LEVELS[0].color,serveDelay:.8,goalDelay:1.2};
export const SIDES=['a','b'],DUEL_ACTIVE=['playing','serving','goal','skill'];
export const other=side=>side==='a'?'b':'a';
const W=WEAPONS.glove;
// Fighters: each player picks one before the match. All of them play the single-player glove's rules; each changes a
// few of its numbers, one clear strength paid for by one clear weakness (allround is the glove itself, the reference).
// Skills (spin, burst) are the same for everyone. First-round values, tuned with scripts/duel-roster.mjs.
// width/reach: hit box half width and depth; run: share of RUN; shot: share of every strike's speed; power: the sweet
// spot's multiplier (POWER for the glove); aim: share of the goal's half width a held direction aims at (AIM_SHARE);
// energy: share of the energy a strike earns; windup/active/recovery/whiff: swing timings in seconds.
export const FIGHTERS={
  allround:{name:'全能',role:'没有短板，上手最快'},
  power:{name:'重炮',role:'球速快；出拳时机要求更准，脚步沉',shot:1.06,power:1.45,reach:.93,run:.9},
  speed:{name:'疾风',role:'跑得快，出拳判定久，挥空收得快；球稍轻',run:1.25,active:.15,whiff:.3,shot:.99},
  wall:{name:'铁壁',role:'击球框深又宽，出拳时机最宽松；球轻，脚慢',reach:1.08,width:1,shot:.92,run:.92},
  trick:{name:'巧手',role:'能量攒得快、技能放得多，角度刁；普通球稍轻',energy:1.5,aim:.95,shot:.98}
};
export const FIGHTER_IDS=Object.keys(FIGHTERS);
// A fighter's numbers in full, as the rules read them (plain data: it travels inside the match state).
export function fighterKit(id){
  const f=FIGHTERS[id]?id:'allround',k={id:f,width:W.width,reach:W.reach,windup:W.windup,active:W.active,recovery:W.recovery,whiff:W.whiff,
    run:1,shot:1,power:POWER,aim:AIM_SHARE,energy:1,...FIGHTERS[f]};
  // aimAngle aims at AIM_SHARE of level.goalHalf; this goal half width makes it aim at k.aim of the real one.
  return {...k,sweet:PLAYER_Z+k.reach*.5,aimLevel:{level:{goalHalf:DUEL.goalHalf*k.aim/AIM_SHARE}}};
}
const kitOf=(s,side)=>s.players[side].kit;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),aimSide=axis=>axis<-.5?-1:axis>.5?1:0;

// --- Views ---------------------------------------------------------------------------------------------------------
function copyBall(b,out={}){out.x=b.x;out.z=b.z;out.vx=b.vx;out.vz=b.vz;out.curve=b.curve?{k:b.curve.k,stopZ:b.curve.stopZ}:null;out.kind=b.kind??null;out.z0=b.z0??b.z;out.z1=b.z1??b.z;return out;}
// The half turn is its own inverse. Spin keeps its sense under it (a rotation, not a mirror), only its stop depth turns.
export function mirrorBall(b,out={}){const c=b.curve;out.x=-b.x;out.z=COURT-b.z;out.vx=-b.vx;out.vz=-b.vz;out.curve=c?{k:c.k,stopZ:COURT-c.stopZ}:null;out.kind=b.kind??null;out.z0=COURT-(b.z0??b.z);out.z1=COURT-(b.z1??b.z);return out;}
export const localX=(side,x)=>side==='a'?x:-x;
export function localBall(s,side,out){return side==='a'?copyBall(s.ball,out):mirrorBall(s.ball,out);}
function setBall(s,side,l){if(side==='a')copyBall(l,s.ball);else mirrorBall(l,s.ball);}
export function toLocal(s,side){return {ball:localBall(s,side),me:{x:localX(side,s.players[side].x)},opp:{x:localX(side,s.players[other(side)].x)}};}
export function fromLocal(l,side){const ball=side==='a'?copyBall(l.ball):mirrorBall(l.ball),me={x:localX(side,l.me.x)},opp={x:localX(side,l.opp.x)};
  return {ball,players:side==='a'?{a:me,b:opp}:{a:opp,b:me}};}
// One fixed step of flight in A's coordinates. advanceBall bends spin about the +z heading, so a ball struck by B flies
// in B's view. Returns the side wall hit (in A's x) or 0.
const FLY={};
function flyBall(s,dt){const b=s.ball;if(b.vz>=0)return advanceBall(b,dt);mirrorBall(b,FLY);const w=advanceBall(FLY,dt);mirrorBall(FLY,b);return -w;}

// --- Match ---------------------------------------------------------------------------------------------------------
function player(kit){return {x:0,kit,swing:null,energy:SKILLS.start,held:0,whiff:null,hits:0,lastShot:''};}
// picks: {a, b} fighter ids (FIGHTERS); both copies of a networked match must be created with the same picks.
export function createDuel({auth={a:true,b:true},picks={}}={}){
  const a=player(fighterKit(picks.a)),b=player(fighterKit(picks.b));
  return {mode:'duel',phase:'ready',previousPhase:null,countdown:DUEL.serveDelay,ball:{x:0,z:PLAYER_Z+.3,vx:0,vz:-DUEL.speed,curve:null,kind:null,z0:PLAYER_Z+.3,z1:a.kit.sweet},
    players:{a,b},score:{a:0,b:0},winner:null,serveTo:'a',serves:0,rally:1,power:false,hitstop:0,flash:0,elapsed:0,boardAngle:0,
    shot:null,shots:0,lastGoal:null,skill:null,skillSeq:0,hold:false,events:[],queued:[],outbox:[],accumulator:0,pose:null,auth:{a:!!auth.a,b:!!auth.b}};
}
const netted=s=>!(s.auth.a&&s.auth.b);
function post(s,msg){if(netted(s))s.outbox.push(msg);}
// The server puts the ball into play from in front of itself toward the receiver, alternating its drift (the single-
// player keeper's serve, seen from the receiver).
function placeServe(s){
  const rcv=s.serveTo,dir=s.serves%2?-1:1,z=OPP_Z-.3;
  setBall(s,rcv,{x:clamp(localX(rcv,s.players[other(rcv)].x),-1.5,1.5),z,vx:.65*PACE*dir,vz:-DUEL.speed,curve:null,kind:null,z0:z,z1:kitOf(s,rcv).sweet});
  for(const side of SIDES)s.players[side].swing=null;s.power=false;
}
function doServe(s){placeServe(s);s.serves++;s.phase='playing';s.hold=false;s.events.push({type:'serve',side:s.serveTo});post(s,{type:'serve',ball:copyBall(s.ball),serves:s.serves});}
export function startDuel(s){if(s.phase!=='ready')return false;placeServe(s);s.phase='serving';s.countdown=DUEL.serveDelay;return true;}
export function pauseDuel(s){if(DUEL_ACTIVE.includes(s.phase)){s.previousPhase=s.phase;s.phase='paused';}}
export function resumeDuel(s){if(s.phase==='paused'){s.phase=s.previousPhase||'playing';s.previousPhase=null;}}
export function duelAttack(s,side){
  const p=s.players[side];if(s.phase!=='playing'||p.swing||!s.auth[side])return false;
  p.swing={time:0,hit:false,armed:null,whiffed:false};s.queued.push({type:'swing',side});return true;
}
// The exact rectangle side's swing can connect in (its own view), and the power band inside it.
function zoneAt(k,lx){const band=PERFECT_BAND*k.reach*.5;return {left:lx-k.width,right:lx+k.width,near:PLAYER_Z-.12,far:PLAYER_Z+k.reach,sweetNear:k.sweet-band,sweetFar:k.sweet+band};}
export function duelHitZone(s,side){return zoneAt(kitOf(s,side),localX(side,s.players[side].x));}
export function duelBurstZone(s,side){const r=duelHitZone(s,side),lx=localX(side,s.players[side].x),half=kitOf(s,side).width*SKILLS.burst.widthScale;return {...r,left:lx-half,right:lx+half,far:r.far+SKILLS.burst.frontExtra};}
const inRect=(b,r)=>b.x>=r.left&&b.x<=r.right&&b.z>=r.near&&b.z<=r.far;
function inRange(s,side,l){return s.phase==='playing'&&l.vz<0&&inRect(l,duelHitZone(s,side));}

// --- Energy and skills (core.mjs's rules, per player) --------------------------------------------------------------
function addEnergy(s,side,n,events){
  if(n<=0)return;const p=s.players[side],before=p.energy;p.energy=Math.min(SKILLS.max,before+n);events.push({type:'energy',side});
  if(before<SKILLS.spin.cost&&p.energy>=SKILLS.spin.cost)events.push({type:'energy50',side});
  if(before<SKILLS.max&&p.energy>=SKILLS.max)events.push({type:'energy100',side});
}
export function duelSkillStatus(s,side,kind){
  const cfg=SKILLS[kind],p=s.players[side];
  if(!cfg||kind==='max'||!s.auth[side])return {ok:false,reason:'state'};
  if(s.skill)return {ok:false,reason:'charging'};
  if(s.phase!=='playing'||s.hold)return {ok:false,reason:'state'};
  if(p.swing)return {ok:false,reason:'busy'};
  if(p.energy<cfg.cost)return {ok:false,reason:'energy'};
  const l=localBall(s,side);
  if(!(l.vz<0&&inRect(l,kind==='burst'?duelBurstZone(s,side):duelHitZone(s,side))))return {ok:false,reason:'window'};
  return {ok:true};
}
// core.mjs spinShot in the striker's view, the opponent standing in for the keeper.
function spinShot(rally,x,z,axis,oppX){
  const cfg=SKILLS.spin,dir=aimSide(axis)||(oppX>=0?-1:1),v=DUEL.speed*Math.min(RALLY_CAP,rally*RALLY_STEP);
  const curve={k:dir*cfg.curve,stopZ:z+(KEEPER_Z-z)*cfg.curveShare},mark=dir*DUEL.goalHalf*SPIN_SHARE,dt=1/120;
  const land=a0=>{let a=a0,bx=x,bz=z;for(let i=0;i<2400;i++){
    if(bz<curve.stopZ)a=clamp(a+curve.k*v*dt,-cfg.maxAngle,cfg.maxAngle);
    const nx=bx+Math.sin(a)*v*dt,nz=bz+Math.cos(a)*v*dt;if(nz>=GOAL_Z)return bx+(nx-bx)*(GOAL_Z-bz)/(nz-bz);bx=nx;bz=nz;}return bx;};
  let lo=-cfg.maxAngle,hi=cfg.maxAngle;for(let i=0;i<24;i++){const mid=(lo+hi)/2;if(land(mid)<mark)lo=mid;else hi=mid;}
  return {dir,angle:(lo+hi)/2,v,curve};
}
function registerContact(s,side,l,angle,kind,id,events){
  const p=s.players[side];s.shots++;s.power=false;s.flash=1;p.hits++;p.lastShot=kind;
  s.shot={side,x:l.x,z:l.z,angle,kind,at:s.elapsed,id};events.push({type:kind,side});
}
const hitMsg=(s,side,event)=>({type:'hit',side,event,ball:copyBall(s.ball),rally:s.rally,energy:s.players[side].energy,power:s.power,shot:{...s.shot},stop:s.hitstop});
export function duelSkill(s,side,kind,axis=0){
  const status=duelSkillStatus(s,side,kind);if(!status.ok)return status;
  const p=s.players[side],id=++s.skillSeq,l=localBall(s,side);p.energy-=SKILLS[kind].cost;
  if(kind==='spin'){
    const {angle,v,curve}=spinShot(s.rally,l.x,l.z,axis,localX(side,s.players[other(side)].x));s.rally=Math.min(RALLY_CAP,s.rally*RALLY_STEP);
    Object.assign(l,{vx:Math.sin(angle)*v,vz:Math.cos(angle)*v,z0:l.z,z1:COURT-kitOf(s,other(side)).sweet,kind:'spin',curve});setBall(s,side,l);
    registerContact(s,side,l,angle,'spin',id,s.queued);p.swing={time:p.kit.windup,hit:true,armed:true,whiffed:false,skill:'spin'};
    post(s,hitMsg(s,side,'spin'));
  }else{
    s.skill={kind:'burst',side,id,time:0,x:l.x,z:l.z};s.phase='skill';p.swing=null;s.queued.push({type:'burstStart',side});
    post(s,{type:'burstStart',side,id,x:l.x,z:l.z});
  }
  return {ok:true,id};
}
function launchBurst(s,side,axis){
  const k=s.skill,p=s.players[side],cfg=SKILLS.burst,angle=aimAngle(p.kit.aimLevel,k.x,k.z,axis);
  s.rally=Math.min(RALLY_CAP,s.rally*RALLY_STEP);const v=Math.min(cfg.maxSpeed,DUEL.speed*s.rally*cfg.speedScale);
  const l={x:k.x,z:k.z,vx:Math.sin(angle)*v,vz:Math.cos(angle)*v,z0:k.z,z1:COURT-kitOf(s,other(side)).sweet,kind:'burst',curve:null};setBall(s,side,l);
  registerContact(s,side,l,angle,'burst',k.id,s.events);
  s.skill=null;s.phase='playing';p.swing={time:p.kit.windup+p.kit.active,hit:true,armed:true,whiffed:false,skill:'burst'};
  post(s,hitMsg(s,side,'burst'));
}

// --- Strikes, whiffs, goals -----------------------------------------------------------------------------------------
function strike(s,side,l,axis){
  const p=s.players[side],k=p.kit,sw=p.swing,t=clamp((l.z-k.sweet)/(k.reach*.5),-1,1);
  const soft=!sw.armed,perfect=!soft&&Math.abs(t)<=PERFECT_BAND,angle=aimAngle(k.aimLevel,l.x,l.z,axis);
  s.rally=Math.min(RALLY_CAP,s.rally*RALLY_STEP);
  const v=DUEL.speed*s.rally*(perfect?k.power:soft?SOFT:1)*k.shot;
  Object.assign(l,{vx:Math.sin(angle)*v,vz:Math.cos(angle)*v,z0:l.z,z1:COURT-kitOf(s,other(side)).sweet,kind:perfect?'perfect':null,curve:null});setBall(s,side,l);
  sw.hit=true;s.shots++;s.power=perfect;p.hits++;
  const kind=soft?'soft':perfect?'perfect':['left','straight','right'][aimSide(axis)+1];p.lastShot=kind;
  s.shot={side,x:l.x,z:l.z,angle,kind,at:s.elapsed};s.flash=1;s.hitstop=perfect?.07:.05;
  const event=perfect?'perfect':soft?'soft':'hit';s.events.push({type:event,side});
  addEnergy(s,side,Math.round((soft?0:perfect?SKILLS.gainPerfect:SKILLS.gainHit)*k.energy),s.events);
  post(s,hitMsg(s,side,event));
}
// core.mjs whiffReason, in side's view.
function whiffReason(k,lx,sw){
  const r=zoneAt(k,lx),f=sw.first,l=sw.last,lateral=o=>Math.abs(o.dx)<=k.width;
  if(!f||(!f.inc&&!l.inc))return {reason:'none'};
  if(sw.side)return {reason:'reach',side:sw.side};
  if(l.inc&&l.z>r.far&&lateral(l))return {reason:'early'};
  if(f.inc&&f.z<r.near&&lateral(f))return {reason:'late'};
  return {reason:'unclear'};
}
const L1={},L2={},L3={};
function movePlayer(s,side,axis,dt){
  const p=s.players[side],k=p.kit,sw=p.swing;p.held=axis;
  // Planted while a swing can still connect, or while the ball sits in the box (core.mjs tick).
  if(!(sw&&!sw.hit&&!sw.whiffed)&&!(!sw&&inRange(s,side,localBall(s,side,L1))))p.x=clamp(p.x+localX(side,axis*RUN*k.run*dt),-3.45,3.45);
  if(sw){
    sw.time+=dt;
    if(!sw.hit&&!sw.whiffed&&sw.time>k.windup+k.active){sw.whiffed=true;p.whiff=whiffReason(k,localX(side,p.x),sw);s.events.push({type:'whiff',side});}
    if(sw.time>k.windup+k.active+k.recovery+(sw.whiffed?k.whiff:0))p.swing=null;
  }
}
// A player decided elsewhere: its swing clock runs on between position messages, so its punch keeps moving.
function driftSwing(p,dt){const sw=p.swing,k=p.kit;if(!sw)return;sw.time+=dt;if(sw.time>k.windup+k.active+k.recovery+(sw.whiffed?k.whiff:0))p.swing=null;}
function watchWindow(s,side){
  const p=s.players[side],k=p.kit,sw=p.swing;if(!sw||sw.hit||sw.time<k.windup||sw.time>k.windup+k.active)return;
  const l=localBall(s,side,L1),lx=localX(side,p.x),r=zoneAt(k,lx),dx=l.x-lx,inc=l.vz<0;sw.first??={z:l.z,dx,inc};sw.last={z:l.z,dx,inc};
  if(inc&&l.z>=r.near&&l.z<=r.far&&Math.abs(dx)>k.width)sw.side=Math.sign(dx);
}
function scoreGoal(s,shooter,x,l){
  s.score[shooter]++;s.lastGoal={by:shooter,x,vx:l.vx,vz:l.vz,key:false,n:s.score[shooter]};
  s.hitstop=.12;s.rally=1;s.power=false;s.hold=false;for(const side of SIDES)s.players[side].swing=null;
  s.events.push({type:'goal',side:shooter});
  if(s.score[shooter]>=DUEL.goals){s.phase='won';s.winner=shooter;s.events.push({type:'win',side:shooter});}
  else{s.phase='goal';s.countdown=DUEL.goalDelay;s.serveTo=other(shooter);}
  post(s,{type:'goal',side:shooter,score:{...s.score},lastGoal:{...s.lastGoal},ball:copyBall(s.ball),winner:s.winner,serveTo:s.serveTo});
}
// The receiver's end, judged in the shooter's view exactly like the single-player far end: inside the mouth at the goal
// line is a goal, anything else comes back off the end wall with the board's small deflection.
function farEnd(s,shooter,prev,l,wall){
  const at=line=>wall?l.x:prev.x+(l.x-prev.x)*(line-prev.z)/(l.z-prev.z);
  const goalX=prev.z<GOAL_Z&&l.z>=GOAL_Z?at(GOAL_Z):null;
  if(goalX!==null&&Math.abs(goalX)<=DUEL.goalHalf){scoreGoal(s,shooter,goalX,l);return;}
  if(l.z>FAR_WALL){
    l.z=2*FAR_WALL-l.z;const angle=clamp(Math.atan2(l.vx,l.vz)+s.boardAngle,-.76,.76),speed=DUEL.speed*s.rally;
    Object.assign(l,{vx:Math.sin(angle)*speed,vz:-Math.cos(angle)*speed,z0:l.z,z1:kitOf(s,shooter).sweet,curve:null,kind:null});setBall(s,shooter,l);
    s.power=false;s.events.push({type:'wide',side:shooter});post(s,{type:'wide',side:shooter,ball:copyBall(s.ball)});
  }
}
function tick(s,dt,inputs){
  s.flash=Math.max(0,s.flash-dt*2);
  if(s.hitstop>0){s.hitstop=Math.max(0,s.hitstop-dt);return;}
  if(s.phase==='skill'){const k=s.skill,B=SKILLS.burst,before=k.time;k.time=Math.min(B.duration,k.time+dt);
    if(before<B.strike&&k.time>=B.strike)s.events.push({type:'burstStrike',side:k.side});
    if(k.time>=B.duration-1e-9&&s.auth[k.side])launchBurst(s,k.side,inputs[k.side]?.axis??0);return;}
  s.elapsed+=dt;s.boardAngle=Math.sin(s.elapsed*.65)*.15;
  for(const side of SIDES)if(!s.auth[side])driftSwing(s.players[side],dt);
  if(s.phase!=='playing'){s.countdown-=dt;if(s.countdown<=0){if(s.auth[s.serveTo])doServe(s);else s.hold=true;}return;}
  for(const side of SIDES)if(s.auth[side])movePlayer(s,side,inputs[side]?.axis??0,dt);
  if(s.hold)return;
  const rcv=s.ball.vz>0?'b':'a',shooter=other(rcv),prev=localBall(s,shooter,L2);
  const wall=flyBall(s,dt);if(wall){s.events.push({type:'wall'});if(s.shot?.side===shooter)s.shot.banked=true;}
  for(const side of SIDES)if(s.auth[side])watchWindow(s,side);
  const l=localBall(s,shooter,L3);
  if(l.z>=GOAL_Z){
    // Decided elsewhere: stop on the line until that side says what happened.
    if(!s.auth[rcv]){l.z=GOAL_Z;setBall(s,shooter,l);s.hold=true;return;}
    farEnd(s,shooter,prev,l,wall);return;
  }
  const p=s.players[rcv],sw=p.swing;
  if(s.auth[rcv]&&sw&&!sw.hit&&sw.time>=p.kit.windup&&sw.time<=p.kit.windup+p.kit.active){
    const lr=localBall(s,rcv,L1);
    // Whether the ball was already in range when the window opened decides clean hit vs. soft contact.
    if(sw.armed===null)sw.armed=inRange(s,rcv,lr);
    if(inRange(s,rcv,lr))strike(s,rcv,lr,inputs[rcv]?.axis??0);
  }
}
// inputs: {a:{axis}, b:{axis}}, each axis in that player's own view (-1 left … 1 right).
export function stepDuel(s,dt,inputs={}){
  // Events raised between steps (commands, other side's messages) are delivered first, even into a finished match.
  s.events=s.queued.length?s.queued.splice(0):[];
  if(!DUEL_ACTIVE.includes(s.phase)||!Number.isFinite(dt)||dt<=0)return;
  const ins={};for(const side of SIDES){const a=inputs[side]?.axis;ins[side]={axis:Number.isFinite(a)?clamp(a,-1,1):0};}
  s.accumulator+=Math.min(dt,1);
  while(s.accumulator>=1/120&&DUEL_ACTIVE.includes(s.phase)){
    const pose=s.pose??={};pose.ax=s.players.a.x;pose.bx=s.players.b.x;pose.x=s.ball.x;pose.z=s.ball.z;
    tick(s,1/120,ins);s.accumulator-=1/120;
  }
}
// What pressing swing now would produce for side holding `axis` (its view): the real rules run on a copy.
export function duelSwingPreview(s,side,axis=0){
  const p=s.players[side];if(s.phase!=='playing'||p.swing||s.hold||!s.auth[side]||localBall(s,side,L1).vz>=0)return {kind:'none'};
  const c=structuredClone(s);c.events=[];c.queued=[];c.outbox=[];c.hitstop=0;duelAttack(c,side);
  const ins={a:{axis:0},b:{axis:0}};ins[side].axis=axis;
  for(let i=0;i<240;i++){const sw=c.players[side].swing;if(!sw||sw.hit||c.phase!=='playing'||c.hold||localBall(c,side,L1).vz>=0)break;tick(c,1/120,ins);}
  if(!c.players[side].swing?.hit)return {kind:'whiff'};
  const shot=c.shot;return {kind:shot.kind==='soft'?'soft':shot.kind==='perfect'?'perfect':'clean',angle:shot.angle,x:shot.x,z:shot.z};
}

// --- Messages from the other side ----------------------------------------------------------------------------------
// Flies the ball on by `steps` fixed steps with no rule reading it, so a decision that arrived late catches up with the
// sender's clock. It never carries the ball over the line ahead of it: that line is judged by a real step.
function catchUp(s,steps){
  for(let i=steps;i>0;i--){const shooter=s.ball.vz>0?'a':'b';flyBall(s,1/120);const l=localBall(s,shooter,L1);
    if(l.z>=GOAL_Z-1e-3){l.z=GOAL_Z-1e-3;setBall(s,shooter,l);break;}}
}
// The sender's hit-stop over the first of those steps, counted down exactly as tick does it (so 0.05 may hold one step
// longer than 6), then the steps left to fly: [stop left, steps].
function stopThenFly(stop,steps){let h=stop||0;while(steps>0&&h>0){h=Math.max(0,h-1/120);steps--;}return [h,steps];}
// age: seconds since the sender made the decision (duel-net.mjs estimates it from the clocks).
export function applyMessage(s,msg,age=0){
  age=Math.max(0,age);const steps=Math.round(age*120);
  if(msg.type==='serve'){copyBall(msg.ball,s.ball);s.serves=msg.serves;s.phase='playing';s.hold=false;for(const side of SIDES)s.players[side].swing=null;s.power=false;s.queued.push({type:'serve',side:s.serveTo});catchUp(s,steps);}
  else if(msg.type==='hit'){
    const p=s.players[msg.side];copyBall(msg.ball,s.ball);s.rally=msg.rally;p.energy=msg.energy;s.power=msg.power;p.lastShot=msg.shot.kind;p.hits++;s.shots++;
    s.shot={...msg.shot,at:s.elapsed};s.flash=1;s.hold=false;if(s.phase==='skill'){s.skill=null;s.phase='playing';}
    const [stop,fly]=stopThenFly(msg.stop,steps);s.hitstop=stop;s.queued.push({type:msg.event,side:msg.side});catchUp(s,fly);
  }
  else if(msg.type==='wide'){copyBall(msg.ball,s.ball);s.power=false;s.hold=false;s.queued.push({type:'wide',side:msg.side});catchUp(s,steps);}
  else if(msg.type==='burstStart'){s.skill={kind:'burst',side:msg.side,id:msg.id,time:Math.min(SKILLS.burst.duration,age),x:msg.x,z:msg.z};s.phase='skill';s.players[msg.side].swing=null;s.queued.push({type:'burstStart',side:msg.side});}
  else if(msg.type==='goal'){
    s.score={...msg.score};s.lastGoal={...msg.lastGoal};copyBall(msg.ball,s.ball);s.hitstop=stopThenFly(.12,steps)[0];s.rally=1;s.power=false;s.hold=false;s.skill=null;
    for(const side of SIDES)s.players[side].swing=null;s.queued.push({type:'goal',side:msg.side});
    if(msg.winner){s.phase='won';s.winner=msg.winner;s.queued.push({type:'win',side:msg.winner});}
    else{s.phase='goal';s.countdown=DUEL.goalDelay-age;s.serveTo=msg.serveTo;}
  }
}
