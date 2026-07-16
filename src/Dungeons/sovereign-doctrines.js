/**
 * SOVEREIGN DOCTRINES — unique per-species Grand Marshal battlefield abilities.
 *
 * Each species' fielded Grand Marshal grants its own troops a SIGNATURE
 * doctrine (not a shared multiplier). Effects are expressed through a small
 * set of engine primitives so the warfront stays O(1) per tick:
 *
 *   killMult          – aggregate war output multiplier for led troops
 *   casualtyMult      – aggregate casualty-weight multiplier (lower = safer)
 *   frontlineDmg      – per-hit bonus for led shadows in the object sim
 *   bossDmgMult       – per-hit bonus for led shadows vs the BOSS only
 *   comboRamp/comboMax– stacking kill bonus per consecutive fighting tick
 *   executeBonus      – bonus kills once the host is wounded (<50% reserves)
 *   reflectPct        – share of led casualties dealt back as host kills
 *   burnAttrition     – share of this tick's kills that linger as DoT kills next tick
 *   bossSlow          – slows the boss's attack cadence while fielded
 *   healBoost         – raises the healer-restoration fraction
 *   essenceBonus      – extra essence (kill-equivalents) from led kills
 *
 * Doctrine keys match the species key (beastFamily || beastType || role).
 */
const SPECIES_DOCTRINES = Object.freeze({
  // ── Humanoid classes ────────────────────────────────────────────────────────
  knight:    { name: "Igris's Discipline",    killMult: 1.10, casualtyMult: 0.80, frontlineDmg: 0.10 },
  tank:      { name: 'Aegis Riposte',         casualtyMult: 0.85, reflectPct: 0.50 },
  healer:    { name: "Beru's Grace",          casualtyMult: 0.75, healBoost: 0.50 },
  support:   { name: 'Battle Hymns',          killMult: 1.08, casualtyMult: 0.85, healBoost: 0.25 },
  mage:      { name: 'Hellfire Doctrine',     killMult: 1.15, bossDmgMult: 1.15 },
  assassin:  { name: "Death's Whisper",       executeBonus: 0.35, frontlineDmg: 0.15 },
  ranger:    { name: 'Marked Quarry',         killMult: 1.05, executeBonus: 0.50 },
  berserker: { name: 'Bloodrage',             killMult: 1.30, casualtyMult: 1.15 },
  // ── Beast lines ─────────────────────────────────────────────────────────────
  ant:       { name: 'Devouring Swarm',       killMult: 1.15, comboRamp: 0.03, comboMax: 0.30 },
  bear:      { name: "Alpha's Maul",          killMult: 1.10, frontlineDmg: 0.20 },
  wolf:      { name: 'Pack Momentum',         comboRamp: 0.05, comboMax: 0.50 },
  spider:    { name: "Broodmother's Web",     casualtyMult: 0.85, executeBonus: 0.20 },
  centipede: { name: 'Hundred-Fang Venom',    burnAttrition: 0.15 },
  golem:     { name: 'Immovable Taunt',       casualtyMult: 0.40, killMult: 0.95 },
  serpent:   { name: "Constrictor's Coils",   killMult: 1.05, bossSlow: 0.10 },
  naga:      { name: 'Tidal Hexes',           killMult: 1.10, bossDmgMult: 1.10 },
  wyvern:    { name: 'Skyfire',               burnAttrition: 0.25 },
  dragon:    { name: 'Dragonfire Tempest',    burnAttrition: 0.20, bossDmgMult: 1.20 },
  titan:     { name: 'Seismic March',         killMult: 1.20, casualtyMult: 0.90 },
  giant:     { name: 'Crushing Stride',       killMult: 1.20 },
  elf:       { name: 'Ancient Volley',        bossDmgMult: 1.10, essenceBonus: 0.20 },
  demon:     { name: 'Infernal Pact',         killMult: 1.20, burnAttrition: 0.10 },
  ghoul:     { name: 'Carrion Feast',         killMult: 1.05, essenceBonus: 0.30 },
  orc:       { name: "Warchief's Roar",       killMult: 1.15, frontlineDmg: 0.10 },
  ogre:      { name: 'Brute Rampage',         frontlineDmg: 0.25 },
  yeti:      { name: 'Glacial Dominion',      casualtyMult: 0.60, bossSlow: 0.20 },
});

