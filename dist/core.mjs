// goalHalf: half width of the far goal mouth. keeper: reaction delay (s), lateral speed, aim error amplitude, and from
// level 3 on: read (how far it starts toward a direction held once the defender is planted, as a share of the aim
// mark), pattern (lean toward the side the last aims predict) and recover (speed share for getting back between shots).
// practice: misses forgiven at the start of a level. Levels 1-3 keep ball speed and goal width fixed so
// each one teaches a single thing through the keeper alone; later levels change one variable at a time, with the
// keeper's speed raised alongside the faster ball (5) so a plain shot to the open side is not a sure goal.
// Ball pace (user request, 2026-10-27): the game runs PACE times faster than these authored numbers. Ball speeds, the
// serve's sideways drift, the burst cap and the striker's run scale up with it, and the keeper moves PACE times faster
// after a reaction PACE times shorter, so every chase keeps its geometry. Swing timings stay as they are (they are the
// player's reactions); the first-visit tutorial keeps its own slow serves.
export const PACE=1.5;
export const LEVELS = [
  {name:'初次交锋',tag:'接住来球，打进第一球',lesson:'等球的影子进入亮框再挥击。挥击时按住 ← 或 →，球就往那边飞。',goals:2,practice:3,shade:0,speed:4,goalHalf:2.6,keeper:{delay:.7,speed:.35,error:.6},color:'#286659'},
  {name:'左右开弓',tag:'按住方向，指哪打哪',lesson:'门将守住了正中。挥击时按住 ← 打左边，按住 → 打右边，看准它站哪边。',goals:3,practice:2,shade:0,speed:4,goalHalf:2.6,keeper:{delay:.55,speed:.6,error:.5},color:'#316988'},
  {name:'预判时刻',tag:'重炮、旋转与借墙',lesson:'普通变向会被追上。在橙色甜点出手打重炮，用旋转绕过门将，或早一点出手按住方向，借那侧的墙弹到另一边。',goals:3,practice:1,shade:0,speed:4,goalHalf:2.6,keeper:{delay:.45,speed:1.3,error:.45,read:.5,pattern:.3,recover:.7},color:'#5c5a8b'},
  {name:'封角对决',tag:'门将会提前封住你这一侧',lesson:'门将会往你接球的一侧靠，还会盯着你在框里按的方向。按住另一侧打对角，或最后一刻再换方向骗它。',goals:4,practice:0,shade:.5,speed:4,goalHalf:2.6,keeper:{delay:.45,speed:1.3,error:.45,read:.6,pattern:.3,recover:.6},color:'#867045'},
  {name:'节奏大师',tag:'球更快了，稳住节奏',lesson:'球更快，门将也更快。别一直左右交替，它会摸清你的规律。',goals:4,practice:0,shade:.5,speed:4.7,goalHalf:2.6,keeper:{delay:.45,speed:1.45,error:.45,read:.7,pattern:.5,recover:.8},color:'#8b574d'},
  {name:'守门王牌',tag:'球门变窄，综合运用',lesson:'球门更窄、门将会读招。变向、重炮、旋转都要用上，出手前别暴露方向。',goals:5,practice:0,shade:.6,speed:4.7,goalHalf:2.2,keeper:{delay:.4,speed:1.5,error:.4,read:.8,pattern:.5,recover:.9},color:'#285b54'}
].map(l=>({...l,speed:l.speed*PACE,keeper:{...l.keeper,speed:l.keeper.speed*PACE,delay:l.keeper.delay/PACE}}));
// whiff: extra recovery after an empty swing, so mashing leaves gaps the ball can slip through.
export const WEAPONS = {
  glove:{name:'拳套',subtitle:'快出手 · 灵活补位',width:.9,reach:1,windup:.03,active:.12,recovery:.14,whiff:.5}
};
// The striker's run speed (m/s), scaled with the pace.
export const RUN=6.2*PACE;
export const PLAYER_Z=1.6,MAX_AIM=.45,PERFECT_BAND=.3,RALLY_STEP=1.05,RALLY_CAP=1.6,POWER=1.35,SOFT=.8,HIT_HEIGHT=.73,ARC=.9;
// Aim: left/right held at contact sends the ball to that side of the goal mouth, AIM_SHARE of its half width out;
// nothing held goes straight, pulled in to the same mark when the defender stands outside it. Spins land further out.
export const AIM_SHARE=.8,SPIN_SHARE=.9;
// Bank shot, from level BANK_FROM (index) on: a clean contact in front of the power band with a side held goes into that
// side wall and comes off it to the other side's aim mark. A goal scores GOAL_SCORE by side-wall bounces (two or more
// count as two), times the height zone's mult.
export const BANK_FROM=2,GOAL_SCORE=[1000,1500,2500];
// Height zones: timing picks the ball's line. An early contact lobs slower (EARLY_SPEED) into the top of the mouth, the
// power band drives through the middle, a late contact skims low and quicker (LATE_SPEED), a soft one low; skills fly
// through the middle. Only the zone enters the rules (the goal's mult); h is the drawn height at the goal line, loft
// scales the drawn arc and color marks the zone on screen. The mouth is GOAL_TOP tall, split in equal thirds.
export const GOAL_TOP=1.25,EARLY_SPEED=.85,LATE_SPEED=1.05;
export const ZONES={low:{mult:1,h:.21,loft:.35,color:'#8fd3ff'},mid:{mult:2,h:.62,loft:.6,color:'#ff8a3c'},top:{mult:3,h:1.04,loft:1.5,color:'#ffd84d'}};
// Perfect chain (single player, not in the tutorial): perfect returns in a row. The bonus-th in a row scores
// bonusScore; the fire-th arms a fireball and the chain starts over. The next contact of any kind takes the fireball:
// it goes through the keeper, though it still has to find the mouth.
export const CHAIN={bonus:3,bonusScore:500,fire:5};
// Player styles (single player): each figure plays one (characters.mjs PLAYERS), a small strength paired with a small
// cost. run scales RUN, width the hit box's width, power the power shot's speed, recovery the swing's recovery, and
// spinCost replaces the spin's energy cost. 'balanced' changes nothing.
export const STYLES={balanced:{},agile:{run:1.1,width:.95},power:{power:1.1,recovery:1.4},skill:{spinCost:40,power:.95},guard:{width:1.1,run:.95}};
export const KEEPER_Z=9.3,FAR_WALL=9.8,GOAL_Z=9.7,SIDE=3.82,KEEPER_REACH=.55;
export const ACTIVE_PHASES=['playing','serving','miss','goal','skill'];
// Active skills, all first-round playtest values in one place. Energy lives only in the match state.
export const SKILLS={max:100,start:50,gainHit:12,gainPerfect:25,
  spin:{cost:50,angle:.22,curve:.06,maxAngle:.65,curveShare:.7},
  // Burst show beats in seconds (user-requested longer, punchier show): freeze → push in → hold → strike → return → launch.
  burst:{cost:100,widthScale:1.15,frontExtra:.15,speedScale:1.65,maxSpeed:12.5*PACE,duration:1.1,freeze:.12,push:.45,strike:.75,release:.85}};
