const DC = require('./story-constants');

module.exports = {
  // Story tab: list of available story modes
  _getStoryModeTabHtml() {
    const state = this._demonCastle;
    if (!state) {
      return '<div style="padding:20px;text-align:center;color:rgba(255,255,255,0.35);font-size:12px;">Story mode initializing...</div>';
    }

    const floor = state.currentFloor || 1;
    const cleared = state.floorsCleared?.length || 0;
    const isCompleted = Boolean(state.completedAt);
    const isActive = this._storyModeActive;
    const progressPct = Math.min(100, ((floor - 1) / DC.DEMON_CASTLE_FLOORS * 100)).toFixed(1);

    let statusBadge;
    if (isActive) {
      statusBadge = '<span style="font-size:10px;font-weight:700;background:rgba(255,107,53,0.2);color:#ff6b35;padding:2px 8px;border-radius:10px;border:1px solid rgba(255,107,53,0.35);">IN PROGRESS</span>';
    } else if (isCompleted) {
      statusBadge = '<span style="font-size:10px;font-weight:700;background:rgba(251,191,36,0.15);color:#fbbf24;padding:2px 8px;border-radius:10px;border:1px solid rgba(251,191,36,0.3);">CLEARED</span>';
    } else if (floor > 1) {
      statusBadge = `<span style="font-size:10px;font-weight:700;background:rgba(52,211,153,0.15);color:#34d399;padding:2px 8px;border-radius:10px;border:1px solid rgba(52,211,153,0.3);">Floor ${floor}</span>`;
    } else {
      statusBadge = '<span style="font-size:10px;font-weight:700;background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.45);padding:2px 8px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);">NEW</span>';
    }

    return `
      <div style="padding:12px 14px 16px;">
        <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.35);margin:0 0 8px;padding:0 2px;">Available Modes</div>

        <button class="dungeon-widget-action story-mode-list-card" type="button"
                data-dungeon-action="story-detail-dc" data-channel-key="_story"
                style="display:flex !important;align-items:center;gap:12px;width:100%;padding:14px;
                       background:rgba(255,107,53,0.05);border:1px solid rgba(255,107,53,0.18);
                       border-radius:10px;cursor:pointer;text-align:left;
                       transition:transform 0.15s ease,background 0.15s ease,border-color 0.15s ease,box-shadow 0.15s ease;">
          <span style="font-size:32px;line-height:1;flex-shrink:0;">&#x1F3F0;</span>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;">
              <span style="color:#ff9f43;font-size:14px;font-weight:700;">Demon Castle</span>
              ${statusBadge}
            </div>
            <div style="color:rgba(255,255,255,0.38);font-size:10px;margin-bottom:6px;">
              Kandiaru&#x27;s Trial &mdash; 100 Floors &bull; ${cleared} cleared
            </div>
            <div style="background:rgba(255,255,255,0.06);border-radius:3px;height:4px;overflow:hidden;">
              <div style="height:100%;background:linear-gradient(90deg,#dc3545,#ff6b35,#ff9f43);border-radius:3px;width:${progressPct}%;transition:width 0.4s;"></div>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex-shrink:0;">
            <span style="color:#f2f3f5;font-size:14px;font-weight:700;">${floor}</span>
            <span style="color:rgba(255,255,255,0.35);font-size:10px;">${progressPct}%</span>
            <span style="color:rgba(255,255,255,0.3);font-size:18px;margin-top:2px;">&#x276F;</span>
          </div>
        </button>

        <div style="text-align:center;color:rgba(255,255,255,0.2);font-size:10px;margin-top:14px;font-style:italic;">
          More story modes coming soon...
        </div>
      </div>
    `;
  },

  // Demon Castle detail view — full stats, floor info, boss roster, enter/exit
  _getDemonCastleDetailHtml() {
    const state = this._demonCastle;
    if (!state) {
      return '<div style="padding:20px;text-align:center;color:rgba(255,255,255,0.35);font-size:12px;">Story mode initializing...</div>';
    }

    const floor = state.currentFloor || 1;
    const cleared = state.floorsCleared?.length || 0;
    const permits = this._dcPermits || 0;
    const totalKills = (state.totalDemonsKilled || 0).toLocaleString();
    const totalSouls = (state.totalDemonSouls || 0).toLocaleString();
    const bossesDefeated = state.totalBossesDefeated || 0;
    const isCompleted = Boolean(state.completedAt);
    const isActive = this._storyModeActive;
    const activeDungeon = this.activeDungeons?.get(DC.DEMON_CASTLE_KEY);
    const progressPct = Math.min(100, ((floor - 1) / DC.DEMON_CASTLE_FLOORS * 100)).toFixed(1);
    const isBoss = DC.isBossFloor(floor);
    const bossInfo = isBoss ? DC.DEMON_CASTLE_BOSSES[floor] : null;
    const demonCount = DC.getDemonCount(floor).toLocaleString();
    const tier = DC.getFloorTier(floor);

    // --- Active combat section ---
    let activeHtml = '';
    if (isActive && activeDungeon) {
      const mobsKilled = (activeDungeon.mobs?.killed || 0).toLocaleString();
      const mobsRemaining = Math.max(0, (activeDungeon.mobs?.remaining || 0)).toLocaleString();
      const aliveMobs = (activeDungeon.mobs?.activeMobs?.length || 0).toLocaleString();
      const floorSouls = (activeDungeon.mobs?.killed || 0).toLocaleString();
      const bossHp = activeDungeon.boss && !activeDungeon.boss._isSentinel
        ? `${Math.max(0, activeDungeon.boss.hp).toLocaleString()} / ${activeDungeon.boss.maxHp.toLocaleString()}`
        : null;

      activeHtml = `
        <div style="background:rgba(220,53,69,0.08);border:1px solid rgba(220,53,69,0.4);border-radius:10px;padding:12px;margin-top:12px;animation:dcCombatPulse 2s ease-in-out infinite;">
          <div style="font-size:12px;font-weight:700;color:#ff6b35;margin-bottom:8px;letter-spacing:0.02em;">&#x2694;&#xFE0F; IN COMBAT &mdash; Floor ${floor}</div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;">
            <div style="text-align:center;">
              <div style="font-size:9px;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:2px;">Killed</div>
              <div style="font-size:14px;font-weight:700;color:#34d399;">${mobsKilled}</div>
            </div>
            <div style="text-align:center;">
              <div style="font-size:9px;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:2px;">Remaining</div>
              <div style="font-size:14px;font-weight:700;color:#ef4444;">${mobsRemaining}</div>
            </div>
            <div style="text-align:center;">
              <div style="font-size:9px;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:2px;">Active</div>
              <div style="font-size:14px;font-weight:700;color:#fbbf24;">${aliveMobs}</div>
            </div>
            <div style="text-align:center;">
              <div style="font-size:9px;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:2px;">Souls</div>
              <div style="font-size:14px;font-weight:700;color:#a78bfa;">${floorSouls}</div>
            </div>
          </div>
          ${bossHp ? `<div style="text-align:center;color:rgba(255,255,255,0.4);font-size:10px;margin-top:8px;">Boss HP: <span style="color:#ef4444;font-weight:700;">${bossHp}</span></div>` : ''}
          <button class="dungeon-widget-action" type="button"
                  data-dungeon-action="story-exit" data-channel-key="${DC.DEMON_CASTLE_KEY}"
                  style="appearance:none;width:100%;padding:8px;margin-top:8px;background:rgba(220,53,69,0.2);border:1px solid rgba(220,53,69,0.5);border-radius:8px;color:#ff6b6b;font-size:12px;font-weight:700;cursor:pointer;transition:background 0.15s ease;">
            EXIT DEMON CASTLE
          </button>
        </div>
      `;
    }

    // --- Enter button ---
    let enterBtnHtml = '';
    if (!isActive) {
      let enterLabel;
      if (isBoss) {
        enterLabel = `&#x2694;&#xFE0F; ENTER &mdash; ${bossInfo.name}`;
      } else if (isCompleted) {
        enterLabel = `&#x1F504; RE-ENTER FLOOR ${floor}`;
      } else {
        enterLabel = `&#x2694;&#xFE0F; ENTER FLOOR ${floor}`;
      }
      enterBtnHtml = `
        <button class="dungeon-widget-action dc-enter-btn" type="button"
                data-dungeon-action="story-enter" data-channel-key="${DC.DEMON_CASTLE_KEY}"
                style="appearance:none;width:100%;height:44px;margin-top:12px;background:linear-gradient(135deg,#dc3545 0%,#ff6b35 100%);border:none;border-radius:8px;color:#fff;font-size:13px;font-weight:700;letter-spacing:0.04em;cursor:pointer;box-shadow:0 4px 14px rgba(220,53,69,0.35);transition:filter 0.15s ease,transform 0.15s ease,box-shadow 0.15s ease;">
          ${enterLabel}
        </button>
      `;
    }

    // --- Boss roster ---
    const rankColors = { 'B': '#8ec5ff', 'A': '#fbbf24', 'S': '#f87171', 'Monarch': '#a78bfa' };
    const rankBgAlpha = { 'B': '142,197,255', 'A': '251,191,36', 'S': '248,113,113', 'Monarch': '167,139,250' };

    const bossRosterHtml = DC.BOSS_FLOORS.map(bossFloor => {
      const boss = DC.DEMON_CASTLE_BOSSES[bossFloor];
      if (!boss) return '';
      const isDefeated = Boolean(state.floorsCleared?.includes?.(bossFloor));
      const rc = rankColors[boss.rank] || '#b5bac1';
      const rba = rankBgAlpha[boss.rank] || '181,186,193';
      const defeatedStyle = isDefeated ? 'opacity:0.55;background:rgba(52,211,153,0.04);border-color:rgba(52,211,153,0.15);' : '';

      return `
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:8px;padding:10px;${defeatedStyle}">
          <div style="font-size:12px;font-weight:700;color:${isDefeated ? '#34d399' : '#f2f3f5'};margin-bottom:1px;">${isDefeated ? '&#x2713; ' : ''}${boss.name}</div>
          <div style="font-size:9px;color:rgba(255,255,255,0.38);margin-bottom:6px;line-height:1.3;">${boss.title}</div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:4px;">
            <span style="font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;color:${rc};background:rgba(${rba},0.12);">${boss.rank}</span>
            <span style="font-size:9px;color:rgba(255,255,255,0.3);">Floor ${bossFloor}</span>
          </div>
        </div>
      `;
    }).join('');

    // --- Floor info ---
    const permitIndicator = floor > 1
      ? `<span style="margin-left:6px;color:${permits > 0 ? '#34d399' : '#ef4444'};">Permit: ${permits > 0 ? '&#x2713;' : '&#x2717;'} ${permits > 0 ? '(' + permits + ')' : ''}</span>`
      : '';

    const floorBoxBorder = isBoss ? 'border-left:3px solid #dc3545;background:rgba(220,53,69,0.06);border-color:rgba(220,53,69,0.2);' : 'border-left:3px solid #ff6b35;';

    return `
      <div style="padding:16px;">

        <!-- Header row -->
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <button class="dungeon-widget-action" type="button"
                  data-dungeon-action="story-back" data-channel-key="_story"
                  style="appearance:none;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:rgba(255,255,255,0.6);font-size:16px;line-height:1;width:28px;height:28px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;"
                  title="Back to Story Modes">&#x276E;</button>
          <span style="font-size:22px;line-height:1;flex-shrink:0;">&#x1F3F0;</span>
          <div style="flex:1;min-width:0;">
            <div style="color:#ff9f43;font-size:15px;font-weight:700;line-height:1.2;">Demon Castle</div>
            <div style="color:rgba(255,255,255,0.38);font-size:10px;margin-top:1px;">Kandiaru&#x27;s Trial &mdash; 100 Floors</div>
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <div style="color:#f2f3f5;font-size:16px;font-weight:700;line-height:1.2;">Floor ${floor}</div>
            <div style="color:rgba(255,255,255,0.38);font-size:10px;margin-top:1px;">${progressPct}% Complete</div>
          </div>
        </div>

        <!-- Progress bar -->
        <div style="height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;">
          <div class="story-mode-floor-bar-fill" style="height:100%;width:${progressPct}%;background:linear-gradient(90deg,#dc3545,#ff6b35,#ff9f43,#ff6b35,#dc3545);background-size:200% auto;border-radius:3px;transition:width 0.4s ease;animation:dcProgressShimmer 3s linear infinite;"></div>
        </div>
        <div style="color:rgba(255,255,255,0.35);font-size:10px;margin-top:5px;text-align:center;">
          Floor ${floor} of ${DC.DEMON_CASTLE_FLOORS} &mdash; ${progressPct}% Complete
        </div>

        <!-- Stats overview -->
        <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.35);margin:14px 0 6px;padding:0 2px;">Overview</div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">
          <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:10px;text-align:center;">
            <div style="font-size:20px;font-weight:700;color:#ff9f43;line-height:1.1;margin-bottom:3px;">${cleared}</div>
            <div style="font-size:9px;font-weight:600;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.06em;">Floors Cleared</div>
          </div>
          <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:10px;text-align:center;">
            <div style="font-size:20px;font-weight:700;color:#34d399;line-height:1.1;margin-bottom:3px;">${totalKills}</div>
            <div style="font-size:9px;font-weight:600;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.06em;">Demons Slain</div>
          </div>
          <div style="background:rgba(167,139,250,0.04);border:1px solid rgba(167,139,250,0.12);border-radius:8px;padding:10px;text-align:center;">
            <div style="font-size:20px;font-weight:700;color:#a78bfa;line-height:1.1;margin-bottom:3px;">${totalSouls}</div>
            <div style="font-size:9px;font-weight:600;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.06em;">Demon Souls</div>
          </div>
          <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:10px;text-align:center;">
            <div style="font-size:20px;font-weight:700;color:#ef4444;line-height:1.1;margin-bottom:3px;">${bossesDefeated}/4</div>
            <div style="font-size:9px;font-weight:600;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.06em;">Bosses Defeated</div>
          </div>
        </div>

        <!-- Current floor info -->
        <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.35);margin:14px 0 6px;padding:0 2px;">Current Floor</div>
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);${floorBoxBorder}border-radius:0 8px 8px 0;padding:10px 12px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
            <span style="color:#ff9f43;font-size:13px;font-weight:700;">Floor ${floor}</span>
            ${isBoss ? '<span style="color:#ef4444;font-size:10px;font-weight:700;background:rgba(220,53,69,0.2);padding:1px 8px;border-radius:8px;border:1px solid rgba(220,53,69,0.35);">&#x26A0; BOSS FLOOR</span>' : ''}
          </div>
          ${isBoss ? `<div style="color:#ef4444;font-size:12px;font-weight:600;margin-bottom:5px;">${bossInfo.name} &mdash; ${bossInfo.title}</div>` : ''}
          <div style="color:rgba(255,255,255,0.5);font-size:11px;line-height:1.7;">
            Demons: <span style="color:#f2f3f5;font-weight:600;">${demonCount}</span>
            &nbsp;&bull;&nbsp;
            Rank: <span style="color:#f2f3f5;font-weight:600;">${tier.rank}</span>
            &nbsp;&bull;&nbsp;
            Type: <span style="color:#f2f3f5;font-weight:600;">${tier.name}</span>
            ${permitIndicator}
          </div>
        </div>

        <!-- Demon Lords (boss roster) -->
        <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.35);margin:14px 0 6px;padding:0 2px;">Demon Lords</div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">
          ${bossRosterHtml}
        </div>

        <!-- Active combat -->
        ${activeHtml}

        <!-- Enter button -->
        ${enterBtnHtml}

        <!-- Completion banner -->
        ${isCompleted ? '<div style="text-align:center;color:#fbbf24;font-size:11px;font-weight:600;padding:8px 0 0;">&#x1F3C6; Castle Cleared &mdash; Baran Defeated</div>' : ''}
      </div>
    `;
  },
};
