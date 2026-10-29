// The two players, as data. This file is the only place that knows which model and which clips play a part: to swap in
// new characters (e.g. Mixamo rigs), change the source/clip names here, re-run scripts/pack-characters.mjs, and the
// scene code stays as it is. scripts/pack-characters.mjs keeps exactly the clips listed under `clips`.
// Placeholder art: KayKit Character Pack: Adventurers 1.0 by Kay Lousberg, CC0 (see models/KAYKIT-LICENSE.txt).
//
// clips: logical name -> clip name in the source file.
// recolor(h,s,l): run once over the shared colour atlas (h in degrees, s/l 0..1); returns a new [h,s,l] or nothing.
// bones: logical name -> bone name as three.js loads it (GLTFLoader drops '.', so 'hand.l' arrives as 'handl').
const KAYKIT_BONES={hips:'hips',spine:'spine',chest:'chest',head:'head',
  upperArmL:'upperarml',lowerArmL:'lowerarml',wristL:'wristl',handL:'handl',upperArmR:'upperarmr',lowerArmR:'lowerarmr',wristR:'wristr',handR:'handr',
  upperLegL:'upperlegl',lowerLegL:'lowerlegl',footL:'footl',upperLegR:'upperlegr',lowerLegR:'lowerlegr',footR:'footr'};
export const CHARACTERS={
  striker:{
    file:'models/striker.glb',source:'Rogue.glb',height:2.0,number:'01',bones:KAYKIT_BONES,
    glove:{color:'#ff5a1f',cuff:'#fff3e0',size:.19},rim:'#6a9cff',
    // Rogue greens become the club orange; the brown hair goes near-black so the back of the head never reads as bald.
    recolor:(h,s,l)=>h>110&&h<210&&s>.2?[18,.95,Math.min(.62,l*1.05+.08)]:h<40&&s>.25&&l<.5?[228,.35,l*.45]:null,
    clips:{idle:'Unarmed_Idle',strafeLeft:'Running_Strafe_Left',strafeRight:'Running_Strafe_Right',
      punchRight:'Unarmed_Melee_Attack_Punch_A',punchLeft:'Unarmed_Melee_Attack_Punch_B',cheer:'Cheer',hurt:'Hit_A'}
  },
  keeper:{
    // 1.85 m: this placeholder's upper body is long (hips at about a fifth of its height), and a full-length dive must
    // stay within the 1.6 m a beaten keeper may reach, so the fingertips just miss instead of covering the ball's path.
    // Re-measure (keeperReach) when the art changes: a figure with longer legs can be taller.
    file:'models/keeper.glb',source:'Barbarian.glb',height:1.85,number:'1',bones:KAYKIT_BONES,
    glove:{color:'#f4f6ff',cuff:'#1ec8b4',size:.19},rim:'#ffb37a',
    // Barbarian leather browns become the keeper's deep blue kit.
    recolor:(h,s,l)=>h>14&&h<48&&s>.18&&s<.62&&l<.42?[205,.75,l*1.15+.06]:null,
    // The punches are for the duel (duel.html), where this figure is the second player and strikes like the striker.
    clips:{idle:'Unarmed_Idle',strafeLeft:'Running_Strafe_Left',strafeRight:'Running_Strafe_Right',
      diveLeft:'Dodge_Left',diveRight:'Dodge_Right',cheer:'Cheer',hurt:'Hit_B',
      punchRight:'Unarmed_Melee_Attack_Punch_A',punchLeft:'Unarmed_Melee_Attack_Punch_B'}
  }
};
// More figures from the same KayKit pack and rig, loaded only when a part needs one: the duel's fighters (duel.html)
// and the club's level keepers (LEVEL_BOSSES). They may play either end, so they carry the striker's and the keeper's
// clips. As keepers they follow the keeper's height rule above: each height is re-measured (tests/bosses.test.mjs).
const EXTRA_CLIPS={idle:'Unarmed_Idle',strafeLeft:'Running_Strafe_Left',strafeRight:'Running_Strafe_Right',
  diveLeft:'Dodge_Left',diveRight:'Dodge_Right',cheer:'Cheer',hurt:'Hit_B',
  punchRight:'Unarmed_Melee_Attack_Punch_A',punchLeft:'Unarmed_Melee_Attack_Punch_B'};
export const EXTRA_CHARACTERS={
  // Shares the Rogue's atlas: its greens would sink into the turf, so they become teal.
  hooded:{file:'models/hooded.glb',source:'Rogue_Hooded.glb',height:1.85,number:'07',bones:KAYKIT_BONES,
    glove:{color:'#1ec8b4',cuff:'#fff3e0',size:.19},rim:'#7fe9ff',
    recolor:(h,s,l)=>h>110&&h<210&&s>.2?[186,.8,Math.min(.6,l*1.05+.05)]:null,clips:EXTRA_CLIPS},
  // Silver armour with red trim reads on the green court as it is (the helmet is a prop and is dropped).
  knight:{file:'models/knight.glb',source:'Knight.glb',height:1.85,number:'04',bones:KAYKIT_BONES,
    glove:{color:'#2f6bff',cuff:'#f4f6ff',size:.19},rim:'#ffd9a8',clips:EXTRA_CLIPS},
  // Purple robes as they are (the hat is a prop and is dropped).
  mage:{file:'models/mage.glb',source:'Mage.glb',height:1.85,number:'10',bones:KAYKIT_BONES,
    glove:{color:'#ff4f9a',cuff:'#fff3e0',size:.19},rim:'#c9a8ff',clips:EXTRA_CLIPS},
  // The last level's keeper: the club keeper in a gold kit. Same file, clips and height, so nothing more to download.
  ace:{...CHARACTERS.keeper,number:'99',glove:{color:'#1f2433',cuff:'#ffd23a',size:.19},rim:'#ffe08a',
    recolor:(h,s,l)=>h>14&&h<48&&s>.18&&s<.62&&l<.42?[44,.85,Math.min(.62,l*1.25+.12)]:null}
};
export const ALL_CHARACTERS={...CHARACTERS,...EXTRA_CHARACTERS};
// Which figure plays each duel fighter (duel-core FIGHTERS).
export const FIGHTER_LOOKS={allround:'striker',power:'keeper',speed:'hooded',wall:'knight',trick:'mage'};
// Each level's keeper, by level (core.mjs LEVELS): a figure, a name and a line on how it plays. Presentation only: how
// a keeper plays is the level's own keeper settings, unchanged, and each line says what those settings already do.
export const LEVEL_BOSSES=[
  {figure:'keeper',name:'大胡子',title:'新手门将',intro:'反应慢半拍，移动也慢，先把球打进去。'},
  {figure:'keeper',name:'大胡子',title:'守中路',intro:'习惯站在正中，按住方向打两边。'},
  {figure:'mage',name:'法师',title:'读心',intro:'会读你按住的方向，还会记你的出球习惯。'},
  {figure:'knight',name:'骑士',title:'封角',intro:'提前往你接球的一侧靠，封住近角。'},
  {figure:'hooded',name:'游侠',title:'快手',intro:'球更快，它也更快，还会摸清你的出球规律。'},
  {figure:'ace',name:'王牌',title:'守门王牌',intro:'最会读招，球门也更窄，变向、重炮、旋转都要用上。'}
];
