/**
 * @name SoloLevelingToasts
 * @description Unified toast engine for all BetterDiscord plugins — standard + card-style toasts with rate limiting, dedup, and shared queue
 * @version 2.0.0
 * @author BlueFlashX1
 */
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// src/SoloLevelingToasts/settings-panel.js
var require_settings_panel = __commonJS({
  "src/SoloLevelingToasts/settings-panel.js"(exports2, module2) {
    function buildSoloLevelingToastsSettingsPanel2(BdApi2, plugin) {
      plugin.detachSoloLevelingToastsSettingsPanelHandlers();
      const panel = document.createElement("div");
      panel.style.cssText = "padding: 20px; background: #1e1e2e; border-radius: 0;";
      panel.innerHTML = `
      <div>
        <h3 style="color: #8a2be2; margin-bottom: 20px;">Toast Engine Settings</h3>

        <label style="display: flex; align-items: center; margin-bottom: 15px;">
          <input type="checkbox" ${plugin.settings.showParticles ? "checked" : ""} id="toast-particles" data-slt-setting="showParticles">
          <span style="margin-left: 10px;">Show Particles</span>
        </label>

        <label style="display: flex; flex-direction: column; margin-bottom: 15px;">
          <span style="margin-bottom: 5px;">Particle Count: <strong>${plugin.settings.particleCount}</strong></span>
          <input type="range" min="5" max="50" value="${plugin.settings.particleCount}" id="toast-particle-count" data-slt-setting="particleCount" style="width: 100%;">
        </label>

        <label style="display: flex; flex-direction: column; margin-bottom: 15px;">
          <span style="margin-bottom: 5px;">Max Toasts: <strong>${plugin.settings.maxToasts}</strong></span>
          <input type="range" min="1" max="10" value="${plugin.settings.maxToasts}" id="toast-max-toasts" data-slt-setting="maxToasts" style="width: 100%;">
        </label>

        <label style="display: flex; flex-direction: column; margin-bottom: 15px;">
          <span style="margin-bottom: 5px;">Position:</span>
          <select id="toast-position" data-slt-setting="position" style="padding: 8px; background: rgba(138, 43, 226, 0.2); border: 1px solid rgba(138, 43, 226, 0.4); border-radius: 2px; color: #fff; width: 100%;">
            <option value="top-right" ${plugin.settings.position === "top-right" ? "selected" : ""}>Top Right</option>
            <option value="top-left" ${plugin.settings.position === "top-left" ? "selected" : ""}>Top Left</option>
            <option value="bottom-right" ${plugin.settings.position === "bottom-right" ? "selected" : ""}>Bottom Right</option>
            <option value="bottom-left" ${plugin.settings.position === "bottom-left" ? "selected" : ""}>Bottom Left</option>
          </select>
        </label>

        <label style="display: flex; align-items: center; margin-bottom: 15px;">
          <input type="checkbox" ${plugin.settings.debugMode ? "checked" : ""} id="toast-debug" data-slt-setting="debugMode">
          <span style="margin-left: 10px;">Debug Mode (Show console logs)</span>
        </label>

        <div style="margin-top: 20px; padding: 15px; background: rgba(138, 43, 226, 0.1); border-radius: 2px; border-left: 3px solid #8a2be2;">
          <div style="color: #8a2be2; font-weight: bold; margin-bottom: 8px;">Toast Engine Status</div>
          <div style="color: rgba(255, 255, 255, 0.7); font-size: 13px;">
            <div>Engine Version: <strong style="color: #8a2be2;">v2.0</strong></div>
            <div style="margin-top: 4px;">Active Toasts: <strong>${plugin.activeToasts.length}</strong></div>
            <div style="margin-top: 4px;">Registered Consumers: <strong>${plugin._registeredConsumers.size > 0 ? [...plugin._registeredConsumers].join(", ") : "None yet"}</strong></div>
          </div>
        </div>

        <div style="margin-top: 12px; padding: 15px; background: rgba(138, 43, 226, 0.1); border-radius: 2px; border-left: 3px solid #8a2be2;">
          <div style="color: #8a2be2; font-weight: bold; margin-bottom: 8px;">Debug Information</div>
          <div style="color: rgba(255, 255, 255, 0.7); font-size: 13px;">
            Enable Debug Mode to see detailed console logs for:
            <ul style="margin: 5px 0; padding-left: 20px;">
              <li>Toast creation and rendering</li>
              <li>Rate limiting and dedup</li>
              <li>Card toast lifecycle</li>
              <li>Consumer registration</li>
              <li>Hook into SoloLevelingStats</li>
              <li>Settings and CSS injection</li>
            </ul>
          </div>
        </div>
      </div>
    `;
      const onInput = (event) => {
        var _a, _b;
        const target = event.target;
        const key = (_a = target == null ? void 0 : target.getAttribute) == null ? void 0 : _a.call(target, "data-slt-setting");
        if (!key) return;
        const handlers = {
          particleCount: () => {
            var _a2, _b2;
            const value = parseInt(target.value, 10);
            plugin.settings.particleCount = Number.isFinite(value) ? value : plugin.settings.particleCount;
            ((_b2 = (_a2 = target.previousElementSibling) == null ? void 0 : _a2.querySelector) == null ? void 0 : _b2.call(_a2, "strong")) && (target.previousElementSibling.querySelector("strong").textContent = target.value);
          },
          maxToasts: () => {
            var _a2, _b2;
            const value = parseInt(target.value, 10);
            plugin.settings.maxToasts = Number.isFinite(value) ? value : plugin.settings.maxToasts;
            ((_b2 = (_a2 = target.previousElementSibling) == null ? void 0 : _a2.querySelector) == null ? void 0 : _b2.call(_a2, "strong")) && (target.previousElementSibling.querySelector("strong").textContent = target.value);
          }
        };
        (_b = handlers[key]) == null ? void 0 : _b.call(handlers);
      };
      const onChange = (event) => {
        var _a, _b;
        const target = event.target;
        const key = (_a = target == null ? void 0 : target.getAttribute) == null ? void 0 : _a.call(target, "data-slt-setting");
        if (!key) return;
        const handlers = {
          showParticles: () => {
            plugin.settings.showParticles = !!target.checked;
            plugin.saveSettings();
          },
          particleCount: () => {
            const value = parseInt(target.value, 10);
            plugin.settings.particleCount = Number.isFinite(value) ? value : plugin.settings.particleCount;
            plugin.saveSettings();
          },
          maxToasts: () => {
            const value = parseInt(target.value, 10);
            plugin.settings.maxToasts = Number.isFinite(value) ? value : plugin.settings.maxToasts;
            plugin.saveSettings();
          },
          position: () => {
            plugin.settings.position = target.value;
            plugin.saveSettings();
            plugin.updateContainerPosition();
          },
          debugMode: () => {
            plugin.settings.debugMode = !!target.checked;
            plugin.debugMode = !!target.checked;
            plugin.saveSettings();
            plugin.debugLog("SETTINGS", "Debug mode toggled", { enabled: target.checked });
          }
        };
        (_b = handlers[key]) == null ? void 0 : _b.call(handlers);
      };
      panel.addEventListener("input", onInput);
      panel.addEventListener("change", onChange);
      plugin._settingsPanelRoot = panel;
      plugin._settingsPanelHandlers = { onInput, onChange };
      return panel;
    }
    module2.exports = { buildSoloLevelingToastsSettingsPanel: buildSoloLevelingToastsSettingsPanel2 };
  }
});

