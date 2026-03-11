module.exports = {
  getSettingsPanel() {
    const container = document.createElement('div');
    container.style.cssText = `
      padding: 20px;
      background: #1e1e2e;
      border-radius: 2px;
      border: 1px solid rgba(138, 43, 226, 0.5);
      color: #ffffff;
      font-family: 'Segoe UI', sans-serif;
    `;
  
    // Title
    const title = document.createElement('h2');
    title.textContent = 'Solo Leveling Stats - Settings';
    title.style.cssText = `
      color: #8a2be2;
      margin-bottom: 20px;
      font-size: 24px;
      text-shadow: 0 0 10px rgba(138, 43, 226, 0.6);
    `;
    container.appendChild(title);
  
    // Debug Mode Toggle
    const debugToggle = this.createToggle(
      'debugMode',
      'Debug Mode',
      'Show detailed console logs for troubleshooting (constructor, save, load, periodic backups)',
      this.settings.debugMode || false
    );
    container.appendChild(debugToggle);
  
    // Info section
    const info = document.createElement('div');
    info.style.cssText = `
      margin-top: 20px;
      padding: 15px;
      background: rgba(138, 43, 226, 0.1);
      border-radius: 2px;
      border-left: 3px solid #8a2be2;
    `;
    info.innerHTML = `
      <strong style="color: #8a2be2;">Debug Console Logs:</strong><br>
      <span style="color: #b894e6; font-size: 13px;">
        When enabled, you'll see detailed logs for:<br>
        • Constructor initialization<br>
        • Save operations (current, clean, success)<br>
        • Load operations (raw data, merge, verification)<br>
        • Periodic backup saves (every 30 seconds)<br>
        • Shadow XP sharing<br>
        • Data verification (matches, deep copy status)
      </span>
    `;
    container.appendChild(info);
  
    // One-time rank backfill action
    const backfillApplied = !!this.settings?._rankBonusBackfillV2Applied;
    const rankBackfillAction = this.createActionButton(
      'recalculateRankBonuses',
      backfillApplied ? 'Rank Bonus Backfill Applied' : 'Recalculate Rank Bonuses',
      backfillApplied
        ? 'One-time rank-bonus backfill is already applied on this profile.'
        : 'Safely applies a one-time retroactive rank-bonus recalculation using the latest exponential curve. A backup snapshot is saved first.',
      backfillApplied
    );
    container.appendChild(rankBackfillAction);
  
    // Chat UI preview (kept as a helper for readability)
    try {
      const previewHeader = document.createElement('h3');
      previewHeader.textContent = 'Chat UI Preview';
      previewHeader.style.cssText = `
        margin-top: 24px;
        margin-bottom: 12px;
        color: #d4a5ff;
        font-size: 16px;
        font-weight: 700;
      `;
      container.appendChild(previewHeader);
  
      container.appendChild(this.createChatUiPreviewPanel());
    } catch (error) {
      this.debugError('SETTINGS_PANEL_PREVIEW', error);
    }
  
    // Delegated settings panel binding (single handler)
    this._detachSettingsPanelHandlers();
  
    this._settingsPanelHandlers = {
      change: (e) => {
        const target = e?.target;
        if (!target) return;
        const key = target.getAttribute?.('data-sls-setting');
        if (!key) return;
        const isChecked = !!target.checked;
  
        const handlers = {
          debugMode: () =>
            this.withAutoSave(() => {
              this.settings.debugMode = isChecked;
              this.debugLog('SETTINGS', 'Debug mode', isChecked ? 'enabled' : 'disabled');
            }, true),
        };
  
        const fn = handlers[key];
        fn && fn();
      },
      click: (e) => {
        const actionButton = e?.target?.closest?.('button[data-sls-action]');
        if (!actionButton) return;
        const actionKey = actionButton.getAttribute('data-sls-action');
        if (!actionKey) return;
  
        const handlers = {
          recalculateRankBonuses: async () => {
            if (this.settings?._rankBonusBackfillV2Applied) {
              this.showNotification('Rank bonus backfill already applied on this profile.', 'info', 5000);
              actionButton.disabled = true;
              actionButton.textContent = 'Rank Bonus Backfill Applied';
              return;
            }
  
            const confirmed = window.confirm(
              'Apply one-time rank bonus recalculation?\n\n' +
                'This will create a backup snapshot first, then apply a one-time stat backfill. ' +
                'It should only be run once per profile.'
            );
            if (!confirmed) return;
  
            const statusNode = container.querySelector?.(
              `[data-sls-action-status="${actionKey}"]`
            );
            const originalLabel = actionButton.textContent;
            actionButton.disabled = true;
            actionButton.textContent = 'Applying Backfill...';
            statusNode &&
              (statusNode.textContent =
                'Creating backup and applying one-time rank bonus backfill...');
  
            try {
              const result = await this.applyRankPromotionBonusBackfill();
              if (result?.applied) {
                actionButton.textContent = 'Rank Bonus Backfill Applied';
                statusNode &&
                  (statusNode.textContent =
                    `Applied successfully. +${result.perStatDelta} to each stat. Backup: ${result.backupKey}`);
                this.showNotification(
                  `Rank bonus backfill complete (+${result.perStatDelta} each stat).`,
                  'success',
                  7000
                );
                return;
              }
  
              const reason = result?.reason || 'unknown';
              const recoverable = reason === 'backup_failed' || reason === 'apply_failed' || reason === 'unexpected_error';
              actionButton.disabled = !recoverable;
              actionButton.textContent = recoverable ? originalLabel : 'Rank Bonus Backfill Applied';
              const failureText =
                reason === 'already_applied'
                  ? 'Backfill was already applied previously.'
                  : reason === 'no_promotions'
                    ? 'No rank promotions found for this profile. No changes made.'
                    : reason === 'no_delta'
                      ? 'No bonus delta detected between legacy and current tables. No changes made.'
                      : reason === 'missing_stats'
                        ? 'Stats object missing. No changes made.'
                        : `Backfill failed (${reason}). No data loss: restore via backup key ${result?.backupKey || 'N/A'}.`;
              statusNode && (statusNode.textContent = failureText);
              this.showNotification(failureText, recoverable ? 'error' : 'info', 7000);
            } catch (error) {
              actionButton.disabled = false;
              actionButton.textContent = originalLabel;
              statusNode &&
                (statusNode.textContent =
                  'Backfill failed unexpectedly. No data loss expected. Check console logs.');
              this.debugError('SETTINGS_PANEL_ACTION', error, { actionKey });
              this.showNotification('Backfill failed unexpectedly. Check console logs.', 'error', 7000);
            }
          },
        };
  
        const fn = handlers[actionKey];
        fn &&
          fn().catch((error) => {
            this.debugError('SETTINGS_PANEL_ACTION', error, { actionKey, phase: 'handler_invoke' });
          });
      },
    };
  
    container.addEventListener('change', this._settingsPanelHandlers.change);
    container.addEventListener('click', this._settingsPanelHandlers.click);
    this._settingsPanelRoot = container;
  
    return container;
  },

  createToggle(settingKey, label, description, defaultValue) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
      margin-bottom: 20px;
      padding: 15px;
      background: rgba(138, 43, 226, 0.05);
      border-radius: 2px;
      border: 1px solid rgba(138, 43, 226, 0.2);
    `;
  
    const toggleContainer = document.createElement('div');
    toggleContainer.style.cssText = 'display: flex; align-items: center; margin-bottom: 8px;';
  
    // Toggle switch
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = defaultValue;
    toggle.id = `sls-setting-${settingKey}`;
    toggle.setAttribute('data-sls-setting', settingKey);
    toggle.style.cssText = `
      width: 40px;
      height: 20px;
      margin-right: 12px;
      cursor: pointer;
    `;
  
    // Label
    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.setAttribute('for', toggle.id);
    labelEl.style.cssText = `
      font-size: 16px;
      font-weight: 600;
      color: #ffffff;
      cursor: pointer;
    `;
  
    // Description
    const desc = document.createElement('div');
    desc.textContent = description;
    desc.style.cssText = `
      font-size: 13px;
      color: #b894e6;
      line-height: 1.5;
    `;
  
    toggleContainer.appendChild(toggle);
    toggleContainer.appendChild(labelEl);
    wrapper.appendChild(toggleContainer);
    wrapper.appendChild(desc);
  
    return wrapper;
  },

  createActionButton(actionKey, label, description, disabled = false) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
      margin-top: 16px;
      margin-bottom: 8px;
      padding: 15px;
      background: rgba(138, 43, 226, 0.05);
      border-radius: 2px;
      border: 1px solid rgba(138, 43, 226, 0.2);
    `;
  
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.disabled = !!disabled;
    button.setAttribute('data-sls-action', actionKey);
    button.style.cssText = `
      padding: 10px 14px;
      border-radius: 2px;
      border: 1px solid rgba(138, 43, 226, 0.55);
      background: ${disabled ? 'rgba(120, 120, 120, 0.35)' : 'rgba(138, 43, 226, 0.25)'};
      color: #ffffff;
      font-size: 14px;
      font-weight: 700;
      cursor: ${disabled ? 'not-allowed' : 'pointer'};
      margin-bottom: 8px;
    `;
  
    const desc = document.createElement('div');
    desc.textContent = description;
    desc.style.cssText = `
      font-size: 13px;
      color: #b894e6;
      line-height: 1.5;
    `;
  
    const status = document.createElement('div');
    status.setAttribute('data-sls-action-status', actionKey);
    status.textContent = disabled
      ? 'Already applied for this profile.'
      : 'Not applied yet.';
    status.style.cssText = `
      margin-top: 8px;
      font-size: 12px;
      color: #d4a5ff;
      line-height: 1.4;
    `;
  
    wrapper.appendChild(button);
    wrapper.appendChild(desc);
    wrapper.appendChild(status);
    return wrapper;
  }
};
