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
  E:           '#9ca3af',
  D:           '#60a5fa',
  C:           '#34d399',
  B:           '#a78bfa',
  A:           '#f59e0b',
  S:           '#ef4444',
  SS:          '#ec4899',
  SSS:         '#8b5cf6',
  // Endgame tiers — same hexes the rest of the suite uses for these ranks.
  'SSS+':      '#c084fc',
  NH:          '#14b8a6',
  Monarch:     '#fbbf24',
  'Monarch+':  '#f97316',
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

  // ── Kamish's Legacy — full 10-slot SS set ──────────────────────────────────
  // The droppable ceiling. SSS is grant-only (the Shadow Monarch's Regalia), so
  // SS is the top tier anyone can actually farm — it previously held a single
  // item (Kamish's Wrath), which made the entire endgame chase one weapon on
  // repeat. Forged from the corpse of Kamish, the Catastrophe-class dragon, so
  // it sits alongside Kamish's Wrath rather than replacing it.
  //
  // Flat stats by design: the Regalia's power is a PERCENTAGE multiplier applied
  // by SoloLevelingStats ((pieces/10) x (totalBase/5000), uncapped, Shadow
  // Monarch rank only), so no flat-stat set can outscale it. The Lv2000 reward
  // stays the terminal prize.
  kamishs_fang: {
    id: 'kamishs_fang',
    name: "Kamish's Fang",
    slot: 'weapon',
    rarity: 'SS',
    icon: '🐲',
    description: 'A greatsword hewn from the upper jawbone of Kamish. Where the daggers were carved for speed, the Fang was shaped for finality.',
    levelReq: 300,
    stats: { ...EMPTY_STATS, strength: 35, attack: 600, critDamage: 15 },
    specialEffects: ['Catastrophe: attacks against enemies above 50% HP deal +30% damage', 'Dragon Fear: on hit, 10% chance to reduce enemy defense by 25% for 8s'],
    setId: 'kamishs_legacy',
    source: 'Dropped by SS-rank and higher gate bosses',
    lore: 'Kamish killed 3,000 people before it fell. The hunters who carved it afterwards worked in silence — no one wanted to be the first to speak near the body.',
  },

  kamishs_scale_ward: {
    id: 'kamishs_scale_ward',
    name: "Kamish's Scale Ward",
    slot: 'offHand',
    rarity: 'SS',
    icon: '🛡️',
    description: 'A tower shield of overlapping dragon scales. Each scale is still warm.',
    levelReq: 300,
    stats: { ...EMPTY_STATS, vitality: 25, defense: 100 },
    specialEffects: ['Scaled Ward: blocks reduce incoming damage by an additional 20%', 'Ember Skin: attackers suffer 8% of the damage they deal as fire'],
    setId: 'kamishs_legacy',
    source: 'Dropped by SS-rank and higher gate bosses',
    lore: 'Fire does not mark it. Neither does mana. The scales simply refuse to acknowledge that anything happened to them.',
  },

  dragonbone_visor: {
    id: 'dragonbone_visor',
    name: 'Dragonbone Visor',
    slot: 'helmet',
    rarity: 'SS',
    icon: '👺',
    description: 'A visored helm shaped from the skull-plate of a Catastrophe-class dragon. The eye slits glow faintly amber.',
    levelReq: 290,
    stats: { ...EMPTY_STATS, perception: 25, defense: 75 },
    specialEffects: ['Dragon Sight: reveals enemy weak points; +12% critical strike chance', 'Unflinching: immune to fear and intimidation effects'],
    setId: 'kamishs_legacy',
    source: 'Dropped by SS-rank and higher gate bosses',
    lore: 'Wearers report a persistent warmth at the temples, as though something inside the bone is still deciding whether to wake.',
  },

  scaled_cuirass_of_the_catastrophe: {
    id: 'scaled_cuirass_of_the_catastrophe',
    name: 'Scaled Cuirass of the Catastrophe',
    slot: 'chestplate',
    rarity: 'SS',
    icon: '🐉',
    description: 'Breastplate cut from the dragon\'s flank, where the scales grew thickest. It has never been pierced.',
    levelReq: 310,
    stats: { ...EMPTY_STATS, vitality: 40, strength: 15, defense: 130 },
    specialEffects: ['Catastrophe Hide: reduces all incoming damage by 15%', 'Molten Core: regenerate 2% max HP per second while below 40% HP'],
    setId: 'kamishs_legacy',
    source: 'Dropped by SS-rank and higher gate bosses',
    lore: 'The Association tried to cut a sample for study. They ruined four diamond saws and gave up.',
  },

  dragonclaw_gauntlets: {
    id: 'dragonclaw_gauntlets',
    name: 'Dragonclaw Gauntlets',
    slot: 'gloves',
    rarity: 'SS',
    icon: '🦾',
    description: 'Gauntlets tipped with the dragon\'s own talons. They close harder than a human hand should be able to.',
    levelReq: 285,
    stats: { ...EMPTY_STATS, strength: 30, agility: 15, defense: 55 },
    specialEffects: ['Rending Grip: attacks apply a stacking bleed dealing 40% ATK over 5s', 'Talon Lock: grabbed enemies cannot dash or blink for 3s'],
    setId: 'kamishs_legacy',
    source: 'Dropped by SS-rank and higher gate bosses',
    lore: 'The claws still retract and extend on their own when the wearer is angry. No one has explained this.',
  },

  wyrmstride_greaves: {
    id: 'wyrmstride_greaves',
    name: 'Wyrmstride Greaves',
    slot: 'boots',
    rarity: 'SS',
    icon: '🥾',
    description: 'Greaves strung with wing-sinew. The wearer\'s steps land lighter than they should.',
    levelReq: 285,
    stats: { ...EMPTY_STATS, agility: 35, defense: 60 },
    specialEffects: ['Wyrmstride: +30% movement speed; falling deals no damage', 'Skyborne: may dash a second time in mid-air'],
    setId: 'kamishs_legacy',
    source: 'Dropped by SS-rank and higher gate bosses',
    lore: 'Kamish never truly landed during the battle. Something of that refusal stayed in the sinew.',
  },

  ember_of_kamish: {
    id: 'ember_of_kamish',
    name: 'Ember of Kamish',
    slot: 'earring',
    rarity: 'SS',
    icon: '🔥',
    description: 'A single coal from the dragon\'s throat, still burning after all these years.',
    levelReq: 295,
    stats: { ...EMPTY_STATS, intelligence: 35, perception: 20 },
    specialEffects: ['Dragon Breath: fire and mana-flame skills deal +25% damage', 'Everburning: mana regeneration increased by 30%'],
    setId: 'kamishs_legacy',
    source: 'Dropped by SS-rank and higher gate bosses',
    lore: 'It has not cooled. It will not cool. Whatever fire a Catastrophe carries, it is not the kind that goes out.',
  },

  heart_of_the_catastrophe: {
    id: 'heart_of_the_catastrophe',
    name: 'Heart of the Catastrophe',
    slot: 'necklace',
    rarity: 'SS',
    icon: '💠',
    description: 'The crystallised mana-core of Kamish, strung on dragonhide. It beats, very slowly.',
    levelReq: 305,
    stats: { ...EMPTY_STATS, vitality: 45, intelligence: 25 },
    specialEffects: ['Catastrophe Heart: +25% maximum HP', 'Second Breath: once per dungeon, survive a lethal blow at 1 HP'],
    setId: 'kamishs_legacy',
    source: 'Dropped by SS-rank and higher gate bosses',
    lore: 'It beats once every forty seconds. Hunters who wear it eventually find their own pulse slowing to match.',
  },

  ring_of_the_dragons_eye: {
    id: 'ring_of_the_dragons_eye',
    name: "Ring of the Dragon's Eye",
    slot: 'ring',
    rarity: 'SS',
    icon: '💍',
    description: 'Set with a sliver of Kamish\'s eye. It watches what the wearer does not.',
    levelReq: 300,
    stats: { ...EMPTY_STATS, perception: 30, agility: 15, critChance: 10 },
    specialEffects: ['Dragon\'s Eye: cannot be ambushed; attacks from behind deal no bonus damage', 'Predator: +15% critical strike damage against wounded enemies'],
    setId: 'kamishs_legacy',
    source: 'Dropped by SS-rank and higher gate bosses',
    lore: 'The sliver tracks movement in the room even when set down on a table. Several owners have covered it with a cloth at night.',
  },

  ring_of_the_dragons_maw: {
    id: 'ring_of_the_dragons_maw',
    name: "Ring of the Dragon's Maw",
    slot: 'ring',
    rarity: 'SS',
    icon: '💍',
    description: 'Forged from a molar the size of a fist. Blunt, heavy, and entirely without subtlety.',
    levelReq: 300,
    stats: { ...EMPTY_STATS, strength: 30, vitality: 15, critDamage: 20 },
    specialEffects: ['Devour: killing blows restore 5% maximum HP', 'Maw: heavy attacks cannot be blocked by enemies of lower rank'],
    setId: 'kamishs_legacy',
    source: 'Dropped by SS-rank and higher gate bosses',
    lore: 'A dragon does not bite to wound. It bites to end the conversation.',
  },

  // ── S-rank slot gap-fills ──────────────────────────────────────────────────
  // S previously covered only weapon/helmet/earring/necklace/ring, so four of
  // the ten slots had no S-tier option at all and the ladder skipped straight
  // from A to SS for them.
  white_flame_bulwark: {
    id: 'white_flame_bulwark',
    name: 'White Flame Bulwark',
    slot: 'offHand',
    rarity: 'S',
    icon: '🛡️',
    description: 'A kite shield that answers mana with fire. Blocking a blow lights it.',
    levelReq: 170,
    stats: { ...EMPTY_STATS, vitality: 15, defense: 70 },
    specialEffects: ['White Flame: successful blocks release a flame burst dealing 120% ATK', 'Bulwark: +20% block chance'],
    setId: null,
    source: 'Dropped by S-rank and higher gate bosses',
    lore: 'The flames are the colour of nothing in particular. Witnesses always describe them as white because there is no better word.',
  },

  blood_red_commanders_armor: {
    id: 'blood_red_commanders_armor',
    name: "Blood-Red Commander's Armor",
    slot: 'chestplate',
    rarity: 'S',
    icon: '🩸',
    description: 'The plate of a knight-commander who did not survive the gate he was sent to close.',
    levelReq: 185,
    stats: { ...EMPTY_STATS, vitality: 25, strength: 10, defense: 80 },
    specialEffects: ['Commander\'s Presence: summoned allies gain +15% attack', 'Last Stand: below 25% HP, defense is doubled'],
    setId: null,
    source: 'Dropped by S-rank and higher gate bosses',
    lore: 'It was already red before the blood. That is the part people forget when they retell it.',
  },

  gauntlets_of_the_iron_body: {
    id: 'gauntlets_of_the_iron_body',
    name: 'Gauntlets of the Iron Body',
    slot: 'gloves',
    rarity: 'S',
    icon: '🥊',
    description: 'Heavy plated gauntlets favoured by hunters who have stopped bothering with weapons.',
    levelReq: 160,
    stats: { ...EMPTY_STATS, strength: 25, defense: 45 },
    specialEffects: ['Iron Body: unarmed attacks deal 200% ATK', 'Crushing Blow: attacks ignore 20% of enemy defense'],
    setId: null,
    source: 'Dropped by S-rank and higher gate bosses',
    lore: 'The previous owner is said to have punched a C-rank gate shut. This is almost certainly untrue and absolutely worth repeating.',
  },

  greaves_of_the_swift_step: {
    id: 'greaves_of_the_swift_step',
    name: 'Greaves of the Swift Step',
    slot: 'boots',
    rarity: 'S',
    icon: '🥾',
    description: 'Light greaves woven with mana-thread. The wearer arrives slightly before they are expected.',
    levelReq: 165,
    stats: { ...EMPTY_STATS, agility: 30, defense: 40 },
    specialEffects: ['Swift Step: +25% movement speed', 'Afterimage: dashing leaves a decoy that absorbs one attack'],
    setId: null,
    source: 'Dropped by S-rank and higher gate bosses',
    lore: 'Slow enough to be seen. Fast enough that seeing does not help.',
  },

  // ── A-rank slot gap-fills ──────────────────────────────────────────────────
  knights_aegis: {
    id: 'knights_aegis',
    name: "Knight's Aegis",
    slot: 'offHand',
    rarity: 'A',
    icon: '🛡️',
    description: 'Standard-issue guild tower shield, reinforced well past standard issue.',
    levelReq: 90,
    stats: { ...EMPTY_STATS, vitality: 10, defense: 40 },
    specialEffects: ['Guard: +15% block chance', 'Steadfast: cannot be knocked back while blocking'],
    setId: null,
    source: 'Dropped by A-rank and higher gate bosses',
    lore: 'Issued to four hundred hunters. Returned by rather fewer.',
  },

  helm_of_the_steel_fang: {
    id: 'helm_of_the_steel_fang',
    name: 'Helm of the Steel Fang',
    slot: 'helmet',
    rarity: 'A',
    icon: '⛑️',
    description: 'A fanged half-helm taken from a beast-type gate. It still smells faintly of the place.',
    levelReq: 85,
    stats: { ...EMPTY_STATS, strength: 12, defense: 30 },
    specialEffects: ['Steel Fang: +10% critical strike chance', 'Thick Skull: reduces stun duration by half'],
    setId: null,
    source: 'Dropped by A-rank and higher gate bosses',
    lore: 'The fangs are not decorative. They were load-bearing, once, for something else.',
  },

  earring_of_clarity: {
    id: 'earring_of_clarity',
    name: 'Earring of Clarity',
    slot: 'earring',
    rarity: 'A',
    icon: '💧',
    description: 'A pale mana-stone stud. Thoughts arrive in order while wearing it.',
    levelReq: 80,
    stats: { ...EMPTY_STATS, intelligence: 20, perception: 10 },
    specialEffects: ['Clarity: skill cooldowns reduced by 10%', 'Focus: mana costs reduced by 10%'],
    setId: null,
    source: 'Dropped by A-rank and higher gate bosses',
    lore: 'Mages describe the effect as "the noise stopping". Non-mages report no effect whatsoever, which mages find very funny.',
  },

  band_of_the_lesser_monarch: {
    id: 'band_of_the_lesser_monarch',
    name: 'Band of the Lesser Monarch',
    slot: 'ring',
    rarity: 'A',
    icon: '💍',
    description: 'A plain iron band that once belonged to something that called itself a king.',
    levelReq: 95,
    stats: { ...EMPTY_STATS, strength: 12, intelligence: 12, perception: 8 },
    specialEffects: ['Lesser Dominion: +10% damage against enemies of lower rank', 'Pretender: +5% experience from all sources'],
    setId: null,
    source: 'Dropped by A-rank and higher gate bosses',
    lore: 'Every gate seems to produce at least one of these. There are, apparently, a great many lesser monarchs.',
  },

  // ── D-rank slot gap-fills ────────────────────────────────────────────────
  // D previously covered only offHand/helmet, leaving weapon/chestplate/
  // gloves/boots/earring/necklace/ring with no entry-level option at all.
  worn_iron_shortsword: {
    id: 'worn_iron_shortsword',
    name: 'Worn Iron Shortsword',
    slot: 'weapon',
    rarity: 'D',
    icon: '🗡️',
    description: 'A basic iron shortsword, nicked from years of use against low-rank mobs. Most rookie hunters carry one until something better drops.',
    levelReq: 10,
    stats: { ...EMPTY_STATS, attack: 20, strength: 3 },
    specialEffects: [],
    setId: null,
    source: 'Common drop from E and D-rank gate mobs',
    lore: 'The edge dulls faster than the Association would like to admit. Sharpening kits outsell the swords themselves three to one.',
  },

  padded_gambeson: {
    id: 'padded_gambeson',
    name: 'Padded Gambeson',
    slot: 'chestplate',
    rarity: 'D',
    icon: '🧥',
    description: 'A quilted underlayer worn beneath heavier armour, or alone by hunters who can\'t yet afford anything better.',
    levelReq: 9,
    stats: { ...EMPTY_STATS, defense: 6, vitality: 4 },
    specialEffects: [],
    setId: null,
    source: 'Starting equipment; widely available at any Guild shop',
    lore: 'It has stopped exactly one killing blow in Association records. The hunter who wore it still tells the story.',
  },

  rough_hide_gloves: {
    id: 'rough_hide_gloves',
    name: 'Rough Hide Gloves',
    slot: 'gloves',
    rarity: 'D',
    icon: '🧤',
    description: 'Untanned leather gloves, stiff until broken in. Better than bare knuckles against a D-rank mob\'s hide.',
    levelReq: 8,
    stats: { ...EMPTY_STATS, defense: 4, strength: 3 },
    specialEffects: ['Grip: 3% chance to prevent weapon disarm'],
    setId: null,
    source: 'Purchasable from any Hunter\'s Association supply depot',
    lore: 'They smell for weeks. No one has found a cure for this.',
  },

  scuffed_travel_boots: {
    id: 'scuffed_travel_boots',
    name: 'Scuffed Travel Boots',
    slot: 'boots',
    rarity: 'D',
    icon: '👢',
    description: 'Ordinary boots for ordinary distances. The scuffing is cosmetic, not enchanted — hunters just walk a lot.',
    levelReq: 8,
    stats: { ...EMPTY_STATS, defense: 3, agility: 4 },
    specialEffects: [],
    setId: null,
    source: 'Starting equipment; widely available at any Guild shop',
    lore: 'The soles are rated for two years of gate work. Most hunters don\'t last that long in D-rank gear, so the rating is rarely tested.',
  },

  chipped_mana_stud: {
    id: 'chipped_mana_stud',
    name: 'Chipped Mana Stud',
    slot: 'earring',
    rarity: 'D',
    icon: '💎',
    description: 'A small fractured mana-crystal set in a plain stud. The chip in the crystal leaks a faint blue glow.',
    levelReq: 12,
    stats: { ...EMPTY_STATS, intelligence: 4, perception: 3 },
    specialEffects: [],
    setId: null,
    source: 'Common dungeon drop (D-rank)',
    lore: 'Jewellers refuse to repair the chip — they say it changes the resonance for the worse. No one has proven them wrong.',
  },

  beginners_talisman: {
    id: 'beginners_talisman',
    name: "Beginner's Talisman",
    slot: 'necklace',
    rarity: 'D',
    icon: '📿',
    description: 'A wooden talisman blessed at the Association\'s intake ceremony. More tradition than enchantment, but it works, a little.',
    levelReq: 11,
    stats: { ...EMPTY_STATS, vitality: 4, perception: 3 },
    specialEffects: [],
    setId: null,
    source: 'Issued to all hunters upon Association registration',
    lore: 'Every hunter gets one on their first day. Most lose it by the third.',
  },

  apprentices_band: {
    id: 'apprentices_band',
    name: "Apprentice's Band",
    slot: 'ring',
    rarity: 'D',
    icon: '💍',
    description: 'A thin brass ring given to hunters who complete basic Awakening orientation. Carries a trace enchantment, nothing more.',
    levelReq: 14,
    stats: { ...EMPTY_STATS, strength: 3, intelligence: 3 },
    specialEffects: [],
    setId: null,
    source: 'Awarded on completion of Association orientation',
    lore: 'Most hunters keep it in a drawer once they outgrow it. A few wear it anyway, for luck they don\'t believe in.',
  },

  // ── C-rank slot gap-fills ────────────────────────────────────────────────
  hunters_buckler: {
    id: 'hunters_buckler',
    name: "Hunter's Buckler",
    slot: 'offHand',
    rarity: 'C',
    icon: '🛡️',
    description: 'A small round shield favoured by mobile hunters who need to block without sacrificing speed.',
    levelReq: 18,
    stats: { ...EMPTY_STATS, defense: 18, vitality: 6 },
    specialEffects: ['Deflect: 10% chance to fully block incoming attack'],
    setId: null,
    source: 'Common dungeon drop (C-rank) / Hunter Guild armoury',
    lore: 'Light enough to forget you\'re carrying it, until the moment you\'re glad you are.',
  },

  scouts_half_helm: {
    id: 'scouts_half_helm',
    name: "Scout's Half-Helm",
    slot: 'helmet',
    rarity: 'C',
    icon: '⛑️',
    description: 'An open-faced helm that trades protection for field of view. Popular with recon-class hunters.',
    levelReq: 16,
    stats: { ...EMPTY_STATS, defense: 10, perception: 7 },
    specialEffects: ['Wide Sight: peripheral detection range +5%'],
    setId: null,
    source: 'Common dungeon drop (C-rank) / Hunter Guild armoury',
    lore: 'Scouts swear it saves their necks. Quartermasters point out it barely covers them.',
  },

  wind_runners_boots: {
    id: 'wind_runners_boots',
    name: "Wind Runner's Boots",
    slot: 'boots',
    rarity: 'C',
    icon: '👢',
    description: 'Lightweight boots enchanted with a minor wind charm. A step up from standard issue for hunters who move first and think later.',
    levelReq: 20,
    stats: { ...EMPTY_STATS, agility: 9, defense: 5 },
    specialEffects: ['Light Step: movement speed +4%'],
    setId: null,
    source: 'Dropped by C-rank dungeon mobs / Hunter black market',
    lore: 'Not enchanted enough to outrun anything serious. Enchanted exactly enough to feel like you could.',
  },

  resonant_earstud: {
    id: 'resonant_earstud',
    name: 'Resonant Earstud',
    slot: 'earring',
    rarity: 'C',
    icon: '💎',
    description: 'A mana-stone stud that hums faintly in sync with the wearer\'s own mana output. Popular among aspiring mage-class hunters.',
    levelReq: 22,
    stats: { ...EMPTY_STATS, intelligence: 8, perception: 6 },
    specialEffects: ['Resonance: mana regeneration +5%'],
    setId: null,
    source: 'Common dungeon drop (C-rank) / Hunter Guild armoury',
    lore: 'The hum changes pitch with the wearer\'s mood. Nobody has explained why, and most stopped asking.',
  },

  guildmarked_pendant: {
    id: 'guildmarked_pendant',
    name: 'Guildmarked Pendant',
    slot: 'necklace',
    rarity: 'C',
    icon: '📿',
    description: 'A pendant stamped with a guild crest, issued to full guild members past their probationary period.',
    levelReq: 19,
    stats: { ...EMPTY_STATS, vitality: 7, strength: 6 },
    specialEffects: [],
    setId: null,
    source: 'Awarded upon full guild membership',
    lore: 'The stamp wears smooth after a few years of dungeon dust. Veterans wear the smoothness like a rank of its own.',
  },

  journeymans_signet: {
    id: 'journeymans_signet',
    name: "Journeyman's Signet",
    slot: 'ring',
    rarity: 'C',
    icon: '💍',
    description: 'A plain signet ring marking a hunter who has cleared their first ten C-rank gates. A small milestone, worn with quiet pride.',
    levelReq: 25,
    stats: { ...EMPTY_STATS, strength: 7, agility: 6 },
    specialEffects: [],
    setId: null,
    source: 'Awarded on completion of ten C-rank gate clears',
    lore: 'Ten gates doesn\'t sound like much until you\'ve done it. Most hunters remember every one.',
  },

  // ── B-rank slot gap-fills ────────────────────────────────────────────────
  veterans_barbute: {
    id: 'veterans_barbute',
    name: "Veteran's Barbute",
    slot: 'helmet',
    rarity: 'B',
    icon: '⛑️',
    description: 'A close-fitting steel helm worn by hunters who\'ve survived enough B-rank gates to stop counting.',
    levelReq: 45,
    stats: { ...EMPTY_STATS, defense: 25, strength: 12 },
    specialEffects: ['Battle-Tested: +5% defense while below 30% HP'],
    setId: null,
    source: 'Dropped by B-rank and higher gate bosses',
    lore: 'The dents aren\'t polished out. Every one is a story the wearer doesn\'t tell twice.',
  },

  reinforced_plate_vest: {
    id: 'reinforced_plate_vest',
    name: 'Reinforced Plate Vest',
    slot: 'chestplate',
    rarity: 'B',
    icon: '🧥',
    description: 'A double-layered steel vest built for hunters who expect to take hits and keep standing.',
    levelReq: 50,
    stats: { ...EMPTY_STATS, defense: 22, vitality: 13 },
    specialEffects: ['Reinforced Plating: blunt damage reduced by 6%'],
    setId: null,
    source: 'Dropped by B-rank and higher gate bosses',
    lore: 'Heavier than it looks. Hunters who complain about the weight are usually the ones who need it most.',
  },

  bruisers_knuckle_plates: {
    id: 'bruisers_knuckle_plates',
    name: "Bruiser's Knuckle Plates",
    slot: 'gloves',
    rarity: 'B',
    icon: '🧤',
    description: 'Segmented steel plates worn over the knuckles, built for hunters who close distance and stay there.',
    levelReq: 42,
    stats: { ...EMPTY_STATS, defense: 15, strength: 15 },
    specialEffects: ['Heavy Hands: unarmed and melee attacks deal +6% damage'],
    setId: null,
    source: 'Dropped by B-rank and higher gate bosses',
    lore: 'The plates are replaced more often than the gloves themselves. Steel doesn\'t survive B-rank knuckles for long.',
  },

  sharpened_senses_earring: {
    id: 'sharpened_senses_earring',
    name: 'Sharpened Senses Earring',
    slot: 'earring',
    rarity: 'B',
    icon: '💎',
    description: 'A slim earring enchanted to keep the wearer\'s reflexes a half-second ahead of danger.',
    levelReq: 55,
    stats: { ...EMPTY_STATS, perception: 14, agility: 10 },
    specialEffects: ['Sharpened Senses: ambush and surprise-attack chance against you reduced by 10%'],
    setId: null,
    source: 'Dropped by B-rank and higher gate bosses',
    lore: 'Wearers describe a persistent itch just before something goes wrong. They\'ve learned to trust it.',
  },

  oathbound_choker: {
    id: 'oathbound_choker',
    name: 'Oathbound Choker',
    slot: 'necklace',
    rarity: 'B',
    icon: '📿',
    description: 'A leather choker inscribed with a binding oath, traditionally worn by hunters who\'ve sworn to protect a party member.',
    levelReq: 60,
    stats: { ...EMPTY_STATS, vitality: 15, intelligence: 10 },
    specialEffects: ['Oathbound: +5% max HP while in a party'],
    setId: null,
    source: 'Dropped by B-rank and higher gate bosses',
    lore: 'The oath isn\'t magical. The choker just makes it harder to forget you made one.',
  },

  // ── Vestments of the Rulers — full 10-slot SSS+ set ─────────────────────
  // SSS+ is the first endgame rarity above the Shadow Monarch's grant-only
  // Regalia, and previously had zero items — any drop resolving to SSS+
  // found nothing. Themed on the Rulers, the faction of god-like beings
  // opposing the Monarchs; their chosen hunters are marked by gear like this.
  rulers_judgment: {
    id: 'rulers_judgment',
    name: "Ruler's Judgment",
    slot: 'weapon',
    rarity: 'SSS+',
    icon: '⚡',
    description: 'A spear of crystallised divine authority, granted to a hunter marked by a Ruler. It does not rust, chip, or dull.',
    levelReq: 400,
    stats: { ...EMPTY_STATS, attack: 1800, strength: 30, perception: 25 },
    specialEffects: ['Divine Judgment: attacks against Monarch-aligned enemies deal +20% damage', "Ruler's Blessing: cannot be disarmed"],
    setId: 'rulers_vestments',
    source: 'Dropped by SSS+-rank and higher gate bosses',
    lore: 'No smith made it. It was simply given, the way a verdict is given — without negotiation.',
  },

  aegis_of_the_absolute: {
    id: 'aegis_of_the_absolute',
    name: 'Aegis of the Absolute',
    slot: 'offHand',
    rarity: 'SSS+',
    icon: '🛡️',
    description: 'A shield of layered light that does not so much block attacks as decline to acknowledge them.',
    levelReq: 410,
    stats: { ...EMPTY_STATS, defense: 200, vitality: 50 },
    specialEffects: ['Absolute Ward: 4% chance to negate incoming damage entirely', 'Unbreakable: cannot be destroyed or lost on death'],
    setId: 'rulers_vestments',
    source: 'Dropped by SSS+-rank and higher gate bosses',
    lore: 'Held up against a Monarch\'s strike, it did not crack. It did not even move.',
  },

  halo_of_the_chosen: {
    id: 'halo_of_the_chosen',
    name: 'Halo of the Chosen',
    slot: 'helmet',
    rarity: 'SSS+',
    icon: '😇',
    description: 'A ring of pale light that hovers rather than sits, worn by hunters a Ruler has decided are worth watching.',
    levelReq: 405,
    stats: { ...EMPTY_STATS, defense: 150, perception: 30, intelligence: 20 },
    specialEffects: ["Chosen One: immune to fear, charm, and possession effects", 'Watcher\'s Eye: reveals hidden and stealthed enemies within 20m'],
    setId: 'rulers_vestments',
    source: 'Dropped by SSS+-rank and higher gate bosses',
    lore: 'It does not touch the head that wears it. It simply stays where it is put, the way attention stays where it is directed.',
  },

  vestment_of_divine_authority: {
    id: 'vestment_of_divine_authority',
    name: 'Vestment of Divine Authority',
    slot: 'chestplate',
    rarity: 'SSS+',
    icon: '👘',
    description: 'A robe of woven light layered over the body like armour that forgot to be heavy. It answers to the wearer\'s conviction, not their strength.',
    levelReq: 420,
    stats: { ...EMPTY_STATS, defense: 200, vitality: 55 },
    specialEffects: ['Divine Authority: damage taken reduced by 12% while above 50% HP', 'Radiant Form: allies within 10m resist fear effects'],
    setId: 'rulers_vestments',
    source: 'Dropped by SSS+-rank and higher gate bosses',
    lore: 'It weighs nothing until the wearer hesitates. Then, for a moment, it weighs everything.',
  },

  gauntlets_of_absolute_will: {
    id: 'gauntlets_of_absolute_will',
    name: 'Gauntlets of Absolute Will',
    slot: 'gloves',
    rarity: 'SSS+',
    icon: '🧤',
    description: 'Gauntlets of hardened light that channel a Ruler\'s conviction directly into every strike.',
    levelReq: 415,
    stats: { ...EMPTY_STATS, defense: 120, strength: 50 },
    specialEffects: ['Unyielding Grip: attacks cannot be parried or deflected', 'Absolute Will: critical strike chance +6%'],
    setId: 'rulers_vestments',
    source: 'Dropped by SSS+-rank and higher gate bosses',
    lore: 'They do not tire. Neither, it is said, does the will that shaped them.',
  },

  sandals_of_the_ruler: {
    id: 'sandals_of_the_ruler',
    name: 'Sandals of the Ruler',
    slot: 'boots',
    rarity: 'SSS+',
    icon: '👣',
    description: 'Simple woven sandals that carry the wearer above the ground more often than on it.',
    levelReq: 400,
    stats: { ...EMPTY_STATS, agility: 55, defense: 90 },
    specialEffects: ['Weightless Step: fall damage entirely negated', 'Ruler\'s Pace: movement speed +18%'],
    setId: 'rulers_vestments',
    source: 'Dropped by SSS+-rank and higher gate bosses',
    lore: 'The wearer\'s footprints appear a half-second after their feet leave the ground, as if the world is still deciding whether they were really there.',
  },

  earring_of_celestial_sight: {
    id: 'earring_of_celestial_sight',
    name: 'Earring of Celestial Sight',
    slot: 'earring',
    rarity: 'SSS+',
    icon: '✨',
    description: 'A drop of solidified starlight, granted to hunters whose perception has been sharpened beyond mortal limits.',
    levelReq: 425,
    stats: { ...EMPTY_STATS, perception: 30, intelligence: 25 },
    specialEffects: ['Celestial Sight: sees through all illusions, invisibility, and dimensional concealment'],
    setId: 'rulers_vestments',
    source: 'Dropped by SSS+-rank and higher gate bosses',
    lore: 'Wearers report seeing the shape of things a half-second before they happen. Most learn to stop mentioning it.',
  },

  pendant_of_the_covenant: {
    id: 'pendant_of_the_covenant',
    name: 'Pendant of the Covenant',
    slot: 'necklace',
    rarity: 'SSS+',
    icon: '📿',
    description: 'A pendant marking a binding covenant between hunter and Ruler. Neither side has ever been recorded breaking it.',
    levelReq: 430,
    stats: { ...EMPTY_STATS, intelligence: 30, vitality: 25 },
    specialEffects: ['Covenant: mana and HP regeneration +10%', 'Bound Word: cannot be silenced or mana-sealed'],
    setId: 'rulers_vestments',
    source: 'Dropped by SSS+-rank and higher gate bosses',
    lore: 'The terms of the covenant were never written down. Both sides simply remember them, perfectly, forever.',
  },

  ring_of_the_first_ruler: {
    id: 'ring_of_the_first_ruler',
    name: 'Ring of the First Ruler',
    slot: 'ring',
    rarity: 'SSS+',
    icon: '💍',
    description: 'A band of pale gold said to have been worn by the very first of the Rulers, before there was a name for what they were.',
    levelReq: 440,
    stats: { ...EMPTY_STATS, strength: 28, perception: 27 },
    specialEffects: ['First Authority: +8% damage against Monarch-aligned enemies'],
    setId: 'rulers_vestments',
    source: 'Dropped by SSS+-rank and higher gate bosses',
    lore: 'It has no inscription. Whoever made it assumed no one would need reminding what it was.',
  },

  ring_of_the_last_covenant: {
    id: 'ring_of_the_last_covenant',
    name: 'Ring of the Last Covenant',
    slot: 'ring',
    rarity: 'SSS+',
    icon: '💍',
    description: 'Twin to the Ring of the First Ruler, said to be the final piece a Ruler ever grants before disappearing from a hunter\'s life entirely.',
    levelReq: 450,
    stats: { ...EMPTY_STATS, agility: 28, intelligence: 27 },
    specialEffects: ['Last Word: once per dungeon, negate one instance of crowd control'],
    setId: 'rulers_vestments',
    source: 'Dropped by SSS+-rank and higher gate bosses',
    lore: 'Every hunter who receives it stops seeing their Ruler afterward. None of them describe this as a loss.',
  },

  // ── National Hunter's Panoply — full 10-slot NH set ─────────────────────
  // NH sits above SSS+ and below Monarch, previously empty. Themed on
  // National-Level Hunters — the handful of humans recognised as individually
  // capable of turning the tide of an S-rank+ crisis.
  blade_of_the_strongest: {
    id: 'blade_of_the_strongest',
    name: 'Blade of the Strongest',
    slot: 'weapon',
    rarity: 'NH',
    icon: '🗡️',
    description: 'A longsword carried by a National-Level Hunter through a dozen S-rank catastrophes. The edge has never once needed sharpening.',
    levelReq: 620,
    stats: { ...EMPTY_STATS, attack: 2600, strength: 45, agility: 35 },
    specialEffects: ['Strongest\'s Resolve: damage dealt increases by 1% for every 10% HP missing, up to +15%', 'National Threat: boss-type enemies take +10% damage'],
    setId: 'national_hunters_panoply',
    source: 'Dropped by NH-rank and higher gate bosses',
    lore: 'Every National-Level Hunter is asked, eventually, to name their blade. Most refuse. This one didn\'t need a name to be recognised on sight.',
  },

  bulwark_of_the_kaisho: {
    id: 'bulwark_of_the_kaisho',
    name: 'Bulwark of the Kaisho',
    slot: 'offHand',
    rarity: 'NH',
    icon: '🛡️',
    description: 'A tower shield carried by Japan\'s Kaisho-ranked hunter, built to hold a line no one else could.',
    levelReq: 610,
    stats: { ...EMPTY_STATS, defense: 300, vitality: 75 },
    specialEffects: ['Immovable Line: cannot be knocked back or displaced while blocking', 'Kaisho\'s Stand: block chance +15%'],
    setId: 'national_hunters_panoply',
    source: 'Dropped by NH-rank and higher gate bosses',
    lore: 'It has been struck by things that levelled city blocks. The dents are shallow. The line held.',
  },

  crown_of_national_authority: {
    id: 'crown_of_national_authority',
    name: 'Crown of National Authority',
    slot: 'helmet',
    rarity: 'NH',
    icon: '👑',
    description: 'A circlet marking formal recognition by a nation\'s Hunter Association as its strongest active asset.',
    levelReq: 630,
    stats: { ...EMPTY_STATS, defense: 220, perception: 45, intelligence: 35 },
    specialEffects: ['Command Presence: nearby allied hunters gain +8% defense', 'Recognised Authority: immune to rank-based intimidation effects'],
    setId: 'national_hunters_panoply',
    source: 'Dropped by NH-rank and higher gate bosses',
    lore: 'Ceremony grants the title. The crown, unofficially, grants everyone else\'s belief in it.',
  },

  plate_of_the_ten: {
    id: 'plate_of_the_ten',
    name: 'Plate of the Ten',
    slot: 'chestplate',
    rarity: 'NH',
    icon: '🧥',
    description: 'Armour forged for a hunter ranked among the world\'s top ten. Layered to withstand attacks meant to end wars.',
    levelReq: 650,
    stats: { ...EMPTY_STATS, defense: 300, vitality: 80 },
    specialEffects: ['Ranked Endurance: max HP +8%', 'Ten\'s Resolve: damage taken while below 20% HP reduced by 20%'],
    setId: 'national_hunters_panoply',
    source: 'Dropped by NH-rank and higher gate bosses',
    lore: 'Only ten are ever made at a time. When one hunter falls from the ranking, the plate simply stops responding to them.',
  },

  gauntlets_of_the_apex_predator: {
    id: 'gauntlets_of_the_apex_predator',
    name: 'Gauntlets of the Apex Predator',
    slot: 'gloves',
    rarity: 'NH',
    icon: '🦾',
    description: 'Gauntlets worn by a hunter whose combat record includes soloing threats the Association classified as unsurvivable.',
    levelReq: 640,
    stats: { ...EMPTY_STATS, defense: 180, strength: 80 },
    specialEffects: ['Apex Instinct: critical strike chance +10% against enemies above your rank', 'Predatory Grip: grabbed enemies take +15% damage'],
    setId: 'national_hunters_panoply',
    source: 'Dropped by NH-rank and higher gate bosses',
    lore: 'The Association reclassified the threat as survivable after the fact. The gauntlets were the reason.',
  },

  boots_of_the_frontline: {
    id: 'boots_of_the_frontline',
    name: 'Boots of the Frontline',
    slot: 'boots',
    rarity: 'NH',
    icon: '🥾',
    description: 'Boots issued only to hunters who are first through a collapsing gate, every time, without exception.',
    levelReq: 615,
    stats: { ...EMPTY_STATS, agility: 80, defense: 130 },
    specialEffects: ['Frontline Reflex: dodge chance +8%', 'First In: movement speed +20% for the first 10s of any dungeon'],
    setId: 'national_hunters_panoply',
    source: 'Dropped by NH-rank and higher gate bosses',
    lore: 'Every scar on the leather corresponds to a gate that would otherwise have made the news for the wrong reasons.',
  },

  earring_of_command: {
    id: 'earring_of_command',
    name: 'Earring of Command',
    slot: 'earring',
    rarity: 'NH',
    icon: '💎',
    description: 'A stud enchanted to carry a hunter\'s voice across an entire battlefield, clear over any din.',
    levelReq: 660,
    stats: { ...EMPTY_STATS, perception: 45, intelligence: 35 },
    specialEffects: ['Commanding Voice: party members gain +6% attack while you are above 50% HP'],
    setId: 'national_hunters_panoply',
    source: 'Dropped by NH-rank and higher gate bosses',
    lore: 'A single word through this earring has stopped a retreat mid-collapse. Twice.',
  },

  medallion_of_the_association: {
    id: 'medallion_of_the_association',
    name: 'Medallion of the Association',
    slot: 'necklace',
    rarity: 'NH',
    icon: '🎖️',
    description: 'A medallion presented by the Korean Hunter\'s Association to a hunter formally acknowledged as National-Level.',
    levelReq: 670,
    stats: { ...EMPTY_STATS, intelligence: 45, vitality: 35 },
    specialEffects: ['Association Backing: mana cost of all skills reduced by 8%', 'National Duty: revive time from downed states reduced by 25%'],
    setId: 'national_hunters_panoply',
    source: 'Dropped by NH-rank and higher gate bosses',
    lore: 'Fewer than a dozen exist at any time. Every government on the planet knows exactly who holds one.',
  },

  signet_of_the_strongest_guild: {
    id: 'signet_of_the_strongest_guild',
    name: 'Signet of the Strongest Guild',
    slot: 'ring',
    rarity: 'NH',
    icon: '💍',
    description: 'A signet ring carried only by the leader of the world\'s highest-ranked hunter guild.',
    levelReq: 690,
    stats: { ...EMPTY_STATS, strength: 40, agility: 30, critChance: 8 },
    specialEffects: ['Guild Authority: summoned or commanded allies gain +8% attack'],
    setId: 'national_hunters_panoply',
    source: 'Dropped by NH-rank and higher gate bosses',
    lore: 'Guild rankings change constantly. This ring, notably, does not — it simply finds its way to whoever currently deserves it.',
  },

  seal_of_national_recognition: {
    id: 'seal_of_national_recognition',
    name: 'Seal of National Recognition',
    slot: 'ring',
    rarity: 'NH',
    icon: '💍',
    description: 'A seal ring stamped with a national emblem, granted only after a hunter\'s strength has been formally verified by three governing bodies.',
    levelReq: 700,
    stats: { ...EMPTY_STATS, perception: 40, intelligence: 30, critDamage: 15 },
    specialEffects: ['Verified Strength: experience gained from S-rank+ kills increased by 10%'],
    setId: 'national_hunters_panoply',
    source: 'Dropped by NH-rank and higher gate bosses',
    lore: 'The verification process takes years. The ring, once granted, has never been revoked.',
  },

  // ── Monarch's Dominion — full 10-slot Monarch set ───────────────────────
  // Monarch sits above NH, previously empty. Themed on the invading
  // Monarchs — Beast, Ice, Frost, and Plague — the rulers whose armies
  // poured through the gates before the Shadow Monarch turned against them.
  fang_of_the_beast_monarch: {
    id: 'fang_of_the_beast_monarch',
    name: 'Fang of the Beast Monarch',
    slot: 'weapon',
    rarity: 'Monarch',
    icon: '🦁',
    description: 'A curved claw-blade torn from the Beast Monarch itself, still carrying the weight of a will that once commanded armies of beasts.',
    levelReq: 950,
    stats: { ...EMPTY_STATS, attack: 3800, strength: 65, agility: 55 },
    specialEffects: ['Feral Instinct: critical strike chance +12%', 'Beast\'s Hunger: killing blows restore 8% max HP'],
    setId: 'monarchs_dominion',
    source: 'Dropped by Monarch-rank and higher gate bosses',
    lore: 'It hungers even now, detached from the creature that carried it for ten thousand years. Wielders learn to feed it kills, or it finds a way to remind them.',
  },

  ward_of_the_frost_monarch: {
    id: 'ward_of_the_frost_monarch',
    name: 'Ward of the Frost Monarch',
    slot: 'offHand',
    rarity: 'Monarch',
    icon: '❄️',
    description: 'A shield of eternal ice carved from the Frost Monarch\'s own domain. It does not melt, even against fire that ends worlds.',
    levelReq: 930,
    stats: { ...EMPTY_STATS, defense: 450, vitality: 110 },
    specialEffects: ['Frozen Bastion: 6% chance to freeze an attacker for 2s on block', 'Eternal Ice: cannot be destroyed or lost on death'],
    setId: 'monarchs_dominion',
    source: 'Dropped by Monarch-rank and higher gate bosses',
    lore: 'Frost this deep does not answer to seasons. It answers to a will that has not existed for years, and still hasn\'t noticed.',
  },

  crown_of_absolute_dominion: {
    id: 'crown_of_absolute_dominion',
    name: 'Crown of Absolute Dominion',
    slot: 'helmet',
    rarity: 'Monarch',
    icon: '👑',
    description: 'A jagged crown worn by a Monarch before its fall, radiating the residual authority of a being that once ruled an entire race.',
    levelReq: 960,
    stats: { ...EMPTY_STATS, defense: 320, perception: 65, intelligence: 55 },
    specialEffects: ['Absolute Dominion: lower-rank enemies suffer -10% attack in your presence', 'Monarch\'s Gaze: reveals all enemies on the current floor for 5s (once per dungeon)'],
    setId: 'monarchs_dominion',
    source: 'Dropped by Monarch-rank and higher gate bosses',
    lore: 'It does not fit any head comfortably. It was never meant to. Dominion isn\'t supposed to be comfortable.',
  },

  carapace_of_the_plague_monarch: {
    id: 'carapace_of_the_plague_monarch',
    name: 'Carapace of the Plague Monarch',
    slot: 'chestplate',
    rarity: 'Monarch',
    icon: '☣️',
    description: 'Chitinous armour grown from the Plague Monarch\'s own exoskeleton, immune to every disease and toxin known to either world.',
    levelReq: 1000,
    stats: { ...EMPTY_STATS, defense: 450, vitality: 120 },
    specialEffects: ['Plague Immunity: complete immunity to poison, disease, and debuff effects', 'Toxic Retaliation: attackers suffer a stacking poison dealing 3% max HP over 5s'],
    setId: 'monarchs_dominion',
    source: 'Dropped by Monarch-rank and higher gate bosses',
    lore: 'It was harvested, not forged. What grew back afterward was not the same shape, and no one asked why.',
  },

  talons_of_the_beast_monarch: {
    id: 'talons_of_the_beast_monarch',
    name: 'Talons of the Beast Monarch',
    slot: 'gloves',
    rarity: 'Monarch',
    icon: '🐾',
    description: 'Gauntlets tipped with the Beast Monarch\'s own claws, still sharp enough to open a rift between worlds.',
    levelReq: 970,
    stats: { ...EMPTY_STATS, defense: 260, strength: 120 },
    specialEffects: ['Rending Talons: attacks ignore 25% of enemy defense', 'Alpha Strike: first hit of combat deals +30% damage'],
    setId: 'monarchs_dominion',
    source: 'Dropped by Monarch-rank and higher gate bosses',
    lore: 'Something in the marrow of the claws still remembers being obeyed by every beast that ever lived. It has not adjusted well.',
  },

  greaves_of_the_ice_monarch: {
    id: 'greaves_of_the_ice_monarch',
    name: 'Greaves of the Ice Monarch',
    slot: 'boots',
    rarity: 'Monarch',
    icon: '🥶',
    description: 'Greaves that leave a trail of frost with every step, a fragment of the Ice Monarch\'s endless winter given form.',
    levelReq: 940,
    stats: { ...EMPTY_STATS, agility: 120, defense: 200 },
    specialEffects: ['Glacial Stride: leaves a frost trail that slows pursuing enemies by 20%', 'Winter\'s Grace: immune to slow and freeze effects'],
    setId: 'monarchs_dominion',
    source: 'Dropped by Monarch-rank and higher gate bosses',
    lore: 'The frost never melts behind them. Somewhere, a winter that should have ended keeps not ending.',
  },

  earring_of_the_frost_monarch: {
    id: 'earring_of_the_frost_monarch',
    name: 'Earring of the Frost Monarch',
    slot: 'earring',
    rarity: 'Monarch',
    icon: '💎',
    description: 'A shard of eternal ice set as a drop earring, cold enough to numb thought in anyone but its rightful bearer.',
    levelReq: 1020,
    stats: { ...EMPTY_STATS, perception: 65, intelligence: 55 },
    specialEffects: ['Frost Clarity: skill cooldowns reduced by 12%'],
    setId: 'monarchs_dominion',
    source: 'Dropped by Monarch-rank and higher gate bosses',
    lore: 'It has never warmed, not once, not even held against skin for years. Some things simply refuse.',
  },

  pendant_of_plague: {
    id: 'pendant_of_plague',
    name: 'Pendant of Plague',
    slot: 'necklace',
    rarity: 'Monarch',
    icon: '📿',
    description: 'A pendant containing a single sealed spore from the Plague Monarch\'s domain, potent enough to end cities if released.',
    levelReq: 1040,
    stats: { ...EMPTY_STATS, intelligence: 65, vitality: 55 },
    specialEffects: ['Contained Plague: mana regeneration +18%', 'Sealed Menace: cannot be removed by enemy debuff-strip effects'],
    setId: 'monarchs_dominion',
    source: 'Dropped by Monarch-rank and higher gate bosses',
    lore: 'The seal has held for years. No one has volunteered to check how.',
  },

  ring_of_beastly_command: {
    id: 'ring_of_beastly_command',
    name: 'Ring of Beastly Command',
    slot: 'ring',
    rarity: 'Monarch',
    icon: '💍',
    description: 'A ring grown from bone and claw, carrying the Beast Monarch\'s authority over every lesser creature.',
    levelReq: 1080,
    stats: { ...EMPTY_STATS, strength: 60, agility: 50, critDamage: 20 },
    specialEffects: ['Beastly Command: summoned or extracted beast-type allies gain +10% attack'],
    setId: 'monarchs_dominion',
    source: 'Dropped by Monarch-rank and higher gate bosses',
    lore: 'Lesser creatures give it a wide berth without knowing why. Something in them still remembers who used to give the orders.',
  },

  ring_of_glacial_sovereignty: {
    id: 'ring_of_glacial_sovereignty',
    name: 'Ring of Glacial Sovereignty',
    slot: 'ring',
    rarity: 'Monarch',
    icon: '💍',
    description: 'A band of blue ice that never melts and never cracks, a remnant of the Frost Monarch\'s absolute rule over cold itself.',
    levelReq: 1100,
    stats: { ...EMPTY_STATS, perception: 60, intelligence: 50, critChance: 12 },
    specialEffects: ['Glacial Sovereignty: ice and frost skills deal +15% damage'],
    setId: 'monarchs_dominion',
    source: 'Dropped by Monarch-rank and higher gate bosses',
    lore: 'The cold radiating from it has been measured. The instruments used to measure it stopped working afterward.',
  },

  // ── Dragon Emperor's Ruin — full 10-slot Monarch+ set ───────────────────
  // Monarch+ is the highest droppable rarity below the grant-only Regalia,
  // previously empty. Themed on Antares, the Dragon Emperor — Monarch of
  // Destruction and by reputation the single strongest Monarch to ever cross
  // through a gate.
  antares_fang_of_ruin: {
    id: 'antares_fang_of_ruin',
    name: 'Antares, Fang of Ruin',
    slot: 'weapon',
    rarity: 'Monarch+',
    icon: '🐲',
    description: 'A single fang torn from Antares, the Dragon Emperor, reforged into a blade that still radiates the heat of a dying star.',
    levelReq: 1350,
    stats: { ...EMPTY_STATS, attack: 5500, strength: 100, agility: 80 },
    specialEffects: ['Emperor\'s Ruin: attacks deal an additional 10% of the target\'s current HP as true damage', 'Draconic Wrath: critical hits ignite the target, dealing 5% max HP over 6s'],
    setId: 'dragon_emperors_ruin',
    source: 'Dropped by Monarch+-rank and higher gate bosses',
    lore: 'Antares was called the strongest of the Monarchs by every account that survived to say so. This is what remained after the ones who disagreed stopped disagreeing.',
  },

  scale_ward_of_annihilation: {
    id: 'scale_ward_of_annihilation',
    name: 'Scale Ward of Annihilation',
    slot: 'offHand',
    rarity: 'Monarch+',
    icon: '🛡️',
    description: 'A shield built from a single scale of the Dragon Emperor, large enough to cover a hunter twice over and still not run out of surface.',
    levelReq: 1380,
    stats: { ...EMPTY_STATS, defense: 650, vitality: 170 },
    specialEffects: ['Annihilation Ward: reduces all incoming damage by 20%', 'Draconic Bulwark: cannot be destroyed, lost on death, or disarmed'],
    setId: 'dragon_emperors_ruin',
    source: 'Dropped by Monarch+-rank and higher gate bosses',
    lore: 'It was struck once, by something that erased a mountain range on impact. The scale did not notice.',
  },

  crown_of_the_dragon_emperor: {
    id: 'crown_of_the_dragon_emperor',
    name: 'Crown of the Dragon Emperor',
    slot: 'helmet',
    rarity: 'Monarch+',
    icon: '👑',
    description: 'A crown of fused dragonbone and molten gold, worn by Antares before its fall. The heat inside never fully cools.',
    levelReq: 1400,
    stats: { ...EMPTY_STATS, defense: 480, perception: 100, intelligence: 80 },
    specialEffects: ['Emperor\'s Authority: all enemies below Monarch rank suffer -15% attack in your presence', 'Sovereign Sight: sees through all forms of concealment, illusion, and dimensional folding'],
    setId: 'dragon_emperors_ruin',
    source: 'Dropped by Monarch+-rank and higher gate bosses',
    lore: 'Every Monarch who saw it worn hesitated, if only for a heartbeat. A heartbeat was usually enough.',
  },

  hide_of_absolute_destruction: {
    id: 'hide_of_absolute_destruction',
    name: 'Hide of Absolute Destruction',
    slot: 'chestplate',
    rarity: 'Monarch+',
    icon: '🐉',
    description: 'Armour cut from the Dragon Emperor\'s own hide, thick enough to have shrugged off attacks meant to unmake continents.',
    levelReq: 1500,
    stats: { ...EMPTY_STATS, defense: 650, vitality: 180 },
    specialEffects: ['Absolute Endurance: max HP +15%', 'Ruinous Resolve: below 15% HP, all damage taken reduced by 30% for 10s (60s CD)'],
    setId: 'dragon_emperors_ruin',
    source: 'Dropped by Monarch+-rank and higher gate bosses',
    lore: 'The Association classified it as indestructible after three separate attempts to test that claim. All three attempts are also classified.',
  },

  talons_of_the_apocalypse: {
    id: 'talons_of_the_apocalypse',
    name: 'Talons of the Apocalypse',
    slot: 'gloves',
    rarity: 'Monarch+',
    icon: '🦾',
    description: 'Gauntlets forged around the Dragon Emperor\'s own talons, capable of rending through dimensions as easily as flesh.',
    levelReq: 1420,
    stats: { ...EMPTY_STATS, defense: 380, strength: 180 },
    specialEffects: ['Dimensional Rend: attacks ignore 35% of enemy defense', 'Apocalyptic Strike: every 8th attack deals 300% ATK to all enemies within 5m'],
    setId: 'dragon_emperors_ruin',
    source: 'Dropped by Monarch+-rank and higher gate bosses',
    lore: 'They were named for what happened the one time they were used without restraint. The name stuck.',
  },

  greaves_of_the_burning_horizon: {
    id: 'greaves_of_the_burning_horizon',
    name: 'Greaves of the Burning Horizon',
    slot: 'boots',
    rarity: 'Monarch+',
    icon: '🔥',
    description: 'Greaves wreathed in a fire that never gutters, said to carry the Dragon Emperor\'s wingbeat in every stride.',
    levelReq: 1370,
    stats: { ...EMPTY_STATS, agility: 180, defense: 300 },
    specialEffects: ['Burning Horizon: movement speed +30%; leaves a trail of fire dealing damage to pursuing enemies', 'Emperor\'s Flight: may briefly take to the air, ignoring ground-based terrain and traps'],
    setId: 'dragon_emperors_ruin',
    source: 'Dropped by Monarch+-rank and higher gate bosses',
    lore: 'The fire does not burn the wearer, or anything the wearer wishes spared. Everything else is a different matter.',
  },

  earring_of_the_final_beast: {
    id: 'earring_of_the_final_beast',
    name: 'Earring of the Final Beast',
    slot: 'earring',
    rarity: 'Monarch+',
    icon: '💎',
    description: 'A single dragon-scale earring, the last piece of Antares ever recovered intact. It hums with a mind that no longer exists to think.',
    levelReq: 1450,
    stats: { ...EMPTY_STATS, perception: 100, intelligence: 80 },
    specialEffects: ['Final Beast: cooldown reduction +20%', 'Emperor\'s Instinct: cannot be surprised or ambushed'],
    setId: 'dragon_emperors_ruin',
    source: 'Dropped by Monarch+-rank and higher gate bosses',
    lore: 'It hums a note no instrument can replicate. Musicians who have heard it stop trying to write music for a while afterward.',
  },

  heart_of_annihilation: {
    id: 'heart_of_annihilation',
    name: 'Heart of Annihilation',
    slot: 'necklace',
    rarity: 'Monarch+',
    icon: '💠',
    description: 'The crystallised mana-core of the Dragon Emperor itself, still beating with the force of whatever kept a being like that alive.',
    levelReq: 1480,
    stats: { ...EMPTY_STATS, intelligence: 100, vitality: 80 },
    specialEffects: ['Heart of Annihilation: +20% maximum HP and MP', 'Draconic Rebirth: once per dungeon, survive a lethal blow at 10% HP and cleanse all debuffs'],
    setId: 'dragon_emperors_ruin',
    source: 'Dropped by Monarch+-rank and higher gate bosses',
    lore: 'It beats once every ten minutes, a slow and terrible rhythm. Wearers say they can feel it in their teeth.',
  },

  ring_of_the_ruinous_flame: {
    id: 'ring_of_the_ruinous_flame',
    name: 'Ring of the Ruinous Flame',
    slot: 'ring',
    rarity: 'Monarch+',
    icon: '💍',
    description: 'A band of black gold wreathed in a flame that consumes without ever running out of fuel.',
    levelReq: 1550,
    stats: { ...EMPTY_STATS, strength: 90, agility: 70, critDamage: 25 },
    specialEffects: ['Ruinous Flame: fire and destruction-type skills deal +20% damage'],
    setId: 'dragon_emperors_ruin',
    source: 'Dropped by Monarch+-rank and higher gate bosses',
    lore: 'The flame has consumed nothing in the wearer\'s presence for years. It has not, notably, gone out.',
  },

  ring_of_the_dragon_emperors_wrath: {
    id: 'ring_of_the_dragon_emperors_wrath',
    name: "Ring of the Dragon Emperor's Wrath",
    slot: 'ring',
    rarity: 'Monarch+',
    icon: '💍',
    description: 'The final ring of the set, said to carry the last thing Antares felt before falling — not fear, but fury that it was even possible.',
    levelReq: 1600,
    stats: { ...EMPTY_STATS, perception: 90, intelligence: 70, critChance: 18 },
    specialEffects: ['Emperor\'s Wrath: damage dealt to Monarch-rank and higher enemies increased by 15%'],
    setId: 'dragon_emperors_ruin',
    source: 'Dropped by Monarch+-rank and higher gate bosses',
    lore: 'It is said to still be angry. No one has been foolish enough to ask what about.',
  },
};

