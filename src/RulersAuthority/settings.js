// Settings Panel

import { PANEL_DEFS } from "./constants";
import {
  togglePanel,
  recallChannel,
  releaseCategory,
  releaseDM,
  getSoloLevelingData,
  updateToolbarIcon,
} from "./panels";
import { updateCSSVars } from "./styles";

/**
 * Build and return the React settings panel element.
 * @param {RulersAuthority} ctx - plugin instance
 * @returns {React.Element}
 */
export function getSettingsPanel(ctx) {
  const React = BdApi.React;
  const { useState, useCallback, useReducer } = React;
  const ce = React.createElement;

  const SettingsPanel = () => {
    const [, forceUpdate] = useReducer((x) => x + 1, 0);
    const [debug, setDebug] = useState(ctx.settings.debugMode);
    const [transSpeed, setTransSpeed] = useState(ctx.settings.transitionSpeed);
    const [anims, setAnims] = useState(ctx.settings.animationsEnabled);

    const slsData = getSoloLevelingData(ctx);

    const updateSetting = useCallback((key, value) => {
      ctx.settings[key] = value;
      ctx.saveSettings();
      forceUpdate();
    }, []);

    // Styles
    const containerStyle = {
      background: "#1e1e2e", padding: "16px", borderRadius: "8px",
      color: "#ccc", fontFamily: "inherit", fontSize: "14px",
    };
    const sectionStyle = {
      marginBottom: "16px", padding: "12px",
      background: "#252540", borderRadius: "6px",
    };
    const headerStyle = { color: "#b49bff", fontSize: "16px", marginBottom: "8px", fontWeight: "600" };
    const subHeaderStyle = { color: "#9b8ec4", fontSize: "13px", marginBottom: "6px", fontWeight: "500" };
    const labelStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" };
    const dimStyle = { fontSize: "11px", color: "#666", marginTop: "2px" };
    const btnStyle = {
      background: "#9b59b6", border: "none", color: "#fff", padding: "4px 10px",
      borderRadius: "4px", cursor: "pointer", fontSize: "12px", marginRight: "6px", marginBottom: "4px",
    };
    const btnDimStyle = { ...btnStyle, background: "#444" };

    // Toggle Helper
    const Toggle = ({ label, checked, onChange }) =>
      ce("label", { style: labelStyle },
        ce("span", null, label),
        ce("input", {
          type: "checkbox", checked,
          style: { accentColor: "#9b59b6" },
          onChange: (e) => onChange(e.target.checked),
        })
      );

    // Status Display
    const StatusSection = () =>
      ce("div", { style: sectionStyle },
        ce("div", { style: headerStyle }, "Ruler's Authority"),
        ce("div", { style: dimStyle },
          slsData ? `INT: ${slsData.intelligence} | Level: ${slsData.level}` : "SoloLevelingStats not detected"
        ),
        ctx._amplifiedMode && ce("div", { style: { ...dimStyle, color: "#b49bff", marginTop: "4px" } },
          "AMPLIFIED MODE ACTIVE"
        ),
        ce("div", { style: { ...dimStyle, marginTop: "4px" } },
          `Webpack: ${Object.keys(ctx._resolvedSelectors).filter((k) => {
            const m = ctx._modules;
            if (k === "sidebar") return !!m.sidebar?.sidebarList;
            if (k === "members") return !!m.members?.membersWrap;
            if (k === "profile") return !!m.panel?.outer;
            if (k === "search") return !!m.search?.searchResultsWrap;
            if (k === "toolbar") return !!m.icons?.toolbar;
            return false;
          }).length}/5 modules resolved`
        )
      );

    // Panel Toggles
    const PanelSection = () =>
      ce("div", { style: sectionStyle },
        ce("div", { style: subHeaderStyle }, "Panel Controls"),
        Object.entries(PANEL_DEFS).map(([name, def]) =>
          ce("div", { key: name, style: { marginBottom: "8px" } },
            ce(Toggle, {
              label: def.label,
              checked: ctx.settings.panels[name].pushed,
              onChange: () => {
                togglePanel(ctx, name);
                forceUpdate();
              },
            }),
            def.hoverCapable &&
              ce(Toggle, {
                label: "  \u21b3 Hover to expand",
                checked: ctx.settings.panels[name].hoverExpand,
                onChange: (v) => {
                  ctx.settings.panels[name].hoverExpand = v;
                  ctx.saveSettings();
                  forceUpdate();
                },
              }),
            // Width display (if panel has been resized)
            ctx.settings.panels[name].width > 0 &&
              ce("div", { style: { ...dimStyle, display: "flex", alignItems: "center", gap: "6px" } },
                ce("span", null, `Width: ${ctx.settings.panels[name].width}px`),
                ce("button", {
                  style: { ...btnDimStyle, fontSize: "10px", padding: "2px 6px", marginBottom: "0" },
                  onClick: () => {
                    ctx.settings.panels[name].width = ctx.settings.defaultWidths[name];
                    ctx.saveSettings();
                    updateCSSVars(ctx);
                    forceUpdate();
                  },
                }, "Reset")
              )
          )
        )
      );

    // Hidden Channels (per guild)
    const HiddenChannelsSection = () => {
      const guildEntries = Object.entries(ctx.settings.guilds).filter(
        ([, data]) => data.hiddenChannels?.length > 0 || data.crushedCategories?.length > 0
      );
      if (guildEntries.length === 0) return null;

      return ce("div", { style: sectionStyle },
        ce("div", { style: subHeaderStyle }, "Pushed Channels & Crushed Categories"),
        guildEntries.map(([guildId, data]) => {
          const guild = ctx._GuildStore?.getGuild?.(guildId);
          const guildName = guild?.name || guildId;
          return ce("div", { key: guildId, style: { marginBottom: "10px" } },
            ce("div", { style: { fontSize: "12px", color: "#999", marginBottom: "4px" } }, guildName),
            data.hiddenChannels?.map((ch) =>
              ce("button", {
                key: ch.id, style: btnDimStyle,
                onClick: () => { recallChannel(ctx, guildId, ch.id); forceUpdate(); },
              }, `Recall #${ch.name}`)
            ),
            data.crushedCategories?.map((cat) =>
              ce("button", {
                key: cat.id, style: btnDimStyle,
                onClick: () => { releaseCategory(ctx, guildId, cat.id); forceUpdate(); },
              }, `Release ${cat.name}`)
            )
          );
        })
      );
    };

    // Gripped DMs
    const GrippedDMsSection = () => {
      if (ctx.settings.grippedDMs.length === 0) return null;
      return ce("div", { style: sectionStyle },
        ce("div", { style: subHeaderStyle }, "Gripped DMs"),
        ctx.settings.grippedDMs.map((dm) =>
          ce("button", {
            key: dm.channelId, style: btnDimStyle,
            onClick: () => { releaseDM(ctx, dm.channelId); forceUpdate(); },
          }, `Release ${dm.username}`)
        )
      );
    };

    // General Settings
    const GeneralSection = () =>
      ce("div", { style: sectionStyle },
        ce("div", { style: subHeaderStyle }, "General"),
        ce("label", { style: { ...labelStyle, marginBottom: "10px" } },
          ce("span", null, `Transition Speed: ${transSpeed}ms`),
          ce("input", {
            type: "range", min: 0, max: 600, step: 50, value: transSpeed,
            style: { width: "120px", accentColor: "#9b59b6" },
            onChange: (e) => {
              const v = Number(e.target.value);
              setTransSpeed(v);
              ctx.settings.transitionSpeed = v;
              ctx.saveSettings();
              updateCSSVars(ctx);
            },
          })
        ),
        ce(Toggle, {
          label: "Animations",
          checked: anims,
          onChange: (v) => { setAnims(v); updateSetting("animationsEnabled", v); },
        }),
        ce(Toggle, {
          label: "Debug Mode",
          checked: debug,
          onChange: (v) => { setDebug(v); updateSetting("debugMode", v); },
        })
      );

    return ce("div", { style: containerStyle },
      ce(StatusSection),
      ce(PanelSection),
      ce(HiddenChannelsSection),
      ce(GrippedDMsSection),
      ce(GeneralSection)
    );
  };

  return React.createElement(SettingsPanel);
}
