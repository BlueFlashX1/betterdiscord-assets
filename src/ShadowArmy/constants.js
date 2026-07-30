/**
 * ShadowArmy — Constants, data tables, and helper functions.
 * Extracted from the monolith constructor and top-level scope.
 * Imported as `const C = require('./constants')` in index.js.
 */

// PERSONALITY HELPERS (top-level, used by compression + extraction)

const SHADOW_PERSONALITY_ROLE_MAP = {
  tank: 'tank',
  healer: 'supportive',
  support: 'supportive',
  mage: 'strategic',
  ranger: 'tactical',
  assassin: 'aggressive',
  berserker: 'aggressive',
  knight: 'balanced',
  ant: 'aggressive',
  bear: 'aggressive',
  wolf: 'tactical',
  spider: 'strategic',
  centipede: 'strategic',
  golem: 'tank',
  serpent: 'strategic',
  naga: 'strategic',
  wyvern: 'tactical',
  dragon: 'aggressive',
  titan: 'aggressive',
  giant: 'aggressive',
  elf: 'strategic',
  demon: 'aggressive',
  ghoul: 'aggressive',
  orc: 'aggressive',
  ogre: 'aggressive',
  yeti: 'tank',
};

const { STAT_KEYS } = require("../shared/safe-numbers");

// Shadow Grades (manhwa lore) — separate from rank (E→S→Monarch game power tier).
// Grades represent the shadow's evolution tier within the Shadow Monarch's army.
// Lore: Normal→Elite→Knight→Elite Knight→General→Marshal→Grand Marshal
const SHADOW_GRADES = ['Common', 'Elite', 'Knight', 'Elite Knight', 'General', 'Marshal', 'Grand Marshal'];

