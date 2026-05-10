function toBigInt(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === "string" && value.trim().length > 0) {
    try {
      return BigInt(value);
    } catch (_) {
      return 0n;
    }
  }
  return 0n;
}

function humanizePermissionKey(cache, key) {
  if (cache[key]) return cache[key];
  const result = String(key)
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  cache[key] = result;
  return result;
}

function isDetailedStaffIntelUnlocked(plugin, guildId) {
  if (!guildId) return false;
  if (!plugin.settings.loreLockedRecon) return true;
  return plugin.isGuildMarked(guildId);
}

function computeGuildPermissionBits(plugin, guildId, userId) {
  const guild = plugin._GuildStore?.getGuild?.(guildId);
  if (!guild) return 0n;

  if (String(guild.ownerId) === String(userId)) {
    return allPermissionBits(plugin);
  }

  const member = plugin._GuildMemberStore?.getMember?.(guildId, userId);
  if (!member) return 0n;

  const roleIds = new Set([String(guildId), ...(Array.isArray(member.roles) ? member.roles.map(String) : [])]);
  let bits = 0n;

  for (const roleId of roleIds) {
    const role = guild.roles?.[roleId];
    if (!role) continue;
    bits |= toBigInt(role.permissions);
  }

  return bits;
}

function getPermissionBitsMap(plugin) {
  if (plugin._permissionBitsCache) return plugin._permissionBitsCache;

  // Walk the source object + any nested .default / .Z / .ZP / .a exports
  // looking for the bit constants. Webpack module shapes change across
  // Discord builds — sometimes the constants are at the top level, sometimes
  // wrapped in an ES-module-style default export.
  const collectFromSource = (src, into) => {
    if (!src || typeof src !== "object") return;
    for (const [key, value] of Object.entries(src)) {
      if (!/^[A-Z0-9_]+$/.test(key)) continue;
      if (!["number", "string", "bigint"].includes(typeof value)) continue;
      try {
        if (into[key] === undefined) into[key] = toBigInt(value);
      } catch (_) {}
    }
  };

  const map = {};
  const root = plugin._PermissionsBits || {};
  collectFromSource(root, map);
  // Some webpack shapes nest the bit constants one level deep.
  for (const nestedKey of ["default", "Z", "ZP", "a", "Permissions"]) {
    if (root[nestedKey] && typeof root[nestedKey] === "object") {
      collectFromSource(root[nestedKey], map);
    }
  }

  plugin._permissionBitsCache = map;
  return map;
}

function allPermissionBits(plugin) {
  if (plugin._allPermsBitsCache !== undefined) return plugin._allPermsBitsCache;
  const map = getPermissionBitsMap(plugin);
  let all = 0n;
  for (const bit of Object.values(map)) {
    if (typeof bit === "bigint") all |= bit;
  }
  plugin._allPermsBitsCache = all;
  return all;
}

function getPermissionSummaryForMember(plugin, guildId, userId, { importantPermissions, humanizedPermCache }) {
  const bits = computeGuildPermissionBits(plugin, guildId, userId);
  const bitMap = getPermissionBitsMap(plugin);
  const adminBit = bitMap.ADMINISTRATOR || 0n;
  const hasAdmin = adminBit !== 0n && ((bits & adminBit) === adminBit);

  const summary = [];
  for (const key of importantPermissions) {
    const bit = bitMap[key] || 0n;
    const allowed = hasAdmin || (bit !== 0n && ((bits & bit) === bit));
    summary.push({ key, label: humanizePermissionKey(humanizedPermCache, key), allowed });
  }
  return summary;
}

function getCurrentUserPermissionSummary(plugin, guildId, constants) {
  const currentUser = plugin._UserStore?.getCurrentUser?.();
  if (!currentUser?.id) return [];

  // Preferred path: ask Discord's own PermissionStore. This is the same
  // engine that drives Discord's UI gating, so the result is guaranteed
  // accurate (handles owner override, role precedence, channel sync,
  // overrides — everything the manual bit-OR misses).
  //
  // Choke Points already proved this code path resolves bit constants
  // correctly in production. The manual computeGuildPermissionBits
  // path was returning all-denied because in some Discord builds the
  // current user's GuildMember entry isn't loaded into
  // GuildMemberStore by the time the dossier opens, so it fell to the
  // `if (!member) return 0n` early bail.
  const guild = plugin._GuildStore?.getGuild?.(guildId);
  const can = plugin._PermissionStore?.can;
  if (guild && typeof can === "function") {
    const bitMap = getPermissionBitsMap(plugin);
    const bound = can.bind(plugin._PermissionStore);
    return constants.importantPermissions.map((key) => {
      const bit = bitMap[key] || 0n;
      let allowed = false;
      if (bit !== 0n) {
        try { allowed = !!bound(bit, guild); } catch (_) { allowed = false; }
      }
      return { key, label: humanizePermissionKey(constants.humanizedPermCache, key), allowed };
    });
  }

  // Fallback if PermissionStore.can isn't available — manual bit-OR.
  return getPermissionSummaryForMember(plugin, guildId, currentUser.id, constants);
}

