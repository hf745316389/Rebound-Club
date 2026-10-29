// Loads the packed characters for node tests. Node has no image decoder, so the colour atlas is stripped before parsing;
// geometry, skin and clips are exactly the shipped files. Load once per test file; buildWorld copies the rigs it uses.
import {readFile} from 'node:fs/promises';
import {GLTFLoader} from '../../dist/vendor/GLTFLoader.js';
import {loadCharacterAssets} from '../../dist/actor.mjs';

const files=new Map();
function withoutImages(buf){
  const len=buf.readUInt32LE(12),json=JSON.parse(buf.toString('utf8',20,20+len));
  delete json.images;delete json.textures;delete json.samplers;
  for(const m of json.materials??[])delete m.pbrMetallicRoughness?.baseColorTexture;
  const text=Buffer.from(JSON.stringify(json)),pad=Buffer.alloc((4-text.length%4)%4,0x20),rest=buf.subarray(20+len);
  const head=Buffer.alloc(20);head.write('glTF',0,'ascii');head.writeUInt32LE(2,4);head.writeUInt32LE(20+text.length+pad.length+rest.length,8);
  head.writeUInt32LE(text.length+pad.length,12);head.write('JSON',16,'ascii');
  const out=Buffer.concat([head,text,pad,rest]);return out.buffer.slice(out.byteOffset,out.byteOffset+out.length);
}
async function parse(file){
  if(!files.has(file))files.set(file,withoutImages(await readFile(new URL('../../dist/'+file,import.meta.url))));
  return new Promise((resolve,reject)=>new GLTFLoader().parse(files.get(file).slice(0),'',resolve,reject));
}
// roles: characters.mjs roles to load (the club's two by default).
export const loadCharacters=roles=>loadCharacterAssets(parse,roles);
