import {PLAYERS,DEFAULT_PLAYER} from './characters.mjs';
const KEY='rebound-club-v2';
function clean(p){
  const result={unlocked:Math.max(0,Math.min(5,Math.floor(Number(p?.unlocked)||0))),scores:{},perfect:{},tutorialDone:p?.tutorialDone===true,muted:p?.muted===true,saved:true,
    // The striker's figure (characters.mjs PLAYERS); anything else, or none, is the default figure.
    player:PLAYERS.some(e=>e.id===p?.player)?p.player:DEFAULT_PLAYER};
  for(let i=0;i<6;i++){
    if(Number.isFinite(p?.scores?.[i])&&p.scores[i]>=0)result.scores[i]=Math.floor(p.scores[i]);
    if(p?.perfect?.[i]===true)result.perfect[i]=true;
  }
  return result;
}
export function loadProgress(storage){try{const raw=storage?.getItem(KEY);if(!raw)return {...clean({}),saved:!!storage};const p=JSON.parse(raw);return clean(p);}catch{return {...clean({}),saved:false};}}
export function saveProgress(storage,progress){try{storage.setItem(KEY,JSON.stringify(clean(progress)));return true;}catch{return false;}}
// Players who already have progress learned the game before the tutorial existed.
export function needsTutorial(p){return !p.tutorialDone&&p.unlocked===0&&Object.keys(p.scores).length===0;}
