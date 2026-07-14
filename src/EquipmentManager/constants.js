// EquipmentManager/constants.js
// Solo Leveling themed equipment system — lore-accurate items, set bonuses, drop tables.

// ---------------------------------------------------------------------------
// Equipment slots
// ---------------------------------------------------------------------------
const EQUIPMENT_SLOTS = Object.freeze({
  weapon:     { label: 'Weapon',     icon: '⚔️' },
  offHand:    { label: 'Off-Hand',   icon: '🛡️' },
  helmet:     { label: 'Helmet',     icon: '⛑️' },
  chestplate: { label: 'Chestplate', icon: '🧥' },
  gloves:     { label: 'Gloves',     icon: '🧤' },
  boots:      { label: 'Boots',      icon: '👢' },
  earring:    { label: 'Earring',    icon: '💎' },
  necklace:   { label: 'Necklace',   icon: '📿' },
  ring1:      { label: 'Ring (L)',   icon: '💍' },
  ring2:      { label: 'Ring (R)',   icon: '💍' },
});

// ---------------------------------------------------------------------------
// Rarity colours — mirrors existing rank palette across the plugin suite
// ---------------------------------------------------------------------------
const RARITY_COLORS = Object.freeze({
  E:   '#9ca3af',
  D:   '#60a5fa',
  C:   '#34d399',
  B:   '#a78bfa',
  A:   '#f59e0b',
  S:   '#ef4444',
  SS:  '#ec4899',
  SSS: '#8b5cf6',
});

// ---------------------------------------------------------------------------
// Stat keys — core stats + combat-specific derived values
// ---------------------------------------------------------------------------
const STAT_KEYS = Object.freeze([
  'strength',
  'agility',
  'intelligence',
  'vitality',
  'perception',
  'attack',
  'defense',
  'critChance',
  'critDamage',
]);

// ---------------------------------------------------------------------------
// Empty stat block — use as a spread base for item definitions
// ---------------------------------------------------------------------------
const EMPTY_STATS = Object.freeze({
  strength:     0,
  agility:      0,
  intelligence: 0,
  vitality:     0,
  perception:   0,
  attack:       0,
  defense:      0,
  critChance:   0,
  critDamage:   0,
});

