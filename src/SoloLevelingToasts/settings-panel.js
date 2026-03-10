function buildSoloLevelingToastsSettingsPanel(BdApi, plugin) {
  plugin.detachSoloLevelingToastsSettingsPanelHandlers();
  const panel = document.createElement("div");
  panel.style.cssText = "padding: 20px; background: #1e1e2e; border-radius: 0;";
  panel.innerHTML = `
      <div>
        <h3 style="color: #8a2be2; margin-bottom: 20px;">Toast Engine Settings</h3>

        <label style="display: flex; align-items: center; margin-bottom: 15px;">
          <input type="checkbox" ${
            plugin.settings.showParticles ? "checked" : ""
          } id="toast-particles" data-slt-setting="showParticles">
          <span style="margin-left: 10px;">Show Particles</span>
        </label>

        <label style="display: flex; flex-direction: column; margin-bottom: 15px;">
          <span style="margin-bottom: 5px;">Particle Count: <strong>${
            plugin.settings.particleCount
          }</strong></span>
          <input type="range" min="5" max="50" value="${
            plugin.settings.particleCount
          }" id="toast-particle-count" data-slt-setting="particleCount" style="width: 100%;">
        </label>

        <label style="display: flex; flex-direction: column; margin-bottom: 15px;">
          <span style="margin-bottom: 5px;">Max Toasts: <strong>${
            plugin.settings.maxToasts
          }</strong></span>
          <input type="range" min="1" max="10" value="${
            plugin.settings.maxToasts
          }" id="toast-max-toasts" data-slt-setting="maxToasts" style="width: 100%;">
        </label>

        <label style="display: flex; flex-direction: column; margin-bottom: 15px;">
          <span style="margin-bottom: 5px;">Position:</span>
          <select id="toast-position" data-slt-setting="position" style="padding: 8px; background: rgba(138, 43, 226, 0.2); border: 1px solid rgba(138, 43, 226, 0.4); border-radius: 2px; color: #fff; width: 100%;">
            <option value="top-right" ${
              plugin.settings.position === "top-right" ? "selected" : ""
            }>Top Right</option>
            <option value="top-left" ${
              plugin.settings.position === "top-left" ? "selected" : ""
            }>Top Left</option>
            <option value="bottom-right" ${
              plugin.settings.position === "bottom-right" ? "selected" : ""
            }>Bottom Right</option>
            <option value="bottom-left" ${
              plugin.settings.position === "bottom-left" ? "selected" : ""
            }>Bottom Left</option>
          </select>
        </label>

        <label style="display: flex; align-items: center; margin-bottom: 15px;">
          <input type="checkbox" ${
            plugin.settings.debugMode ? "checked" : ""
          } id="toast-debug" data-slt-setting="debugMode">
          <span style="margin-left: 10px;">Debug Mode (Show console logs)</span>
        </label>

        <div style="margin-top: 20px; padding: 15px; background: rgba(138, 43, 226, 0.1); border-radius: 2px; border-left: 3px solid #8a2be2;">
          <div style="color: #8a2be2; font-weight: bold; margin-bottom: 8px;">Toast Engine Status</div>
          <div style="color: rgba(255, 255, 255, 0.7); font-size: 13px;">
            <div>Engine Version: <strong style="color: #8a2be2;">v2.0</strong></div>
            <div style="margin-top: 4px;">Active Toasts: <strong>${plugin.activeToasts.length}</strong></div>
            <div style="margin-top: 4px;">Registered Consumers: <strong>${plugin._registeredConsumers.size > 0 ? [...plugin._registeredConsumers].join(", ") : "None yet"}</strong></div>
          </div>
        </div>

        <div style="margin-top: 12px; padding: 15px; background: rgba(138, 43, 226, 0.1); border-radius: 2px; border-left: 3px solid #8a2be2;">
          <div style="color: #8a2be2; font-weight: bold; margin-bottom: 8px;">Debug Information</div>
          <div style="color: rgba(255, 255, 255, 0.7); font-size: 13px;">
            Enable Debug Mode to see detailed console logs for:
            <ul style="margin: 5px 0; padding-left: 20px;">
              <li>Toast creation and rendering</li>
              <li>Rate limiting and dedup</li>
              <li>Card toast lifecycle</li>
              <li>Consumer registration</li>
              <li>Hook into SoloLevelingStats</li>
              <li>Settings and CSS injection</li>
            </ul>
          </div>
        </div>
      </div>
    `;

  const onInput = (event) => {
    const target = event.target;
    const key = target?.getAttribute?.("data-slt-setting");
    if (!key) return;

    const handlers = {
      particleCount: () => {
        const value = parseInt(target.value, 10);
        plugin.settings.particleCount = Number.isFinite(value)
          ? value
          : plugin.settings.particleCount;
        target.previousElementSibling?.querySelector?.("strong") &&
          (target.previousElementSibling.querySelector("strong").textContent = target.value);
      },
      maxToasts: () => {
        const value = parseInt(target.value, 10);
        plugin.settings.maxToasts = Number.isFinite(value) ? value : plugin.settings.maxToasts;
        target.previousElementSibling?.querySelector?.("strong") &&
          (target.previousElementSibling.querySelector("strong").textContent = target.value);
      },
    };

    handlers[key]?.();
  };

  const onChange = (event) => {
    const target = event.target;
    const key = target?.getAttribute?.("data-slt-setting");
    if (!key) return;

    const handlers = {
      showParticles: () => {
        plugin.settings.showParticles = !!target.checked;
        plugin.saveSettings();
      },
      particleCount: () => {
        const value = parseInt(target.value, 10);
        plugin.settings.particleCount = Number.isFinite(value)
          ? value
          : plugin.settings.particleCount;
        plugin.saveSettings();
      },
      maxToasts: () => {
        const value = parseInt(target.value, 10);
        plugin.settings.maxToasts = Number.isFinite(value) ? value : plugin.settings.maxToasts;
        plugin.saveSettings();
      },
      position: () => {
        plugin.settings.position = target.value;
        plugin.saveSettings();
        plugin.updateContainerPosition();
      },
      debugMode: () => {
        plugin.settings.debugMode = !!target.checked;
        plugin.debugMode = !!target.checked;
        plugin.saveSettings();
        plugin.debugLog("SETTINGS", "Debug mode toggled", { enabled: target.checked });
      },
    };

    handlers[key]?.();
  };

  panel.addEventListener("input", onInput);
  panel.addEventListener("change", onChange);
  plugin._settingsPanelRoot = panel;
  plugin._settingsPanelHandlers = { onInput, onChange };

  return panel;
}

module.exports = { buildSoloLevelingToastsSettingsPanel };