// src/SoloLevelingToasts/styles.css
var styles_default = "/* \u2500\u2500 SoloLevelingToasts \u2014 Toast Engine v2 \u2500\u2500 */\n/* Dynamic durations are set via CSS custom properties on .sl-toast-container:\n *   --sl-anim-duration   (slide-in, default 150ms)\n *   --sl-fade-duration   (fade-out, default 0.4s)\n */\n\n.sl-toast-container {\n  position: fixed;\n  z-index: 999997;\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n  pointer-events: none;\n}\n\n.sl-toast-container.top-right {\n  top: 40px;\n  right: 20px;\n  align-items: flex-end;\n}\n\n.sl-toast-container.top-left {\n  top: 40px;\n  left: 20px;\n  align-items: flex-start;\n}\n\n.sl-toast-container.bottom-right {\n  bottom: 20px;\n  right: 20px;\n  align-items: flex-end;\n}\n\n.sl-toast-container.bottom-left {\n  bottom: 20px;\n  left: 20px;\n  align-items: flex-start;\n}\n\n.sl-toast {\n  position: relative;\n  min-width: 280px;\n  max-width: 360px;\n  min-height: 50px;\n  max-height: fit-content;\n  padding: 14px 18px 14px 22px;\n  background: rgb(10, 10, 15);\n  border: 1px solid color-mix(in srgb, var(--sl-card-accent, #8a2be2) 30%, transparent);\n  border-radius: 0;\n  box-shadow: 0 4px 20px color-mix(in srgb, var(--sl-card-accent, #8a2be2) 40%, transparent),\n              0 0 40px color-mix(in srgb, var(--sl-card-accent, #8a2be2) 20%, transparent);\n  pointer-events: auto;\n  cursor: pointer;\n  overflow: visible;\n  animation: sl-toast-slide-in var(--sl-anim-duration, 150ms) cubic-bezier(0.16, 1, 0.3, 1) forwards;\n  will-change: transform, opacity;\n  transform: translateZ(0);\n  backface-visibility: hidden;\n  word-wrap: break-word;\n  white-space: normal;\n}\n\n.sl-toast.fading-out {\n  animation-fill-mode: forwards !important;\n}\n\n@keyframes sl-toast-slide-in {\n  0% {\n    opacity: 0;\n    transform: translateX(100%) scale(0.9);\n  }\n  50% {\n    opacity: 1;\n  }\n  100% {\n    opacity: 1;\n    transform: translateX(0) scale(1);\n  }\n}\n\n.sl-toast-container.top-left .sl-toast {\n  animation-name: sl-toast-slide-in-left;\n}\n\n@keyframes sl-toast-slide-in-left {\n  0% {\n    opacity: 0;\n    transform: translateX(-100%) scale(0.9);\n  }\n  50% {\n    opacity: 1;\n  }\n  100% {\n    opacity: 1;\n    transform: translateX(0) scale(1);\n  }\n}\n\n.sl-toast-container.bottom-right .sl-toast,\n.sl-toast-container.bottom-left .sl-toast {\n  animation-name: sl-toast-slide-in-bottom;\n}\n\n@keyframes sl-toast-slide-in-bottom {\n  0% {\n    opacity: 0;\n    transform: translateY(100%) scale(0.9);\n  }\n  50% {\n    opacity: 1;\n  }\n  100% {\n    opacity: 1;\n    transform: translateY(0) scale(1);\n  }\n}\n\n.sl-toast-title {\n  font-family: 'Friend or Foe BB', 'Orbitron', sans-serif;\n  font-size: 11px;\n  font-weight: bold;\n  margin-bottom: 6px;\n  background: linear-gradient(135deg, #8a2be2 0%, #7b21c6 30%, #6b1fb0 60%, #000000 100%);\n  -webkit-background-clip: text;\n  -webkit-text-fill-color: transparent;\n  background-clip: text;\n  word-wrap: break-word;\n  white-space: normal;\n  overflow-wrap: break-word;\n  max-width: 100%;\n  text-shadow: 0 0 3px rgba(138, 43, 226, 0.5),\n               0 0 6px rgba(123, 33, 198, 0.4),\n               0 0 9px rgba(107, 31, 176, 0.3);\n  text-transform: uppercase;\n  letter-spacing: 1px;\n  line-height: 1.3;\n}\n\n.sl-toast-message {\n  color: rgba(255, 255, 255, 0.9);\n  font-size: 13px;\n  line-height: 1.5;\n  white-space: normal;\n  word-wrap: break-word;\n  overflow-wrap: break-word;\n  max-width: 100%;\n}\n\n.sl-toast-particle {\n  position: absolute;\n  width: 4px;\n  height: 4px;\n  background: radial-gradient(circle, #8a2be2 0%, rgba(138, 43, 226, 0) 70%);\n  border-radius: 50%;\n  pointer-events: none;\n  animation: sl-particle-fade 1.5s ease-out forwards;\n}\n\n@keyframes sl-particle-fade {\n  0% {\n    opacity: 1;\n    transform: translate(0, 0) scale(1);\n  }\n  100% {\n    opacity: 0;\n    transform: translate(var(--sl-particle-x, 0), var(--sl-particle-y, -50px)) scale(0);\n  }\n}\n\n.sl-toast::before {\n  content: '';\n  position: absolute;\n  top: 0;\n  left: 0;\n  right: 0;\n  height: 2px;\n  background: linear-gradient(90deg, transparent, var(--sl-card-accent, #8a2be2), transparent);\n  animation: sl-toast-progress linear forwards;\n}\n\n@keyframes sl-toast-progress {\n  from {\n    width: 100%;\n  }\n  to {\n    width: 0%;\n  }\n}\n\n@keyframes sl-toast-fade-out-right {\n  from {\n    opacity: 1;\n    transform: translateX(0) scale(1);\n  }\n  to {\n    opacity: 0;\n    transform: translateX(100%) scale(0.9);\n  }\n}\n\n@keyframes sl-toast-fade-out-left {\n  from {\n    opacity: 1;\n    transform: translateX(0) scale(1);\n  }\n  to {\n    opacity: 0;\n    transform: translateX(-100%) scale(0.9);\n  }\n}\n\n@keyframes sl-toast-fade-out-bottom-right {\n  from {\n    opacity: 1;\n    transform: translate(0, 0) scale(1);\n  }\n  to {\n    opacity: 0;\n    transform: translate(100%, 100%) scale(0.9);\n  }\n}\n\n@keyframes sl-toast-fade-out-bottom-left {\n  from {\n    opacity: 1;\n    transform: translate(0, 0) scale(1);\n  }\n  to {\n    opacity: 0;\n    transform: translate(-100%, 100%) scale(0.9);\n  }\n}\n\n.sl-toast-container .sl-toast {\n  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease;\n}\n\n.sl-toast-container.top-right .sl-toast.fading-out {\n  animation: sl-toast-fade-out-right var(--sl-fade-duration, 0.4s) cubic-bezier(0.4, 0, 1, 1) forwards !important;\n  pointer-events: none;\n}\n\n.sl-toast-container.top-left .sl-toast.fading-out {\n  animation: sl-toast-fade-out-left var(--sl-fade-duration, 0.4s) cubic-bezier(0.4, 0, 1, 1) forwards !important;\n  pointer-events: none;\n}\n\n.sl-toast-container.bottom-right .sl-toast.fading-out {\n  animation: sl-toast-fade-out-bottom-right var(--sl-fade-duration, 0.4s) cubic-bezier(0.4, 0, 1, 1) forwards !important;\n  pointer-events: none;\n}\n\n.sl-toast-container.bottom-left .sl-toast.fading-out {\n  animation: sl-toast-fade-out-bottom-left var(--sl-fade-duration, 0.4s) cubic-bezier(0.4, 0, 1, 1) forwards !important;\n  pointer-events: none;\n}\n\n.sl-toast-accent {\n  position: absolute;\n  top: 0;\n  left: 0;\n  bottom: 0;\n  width: 3px;\n  background: var(--sl-card-accent, #8a2be2);\n  border-radius: 8px 0 0 8px;\n  z-index: 1;\n}\n\n/* \u2500\u2500 Toast Engine v2: Card Toasts \u2500\u2500 */\n\n.sl-toast.sl-toast-card {\n  padding: 0;\n  min-width: 300px;\n  max-width: 380px;\n  min-height: auto;\n  border-color: var(--sl-card-accent, rgba(138, 43, 226, 0.3));\n  box-shadow: 0 4px 20px color-mix(in srgb, var(--sl-card-accent, #8a2be2) 40%, transparent),\n              0 0 30px color-mix(in srgb, var(--sl-card-accent, #8a2be2) 20%, transparent);\n}\n\n.sl-toast-card-accent {\n  position: absolute;\n  top: 0;\n  left: 0;\n  bottom: 0;\n  width: 3px;\n  background: var(--sl-card-accent, #8a2be2);\n  border-radius: 0;\n}\n\n.sl-toast-card-inner {\n  display: flex;\n  align-items: flex-start;\n  gap: 12px;\n  padding: 12px 14px 12px 18px;\n}\n\n.sl-toast-card-avatar-wrap {\n  position: relative;\n  flex-shrink: 0;\n  width: 40px;\n  height: 40px;\n}\n\n.sl-toast-card-avatar {\n  width: 40px;\n  height: 40px;\n  border-radius: 50%;\n  object-fit: cover;\n  border: 2px solid var(--sl-card-accent, #8a2be2);\n}\n\n.sl-toast-card-status {\n  position: absolute;\n  bottom: -1px;\n  right: -1px;\n  width: 12px;\n  height: 12px;\n  border-radius: 50%;\n  border: 2px solid rgb(10, 10, 15);\n  background: var(--sl-card-accent, #8a2be2);\n}\n\n.sl-toast-card-content {\n  flex: 1;\n  min-width: 0;\n  overflow: hidden;\n}\n\n.sl-toast-card-header {\n  font-family: 'Friend or Foe BB', 'Orbitron', sans-serif;\n  font-size: 12px;\n  font-weight: bold;\n  color: #fff;\n  text-transform: uppercase;\n  letter-spacing: 0.5px;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  text-shadow: 0 0 6px color-mix(in srgb, var(--sl-card-accent, #8a2be2) 60%, transparent);\n}\n\n.sl-toast-card-body {\n  font-size: 13px;\n  color: rgba(255, 255, 255, 0.85);\n  margin-top: 2px;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n.sl-toast-card-detail {\n  font-size: 11px;\n  color: rgba(255, 255, 255, 0.5);\n  margin-top: 3px;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n.sl-toast.sl-toast-card::before {\n  display: none;\n}\n\n.sl-toast-card .sl-toast-card-progress {\n  position: absolute;\n  top: 0;\n  left: 0;\n  right: 0;\n  height: 2px;\n  background: linear-gradient(90deg, transparent, var(--sl-card-accent, #8a2be2), transparent);\n  animation: sl-toast-progress linear forwards;\n}\n";

