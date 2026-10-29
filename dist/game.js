import {SKILLS,GOAL_CAM,goalLock,useSkill,skillStatus,spinPreview,predictFlight,burstZone,LEVELS,WEAPONS,ACTIVE_PHASES,KEEPER_Z,KEEPER_REACH,FAR_WALL,GOAL_Z,createGame,startGame,stepGame,attack,pauseGame,resumeGame,ballHeight,hitZone,swingPreview,crossingFrom,foldX} from './core.mjs';
import {createInput} from './input.mjs';
import {renderShareCard,shareCard} from './share.mjs';
import {loadProgress,saveProgress,needsTutorial} from './storage.mjs';
import {create3DRenderer} from './scene3d.mjs';
import {LEVEL_BOSSES} from './characters.mjs';
import {sound,buzz,setSound} from './sfx.mjs';
import {screenFor,createMatchStats,recordMatchEvent,matchSummary,icon,hitFeel,whiffHint,TUTORIAL_TIPS,SKILL_STATE} from './ui.mjs';

const $=id=>document.getElementById(id);
// In a match tips float over the court as a caption: any change to the feedback line shows it for a few seconds.
let captionTimer=0;
new MutationObserver(()=>{const box=$('feedback').parentElement;box.classList.add('show');clearTimeout(captionTimer);captionTimer=setTimeout(()=>box.classList.remove('show'),4200);})
  .observe($('feedback'),{childList:true,characterData:true,subtree:true});
// Touch devices go true full screen when a match starts (a user gesture); where the API is missing (iPhone Safari) the
// page layout is already full-bleed and the installed app runs standalone.
function goFullscreen(){const d=document.documentElement;if(matchMedia('(pointer:coarse)').matches&&document.fullscreenEnabled&&!document.fullscreenElement&&d.requestFullscreen)d.requestFullscreen({navigationUI:'hide'}).catch(()=>{});}
let canvas=$('court'),ctx=null,court3D=null;
const input=createInput();
let storage;try{storage=window.localStorage;}catch{storage=null;}
const progress=loadProgress(storage);
let selected=0,game=createGame(),uiPhase='',soundOn=true;
let shareShot=null,resultAt=0,lastTime=0,trail=[],particles=[],viewWidth=0,viewHeight=0,shake=0,lessonShown=false,skillIntroShown=false,fullHintShown=false;
const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let matchStats=createMatchStats();
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));


