/**
 * Shared NavigationUtils acquisition.
 * Replaces the duplicated Webpack.getByKeys("transitionTo", "back", "forward")
 * pattern found in ShadowExchange, ShadowSenses, ShadowStep.
 *
 * Usage:
 *   import { getNavigationUtils } from "../shared/navigation";
 *   const nav = getNavigationUtils();
 *   if (nav?.transitionTo) nav.transitionTo("/channels/@me");
 */

const { Webpack } = BdApi;

let _cached = null;

/**
 * Get Discord's NavigationUtils module (cached after first successful lookup).
 * @returns {object|null}
 */
function getNavigationUtils() {
  if (_cached) return _cached;
  _cached =
    Webpack.getByKeys("transitionTo", "back", "forward") ||
    Webpack.getModule((m) => m.transitionTo && m.back && m.forward) ||
    null;
  return _cached;
}

module.exports = { getNavigationUtils };
