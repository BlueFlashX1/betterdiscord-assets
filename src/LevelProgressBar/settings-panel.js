function buildLevelProgressBarSettingsPanel(plugin) {
  plugin.detachLevelProgressBarSettingsPanelHandlers();
  const panel = document.createElement("div");
  panel.style.padding = "20px";
  panel.innerHTML = `
      <div style="background: rgba(10, 10, 16, 0.98); border-radius: 2px; padding: 20px;">
        <h3 style="color: #8a2be2; margin: 0 0 16px 0; font-size: 16px; font-weight: 600;">Level Progress Bar</h3>
        <label style="display: flex; align-items: center; cursor: pointer; padding: 10px 12px; background: rgba(10, 10, 16, 0.98); border-radius: 2px; border: 1px solid rgba(138, 43, 226, 0.4);">
          <input type="checkbox" ${plugin.settings.debugMode ? "checked" : ""} data-lpb-setting="debugMode"
            style="accent-color: #8a2be2; width: 16px; height: 16px; margin: 0;">
          <span style="margin-left: 10px; color: #dcddde; font-size: 14px;">Debug Mode</span>
        </label>
        <p style="font-size: 12px; color: #b5bac1; margin: 8px 0 0 0;">
          Show detailed console logs for troubleshooting. Reload Discord after changing.
        </p>
      </div>
    `;
  const onChange = (event) => {
    const target = event.target;
    const key = target?.getAttribute?.("data-lpb-setting");
    if (!key) return;
    const nextValue = target.type === "checkbox" ? target.checked : target.value;
    const handlers = {
      debugMode: (value) => {
        plugin.settings.debugMode = !!value;
        plugin.saveSettings();
        plugin.debugLog("SETTINGS", `Debug mode: ${value ? "ENABLED" : "DISABLED"}`);
      },
    };
    (handlers[key] || (() => {}))(nextValue);
  };
  panel.addEventListener("change", onChange);
  plugin._settingsPanelRoot = panel;
  plugin._settingsPanelHandlers = { onChange };
  return panel;
}

module.exports = { buildLevelProgressBarSettingsPanel };