function selections(){
  const busy=[...ACTIVE_PHASES,'paused'].includes(game.phase);
  $('levels').innerHTML=LEVELS.map((l,i)=>`<button class='level-button ${selected===i?'selected':''}' data-level='${i}' aria-label='第${i+1}关 ${l.name}${i>progress.unlocked?'，未解锁':''}' aria-pressed='${selected===i}' ${i>progress.unlocked||busy?'disabled':''}><strong>${String(i+1).padStart(2,'0')}</strong><span>${l.name}</span><small>${i>progress.unlocked?icon('lock'):progress.perfect[i]?icon('spark'):progress.scores[i]?icon('check'):''}</small></button>`).join('');
  $('stage-name').textContent=LEVELS[selected].name;
  document.querySelector('.game-top .mini-label').textContent=`第 ${String(selected+1).padStart(2,'0')} 关`;
  $('level-note').textContent=LEVELS[selected].lesson;
  // Each level's keeper has a face (characters.mjs LEVEL_BOSSES); the court shows it, and the next one is fetched ahead.
  const boss=LEVEL_BOSSES[selected];$('level-boss').textContent=`本关门将：${boss.name}「${boss.title}」，${boss.intro}`;
  court3D?.prepare([{near:'striker',far:boss.figure}]).catch(()=>{});
  court3D?.preload([LEVEL_BOSSES[Math.min(LEVELS.length-1,selected+1)].figure]).catch(()=>{});
  $('prep-level-name').textContent=LEVELS[selected].name;
  $('prep-rule').textContent=`进 ${LEVELS[selected].goals} 球通关 · 丢 3 球结束`;
  $('prep-stage').textContent=`第 ${String(selected+1).padStart(2,'0')} 关`;
  $('best').textContent=progress.scores[selected]??'—';
  $('best-record').hidden=!progress.scores[selected];
  $('save-note').hidden=progress.saved;$('save-note').textContent=progress.saved?'':'进度暂时无法保存';
}
function ready(tutorial=false){lessonShown=false;matchStats=createMatchStats();game=createGame(selected,'glove',{tutorial});trail=[];particles=[];input.reset();uiPhase='';selections();phaseUI();hud();}
function overlay(html){$('overlay-content').innerHTML=html;$('overlay').hidden=false;}
function phaseUI(){
  if(game.phase===uiPhase)return;
  if(game.phase==='won'&&performance.now()<resultAt)return;
  uiPhase=game.phase;
  const previous=document.body.dataset.screen,screen=screenFor(game.phase);document.body.dataset.screen=screen;
  $('start-match').disabled=game.phase!=='ready';
  if(game.phase==='ready'){$('overlay').hidden=true;}
  else if(game.phase==='paused')overlay(`<div class='overlay-symbol'>${icon('shield')}</div><span class='eyebrow'>暂停时刻</span><h3>这一球，等你回来。</h3><p>休息一下，球和本关进度都会保留。</p><button class='primary-button' data-action='resume'>继续防守 ${icon('arrow')}</button><div class='pause-actions'><button class='secondary-button' data-action='retry'>重新开始本关</button><button class='secondary-button' data-action='ready'>返回俱乐部</button></div>`);
  else if(['won','lost'].includes(game.phase)){
    if(game.phase==='won'){
      progress.unlocked=Math.max(progress.unlocked,Math.min(5,selected+1));
      progress.scores[selected]=Math.max(progress.scores[selected]||0,game.score);
      if(game.misses===0)progress.perfect[selected]=true;
      progress.saved=saveProgress(storage,progress);sound('win');
    }
    const r=matchSummary(game,matchStats);
    // The share card is drawn now, so the button can share a ready file inside the tap.
    const card={...r,level:selected+1,levelName:game.level.name},shot=shareShot={card,blob:null};
    renderShareCard(card).then(blob=>{if(shareShot!==shot)return;shot.blob=blob;const b=$('overlay-content').querySelector('[data-action=share]');if(b)b.disabled=false;}).catch(()=>{});
    overlay(`<div class='overlay-symbol ${r.won?'':'loss'}'>${icon(r.won?'trophy':'retry')}</div><span class='eyebrow'>第 ${String(selected+1).padStart(2,'0')} 关 · ${game.level.name}</span><h3>${r.title}</h3><div class='result-subtitle'>${r.won?(selected===5?'六关全部完成，你就是守门王牌。':'这一球，打得有点漂亮。'):'稳住节奏，下一个空当属于你。'}</div><div class='result-score'>${r.goals}<small>/ ${r.target} 球</small></div><div class='result-highlight'>${icon('spark')}${r.highlight}</div><div class='result-stats'><span><b>${r.bestCombo}</b>最高连击</span><span><b>${r.powerHits}</b>重炮击球</span><span><b>${r.score}</b>本局得分</span></div>${r.won?'':`<div class='result-advice'><b>下局试试</b>${r.advice}</div>`}<button class='primary-button' data-action='${r.action}'>${r.actionLabel} ${icon(r.action==='next'?'arrow':'retry')}</button><div class='result-links'><button class='secondary-button share-button' data-action='share' disabled>${icon('spark')} 分享战绩</button><button class='secondary-button' data-action='ready'>返回俱乐部</button></div>`);
    input.reset();
  }else $('overlay').hidden=true;
  selections();
  if(previous!==screen){window.scrollTo(0,0);queueMicrotask(()=>{if(screen==='paused'||screen==='result')$('overlay-content').querySelector('.primary-button')?.focus({preventScroll:true});else if(screen==='match')canvas.focus({preventScroll:true});else $('start-match').focus({preventScroll:true});});}
}
function hud(){
  $('progress').textContent=game.tutorial?`教学 ${game.tutorial.step+1} / 3`:`${game.goals} / ${game.level.goals}`;
  $('progress-bar').style.width=`${game.goals/game.level.goals*100}%`;
  $('hearts').innerHTML=[0,1,2].map(i=>`<span class="life ${i>=3-game.misses?'spent':''}">${icon('shield')}</span>`).join('');
  $('hearts').setAttribute('aria-label',`剩余${3-game.misses}次机会`);
  $('score').innerHTML=`${String(game.score).padStart(4,'0')} <small>分</small>`;
  $('pause').disabled=!ACTIVE_PHASES.includes(game.phase);
  $('attack').disabled=game.phase!=='playing';
  $('attack').classList.toggle('recovering',!!game.swing);
  $('attack').querySelector('span').textContent=game.swing?'收招':'挥击';
  const aimNow=input.axis(),aimWord=aimNow<0?'往左 ←':aimNow>0?'往右 →':'直线 ↑',cue=game.phase==='playing'&&!game.swing?swingPreview(game,aimNow):{kind:'none'};
  $('attack').classList.toggle('ready-cue',['clean','perfect'].includes(cue.kind));
  $('attack-hint').textContent=game.swing?'收招中':cue.kind==='perfect'?`重炮时机 · ${aimWord}`:cue.kind==='clean'?`现在挥击 · ${aimWord}`:'看准再出手';
  const status={ready:'热身准备',serving:'发球准备',playing:'对决进行中',miss:'稳住，再来',goal:'进球！',skill:'爆发蓄力',paused:'已暂停',won:'本关完成',lost:'挑战结束'};
  $('court-status').textContent=game.phase==='serving'?`发球倒数 ${Math.max(1,Math.ceil(game.countdown*2))}`:game.phase==='playing'&&game.rally>1.001?`对决进行中 · 球速 ×${game.rally.toFixed(2)}`:status[game.phase];
  const teaching=!!game.tutorial&&[...ACTIVE_PHASES,'paused'].includes(game.phase);document.body.dataset.tutorial=teaching?'on':'';
  $('tutorial-bar').hidden=!teaching;if(teaching){$('tutorial-step').textContent=`${game.tutorial.step+1}/3`;$('tutorial-tip').textContent=TUTORIAL_TIPS[game.tutorial.step];}
  $('practice').hidden=!(game.practiceLeft>0&&ACTIVE_PHASES.includes(game.phase))||teaching;$('practice').textContent=`练习 ×${game.practiceLeft}`;
  // Energy bar and skill buttons: state in words, spin direction as an arrow, disabled-looking only via class.
  $('energy-fill').style.width=`${game.energy}%`;$('energy-value').textContent=game.energy;$('energy').setAttribute('aria-valuenow',game.energy);
  for(const kind of ['spin','burst']){const st=skillStatus(game,kind),b=$(`skill-${kind}`),label=SKILL_STATE[st.ok?'ok':st.reason];
    b.classList.toggle('ready',st.ok);b.classList.toggle('low',st.reason==='energy');$(`${kind}-state`).textContent=label;
    b.setAttribute('aria-label',`${kind==='spin'?'旋转回击，消耗50能量':'爆发回击，消耗100能量'}，${label}`);}
  const pv=game.phase==='playing'&&game.ball.vz<0?spinPreview(game,aimNow):null;$('spin-dir').textContent=pv?(pv.dir==='left'?' ↺':' ↻'):'';
  $('combo').style.opacity=game.combo>1?'1':'0';$('combo').querySelector('b').textContent=game.combo;
  for(const [id,direction] of [['move-left',-1],['move-right',1]]){
    const button=$(id),pressed=input.pressed(direction);
    button.disabled=!ACTIVE_PHASES.includes(game.phase);
    button.classList.toggle('pressed',pressed);button.setAttribute('aria-pressed',String(pressed));
  }
}
function pop(text,miss=false){const el=$('hit-pop');el.textContent=text;el.className=`hit-pop${miss?' miss':''}`;void el.offsetWidth;el.classList.add('show');}
// Shot quality pops mid-court; what the shot achieved gets its own banner at the top.
// The level's keeper steps up as a match starts (not in the tutorial, which has its own banners).
function announceBoss(){if(game.tutorial)return;const b=LEVEL_BOSSES[selected];verdict(`本关门将 · ${b.name}「${b.title}」`,'info');}
function verdict(text,kind){const el=$('result-pop');el.textContent=text;el.className=`result-pop ${kind}`;void el.offsetWidth;el.classList.add('show');}
function swing(){if(attack(game))sound('swing');}
// A refused request costs nothing and says why; acceptance is announced by the core's own events.
function trySkill(kind){
  if(!ACTIVE_PHASES.includes(game.phase))return;
  const r=useSkill(game,kind,input.axis());
  if(!r.ok){sound('deny');pop(SKILL_STATE[r.reason]||'现在不行',true);}
}
// Finished or skipped: remember it and start the real level 1 from a brand-new state.
function finishTutorial(completed){
  progress.tutorialDone=true;progress.saved=saveProgress(storage,progress);
  selected=0;ready(false);startGame(game);sound('start');phaseUI();hud();
  verdict(completed?'教学完成 · 正式开始！':'已跳过教学 · 正式开始','info');$('feedback').textContent=game.level.lesson;lessonShown=true;
}
function beginTutorial(){selected=0;ready(true);startGame(game);sound('start');phaseUI();hud();}
function suspend(){pauseGame(game);input.reset();phaseUI();hud();}
function fallbackRenderer(){
  court3D?.dispose();court3D=null;
  const replacement=canvas.cloneNode(false);canvas.replaceWith(replacement);canvas=replacement;
  ctx=canvas.getContext('2d');canvas.dataset.renderer='2d';viewWidth=0;viewHeight=0;
}
try{
  court3D=create3DRenderer(canvas);canvas.dataset.renderer='3d';
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();suspend();fallbackRenderer();$('feedback').textContent='已切换兼容画面，可以继续防守。';});
}catch{fallbackRenderer();}

