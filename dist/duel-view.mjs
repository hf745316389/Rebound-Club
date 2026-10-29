// A duel as one player sees it, in the shape of a single-player match (core.mjs createGame): that player is the striker
// at PLAYER_Z, the opponent stands where the keeper's x is read, and everything is in that player's own view. The scene
// (scene3d.mjs) draws it as it draws a match, plus `opponent` and `mode:'duel'`; its rule-based hints come from `hints`.
// The view object for a (duel, side) pair is kept and refreshed in place, since the scene keys its effects on identity.
import {PLAYER_Z,spinPreview,predictFlight} from './core.mjs';
import {DUEL,COURT,other,localBall,localX,duelHitZone,duelBurstZone,duelSwingPreview,duelSkillStatus} from './duel-core.mjs';

const LEVEL={name:'对战',goals:DUEL.goals,goalHalf:DUEL.goalHalf,speed:DUEL.speed,color:DUEL.color};
const views=new WeakMap();
function makeView(s,side){
  const v={mode:'duel',side,weapon:'glove',levelIndex:0,level:LEVEL,tutorial:null,practiceLeft:0,ball:{},player:{x:0,z:PLAYER_Z},
    keeper:{x:0,target:0,dive:0,diveDir:0},opponent:{x:0,swing:null,axis:0,kit:s.players[other(side)].kit},pose:null,poseBox:{px:0,kx:0,bx:0,bz:0},shot:null,lastGoal:null,cache:{shot:null,goal:null},
    // Each player's fighter (duel-core FIGHTERS): its box, timings and the swing clock the scene draws from.
    kit:s.players[side].kit};
  // The boxes come from the duel's rules, which size them by each player's fighter.
  v.hints={hitZone:()=>duelHitZone(s,side),burstZone:()=>duelBurstZone(s,side),spinPreview,predictFlight,
    swingPreview:(view,axis)=>duelSwingPreview(s,side,axis),skillStatus:(view,kind)=>duelSkillStatus(s,side,kind),goalLock:()=>null};
  return v;
}
function phaseFor(s,side){
  if(s.phase==='goal')return s.lastGoal?.by===side?'goal':'miss';
  if(s.phase==='won')return s.winner===side?'won':'lost';
  return s.phase;
}
// offset: a drawn-only shift of the ball in this view (duel-net.mjs eases a late correction with it).
export function viewFor(s,side,offset=null){
  let pair=views.get(s);if(!pair){pair={};views.set(s,pair);}
  const v=pair[side]??=makeView(s,side),me=s.players[side],op=s.players[other(side)],flip=side==='b';
  localBall(s,side,v.ball);const ox=offset?.x||0,oz=offset?.z||0;v.ball.x+=ox;v.ball.z+=oz;
  v.player.x=localX(side,me.x);v.keeper.x=v.keeper.target=v.opponent.x=localX(side,op.x);v.opponent.swing=op.swing;v.opponent.axis=op.held;
  v.swing=me.swing;v.energy=me.energy;v.whiff=me.whiff;v.lastShot=me.lastShot;v.held=me.held;
  v.skill=s.skill?.side===side?s.skill:null;v.phase=phaseFor(s,side);v.countdown=s.countdown;
  v.goals=s.score[side];v.misses=s.score[other(side)];v.score=v.goals;v.combo=0;
  v.power=s.power;v.flash=s.flash;v.hitstop=s.hitstop;v.elapsed=s.elapsed;v.rally=s.rally;v.accumulator=s.accumulator;
  // A shot or goal by the other player is turned into this view once, so its identity holds while it is current.
  if(v.cache.shot!==s.shot){v.cache.shot=s.shot;const t=s.shot;
    v.shot=!t?null:t.side===side?t:{...t,x:-t.x,z:COURT-t.z,angle:t.angle+Math.PI};}
  if(v.cache.goal!==s.lastGoal){v.cache.goal=s.lastGoal;const g=s.lastGoal;
    v.lastGoal=!g?null:g.by===side?g:{...g,x:-g.x,vx:-g.vx,vz:-g.vz};}
  const p=s.pose;
  v.pose=p?v.poseBox:null;
  if(p){const mine=side==='a'?p.ax:p.bx,theirs=side==='a'?p.bx:p.ax;v.pose.px=localX(side,mine);v.pose.kx=localX(side,theirs);
    v.pose.bx=(flip?-p.x:p.x)+ox;v.pose.bz=(flip?COURT-p.z:p.z)+oz;}
  return v;
}
