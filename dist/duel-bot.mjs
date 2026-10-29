// Duel opponent: acts only through a player's inputs (move axis, swing, skill) and decides from that player's own view
// (duel-view.mjs) — the ball, the opponent and the swing preview a human sees. Like the strategy bots in the tests it
// moves under the ball, picks a side whose line clears the opponent's box, and presses with a seeded timing error.
import {PLAYER_Z,WEAPONS,GOAL_Z,foldX} from './core.mjs';

// normal: reaction before chasing a new shot (s), press error (± frames at 60 Hz), how much the line must clear the
// opponent's box, and per-ball chances of using a skill when it is affordable.
export const BOT_LEVELS={normal:{react:.18,jitter:1.5,clear:.35,burst:.35,spin:.25}};
function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
// Box and timings are the bot's own fighter's (view.kit) and the opponent's (view.opponent.kit); the glove without them.
const GLOVE={...WEAPONS.glove,sweet:PLAYER_Z+WEAPONS.glove.reach*.5};
const interceptX=(b,sweet)=>foldX(b.x+b.vx*(sweet-b.z)/b.vz);
const landing=p=>foldX(p.x+Math.tan(p.angle)*(GOAL_Z-p.z));
export function createBot({seed=1,level='normal'}={}){
  const L=BOT_LEVELS[level]||BOT_LEVELS.normal,r=rng(seed);
  let pending=-1,aim=0,ballSeen=null,since=0,skillRoll=null;
  return {decide(v,dt=1/60){
    const out={axis:0,swing:false,skill:null};if(v.phase!=='playing')return out;
    const b=v.ball,me=v.player.x,sw=v.swing,k=v.kit??GLOVE,ok=v.opponent?.kit??GLOVE;
    if(sw){out.axis=sw.hit?0:aim;return out;}
    if(b.vz>=0){pending=-1;skillRoll=null;out.axis=Math.abs(me)>.3?-Math.sign(me):0;return out;}
    // A new incoming ball: wait out the reaction time, then roll once for a skill.
    const key=v.shot??v.ball;if(key!==ballSeen){ballSeen=key;since=0;skillRoll=r();}since+=dt;
    if(since<L.react)return out;
    const dx=interceptX(b,k.sweet)-me;out.axis=Math.abs(dx)>.08?Math.sign(dx):0;
    if(pending>=0){if(pending===0){out.swing=true;out.axis=aim;pending=-1;}else pending--;return out;}
    // Only look at swings once the ball is near the box (previews run the rules on a copy).
    if(b.z>PLAYER_Z+k.reach+Math.abs(b.vz)*.12)return out;
    const opp=v.keeper.x,open=p=>Math.abs(landing(p)-opp)>ok.width+L.clear;
    for(const kind of ['burst','spin'])if(skillRoll!==null&&skillRoll<L[kind]&&v.hints.skillStatus(v,kind).ok){
      skillRoll=null;out.skill=kind;out.axis=opp>0?-1:1;return out;}
    const sides=r()<.5?[-1,1,0]:[1,-1,0];let pick=null,fallback=null;
    for(const a of sides){const p=v.hints.swingPreview(v,a);
      if(p.kind==='perfect'&&open(p)){pick=a;break;}
      if(p.kind==='clean'&&open(p))fallback??=a;}
    // Hold out for a power shot while it can still come; take an open clean one at the last moment.
    const last=b.z<PLAYER_Z+.25+Math.abs(b.vz)*(k.windup+.03);
    if(pick===null&&last)pick=fallback??(v.hints.swingPreview(v,0).kind!=='whiff'?0:null);
    if(pick!==null){aim=pick;pending=Math.max(0,Math.round(1+(r()*2-1)*L.jitter));}
    return out;
  }};
}