function normalizeShadowPersonalityValue(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function deriveShadowPersonalityFromRole(role) {
  const normalizedRole = normalizeShadowPersonalityValue(role);
  if (!normalizedRole) return '';
  return SHADOW_PERSONALITY_ROLE_MAP[normalizedRole] || 'balanced';
}

// ARISE SVG — Hand-drawn ARISE animation graphic

const ARISE_SVG = require('../shared/arise-svg').ARISE_SVG;

// DEFAULT SETTINGS — Plugin Configuration

const DEFAULT_SETTINGS = {
  enabled: true,
  // Per-extraction "Shadow Extracted" toasts. Default OFF (2026-07-13) —
  // they fire on every extraction and the army widget already shows the
  // live count. ARISE summaries / warnings / errors toast regardless.
  extractionToasts: false,
  shadows: [], // DEPRECATED: Shadows stored in IndexedDB, kept for migration compat
  totalShadowsExtracted: 0,
  lastExtractionTime: null,
  cachedTotalPower: 0,
  cachedTotalPowerTimestamp: 0,
  cachedTotalPowerShadowCount: 0,
  cachedTotalPowerVersion: 1,
  extractionConfig: {
    minBaseChance: 0.01,
    chancePerInt: 0.01,
    maxExtractionChance: 0.3,
    maxExtractionsPerMinute: 20,
    messageQueueInitialDelayMs: 120,
    messageQueueIntervalMs: 450,
    messageQueueMaxPending: 20,
    specialBaseChance: 0.01,
    specialIntMultiplier: 0.003,
    specialLuckMultiplier: 0.002,
    specialMaxChance: 0.3,
    specialMaxPerDay: 5,
    maxBossAttemptsPerDay: 3,
    bossAttemptResetHour: 0,
  },
  rankPromotionConfig: {
    enabled: true,
    minLevelByRank: {
      D: 5,
      C: 10,
      B: 18,
      A: 30,
      S: 45,
      SS: 65,
      SSS: 90,
      'SSS+': 120,
      NH: 160,
      Monarch: 210,
      'Monarch+': 280,
    },
  },
  dungeonExtractionAttempts: {},
  specialArise: {
    lastDate: null,
    countToday: 0,
  },
  shadowEssence: {
    enabled: true,
    essence: 0,
    // --- Earning ---
    // Mob kills: base essence per kill, scaled by mob rank
    essencePerMobKill: {
      E: 1, D: 2, C: 4, B: 8, A: 16, S: 32, SS: 64,
      SSS: 128, 'SSS+': 256, NH: 512, Monarch: 1024,
      'Monarch+': 2048, 'Shadow Monarch': 4096,
    },
    // Boss kills: lump sum reward on dungeon completion
    essencePerBossKill: {
      E: 50, D: 100, C: 200, B: 400, A: 800, S: 1600, SS: 3200,
      SSS: 6400, 'SSS+': 12800, NH: 25600, Monarch: 51200,
      'Monarch+': 102400, 'Shadow Monarch': 204800,
    },
    // --- Spending: Grade Promotion Costs ---
    // Shadows have a GRADE (manhwa lore) separate from rank (game power tier).
    // Grade: Common → Elite → Knight → Elite Knight → General → Marshal → Grand Marshal
    // Lore: "Shadows cannot advance to higher grades without direct
    // authorization from the Shadow Monarch." Essence = Monarch's mana.
    gradePromotionCost: {
      Elite: 100,            // Common → Elite: quick early progression
      Knight: 500,           // Elite → Knight: can now be "named" (lore)
      'Elite Knight': 2000,  // Knight → Elite Knight: S-rank equivalent
      General: 8000,         // Elite Knight → General: can now speak (lore)
      Marshal: 50000,        // General → Marshal: highest evolution (Igris, Beru)
      'Grand Marshal': 500000, // Marshal → Grand Marshal: Bellion-tier, legendary
    },
    // Grade stat multipliers — higher grade = proportionally stronger shadow.
    // Applied as a multiplier to all effective stats during combat.
    gradeStatMultiplier: {
      Common: 1.0,
      Elite: 1.15,
      Knight: 1.35,
      'Elite Knight': 1.6,
      General: 2.0,
      Marshal: 2.5,
      'Grand Marshal': 3.5,
    },
    // COMMAND HIERARCHY (lore: one sovereign per species — Igris leads the
    // knights, Beru the ants, Bellion above all). Officer grades are capped
    // PER SPECIES (species = beastFamily || beastType || role):
    //   Grand Marshal: 1  — the species' supreme commander
    //   Marshal:       4  — co-commanders (vanguard/rear/left/right)
    //   General:       1 per 50 troops of the species (min 5) — officer corps
    //   Elite Knight and below: uncapped rank-and-file.
    // Enforced in autoPromoteGrades; reconcileGradeHierarchy() restructures an
    // existing over-promoted army once (keeps the highest rank+stats holder of
    // each slot, demotes the rest down the ladder, refunds the essence
    // difference in full).
    gradeHierarchy: {
      enabled: true,
      grandMarshalPerSpecies: 1,
      marshalPerSpecies: 4,
      generalPerTroops: 50,
      generalMinPerSpecies: 5,
    },
    // Auto-promote: process up to N shadows per cycle (prevents IDB storm)
    autoPromoteBatchSize: 50,
    autoPromoteIntervalMs: 30000, // Check every 30s
  },
  shadowCompression: {
    enabled: true,
    eliteThreshold: 100,
    compressionVersion: 1,
    lastCompressionTime: null,
    compressionIntervalHours: 1,
  },
  ariseAnimation: {
    enabled: true,
    animationDuration: 2500,
    scale: 1.0,
    showRankAndRole: true,
    minGapMs: 900,
    animationFont: 'Speedy Space Goat Oddity',
    useLocalFonts: true,
  },
};

// SHADOW RANK SYSTEM — Solo Leveling Rank Hierarchy (E → Shadow Monarch)

// Shadows granted shared XP per flush (lap rotation — see
// progression.js flushPendingSharedXp). The whole-army grant it replaced cost
// ~29s of CPU and ~562k IDB callbacks per flush on a 281k store. At 30k a lap
// is ~10 flushes, so a shadow's XP arrives up to ~10 flush intervals later than
// before; totals are unchanged. Raise for less lag and bigger spikes, lower for
// the reverse. Overridable per-user via settings.xpLapSliceSize.
const XP_LAP_SLICE_SIZE = 30000;

const { RANK_ORDER: SHADOW_RANKS } = require("../shared/rank-utils");

// SHADOW ROLES — 26 Types (8 Humanoid + 18 Magic Beast)

const SHADOW_ROLES = {
  // Humanoid roles (extracted from regular messages)
  tank: {
    name: 'Tank',
    description: 'High defense, protects your messages',
    buffs: { vitality: 0.1, strength: 0.05 },
    effect: 'Message Protection',
  },
  healer: {
    name: 'Healer',
    description: 'Restores HP and provides support',
    buffs: { vitality: 0.15, perception: 0.1 },
    effect: 'HP Regeneration',
  },
  mage: {
    name: 'Mage',
    description: 'Powerful magic attacks, boosts XP',
    buffs: { intelligence: 0.15, agility: 0.05 },
    effect: 'XP Amplification',
  },
  assassin: {
    name: 'Assassin',
    description: 'High crit chance and stealth',
    buffs: { agility: 0.2, strength: 0.05 },
    effect: 'Crit Enhancement',
  },
  ranger: {
    name: 'Ranger',
    description: 'Long-range attacks, boosts collection',
    buffs: { agility: 0.1, intelligence: 0.1 },
    effect: 'Collection Boost',
  },
  knight: {
    name: 'Knight',
    description: 'Balanced warrior, all-around buffs',
    buffs: { strength: 0.1, agility: 0.1, vitality: 0.1 },
    effect: 'Balanced Power',
  },
  berserker: {
    name: 'Berserker',
    description: 'High damage, low defense',
    buffs: { strength: 0.2, vitality: -0.05 },
    effect: 'Damage Boost',
  },
  support: {
    name: 'Support',
    description: 'Buffs allies and provides utility',
    buffs: { perception: 0.15, intelligence: 0.1 },
    effect: 'Perception Amplification',
  },

  // Magic Beast roles (dungeon-only extraction)
  ant: {
    name: 'Ant', description: 'Insect-type beast - High numbers, coordinated attacks',
    buffs: { strength: 0.12, agility: 0.12 }, effect: 'Swarm Tactics',
    isMagicBeast: true, family: 'insect',
  },
  bear: {
    name: 'Bear', description: 'Beast-type - Raw power and endurance',
    buffs: { strength: 0.18, vitality: 0.12 }, effect: 'Berserker Rage',
    isMagicBeast: true, family: 'beast',
  },
  wolf: {
    name: 'Wolf', description: 'Pack hunter - Speed and coordination',
    buffs: { agility: 0.15, strength: 0.1 }, effect: 'Pack Hunter',
    isMagicBeast: true, family: 'beast',
  },
  spider: {
    name: 'Spider', description: 'Arachnid-type - Web traps and venom',
    buffs: { agility: 0.13, intelligence: 0.12 }, effect: 'Web Trap',
    isMagicBeast: true, family: 'insect',
  },
  centipede: {
    name: 'Centipede', description: 'Multi-legged horror - Poison and speed',
    buffs: { agility: 0.15, intelligence: 0.1 }, effect: 'Poison Sting',
    isMagicBeast: true, family: 'insect',
  },
  golem: {
    name: 'Golem', description: 'Stone construct - Extreme defense, slow',
    buffs: { vitality: 0.25, strength: 0.08 }, effect: 'Stone Skin',
    isMagicBeast: true, family: 'construct',
  },
  serpent: {
    name: 'Serpent', description: 'Snake-type - Venom and cunning',
    buffs: { intelligence: 0.14, agility: 0.12 }, effect: 'Venom Strike',
    isMagicBeast: true, family: 'reptile',
  },
  naga: {
    name: 'Naga', description: 'Serpent humanoid - Magic and agility',
    buffs: { intelligence: 0.15, agility: 0.13 }, effect: 'Water Magic',
    isMagicBeast: true, family: 'reptile',
  },
  wyvern: {
    name: 'Wyvern', description: 'Flying beast - Aerial superiority',
    buffs: { agility: 0.16, strength: 0.14 }, effect: 'Aerial Strike',
    isMagicBeast: true, family: 'dragon', minRank: 'S',
  },
  dragon: {
    name: 'Dragon', description: 'Apex predator - Supreme in all aspects',
    buffs: { strength: 0.15, intelligence: 0.15, agility: 0.1 }, effect: 'Dragon Dominance',
    isMagicBeast: true, family: 'dragon', minRank: 'NH',
  },
  titan: {
    name: 'Titan', description: 'Ancient giant - Colossal power and endurance',
    buffs: { strength: 0.2, vitality: 0.18 }, effect: 'Titan Force',
    isMagicBeast: true, family: 'giant', minRank: 'A',
  },
  giant: {
    name: 'Giant', description: 'Massive humanoid - Overwhelming size and strength',
    buffs: { strength: 0.17, vitality: 0.14 }, effect: 'Giant Slam',
    isMagicBeast: true, family: 'giant',
  },
  elf: {
    name: 'Elf', description: 'Ancient race - Magic mastery and precision',
    buffs: { intelligence: 0.16, agility: 0.14, perception: 0.1 }, effect: 'Ancient Magic',
    isMagicBeast: true, family: 'ancient',
  },
  demon: {
    name: 'Demon', description: 'Dark entity - Chaos and destruction',
    buffs: { strength: 0.16, intelligence: 0.16 }, effect: 'Dark Power',
    isMagicBeast: true, family: 'demon', minRank: 'B',
  },
  ghoul: {
    name: 'Ghoul', description: 'Undead horror - Life drain and regeneration',
    buffs: { vitality: 0.14, intelligence: 0.11 }, effect: 'Life Drain',
    isMagicBeast: true, family: 'undead',
  },
  orc: {
    name: 'Orc', description: 'Brutal warrior - Savage strength and ferocity',
    buffs: { strength: 0.16, vitality: 0.1 }, effect: 'Savage Fury',
    isMagicBeast: true, family: 'humanoid-beast',
  },
  ogre: {
    name: 'Ogre', description: 'Brute monster - Raw strength, low intelligence',
    buffs: { strength: 0.19, vitality: 0.13 }, effect: 'Crushing Blow',
    isMagicBeast: true, family: 'humanoid-beast',
  },
  yeti: {
    name: 'Yeti', description: 'Ice beast - Frozen fury and endurance',
    buffs: { strength: 0.15, vitality: 0.15 }, effect: 'Frost Aura',
    isMagicBeast: true, family: 'ice',
  },
};

// STAT WEIGHT TEMPLATES — Role-Based Stat Generation
// Higher weight = role favors that stat more. Extreme specialization pattern.

const SHADOW_ROLE_STAT_WEIGHTS = {
  tank:       { strength: 0.9, agility: 0.3, intelligence: 0.2, vitality: 1.5, perception: 0.3 },
  healer:     { strength: 0.2, agility: 0.4, intelligence: 1.3, vitality: 1.1, perception: 1.0 },
  mage:       { strength: 0.15, agility: 0.5, intelligence: 1.6, vitality: 0.4, perception: 0.6 },
  assassin:   { strength: 0.7, agility: 1.7, intelligence: 0.5, vitality: 0.3, perception: 0.8 },
  ranger:     { strength: 0.6, agility: 1.3, intelligence: 1.0, vitality: 0.5, perception: 0.8 },
  knight:     { strength: 1.1, agility: 0.9, intelligence: 0.6, vitality: 1.1, perception: 0.5 },
  berserker:  { strength: 1.8, agility: 0.7, intelligence: 0.15, vitality: 0.5, perception: 0.4 },
  support:    { strength: 0.25, agility: 0.6, intelligence: 1.2, vitality: 0.7, perception: 1.4 },
  // Magic Beast stat weights — tuned to Solo Leveling monster biology
  ant:        { strength: 1.2, agility: 1.3, intelligence: 0.3, vitality: 1.0, perception: 0.7 }, // Jeju ants: strong mandibles, fast swarmers, tough exoskeletons, keen chemical senses
  bear:       { strength: 1.6, agility: 0.4, intelligence: 0.3, vitality: 1.4, perception: 0.5 }, // Red Gate ice bears (Tank's origin): slow devastators, near-indestructible
  wolf:       { strength: 1.0, agility: 1.5, intelligence: 0.6, vitality: 0.7, perception: 1.0 }, // Pack hunters: fast, coordinated, apex trackers with keen senses
  spider:     { strength: 0.6, agility: 1.4, intelligence: 1.0, vitality: 0.5, perception: 1.0 }, // Ambush predators: web-spinners, agile, fragile, excellent vibration sensing
  golem:      { strength: 1.3, agility: 0.2, intelligence: 0.1, vitality: 1.9, perception: 0.3 }, // Stone constructs: near-indestructible, mindless, immovable
  wyvern:     { strength: 1.4, agility: 1.6, intelligence: 0.5, vitality: 1.0, perception: 0.9 }, // Lesser dragons: fastest fliers, bestial intelligence, sharp aerial eyesight
  serpent:    { strength: 0.8, agility: 1.4, intelligence: 0.8, vitality: 0.7, perception: 1.0 }, // Venomous strikers: fast lunges, instinctual, heat/vibration sensing
  dragon:     { strength: 1.7, agility: 1.4, intelligence: 1.5, vitality: 1.6, perception: 1.2 }, // Apex predators (Kamish-tier): supreme in all stats, can strategize and speak
  orc:        { strength: 1.5, agility: 0.8, intelligence: 0.7, vitality: 1.2, perception: 0.5 }, // Tribal warriors (Tusk/Kargalgan): brute force + organized warfare, shamans, strategy
  naga:       { strength: 0.8, agility: 1.3, intelligence: 1.4, vitality: 0.9, perception: 1.0 }, // Half-serpent magic users: water/poison magic, intelligent, good senses
  titan:      { strength: 1.8, agility: 0.3, intelligence: 0.4, vitality: 1.7, perception: 0.6 }, // Japan Gate colossi: absolute physical power, glacially slow, bestial
  giant:      { strength: 1.6, agility: 0.4, intelligence: 0.5, vitality: 1.5, perception: 0.5 }, // Japan Gate: very strong, slow, some crude weapon use
  elf:        { strength: 0.5, agility: 1.5, intelligence: 1.6, vitality: 0.6, perception: 1.3 }, // Ice elves (Baruka): agile magic users, coordinated military, keen senses
  demon:      { strength: 1.5, agility: 1.2, intelligence: 1.4, vitality: 1.1, perception: 1.0 }, // Demon Castle (Baran): strong, fast, intelligent magic users, magical senses
  ghoul:      { strength: 1.0, agility: 0.8, intelligence: 0.3, vitality: 1.6, perception: 0.4 }, // Mindless undead: relentless, hard to kill, no strategy, dead senses
  ogre:       { strength: 1.7, agility: 0.3, intelligence: 0.2, vitality: 1.4, perception: 0.4 }, // Massive brutes: strongest physical, extremely slow, very dumb
  centipede:  { strength: 1.0, agility: 1.4, intelligence: 0.5, vitality: 1.1, perception: 0.7 }, // Armored segments: fast, venomous, decent durability
  yeti:       { strength: 1.4, agility: 0.8, intelligence: 0.6, vitality: 1.5, perception: 0.7 }, // Arctic predators: strong, durable thick fur, bestial
};

// SHADOW ARMY CAPACITY — Lore-Accurate Storage Limits Per Player Rank
// Based on Solo Leveling novel ch.100: "the sole method to increase storage
// was to increase his Intelligence Stat." Capacity = base + sqrt(INT) × scale.
// Base caps from novel anchor points; Intelligence provides scaling on top.
// Shadow Monarch = Infinity (limitless, full Ashborn power).
// Existing shadows that exceed the cap are grandfathered — never deleted.
// Formula: cap = baseCap + floor(sqrt(intelligence) × intScale)

const SHADOW_ARMY_CAPACITY = {
  // cap = base + floor(sqrt(INT) × intScale)
  // Example effective caps shown at typical INT for that rank tier.
  //                     base      intScale   // @ typical INT → effective cap
  E:                  { base: 0,      intScale: 0 },       // No Shadow Extraction skill yet
  D:                  { base: 15,     intScale: 3 },       // Job Change arc         — INT 25 → ~30
  C:                  { base: 40,     intScale: 8 },       // Growing power           — INT 50 → ~96
  B:                  { base: 80,     intScale: 15 },      // Mid-tier hunter         — INT 100 → ~230
  A:                  { base: 200,    intScale: 30 },      // Post-Igris              — INT 200 → ~624
  S:                  { base: 500,    intScale: 50 },      // Jeju Island arc         — INT 300 → ~1,366
  SS:                 { base: 1000,   intScale: 80 },      // Late S-rank power       — INT 500 → ~2,788
  SSS:                { base: 2500,   intScale: 150 },     // ch.227 "near two thousand" — INT 800 → ~6,743
  'SSS+':             { base: 5000,   intScale: 250 },     // Approaching Monarch     — INT 1000 → ~12,905
  NH:                 { base: 10000,  intScale: 400 },     // National Hunter level   — INT 1200 → ~24,859
  Monarch:            { base: 30000,  intScale: 700 },     // Partial Ashborn         — INT 1500 → ~57,099
  'Monarch+':         { base: 100000, intScale: 1500 },    // ch.240 "over 130 thousand" — INT 2000 → ~167,080
  'Shadow Monarch':   { base: Infinity, intScale: 0 },     // Full Ashborn power — limitless
};

// RANK PROBABILITY MULTIPLIERS — Extraction Chance Scaling
// Lower ranks = easier. Higher ranks = exponentially harder.

const RANK_PROBABILITY_MULTIPLIERS = {
  E: 10.0, D: 5.0, C: 2.5, B: 1.0, A: 0.5, S: 0.2,
  SS: 0.1, SSS: 0.05, 'SSS+': 0.02, NH: 0.01,
  Monarch: 0.005, 'Monarch+': 0.001, 'Shadow Monarch': 0.0001,
};

// RANK STAT MULTIPLIERS — Harmonized power scaling (~1.35x per rank)
// Keeps rank identity strong without outpacing dungeon mob/boss curves too aggressively.

const RANK_STAT_MULTIPLIERS = {
  E: 1.0,
  D: 1.35,
  C: 1.8225,
  B: 2.460375,
  A: 3.32150625,
  S: 4.4840334375,
  SS: 6.053445140625,
  SSS: 8.17215093984375,
  'SSS+': 11.032403768789064,
  NH: 14.893745087865237,
  Monarch: 20.10655586861807,
  'Monarch+': 27.143850422634397,
  'Shadow Monarch': 36.64419807055644,
};

// SELF-HEAL — single source of truth for the heal-version stamp so
// extraction (creation-time stamping) and self-heal.js (Phase 2 skip check)
// never drift apart. Bump when stat weights change again to force a re-heal.
const HEAL_VERSION = 1;

// CSS STYLE IDs — For injection tracking and cleanup

const STYLE_ID_EXTRACTION = 'shadow-army-extraction-styles';
const STYLE_ID_ARISE = 'shadow-army-arise-styles';
const STYLE_ID_WIDGET = 'shadow-army-widget-styles';
const STYLE_ID_SETTINGS = 'shadow-army-settings-styles';

// EXPORTS

module.exports = {
  // Personality helpers
  SHADOW_PERSONALITY_ROLE_MAP,
  STAT_KEYS,
  // Grade system (manhwa lore)
  SHADOW_GRADES,
  normalizeShadowPersonalityValue,
  deriveShadowPersonalityFromRole,
  // Animation
  ARISE_SVG,
  // Settings
  DEFAULT_SETTINGS,
  // Rank system
  SHADOW_RANKS,
  XP_LAP_SLICE_SIZE,
  SHADOW_ROLES,
  SHADOW_ROLE_STAT_WEIGHTS,
  RANK_PROBABILITY_MULTIPLIERS,
  RANK_STAT_MULTIPLIERS,
  SHADOW_ARMY_CAPACITY,
  // Self-heal
  HEAL_VERSION,
  // CSS style IDs
  STYLE_ID_EXTRACTION,
  STYLE_ID_ARISE,
  STYLE_ID_WIDGET,
  STYLE_ID_SETTINGS,
};
