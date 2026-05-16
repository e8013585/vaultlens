/**
 * VaultLens — lib/phaseDetector.js
 *
 * Doppler phase detection for CS2 knives.
 *
 * Doppler knives display a color phase based on their paintindex value.
 * The phases are determined by Valve's internal paint index mapping.
 *
 * Paint Index → Phase mapping (verified against CSFloat API data):
 *   415 → Phase 1    (cyan/blue marbling on silver)
 *   416 → Phase 2    (pink/purple marbling)
 *   417 → Phase 3    (purple/blue swirls)
 *   418 → Phase 4    (black/blue, rare)
 *   419 → Ruby       (solid deep red)
 *   420 → Sapphire   (solid bright blue) ★ Rarest
 *   421 → Black Pearl (dark iridescent)  ★ Ultra rare
 *   422 → Emerald    (solid bright green) — Gamma Doppler only
 *
 * Gamma Doppler uses a separate set of paint indices:
 *   568 → Gamma Phase 1
 *   569 → Gamma Phase 2
 *   570 → Gamma Phase 3
 *   571 → Gamma Phase 4
 *   572 → Emerald    (Gamma Doppler Emerald)
 *
 * Source: CS2 game files, CSFloat API documentation, community research.
 */

// ─────────────────────────────────────────────
// Phase Maps
// ─────────────────────────────────────────────

/**
 * Standard Doppler paint index → phase info
 */
export const DOPPLER_PHASES = {
  415: {
    phase:       'Phase 1',
    shortLabel:  'P1',
    color:       '#6ab0de', // cyan-blue
    rarity:      'common',
    description: 'Cyan and blue marbling on silver base',
  },
  416: {
    phase:       'Phase 2',
    shortLabel:  'P2',
    color:       '#c96bde', // pink-purple
    rarity:      'common',
    description: 'Pink and purple marbling',
  },
  417: {
    phase:       'Phase 3',
    shortLabel:  'P3',
    color:       '#7b68de', // purple-blue
    rarity:      'uncommon',
    description: 'Purple and blue swirls',
  },
  418: {
    phase:       'Phase 4',
    shortLabel:  'P4',
    color:       '#3a5f8a', // dark blue-black
    rarity:      'rare',
    description: 'Dark blue-black, the rarest standard phase',
  },
  419: {
    phase:       'Ruby',
    shortLabel:  'Ruby',
    color:       '#c0392b', // deep red
    rarity:      'special',
    description: 'Solid deep red — highly valued',
  },
  420: {
    phase:       'Sapphire',
    shortLabel:  'Sapph',
    color:       '#2980b9', // bright blue
    rarity:      'special',
    description: 'Solid bright blue — rarest standard Doppler',
  },
  421: {
    phase:       'Black Pearl',
    shortLabel:  'BP',
    color:       '#2c2c54', // dark iridescent purple-black
    rarity:      'special',
    description: 'Dark iridescent — extremely rare',
  },
};

/**
 * Gamma Doppler paint index → phase info
 */
export const GAMMA_DOPPLER_PHASES = {
  568: {
    phase:       'Gamma Phase 1',
    shortLabel:  'G1',
    color:       '#7dde6a', // green-yellow
    rarity:      'common',
    isGamma:     true,
    description: 'Green and yellow marbling',
  },
  569: {
    phase:       'Gamma Phase 2',
    shortLabel:  'G2',
    color:       '#6adec3', // cyan-green
    rarity:      'common',
    isGamma:     true,
    description: 'Cyan and green gradient',
  },
  570: {
    phase:       'Gamma Phase 3',
    shortLabel:  'G3',
    color:       '#6aa5de', // blue-green
    rarity:      'uncommon',
    isGamma:     true,
    description: 'Blue-green swirls',
  },
  571: {
    phase:       'Gamma Phase 4',
    shortLabel:  'G4',
    color:       '#9b6ade', // purple-green
    rarity:      'rare',
    isGamma:     true,
    description: 'Purple with green undertones',
  },
  572: {
    phase:       'Emerald',
    shortLabel:  'Emerald',
    color:       '#00c853', // bright green
    rarity:      'special',
    isGamma:     true,
    description: 'Solid bright green — Gamma Doppler special',
  },
};

// Combined phase map for single-call lookups
export const ALL_DOPPLER_PHASES = { ...DOPPLER_PHASES, ...GAMMA_DOPPLER_PHASES };

// ─────────────────────────────────────────────
// Doppler-eligible weapons
// Only knives with "Doppler" in their market name can have phases
// ─────────────────────────────────────────────

const DOPPLER_KNIFE_KEYWORDS = [
  'doppler',
];