// ---------------------------------------------------------------------------
// Equipment database
// ---------------------------------------------------------------------------
// Each entry carries all STAT_KEYS (unused ones default to 0 via EMPTY_STATS spread).
// `slot` for rings is 'ring' — equips into ring1 or ring2, caller decides which.
// ---------------------------------------------------------------------------
const EQUIPMENT_DATABASE = {

  // ── Weapons ─────────────────────────────────────────────────────────────
  kasakas_venom_fang: {
    id: 'kasakas_venom_fang',
    name: "Kasaka's Venom Fang",
    slot: 'weapon',
    rarity: 'C',
    icon: '🗡️',
    description: 'A curved dagger dripping with Kasaka the Water Snake King\'s paralytic venom. Inflicts paralysis and bleed on hit.',
    levelReq: 15,
    stats: { ...EMPTY_STATS, attack: 25 },
    specialEffects: ['On hit: 12% chance to inflict Paralysis for 3s', 'On hit: 15% chance to inflict Bleed (2 stacks)'],
    setId: null,
    source: 'Dropped by Kasaka the Water Snake King — C-rank dungeon boss',
    lore: 'The fangs of a water serpent king, still slick with venom centuries after the beast\'s death. Hunters who wield it report a faint hissing in their sleep.',
  },

  knight_killer: {
    id: 'knight_killer',
    name: 'Knight Killer',
    slot: 'weapon',
    rarity: 'B',
    icon: '🗡️',
    description: 'A brutal short sword forged to pierce plate armour. Favoured by assassin-class hunters who target armoured dungeon knights.',
    levelReq: 40,
    stats: { ...EMPTY_STATS, attack: 75, strength: 10 },
    specialEffects: ['Ignores 10% of target\'s physical defense'],
    setId: null,
    source: 'Purchasable from the Hunter\'s Association black-market armoury at B-rank',
    lore: 'Designed in the early days of the Gate crisis when knight-class mobs began appearing in high-frequency B-rank dungeons. Smiths never gave it a fancier name — knights die when they see it, and that said everything.',
  },

  barukas_dagger: {
    id: 'barukas_dagger',
    name: "Baruka's Dagger",
    slot: 'weapon',
    rarity: 'A',
    icon: '🗡️',
    description: 'The ceremonial blade of Baruka, Chieftain of the Ice Elves. Etched with runes that amplify the speed of the wielder.',
    levelReq: 80,
    stats: { ...EMPTY_STATS, attack: 110, agility: 10 },
    specialEffects: ['Dash cooldown reduced by 20%', 'Attack speed +8%'],
    setId: null,
    source: 'Dropped by Baruka, Chieftain of the Ice Elves — A-rank dungeon final boss',
    lore: '"Speed is the only truth." — Baruka\'s final words before Sung Jin-Woo claimed his blade. The runes still pulse cold blue even in warm hands.',
  },

  demon_kings_daggers: {
    id: 'demon_kings_daggers',
    name: "Demon King's Daggers",
    slot: 'weapon',
    rarity: 'S',
    icon: '⚔️',
    description: 'Twin daggers forged from the essence of a Demon King. In the hands of the Shadow Monarch they move as one, extensions of a single will.',
    levelReq: 150,
    stats: { ...EMPTY_STATS, attack: 220, strength: 15, agility: 15 },
    specialEffects: ['Two As One: dual-wield attacks strike simultaneously, dealing 100% damage each', 'Shadow Affinity: +15% damage against demon-type enemies'],
    setId: null,
    source: 'Guaranteed drop — Demon Castle floor 100 final boss',
    lore: 'A matched pair. Legends say the Demon King forged them so his left hand would never outpace his right. Sung Jin-Woo gave them a new purpose: ending kings.',
  },

  demon_kings_longsword: {
    id: 'demon_kings_longsword',
    name: "Demon King's Longsword",
    slot: 'weapon',
    rarity: 'S',
    icon: '⚔️',
    description: 'A towering longsword left behind by a fallen Demon King. Channels the wielder\'s mana into cascading arcs of white flame.',
    levelReq: 180,
    stats: { ...EMPTY_STATS, attack: 350, strength: 20 },
    specialEffects: ['Storm of White Flames: charged heavy attack releases a mana-flame arc dealing 250% ATK', 'Intimidation Aura: enemies below level 120 suffer 15% ATK reduction'],
    setId: null,
    source: 'Rare drop — Demon Castle floor 100 final boss',
    lore: 'The white flames do not burn the wielder — they only recognise the strong. Those too weak to control the blade report it feels as heavy as a mountain.',
  },

  kamishs_wrath: {
    id: 'kamishs_wrath',
    name: "Kamish's Wrath",
    slot: 'weapon',
    rarity: 'SS',
    icon: '🐉',
    description: 'Twin dragon-bone daggers carved from the teeth of Kamish, the Catastrophe-class Dragon. The most powerful weapons ever documented on the Korean peninsula.',
    levelReq: 300,
    stats: { ...EMPTY_STATS, attack: 1500, strength: 30, agility: 30 },
    specialEffects: ['Dragon Fang: every 5th attack releases a Dragon Breath projectile dealing 400% ATK', 'Draconic Resonance: +25% critical strike damage', 'Unbreakable: cannot be destroyed or lost on death'],
    setId: null,
    source: 'Carved from the corpse of Kamish by Sung Jin-Woo using Shadow Extraction',
    lore: '"Even dead, the dragon bites." The teeth of Kamish were harder than any known alloy. When Sung Jin-Woo fashioned them into daggers the magic within simply… stayed.',
  },

  // ── Off-Hand ─────────────────────────────────────────────────────────────
  iron_shield: {
    id: 'iron_shield',
    name: 'Iron Shield',
    slot: 'offHand',
    rarity: 'D',
    icon: '🛡️',
    description: 'A basic reinforced iron shield issued to rookie tank-class hunters. Reliable but unremarkable.',
    levelReq: 10,
    stats: { ...EMPTY_STATS, defense: 10, vitality: 5 },
    specialEffects: ['Block: 8% chance to fully block incoming attack'],
    setId: null,
    source: 'Purchasable from any Hunter\'s Association supply depot',
    lore: 'Tens of thousands were manufactured in the first year after Gates opened. Most hunters replace them by level 20; a few sentimentalists keep them forever.',
  },

  knights_guard: {
    id: 'knights_guard',
    name: "Knight's Guard",
    slot: 'offHand',
    rarity: 'B',
    icon: '🛡️',
    description: 'A reinforced kite shield used by elite knight-class hunters. The central boss is engraved with the Korean Hunter\'s Association crest.',
    levelReq: 45,
    stats: { ...EMPTY_STATS, defense: 30, vitality: 10 },
    specialEffects: ['Block: 18% chance to fully block incoming attack', 'Shield Bash: activatable skill deals 80% ATK and stuns for 1.5s (12s CD)'],
    setId: null,
    source: 'Dropped by dungeon knight captains (B-rank and above)',
    lore: 'The Association\'s crest is not decorative — it encodes a micro-enchantment that strengthens the bearer\'s resolve when outnumbered.',
  },

  shadow_monarchs_aegis: {
    id: 'shadow_monarchs_aegis',
    name: "Shadow Monarch's Aegis",
    slot: 'offHand',
    rarity: 'SSS',
    icon: '🌑',
    description: 'A shield formed from condensed shadow energy, said to be the literal embodiment of the Shadow Monarch\'s will. Ordinary attacks phase through its surface as if striking smoke.',
    levelReq: 2000,
    stats: { ...EMPTY_STATS, defense: 10, vitality: 2 },
    specialEffects: ['Shadow Absorption: absorbs 5% of all incoming damage as mana', 'Domain: activatable 6s invulnerability bubble (120s CD)', 'Unbreakable: cannot be destroyed or lost on death'],
    setId: 'shadow_monarch_regalia',
    source: 'Materialises for the Shadow Monarch',
    lore: 'It does not exist in any physical sense. It is presence. The mere sight of it has caused S-rank monsters to hesitate.',
  },

  // ── Helmets ───────────────────────────────────────────────────────────────
  leather_helm: {
    id: 'leather_helm',
    name: 'Leather Helm',
    slot: 'helmet',
    rarity: 'D',
    icon: '⛑️',
    description: 'Standard-issue leather helmet with a stiffened brow guard. Provides minimal protection but better than nothing for low-rank hunters.',
    levelReq: 8,
    stats: { ...EMPTY_STATS, defense: 5, vitality: 5 },
    specialEffects: [],
    setId: null,
    source: 'Starting equipment; widely available at any Guild shop',
    lore: 'The stitching on the chin-strap is always the first to go. Hunters have complained about this since year one. The Association keeps ordering the same design.',
  },

  red_knights_helmet: {
    id: 'red_knights_helmet',
    name: "Red Knight's Helmet",
    slot: 'helmet',
    rarity: 'S',
    icon: '⛑️',
    description: 'The visored helmet of the Red Knight, one of the Shadow Monarch\'s elite generals. Reinforced with mana-crystallised shadow steel.',
    levelReq: 160,
    stats: { ...EMPTY_STATS, defense: 50, strength: 20, vitality: 20 },
    specialEffects: ['Commander\'s Presence: allied shadows within 15m gain +5% ATK', 'Mana Shell: absorbs the first lethal blow once per dungeon'],
    setId: null,
    source: 'Obtained by extracting the Red Knight as a shadow and releasing the armour component',
    lore: 'The red visor is not lacquered — the colour is an inherent property of the metal, forged in a realm where the sun sets but never rises.',
  },

  // ── Chestplates ───────────────────────────────────────────────────────────
  chainmail_vest: {
    id: 'chainmail_vest',
    name: 'Chainmail Vest',
    slot: 'chestplate',
    rarity: 'C',
    icon: '🧥',
    description: 'Interlocked steel rings over a padded gambeson. A solid mid-tier chest piece for hunters transitioning out of rookie gear.',
    levelReq: 20,
    stats: { ...EMPTY_STATS, defense: 15, vitality: 5 },
    specialEffects: ['Pierce Resistance: reduces piercing damage by 5%'],
    setId: null,
    source: 'Common dungeon drop (C-rank or higher) / Hunter Guild armoury',
    lore: 'The rings are sized precisely to deflect fangs and claws. Against bladed weapons, less so — a lesson every chainmail-wearer learns the hard way.',
  },

  high_knights_chestplate: {
    id: 'high_knights_chestplate',
    name: "High Knight's Chestplate",
    slot: 'chestplate',
    rarity: 'A',
    icon: '🧥',
    description: 'Full plate chestpiece worn by dungeon high knights. Enchanted to distribute impact force across the entire surface, reducing blunt trauma.',
    levelReq: 90,
    stats: { ...EMPTY_STATS, defense: 35, strength: 15, vitality: 10 },
    specialEffects: ['Impact Distribution: blunt damage reduced by 12%', 'Fortitude: max HP +5%'],
    setId: null,
    source: 'Dropped by High Knight commanders (A-rank dungeon mini-bosses)',
    lore: 'Found exclusively on the strongest humanoid elites in the Gate system. Researchers believe dungeon architects equipped these mobs with purpose-built armour to gatekeep floor progression.',
  },

  // ── Gloves ────────────────────────────────────────────────────────────────
  steel_gauntlets: {
    id: 'steel_gauntlets',
    name: 'Steel Gauntlets',
    slot: 'gloves',
    rarity: 'C',
    icon: '🧤',
    description: 'Heavy plate gauntlets that reinforce every punch. A staple for fighter-class hunters who prefer to let their fists do the talking.',
    levelReq: 18,
    stats: { ...EMPTY_STATS, defense: 15, strength: 5 },
    specialEffects: ['Unarmed Attack: melee attacks without a weapon deal +10% damage'],
    setId: null,
    source: 'Purchasable at C-rank Hunter Guild armoury / common C-rank dungeon drop',
    lore: 'The knuckle guards are the thickest part. After enough dungeons they develop a satisfying dent pattern that veteran hunters wear like a badge of honour.',
  },

  shadow_threads: {
    id: 'shadow_threads',
    name: 'Shadow Threads',
    slot: 'gloves',
    rarity: 'A',
    icon: '🧤',
    description: 'Fingerless gloves woven from shadow silk — impossibly thin yet harder than tempered steel. They seem to react to the wearer\'s intent, tightening before a critical strike.',
    levelReq: 85,
    stats: { ...EMPTY_STATS, defense: 10, agility: 20, critChance: 5 },
    specialEffects: ['Shadow Reflex: dodge chance +4% while below 50% HP', 'Predator\'s Grip: critical hit damage +10%'],
    setId: null,
    source: 'Crafted by the Shadow Monarch\'s army smiths; rarely surfaces in A-rank gate loot pools',
    lore: 'No one knows who first wove them or how. They appeared in Sung Jin-Woo\'s inventory the morning after a particularly brutal A-rank clear. He never asked questions.',
  },

  // ── Boots ─────────────────────────────────────────────────────────────────
  assassins_boots: {
    id: 'assassins_boots',
    name: "Assassin's Boots",
    slot: 'boots',
    rarity: 'B',
    icon: '👢',
    description: 'Soft-soled leather boots enchanted to muffle footsteps and enhance lateral movement speed. Standard issue for rogue-class hunter squads.',
    levelReq: 50,
    stats: { ...EMPTY_STATS, defense: 10, agility: 15 },
    specialEffects: ['Silent Step: footstep sound radius reduced by 80%', 'Sprint: movement speed +8%'],
    setId: null,
    source: 'Dropped by assassin-class dungeon mobs (B-rank+) / Hunter black market',
    lore: 'The enchantment is woven into the sole, not the upper. A good cobbler can resoled them indefinitely without losing the magic — if you know one with the right clearance.',
  },

  boots_of_haste: {
    id: 'boots_of_haste',
    name: 'Boots of Haste',
    slot: 'boots',
    rarity: 'A',
    icon: '👢',
    description: 'Wind-enchanted greaves recovered from an A-rank air elemental dungeon. The enchantment permanently accelerates the wearer\'s base movement threshold.',
    levelReq: 100,
    stats: { ...EMPTY_STATS, defense: 15, agility: 25 },
    specialEffects: ['Gale Step: first attack after a dash deals +20% damage', 'Windborne: fall damage reduced by 60%'],
    setId: null,
    source: 'Dropped by Tempest Elementals — A-rank wind-elemental dungeons',
    lore: 'Wind elemental dungeons are among the least explored Gate types — the constant gales make visibility near zero. Those who push through find the loot density is worth every bruise.',
  },

  // ── Earring ───────────────────────────────────────────────────────────────
  demon_monarchs_earring: {
    id: 'demon_monarchs_earring',
    name: "Demon Monarch's Earring",
    slot: 'earring',
    rarity: 'S',
    icon: '💎',
    description: 'A single obsidian drop earring pulsing with the residual authority of a Demon Monarch. Part of the Demon Monarch\'s Set.',
    levelReq: 150,
    stats: { ...EMPTY_STATS, strength: 20, vitality: 20 },
    specialEffects: ['Set Piece: contributes to the Demon Monarch\'s Set bonus', 'Monarch\'s Bearing: intimidation effects against you are reduced by 30%'],
    setId: 'demon_monarch_set',
    source: 'Guaranteed drop — Demon Castle floor 50 boss',
    lore: 'The obsidian was not mined — it crystallised spontaneously around a fragment of Demon Monarch essence during the initial assault on the Demon Castle. It chose its shape.',
  },

  // ── Necklaces ─────────────────────────────────────────────────────────────
  gatekeepers_necklace: {
    id: 'gatekeepers_necklace',
    name: "Gatekeeper's Necklace",
    slot: 'necklace',
    rarity: 'A',
    icon: '📿',
    description: 'A mana-stone pendant worn by the Gatekeeper that guards the first floor of the Demon Castle. Sharpens the wearer\'s spatial awareness and reaction time.',
    levelReq: 80,
    stats: { ...EMPTY_STATS, agility: 20, perception: 10 },
    specialEffects: ['Dimensional Sense: hidden traps and ambushes detected within 10m', 'Threshold Guardian: +10% DEF while standing in a doorway or entrance'],
    setId: null,
    source: 'Guaranteed drop — Demon Castle floor 1 boss (the Gatekeeper)',
    lore: 'The Gatekeeper has held its post for centuries. Every challenger who failed left a fragment of their fear in the stone. Those who succeed inherit everything the stone remembers.',
  },

  demon_monarchs_necklace: {
    id: 'demon_monarchs_necklace',
    name: "Demon Monarch's Necklace",
    slot: 'necklace',
    rarity: 'S',
    icon: '📿',
    description: 'A strand of void-black beads threaded on demon silk, radiating an aura of command. Part of the Demon Monarch\'s Set.',
    levelReq: 175,
    stats: { ...EMPTY_STATS, agility: 20, intelligence: 20 },
    specialEffects: ['Set Piece: contributes to the Demon Monarch\'s Set bonus', 'Mana Conduit: mana regeneration rate +15%'],
    setId: 'demon_monarch_set',
    source: 'Rare drop — Demon Castle floor 75 boss',
    lore: 'Each bead is a calcified mana core from a defeated lesser demon. The Monarch wore it as a record of conquests. Now it records yours.',
  },

  // ── Shadow Monarch's Regalia — full 10-slot set ───────────────────────────
  // Stats are intentionally minimal; real power comes from dynamic scaling
  // in SoloLevelingStats.getTotalEffectiveStats (external, reads setId).

  shadow_monarchs_blade: {
    id: 'shadow_monarchs_blade',
    name: "Shadow Monarch's Blade",
    slot: 'weapon',
    rarity: 'SSS',
    icon: '🌑',
    description: 'A sword of pure condensed shadow, forged from the will of the Shadow Monarch himself. It exists between light and darkness.',
    levelReq: 2000,
    stats: { ...EMPTY_STATS, attack: 10, strength: 2 },
    specialEffects: ['Shadow Affinity: all shadow-type skills deal +5% damage'],
    setId: 'shadow_monarch_regalia',
    source: 'Materialises for the Shadow Monarch',
    lore: 'It appeared in the Shadow Monarch\'s hand without being forged. The blade is not made of anything — it is the absence of everything.',
  },

  // offHand: shadow_monarchs_aegis is defined above (originally standalone;
  // updated to setId: 'shadow_monarch_regalia' and levelReq: 2000).

  crown_of_the_shadow_monarch: {
    id: 'crown_of_the_shadow_monarch',
    name: 'Crown of the Shadow Monarch',
    slot: 'helmet',
    rarity: 'SSS',
    icon: '👑',
    description: 'A circlet of living shadow that crowns the ruler of all shadows. It confers absolute authority over any shadow-type entity.',
    levelReq: 2000,
    stats: { ...EMPTY_STATS, defense: 5, intelligence: 2, perception: 2 },
    specialEffects: ['Sovereign\'s Authority: shadow soldiers gain +3% ATK'],
    setId: 'shadow_monarch_regalia',
    source: 'Materialises for the Shadow Monarch',
    lore: 'Every Shadow Monarch throughout history wore an identical crown. None of them forged it. It simply arrived.',
  },

  shadow_sovereigns_mantle: {
    id: 'shadow_sovereigns_mantle',
    name: "Shadow Sovereign's Mantle",
    slot: 'chestplate',
    rarity: 'SSS',
    icon: '🌑',
    description: 'A flowing mantle of shadow-silk that wraps the Shadow Monarch in absolute darkness. No physical force can pierce it while the Monarch\'s will holds.',
    levelReq: 2000,
    stats: { ...EMPTY_STATS, defense: 8, vitality: 2 },
    specialEffects: ['Void Weave: 3% chance to phase through any incoming hit'],
    setId: 'shadow_monarch_regalia',
    source: 'Materialises for the Shadow Monarch',
    lore: 'It weighs nothing. It absorbs light. Enemies who look directly at the wearer report seeing only a silhouette even in bright daylight.',
  },

  shadow_gauntlets: {
    id: 'shadow_gauntlets',
    name: 'Shadow Gauntlets',
    slot: 'gloves',
    rarity: 'SSS',
    icon: '🌑',
    description: 'Gauntlets of solidified shadow that amplify every strike the Shadow Monarch delivers. The fingers flex without resistance — they feel like wearing nothing.',
    levelReq: 2000,
    stats: { ...EMPTY_STATS, defense: 3, strength: 2, agility: 1 },
    specialEffects: ['Shadow Strike: melee attacks leave a shadow imprint for 2s'],
    setId: 'shadow_monarch_regalia',
    source: 'Materialises for the Shadow Monarch',
    lore: 'Shadow soldiers can be summoned from the imprints left by these gauntlets. This was never documented anywhere — it simply happened.',
  },

  shadow_greaves: {
    id: 'shadow_greaves',
    name: 'Shadow Greaves',
    slot: 'boots',
    rarity: 'SSS',
    icon: '🌑',
    description: 'Greaves that let the Shadow Monarch walk through shadows as if through air. Distance means nothing to those who command the dark.',
    levelReq: 2000,
    stats: { ...EMPTY_STATS, defense: 3, agility: 3 },
    specialEffects: ['Shadow Step: movement through shadowed areas is silent and 10% faster'],
    setId: 'shadow_monarch_regalia',
    source: 'Materialises for the Shadow Monarch',
    lore: 'They leave no footprints. Not because of any enchantment — the darkness simply parts to let the Monarch pass.',
  },

  shadow_monarchs_earring: {
    id: 'shadow_monarchs_earring',
    name: "Shadow Monarch's Earring",
    slot: 'earring',
    rarity: 'SSS',
    icon: '🌑',
    description: 'A single drop of solidified shadow, worn as an earring. It resonates with the full set, amplifying the Monarch\'s dominion.',
    levelReq: 2000,
    stats: { ...EMPTY_STATS, perception: 2, intelligence: 1 },
    specialEffects: ['Set Piece: contributes to the Shadow Monarch\'s Regalia set bonus'],
    setId: 'shadow_monarch_regalia',
    source: 'Materialises for the Shadow Monarch',
    lore: 'Each piece of the Regalia holds a fragment of the Shadow Monarch\'s authority. The earring holds the fragment of awareness.',
  },

  shadow_monarchs_necklace: {
    id: 'shadow_monarchs_necklace',
    name: "Shadow Monarch's Necklace",
    slot: 'necklace',
    rarity: 'SSS',
    icon: '🌑',
    description: 'A strand of shadow-crystal beads that encircles the Shadow Monarch\'s throat. Each bead contains the memory of a fallen enemy.',
    levelReq: 2000,
    stats: { ...EMPTY_STATS, intelligence: 2, vitality: 1 },
    specialEffects: ['Set Piece: contributes to the Shadow Monarch\'s Regalia set bonus'],
    setId: 'shadow_monarch_regalia',
    source: 'Materialises for the Shadow Monarch',
    lore: 'The beads are unnumbered. Counting them produces different results each attempt. Most give up after twenty.',
  },

  shadow_monarchs_ring_left: {
    id: 'shadow_monarchs_ring_left',
    name: "Shadow Monarch's Ring (Void)",
    slot: 'ring',
    rarity: 'SSS',
    icon: '🌑',
    description: 'A ring of pure shadow worn on the left hand. It is the seal of authority over life — the hand that commands shadows to rise.',
    levelReq: 2000,
    stats: { ...EMPTY_STATS, strength: 2, vitality: 1 },
    specialEffects: ['Set Piece: contributes to the Shadow Monarch\'s Regalia set bonus', 'Arise: shadow extraction cost reduced by 2%'],
    setId: 'shadow_monarch_regalia',
    source: 'Materialises for the Shadow Monarch',
    lore: 'The word "Arise" is engraved on the inner band. It has always been there. It will always be there.',
  },

  shadow_monarchs_ring_right: {
    id: 'shadow_monarchs_ring_right',
    name: "Shadow Monarch's Ring (Domain)",
    slot: 'ring',
    rarity: 'SSS',
    icon: '🌑',
    description: 'A ring of pure shadow worn on the right hand. It is the seal of dominion over space — the hand that extends the Monarch\'s domain.',
    levelReq: 2000,
    stats: { ...EMPTY_STATS, perception: 2, agility: 1 },
    specialEffects: ['Set Piece: contributes to the Shadow Monarch\'s Regalia set bonus', 'Domain Pulse: shadow soldier detection range +5%'],
    setId: 'shadow_monarch_regalia',
    source: 'Materialises for the Shadow Monarch',
    lore: 'Twins to the Void ring. The two together form a circuit of authority that flows through the Monarch\'s entire body.',
  },

  // ── Rings ─────────────────────────────────────────────────────────────────
  high_magicians_ring: {
    id: 'high_magicians_ring',
    name: "High Magician's Ring",
    slot: 'ring',
    rarity: 'B',
    icon: '💍',
    description: 'A platinum band set with a mana amplification crystal. Standard accessory among high-ranking mage-class hunters.',
    levelReq: 55,
    stats: { ...EMPTY_STATS, intelligence: 15, perception: 10 },
    specialEffects: ['Spell Efficiency: mana cost of active skills reduced by 8%', 'Crystal Focus: skill cast time reduced by 5%'],
    setId: null,
    source: 'Dropped by high-level magic-type dungeon bosses (B-rank+)',
    lore: 'The crystal is grown, not cut. Mage artificers seed a mana-rich solution and let the lattice form over six months. The result is always unique — no two rings amplify the same way.',
  },

  demon_monarchs_ring: {
    id: 'demon_monarchs_ring',
    name: "Demon Monarch's Ring",
    slot: 'ring',
    rarity: 'S',
    icon: '💍',
    description: 'A signet ring bearing the seal of the Demon Monarch. Its presence on one\'s finger marks them as a successor to infernal dominion. Part of the Demon Monarch\'s Set.',
    levelReq: 200,
    stats: { ...EMPTY_STATS, perception: 20, intelligence: 20 },
    specialEffects: ['Set Piece: contributes to the Demon Monarch\'s Set bonus', 'Infernal Sight: see through all illusions and invisibility within 25m', 'Monarch\'s Seal: skills that command or summon cost 10% less mana'],
    setId: 'demon_monarch_set',
    source: 'Rare drop — Demon Castle floor 100 final boss',
    lore: 'The seal on the face has never been successfully copied. Artisans who attempted it reported the etching tools melting. The ring refuses to be replicated.',
  },
};