document.querySelector('.app').addEventListener('click',e=>{
  const action=e.target.closest('[data-action]')?.dataset.action;if(!action)return;
  if(action==='choose-level'){
    if(game.phase!=='ready')return;
    const dialog=$('selection-dialog');dialog.showModal();
    dialog.querySelector('.level-button.selected')?.focus();return;
  }
  if(action==='help'){suspend();$('help-dialog').showModal();return;}
  if(action==='share'){const b=e.target.closest('[data-action]');if(shareShot?.blob)shareCard(shareShot.blob,shareShot.card).then(how=>{if(how!=='cancelled')b.textContent=how==='shared'?'已分享':'战绩图已保存';});return;}
  if(['start','retry','next'].includes(action))goFullscreen();
  if(action==='start'){if(selected===0&&needsTutorial(progress)&&!game.tutorial){beginTutorial();return;}startGame(game);sound('start');announceBoss();}
  if(action==='resume')resumeGame(game);
  if(action==='retry'){ready(!!game.tutorial);startGame(game);sound('start');}
  if(action==='ready')ready();
  if(action==='next'){selected=Math.min(5,selected+1);ready();startGame(game);sound('start');announceBoss();}
  phaseUI();hud();
});
$('levels').addEventListener('click',e=>{const b=e.target.closest('[data-level]');if(b&&!b.disabled){selected=Number(b.dataset.level);ready();$('levels').querySelector('.selected')?.focus();}});
for(const id of ['selection-close','selection-done'])$(id).addEventListener('click',()=>$('selection-dialog').close());
$('pause').addEventListener('click',suspend);
$('tutorial-skip').addEventListener('click',()=>{if(game.tutorial)finishTutorial(false);});
$('replay-tutorial').addEventListener('click',()=>{$('help-dialog').close();beginTutorial();});
$('attack').addEventListener('pointerdown',e=>{if(!e.isPrimary&&e.pointerType==='mouse')return;e.preventDefault();swing();});
$('attack').addEventListener('click',e=>{if(e.detail===0)swing();});
// Skill buttons take their own pointer, so a finger holding a direction keeps moving.
for(const [id,kind] of [['skill-spin','spin'],['skill-burst','burst']]){
  $(id).addEventListener('pointerdown',e=>{if(!e.isPrimary&&e.pointerType==='mouse')return;e.preventDefault();trySkill(kind);});
  $(id).addEventListener('click',e=>{if(e.detail===0)trySkill(kind);});
}
for(const [id,direction] of [['move-left',-1],['move-right',1]]){
  const button=$(id);
  button.addEventListener('pointerdown',e=>{
    if(e.button!==0||!ACTIVE_PHASES.includes(game.phase))return;
    e.preventDefault();input.down(e.pointerId,direction);button.setPointerCapture(e.pointerId);
  });
  for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,e=>input.up(e.pointerId));
  // Focused buttons support keyboard hold without also triggering the global Space attack.
  button.addEventListener('keydown',e=>{if(!['Space','Enter'].includes(e.code))return;e.preventDefault();e.stopPropagation();if(ACTIVE_PHASES.includes(game.phase))input.down(`${id}:${e.code}`,direction);});
  button.addEventListener('keyup',e=>{if(!['Space','Enter'].includes(e.code))return;e.preventDefault();e.stopPropagation();input.up(`${id}:${e.code}`);});
  button.addEventListener('blur',()=>{input.up(`${id}:Space`);input.up(`${id}:Enter`);});
  button.addEventListener('contextmenu',e=>e.preventDefault());
}
window.addEventListener('keydown',e=>{
  if(document.querySelector('dialog[open]'))return;
  if(['ArrowLeft','ArrowRight','a','A','d','D'].includes(e.key)&&ACTIVE_PHASES.includes(game.phase)){e.preventDefault();input.key(e.key,true);}
  if(e.code==='Space'&&game.phase==='playing'){e.preventDefault();if(!e.repeat)swing();}
  if((e.code==='KeyJ'||e.code==='KeyK')&&ACTIVE_PHASES.includes(game.phase)){e.preventDefault();if(!e.repeat)trySkill(e.code==='KeyJ'?'spin':'burst');}
  if(e.code==='Escape'&&ACTIVE_PHASES.includes(game.phase))suspend();
});
window.addEventListener('keyup',e=>input.key(e.key,false));
window.addEventListener('blur',suspend);
document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();lastTime=0;});
$('sound').addEventListener('click',()=>{soundOn=!soundOn;setSound(soundOn);$('sound').setAttribute('aria-pressed',String(soundOn));$('sound').setAttribute('aria-label',soundOn?'关闭音效':'开启音效');$('sound').innerHTML=`${soundOn?'♪':'♩'} <span>音效${soundOn?'开':'关'}</span>`;if(soundOn)sound('start');else if(navigator.audioSession)navigator.audioSession.type='auto';});
$('help').addEventListener('click',()=>{suspend();$('help-dialog').showModal();});
for(const b of [$('help-close'),document.querySelector('.dialog-close')])b.addEventListener('click',()=>$('help-dialog').close());

