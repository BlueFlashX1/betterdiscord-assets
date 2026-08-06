/**
 * ShadowArmy — Full army database export (NDJSON).
 *
 * Streams every stored shadow to disk as one JSON object per line so the
 * army can be analyzed with external tools (sqlite, python, jq) without
 * ever holding 281k+ records in memory at once. Uses the same paged walker
 * the widget's grade tally uses (forEachShadowBatchPaged — keyset
 * pagination, never a full cursor walk) and appends to disk per batch, so
 * peak memory stays one batch regardless of army size.
 *
 * Output: <App Support>/discord/SoloLevelingBackups/army-database.ndjson
 * (same directory convention as writeFileBackup — outside the BD folder so
 * it survives BD reinstalls, and readable by external tooling).
 *
 * Mixin: Object.assign(ShadowArmy.prototype, require('./army-export'))
 */

module.exports = {
  _getArmyExportPath() {
    try {
      const pathModule = require('path');
      const appSupport = pathModule.resolve(BdApi.Plugins.folder, '..', '..');
      const exportDir = pathModule.join(appSupport, 'discord', 'SoloLevelingBackups');
      require('fs').mkdirSync(exportDir, { recursive: true });
      return pathModule.join(exportDir, 'army-database.ndjson');
    } catch {
      return null;
    }
  },

  /**
   * Flatten one stored record into an analysis-friendly row.
   * Decompresses first (stored records use short field names), then reads
   * every progression axis separately so per-rank stat curves can be
   * checked against base vs growth vs effective independently.
   */
  _buildArmyExportRow(record) {
    const s = this.getShadowData ? (this.getShadowData(record) || record) : record;
    const base = s.baseStats || {};
    const growth = s.growthStats || {};
    const natural = s.naturalGrowthStats || {};
    let effective = null;
    try {
      effective = this.getShadowEffectiveStats ? this.getShadowEffectiveStats(s) : null;
    } catch (_) {
      effective = null; // effective stats are best-effort; base/growth still export
    }
    let personality = null;
    try {
      personality = this.getShadowPersonalityKey ? this.getShadowPersonalityKey(s) : null;
    } catch (_) {}

    return {
      id: s.id ?? s.i ?? null,
      rank: s.rank ?? s.r ?? null,
      level: s.level ?? s.l ?? null,
      role: s.role ?? s.ro ?? null,
      roleName: s.roleName ?? null,
      beastType: s.beastType ?? null,
      beastFamily: s.beastFamily ?? null,
      grade: s.grade ?? s.gr ?? 'Common',
      personality,
      strength: Number(s.strength) || 0,
      base_str: Number(base.strength) || 0,
      base_agi: Number(base.agility) || 0,
      base_int: Number(base.intelligence) || 0,
      base_vit: Number(base.vitality) || 0,
      base_per: Number(base.perception) || 0,
      grow_str: Number(growth.strength) || 0,
      grow_agi: Number(growth.agility) || 0,
      grow_int: Number(growth.intelligence) || 0,
      grow_vit: Number(growth.vitality) || 0,
      grow_per: Number(growth.perception) || 0,
      nat_str: Number(natural.strength) || 0,
      nat_agi: Number(natural.agility) || 0,
      nat_int: Number(natural.intelligence) || 0,
      nat_vit: Number(natural.vitality) || 0,
      nat_per: Number(natural.perception) || 0,
      eff_str: effective ? Number(effective.strength) || 0 : null,
      eff_agi: effective ? Number(effective.agility) || 0 : null,
      eff_int: effective ? Number(effective.intelligence) || 0 : null,
      eff_vit: effective ? Number(effective.vitality) || 0 : null,
      eff_per: effective ? Number(effective.perception) || 0 : null,
      totalCombatTime: Number(s.totalCombatTime) || 0,
      extractedAt: s.extractedAt ?? null,
      healV: s._healV ?? null,
    };
  },

  /**
   * Stream the whole army to NDJSON. Safe to call from the settings panel;
   * re-entry guarded, progress toasts every 50k records.
   * @returns {Promise<{count: number, path: string}|null>}
   */
  async exportArmyDatabase() {
    if (this._armyExportInProgress) {
      this._toast?.('Army export already running…', 'info');
      return null;
    }
    if (!this.storageManager || typeof this.storageManager.forEachShadowBatchPaged !== 'function') {
      this._toast?.('Army export unavailable: storage not ready.', 'error');
      return null;
    }
    const filePath = this._getArmyExportPath();
    if (!filePath) {
      this._toast?.('Army export unavailable: cannot resolve export path.', 'error');
      return null;
    }

    this._armyExportInProgress = true;
    const startedAt = Date.now();
    const fs = require('fs');
    let count = 0;
    let nextProgressToast = 50000;

    try {
      // Header line — lets analysis tools confirm which snapshot they read.
      fs.writeFileSync(
        filePath,
        JSON.stringify({ _meta: 'shadow-army-export', startedAt, version: 1 }) + '\n',
        'utf8'
      );

      await this.storageManager.forEachShadowBatchPaged((batch) => {
        // The walker IGNORES onBatch's return value — the only way to abort
        // the walk is to throw (the walker's try/catch rejects the promise).
        if (this._isStopped) throw new Error('EXPORT_ABORTED');
        // NOTE: onBatch runs synchronously inside the live IDB transaction.
        // The per-batch appendFileSync (~100-200KB) is deliberate: it keeps
        // peak memory at one batch, and the sync write happens in the same
        // event tick so the getAll keyset chain is never broken.
        const lines = [];
        for (const record of batch) {
          try {
            lines.push(JSON.stringify(this._buildArmyExportRow(record)));
          } catch (e) {
            // One malformed record must not kill a 281k-row export — emit a
            // marker row so the anomaly is countable in analysis.
            lines.push(JSON.stringify({ _error: String(e?.message || e), id: record?.id ?? record?.i ?? null }));
          }
        }
        count += batch.length;
        fs.appendFileSync(filePath, lines.join('\n') + '\n', 'utf8');
        if (count >= nextProgressToast) {
          nextProgressToast += 50000;
          this._toast?.(`Army export: ${count.toLocaleString()} shadows written…`, 'info');
        }
      }, { batchSize: 500 });

      const elapsedS = Math.round((Date.now() - startedAt) / 1000);
      // Footer line — count lets readers detect a truncated export.
      fs.appendFileSync(
        filePath,
        JSON.stringify({ _meta: 'end', count, elapsedS }) + '\n',
        'utf8'
      );
      this._toast?.(`Army database exported: ${count.toLocaleString()} shadows in ${elapsedS}s`, 'success', 6000);
      this.debugLog?.('EXPORT', 'Army database export complete', { count, elapsedS, filePath });
      return { count, path: filePath };
    } catch (e) {
      if (String(e?.message) === 'EXPORT_ABORTED') {
        this.debugLog?.('EXPORT', `Army export aborted by plugin stop after ${count.toLocaleString()} rows`);
        return null;
      }
      this.debugError?.('EXPORT', 'Army database export failed', e);
      this._toast?.('Army export failed — see console.', 'error');
      return null;
    } finally {
      this._armyExportInProgress = false;
    }
  },
};