// ---------------------------------------------------------------------------
// Equipment sets
// ---------------------------------------------------------------------------
const EQUIPMENT_SETS = Object.freeze({
  demon_monarch_set: {
    name: "Demon Monarch's Set",
    pieces: ['demon_monarchs_earring', 'demon_monarchs_necklace', 'demon_monarchs_ring'],
    bonuses: {
      2: Object.freeze({ strength: 5, agility: 5, intelligence: 5, vitality: 5, perception: 5 }),
      3: Object.freeze({ strength: 10, agility: 10, intelligence: 10, vitality: 10, perception: 10 }),
    },
  },

  shadow_monarch_regalia: {
    name: "Shadow Monarch's Regalia",
    pieces: [
      'shadow_monarchs_blade',
      'shadow_monarchs_aegis',
      'crown_of_the_shadow_monarch',
      'shadow_sovereigns_mantle',
      'shadow_gauntlets',
      'shadow_greaves',
      'shadow_monarchs_earring',
      'shadow_monarchs_necklace',
      'shadow_monarchs_ring_left',
      'shadow_monarchs_ring_right',
    ],
    // Bonuses are intentionally minimal — real stat scaling is handled
    // externally by SoloLevelingStats.getTotalEffectiveStats which reads
    // the equipped setId count and applies dynamic rank-based scaling.
    bonuses: {
      3:  Object.freeze({ strength: 1, agility: 1, intelligence: 1, vitality: 1, perception: 1 }),
      6:  Object.freeze({ strength: 2, agility: 2, intelligence: 2, vitality: 2, perception: 2 }),
      10: Object.freeze({ strength: 3, agility: 3, intelligence: 3, vitality: 3, perception: 3 }),
    },
  },
});