// A fixed logical canvas keeps the court and collision hints aligned at every viewport size.
function project(x,z){const scale=.55+.45*(1-z/10);return {x:225+x/4*191*scale,y:480-z*36.4,scale};}
function polygon(points,fill,stroke,width=1){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}}
function line(x1,y1,x2,y2,color,width=1){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
function ellipse(x,y,rx,ry,color){ctx.beginPath();ctx.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();}
function round(x,y,w,h,r,color){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=color;ctx.fill();}
function text(value,x,y,size,color,weight='600',align='center'){ctx.font=`${weight} ${size}px Arial, "Microsoft YaHei", sans-serif`;ctx.textAlign=align;ctx.fillStyle=color;ctx.fillText(value,x,y);}
function stage(){
  ctx.fillStyle='#ccd4bd';ctx.fillRect(0,0,450,540);
  polygon([[0,0],[450,0],[450,99],[0,99]],'#b9c5ab');
  // Quiet landscaping and bleachers frame a warm, compact neighborhood court.
  for(const [x,y,r] of [[12,45,30],[44,17,26],[420,30,40],[382,13,27]]){ellipse(x,y,r,r*.8,'#9daf91');ellipse(x-5,y-6,r*.7,r*.55,'#adbd9b');}
  round(134,44,182,35,5,'#e9e7ca');text('R E B O U N D   C L U B',225,65,9,'#62775b');
  for(let i=0;i<4;i++){const y=82+i*8;line(24,y,108,y,'#a0ad91',4);line(342,y,427,y,'#a0ad91',4);}
  polygon([[108,112],[342,112],[431,510],[19,510]],'#a9b998');
  polygon([[116,122],[334,122],[411,486],[39,486]],game.level.color);
  ctx.save();polygon([[116,122],[334,122],[411,486],[39,486]],null,'#eeeac15c',2);
  for(let i=1;i<6;i++){const z=i*1.6,p1=project(-3.75,z),p2=project(3.75,z);line(p1.x,p1.y,p2.x,p2.y,'#f0efd20b',1);}
  for(const x of [-3.6,3.6]){const a=project(x,.3),b=project(x,9.6);line(a.x,a.y,b.x,b.y,'#e9ecc18c',1.6);}
  const mid1=project(-3.6,5),mid2=project(3.6,5);line(mid1.x,mid1.y,mid2.x,mid2.y,'#eeeac15c',1.4);
  const center=project(0,5);ctx.beginPath();ctx.ellipse(center.x,center.y,52,26,0,0,Math.PI*2);ctx.strokeStyle='#eeeac15c';ctx.lineWidth=1.4;ctx.stroke();ellipse(center.x,center.y,2.5,1.5,'#eeeac1a0');
  const a=project(-2.5,1),b=project(2.5,1),c=project(2.5,2.4),d=project(-2.5,2.4);polygon([[a.x,a.y],[b.x,b.y],[c.x,c.y],[d.x,d.y]],null,'#eeeac15c',1.4);
  ctx.save();ctx.translate(225,354);ctx.scale(1,.65);text('REBOUND',0,0,37,'#f7f2ce10','900');ctx.restore();
  // Side rails are visual bounds, matching the ball's two collision edges.
  for(const side of [-1,1]){const near=project(side*4,0),far=project(side*4,10);line(near.x,near.y,far.x,far.y,'#72876a',5);line(near.x,near.y-18,far.x,far.y-14,'#ebecd1',3);for(let z=0;z<=10;z+=2){const p=project(side*4,z);line(p.x,p.y,p.x,p.y-17,'#cdd6b8',2);}}
  // The far wall is split around the keeper's goal mouth.
  const g=game.level.goalHalf,wl=project(-4,FAR_WALL),wr=project(4,FAR_WALL),gl=project(-g,FAR_WALL),gr=project(g,FAR_WALL);
  for(const [a,b] of [[wl,gl],[gr,wr]]){round(Math.min(a.x,b.x),a.y-14,Math.abs(b.x-a.x),18,3,'#dfebad');round(Math.min(a.x,b.x),a.y+2,Math.abs(b.x-a.x),6,2,'#1b4438');}
  polygon([[gl.x,gl.y-20],[gr.x,gr.y-20],[gr.x,gr.y+4],[gl.x,gl.y+4]],'#f1f0d32c');
  for(let x=gl.x+6;x<gr.x;x+=9)line(x,gl.y-20,x,gl.y+4,'#eeefd25a',.8);
  line(gl.x,gl.y+4,gl.x,gl.y-20,'#f8f2d7',4);line(gr.x,gr.y+4,gr.x,gr.y-20,'#f8f2d7',4);line(gl.x,gl.y-20,gr.x,gr.y-20,'#fff7df',4);
  // Fixed goal and net sit behind the defender.
  polygon([[41,471],[409,471],[423,512],[27,512]],'#f1f0d32c');
  for(let x=43;x<410;x+=18)line(x,449,x+(x-225)*.06,507,'#eeefd25a',.8);
  for(let y=450;y<=508;y+=10)line(41-(y-449)*.18,y,409+(y-449)*.18,y,'#eeefd25a',.8);
  line(41,480,41,446,'#f8f2d7',5);line(409,480,409,446,'#f8f2d7',5);line(41,446,409,446,'#fff7df',5);
  line(41,480,409,480,'#f8f2d7aa',2);text('守 住 这 里',225,508,10,'#f4f1ceaa');
  ctx.restore();
}
function player(){
  const p=project(game.player.x,game.player.z),w=WEAPONS.glove;
  const moving=Math.abs(input.axis())>.05&&game.phase==='playing';const gait=moving?Math.sin(game.elapsed*19)*4:0;
  const sw=game.swing;const swingAmount=sw?Math.sin(Math.min(1,sw.time/(w.windup+w.active))*Math.PI):0;
  ellipse(p.x,p.y+3,23,8,'#12372d45');
  // Sneakers, shorts, jersey, head: the full character remains visible.
  line(p.x-7,p.y-18,p.x-10,p.y-2+gait,'#ad805f',8);line(p.x+7,p.y-18,p.x+10,p.y-2-gait,'#ad805f',8);
  round(p.x-17,p.y-3+gait,13,7,3,'#f7efcf');round(p.x+4,p.y-3-gait,13,7,3,'#f7efcf');
  round(p.x-13,p.y-24,26,13,4,'#233f37');line(p.x,p.y-23,p.x,p.y-13,'#152e28',2);
  polygon([[p.x-16,p.y-47],[p.x+16,p.y-47],[p.x+13,p.y-23],[p.x-13,p.y-23]],'#f1e8c9','#d5d7b4',1);
  round(p.x-13,p.y-45,26,7,1,'#eb794f');text('01',p.x,p.y-29,11,'#375b47','900');
  const armY=p.y-39-swingAmount*12;
  line(p.x-15,p.y-42,p.x-23,p.y-30-swingAmount*12,'#bc8b65',8);
  line(p.x+15,p.y-42,p.x+23,armY+4,'#bc8b65',8);
  ellipse(p.x-24,p.y-31-swingAmount*14,10,11,'#bd4834');ellipse(p.x-24,p.y-34-swingAmount*14,9,10,'#f1784f');
  ellipse(p.x+24,armY+2,10,11,'#bd4834');ellipse(p.x+24,armY-1,9,10,'#f1784f');
  line(p.x-30,p.y-28-swingAmount*14,p.x-18,p.y-28-swingAmount*14,'#f8cba2',3);line(p.x+18,armY+5,p.x+30,armY+5,'#f8cba2',3);
  ellipse(p.x,p.y-54,12,13,'#bf8f69');ellipse(p.x,p.y-58,12,9,'#30392f');round(p.x-12,p.y-57,24,6,3,'#30392f');
  if(sw&&!reduceMotion){ctx.beginPath();ctx.ellipse(p.x+6,p.y-47,38+Math.sin(sw.time*8)*6,17,-.3,Math.PI*1.05,Math.PI*1.85);ctx.strokeStyle=`rgba(245,241,192,${swingAmount*.65})`;ctx.lineWidth=4;ctx.stroke();}
}
function hints(){
  const r=hitZone(game),incoming=game.phase==='playing'&&game.ball.vz<0,p=incoming&&!game.swing?swingPreview(game,input.axis()):{kind:'none'};
  const quad=(l,rgt,n,f)=>[project(l,n),project(rgt,n),project(rgt,f),project(l,f)].map(q=>[q.x,q.y]);
  const tone={perfect:['#ffffff','#ff6a2be6'],clean:['#ffffff','#ff6a2b60'],soft:['#f3df8a','#ff6a2b38'],whiff:['#e9edd066','#ff6a2b26'],none:['#e9edd055','#ff6a2b22']}[p.kind];
  polygon(quad(r.left,r.right,r.near,r.far),'#e5efac22',tone[0],1.6);polygon(quad(r.left,r.right,r.sweetNear,r.sweetFar),tone[1]);
  const k=project(game.keeper.x-KEEPER_REACH,KEEPER_Z),k2=project(game.keeper.x+KEEPER_REACH,KEEPER_Z);line(k.x,k.y+3,k2.x,k2.y+3,game.keeper.dive>0?'#ff5a4acc':'#9cc8ea88',5);
  if(p.kind==='clean'||p.kind==='perfect'){const a=project(p.x,p.z),b=project(p.x+Math.sin(p.angle)*2,p.z+Math.cos(p.angle)*2);line(a.x,a.y,b.x,b.y,p.kind==='perfect'?'#ff7a3d':'#ffffff',3);}
  const fl=game.ball.vz>0&&['playing','goal','won'].includes(game.phase)?predictFlight(game):null;
  if(fl){
    for(let i=1;i<fl.count;i++){if(fl.zs[i]<=game.ball.z)continue;const q=project(fl.xs[i],fl.zs[i]);ellipse(q.x,q.y,2,1.4,game.ball.kind==='spin'?'#37d6c0dd':'#fff6d8cc');}
    const gx=fl.goal??fl.xs[fl.count-1],t=project(gx,GOAL_Z),open=Math.abs(gx)<=game.level.goalHalf,blocked=Math.abs(gx-game.keeper.x)<=KEEPER_REACH;
    ctx.beginPath();ctx.ellipse(t.x,t.y,9,5,0,0,Math.PI*2);ctx.strokeStyle=!open?'#c9c9b8':blocked?'#ff5a4a':'#5fe07a';ctx.lineWidth=3;ctx.stroke();
  }
  if(incoming&&skillStatus(game,'spin').ok){const sp=spinPreview(game,input.axis());for(let i=1;i<sp.count;i++){const q=project(sp.xs[i],sp.zs[i]);ellipse(q.x,q.y,2.4,1.6,'#37d6c0ee');}}
  if(incoming&&!game.swing&&game.energy>=SKILLS.burst.cost){const z=burstZone(game);polygon(quad(z.left,z.right,z.near,z.far),null,'#ff9a3caa',1.4);}
  // 2D burst show follows the same beats as the 3D one: dim, banner, growing ring, strike flash and shock ring.
  if(game.skill){const B=SKILLS.burst,t=game.skill.time,p=project(game.player.x,game.player.z),k=Math.min(1,t/B.duration),charge=Math.min(1,t/B.strike);
    ctx.fillStyle=`rgba(20,45,36,${.32*Math.sin(Math.PI*k)})`;ctx.fillRect(0,0,450,540);
    ctx.beginPath();ctx.ellipse(p.x,p.y,26+30*charge,10+12*charge,0,0,Math.PI*2);ctx.strokeStyle='#ff8a3c';ctx.lineWidth=3+2*charge;ctx.stroke();
    if(t>=B.strike){const s=Math.min(1,(t-B.strike)/(B.duration-B.strike));ctx.beginPath();ctx.ellipse(p.x,p.y,40+120*s,14+40*s,0,0,Math.PI*2);ctx.strokeStyle=`rgba(255,214,140,${1-s})`;ctx.lineWidth=4;ctx.stroke();}
    if(t<B.release){const slide=reduceMotion?0:Math.max(0,1-t/B.freeze)*300;ctx.save();ctx.translate(slide,0);polygon([[60,176],[410,176],[390,216],[40,216]],'#ff7a2ee6');text('爆发 BURST »»»',225,205,24,'#fff8e8','900');ctx.restore();}
    if(!reduceMotion&&(t<.07||(t>=B.strike&&t<B.strike+.1))){ctx.fillStyle='rgba(255,248,230,.55)';ctx.fillRect(0,0,450,540);}}
}
function keeper(){
  const k=game.keeper,p=project(k.x,KEEPER_Z),s=p.scale,lean=k.diveDir*(k.dive/.35)*14;
  ellipse(p.x,p.y+2,KEEPER_REACH*48*s,5,'#12372d45');
  line(p.x-5*s,p.y-14*s,p.x-7*s,p.y,'#ad805f',6*s);line(p.x+5*s,p.y-14*s,p.x+7*s,p.y,'#ad805f',6*s);
  polygon([[p.x-12*s+lean*.4,p.y-36*s],[p.x+12*s+lean*.4,p.y-36*s],[p.x+10*s,p.y-14*s],[p.x-10*s,p.y-14*s]],'#3d6f95','#2c5574',1);
  for(const side of [-1,1]){const hx=p.x+side*(20*s)+lean,hy=p.y-40*s-(k.dive>0?8:0);line(p.x+side*11*s+lean*.4,p.y-33*s,hx,hy,'#bc8b65',5*s);ellipse(hx,hy,6*s,6*s,'#f2c14e');}
  ellipse(p.x+lean*.5,p.y-43*s,8*s,9*s,'#bf8f69');ellipse(p.x+lean*.5,p.y-47*s,8*s,6*s,'#30392f');
}
function ball(){
  if(game.phase==='miss'||game.phase==='lost')return;
  const b=game.ball,p=project(b.x,b.z),r=8.4*p.scale;
  if(!reduceMotion)for(let i=0;i<trail.length;i++){const q=project(trail[i].x,trail[i].z);ellipse(q.x,q.y-10*q.scale,r*(i/trail.length)*.65,r*(i/trail.length)*.65,`rgba(246,207,105,${i/trail.length*.27})`);}
  ellipse(p.x+3,p.y+1,r*1.15,r*.36,'#0c302d3b');
  const y=p.y-(11+(ballHeight(game)-.73)*30)*p.scale;
  if(b.vz<0&&b.z<3.4){ctx.beginPath();ctx.ellipse(p.x,p.y,r*2.1,r*.7,0,0,Math.PI*2);ctx.strokeStyle='#f6d77ab0';ctx.lineWidth=1.5;ctx.stroke();}
  ellipse(p.x,y,r+1,r+1,'#a9772b');ellipse(p.x,y-1,r,r,'#f6cc67');ellipse(p.x-2,y-3,r*.42,r*.32,'#ffe9a2');
  ctx.beginPath();ctx.ellipse(p.x,y-1,r*.5,r,0,0,Math.PI*2);ctx.strokeStyle='#ac802b';ctx.lineWidth=.9;ctx.stroke();line(p.x-r,y-1,p.x+r,y-1,'#ac802b',.9);
}
function draw(dt){
  if(court3D){court3D.render(game,input.axis(),reduceMotion,shake);return;}
  const rect=canvas.getBoundingClientRect();const dpr=Math.min(window.devicePixelRatio||1,2);
  if(rect.width!==viewWidth||rect.height!==viewHeight){viewWidth=rect.width;viewHeight=rect.height;canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);}
  ctx.setTransform(canvas.width/450,0,0,canvas.height/540,0,0);ctx.lineCap='round';ctx.lineJoin='round';
  stage();hints();keeper();player();ball();
  for(const particle of particles){if(game.phase!=='paused'){particle.life-=dt;particle.x+=particle.vx*dt;particle.y+=particle.vy*dt;}ellipse(particle.x,particle.y,Math.max(.1,particle.life*5),Math.max(.1,particle.life*5),'#fff0a3');}
  particles=particles.filter(p=>p.life>0);
  if(game.phase==='serving'){const n=Math.max(1,Math.ceil(game.countdown*2));round(190,233,70,66,16,'#fff5dbed');text(String(n),225,280,39,'#2c5f4a','900');}
}
function frame(time){
  const dt=lastTime?Math.min((time-lastTime)/1000,.05):0;lastTime=time;
  // Key goals play their last moments in slow motion (goalLock); the rules just see ordinary, slower time.
  const lock=reduceMotion?null:goalLock(game),slow=lock?.key&&lock.t<=GOAL_CAM.slowWindow?GOAL_CAM.slow:1;
  stepGame(game,dt*slow,input.axis());
  const events=game.events;game.events=[];
  const aim={left:'往左 ←',right:'往右 →',straight:'直线 ↑'},say=text=>$('feedback').textContent=text;
  for(const e of events){
    if(e==='tutorialDone'){finishTutorial(true);break;}
    const teaching=!!game.tutorial;
    if(!teaching)recordMatchEvent(matchStats,e,game);
    if(['wall','wide','save','goal','miss','practice'].includes(e))sound(e);
    if(['hit','perfect','soft'].includes(e)){const f=hitFeel(game.weapon,e);sound(f.sound,f.intensity);if(e==='perfect')sound('impact');}
    if(e==='whiff')sound('whiff');
    buzz(e);
    if(e==='serve'&&!lessonShown&&!teaching){say(game.level.lesson);lessonShown=true;}
    if(e==='serve'&&!teaching&&!skillIntroShown){verdict('能量 50 放「旋转」改路线 · 满 100 放「爆发」','info');skillIntroShown=true;}
    if(e==='energy50'||e==='energy100'){const el=$('energy');el.classList.remove('flash');void el.offsetWidth;el.classList.add('flash');}
    if(e==='energy100'&&!fullHintShown){say('能量满了：等球进框按「爆发」（K）打出强力回击，或先用「旋转」（J）。');fullHintShown=true;}
    if(e==='spin'){const f=hitFeel(game.weapon,'spin');sound(f.sound,f.intensity);sound('whirl');pop(game.ball.curve?.k>0?'右旋 ↻':'左旋 ↺');say('旋转球会沿弧线拐弯，撞到侧墙后变回直线。');}
    if(e==='burstStart'){sound('charge');$('feedback').textContent='蓄力爆发……';}
    if(e==='burstStrike')sound('strike');
    if(e==='burst'){const f=hitFeel(game.weapon,'burst');sound(f.sound,f.intensity);sound('impact');pop('爆发！');shake=Math.max(shake,.08);say('爆发球很快，但正对门将一样会被扑住。');}
    if(e==='hit'){pop(aim[game.lastShot]||'好球！');if(!teaching)say('挥击时按住 ← 或 → 就往那边打，不按打直线。看红绿终点判断门将有没有封住。');}
    if(e==='perfect'){pop('重炮！');shake=Math.max(shake,.06);}
    if(e==='soft'){pop('软球',true);say('挥早了：球自己撞上来，只能打出慢速直球。等框变亮再按。');}
    if(e==='whiff'){pop(whiffHint(game.whiff),true);say({early:'球还没到框里就挥了，等影子进框再按。',late:'球已经过了身位，下次早一点出手。',reach:'球在框外，先移到影子上再挥击。',none:'现在没有来球，等球飞回来。'}[game.whiff?.reason]||'这次没碰到球，看框亮起再出手。');}
    if(e==='tutorialStep'){verdict('好球！下一步','good');}
    if(e==='tutorialRetry'){verdict('再来一球','info');}
    if(e==='save'){verdict(teaching?'门将挡住了 · 按住空的一侧再挥击':game.lastShot==='perfect'?'重炮被扑住 · 门将封住了这条线':'被扑住 · 门将封住了这条线','bad');shake=Math.max(shake,.03);if(!teaching)say('终点变红说明门将挡在那条线上。挥击时按住另一侧方向键，或用旋转绕开它。');}
    // The winning goal's camera shot plays out before the result card covers the court.
    if(e==='goal'&&game.phase==='won')resultAt=performance.now()+1000*(reduceMotion?.3:game.lastGoal?.key?GOAL_CAM.hold+GOAL_CAM.back:.6);
    if(e==='goal'&&!teaching){verdict(game.lastShot==='perfect'?'重炮破门！':'进球！','good');shake=Math.max(shake,.1);say(game.phase==='won'?'漂亮，本关拿下！':`进球！还差 ${Math.max(0,game.level.goals-game.goals)} 球。`);}
    if(e==='wide'){verdict('打偏了 · 球出了门框','bad');if(!teaching)say('这球偏出了门框，下一球换个方向。');}
    if(e==='practice'){verdict(`练习球 · 不扣机会（还剩 ${game.practiceLeft}）`,'info');say('看地上的影子，移动到亮框里再挥击。');trail=[];}
    if(['hit','perfect','goal'].includes(e)&&!reduceMotion&&!court3D){const p=project(game.ball.x,game.ball.z);for(let i=0;i<9;i++)particles.push({x:p.x,y:p.y-12,vx:Math.cos(i*2.4)*60,vy:Math.sin(i*2.4)*60,life:.35});}
    if(e==='miss'){verdict('丢球！','bad');shake=Math.max(shake,.08);say('提前看影子，移动到位再出手。');trail=[];}
  }
  if(reduceMotion){game.hitstop=0;shake=0;}
  shake*=Math.exp(-dt*9);if(shake<.005)shake=0;
  if(game.phase==='playing'&&!reduceMotion&&!court3D){trail.push({x:game.ball.x,z:game.ball.z});if(trail.length>7)trail.shift();}
  phaseUI();hud();draw(dt);requestAnimationFrame(frame);
}
ready();requestAnimationFrame(frame);
// Everything is wired: lift the loading cover from index.html once the court can draw. The 3D court first loads its
// two characters; if that fails the match continues on the 2D court.
const booted=()=>{document.body.dataset.booted='1';};
if(court3D)court3D.ready.then(booted,()=>{fallbackRenderer();$('feedback').textContent='已切换兼容画面，可以继续防守。';booted();});
else booted();
// Offline play and install: release builds ship sw.js; local development (localhost) never registers it.
if('serviceWorker' in navigator&&!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname))navigator.serviceWorker.register('./sw.js').catch(()=>{});
