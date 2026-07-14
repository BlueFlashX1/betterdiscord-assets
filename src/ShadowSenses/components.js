const {
  GLOBAL_UTILITY_FEED_ID,
  KEYWORD_MATCH_COLOR,
  NAME_MENTION_COLOR,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  RANK_COLORS,
} = require("./constants");

function buildComponents(pluginRef) {
  const React = BdApi.React;
  const { useState, useEffect, useCallback, useRef, useReducer, useMemo } = React;
  const ce = React.createElement;
  const EVENT_LABELS = {
    status: "STATUS",
    typing: "TYPING",
    relationship: "CONNECTION",
  };

  function getEventLabel(eventType) {
    if (eventType === "message") return null;
    return EVENT_LABELS[eventType] || String(eventType || "event").toUpperCase();
  }

  function getBorderColor(matchReason, priority) {
    if (matchReason === "keyword" || matchReason === "targetKeyword") return KEYWORD_MATCH_COLOR;
    if (matchReason === "name") return NAME_MENTION_COLOR;
    return PRIORITY_COLORS[priority] || null;
  }

  function getPriorityBadge(priority) {
    const label = PRIORITY_LABELS[priority];
    if (!label) return null;
    if (priority >= 4) {
      return { label, color: "#ef4444", background: "rgba(239,68,68,0.15)" };
    }
    if (priority >= 3) {
      return { label, color: "#fbbf24", background: "rgba(251,191,36,0.15)" };
    }
    return { label, color: "#60a5fa", background: "rgba(96,165,250,0.15)" };
  }

  function getMatchBadge(entry, priority) {
    if (entry.matchReason === "keyword" || entry.matchReason === "targetKeyword") {
      return {
        label: entry.matchedTerm ? `"${entry.matchedTerm}"` : "KW",
        color: "#34d399",
        background: "rgba(52,211,153,0.15)",
      };
    }
    if (entry.matchReason === "name") {
      return {
        label: entry.matchedTerm ? `"${entry.matchedTerm}"` : "NAME",
        color: "#ec4899",
        background: "rgba(236,72,153,0.15)",
      };
    }
    return getPriorityBadge(priority);
  }

  function renderTagBadge(badge) {
    if (!badge) return null;
    return ce(
      "span",
      {
        style: {
          color: badge.color,
          fontSize: badge.fontSize || "10px",
          fontWeight: badge.fontWeight || 600,
          padding: "1px 8px",
          borderRadius: "2px",
          background: badge.background,
          letterSpacing: "0.02em",
          whiteSpace: "nowrap",
          lineHeight: 1.4,
        },
      },
      badge.label
    );
  }

  function getBurstBadge(messageCount) {
    if (messageCount <= 1) return null;
    return {
      label: `${messageCount} msgs`,
      color: "#8a2be2",
      background: "rgba(138, 43, 226, 0.15)",
    };
  }

  // Parse Discord mention syntax inside a message string and return an
  // array of React nodes (plain strings + colored <span> pills). Handles:
  //   <@USER_ID> / <@!USER_ID>   → user mention   (purple)
  //   <@&ROLE_ID>                → role mention   (role color or purple)
  //   <#CHANNEL_ID>              → channel mention (blue)
  //   @everyone / @here          → mass mention   (yellow)
  //   <a?:name:id>               → custom emoji   (kept as :name:)
  // Unresolvable IDs (left guild, deleted user) fall back to last-4-digit
  // tag so the message still reads.
  function parseContent(content, guildId) {
    if (!content || typeof content !== "string") return [];
    const Webpack = BdApi?.Webpack;
    const UserStore = Webpack?.getStore?.("UserStore");
    const ChannelStore = Webpack?.getStore?.("ChannelStore");
    const GuildStore = Webpack?.getStore?.("GuildStore");

    // <@!?USER>, <@&ROLE>, <#CHANNEL>, custom emoji <a?:name:id>,
    // @everyone / @here. Capture groups disambiguate.
    const RE = /<(@[!&]?|#)(\d+)>|<a?:([a-zA-Z0-9_]+):\d+>|@(everyone|here)\b/g;

    const PILL = (color, bg) => ({
      color,
      background: bg,
      padding: "0 4px",
      borderRadius: "2px",
      fontWeight: 500,
      whiteSpace: "nowrap",
    });

    const out = [];
    let lastIndex = 0;
    let key = 0;
    for (const match of content.matchAll(RE)) {
      if (match.index > lastIndex) out.push(content.slice(lastIndex, match.index));
      const [full, prefix, id, emojiName, special] = match;
      let node;
      if (special) {
        node = ce("span", {
          key: `m${key++}`,
          style: PILL("#fbbf24", "rgba(251, 191, 36, 0.15)"),
        }, `@${special}`);
      } else if (emojiName) {
        node = ce("span", {
          key: `m${key++}`,
          style: { color: "rgba(181, 186, 193, 0.75)" },
        }, `:${emojiName}:`);
      } else if (prefix === "@" || prefix === "@!") {
        const user = UserStore?.getUser?.(id);
        const name = user?.globalName || user?.username || `user-${id.slice(-4)}`;
        node = ce("span", {
          key: `m${key++}`,
          style: PILL("#8a2be2", "rgba(138, 43, 226, 0.18)"),
        }, `@${name}`);
      } else if (prefix === "@&") {
        let name = `role-${id.slice(-4)}`;
        let color = "#8a2be2";
        try {
          const guild = GuildStore?.getGuild?.(guildId);
          const role = guild?.roles?.[id];
          if (role) {
            name = role.name || name;
            if (role.colorString) color = role.colorString;
          }
        } catch (_) {}
        node = ce("span", {
          key: `m${key++}`,
          style: PILL(color, "rgba(138, 43, 226, 0.18)"),
        }, `@${name}`);
      } else if (prefix === "#") {
        const channel = ChannelStore?.getChannel?.(id);
        const name = channel?.name || `channel-${id.slice(-4)}`;
        node = ce("span", {
          key: `m${key++}`,
          style: PILL("#60a5fa", "rgba(96, 165, 250, 0.18)"),
        }, `#${name}`);
      } else {
        node = full;
      }
      out.push(node);
      lastIndex = match.index + full.length;
    }
    if (lastIndex < content.length) out.push(content.slice(lastIndex));
    return out;
  }

  function getContentText(entry, eventType) {
    if (eventType === "message") {
      if (!entry.content) return "— no text content —";
      return ["“", ...parseContent(entry.content, entry.guildId), "”"];
    }
    return entry.content || "— no details —";
  }

  /**
   * Build an inline thumbnail row for any media references on a feed
   * entry (image/video attachments + Tenor-style embed thumbnails).
   * Returns null when the entry has no renderable media so the card
   * stays compact. Clicks bubble up to the parent card's jump handler
   * — no per-thumbnail click handlers needed.
   *
   * Performance notes:
   *   - `loading="lazy"` — browser defers loading until the thumbnail
   *     scrolls into view. Keeps initial render cheap when the feed
   *     is dense.
   *   - `decoding="async"` — image decode happens off the main thread.
   *   - 240px max width (default) — small enough to not dominate the
   *     card layout, large enough that GIFs/photos are recognizable.
   *   - Static images / still frames only — animated MP4 playback was
   *     deliberately not enabled per user's "no lag" preference.
   *   - `onError` swaps the broken `<img>` for a `[Image]` text
   *     placeholder. Discord CDN URLs can 404 if attachments are
   *     purged or messages deleted — silent fallback keeps the card
   *     readable.
   */
  function buildMediaPreviews(entry) {
    const attachments = Array.isArray(entry.attachments) ? entry.attachments : [];
    const embeds = Array.isArray(entry.embeds) ? entry.embeds : [];
    if (attachments.length === 0 && embeds.length === 0) return null;

    const thumbStyle = {
      maxWidth: "240px",
      maxHeight: "180px",
      width: "auto",
      height: "auto",
      borderRadius: "2px",
      border: "1px solid rgba(138, 43, 226, 0.2)",
      background: "rgba(0, 0, 0, 0.25)",
      display: "block",
      objectFit: "contain",
    };

    const items = [];
    let key = 0;

    for (const a of attachments) {
      if (!a?.url) continue;
      items.push(
        ce("img", {
          key: `att${key++}`,
          src: a.url,
          alt: a.filename || "attachment",
          loading: "lazy",
          decoding: "async",
          style: thumbStyle,
          onError: (e) => {
            const node = e?.currentTarget || e?.target;
            if (node && node.parentNode) {
              const ph = document.createElement("span");
              ph.textContent = "[Image]";
              ph.style.cssText = "color: rgba(232, 227, 245, 0.5); font-size: 12px; font-style: italic;";
              node.parentNode.replaceChild(ph, node);
            }
          },
        })
      );
    }

    for (const em of embeds) {
      if (!em?.thumbnailUrl) continue;
      items.push(
        ce("img", {
          key: `em${key++}`,
          src: em.thumbnailUrl,
          alt: em.title || em.type || "embed",
          loading: "lazy",
          decoding: "async",
          style: thumbStyle,
          // Show "GIF" badge corner-mark via title attribute (tooltip)
          // since we're using static thumbnails for no-lag rendering.
          title: em.type === "gifv" ? "GIF — click card to view animated" : undefined,
          onError: (e) => {
            const node = e?.currentTarget || e?.target;
            if (node && node.parentNode) {
              const ph = document.createElement("span");
              ph.textContent = em.type === "gifv" ? "[GIF]" : "[Embed]";
              ph.style.cssText = "color: rgba(232, 227, 245, 0.5); font-size: 12px; font-style: italic;";
              node.parentNode.replaceChild(ph, node);
            }
          },
        })
      );
    }

    if (items.length === 0) return null;

    return ce(
      "div",
      {
        className: "shadow-senses-feed-media",
        style: {
          display: "flex",
          flexWrap: "wrap",
          gap: "8px",
          marginTop: "8px",
        },
      },
      ...items
    );
  }

  function parseKeywordInput(rawValue) {
    if (typeof rawValue !== "string") return [];
    const terms = rawValue.split(",").map((value) => value.trim()).filter(Boolean);
    const deduped = [];
    const seen = new Set();
    for (const term of terms) {
      const key = term.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(term);
      if (deduped.length >= 30) break;
    }
    return deduped;
  }

  function mergeKeywords(existingKeywords, rawValue) {
    const merged = [];
    const seen = new Set();
    const pushUnique = (values) => {
      for (const value of values) {
        const key = value.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(value);
        if (merged.length >= 30) break;
      }
    };
    pushUnique(parseKeywordInput(Array.isArray(existingKeywords) ? existingKeywords.join(",") : ""));
    if (merged.length >= 30) return merged;
    pushUnique(parseKeywordInput(rawValue));
    return merged;
  }

  function removeKeyword(existingKeywords, keywordToRemove) {
    const removeKey = String(keywordToRemove || "").toLowerCase();
    if (!removeKey) return Array.isArray(existingKeywords) ? [...existingKeywords] : [];
    const source = Array.isArray(existingKeywords) ? existingKeywords : [];
    return source.filter((keyword) => keyword.toLowerCase() !== removeKey);
  }

  function deploymentSortName(deployment) {
    return String(deployment?.targetUsername || "").toLowerCase();
  }

  function buildDeploymentSnapshot(deployments) {
    if (!Array.isArray(deployments) || deployments.length === 0) return "";
    return deployments
      .map((deployment) => {
        const userId = String(deployment.targetUserId || "");
        const shadowId = String(deployment.shadowId || "");
        const keywordSig = (deployment.alertKeywords || []).map((keyword) => keyword.toLowerCase()).join("|");
        // Include watch-focus so a focus toggle is a snapshot change too.
        const f = deployment.watchFocus || {};
        const focusSig = `${f.status !== false ? 1 : 0}${f.typing !== false ? 1 : 0}${f.messages !== false ? 1 : 0}${f.mentions !== false ? 1 : 0}`;
        return `${shadowId}:${userId}:${keywordSig}:${focusSig}`;
      })
      .join(";");
  }

  function getFirstContentBlock(entry, messageCount) {
    if (messageCount <= 1 || !entry.firstContent) return null;
    return ce(
      "div",
      {
        className: "shadow-senses-feed-content",
        style: {
          color: "rgba(181, 186, 193, 0.55)",
          fontSize: "12px",
          marginTop: "4px",
          fontStyle: "italic",
          lineHeight: 1.4,
          fontFamily: "'gg sans', system-ui, sans-serif",
        },
      },
      "First: “",
      ...parseContent(entry.firstContent, entry.guildId),
      "”"
    );
  }

  function buildFeedCardHeaderNodes(entry, options) {
    const {
      rankColor,
      badge,
      burstBadge,
      eventLabel,
      timeStr,
    } = options;
    // Shared base — keeps every span at 11px in Discord's text font so
    // glyph advance is uniform and the .feed-card-header gap (6px row /
    // 10px column) actually shows as separation. paddingRight on each
    // span is a belt-and-suspenders defense; padding is part of the box
    // model and immune to font-metric variance, unlike flex `gap`.
    const HB = {
      fontSize: "11px",
      fontFamily: "'gg sans', system-ui, sans-serif",
      lineHeight: 1.3,
    };
    const nodes = [
      ce("span", {
        style: { ...HB, color: rankColor, fontWeight: 700, letterSpacing: "0.03em" },
      }, `[${entry.shadowRank}] ${entry.shadowName}`),
      ce("span", { style: { ...HB, color: "#4a4a5e" } }, "→"),
      ce("span", { style: { ...HB, color: "#d4b0ff", fontWeight: 600 } }, entry.authorName),
    ];
    const matchBadgeNode = renderTagBadge(badge);
    if (matchBadgeNode) nodes.push(matchBadgeNode);
    if (burstBadge) nodes.push(renderTagBadge({ ...burstBadge, fontWeight: 600 }));
    if (eventLabel) {
      nodes.push(
        ce("span", { style: { ...HB, color: "#fbbf24", fontWeight: 700 } }, eventLabel)
      );
    }
    if (entry.guildName) {
      nodes.push(ce("span", {
        style: { ...HB, color: "#8a2be2", opacity: 0.75 },
      }, entry.guildName));
    }
    if (entry.channelId) {
      nodes.push(ce("span", { style: { ...HB, color: "#7a8ba8" } }, `#${entry.channelName}`));
    }
    nodes.push(ce("span", {
      style: {
        ...HB,
        color: "#5a5a6e",
        marginLeft: "auto",
        fontVariantNumeric: "tabular-nums",
      },
    }, timeStr));
    return nodes;
  }

  function buildFeedCardStyle(isNavigable, borderColor) {
    return {
      cursor: isNavigable ? "pointer" : "default",
      borderLeft: borderColor ? `3px solid ${borderColor}` : undefined,
    };
  }

  function createFeedCardClickHandler(isNavigable, onNavigate, entry) {
    if (!isNavigable || !onNavigate) return undefined;
    return () => onNavigate(entry);
  }

  function _applyFeedCardContentStyle(el) {
    if (!el) return;
    el.style.setProperty("font-family", "'gg sans', 'Helvetica Neue', system-ui, sans-serif", "important");
    el.style.setProperty("font-weight", "400", "important");
    el.style.setProperty("font-size", "14px", "important");
    el.style.setProperty("line-height", "1.45", "important");
    el.style.setProperty("color", "#e8e3f5", "important");
  }

  // FeedCard — memoized below: unchanged rows keep the same entry reference
  // (senses-engine-feed reuses feed[i]) and key, so memo skips them; burst
  // merges mint a new messageId → new key → remount regardless of memo.
  function FeedCardBase({ entry, onNavigate }) {
    const time = new Date(entry.timestamp);
    const timeStr = `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;
    const rankColor = RANK_COLORS[entry.shadowRank] || "#8a2be2";
    const eventType = entry.eventType || "message";
    const isNavigable = !!(entry.guildId && entry.channelId && entry.guildId !== GLOBAL_UTILITY_FEED_ID);
    const eventLabel = getEventLabel(eventType);
    const priority = entry.priority || 1;
    const msgCount = entry.messageCount || 1;
    const borderColor = getBorderColor(entry.matchReason || null, priority);
    const badge = getMatchBadge(entry, priority);
    const burstBadge = getBurstBadge(msgCount);
    const contentText = getContentText(entry, eventType);
    const firstContent = getFirstContentBlock(entry, msgCount);
    const mediaPreviews = buildMediaPreviews(entry);
    const headerNodes = buildFeedCardHeaderNodes(entry, {
      rankColor,
      badge,
      burstBadge,
      eventLabel,
      timeStr,
    });

    return ce("div", {
      className: "shadow-senses-feed-card",
      style: buildFeedCardStyle(isNavigable, borderColor),
      onClick: createFeedCardClickHandler(isNavigable, onNavigate, entry),
      // Same bulletproof technique as the message body inside —
      // class-based !important rules keep getting beaten by something
      // upstream. Inline !important via setProperty wins absolutely.
      // Note: the inline buildFeedCardStyle borderLeft (priority color)
      // is set via React style prop; setProperty here uses the OTHER
      // 3 sides only (border-top/right/bottom) so we don't override the
      // priority indicator on the left.
      ref: (el) => {
        if (!el) return;
        el.style.setProperty("background", "rgba(38, 28, 60, 0.85)", "important");
        el.style.setProperty("border-top", "1px solid rgba(138, 43, 226, 0.32)", "important");
        el.style.setProperty("border-right", "1px solid rgba(138, 43, 226, 0.32)", "important");
        el.style.setProperty("border-bottom", "1px solid rgba(138, 43, 226, 0.32)", "important");
        if (!borderColor) {
          // No priority color — also set border-left so the card has all 4 sides
          el.style.setProperty("border-left", "1px solid rgba(138, 43, 226, 0.32)", "important");
        }
        el.style.setProperty("border-radius", "2px", "important");
        el.style.setProperty("padding", "12px 14px", "important");
        el.style.setProperty("margin", "0 0 10px 0", "important");
        el.style.setProperty("box-shadow", "inset 0 1px 0 rgba(138, 43, 226, 0.12), 0 2px 6px rgba(0, 0, 0, 0.45)", "important");
      },
    },
    ce("div", { className: "shadow-senses-feed-card-header" }, ...headerNodes),
    ce("div", {
      className: "shadow-senses-feed-content",
      // ref + setProperty('important') is the only way to ship inline
      // !important from React. JSX `style` props can't carry !important;
      // class-based !important rules can be beaten by competing
      // !important rules from external themes/plugins; CSS variable
      // values can be poisoned upstream. Inline `!important`
      // declarations are the unambiguous winner per the CSS cascade
      // (highest specificity tier in the author origin).
      ref: _applyFeedCardContentStyle,
    }, contentText),
    mediaPreviews,
    firstContent
    );
  }

  const FeedCard = React.memo(FeedCardBase);

  // DeploymentRow \u2014 same bulletproof inline-style pattern as FeedCard.
  // CSS class rules keep getting beaten by external theme overrides, so
  // every visual property goes through ref + setProperty('important').
  // Watch-focus signal chips (2026-07-13). Each toggles one report class for
  // this deployment. Short labels keep the row compact.
  const WATCH_FOCUS_CHIPS = [
    { key: "status", label: "Status" },
    { key: "typing", label: "Typing" },
    { key: "messages", label: "Msgs" },
    { key: "mentions", label: "Pings" },
  ];

  function _applyFocusChip(el, active) {
    if (!el) return;
    el.style.setProperty("display", "inline-flex", "important");
    el.style.setProperty("align-items", "center", "important");
    el.style.setProperty("padding", "2px 8px", "important");
    el.style.setProperty("border-radius", "2px", "important");
    el.style.setProperty("font-family", "'gg sans', system-ui, sans-serif", "important");
    el.style.setProperty("font-size", "10px", "important");
    el.style.setProperty("font-weight", "700", "important");
    el.style.setProperty("letter-spacing", "0.04em", "important");
    el.style.setProperty("text-transform", "uppercase", "important");
    el.style.setProperty("cursor", "pointer", "important");
    el.style.setProperty("outline", "none", "important");
    el.style.setProperty("box-shadow", "none", "important");
    el.style.setProperty("transition", "background 0.15s ease, color 0.15s ease, border-color 0.15s ease", "important");
    if (active) {
      el.style.setProperty("background", "rgba(138, 43, 226, 0.22)", "important");
      el.style.setProperty("color", "#d4b0ff", "important");
      el.style.setProperty("border", "1px solid rgba(138, 43, 226, 0.55)", "important");
    } else {
      el.style.setProperty("background", "rgba(0, 0, 0, 0.25)", "important");
      el.style.setProperty("color", "#6a6a7e", "important");
      el.style.setProperty("border", "1px solid rgba(120, 120, 140, 0.18)", "important");
    }
  }

  function DeploymentRow({ deployment, onRecall, onToggleFocus, onDossier }) {
    const rankColor = RANK_COLORS[deployment.shadowRank] || "#8a2be2";
    const focus = deployment.watchFocus || {};
    const HB = {
      fontFamily: "'gg sans', 'Helvetica Neue', system-ui, sans-serif",
      fontSize: "13px",
      lineHeight: 1.3,
    };

    const topLine = ce("div", {
      style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" },
    },
      ce("div", {
        style: { display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0, ...HB },
      },
        ce("span", {
          style: { ...HB, color: rankColor, fontWeight: 700, letterSpacing: "0.03em" },
        }, `[${deployment.shadowRank}]`),
        ce("span", { style: { ...HB, color: "#d4b0ff", fontWeight: 600 } }, deployment.shadowName),
        ce("span", { style: { ...HB, color: "#5a5a6e" } }, "\u2192"),
        ce("span", {
          style: { ...HB, color: "#8a2be2", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
        }, deployment.targetUsername)
      ),
      ce("button", {
        className: "shadow-senses-recall-btn",
        onClick: () => onRecall && onRecall(deployment),
        ref: (el) => {
          if (!el) return;
          el.style.setProperty("background", "rgba(239, 68, 68, 0.12)", "important");
          el.style.setProperty("color", "#f87171", "important");
          el.style.setProperty("border", "1px solid rgba(239, 68, 68, 0.35)", "important");
          el.style.setProperty("border-radius", "2px", "important");
          el.style.setProperty("padding", "4px 12px", "important");
          el.style.setProperty("font-family", "'gg sans', system-ui, sans-serif", "important");
          el.style.setProperty("font-size", "11px", "important");
          el.style.setProperty("font-weight", "600", "important");
          el.style.setProperty("letter-spacing", "0.04em", "important");
          el.style.setProperty("text-transform", "uppercase", "important");
          el.style.setProperty("cursor", "pointer", "important");
          el.style.setProperty("box-shadow", "none", "important");
          el.style.setProperty("outline", "none", "important");
          el.style.setProperty("transition", "background 0.15s ease, border-color 0.15s ease", "important");
        },
        onMouseEnter: (e) => {
          e.currentTarget.style.setProperty("background", "rgba(239, 68, 68, 0.22)", "important");
          e.currentTarget.style.setProperty("border-color", "rgba(239, 68, 68, 0.55)", "important");
        },
        onMouseLeave: (e) => {
          e.currentTarget.style.setProperty("background", "rgba(239, 68, 68, 0.12)", "important");
          e.currentTarget.style.setProperty("border-color", "rgba(239, 68, 68, 0.35)", "important");
        },
      }, "Recall")
    );

    // Bottom line: watch-focus toggle chips (left) + Dossier button (right).
    const bottomLine = ce("div", {
      style: {
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: "8px", marginTop: "8px", flexWrap: "wrap",
      },
    },
      ce("div", { style: { display: "flex", alignItems: "center", gap: "5px", flexWrap: "wrap" } },
        WATCH_FOCUS_CHIPS.map((chip) => {
          const active = focus[chip.key] !== false;
          return ce("button", {
            key: chip.key,
            title: `${active ? "Reporting" : "Muted"}: ${chip.label} — click to ${active ? "mute" : "report"}`,
            onClick: () => onToggleFocus && onToggleFocus(deployment, chip.key, !active),
            ref: (el) => _applyFocusChip(el, active),
          }, chip.label);
        })
      ),
      ce("button", {
        title: "Copy this target's last 24h of recorded activity to the clipboard",
        onClick: () => onDossier && onDossier(deployment),
        ref: (el) => {
          if (!el) return;
          el.style.setProperty("background", "rgba(59, 130, 246, 0.12)", "important");
          el.style.setProperty("color", "#93c5fd", "important");
          el.style.setProperty("border", "1px solid rgba(59, 130, 246, 0.35)", "important");
          el.style.setProperty("border-radius", "2px", "important");
          el.style.setProperty("padding", "3px 10px", "important");
          el.style.setProperty("font-family", "'gg sans', system-ui, sans-serif", "important");
          el.style.setProperty("font-size", "10px", "important");
          el.style.setProperty("font-weight", "700", "important");
          el.style.setProperty("letter-spacing", "0.04em", "important");
          el.style.setProperty("text-transform", "uppercase", "important");
          el.style.setProperty("cursor", "pointer", "important");
          el.style.setProperty("box-shadow", "none", "important");
          el.style.setProperty("outline", "none", "important");
        },
        onMouseEnter: (e) => {
          e.currentTarget.style.setProperty("background", "rgba(59, 130, 246, 0.22)", "important");
        },
        onMouseLeave: (e) => {
          e.currentTarget.style.setProperty("background", "rgba(59, 130, 246, 0.12)", "important");
        },
      }, "Dossier")
    );

    return ce("div", {
      className: "shadow-senses-deploy-row",
      ref: (el) => {
        if (!el) return;
        el.style.setProperty("display", "block", "important");
        el.style.setProperty("background", "rgba(38, 28, 60, 0.85)", "important");
        el.style.setProperty("border", "1px solid rgba(138, 43, 226, 0.32)", "important");
        el.style.setProperty("border-radius", "2px", "important");
        el.style.setProperty("padding", "10px 14px", "important");
        el.style.setProperty("margin", "0 0 8px 0", "important");
        el.style.setProperty("box-shadow", "inset 0 1px 0 rgba(138, 43, 226, 0.12), 0 2px 6px rgba(0, 0, 0, 0.45)", "important");
      },
    }, topLine, bottomLine);
  }

  // Shared style applier for the "Deploy New Shadow" button \u2014 inline
  // !important so the theme's white pill button default doesn't bleed
  // through.
  function _applyDeployButtonStyle(el) {
    if (!el) return;
    el.style.setProperty("background", "rgba(138, 43, 226, 0.18)", "important");
    el.style.setProperty("color", "#d4b0ff", "important");
    el.style.setProperty("border", "1px solid rgba(138, 43, 226, 0.5)", "important");
    el.style.setProperty("border-radius", "2px", "important");
    el.style.setProperty("padding", "8px 18px", "important");
    el.style.setProperty("font-family", "'gg sans', system-ui, sans-serif", "important");
    el.style.setProperty("font-size", "12px", "important");
    el.style.setProperty("font-weight", "700", "important");
    el.style.setProperty("letter-spacing", "0.05em", "important");
    el.style.setProperty("text-transform", "uppercase", "important");
    el.style.setProperty("cursor", "pointer", "important");
    el.style.setProperty("box-shadow", "0 2px 8px rgba(138, 43, 226, 0.18)", "important");
    el.style.setProperty("outline", "none", "important");
    el.style.setProperty("display", "inline-flex", "important");
    el.style.setProperty("align-items", "center", "important");
    el.style.setProperty("gap", "6px", "important");
    el.style.setProperty("transition", "background 0.15s ease, border-color 0.15s ease, transform 0.15s ease", "important");
  }
  function _deployBtnHoverIn(e) {
    e.currentTarget.style.setProperty("background", "rgba(138, 43, 226, 0.32)", "important");
    e.currentTarget.style.setProperty("border-color", "rgba(138, 43, 226, 0.7)", "important");
    e.currentTarget.style.setProperty("transform", "translateY(-1px)", "important");
  }
  function _deployBtnHoverOut(e) {
    e.currentTarget.style.setProperty("background", "rgba(138, 43, 226, 0.18)", "important");
    e.currentTarget.style.setProperty("border-color", "rgba(138, 43, 226, 0.5)", "important");
    e.currentTarget.style.setProperty("transform", "none", "important");
  }

  // FeedTab
  function FeedTab({ onNavigate }) {
    const [feed, setFeed] = useState([]);
    const scrollRef = useRef(null);
    const prevLenRef = useRef(0);

    useEffect(() => {
      // Event-driven feed refresh — replaces the prior 5s setInterval
      // that polled engine._feedVersion. The engine's _feedBus emits
      // 'change' on every _feedVersion mutation (setter is in
      // SensesEngine constructor); listener subscribes for the
      // component's lifetime.
      const engine = pluginRef.sensesEngine;
      if (!engine) return undefined;
      const refresh = () => {
        if (document.hidden) return;
        try {
          setFeed(engine.getActiveFeed());
        } catch (err) { pluginRef.debugLog?.("REACT", "Feed refresh error", err); }
      };
      // PERF (2026-07-13): debounce the change events. Every detection bumps
      // _feedVersion, and each bump re-ran getActiveFeed's full entries+sort
      // (up to the global cap) while the panel was open. A 300ms trailing
      // debounce collapses detection bursts into one recompute; the panel is
      // a monitoring surface — 300ms staleness is imperceptible.
      let debounceTimer = null;
      const scheduleRefresh = () => {
        if (document.hidden || debounceTimer) return;
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          refresh();
        }, 300);
      };
      // Initial paint
      try {
        setFeed(engine.getActiveFeed());
      } catch (err) { pluginRef.debugLog?.("REACT", "Feed initial load error", err); }
      if (engine._feedBus) engine._feedBus.addEventListener("change", scheduleRefresh);
      return () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        if (engine._feedBus) engine._feedBus.removeEventListener("change", scheduleRefresh);
      };
    }, []);

    useEffect(() => {
      if (feed.length > prevLenRef.current && scrollRef.current) {
        requestAnimationFrame(() => {
          if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        });
      }
      prevLenRef.current = feed.length;
    }, [feed.length]);

    const visibleFeed = useMemo(() => {
      if (feed.length <= 200) return feed;
      return feed.slice(feed.length - 200);
    }, [feed]);

    if (visibleFeed.length === 0) {
      return ce("div", { className: "shadow-senses-empty" },
        "No messages detected yet. Shadows are watching..."
      );
    }

    return ce("div", {
      ref: scrollRef,
      style: { maxHeight: "50vh", overflowY: "auto", padding: "8px 16px" },
    },
    visibleFeed.map((entry, i) =>
      ce(FeedCard, { key: `${entry.messageId}-${i}`, entry, onNavigate })
    )
    );
  }

  // DeploymentsTab
  function DeploymentsTab({ onRecall, onDeployNew }) {
    const [deployments, setDeployments] = useState([]);
    const versionRef = useRef(-1);

    useEffect(() => {
      // Event-driven refresh — replaces the prior 2s setInterval that
      // polled deploymentManager._version. The manager's _bus emits
      // 'change' on every _version mutation (setter in
      // deployment-manager.js constructor).
      const dm = pluginRef.deploymentManager;
      try {
        setDeployments(dm ? dm.getDeployments() : []);
      } catch (err) { pluginRef.debugLog?.("REACT", "Deployments load error", err); }
      if (!dm || !dm._bus) return undefined;
      const refresh = () => {
        if (document.hidden) return;
        try {
          versionRef.current = dm._version;
          setDeployments(dm.getDeployments());
        } catch (_) {}
      };
      dm._bus.addEventListener("change", refresh);
      return () => dm._bus.removeEventListener("change", refresh);
    }, []);

    const handleRecall = useCallback((deployment) => {
      try {
        if (pluginRef.deploymentManager) {
          pluginRef.deploymentManager.recall(deployment.shadowId);
          setDeployments(pluginRef.deploymentManager.getDeployments());
          pluginRef._widgetDirty = true;
        }
      } catch (err) {
        pluginRef.debugError("DeploymentsTab", "Recall failed:", err);
      }
      if (onRecall) onRecall(deployment);
    }, [onRecall]);

    const handleToggleFocus = useCallback((deployment, signal, enabled) => {
      try {
        const dm = pluginRef.deploymentManager;
        if (!dm?.setWatchFocusForUser) return;
        const res = dm.setWatchFocusForUser(deployment.targetUserId, signal, enabled);
        // The _bus 'change' event refreshes the list; also set locally so the
        // chip flips instantly even if the bus listener is mid-teardown.
        if (res?.changed) setDeployments(dm.getDeployments());
      } catch (err) {
        pluginRef.debugError?.("DeploymentsTab", "Toggle focus failed:", err);
      }
    }, []);

    const handleDossier = useCallback((deployment) => {
      try {
        const engine = pluginRef.sensesEngine;
        if (!engine?.buildTargetDossier) return;
        const { text, count, userName } = engine.buildTargetDossier(deployment.targetUserId);
        const notify = (msg, type) => {
          try {
            if (typeof pluginRef._toast === "function") pluginRef._toast(msg, type);
            else BdApi.UI.showToast(msg, { type });
          } catch (_) {}
        };
        const copy = navigator?.clipboard?.writeText?.(text);
        if (copy && typeof copy.then === "function") {
          copy.then(
            () => notify(`Dossier copied: ${count} entr${count === 1 ? "y" : "ies"} on ${userName}`, "success"),
            () => notify("Dossier: clipboard write blocked by Discord.", "error")
          );
        } else {
          notify("Dossier: clipboard unavailable.", "error");
        }
      } catch (err) {
        pluginRef.debugError?.("DeploymentsTab", "Dossier failed:", err);
      }
    }, []);

    if (deployments.length === 0) {
      return ce("div", { style: { padding: "16px", textAlign: "center" } },
        ce("div", { className: "shadow-senses-empty" },
          "No shadows deployed. Right-click a user to deploy a shadow."
        ),
        ce("button", {
          className: "shadow-senses-deploy-btn",
          onClick: onDeployNew,
          ref: _applyDeployButtonStyle,
          onMouseEnter: _deployBtnHoverIn,
          onMouseLeave: _deployBtnHoverOut,
        }, "+ Deploy New Shadow")
      );
    }

    return ce("div", { style: { padding: "10px 16px 16px", maxHeight: "50vh", overflowY: "auto" } },
      deployments.map((d) =>
        ce(DeploymentRow, {
          key: d.shadowId,
          deployment: d,
          onRecall: handleRecall,
          onToggleFocus: handleToggleFocus,
          onDossier: handleDossier,
        })
      ),
      ce("div", { style: { display: "flex", justifyContent: "center", marginTop: 12 } },
        ce("button", {
          className: "shadow-senses-deploy-btn",
          onClick: onDeployNew,
          ref: _applyDeployButtonStyle,
          onMouseEnter: _deployBtnHoverIn,
          onMouseLeave: _deployBtnHoverOut,
        }, "+ Deploy New Shadow")
      )
    );
  }

  // KeywordAlertsTab
  // Inline-!important style appliers for KeywordAlertsTab — same bulletproof
  // pattern as Active Feed and Deployments. Each helper attaches via React
  // ref so the styling wins against any external theme/plugin cascade.
  // Hoisted to buildComponents scope (they close over nothing per-render) so
  // re-renders keep stable ref identities instead of tearing down/reapplying
  // refs across every rendered target card.
  const applyTargetCard = (el) => {
    if (!el) return;
    el.style.setProperty("background", "rgba(38, 28, 60, 0.85)", "important");
    el.style.setProperty("border", "1px solid rgba(138, 43, 226, 0.32)", "important");
    el.style.setProperty("border-radius", "2px", "important");
    el.style.setProperty("padding", "12px 14px", "important");
    el.style.setProperty("margin", "0 0 10px 0", "important");
    el.style.setProperty("box-shadow", "inset 0 1px 0 rgba(138, 43, 226, 0.12), 0 2px 6px rgba(0, 0, 0, 0.45)", "important");
  };
  const applyChip = (el) => {
    if (!el) return;
    el.style.setProperty("display", "inline-flex", "important");
    el.style.setProperty("align-items", "center", "important");
    el.style.setProperty("gap", "6px", "important");
    el.style.setProperty("background", "rgba(52, 211, 153, 0.14)", "important");
    el.style.setProperty("color", "#34d399", "important");
    el.style.setProperty("border", "1px solid rgba(52, 211, 153, 0.35)", "important");
    el.style.setProperty("border-radius", "2px", "important");
    el.style.setProperty("padding", "3px 4px 3px 10px", "important");
    el.style.setProperty("font-family", "'gg sans', system-ui, sans-serif", "important");
    el.style.setProperty("font-size", "12px", "important");
    el.style.setProperty("font-weight", "500", "important");
    el.style.setProperty("line-height", "1.3", "important");
  };
  const applyChipRemove = (el) => {
    if (!el) return;
    el.style.setProperty("background", "transparent", "important");
    el.style.setProperty("color", "rgba(52, 211, 153, 0.7)", "important");
    el.style.setProperty("border", "none", "important");
    el.style.setProperty("border-radius", "999px", "important");
    el.style.setProperty("width", "16px", "important");
    el.style.setProperty("height", "16px", "important");
    el.style.setProperty("padding", "0", "important");
    el.style.setProperty("display", "inline-flex", "important");
    el.style.setProperty("align-items", "center", "important");
    el.style.setProperty("justify-content", "center", "important");
    el.style.setProperty("font-size", "13px", "important");
    el.style.setProperty("font-weight", "700", "important");
    el.style.setProperty("line-height", "1", "important");
    el.style.setProperty("cursor", "pointer", "important");
    el.style.setProperty("outline", "none", "important");
    el.style.setProperty("box-shadow", "none", "important");
    el.style.setProperty("transition", "background 0.12s ease, color 0.12s ease", "important");
  };
  const applyKwInput = (el) => {
    if (!el) return;
    el.style.setProperty("flex", "1", "important");
    el.style.setProperty("min-width", "0", "important");
    el.style.setProperty("background", "rgba(20, 14, 36, 0.7)", "important");
    el.style.setProperty("color", "#e8e3f5", "important");
    el.style.setProperty("border", "1px solid rgba(138, 43, 226, 0.25)", "important");
    el.style.setProperty("border-radius", "2px", "important");
    el.style.setProperty("padding", "6px 10px", "important");
    el.style.setProperty("font-family", "'gg sans', system-ui, sans-serif", "important");
    el.style.setProperty("font-size", "12px", "important");
    el.style.setProperty("outline", "none", "important");
    el.style.setProperty("box-shadow", "none", "important");
    el.style.setProperty("transition", "border-color 0.15s ease", "important");
  };
  const applySmallPill = (color, bg, border) => (el) => {
    if (!el) return;
    el.style.setProperty("background", bg, "important");
    el.style.setProperty("color", color, "important");
    el.style.setProperty("border", `1px solid ${border}`, "important");
    el.style.setProperty("border-radius", "2px", "important");
    el.style.setProperty("padding", "5px 12px", "important");
    el.style.setProperty("font-family", "'gg sans', system-ui, sans-serif", "important");
    el.style.setProperty("font-size", "11px", "important");
    el.style.setProperty("font-weight", "600", "important");
    el.style.setProperty("letter-spacing", "0.04em", "important");
    el.style.setProperty("text-transform", "uppercase", "important");
    el.style.setProperty("cursor", "pointer", "important");
    el.style.setProperty("outline", "none", "important");
    el.style.setProperty("box-shadow", "none", "important");
    el.style.setProperty("white-space", "nowrap", "important");
    el.style.setProperty("transition", "background 0.15s ease, border-color 0.15s ease", "important");
  };

  function KeywordAlertsTab() {
    const [deployments, setDeployments] = useState([]);
    const [keywordDrafts, setKeywordDrafts] = useState({});
    const [keywordsByUser, setKeywordsByUser] = useState({});
    const snapshotRef = useRef("");

    const readDeployments = useCallback(() => {
      const source = pluginRef.deploymentManager?.getDeployments?.() || [];
      return [...source].sort((left, right) => deploymentSortName(left).localeCompare(deploymentSortName(right)));
    }, []);

    const syncDeployments = useCallback((force = false) => {
      try {
        const nextDeployments = readDeployments();
        const nextSnapshot = buildDeploymentSnapshot(nextDeployments);
        if (!force && nextSnapshot === snapshotRef.current) return;
        snapshotRef.current = nextSnapshot;
        setDeployments(nextDeployments);
        setKeywordDrafts((previous) => {
          const next = {};
          for (const deployment of nextDeployments) {
            const userId = String(deployment.targetUserId || "");
            if (!userId) continue;
            next[userId] = previous[userId] ?? "";
          }
          return next;
        });
        setKeywordsByUser((previous) => {
          const next = {};
          for (const deployment of nextDeployments) {
            const userId = String(deployment.targetUserId || "");
            if (!userId) continue;
            if (Array.isArray(previous[userId])) {
              next[userId] = previous[userId];
            } else {
              next[userId] = parseKeywordInput((deployment.alertKeywords || []).join(","));
            }
          }
          return next;
        });
      } catch (error) {
        pluginRef.debugError("KeywordAlertsTab", "Failed to sync deployments", error);
      }
    }, [readDeployments]);

    useEffect(() => {
      // Event-driven sync — replaces the prior 5s setInterval. Same
      // deploymentManager._bus 'change' event as DeploymentsTab.
      syncDeployments(true);
      const dm = pluginRef.deploymentManager;
      if (!dm || !dm._bus) return undefined;
      const refresh = () => {
        if (document.hidden) return;
        syncDeployments(false);
      };
      dm._bus.addEventListener("change", refresh);
      return () => dm._bus.removeEventListener("change", refresh);
    }, [syncDeployments]);

    const persistKeywords = useCallback((userId, nextKeywords, successMessage) => {
      const normalizedUserId = String(userId || "");
      if (!normalizedUserId || !pluginRef.deploymentManager) return false;
      try {
        const sanitized = parseKeywordInput((nextKeywords || []).join(","));
        const result = pluginRef.deploymentManager.setAlertKeywordsForUser(normalizedUserId, sanitized);
        if (!result || !result.ok) {
          pluginRef._toast("Unable to save keyword alerts for this target", "error", 2800);
          return false;
        }
        setKeywordsByUser((previous) => ({ ...previous, [normalizedUserId]: sanitized }));
        syncDeployments(true);
        // Only toast a save confirmation when something actually changed —
        // a re-save of the identical list shouldn't lie with "Saved N keywords".
        if (result.changed && successMessage) {
          pluginRef._toast(successMessage, "success", 1800);
        } else if (!result.changed) {
          pluginRef._toast("No changes", "info", 1200);
        }
        return true;
      } catch (error) {
        pluginRef.debugError("KeywordAlertsTab", "Failed to persist keywords", error);
        pluginRef._toast("Failed to save keyword alerts", "error", 3000);
        return false;
      }
    }, [syncDeployments]);

    const addKeywordsForUser = useCallback((userId) => {
      const normalizedUserId = String(userId || "");
      const rawDraft = keywordDrafts[normalizedUserId] || "";
      if (!rawDraft.trim()) return;
      const currentKeywords = keywordsByUser[normalizedUserId] || [];
      const merged = mergeKeywords(currentKeywords, rawDraft);
      if (merged.length === currentKeywords.length) {
        setKeywordDrafts((previous) => ({ ...previous, [normalizedUserId]: "" }));
        pluginRef._toast("No new keywords added", "info", 1500);
        return;
      }
      setKeywordDrafts((previous) => ({ ...previous, [normalizedUserId]: "" }));
      persistKeywords(
        normalizedUserId,
        merged,
        `Saved ${merged.length} keyword${merged.length === 1 ? "" : "s"}`
      );
    }, [keywordDrafts, keywordsByUser, persistKeywords]);

    const removeKeywordForUser = useCallback((userId, keyword) => {
      const normalizedUserId = String(userId || "");
      const currentKeywords = keywordsByUser[normalizedUserId] || [];
      const reduced = removeKeyword(currentKeywords, keyword);
      persistKeywords(
        normalizedUserId,
        reduced,
        reduced.length > 0
          ? `Saved ${reduced.length} keyword${reduced.length === 1 ? "" : "s"}`
          : "Cleared keyword alerts"
      );
    }, [keywordsByUser, persistKeywords]);

    const clearKeywordsForUser = useCallback((userId) => {
      const normalizedUserId = String(userId || "");
      setKeywordDrafts((previous) => ({ ...previous, [normalizedUserId]: "" }));
      persistKeywords(normalizedUserId, [], "Cleared keyword alerts");
    }, [persistKeywords]);

    if (deployments.length === 0) {
      return ce("div", { className: "shadow-senses-empty" },
        "No monitored targets yet. Deploy a shadow first, then add per-target keywords."
      );
    }

    return ce("div", { style: { padding: "12px 16px 16px", maxHeight: "50vh", overflowY: "auto" } },
      ce("div", {
        style: {
          color: "rgba(181, 186, 193, 0.7)",
          fontSize: "12px",
          lineHeight: 1.5,
          marginBottom: "10px",
          fontFamily: "'gg sans', system-ui, sans-serif",
        },
      }, "Manage keywords per monitored target. Matching is case-insensitive and uses contains logic (not exact match)."),
      ce("div", {
        style: {
          color: "rgba(181, 186, 193, 0.45)",
          fontSize: "10px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: "12px",
          fontFamily: "'gg sans', system-ui, sans-serif",
        },
      }, `${deployments.length} monitored target${deployments.length === 1 ? "" : "s"}`),
      deployments.map((deployment) => {
        const userId = String(deployment.targetUserId || "");
        const rankColor = RANK_COLORS[deployment.shadowRank] || "#8a2be2";
        const draftValue = keywordDrafts[userId] ?? "";
        const userKeywords = keywordsByUser[userId] || [];
        const HB_KW = {
          fontFamily: "'gg sans', 'Helvetica Neue', system-ui, sans-serif",
          fontSize: "13px",
          lineHeight: 1.3,
        };
        return ce("div", {
          key: deployment.shadowId,
          className: "shadow-senses-keyword-target",
          ref: applyTargetCard,
        },
          ce("div", {
            className: "shadow-senses-keyword-target-head",
            style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "10px" },
          },
            ce("div", {
              style: { display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 },
            },
              ce("span", { style: { ...HB_KW, color: rankColor, fontWeight: 700, letterSpacing: "0.03em" } }, `[${deployment.shadowRank}]`),
              ce("span", { style: { ...HB_KW, color: "#d4b0ff", fontWeight: 600 } }, deployment.shadowName),
              ce("span", { style: { ...HB_KW, color: "#5a5a6e" } }, "\u2192"),
              ce("span", { style: { ...HB_KW, color: "#8a2be2", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, deployment.targetUsername)
            ),
            ce("span", {
              className: "shadow-senses-keyword-count",
              style: {
                fontFamily: "'gg sans', system-ui, sans-serif",
                fontSize: "10px",
                fontWeight: 600,
                color: userKeywords.length > 0 ? "#34d399" : "rgba(181, 186, 193, 0.4)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                whiteSpace: "nowrap",
                background: userKeywords.length > 0 ? "rgba(52, 211, 153, 0.12)" : "rgba(138, 43, 226, 0.08)",
                border: `1px solid ${userKeywords.length > 0 ? "rgba(52, 211, 153, 0.3)" : "rgba(138, 43, 226, 0.18)"}`,
                borderRadius: "2px",
                padding: "2px 10px",
              },
            }, `${userKeywords.length} keyword${userKeywords.length === 1 ? "" : "s"}`)
          ),
          ce("div", {
            className: "shadow-senses-keyword-list",
            style: { display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px", minHeight: "24px", alignItems: "center" },
          },
            userKeywords.length === 0
              ? ce("div", {
                  className: "shadow-senses-keyword-empty",
                  style: { color: "rgba(181, 186, 193, 0.4)", fontSize: "12px", fontStyle: "italic", fontFamily: "'gg sans', system-ui, sans-serif" },
                }, "No keywords set yet.")
              : userKeywords.map((keyword) =>
                ce("span", {
                  key: `${userId}:${keyword.toLowerCase()}`,
                  className: "shadow-senses-keyword-chip",
                  ref: applyChip,
                },
                ce("span", { style: { whiteSpace: "nowrap" } }, keyword),
                ce("button", {
                  type: "button",
                  className: "shadow-senses-keyword-chip-remove",
                  title: `Remove "${keyword}"`,
                  ref: applyChipRemove,
                  onClick: () => removeKeywordForUser(userId, keyword),
                  onMouseEnter: (e) => {
                    e.currentTarget.style.setProperty("background", "rgba(239, 68, 68, 0.25)", "important");
                    e.currentTarget.style.setProperty("color", "#f87171", "important");
                  },
                  onMouseLeave: (e) => {
                    e.currentTarget.style.setProperty("background", "transparent", "important");
                    e.currentTarget.style.setProperty("color", "rgba(52, 211, 153, 0.7)", "important");
                  },
                }, "×")
                )
              )
          ),
          ce("div", {
            className: "shadow-senses-keyword-input-row",
            style: { display: "flex", alignItems: "center", gap: "6px" },
          },
            ce("input", {
              type: "text",
              className: "shadow-senses-keyword-input",
              value: draftValue,
              placeholder: "Add keyword (or comma-separated list)",
              ref: applyKwInput,
              onFocus: (e) => { e.currentTarget.style.setProperty("border-color", "rgba(138, 43, 226, 0.55)", "important"); },
              onBlur: (e) => { e.currentTarget.style.setProperty("border-color", "rgba(138, 43, 226, 0.25)", "important"); },
              onChange: (event) => {
                const value = event?.target?.value ?? "";
                setKeywordDrafts((prev) => ({ ...prev, [userId]: value }));
              },
              onKeyDown: (event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                addKeywordsForUser(userId);
              },
            }),
            ce("button", {
              className: "shadow-senses-deploy-btn shadow-senses-keyword-add-btn",
              onClick: () => addKeywordsForUser(userId),
              title: "Add keyword(s)",
              ref: applySmallPill("#d4b0ff", "rgba(138, 43, 226, 0.18)", "rgba(138, 43, 226, 0.45)"),
              onMouseEnter: (e) => {
                e.currentTarget.style.setProperty("background", "rgba(138, 43, 226, 0.32)", "important");
                e.currentTarget.style.setProperty("border-color", "rgba(138, 43, 226, 0.7)", "important");
              },
              onMouseLeave: (e) => {
                e.currentTarget.style.setProperty("background", "rgba(138, 43, 226, 0.18)", "important");
                e.currentTarget.style.setProperty("border-color", "rgba(138, 43, 226, 0.45)", "important");
              },
            }, "Add"),
            ce("button", {
              className: "shadow-senses-recall-btn shadow-senses-keyword-clear-btn",
              onClick: () => clearKeywordsForUser(userId),
              title: "Clear all keywords",
              ref: applySmallPill("#f87171", "rgba(239, 68, 68, 0.12)", "rgba(239, 68, 68, 0.35)"),
              onMouseEnter: (e) => {
                e.currentTarget.style.setProperty("background", "rgba(239, 68, 68, 0.22)", "important");
                e.currentTarget.style.setProperty("border-color", "rgba(239, 68, 68, 0.55)", "important");
              },
              onMouseLeave: (e) => {
                e.currentTarget.style.setProperty("background", "rgba(239, 68, 68, 0.12)", "important");
                e.currentTarget.style.setProperty("border-color", "rgba(239, 68, 68, 0.35)", "important");
              },
            }, "Clear All")
          )
        );
      })
    );
  }

  // SensesPanel
  function SensesPanel({ onClose, embedded }) {
    const [activeTab, setActiveTab] = useState("feed");

    const handleOverlayClick = useCallback((e) => {
      if (e.target === e.currentTarget) onClose();
    }, [onClose]);

    const handleNavigate = useCallback((entry) => {
      // Channel-only navigation via teleport. The previous experiment with
      // MessageActions.jumpToMessage to scroll-and-flash a specific message
      // was unreliable across Discord builds and was removed per user
      // request. Feed-card clicks now just close the panel and teleport
      // to the channel; the message hash is preserved in the URL path
      // but no message-scroll animation is attempted.
      if (!entry.guildId || !entry.channelId) { onClose(); return; }
      const path = entry.messageId
        ? `/channels/${entry.guildId}/${entry.channelId}/${entry.messageId}`
        : `/channels/${entry.guildId}/${entry.channelId}`;
      onClose();
      pluginRef.teleportToPath(path, {
        guildId: entry.guildId,
        channelId: entry.channelId,
        messageId: entry.messageId || null,
      });
    }, [onClose]);

    const handleDeployNew = useCallback(() => {
      pluginRef._toast("Right-click a user to deploy a shadow");
    }, []);

    const deployCount = pluginRef.deploymentManager
      ? pluginRef.deploymentManager.getDeploymentCount()
      : 0;
    const onlineMarkedCount = pluginRef.sensesEngine
      ? pluginRef.sensesEngine.getMarkedOnlineCount()
      : 0;
    const msgCount = pluginRef.sensesEngine
      ? pluginRef.sensesEngine.getTotalDetections()
      : 0;

    // Inline styles for embedded (popup) mode. Bypasses CSS-vs-theme
    // specificity battles entirely \u2014 React applies these as `style="..."`
    // attributes on the element, which beat any external stylesheet that
    // doesn't itself use !important on a same-or-higher specificity rule.
    const SS = embedded ? {
      panel: {
        background: "transparent",
        border: "none",
        borderRadius: 0,
        width: "100%",
        maxWidth: "none",
        maxHeight: "none",
        boxShadow: "none",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        // Default font for the embedded panel. Title gets the brand font
        // via its own inline style override below; everything else
        // inherits from here.
        fontFamily: "'gg sans', 'Helvetica Neue', system-ui, sans-serif",
      },
      header: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 16px 8px",
        borderBottom: "1px solid rgba(138,43,226,0.25)",
      },
      title: {
        margin: 0,
        color: "#d4b0ff",
        fontSize: "16px",
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      },
      closeBtn: {
        background: "transparent",
        border: "none",
        color: "rgba(181,186,193,0.7)",
        fontSize: "16px",
        cursor: "pointer",
        padding: "4px 8px",
        borderRadius: 0,
        outline: "none",
        boxShadow: "none",
        fontFamily: "inherit",
      },
      tabs: {
        display: "flex",
        gap: "4px",
        padding: "0 12px",
        borderBottom: "1px solid rgba(138,43,226,0.25)",
        background: "transparent",
      },
      tab: (isActive) => ({
        background: isActive ? "rgba(138,43,226,0.12)" : "transparent",
        border: "none",
        borderBottom: `2px solid ${isActive ? "#8a2be2" : "transparent"}`,
        color: isActive ? "#d4b0ff" : "rgba(181,186,193,0.6)",
        fontSize: "12px",
        fontWeight: 600,
        padding: "8px 14px",
        cursor: "pointer",
        borderRadius: 0,
        outline: "none",
        boxShadow: "none",
        fontFamily: "inherit",
        letterSpacing: "0.03em",
      }),
      footer: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        padding: "10px 16px",
        borderTop: "1px solid rgba(138,43,226,0.2)",
        color: "rgba(181,186,193,0.55)",
        fontSize: "11px",
      },
      footerSpan: { whiteSpace: "nowrap" },
    } : null;

    const panelEl = ce("div", {
      className: `shadow-senses-panel${embedded ? " shadow-senses-panel--embedded" : ""}`,
      style: SS?.panel,
    },
      ce("div", { className: "shadow-senses-panel-header", style: SS?.header },
        ce("h2", { className: "shadow-senses-panel-title", style: SS?.title }, "Shadow Senses"),
        ce("button", {
          className: "shadow-senses-close-btn",
          style: SS?.closeBtn,
          onClick: onClose,
        }, "\u2715")
      ),
      ce("div", { className: "shadow-senses-tabs", style: SS?.tabs },
        ce("button", {
          className: `shadow-senses-tab${activeTab === "feed" ? " active" : ""}`,
          style: SS ? SS.tab(activeTab === "feed") : undefined,
          onClick: () => setActiveTab("feed"),
        }, "Active Feed"),
        ce("button", {
          className: `shadow-senses-tab${activeTab === "deployments" ? " active" : ""}`,
          style: SS ? SS.tab(activeTab === "deployments") : undefined,
          onClick: () => setActiveTab("deployments"),
        }, "Deployments"),
        ce("button", {
          className: `shadow-senses-tab${activeTab === "keywords" ? " active" : ""}`,
          style: SS ? SS.tab(activeTab === "keywords") : undefined,
          onClick: () => setActiveTab("keywords"),
        }, "Keyword Alerts")
      ),
      activeTab === "feed"
        ? ce(FeedTab, { onNavigate: handleNavigate })
        : activeTab === "deployments"
          ? ce(DeploymentsTab, { onRecall: null, onDeployNew: handleDeployNew })
          : ce(KeywordAlertsTab),
      ce("div", { className: "shadow-senses-footer", style: SS?.footer },
        ce("span", { style: SS?.footerSpan },
          pluginRef.settings?.showMarkedOnlineCount
            ? `${deployCount} deployed \u2022 ${onlineMarkedCount} online`
            : `${deployCount} shadow${deployCount !== 1 ? "s" : ""} deployed`
        ),
        ce("span", { style: SS?.footerSpan },
          `${msgCount.toLocaleString()} detection${msgCount !== 1 ? "s" : ""}`)
      )
    );

    // When embedded inside the header-anchored popup, skip the full-screen
    // overlay wrapper. The popup container already provides its own
    // backdrop / position / fixed width \u2014 wrapping in shadow-senses-overlay
    // would put a 700px panel inside a 480px popup and add a duplicate
    // dimmer backdrop covering the whole viewport.
    if (embedded) return panelEl;

    return ce("div", {
      className: "shadow-senses-overlay",
      onClick: handleOverlayClick,
    }, panelEl);
  }

  // SensesWidget
  function SensesWidget() {
    const [, forceUpdate] = useReducer(x => x + 1, 0);

    useEffect(() => {
      // Event-driven widget repaint — replaces the prior 3s setInterval
      // that polled pluginRef._widgetDirty. The plugin's _widgetBus
      // emits 'dirty' on every false→true transition of _widgetDirty
      // (setter in ShadowSenses constructor); listener clears the flag
      // and forces React re-render.
      pluginRef._widgetForceUpdate = forceUpdate;
      const bus = pluginRef._widgetBus;
      const handler = () => {
        if (document.hidden) return;
        if (pluginRef._widgetDirty) {
          pluginRef._widgetDirty = false;
          forceUpdate();
        }
      };
      if (bus) bus.addEventListener("dirty", handler);
      return () => {
        if (bus) bus.removeEventListener("dirty", handler);
        pluginRef._widgetForceUpdate = null;
      };
    }, []);

    const feedCount = pluginRef.sensesEngine
      ? pluginRef.sensesEngine.getActiveFeedCount()
      : 0;
    const label = "Shadow Sense";

    return ce("div", {
      className: "shadow-senses-widget",
      onClick: () => pluginRef.openPanel(),
    },
    ce("span", { className: "shadow-senses-widget-label" },
      label
    ),
    feedCount > 0
      ? ce("span", { className: "shadow-senses-widget-badge" }, feedCount)
      : null
    );
  }

  return { SensesWidget, SensesPanel };
}

module.exports = { buildComponents };