// ---------------------------------------------------------------------------
// Drop tables
// ---------------------------------------------------------------------------
// Drop chance per boss kill, by boss rank.
//
// REBALANCE (2026-07-14). The old curve ran 0.55 (E) down to 0.05 (SSS) —
// i.e. the HARDER the content, the less it paid out. It also stopped at SSS,
// while Dungeons actually spawns SSS+ / NH / Monarch / Monarch+ /
// Shadow Monarch; those fell through to the `?? 0.05` + `|| ['E']` defaults
// and, because the catalogue has no E-rarity items, dropped NOTHING AT ALL.
// The curve is now flat-to-gently-rising (25% -> 35%) so higher ranks are
// never worse; VALUE now comes from the rarity pool, not from frequency.
const DROP_CHANCE_BY_RANK = Object.freeze({
  E:                0.25,
  D:                0.26,
  C:                0.27,
  B:                0.28,
  A:                0.29,
  S:                0.30,
  SS:               0.31,
  SSS:              0.32,
  'SSS+':           0.33,
  NH:               0.34,
  Monarch:          0.35,
  'Monarch+':       0.35,
  'Shadow Monarch': 0.35,
});

// Rarity pool per boss rank, ordered [lowest ... highest].
//
// NOTE: 'E' appears in NO pool — the equipment catalogue contains zero
// E-rarity items, so any roll that selected 'E' found nothing and silently
// returned no drop. That made E-rank bosses drop 0% (despite an advertised
// 55%) and burned ~70-78% of D/C bosses' successful rolls. Lowest real
// rarity is 'D'.
const RARITY_POOL_BY_RANK = Object.freeze({
  E:                Object.freeze(['D', 'C']),
  D:                Object.freeze(['D', 'C']),
  C:                Object.freeze(['D', 'C', 'B']),
  B:                Object.freeze(['C', 'B', 'A']),
  A:                Object.freeze(['B', 'A', 'S']),
  S:                Object.freeze(['A', 'S', 'SS']),
  SS:               Object.freeze(['S', 'SS', 'SSS']),
  SSS:              Object.freeze(['S', 'SS', 'SSS']),
  'SSS+':           Object.freeze(['S', 'SS', 'SSS']),
  NH:               Object.freeze(['SS', 'SSS']),
  Monarch:          Object.freeze(['SS', 'SSS']),
  'Monarch+':       Object.freeze(['SS', 'SSS']),
  'Shadow Monarch': Object.freeze(['SS', 'SSS']),
});