// Fallback for species without a bespoke doctrine (unknown beast types):
// classic offense/defense by archetype.
const FALLBACK_OFFENSE = Object.freeze({ name: "Sovereign's Command", killMult: 1.20 });
const FALLBACK_DEFENSE = Object.freeze({ name: "Sovereign's Ward", casualtyMult: 0.60 });

module.exports = {
  SPECIES_DOCTRINES,

  _getSovereignDoctrine(speciesKey, gmShadow) {
    const doctrine = SPECIES_DOCTRINES[String(speciesKey || '').toLowerCase()];
    if (doctrine) return doctrine;
    const archetype = this._getShadowArchetypeForRole
      ? this._getShadowArchetypeForRole(gmShadow)
      : 'balanced';
    return archetype === 'tank' || archetype === 'support' ? FALLBACK_DEFENSE : FALLBACK_OFFENSE;
  },

  // Combine every fielded sovereign's doctrine into the tick's aggregate war
  // modifiers, weighted by each led species' share of the army. Also advances
  // per-war doctrine state (combo stacks, burn pool) kept on dungeon.war.
  // Pure arithmetic over intel.leaders — O(species), not O(army).
  _combineSovereignDoctrines(dungeon, intel, hostWounded) {
    const out = {
      killMult: 1,
      casualtyMult: 1,
      executeBonus: 0,
      reflectPct: 0,
      burnAttrition: 0,
      essenceBonus: 0,
      bossSlow: 0,
      healBoost: 0,
      names: [],
    };
    if (!intel || !intel.leaders || intel.total <= 0) return out;
    if (!dungeon.war._doctrine) dungeon.war._doctrine = { combo: {}, burnPool: 0 };
    const state = dungeon.war._doctrine;

    for (const [species, led] of Object.entries(intel.leaders)) {
      const d = led.doctrine;
      if (!d) continue;
      const share = (intel.speciesTroops[species] || 0) / intel.total;
      if (!(share > 0)) continue;
      out.names.push(d.name);

      // Combo ramp: stacks while the war rages (advanced once per tick below).
      let killMult = d.killMult || 1;
      if (d.comboRamp) {
        const stacks = state.combo[species] || 0;
        killMult *= 1 + Math.min(d.comboMax || 0.5, stacks * d.comboRamp);
      }
      out.killMult *= 1 + (killMult - 1) * share;

      if (d.casualtyMult) out.casualtyMult *= 1 + (d.casualtyMult - 1) * share;
      if (d.executeBonus && hostWounded) out.executeBonus += d.executeBonus * share;
      if (d.reflectPct) out.reflectPct += d.reflectPct * share;
      if (d.burnAttrition) out.burnAttrition += d.burnAttrition * share;
      if (d.essenceBonus) out.essenceBonus += d.essenceBonus * share;
      // Presence-based (not share-scaled): the sovereign itself binds/slows.
      if (d.bossSlow) out.bossSlow = Math.max(out.bossSlow, d.bossSlow);
      if (d.healBoost) out.healBoost = Math.max(out.healBoost, d.healBoost);
    }
    // Expose boss slow for the boss-cadence hook (combat-boss-mob).
    dungeon.war._sovereignBossSlow = out.bossSlow;
    dungeon.war._sovereignHealBoost = out.healBoost;
    return out;
  },

  _advanceDoctrineState(dungeon, intel, kills) {
    const state = dungeon.war?._doctrine;
    if (!state) return;
    for (const [species, led] of Object.entries(intel.leaders || {})) {
      if (!led.doctrine?.comboRamp) continue;
      state.combo[species] = kills > 0 ? (state.combo[species] || 0) + 1 : 0;
    }
  },
};
