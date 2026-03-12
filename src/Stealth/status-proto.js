const STEALTH_PLUGIN_ID = "Stealth";

function attachStealthStatusProtoMethods(StealthClass) {
  Object.assign(StealthClass.prototype, {
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
        if (!this._canSuppress("invisibleStatus")) return;

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
  });
}

module.exports = { attachStealthStatusProtoMethods };