// Goal camera (presentation only; rules never read it). Key goals get the full show: the camera starts moving camStart
// sim-seconds before the ball reaches the goal line, the sim runs at `slow` for the last slowWindow, then the shot is held
// for `hold` and the camera returns over `back` (real seconds, inside the 1.2 s before the next serve). Other goals get
// a brief push-in capped at weight `brief`.
export const GOAL_CAM={camStart:.45,slowWindow:.22,slow:.3,hold:.6,back:.45,brief:.35};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const sweetZ=(s,w)=>s.player.z+w.reach*.5;
const styleOf=s=>STYLES[s.style]??STYLES.balanced;
// The glove as this player's style plays it (hit box width, swing recovery); built once per weapon and style.
const GEAR=new Map();
export function playerGear(s){
  const key=s.weapon+'|'+s.style;let g=GEAR.get(key);
  if(!g){const w=WEAPONS[s.weapon],st=styleOf(s);g={...w,width:w.width*(st.width??1),recovery:w.recovery*(st.recovery??1)};GEAR.set(key,g);}
  return g;
}
// A skill's energy cost for this player: a style may cheapen the spin.
export function skillCost(s,kind){return kind==='spin'?styleOf(s).spinCost??SKILLS.spin.cost:SKILLS[kind].cost;}
const aimSide=axis=>axis<-.5?-1:axis>.5?1:0;
// Heading from (x, z) to the aimed mark on the goal line. Timing never enters it: timing decides power and height.
export function aimAngle(s,x,z,axis){const g=s.level.goalHalf*AIM_SHARE,d=aimSide(axis);return Math.atan2((d?d*g:clamp(x,-g,g))-x,GOAL_Z-z);}
// Folds a straight-line x back between the side walls, as repeated bounces would.
export function foldX(raw){const period=4*SIDE;let u=((raw+SIDE)%period+period)%period;if(u>2*SIDE)u=period-u;return u-SIDE;}
// Heading from (x, z) into the held side's wall so the ball comes off it onto the other side's mark.
export function bankAngle(s,x,z,axis){const d=aimSide(axis);return Math.atan2(d*(2*SIDE+s.level.goalHalf*AIM_SHARE)-x,GOAL_Z-z);}
// Starts a new leg from the height the ball is drawn at now; a shot (zone given) ends at its zone's height.
function launch(b,z1,zone=null){
  b.h0=b.z0===undefined?HIT_HEIGHT:ballHeight({ball:b});b.z0=b.z;b.z1=z1;
  b.h1=zone?ZONES[zone].h:HIT_HEIGHT;b.loft=zone?ZONES[zone].loft:1;
}
// One fixed step of ball flight, shared by the simulation and every prediction. A spinning ball turns its
// heading by curvature × distance until its stop depth; any side-wall bounce reflects it and ends the spin.
// Returns -1/1 when a side wall was hit this step, else 0.
export function advanceBall(b,dt){
  const c=b.curve;
  if(c){const v=Math.hypot(b.vx,b.vz),a=clamp(Math.atan2(b.vx,b.vz)+c.k*v*dt,-SKILLS.spin.maxAngle,SKILLS.spin.maxAngle);b.vx=Math.sin(a)*v;b.vz=Math.cos(a)*v;}
  b.x+=b.vx*dt;b.z+=b.vz*dt;
  if(c&&b.z>=c.stopZ)b.curve=null;
  let wall=0;
  if(b.x>SIDE){b.x=2*SIDE-b.x;b.vx=-Math.abs(b.vx);wall=1;}
  if(b.x< -SIDE){b.x=-2*SIDE-b.x;b.vx=Math.abs(b.vx);wall=-1;}
  if(wall)b.curve=null;
  return wall;
}
// The keeper puts every new ball into play, alternating sides.
// First-visit tutorial for level 1. Its slow serves, fixed keeper and forgiving outcomes live only on
// s.tutorial; a finished or skipped tutorial is replaced by a fresh createGame(), so nothing carries over.
function tutorialServe(s){
  const t=s.tutorial,z=KEEPER_Z-.3;s.swing=null;t.shotStep=-1;
  if(t.step===0)s.ball={x:s.player.x,z,vx:0,vz:-2.6};
  else if(t.step===1)s.ball={x:s.player.x>0?-2.3:2.3,z,vx:0,vz:-2.8};
  else{t.keeperX=(t.attempt%2?1:-1)*1.5;s.keeper.x=s.keeper.target=t.keeperX;s.ball={x:0,z,vx:0,vz:-3};}
  launch(s.ball,sweetZ(s,WEAPONS[s.weapon]));
}
// Ends a tutorial rally without touching lives, practice or the goal count.
function tutorialReset(s,event){s.events.push(event);s.swing=null;s.power=false;s.rally=1;s.phase='miss';s.countdown=1;}
function serve(s){
  if(s.tutorial){tutorialServe(s);return;}
  const z=KEEPER_Z-.3,dir=(s.misses+s.goals)%2?-1:1;
  s.ball={x:clamp(s.keeper.x,-1.5,1.5),z,vx:.65*PACE*dir,vz:-s.level.speed};launch(s.ball,sweetZ(s,WEAPONS[s.weapon]));s.swing=null;
}
export function createGame(level=0,weapon='glove',options={}){
  const levelIndex=clamp(Math.floor(Number(level)||0),0,LEVELS.length-1);
  return {levelIndex,level:LEVELS[levelIndex],weapon:WEAPONS[weapon]?weapon:'glove',style:STYLES[options.style]?options.style:'balanced',phase:'ready',
    ball:{x:0,z:KEEPER_Z-.3,vx:.65,vz:-LEVELS[levelIndex].speed,z0:KEEPER_Z-.3,z1:PLAYER_Z},player:{x:0,z:PLAYER_Z},
    keeper:{x:0,target:0,delay:0,err:0,dive:0,diveDir:0},practiceLeft:LEVELS[levelIndex].practice||0,shot:null,
    goals:0,hits:0,misses:0,combo:0,bestCombo:0,score:0,elapsed:0,boardAngle:0,swing:null,
    rally:1,power:false,shots:0,hitstop:0,lastShot:'',held:0,aims:[],chase:null,missCause:null,chain:0,fire:false,
    energy:options.tutorial&&levelIndex===0?0:SKILLS.start,skill:null,skillSeq:0,queued:[],
    whiff:null,tutorial:options.tutorial&&levelIndex===0?{step:0,attempt:0,shotStep:0,keeperX:0,done:false}:null,
    countdown:.8,flash:0,lastHit:'',events:[],accumulator:0,previousPhase:null};
}
export function startGame(s){if(s.phase==='ready'){serve(s);s.phase='serving';s.countdown=.8;}}
export function attack(s){
  if(s.phase!=='playing'||s.swing)return false;
  s.swing={time:0,hit:false,armed:null,whiffed:false};s.events.push('swing');return true;
}
export function pauseGame(s){if(ACTIVE_PHASES.includes(s.phase)){s.previousPhase=s.phase;s.phase='paused';}}
export function resumeGame(s){if(s.phase==='paused'){s.phase=s.previousPhase||'playing';s.previousPhase=null;}}
// The exact rectangle a swing can connect in, and the band inside it that yields a power shot.
export function hitZone(s){
  const w=playerGear(s),sweet=sweetZ(s,w),band=PERFECT_BAND*w.reach*.5;
  return {left:s.player.x-w.width,right:s.player.x+w.width,near:s.player.z-.12,far:s.player.z+w.reach,sweetNear:sweet-band,sweetFar:sweet+band};
}
export function inHitRange(s){
  const b=s.ball,r=hitZone(s);
  return s.phase==='playing'&&b.vz<0&&b.x>=r.left&&b.x<=r.right&&b.z>=r.near&&b.z<=r.far;
}
// What pressing swing right now would produce holding `axis`: runs the real rules on a copy (the swing pins the player).
export function swingPreview(s,axis=0){
  if(s.phase!=='playing'||s.swing||s.ball.vz>=0)return {kind:'none'};
  const c=structuredClone(s);c.events=[];c.hitstop=0;attack(c);
  for(let i=0;i<240&&c.swing&&!c.swing.hit&&c.phase==='playing'&&c.ball.vz<0;i++)tick(c,1/120,axis);
  if(!c.swing?.hit)return {kind:'whiff'};
  return {kind:c.lastShot==='soft'?'soft':c.lastShot==='perfect'?'perfect':'clean',angle:Math.atan2(c.ball.vx,c.ball.vz),x:c.ball.x,z:c.ball.z};
}
// Where an outgoing ball will cross the goal line, folding in side-wall bounces (which the keeper ignores).
export function crossingFrom(x,z,vx,vz,s){
  const raw=x+vx/vz*(GOAL_Z-z),at=foldX(raw);
  return {x:at,viaWall:Math.abs(raw)>SIDE,inMouth:Math.abs(at)<=s.level.goalHalf,blocked:Math.abs(at-s.keeper.x)<=KEEPER_REACH};
}
export function predictCrossing(s){const b=s.ball;return b.vz>0?crossingFrom(b.x,b.z,b.vx,b.vz,s):null;}
// Visual height only: each leg of flight is a parabola from its start height (h0) to its end height (h1), both hitting
// height unless set by launch; a shot ends at its zone's height on the goal line.
// Drawn height only (no rule reads it). One fixed gravity: the apex follows the flight time over the span, so a fast
// ball flies flat and a slow one lobs; a shot's zone scales it (loft). GRAVITY keeps level 1's serve (speed 4·PACE) at
// the old ARC apex; MAX_APEX caps slow lobs.
export const GRAVITY=8*ARC/((KEEPER_Z-.3-PLAYER_Z)/(4*PACE))**2,MAX_APEX=1.5;
export function ballHeight(s){
  const b=s.ball,span=(b.z1??PLAYER_Z)-(b.z0??b.z),h0=b.h0??HIT_HEIGHT,h1=b.h1??HIT_HEIGHT;
  const u=Math.abs(span)<1e-6?1:clamp((b.z-b.z0)/span,0,1),time=Math.abs(span)/Math.max(1e-6,Math.abs(b.vz??0));
  return h0+(h1-h0)*u+Math.min(MAX_APEX,GRAVITY*time*time/8*(b.loft??1))*4*u*(1-u);
}
// The last three aimed sides (-1, 0, 1), which a pattern-reading keeper leans on.
function noteAim(s,side){s.aims.push(side);if(s.aims.length>3)s.aims.shift();}
// Alternating sides predicts the side before last; repeating one predicts it again; anything else predicts nothing.
// Three in a row of the same pattern is read with full confidence, two with a little over half.
function predictSide(s){
  const a=s.aims,n=a.length;if(n<2||!a[n-1]||!a[n-2])return 0;
  const alt=a[n-1]===-a[n-2],next=alt?-a[n-1]:a[n-1],sure=n>=3&&a[n-3]&&(alt?a[n-3]===-a[n-2]:a[n-3]===a[n-2]);
  return next*(sure?1:.6);
}
function strike(s,w,sw,axis){
  const b=s.ball,t=clamp((b.z-sweetZ(s,w))/(w.reach*.5),-1,1);
  const soft=!sw.armed,perfect=!soft&&Math.abs(t)<=PERFECT_BAND;
  const bank=!soft&&t>PERFECT_BAND&&aimSide(axis)!==0&&s.levelIndex>=BANK_FROM&&!s.tutorial;
  const angle=bank?bankAngle(s,b.x,b.z,axis):aimAngle(s,b.x,b.z,axis);
  // Timing picks the line (ZONES): early lobs high and slow, the power band drives through the middle, late skims low.
  const zone=perfect?'mid':!soft&&t>PERFECT_BAND?'top':'low';
  s.rally=Math.min(RALLY_CAP,s.rally*RALLY_STEP);
  const v=s.level.speed*s.rally*(perfect?POWER*(styleOf(s).power??1):soft?SOFT:zone==='top'?EARLY_SPEED:LATE_SPEED);
  b.vx=Math.sin(angle)*v;b.vz=Math.cos(angle)*v;launch(b,GOAL_Z,zone);
  sw.hit=true;s.shots++;s.power=perfect;
  // The keeper reacts late and misjudges by a deterministic amount that varies shot to shot.
  s.keeper.delay=s.level.keeper.delay;s.keeper.err=s.level.keeper.error*Math.sin(s.shots*2.3+s.levelIndex);
  s.hits++;s.combo++;s.bestCombo=Math.max(s.bestCombo,s.combo);s.score+=perfect?150:100;
  // A bank is noted on the side it lands, which is what a pattern-reading keeper guesses at.
  s.lastShot=soft?'soft':perfect?'perfect':bank?'bank':['left','straight','right'][aimSide(axis)+1];noteAim(s,bank?-aimSide(axis):aimSide(axis));
  s.shot={x:b.x,z:b.z,angle,kind:s.lastShot,at:s.elapsed,zone,fire:takeFire(s)};
  s.lastHit=perfect?'漂亮回击':'成功回击';s.flash=1;
  // Every contact holds the frame for a moment (user request, 2026-10-27); a perfect strike holds longer.
  s.hitstop=perfect?.07:.05;
  s.events.push(perfect?'perfect':soft?'soft':'hit');
  if(!s.tutorial)chainStep(s,perfect);
  b.kind=perfect?'perfect':null;b.curve=null;
  if(!s.tutorial)addEnergy(s,soft?0:perfect?SKILLS.gainPerfect:SKILLS.gainHit,s.events);
  const tu=s.tutorial;if(tu){tu.shotStep=tu.step;if(tu.step<2){tu.step++;s.events.push('tutorialStep');}}
}
// --- Active skills -------------------------------------------------------------------------------
// Perfect chain bookkeeping (CHAIN) for a return: other returns break it, the milestones pay out.
function chainStep(s,perfect){
  if(!perfect){s.chain=0;return;}
  s.chain++;if(s.chain===CHAIN.bonus){s.score+=CHAIN.bonusScore;s.events.push('chain3');}
  if(s.chain>=CHAIN.fire){s.chain=0;s.fire=true;s.events.push('fireReady');}
}
// An armed fireball goes on the contact that asks for it.
function takeFire(s){const fire=s.fire;s.fire=false;return fire;}
function addEnergy(s,n,events){
  if(n<=0)return;const before=s.energy;s.energy=Math.min(SKILLS.max,before+n);events.push('energy');
  const spin=skillCost(s,'spin');if(before<spin&&s.energy>=spin)events.push('energy50');
  if(before<SKILLS.max&&s.energy>=SKILLS.max)events.push('energy100');
}
// A spin bends toward the held side (with nothing held, away from the keeper; left when it stands central) and lands
// on the SPIN_SHARE mark on that side. The launch angle is solved by bisection on the curved path, walls
// ignored: the landing only grows with the angle, and from inside the walls the path to an in-mouth mark stays inside.
function spinShot(s,x,z,axis){
  const cfg=SKILLS.spin,dir=aimSide(axis)||(s.keeper.x>=0?-1:1),v=s.level.speed*Math.min(RALLY_CAP,s.rally*RALLY_STEP);
  const curve={k:dir*cfg.curve,stopZ:z+(KEEPER_Z-z)*cfg.curveShare},mark=dir*s.level.goalHalf*SPIN_SHARE,dt=1/120;
  const land=a0=>{let a=a0,bx=x,bz=z;for(let i=0;i<2400;i++){
    if(bz<curve.stopZ)a=clamp(a+curve.k*v*dt,-cfg.maxAngle,cfg.maxAngle);
    const nx=bx+Math.sin(a)*v*dt,nz=bz+Math.cos(a)*v*dt;if(nz>=GOAL_Z)return bx+(nx-bx)*(GOAL_Z-bz)/(nz-bz);bx=nx;bz=nz;}return bx;};
  let lo=-cfg.maxAngle,hi=cfg.maxAngle;for(let i=0;i<24;i++){const mid=(lo+hi)/2;if(land(mid)<mark)lo=mid;else hi=mid;}
  return {dir,angle:(lo+hi)/2,v,curve};
}
const inRect=(b,r)=>b.x>=r.left&&b.x<=r.right&&b.z>=r.near&&b.z<=r.far;
// Burst is a little more forgiving than the gear's own zone: wider and a touch further out, never further back.
export function burstZone(s){
  const w=playerGear(s),r=hitZone(s),half=w.width*SKILLS.burst.widthScale;
  return {...r,left:s.player.x-half,right:s.player.x+half,far:r.far+SKILLS.burst.frontExtra};
}
// Read-only: whether a skill would be accepted right now, and if not, the reason to show the player.
export function skillStatus(s,kind){
  const cfg=SKILLS[kind];
  if(!cfg||kind==='max')return {ok:false,reason:'state'};
  if(s.tutorial)return {ok:false,reason:'tutorial'};
  if(s.skill)return {ok:false,reason:'charging'};
  if(s.phase!=='playing')return {ok:false,reason:'state'};
  if(s.swing||s.skill)return {ok:false,reason:'busy'};
  if(s.energy<skillCost(s,kind))return {ok:false,reason:'energy'};
  if(!(s.ball.vz<0&&inRect(s.ball,kind==='burst'?burstZone(s):hitZone(s))))return {ok:false,reason:'window'};
  return {ok:true};
}
// Shared bookkeeping for a skill contact: counted once, scored as a plain contact, never as a perfect; it flies through
// the middle zone.
function registerContact(s,b,angle,kind,id,events){
  s.shots++;s.power=false;s.flash=1;
  s.keeper.delay=s.level.keeper.delay;s.keeper.err=s.level.keeper.error*Math.sin(s.shots*2.3+s.levelIndex);
  s.hits++;s.combo++;s.bestCombo=Math.max(s.bestCombo,s.combo);s.score+=100;
  s.lastShot=kind;s.shot={x:b.x,z:b.z,angle,kind,at:s.elapsed,id,zone:'mid',fire:takeFire(s)};events.push(kind);
}
// The first accepted action takes the lock: it spends energy exactly once. Spin strikes immediately;
// burst freezes the rally and strikes when its own clock reaches the duration (see tick).
export function useSkill(s,kind,axis=0){
  const status=skillStatus(s,kind);if(!status.ok)return status;
  s.energy-=skillCost(s,kind);
  const w=WEAPONS[s.weapon],id=++s.skillSeq,b=s.ball;
  if(kind==='spin'){
    const {dir,angle,v,curve}=spinShot(s,b.x,b.z,axis);noteAim(s,dir);s.rally=Math.min(RALLY_CAP,s.rally*RALLY_STEP);
    b.vx=Math.sin(angle)*v;b.vz=Math.cos(angle)*v;launch(b,GOAL_Z,'mid');
    b.kind='spin';b.curve=curve;
    registerContact(s,b,angle,'spin',id,s.queued);
    s.swing={time:w.windup,hit:true,armed:true,whiffed:false,skill:'spin'};
  }else{
    s.skill={kind:'burst',id,time:0,x:b.x,z:b.z};s.phase='skill';s.swing=null;s.queued.push('burstStart');
  }
  return {ok:true,id};
}
// The burst reads the held direction when it leaves the glove, so the player can still pick a side during the show.
function launchBurst(s,axis){
  const k=s.skill,b=s.ball,w=WEAPONS[s.weapon],cfg=SKILLS.burst;k.angle=aimAngle(s,k.x,k.z,axis);noteAim(s,aimSide(axis));
  s.rally=Math.min(RALLY_CAP,s.rally*RALLY_STEP);const v=Math.min(cfg.maxSpeed,s.level.speed*s.rally*cfg.speedScale);
  b.x=k.x;b.z=k.z;b.vx=Math.sin(k.angle)*v;b.vz=Math.cos(k.angle)*v;launch(b,GOAL_Z,'mid');b.kind='burst';b.curve=null;
  registerContact(s,b,k.angle,'burst',k.id,s.events);
  s.skill=null;s.phase='playing';s.swing={time:w.windup+w.active,hit:true,armed:true,whiffed:false,skill:'burst'};
}
// Pure prediction of the current outgoing flight, using advanceBall on a copy. Point buffers are reused.
const FLIGHT_X=new Float32Array(48),FLIGHT_Z=new Float32Array(48),SPIN_X=new Float32Array(16),SPIN_Z=new Float32Array(16);
export function predictFlight(s){
  const r=s.ball;if(!(r.vz>0))return null;
  const b={x:r.x,z:r.z,vx:r.vx,vz:r.vz,curve:r.curve?{...r.curve}:null},out={keeper:null,goal:null,wall:null,xs:FLIGHT_X,zs:FLIGHT_Z,count:0};
  const every=Math.max(1,Math.ceil((GOAL_Z-b.z)/b.vz*120/(FLIGHT_X.length-2)));
  FLIGHT_X[0]=b.x;FLIGHT_Z[0]=b.z;out.count=1;
  for(let i=0;i<2400&&b.vz>0;i++){
    const px=b.x,pz=b.z,wall=advanceBall(b,1/120),at=line=>wall?b.x:px+(b.x-px)*(line-pz)/(b.z-pz);
    if(wall&&!out.wall)out.wall={x:wall*SIDE,z:b.z};
    if(out.keeper===null&&pz<KEEPER_Z&&b.z>=KEEPER_Z)out.keeper=at(KEEPER_Z);
    if(pz<GOAL_Z&&b.z>=GOAL_Z){out.goal=at(GOAL_Z);FLIGHT_X[out.count]=out.goal;FLIGHT_Z[out.count]=GOAL_Z;out.count++;break;}
    if(i%every===every-1&&out.count<FLIGHT_X.length-1){FLIGHT_X[out.count]=b.x;FLIGHT_Z[out.count]=b.z;out.count++;}
  }
  return out;
}
// Key goals: the match winner, power, burst and spin shots, fireballs, and any shot that comes off a side wall.
function keyGoal(s,banksAhead=false){return s.goals+1>=s.level.goals||['perfect','burst','spin'].includes(s.lastShot)||!!s.shot?.fire||!!s.shot?.banked||banksAhead;}
// A goal is certain once the keeper cannot reach the ball's crossing point at its line even moving at full speed from
// now with no reaction delay (it moves once per step, before the ball). Returns {x, t, key} or null; read-only.
export function goalLock(s){
  if(s.phase!=='playing'||s.tutorial||!(s.ball.vz>0))return null;
  const r=s.ball,b={x:r.x,z:r.z,vx:r.vx,vz:r.vz,curve:r.curve?{...r.curve}:null},dt=1/120,g=s.level.goalHalf;
  let keeperX=null,keeperSteps=0,banks=false;
  for(let i=1;i<=2400&&b.vz>0;i++){
    const px=b.x,pz=b.z,wall=advanceBall(b,dt),at=line=>wall?b.x:px+(b.x-px)*(line-pz)/(b.z-pz);
    if(wall)banks=true;
    if(keeperX===null&&pz<KEEPER_Z&&b.z>=KEEPER_Z){keeperX=at(KEEPER_Z);keeperSteps=i;}
    if(pz<GOAL_Z&&b.z>=GOAL_Z){
      const x=at(GOAL_Z);if(Math.abs(x)>g)return null;
      if(keeperX!==null&&!s.shot?.fire&&Math.abs(keeperX-s.keeper.x)<=KEEPER_REACH+s.level.keeper.speed*keeperSteps*dt+1e-9)return null;
      return {x,t:i*dt,key:keyGoal(s,banks)};
    }
  }
  return null;
}
// Short arc a spin taken right now would follow (same step function), for the pre-swing hint.
export function spinPreview(s,axis=0,length=2.6){
  const r=s.ball;if(!(r.vz<0))return null;
  const {dir,angle,v,curve}=spinShot(s,r.x,r.z,axis);
  const b={x:r.x,z:r.z,vx:Math.sin(angle)*v,vz:Math.cos(angle)*v,curve};
  SPIN_X[0]=b.x;SPIN_Z[0]=b.z;let count=1;const end=r.z+length,step=length/(SPIN_X.length-1);
  for(let i=0;i<1200&&count<SPIN_X.length&&b.z<end;i++){advanceBall(b,1/120);if(b.z>=SPIN_Z[count-1]+step){SPIN_X[count]=b.x;SPIN_Z[count]=b.z;count++;}}
  return {dir:dir<0?'left':'right',angle,xs:SPIN_X,zs:SPIN_Z,count};
}
function moveKeeper(s,dt){
  const k=s.keeper,K=s.level.keeper,b=s.ball,g=s.level.goalHalf;
  k.dive=Math.max(0,k.dive-dt);
  if(s.tutorial?.step===2&&s.tutorial.shotStep!==1){k.x=k.target=s.tutorial.keeperX;return;}
  let target=0,speed=K.speed*.35;
  if(s.phase==='playing'&&b.vz>0&&b.z>=KEEPER_Z){
    // Beaten: a last lunge straight at the ball, no misread left to apply.
    target=clamp(b.x,-g,g);speed=K.speed;
  }else if(s.phase==='playing'&&b.vz>0){
    if(k.delay>0){k.delay-=dt;return;}
    // Straight-line read only: shots banked off a side wall fool the keeper.
    // The misread fades over the last 0.6s, so slow balls get corrected and fast ones don't.
    const remaining=(KEEPER_Z-b.z)/b.vz;
    target=clamp(b.x+b.vx*remaining+k.err*Math.min(1,remaining/.6),-g,g);speed=K.speed;
  }else if(s.phase==='playing'&&b.vz<0){
    // Between shots the keeper gets back toward the middle. Narrowing the angle: while the defender receives, a
    // shading keeper leans toward that side, so a straight shot from the flank runs into it. A pattern reader also
    // leans toward the side the recent aims predict. Once the ball is in the hit box the defender is planted, so a
    // direction held then is the aim showing: a reading keeper starts across early, and a late switch fools it.
    const mark=g*AIM_SHARE,held=aimSide(s.held);speed=K.speed*(K.recover??(s.level.shade?.5:.35));
    if(s.level.shade)target=foldX(b.x+b.vx*(sweetZ(s,WEAPONS[s.weapon])-b.z)/b.vz)*s.level.shade;
    target=clamp(target+predictSide(s)*mark*(K.pattern||0),-g,g);
    if(K.read&&held&&inHitRange(s)){target=held*mark*K.read;speed=K.speed;}
  }
  k.target=target;k.x+=clamp(target-k.x,-speed*dt,speed*dt);
}
// Only names a cause the recorded window positions support; anything mixed stays 'unclear'.
function whiffReason(s,w,sw){
  const r=hitZone(s),f=sw.first,l=sw.last,lateral=o=>Math.abs(o.dx)<=w.width;
  if(!f||(!f.inc&&!l.inc))return {reason:'none'};
  if(sw.side)return {reason:'reach',side:sw.side};
  if(l.inc&&l.z>r.far&&lateral(l))return {reason:'early'};
  if(f.inc&&f.z<r.near&&lateral(f))return {reason:'late'};
  return {reason:'unclear'};
}
// Why a conceded ball got through, from what the defender did while it came in (s.chase): a whiff names its own cause,
// a swing still out as the ball went past came too late, and otherwise the ball either sat in the box unanswered or
// never reached it. One of early, late, reach, idle, unclear.
function missCause(s,w){
  const c=s.chase,sw=s.swing;
  if(c?.whiff)return c.whiff;
  if(sw&&!sw.hit&&!sw.whiffed){const r=whiffReason(s,w,sw).reason;return r==='none'?'late':r;}
  return c?.reach?'idle':'reach';
}
// The keeper gets one chance as the ball crosses its line; the goal itself is the drawn mouth further back.
function farEnd(s,prevZ,prevX,wall){
  const b=s.ball,k=s.keeper,g=s.level.goalHalf;
  // Fast balls cover ~0.1 per step, so lines are judged where the path actually crossed them.
  const at=line=>wall?b.x:prevX+(b.x-prevX)*(line-prevZ)/(b.z-prevZ);
  const keeperX=prevZ<KEEPER_Z&&b.z>=KEEPER_Z?at(KEEPER_Z):null,goalX=prevZ<GOAL_Z&&b.z>=GOAL_Z?at(GOAL_Z):null;
  if(s.tutorial&&keeperX!==null&&Math.abs(keeperX-k.x)<=KEEPER_REACH){k.dive=.35;k.diveDir=Math.sign(b.x-k.x)||1;s.tutorial.attempt++;tutorialReset(s,'save');return;}
  if(s.tutorial&&goalX!==null&&Math.abs(goalX)<=g){
    if(s.tutorial.shotStep===2){s.tutorial.done=true;s.swing=null;s.phase='tutorial-done';s.events.push('goal','tutorialDone');}
    else tutorialReset(s,'goal');
    return;
  }
  if(s.tutorial&&b.z>FAR_WALL){s.tutorial.attempt+=s.tutorial.shotStep===2?1:0;tutorialReset(s,'wide');return;}
  const reached=keeperX!==null&&Math.abs(keeperX-k.x)<=KEEPER_REACH;
  // A fireball goes through: the keeper still dives at it.
  if(reached&&s.shot?.fire){k.dive=.35;k.diveDir=Math.sign(b.x-k.x)||1;s.events.push('pierce');}
  else if(reached){
    // Saves come back at varied angles, so the defender still has to move. Returns are never skill shots.
    b.x=keeperX;const angle=clamp((b.x-k.x)/KEEPER_REACH*.3+.35*Math.sin(s.shots*1.9+s.levelIndex),-.6,.6),v=s.level.speed*s.rally;
    b.curve=null;b.kind=null;b.z=KEEPER_Z;b.vx=Math.sin(angle)*v;b.vz=-Math.cos(angle)*v;launch(b,sweetZ(s,WEAPONS[s.weapon]));
    k.dive=.35;k.diveDir=Math.sign(b.x-k.x)||1;s.power=false;s.events.push('save');
    return;
  }
  if(goalX!==null&&Math.abs(goalX)<=g){
    const banks=s.shot?.banks||0,zone=s.shot?.zone??null;
    s.lastGoal={x:goalX,vx:b.vx,vz:b.vz,key:keyGoal(s),n:s.goals+1,banks,zone,fire:!!s.shot?.fire};
    s.goals++;s.score+=GOAL_SCORE[Math.min(banks,GOAL_SCORE.length-1)]*(ZONES[zone]?.mult??1);s.hitstop=.12;s.rally=1;s.power=false;s.swing=null;s.events.push('goal');
    if(s.goals>=s.level.goals){s.phase='won';s.events.push('win');}
    else{s.phase='goal';s.countdown=1.2;}
    return;
  }
  if(b.z>FAR_WALL){
    b.z=2*FAR_WALL-b.z;
    const angle=clamp(Math.atan2(b.vx,b.vz)+s.boardAngle,-.76,.76),speed=s.level.speed*s.rally;
    b.vx=Math.sin(angle)*speed;b.vz=-Math.cos(angle)*speed;launch(b,sweetZ(s,WEAPONS[s.weapon]));b.curve=null;b.kind=null;s.power=false;s.events.push('wide');
  }
}
function tick(s,dt,axis){
  s.flash=Math.max(0,s.flash-dt*2);
  if(s.hitstop>0){s.hitstop=Math.max(0,s.hitstop-dt);return;}
  // Burst cinematic: its own clock runs while the ball, both players and match time stay frozen.
  if(s.phase==='skill'){const B=SKILLS.burst,before=s.skill.time;s.skill.time+=dt;
    if(before<B.strike&&s.skill.time>=B.strike)s.events.push('burstStrike');
    if(s.skill.time>=B.duration-1e-9)launchBurst(s,axis);return;}
  s.elapsed+=dt;
  // Small deterministic deflection off the far wall outside the goal mouth.
  s.boardAngle=Math.sin(s.elapsed*.65+s.levelIndex*.8)*.15;
  moveKeeper(s,dt);
  if(s.phase!=='playing'){
    s.countdown-=dt;
    if(s.countdown<=0){if(s.phase!=='serving')serve(s);s.phase='playing';s.events.push('serve');}
    return;
  }
  const w=playerGear(s),sw=s.swing;
  s.held=axis;
  // Once the ball is in the hit box, and while a swing can still connect, the defender is planted: the held direction
  // aims instead of sliding off the ball, so pressing it a beat before the swing is safe.
  if(!(sw&&!sw.hit&&!sw.whiffed)&&!(!sw&&inHitRange(s)))s.player.x=clamp(s.player.x+axis*RUN*(styleOf(s).run??1)*dt,-3.45,3.45);
  if(sw){
    sw.time+=dt;
    if(!sw.hit&&!sw.whiffed&&sw.time>w.windup+w.active){sw.whiffed=true;s.whiff=whiffReason(s,w,sw);s.events.push('whiff');if(s.chase&&s.whiff.reason!=='none')s.chase.whiff=s.whiff.reason;}
    if(sw.time>w.windup+w.active+w.recovery+(sw.whiffed?w.whiff:0))s.swing=null;
  }
  const b=s.ball,prevZ=b.z,prevX=b.x;
  const wall=advanceBall(b,dt);if(wall){s.events.push('wall');if(b.vz>0&&s.shot){s.shot.banked=true;s.shot.banks=(s.shot.banks||0)+1;}}
  // What the defender does about an incoming ball, kept until it goes back out, so a conceded one can say why.
  if(b.vz>0)s.chase=null;else{s.chase??={reach:false,whiff:null};if(inHitRange(s))s.chase.reach=true;}
  if(sw&&!sw.hit&&sw.time>=w.windup&&sw.time<=w.windup+w.active){
    // What the ball was doing while the window was open, so a whiff can be explained honestly.
    const r=hitZone(s),dx=b.x-s.player.x,inc=b.vz<0;sw.first??={z:b.z,dx,inc};sw.last={z:b.z,dx,inc};
    if(inc&&b.z>=r.near&&b.z<=r.far&&Math.abs(dx)>w.width)sw.side=Math.sign(dx);
  }
  if(b.vz>0){farEnd(s,prevZ,prevX,wall);return;}
  if(s.swing&&!sw.hit&&sw.time>=w.windup&&sw.time<=w.windup+w.active){
    // Whether the ball was already in range when the window opened decides clean hit vs. soft contact.
    if(sw.armed===null)sw.armed=inHitRange(s);
    if(inHitRange(s)){strike(s,w,sw,axis);return;}
  }
  if(b.z<=0&&s.tutorial){tutorialReset(s,'tutorialRetry');return;}
  if(b.z<=0){
    s.missCause=missCause(s,w);s.chase=null;
    s.combo=0;s.chain=0;s.rally=1;s.power=false;s.flash=-1;s.swing=null;
    // Practice balls keep the real feel but don't cost a life.
    if(s.practiceLeft>0){s.practiceLeft--;s.events.push('practice');}
    else{s.misses++;s.events.push('miss');}
    if(s.misses>=3){s.phase='lost';s.events.push('lose');}
    else{s.phase='miss';s.countdown=1.1;}
  }
}
export function stepGame(s,dt,axis=0){
  if(!ACTIVE_PHASES.includes(s.phase)||!Number.isFinite(dt)||dt<=0)return;
  // Events raised by commands between frames (skill acceptance) are delivered with this step's events.
  s.events=s.queued?.length?s.queued.splice(0):[];
  axis=Number.isFinite(axis)?clamp(axis,-1,1):0;
  s.accumulator+=Math.min(dt,1);
  while(s.accumulator>=1/120&&ACTIVE_PHASES.includes(s.phase)){
    // Positions before each step: the renderer carries motion across the unspent part of the next step.
    const pose=s.pose??={};pose.px=s.player.x;pose.kx=s.keeper.x;pose.bx=s.ball.x;pose.bz=s.ball.z;
    tick(s,1/120,axis);s.accumulator-=1/120;
  }
}
