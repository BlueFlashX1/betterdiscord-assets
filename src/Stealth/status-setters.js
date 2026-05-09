function attachStealthStatusSetterMethods(StealthClass) {
  Object.assign(StealthClass.prototype, {
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
  });
}

module.exports = { attachStealthStatusSetterMethods };
