// Duel page (P0, on one device). Against the duel bot: two copies of the match joined by a loopback that can simulate
// network latency (duel-net.mjs), the bot playing the far copy from its own view, this page showing the near one. Two
// players on one keyboard: one copy decided for both. The court is the club's 3D scene in duel mode (duel-view.mjs).
import {DUEL,DUEL_ACTIVE,FIGHTERS,FIGHTER_IDS,createDuel,startDuel,stepDuel,duelAttack,duelSkill,duelSkillStatus,duelSwingPreview,pauseDuel,resumeDuel,other} from './duel-core.mjs';
import {FIGHTER_LOOKS} from './characters.mjs';
import {viewFor} from './duel-view.mjs';
import {createLoopback,createClient} from './duel-net.mjs';
import {createBot} from './duel-bot.mjs';
import {createInput} from './input.mjs';
import {create3DRenderer} from './scene3d.mjs';
import {sound,buzz,setSound} from './sfx.mjs';
import {icon,hitFeel,whiffHint,SKILL_STATE} from './ui.mjs';

const $=id=>document.getElementById(id);
const coarse=matchMedia('(pointer:coarse)').matches,reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
// Captions float over the court for a few seconds after each change, as in the club.
let captionTimer=0;
new MutationObserver(()=>{const box=$('feedback').parentElement;box.classList.add('show');clearTimeout(captionTimer);captionTimer=setTimeout(()=>box.classList.remove('show'),4200);})
  .observe($('feedback'),{childList:true,characterData:true,subtree:true});
function goFullscreen(){const d=document.documentElement;if(coarse&&document.fullscreenEnabled&&!document.fullscreenElement&&d.requestFullscreen)d.requestFullscreen({navigationUI:'hide'}).catch(()=>{});}

// Player A: on-screen buttons and A/D (plus the arrows against the bot). Player B on the same keyboard: the arrows. Two
// players on one keyboard play split screen, each in its own half from behind its own glove, so B's ← is B's own left.
const input=createInput(),keysB=new Set();
let mode='ai',latency=0,soundOn=true,match=null,uiPhase='',lastTime=0,shake=0,court=null,opener='a',loadingCast=false;
// Each player's fighter (duel-core FIGHTERS); the lobby court shows the picked figures (characters.mjs FIGHTER_LOOKS).
const picks={a:'allround',b:'allround'};
let idle=createDuel({picks});
const castFor=side=>({near:FIGHTER_LOOKS[picks[side]],far:FIGHTER_LOOKS[picks[other(side)]]});
const names=()=>mode==='ai'?{a:'我',b:'对手'}:{a:'1P',b:'2P'};
const axisB=()=>(keysB.has('ArrowRight')?1:0)-(keysB.has('ArrowLeft')?1:0);
const stateOf=()=>match?match.state:idle;
const viewOf=()=>match?.mode==='ai'?match.a.view():viewFor(stateOf(),'a');

