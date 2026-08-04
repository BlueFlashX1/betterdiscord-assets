/**
 * ShadowArmy — Shadow query, management, buffs.
 * Mixin: all methods assigned to ShadowArmy.prototype via Object.assign.
 */
const C = require('./constants');

module.exports = {
  // SHADOW QUERY & MANAGEMENT

  /**
   * Get all shadows from storage.
   * Decompresses transparently and updates snapshot cache.
   */
  async getAllShadows() {
    if (!this.storageManager) {
      return this.settings.shadows || [];
    }

    try {
      let shadows = await this.storageManager.getAllShadowsRaw();

      // HYBRID COMPRESSION: Decompress all shadows transparently
      if (shadows && shadows.length > 0) {
        shadows = shadows.map((s) => this.getShadowData(s));
      }

      // Update snapshot cache — cross-plugin consumers read this via getShadowSnapshot()
      this._updateSnapshot(shadows);

      return shadows;
    } catch (error) {
      this.debugError('STORAGE', 'Failed to get all shadows from IndexedDB', error);
      return this.settings.shadows || [];
    }
  },

  /**
   * Returns cached shadow snapshot if <2s old, null otherwise.
   * Cross-plugin consumers call this FIRST before falling back to getAllShadows().
   * @returns {Array|null} Cached shadow array or null if stale/missing
   */
  getShadowSnapshot() {
    if (this._snapshotCache && Date.now() - this._snapshotTimestamp < 2000) {
      return this._snapshotCache;
    }
    return null;
  },

  /**
   * Returns cached snapshot with relaxed 60s TTL for deployment use.
   * Deployment reads are large IDB operations — a slightly stale snapshot is
   * far better than blocking on IDB while self-heal is writing.
   * @returns {Array|null}
   */
  getShadowSnapshotForDeploy() {
    if (this._snapshotCache && this._snapshotCache.length > 0 &&
        Date.now() - this._snapshotTimestamp < 60000) {
      return this._snapshotCache;
    }
    return null;
  },

  /** @private */
  _updateSnapshot(shadows) {
    this._snapshotCache = shadows;
    this._snapshotTimestamp = Date.now();
  },

  /** @private */
  _invalidateSnapshot() {
    this._snapshotCache = null;
    this._snapshotTimestamp = 0;
  },

  // TOP GENERALS

  /**
   * Get top 7 generals (strongest shadows by total power).
   * Automatic selection — no manual favorites.
   * STALE-TOLERANT cache: STALE_OK_MS = 300000 (5 minutes), not a
   * per-tick cache. Deliberate — see the note in the body; re-walking
   * 281k records to re-pick the same 7 shadows was the cost being avoided.
   */
  async getTopGenerals() {
    try {
      const now = Date.now();
      const cacheKey = this.getArmyStatsCacheKey();
      // STALE-TOLERANT CACHE (2026-07-30). This used to re-walk whenever
      // cacheKey changed, with a 30s ceiling. getArmyStatsCacheKey encodes
      // {timestamp, count, version} of the total-power cache, so ANY extraction
      // or power delta changes it — and at ~60 messages/min that is constant.
      // Result: a full 281k-record walk roughly every 30s just to re-pick the
      // same 7 shadows. The profiler measured 20,831 IDB callbacks from this
      // path, 28% of all traffic in the suite.
      //
      // The key is a correct "did anything change" signal but the wrong
      // invalidation policy for THIS data: it is the top 7 of 281,000 by
      // strength, and a handful of freshly-extracted shadows are essentially
      // never among them. So a key change no longer forces an immediate
      // re-walk; it is allowed to serve a stale result up to STALE_OK_MS.
      //
      // Tradeoff, stated plainly: a newly-extracted shadow that genuinely
      // belongs in the top 7 can take up to 5 minutes to start contributing
      // buffs. That is worth ~12x fewer full-army walks. An unchanged key is
      // served for the same window, since nothing changed at all in that case.
      const STALE_OK_MS = 300000;
      if (
        this._topGeneralsCache &&
        this._topGeneralsCacheTime &&
        now - this._topGeneralsCacheTime < STALE_OK_MS
      ) {
        // Key retained for diagnostics//future finer-grained invalidation.
        this._topGeneralsCacheKey = cacheKey;
        return this._topGeneralsCache;
      }

      const TOP_K = 7;
      const top = [];

      const insertTop = (shadow, strength) => {
        if (!(strength > 0) || !shadow) return;
        if (top.length < TOP_K) {
          top.push({ shadow, strength });
          top.sort((a, b) => a.strength - b.strength);
          return;
        }
        if (strength <= top[0].strength) return;
        top[0] = { shadow, strength };
        top.sort((a, b) => a.strength - b.strength);
      };

      // PAGED (2026-07-30): was forEachShadowBatch, an openCursor walk that
      // fires one IDBRequest.onsuccess PER RECORD — measured at 89% of all
      // IDB request callbacks suite-wide and the dominant main-thread cost.
      // The paged variant reads ~500 records per request instead.
      // Safe: insertTop is a top-K-by-STRENGTH selection over the entire scan
      // with no early termination, so cursor order never affected the result —
      // the non-IDB fallback below iterates plain array order and yields the
      // same generals. The old sortBy:'extractedAt' was inert here.
      if (this.storageManager?.forEachShadowBatchPaged) {
        try {
          await this.storageManager.forEachShadowBatchPaged(
            (batch) => {
              for (let i = 0; i < batch.length; i++) {
                const sourceShadow = batch[i];
                const shadow = this.getShadowData(sourceShadow) || sourceShadow;
                const strength = this.calculateShadowPowerCached(sourceShadow, shadow);
                insertTop(shadow, strength);
              }
            },
            { batchSize: 500 }
          );
        } catch (error) {
          this.debugError('STORAGE', 'Failed to stream shadows for top generals', error);
        }
      } else {
        const shadows = this.settings.shadows || [];
        for (let i = 0; i < shadows.length; i++) {
          const sourceShadow = shadows[i];
          const shadow = this.getShadowData(sourceShadow) || sourceShadow;
          const strength = this.calculateShadowPowerCached(sourceShadow, shadow);
          insertTop(shadow, strength);
        }
      }

      top.sort((a, b) => b.strength - a.strength);
      const generals = top.map((x) => x.shadow);
      this._topGeneralsCache = generals;
      this._topGeneralsCacheKey = cacheKey;
      this._topGeneralsCacheTime = Date.now();
      return generals;
    } catch (error) {
      this.debugError('STORAGE', 'Error getting top generals', error);
      return [];
    }
  },

  // BUFF MODEL

  getShadowBuffModelConfig() {
    // PERF: lazy-init once. The config is pure constants — no setting modifies
    // it. Previously called 4× per buff recalculation, each call allocated
    // 1 outer object + 5 nested statSoftCaps objects. Freezing prevents
    // accidental mutation by callers (verified: no current caller mutates).
    if (!this._buffModelConfig) {
      this._buffModelConfig = Object.freeze({
        generalDuplicateDiminishStep: 0.22,
        roleMixPowerExponent: 0.5,
        roleMixBaseWeight: 0.08,
        aggregatedBuffScale: 0.01,
        aggregatedBuffPowerDivisor: 10000,
        aggregatedBaseBuffMax: 0.42,
        diversityMinRolePower: 500,
        diversityPerRoleBonus: 0.03,
        diversityMaxBonus: 0.18,
        statSoftCaps: Object.freeze({
          strength: Object.freeze({ soft: 0.5, hard: 0.72 }),
          agility: Object.freeze({ soft: 0.5, hard: 0.72 }),
          intelligence: Object.freeze({ soft: 0.54, hard: 0.76 }),
          vitality: Object.freeze({ soft: 0.56, hard: 0.8 }),
          perception: Object.freeze({ soft: 0.48, hard: 0.68 }),
        }),
        minBuff: -0.15,
      });
    }
    return this._buffModelConfig;
  },

  getRoleBuffWeightVector(roleKey) {
    const statKeys = C.STAT_KEYS;
    const role = this.shadowRoles?.[roleKey];
    const buffs = role?.buffs || null;
    const vector = this.createZeroStatsBucket(statKeys);

    if (!buffs) return vector;

    for (let i = 0; i < statKeys.length; i++) {
      const key = statKeys[i];
      const value = Number(buffs[key] || 0);
      if (value > 0) {
        vector[key] = value;
      }
    }

    return vector;
  },

  calculateRoleMixFromPowerMap(rolePowerMap) {
    const statKeys = C.STAT_KEYS;
    const config = this.getShadowBuffModelConfig();
    const safeMap = rolePowerMap && typeof rolePowerMap === 'object' ? rolePowerMap : {};
    const weightedTotals = this.createZeroStatsBucket(statKeys);
    let totalRoleWeight = 0;

    const entries = Object.entries(safeMap);
    for (let i = 0; i < entries.length; i++) {
      const [roleKey, powerValue] = entries[i];
      const power = Math.max(0, Number(powerValue) || 0);
      if (!(power > 0)) continue;

      const roleWeight = Math.pow(power, config.roleMixPowerExponent);
      const roleVector = this.getRoleBuffWeightVector(roleKey);
      totalRoleWeight += roleWeight;

      for (let j = 0; j < statKeys.length; j++) {
        const stat = statKeys[j];
        weightedTotals[stat] += roleWeight * (config.roleMixBaseWeight + (roleVector[stat] || 0));
      }
    }

    if (!(totalRoleWeight > 0)) {
      return {
        strength: 1,
        agility: 1,
        intelligence: 1,
        vitality: 1,
        perception: 1,
      };
    }

    const averages = this.createZeroStatsBucket(statKeys);
    let averageOfAverages = 0;
    for (let i = 0; i < statKeys.length; i++) {
      const stat = statKeys[i];
      averages[stat] = weightedTotals[stat] / totalRoleWeight;
      averageOfAverages += averages[stat];
    }
    averageOfAverages = averageOfAverages / statKeys.length;

    if (!(averageOfAverages > 0)) {
      return {
        strength: 1,
        agility: 1,
        intelligence: 1,
        vitality: 1,
        perception: 1,
      };
    }

    const mix = this.createZeroStatsBucket(statKeys);
    for (let i = 0; i < statKeys.length; i++) {
      const stat = statKeys[i];
      mix[stat] = averages[stat] / averageOfAverages;
    }
    return mix;
  },

  calculateShadowArmyDiversityMultiplier(rolePowerMap) {
    const config = this.getShadowBuffModelConfig();
    const entries = Object.entries(rolePowerMap || {});
    let activeRoles = 0;
    for (let i = 0; i < entries.length; i++) {
      const power = Math.max(0, Number(entries[i][1]) || 0);
      if (power >= config.diversityMinRolePower) {
        activeRoles++;
      }
    }

    if (activeRoles <= 1) return 1;
    const bonus = Math.min(
      config.diversityMaxBonus,
      (activeRoles - 1) * config.diversityPerRoleBonus
    );
    return 1 + bonus;
  },

  applyShadowBuffSoftCaps(buffs) {
    if (!buffs || typeof buffs !== 'object') return;

    const config = this.getShadowBuffModelConfig();
    const caps = config.statSoftCaps || {};
    const statKeys = C.STAT_KEYS;

    for (let i = 0; i < statKeys.length; i++) {
      const stat = statKeys[i];
      const rawValue = Number(buffs[stat] || 0);
      const cap = caps[stat];

      if (!cap) {
        buffs[stat] = Math.max(config.minBuff, rawValue);
        continue;
      }

      if (rawValue <= cap.soft) {
        buffs[stat] = Math.max(config.minBuff, rawValue);
        continue;
      }

      const gap = Math.max(0.0001, cap.hard - cap.soft);
      const overflow = rawValue - cap.soft;
      const compressed = cap.soft + gap * (1 - Math.exp(-overflow / gap));
      buffs[stat] = Math.max(config.minBuff, Math.min(cap.hard, compressed));
    }
  },

  // TOTAL BUFF CALCULATION

  /**
   * Calculate total buffs from all shadows.
   * Top 7 strongest (generals) preserve role identity; remaining army
   * contributes through role-weighted aggregation for scalable performance.
   */
  async calculateTotalBuffs() {
    const statKeys = C.STAT_KEYS;
    const config = this.getShadowBuffModelConfig();
    const buffs = {
      strength: 0,
      agility: 0,
      intelligence: 0,
      vitality: 0,
      perception: 0,
    };

    // Get top 7 generals (strongest shadows) - full buffs, no cap
    const generals = await this.getTopGenerals();
    const generalRoleCounts = {};
    const generalRolePowerMap = {};

    // Generals provide full role buffs with duplicate-role diminishing.
    generals.reduce((accBuffs, shadow) => {
      const decompressed = this.getShadowData(shadow) || shadow;
      const roleKey = decompressed?.role || decompressed?.roleName || null;
      if (!roleKey) return accBuffs;
      const role = this.shadowRoles[roleKey];
      if (!role || !role.buffs) return accBuffs;

      const roleCount = (generalRoleCounts[roleKey] || 0) + 1;
      generalRoleCounts[roleKey] = roleCount;
      const roleDiminish = 1 / (1 + config.generalDuplicateDiminishStep * (roleCount - 1));

      const effective = this.getShadowEffectiveStats(decompressed);
      const power = effective ? this.calculateShadowStrength(effective, 1) : 0;
      if (power > 0) {
        generalRolePowerMap[roleKey] = (generalRolePowerMap[roleKey] || 0) + power;
      }

      Object.keys(role.buffs).reduce((stats, stat) => {
        const amount = (role.buffs[stat] || 0) * roleDiminish;
        stats[stat] = (stats[stat] || 0) + amount;
        return stats;
      }, accBuffs);

      return accBuffs;
    }, buffs);

    // Role-weighted aggregation for non-general army.
    if (this.storageManager) {
      try {
        const armyStats = await this.getAggregatedArmyStats();
        const rolePowerMap = {};
        const roleEntries = Object.entries(armyStats?.byRole || {});
        for (let i = 0; i < roleEntries.length; i++) {
          const [roleKey, data] = roleEntries[i];
          const totalPower = Math.max(0, Number(data?.totalPower || 0));
          const generalPower = Math.max(0, Number(generalRolePowerMap[roleKey] || 0));
          const nonGeneralPower = Math.max(0, totalPower - generalPower);
          if (nonGeneralPower > 0) {
            rolePowerMap[roleKey] = nonGeneralPower;
          }
        }

        const totalRolePower = Object.values(rolePowerMap).reduce(
          (sum, value) => sum + (Number(value) || 0),
          0
        );

        if (totalRolePower > 0) {
          const baseAggregatedBuff = Math.sqrt(
            totalRolePower / config.aggregatedBuffPowerDivisor
          ) * config.aggregatedBuffScale;
          // Legion (SM perk): army-size buff scaling cap is lifted — Infinity army, infinite
          // scaling. For all other ranks the 0.42 hard-cap still applies.
          const isLegionActive = this.getSoloLevelingData?.()?.rank === 'Shadow Monarch';
          const cappedAggregatedBuff = isLegionActive
            ? baseAggregatedBuff
            : Math.min(config.aggregatedBaseBuffMax, baseAggregatedBuff);
          const roleMix = this.calculateRoleMixFromPowerMap(rolePowerMap);
          const diversityMultiplier = this.calculateShadowArmyDiversityMultiplier(rolePowerMap);

          for (let i = 0; i < statKeys.length; i++) {
            const stat = statKeys[i];
            const mixFactor = Math.max(0.4, Number(roleMix[stat] || 1));
            const weighted = cappedAggregatedBuff * mixFactor * diversityMultiplier;
            buffs[stat] = (buffs[stat] || 0) + weighted;
          }

          this.debugLog('BUFFS', 'Role-weighted army buffs applied', {
            generals: generals.length,
            totalRolePower,
            baseAggregatedBuff: Number(baseAggregatedBuff.toFixed(4)),
            cappedAggregatedBuff: Number(cappedAggregatedBuff.toFixed(4)),
            legion: isLegionActive,
            diversityMultiplier: Number(diversityMultiplier.toFixed(3)),
            roleMix,
          });
        }
      } catch (error) {
        this.debugError('STORAGE', 'Failed to calculate role-weighted buffs', error);
      }
    }

    if (buffs.perception == null) {
      buffs.perception = 0;
    }

    // Apply soft caps to prevent runaway scaling while preserving progression.
    this.applyShadowBuffSoftCaps(buffs);

    // Cache buffs for synchronous access by SoloLevelingStats
    this.cachedBuffs = buffs;
    this.cachedBuffsTime = Date.now();

    return buffs;
  },

  // ── MONARCH'S NAMING — "Arise, Igris." ─────────────────────────────────────
  // SHADOW MONARCH PERK: the Monarch names his generals. SM-only, and only for
  // top-grade shadows (Marshal / Grand Marshal — the generals). A named general
  // carries the Monarch's favor: +5% effective stats (getShadowEffectiveStats)
  // and appears BY NAME in dungeon/senses reporting. Persisted via the `cn`
  // compressed field so the name survives compression round-trips.
  async renameShadow(shadow, rawName) {
    try {
      if (this.getSoloLevelingData?.()?.rank !== 'Shadow Monarch') {
        this.showToast?.('Only the Shadow Monarch may name his generals.', 'error');
        return false;
      }
      const full = shadow && shadow._c ? this.decompressShadow(shadow) : shadow;
      const id = full?.id || full?.i;
      if (!id) return false;
      const grade = full.grade || 'Common';
      if (grade !== 'Marshal' && grade !== 'Grand Marshal') {
        this.showToast?.('Only Marshal-grade and above may receive a name.', 'warning');
        return false;
      }
      // Sanitize: strip control chars, collapse whitespace, cap length.
      // Empty clears the name.
      const name = String(rawName == null ? '' : rawName)
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 24);
      full.customName = name || null;
      const compressed = this.compressShadow(full) || full;
      await this.storageManager.saveShadow(compressed);
      this._invalidateSnapshot?.();
      this.showToast?.(
        name ? `"Arise, ${name}." — the Monarch has named a general.` : 'The general’s name has been withdrawn.',
        'success'
      );
      return true;
    } catch (error) {
      this.debugError?.('RENAME', 'Failed to name shadow', error);
      this.showToast?.('Naming failed — see console.', 'error');
      return false;
    }
  },
};