// src/SoloLevelingToasts/formatting.js
function extractMessageText(message) {
  let messageText = message;
  if (message && typeof message === "object" && message.message) {
    messageText = message.message;
  } else if (message && typeof message === "object" && message.text) {
    messageText = message.text;
  }
  if (typeof messageText !== "string") {
    messageText = String(messageText);
  }
  return messageText;
}
function formatNumbersInMessage(message) {
  if (!message || typeof message !== "string") return message;
  message = message.replace(/([+\-]?)(\d{4,})/g, (match, sign, num) => {
    const number = parseInt(num, 10);
    return !isNaN(number) ? sign + number.toLocaleString() : match;
  });
  message = message.replace(/(\d+\.\d+)\s*%/g, (match, num) => {
    const number = parseFloat(num);
    return !isNaN(number) ? `${number.toFixed(1)}%` : match;
  });
  message = message.replace(/(\d+)\s*→\s*(\d+)/g, (match, oldVal, newVal) => {
    const oldNum = parseInt(oldVal, 10);
    const newNum = parseInt(newVal, 10);
    return !isNaN(oldNum) && !isNaN(newNum) ? `${oldNum.toLocaleString()} \u2192 ${newNum.toLocaleString()}` : match;
  });
  return message;
}
function summarizeMessage(message) {
  if (!message || typeof message !== "string") return message;
  let summarized = message;
  summarized = summarized.replace(/LEVEL UP!?\s*/gi, "").replace(/Level\s*(\d+)\s*→\s*(\d+)/gi, "Lv.$1\u2192$2").replace(/Strength:/gi, "STR:").replace(/Agility:/gi, "AGI:").replace(/Intelligence:/gi, "INT:").replace(/Vitality:/gi, "VIT:").replace(/Perception:/gi, "PER:").replace(/Luck:/gi, "LUK:").replace(/\+\s*(\d+)\s*([A-Z]+)\s*\(/gi, "+$1 $2 (").replace(/QUEST COMPLETE!?\s*/gi, "Quest: ").replace(/\[QUEST COMPLETE\]\s*/gi, "").replace(/ACHIEVEMENT UNLOCKED!?\s*/gi, "Achievement: ").replace(/\s*Retroactive Natural Growth Applied!?\s*/gi, "Retro Growth").replace(/\s*Natural Growth!?\s*/gi, "Natural").replace(/Rank Promotion!?\s*/gi, "Rank: ").replace(/([A-Z])\s*→\s*([A-Z])/g, "$1\u2192$2").replace(/\n{2,}/g, "\n").replace(/\s{2,}/g, " ").trim();
  return summarized;
}
function detectToastType(message, type) {
  const msg = message.toLowerCase();
  if (type === "success" || msg.includes("level up") || msg.includes("leveled") || /\blv\.?\d/i.test(msg)) {
    return "level-up";
  }
  if (msg.includes("achievement") || msg.includes("unlocked")) {
    return "achievement";
  }
  if (msg.includes("quest") || msg.includes("complete")) {
    return "quest";
  }
  if (type === "error") {
    return "error";
  }
  return "info";
}
var ACCENT_COLORS = {
  "level-up": "#8a2be2",
  "achievement": "#fbbf24",
  "quest": "#22c55e",
  "error": "#ef4444",
  "info": "#8a2be2"
};
function getAccentColor(toastType) {
  return ACCENT_COLORS[toastType] || ACCENT_COLORS["info"];
}
function getMessageGroupKey(message, type) {
  const messageText = extractMessageText(message);
  const normalized = messageText.replace(/\d+/g, "N").replace(/\s+/g, " ").trim().toLowerCase().substring(0, 100);
  return `${normalized}_${type}`;
}
function extractMessageNumbers(messages) {
  const numbers = [];
  messages.forEach((msg) => {
    const matches = msg.message.match(/(\+?\d+(?:,\d{3})*(?:\.\d+)?)/g);
    if (matches) {
      numbers.push(...matches.map((m) => m.replace(/,/g, "")));
    }
  });
  return numbers;
}
function sumParsedNumbers(numbers) {
  return numbers.filter((n) => !isNaN(parseInt(n, 10))).reduce((sum, n) => sum + parseInt(n, 10), 0);
}
function combineMessages(messages) {
  if (messages.length === 1) {
    return messages[0].message;
  }
  const firstMsg = messages[0].message;
  const count = messages.length;
  const msgLower = firstMsg.toLowerCase();
  const numbers = extractMessageNumbers(messages);
  const totalXP = sumParsedNumbers(numbers);
  const context = { firstMsg, msgLower, count, totalXP };
  const statKeywords = [
    "stat",
    "strength",
    "agility",
    "intelligence",
    "vitality",
    "perception"
  ];
  const rules = [
    {
      when: (ctx) => ctx.msgLower.includes("quest") || ctx.msgLower.includes("complete"),
      format: (ctx) => `Quest Complete x${ctx.count}${ctx.totalXP > 0 ? `
+${ctx.totalXP.toLocaleString()} XP` : ""}`
    },
    {
      when: (ctx) => ctx.msgLower.includes("achievement") || ctx.msgLower.includes("unlocked"),
      format: (ctx) => `Achievements Unlocked x${ctx.count}`
    },
    {
      when: (ctx) => statKeywords.some((keyword) => ctx.msgLower.includes(keyword)),
      format: (ctx) => {
        const statMatches = ctx.firstMsg.match(/(\w+):\s*(\d+)\s*→\s*(\d+)/i);
        if (statMatches) {
          const statName = statMatches[1];
          const finalValue = statMatches[3];
          return `${statName}: +${ctx.count} \u2192 ${finalValue}`;
        }
        return `Stat Increases x${ctx.count}`;
      }
    },
    {
      when: (ctx) => ctx.msgLower.includes("xp") || ctx.msgLower.includes("experience"),
      format: (ctx) => {
        if (ctx.totalXP > 0) {
          return `XP Gained x${ctx.count}
+${ctx.totalXP.toLocaleString()} XP`;
        }
        return `XP Events x${ctx.count}`;
      }
    },
    {
      when: (ctx) => ctx.msgLower.includes("level"),
      format: (ctx) => {
        const levelMatches = ctx.firstMsg.match(/Lv\.?(\d+)/i);
        if (levelMatches) {
          return `Level Up x${ctx.count}
Lv.${levelMatches[1]}`;
        }
        return `Level Events x${ctx.count}`;
      }
    }
  ];
  for (const rule of rules) {
    if (rule.when(context)) {
      return rule.format(context);
    }
  }
  return `${firstMsg.substring(0, 50)}... x${count}`;
}
function normalizeNotificationText(messageText) {
  if (typeof messageText !== "string") return "";
  return messageText.replace(/\s+/g, " ").trim().toLowerCase();
}
function isNaturalGrowthNotification(msgLower) {
  const hasNatural = msgLower.includes("natural");
  const hasGrowth = msgLower.includes("growth");
  return hasNatural && hasGrowth || msgLower.includes("natural stat growth") || msgLower.includes("retroactive natural growth") || msgLower.includes("natural strength growth") || msgLower.includes("natural agility growth") || msgLower.includes("natural intelligence growth") || msgLower.includes("natural vitality growth") || msgLower.includes("natural luck growth");
}
function isStatAllocationNotification(msgLower) {
  return msgLower.includes("stat point allocated") || msgLower.includes("allocated to") || msgLower.includes("point added to") || msgLower.includes("strength:") && msgLower.includes("\u2192") || msgLower.includes("agility:") && msgLower.includes("\u2192") || msgLower.includes("intelligence:") && msgLower.includes("\u2192") || msgLower.includes("vitality:") && msgLower.includes("\u2192") || msgLower.includes("perception:") && msgLower.includes("\u2192") || msgLower.includes("luck:") && msgLower.includes("\u2192");
}
function getNotificationFilterFlags(messageText) {
  const msgLower = normalizeNotificationText(messageText);
  const naturalGrowth = isNaturalGrowthNotification(msgLower);
  const statAllocation = isStatAllocationNotification(msgLower);
  return {
    isNaturalGrowth: naturalGrowth,
    isStatAllocation: statAllocation,
    shouldSkip: naturalGrowth || statAllocation
  };
}

// src/SoloLevelingToasts/index.js
var { buildSoloLevelingToastsSettingsPanel } = require_settings_panel();
module.exports = class SoloLevelingToasts {
  // ==========================================================================
  // SECTION 1: CONSTRUCTOR & LOW-LEVEL HELPERS
  // ==========================================================================
  constructor() {
    this.defaultSettings = {
      enabled: true,
      showParticles: true,
      particleCount: 20,
      animationDuration: 150,
      fadeAnimationDuration: 400,
      defaultTimeout: 4e3,
      position: "top-right",
      maxToasts: 5
    };
    this.settings = structuredClone(this.defaultSettings);
    this.toastContainer = null;
    this.activeToasts = [];
    this.patcher = null;
    this.messageGroups = /* @__PURE__ */ new Map();
    this.groupWindow = 1e3;
    this.debugMode = false;
    this.webpackModules = { UserStore: null, ChannelStore: null };
    this.webpackModuleAccess = false;
    this._isStopped = false;
    this._hookRetryId = null;
    this._trackedTimeouts = /* @__PURE__ */ new Set();
    this._settingsPanelRoot = null;
    this._settingsPanelHandlers = null;
    this._rateLimiter = /* @__PURE__ */ new Map();
    this._registeredConsumers = /* @__PURE__ */ new Set();
    this._cache = {
      soloPluginInstance: null,
      soloPluginInstanceTime: 0,
      soloPluginInstanceTTL: 5e3
    };
  }
  get toastEngineVersion() {
    return 2;
  }
  // ── Tracked timeout helpers ──
  _setTrackedTimeout(callback, delayMs) {
    const timeoutId = setTimeout(() => {
      this._trackedTimeouts.delete(timeoutId);
      !this._isStopped && callback();
    }, delayMs);
    this._trackedTimeouts.add(timeoutId);
    return timeoutId;
  }
  _clearTrackedTimeouts() {
    this._trackedTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
    this._trackedTimeouts.clear();
  }
  _clearTrackedTimeout(timeoutId) {
    if (!Number.isFinite(timeoutId)) return;
    clearTimeout(timeoutId);
    this._trackedTimeouts.delete(timeoutId);
  }
  // ── Toast timeout helpers ──
  _getToastTimeout(timeout) {
    return timeout || this.settings.defaultTimeout;
  }
  _clearToastFadeTimeout(toast) {
    if (!toast || !toast.dataset) return;
    const existingTimeout = toast.dataset.fadeTimeout;
    if (!existingTimeout) return;
    const timeoutId = Number.parseInt(existingTimeout, 10);
    this._clearTrackedTimeout(timeoutId);
    toast.dataset.fadeTimeout = "";
  }
  _scheduleToastFadeOut(toast, timeoutMs) {
    if (!toast) return;
    this._clearToastFadeTimeout(toast);
    const fadeAnimationDuration = this.settings.fadeAnimationDuration;
    const fadeOutDelay = Math.max(0, timeoutMs - fadeAnimationDuration);
    const timeoutId = this._setTrackedTimeout(() => {
      this.startFadeOut(toast);
      this._setTrackedTimeout(() => this.removeToast(toast, false), fadeAnimationDuration);
    }, fadeOutDelay);
    toast.dataset.fadeTimeout = timeoutId.toString();
  }
  _evictOldestToastIfNeeded() {
    if (this.activeToasts.length < this.settings.maxToasts) return;
    const oldestToast = this.activeToasts.shift();
    if (!oldestToast) return;
    this._clearToastFadeTimeout(oldestToast);
    oldestToast.remove();
  }
  // ── Settings panel cleanup ──
  detachSoloLevelingToastsSettingsPanelHandlers() {
    const root = this._settingsPanelRoot;
    const handlers = this._settingsPanelHandlers;
    if (root && handlers) {
      root.removeEventListener("change", handlers.onChange);
      root.removeEventListener("input", handlers.onInput);
    }
    this._settingsPanelRoot = null;
    this._settingsPanelHandlers = null;
  }
  // ==========================================================================
  // SECTION 2: WEBPACK & SETTINGS
  // ==========================================================================
  initializeWebpackModules() {
    try {
      this.webpackModules.UserStore = BdApi.Webpack.getStore("UserStore");
      this.webpackModules.ChannelStore = BdApi.Webpack.getStore("ChannelStore");
      this.webpackModuleAccess = !!this.webpackModules.UserStore && !!this.webpackModules.ChannelStore;
      if (this.webpackModuleAccess) {
        this.debugLog("WEBPACK_INIT", "Webpack modules initialized successfully");
      } else {
        this.debugLog("WEBPACK_INIT", "Some webpack modules not available, using fallbacks");
      }
    } catch (error) {
      this.debugError("WEBPACK_INIT", error);
      this.webpackModuleAccess = false;
    }
  }
  loadSettings() {
    try {
      const saved = BdApi.Data.load("SoloLevelingToasts", "settings");
      if (saved) {
        this.settings = structuredClone({ ...this.defaultSettings, ...saved });
        this.debugMode = this.settings.debugMode || false;
        this.debugLog("SETTINGS", "Settings loaded", this.settings);
      }
    } catch (error) {
      this.debugError("SETTINGS", error);
    }
  }
  saveSettings() {
    try {
      BdApi.Data.save("SoloLevelingToasts", "settings", this.settings);
      this.debugLog("SETTINGS", "Settings saved");
    } catch (error) {
      this.debugError("SETTINGS", error);
    }
  }
  // ==========================================================================
  // SECTION 3: LIFECYCLE (start / stop)
  // ==========================================================================
  start() {
    this._isStopped = false;
    this.loadSettings();
    this.initializeWebpackModules();
    this.injectCSS();
    this.createToastContainer();
    this.hookIntoSoloLeveling();
    this.debugLog("PLUGIN_START", "Plugin started successfully");
  }
  stop() {
    this._isStopped = true;
    if (this._hookRetryId) {
      this._clearTrackedTimeout(this._hookRetryId);
      this._hookRetryId = null;
    }
    this._clearTrackedTimeouts();
    this.unhookIntoSoloLeveling();
    this.removeAllToasts();
    this.removeToastContainer();
    this.removeCSS();
    this.messageGroups.forEach((group) => {
      if (group.timeoutId && group.timeoutId !== true) {
        this._clearTrackedTimeout(group.timeoutId);
      }
      if (group.cleanupTimeoutId) {
        this._clearTrackedTimeout(group.cleanupTimeoutId);
      }
    });
    this.messageGroups.clear();
    this._rateLimiter.clear();
    this._registeredConsumers.clear();
    if (this._cache) {
      this._cache.soloPluginInstance = null;
      this._cache.soloPluginInstanceTime = 0;
    }
    this.webpackModules = { UserStore: null, ChannelStore: null };
    this.webpackModuleAccess = false;
    this.detachSoloLevelingToastsSettingsPanelHandlers();
    this.debugLog("PLUGIN_STOP", "Plugin stopped successfully");
  }
  // ==========================================================================
  // SECTION 4: CSS INJECTION
  // ==========================================================================
  injectCSS() {
    const styleId = "solo-leveling-toasts-css";
    const injectedViaBdApi = (() => {
      try {
        BdApi.DOM.addStyle(styleId, styles_default);
        return true;
      } catch (_error) {
        return false;
      }
    })();
    if (!injectedViaBdApi) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = styles_default;
      document.head.appendChild(style);
    }
    const root = document.documentElement;
    root.style.setProperty("--sl-anim-duration", `${this.settings.animationDuration}ms`);
    root.style.setProperty("--sl-fade-duration", `${this.settings.fadeAnimationDuration / 1e3}s`);
    this.debugLog(
      "INJECT_CSS",
      `CSS injected successfully via ${injectedViaBdApi ? "BdApi.DOM" : "manual method"}`
    );
  }
  removeCSS() {
    const styleId = "solo-leveling-toasts-css";
    try {
      BdApi.DOM.removeStyle(styleId);
    } catch (error) {
      const style = document.getElementById(styleId);
      if (style) style.remove();
    }
    const root = document.documentElement;
    root.style.removeProperty("--sl-anim-duration");
    root.style.removeProperty("--sl-fade-duration");
  }
  // ==========================================================================
  // SECTION 5: TOAST CONTAINER
  // ==========================================================================
  createToastContainer() {
    if (this.toastContainer) {
      this.debugLog("CREATE_CONTAINER", "Container already exists");
      return;
    }
    this.toastContainer = document.createElement("div");
    this.toastContainer.className = `sl-toast-container ${this.settings.position}`;
    document.body.appendChild(this.toastContainer);
    this.debugLog("CREATE_CONTAINER", "Toast container created", {
      position: this.settings.position,
      containerExists: !!this.toastContainer,
      parentExists: !!this.toastContainer.parentElement
    });
  }
  removeToastContainer() {
    this.toastContainer && (this.toastContainer.remove(), this.toastContainer = null);
  }
  updateContainerPosition() {
    if (this.toastContainer) {
      this.toastContainer.className = `sl-toast-container ${this.settings.position}`;
    }
  }
  // ==========================================================================
  // SECTION 6: PARTICLES
  // ==========================================================================
  createParticles(toastElement, count) {
    if (this._isStopped) return;
    if (!this.settings.showParticles) return;
    const rect = toastElement.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const wrapper = document.createElement("div");
    wrapper.className = "sl-toast-particle-batch";
    wrapper.style.cssText = "position:fixed;top:0;left:0;pointer-events:none;z-index:100000;";
    for (let i = 0; i < count; i++) {
      const particle = document.createElement("div");
      particle.className = "sl-toast-particle";
      const angle = Math.PI * 2 * i / count + Math.random() * 0.5;
      const distance = 30 + Math.random() * 40;
      const particleX = Math.cos(angle) * distance;
      const particleY = Math.sin(angle) * distance - 20;
      particle.style.left = `${centerX}px`;
      particle.style.top = `${centerY}px`;
      particle.style.setProperty("--sl-particle-x", `${particleX}px`);
      particle.style.setProperty("--sl-particle-y", `${particleY}px`);
      wrapper.appendChild(particle);
    }
    document.body.appendChild(wrapper);
    this._setTrackedTimeout(() => wrapper.remove(), 1500);
  }
  // ==========================================================================
  // SECTION 7: SHOW TOAST (public API) + GROUPING
  // ==========================================================================
  showToast(message, type = "info", timeout = null, options = {}) {
    if (this._isStopped) return;
    if (options.callerId) {
      this._registeredConsumers.add(options.callerId);
      if (!this._checkRateLimit(options.callerId, options.maxPerMinute || 15)) {
        this.debugLog("RATE_LIMIT", `Throttled toast from ${options.callerId}`);
        return;
      }
    }
    const groupKey = getMessageGroupKey(message, type);
    const now = Date.now();
    const messageText = extractMessageText(message);
    if (this.messageGroups.has(groupKey)) {
      const group2 = this.messageGroups.get(groupKey);
      group2.messages.push({ message: messageText, timestamp: now });
      group2.count++;
      group2.lastSeen = now;
      if (group2.timeoutId && group2.timeoutId !== true) {
        this._clearTrackedTimeout(group2.timeoutId);
      }
      const existingToast = this.findToastByKey(groupKey);
      if (existingToast) {
        this.updateToastCount(existingToast, group2.count);
        this.resetToastFadeOut(existingToast, this._getToastTimeout(timeout));
        return;
      }
      if (group2.timeoutId === true) {
        return;
      }
      const fastGroupDelay = Math.min(200, this.groupWindow);
      group2.timeoutId = this._setTrackedTimeout(() => {
        if (group2.shown === true) {
          this.messageGroups.delete(groupKey);
          return;
        }
        group2.shown = true;
        this.messageGroups.delete(groupKey);
        const combinedMessage = combineMessages(group2.messages);
        this._showToastInternal(combinedMessage, type, timeout);
      }, fastGroupDelay);
      return;
    }
    const group = {
      messages: [{ message: messageText, timestamp: now }],
      count: 1,
      lastSeen: now,
      timeoutId: null,
      shown: false
    };
    this.messageGroups.set(groupKey, group);
    group.timeoutId = true;
    requestAnimationFrame(() => {
      if (this._isStopped) return;
      const currentGroup = this.messageGroups.get(groupKey);
      if (currentGroup && !currentGroup.shown) {
        currentGroup.shown = true;
        currentGroup.timeoutId = null;
        const combinedMessage = combineMessages(currentGroup.messages);
        this._showToastInternal(combinedMessage, type, timeout);
        currentGroup.cleanupTimeoutId = this._setTrackedTimeout(() => {
          if (this.messageGroups.get(groupKey) === currentGroup) {
            this.messageGroups.delete(groupKey);
          }
        }, this.groupWindow);
      } else if (currentGroup) {
        currentGroup.timeoutId = null;
      }
    });
  }
  findToastByKey(groupKey) {
    const normalized = groupKey.split("_")[0];
    return this.activeToasts.find((toast) => {
      const toastText = toast.textContent.toLowerCase().replace(/\d+/g, "N").replace(/\s+/g, " ").trim();
      return toastText.includes(normalized.substring(0, 30));
    }) || null;
  }
  updateToastCount(toast, count) {
    if (!toast) return;
    const titleEl = toast.querySelector(".sl-toast-title");
    if (titleEl) {
      let titleText = titleEl.textContent;
      const countMatch = titleText.match(/x(\d+)/);
      if (countMatch) {
        titleText = titleText.replace(/x\d+/, `x${count}`);
      } else {
        titleText = `${titleText} x${count}`;
      }
      titleEl.textContent = titleText;
    }
    toast.classList.remove("fading-out");
    toast.style.animation = "";
  }
  resetToastFadeOut(toast, timeout) {
    if (!toast) return;
    toast.classList.remove("fading-out");
    toast.style.animation = "";
    toast.style.pointerEvents = "";
    this._scheduleToastFadeOut(toast, timeout);
  }
  // ==========================================================================
  // SECTION 8: INTERNAL TOAST RENDERING
  // ==========================================================================
  _showToastInternal(message, type = "info", timeout = null) {
    var _a, _b;
    if (this._isStopped) return;
    this.debugLog("SHOW_TOAST", "Toast request received", {
      message: message == null ? void 0 : message.substring(0, 100),
      type,
      timeout,
      enabled: this.settings.enabled,
      activeToasts: this.activeToasts.length
    });
    if (!this.settings.enabled) {
      this.debugLog("SHOW_TOAST", "Plugin disabled, using fallback toast");
      if ((_a = BdApi == null ? void 0 : BdApi.UI) == null ? void 0 : _a.showToast) {
        BdApi.UI.showToast(message, { type, timeout: this._getToastTimeout(timeout) });
      }
      return;
    }
    try {
      this._evictOldestToastIfNeeded();
      const toastType = detectToastType(message, type);
      const toastTimeout = this._getToastTimeout(timeout);
      let processedMessage = message;
      if (typeof processedMessage === "string") {
        processedMessage = formatNumbersInMessage(processedMessage);
        processedMessage = summarizeMessage(processedMessage);
      }
      const toast = document.createElement("div");
      toast.className = `sl-toast ${toastType}`;
      toast.style.setProperty("--sl-toast-timeout", `${toastTimeout}ms`);
      toast.style.setProperty("--sl-card-accent", getAccentColor(toastType));
      const accentBar = document.createElement("div");
      accentBar.className = "sl-toast-accent";
      toast.appendChild(accentBar);
      const lines = processedMessage.split("\n");
      const title = lines[0] || "Notification";
      const body = lines.slice(1).join("\n") || "";
      const titleEl = document.createElement("div");
      titleEl.className = "sl-toast-title";
      titleEl.textContent = title;
      toast.appendChild(titleEl);
      if (body) {
        const bodyEl = document.createElement("div");
        bodyEl.className = "sl-toast-message";
        bodyEl.textContent = body;
        toast.appendChild(bodyEl);
      }
      const progressBar = document.createElement("div");
      progressBar.style.position = "absolute";
      progressBar.style.top = "0";
      progressBar.style.left = "0";
      progressBar.style.right = "0";
      progressBar.style.height = "2px";
      progressBar.style.background = "linear-gradient(90deg, transparent, var(--sl-card-accent, #8a2be2), transparent)";
      progressBar.style.animation = `sl-toast-progress ${toastTimeout}ms linear forwards`;
      toast.appendChild(progressBar);
      toast.addEventListener("click", () => {
        this._clearToastFadeTimeout(toast);
        this.startFadeOut(toast);
        this._setTrackedTimeout(
          () => this.removeToast(toast, false),
          this.settings.fadeAnimationDuration
        );
      });
      if (!this.toastContainer) {
        this.createToastContainer();
      }
      this.activeToasts.push(toast);
      requestAnimationFrame(() => {
        if (this._isStopped) return;
        if (!this.toastContainer) {
          this.debugError("SHOW_TOAST", "Toast container is null, cannot append toast");
          return;
        }
        this.toastContainer.appendChild(toast);
        requestAnimationFrame(() => {
          if (this._isStopped) return;
          this.createParticles(toast, this.settings.particleCount);
        });
      });
      this._scheduleToastFadeOut(toast, toastTimeout);
      this.debugLog("SHOW_TOAST", "Toast created and displayed", {
        toastType,
        timeout: toastTimeout,
        activeToasts: this.activeToasts.length,
        containerExists: !!this.toastContainer
      });
    } catch (error) {
      this.debugError("SHOW_TOAST", error, {
        message: message == null ? void 0 : message.substring(0, 100),
        type,
        timeout
      });
      if ((_b = BdApi == null ? void 0 : BdApi.UI) == null ? void 0 : _b.showToast) {
        BdApi.UI.showToast(message, { type, timeout: this._getToastTimeout(timeout) });
        this.debugLog("SHOW_TOAST", "Fallback toast shown");
      }
    }
  }
  // ==========================================================================
  // SECTION 9: FADE OUT & REMOVAL
  // ==========================================================================
  startFadeOut(toast) {
    if (!toast || !toast.parentElement) return;
    if (toast.classList.contains("fading-out")) return;
    this._clearToastFadeTimeout(toast);
    const computedStyle = window.getComputedStyle(toast);
    const currentTransform = computedStyle.transform;
    const currentOpacity = computedStyle.opacity;
    toast.style.animation = "none";
    toast.style.transition = "none";
    if (currentTransform && currentTransform !== "none") {
      toast.style.transform = currentTransform;
    }
    if (currentOpacity) {
      toast.style.opacity = currentOpacity;
    }
    void toast.offsetHeight;
    toast.style.animation = "";
    toast.style.transition = "";
    toast.classList.add("fading-out");
    toast.style.pointerEvents = "none";
    this.debugLog("START_FADE_OUT", "Fade out started", {
      activeToasts: this.activeToasts.length,
      position: this.settings.position
    });
  }
  removeToast(toast, fast = false) {
    if (!toast || !toast.parentElement) {
      this.debugLog("REMOVE_TOAST", "Toast already removed or invalid", {
        toastExists: !!toast,
        hasParent: !!(toast == null ? void 0 : toast.parentElement)
      });
      return;
    }
    this.debugLog("REMOVE_TOAST", "Removing toast", {
      activeToasts: this.activeToasts.length,
      fast
    });
    toast.remove();
    const index = this.activeToasts.indexOf(toast);
    if (index > -1) {
      this.activeToasts.splice(index, 1);
    }
    this.debugLog("REMOVE_TOAST", "Toast removed", {
      remainingToasts: this.activeToasts.length
    });
  }
  removeAllToasts() {
    this.activeToasts.forEach((toast) => toast.remove());
    this.activeToasts = [];
  }
  // ==========================================================================
  // SECTION 10: CARD TOAST API + RATE LIMITING (Toast Engine v2)
  // ==========================================================================
  _checkRateLimit(callerId, maxPerMinute = 15) {
    const now = Date.now();
    let timestamps = this._rateLimiter.get(callerId);
    if (!timestamps) {
      timestamps = [];
      this._rateLimiter.set(callerId, timestamps);
    }
    const cutoff = now - 6e4;
    let i = 0;
    while (i < timestamps.length && timestamps[i] < cutoff) i++;
    if (i > 0) timestamps.splice(0, i);
    if (timestamps.length >= maxPerMinute) return false;
    timestamps.push(now);
    if (this._rateLimiter.size > 50) {
      for (const [id, ts] of this._rateLimiter) {
        if (!ts.length || now - ts[ts.length - 1] > 6e4) this._rateLimiter.delete(id);
      }
    }
    return true;
  }
  /**
   * Show a card-style toast with avatar, header, body, and optional detail.
   */
  showCardToast(opts = {}) {
    if (this._isStopped) return;
    const { avatarUrl, accentColor, header, body } = opts;
    if (!avatarUrl || !accentColor || !header || !body) {
      this.debugLog("CARD_TOAST", "Missing required fields", {
        avatarUrl: !!avatarUrl,
        accentColor: !!accentColor,
        header: !!header,
        body: !!body
      });
      return;
    }
    if (opts.callerId) {
      this._registeredConsumers.add(opts.callerId);
      if (!this._checkRateLimit(opts.callerId, opts.maxPerMinute || 15)) {
        this.debugLog("RATE_LIMIT", `Throttled card toast from ${opts.callerId}`);
        return;
      }
    }
    const dedupKey = `${header}::${body}`.toLowerCase().replace(/\d+/g, "N").replace(/\s+/g, " ").trim();
    const existingToast = this.activeToasts.find((t) => t._cardDedupKey === dedupKey);
    if (existingToast) {
      this.resetToastFadeOut(existingToast, this._getToastTimeout(opts.timeout));
      this.debugLog("CARD_TOAST", "Deduped card toast", { dedupKey });
      return;
    }
    this._evictOldestToastIfNeeded();
    const toastTimeout = this._getToastTimeout(opts.timeout);
    const toast = document.createElement("div");
    toast.className = "sl-toast sl-toast-card";
    toast.style.setProperty("--sl-card-accent", accentColor);
    toast.style.setProperty("--sl-toast-timeout", `${toastTimeout}ms`);
    toast._cardDedupKey = dedupKey;
    const accent = document.createElement("div");
    accent.className = "sl-toast-card-accent";
    toast.appendChild(accent);
    const inner = document.createElement("div");
    inner.className = "sl-toast-card-inner";
    const avatarWrap = document.createElement("div");
    avatarWrap.className = "sl-toast-card-avatar-wrap";
    const img = document.createElement("img");
    img.className = "sl-toast-card-avatar";
    img.src = avatarUrl;
    img.alt = "";
    img.onerror = () => {
      img.style.display = "none";
    };
    avatarWrap.appendChild(img);
    const statusDot = document.createElement("div");
    statusDot.className = "sl-toast-card-status";
    avatarWrap.appendChild(statusDot);
    inner.appendChild(avatarWrap);
    const content = document.createElement("div");
    content.className = "sl-toast-card-content";
    const headerEl = document.createElement("div");
    headerEl.className = "sl-toast-card-header";
    headerEl.textContent = header;
    content.appendChild(headerEl);
    const bodyEl = document.createElement("div");
    bodyEl.className = "sl-toast-card-body";
    bodyEl.textContent = body;
    content.appendChild(bodyEl);
    if (opts.detail) {
      const detailEl = document.createElement("div");
      detailEl.className = "sl-toast-card-detail";
      detailEl.textContent = opts.detail;
      content.appendChild(detailEl);
    }
    inner.appendChild(content);
    toast.appendChild(inner);
    const progressBar = document.createElement("div");
    progressBar.className = "sl-toast-card-progress";
    progressBar.style.animationDuration = `${toastTimeout}ms`;
    toast.appendChild(progressBar);
    toast.addEventListener("click", () => {
      this._clearToastFadeTimeout(toast);
      if (typeof opts.onClick === "function") {
        try {
          opts.onClick();
        } catch (_) {
        }
      }
      this.startFadeOut(toast);
      this._setTrackedTimeout(
        () => this.removeToast(toast, false),
        this.settings.fadeAnimationDuration
      );
    });
    if (!this.toastContainer) this.createToastContainer();
    this.activeToasts.push(toast);
    requestAnimationFrame(() => {
      if (this._isStopped || !this.toastContainer) return;
      this.toastContainer.appendChild(toast);
    });
    this._scheduleToastFadeOut(toast, toastTimeout);
    this.debugLog("CARD_TOAST", "Card toast created", {
      header,
      body,
      accentColor,
      activeToasts: this.activeToasts.length
    });
  }
  // ==========================================================================
  // SECTION 11: SOLOLEVELINGSTATS HOOK
  // ==========================================================================
  _canRetrySoloHook() {
    if (!this._hookRetryCount) this._hookRetryCount = 0;
    if (this._hookRetryCount >= 10) {
      this.debugLog(
        "HOOK_ABORT",
        "Max retry attempts (10) reached for SoloLevelingStats hook -- giving up"
      );
      return false;
    }
    this._hookRetryCount++;
    return true;
  }
  _scheduleSoloHookRetry(message, data = null) {
    this.debugLog("HOOK_RETRY", message, data);
    this._hookRetryId = this._setTrackedTimeout(() => this.hookIntoSoloLeveling(), 2e3);
  }
  _resolveSoloLevelingInstance() {
    const now = Date.now();
    if (this._cache.soloPluginInstance && this._cache.soloPluginInstanceTime && now - this._cache.soloPluginInstanceTime < this._cache.soloPluginInstanceTTL && BdApi.Plugins.isEnabled("SoloLevelingStats")) {
      return this._cache.soloPluginInstance;
    }
    const soloPlugin = BdApi.Plugins.get("SoloLevelingStats");
    if (!soloPlugin) return null;
    const instance = soloPlugin.instance || soloPlugin;
    this._cache.soloPluginInstance = instance;
    this._cache.soloPluginInstanceTime = now;
    return instance;
  }
  hookIntoSoloLeveling() {
    if (this._isStopped) return;
    if (!this._canRetrySoloHook()) return;
    try {
      const instance = this._resolveSoloLevelingInstance();
      if (!instance) {
        this._scheduleSoloHookRetry("SoloLevelingStats plugin/instance not found, will retry...");
        return;
      }
      if (instance.showNotification) {
        this.patcher = BdApi.Patcher.after(
          "SoloLevelingToasts",
          instance,
          "showNotification",
          (_, args) => {
            const [message, type, timeout] = args;
            const messageText = extractMessageText(message);
            const filterFlags = getNotificationFilterFlags(messageText);
            if (filterFlags.shouldSkip) {
              this.debugLog("HOOK_INTERCEPT", "Skipping spammy notification", {
                originalMessage: messageText.substring(0, 100),
                isNaturalGrowth: filterFlags.isNaturalGrowth,
                isStatAllocation: filterFlags.isStatAllocation
              });
              return;
            }
            this.debugLog("HOOK_INTERCEPT", "Intercepted showNotification call", {
              message: messageText.substring(0, 100),
              type,
              timeout
            });
            this.showToast(message, type, timeout);
          }
        );
        if (this._hookRetryId) {
          this._clearTrackedTimeout(this._hookRetryId);
          this._hookRetryId = null;
        }
        this._hookRetryCount = 0;
        this.debugLog("HOOK_SUCCESS", "Successfully hooked into SoloLevelingStats.showNotification", {
          hasPatcher: !!this.patcher
        });
      } else {
        this._scheduleSoloHookRetry("showNotification method not found, will retry...", {
          hasInstance: !!instance,
          instanceKeys: instance ? Object.keys(instance).slice(0, 10) : []
        });
      }
    } catch (error) {
      this.debugError("HOOK_ERROR", error);
      this._scheduleSoloHookRetry("Hook crashed, will retry...");
    }
  }
  unhookIntoSoloLeveling() {
    if (this.patcher) {
      BdApi.Patcher.unpatchAll("SoloLevelingToasts");
      this.patcher = null;
      this.debugLog("UNHOOK", "Unhooked from SoloLevelingStats");
    }
    this._hookRetryCount = 0;
  }
  // ==========================================================================
  // SECTION 12: SETTINGS PANEL
  // ==========================================================================
  getSettingsPanel() {
    return buildSoloLevelingToastsSettingsPanel(BdApi, this);
  }
  // ==========================================================================
  // SECTION 13: DEBUGGING & UTILITIES
  // ==========================================================================
  debugLog(operation, message, data = null) {
    if (!this.debugMode) return;
    if (typeof message === "object" && data === null) {
      data = message;
      message = operation;
      operation = "GENERAL";
    }
    const logMessage = data !== null && data !== void 0 ? `${message}` : message;
    const logData = data !== null && data !== void 0 ? data : "";
    console.log(`[SoloLevelingToasts:${operation}]`, logMessage, logData);
  }
  debugError(operation, error, data = null) {
    var _a;
    if (!this.debugMode && !((_a = this.settings) == null ? void 0 : _a.debugMode)) return;
    console.error(`[SoloLevelingToasts:ERROR:${operation}]`, error, data || "");
  }
};
