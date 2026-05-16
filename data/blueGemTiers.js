/**
 * VaultLens — data/blueGemTiers.js
 *
 * Blue Gem tier data for Case Hardened weapons.
 * Source: Community-compiled CS2 pattern databases (csgo-pattern.com, Buff163 listings,
 *         csbluegem.com research). Tier rankings reflect blue % coverage of the most
 *         desirable face (typically the top/A side).
 *
 * NOTE: Tiers are based on publicly known community consensus as of 2024.
 *       Paint seeds are integers 0–999.
 *       "Tier 1" = most blue (best), higher tier = less blue.
 */

// ─────────────────────────────────────────────
// AK-47 | Case Hardened Blue Gem Seeds
// Source: csbluegem.com top seed list (A-side / Top Tier)
// ─────────────────────────────────────────────

export const AK47_BLUE_GEM_TIERS = {
  // Seed: tier label
  // Tier 1 — near-perfect blue (>85% blue A-side)
  179:  { tier: 1, label: 'Tier 1 Blue Gem', note: '~90% blue A-side' },
  503:  { tier: 1, label: 'Tier 1 Blue Gem', note: '~88% blue A-side' },
  664:  { tier: 1, label: 'Tier 1 Blue Gem', note: '~87% blue A-side' },
  670:  { tier: 1, label: 'Tier 1 Blue Gem', note: '~86% blue A-side' },
  555:  { tier: 1, label: 'Tier 1 Blue Gem', note: '~85% blue A-side' },

  // Tier 2 — excellent blue (70–85%)
  321:  { tier: 2, label: 'Tier 2 Blue Gem', note: '~82% blue A-side' },
  561:  { tier: 2, label: 'Tier 2 Blue Gem', note: '~80% blue A-side' },
  228:  { tier: 2, label: 'Tier 2 Blue Gem', note: '~78% blue A-side' },
  760:  { tier: 2, label: 'Tier 2 Blue Gem', note: '~77% blue A-side' },
  380:  { tier: 2, label: 'Tier 2 Blue Gem', note: '~75% blue A-side' },
  956:  { tier: 2, label: 'Tier 2 Blue Gem', note: '~74% blue A-side' },
  387:  { tier: 2, label: 'Tier 2 Blue Gem', note: '~72% blue A-side' },
  269:  { tier: 2, label: 'Tier 2 Blue Gem', note: '~71% blue A-side' },

  // Tier 3 — good blue (55–70%)
  638:  { tier: 3, label: 'Tier 3 Blue Gem', note: '~68% blue A-side' },
  592:  { tier: 3, label: 'Tier 3 Blue Gem', note: '~65% blue A-side' },
  910:  { tier: 3, label: 'Tier 3 Blue Gem', note: '~63% blue A-side' },
  88:   { tier: 3, label: 'Tier 3 Blue Gem', note: '~60% blue A-side' },
  451:  { tier: 3, label: 'Tier 3 Blue Gem', note: '~58% blue A-side' },
  777:  { tier: 3, label: 'Tier 3 Blue Gem', note: '~56% blue A-side' },
};

// ─────────────────────────────────────────────
// Five-SeveN | Case Hardened Blue Gem Seeds
// Source: Community listings; #661 is the legendary "Scar" pattern
// ─────────────────────────────────────────────

