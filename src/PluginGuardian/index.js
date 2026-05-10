// PluginGuardian — auto-enable on Discord launch.
//
// ON START: snapshot every installed plugin EXCEPT the user-controlled
// denylist (default ["CSS Picker"]) and run staged reconcile passes to
// enable any disabled members.
//
// STAGED LAUNCH PASSES (the critical detail):
//   BetterDiscord loads plugins alphabetically. PluginGuardian sits at
//   "P", so when start() fires, BdApi.Plugins.getAll() does NOT yet
//   include plugins whose name starts with Q-Z (Shadow*, SkillTree,
//   SoloLevelingTheme, SoloLevelingToasts, SystemWindow, etc). A single
//   snapshot-on-start would silently skip half the plugin set. We
//   schedule four passes — 0ms, 1s, 3s, 7s — and each pass refreshes
//   the snapshot before reconciling, so late-loading plugins are
//   picked up as they finish booting.
//
// REBUILD DETECTION REMOVED — fs.watch on macOS was unreliable and the
// `require("os")` it needed isn't whitelisted by BetterDiscord's sandbox
// (load-time ENOENT '/os'). Use the "Re-check now" button in settings
// after a rebuild, or just restart Discord.
//
// USER INTENT: "I want all my plugins active on every Discord launch
// without having to manually toggle anything."

const SELF_ID = "PluginGuardian";
const DEFAULT_DENYLIST = ["CSS Picker"];
const DATA_NAMESPACE = "PluginGuardian";
const DATA_KEY = "denylist";

// Launch reconcile schedule (ms after start). 0 = immediate catch for
// plugins loaded before us; 1s/3s/7s = catch progressively-laggier
// late-loaders (BD's plugin init is sequential and some plugins do
// async setup in their own start() before they're "really" enabled).
const LAUNCH_PASS_DELAYS_MS = [0, 1000, 3000, 7000];

