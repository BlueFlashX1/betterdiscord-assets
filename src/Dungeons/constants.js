module.exports = {
  COMBAT_STATUS_EFFECTS: {
    poison: {
      maxStacks: 4,
      durationMs: 9000,
      tickMs: 1000,
      damagePctPerStack: 0.0025, // 0.25% maxHP per stack per tick
      maxDamagePct: 0.018, // 1.8% maxHP cap
    },
    armorBreak: {
      maxStacks: 3,
      durationMs: 7000,
      damageAmpPerStack: 0.06, // +6% incoming damage per stack
      maxDamageAmp: 0.2, // +20% cap
    },
    slow: {
      maxStacks: 3,
      durationMs: 7000,
      slowPerStack: 0.08, // +8% attack cooldown per stack
      maxSlow: 0.3, // +30% cap
    },
    bleed: {
      maxStacks: 5,
      durationMs: 8000,
      tickMs: 1000,
      damagePctPerStack: 0.003, // 0.3% maxHP per stack per tick (physical DOT)
      maxDamagePct: 0.02, // 2.0% maxHP cap
    },
    burn: {
      maxStacks: 3,
      durationMs: 6000,
      tickMs: 1000,
      damagePctPerStack: 0.005, // 0.5% maxHP per stack per tick (fire DOT — high but short)
      maxDamagePct: 0.022, // 2.2% maxHP cap
    },
    frostbite: {
      maxStacks: 4,
      durationMs: 10000,
      slowPerStack: 0.10, // +10% attack cooldown per stack (stronger than slow)
      maxSlow: 0.40, // +40% cap
      rootAtMaxStacks: true, // At 4 stacks: 3s full freeze (100% slow)
      rootDurationMs: 3000,
    },
    necrotic: {
      maxStacks: 3,
      durationMs: 9000,
      tickMs: 1000,
      damagePctPerStack: 0.002, // 0.2% maxHP per tick (weaker DOT but anti-heal)
      maxDamagePct: 0.012, // 1.2% maxHP cap
      healReductionPerStack: 0.15, // 15% healing reduction per stack
      maxHealReduction: 0.45, // 45% heal reduction cap
    },
    enrage: {
      maxStacks: 2, // Phase 1 (50% HP) and Phase 2 (25% HP)
      durationMs: Infinity, // Permanent per phase
      damageBoostPerStack: 0.20, // +20% outgoing damage per stack
      maxDamageBoost: 0.40, // +40% cap at 2 stacks
      speedBoostPerStack: 0.15, // +15% attack speed per stack
      maxSpeedBoost: 0.30, // +30% cap at 2 stacks
    },
  },
  // Family → status effect mapping (enemies and magic beast shadows use creature-matched ailments)
  FAMILY_STATUS_EFFECT_MAP: {
    beast:            { primary: 'bleed',     secondary: 'armorBreak', chance: 0.09 },
    ice:              { primary: 'frostbite', secondary: 'slow',       chance: 0.10 },
    reptile:          { primary: 'poison',    secondary: 'bleed',      chance: 0.09 },
    dragon:           { primary: 'burn',      secondary: 'bleed',      chance: 0.11 },
    demon:            { primary: 'burn',      secondary: 'necrotic',   chance: 0.10 },
    undead:           { primary: 'necrotic',  secondary: 'poison',     chance: 0.09 },
    giant:            { primary: 'armorBreak',secondary: 'bleed',      chance: 0.08 },
    'humanoid-beast': { primary: 'bleed',     secondary: 'armorBreak', chance: 0.09 },
    insect:           { primary: 'poison',    secondary: 'slow',       chance: 0.10 },
    construct:        { primary: 'armorBreak',secondary: 'slow',       chance: 0.08 },
    ancient:          { primary: 'slow',      secondary: 'poison',     chance: 0.08 },
  },
  // Magic beast stat weights — species-specific combat specialization (mirrors ShadowArmy weights)
  // Applied to mob/boss base stats so an orc hits harder but moves slower than a spider at the same rank
  BEAST_STAT_WEIGHTS: {
    ant:       { strength: 1.2, agility: 1.3, intelligence: 0.3, vitality: 1.0, perception: 0.7 },
    bear:      { strength: 1.6, agility: 0.4, intelligence: 0.3, vitality: 1.4, perception: 0.5 },
    wolf:      { strength: 1.0, agility: 1.5, intelligence: 0.6, vitality: 0.7, perception: 1.0 },
    spider:    { strength: 0.6, agility: 1.4, intelligence: 1.0, vitality: 0.5, perception: 1.0 },
    golem:     { strength: 1.3, agility: 0.2, intelligence: 0.1, vitality: 1.9, perception: 0.3 },
    wyvern:    { strength: 1.4, agility: 1.6, intelligence: 0.5, vitality: 1.0, perception: 0.9 },
    serpent:   { strength: 0.8, agility: 1.4, intelligence: 0.8, vitality: 0.7, perception: 1.0 },
    dragon:    { strength: 1.7, agility: 1.4, intelligence: 1.5, vitality: 1.6, perception: 1.2 },
    orc:       { strength: 1.5, agility: 0.8, intelligence: 0.7, vitality: 1.2, perception: 0.5 },
    naga:      { strength: 0.8, agility: 1.3, intelligence: 1.4, vitality: 0.9, perception: 1.0 },
    titan:     { strength: 1.8, agility: 0.3, intelligence: 0.4, vitality: 1.7, perception: 0.6 },
    giant:     { strength: 1.6, agility: 0.4, intelligence: 0.5, vitality: 1.5, perception: 0.5 },
    elf:       { strength: 0.5, agility: 1.5, intelligence: 1.6, vitality: 0.6, perception: 1.3 },
    demon:     { strength: 1.5, agility: 1.2, intelligence: 1.4, vitality: 1.1, perception: 1.0 },
    ghoul:     { strength: 1.0, agility: 0.8, intelligence: 0.3, vitality: 1.6, perception: 0.4 },
    ogre:      { strength: 1.7, agility: 0.3, intelligence: 0.2, vitality: 1.4, perception: 0.4 },
    centipede: { strength: 1.0, agility: 1.4, intelligence: 0.5, vitality: 1.1, perception: 0.7 },
    yeti:      { strength: 1.4, agility: 0.8, intelligence: 0.6, vitality: 1.5, perception: 0.7 },
  },
  // Boss enrage intensity by family
  BOSS_ENRAGE_INTENSITY: {
    beast:            'high',
    demon:            'high',
    dragon:           'high',
    'humanoid-beast': 'high',
    giant:            'medium',
    ice:              'medium',
    reptile:          'medium',
    insect:           'medium',
    undead:           'low',
    ancient:          'low',
    construct:        'none',   // Mechanical — no rage
  },
  COMBAT_STATUS_LIMITS: {
    tickIntervalMs: 1000,
    maxTrackedMobsPerDungeon: 600,
  },
  // Boss durability — prevents shadow armies from one-shotting bosses

  // 1) BOSS DAMAGE RESISTANCE — rank-scaled % reduction on ALL incoming damage
  BOSS_DAMAGE_RESISTANCE: {
    E: 0.10,  D: 0.15,  C: 0.22,  B: 0.30,  A: 0.38,
    S: 0.45,  SS: 0.50, SSS: 0.55, 'SSS+': 0.58,
    NH: 0.60, Monarch: 0.62, 'Monarch+': 0.64, 'Shadow Monarch': 0.65,
  },

  // 2) PER-HIT DAMAGE CAP — no single hit can exceed this % of boss maxHP
  BOSS_DAMAGE_CAP_PCT: 0.06, // 6% of maxHP per hit (boss needs 17+ hits minimum)

  // 3) BOSS PHASE SHIELD — brief invulnerability at HP thresholds
  BOSS_PHASE_THRESHOLDS: [0.75, 0.50, 0.25],
  BOSS_PHASE_SHIELD_MS: 2500, // 2.5s invulnerability

  // 4) BOSS HP SCALING — accounts for shadow army size (old formula assumed solo player)
  BOSS_HP_ARMY_MULTIPLIER: 8, // 8x base HP to survive sustained shadow DPS

  // 5) SHADOW VS BOSS DAMAGE REDUCTION
  SHADOW_VS_BOSS_DAMAGE_MULT: 0.35, // Shadows deal 35% of calculated damage to bosses

  // 6) SHADOW AOE — lore-accurate abilities from Solo Leveling
  //    Each entry: { name, chance, targets, dmgFrac, hitBoss }
  //    Tuned to canon: Tusk/demon = #1 AOE mage (Hellfire, Hymn of Fire Dragon),
  //    Dragon = city-scale breath, Ants = coordinated swarm, Assassin = zero AOE.
  SHADOW_AOE: {
    // ── Beast families ──

    // INSECTS — Beru-style coordinated swarm tactics. Ants target weakest first,
    // fly in formation, overwhelm with sheer numbers. Each individual is A-rank+.
    ant:       { name: 'Swarm Assault',    chance: 0.45, targets: 10, dmgFrac: 0.25, hitBoss: false },
    spider:    { name: 'Web Entangle',     chance: 0.35, targets: 8,  dmgFrac: 0.25, hitBoss: false },
    centipede: { name: 'Venom Barrage',    chance: 0.35, targets: 8,  dmgFrac: 0.30, hitBoss: false },

    // BEASTS — Tank (bear) uses Shout of Provocation (AOE taunt), plows through
    // enemies like a military tank. Wolves are precision single-target flankers.
    bear:      { name: 'Provocation Ram',  chance: 0.25, targets: 4,  dmgFrac: 0.45, hitBoss: false },
    wolf:      { name: 'Pack Coordinate',  chance: 0.20, targets: 2,  dmgFrac: 0.35, hitBoss: false },

    // REPTILES — Naga (Jima) wields dual tridents + size manipulation.
    // Serpents are venomous single-target strikers.
    serpent:   { name: 'Venom Strike',     chance: 0.20, targets: 2,  dmgFrac: 0.50, hitBoss: false },
    naga:      { name: 'Trident Sweep',    chance: 0.30, targets: 6,  dmgFrac: 0.45, hitBoss: true },

    // DRAGONS — Kamish-tier: Dragon Breath obliterated the US west coast.
    // City-scale devastation. Highest damage AOE in the game. Hits boss.
    // Wyvern (Kaisel) is primarily transport — minimal AOE.
    wyvern:    { name: 'Dive Strike',      chance: 0.15, targets: 3,  dmgFrac: 0.35, hitBoss: false },
    dragon:    { name: "Dragon's Breath",  chance: 0.35, targets: 12, dmgFrac: 0.65, hitBoss: true },

    // GIANTS — 28 shadow giants from Tokyo S-Rank Gate. Massive ground slams,
    // area denial through sheer size. Each can handle S-rank hunters.
    titan:     { name: 'Seismic Slam',     chance: 0.30, targets: 8,  dmgFrac: 0.45, hitBoss: true },
    giant:     { name: 'Ground Pound',     chance: 0.30, targets: 6,  dmgFrac: 0.40, hitBoss: true },

    // CONSTRUCT — Golems are pure tanks. Shockwave from mass, not skill.
    golem:     { name: 'Shockwave',        chance: 0.20, targets: 4,  dmgFrac: 0.30, hitBoss: false },

    // ANCIENT — Elves channel arcane magic. Ranged artillery barrage.
    elf:       { name: 'Arcane Barrage',   chance: 0.35, targets: 7,  dmgFrac: 0.40, hitBoss: false },

    // DEMON — Tusk: THE shadow army's AOE specialist. Hymn of Fire Dragon
    // blasted through Mount Hallasan. Hellfire decimates entire armies.
    // Orb of Avarice doubles magic damage. Highest AOE proc + targets.
    demon:     { name: 'Hellfire',         chance: 0.40, targets: 12, dmgFrac: 0.60, hitBoss: true },

    // UNDEAD — Ghouls spread plague through contact. Chain-spread on kill.
    ghoul:     { name: 'Plague Burst',     chance: 0.35, targets: 6,  dmgFrac: 0.30, hitBoss: false },

    // HUMANOID-BEAST — Orcs/ogres are brute-force melee. War cry + slam.
    orc:       { name: 'War Cry Slam',     chance: 0.25, targets: 4,  dmgFrac: 0.45, hitBoss: false },
    ogre:      { name: 'Club Sweep',       chance: 0.25, targets: 4,  dmgFrac: 0.45, hitBoss: false },

    // ICE — Yeti generates frost nova, freezing and shattering nearby mobs.
    yeti:      { name: 'Frost Nova',       chance: 0.25, targets: 5,  dmgFrac: 0.40, hitBoss: false },

    // ── Humanoid roles ──

    // MAGE — Shadow army mage corps. Ranged artillery behind knight line.
    // Tusk leads them. Blazing Fire / Fireball AOE.
    mage:      { name: 'Blazing Fire',     chance: 0.40, targets: 8,  dmgFrac: 0.50, hitBoss: true },

    // RANGER — Ranged volley, suppressive fire. Arrow Rain on groups.
    ranger:    { name: 'Arrow Rain',       chance: 0.30, targets: 6,  dmgFrac: 0.35, hitBoss: false },

    // BERSERKER — Whirlwind melee. Reckless close-range devastation.
    berserker: { name: 'Whirlwind',        chance: 0.30, targets: 5,  dmgFrac: 0.55, hitBoss: false },

    // KNIGHT — Igris-style master swordsman. Precision cleave, not mass AOE.
    // Ruler's Authority gives telekinetic sweep (2-3 targets max).
    knight:    { name: 'Sword Sweep',      chance: 0.20, targets: 3,  dmgFrac: 0.40, hitBoss: false },

    // ASSASSIN — Greed-style. Speed + single-target elimination. NO AOE.
    // Canon: assassins are pure single-target killers.
    assassin:  { name: 'Shadow Strike',    chance: 0.10, targets: 1,  dmgFrac: 0.80, hitBoss: false },

    // TANK — Provocation/taunt role. Absorbs hits, minimal damage output.
    tank:      { name: 'Shield Slam',      chance: 0.15, targets: 2,  dmgFrac: 0.25, hitBoss: false },

    // HEALER — Beru-style healing magic. Holy Nova is weak offensive AOE.
    healer:    { name: 'Holy Nova',        chance: 0.15, targets: 3,  dmgFrac: 0.20, hitBoss: false },

    // SUPPORT — Utility/buff role. Spirit Burst is minor offensive AOE.
    support:   { name: 'Spirit Burst',     chance: 0.15, targets: 3,  dmgFrac: 0.20, hitBoss: false },

    // Fallback for unknown roles
    _default:  { name: 'Cleave',         chance: 0.15, targets: 2, dmgFrac: 0.35, hitBoss: false },
  },
  RANK_MULTIPLIERS: {
    E: 1,
    D: 2,
    C: 3,
    B: 5,
    A: 8,
    S: 12,
    SS: 16,
    SSS: 21,
    'SSS+': 27,
    NH: 34,
    Monarch: 42,
    'Monarch+': 51,
    'Shadow Monarch': 61,
  },
  // Dungeon deployment scaling -- mob capacity per dungeon rank + shadow deploy ratio.
  // SINGLE SOURCE OF TRUTH (wave 9, 2026-07-12): previously duplicated 3x across
  // spawn-core.js (MOB_COUNT_BY_RANK), player-sync-allocation.js (MOB_CAP_BY_RANK +
  // WARM_MOB_CAP_BY_RANK), held in sync only by a "must match" comment -- a drift
  // hazard. Now centralized; spawn, deploy-target, and pool-warming all read this.
  //
  // Deploy target = mobCapacity(rank) x DEPLOY_MOB_RATIO, then clamped by the army
  // reserve (25% held back, split across active dungeons) and DEPLOY_CEILING_ABSOLUTE.
  // Cost model (why raising the ceiling is safe): combat processes a rotating
  // TICK_BUDGET=500-shadow slice per dungeon per tick regardless of total allocation
  // (combat-shadow-execution.js) -- allocation size affects rotation-cycle length and
  // memory, NOT per-tick CPU. Fetches that scale with the target use rank-indexed
  // bounded reads only (ShadowArmy storage.js:getShadowsByRankLimited / getShadows
  // with an explicit count), never a full-store scan (PERF-CONVENTIONS.md R1).
  DUNGEON_MOB_CAPACITY_BY_RANK: {
    E: 50, D: 150, C: 400, B: 1200, A: 4000, S: 10000, SS: 25000,
    SSS: 50000, 'SSS+': 75000, NH: 100000, Monarch: 250000,
    'Monarch+': 500000, 'Shadow Monarch': 1000000,
  },
  DEPLOY_MOB_RATIO: 1.5, // deploy target = mobCapacity x this ratio ("overwhelming, not OP")
  // Raised 50000 -> 200000 (wave 9): the old flat 50k ceiling flattened every rank from
  // SSS upward to the SAME deploy count (SSS/SSS+/NH/Monarch/Monarch+/Shadow Monarch all
  // clamped to 50000 -- no top-end differentiation). 200000 sits just under a typical
  // late-game army's available-cap headroom (75% of army, split across active dungeons),
  // so it only governs the truly extreme ranks, not normal play.
  DEPLOY_CEILING_ABSOLUTE: 200000,
  ARISE_SVG: require('../shared/arise-svg').ARISE_SVG
};
