function buildStealthSettingsPanel(BdApi, plugin) {
  const React = BdApi.React;

  const rowStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    padding: "10px 0",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  };

  const labelWrapStyle = {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    flex: 1,
  };

  const titleStyle = {
    color: "#e9d5ff",
    fontFamily: "'Orbitron', sans-serif",
    fontWeight: 700,
    fontSize: "13px",
    letterSpacing: "0.04em",
  };

  const descStyle = {
    color: "rgba(220, 220, 230, 0.72)",
    fontSize: "12px",
    lineHeight: 1.3,
  };

  const checkStyle = { accentColor: "#8a2be2", width: "16px", height: "16px" };

  const Header = () => React.createElement(
    "div",
    {
      style: {
        padding: "12px 14px",
        border: "1px solid rgba(138,43,226,0.4)",
        borderRadius: "10px",
        marginBottom: "14px",
        background: "linear-gradient(135deg, rgba(32, 15, 52, 0.7), rgba(12, 8, 20, 0.8))",
      },
    },
    React.createElement(
      "div",
      {
        style: {
          color: "#c084fc",
          fontFamily: "'Orbitron', sans-serif",
          fontSize: "14px",
          fontWeight: 700,
          marginBottom: "6px",
        },
      },
      "Shadow Monarch Stealth"
    ),
    React.createElement(
      "div",
      { style: { color: "rgba(226, 232, 240, 0.82)", fontSize: "12px", lineHeight: 1.35 } },
      "Total concealment: hide typing, force Invisible, suppress idle detection, silence messages, erase telemetry footprints, and sever process monitoring."
    )
  );

  const GateStatus = () => {
    const summary = typeof plugin.getStealthGateSummary === "function"
      ? plugin.getStealthGateSummary()
      : { state: "UNKNOWN", label: "Unknown gate state", skillId: "stealth_technique" };
    return React.createElement(
      "div",
      {
        style: {
          marginBottom: "12px",
          padding: "8px 10px",
          borderRadius: "8px",
          border: "1px solid rgba(138,43,226,0.25)",
          background: "rgba(14, 10, 24, 0.72)",
          color: "rgba(226,232,240,0.85)",
          fontSize: "12px",
          lineHeight: 1.35,
        },
      },
      `Gate: ${summary.label} (${summary.state}) - Requires ${summary.skillId}`
    );
  };

  const SettingRow = ({ settingKey, title, description }) => {
    const [checked, setChecked] = React.useState(Boolean(plugin.settings[settingKey]));

    React.useEffect(() => {
      setChecked(Boolean(plugin.settings[settingKey]));
    }, [settingKey]);

    return React.createElement(
      "div",
      { style: rowStyle },
      React.createElement(
        "div",
        { style: labelWrapStyle },
        React.createElement("span", { style: titleStyle }, title),
        React.createElement("span", { style: descStyle }, description)
      ),
      React.createElement("input", {
        type: "checkbox",
        checked,
        style: checkStyle,
        onChange: (e) => {
          const value = Boolean(e.target.checked);
          setChecked(value);
          plugin._setSetting(settingKey, value);
        },
      })
    );
  };

  const Metrics = () => React.createElement(
    "div",
    {
      style: {
        marginTop: "14px",
        padding: "10px",
        borderRadius: "8px",
        background: "rgba(10, 10, 16, 0.7)",
        border: "1px solid rgba(138,43,226,0.25)",
        color: "rgba(226,232,240,0.82)",
        fontSize: "12px",
        lineHeight: 1.4,
      },
    },
    `Patched methods: typing ${plugin._patchMetrics.typing}, activities ${plugin._patchMetrics.activities}, telemetry ${plugin._patchMetrics.telemetry}, @silent ${plugin._patchMetrics.silent}, process ${plugin._patchMetrics.process}, readReceipts ${plugin._patchMetrics.readReceipts}`
  );

  const Panel = () => React.createElement(
    "div",
    {
      className: "sl-stealth-settings",
      style: {
        padding: "16px",
        borderRadius: "12px",
        background: "rgba(8, 8, 14, 0.92)",
        border: "1px solid rgba(138,43,226,0.35)",
        boxShadow: "0 0 24px rgba(138,43,226,0.18)",
        color: "#d4d4dc",
      },
    },
    React.createElement(Header),
    React.createElement(GateStatus),
    React.createElement(SettingRow, {
      settingKey: "enabled",
      title: "Master Stealth",
      description: "Global toggle for all stealth suppression rules.",
    }),
    React.createElement(SettingRow, {
      settingKey: "suppressTyping",
      title: "Conceal Typing",
      description: "Blocks outbound typing indicators so others do not see when you are typing.",
    }),
    React.createElement(SettingRow, {
      settingKey: "invisibleStatus",
      title: "Force Invisible Status",
      description: "Automatically keeps your presence status set to Invisible.",
    }),
    React.createElement(SettingRow, {
      settingKey: "suppressActivities",
      title: "Hide Activity Updates",
      description: "Suppresses outbound activity updates (custom status / game activity module calls).",
    }),
    React.createElement(SettingRow, {
      settingKey: "suppressTelemetry",
      title: "Erase Tracking Footprints",
      description: "Blocks analytics tracking and disables Sentry telemetry hooks where possible.",
    }),
    React.createElement(SettingRow, {
      settingKey: "disableProcessMonitor",
      title: "Sever Process Monitor",
      description: "Stops observed-game callbacks and suppresses Discord RPC game process monitoring.",
    }),
    React.createElement(SettingRow, {
      settingKey: "suppressIdle",
      title: "Suppress Idle Detection",
      description: "Blocks idle/AFK state transitions that can leak presence information.",
    }),
    React.createElement(SettingRow, {
      settingKey: "autoSilentMessages",
      title: "Silent Whisper (@silent)",
      description: "Prefixes normal text messages with @silent automatically (slash commands are skipped).",
    }),
    React.createElement(SettingRow, {
      settingKey: "suppressReadReceipts",
      title: "Block Read Receipts",
      description: "Blocks outbound read acknowledgments - channels/DMs never mark as read for other users.",
    }),
    React.createElement(SettingRow, {
      settingKey: "restoreStatusOnStop",
      title: "Restore Previous Status",
      description: "When disabled/stopped, revert to your pre-stealth status if captured.",
    }),
    React.createElement(SettingRow, {
      settingKey: "showToasts",
      title: "Show Toasts",
      description: "Display stealth on/off and warning toasts.",
    }),
    React.createElement(Metrics)
  );

  return React.createElement(Panel);
}

module.exports = { buildStealthSettingsPanel };
