/**
 * Renders the history affordance on messages we hold versions for.
 *
 * Hot-path design: the observer callback does a Set membership test on the
 * message id and nothing else. No DOM queries, no IndexedDB reads, no fiber
 * walks for the overwhelming majority of messages (which have never been
 * edited). The id Set is owned by index.js — seeded once at start and updated
 * as edits are recorded. Only on a hit do we touch the DOM or the database.
 *
 * This is the deliberate exception to the suite's "drive per-message work from
 * FluxDispatcher, not the DOM" rule (DKB bd-message-hot-path-flux-not-dom):
 * we are not detecting messages here, we are decorating already-rendered ones,
 * which has no Flux equivalent — a message scrolled back into view fires no
 * dispatch. The rule's actual cost driver (per-message DOM scraping) is absent.
 */

const { escapeHtml } = require("../shared/escape-html");

// Discord tags each row as chat-messages-<channelId>-<messageId>.
const ROW_ID_PREFIX = "chat-messages-";
const BADGE_CLASS = "sl-meh-badge";
const BADGE_FLAG = "data-sl-meh";

function extractMessageId(listItemId) {
  if (!listItemId || !listItemId.startsWith(ROW_ID_PREFIX)) return null;
  // Format is chat-messages-<channelId>-<messageId>; ids are snowflakes with
  // no dashes, so the tail after the final dash is the message id.
  const lastDash = listItemId.lastIndexOf("-");
  if (lastDash <= ROW_ID_PREFIX.length) return null;
  return listItemId.slice(lastDash + 1);
}

/**
 * @param {object} deps
 * @param {Set<string>} deps.knownIds        - message ids with stored history
 * @param {function} deps.loadRecord         - (messageId) => Promise<record|null>
 * @param {function} deps.formatTimestamp    - (epochMs) => string
 * @param {function} deps.onError            - (context, err) => void
 */
function createDecorator({ knownIds, loadRecord, formatTimestamp, onError }) {
  let observer = null;
  let popout = null;
  let onDocClick = null;

  function closePopout() {
    if (popout) {
      popout.remove();
      popout = null;
    }
    if (onDocClick) {
      document.removeEventListener("mousedown", onDocClick, true);
      onDocClick = null;
    }
  }

  function renderPopout(anchor, record) {
    closePopout();

    const versions = record?.versions || [];
    const rows = versions
      .map((v, i) => `
        <div class="sl-meh-version">
          <div class="sl-meh-version-head">
            <span class="sl-meh-version-num">v${i + 1}</span>
            <span class="sl-meh-version-time">${escapeHtml(formatTimestamp(v.at))}</span>
          </div>
          <div class="sl-meh-version-body">${escapeHtml(v.content) || "<em>(empty)</em>"}</div>
        </div>`)
      .join("");

    popout = document.createElement("div");
    popout.className = "sl-meh-popout";
    popout.innerHTML = `
      <div class="sl-meh-popout-title">Edit history — ${versions.length} previous ${versions.length === 1 ? "version" : "versions"}</div>
      <div class="sl-meh-popout-body">${rows || '<div class="sl-meh-empty">No stored versions.</div>'}</div>
      <div class="sl-meh-popout-foot">Current text is shown in the message above.</div>
    `;
    document.body.appendChild(popout);

    // Anchor above the badge, clamped into the viewport.
    const rect = anchor.getBoundingClientRect();
    const box = popout.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - box.width - 8));
    const top = rect.top - box.height - 8;
    popout.style.left = `${left}px`;
    popout.style.top = `${top < 8 ? rect.bottom + 8 : top}px`;

    // Capture phase: Discord stops propagation on plenty of click targets.
    onDocClick = (e) => {
      if (popout && !popout.contains(e.target) && e.target !== anchor) closePopout();
    };
    document.addEventListener("mousedown", onDocClick, true);
  }

  function attachBadge(row, messageId) {
    if (row.hasAttribute(BADGE_FLAG)) return;
    row.setAttribute(BADGE_FLAG, "1");

    const content = row.querySelector(`[id^="message-content-"]`);
    if (!content) {
      // Row shape was unexpected — clear the flag so a later render retries.
      row.removeAttribute(BADGE_FLAG);
      return;
    }

    const badge = document.createElement("span");
    badge.className = BADGE_CLASS;
    badge.textContent = "✎ history";
    badge.setAttribute("role", "button");
    badge.setAttribute("tabindex", "0");
    badge.title = "Show previous versions of this message";

    const open = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (popout) { closePopout(); return; }
      loadRecord(messageId)
        .then((record) => renderPopout(badge, record))
        .catch((err) => onError("loadRecord", err));
    };

    badge.addEventListener("click", open);
    badge.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") open(e);
    });

    content.appendChild(badge);
  }

  /** Decorate any already-rendered messages we have history for. */
  function scanExisting() {
    if (knownIds.size === 0) return;
    const rows = document.querySelectorAll(`[data-list-item-id^="${ROW_ID_PREFIX}"]`);
    for (const row of rows) {
      const id = extractMessageId(row.getAttribute("data-list-item-id"));
      if (id && knownIds.has(id)) attachBadge(row, id);
    }
  }

  function handleNode(node) {
    if (node.nodeType !== 1) return;

    const ownId = extractMessageId(node.getAttribute?.("data-list-item-id"));
    if (ownId) {
      if (knownIds.has(ownId)) attachBadge(node, ownId);
      return;
    }

    // Discord often swaps a container holding several rows.
    const rows = node.querySelectorAll?.(`[data-list-item-id^="${ROW_ID_PREFIX}"]`);
    if (!rows) return;
    for (const row of rows) {
      const id = extractMessageId(row.getAttribute("data-list-item-id"));
      if (id && knownIds.has(id)) attachBadge(row, id);
    }
  }

  function start() {
    stop();
    observer = new MutationObserver((records) => {
      // Cheap exit before any per-node work: nothing stored means nothing to draw.
      if (knownIds.size === 0) return;
      for (const record of records) {
        for (const node of record.addedNodes) {
          try { handleNode(node); } catch (err) { onError("decorate", err); }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    scanExisting();
  }

  function stop() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    closePopout();
    for (const el of document.querySelectorAll(`.${BADGE_CLASS}`)) el.remove();
    for (const el of document.querySelectorAll(`[${BADGE_FLAG}]`)) el.removeAttribute(BADGE_FLAG);
  }

  /** Draw the badge immediately for a message that was just edited on screen. */
  function decorateNow(messageId) {
    const row = document.querySelector(
      `[data-list-item-id^="${ROW_ID_PREFIX}"][data-list-item-id$="-${messageId}"]`
    );
    if (row) attachBadge(row, messageId);
  }

  return { start, stop, decorateNow, scanExisting, closePopout };
}

module.exports = { createDecorator, extractMessageId };
