// Phone audio QA (node scripts/audio-qa.mjs, needs the local server on :4173). Mobile Chrome with a strict autoplay policy;
// navigator.audioSession and media play() are stubbed/recorded in the test browser only, game state is not touched.
import {chromium,CHROME} from './qa-env.mjs';import assert from 'node:assert/strict';
const b=await chromium.launch({executablePath:CHROME,headless:true,args:['--autoplay-policy=document-user-activation-required']});
const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.addInitScript(()=>{localStorage.setItem('rebound-club-v2',JSON.stringify({unlocked:5,scores:{0:2200},perfect:{},tutorialDone:true}));
  window.__session={type:'auto'};Object.defineProperty(navigator,'audioSession',{value:window.__session});
  window.__plays=[];const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){__plays.push({ua:navigator.userActivation.isActive,src:this.src.slice(0,22)});return play.call(this);};
  window.__made={buffer:0,compressor:0};const A=window.AudioContext;window.AudioContext=class extends A{constructor(...a){super(...a);window.__ctx=this;}createBuffer(...a){__made.buffer++;return super.createBuffer(...a);}createDynamicsCompressor(){__made.compressor++;return super.createDynamicsCompressor();}};});
await p.goto('http://localhost:4173/');await p.waitForTimeout(300);
const tap=async sel=>{const r=await p.locator(sel).boundingBox();await p.touchscreen.tap(r.x+r.width/2,r.y+r.height/2);await p.waitForTimeout(250);};
const st=()=>p.evaluate(()=>({session:__session.type,plays:__plays,state:window.__ctx?.state}));
await tap('#start-match');const a=await st();console.log('开始后',JSON.stringify(a));
assert.equal(a.state,'running');assert.equal(a.session,'playback','点击后音频会话应为 playback（不受静音开关影响）');
assert.ok(a.plays.some(x=>x.ua&&x.src.startsWith('data:audio/wav')),'旧版 iOS：应在点击内播放一次无声音频');
await p.evaluate(()=>__ctx.suspend());await p.waitForTimeout(100);await tap('#attack');const c=await st();console.log('暂停后再点',JSON.stringify(c));
assert.equal(c.state,'running','被系统暂停/中断后，下一次触摸应恢复');
await tap('#sound');const d=await st();console.log('关音效后',JSON.stringify(d));assert.equal(d.session,'auto','关掉音效后归还音频会话');
await tap('#sound');const e=await st();console.log('再开音效后',JSON.stringify(e));assert.equal(e.session,'playback');
// Noise is generated once and reused; every cue goes through one master compressor (no clipping when cues stack).
for(let i=0;i<4;i++){await p.waitForTimeout(700);await tap('#attack');}
const made=await p.evaluate(()=>__made);console.log('音频对象',JSON.stringify(made));
assert.ok(made.buffer<=1,`噪声缓冲创建 ${made.buffer} 次`);assert.equal(made.compressor,1);
assert.deepEqual(errors,[]);console.log('PASS');await b.close();
