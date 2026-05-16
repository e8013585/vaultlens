/**
 * VaultLens — lib/fadeDetector.js
 *
 * Fade percentage detection for CS2 Fade-skinned weapons.
 *
 * Uses the paint seed (paintseed from CSGOFloat API) and
 * pre-computed seed→fade% tables from data/fadeWeapons.js
 * to calculate the fade percentage for any supported weapon.
 *
 * ACCURACY NOTE:
 * These values are derived from community research and interpolation.
 * Exact Valve algorithm is not publicly documented. Values should be
 * accurate to within ±0.5% for most weapons based on community measurements.
 * Full-fade (100%) identification is reliable; mid-range values (50–85%)
 * are approximate and should be disclosed as such in UI.
 */

import {
  isFadeWeapon,
  extractWeaponName,
  getFadeMapForWeapon,
  interpolateFade,
} from '../data/fadeWeapons.js';

// ─────────────────────────────────────────────
// Fade % Calculation
// ─────────────────────────────────────────────

/**
 * Calculate the fade percentage for a given item.
 *
 * @param {string} marketHashName - e.g. "Karambit | Fade (Factory New)"
 * @param {number} paintseed      - From CSGOFloat API (0–999)
 * @returns {{ fadePercent: number, isGold: boolean, label: string } | null}
 *           Returns null if item is not a Fade weapon.
 */
export function calculateFade(marketHashName, paintseed) {
  if (!isFadeWeapon(marketHashName)) return null;
  if (paintseed === null || paintseed === undefined) return null;

  const weaponName = extractWeaponName(marketHashName);
  const fadeMap    = getFadeMapForWeapon(weaponName);

  // Interpolate fade % from the seed→fade map
  const fadePercent = interpolateFade(fadeMap, paintseed);

  // Round to 1 decimal place
  const rounded = Math.round(fadePercent * 10) / 10;

  // Gold highlight threshold: ≥ 98% fade
  const isGold = rounded >= 98.0;

  // Build display label
  let label = `${rounded.toFixed(1)}% Fade`;
  if (rounded >= 100.0) label = '100% Full Fade ✦';

  return {
    fadePercent: rounded,
    isGold,
    label,
    weaponName,
    paintseed,
  };
}

// ─────────────────────────────────────────────
// Fade tier categorization
// ─────────────────────────────────────────────

/**
 * Categorize fade % into a named tier.
 * @param {number} fadePercent
 * @returns {{ tier: string, color: string }}
 */
export function getFadeTier(fadePercent) {
  if (fadePercent >= 100)  return { tier: 'Full Fade',     color: '#ffd700' }; // gold
  if (fadePercent >= 98)   return { tier: 'Near-Full',     color: '#ffc200' }; // gold-orange
  if (fadePercent >= 95)   return { tier: 'High Fade',     color: '#f97316' }; // orange
  if (fadePercent >= 90)   return { tier: 'Good Fade',     color: '#fb923c' }; // light orange
  if (fadePercent >= 80)   return { tier: 'Mid Fade',      color: '#fbbf24' }; // yellow
  if (fadePercent >= 70)   return { tier: 'Low Fade',      color: '#a3a3a3' }; // gray
  return                          { tier: 'Minimal Fade',  color: '#737373' }; // dark gray
}

/**
 * Compute a full fade analysis object for display.
 * @param {string} marketHashName
 * @param {number} paintseed
 * @returns {Object|null}
 */
export function analyzeFade(marketHashName, paintseed) {
  const result = calculateFade(marketHashName, paintseed);
  if (!result) return null;

  const tier = getFadeTier(result.fadePercent);

  return {
    ...result,
    tierName:  tier.tier,
    tierColor: tier.color,
    displayLabel: result.isGold
      ? `✦ ${result.label}`
      : result.label,
  };
}

// ─────────────────────────────────────────────
// Fade rank within a known seed population
// ─────────────────────────────────────────────

/**
 * Returns the approximate rank of this seed among all ~1000 possible seeds
 * for the same weapon (lower rank = higher fade).
 * This is a rough approximation: we compute fade for all seeds 0–999 and rank.
 *
 * PERFORMANCE NOTE: This is O(n) over 1000 seeds — only call when needed
 * (e.g., when user hovers or opens an item detail panel).
 *
 * @param {string} marketHashName
 * @param {number} paintseed
 * @returns {{ rank: number, total: number } | null}
 */
export function getFadeRank(marketHashName, paintseed) {
  if (!isFadeWeapon(marketHashName)) return null;

  const weaponName = extractWeaponName(marketHashName);
  const fadeMap    = getFadeMapForWeapon(weaponName);

  // Get the target fade %
  const targetFade = interpolateFade(fadeMap, paintseed);

  // Count how many seeds have a HIGHER fade % (= better rank)
  let higherCount = 0;
  for (let s = 0; s < 1000; s++) {
    if (s === paintseed) continue;
    const f = interpolateFade(fadeMap, s);
    if (f > targetFade) higherCount++;
  }

  return {
    rank:  higherCount + 1, // 1-based rank
    total: 1000,
  };
}

// ─────────────────────────────────────────────
// Batch fade analysis (for inventory processing)
// ─────────────────────────────────────────────

/**
 * Analyze fade for multiple items at once.
 * @param {Array<{ marketHashName: string, paintseed: number, assetid: string }>} items
 * @returns {Object} { [assetid]: fadeAnalysis | null }
 */
export function batchAnalyzeFade(items) {
  const results = {};
  for (const item of items) {
    results[item.assetid] = analyzeFade(item.marketHashName, item.paintseed);
  }
  return results;
}

// ─────────────────────────────────────────────
// Fade display helpers
// ─────────────────────────────────────────────

/**
 * Generate the CSS style string for a fade badge.
 * Gold border/glow for ≥98% fade items.
 * @param {Object} fadeAnalysis - Result of analyzeFade()
 * @returns {string} CSS style string
 */
export function getFadeBadgeStyle(fadeAnalysis) {
  if (!fadeAnalysis) return '';

  const { isGold, tierColor } = fadeAnalysis;

  if (isGold) {
    return `background: linear-gradient(135deg, #ffd700, #ff8c00); color: #1a1a1a; border: 1px solid #ffd700; box-shadow: 0 0 8px rgba(255,215,0,0.6);`;
  }

  return `background: ${tierColor}22; color: ${tierColor}; border: 1px solid ${tierColor}88;`;
}

/**
 * Get a short badge label for overlay display.
 * @param {Object} fadeAnalysis
 * @returns {string} e.g. "98.3% ✦" or "87.2%"
 */
export function getFadeShortLabel(fadeAnalysis) {
  if (!fadeAnalysis) return '';
  const pct = fadeAnalysis.fadePercent.toFixed(1);
  return fadeAnalysis.isGold ? `${pct}% ✦` : `${pct}%`;
}