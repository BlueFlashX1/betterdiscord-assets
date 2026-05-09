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

  const source = plugin._PermissionsBits || {};
  const map = {};
  for (const [key, value] of Object.entries(source)) {
    if (!/^[A-Z0-9_]+$/.test(key)) continue;
    if (!["number", "string", "bigint"].includes(typeof value)) continue;
    try {
      map[key] = toBigInt(value);
    } catch (_) {}
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

module.exports = {
  getCurrentUserPermissionSummary,
  getPermissionSummaryForMember,
  getStaffIntel,
  isDetailedStaffIntelUnlocked,
  toBigInt,
};
