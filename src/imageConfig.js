// ============================================
// CHARACTER PORTRAITS
// ============================================
// Location: src/assets/characters/
// Recommended size: 150x150px PNG (square)
// ============================================

// Import character images (uncomment as you add them)
import gojoImg from './assets/characters/gojo.png'
// import yujiImg from './assets/characters/yuji.png'
// import megumiImg from './assets/characters/megumi.png'
// import sukunaImg from './assets/characters/sukuna.png'
// import mahitoImg from './assets/characters/mahito.png'
// import jogoImg from './assets/characters/jogo.png'
// import nobaraImg from './assets/characters/nobara.png'
// import todoImg from './assets/characters/todo.png'
// import nanamiImg from './assets/characters/nanami.png'

export const characterImages = {
  // Player Characters
  'Gojo': gojoImg,           // The strongest sorcerer
  'Yuji': null,              // Sukuna's vessel
  'Megumi': null,            // Ten Shadows user
  'Nobara': null,            // Straw doll technique
  'Todo': null,              // Boogie Woogie
  'Nanami': null,            // Ratio technique
  
  // Enemy Characters  
  'Sukuna': null,            // King of Curses
  'Mahito': null,            // Idle Transfiguration
  'Jogo': null,              // Disaster Flame
}


// ============================================
// ABILITY ICONS
// ============================================
// Location: src/assets/abilities/
// Recommended size: 120x120px PNG (square)
// ============================================

// Import ability images (uncomment as you add them)
// 
// GOJO ABILITIES:
// import gojo1Img from './assets/abilities/gojo-1.png'
// import gojo2Img from './assets/abilities/gojo-2.png'
// import gojo3Img from './assets/abilities/gojo-3.png'
// import gojoUltImg from './assets/abilities/gojo-ult.png'
//
// YUJI ABILITIES:
// import yuji1Img from './assets/abilities/yuji-1.png'
// import yuji2Img from './assets/abilities/yuji-2.png'
// import yuji3Img from './assets/abilities/yuji-3.png'
// import yujiUltImg from './assets/abilities/yuji-ult.png'
//
// ... continue for other characters

export const abilityImages = {
  // ========== GOJO ==========
  'gojo-1': null,            // Infinity - Blocks all damage next enemy turn
  'gojo-2': null,            // Red - Reversal - Deals 35 damage to one enemy
  'gojo-3': null,            // Blue - Lapse - Deals 25 damage and stuns 1 turn
  'gojo-ult': null,          // Hollow Purple - Deals 60 damage to ALL enemies
  
  // ========== YUJI ==========
  'yuji-1': null,            // Divergent Fist - Deals 30 damage with delayed impact
  'yuji-2': null,            // Manji Kick - Deals 20 damage, ignores defense buffs
  'yuji-3': null,            // Rage Mode - Boosts own attack by 15 for 2 turns
  'yuji-ult': null,          // Black Flash - Deals 70 critical damage to one enemy
  
  // ========== MEGUMI ==========
  'megumi-1': null,          // Divine Dogs - Deals 25 damage to one enemy
  'megumi-2': null,          // Nue - Deals 20 damage and stuns for 1 turn
  'megumi-3': null,          // Toad - Heals all allies for 20 HP
  'megumi-ult': null,        // Chimera Shadow Garden - 40 damage to all + heals team 25
  
  // ========== SUKUNA ==========
  'sukuna-1': null,          // Dismantle - Deals 40 damage to one enemy
  'sukuna-2': null,          // Cleave - Deals 25 damage to ALL enemies
  'sukuna-3': null,          // Reverse Cursed Technique - Heals self for 35 HP
  'sukuna-ult': null,        // Malevolent Shrine - Deals 80 damage to ALL enemies
  
  // ========== MAHITO ==========
  'mahito-1': null,          // Idle Transfiguration - Deals 28 damage to one enemy
  'mahito-2': null,          // Body Distortion - Heals self for 25 HP
  'mahito-3': null,          // Soul Multiplicity - Deals 15 damage to all enemies
  'mahito-ult': null,        // Instant Spirit Body - Invincible + 50 damage to one enemy
  
  // ========== JOGO ==========
  'jogo-1': null,            // Ember Insects - Deals 22 damage to one enemy
  'jogo-2': null,            // Flame Pillar - Deals 30 damage to one enemy
  'jogo-3': null,            // Coffin of the Iron Mountain - Stuns enemy for 2 turns
  'jogo-ult': null,          // Maximum Meteor - Deals 70 damage to ALL enemies
  
  // ========== NOBARA ==========
  'nobara-1': null,          // Straw Doll - Deals 25 damage to one enemy
  'nobara-2': null,          // Hairpin - Deals 35 damage, ignores invincibility
  'nobara-3': null,          // Resonance Link - Marks enemy for +15 damage from all sources
  'nobara-ult': null,        // Black Flash Hairpin - Deals 65 damage to one enemy
  
  // ========== TODO ==========
  'todo-1': null,            // Crushing Blow - Deals 30 damage to one enemy
  'todo-2': null,            // Boogie Woogie - Swaps positions, confuses enemy targeting
  'todo-3': null,            // Brother Bond - Boosts another ally's attack by 20 for 2 turns
  'todo-ult': null,          // Maximum Meteor Combo - Deals 80 damage to one enemy
  
  // ========== NANAMI ==========
  'nanami-1': null,          // Blunted Blade - Deals 28 damage to one enemy
  'nanami-2': null,          // Weak Point Strike - 40 damage, +20 if enemy below 50% HP
  'nanami-3': null,          // Overtime - Boosts own attack by 25 but takes 10 damage
  'nanami-ult': null,        // Collapse - Deals 90 damage to one enemy
}


// ============================================
// HELPER FUNCTIONS
// ============================================

export const getCharacterImage = (name) => {
  return characterImages[name] || null
}

export const getAbilityImage = (abilityId) => {
  return abilityImages[abilityId] || null
}