import {STYLES} from './core.mjs';
export function screenFor(phase){return phase==='ready'?'ready':phase==='paused'?'paused':['won','lost'].includes(phase)?'result':'match';}
// Why each conceded ball got through (core.mjs missCause), in the order ties are listed.
export const MISS_CAUSE={early:'出手太早',late:'出手太晚',reach:'没跑到位',idle:'没有出手',unclear:'挥空'};
// Names of the goal's height zones (core.mjs ZONES).
export const ZONE_NAME={low:'下区',mid:'中区',top:'上区'};
// Player style names (core.mjs STYLES).
const STYLE_NAME={balanced:'均衡',agile:'灵活',power:'重拳',skill:'技巧',guard:'守护'};
// What a style changes, in words worked out from its numbers: its strengths, then its costs.
export function styleSummary(id){
  const st=STYLES[id]??STYLES.balanced,pct=v=>`${Math.round(Math.abs(v-1)*100)}%`,good=[],bad=[];
  if(st.run)(st.run>1?good:bad).push(`移动${st.run>1?'快':'慢'} ${pct(st.run)}`);
  if(st.width)(st.width>1?good:bad).push(`接球框${st.width>1?'宽':'窄'} ${pct(st.width)}`);
  if(st.power)(st.power>1?good:bad).push(`重炮球速 ${st.power>1?'+':'−'}${pct(st.power)}`);
  if(st.spinCost)good.push(`旋转只要 ${st.spinCost} 能量`);
  if(st.recovery)(st.recovery<1?good:bad).push(`收招${st.recovery>1?'慢':'快'} ${pct(st.recovery)}`);
  return {name:STYLE_NAME[STYLES[id]?id:'balanced'],good,bad};
}
export function createMatchStats(){return {powerHits:0,powerGoals:0,saves:0,whiffs:0,practiceConceded:0,spinShots:0,spinGoals:0,burstShots:0,burstGoals:0,bankGoals:0,fireGoals:0,
  missCauses:Object.fromEntries(Object.keys(MISS_CAUSE).map(k=>[k,0]))};}
