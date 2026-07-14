const C = require('./constants');
const SLEvents = require('../shared/event-bus');

// Slot compatibility map — maps an equipment slot type to the
// physical equipment slots it can occupy.
const SLOT_COMPATIBILITY = {
  ring: ['ring1', 'ring2'],
};

/**
 * Resolve which physical slots an item can occupy.
 * Returns an array of slot names (usually one, two for rings).
 * @param {object} definition - Equipment definition from C.EQUIPMENT_DATABASE
 * @returns {string[]}
 */
function resolveCompatibleSlots(definition) {
  const slotType = definition.slot;
  return SLOT_COMPATIBILITY[slotType] || [slotType];
}

/**
 * Equipment logic mixin.
 * Mixed into the EquipmentManager plugin class via Object.assign.
 *
 * Assumes `this` has:
 *   this.storage       — EquipmentStorage instance
 *   this._userLevel    — number (provided by SoloLevelingStats integration)
 *   this._cachedBonuses — object (maintained here)
 *   this.debugLog      — optional debug log function
 */
module.exports = {
  /**
   * Equip an item from inventory into a slot.
   *
   * @param {string} instanceId   — inventory item instance ID
   * @param {string} targetSlot   — slot to equip into (e.g. 'weapon', 'ring1')
   * @returns {{ success: boolean, message: string, unequippedInstanceId?: string }}
   */
  equipItem(instanceId, targetSlot) {
    // 1. Find instance in inventory — O(1) via storage's own Map (was a linear
    //    .find() over a freshly-materialized array, 2026-07-13).
    const instance = this.storage.getInstance(instanceId);
    if (!instance) {
      return { success: false, message: 'Item not found in inventory.' };
    }

    // 2. Get equipment definition
    const definition = C.getEquipmentById(instance.equipmentId);
    if (!definition) {
      return {
        success: false,
        message: `Unknown equipment ID: ${instance.equipmentId}`,
      };
    }

    // 3. Validate slot compatibility
    const compatibleSlots = resolveCompatibleSlots(definition);
    if (!compatibleSlots.includes(targetSlot)) {
      return {
        success: false,
        message: `${definition.name} cannot be equipped in slot "${targetSlot}". Compatible slots: ${compatibleSlots.join(', ')}.`,
      };
    }

    // 4. Check level requirement
    const levelReq = definition.levelReq || definition.levelRequirement || 0;
    const userLevel = this._userLevel || 0;
    if (userLevel < levelReq) {
      return {
        success: false,
        message: `Requires level ${levelReq}. Current level: ${userLevel}.`,
      };
    }

    // 5. If slot is occupied, auto-unequip current item first
    const equipped = this.storage.getEquipped();
    let unequippedInstanceId;
    if (equipped[targetSlot]) {
      unequippedInstanceId = equipped[targetSlot];
      this.storage.clearEquipped(targetSlot);
      this.debugLog?.(`[EquipmentManager] Auto-unequipped ${unequippedInstanceId} from ${targetSlot}`);
    }

    // 6. Set item as equipped in the target slot
    this.storage.setEquipped(targetSlot, instanceId);

    // 7. Recalculate stat bonuses
    this.calculateTotalBonuses();

    // 8. Emit changed event
    SLEvents.emit('EquipmentManager:changed', {
      action: 'equip',
      instanceId,
      slot: targetSlot,
      unequippedInstanceId: unequippedInstanceId || null,
      bonuses: this._cachedBonuses,
    });

    this.debugLog?.(`[EquipmentManager] Equipped ${definition.name} (${instanceId}) into slot "${targetSlot}"`);

    return {
      success: true,
      message: `${definition.name} equipped.`,
      ...(unequippedInstanceId ? { unequippedInstanceId } : {}),
    };
  },

  /**
   * Unequip the item in the given slot, returning it to inventory.
   *
   * @param {string} slot — slot name to clear (e.g. 'weapon', 'ring2')
   * @returns {{ success: boolean, message: string }}
   */
  unequipItem(slot) {
    // 1. Check that the slot has something equipped
    const equipped = this.storage.getEquipped();
    const instanceId = equipped[slot];
    if (!instanceId) {
      return { success: false, message: `Slot "${slot}" is already empty.` };
    }

    // 2. Clear the equipped slot (item remains in inventory)
    this.storage.clearEquipped(slot);

    // 3. Recalculate bonuses
    this.calculateTotalBonuses();

    // 4. Emit changed event
    SLEvents.emit('EquipmentManager:changed', {
      action: 'unequip',
      instanceId,
      slot,
      bonuses: this._cachedBonuses,
    });

    this.debugLog?.(`[EquipmentManager] Unequipped ${instanceId} from slot "${slot}"`);

    return { success: true, message: `Item unequipped from "${slot}".` };
  },

  /**
   * Calculate total stat bonuses from all equipped items and active set bonuses.
   * Caches result in this._cachedBonuses and returns it.
   *
   * @returns {object} — flat stat bonus object matching C.EMPTY_STATS shape
   */
  calculateTotalBonuses(instanceMap) {
    // 1. Start from a clean zero-baseline
    const totals = { ...C.EMPTY_STATS };

    const equipped = this.storage.getEquipped();
    // Accept a pre-built instanceMap from the caller (avoids a redundant
    // getInventory() allocation when called from _renderPopupContent).
    // PERF (2026-07-13): equipped is <=10 slots, so materializing the WHOLE
    // inventory into an array+Map to serve <=10 lookups was O(inventory) for
    // O(10) of work — and inventory only ever grows. Resolve through storage's
    // own Map instead. A caller-supplied instanceMap is still honoured.
    const lookupInstance = (id) =>
      (instanceMap ? instanceMap.get(id) : this.storage.getInstance(id));

    // 2 & 3. Sum stats from each equipped item
    for (const [slot, instanceId] of Object.entries(equipped)) {
      if (!instanceId) continue;

      const instance = lookupInstance(instanceId);
      if (!instance) {
        this.debugLog?.(`[EquipmentManager] calculateTotalBonuses: instance ${instanceId} (slot ${slot}) not found in inventory`);
        continue;
      }

      const definition = C.getEquipmentById(instance.equipmentId);
      if (!definition) {
        this.debugLog?.(`[EquipmentManager] calculateTotalBonuses: unknown equipmentId ${instance.equipmentId}`);
        continue;
      }

      const stats = definition.stats || {};
      for (const key of Object.keys(totals)) {
        totals[key] += stats[key] || 0;
      }
    }

    // 4. Count equipped pieces per set
    const setPieceCounts = new Map(); // setId → count
    for (const instanceId of Object.values(equipped)) {
      if (!instanceId) continue;
      const instance = lookupInstance(instanceId);
      if (!instance) continue;
      const definition = C.getEquipmentById(instance.equipmentId);
      if (!definition?.setId) continue;

      setPieceCounts.set(definition.setId, (setPieceCounts.get(definition.setId) || 0) + 1);
    }

    // 5. Apply highest applicable set bonus for each set
    for (const [setId, pieceCount] of setPieceCounts.entries()) {
      const setDef = C.EQUIPMENT_SETS?.[setId];
      if (!setDef?.bonuses) continue;

      // bonuses keyed by piece count: { 2: { str: 5, ... }, 3: { str: 10, ... } }
      let bestBonus = null;
      for (const [threshold, stats] of Object.entries(setDef.bonuses)) {
        if (pieceCount >= Number(threshold)) {
          bestBonus = stats;
        }
      }

      if (!bestBonus) continue;
      for (const key of Object.keys(totals)) {
        totals[key] += bestBonus[key] || 0;
      }
    }

    // 6. Cache and return
    this._cachedBonuses = totals;
    return totals;
  },

  /**
   * Get a description of all currently active set bonuses.
   *
   * @returns {Array<{ setId: string, name: string, equipped: number, total: number, activeBonus: object }>}
   */
  getActiveSetBonuses(instanceMap) {
    const equipped = this.storage.getEquipped();
    // Accept a pre-built instanceMap from the caller (avoids a redundant
    // getInventory() allocation when called from _renderPopupContent).
    // PERF (2026-07-13): equipped is <=10 slots, so materializing the WHOLE
    // inventory into an array+Map to serve <=10 lookups was O(inventory) for
    // O(10) of work — and inventory only ever grows. Resolve through storage's
    // own Map instead. A caller-supplied instanceMap is still honoured.
    const lookupInstance = (id) =>
      (instanceMap ? instanceMap.get(id) : this.storage.getInstance(id));

    const setPieceCounts = new Map();
    for (const instanceId of Object.values(equipped)) {
      if (!instanceId) continue;
      const instance = lookupInstance(instanceId);
      if (!instance) continue;
      const definition = C.getEquipmentById(instance.equipmentId);
      if (!definition?.setId) continue;
      setPieceCounts.set(definition.setId, (setPieceCounts.get(definition.setId) || 0) + 1);
    }

    const result = [];
    for (const [setId, pieceCount] of setPieceCounts.entries()) {
      const setDef = C.EQUIPMENT_SETS?.[setId];
      if (!setDef) continue;

      const totalPieces = setDef.pieces?.length || 0;

      let activeBonus = null;
      for (const [threshold, stats] of Object.entries(setDef.bonuses || {})) {
        if (pieceCount >= Number(threshold)) {
          activeBonus = stats;
        }
      }

      if (!activeBonus) continue;

      result.push({
        setId,
        name: setDef.name || setId,
        equipped: pieceCount,
        total: totalPieces,
        activeBonus,
      });
    }

    return result;
  },

  /**
   * Salvage (permanently destroy) an inventory item.
   *
   * Added 2026-07-13: until now nothing ever called storage.removeFromInventory,
   * so inventory only ever grew. This is the caller — the deliberate way to
   * shed unwanted drops.
   *
   * Refuses to salvage an EQUIPPED item (the popup only offers salvage for
   * unequipped items, but callers are external too — guard at the boundary).
   *
   * @param {string} instanceId
   * @returns {{ success: boolean, message: string, name?: string }}
   */
  salvageItem(instanceId) {
    const instance = this.storage.getInstance(instanceId);
    if (!instance) {
      return { success: false, message: 'Item not found in inventory.' };
    }

    const equipped = this.storage.getEquipped();
    for (const [slot, equippedId] of Object.entries(equipped)) {
      if (equippedId === instanceId) {
        return {
          success: false,
          message: `Unequip it from "${slot}" before salvaging.`,
        };
      }
    }

    const definition = C.getEquipmentById(instance.equipmentId);
    const name = definition?.name || instance.equipmentId;

    this.storage.removeFromInventory(instanceId);

    SLEvents.emit('EquipmentManager:salvaged', {
      instanceId,
      equipmentId: instance.equipmentId,
      name,
      rarity: definition?.rarity || null,
    });

    this.debugLog?.(`[EquipmentManager] Salvaged ${name} (${instanceId})`);

    return { success: true, message: `${name} salvaged.`, name };
  },

  /**
   * Salvage every DUPLICATE unequipped item, keeping one copy of each
   * equipmentId. This is the bulk answer to inventory growth — boss drops
   * repeat, and hand-salvaging hundreds of copies is not a workflow.
   *
   * Equipped items are never touched, and the copy kept for each equipmentId
   * is preferred in this order: the equipped one (so it's never counted as a
   * duplicate), else the oldest instance (stable, so repeated runs are no-ops).
   *
   * @returns {{ success: boolean, salvaged: number, message: string }}
   */
  salvageDuplicates() {
    const equippedIds = new Set(Object.values(this.storage.getEquipped()).filter(Boolean));
    const inventory = this.storage.getInventory();

    // equipmentId → instances (unequipped only), oldest first.
    const byEquipmentId = new Map();
    for (const inst of inventory) {
      if (equippedIds.has(inst.instanceId)) continue; // never salvage equipped
      const list = byEquipmentId.get(inst.equipmentId) || [];
      list.push(inst);
      byEquipmentId.set(inst.equipmentId, list);
    }

    const toSalvage = [];
    for (const [equipmentId, list] of byEquipmentId) {
      // If a copy of this equipmentId is already equipped, EVERY unequipped
      // copy is a duplicate. Otherwise keep the oldest unequipped copy.
      const hasEquippedCopy = inventory.some(
        (i) => i.equipmentId === equipmentId && equippedIds.has(i.instanceId)
      );
      list.sort((a, b) => (a.acquiredAt || 0) - (b.acquiredAt || 0));
      const keepCount = hasEquippedCopy ? 0 : 1;
      for (let i = keepCount; i < list.length; i++) toSalvage.push(list[i]);
    }

    for (const inst of toSalvage) {
      this.storage.removeFromInventory(inst.instanceId);
    }

    if (toSalvage.length > 0) {
      SLEvents.emit('EquipmentManager:salvaged', {
        bulk: true,
        count: toSalvage.length,
      });
      this.debugLog?.(`[EquipmentManager] Salvaged ${toSalvage.length} duplicate(s)`);
    }

    return {
      success: true,
      salvaged: toSalvage.length,
      message: toSalvage.length
        ? `Salvaged ${toSalvage.length} duplicate${toSalvage.length === 1 ? '' : 's'}.`
        : 'No duplicates to salvage.',
    };
  },

  /**
   * Check if an item can currently be equipped by the user.
   *
   * @param {string} equipmentId
   * @returns {{ canEquip: boolean, reason?: string }}
   */
  canEquip(equipmentId) {
    const definition = C.getEquipmentById(equipmentId);
    if (!definition) {
      return { canEquip: false, reason: `Unknown equipment ID: ${equipmentId}` };
    }

    const levelReq = definition.levelReq || definition.levelRequirement || 0;
    const userLevel = this._userLevel || 0;
    if (userLevel < levelReq) {
      return {
        canEquip: false,
        reason: `Requires level ${levelReq} (current: ${userLevel}).`,
      };
    }

    return { canEquip: true };
  },
};
