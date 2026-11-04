// Combo sweet spot: one player's streak of returns, as pure rules over a small state object, shared by the duel (and
// later the club). A return is graded perfect (inside the power band), great (within greatBand of the half box, or any
// skill) or good (further out, or soft); only a conceded ball breaks the streak, and time never does: the next ball
// comes when the other side sends it. Every count below is in contacts or balls, never seconds.
//
// multKnots: the multiplier's curve over the streak (piecewise linear: quick early, steepest from 8 to 25, flat to the
//   cap at 50); multCap caps it, sweet bonus included. points: the base points per grade, per goal and per broken
//   fireball, scaled by the multiplier at that moment (match points only; goals alone decide a match).
// sweetNeed perfects in a row open the sweet state for the next sweetBalls contacts: +sweetMult to the multiplier and a
//   sweetBand× power band. fireNeed perfects in a row arm a fireball for the next contact: fireSpeed× pace; returning
//   one with a perfect breaks it (breakFire points, breakFireEnergy energy).
// Difficulty grows on the player with the streak: balls flying at it get speedStep faster per speedEvery (up to
//   speedCap) and its power band narrows bandStep per bandEvery (up to bandCap). After a break the next recoverBalls
//   contacts get a recoverBand× power band and a recoverWidth× hit box.
export const COMBO={greatBand:.65,
  multKnots:[[0,1],[5,1.2],[8,1.4],[25,2.5],[50,3]],multCap:3,
  points:{perfect:150,great:100,good:50,goal:1000,breakFire:300},milestoneEvery:5,
  sweetNeed:3,sweetBalls:2,sweetMult:.5,sweetBand:1.3,
  fireNeed:5,fireSpeed:1.25,breakFireEnergy:20,
  speedEvery:5,speedStep:.04,speedCap:.25,bandEvery:10,bandStep:.05,bandCap:.25,
  recoverBalls:2,recoverBand:1.2,recoverWidth:1.1};

// n: the streak; best: its longest; perfects: perfects in a row; sweetLeft / recoverLeft: contacts left in each state;
// fire: a fireball armed for the next contact; points: match points.
export function comboState(){return {n:0,best:0,perfects:0,sweetLeft:0,recoverLeft:0,fire:false,points:0};}
// t: the contact's depth in the box (0 at the sweet spot, ±1 at its ends); band: this player's power band in those units.
export function comboTier(t,{band,soft=false,skill=false}){
  if(skill)return 'great';if(soft)return 'good';
  const d=Math.abs(t);return d<=band?'perfect':d<=COMBO.greatBand?'great':'good';
}
export function comboMult(st){
  const k=COMBO.multKnots,n=Math.min(st.n,k[k.length-1][0]);let m=k[k.length-1][1];
  for(let i=1;i<k.length;i++)if(n<=k[i][0]){const [a,ma]=k[i-1],[b,mb]=k[i];m=ma+(mb-ma)*(n-a)/(b-a);break;}
  return Math.min(COMBO.multCap,m+(st.sweetLeft>0?COMBO.sweetMult:0));
}
const steps=(n,every,step,cap)=>Math.min(cap,Math.floor(n/every)*step);
// Pace factor for balls flying at this player.
export function comboSpeed(st){return 1+steps(st.n,COMBO.speedEvery,COMBO.speedStep,COMBO.speedCap);}
// Scale on this player's power band, and on its hit box width.
export function comboBand(st){
  return (1-steps(st.n,COMBO.bandEvery,COMBO.bandStep,COMBO.bandCap))*(st.sweetLeft>0?COMBO.sweetBand:1)*(st.recoverLeft>0?COMBO.recoverBand:1);
}
export function comboWidth(st){return st.recoverLeft>0?COMBO.recoverWidth:1;}
// A return graded `tier`. It scores at the multiplier it was struck with (the sweet state still on), then spends a
// sweet and a recovery contact. Returns what changed, for feedback: 'milestone', 'sweetStart', 'sweetEnd', 'fireReady'.
export function comboContact(st,tier,{skill=false}={}){
  const notes=[];st.n++;st.best=Math.max(st.best,st.n);
  st.points+=Math.round(COMBO.points[tier]*comboMult(st));
  if(st.sweetLeft>0&&--st.sweetLeft===0)notes.push('sweetEnd');
  if(st.recoverLeft>0)st.recoverLeft--;
  if(st.n%COMBO.milestoneEvery===0)notes.push('milestone');
  // A skill neither builds nor breaks the perfect run.
  if(tier==='perfect')st.perfects++;else if(!skill)st.perfects=0;
  if(tier==='perfect'&&st.perfects===COMBO.sweetNeed&&st.sweetLeft===0){st.sweetLeft=COMBO.sweetBalls;notes.push('sweetStart');}
  if(st.perfects>=COMBO.fireNeed){st.perfects=0;st.fire=true;notes.push('fireReady');}
  return notes;
}
// A conceded ball: the streak ends (its length is returned) and the recovery starts; an armed fireball stays.
export function comboBreak(st){
  const n=st.n;st.best=Math.max(st.best,n);st.n=0;st.perfects=0;st.sweetLeft=0;st.recoverLeft=COMBO.recoverBalls;return n;
}
export function comboGoal(st){st.points+=Math.round(COMBO.points.goal*comboMult(st));}
export function comboBreakFire(st){st.points+=Math.round(COMBO.points.breakFire*comboMult(st));}