export function recordMatchEvent(stats,event,state){
  if(event==='perfect')stats.powerHits++;
  if(event==='goal'&&state.lastShot==='perfect')stats.powerGoals++;
  if(event==='spin')stats.spinShots++;
  if(event==='burst')stats.burstShots++;
  if(event==='goal'&&state.lastShot==='spin')stats.spinGoals++;
  if(event==='goal'&&state.lastShot==='burst')stats.burstGoals++;
  if(event==='goal'&&state.lastGoal?.banks>0)stats.bankGoals++;
  if(event==='goal'&&state.lastGoal?.fire)stats.fireGoals++;
  if(event==='save')stats.saves++;
  if(event==='whiff')stats.whiffs++;
  if(event==='practice')stats.practiceConceded++;
  if(event==='miss'||event==='practice')stats.missCauses[MISS_CAUSE[state.missCause]?state.missCause:'unclear']++;
}
export function matchSummary(s,stats){
  const won=s.phase==='won';let advice=s.level.lesson;
  if(!won&&stats.whiffs>=3)advice='下局先等击球框亮起，再出手。把第一球接稳。';
  else if(!won&&stats.saves>=3)advice='挥击时按住另一侧方向键，或用旋转绕过门将的封堵。';
  const highlight=stats.fireGoals>0?`火球破门 ${stats.fireGoals} 次`:stats.powerGoals>0?`重炮破门 ${stats.powerGoals} 次`:stats.burstGoals>0?`爆发破门 ${stats.burstGoals} 次`:stats.spinGoals>0?`旋转绕过门将 ${stats.spinGoals} 次`:stats.bankGoals>0?`借墙破门 ${stats.bankGoals} 次`:s.bestCombo>=3?`连续回击 ${s.bestCombo} 次`:s.goals>0?`攻破球门 ${s.goals} 次`:'下一球，稳稳接住。';
  // Practice balls count too: the title already treats them as conceded.
  const conceded=Object.entries(stats.missCauses).filter(([,n])=>n>0).map(([cause,n])=>({cause,label:MISS_CAUSE[cause],n})).sort((a,b)=>b.n-a.n);
  return {won,title:won?(s.misses===0&&stats.practiceConceded===0?'零失球，漂亮拿下！':'好球，这局拿下！'):'差一点，再来一球。',
    action:won&&s.levelIndex<5?'next':'retry',actionLabel:won&&s.levelIndex<5?'挑战下一关':'再来一局',
    advice,highlight,goals:s.goals,target:s.level.goals,misses:s.misses,bestCombo:s.bestCombo,score:s.score,powerHits:stats.powerHits,conceded,practiceConceded:stats.practiceConceded};
}
const paths={
  glove:'M13 28c-8-2-9-12-4-15 2-1 5 0 7 3V9c0-4 6-4 6 0V6c0-4 6-4 6 0v2c0-4 6-4 6 0v3c1-4 7-3 7 1v10c0 6-5 10-11 10H17zM17 32v5h14v-5',
  arrow:'M8 20h30m-11-11 11 11-11 11',
  trophy:'M15 6h18v12c0 7-4 11-9 11s-9-4-9-11V6Zm0 3H8v7c0 5 4 7 8 7m17-14h7v7c0 5-4 7-8 7M24 29v9m-8 0h16',
  shield:'M24 5 9 11v11c0 8 7 13 15 18 8-5 15-10 15-18V11L24 5Z',
  lock:'M15 20v-6a9 9 0 0 1 18 0v6M12 20h24v20H12V20Zm12 8v5',
  check:'m12 24 8 8 17-18',retry:'M12 12a16 16 0 1 1-4 19M12 4v12H1',
  home:'m6 22 18-16 18 16M12 18v22h9V28h7v12h9V18',spark:'m24 3 5 15 15 5-15 5-5 15-5-15-15-5 15-5 5-15Z'
};
export function icon(name){return `<svg viewBox="0 0 48 44" fill="none" stroke="currentColor" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.glove}"/></svg>`;}
// Contact feel: the glove's punchy burst.
const gearFeel={glove:{flash:'burst',color:'#ff6a2b',sound:'punch',motion:1}};
export function hitFeel(weapon,kind){
  const g=gearFeel[weapon]||gearFeel.glove;
  // Skills keep the gear's own sound and motion: spin is a light teal ring, burst the gear's flash at full force.
  if(kind==='spin')return {...g,flash:'ring',color:'#37d6c0',intensity:.85,life:.16,motion:g.motion*1.1};
  if(kind==='burst')return {...g,intensity:2.4,life:.3,motion:g.motion*1.8};
  const k={soft:[.45,.16,.6],hit:[1,.22,1],perfect:[1.9,.28,1.5]}[kind]||[1,.18,1];
  return {...g,intensity:k[0],life:k[1],motion:g.motion*k[2]};
}
export function whiffHint(w){
  if(!w)return '挥空';
  return {early:'太早了 · 等球进框',late:'太晚了 · 球已过身',reach:w.side>0?'够不着 · 球在右边':'够不着 · 球在左边',none:'没有来球'}[w.reason]||'挥空';
}
// Contact timing against the power band (core.mjs s.shot.timing: ms outside the band, + early, − late; 0 says nothing).
export function timingWord(ms){return ms>0?`早 ${ms} 毫秒`:ms<0?`晚 ${-ms} 毫秒`:'';}
// Why a shot was saved (core.mjs saveCause): the capsule line, then the subtitle saying what to try instead.
export const SAVE_WHY={
  read:['被扑住 · 门将看到了你提前按的方向','球进框后按住的方向会被门将看到。挥击那一刻再按方向，或先按反方向骗它。'],
  pattern:['被扑住 · 门将摸清了你的规律','它在猜你下一球打哪边。别总打同一边，也别一直左右交替。'],
  body:['被扑住 · 正打在门将身上','终点变红说明门将挡在那条线上。挥击时按住另一侧方向键，或用旋转绕开它。'],
  chase:['被扑住 · 门将追上了这球','球不够快或不够靠边：在橙色甜点出手打重炮，或往离门将远的那侧打。']
};
// One short line per tutorial step; shown only while that step is active.
// Short state labels for the skill buttons; text, not just colour.
export const SKILL_STATE={ok:'可释放',energy:'能量不足',window:'等球进框',busy:'收招中',charging:'蓄力中',state:'待开球',tutorial:'教学中'};
export const TUTORIAL_TIPS=['球来了：等它进框，按挥击打回去','球从侧边来：先移到影子上，再挥击','门将站在一边：按住空的那一侧，再挥击'];