// ---------------------------------------------------------------------------
// Equipment sets
// ---------------------------------------------------------------------------
const EQUIPMENT_SETS = Object.freeze({
  // Kamish's Legacy — the top FARMABLE set (SS). Flat bonuses on purpose: the
  // Shadow Monarch's Regalia scales as a percentage of base stats via
  // SoloLevelingStats and is rank-gated, so this can never eclipse the Lv2000
  // reward no matter how much gear is farmed.
  kamishs_legacy: {
    name: "Kamish's Legacy",
    pieces: [
      'kamishs_fang',
      'kamishs_scale_ward',
      'dragonbone_visor',
      'scaled_cuirass_of_the_catastrophe',
      'dragonclaw_gauntlets',
      'wyrmstride_greaves',
      'ember_of_kamish',
      'heart_of_the_catastrophe',
      'ring_of_the_dragons_eye',
      'ring_of_the_dragons_maw',
    ],
    bonuses: {
      3: Object.freeze({ strength: 8, agility: 8, intelligence: 8, vitality: 8, perception: 8 }),
      6: Object.freeze({ strength: 18, agility: 18, intelligence: 18, vitality: 18, perception: 18 }),
      10: Object.freeze({ strength: 35, agility: 35, intelligence: 35, vitality: 35, perception: 35 }),
    },
  },

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

  rulers_vestments: {
    name: 'Vestments of the Rulers',
    pieces: [
      'rulers_judgment',
      'aegis_of_the_absolute',
      'halo_of_the_chosen',
      'vestment_of_divine_authority',
      'gauntlets_of_absolute_will',
      'sandals_of_the_ruler',
      'earring_of_celestial_sight',
      'pendant_of_the_covenant',
      'ring_of_the_first_ruler',
      'ring_of_the_last_covenant',
    ],
    bonuses: {
      3: Object.freeze({ strength: 45, agility: 45, intelligence: 45, vitality: 45, perception: 45 }),
      6: Object.freeze({ strength: 90, agility: 90, intelligence: 90, vitality: 90, perception: 90 }),
      10: Object.freeze({ strength: 160, agility: 160, intelligence: 160, vitality: 160, perception: 160 }),
    },
  },

  national_hunters_panoply: {
    name: "National Hunter's Panoply",
    pieces: [
      'blade_of_the_strongest',
      'bulwark_of_the_kaisho',
      'crown_of_national_authority',
      'plate_of_the_ten',
      'gauntlets_of_the_apex_predator',
      'boots_of_the_frontline',
      'earring_of_command',
      'medallion_of_the_association',
      'signet_of_the_strongest_guild',
      'seal_of_national_recognition',
    ],
    bonuses: {
      3: Object.freeze({ strength: 70, agility: 70, intelligence: 70, vitality: 70, perception: 70 }),
      6: Object.freeze({ strength: 140, agility: 140, intelligence: 140, vitality: 140, perception: 140 }),
      10: Object.freeze({ strength: 250, agility: 250, intelligence: 250, vitality: 250, perception: 250 }),
    },
  },

  monarchs_dominion: {
    name: "Monarch's Dominion",
    pieces: [
      'fang_of_the_beast_monarch',
      'ward_of_the_frost_monarch',
      'crown_of_absolute_dominion',
      'carapace_of_the_plague_monarch',
      'talons_of_the_beast_monarch',
      'greaves_of_the_ice_monarch',
      'earring_of_the_frost_monarch',
      'pendant_of_plague',
      'ring_of_beastly_command',
      'ring_of_glacial_sovereignty',
    ],
    bonuses: {
      3: Object.freeze({ strength: 110, agility: 110, intelligence: 110, vitality: 110, perception: 110 }),
      6: Object.freeze({ strength: 220, agility: 220, intelligence: 220, vitality: 220, perception: 220 }),
      10: Object.freeze({ strength: 400, agility: 400, intelligence: 400, vitality: 400, perception: 400 }),
    },
  },

  dragon_emperors_ruin: {
    name: "Dragon Emperor's Ruin",
    pieces: [
      'antares_fang_of_ruin',
      'scale_ward_of_annihilation',
      'crown_of_the_dragon_emperor',
      'hide_of_absolute_destruction',
      'talons_of_the_apocalypse',
      'greaves_of_the_burning_horizon',
      'earring_of_the_final_beast',
      'heart_of_annihilation',
      'ring_of_the_ruinous_flame',
      'ring_of_the_dragon_emperors_wrath',
    ],
    bonuses: {
      3: Object.freeze({ strength: 170, agility: 170, intelligence: 170, vitality: 170, perception: 170 }),
      6: Object.freeze({ strength: 340, agility: 340, intelligence: 340, vitality: 340, perception: 340 }),
      10: Object.freeze({ strength: 600, agility: 600, intelligence: 600, vitality: 600, perception: 600 }),
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
  // 'Shadow Monarch' is deliberately ABSENT. It is the player's terminal rank,
  // and its reward is the Regalia grant at Lv2000 (+35 achievements) — not
  // loot. A Shadow-Monarch-rank boss resolves DOWN to the nearest ranked entry
  // (Monarch+) for drop purposes; see _resolveRankForDrops().
});

// Rarity pool per boss rank, ordered [lowest ... highest].
//
// NOTE: 'E' appears in NO pool — the equipment catalogue contains zero
// E-rarity items, so any roll that selected 'E' found nothing and silently
// returned no drop. That made E-rank bosses drop 0% (despite an advertised
// 55%) and burned ~70-78% of D/C bosses' successful rolls. Lowest real
// rarity is 'D'.
// NOTE: 'SSS' appears in NO pool. Every SSS-rarity item in the catalogue is a
// piece of the Shadow Monarch's Regalia, and that set is GRANT-ONLY (awarded in
// full on reaching Shadow Monarch rank — Lv2000 + 35 achievements). Letting SSS
// drop would let the player farm the Regalia from bosses and make the terminal
// reward meaningless. The droppable ceiling is therefore 'SS'.
const RARITY_POOL_BY_RANK = Object.freeze({
  E:                Object.freeze(['D', 'C']),
  D:                Object.freeze(['D', 'C']),
  C:                Object.freeze(['D', 'C', 'B']),
  B:                Object.freeze(['C', 'B', 'A']),
  A:                Object.freeze(['B', 'A', 'S']),
  S:                Object.freeze(['A', 'S', 'SS']),
  SS:               Object.freeze(['S', 'SS', 'SSS+']),
  SSS:              Object.freeze(['SS', 'SSS+', 'NH']),
  'SSS+':           Object.freeze(['SS', 'SSS+', 'NH']),
  NH:               Object.freeze(['SSS+', 'NH', 'Monarch']),
  Monarch:          Object.freeze(['NH', 'Monarch', 'Monarch+']),
  'Monarch+':       Object.freeze(['NH', 'Monarch', 'Monarch+']),
});

// Sets that may NEVER be obtained from a random drop — they are awarded whole,
// by a specific progression event. The Shadow Monarch's Regalia is granted in
// full on reaching Shadow Monarch rank (Lv2000 + 35 achievements); farming its
// pieces off bosses would defeat the point of the terminal reward.
//
// This is enforced structurally in the drop roll (not merely by keeping SSS out
// of the pools) so that re-adding SSS to a pool later cannot silently leak the
// Regalia back into the loot table.
const GRANT_ONLY_SET_IDS = Object.freeze(['shadow_monarch_regalia']);

// Rarity ladder, lowest -> highest. Used to degrade gracefully when a chosen
// rarity has no items in the catalogue (see _resolveEligibleForRarity).
//
// 'E' is intentionally absent: no E-rarity equipment exists.
//
// 'SSS' is a real rarity but is NOT droppable — every SSS item is a Shadow
// Monarch's Regalia piece (see GRANT_ONLY_SET_IDS), so the drop roll sees that
// tier as empty and steps past it. The Regalia deliberately KEEPS rarity SSS
// even though farmable tiers now sit above it: its power is a percentage
// multiplier applied by SoloLevelingStats (uncapped, scales with base stats,
// Shadow Monarch rank only), so it remains the strongest gear in the game
// regardless of where its label sits on this ladder.
const RARITY_ORDER = Object.freeze([
  'D', 'C', 'B', 'A', 'S', 'SS', 'SSS', 'SSS+', 'NH', 'Monarch', 'Monarch+',
]);

// Default weights for [lowest, middle, highest] rarity within a pool.
const RARITY_WEIGHTS = Object.freeze([0.70, 0.20, 0.10]);

// Per-rank weight overrides (positional, same shape as RARITY_WEIGHTS).
// The flat default is bottom-heavy (70% lowest tier), which is right for early
// ranks but meant even a Shadow Monarch kill would yield its top rarity only
// 10% of the time. High ranks progressively skew toward the top of their pool,
// so endgame content actually pays out endgame loot.
// Each endgame rank still mostly yields the bottom of its own pool, but the
// pools themselves march upward — so a Monarch+ boss's "common" drop is NH-tier
// gear, which is another rank's jackpot.
const RARITY_WEIGHTS_BY_RANK = Object.freeze({
  A:                Object.freeze([0.55, 0.30, 0.15]),
  S:                Object.freeze([0.55, 0.30, 0.15]),
  SS:               Object.freeze([0.55, 0.32, 0.13]),
  SSS:              Object.freeze([0.50, 0.35, 0.15]),
  'SSS+':           Object.freeze([0.45, 0.37, 0.18]),
  NH:               Object.freeze([0.45, 0.37, 0.18]),
  Monarch:          Object.freeze([0.45, 0.37, 0.18]),
  'Monarch+':       Object.freeze([0.35, 0.40, 0.25]),
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
  GRANT_ONLY_SET_IDS,
  GUARANTEED_DROPS,
  getEquipmentById,
  getEquipmentForSlot,
  getRarityColor,
};
