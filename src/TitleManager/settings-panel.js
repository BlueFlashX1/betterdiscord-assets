function buildTitleManagerSettingsPanel(plugin) {
  plugin.detachTitleManagerSettingsPanelHandlers();

  const panel = document.createElement("div");
  panel.style.cssText = `
      padding: 20px;
      background: #1e1e2e;
      border-radius: 0;
      border: 2px solid rgba(138, 43, 226, 0.3);
      box-shadow: 0 0 30px rgba(138, 43, 226, 0.2);
    `;

  panel.innerHTML = `
      <div>
        <h3 style="
          color: #8a2be2;
          font-size: 20px;
          font-weight: bold;
          margin-bottom: 20px;
          text-transform: uppercase;
          letter-spacing: 1px;
          text-shadow: 0 0 10px rgba(138, 43, 226, 0.5);
        ">Title Manager Settings</h3>

        <div style="
          margin-bottom: 20px;
          padding: 15px;
          background: rgba(138, 43, 226, 0.1);
          border-radius: 0;
          border-left: 3px solid #8a2be2;
        ">
          <div style="color: #8a2be2; font-weight: bold; margin-bottom: 10px;">Sort Preferences</div>
          <div style="color: rgba(255, 255, 255, 0.7); font-size: 13px;">
            Your default sort filter: <span style="color: #8a2be2; font-weight: bold;">${plugin.getSortLabel(
              plugin.settings.sortBy || "xpBonus"
            )}</span>
            <br><br>
            Change the sort filter in the titles modal by using the dropdown at the top.
          </div>
        </div>

        <label style="
          display: flex;
          align-items: center;
          margin-bottom: 15px;
          padding: 12px;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 0;
          cursor: pointer;
          transition: all 0.3s ease;
        ">
          <input type="checkbox" ${
            plugin.settings.debugMode ? "checked" : ""
          } data-tm-setting="debugMode" style="
            width: 18px;
            height: 18px;
            cursor: pointer;
          ">
          <span style="margin-left: 10px; color: rgba(255, 255, 255, 0.9); font-weight: 500;">
            Debug Mode (Show console logs)
          </span>
        </label>

        <div style="
          margin-top: 15px;
          padding: 15px;
          background: rgba(138, 43, 226, 0.1);
          border-radius: 0;
          border-left: 3px solid #8a2be2;
        ">
          <div style="color: #8a2be2; font-weight: bold; margin-bottom: 8px;">Debug Information</div>
          <div style="color: rgba(255, 255, 255, 0.7); font-size: 13px; line-height: 1.6;">
            Enable Debug Mode to see detailed console logs for:
            <ul style="margin: 8px 0; padding-left: 20px;">
              <li>Title equip/unequip operations</li>
              <li>Settings load/save operations</li>
              <li>Button creation and retries</li>
              <li>Modal open/close tracking</li>
              <li>Filter and sort operations</li>
            </ul>
          </div>
        </div>
      </div>
    `;

  const onChange = (event) => {
    const target = event.target;
    const key = target?.getAttribute?.("data-tm-setting");
    if (!key) return;

    const nextValue = target.type === "checkbox" ? target.checked : target.value;

    const handlers = {
      debugMode: (value) => {
        plugin.settings.debugMode = !!value;
        plugin.saveSettings();
        plugin.debugLog("SETTINGS", "Debug mode toggled", { enabled: !!value });
      },
    };

    (handlers[key] || (() => {}))(nextValue);
  };

  panel.addEventListener("change", onChange);
  plugin._settingsPanelRoot = panel;
  plugin._settingsPanelHandlers = { onChange };

  return panel;
}

module.exports = { buildTitleManagerSettingsPanel };