function newMatch(){
  input.reset();keysB.clear();
  if(mode==='ai'){
    const now=()=>performance.now()/1000,seed=(Math.random()*2**31)>>>0,loop=createLoopback({delayMs:latency,jitterMs:latency*.2,seed,now});
    const a=createClient({side:'a',transport:loop[0],now,picks}),b=createClient({side:'b',transport:loop[1],now,picks});
    match={mode,loop,a,b,bot:createBot({seed:seed+1}),state:a.state,pending:{a:{swing:false,skill:null}}};a.start();b.start();
  }else{
    // Who takes the first serve alternates from one match to the next.
    const s=createDuel({picks});s.serveTo=opener;opener=opener==='a'?'b':'a';
    match={mode,state:s,pending:{a:{swing:false,skill:null},b:{swing:false,skill:null}}};startDuel(s);
  }
  sound('start');
}
// A press is queued for the next step, so it goes through the same path (and network stamp) as everything else.
function press(side,kind){
  if(!match||(mode==='ai'&&side!=='a'))return;const s=match.state;
  if(kind==='swing'){if(s.phase==='playing')match.pending[side].swing=true;return;}
  if(!DUEL_ACTIVE.includes(s.phase))return;
  const st=duelSkillStatus(s,side,kind);if(!st.ok){sound('deny');popFor(side,SKILL_STATE[st.reason]||'现在不行',true);return;}
  match.pending[side].skill=kind;
}
function stepMatch(dt){
  const p=match.pending;
  if(match.mode==='ai'){
    const {loop,a,b,bot}=match;loop.flush();
    a.step(dt,{axis:input.axis(),swing:p.a.swing,skill:p.a.skill});p.a.swing=false;p.a.skill=null;
    b.step(dt,bot.decide(b.view(),dt));b.state.events=[];
  }else{
    const s=match.state,axes={a:input.axis(),b:axisB()};
    for(const side of ['a','b']){const q=p[side];if(q.skill)duelSkill(s,side,q.skill,axes[side]);else if(q.swing)duelAttack(s,side);q.swing=false;q.skill=null;}
    stepDuel(s,dt,{a:{axis:axes.a},b:{axis:axes.b}});
  }
}
function suspend(){if(!match||!DUEL_ACTIVE.includes(match.state.phase))return;if(match.mode==='ai'){match.a.pause();match.b.pause();}else pauseDuel(match.state);input.reset();keysB.clear();}
function resume(){if(!match)return;if(match.mode==='ai'){match.a.resume();match.b.resume();}else resumeDuel(match.state);}

function pop(text,miss=false){const el=$('hit-pop');el.textContent=text;el.className=`hit-pop${miss?' miss':''}`;void el.offsetWidth;el.classList.add('show');}
// A player's own caption: in its half of a split screen, else the page's (the bot's captions are not shown).
function popFor(side,text,miss=false){
  if(mode!=='local'){if(side==='a')pop(text,miss);return;}
  const el=$(`pop-${side}`);el.textContent=text;el.className=`split-pop${miss?' miss':''}`;void el.offsetWidth;el.classList.add('show');
}
function verdict(text,kind){const el=$('result-pop');el.textContent=text;el.className=`result-pop ${kind}`;void el.offsetWidth;el.classList.add('show');}
const say=text=>{$('feedback').textContent=text;};
const AIM={left:'往左 ←',right:'往右 →',straight:'直线 ↑'};
function events(){
  const s=stateOf(),n=names(),both=mode==='local';
  for(const e of s.events){const mine=e.side==='a',shown=mine||both,who=n[e.side];
    if(e.type==='swing'&&shown)sound('swing');
    if(['hit','perfect','soft','spin','burst'].includes(e.type)){
      const f=hitFeel('glove',e.type);sound(f.sound,mine?f.intensity:f.intensity*.7);if(e.type==='perfect'||e.type==='burst')sound('impact');
      if(shown){buzz(e.type);const shot=s.players[e.side].lastShot;
        popFor(e.side,e.type==='perfect'?'重炮！':e.type==='soft'?'软球':e.type==='spin'?'旋转':e.type==='burst'?'爆发！':AIM[shot]||'好球！',e.type==='soft');}
      if(e.type==='perfect'||e.type==='burst')shake=Math.max(shake,.06);
    }
    if(e.type==='whiff'&&shown){sound('whiff');popFor(e.side,whiffHint(s.players[e.side].whiff),true);}
    if(e.type==='wall')sound('wall');
    if(e.type==='wide'){sound('wide');verdict(`${n[e.side]}打偏了 · 球弹回来`,'info');}
    if(e.type==='burstStart'){sound('charge');say(`${who}蓄力爆发……`);}
    if(e.type==='burstStrike')sound('strike');
    if(e.type==='goal'){
      const scored=mode==='local'||e.side==='a';shake=Math.max(shake,scored?.1:.08);
      if(mode==='ai'){verdict(e.side==='a'?'进球！':'丢球！',e.side==='a'?'good':'bad');sound(e.side==='a'?'goal':'miss');buzz(e.side==='a'?'goal':'miss');}
      else{verdict(`${who}进球！`,'good');sound('goal');}
      say(`${n.a} ${s.score.a} : ${s.score.b} ${n.b} · 先进 ${DUEL.goals} 球获胜`);
    }
    if(e.type==='win')sound(mode==='local'||e.side==='a'?'win':'miss');
    if((e.type==='energy50'||e.type==='energy100')&&mine){const el=$('energy');el.classList.remove('flash');void el.offsetWidth;el.classList.add('flash');}
  }
  s.events=[];
}

