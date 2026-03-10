const SETTINGS_ROW_STYLE = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 0",
  borderBottom: "1px solid rgba(255,255,255,0.05)",
};

const SETTINGS_LABEL_STYLE = { color: "#ccc", fontSize: "13px" };

const SETTINGS_INPUT_STYLE = {
  background: "rgba(0,0,0,0.3)",
  border: "1px solid rgba(138,43,226,0.3)",
  borderRadius: "6px",
  color: "#ddd",
  padding: "4px 8px",
  fontSize: "13px",
  outline: "none",
  width: "120px",
  textAlign: "center",
};

const SETTINGS_CHECK_STYLE = { accentColor: "#8a2be2" };
const SETTINGS_LAST_ROW_STYLE = { ...SETTINGS_ROW_STYLE, borderBottom: "none" };

function buildShadowStepSettingsPanel(BdApi, plugin, { baseMaxAnchors, agiBonusDivisor }) {
  const React = BdApi.React;

  const SettingsPanel = () => {
    const [hotkey, setHotkey] = React.useState(plugin.settings.hotkey);
    const [animEnabled, setAnimEnabled] = React.useState(plugin.settings.animationEnabled);
    const [respectReducedMotion, setRespectReducedMotion] = React.useState(plugin.settings.respectReducedMotion ?? false);
    const [animDuration, setAnimDuration] = React.useState(plugin.settings.animationDuration);
    const [maxAnchors, setMaxAnchors] = React.useState(plugin.settings.maxAnchors);
    const [debug, setDebug] = React.useState(plugin.settings.debugMode);

    const agiStat = plugin._getAgiStat();
    const effectiveMax = (maxAnchors || baseMaxAnchors) + Math.floor(agiStat / agiBonusDivisor);
    const anchorCount = (plugin.settings.anchors || []).length;

    return React.createElement("div", {
      style: { padding: "16px", background: "#1e1e2e", borderRadius: "8px", color: "#ccc" },
    },
    React.createElement("h3", {
      style: { color: "#8a2be2", marginTop: 0, marginBottom: "12px", fontFamily: "'Orbitron', sans-serif" },
    }, "Shadow Step Settings"),

    React.createElement("div", {
      style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px" },
    },
    React.createElement("div", {
      style: { background: "rgba(138,43,226,0.1)", border: "1px solid rgba(138,43,226,0.3)", borderRadius: "8px", padding: "10px", textAlign: "center" },
    },
    React.createElement("div", { style: { color: "#8a2be2", fontSize: "18px", fontWeight: "700" } }, anchorCount),
    React.createElement("div", { style: { color: "#999", fontSize: "11px" } }, "Active Anchors")),
    React.createElement("div", {
      style: { background: "rgba(138,43,226,0.1)", border: "1px solid rgba(138,43,226,0.3)", borderRadius: "8px", padding: "10px", textAlign: "center" },
    },
    React.createElement("div", { style: { color: "#8a2be2", fontSize: "18px", fontWeight: "700" } }, effectiveMax),
    React.createElement("div", { style: { color: "#999", fontSize: "11px" } },
      `Max Slots${agiStat > 0 ? ` (+${Math.floor(agiStat / agiBonusDivisor)} AGI)` : ""}`))),

    React.createElement("div", { style: SETTINGS_ROW_STYLE },
    React.createElement("span", { style: SETTINGS_LABEL_STYLE }, "Hotkey"),
    React.createElement("input", {
      style: SETTINGS_INPUT_STYLE,
      value: hotkey,
      onChange: (e) => {
        setHotkey(e.target.value);
        plugin.settings.hotkey = e.target.value;
        plugin._unregisterHotkey();
        plugin._registerHotkey();
        plugin.scheduleSaveSettings();
      },
    })),

    React.createElement("div", { style: SETTINGS_ROW_STYLE },
    React.createElement("span", { style: SETTINGS_LABEL_STYLE }, "Shadow Transition"),
    React.createElement("input", {
      type: "checkbox",
      checked: animEnabled,
      style: SETTINGS_CHECK_STYLE,
      onChange: (e) => {
        setAnimEnabled(e.target.checked);
        plugin.settings.animationEnabled = e.target.checked;
        plugin.scheduleSaveSettings();
      },
    })),

    React.createElement("div", { style: SETTINGS_ROW_STYLE },
    React.createElement("span", { style: SETTINGS_LABEL_STYLE }, "Respect Reduced Motion"),
    React.createElement("input", {
      type: "checkbox",
      checked: respectReducedMotion,
      style: SETTINGS_CHECK_STYLE,
      onChange: (e) => {
        setRespectReducedMotion(e.target.checked);
        plugin.settings.respectReducedMotion = e.target.checked;
        plugin.scheduleSaveSettings();
      },
    })),

    React.createElement("div", { style: SETTINGS_ROW_STYLE },
    React.createElement("span", { style: SETTINGS_LABEL_STYLE }, `Animation (${animDuration}ms + mist hold)`),
    React.createElement("input", {
      type: "range",
      min: 300,
      max: 1400,
      step: 50,
      value: animDuration,
      style: { accentColor: "#8a2be2", width: "120px" },
      onChange: (e) => {
        const val = parseInt(e.target.value, 10);
        if (Number.isNaN(val)) return;
        setAnimDuration(val);
        plugin.settings.animationDuration = val;
        plugin.scheduleSaveSettings();
      },
    })),

    React.createElement("div", { style: SETTINGS_ROW_STYLE },
    React.createElement("span", { style: SETTINGS_LABEL_STYLE }, "Base Max Anchors"),
    React.createElement("input", {
      type: "number",
      min: 3,
      max: 50,
      value: maxAnchors,
      style: { ...SETTINGS_INPUT_STYLE, width: "60px" },
      onChange: (e) => {
        const val = Math.max(3, Math.min(50, parseInt(e.target.value, 10) || baseMaxAnchors));
        setMaxAnchors(val);
        plugin.settings.maxAnchors = val;
        plugin.scheduleSaveSettings();
      },
    })),

    React.createElement("div", { style: SETTINGS_LAST_ROW_STYLE },
    React.createElement("span", { style: SETTINGS_LABEL_STYLE }, "Debug Mode"),
    React.createElement("input", {
      type: "checkbox",
      checked: debug,
      style: SETTINGS_CHECK_STYLE,
      onChange: (e) => {
        setDebug(e.target.checked);
        plugin.settings.debugMode = e.target.checked;
        plugin.scheduleSaveSettings();
      },
    })));
  };

  return React.createElement(SettingsPanel);
}

module.exports = { buildShadowStepSettingsPanel };
