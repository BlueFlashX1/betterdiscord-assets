const C = require('./constants');

const Dungeons = class Dungeons {
  static RANK_MULTIPLIERS = C.RANK_MULTIPLIERS;

  constructor() {
    this._initDefaults();
    this._initTimers();
    this._initCaches();
    this._initState();
    this._initUI();
  }
};

Object.assign(
  Dungeons.prototype,
  require('./init-state'),
  require('./corpse-tick-pipeline'),
  require('./lifecycle'),
  require('./ui-header-widget'),
  require('./ui-delegation'),
  require('./settings-persistence'),
  require('./stats-integration'),
  require('./channel-discovery'),
  require('./message-observer'),
  require('./spawn-core'),
  require('./spawn-wave-builders'),
  require('./player-flow'),
  require('./player-sync-allocation'),
  require('./difficulty-contributions'),
  require('./combat-primitives'),
  require('./combat-role-damage'),
  require('./combat-status-effects'),
  require('./combat-shadow-allocation'),
  require('./combat-shadow-execution'),
  require('./combat-shadow-support'),
  require('./combat-damage-calc'),
  require('./combat-boss-mob'),
  require('./resurrection-completion'),
  require('./arise-extraction'),
  require('./ui-indicators'),
  require('./ui-bossbar'),
  require('./runtime-visibility'),
  require('./notifications-cleanup'),
  require('./restore-gc-toast'),
  require('./css-management')
);

module.exports = Dungeons;
