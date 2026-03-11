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
          fontSize: badge.fontSize || "0.75em",
          fontWeight: badge.fontWeight || 700,
          padding: "1px 4px",
          borderRadius: "3px",
          background: badge.background,
        },
      },
      badge.label
    );
  }

  function getBurstBadge(messageCount) {
    if (messageCount <= 1) return null;
    return {
      label: `${messageCount} msgs`,
      color: "#a78bfa",
      background: "rgba(167, 139, 250, 0.15)",
    };
  }

  function getContentText(entry, eventType) {
    if (eventType === "message") {
      return entry.content ? `“${entry.content}”` : "— no text content —";
    }
    return entry.content || "— no details —";
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
        return `${shadowId}:${userId}:${keywordSig}`;
      })
      .join(";");
  }

  function getFirstContentBlock(entry, messageCount) {
    if (messageCount <= 1 || !entry.firstContent) return null;
    return ce(
      "div",
      {
        className: "shadow-senses-feed-content",
        style: { color: "#888", fontSize: "11px", marginTop: "2px", fontStyle: "italic" },
      },
      `First: “${entry.firstContent}”`
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
    const nodes = [
      ce("span", { style: { color: rankColor, fontWeight: 600 } }, `[${entry.shadowRank}] ${entry.shadowName}`),
      ce("span", { style: { color: "#666" } }, "→"),
      ce("span", { style: { color: "#ccc" } }, entry.authorName),
    ];
    const matchBadgeNode = renderTagBadge(badge);
    if (matchBadgeNode) nodes.push(matchBadgeNode);
    if (burstBadge) nodes.push(renderTagBadge({ ...burstBadge, fontWeight: 600 }));
    if (eventLabel) {
      nodes.push(
        ce("span", { style: { color: "#fbbf24", fontSize: "0.8em", fontWeight: 700 } }, eventLabel)
      );
    }
    if (entry.guildName) {
      nodes.push(ce("span", { style: { color: "#a78bfa", fontSize: "0.85em" } }, entry.guildName));
    }
    if (entry.channelId) {
      nodes.push(ce("span", { style: { color: "#60a5fa" } }, `#${entry.channelName}`));
    }
    nodes.push(ce("span", { style: { color: "#666", marginLeft: "auto" } }, timeStr));
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

  // ── FeedCard ──────────────────────────────────────────────────────────
  function FeedCard({ entry, onNavigate }) {
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
    },
    ce("div", { className: "shadow-senses-feed-card-header" }, ...headerNodes),
    ce("div", { className: "shadow-senses-feed-content" }, contentText),
    firstContent
    );
  }

  // ── DeploymentRow ─────────────────────────────────────────────────────
  function DeploymentRow({ deployment, onRecall }) {
    const rankColor = RANK_COLORS[deployment.shadowRank] || "#8a2be2";

    return ce("div", { className: "shadow-senses-deploy-row" },
      ce("div", { className: "shadow-senses-deploy-info" },
        ce("span", { className: "shadow-senses-deploy-rank", style: { color: rankColor } },
          `[${deployment.shadowRank}]`
        ),
        ce("span", null, deployment.shadowName),
        ce("span", { className: "shadow-senses-deploy-arrow" }, "\u2192"),
        ce("span", { className: "shadow-senses-deploy-target" }, deployment.targetUsername)
      ),
      ce("button", {
        className: "shadow-senses-recall-btn",
        onClick: () => onRecall && onRecall(deployment),
      }, "Recall")
    );
  }

  // ── FeedTab ───────────────────────────────────────────────────────────
  function FeedTab({ onNavigate }) {
    const [feed, setFeed] = useState([]);
    const scrollRef = useRef(null);
    const prevLenRef = useRef(0);

    useEffect(() => {
      let lastVersion = -1;
      const poll = setInterval(() => {
        if (document.hidden) return;
        try {
          const engine = pluginRef.sensesEngine;
          if (!engine) return;
          const currentVersion = engine._feedVersion;
          if (currentVersion !== lastVersion) {
            lastVersion = currentVersion;
            setFeed(engine.getActiveFeed());
          }
        } catch (_) { pluginRef.debugLog?.("REACT", "Feed poll error", _); }
      }, 2000);
      try {
        const engine = pluginRef.sensesEngine;
        if (engine) {
          setFeed(engine.getActiveFeed());
          lastVersion = engine._feedVersion;
        }
      } catch (_) { pluginRef.debugLog?.("REACT", "Feed initial load error", _); }
      return () => clearInterval(poll);
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

  // ── DeploymentsTab ────────────────────────────────────────────────────
  function DeploymentsTab({ onRecall, onDeployNew }) {
    const [deployments, setDeployments] = useState([]);

    useEffect(() => {
      try {
        setDeployments(pluginRef.deploymentManager ? pluginRef.deploymentManager.getDeployments() : []);
      } catch (_) { pluginRef.debugLog?.("REACT", "Deployments load error", _); }
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

    if (deployments.length === 0) {
      return ce("div", { style: { padding: "16px" } },
        ce("div", { className: "shadow-senses-empty" },
          "No shadows deployed. Right-click a user to deploy a shadow."
        ),
        ce("button", {
          className: "shadow-senses-deploy-btn",
          onClick: onDeployNew,
          style: { marginTop: 12 },
        }, "Deploy New Shadow")
      );
    }

    return ce("div", { style: { padding: "8px 16px", maxHeight: "50vh", overflowY: "auto" } },
      deployments.map((d) =>
        ce(DeploymentRow, { key: d.shadowId, deployment: d, onRecall: handleRecall })
      ),
      ce("button", {
        className: "shadow-senses-deploy-btn",
        onClick: onDeployNew,
        style: { marginTop: 8 },
      }, "Deploy New Shadow")
    );
  }

  // ── KeywordAlertsTab ──────────────────────────────────────────────────
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
      syncDeployments(true);
      const poll = setInterval(() => {
        if (document.hidden) return;
        syncDeployments(false);
      }, 2000);
      return () => clearInterval(poll);
    }, [syncDeployments]);

    const persistKeywords = useCallback((userId, nextKeywords, successMessage) => {
      const normalizedUserId = String(userId || "");
      if (!normalizedUserId || !pluginRef.deploymentManager) return false;
      try {
        const sanitized = parseKeywordInput((nextKeywords || []).join(","));
        const didSave = pluginRef.deploymentManager.setAlertKeywordsForUser(normalizedUserId, sanitized);
        if (!didSave) {
          pluginRef._toast("Unable to save keyword alerts for this target", "error", 2800);
          return false;
        }
        setKeywordsByUser((previous) => ({ ...previous, [normalizedUserId]: sanitized }));
        syncDeployments(true);
        if (successMessage) {
          pluginRef._toast(successMessage, "success", 1800);
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

    return ce("div", { style: { padding: "10px 16px", maxHeight: "50vh", overflowY: "auto" } },
      ce("div", {
        style: {
          color: "#aab",
          fontSize: "12px",
          lineHeight: 1.45,
          marginBottom: "12px",
        },
      }, "Manage keywords per monitored target. Matching is case-insensitive and uses contains logic (not exact match)."),
      ce("div", {
        style: {
          color: "#8ea2b8",
          fontSize: "11px",
          marginBottom: "10px",
        },
      }, `${deployments.length} monitored target${deployments.length === 1 ? "" : "s"}`),
      deployments.map((deployment) => {
        const userId = String(deployment.targetUserId || "");
        const rankColor = RANK_COLORS[deployment.shadowRank] || "#8a2be2";
        const draftValue = keywordDrafts[userId] ?? "";
        const userKeywords = keywordsByUser[userId] || [];
        return ce("div", {
          key: deployment.shadowId,
          className: "shadow-senses-keyword-target",
        },
          ce("div", { className: "shadow-senses-keyword-target-head" },
            ce("div", { className: "shadow-senses-deploy-info" },
              ce("span", { className: "shadow-senses-deploy-rank", style: { color: rankColor } }, `[${deployment.shadowRank}]`),
              ce("span", null, deployment.shadowName),
              ce("span", { className: "shadow-senses-deploy-arrow" }, "\u2192"),
              ce("span", { className: "shadow-senses-deploy-target" }, deployment.targetUsername)
            ),
            ce("span", { className: "shadow-senses-keyword-count" },
              `${userKeywords.length} keyword${userKeywords.length === 1 ? "" : "s"}`
            )
          ),
          ce("div", { className: "shadow-senses-keyword-list" },
            userKeywords.length === 0
              ? ce("div", { className: "shadow-senses-keyword-empty" }, "No keywords set yet.")
              : userKeywords.map((keyword) =>
                ce("span", {
                  key: `${userId}:${keyword.toLowerCase()}`,
                  className: "shadow-senses-keyword-chip",
                },
                ce("span", null, keyword),
                ce("button", {
                  type: "button",
                  className: "shadow-senses-keyword-chip-remove",
                  title: `Remove "${keyword}"`,
                  onClick: () => removeKeywordForUser(userId, keyword),
                }, "×")
                )
              )
          ),
          ce("div", { className: "shadow-senses-keyword-input-row" },
            ce("input", {
              type: "text",
              className: "shadow-senses-keyword-input",
              value: draftValue,
              placeholder: "Add keyword (or comma-separated list)",
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
            }, "Add"),
            ce("button", {
              className: "shadow-senses-recall-btn shadow-senses-keyword-clear-btn",
              onClick: () => clearKeywordsForUser(userId),
              title: "Clear all keywords",
            }, "Clear All")
          )
        );
      })
    );
  }

  // ── SensesPanel ───────────────────────────────────────────────────────
  function SensesPanel({ onClose }) {
    const [activeTab, setActiveTab] = useState("feed");

    const handleOverlayClick = useCallback((e) => {
      if (e.target === e.currentTarget) onClose();
    }, [onClose]);

    const handleNavigate = useCallback((entry) => {
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

    return ce("div", {
      className: "shadow-senses-overlay",
      onClick: handleOverlayClick,
    },
    ce("div", { className: "shadow-senses-panel" },
      ce("div", { className: "shadow-senses-panel-header" },
        ce("h2", { className: "shadow-senses-panel-title" }, "Shadow Senses"),
        ce("button", {
          className: "shadow-senses-close-btn",
          onClick: onClose,
        }, "\u2715")
      ),
      ce("div", { className: "shadow-senses-tabs" },
        ce("button", {
          className: `shadow-senses-tab${activeTab === "feed" ? " active" : ""}`,
          onClick: () => setActiveTab("feed"),
        }, "Active Feed"),
        ce("button", {
          className: `shadow-senses-tab${activeTab === "deployments" ? " active" : ""}`,
          onClick: () => setActiveTab("deployments"),
        }, "Deployments"),
        ce("button", {
          className: `shadow-senses-tab${activeTab === "keywords" ? " active" : ""}`,
          onClick: () => setActiveTab("keywords"),
        }, "Keyword Alerts")
      ),
      activeTab === "feed"
        ? ce(FeedTab, { onNavigate: handleNavigate })
        : activeTab === "deployments"
          ? ce(DeploymentsTab, { onRecall: null, onDeployNew: handleDeployNew })
          : ce(KeywordAlertsTab),
      ce("div", { className: "shadow-senses-footer" },
        ce("span", null,
          pluginRef.settings?.showMarkedOnlineCount
            ? `${deployCount} deployed \u2022 ${onlineMarkedCount} online`
            : `${deployCount} shadow${deployCount !== 1 ? "s" : ""} deployed`
        ),
        ce("span", null, `${msgCount.toLocaleString()} detection${msgCount !== 1 ? "s" : ""}`)
      )
    )
    );
  }

  // ── SensesWidget ──────────────────────────────────────────────────────
  function SensesWidget() {
    const [, forceUpdate] = useReducer(x => x + 1, 0);

    useEffect(() => {
      pluginRef._widgetForceUpdate = forceUpdate;
      const poll = setInterval(() => {
        if (document.hidden) return;
        if (pluginRef._widgetDirty) {
          pluginRef._widgetDirty = false;
          forceUpdate();
        }
      }, 3000);
      return () => {
        clearInterval(poll);
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
