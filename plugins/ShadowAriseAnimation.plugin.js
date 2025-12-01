/**
 * @name ShadowAriseAnimation
 * @author BlueFlashXS
 * @description Solo Leveling Shadow ARISE animation when a shadow is extracted (integrates with ShadowArmy)
 * @version 1.0.0
 */

module.exports = class ShadowAriseAnimation {
  constructor() {
    this.defaultSettings = {
      enabled: true,
      animationDuration: 2500,
      scale: 1.0,
      showRankAndRole: true,
    };

    this.settings = this.defaultSettings;
    this.animationContainer = null;
  }

  start() {
    this.loadSettings();
    this.injectCSS();
  }

  stop() {
    this.removeAllAnimations();
    this.removeCSS();
  }

  loadSettings() {
    try {
      const saved = BdApi.Data.load('ShadowAriseAnimation', 'settings');
      if (saved) {
        this.settings = { ...this.defaultSettings, ...saved };
      }
    } catch (error) {
      console.error('ShadowAriseAnimation: Failed to load settings', error);
    }
  }

  saveSettings() {
    try {
      BdApi.Data.save('ShadowAriseAnimation', 'settings', this.settings);
    } catch (error) {
      console.error('ShadowAriseAnimation: Failed to save settings', error);
    }
  }

  getSettingsPanel() {
    const panel = document.createElement('div');
    panel.style.padding = '16px';
    panel.innerHTML = `
      <div style="margin-bottom: 12px;">
        <h3 style="color: #8b5cf6; margin-bottom: 8px;">Shadow ARISE Animation</h3>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:8px;">
          <input type="checkbox" id="sa-enabled" ${this.settings.enabled ? 'checked' : ''}>
          <span>Enable ARISE animation</span>
        </label>
        <label style="display:block;margin-bottom:8px;">
          <span style="display:block;margin-bottom:4px;">Animation duration (ms)</span>
          <input type="number" id="sa-duration" value="${this.settings.animationDuration}" min="800" max="6000" step="200" style="width:100%;padding:4px;">
        </label>
        <label style="display:block;margin-bottom:8px;">
          <span style="display:block;margin-bottom:4px;">Scale</span>
          <input type="number" id="sa-scale" value="${this.settings.scale}" min="0.5" max="2.0" step="0.1" style="width:100%;padding:4px;">
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:8px;">
          <input type="checkbox" id="sa-show-meta" ${this.settings.showRankAndRole ? 'checked' : ''}>
          <span>Show rank and role under ARISE</span>
        </label>
      </div>
    `;

    panel.querySelector('#sa-enabled').addEventListener('change', (e) => {
      this.settings.enabled = e.target.checked;
      this.saveSettings();
    });

    panel.querySelector('#sa-duration').addEventListener('change', (e) => {
      this.settings.animationDuration = parseInt(e.target.value, 10) || this.defaultSettings.animationDuration;
      this.saveSettings();
    });

    panel.querySelector('#sa-scale').addEventListener('change', (e) => {
      this.settings.scale = parseFloat(e.target.value) || this.defaultSettings.scale;
      this.saveSettings();
    });

    panel.querySelector('#sa-show-meta').addEventListener('change', (e) => {
      this.settings.showRankAndRole = e.target.checked;
      this.saveSettings();
    });

    return panel;
  }

  injectCSS() {
    const styleId = 'shadow-arise-animation-css';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .sa-animation-container {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 999999;
      }

      .sa-arise-wrapper {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        text-align: center;
        animation: sa-arise-float var(--sa-duration, 2.5s) ease-out forwards;
      }

      .sa-arise-text {
        font-family: 'Nova Flat', 'Press Start 2P', system-ui, sans-serif;
        font-weight: 700;
        font-size: 42px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        background: linear-gradient(135deg, #020617 0%, #0f172a 35%, #1d4ed8 70%, #38bdf8 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        text-shadow:
          0 0 10px rgba(15, 23, 42, 0.95),
          0 0 18px rgba(37, 99, 235, 0.95),
          0 0 26px rgba(56, 189, 248, 0.75);
        animation: sa-arise-glow 0.7s ease-in-out infinite alternate;
      }

      .sa-arise-meta {
        margin-top: 6px;
        font-size: 14px;
        color: #e5e7eb;
        text-shadow: 0 0 8px rgba(15, 23, 42, 0.8);
        opacity: 0.9;
      }

      .sa-arise-particle {
        position: absolute;
        width: 5px;
        height: 5px;
        border-radius: 999px;
        background: radial-gradient(circle, #38bdf8 0%, rgba(15, 23, 42, 0) 70%);
        animation: sa-arise-particle-fade var(--sa-duration, 2.5s) ease-out forwards;
      }

      @keyframes sa-arise-float {
        0% {
          opacity: 0;
          transform: translate(-50%, -40%) scale(0.6);
        }
        15% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1.1);
        }
        100% {
          opacity: 0;
          transform: translate(-50%, -70%) scale(0.9);
        }
      }

      @keyframes sa-arise-glow {
        from {
          filter:
            drop-shadow(0 0 10px rgba(15, 23, 42, 1))
            drop-shadow(0 0 18px rgba(37, 99, 235, 0.9));
        }
        to {
          filter:
            drop-shadow(0 0 16px rgba(30, 64, 175, 1))
            drop-shadow(0 0 30px rgba(56, 189, 248, 0.95));
        }
      }

      @keyframes sa-arise-particle-fade {
        0% {
          opacity: 1;
          transform: translate(0, 0) scale(1);
        }
        100% {
          opacity: 0;
          transform: translate(var(--sa-particle-x, 0px), var(--sa-particle-y, -140px)) scale(0);
        }
      }
    `;

    document.head.appendChild(style);
  }

  removeCSS() {
    const style = document.getElementById('shadow-arise-animation-css');
    if (style) style.remove();
  }

  getContainer() {
    if (!this.animationContainer) {
      const container = document.createElement('div');
      container.className = 'sa-animation-container';
      document.body.appendChild(container);
      this.animationContainer = container;
    }
    return this.animationContainer;
  }

  removeAllAnimations() {
    if (this.animationContainer && this.animationContainer.parentNode) {
      this.animationContainer.parentNode.removeChild(this.animationContainer);
      this.animationContainer = null;
    }
  }

  /**
   * Public API used by ShadowArmy: trigger an ARISE animation for a given shadow.
   */
  triggerArise(shadow) {
    if (!this.settings.enabled) return;
    if (typeof document === 'undefined') return;

    const container = this.getContainer();
    const durationMs = this.settings.animationDuration || this.defaultSettings.animationDuration;

    const wrapper = document.createElement('div');
    wrapper.className = 'sa-arise-wrapper';
    wrapper.style.setProperty('--sa-duration', `${durationMs}ms`);
    const scale = this.settings.scale || 1;
    wrapper.style.transform = `translate(-50%, -50%) scale(${scale})`;

    const title = document.createElement('div');
    title.className = 'sa-arise-text';
    title.textContent = 'ARISE';
    wrapper.appendChild(title);

    if (this.settings.showRankAndRole && shadow) {
      const meta = document.createElement('div');
      meta.className = 'sa-arise-meta';
      const rankText = shadow.rank ? `${shadow.rank}-Rank` : '';
      const roleText = shadow.roleName || shadow.role || '';
      meta.textContent = [rankText, roleText].filter(Boolean).join(' • ');
      wrapper.appendChild(meta);
    }

    // Spawn some particles around the wrapper
    const particleCount = 22;
    for (let i = 0; i < particleCount; i++) {
      const p = document.createElement('div');
      p.className = 'sa-arise-particle';
      const angle = Math.random() * Math.PI * 2;
      const radius = 40 + Math.random() * 80;
      const dx = Math.cos(angle) * radius;
      const dy = -Math.abs(Math.sin(angle) * radius);
      p.style.setProperty('--sa-particle-x', `${dx}px`);
      p.style.setProperty('--sa-particle-y', `${dy}px`);
      p.style.left = '50%';
      p.style.top = '50%';
      wrapper.appendChild(p);
    }

    container.appendChild(wrapper);

    setTimeout(() => {
      wrapper.remove();
    }, durationMs + 200);
  }
};
