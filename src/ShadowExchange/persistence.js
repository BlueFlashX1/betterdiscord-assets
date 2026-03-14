function initBackupPath(plugin) {
  try {
    const pathModule = require("path");
    const fs = require("fs");
    const appSupport = pathModule.resolve(BdApi.Plugins.folder, "..", "..");
    const backupDir = pathModule.join(appSupport, "discord", "SoloLevelingBackups");
    fs.mkdirSync(backupDir, { recursive: true });
    plugin.fileBackupPath = pathModule.join(backupDir, "ShadowExchange.json");
  } catch (_) {
    plugin.fileBackupPath = null;
  }
}

function loadSettings(plugin, defaultSettings, { pluginId }) {
  const candidates = [];

  try {
    const bd = BdApi.Data.load(pluginId, "settings");
    if (bd && typeof bd === "object") {
      candidates.push({ source: "bdapi", data: bd });
    }
  } catch (error) {
    plugin.debugError("Settings", "Failed to load settings from BdApi.Data", error);
  }

  try {
    const file = readFileBackup(plugin);
    if (file && typeof file === "object") {
      candidates.push({ source: "file", data: file });
    }
  } catch (error) {
    plugin.debugError("Settings", "Failed to load settings from file backup", error);
  }

  if (candidates.length === 0) {
    plugin.settings = { ...defaultSettings, waypoints: [] };
    return;
  }

  const score = (candidate) => {
    const waypoints = Array.isArray(candidate.data.waypoints) ? candidate.data.waypoints.length : 0;
    const timestamp = candidate.data._metadata?.lastSave
      ? new Date(candidate.data._metadata.lastSave).getTime() || 0
      : 0;
    return waypoints * 1000 + timestamp / 1e10;
  };

  candidates.sort((a, b) => score(b) - score(a));
  const best = candidates[0].data;
  plugin.settings = {
    ...defaultSettings,
    ...best,
    waypoints: Array.isArray(best.waypoints) ? best.waypoints : [],
  };
}

function saveSettings(plugin) {
  if (plugin._saveDebounceTimer) clearTimeout(plugin._saveDebounceTimer);
  plugin._saveDebounceTimer = setTimeout(() => {
    plugin._saveDebounceTimer = null;
    plugin._flushSaveSettings();
  }, 500);
}

function flushSaveSettings(plugin, { pluginId, version }) {
  plugin._markedShadowIdsCache = null;
  plugin._waypointByLocationCache = null;
  plugin.settings._metadata = {
    lastSave: new Date().toISOString(),
    version,
  };

  try {
    BdApi.Data.save(pluginId, "settings", plugin.settings);
  } catch (error) {
    console.error("[ShadowExchange] BdApi.Data.save failed:", error);
  }

  writeFileBackup(plugin, plugin.settings);
}

function readFileBackup(plugin) {
  if (!plugin.fileBackupPath) return null;
  try {
    const fs = require("fs");
    const paths = [plugin.fileBackupPath];
    for (let i = 1; i <= 5; i += 1) paths.push(`${plugin.fileBackupPath}.bak${i}`);

    const candidates = [];
    for (const candidatePath of paths) {
      try {
        if (!fs.existsSync(candidatePath)) continue;
        const raw = fs.readFileSync(candidatePath, "utf8");
        const data = JSON.parse(raw);
        const quality = Array.isArray(data.waypoints) ? data.waypoints.length : 0;
        candidates.push({ data, quality, path: candidatePath });
      } catch (error) {
        plugin.debugError("Settings", `Failed to parse backup candidate ${candidatePath}`, error);
      }
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.quality - a.quality);
    return candidates[0].data;
  } catch (_) {
    return null;
  }
}

function writeFileBackup(plugin, data) {
  if (!plugin.fileBackupPath) return;
  try {
    const fs = require("fs");
    const json = JSON.stringify(data, null, 2);

    fs.writeFile(plugin.fileBackupPath, json, "utf8", (err) => {
      if (err) {
        console.error("[ShadowExchange] File backup write failed:", err);
        return;
      }

      for (let i = 4; i >= 1; i -= 1) {
        const src = `${plugin.fileBackupPath}.bak${i}`;
        const dest = `${plugin.fileBackupPath}.bak${i + 1}`;
        try {
          fs.renameSync(src, dest);
        } catch (_) {}
      }

      try {
        fs.copyFileSync(plugin.fileBackupPath, `${plugin.fileBackupPath}.bak1`);
      } catch (_copyErr) {
        // Fallback: manual copy if copyFileSync unavailable
        try {
          const data = fs.readFileSync(plugin.fileBackupPath);
          fs.writeFileSync(`${plugin.fileBackupPath}.bak1`, data);
        } catch (_) {}
      }
    });
  } catch (error) {
    console.error("[ShadowExchange] writeFileBackup error:", error);
  }
}

module.exports = {
  flushSaveSettings,
  initBackupPath,
  loadSettings,
  readFileBackup,
  saveSettings,
  writeFileBackup,
};