function overlay(html){$('overlay-content').innerHTML=html;$('overlay').hidden=false;}
function screenFor(phase){return phase==='ready'?'ready':phase==='paused'?'paused':phase==='won'?'result':'match';}
function phaseUI(){
  const s=stateOf(),phase=s.phase;if(phase===uiPhase)return;uiPhase=phase;
  const previous=document.body.dataset.screen,screen=screenFor(phase);document.body.dataset.screen=screen;
  const split=match?.mode==='local';document.body.toggleAttribute('data-split',split);$('split-hud').hidden=!split;
  $('start-match').disabled=phase!=='ready'||!court||loadingCast;
  if(phase==='paused')overlay(`<div class='overlay-symbol'>${icon('shield')}</div><span class='eyebrow'>暂停</span><h3>喘口气，再上。</h3><p>比分和球都会保留。</p><button class='primary-button' data-action='resume'>继续对战 ${icon('arrow')}</button><div class='pause-actions'><button class='secondary-button' data-action='retry'>重新开始</button><button class='secondary-button' data-action='setup'>返回设置</button></div>`);
  else if(phase==='won'){
    const n=names(),win=s.winner,title=mode==='ai'?(win==='a'?'你赢了':'对手赢了'):`${n[win]}获胜`;
    overlay(`<div class='overlay-symbol ${mode==='ai'&&win!=='a'?'loss':''}'>${icon(mode==='ai'&&win!=='a'?'retry':'trophy')}</div><span class='eyebrow'>双人对战 · 先进 ${DUEL.goals} 球</span><h3>${title}</h3><div class='result-score'>${s.score.a}<small> : ${s.score.b}</small></div><div class='result-subtitle'>${n.a} ${s.score.a} : ${s.score.b} ${n.b}</div><button class='primary-button' data-action='retry'>再来一局 ${icon('retry')}</button><div class='result-links'><button class='secondary-button' data-action='setup'>返回设置</button><a class='secondary-button' href='./index.html'>返回单机</a></div>`);
    input.reset();keysB.clear();
  }else $('overlay').hidden=true;
  if(previous!==screen)queueMicrotask(()=>{if(screen==='paused'||screen==='result')$('overlay-content').querySelector('.primary-button')?.focus({preventScroll:true});else if(screen==='match')$('court').focus({preventScroll:true});});
}
// Loads the figures the match needs (one view against the bot, two side by side), then starts it.
async function startMatch(){
  if(loadingCast)return;loadingCast=true;$('start-match').disabled=true;say('正在载入角色……');
  try{await court.prepare(mode==='local'?[castFor('a'),castFor('b')]:[castFor('a')]);say('');newMatch();}
  catch{say('角色模型载入失败，请检查网络后重试。');}
  finally{loadingCast=false;uiPhase='';phaseUI();}
}
const fighterLine=id=>`<b>${FIGHTERS[id].name}</b>：${FIGHTERS[id].role}`;
function setupUI(){
  const who=mode==='ai'?{a:'我的角色',b:'对手角色'}:{a:'1P 角色',b:'2P 角色'};
  for(const side of ['a','b']){
    const group=$(`pick-${side}`);
    if(!group.querySelector('[data-pick]'))for(const id of FIGHTER_IDS)group.insertAdjacentHTML('beforeend',`<button type="button" class="duel-choice" data-pick="${id}" data-side="${side}" role="radio" aria-checked="false">${FIGHTERS[id].name}</button>`);
    for(const b of group.querySelectorAll('[data-pick]'))b.setAttribute('aria-checked',String(b.dataset.pick===picks[side]));
    $(`pick-${side}-label`).textContent=who[side];$(`role-${side}`).innerHTML=fighterLine(picks[side]);
    $(`side-${side}`).querySelector('.split-tag').textContent=`${side==='a'?'1P':'2P'} · ${FIGHTERS[picks[side]].name}`;
  }
  for(const b of document.querySelectorAll('[data-mode]'))b.setAttribute('aria-checked',String(b.dataset.mode===mode));
  for(const b of document.querySelectorAll('[data-latency]'))b.setAttribute('aria-checked',String(Number(b.dataset.latency)===latency));
  $('mode-local').hidden=coarse;$('latency-group').hidden=mode!=='ai';
  $('duel-keys').innerHTML=coarse?'按住左右箭头移动，点挥击回球；能量够时可放旋转、爆发。':mode==='ai'
    ?'移动 <b>A / D</b> 或 <b>← / →</b> · 挥击 <b>空格</b> · 旋转 <b>J</b> · 爆发 <b>K</b> · 暂停 <b>Esc</b><br>网络模拟：两边隔着设定的延迟同步，用来感受联机手感。'
    :'<b>1P 左半屏</b> A / D 移动 · 空格挥击 · Q 旋转 · E 爆发<br><b>2P 右半屏</b> ← / → 移动 · ↑ 挥击 · , 旋转 · . 爆发<br>分屏：各看自己那半边，按自己的左右移动和瞄准。';
  $('spin-key').textContent=mode==='local'?'50 · Q':'50 · J';$('burst-key').textContent=mode==='local'?'100 · E':'100 · K';
}
function hud(){
  const s=stateOf(),n=names(),me=s.players.a,active=DUEL_ACTIVE.includes(s.phase),playing=s.phase==='playing';
  $('score-label').textContent=`${n.a} : ${n.b}`;$('progress').textContent=`${s.score.a} : ${s.score.b}`;$('progress-bar').style.width=`${s.score.a/DUEL.goals*100}%`;
  $('pause').disabled=!active;$('attack').disabled=!playing;
  $('attack').classList.toggle('recovering',!!me.swing);$('attack').querySelector('span').textContent=me.swing?'收招':'挥击';
  const axis=input.axis(),word=axis<0?'往左 ←':axis>0?'往右 →':'直线 ↑',cue=playing&&!me.swing?duelSwingPreview(s,'a',axis):{kind:'none'};
  $('attack').classList.toggle('ready-cue',['clean','perfect'].includes(cue.kind));
  $('attack-hint').textContent=me.swing?'收招中':cue.kind==='perfect'?`重炮时机 · ${word}`:cue.kind==='clean'?`现在挥击 · ${word}`:'看准再出手';
  const by=s.lastGoal?.by,goalWord=mode==='ai'?(by==='a'?'进球！':'丢球，稳住'):`${n[by]||''}进球！`;
  const status={ready:'热身准备',serving:'发球准备',playing:'对决进行中',goal:goalWord,skill:'爆发蓄力',paused:'已暂停',won:'对战结束'};
  $('court-status').textContent=s.phase==='serving'?`发球倒数 ${Math.max(1,Math.ceil(s.countdown*2))}`:playing&&s.rally>1.001?`对决进行中 · 球速 ×${s.rally.toFixed(2)}`:status[s.phase]||'';
  $('energy-fill').style.width=`${me.energy}%`;$('energy-value').textContent=me.energy;$('energy').setAttribute('aria-valuenow',me.energy);
  for(const kind of ['spin','burst']){const st=duelSkillStatus(s,'a',kind),b=$(`skill-${kind}`),label=SKILL_STATE[st.ok?'ok':st.reason];
    b.classList.toggle('ready',st.ok);b.classList.toggle('low',st.reason==='energy');$(`${kind}-state`).textContent=label;
    b.setAttribute('aria-label',`${kind==='spin'?'旋转回击，消耗50能量':'爆发回击，消耗100能量'}，${label}`);}
  const v=viewOf(),pv=playing&&v.ball.vz<0&&duelSkillStatus(s,'a','spin').reason!=='energy'?v.hints.spinPreview(v,axis):null;$('spin-dir').textContent=pv?(pv.dir==='left'?' ↺':' ↻'):'';
  for(const [id,direction] of [['move-left',-1],['move-right',1]]){const b=$(id),on=input.pressed(direction);b.disabled=!active;b.classList.toggle('pressed',on);b.setAttribute('aria-pressed',String(on));}
  if(match?.mode==='local')splitHud(s,{a:axis,b:axisB()});
}
// Split-screen panels, one per player, from the same rules as the single player's buttons. Written only on change.
const shown=new Map();
function put(id,key,value){const k=`${id}.${key}`;if(shown.get(k)===value)return;shown.set(k,value);const el=$(id);if(key==='text')el.textContent=value;else if(key==='class')el.className=value;else el.style[key]=value;}
const SKILL_KEYS={a:{spin:'Q',burst:'E'},b:{spin:',',burst:'.'}};
function splitHud(s,axes){
  const playing=s.phase==='playing';
  for(const side of ['a','b']){
    const p=s.players[side],axis=axes[side],word=axis<0?'往左 ←':axis>0?'往右 →':'直线 ↑',cue=playing&&!p.swing?duelSwingPreview(s,side,axis):{kind:'none'};
    put(`cue-${side}`,'text',p.swing?'收招中':cue.kind==='perfect'?`重炮时机 · ${word}`:cue.kind==='clean'?`现在挥击 · ${word}`:'看准再出手');
    put(`cue-${side}`,'class',`split-cue${['clean','perfect'].includes(cue.kind)?' ready':''}`);
    put(`energy-${side}`,'width',`${p.energy}%`);
    for(const kind of ['spin','burst']){const st=duelSkillStatus(s,side,kind);
      put(`${kind}-${side}`,'text',`${kind==='spin'?'旋转':'爆发'} ${SKILL_KEYS[side][kind]} · ${SKILL_STATE[st.ok?'ok':st.reason]}`);put(`${kind}-${side}`,'class',st.ok?'ready':'');}
  }
}
function frame(time){
  const dt=lastTime?Math.min((time-lastTime)/1000,.05):0;lastTime=time;
  if(match&&dt>0)stepMatch(dt);
  events();
  shake*=Math.exp(-dt*9);if(shake<.005||reduceMotion)shake=0;
  phaseUI();hud();
  if(match?.mode==='local'){const s=match.state;court?.renderViews([{state:viewFor(s,'a'),axis:input.axis(),shake},{state:viewFor(s,'b'),axis:axisB(),shake}],reduceMotion);}
  else court?.render(viewOf(),input.axis(),reduceMotion,shake);
  requestAnimationFrame(frame);
}

