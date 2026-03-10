function createModal(plugin, modalId, title, subtitle = "") {
  plugin.closeModal();

  const overlay = document.createElement("div");
  overlay.id = modalId;
  overlay.className = "shadow-recon-overlay";

  const panel = document.createElement("div");
  panel.className = "shadow-recon-modal";

  const header = document.createElement("div");
  header.className = "shadow-recon-modal-header";

  const titleWrap = document.createElement("div");
  titleWrap.className = "shadow-recon-modal-title-wrap";

  const titleEl = document.createElement("h2");
  titleEl.className = "shadow-recon-modal-title";
  titleEl.textContent = title;

  const subtitleEl = document.createElement("div");
  subtitleEl.className = "shadow-recon-modal-subtitle";
  subtitleEl.textContent = subtitle;

  const closeBtn = document.createElement("button");
  closeBtn.className = "shadow-recon-close";
  closeBtn.textContent = "x";
  closeBtn.addEventListener("click", () => plugin.closeModal());

  titleWrap.appendChild(titleEl);
  titleWrap.appendChild(subtitleEl);
  header.appendChild(titleWrap);
  header.appendChild(closeBtn);

  const body = document.createElement("div");
  body.className = "shadow-recon-modal-body";

  panel.appendChild(header);
  panel.appendChild(body);
  overlay.appendChild(panel);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) plugin.closeModal();
  });

  document.body.appendChild(overlay);
  plugin._modalEl = overlay;
  return overlay;
}

function buildGrid(rows) {
  const grid = document.createElement("div");
  grid.className = "shadow-recon-grid";

  for (const [key, value] of rows) {
    const k = document.createElement("div");
    k.className = "shadow-recon-key";
    k.textContent = String(key);

    const v = document.createElement("div");
    v.className = "shadow-recon-value";
    v.textContent = String(value);

    grid.appendChild(k);
    grid.appendChild(v);
  }

  return grid;
}

function buildKeyValueSection(title, rows) {
  const section = document.createElement("section");
  section.className = "shadow-recon-section";

  const h = document.createElement("h3");
  h.className = "shadow-recon-section-title";
  h.textContent = title;

  section.appendChild(h);
  section.appendChild(buildGrid(rows));
  return section;
}

function buildPermissionsSection(title, summary) {
  const section = document.createElement("section");
  section.className = "shadow-recon-section";

  const h = document.createElement("h3");
  h.className = "shadow-recon-section-title";
  h.textContent = title;

  const list = document.createElement("div");
  list.className = "shadow-recon-perm-list";

  for (const item of summary) {
    const row = document.createElement("div");
    row.className = `shadow-recon-perm-item ${item.allowed ? "allowed" : "denied"}`;

    const label = document.createElement("span");
    label.textContent = item.label;

    const status = document.createElement("span");
    status.textContent = item.allowed ? "Allowed" : "Denied";

    row.appendChild(label);
    row.appendChild(status);
    list.appendChild(row);
  }

  section.appendChild(h);
  section.appendChild(list);
  return section;
}

module.exports = {
  createModal,
  buildKeyValueSection,
  buildPermissionsSection,
  buildGrid,
};
