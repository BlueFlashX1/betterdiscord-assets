/**
 * Migration — pull existing item data from legacy plugin storage into ItemVault.
 *
 * Runs once on first load. After migration, sets a flag so it doesn't repeat.
 * Source plugins keep their data (ItemVault becomes the new authority going forward).
 */

const MIGRATION_KEY = 'ItemVault_migrated_v1';

async function runMigration(storage, debugLog) {
  // Check if already migrated
  const migrated = BdApi.Data.load('ItemVault', MIGRATION_KEY);
  if (migrated) return false;

  debugLog('Running first-time migration from legacy plugin storage...');
  let count = 0;

  // 1. Shadow Essence — from ShadowArmy settings
  try {
    const saData = BdApi.Data.load('ShadowArmy', 'settings');
    const essence = saData?.shadowEssence?.essence;
    if (typeof essence === 'number' && essence > 0) {
      storage.set('shadow_essence', Math.floor(essence));
      debugLog(`Migrated shadow_essence: ${Math.floor(essence)}`);
      count++;
    }
  } catch (err) {
    debugLog(`Migration warning (shadow_essence): ${err.message}`);
  }

  // 2. Demon Souls — from Dungeons demon castle state (IndexedDB)
  // Demon Castle state is stored in Dungeons' own IDB, not easily accessible here.
  // We'll rely on Dungeons emitting ItemVault:add events on its next load instead.
  // This is a no-op migration — DC souls will sync on first Dungeons start.
  debugLog('Demon souls: will sync from Dungeons on next load (IDB-backed, no direct migration)');

  // 3. Entry Permits — same as demon souls, Dungeons-owned IDB
  debugLog('Entry permits: will sync from Dungeons on next load');

  // Mark migration as done
  BdApi.Data.save('ItemVault', MIGRATION_KEY, {
    completedAt: Date.now(),
    itemsMigrated: count,
  });

  debugLog(`Migration complete: ${count} items transferred`);
  return true;
}

module.exports = { runMigration };
