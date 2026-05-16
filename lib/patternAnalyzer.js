/**
 * VaultLens — lib/patternAnalyzer.js
 *
 * Central pattern analysis module.
 * Coordinates all pattern detection systems:
 *   - Blue Gem tiers (AK-47, Five-SeveN, Karambit Case Hardened)
 *   - Marble Fade patterns (Max Pink, Max Blue, Fire & Ice)
 *   - Crimson Web patterns (Double Web, Center Web)
 *   - Doppler phases (delegated to phaseDetector.js)
 *   - Fade percentages (delegated to fadeDetector.js)
 *
 * Returns a unified PatternResult object consumed by the overlay renderer.
 */

import {
  getBlueGemTier,
  isBlueGemWeapon,
  isFiveSevenScar,
} from '../data/blueGemTiers.js';

import {
  getMarbleFadePattern,
  isMarbleFadeKnife,
  detectCrimsonWebPattern,
  isCrimsonWebKnife,
} from '../data/patternTiers.js';

import {
  getDopplerPhase,
  isDopplerKnife,
} from './phaseDetector.js';

import {
  analyzeFade,
  isFadeWeapon,
} from './fadeDetector.js';

import {
  isFadeWeapon as isFadeWeaponCheck,
} from '../data/fadeWeapons.js';

// ─────────────────────────────────────────────
// Pattern Result Schema
// ─────────────────────────────────────────────

/**
 * @typedef {Object} PatternResult
 * @property {boolean}       hasPattern        - True if any notable pattern was detected
 * @property {Object|null}   blueGem           - Blue gem tier data
 * @property {Object|null}   marbleFade        - Marble fade pattern data
 * @property {Object|null}   crimsonWeb        - Crimson web pattern data
 * @property {Object|null}   doppler           - Doppler phase data
 * @property {Object|null}   fade              - Fade analysis data
 * @property {Array}         badges            - Array of badge objects for UI rendering
 * @property {string}        primaryBadge      - The most notable badge label
 * @property {string}        primaryColor      - The most notable badge color
 */

// ─────────────────────────────────────────────
// Main Analysis Entry Point
// ─────────────────────────────────────────────

/**
 * Analyze all pattern data for an item.
 *
 * @param {Object} params
 * @param {string} params.marketHashName  - Full market hash name
 * @param {number} params.paintseed       - From CSGOFloat API
 * @param {number} params.paintindex      - From CSGOFloat API
 * @param {number} params.defindex        - From CSGOFloat API
 * @param {number} params.floatvalue      - From CSGOFloat API
 * @returns {PatternResult}
 */
