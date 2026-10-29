// Human-like duel bot, for balance probes only (scripts/duel-roster.mjs); the game's opponent is dist/duel-bot.mjs.
// The game's bot reads the rules' swing preview, so it always stands right and only presses late: box width, run speed
// and the hit window are worth nothing to it. This one judges the ball by eye, with three human errors:
// react: delay (s) before it starts chasing a new ball; aim: misjudged crossing point, its error (m) per second of
// flight still to come, judged again every `look` seconds, so it sharpens as the ball comes in; timing: each press is
// off by a normal error of `timing` seconds, early or late. It mostly aims away from the opponent (`straight`: share of
// straight shots) and, when the ball is in its box and it can afford one, uses a skill by chance (per ball).
// No published figure pins down a player's timing error, so the probes run three levels across a plausible range.
import {foldX} from '../dist/core.mjs';

export const HUMAN_LEVELS={
  good:{react:.2,aim:.25,look:.15,timing:.025,straight:.2,spin:.3,burst:.4},
  average:{react:.25,aim:.4,look:.2,timing:.045,straight:.25,spin:.25,burst:.35},
  casual:{react:.3,aim:.6,look:.25,timing:.07,straight:.35,spin:.15,burst:.25}
};
function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
// About normal (mean 0, deviation 1): the sum of six uniforms.
const gauss=r=>{let u=0;for(let i=0;i<6;i++)u+=r();return (u-3)/Math.sqrt(.5);};

export function createHumanBot({seed=1,level='average'}={}){
  const L=HUMAN_LEVELS[level]??level,r=rng(seed);
  let tracking=false,since=0,lastLook=-1,offset=0,aim=0,pressAt=null,pressed=false,skillRoll=1;
  return {decide(v,dt=1/60){
    const out={axis:0,swing:false,skill:null};if(v.phase!=='playing'){tracking=false;return out;}
    const b=v.ball,me=v.player.x,k=v.kit,sw=v.swing;
    if(sw){out.axis=sw.hit?0:aim;return out;}
    if(b.vz>=0){tracking=false;out.axis=Math.abs(me)>.3?-Math.sign(me):0;return out;}
    // A new ball coming: pick where to send it and whether to spend energy on it, then wait out the reaction.
    if(!tracking){tracking=true;since=0;lastLook=-1;offset=0;pressAt=null;pressed=false;skillRoll=r();
      aim=r()<L.straight?0:(v.keeper.x>0?-1:1)*(r()<.85?1:-1);}
    since+=dt;if(since<L.react)return out;
    // Time until the ball reaches the sweet spot's depth, and where it crosses it (off the side walls, as judged).
    const tLeft=(b.z-k.sweet)/-b.vz;
    if(lastLook<0||since-lastLook>=L.look){lastLook=since;offset=gauss(r)*L.aim*Math.max(0,tLeft);}
    const dx=foldX(b.x+b.vx*tLeft)+offset-me;out.axis=Math.abs(dx)>.08?Math.sign(dx):0;
    // The aim: the ball at the sweet spot as the wind-up ends, missed by this press's own error.
    pressAt??=k.windup+gauss(r)*L.timing;
    if(!pressed&&tLeft<=pressAt){
      pressed=true;out.axis=aim;
      for(const kind of ['burst','spin'])if(skillRoll<L[kind]&&v.hints.skillStatus(v,kind).ok){out.skill=kind;return out;}
      out.swing=true;
    }
    return out;
  }};
}