export const FIVESEVEN_BLUE_GEM_TIERS = {
  // #661 — The legendary "Scar" Five-SeveN (known 100% blue with scar marking)
  661:  { tier: 1, label: 'Tier 1 Blue Gem ⭐ Scar', note: 'Legendary Scar pattern — near 100% blue with unique scar marking', isScar: true },

  // Tier 1 — near-perfect blue
  277:  { tier: 1, label: 'Tier 1 Blue Gem', note: '~95% blue' },
  923:  { tier: 1, label: 'Tier 1 Blue Gem', note: '~92% blue' },
  363:  { tier: 1, label: 'Tier 1 Blue Gem', note: '~90% blue' },

  // Tier 2 — excellent blue
  592:  { tier: 2, label: 'Tier 2 Blue Gem', note: '~83% blue' },
  171:  { tier: 2, label: 'Tier 2 Blue Gem', note: '~80% blue' },
  614:  { tier: 2, label: 'Tier 2 Blue Gem', note: '~78% blue' },
  940:  { tier: 2, label: 'Tier 2 Blue Gem', note: '~75% blue' },

  // Tier 3 — good blue
  815:  { tier: 3, label: 'Tier 3 Blue Gem', note: '~68% blue' },
  433:  { tier: 3, label: 'Tier 3 Blue Gem', note: '~65% blue' },
  888:  { tier: 3, label: 'Tier 3 Blue Gem', note: '~60% blue' },
};

/** Quick check: is this a Scar pattern Five-SeveN? */
export function isFiveSevenScar(paintseed) {
  return paintseed === 661;
}

// ─────────────────────────────────────────────
// Karambit | Case Hardened Blue Gem Seeds
// Source: csbluegem.com Karambit top list
// Karambit Case Hardened blue gems are evaluated on the exterior (A-side)
// ─────────────────────────────────────────────

export const KARAMBIT_BLUE_GEM_TIERS = {
  // Tier 1 — maximum blue
  387:  { tier: 1, label: 'Tier 1 Blue Gem', note: '~92% blue exterior' },
  442:  { tier: 1, label: 'Tier 1 Blue Gem', note: '~89% blue exterior' },
  809:  { tier: 1, label: 'Tier 1 Blue Gem', note: '~87% blue exterior' },
  670:  { tier: 1, label: 'Tier 1 Blue Gem', note: '~85% blue exterior' },

  // Tier 2 — excellent blue
  228:  { tier: 2, label: 'Tier 2 Blue Gem', note: '~80% blue exterior' },
  321:  { tier: 2, label: 'Tier 2 Blue Gem', note: '~77% blue exterior' },
  955:  { tier: 2, label: 'Tier 2 Blue Gem', note: '~75% blue exterior' },
  760:  { tier: 2, label: 'Tier 2 Blue Gem', note: '~73% blue exterior' },
  503:  { tier: 2, label: 'Tier 2 Blue Gem', note: '~72% blue exterior' },

  // Tier 3 — good blue
  269:  { tier: 3, label: 'Tier 3 Blue Gem', note: '~65% blue exterior' },
  451:  { tier: 3, label: 'Tier 3 Blue Gem', note: '~62% blue exterior' },
  592:  { tier: 3, label: 'Tier 3 Blue Gem', note: '~60% blue exterior' },
  177:  { tier: 3, label: 'Tier 3 Blue Gem', note: '~58% blue exterior' },
};

// ─────────────────────────────────────────────
// Lookup helper
// ─────────────────────────────────────────────

/**
 * Look up the blue gem tier for a given weapon + paintseed.
 * @param {string} weaponName - e.g. "AK-47", "Five-SeveN", "Karambit"
 * @param {number} paintseed
 * @returns {{ tier: number, label: string, note: string } | null}
 */
export function getBlueGemTier(weaponName, paintseed) {
  const name = weaponName.toLowerCase();

  let table = null;
  if (name.includes('ak-47') || name.includes('ak47')) {
    table = AK47_BLUE_GEM_TIERS;
  } else if (name.includes('five-seven') || name.includes('fiveseven')) {
    table = FIVESEVEN_BLUE_GEM_TIERS;
  } else if (name.includes('karambit')) {
    table = KARAMBIT_BLUE_GEM_TIERS;
  }

  if (!table) return null;
  return table[paintseed] || null;
}

/**
 * Check if a weapon + skin is a Case Hardened that supports blue gem tiers.
 */
export function isBlueGemWeapon(marketHashName) {
  if (!marketHashName) return false;
  const n = marketHashName.toLowerCase();
  return n.includes('case hardened') && (
    n.includes('ak-47') ||
    n.includes('five-seven') ||
    n.includes('karambit')
  );
}