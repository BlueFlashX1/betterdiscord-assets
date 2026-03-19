/**
 * Item Registry — defines all item types in the Solo Leveling ecosystem.
 *
 * Categories:
 *   currency    — fungible, stackable (essence, souls, permits)
 *   material    — crafting/upgrade materials (future)
 *   consumable  — single-use items with effects (future)
 *   equipment   — weapons/armor/accessories (future)
 *   quest       — quest-specific items (future)
 *   key         — dungeon keys, gate keys (future)
 */

const ITEM_CATEGORY = {
  CURRENCY: 'currency',
  MATERIAL: 'material',
  CONSUMABLE: 'consumable',
  EQUIPMENT: 'equipment',
  QUEST: 'quest',
  KEY: 'key',
};

/**
 * Each item definition:
 *   id         — unique string key (used in storage)
 *   name       — display name
 *   category   — one of ITEM_CATEGORY
 *   stackable  — whether amounts accumulate (true for currency/material)
 *   maxStack   — max per stack (0 = unlimited)
 *   icon       — emoji or icon reference for UI
 *   rarity     — E/D/C/B/A/S/SS/SSS/Monarch (for display/sorting)
 *   description — short lore/usage text
 *   source     — which plugin(s) produce this item
 */
const ITEMS = {
  shadow_essence: {
    id: 'shadow_essence',
    name: 'Shadow Essence',
    category: ITEM_CATEGORY.CURRENCY,
    stackable: true,
    maxStack: 0,
    icon: '🩸',
    rarity: 'B',
    description: "Crystallized mana extracted from fallen enemies. Used to promote shadow soldiers through the ranks.",
    source: ['Dungeons', 'ShadowArmy'],
  },

  demon_soul: {
    id: 'demon_soul',
    name: 'Demon Soul',
    category: ITEM_CATEGORY.CURRENCY,
    stackable: true,
    maxStack: 0,
    icon: '👿',
    rarity: 'A',
    description: 'Soul fragment torn from a slain demon in the Demon Castle. The System tracks these as proof of conquest.',
    source: ['Dungeons'],
  },

  entry_permit: {
    id: 'entry_permit',
    name: 'Entry Permit',
    category: ITEM_CATEGORY.KEY,
    stackable: true,
    maxStack: 0,
    icon: '🎫',
    rarity: 'S',
    description: 'A permit that grants passage to the next floor of the Demon Castle. Consumed on floor advancement.',
    source: ['Dungeons'],
  },

  // ──────────────────────────────────────────────────
  // Future items — defined now for schema stability
  // ──────────────────────────────────────────────────

  holy_water_of_life: {
    id: 'holy_water_of_life',
    name: 'Holy Water of Life',
    category: ITEM_CATEGORY.QUEST,
    stackable: false,
    maxStack: 1,
    icon: '💧',
    rarity: 'SSS',
    description: 'Sacred water obtained by clearing all 100 floors of the Demon Castle. Can cure any ailment.',
    source: ['Dungeons'],
  },

  /* Placeholder templates for equipment system:
  knights_daggers: {
    id: 'knights_daggers',
    name: "Knight Killer's Daggers",
    category: ITEM_CATEGORY.EQUIPMENT,
    stackable: false,
    maxStack: 1,
    icon: '🗡️',
    rarity: 'S',
    description: 'Twin daggers forged from Vulcan\'s flames.',
    source: ['Dungeons'],
    slot: 'weapon',
    stats: { strength: 50, agility: 30 },
  },
  */
};

function getItem(id) {
  return ITEMS[id] || null;
}

function getItemsByCategory(category) {
  return Object.values(ITEMS).filter(item => item.category === category);
}

function getAllItems() {
  return Object.values(ITEMS);
}

function isValidItem(id) {
  return id in ITEMS;
}

module.exports = {
  ITEM_CATEGORY,
  ITEMS,
  getItem,
  getItemsByCategory,
  getAllItems,
  isValidItem,
};
