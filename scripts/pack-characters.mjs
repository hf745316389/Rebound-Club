// Packs the playable characters (the club's two and the duel-only figures) into dist/models/ from their source GLBs, keeping only what the game uses:
// the clips listed in dist/characters.mjs and the skinned body meshes (weapons, hats and capes hanging off bones are
// dropped). Unreferenced accessors and buffer views go too, and the binary chunk is rebuilt compactly. No dependencies.
//
// Source (placeholder art): KayKit Character Pack: Adventurers 1.0, CC0, by Kay Lousberg.
//   https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 at 672074b73ba276876a19e8816ecdc5241817ab47
//   Copy addons/kaykit_character_pack_adventures/Characters/gltf/{Rogue,Barbarian,Rogue_Hooded,Knight,Mage}.glb and LICENSE.txt from that tree
//   into vendor-download/kaykit/ (git-ignored), then run:  node scripts/pack-characters.mjs [sourceDir]
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ALL_CHARACTERS} from '../dist/characters.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const srcDir=path.resolve(process.argv[2]??path.join(root,'vendor-download','kaykit')),outDir=path.join(root,'dist');

function readGlb(buf){
  if(buf.toString('ascii',0,4)!=='glTF'||buf.readUInt32LE(4)!==2)throw Error('not a glTF 2.0 binary');
  const jsonLen=buf.readUInt32LE(12);if(buf.toString('ascii',16,20)!=='JSON')throw Error('first chunk must be JSON');
  const json=JSON.parse(buf.toString('utf8',20,20+jsonLen)),at=20+jsonLen;
  const bin=at<buf.length?buf.subarray(at+8,at+8+buf.readUInt32LE(at)):Buffer.alloc(0);
  return {json,bin};
}
function writeGlb(json,bin){
  const pad=(b,fill)=>Buffer.concat([b,Buffer.alloc((4-b.length%4)%4,fill)]);
  const j=pad(Buffer.from(JSON.stringify(json)),0x20),b=pad(bin,0);
  const head=Buffer.alloc(12);head.write('glTF',0,'ascii');head.writeUInt32LE(2,4);head.writeUInt32LE(12+8+j.length+8+b.length,8);
  const chunk=(data,type)=>{const h=Buffer.alloc(8);h.writeUInt32LE(data.length,0);h.write(type,4,'ascii');return Buffer.concat([h,data]);};
  return Buffer.concat([head,chunk(j,'JSON'),chunk(b,'BIN\0')]);
}

function pack(json,bin,clips){
  if(json.accessors.some(a=>a.sparse))throw Error('sparse accessors are not supported');
  const missing=clips.filter(c=>!json.animations?.some(a=>a.name===c));if(missing.length)throw Error('missing clips: '+missing);
  // Bodies are skinned; anything else carried by a node is a prop.
  for(const n of json.nodes)if(n.mesh!=null&&n.skin==null)delete n.mesh;
  json.animations=json.animations.filter(a=>clips.includes(a.name));
  const meshIndex=new Map();const meshes=[];
  for(const n of json.nodes)if(n.mesh!=null){if(!meshIndex.has(n.mesh)){meshIndex.set(n.mesh,meshes.length);meshes.push(json.meshes[n.mesh]);}n.mesh=meshIndex.get(n.mesh);}
  json.meshes=meshes;
  // Every accessor still in use, then every buffer view, each renumbered in first-use order.
  const accessorIndex=new Map(),accessors=[];
  const useAccessor=i=>{if(!accessorIndex.has(i)){accessorIndex.set(i,accessors.length);accessors.push(json.accessors[i]);}return accessorIndex.get(i);};
  for(const m of json.meshes)for(const p of m.primitives){
    for(const k of Object.keys(p.attributes))p.attributes[k]=useAccessor(p.attributes[k]);
    if(p.indices!=null)p.indices=useAccessor(p.indices);
    for(const t of p.targets??[])for(const k of Object.keys(t))t[k]=useAccessor(t[k]);
  }
  for(const s of json.skins??[])if(s.inverseBindMatrices!=null)s.inverseBindMatrices=useAccessor(s.inverseBindMatrices);
  for(const a of json.animations)for(const s of a.samplers){s.input=useAccessor(s.input);s.output=useAccessor(s.output);}
  json.accessors=accessors;
  const viewIndex=new Map(),views=[];
  const useView=i=>{if(!viewIndex.has(i)){viewIndex.set(i,views.length);views.push(json.bufferViews[i]);}return viewIndex.get(i);};
  for(const a of json.accessors)if(a.bufferView!=null)a.bufferView=useView(a.bufferView);
  for(const im of json.images??[])if(im.bufferView!=null)im.bufferView=useView(im.bufferView);
  // Rebuild the binary chunk: each kept view copied in order, 4-byte aligned (enough for every component type used).
  const parts=[];let offset=0;
  for(const v of views){
    const bytes=bin.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength),gap=(4-offset%4)%4;
    if(gap){parts.push(Buffer.alloc(gap));offset+=gap;}
    parts.push(bytes);v.buffer=0;v.byteOffset=offset;offset+=v.byteLength;
  }
  json.bufferViews=views;json.buffers=[{byteLength:offset}];
  return {json,bin:Buffer.concat(parts)};
}

await mkdir(path.join(outDir,'models'),{recursive:true});
const report=[];
const done=new Set();
for(const [role,c] of Object.entries(ALL_CHARACTERS)){
  // A role dressed differently from the same file (the gold keeper) needs no file of its own.
  if(done.has(c.file))continue;done.add(c.file);
  const srcFile=path.join(srcDir,c.source),before=await readFile(srcFile);
  const {json,bin}=readGlb(before),packed=pack(json,bin,[...new Set(Object.values(c.clips))]);
  const out=writeGlb(packed.json,packed.bin);await writeFile(path.join(outDir,c.file),out);
  report.push({role,source:c.source,file:c.file,beforeKB:Math.round(before.length/1024),afterKB:Math.round(out.length/1024),
    clips:packed.json.animations.length,meshes:packed.json.meshes.length,accessors:packed.json.accessors.length});
}
await copyFile(path.join(srcDir,'LICENSE.txt'),path.join(outDir,'models','KAYKIT-LICENSE.txt'));
console.log(JSON.stringify(report,null,1));
