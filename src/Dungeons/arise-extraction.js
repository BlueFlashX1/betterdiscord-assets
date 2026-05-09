const C = require('./constants');
const ARISE_SVG = C.ARISE_SVG;

module.exports = {
  _getAriseButton(channelKey, scope = null) {
    const cached = this._ariseButtonRefs?.get(channelKey);
    if (cached?.isConnected) return cached;
    if (cached) this._ariseButtonRefs?.delete(channelKey);

    const searchRoot =
      scope && typeof scope.querySelector === 'function' ? scope : document;
    const found = searchRoot.querySelector?.(`[data-arise-button="${channelKey}"]`) || null;
    if (found?.isConnected) {
      this._ariseButtonRefs?.set(channelKey, found);
      return found;
    }
    return null;
  },

  _removeAriseButton(channelKey) {
    const button = this._getAriseButton(channelKey);
    button?.remove();
    this._ariseButtonRefs?.delete(channelKey);
  },

  async showAriseButton(channelKey) {
    const bossData = this.defeatedBosses.get(channelKey);
    if (!bossData) return;

    // Shadow army cap gate: don't show ARISE if already at/over cap
    try {
      const shadowArmy = this.shadowArmy;
      if (shadowArmy && typeof shadowArmy.checkShadowArmyCap === 'function') {
        const capStatus = await shadowArmy.checkShadowArmyCap();
        if (capStatus.atCap) {
          this.debugLog('ARISE', `Suppressing ARISE button — shadow army at cap (${capStatus.currentCount}/${capStatus.cap})`);
          return;
        }
      }
    } catch (e) {
      this.debugLog('ARISE', 'Cap check failed, showing button anyway', e?.message);
    }

    const channelHeader = this.findChannelHeader();
    if (!channelHeader?.isConnected) return;

    // Prefer cached ref/local header lookup to avoid global document scans.
    const existing = this._getAriseButton(channelKey, channelHeader);
    if (existing) return;
    channelHeader
      .querySelectorAll?.('.dungeon-arise-button:not([data-arise-button])')
      .forEach((btn) => btn.remove());

    // Create ARISE button
    const ariseBtn = document.createElement('button');
    ariseBtn.className = 'dungeon-arise-button';
    ariseBtn.setAttribute('data-arise-button', channelKey);
    ariseBtn.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 20px; font-weight: bold;">↑</span>
        <div>
          <div style="font-weight: bold;">ARISE</div>
          <div style="font-size: 11px; opacity: 0.8;">${bossData.boss.name}</div>
        </div>
      </div>
    `;
    ariseBtn.style.cssText = `
      position: relative;
      display: flex;
      align-items: center;
      gap: 8px;
      background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
      color: white;
      border: 2px solid #a78bfa;
      border-radius: 2px;
      padding: 12px 20px;
      font-family: 'Orbitron', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);
      transition: all 0.3s ease;
      animation: pulse-glow 2s ease-in-out infinite;
      margin-left: 12px;
    `;

    // Final safety check — parent may have been replaced during setup
    if (!channelHeader.isConnected) return;
    channelHeader.appendChild(ariseBtn);
    // PERF: Cache ref so combat loop uses .isConnected instead of document.querySelector
    this._ariseButtonRefs?.set(channelKey, ariseBtn);
  },

  async attemptBossExtraction(channelKey) {
    // SkillTree gate: shadow_extraction must be unlocked
    const skillTree = this.getSkillTreeInstance?.();
    if (!skillTree || typeof skillTree.getSkillLevel !== 'function' || !(Number(skillTree.getSkillLevel('shadow_extraction')) >= 1)) {
      this.showToast('Shadow Extraction skill not unlocked. Unlock it in the Skill Tree.', 'error');
      return;
    }

    // Mutex: block concurrent extraction on same channel
    if (this.extractionInProgress.has(channelKey)) return;

    const bossData = this.defeatedBosses.get(channelKey);
    if (!bossData) {
      this.showToast('Boss corpse has degraded. Extraction no longer possible.', 'error');
      return;
    }

    // Generate unique boss ID early so we can guard against duplicate arise
    const bossName = bossData.boss?.name;
    if (!bossName) {
      this.errorLog('Boss has no name — skipping extraction to prevent undefined arise', bossData.boss);
      this.showToast('Boss data corrupted — cannot extract.', 'error');
      this._removeAriseButton(channelKey);
      this.defeatedBosses.delete(channelKey);
      return;
    }
    const bossId = `dungeon_${bossData.dungeon.id}_boss_${bossName
      .toLowerCase()
      .replace(/\s+/g, '_')}`;

    // Guard: prevent arising a boss that was already successfully extracted
    if (this._arisedBossIds.has(bossId)) {
      this.showToast('Shadow already extracted from this boss.', 'info');
      return;
    }

    // Lock extraction for this channel
    this.extractionInProgress.add(channelKey);

    if (!this.shadowArmy) {
      this.extractionInProgress.delete(channelKey);
      this.showToast('Shadow Army plugin not found. Cannot extract shadow.', 'error');
      return;
    }

    // Get user data from SoloLevelingStats
    if (!this.soloLevelingStats) {
      this.extractionInProgress.delete(channelKey);
      this.showToast('Solo Leveling Stats plugin not found. Cannot extract shadow.', 'error');
      return;
    }

    const userStats = this.soloLevelingStats.settings?.stats || {};
    const userRank = this.soloLevelingStats.settings?.rank || 'E';
    const userLevel = this.soloLevelingStats.settings?.level || 1;

    // SHADOW-COMPATIBLE BOSS STATS
    // Use baseStats structure if available (for mobs), otherwise construct from boss properties
    const mobStats = bossData.boss.baseStats || {
      strength: bossData.boss.strength,
      agility: bossData.boss.agility,
      intelligence: bossData.boss.intelligence,
      vitality: bossData.boss.vitality,
      perception:
        Number.isFinite(bossData.boss.perception) && bossData.boss.perception > 0
          ? bossData.boss.perception
          : 50, // Default perception if not present
    };
    const mobStrength = mobStats.strength;
    const mobRank = bossData.boss.rank || bossData.dungeon.rank;

    // Show extraction attempt message
    this.showToast(`Attempting shadow extraction from ${bossData.boss.name}...`, 'info');

    try {
      // Call ShadowArmy's attemptDungeonExtraction with isBoss=true (3 attempts for bosses)
      // The mob's stats will be transferred directly to shadow.baseStats
      const result = await this.shadowArmy.attemptDungeonExtraction(
        bossId,
        userRank,
        userLevel,
        userStats,
        mobRank,
        mobStats,
        mobStrength,
        bossData.dungeon.beastFamilies, // Pass biome families for themed extraction
        true // isBoss=true: Bosses get 3 extraction attempts (worth retrying)
      );

      const extractionStatus =
        result.success && result.shadow ? 'success' : result.error ? 'error' : 'fail';
      const extractionHandlers = {
        success: async () => {
          // Mark boss as arose — permanently blocks re-extraction
          this._arisedBossIds.add(bossId);
          // Immediately remove from defeatedBosses to prevent the combat loop's
          // UI guard (needsUiGuard) from re-creating the ARISE button during cleanup delay.
          this.defeatedBosses.delete(channelKey);
          this._removeAriseButton(channelKey);
          // Use ShadowArmy's SVG ARISE animation if available, fallback to Dungeons overlay
          const sa = this.shadowArmy;
          if (sa?.triggerArise && sa?.settings?.ariseAnimation?.enabled) {
            sa.triggerArise(result.shadow);
          } else {
            this.showAriseSuccessAnimation(result.shadow, bossData.boss);
          }
          this.showToast(`ARISE! \"${result.shadow.roleName || result.shadow.role}\" extracted!`, 'success');
          await this.recalculateUserMana();
        },
        error: () => {
          this.showAriseFailAnimation(bossData.boss, result.error);
          this.showToast(`${result.error}`, 'error');
        },
        fail: () => {
          this.showAriseFailAnimation(bossData.boss, 'Extraction failed');
          this.showToast(`Extraction failed. (${result.attemptsRemaining} left)`, 'error');
        },
      };
      await (extractionHandlers[extractionStatus] || extractionHandlers.fail)();

      // If no attempts remaining or success, cleanup the arise button
      if (result.attemptsRemaining === 0 || result.success) {
        this._setTrackedTimeout(() => this.cleanupDefeatedBoss(channelKey), 3000);
      } else {
        // Failed but has attempts remaining — re-enable button for retry
        this._reEnableAriseButton(channelKey);
      }
    } catch (error) {
      this.errorLog('Failed to extract shadow', error);
      this.showToast('Extraction failed due to an error', 'error');
      this.showAriseFailAnimation(bossData.boss, 'System error');
      // Re-enable on system error so user can retry
      this._reEnableAriseButton(channelKey);
    } finally {
      // Always release mutex so next click can enter
      this.extractionInProgress.delete(channelKey);
    }
  },

  _reEnableAriseButton(channelKey) {
    const ariseBtn = this._getAriseButton(channelKey);
    if (ariseBtn?.isConnected) {
      ariseBtn.dataset.ariseDisabled = 'false';
      ariseBtn.style.opacity = '1';
      ariseBtn.style.pointerEvents = 'auto';
      ariseBtn.style.cursor = 'pointer';
    }
  },

  showAriseSuccessAnimation(shadow, enemy) {
    // Create fullscreen overlay
    const overlay = document.createElement('div');
    overlay.className = 'arise-animation-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.9);
      z-index: 99999;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      animation: arise-fade-in 0.5s ease;
      pointer-events: none;
    `;

    const container = document.createElement('div');
    container.style.cssText = 'text-align: center; animation: arise-rise 1s ease-out;';

    const arrow = document.createElement('div');
    arrow.style.cssText =
      'font-size: 80px; margin-bottom: 20px; animation: arise-glow 1.5s ease-in-out infinite; font-weight: bold;';
    arrow.textContent = '↑';

    const title = document.createElement('div');
    let _ariseSvgOk = false;
    try {
      // Hand-drawn ARISE SVG — parse via DOMParser for proper SVG namespace
      const _svgStr = (typeof ARISE_SVG === 'string') ? ARISE_SVG : null;
      if (!_svgStr) throw new Error('ARISE_SVG constant not in scope');
      const parser = new DOMParser();
      const svgDoc = parser.parseFromString(_svgStr, 'image/svg+xml');
      const parseErr = svgDoc.querySelector('parsererror');
      if (parseErr) throw new Error('SVG parse error: ' + parseErr.textContent);
      const svgEl = svgDoc.documentElement;
      if (!svgEl || svgEl.tagName !== 'svg') throw new Error('No <svg> root');
      // Container: relative so we can layer glow behind the crisp SVG
      title.style.cssText = 'margin-bottom: 12px !important; text-align: center !important; position: relative !important;';
      // Glow layer — blurred clone sits behind
      const glowSvg = document.importNode(svgEl, true);
      glowSvg.style.cssText = 'height: 180px !important; width: auto !important; position: absolute !important; top: 0 !important; left: 50% !important; transform: translateX(-50%) !important; filter: blur(18px) brightness(1.5) !important; opacity: 0.7 !important; pointer-events: none !important; z-index: 0 !important;';
      title.appendChild(glowSvg);
      // Crisp SVG on top — no filter, clean edges
      const mainSvg = document.importNode(svgEl, true);
      mainSvg.style.cssText = 'height: 180px !important; width: auto !important; display: inline-block !important; position: relative !important; z-index: 1 !important;';
      title.appendChild(mainSvg);
      _ariseSvgOk = true;
    } catch (e) {
      this.errorLog('UI', 'ARISE SVG failed, using text fallback', e?.message || e);
    }
    if (!_ariseSvgOk) {
      // Fallback: plain text
      title.innerHTML = '';
      title.style.cssText =
        'font-size: 48px; font-weight: bold; color: #a78bfa; margin-bottom: 12px; text-shadow: 0 0 20px #8b5cf6;';
      title.textContent = 'ARISE';
    }

    const shadowName = document.createElement('div');
    shadowName.style.cssText = 'font-size: 32px; color: white; margin-bottom: 8px;';
    shadowName.textContent = shadow?.roleName || shadow?.role || '';

    const shadowRank = document.createElement('div');
    shadowRank.style.cssText = 'font-size: 20px; color: #a78bfa; margin-bottom: 4px;';
    shadowRank.textContent = `${shadow?.rank ?? ''} Rank ${shadow?.role ?? ''}`.trim();

    const extractedInfo = document.createElement('div');
    extractedInfo.style.cssText = 'font-size: 16px; color: #888;';
    extractedInfo.textContent = `Extracted from ${enemy?.name ?? ''} [${enemy?.rank ?? ''}]`.trim();

    container.appendChild(arrow);
    container.appendChild(title);
    container.appendChild(shadowName);
    container.appendChild(shadowRank);
    container.appendChild(extractedInfo);
    overlay.appendChild(container);

    document.body.appendChild(overlay);

    // Auto-remove after 2.5 seconds (quicker for mobs)
    this._setTrackedTimeout(() => {
      if (!this.started) return;
      overlay.style.animation = 'arise-fade-out 0.5s ease';
      this._setTrackedTimeout(() => {
        if (!this.started) return;
        overlay.remove();
      }, 500);
    }, 2500);
    // Hard fail-safe removal in case animation timers fail
    this._setTrackedTimeout(() => {
      if (!this.started) return;
      overlay.remove();
    }, 4000);
  },

  showAriseFailAnimation(boss, reason) {
    // Create fullscreen overlay
    const overlay = document.createElement('div');
    overlay.className = 'arise-fail-animation-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.9);
      z-index: 99999;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      animation: arise-fade-in 0.5s ease;
      pointer-events: none;
    `;

    const failContainer = document.createElement('div');
    failContainer.style.cssText = 'text-align: center; animation: arise-shake 0.5s ease;';

    const failIcon = document.createElement('div');
    failIcon.style.cssText =
      'font-size: 80px; margin-bottom: 20px; filter: grayscale(100%); font-weight: bold;';
    failIcon.textContent = '✕';

    const failTitle = document.createElement('div');
    failTitle.style.cssText =
      'font-size: 48px; font-weight: bold; color: #ef4444; margin-bottom: 12px; text-shadow: 0 0 20px #dc2626;';
    failTitle.textContent = 'EXTRACTION FAILED';

    const bossName = document.createElement('div');
    bossName.style.cssText = 'font-size: 24px; color: white; margin-bottom: 8px;';
    bossName.textContent = boss?.name ?? '';

    const failReason = document.createElement('div');
    failReason.style.cssText = 'font-size: 16px; color: #888;';
    failReason.textContent = reason ?? '';

    failContainer.appendChild(failIcon);
    failContainer.appendChild(failTitle);
    failContainer.appendChild(bossName);
    failContainer.appendChild(failReason);
    overlay.appendChild(failContainer);

    document.body.appendChild(overlay);

    // Auto-remove after 2 seconds
    this._setTrackedTimeout(() => {
      if (!this.started) return;
      overlay.style.animation = 'arise-fade-out 0.5s ease';
      this._setTrackedTimeout(() => {
        if (!this.started) return;
        overlay.remove();
      }, 500);
    }, 2000);
    // Hard fail-safe removal in case animation timers fail
    this._setTrackedTimeout(() => {
      if (!this.started) return;
      overlay.remove();
    }, 3500);
  },

  async cleanupDefeatedBoss(channelKey) {
    this._removeAriseButton(channelKey);

    const bossData = this.defeatedBosses.get(channelKey);
    const currentDungeon = this.activeDungeons.get(channelKey);
    const newDungeonStarted =
      Boolean(currentDungeon && bossData?.dungeonId && currentDungeon.id !== bossData.dungeonId);

    // INTEGRITY-7: Remove ARISE block for this channel's boss to prevent collisions with future dungeon runs.
    // Must reconstruct the same bossId key used in attemptBossExtraction (dungeon_<id>_boss_<name>).
    if (bossData?.boss?.name && bossData?.dungeon?.id && this._arisedBossIds) {
      const bossId = `dungeon_${bossData.dungeon.id}_boss_${bossData.boss.name
        .toLowerCase().replace(/\s+/g, '_')}`;
      this._arisedBossIds.delete(bossId);
    }
    this.defeatedBosses.delete(channelKey);
    this.extractionInProgress.delete(channelKey); // Clear stale mutex if any

    // If a new dungeon already started in this channel, avoid wiping channel-keyed runtime state.
    if (newDungeonStarted) {
      this.debugLog(
        `cleanupDefeatedBoss: preserving active state for new dungeon ${currentDungeon.id} in ${channelKey}`
      );
      this.queueHPBarUpdate?.(channelKey);
      this.saveSettings();
      return;
    }

    if (this.storageManager) {
      try {
        await this.storageManager.deleteDungeon(channelKey);
      } catch (error) {
        this.errorLog('Failed to delete dungeon from storage', error);
      }
    }

    // Track end time for spawn cooldowns (ARISE cleanup path).
    this.settings.lastDungeonEndTime || (this.settings.lastDungeonEndTime = {});
    this.settings.lastDungeonEndTime[channelKey] = Date.now();

    // Stop combat/runtime loops for this channel now (don't wait for lazy self-heal in loop ticks).
    this.stopShadowAttacks(channelKey);
    this.stopBossAttacks(channelKey);
    this.stopMobAttacks(channelKey);
    this.stopMobKillNotifications(channelKey);
    this.stopMobSpawning(channelKey);

    // Remove UI artifacts tied to this channel
    this.removeDungeonIndicator(channelKey);
    this.removeBossHPBar(channelKey);
    document
      .querySelectorAll(`.dungeon-boss-hp-container[data-channel-key="${channelKey}"]`)
      .forEach((el) => el.remove());

    // Clear all channel-keyed state now that no active dungeon remains for this key.
    this.activeDungeons.delete(channelKey);
    this.channelLocks.delete(channelKey);
    this.shadowAllocations.delete(channelKey);
    this._markAllocationDirty('dungeon-arise-cleanup');
    this._cleanupPerChannelRuntimeState(channelKey);

    this.saveSettings();

    // Dungeon cleanup complete (silent)
  },

  async grantShadowDungeonXP(channelKey, dungeon) {
    if (!this.shadowArmy) return null;

    const contributions = dungeon.shadowContributions || {};
    const contributionEntries = Object.entries(contributions).filter(([, contribution]) => {
      const mobsKilled = Number(contribution?.mobsKilled) || 0;
      const bossDamage = Number(contribution?.bossDamage) || 0;
      return mobsKilled > 0 || bossDamage > 0;
    });
    if (contributionEntries.length === 0) return null;

    // Get dungeon rank multiplier (higher rank = more XP)
    const dungeonRankIndex = this.getRankIndexValue(dungeon.rank);
    const dungeonRankMultiplier = 1.0 + dungeonRankIndex * 0.5; // E=1.0, D=1.5, SSS=4.5, etc.

    // Base XP rewards
    const baseMobXP = 10; // Base XP per mob kill
    const baseBossXP = 100; // Base XP for full boss kill

    // Fetch only shadows that actually contributed in this dungeon.
    const contributionShadowIds = contributionEntries.map(([shadowId]) => String(shadowId));
    const allShadows = await this._fetchDungeonShadowsByIds(contributionShadowIds);
    const shadowMap = new Map(
      allShadows
        .map((s) => [String(this.getShadowIdValue(s) || ''), s])
        .filter(([id]) => !!id)
    );

    let totalXPGranted = 0;
    // Track before-state for level/rank change detection after batch processing
    const beforeStates = new Map(); // shadowId -> { level, rank }
    const xpByShadowId = {}; // shadowId -> xp
    const rawContributionByShadowId = {}; // shadowId -> pre-multiplier participation score

    // Combat-window duration only (lore): ignore pre-deploy idle time.
    const combatStartAt =
      dungeon?.bossGate?.deployedAt ||
      dungeon?.deployedAt ||
      dungeon?.startTime ||
      Date.now();
    const combatDuration = Math.max(0, Date.now() - combatStartAt);
    const combatHours = combatDuration / (1000 * 60 * 60);

    // Process shadow contributions (functional approach)
    for (const [rawShadowId, contribution] of contributionEntries) {
      const shadowId = String(rawShadowId);
      const shadow = shadowMap.get(shadowId);
      if (!shadow) continue;

      // Get shadow rank multiplier (higher rank shadows get more XP)
      const shadowRank = shadow.rank || 'E';
      const shadowRanks = this.shadowArmy.shadowRanks || [
        'E',
        'D',
        'C',
        'B',
        'A',
        'S',
        'SS',
        'SSS',
        'SSS+',
        'NH',
        'Monarch',
        'Monarch+',
        'Shadow Monarch',
      ];
      const shadowRankIndex = shadowRanks.indexOf(shadowRank);
      const shadowRankMultiplier = 1.0 + shadowRankIndex * 0.3; // E=1.0, D=1.3, SSS=2.4, etc.

      const mobsKilled = Number(contribution?.mobsKilled) || 0;
      const bossDamage = Number(contribution?.bossDamage) || 0;

      // Calculate mob kill XP
      const mobKillXP = mobsKilled * baseMobXP;

      // Calculate boss damage XP (proportional to damage dealt)
      const bossMaxHP = dungeon.boss?.maxHp || dungeon.boss?.hp || 1000;
      const bossDamagePercent = Math.min(1.0, bossDamage / bossMaxHP);
      const bossDamageXP = bossDamagePercent * baseBossXP;
      const rawContribution = mobKillXP + bossDamageXP;

      // Total XP = (mob kills + boss damage) * dungeon rank * shadow rank (capped at 100k per shadow)
      const totalXP = Math.min(100000, Math.round(
        (mobKillXP + bossDamageXP) * dungeonRankMultiplier * shadowRankMultiplier
      ));

      if (totalXP > 0) {
        // Record before-state for level/rank change detection
        beforeStates.set(shadowId, {
          level: shadow.level || 1,
          rank: shadow.rank,
          name: shadow.roleName || shadow.role || shadow.name || 'Shadow',
        });

        xpByShadowId[shadowId] = totalXP;
        rawContributionByShadowId[shadowId] = rawContribution;
        totalXPGranted += totalXP;
      }
    }

    const xpTargetIds = Object.keys(xpByShadowId);
    const growthHoursByShadowId = {};
    const maxRawContribution = Math.max(
      0,
      ...xpTargetIds.map((sid) => Number(rawContributionByShadowId[sid]) || 0)
    );
    for (const sid of xpTargetIds) {
      if (combatHours <= 0 || maxRawContribution <= 0) {
        growthHoursByShadowId[sid] = 0;
        continue;
      }
      // Participation-weighted growth: top contributor gets full combat window,
      // lower contributors still get minimum growth if they participated.
      const ratio = (Number(rawContributionByShadowId[sid]) || 0) / maxRawContribution;
      const participationFactor = Math.max(0.15, Math.min(1, ratio));
      growthHoursByShadowId[sid] = combatHours * participationFactor;
    }

    if (xpTargetIds.length === 0) {
      return {
        totalXP: 0,
        leveledUp: [],
        rankedUp: [],
      };
    }

    const grantStartedAt = Date.now();
    let xpGrantSucceeded = false;
    let postXpShadows = [];

    // One XP batch grant for all contributing shadows (avoids repeated full-table scans).
    try {
      const xpResult = await this.shadowArmy.grantShadowXP(
        0,
        `dungeon_${dungeon.rank}_${channelKey}`,
        xpTargetIds,
        {
          perShadowAmounts: xpByShadowId,
          skipPowerRecalc: true,
        }
      );
      xpGrantSucceeded = true;
      postXpShadows = xpResult?.updatedShadows || [];
    } catch (err) {
      this.errorLog('Failed to grant dungeon shadow XP batch', err);
    }

    if (!xpGrantSucceeded) {
      return {
        totalXP: 0,
        leveledUp: [],
        rankedUp: [],
        deferredPostProcess: false,
      };
    }

    const deferredPostProcess = this._queueDeferredDungeonXpPostProcess({
      channelKey,
      dungeonName: dungeon?.name,
      dungeonRank: dungeon?.rank,
      xpTargetIds,
      beforeStatesEntries: Array.from(beforeStates.entries()),
      combatHours,
      growthHoursByShadowId,
      postXpShadows,
    });

    const elapsedMs = Date.now() - grantStartedAt;
    this.settings.debug && console.log(
      `[Dungeons] ⏱️ SHADOW XP GRANT: "${dungeon?.name || channelKey}" [${dungeon?.rank || '?'}] | ` +
      `targets=${xpTargetIds.length} | totalXP=${totalXPGranted.toLocaleString()} | ` +
      `deferred=${deferredPostProcess} | ${elapsedMs}ms`
    );

    return {
      totalXP: totalXPGranted,
      leveledUp: [],
      rankedUp: [],
      deferredPostProcess,
    };
  }
};
