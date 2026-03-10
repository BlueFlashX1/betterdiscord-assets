const STEALTH_PLUGIN_ID = "Stealth";

function attachStealthStatusPolicyMethods(StealthClass) {
  Object.assign(StealthClass.prototype, {
    _syncStatusPolicy() {
      const shouldForceInvisible = this.settings.enabled && this.settings.invisibleStatus;

      if (!shouldForceInvisible) {
        if (this._forcedInvisible) {
          this._restoreOriginalStatus();
          this._forcedInvisible = false;
        }
        return;
      }

      // Event-driven: proto patch intercepts at source, flux listener is safety net.
      // No polling needed — _patchProtoStatusUpdate() and USER_SETTINGS_PROTO_UPDATE handle it.
      const forced = this._ensureInvisibleStatus();
      if (!forced && this.settings.showToasts) {
        this._toast("Stealth: could not force Invisible status", "warning");
      }
    },

    _resolveStatusSetters() {
      const candidates = [];

      const add = (module, fnName) => {
        if (!module || typeof module[fnName] !== "function") return;
        candidates.push({ module, fnName });
      };

      const addByKeys = (...keys) => {
        try {
          const mod = BdApi.Webpack.getByKeys(...keys);
          if (!mod) return;
          keys.forEach((key) => add(mod, key));
        } catch (error) {
          this._logWarning(
            "STATUS",
            `Status setter lookup failed: ${keys.join(",")}`,
            error,
            `status-lookup:${keys.join(",")}`
          );
        }
      };

      addByKeys("setStatus", "getStatus");
      addByKeys("setStatus");
      addByKeys("updateStatus");
      addByKeys("setPresence");

      try {
        const mod = BdApi.Webpack.getModule(
          (m) => m && typeof m.setStatus === "function"
        );
        add(mod, "setStatus");
      } catch (error) {
        this._logWarning("STATUS", "Fallback setStatus module scan failed", error, "status-fallback-scan");
      }

      const unique = [];
      const seen = new WeakMap();

      candidates.forEach((entry) => {
        const { module, fnName } = entry;
        if (!seen.has(module)) {
          seen.set(module, new Set());
        }
        const fnSet = seen.get(module);
        if (fnSet.has(fnName)) return;
        fnSet.add(fnName);
        unique.push(entry);
      });

      return unique;
    },

    /** Find Discord's PreloadedUserSettings proto module.
     *  This is the REAL status-change mechanism in modern Discord —
     *  updateAsync("status", cb) is what the UI status picker calls. */
    _initProtoUtils() {
      try {
        // Collect ALL proto settings objects with updateAsync (searchExports needed — not top-level)
        const allProtos = [];
        BdApi.Webpack.getModule((exp) => {
          try {
            if (typeof exp.updateAsync === "function") allProtos.push(exp);
          } catch (e) { /* skip */ }
          return false;
        }, { searchExports: true });

        // Pick PreloadedUserSettings by typeName
        for (const p of allProtos) {
          try {
            if (String(p.ProtoClass?.typeName || "").includes("PreloadedUserSettings")) {
              this._protoUtils = p;
              if (this.settings.debugMode) console.log("[Stealth] Proto settings acquired (PreloadedUserSettings)");
              return;
            }
          } catch (e) { /* skip */ }
        }

        if (this.settings.debugMode) console.warn("[Stealth] All strategies failed — no proto with 'status' field found");
      } catch (err) {
        this._logWarning("STATUS", "Failed to find PreloadedUserSettings proto module", err, "proto-init");
      }
    },

    /** Patch updateAsync so ANY status change via the proto system
     *  (including Discord's own UI status picker) gets forced to invisible.
     *  Proto status enum: 0=unset, 1=online, 2=idle, 3=dnd, 4=invisible */
    _patchProtoStatusUpdate() {
      if (!this._protoUtils || typeof this._protoUtils.updateAsync !== "function") {
        this._logWarning("STATUS", "Proto utils unavailable — cannot intercept proto status changes", null, "proto-patch-skip");
        return;
      }

      BdApi.Patcher.before(STEALTH_PLUGIN_ID, this._protoUtils, "updateAsync", (_ctx, args) => {
        if (!this.settings.enabled || !this.settings.invisibleStatus) return;

        // args[0] = setting group key ("status", "appearance", etc.)
        // args[1] = callback that mutates the proto settings
        if (args[0] === "status" && typeof args[1] === "function") {
          const originalCallback = args[1];
          args[1] = (data) => {
            originalCallback(data);
            // Force invisible after the original callback sets whatever it wants
            if (data?.status) {
              data.status.value = "invisible";
            }
          };
        }
      });
    },

    /** Direct proto call to set status to invisible — used by _ensureInvisibleStatus
     *  as primary method, with legacy setStatus as fallback. */
    _setStatusViaProto(statusString) {
      if (!this._protoUtils || typeof this._protoUtils.updateAsync !== "function") return false;

      try {
        this._protoUtils.updateAsync("status", (data) => {
          if (data?.status) {
            data.status.value = statusString; // "invisible", "online", "idle", "dnd"
          }
        }, 0);
        return true;
      } catch (err) {
        this._logWarning("STATUS", "Proto updateAsync call failed", err, "proto-set");
        return false;
      }
    },

    _ensureInvisibleStatus() {
      const current = this._getCurrentStatus();

      if (current && current !== "invisible" && !this._originalStatus) {
        this._originalStatus = current;
      }

      if (current === "invisible") {
        this._forcedInvisible = true;
        return true;
      }

      // Try proto method first (Discord's actual status system)
      if (this._setStatusViaProto("invisible")) {
        this._forcedInvisible = true;
        return true;
      }

      // Fallback to legacy setStatus
      const updated = this._setStatus("invisible");
      if (updated) {
        this._forcedInvisible = true;
      }

      return updated;
    },

    _setStatus(status) {
      if (!status) return false;
      if (!Array.isArray(this._statusSetters) || this._statusSetters.length === 0) {
        this._statusSetters = this._resolveStatusSetters();
      }

      let lastError = null;
      for (const entry of this._statusSetters) {
        const { module, fnName } = entry;
        try {
          if (fnName === "setPresence") {
            try {
              module[fnName].call(module, { status });
            } catch (presenceError) {
              this._logWarning("STATUS", "setPresence({status}) failed, trying plain string", presenceError, "status-presence-obj");
              module[fnName].call(module, status);
            }
            return true;
          }

          if (fnName === "updateStatus") {
            module[fnName].call(module, status);
            return true;
          }

          module[fnName].call(module, status);
          return true;
        } catch (error) {
          lastError = error;
        }
      }

      if (lastError) {
        this._logWarning("STATUS", "All status setter candidates failed", lastError, "status-all-setters-failed");
      }

      return false;
    },

    _restoreOriginalStatus() {
      if (!this._originalStatus) return;

      // Proto uses string values directly: "online", "idle", "dnd", "invisible"
      // Always try both paths as belt-and-suspenders — proto callback is async and may silently no-op
      this._setStatusViaProto(this._originalStatus);
      this._setStatus(this._originalStatus);
      this._originalStatus = null;
    },

    _getCurrentStatus() {
      try {
        const user = this._stores.user?.getCurrentUser?.();
        const userId = user?.id;

        if (userId && this._stores.presence?.getStatus) {
          const status = this._stores.presence.getStatus(userId);
          if (typeof status === "string") {
            return status.toLowerCase();
          }
        }
      } catch (error) {
        this._logWarning("STATUS", "Failed reading current presence status", error, "status-read");
      }

      return null;
    },
  });
}

module.exports = { attachStealthStatusPolicyMethods };
