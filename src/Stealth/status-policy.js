const { attachStealthStatusSetterMethods } = require("./status-setters");
const { attachStealthStatusProtoMethods } = require("./status-proto");

function attachStealthStatusPolicyMethods(StealthClass) {
  attachStealthStatusSetterMethods(StealthClass);
  attachStealthStatusProtoMethods(StealthClass);

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