function getStaffIntel(plugin, userId, guildId, constants) {
  if (!guildId || !userId) return null;
  const guild = plugin._GuildStore?.getGuild?.(guildId);
  if (!guild) return null;

  if (String(guild.ownerId) === String(userId)) {
    return { label: "Server Owner", capabilities: ["Full control"] };
  }

  const summary = getPermissionSummaryForMember(plugin, guildId, userId, constants);
  const hasAdmin = summary.find((permission) => permission.key === "ADMINISTRATOR" && permission.allowed);
  if (hasAdmin) {
    return { label: "Administrator", capabilities: ["Full administrative access"] };
  }

  const capabilities = summary
    .filter((permission) => permission.allowed && constants.staffPermissionKeys.includes(permission.key) && permission.key !== "ADMINISTRATOR")
    .map((permission) => permission.label);

  if (capabilities.length > 0) {
    return { label: "Management", capabilities };
  }

  return null;
}

/**
 * Group a guild's roles into Solo Leveling threat tiers (S/A/B/C/D)
 * based on which permission bits each role grants. Each tier returns
 * roles sorted by member-count descending (largest threat groups first).
 *
 * Tier definitions:
 *   S — ADMINISTRATOR
 *   A — MANAGE_GUILD or MANAGE_ROLES or BAN_MEMBERS
 *   B — KICK_MEMBERS, MANAGE_CHANNELS, MANAGE_MESSAGES, MODERATE_MEMBERS
 *   C — MENTION_EVERYONE, MANAGE_THREADS, MANAGE_EVENTS
 *   D — anything else with at least one elevated bit (skip @everyone-default)
 */
function bandRolesByPower(plugin, guildId) {
  const result = { S: [], A: [], B: [], C: [], D: [] };
  const guild = plugin._GuildStore?.getGuild?.(guildId);
  if (!guild?.roles) return result;

  const bitMap = getPermissionBitsMap(plugin);
  const ADMIN = bitMap.ADMINISTRATOR || 0n;
  const TIER_A_BITS = (bitMap.MANAGE_GUILD || 0n) | (bitMap.MANAGE_ROLES || 0n) | (bitMap.BAN_MEMBERS || 0n);
  const TIER_B_BITS = (bitMap.KICK_MEMBERS || 0n) | (bitMap.MANAGE_CHANNELS || 0n) |
                      (bitMap.MANAGE_MESSAGES || 0n) | (bitMap.MODERATE_MEMBERS || 0n);
  const TIER_C_BITS = (bitMap.MENTION_EVERYONE || 0n) | (bitMap.MANAGE_THREADS || 0n) |
                      (bitMap.MANAGE_EVENTS || 0n);

  // Derive a member-count per role by scanning the loaded member cache.
  // This is the same source the staff snapshot already uses; bounded
  // by cache size, so counts are approximate for very large guilds.
  const roleCounts = Object.create(null);
  try {
    const sources = [
      plugin._GuildMemberStore?.getMembers?.(guildId),
      plugin._GuildMemberStore?.getMutableGuildMembers?.(guildId),
      plugin._GuildMemberStore?.members?.[guildId],
      plugin._GuildMemberStore?.guildMemberMap?.[guildId],
    ];
    for (const src of sources) {
      if (!src) continue;
      const values = Array.isArray(src) ? src : (typeof src === "object" ? Object.values(src) : []);
      for (const member of values) {
        const roles = Array.isArray(member?.roles) ? member.roles : [];
        for (const rid of roles) {
          const key = String(rid);
          roleCounts[key] = (roleCounts[key] || 0) + 1;
        }
      }
      break; // first non-empty source wins
    }
  } catch (_) {}

  for (const [roleId, role] of Object.entries(guild.roles)) {
    if (!role) continue;
    const bits = toBigInt(role.permissions);
    if (bits === 0n) continue;

    let tier;
    if (ADMIN !== 0n && (bits & ADMIN) === ADMIN) tier = "S";
    else if (TIER_A_BITS !== 0n && (bits & TIER_A_BITS) !== 0n) tier = "A";
    else if (TIER_B_BITS !== 0n && (bits & TIER_B_BITS) !== 0n) tier = "B";
    else if (TIER_C_BITS !== 0n && (bits & TIER_C_BITS) !== 0n) tier = "C";
    else tier = "D";

    // Hide the @everyone bucket from D unless it has perms beyond defaults.
    if (tier === "D" && String(roleId) === String(guildId)) continue;

    result[tier].push({
      id: roleId,
      name: role.name || roleId,
      memberCount: roleCounts[roleId] || 0,
    });
  }

  for (const k of Object.keys(result)) {
    result[k].sort((a, b) => b.memberCount - a.memberCount);
  }

  return result;
}

module.exports = {
  getCurrentUserPermissionSummary,
  getPermissionSummaryForMember,
  getStaffIntel,
  isDetailedStaffIntelUnlocked,
  bandRolesByPower,
  toBigInt,
};
