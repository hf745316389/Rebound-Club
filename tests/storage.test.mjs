import test from 'node:test';import assert from 'node:assert/strict';
import {loadProgress,saveProgress} from '../dist/storage.mjs';
function memory(raw=null){return {getItem(){return raw;},setItem(k,v){raw=v;}};}
test('保存后重新读取通过进度、分数与完美评价',()=>{const s=memory();assert.equal(saveProgress(s,{unlocked:2,scores:{0:1200},perfect:{0:true}}),true);const p=loadProgress(s);assert.equal(p.unlocked,2);assert.equal(p.scores[0],1200);assert.equal(p.perfect[0],true);});
test('拒绝访问和损坏数据都能回到可玩默认状态',()=>{for(const s of [null,memory('{broken'),{getItem(){throw Error('denied');}}]){assert.equal(loadProgress(s).unlocked,0);}assert.equal(saveProgress({setItem(){throw Error('full');}},{}),false);});
test('外来非法进度不会解锁越界关卡或污染最高分',()=>{const p=loadProgress(memory(JSON.stringify({unlocked:900,scores:{0:-20,1:'oops'},perfect:{0:'yes'}})));assert.equal(p.unlocked,5);assert.equal(p.scores[0],undefined);assert.equal(p.scores[1],undefined);assert.equal(p.perfect[0],undefined);});
test('旧版存档被忽略，新版本从第一关开始',()=>{const old=JSON.stringify({unlocked:4,scores:{0:900}});const s={getItem(k){return k==='rebound-club-v1'?old:null;},setItem(){}};const p=loadProgress(s);assert.equal(p.unlocked,0);assert.equal(p.scores[0],undefined);});
test('新版存档写入 v2 键',()=>{let key='';saveProgress({setItem(k){key=k;}},{unlocked:1});assert.equal(key,'rebound-club-v2');});
test('静音设置随存档保存，缺省与非法值都当作开着音效',()=>{const s=memory();saveProgress(s,{unlocked:1,muted:true});assert.equal(loadProgress(s).muted,true);assert.equal(loadProgress(memory()).muted,false);assert.equal(loadProgress(memory(JSON.stringify({muted:'yes'}))).muted,false);});
test('人物选择随存档保存；旧存档、缺失或不认识的人物都回到游侠',()=>{const s=memory();saveProgress(s,{unlocked:1,player:'knight'});assert.equal(loadProgress(s).player,'knight');
  for(const raw of [JSON.stringify({unlocked:2}),JSON.stringify({player:'dragon'}),JSON.stringify({player:7}),null])assert.equal(loadProgress(memory(raw)).player,'rogue');
  assert.equal(loadProgress(memory(JSON.stringify({unlocked:2,player:'mage'}))).unlocked,2,'加了人物不影响进度');});
