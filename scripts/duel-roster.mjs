// Fighter balance probe (node scripts/duel-roster.mjs [matches per side] [seed] [levels]): for every pair of fighters
// (duel-core FIGHTERS), two bots play whole matches with the pair on both sides. Prints one JSON object; the same
// arguments always print the same bytes.
// Levels: good, average and casual are the human-like bot (scripts/duel-humanbot.mjs: it misjudges the ball and presses
// early or late); `bot` is the game's own opponent (dist/duel-bot.mjs), which always stands right and only presses a
// little late, so it shows what a fighter is worth to a player who never misjudges the ball. A third argument picks
// levels, e.g. `average` or `good,casual`.
// Bots are a first look, not a verdict: the numbers are to be read next to playtests, not instead of them.
// share: points won by the row fighter against the column fighter. hits: strikes per point in that pairing.
import {createDuel,startDuel,stepDuel,duelAttack,duelSkill,SIDES,FIGHTER_IDS} from '../dist/duel-core.mjs';
import {viewFor} from '../dist/duel-view.mjs';
import {createBot} from '../dist/duel-bot.mjs';
import {createHumanBot} from './duel-humanbot.mjs';
const matches=Number(process.argv[2]||20),seed=Number(process.argv[3]||1),DT=1/60,CAP=60*60*15;
const ALL={good:s=>createHumanBot({seed:s,level:'good'}),average:s=>createHumanBot({seed:s,level:'average'}),
  casual:s=>createHumanBot({seed:s,level:'casual'}),bot:s=>createBot({seed:s})};
const LEVELS=Object.fromEntries(Object.entries(ALL).filter(([k])=>!process.argv[4]||process.argv[4].split(',').includes(k)));
const r3=x=>Math.round(x*1000)/1000;
function play(picks,make,matchSeed){
  const s=createDuel({picks}),bots={a:make(matchSeed*2+1),b:make(matchSeed*2+2)};startDuel(s);
  const out={points:{a:0,b:0},hits:0,goals:0,winner:null};
  for(let f=0;f<CAP&&s.phase!=='won';f++){
    const ins={};
    for(const side of SIDES){const d=bots[side].decide(viewFor(s,side),DT);ins[side]={axis:d.axis};
      if(d.skill)duelSkill(s,side,d.skill,d.axis);else if(d.swing)duelAttack(s,side);}
    stepDuel(s,DT,ins);
    for(const e of s.events){if(['hit','perfect','soft','spin','burst'].includes(e.type))out.hits++;if(e.type==='goal'){out.points[e.side]++;out.goals++;}}
  }
  out.winner=s.winner;return out;
}
const result={matches,seed,levels:{}};
for(const [level,make] of Object.entries(LEVELS)){
  const share={},hits={},wins={},total={};
  for(const i of FIGHTER_IDS){share[i]={};hits[i]={};wins[i]={};total[i]={won:0,points:0};}
  // Every pairing and side has its own seeds: seed, then the pairing, then the match (up to 5000 matches a side).
  const N=FIGHTER_IDS.length;
  for(const [n,i] of FIGHTER_IDS.entries())for(const [jn,j] of FIGHTER_IDS.entries()){if(jn<n)continue;
    let iPts=0,pts=0,h=0,iWins=0;
    for(let m=0;m<matches;m++)for(const flip of [false,true]){
      const picks=flip?{a:j,b:i}:{a:i,b:j},me=flip?'b':'a',o=play(picks,make,(seed*N*N+n*N+jn)*10000+m*2+(flip?1:0));
      iPts+=o.points[me];pts+=o.goals;h+=o.hits;if(o.winner===me)iWins++;
    }
    // A mirror pairing is one cell: the points the fighter on one side won (not its complement).
    share[i][j]=r3(iPts/pts);hits[i][j]=hits[j][i]=r3(h/pts);wins[i][j]=r3(iWins/(2*matches));
    if(i!==j){share[j][i]=r3(1-iPts/pts);wins[j][i]=r3(1-iWins/(2*matches));}
    if(i!==j){total[i].won+=iPts;total[i].points+=pts;total[j].won+=pts-iPts;total[j].points+=pts;}
  }
  result.levels[level]={share,matchWins:wins,hitsPerPoint:hits,overall:Object.fromEntries(FIGHTER_IDS.map(i=>[i,r3(total[i].won/total[i].points)]))};
}
console.log(JSON.stringify(result,null,1));
