function getShadowReconCss(widgetId, modalId) {
  return `
#${widgetId}.shadow-recon-widget {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: 5px 10px 5px 6px;
  padding: 6px 8px;
  border: 1px solid rgba(96, 165, 250, 0.45);
  border-radius: 2px;
  background: linear-gradient(145deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95));
  color: #bfdbfe;
  font-size: 10px;
  line-height: 1.2;
  white-space: nowrap;
  max-width: 108px;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  user-select: none;
  flex-shrink: 0;
  transform-origin: center center;
  transition: border-color 120ms ease, color 120ms ease, transform 140ms ease;
}

#${widgetId}.shadow-recon-widget.shadow-recon-widget--rotated {
  margin: 4px 12px 4px 4px;
  padding: 4px 7px;
  border-radius: 2px;
  font-size: 9px;
  line-height: 1.2;
  max-width: none;
}

#${widgetId}.shadow-recon-widget:hover {
  border-color: rgba(96, 165, 250, 0.85);
  color: #dbeafe;
}

#${modalId}.shadow-recon-overlay {
  position: fixed;
  inset: 0;
  z-index: 10060;
  background: rgba(2, 6, 23, 0.75);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
}

#${modalId} .shadow-recon-modal {
  width: min(900px, 94vw);
  max-height: 85vh;
  border-radius: 2px;
  overflow: hidden;
  border: 1px solid rgba(96, 165, 250, 0.45);
  background: #0f172a;
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.55);
  display: flex;
  flex-direction: column;
}

#${modalId} .shadow-recon-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(96, 165, 250, 0.25);
  background: rgba(30, 41, 59, 0.9);
}

#${modalId} .shadow-recon-modal-title-wrap { display: flex; flex-direction: column; gap: 2px; }
#${modalId} .shadow-recon-modal-title { margin: 0; color: #dbeafe; font-size: 16px; }
#${modalId} .shadow-recon-modal-subtitle { color: #93c5fd; font-size: 12px; }

#${modalId} .shadow-recon-close {
  border: 1px solid rgba(148, 163, 184, 0.45);
  background: transparent;
  color: #e2e8f0;
  border-radius: 2px;
  width: 30px;
  height: 30px;
  cursor: pointer;
}

#${modalId} .shadow-recon-close:hover {
  border-color: rgba(248, 113, 113, 0.8);
  color: #fecaca;
}

#${modalId} .shadow-recon-modal-body {
  overflow: auto;
  padding: 14px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
}

#${modalId} .shadow-recon-section {
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 2px;
  padding: 10px;
  background: rgba(15, 23, 42, 0.82);
}

#${modalId} .shadow-recon-section-title {
  margin: 0 0 8px;
  color: #93c5fd;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

#${modalId} .shadow-recon-grid {
  display: grid;
  grid-template-columns: 130px 1fr;
  gap: 6px 10px;
}

#${modalId} .shadow-recon-key {
  color: #94a3b8;
  font-size: 11px;
}

#${modalId} .shadow-recon-value {
  color: #e2e8f0;
  font-size: 12px;
  word-break: break-word;
}

#${modalId} .shadow-recon-perm-list {
  display: grid;
  gap: 6px;
}

#${modalId} .shadow-recon-perm-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 2px;
  padding: 6px 8px;
  font-size: 12px;
}

#${modalId} .shadow-recon-perm-item.allowed {
  border-color: rgba(34, 197, 94, 0.45);
  color: #bbf7d0;
}

#${modalId} .shadow-recon-perm-item.denied {
  border-color: rgba(239, 68, 68, 0.4);
  color: #fecaca;
}

.shadow-recon-notice {
  grid-column: 1 / -1;
  padding: 10px;
  border: 1px solid rgba(250, 204, 21, 0.5);
  border-radius: 2px;
  color: #fde68a;
  background: rgba(120, 53, 15, 0.22);
  margin-bottom: 8px;
}

.shadow-recon-button {
  border: 1px solid rgba(96, 165, 250, 0.45);
  border-radius: 2px;
  background: rgba(15, 23, 42, 0.85);
  color: #dbeafe;
  padding: 7px 10px;
  cursor: pointer;
}

.shadow-recon-button:hover {
  border-color: rgba(96, 165, 250, 0.85);
  background: rgba(30, 58, 138, 0.35);
}

/* Guild icon custom tooltip */
.shadow-recon-tooltip {
  position: fixed;
  z-index: 10100;
  padding: 8px 12px;
  border: 1px solid rgba(168, 85, 247, 0.65);
  border-radius: 4px;
  background: rgba(10, 10, 10, 0.96);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6), 0 0 8px rgba(168, 85, 247, 0.15);
  pointer-events: none;
  opacity: 0;
  transform: translateX(-4px);
  transition: opacity 100ms ease, transform 100ms ease;
  max-width: 320px;
  font-family: inherit;
}

.shadow-recon-tooltip--visible {
  opacity: 1;
  transform: translateX(0);
}

.shadow-recon-tooltip-row {
  color: #d4d4d8;
  font-size: 12px;
  line-height: 1.5;
  white-space: nowrap;
}

.shadow-recon-tooltip-row + .shadow-recon-tooltip-row {
  margin-top: 2px;
}

.shadow-recon-tooltip-tag {
  font-weight: 600;
  font-size: 11px;
  padding: 1px 5px;
  border-radius: 2px;
  letter-spacing: 0.02em;
}

.shadow-recon-tooltip-tag--marked {
  color: #c084fc;
  background: rgba(168, 85, 247, 0.18);
  border: 1px solid rgba(168, 85, 247, 0.4);
}

.shadow-recon-tooltip-tag--unmarked {
  color: #a1a1aa;
  background: rgba(113, 113, 122, 0.15);
  border: 1px solid rgba(113, 113, 122, 0.3);
}

.shadow-recon-tooltip-name {
  color: #e4e4e7;
  font-weight: 500;
}
`;
}

module.exports = {
  getShadowReconCss,
};
