// PluginGuardian — auto-re-enable companion for the BD rename-event race.
//
// THE BUG: BetterDiscord's plugin file watcher has two paths. The `change`
// event path is safe (preserves enabled state). The `rename` event path
// calls `loadAddon` directly without first unloading; `requireAddon` then
// throws "alreadyExists" because the plugin is still in addonList; the
// catch block silently sets `state[id] = false`. macOS fs.watch fires
// `rename` events for many file operations, so any rebuild can silently
// disable a plugin — no console error, no user notification.
//
// FIX: snapshot the set of currently-enabled plugins on start(). Poll every
// 500ms; if anything in the snapshot is disabled, re-enable it.
//
// USER INTENT: when the user wants to permanently disable a plugin, the
// flow is:
//   1. Toggle the plugin off in BD settings
//   2. Open PluginGuardian's settings → click "Re-snapshot"
// We can't reliably distinguish user toggles from BD races without patching
// frozen BD internals, so we make the user re-snapshot explicitly. Trade-off:
// a button click instead of fighting BD's frozen API.

const POLL_INTERVAL_MS = 500;
const SELF_ID = "PluginGuardian";

module.exports = class PluginGuardian {
  constructor() {
    this._snapshot = new Set();
    this._interval = null;
  }

  start() {
    this._snapshotEnabled();
    this._startPolling();

    if (BdApi.UI && typeof BdApi.UI.showToast === "function") {
      BdApi.UI.showToast(
        `PluginGuardian active — watching ${this._snapshot.size} plugin${this._snapshot.size === 1 ? "" : "s"}`,
        { type: "success", timeout: 2500 }
      );
    }
  }

  stop() {
    this._stopPolling();
    this._snapshot.clear();
  }

  // ─── Settings panel ─────────────────────────────────────────────────────

  getSettingsPanel() {
    const panel = document.createElement("div");
    panel.style.padding = "16px";
    panel.style.color = "#dcddde";
    panel.style.fontFamily = "Whitney, sans-serif";
    panel.style.background = "#1e1e2e";

    const title = document.createElement("h3");
    title.style.margin = "0 0 12px 0";
    title.style.color = "#fff";
    title.textContent = "PluginGuardian";
    panel.appendChild(title);

    const status = document.createElement("p");
    status.style.margin = "0 0 8px 0";
    status.style.lineHeight = "1.5";
    status.textContent = `Watching ${this._snapshot.size} plugin${this._snapshot.size === 1 ? "" : "s"}.`;
    panel.appendChild(status);

    const explainer = document.createElement("p");
    explainer.style.margin = "0 0 12px 0";
    explainer.style.lineHeight = "1.5";
    explainer.style.color = "#a0a0b0";
    explainer.style.fontSize = "12px";
    explainer.textContent =
      "Auto-re-enables plugins that BetterDiscord silently disables due to its rename-event " +
      "race when you rebuild. To intentionally turn a plugin off: toggle it off in BD " +
      "settings, then come back here and click Re-snapshot so Guardian stops watching it.";
    panel.appendChild(explainer);

    const button = document.createElement("button");
    button.style.padding = "8px 14px";
    button.style.background = "#5865f2";
    button.style.color = "#fff";
    button.style.border = "0";
    button.style.borderRadius = "4px";
    button.style.cursor = "pointer";
    button.style.fontSize = "13px";
    button.textContent = "Re-snapshot from current state";
    button.addEventListener("click", () => {
      this._snapshotEnabled();
      status.textContent = `Watching ${this._snapshot.size} plugin${this._snapshot.size === 1 ? "" : "s"}.`;
      if (BdApi.UI && typeof BdApi.UI.showToast === "function") {
        BdApi.UI.showToast(
          `Snapshot updated — watching ${this._snapshot.size} plugins`,
          { type: "info", timeout: 2000 }
        );
      }
    });
    panel.appendChild(button);

    return panel;
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  _snapshotEnabled() {
    this._snapshot.clear();
    const all = BdApi.Plugins.getAll() || [];
    for (const plugin of all) {
      const id = plugin.id || plugin.name;
      if (!id || id === SELF_ID) continue;
      if (BdApi.Plugins.isEnabled(id)) this._snapshot.add(id);
    }
  }

  _startPolling() {
    this._interval = setInterval(() => this._reconcile(), POLL_INTERVAL_MS);
  }

  _stopPolling() {
    if (this._interval) clearInterval(this._interval);
    this._interval = null;
  }

  _reconcile() {
    for (const id of this._snapshot) {
      if (id === SELF_ID) continue;
      try {
        if (!BdApi.Plugins.isEnabled(id)) {
          BdApi.Plugins.enable(id);
          console.log(`[PluginGuardian] Re-enabled "${id}" after BD race`);
        }
      } catch (err) {
        console.error(`[PluginGuardian] Failed to re-enable "${id}":`, err);
      }
    }
  }
};