// Rarity ladder, lowest -> highest. Used to degrade gracefully when a chosen
// rarity has no items in the catalogue (see _resolveEligibleForRarity).
// 'E' is intentionally absent: no E-rarity equipment exists.
const RARITY_ORDER = Object.freeze(['D', 'C', 'B', 'A', 'S', 'SS', 'SSS']);

// Default weights for [lowest, middle, highest] rarity within a pool.
const RARITY_WEIGHTS = Object.freeze([0.70, 0.20, 0.10]);

// Per-rank weight overrides (positional, same shape as RARITY_WEIGHTS).
// The flat default is bottom-heavy (70% lowest tier), which is right for early
// ranks but meant even a Shadow Monarch kill would yield its top rarity only
// 10% of the time. High ranks progressively skew toward the top of their pool,
// so endgame content actually pays out endgame loot.
const RARITY_WEIGHTS_BY_RANK = Object.freeze({
  A:                Object.freeze([0.55, 0.30, 0.15]),
  S:                Object.freeze([0.55, 0.30, 0.15]),
  SS:               Object.freeze([0.45, 0.33, 0.22]),
  SSS:              Object.freeze([0.45, 0.33, 0.22]),
  'SSS+':           Object.freeze([0.35, 0.35, 0.30]),
  NH:               Object.freeze([0.40, 0.60]),
  Monarch:          Object.freeze([0.32, 0.68]),
  'Monarch+':       Object.freeze([0.25, 0.75]),
  'Shadow Monarch': Object.freeze([0.18, 0.82]),
});

