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

  // Widget Injection

  _getMembersWrap() {
    try {
      // PERF: Cache the found wrap element for 2s
      const now = Date.now();
      if (this._cachedMembersWrap && this._cachedMembersWrapTs && (now - this._cachedMembersWrapTs < 2000)) {
        // PERF: isConnected is O(1) with no layout cost; offsetParent removed (forced layout flush)
        if (this._cachedMembersWrap.isConnected) {
          return this._cachedMembersWrap;
        }
        // Stale — clear and re-query
        this._cachedMembersWrap = null;
        this._cachedMembersWrapTs = 0;
      }

      const dc = require('../shared/discord-classes');
      const wraps = document.querySelectorAll(dc.sel.membersWrap);
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
      const membersList = membersWrap.querySelector(require('../shared/discord-classes').sel.members);
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

  // Panel

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

      // Clear unread badge — user is now viewing live feed
      if (this.sensesEngine?.clearUnread) {
        this.sensesEngine.clearUnread();
      }

      this.debugLog("Panel", "Opened");
    } catch (err) {
      this.debugError("Panel", "Failed to open panel", err);
    }
  },

  closePanel() {
    try {
      // Close popup if open
      this._closeSensesPopup();

      // Close legacy full-screen panel if open
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

  // ESC Handler

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

  // Context Menu

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

  // ─── Channel Header Icon ─────────────────────────────
  // Eye-shaped SVG icon in the channel header toolbar with unread badge.

  _SENSES_HEADER_ICON_ID: 'shadow-senses-header-icon',

  _HEADER_TOOLBAR_SELECTORS: [
    '[aria-label="Channel header"] [class*="toolbar_"]',
    '[class*="titleWrapper_"] [class*="toolbar_"]',
    'header [class*="toolbar_"]',
  ],

  _getHeaderToolbar() {
    for (const sel of this._HEADER_TOOLBAR_SELECTORS) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) return el;
    }
    return null;
  },

  _getSensesHeaderSVG() {
    // Monarch's eye — shadow senses icon
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/>
      <circle cx="12" cy="12" r="3.5"/>
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>
    </svg>`;
  },

  startSensesHeaderIcon() {
    if (this._sensesHeaderIconLoop) return;

    const tick = () => {
      if (this._stopped) return;
      if (document.hidden) return;
      this._ensureSensesHeaderIcon();
    };

    this._ensureSensesHeaderIcon();
    this._sensesHeaderIconLoop = setInterval(tick, 1000);
  },

  stopSensesHeaderIcon() {
    if (this._sensesHeaderIconLoop) {
      clearInterval(this._sensesHeaderIconLoop);
      this._sensesHeaderIconLoop = null;
    }
    const existing = document.getElementById(this._SENSES_HEADER_ICON_ID);
    if (existing) existing.remove();
  },

  _ensureSensesHeaderIcon() {
    const existing = document.getElementById(this._SENSES_HEADER_ICON_ID);
    if (existing?.isConnected) {
      // Just update badge
      this._updateSensesHeaderBadge(existing);
      return;
    }

    const toolbar = this._getHeaderToolbar();
    if (!toolbar) return;

    // Don't duplicate
    if (toolbar.querySelector(`#${this._SENSES_HEADER_ICON_ID}`)) return;

    const wrapper = document.createElement('div');
    wrapper.id = this._SENSES_HEADER_ICON_ID;
    wrapper.style.cssText = `
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      cursor: pointer;
      color: #b5bac1;
      margin: 0 4px;
      transition: color 0.15s ease;
    `;
    wrapper.title = 'Shadow Senses';
    wrapper.innerHTML = this._getSensesHeaderSVG();

    // Badge element
    const badge = document.createElement('div');
    badge.className = 'ss-header-badge';
    badge.style.cssText = `
      position: absolute;
      top: -4px;
      right: -6px;
      min-width: 16px;
      height: 16px;
      padding: 0 4px;
      border-radius: 8px;
      background: #ed4245;
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      display: none;
      align-items: center;
      justify-content: center;
      line-height: 16px;
      box-sizing: border-box;
      pointer-events: none;
      font-family: var(--font-primary), 'gg sans', sans-serif;
    `;
    badge.textContent = '0';
    wrapper.appendChild(badge);

    // Hover effects
    wrapper.addEventListener('mouseenter', () => {
      wrapper.style.color = '#dcddde';
    });
    wrapper.addEventListener('mouseleave', () => {
      wrapper.style.color = '#b5bac1';
    });

    // Click → toggle popup anchored to icon
    wrapper.addEventListener('click', (e) => {
      e.stopPropagation();
      // Clear unread
      if (this.sensesEngine?.clearUnread) {
        this.sensesEngine.clearUnread();
      }
      this._updateSensesHeaderBadge(wrapper);
      this._toggleSensesPopup(wrapper);
    });

    // Insert before first child (leftmost position in toolbar)
    if (toolbar.firstChild) {
      toolbar.insertBefore(wrapper, toolbar.firstChild);
    } else {
      toolbar.appendChild(wrapper);
    }

    this._updateSensesHeaderBadge(wrapper);
  },

  _updateSensesHeaderBadge(wrapper) {
    const badge = wrapper?.querySelector('.ss-header-badge');
    if (!badge) return;

    const unread = this.sensesEngine?.getUnreadCount?.() || 0;
    if (unread > 0) {
      badge.textContent = unread > 99 ? '99+' : String(unread);
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  },

  // ─── Senses Popup (anchored to header icon) ──────────

  _SENSES_POPUP_ID: 'shadow-senses-header-popup',

  _toggleSensesPopup(anchorEl) {
    const existing = document.getElementById(this._SENSES_POPUP_ID);
    if (existing) {
      this._closeSensesPopup();
      return;
    }
    this._openSensesPopup(anchorEl);
  },

  _openSensesPopup(anchorEl) {
    if (!this._components?.SensesPanel) {
      this.debugError?.("Popup", "Components not initialized");
      return;
    }

    this._closeSensesPopup(); // clean stale

    const createRoot = this._getCreateRoot();
    if (!createRoot) return;

    const popup = document.createElement('div');
    popup.id = this._SENSES_POPUP_ID;
    popup.style.cssText = `
      position: fixed;
      z-index: 10001;
      width: 480px;
      max-height: calc(100vh - 80px);
      overflow-y: auto;
      background: linear-gradient(135deg, #1a1a2e 0%, #16162a 100%);
      border: 1px solid rgba(138, 43, 226, 0.35);
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), 0 0 20px rgba(138, 43, 226, 0.15);
      scrollbar-width: thin;
      scrollbar-color: rgba(138,43,226,0.3) transparent;
    `;

    document.body.appendChild(popup);

    // Position below anchor
    this._positionSensesPopup(popup, anchorEl);

    // Mount React panel inside popup
    const root = createRoot(popup);
    root.render(BdApi.React.createElement(this._components.SensesPanel, {
      onClose: () => this._closeSensesPopup(),
      embedded: true, // signal to panel component it's in popup mode
    }));
    this._popupReactRoot = root;
    this._panelOpen = true;

    // Close on outside click
    this._popupOutsideClickHandler = (e) => {
      if (!popup.contains(e.target) && !anchorEl?.contains(e.target)) {
        this._closeSensesPopup();
      }
    };
    setTimeout(() => {
      document.addEventListener('click', this._popupOutsideClickHandler, true);
    }, 50);

    // Close on ESC
    this._popupEscHandler = (e) => {
      if (e.key === 'Escape') {
        this._closeSensesPopup();
        e.stopPropagation();
      }
    };
    document.addEventListener('keydown', this._popupEscHandler, true);

    this.debugLog("Popup", "Opened");
  },

  _positionSensesPopup(popup, anchorEl) {
    if (!anchorEl || !popup) return;
    const rect = anchorEl.getBoundingClientRect();
    const vpW = window.innerWidth;
    const vpH = window.innerHeight;

    // Position below the icon, right-aligned
    let top = rect.bottom + 8;
    let left = rect.right - 480;

    // Clamp to viewport
    if (left < 8) left = 8;
    if (left + 480 > vpW - 8) left = vpW - 488;
    if (top + 400 > vpH) top = rect.top - 400 - 8; // flip above if no room

    popup.style.top = `${top}px`;
    popup.style.left = `${left}px`;
  },

  _closeSensesPopup() {
    if (this._popupReactRoot) {
      try { this._popupReactRoot.unmount(); } catch (_) {}
      this._popupReactRoot = null;
    }
    const popup = document.getElementById(this._SENSES_POPUP_ID);
    if (popup) popup.remove();

    if (this._popupOutsideClickHandler) {
      document.removeEventListener('click', this._popupOutsideClickHandler, true);
      this._popupOutsideClickHandler = null;
    }
    if (this._popupEscHandler) {
      document.removeEventListener('keydown', this._popupEscHandler, true);
      this._popupEscHandler = null;
    }

    this._panelOpen = false;
    this.debugLog("Popup", "Closed");
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