export function analyzePattern({
  marketHashName,
  paintseed,
  paintindex,
  defindex,
  floatvalue,
}) {
  const result = {
    hasPattern:   false,
    blueGem:      null,
    marbleFade:   null,
    crimsonWeb:   null,
    doppler:      null,
    fade:         null,
    badges:       [],
    primaryBadge: '',
    primaryColor: '',
  };

  if (!marketHashName) return result;

  // ── 1. Blue Gem Detection ──────────────────────────────────────────────
  if (isBlueGemWeapon(marketHashName)) {
    const weaponName = extractWeaponName(marketHashName);
    const tierData   = getBlueGemTier(weaponName, paintseed);

    if (tierData) {
      result.blueGem = {
        ...tierData,
        paintseed,
        weaponName,
        isScar: isFiveSevenScar(paintseed),
      };
      result.hasPattern = true;

      const color = getBlueGemTierColor(tierData.tier);
      result.badges.push({
        type:  'blueGem',
        label: result.blueGem.isScar ? '⭐ Scar Pattern' : tierData.label,
        color,
        priority: result.blueGem.isScar ? 100 : (10 - tierData.tier) * 10,
      });
    }
  }

  // ── 2. Doppler Phase Detection ─────────────────────────────────────────
  if (isDopplerKnife(marketHashName)) {
    const phaseData = getDopplerPhase(paintindex, marketHashName);
    if (phaseData) {
      result.doppler = phaseData;
      result.hasPattern = true;

      result.badges.push({
        type:     'doppler',
        label:    phaseData.phase,
        color:    phaseData.color,
        priority: getDopplerBadgePriority(phaseData),
      });
    }
  }

  // ── 3. Marble Fade Pattern Detection ──────────────────────────────────
  if (isMarbleFadeKnife(marketHashName)) {
    const weaponName   = extractWeaponName(marketHashName);
    const fadePattern  = getMarbleFadePattern(weaponName, paintseed);

    if (fadePattern) {
      result.marbleFade = {
        ...fadePattern,
        paintseed,
        weaponName,
      };
      result.hasPattern = true;

      const color = getMarbleFadeColor(fadePattern.type);
      result.badges.push({
        type:     'marbleFade',
        label:    `${fadePattern.label} (#${fadePattern.rank})`,
        color,
        priority: getMarbleFadePriority(fadePattern),
      });
    }
  }

  // ── 4. Crimson Web Pattern Detection ──────────────────────────────────
  if (isCrimsonWebKnife(marketHashName)) {
    const weaponName   = extractWeaponName(marketHashName);
    const webPattern   = detectCrimsonWebPattern(weaponName, paintseed);

    if (webPattern.type) {
      result.crimsonWeb = {
        ...webPattern,
        paintseed,
        weaponName,
      };
      result.hasPattern = true;

      const color = webPattern.type === 'Double Web' ? '#dc2626' : '#f97316';
      result.badges.push({
        type:     'crimsonWeb',
        label:    webPattern.type,
        color,
        priority: webPattern.type === 'Double Web' ? 80 : 40,
      });
    }
  }

  // ── 5. Fade Percentage ─────────────────────────────────────────────────
  // Only analyze fade if the item is a Fade skin AND not also a Doppler
  // (some knives can theoretically match both checks — Fade takes precedence
  //  for non-Doppler knives)
  if (isFadeWeaponCheck(marketHashName)) {
    const fadeAnalysis = analyzeFade(marketHashName, paintseed);
    if (fadeAnalysis) {
      result.fade = fadeAnalysis;
      result.hasPattern = true;

      result.badges.push({
        type:     'fade',
        label:    fadeAnalysis.displayLabel,
        color:    fadeAnalysis.isGold ? '#ffd700' : fadeAnalysis.tierColor,
        priority: fadeAnalysis.isGold ? 90 : Math.floor(fadeAnalysis.fadePercent),
      });
    }
  }

  // ── 6. Determine Primary Badge (highest priority) ──────────────────────
  if (result.badges.length > 0) {
    result.badges.sort((a, b) => b.priority - a.priority);
    const primary      = result.badges[0];
    result.primaryBadge = primary.label;
    result.primaryColor = primary.color;
  }

  return result;
}

// ─────────────────────────────────────────────
// Helper: Extract weapon name from market hash name
// ─────────────────────────────────────────────

/**
 * Extract weapon prefix from a CS2 market hash name.
 * e.g. "AK-47 | Redline (Field-Tested)" → "AK-47"
 * e.g. "★ Karambit | Fade (Factory New)" → "Karambit"
 */
export function extractWeaponName(marketHashName) {
  if (!marketHashName) return '';
  // Remove the ★ prefix for knives
  const cleaned = marketHashName.replace(/^★\s*/, '').trim();
  // Split on " | " and take first part
  return cleaned.split(' | ')[0].trim();
}

/**
 * Extract the skin name from a market hash name.
 * e.g. "AK-47 | Redline (Field-Tested)" → "Redline"
 */
export function extractSkinName(marketHashName) {
  if (!marketHashName) return '';
  const parts = marketHashName.split(' | ');
  if (parts.length < 2) return '';
  // Remove the exterior in parentheses
  return parts[1].replace(/\s*\(.*?\)\s*$/, '').trim();
}

/**
 * Extract exterior string from market hash name.
 * e.g. "AK-47 | Redline (Field-Tested)" → "Field-Tested"
 */
export function extractExterior(marketHashName) {
  if (!marketHashName) return '';
  const match = marketHashName.match(/\(([^)]+)\)$/);
  return match ? match[1] : '';
}