const DROP_TABLES = Object.freeze({
  DROP_CHANCE_BY_RANK,
  RARITY_POOL_BY_RANK,
  RARITY_WEIGHTS,
  RARITY_WEIGHTS_BY_RANK,
});

// ---------------------------------------------------------------------------
// Guaranteed drops — specific items guaranteed on DC boss floors
// ---------------------------------------------------------------------------
const GUARANTEED_DROPS = Object.freeze({
  1:   Object.freeze(['gatekeepers_necklace']),
  50:  Object.freeze(['demon_monarchs_earring']),
  75:  Object.freeze(['demon_monarchs_necklace']),
  100: Object.freeze(['demon_monarchs_ring', 'demon_kings_daggers']),
});

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Returns the equipment definition for a given ID, or null if not found.
 * @param {string} id
 * @returns {object|null}
 */
function getEquipmentById(id) {
  return EQUIPMENT_DATABASE[id] || null;
}

/**
 * Returns all equipment definitions that can be equipped in the given slot.
 * Rings (slot 'ring') match both 'ring1' and 'ring2'.
 * @param {string} slot  — one of the EQUIPMENT_SLOTS keys, or 'ring'
 * @returns {object[]}
 */
function getEquipmentForSlot(slot) {
  const isRingSlot = slot === 'ring1' || slot === 'ring2' || slot === 'ring';
  return Object.values(EQUIPMENT_DATABASE).filter(item => {
    if (isRingSlot) return item.slot === 'ring';
    return item.slot === slot;
  });
}

/**
 * Returns the hex colour string for a given rarity letter.
 * Falls back to the E-rank grey if the rarity is unrecognised.
 * @param {string} rarity
 * @returns {string}
 */
function getRarityColor(rarity) {
  return RARITY_COLORS[rarity] || RARITY_COLORS.E;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  EQUIPMENT_SLOTS,
  RARITY_COLORS,
  STAT_KEYS,
  EMPTY_STATS,
  EQUIPMENT_DATABASE,
  EQUIPMENT_SETS,
  DROP_TABLES,
  DROP_CHANCE_BY_RANK,
  RARITY_POOL_BY_RANK,
  RARITY_WEIGHTS,
  RARITY_WEIGHTS_BY_RANK,
  RARITY_ORDER,
  GUARANTEED_DROPS,
  getEquipmentById,
  getEquipmentForSlot,
  getRarityColor,
};
