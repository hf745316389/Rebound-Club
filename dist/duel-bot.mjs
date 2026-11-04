// Duel opponent: acts only through a player's inputs (move axis, swing, skill) and decides from that player's own view
// (duel-view.mjs) — the ball, the opponent and the swing preview a human sees. Like the strategy bots in the tests it
// moves under the ball, picks a side whose line clears the opponent's box, and presses with a seeded timing error.
// It misreads like a person: every incoming ball's crossing point is a little off, and now and then a ball is misread
// outright and the bot sets up beside it, out of reach. That chance grows with the ball's speed and slant (more for
// spin and burst), and so does the press error. Without it the bot read every ball exactly, and at the duel's pace
// points ran for minutes; with it a point's length follows from the chance, about 15 strikes between two bots.
import {PLAYER_Z,WEAPONS,GOAL_Z,foldX} from './core.mjs';
import {DUEL} from './duel-core.mjs';

// normal: reaction before chasing a new shot (s), press error (± frames at 60 Hz at the serve's speed), how much the
// line must clear the opponent's box, per-ball chances of using a skill when it is affordable, the small error every
// read carries (m), and the chance of an outright misread for a straight ball at the serve's speed (it grows as
// pace² × (1 + 1.5 × slant), ×1.6 for spin and burst). greedy: the chance, per ball, that it holds out for a power shot;
// otherwise it takes the first open line it is offered, so fewer of its returns are perfect.
// The levels the duel page offers (简单 / 普通 / 困难); hard is the original play-tested bot, and the default, since the
// tests and the online check play against it.
export const BOT_LEVELS={
  easy:{react:.24,jitter:3,clear:.3,burst:.2,spin:.15,noise:.24,slip:.016,greedy:0},
  normal:{react:.21,jitter:2,clear:.35,burst:.3,spin:.25,noise:.2,slip:.013,greedy:.45},
  hard:{react:.18,jitter:1.5,clear:.35,burst:.35,spin:.25,noise:.15,slip:.008,greedy:1}};
function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
const W=WEAPONS.glove,SWEET=PLAYER_Z+W.reach*.5;
const interceptX=b=>foldX(b.x+b.vx*(SWEET-b.z)/b.vz);
const landing=p=>foldX(p.x+Math.tan(p.angle)*(GOAL_Z-p.z));
export function createBot({seed=1,level='hard'}={}){
  const L=BOT_LEVELS[level]||BOT_LEVELS.hard,r=rng(seed);
  let pending=-1,aim=0,ballSeen=null,since=0,skillRoll=null,misread=0,pace=1,holdOut=true;
  return {decide(v,dt=1/60){
    // A ball flying away, a goal or a serve countdown ends the read: a serve or a wall's return is then a new ball too
    // (neither is a new shot, so the shot alone would carry the last ball's misread over).
    const out={axis:0,swing:false,skill:null};if(v.phase!=='playing'){ballSeen=null;return out;}
    const b=v.ball,me=v.player.x,sw=v.swing;
    if(sw){out.axis=sw.hit?0:aim;return out;}
    if(b.vz>=0){pending=-1;skillRoll=null;ballSeen=null;out.axis=Math.abs(me)>.3?-Math.sign(me):0;return out;}
    // A new incoming ball: wait out the reaction time, then roll once for a skill, and once for how it is misread.
    const key=v.shot??v.ball;
    if(key!==ballSeen){ballSeen=key;since=0;skillRoll=r();pace=Math.hypot(b.vx,b.vz)/DUEL.speed;
      const tricky=b.kind==='spin'||b.kind==='burst'?1.6:1,slip=r()<L.slip*pace*pace*(1+1.5*Math.abs(b.vx/b.vz))*tricky;
      misread=slip?(r()<.5?-1:1)*(W.width+.3+r()*.5):(r()+r()-1)*L.noise;
      // Rolled only below certainty, so the hard bot draws the same numbers as before.
      holdOut=L.greedy>=1||r()<L.greedy;}
    since+=dt;
    if(since<L.react)return out;
    const dx=interceptX(b)+misread-me;out.axis=Math.abs(dx)>.08?Math.sign(dx):0;
    if(pending>=0){if(pending===0){out.swing=true;out.axis=aim;pending=-1;}else pending--;return out;}
    // Only look at swings once the ball is near the box (previews run the rules on a copy).
    if(b.z>PLAYER_Z+W.reach+Math.abs(b.vz)*.12)return out;
    const opp=v.keeper.x,open=p=>Math.abs(landing(p)-opp)>W.width+L.clear;
    for(const kind of ['burst','spin'])if(skillRoll!==null&&skillRoll<L[kind]&&v.hints.skillStatus(v,kind).ok){
      skillRoll=null;out.skill=kind;out.axis=opp>0?-1:1;return out;}
    const sides=r()<.5?[-1,1,0]:[1,-1,0];let pick=null,fallback=null;
    for(const a of sides){const p=v.hints.swingPreview(v,a);
      if(p.kind==='perfect'&&open(p)){pick=a;break;}
      if(p.kind==='clean'&&open(p))fallback??=a;}
    // Hold out for a power shot while it can still come; take an open clean one at the last moment.
    const last=b.z<PLAYER_Z+.25+Math.abs(b.vz)*(W.windup+.03);
    if(pick===null&&!holdOut&&fallback!==null)pick=fallback;
    if(pick===null&&last)pick=fallback??(v.hints.swingPreview(v,0).kind!=='whiff'?0:null);
    if(pick!==null){aim=pick;pending=Math.max(0,Math.round(1+(r()*2-1)*L.jitter*pace));}
    return out;
  }};
}