// The court. A duel needs the 3D scene; without WebGL2 (or if the characters fail to load) the page says so.
const booted=()=>{document.body.dataset.booted='1';};
function unsupported(){court=null;$('start-match').disabled=true;say('对战需要 3D 画面，当前设备不支持。');
  overlay(`<div class='duel-unsupported'><h3>对战需要 3D 画面</h3><p>当前设备或浏览器不支持 WebGL2，暂时无法进行对战。</p><a class='primary-button' href='./index.html'>返回单机</a></div>`);booted();}
try{
  const r=create3DRenderer($('court'),undefined,{duel:true});$('court').dataset.renderer='3d';
  r.ready.then(()=>{court=r;uiPhase='';booted();court.prepare([castFor('a')]).catch(()=>{});},()=>{r.dispose();unsupported();});
}catch{unsupported();}

document.querySelector('.app').addEventListener('click',e=>{
  const el=e.target.closest('[data-action],[data-mode],[data-latency],[data-pick]');if(!el)return;
  // While a match's figures load, the setup is fixed: the match starts with what was chosen.
  const setup=!match&&!loadingCast;
  if(el.dataset.mode&&setup){mode=el.dataset.mode;setupUI();return;}
  if(el.dataset.pick&&setup){picks[el.dataset.side]=el.dataset.pick;idle=createDuel({picks});setupUI();court?.prepare([castFor('a')]).catch(()=>{});return;}
  if(el.dataset.latency!==undefined&&setup){latency=Number(el.dataset.latency);setupUI();return;}
  const action=el.dataset.action;
  if(action==='start'&&!match&&court){goFullscreen();startMatch();}
  if(action==='resume')resume();
  if(action==='retry'){newMatch();}
  if(action==='setup'){match=null;input.reset();keysB.clear();}
  uiPhase='';phaseUI();hud();
});
$('pause').addEventListener('click',suspend);
$('attack').addEventListener('pointerdown',e=>{if(!e.isPrimary&&e.pointerType==='mouse')return;e.preventDefault();press('a','swing');});
$('attack').addEventListener('click',e=>{if(e.detail===0)press('a','swing');});
for(const [id,kind] of [['skill-spin','spin'],['skill-burst','burst']]){
  $(id).addEventListener('pointerdown',e=>{if(!e.isPrimary&&e.pointerType==='mouse')return;e.preventDefault();press('a',kind);});
  $(id).addEventListener('click',e=>{if(e.detail===0)press('a',kind);});
}
for(const [id,direction] of [['move-left',-1],['move-right',1]]){
  const button=$(id);
  button.addEventListener('pointerdown',e=>{if(e.button!==0||!match||!DUEL_ACTIVE.includes(match.state.phase))return;e.preventDefault();input.down(e.pointerId,direction);button.setPointerCapture(e.pointerId);});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,e=>input.up(e.pointerId));
  button.addEventListener('contextmenu',e=>e.preventDefault());
}
window.addEventListener('keydown',e=>{
  const active=!!match&&DUEL_ACTIVE.includes(match.state.phase);if(!active)return;
  if(e.code==='Escape'){suspend();return;}
  const once=fn=>{e.preventDefault();if(!e.repeat)fn();};
  if(mode==='local'){
    if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();keysB.add(e.key);}
    else if(e.key==='ArrowUp')once(()=>press('b','swing'));
    else if(e.code==='Comma')once(()=>press('b','spin'));
    else if(e.code==='Period')once(()=>press('b','burst'));
    else if(['a','A','d','D'].includes(e.key)){e.preventDefault();input.key(e.key,true);}
    else if(e.code==='Space')once(()=>press('a','swing'));
    else if(e.code==='KeyQ')once(()=>press('a','spin'));
    else if(e.code==='KeyE')once(()=>press('a','burst'));
  }else{
    if(['ArrowLeft','ArrowRight','a','A','d','D'].includes(e.key)){e.preventDefault();input.key(e.key,true);}
    else if(e.code==='Space')once(()=>press('a','swing'));
    else if(e.code==='KeyJ')once(()=>press('a','spin'));
    else if(e.code==='KeyK')once(()=>press('a','burst'));
  }
});
window.addEventListener('keyup',e=>{input.key(e.key,false);keysB.delete(e.key);});
window.addEventListener('blur',suspend);
document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();lastTime=0;});
$('sound').addEventListener('click',()=>{soundOn=!soundOn;setSound(soundOn);$('sound').setAttribute('aria-pressed',String(soundOn));$('sound').setAttribute('aria-label',soundOn?'关闭音效':'开启音效');$('sound').innerHTML=`${soundOn?'♪':'♩'} <span>音效${soundOn?'开':'关'}</span>`;if(soundOn)sound('start');else if(navigator.audioSession)navigator.audioSession.type='auto';});

setupUI();phaseUI();hud();requestAnimationFrame(frame);
