const {
  DEFAULT_TYPING_ALERT_COOLDOWN_MS,
  PANEL_CONTAINER_ID,
  PLUGIN_NAME,
  STYLE_ID,
} = require("./constants");
const { buildCSS } = require("./styles");
const { getCreateRoot } = require("../shared/react-dom");
const { showToolbarTooltip, hideToolbarTooltip, removeToolbarTooltip, ensureTooltipCSS } = require("../shared/toolbar-tooltip");
const { isVoiceChannelChat } = require("../shared/channel-context");
const { watchToolbar } = require("../shared/header-toolbar");
const { onKeydown } = require("../shared/dom-bus");

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

  _getCreateRoot() {
    return getCreateRoot();
  },

  // Panel

  openPanel() {
    try {
      if (!this._components?.SensesPanel) {
        this.debugError?.("Panel", "Components not initialized");
        return;
      }

      if (this._popupReactRoot) {
        this._closeSensesPopup();
        return;
      }
      if (this._panelReactRoot) {
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
      // Remove any previously registered handler before adding a new one.
      // Prevents accumulation when the panel is opened multiple times.
      if (this._escUnsub) {
        this._escUnsub();
        this._escUnsub = null;
        this._escHandler = null;
      }
      this._escHandler = (e) => {
        if (e.key !== "Escape") return;
        if (this._panelOpen) {
          this.closePanel();
          e.stopPropagation();
        }
      };
      this._escUnsub = onKeydown(this._escHandler, { capture: false });
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
              // Immediate feedback — the shadow lookup below is async and
              // there must never be silent dead air between click and toast.
              this._toast("Deploying shadow…", "info");
              // Try-catch only around risky async shadow loading
              let weakest;
              try {
                weakest = this.deploymentManager
                  ? await this.deploymentManager.getWeakestAvailableShadow()
                  : null;
              } catch (err) {
                this.debugError("ContextMenu", "Failed to load available shadows", err);
                this._toast("Failed to load shadows", "error");
                return;
              }

              try {
                if (!weakest) {
                  this._toast("No available shadows. All are deployed, in dungeons, or marked for exchange.", "warning");
                  return;
                }
                const success = await this.deploymentManager.deploy(weakest, user);
                if (success) {
                  const targetName = user.globalName || user.username || "User";
                  this._toast(`Deployed ${weakest.roleName || weakest.role || "Shadow"} [${weakest.rank || "E"}] to monitor ${targetName}`, "success");
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
        if (tree && tree.props && Array.isArray(tree.props.children)) {
          tree.props.children.push(separator, menuItem);
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
    if (this._unwatchSensesToolbar) return;
    // Event-driven re-injection via shared/header-toolbar.js. Replaces
    // the prior 5s setInterval self-heal loop. CHANNEL_SELECT +
    // VOICE_STATE_UPDATES + narrow MutationObserver on #app-mount cover
    // every case the poll was guarding against. Fires once on attach so
    // the icon paints on initial mount.
    this._unwatchSensesToolbar = watchToolbar(() => {
      if (this._stopped) return;
      if (document.hidden) return;
      this._ensureSensesHeaderIcon();
    });
  },

  stopSensesHeaderIcon() {
    if (this._unwatchSensesToolbar) {
      try { this._unwatchSensesToolbar(); } catch (_) {}
      this._unwatchSensesToolbar = null;
    }
    const existing = document.getElementById(this._SENSES_HEADER_ICON_ID);
    if (existing) existing.remove();
    removeToolbarTooltip('sl-toolbar-tip-ss');
  },

  _ensureSensesHeaderIcon() {
    // Hide in voice-channel chat — plugin icons aren't useful there.
    if (isVoiceChannelChat()) {
      const stale = document.getElementById(this._SENSES_HEADER_ICON_ID);
      if (stale) stale.remove();
      return;
    }

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
      opacity: 0.85;
      border-radius: 2px;
      margin: 0 2px;
      transition: opacity 0.15s ease, background 0.15s ease, color 0.15s ease;
    `;
    wrapper.innerHTML = this._getSensesHeaderSVG();
    ensureTooltipCSS();

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
      border-radius: 2px;
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
      font-family: 'gg sans', system-ui, sans-serif;
    `;
    badge.textContent = '0';
    wrapper.appendChild(badge);

    // Hover effects
    wrapper.addEventListener('mouseenter', () => {
      wrapper.style.color = '#dcddde';
      wrapper.style.opacity = '1';
      wrapper.style.background = 'rgba(138,43,226,0.15)';
      showToolbarTooltip(wrapper, 'sl-toolbar-tip-ss', 'Shadow Senses');
    });
    wrapper.addEventListener('mouseleave', () => {
      wrapper.style.color = '#b5bac1';
      wrapper.style.opacity = '0.85';
      wrapper.style.background = '';
      hideToolbarTooltip('sl-toolbar-tip-ss');
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
      background: linear-gradient(165deg, rgba(22, 18, 32, 0.97) 0%, rgba(13, 12, 20, 0.97) 55%, rgba(10, 10, 16, 0.98) 100%);
      border: 1px solid rgba(138, 43, 226, 0.32);
      border-radius: 2px;
      box-shadow: 0 20px 52px rgba(0, 0, 0, 0.66), 0 0 24px rgba(138, 43, 226, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.06), inset 0 0 0 1px rgba(138, 43, 226, 0.06);
      scrollbar-width: thin;
      scrollbar-color: rgba(138,43,226,0.85) rgba(8,8,13,0.55);
      font-family: 'gg sans', 'Helvetica Neue', system-ui, sans-serif;
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
    document.addEventListener('click', this._popupOutsideClickHandler, true);

    // Close on ESC
    this._popupEscHandler = (e) => {
      if (e.key === 'Escape') {
        this._closeSensesPopup();
        e.stopPropagation();
      }
    };
    this._popupEscUnsub = onKeydown(this._popupEscHandler, { capture: true });

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
    if (this._popupEscUnsub) {
      this._popupEscUnsub();
      this._popupEscUnsub = null;
    }
    this._popupEscHandler = null;

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
      borderRadius: "2px",
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
    };

    return ce("div", { style: { padding: "16px", background: "rgba(10, 10, 16, 0.98)", borderRadius: "2px", color: "#dcddde" } },
      // Statistics header
      ce("h3", { style: { color: "#8a2be2", marginTop: 0, marginBottom: "12px" } }, "Shadow Senses Statistics"),

      ce("div", {
        style: {
          display: "flex",
          alignItems: "center",
          gap: "12px",
          marginBottom: "14px",
          padding: "10px 12px",
          borderRadius: "2px",
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
          borderRadius: "2px",
          border: "1px solid rgba(138, 43, 226, 0.5)",
          boxShadow: "0 0 14px rgba(138, 43, 226, 0.28)",
        },
        onError: (event) => {
          if (event?.target?.style) event.target.style.display = "none";
        },
      }),
      ce("div", null,
        ce("div", { style: { color: "#dcddde", fontSize: "13px", fontWeight: "700", letterSpacing: "0.03em" } }, "Startup Shadow Report Art"),
        ce("div", { style: { color: "#b5bac1", fontSize: "11px", marginTop: "3px", lineHeight: 1.35 } },
          "Used for overview decoration and startup report popup dialogs."
        )
      )),

      // Stat cards grid
      ce("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" } },
        ce("div", { style: statCardStyle },
          ce("div", { style: { color: "#8a2be2", fontSize: "20px", fontWeight: "700" } }, deployCount),
          ce("div", { style: { color: "#b5bac1", fontSize: "11px" } }, "Deployed")
        ),
        ce("div", { style: statCardStyle },
          ce("div", { style: { color: "#8a2be2", fontSize: "20px", fontWeight: "700" } }, onlineMarkedCount),
          ce("div", { style: { color: "#b5bac1", fontSize: "11px" } }, "Marked Online")
        ),
        ce("div", { style: statCardStyle },
          ce("div", { style: { color: "#8a2be2", fontSize: "20px", fontWeight: "700" } }, sessionCount),
          ce("div", { style: { color: "#b5bac1", fontSize: "11px" } }, "Detections (since restart)")
        ),
        ce("div", { style: statCardStyle },
          ce("div", { style: { color: "#8a2be2", fontSize: "20px", fontWeight: "700" } }, totalDetections.toLocaleString()),
          ce("div", { style: { color: "#b5bac1", fontSize: "11px" } }, "Total Detections")
        )
      ),

      ce("h3", { style: { color: "#8a2be2", marginTop: 0, marginBottom: "8px", fontSize: "14px" } }, "Marked Utility Alerts"),

      ce("div", { style: rowStyle },
        ce("span", { style: { color: "#b5bac1", fontSize: "13px" } }, "Status Change Alerts"),
        ce("input", {
          type: "checkbox",
          defaultChecked: !!this.settings.statusAlerts,
          onChange: (e) => updateSetting("statusAlerts", e.target.checked),
          style: { accentColor: "#8a2be2" },
        })
      ),

      ce("div", { style: rowStyle },
        ce("span", { style: { color: "#b5bac1", fontSize: "13px" } }, "Report to the Monarch (in-character voice)"),
        ce("input", {
          type: "checkbox",
          defaultChecked: this.settings.reportToMonarch !== false,
          onChange: (e) => updateSetting("reportToMonarch", e.target.checked),
          style: { accentColor: "#8a2be2" },
        })
      ),

      ce("div", { style: rowStyle },
        ce("span", { style: { color: "#b5bac1", fontSize: "13px" } }, "Startup Shadow Report"),
        ce("input", {
          type: "checkbox",
          defaultChecked: this.settings.startupShadowReport !== false,
          onChange: (e) => updateSetting("startupShadowReport", e.target.checked),
          style: { accentColor: "#8a2be2" },
        })
      ),

      // #4: window mode — fixed hours OR since last successful report
      ce("div", { style: rowStyle },
        ce("span", { style: { color: "#b5bac1", fontSize: "13px" } }, "Use 'since last report' window"),
        ce("input", {
          type: "checkbox",
          defaultChecked: !!this.settings.startupReportSinceLastSession,
          onChange: (e) => updateSetting("startupReportSinceLastSession", e.target.checked),
          style: { accentColor: "#8a2be2" },
        })
      ),

      ce("div", { style: rowStyle },
        ce("span", { style: { color: "#b5bac1", fontSize: "13px" } }, "Startup Report Window (hours, max)"),
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
            borderRadius: "2px",
            border: "1px solid rgba(138, 43, 226, 0.4)",
            background: "rgba(0,0,0,0.3)",
            color: "#dcddde",
          },
        })
      ),

      // OpenAI API key + explicit privacy disclosure (audit Wave B / #6 / #8)
      ce("div", { style: { ...rowStyle, alignItems: "flex-start", flexDirection: "column", gap: "6px" } },
        ce("span", { style: { color: "#b5bac1", fontSize: "13px" } }, "OpenAI API Key (optional)"),
        ce("input", {
          type: "password",
          placeholder: "sk-... (leave empty for local fallback narration)",
          defaultValue: this.settings.startupReportApiKey || "",
          onChange: (e) => updateSetting("startupReportApiKey", String(e.target.value || "").trim()),
          style: {
            width: "100%",
            padding: "5px 8px",
            borderRadius: "2px",
            border: "1px solid rgba(138, 43, 226, 0.4)",
            background: "rgba(0,0,0,0.3)",
            color: "#dcddde",
            fontFamily: "monospace",
            fontSize: "12px",
            boxSizing: "border-box",
          },
        }),
        ce("div", {
          style: {
            fontSize: "11px",
            color: "#b5bac1",
            lineHeight: 1.4,
            padding: "4px 0",
          },
        },
          "Privacy: when a key is set, the report sends Discord usernames, server/channel names, ",
          "and short message snippets (up to 180 chars per signal) to OpenAI. ",
          "Leave empty to use the offline fallback narration — no data leaves your machine. ",
          "Key is stored in plain text via BdApi.Data."
        )
      ),

      ce("div", {
        style: {
          ...rowStyle,
          alignItems: "flex-start",
          flexDirection: "column",
          gap: "6px",
        },
      },
      ce("span", { style: { color: "#b5bac1", fontSize: "13px" } }, "Startup Report Artwork (PNG/JPG/SVG URL or file path)"),
      ce("input", {
        type: "text",
        placeholder: "/Downloads/Igris.svg or https://...",
        defaultValue: this.settings.startupShadowReportArtwork || "",
        onChange: (e) => updateSetting("startupShadowReportArtwork", e.target.value || ""),
        style: {
          width: "100%",
          padding: "8px 10px",
          borderRadius: "2px",
          border: "1px solid rgba(138, 43, 226, 0.35)",
          background: "rgba(0,0,0,0.3)",
          color: "#dcddde",
          fontSize: "13px",
          outline: "none",
          boxSizing: "border-box",
        },
      }),
      ce("div", { style: { color: "#b5bac1", fontSize: "11px", lineHeight: 1.35 } },
        "Supports /Downloads/Igris.svg, ~/Downloads/Igris.svg, absolute paths, and URLs."
      )),

      ce("div", { style: rowStyle },
        ce("span", { style: { color: "#b5bac1", fontSize: "13px" } }, "Typing Alerts"),
        ce("input", {
          type: "checkbox",
          defaultChecked: !!this.settings.typingAlerts,
          onChange: (e) => updateSetting("typingAlerts", e.target.checked),
          style: { accentColor: "#8a2be2" },
        })
      ),

      ce("div", { style: rowStyle },
        ce("span", { style: { color: "#b5bac1", fontSize: "13px" } }, "Suppress typing alerts in the channel you're viewing"),
        ce("input", {
          type: "checkbox",
          defaultChecked: !!this.settings.suppressTypingInViewedChannel,
          onChange: (e) => updateSetting("suppressTypingInViewedChannel", e.target.checked),
          style: { accentColor: "#8a2be2" },
        })
      ),

      ce("div", { style: rowStyle },
        ce("span", { style: { color: "#b5bac1", fontSize: "13px" } }, "Removed Friend Alerts"),
        ce("input", {
          type: "checkbox",
          defaultChecked: !!this.settings.removedFriendAlerts,
          onChange: (e) => updateSetting("removedFriendAlerts", e.target.checked),
          style: { accentColor: "#8a2be2" },
        })
      ),

      ce("div", { style: rowStyle },
        ce("span", { style: { color: "#b5bac1", fontSize: "13px" } }, "Show Marked Online Count"),
        ce("input", {
          type: "checkbox",
          defaultChecked: !!this.settings.showMarkedOnlineCount,
          onChange: (e) => updateSetting("showMarkedOnlineCount", e.target.checked),
          style: { accentColor: "#8a2be2" },
        })
      ),

      ce("div", { style: rowStyle },
        ce("span", { style: { color: "#b5bac1", fontSize: "13px" } }, "Typing Alert Cooldown (seconds)"),
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
            borderRadius: "2px",
            border: "1px solid rgba(138, 43, 226, 0.4)",
            background: "rgba(0,0,0,0.3)",
            color: "#dcddde",
          },
        })
      ),

      ce("div", { style: rowStyle },
        ce("span", { style: { color: "#b5bac1", fontSize: "13px" } }, "Group High Priority Bursts (P3/P4)"),
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
          borderRadius: "2px",
          border: "1px solid rgba(138, 43, 226, 0.25)",
          background: "rgba(138, 43, 226, 0.08)",
          color: "#dcddde",
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
          borderRadius: "2px",
          border: "1px solid rgba(138, 43, 226, 0.25)",
          background: "rgba(138, 43, 226, 0.08)",
          color: "#dcddde",
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
          borderRadius: "2px",
          border: "1px solid rgba(138, 43, 226, 0.35)",
          background: "rgba(0,0,0,0.3)",
          color: "#dcddde",
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
          borderRadius: "2px",
          border: "1px solid rgba(236, 72, 153, 0.25)",
          background: "rgba(236, 72, 153, 0.08)",
          color: "#dcddde",
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
          borderRadius: "2px",
          border: "1px solid rgba(236, 72, 153, 0.35)",
          background: "rgba(0,0,0,0.3)",
          color: "#dcddde",
          fontSize: "13px",
          outline: "none",
          boxSizing: "border-box",
        },
      }),

      ce("h3", { style: { color: "#8a2be2", marginBottom: "8px", marginTop: "16px", fontSize: "14px" } }, "Diagnostics"),

      ce("div", { style: rowStyle },
        ce("span", { style: { color: "#b5bac1", fontSize: "13px" } }, "Debug Mode"),
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
