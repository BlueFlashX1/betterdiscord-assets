/**
 * CriticalHit — Settings panel UI.
 * React settings component, createRoot resolution, panel cleanup.
 * Mixed onto CriticalHit.prototype via Object.assign.
 */

module.exports = {
  detachCriticalHitSettingsPanelHandlers() {
    if (this._settingsRoot) {
      try {
        this._settingsRoot.unmount();
      } catch (error) {
        this.debugError('SETTINGS_PANEL', 'Failed to unmount settings root', error);
      }
      this._settingsRoot = null;
    }
    const root = this._settingsPanelRoot;
    const handlers = this._settingsPanelHandlers;
    if (root && handlers) {
      root.removeEventListener('change', handlers.onChange);
      root.removeEventListener('input', handlers.onInput);
      root.removeEventListener('click', handlers.onClick);
    }
    this._settingsPanelRoot = null;
    this._settingsPanelHandlers = null;
  },

  _getCreateRoot() {
    if (this._reactUtils?.getCreateRoot) return this._reactUtils.getCreateRoot();
    // Minimal inline fallback
    if (BdApi.ReactDOM?.createRoot) return BdApi.ReactDOM.createRoot.bind(BdApi.ReactDOM);
    return null;
  },

  _getCritSettingsPanel() {
    if (this.__CritSettingsPanelCached) return this.__CritSettingsPanelCached;

    const React = BdApi.React;
    const { useState, useEffect, useCallback, useRef } = React;
    const ce = React.createElement;

    function CritSettingsPanel({ pluginInstance }) {
      const pi = pluginInstance;

      const [debugMode, setDebugMode] = useState(pi.settings.debugMode);

      const [totalCrits, setTotalCrits] = useState(pi.stats?.totalCrits ?? 0);
      const [critRate, setCritRate] = useState(pi.stats?.critRate ?? 0);
      const [historyCount, setHistoryCount] = useState(pi.messageHistory?.length ?? 0);

      const [effectiveCrit, setEffectiveCrit] = useState(pi.getEffectiveCritChance());

      const [agilityBonus, setAgilityBonus] = useState(0);
      const [skillBonus, setSkillBonus] = useState(0);
      const piRef = useRef(pi);
      piRef.current = pi;

      useEffect(() => {
        const tick = () => {
          const p = piRef.current;
          p.updateStats();
          setTotalCrits(p.stats?.totalCrits ?? 0);
          setCritRate(p.stats?.critRate ?? 0);
          setHistoryCount(p.messageHistory?.length ?? 0);
          setEffectiveCrit(p.getEffectiveCritChance());

          try {
            setAgilityBonus((BdApi.Data.load('SoloLevelingStats', 'agilityBonus')?.bonus ?? 0) * 100);
            setSkillBonus((BdApi.Data.load('SkillTree', 'bonuses')?.critBonus ?? 0) * 100);
          } catch (_) {
            setAgilityBonus(0);
            setSkillBonus(0);
          }

        };
        tick();
        const id = setInterval(tick, 5000); // 5s — settings panel data not time-critical
        return () => clearInterval(id);
      }, []);

      const handleDebugMode = useCallback((v) => {
        setDebugMode(v);
        pi.updateDebugMode(v);
      }, [pi]);

      return ce("div", { style: { background: "#1e1e2e" } },
        ce("div", { className: "crit-settings-header" },
          ce("div", { className: "crit-settings-title" },
            ce("h3", null, "Critical Hit Settings")
          ),
          ce("div", { className: "crit-settings-subtitle" }, "Customize your critical hit experience"),
          ce("div", {
            className: "crit-stats-display",
            style: { marginTop: "16px", padding: "12px", background: "rgba(138, 43, 226, 0.1)", borderRadius: "8px", border: "1px solid rgba(138, 43, 226, 0.2)" }
          },
            ce("div", { style: { display: "flex", gap: "24px", fontSize: "13px" } },
              ce("div", null,
                ce("span", { style: { opacity: 0.7 } }, "Total Crits:"),
                ce("strong", { style: { color: "#ba55d3", marginLeft: "8px" } }, totalCrits)
              ),
              ce("div", null,
                ce("span", { style: { opacity: 0.7 } }, "Crit Rate:"),
                ce("strong", { style: { color: "#ba55d3", marginLeft: "8px" } }, `${critRate.toFixed(2)}%`)
              ),
              ce("div", null,
                ce("span", { style: { opacity: 0.7 } }, "History:"),
                ce("strong", { style: { color: "#ba55d3", marginLeft: "8px" } }, `${historyCount} messages`)
              )
            )
          )
        ),

        ce("div", { className: "crit-settings-content" },

          ce("div", {
            className: "crit-form-group",
            style: { marginTop: "32px", paddingTop: "24px", borderTop: "1px solid var(--background-modifier-accent)" }
          },
            ce("div", { className: "crit-settings-title", style: { marginBottom: "16px" } },
              ce("h3", { style: { fontSize: "16px", margin: 0 } }, "Debug & Troubleshooting")
            ),
            ce("div", {
              className: "crit-form-item crit-checkbox-group",
              style: {
                background: debugMode ? "rgba(255, 165, 0, 0.1)" : "var(--background-modifier-hover)",
                border: debugMode ? "1px solid rgba(255, 165, 0, 0.3)" : "1px solid transparent"
              }
            },
              ce("label", { className: "crit-checkbox-label" },
                ce("input", {
                  type: "checkbox", checked: debugMode,
                  className: "crit-checkbox",
                  onChange: (e) => handleDebugMode(e.target.checked)
                }),
                ce("span", { className: "crit-checkbox-custom" }),
                ce("span", {
                  className: "crit-checkbox-text",
                  style: {
                    fontWeight: debugMode ? "600" : "500",
                    color: debugMode ? "var(--text-brand)" : "var(--text-normal)"
                  }
                }, "Enable Debug Mode")
              ),
              ce("div", {
                className: "crit-form-description",
                style: { marginTop: "8px", paddingLeft: "30px" }
              },
                "Show detailed debug logs in console (useful for troubleshooting). ",
                ce("strong", {
                  style: { color: debugMode ? "var(--text-brand)" : "var(--text-muted)" }
                }, debugMode
                  ? "WARNING: Currently enabled - check console for logs"
                  : "Currently disabled - no console spam"
                )
              )
            )
          ),

          ce("div", {
            className: "crit-font-credit",
            style: {
              marginTop: "32px", padding: "16px",
              background: "rgba(138, 43, 226, 0.05)", borderRadius: "8px",
              borderTop: "1px solid rgba(138, 43, 226, 0.2)",
              textAlign: "center", fontSize: "12px",
              color: "rgba(255, 255, 255, 0.6)"
            }
          },
            ce("div", null,
              "Icons made from ",
              ce("a", {
                href: "https://www.onlinewebfonts.com/icon",
                target: "_blank", rel: "noopener noreferrer",
                style: { color: "#8a2be2", textDecoration: "none" }
              }, "svg icons"),
              " is licensed by CC BY 4.0"
            ),
            ce("div", { style: { marginTop: "4px", opacity: 0.8 } },
              'Font: "Friend or Foe BB" from OnlineWebFonts.com'
            )
          )
        )
      );
    }

    this.__CritSettingsPanelCached = CritSettingsPanel;
    return CritSettingsPanel;
  },

  getSettingsPanel() {
    // PERF: Prevent orphaned React roots when settings are reopened repeatedly.
    this.detachCriticalHitSettingsPanelHandlers();

    this.updateStats();
    const container = document.createElement('div');
    container.className = 'bd-crit-hit-settings';

    const createRoot = this._getCreateRoot();
    if (createRoot) {
      const root = createRoot(container);
      this._settingsRoot = root;
      const React = BdApi.React;
      root.render(React.createElement(this._getCritSettingsPanel(), { pluginInstance: this }));
    } else {
      container.textContent = 'React 18 createRoot unavailable';
    }

    return container;
  },
};
