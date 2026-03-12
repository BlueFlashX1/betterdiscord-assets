const {
  DEFAULT_TYPING_ALERT_COOLDOWN_MS,
  PANEL_CONTAINER_ID,
  PLUGIN_NAME,
  RANKS,
  STYLE_ID,
  WIDGET_ID,
  WIDGET_REINJECT_DELAY_MS,
  WIDGET_SPACER_ID,
} = require("./constants");
const { buildCSS } = require("./styles");
const { _PluginUtils, _ReactUtils } = require("./shared-utils");

const ShadowSensesUiMethods = {
  injectCSS() {
    try {
      BdApi.DOM.addStyle(STYLE_ID, buildCSS());
      this.debugLog("CSS", "Injected via BdApi.DOM.addStyle");
    } catch (err) {
      // Manual fallback
      try {
        if (!document.getElementById(STYLE_ID)) {
          const style = document.createElement("style");
          style.id = STYLE_ID;
          style.textContent = buildCSS();
          document.head.appendChild(style);
          this.debugLog("CSS", "Injected via manual <style> fallback");
        }
      } catch (fallbackErr) {
        this.debugError("CSS", "Failed to inject CSS", fallbackErr);
      }
    }
  },

  removeCSS() {
    try {
      BdApi.DOM.removeStyle(STYLE_ID);
    } catch (err) {
      // Manual fallback
      try {
        const el = document.getElementById(STYLE_ID);
        if (el) el.remove();
      } catch (fallbackErr) {
        this.debugError("CSS", "Failed to remove CSS", fallbackErr);
      }
    }
  },

  debugLog(system, ...args) {
    if (this._debugMode) console.log(`[${PLUGIN_NAME}][${system}]`, ...args);
  },

  debugError(system, ...args) {
    console.error(`[${PLUGIN_NAME}][${system}]`, ...args);
  },

  // ── Widget Injection ────────────────────────────────────────────────────

  _getMembersWrap() {
    try {
      // PERF: Cache the found wrap element for 2s to avoid offsetParent layout recalc every 500ms observer tick
      const now = Date.now();
      if (this._cachedMembersWrap && this._cachedMembersWrapTs && (now - this._cachedMembersWrapTs < 2000)) {
        // Validate cached element is still connected and visible
        if (this._cachedMembersWrap.isConnected && this._cachedMembersWrap.offsetParent !== null) {
          return this._cachedMembersWrap;
        }
        // Stale — clear and re-query
        this._cachedMembersWrap = null;
        this._cachedMembersWrapTs = 0;
      }

      const wraps = document.querySelectorAll('[class^="membersWrap_"], [class*=" membersWrap_"]');
      for (const wrap of wraps) {
        if (wrap.offsetParent !== null) {
          this._cachedMembersWrap = wrap;
          this._cachedMembersWrapTs = now;
          return wrap;
        }
      }
      // Not found — clear cache
      this._cachedMembersWrap = null;
      this._cachedMembersWrapTs = 0;
    } catch (err) {
      this.debugError("Widget", "Failed to find membersWrap", err);
    }
    return null;
  },

  _getCreateRoot() {
    if (_ReactUtils?.getCreateRoot) return _ReactUtils.getCreateRoot();
    // Minimal inline fallback
    if (BdApi.ReactDOM?.createRoot) return BdApi.ReactDOM.createRoot.bind(BdApi.ReactDOM);
    return null;
  },

  injectWidget() {
    try {
      if (!this._components?.SensesWidget) {
        this.debugError?.("Widget", "Components not initialized");
        return;
      }

      // Clean up any existing widget
      this.removeWidget();

      const membersWrap = this._getMembersWrap();
      if (!membersWrap) {
        this.debugLog("Widget", "membersWrap not found, skipping widget inject");
        return;
      }

      // Find innermost content target: membersList > membersContent (or first child)
      const membersList = membersWrap.querySelector('[class^="members_"], [class*=" members_"]');
      const target = membersList || membersWrap;

      const createRoot = this._getCreateRoot();
      if (!createRoot) {
        this.debugError("Widget", "createRoot not available");
        return;
      }

      // Create spacer
      const spacer = document.createElement("div");
      spacer.id = WIDGET_SPACER_ID;
      spacer.style.height = "16px";
      spacer.style.flexShrink = "0";

      // Create widget container
      const widgetDiv = document.createElement("div");
      widgetDiv.id = WIDGET_ID;
      widgetDiv.style.flexShrink = "0";

      // Insert at top
      if (target.firstChild) {
        target.insertBefore(widgetDiv, target.firstChild);
        target.insertBefore(spacer, widgetDiv);
      } else {
        target.appendChild(spacer);
        target.appendChild(widgetDiv);
      }

      // Mount React
      const root = createRoot(widgetDiv);
      root.render(BdApi.React.createElement(this._components.SensesWidget));
      this._widgetReactRoot = root;

      this.debugLog("Widget", "Injected into members panel");
    } catch (err) {
      this.debugError("Widget", "Failed to inject widget", err);
    }
  },

  removeWidget() {
    try {
      if (this._widgetReactRoot) {
        try {
          this._widgetReactRoot.unmount();
        } catch (_) {
          this.debugLog?.("CLEANUP", "Widget unmount error", _);
        }
        this._widgetReactRoot = null;
      }
      const existing = document.getElementById(WIDGET_ID);
      if (existing) existing.remove();
      const spacer = document.getElementById(WIDGET_SPACER_ID);
      if (spacer) spacer.remove();
      // Clear membersWrap cache — element is gone
      this._cachedMembersWrap = null;
      this._cachedMembersWrapTs = 0;
    } catch (err) {
      this.debugError("Widget", "Failed to remove widget", err);
    }
  },

  setupWidgetObserver() {
    try {
      // PERF(P5-4): Use shared LayoutObserverBus instead of independent MutationObserver
      if (_PluginUtils?.LayoutObserverBus) {
        this._layoutBusUnsub = _PluginUtils.LayoutObserverBus.subscribe("ShadowSenses", () => {
          const membersWrap = this._getMembersWrap();
          const widgetEl = document.getElementById(WIDGET_ID);

          if (membersWrap && !widgetEl) {
            clearTimeout(this._widgetReinjectTimeout);
            this._widgetReinjectTimeout = setTimeout(() => {
              try {
                this.injectWidget();
              } catch (err) {
                this.debugError("Widget", "Reinject failed", err);
              }
            }, WIDGET_REINJECT_DELAY_MS);
          } else if (!membersWrap && widgetEl) {
            this.removeWidget();
          }
        }, 500);
        this.debugLog("Widget", "Subscribed to shared LayoutObserverBus (500ms throttle)");
      } else {
        this.debugError("Widget", "LayoutObserverBus not available — widget persistence disabled");
      }
    } catch (err) {
      this.debugError("Widget", "Failed to setup observer", err);
    }
  },

  // ── Panel ───────────────────────────────────────────────────────────────

  openPanel() {
    try {
      if (!this._components?.SensesPanel) {
        this.debugError?.("Panel", "Components not initialized");
        return;
      }

      // Force-close any existing panel to prevent overlap
      if (this._panelReactRoot) {
        try {
          this._panelReactRoot.unmount();
        } catch (_) {
          this.debugLog?.("CLEANUP", "Panel pre-close unmount error", _);
        }
        this._panelReactRoot = null;
      }

      // Toggle if already open
      if (this._panelOpen) {
        this.closePanel();
        return;
      }

      const createRoot = this._getCreateRoot();
      if (!createRoot) {
        this.debugError("Panel", "createRoot not available");
        return;
      }

      const container = document.createElement("div");
      container.id = PANEL_CONTAINER_ID;
      container.style.display = "contents";
      document.body.appendChild(container);

      const root = createRoot(container);
      root.render(BdApi.React.createElement(this._components.SensesPanel, {
        onClose: () => this.closePanel(),
      }));

      this._panelReactRoot = root;
      this._panelOpen = true;
      this.debugLog("Panel", "Opened");
    } catch (err) {
      this.debugError("Panel", "Failed to open panel", err);
    }
  },

  closePanel() {
    try {
      if (this._panelReactRoot) {
        try {
          this._panelReactRoot.unmount();
        } catch (_) {
          this.debugLog?.("CLEANUP", "Panel unmount error", _);
        }
        this._panelReactRoot = null;
      }
      const container = document.getElementById(PANEL_CONTAINER_ID);
      if (container) container.remove();
      this._panelOpen = false;
      this.debugLog("Panel", "Closed");
    } catch (err) {
      this.debugError("Panel", "Failed to close panel", err);
    }
  },

  // ── ESC Handler ─────────────────────────────────────────────────────────

  registerEscHandler() {
    try {
      this._escHandler = (e) => {
        if (e.key !== "Escape") return;
        if (this._panelOpen) {
          this.closePanel();
          e.stopPropagation();
        }
      };
      document.addEventListener("keydown", this._escHandler);
      this.debugLog("ESC", "Handler registered");
    } catch (err) {
      this.debugError("ESC", "Failed to register ESC handler", err);
    }
  },

  // ── Context Menu ────────────────────────────────────────────────────────

  patchContextMenu() {
    try {
      if (this._unpatchContextMenu) {
        try {
          this._unpatchContextMenu();
        } catch (_) {}
        this._unpatchContextMenu = null;
      }
      this._unpatchContextMenu = BdApi.ContextMenu.patch("user-context", (tree, props) => {
        // No outer try-catch — let menu construction errors propagate visibly
        if (!props || !props.user) return;
        const user = props.user;
        const userId = user.id;

        const deployment = this.deploymentManager.getDeploymentForUser(userId);

        let menuItem;
        if (deployment) {
          // Already monitored — show recall option
          menuItem = BdApi.ContextMenu.buildItem({
            type: "text",
            label: "Recall",
            action: () => {
              try {
                this.deploymentManager.recall(deployment.shadowId);
                this._toast(`Recalled ${deployment.shadowName} from ${deployment.targetUsername}`);
                this._widgetDirty = true;
              } catch (err) {
                this.debugError("ContextMenu", "Recall failed", err);
              }
            },
          });
        } else {
          // Not monitored — auto-deploy weakest available shadow
          menuItem = BdApi.ContextMenu.buildItem({
            type: "text",
            label: "Deploy Shadow",
            action: async () => {
              // Try-catch only around risky async shadow loading
              let available;
              try {
                available = this.deploymentManager
                  ? await this.deploymentManager.getAvailableShadows()
                  : [];
              } catch (err) {
                this.debugError("ContextMenu", "Failed to load available shadows", err);
                this._toast("Failed to load shadows", "error");
                return;
              }

              try {
                if (available.length === 0) {
                  this._toast("No available shadows. All are deployed, in dungeons, or marked for exchange.", "warning");
                  return;
                }
                // Sort weakest first (ascending rank index)
                const sorted = [...available].sort((a, b) => {
                  const aIdx = RANKS.indexOf(a.rank || "E");
                  const bIdx = RANKS.indexOf(b.rank || "E");
                  return aIdx - bIdx;
                });
                const weakest = sorted[0];
                const success = await this.deploymentManager.deploy(weakest, user);
                if (success) {
                  const targetName = user.globalName || user.username || "User";
                  this._toast(`Deployed ${weakest.roleName || weakest.role || "Shadow"} [${weakest.rank || "E"}] to monitor ${targetName}`, "success");
                  this._widgetDirty = true;
                } else {
                  this._toast("Shadow already deployed or target already monitored", "warning");
                }
              } catch (err) {
                this.debugError("ContextMenu", "Auto-deploy failed", err);
                this._toast("Failed to deploy shadow", "error");
              }
            },
          });
        }

        const separator = BdApi.ContextMenu.buildItem({ type: "separator" });

        // Append to children
        if (tree && tree.props && tree.props.children) {
          if (Array.isArray(tree.props.children)) {
            tree.props.children.push(separator, menuItem);
          }
        }
      });
      this.debugLog("ContextMenu", "Patched user-context menu");
    } catch (err) {
      this.debugError("ContextMenu", "Failed to patch context menu", err);
    }
  },

  getSettingsPanel() {
    const React = BdApi.React;
    const ce = React.createElement;

    const deployCount = this.deploymentManager?.getDeploymentCount() || 0;
    const onlineMarkedCount = this.sensesEngine?.getMarkedOnlineCount?.() || 0;
    const sessionCount = this.sensesEngine?.getSessionMessageCount() || 0;
    const totalDetections = this.sensesEngine?.getTotalDetections() || 0;

    const statCardStyle = {
      background: "rgba(138, 43, 226, 0.1)",
      border: "1px solid rgba(138, 43, 226, 0.3)",
      borderRadius: "8px",
      padding: "12px",
      textAlign: "center",
    };
    const rowStyle = {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "12px",
      marginTop: "10px",
    };
    const startupArtworkUrl =
      typeof this._resolveStartupReportArtworkUrl === "function"
        ? this._resolveStartupReportArtworkUrl(this.settings.startupShadowReportArtwork)
        : "https://cdn.discordapp.com/embed/avatars/0.png";

    const updateSetting = (key, value) => {
      this.settings[key] = value;
      this.saveSettings();
      this._widgetDirty = true;
      if (typeof this._widgetForceUpdate === "function") this._widgetForceUpdate();
    };

    return ce("div", { style: { padding: "16px", background: "#1e1e2e", borderRadius: "8px", color: "#ccc" } },
      // Statistics header
      ce("h3", { style: { color: "#8a2be2", marginTop: 0, marginBottom: "12px" } }, "Shadow Senses Statistics"),

      ce("div", {
        style: {
          display: "flex",
          alignItems: "center",
          gap: "12px",
          marginBottom: "14px",
          padding: "10px 12px",
          borderRadius: "10px",
          border: "1px solid rgba(138, 43, 226, 0.35)",
          background: "linear-gradient(120deg, rgba(138, 43, 226, 0.16), rgba(10, 10, 18, 0.92))",
        },
      },
      ce("img", {
        src: startupArtworkUrl,
        alt: "Startup report artwork",
        style: {
          width: "52px",
          height: "52px",
          objectFit: "cover",
          borderRadius: "10px",
          border: "1px solid rgba(138, 43, 226, 0.5)",
          boxShadow: "0 0 14px rgba(138, 43, 226, 0.28)",
        },
        onError: (event) => {
          if (event?.target?.style) event.target.style.display = "none";
        },
      }),
      ce("div", null,
        ce("div", { style: { color: "#d6bcff", fontSize: "13px", fontWeight: "700", letterSpacing: "0.03em" } }, "Startup Shadow Report Art"),
        ce("div", { style: { color: "#9ca3af", fontSize: "11px", marginTop: "3px", lineHeight: 1.35 } },
          "Used for overview decoration and startup report popup dialogs."
        )
      )),

      // Stat cards grid
      ce("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" } },
        ce("div", { style: statCardStyle },
          ce("div", { style: { color: "#8a2be2", fontSize: "20px", fontWeight: "700" } }, deployCount),
          ce("div", { style: { color: "#999", fontSize: "11px" } }, "Deployed")
        ),
        ce("div", { style: statCardStyle },
          ce("div", { style: { color: "#8a2be2", fontSize: "20px", fontWeight: "700" } }, onlineMarkedCount),
          ce("div", { style: { color: "#999", fontSize: "11px" } }, "Marked Online")
        ),
        ce("div", { style: statCardStyle },
          ce("div", { style: { color: "#8a2be2", fontSize: "20px", fontWeight: "700" } }, sessionCount),
          ce("div", { style: { color: "#999", fontSize: "11px" } }, "Detections (since restart)")
        ),
        ce("div", { style: statCardStyle },
          ce("div", { style: { color: "#8a2be2", fontSize: "20px", fontWeight: "700" } }, totalDetections.toLocaleString()),
          ce("div", { style: { color: "#999", fontSize: "11px" } }, "Total Detections")
        )
      ),

      ce("h3", { style: { color: "#8a2be2", marginTop: 0, marginBottom: "8px", fontSize: "14px" } }, "Marked Utility Alerts"),

      ce("div", { style: rowStyle },
        ce("span", { style: { color: "#999", fontSize: "13px" } }, "Status Change Alerts"),
        ce("input", {
          type: "checkbox",
          defaultChecked: !!this.settings.statusAlerts,
          onChange: (e) => updateSetting("statusAlerts", e.target.checked),
          style: { accentColor: "#8a2be2" },
        })
      ),

      ce("div", { style: rowStyle },
        ce("span", { style: { color: "#999", fontSize: "13px" } }, "Startup Shadow Report"),
        ce("input", {
          type: "checkbox",
          defaultChecked: this.settings.startupShadowReport !== false,
          onChange: (e) => updateSetting("startupShadowReport", e.target.checked),
          style: { accentColor: "#8a2be2" },
        })
      ),

      ce("div", { style: rowStyle },
        ce("span", { style: { color: "#999", fontSize: "13px" } }, "Startup Report Window (hours)"),
        ce("input", {
          type: "number",
          min: 1,
          max: 72,
          step: 1,
          defaultValue: Number(this.settings.startupShadowReportWindowHours) || 24,
          onChange: (e) => {
            const hours = Number(e.target.value);
            if (!Number.isFinite(hours)) return;
            updateSetting("startupShadowReportWindowHours", Math.min(72, Math.max(1, Math.floor(hours))));
          },
          style: {
            width: "80px",
            padding: "4px 6px",
            borderRadius: "6px",
            border: "1px solid rgba(138, 43, 226, 0.4)",
            background: "#111827",
            color: "#ccc",
          },
        })
      ),

      ce("div", {
        style: {
          ...rowStyle,
          alignItems: "flex-start",
          flexDirection: "column",
          gap: "6px",
        },
      },
      ce("span", { style: { color: "#999", fontSize: "13px" } }, "Startup Report Artwork (PNG/JPG/SVG URL or file path)"),
      ce("input", {
        type: "text",
        placeholder: "/Downloads/Igris.svg or https://...",
        defaultValue: this.settings.startupShadowReportArtwork || "",
        onChange: (e) => updateSetting("startupShadowReportArtwork", e.target.value || ""),
        style: {
          width: "100%",
          padding: "8px 10px",
          borderRadius: "6px",
          border: "1px solid rgba(138, 43, 226, 0.35)",
          background: "rgba(30, 30, 46, 0.9)",
          color: "#e0e0e0",
          fontSize: "13px",
          outline: "none",
          boxSizing: "border-box",
        },
      }),
      ce("div", { style: { color: "#7f8593", fontSize: "11px", lineHeight: 1.35 } },
        "Supports /Downloads/Igris.svg, ~/Downloads/Igris.svg, absolute paths, and URLs."
      )),

      ce("div", { style: rowStyle },
        ce("span", { style: { color: "#999", fontSize: "13px" } }, "Typing Alerts"),
        ce("input", {
          type: "checkbox",
          defaultChecked: !!this.settings.typingAlerts,
          onChange: (e) => updateSetting("typingAlerts", e.target.checked),
          style: { accentColor: "#8a2be2" },
        })
      ),

      ce("div", { style: rowStyle },
        ce("span", { style: { color: "#999", fontSize: "13px" } }, "Removed Friend Alerts"),
        ce("input", {
          type: "checkbox",
          defaultChecked: !!this.settings.removedFriendAlerts,
          onChange: (e) => updateSetting("removedFriendAlerts", e.target.checked),
          style: { accentColor: "#8a2be2" },
        })
      ),

      ce("div", { style: rowStyle },
        ce("span", { style: { color: "#999", fontSize: "13px" } }, "Show Marked Online Count"),
        ce("input", {
          type: "checkbox",
          defaultChecked: !!this.settings.showMarkedOnlineCount,
          onChange: (e) => updateSetting("showMarkedOnlineCount", e.target.checked),
          style: { accentColor: "#8a2be2" },
        })
      ),

      ce("div", { style: rowStyle },
        ce("span", { style: { color: "#999", fontSize: "13px" } }, "Typing Alert Cooldown (seconds)"),
        ce("input", {
          type: "number",
          min: 3,
          max: 60,
          step: 1,
          defaultValue: Math.round((this.settings.typingAlertCooldownMs || DEFAULT_TYPING_ALERT_COOLDOWN_MS) / 1000),
          onChange: (e) => {
            const seconds = Number(e.target.value);
            if (!Number.isFinite(seconds)) return;
            updateSetting("typingAlertCooldownMs", Math.min(60000, Math.max(3000, Math.floor(seconds * 1000))));
          },
          style: {
            width: "80px",
            padding: "4px 6px",
            borderRadius: "6px",
            border: "1px solid rgba(138, 43, 226, 0.4)",
            background: "#111827",
            color: "#ccc",
          },
        })
      ),

      ce("div", { style: rowStyle },
        ce("span", { style: { color: "#999", fontSize: "13px" } }, "Group High Priority Bursts (P3/P4)"),
        ce("input", {
          type: "checkbox",
          defaultChecked: !!this.settings.groupHighPriorityBursts,
          onChange: (e) => updateSetting("groupHighPriorityBursts", e.target.checked),
          style: { accentColor: "#8a2be2" },
        })
      ),

      ce("h3", { style: { color: "#8a2be2", marginBottom: "8px", marginTop: "16px", fontSize: "14px" } }, "Feed Policy"),
      ce("div", {
        style: {
          marginTop: "6px",
          padding: "10px 12px",
          borderRadius: "8px",
          border: "1px solid rgba(138, 43, 226, 0.25)",
          background: "rgba(138, 43, 226, 0.08)",
          color: "#b8b8b8",
          fontSize: "12px",
          lineHeight: 1.45,
        },
      },
      "Status, typing, and connection alerts are toast-only and are not saved in Active Feed history. ",
      "Active Feed records chat message detections only. ",
      "Burst grouping uses a 20s window per author+channel; enable high-priority grouping if you want P3/P4 merged too."
      ),

      ce("h3", { style: { color: "#8a2be2", marginBottom: "8px", marginTop: "16px", fontSize: "14px" } }, "Priority Keywords"),
      ce("div", {
        style: {
          marginTop: "6px",
          padding: "10px 12px",
          borderRadius: "8px",
          border: "1px solid rgba(138, 43, 226, 0.25)",
          background: "rgba(138, 43, 226, 0.08)",
          color: "#b8b8b8",
          fontSize: "12px",
          lineHeight: 1.45,
          marginBottom: "8px",
        },
      },
      "Messages containing these keywords are bumped to P2 (Medium) priority. ",
      "P3 = @everyone/reply-to-you, P4 = direct @mention."
      ),
      ce("input", {
        type: "text",
        placeholder: "urgent, important, help, @here ...",
        defaultValue: (this.settings.priorityKeywords || []).join(", "),
        onChange: (e) => {
          const raw = e.target.value;
          const keywords = raw.split(",").map(s => s.trim()).filter(Boolean);
          updateSetting("priorityKeywords", keywords);
        },
        style: {
          width: "100%",
          padding: "8px 10px",
          borderRadius: "6px",
          border: "1px solid rgba(138, 43, 226, 0.35)",
          background: "rgba(30, 30, 46, 0.9)",
          color: "#e0e0e0",
          fontSize: "13px",
          outline: "none",
          boxSizing: "border-box",
        },
      }),

      ce("h3", { style: { color: "#ec4899", marginBottom: "8px", marginTop: "16px", fontSize: "14px" } }, "Mention Names"),
      ce("div", {
        style: {
          marginTop: "6px",
          padding: "10px 12px",
          borderRadius: "8px",
          border: "1px solid rgba(236, 72, 153, 0.25)",
          background: "rgba(236, 72, 153, 0.08)",
          color: "#b8b8b8",
          fontSize: "12px",
          lineHeight: 1.45,
          marginBottom: "8px",
        },
      },
      "When a monitored user says one of these names in a message, you get a toast notification and the feed card is highlighted pink. ",
      "Case-insensitive. Ranked P3 (High)."
      ),
      ce("input", {
        type: "text",
        placeholder: "Curio, bestie, your name ...",
        defaultValue: (this.settings.mentionNames || []).join(", "),
        onChange: (e) => {
          const raw = e.target.value;
          const names = raw.split(",").map(s => s.trim()).filter(Boolean);
          updateSetting("mentionNames", names);
        },
        style: {
          width: "100%",
          padding: "8px 10px",
          borderRadius: "6px",
          border: "1px solid rgba(236, 72, 153, 0.35)",
          background: "rgba(30, 30, 46, 0.9)",
          color: "#e0e0e0",
          fontSize: "13px",
          outline: "none",
          boxSizing: "border-box",
        },
      }),

      ce("h3", { style: { color: "#8a2be2", marginBottom: "8px", marginTop: "16px", fontSize: "14px" } }, "Diagnostics"),

      ce("div", { style: rowStyle },
        ce("span", { style: { color: "#999", fontSize: "13px" } }, "Debug Mode"),
        ce("input", {
          type: "checkbox",
          defaultChecked: this._debugMode,
          onChange: (e) => {
            this._debugMode = e.target.checked;
            BdApi.Data.save(PLUGIN_NAME, "debugMode", this._debugMode);
          },
          style: { accentColor: "#8a2be2" },
        })
      )
    );
  },
};

module.exports = ShadowSensesUiMethods;