// ─────────────────────────────────────────────
// Color helpers
// ─────────────────────────────────────────────

/**
 * Get display color for blue gem tier.
 * Tier 1 = bright blue, Tier 2 = medium blue, Tier 3 = light blue
 */
function getBlueGemTierColor(tier) {
  switch (tier) {
    case 1:  return '#1d4ed8'; // deep blue
    case 2:  return '#3b82f6'; // medium blue
    case 3:  return '#93c5fd'; // light blue
    default: return '#bfdbfe'; // pale blue
  }
}

/**
 * Get display color for marble fade pattern type.
 */
function getMarbleFadeColor(type) {
  switch (type) {
    case 'fireAndIce': return '#60a5fa'; // ice blue (gradient would be ideal)
    case 'maxPink':    return '#f472b6'; // pink
    case 'maxBlue':    return '#3b82f6'; // blue
    default:           return '#a78bfa'; // purple fallback
  }
}

/**
 * Get badge priority for a Doppler phase.
 * Special phases (Ruby/Sapphire/Black Pearl/Emerald) get highest priority.
 */
function getDopplerBadgePriority(phaseData) {
  if (phaseData.rarity === 'special') return 85;
  if (phaseData.rarity === 'rare')    return 50;
  if (phaseData.rarity === 'uncommon')return 30;
  return 20;
}

/**
 * Get badge priority for marble fade pattern.
 * Fire & Ice > Max Pink = Max Blue, lower rank number = higher priority.
 */
function getMarbleFadePriority(fadePattern) {
  const base = fadePattern.type === 'fireAndIce' ? 70
             : fadePattern.type === 'maxBlue'    ? 60
             : fadePattern.type === 'maxPink'    ? 55
             : 40;
  // Subtract rank (rank 1 = highest priority within type)
  return base - (fadePattern.rank || 0);
}

// ─────────────────────────────────────────────
// Sticker Analysis
// ─────────────────────────────────────────────

/**
 * @typedef {Object} StickerInfo
 * @property {string} name          - Sticker market name
 * @property {string} codename      - Internal codename (for image URL)
 * @property {number} slot          - Slot index (0–3 for most weapons, 0–5 for some)
 * @property {number|null} price    - Price from active pricing engine
 * @property {string} imageUrl      - Steam CDN sticker image URL
 */

/**
 * Parse sticker data from CSGOFloat API iteminfo.
 * @param {Array} stickers - stickers array from CSGOFloat iteminfo
 * @param {Object} priceMap - Current price map from pricing engine
 * @param {string} pricingMode - 'pricempire' | 'skinport'
 * @returns {Array<StickerInfo>}
 */
export function parseStickerData(stickers, priceMap, pricingMode) {
  if (!stickers || !Array.isArray(stickers)) return [];

  return stickers.map(sticker => {
    // Build the market hash name for this sticker
    // CSGOFloat returns: { stickerId, slot, wear, scale, rotation, tintId, name, codename, material, imageurl }
    const marketName = sticker.name
      ? `Sticker | ${sticker.name}`
      : null;

    let price = null;
    if (marketName && priceMap && priceMap[marketName]) {
      const entry = priceMap[marketName];
      if (pricingMode === 'skinport') {
        price = entry.minPrice;
      } else {
        price = entry.buff163 || entry.skinport || entry.csFloat;
      }
    }

    return {
      name:     sticker.name      || 'Unknown Sticker',
      codename: sticker.codename  || '',
      slot:     sticker.slot      ?? -1,
      wear:     sticker.wear      ?? 0,       // scrape/wear amount (0 = pristine)
      price,
      marketName,
      imageUrl: sticker.imageurl || buildStickerImageUrl(sticker.codename),
    };
  });
}

/**
 * Calculate total sticker value from a parsed sticker array.
 * @param {Array<StickerInfo>} stickers
 * @returns {number}
 */
export function calcTotalStickerValue(stickers) {
  if (!stickers || stickers.length === 0) return 0;
  return stickers.reduce((sum, s) => sum + (s.price || 0), 0);
}

