module.exports = {
  DEMON_CASTLE_KEY: 'story_demon_castle',
  DEMON_CASTLE_FLOORS: 100,

  // 4 boss floors — updated ranks (S → SS → SSS → Monarch)
  DEMON_CASTLE_BOSSES: {
    1:   { name: 'Cerberus',  title: 'Gatekeeper',                    rank: 'S',       beastFamily: 'demon', abilities: ['rage'] },
    50:  { name: 'Vulcan',    title: 'Ruler of the Lower Floors',     rank: 'SS',      beastFamily: 'demon', abilities: ['avaricious_rage'] },
    75:  { name: 'Metus',     title: 'Guide of the Departed Souls',   rank: 'SSS',     beastFamily: 'demon', abilities: ['necromancy'] },
    100: { name: 'Baran',     title: 'King of Demons',                rank: 'Monarch', beastFamily: 'demon', abilities: ['lightning_breath', 'white_flames', 'hells_army'] },
  },

  // Boss-specific stat multipliers (relative to normal boss of same rank)
  DEMON_CASTLE_BOSS_MULTIPLIERS: {
    1:   { hpMult: 1.5,  dmgMult: 1.2 },   // Cerberus: tanky gatekeeper
    50:  { hpMult: 3.0,  dmgMult: 1.8 },   // Vulcan: massive HP pool + rage buff
    75:  { hpMult: 2.5,  dmgMult: 1.5 },   // Metus: moderate, relies on summons
    100: { hpMult: 5.0,  dmgMult: 2.5 },   // Baran: endgame, long multi-phase fight
  },

  // Demon type tiers by floor range — ranks match boss progression
  FLOOR_TIER_MAP: [
    { minFloor: 1,   maxFloor: 49,  rank: 'A',   name: 'Normal Demon',    eliteRank: 'S',   eliteName: 'High-Grade Demon' },
    { minFloor: 50,  maxFloor: 74,  rank: 'S',   name: 'Demon Knight',    eliteRank: 'SS',  eliteName: 'Elite Demon Knight' },
    { minFloor: 75,  maxFloor: 99,  rank: 'SS',  name: 'Demon Noble',     eliteRank: 'SSS', eliteName: 'Noble Demon Guard' },
    { minFloor: 100, maxFloor: 100, rank: 'SSS', name: "Baran's Guard",   eliteRank: 'Monarch', eliteName: "Baran's Elite Guard" },
  ],

  // 1 million demons per floor
  DEMONS_PER_FLOOR: 1_000_000,

  getDemonCount(_floor) {
    return this.DEMONS_PER_FLOOR;
  },

  // Dungeon rank for the synthetic dungeon object — matches mob tier progression.
  // Mobs get slightly stronger per floor via getFloorScaling().
  getDungeonRankForFloor(floor) {
    if (floor <= 1)   return 'A';   // Cerberus floor (boss is S)
    if (floor <= 49)  return 'A';
    if (floor <= 74)  return 'S';
    if (floor <= 99)  return 'SS';
    return 'SSS';                   // Floor 100 (Baran is Monarch)
  },

  // Floor tier lookup
  getFloorTier(floor) {
    return this.FLOOR_TIER_MAP.find(t => floor >= t.minFloor && floor <= t.maxFloor) || this.FLOOR_TIER_MAP[0];
  },

  // Per-floor scaling — mobs get incrementally stronger within each tier.
  // Returns a multiplier 1.0 → ~1.5 across the tier range.
  // Floor 1 = 1.0x, floor 49 = ~1.48x, floor 50 = 1.0x (new tier resets), etc.
  getFloorScaling(floor) {
    const tier = this.getFloorTier(floor);
    const range = tier.maxFloor - tier.minFloor;
    if (range <= 0) return 1.0;
    const progress = (floor - tier.minFloor) / range; // 0.0 → 1.0 within tier
    return 1.0 + progress * 0.5; // 1.0x at tier start → 1.5x at tier end
  },

  // Entry Permit: exactly 1 needed per floor, drops from killing demons.
  // Drop rate = 0.01% per kill → ~10,000 kills avg before permit drops.
  // Guaranteed drop on the very last demon if none dropped yet.
  ENTRY_PERMIT_DROP_RATE: 0.0001,

  getPermitDropRate(_floor) {
    return this.ENTRY_PERMIT_DROP_RATE;
  },

  // Shadow deployment: DC takes 70% of army, reserving 30% for regular dungeons.
  // On boss floors, deploy 85% (bosses need more firepower).
  DEPLOY_FRACTION: 0.70,
  DEPLOY_FRACTION_BOSS: 0.85,

  getDeployFraction(floor) {
    return this.isBossFloor(floor) ? this.DEPLOY_FRACTION_BOSS : this.DEPLOY_FRACTION;
  },

  // XP multipliers — Demon Castle is THE xp farm (3x mobs, 5x bosses)
  XP_MOB_MULTIPLIER: 3.0,
  XP_BOSS_MULTIPLIER: 5.0,

  // Essence multiplier (demons give more essence than normal dungeon mobs)
  ESSENCE_MULTIPLIER: 2.0,

  // Boss floor numbers for quick lookup
  BOSS_FLOORS: [1, 50, 75, 100],

  isBossFloor(floor) {
    return this.BOSS_FLOORS.includes(floor);
  },

  // Default state for a new Demon Castle save
  DEFAULT_STATE: {
    currentFloor: 1,
    highestFloor: 1,
    floorsCleared: [],
    totalDemonsKilled: 0,
    totalDemonSouls: 0,
    totalPermitsEarned: 0,
    totalBossesDefeated: 0,
    startedAt: null,
    lastEnteredAt: null,
    lastClearedFloor: null,
    completedAt: null,       // timestamp when floor 100 is cleared
  },
};