/**
 * Check if an item's market hash name indicates it could be a Doppler knife.
 * @param {string} marketHashName
 * @returns {boolean}
 */
export function isDopplerKnife(marketHashName) {
  if (!marketHashName) return false;
  const n = marketHashName.toLowerCase();
  return DOPPLER_KNIFE_KEYWORDS.some(kw => n.includes(kw));
}

/**
 * Check specifically for Gamma Doppler.
 * @param {string} marketHashName
 * @returns {boolean}
 */
export function isGammaDoppler(marketHashName) {
  if (!marketHashName) return false;
  return marketHashName.toLowerCase().includes('gamma doppler');
}

// ─────────────────────────────────────────────
// Phase Detection
// ─────────────────────────────────────────────

/**
 * Get the Doppler phase info for a given paintindex.
 * @param {number} paintIndex - From CSGOFloat API iteminfo
 * @param {string} [marketHashName] - Optional, used to verify it's a Doppler
 * @returns {{ phase, shortLabel, color, rarity, description, isGamma? } | null}
 */
export function getDopplerPhase(paintIndex, marketHashName) {
  if (paintIndex === null || paintIndex === undefined) return null;

  // If market hash name provided, verify it's actually a Doppler
  if (marketHashName && !isDopplerKnife(marketHashName)) return null;

  // Check standard Doppler phases
  if (DOPPLER_PHASES[paintIndex]) {
    return { ...DOPPLER_PHASES[paintIndex], paintIndex };
  }

  // Check Gamma Doppler phases
  if (GAMMA_DOPPLER_PHASES[paintIndex]) {
    return { ...GAMMA_DOPPLER_PHASES[paintIndex], paintIndex };
  }

  return null;
}

/**
 * Get a human-readable phase label including Gamma distinction.
 * @param {number} paintIndex
 * @param {string} marketHashName
 * @returns {string} e.g. "Phase 2", "Ruby", "Gamma Phase 1", "Emerald"
 */
export function getDopplerPhaseName(paintIndex, marketHashName) {
  const phase = getDopplerPhase(paintIndex, marketHashName);
  return phase ? phase.phase : '';
}

/**
 * Get the badge color for a Doppler phase.
 * @param {number} paintIndex
 * @returns {string} CSS color string
 */
export function getDopplerPhaseColor(paintIndex) {
  const info = ALL_DOPPLER_PHASES[paintIndex];
  return info ? info.color : '#888888';
}

// ─────────────────────────────────────────────
// Phase rarity ranking (for sorting/display)
// ─────────────────────────────────────────────

const RARITY_RANK = {
  'common':   1,
  'uncommon': 2,
  'rare':     3,
  'special':  4,
};

/**
 * Get a numeric rarity rank for a phase (higher = rarer).
 * @param {number} paintIndex
 * @returns {number}
 */
export function getDopplerRarityRank(paintIndex) {
  const info = ALL_DOPPLER_PHASES[paintIndex];
  if (!info) return 0;
  return RARITY_RANK[info.rarity] || 0;
}

/**
 * Check if a Doppler phase is a "special" (Ruby/Sapphire/Black Pearl/Emerald).
 * These command significant price premiums.
 * @param {number} paintIndex
 * @returns {boolean}
 */
export function isDopplerSpecialPhase(paintIndex) {
  const info = ALL_DOPPLER_PHASES[paintIndex];
  return info ? info.rarity === 'special' : false;
}

// ─────────────────────────────────────────────
// defindex mapping for Doppler knife types
// (used to identify which knife model a Doppler is)
// ─────────────────────────────────────────────

/**
 * CS2 defindex values for knife weapons that can have Doppler.
 * Source: CS2 items_game.txt / community documentation
 */
export const KNIFE_DEFINDEX = {
  // Standard knives
  500: 'Bayonet',
  505: 'Flip Knife',
  506: 'Gut Knife',
  507: 'Karambit',
  508: 'M9 Bayonet',
  509: 'Huntsman Knife',
  512: 'Falchion Knife',
  514: 'Bowie Knife',
  515: 'Butterfly Knife',
  516: 'Shadow Daggers',
  519: 'Navaja Knife',
  520: 'Stiletto Knife',
  521: 'Talon Knife',
  522: 'Ursus Knife',
  523: 'Classic Knife',
  525: 'Paracord Knife',
  526: 'Survival Knife',
  527: 'Nomad Knife',
  529: 'Skeleton Knife',
};

/**
 * Get the knife name from a defindex.
 * @param {number} defindex
 * @returns {string|null}
 */
export function getKnifeNameFromDefindex(defindex) {
  return KNIFE_DEFINDEX[defindex] || null;
}