/**
 * Build a Steam CDN sticker image URL from a codename.
 * Falls back to empty string if codename is unavailable.
 * @param {string} codename
 * @returns {string}
 */
function buildStickerImageUrl(codename) {
  if (!codename) return '';
  // Steam CDN URL format for stickers
  return `https://steamcommunity-a.akamaihd.net/economy/image/sticker/${codename}`;
}

// ─────────────────────────────────────────────
// Trade Lock Detection
// ─────────────────────────────────────────────

/**
 * Parse trade restriction data from a Steam inventory item.
 *
 * Steam items include a "tradable" flag and optionally a
 * "owner_descriptions" array with trade lock info, or a
 * "cache_expiration" timestamp.
 *
 * @param {Object} item - Steam inventory item
 * @returns {{ locked: boolean, daysRemaining: number|null, unlockDate: Date|null }}
 */
export function parseTradeLock(item) {
  // If explicitly tradable
  if (item.tradable === 1 || item.tradable === true) {
    return { locked: false, daysRemaining: null, unlockDate: null };
  }

  // Check for trade ban timestamp in descriptions
  const allDescriptions = [
    ...(item.descriptions       || []),
    ...(item.owner_descriptions || []),
  ];

  for (const desc of allDescriptions) {
    const value = desc.value || '';

    // Steam trade lock descriptions contain timestamps or "X days" text
    // Format 1: "Tradable After: <date string>"
    const tradableAfterMatch = value.match(/Tradable After:\s*(.+)/i);
    if (tradableAfterMatch) {
      const unlockDate = new Date(tradableAfterMatch[1].trim());
      if (!isNaN(unlockDate.getTime())) {
        const now  = Date.now();
        const diff = unlockDate.getTime() - now;
        const daysRemaining = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
        return { locked: daysRemaining > 0, daysRemaining, unlockDate };
      }
    }

    // Format 2: "Not Tradable" or contains days remaining
    if (value.toLowerCase().includes('not tradable')) {
      return { locked: true, daysRemaining: null, unlockDate: null };
    }

    // Format 3: "(X) day(s) remaining"
    const daysMatch = value.match(/(\d+)\s+day/i);
    if (daysMatch) {
      const daysRemaining = parseInt(daysMatch[1], 10);
      const unlockDate    = new Date(Date.now() + daysRemaining * 86400000);
      return { locked: true, daysRemaining, unlockDate };
    }
  }

  // If item.tradable is 0 (false) but no specific date found
  if (item.tradable === 0 || item.tradable === false) {
    return { locked: true, daysRemaining: null, unlockDate: null };
  }

  return { locked: false, daysRemaining: null, unlockDate: null };
}

/**
 * Format a trade lock for display.
 * @param {{ locked, daysRemaining, unlockDate }} tradeLock
 * @returns {string|null} e.g. "🔒 5 days" or null if freely tradable
 */
export function formatTradeLock(tradeLock) {
  if (!tradeLock || !tradeLock.locked) return null;
  if (tradeLock.daysRemaining !== null) {
    if (tradeLock.daysRemaining === 0) return '🔒 Today';
    if (tradeLock.daysRemaining === 1) return '🔒 1 day';
    return `🔒 ${tradeLock.daysRemaining} days`;
  }
  return '🔒 Locked';
}

// ─────────────────────────────────────────────
// Duplicate Detection
// ─────────────────────────────────────────────

/**
 * Build a duplicate count map from an array of inventory items.
 * Groups by market_hash_name.
 *
 * @param {Array} items - Array of Steam inventory item objects
 * @returns {Object} { [marketHashName]: count }
 */
export function buildDuplicateMap(items) {
  const countMap = {};
  for (const item of items) {
    const name = item.market_hash_name || item.name || '';
    countMap[name] = (countMap[name] || 0) + 1;
  }
  return countMap;
}

/**
 * Check if an item has duplicates in the inventory.
 * @param {string} marketHashName
 * @param {Object} duplicateMap - from buildDuplicateMap()
 * @returns {number} count (1 = no duplicates, >1 = has duplicates)
 */
export function getDuplicateCount(marketHashName, duplicateMap) {
  return duplicateMap[marketHashName] || 1;
}