module.exports = class PluginGuardian {
  constructor() {
    this._denylist = new Set();
    this._snapshot = new Set();
    this._launchTimers = [];
    this._stopped = true;
  }

  start() {
    this._stopped = false;
    this._loadDenylist();
    this._scheduleLaunchPasses();
  }

  stop() {
    this._stopped = true;
    this._clearLaunchTimers();
    this._snapshot.clear();
  }

  // ─── Launch pass pipeline ──────────────────────────────────────────────

  _scheduleLaunchPasses() {
    this._clearLaunchTimers();
    const totalPasses = LAUNCH_PASS_DELAYS_MS.length;
    LAUNCH_PASS_DELAYS_MS.forEach((delayMs, idx) => {
      const timer = setTimeout(() => {
        if (this._stopped) return;
        this._snapshotEnabled();
        this._reconcile();
        // Toast only on the final pass so the count reflects everything
        // that ended up loaded (including late arrivals).
        if (idx === totalPasses - 1 && BdApi.UI?.showToast) {
          const watchCount = this._snapshot.size;
          const denyCount = this._denylist.size;
          BdApi.UI.showToast(
            `PluginGuardian: ${watchCount} auto-enabled` +
              (denyCount ? ` · ${denyCount} skipped` : ""),
            { type: "success", timeout: 2500 }
          );
        }
      }, delayMs);
      this._launchTimers.push(timer);
    });
  }

  _clearLaunchTimers() {
    for (const t of this._launchTimers) {
      try { clearTimeout(t); } catch (_) {}
    }
    this._launchTimers = [];
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

    const explainer = document.createElement("p");
    explainer.style.margin = "0 0 12px 0";
    explainer.style.lineHeight = "1.5";
    explainer.style.color = "#a0a0b0";
    explainer.style.fontSize = "12px";
    explainer.textContent =
      "On Discord launch, every installed plugin is auto-enabled unless it's denylisted. " +
      "Tick a checkbox to denylist a plugin (it will be disabled now and left alone on future launches). " +
      "After a rebuild, use Re-check now (or just restart Discord) to re-enable any plugins BD silently disabled.";
    panel.appendChild(explainer);

    const status = document.createElement("p");
    status.style.margin = "0 0 12px 0";
    status.style.lineHeight = "1.5";
    status.style.color = "#a0a0b0";
    status.style.fontSize = "12px";
    const renderStatus = () => {
      status.textContent = `Enforcing ${this._snapshot.size} plugin${this._snapshot.size === 1 ? "" : "s"} · ${this._denylist.size} denylisted.`;
    };
    renderStatus();
    panel.appendChild(status);

    const recheckBtn = document.createElement("button");
    recheckBtn.style.padding = "7px 14px";
    recheckBtn.style.marginBottom = "12px";
    recheckBtn.style.background = "#5865f2";
    recheckBtn.style.color = "#fff";
    recheckBtn.style.border = "0";
    recheckBtn.style.borderRadius = "4px";
    recheckBtn.style.cursor = "pointer";
    recheckBtn.style.fontSize = "12px";
    recheckBtn.style.fontWeight = "600";
    recheckBtn.textContent = "Re-check now";
    recheckBtn.addEventListener("click", () => {
      this._snapshotEnabled();
      this._reconcile();
      renderStatus();
      if (BdApi.UI?.showToast) {
        BdApi.UI.showToast("PluginGuardian re-checked", { type: "info", timeout: 1500 });
      }
    });
    panel.appendChild(recheckBtn);

    // Checkbox list — one row per installed plugin (excluding self).
    const all = BdApi.Plugins.getAll() || [];
    const list = document.createElement("div");
    list.style.maxHeight = "320px";
    list.style.overflowY = "auto";
    list.style.padding = "8px 12px";
    list.style.background = "rgba(0,0,0,0.25)";
    list.style.border = "1px solid rgba(255,255,255,0.08)";
    list.style.borderRadius = "4px";

    const sortedIds = all
      .map((p) => p.id || p.name)
      .filter((id) => id && id !== SELF_ID)
      .sort((a, b) => a.localeCompare(b));

    for (const id of sortedIds) {
      const row = document.createElement("label");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "10px";
      row.style.padding = "5px 2px";
      row.style.cursor = "pointer";
      row.style.fontSize = "13px";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = this._denylist.has(id);

      const name = document.createElement("span");
      name.textContent = id;
      name.style.color = cb.checked ? "#a0a0b0" : "#dcddde";

      const tag = document.createElement("span");
      tag.style.marginLeft = "auto";
      tag.style.fontSize = "11px";
      tag.style.color = cb.checked ? "#f87171" : "#9b32ff";
      tag.textContent = cb.checked ? "denylisted" : "auto-enabled";

      cb.addEventListener("change", () => {
        if (cb.checked) {
          this._denylist.add(id);
          try { BdApi.Plugins.disable(id); } catch (_) {}
        } else {
          this._denylist.delete(id);
        }
        this._saveDenylist();
        this._snapshotEnabled();
        this._reconcile();
        name.style.color = cb.checked ? "#a0a0b0" : "#dcddde";
        tag.style.color = cb.checked ? "#f87171" : "#9b32ff";
        tag.textContent = cb.checked ? "denylisted" : "auto-enabled";
        renderStatus();
      });

      row.appendChild(cb);
      row.appendChild(name);
      row.appendChild(tag);
      list.appendChild(row);
    }
    panel.appendChild(list);

    return panel;
  }

  // ─── Settings persistence ──────────────────────────────────────────────

  _loadDenylist() {
    let saved = null;
    try { saved = BdApi.Data.load(DATA_NAMESPACE, DATA_KEY); } catch (_) {}
    if (Array.isArray(saved)) {
      this._denylist = new Set(saved.filter((x) => typeof x === "string" && x.length > 0));
    } else {
      this._denylist = new Set(DEFAULT_DENYLIST);
      this._saveDenylist();
    }
  }

  _saveDenylist() {
    try {
      BdApi.Data.save(DATA_NAMESPACE, DATA_KEY, Array.from(this._denylist));
    } catch (_) {}
  }

  // ─── Snapshot + reconcile ──────────────────────────────────────────────

  _snapshotEnabled() {
    this._snapshot.clear();
    const all = BdApi.Plugins.getAll() || [];
    for (const plugin of all) {
      const id = plugin.id || plugin.name;
      if (!id || id === SELF_ID || this._denylist.has(id)) continue;
      this._snapshot.add(id);
    }
  }

  _reconcile() {
    for (const id of this._snapshot) {
      if (id === SELF_ID) continue;
      try {
        if (!BdApi.Plugins.isEnabled(id)) {
          BdApi.Plugins.enable(id);
          console.log(`[PluginGuardian] Auto-enabled "${id}"`);
        }
      } catch (err) {
        console.error(`[PluginGuardian] Failed to enable "${id}":`, err);
      }
    }
  }
};
