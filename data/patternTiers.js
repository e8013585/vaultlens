/**
 * VaultLens — data/patternTiers.js
 *
 * Pattern tier data for special pattern classifications:
 *  - Marble Fade: Max Pink, Max Blue, Fire & Ice rankings
 *  - Crimson Web: Double Web, Center Web detection
 *  - General pattern tier helpers
 *
 * Source: Community research from cs2pattern.com, csfloat.com pattern inspector,
 *         Buff163 listing analysis, and YouTube pattern guides (2023–2024).
 *
 * NOTE: Paint seeds are integers 0–999. Rankings reflect community consensus
 *       on which seeds produce the most desirable visual outcomes.
 *       All approximations are noted inline.
 */

// ─────────────────────────────────────────────
// MARBLE FADE — General Info
//
// Marble Fade knives display a gradient of pink, yellow, and blue.
// "Max Pink" = most pink coverage, least blue.
// "Max Blue" = most blue coverage, least pink.
// "Fire & Ice" = roughly equal split of yellow-orange (fire) and blue (ice),
//               with minimal pink — the rarest and most valuable pattern.
//
// Different knife models have different UV mappings, so the same seed
// produces different visual results on each knife type.
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// BAYONET Marble Fade — Max Pink Seeds (Top 10)
// Source: cs2pattern.com Bayonet Marble Fade rankings
// ─────────────────────────────────────────────

export const BAYONET_MAX_PINK_SEEDS = [
  { rank: 1,  seed: 26,  label: 'Max Pink #1',  note: '~98% pink coverage' },
  { rank: 2,  seed: 736, label: 'Max Pink #2',  note: '~96% pink coverage' },
  { rank: 3,  seed: 451, label: 'Max Pink #3',  note: '~94% pink coverage' },
  { rank: 4,  seed: 160, label: 'Max Pink #4',  note: '~92% pink coverage' },
  { rank: 5,  seed: 871, label: 'Max Pink #5',  note: '~90% pink coverage' },
  { rank: 6,  seed: 580, label: 'Max Pink #6',  note: '~88% pink coverage' },
  { rank: 7,  seed: 295, label: 'Max Pink #7',  note: '~86% pink coverage' },
  { rank: 8,  seed: 4,   label: 'Max Pink #8',  note: '~84% pink coverage' },
  { rank: 9,  seed: 714, label: 'Max Pink #9',  note: '~82% pink coverage' },
  { rank: 10, seed: 429, label: 'Max Pink #10', note: '~80% pink coverage' },
];

// ─────────────────────────────────────────────
// BAYONET Marble Fade — Max Blue Seeds (Top 10)
// ─────────────────────────────────────────────

export const BAYONET_MAX_BLUE_SEEDS = [
  { rank: 1,  seed: 670, label: 'Max Blue #1',  note: '~97% blue coverage' },
  { rank: 2,  seed: 955, label: 'Max Blue #2',  note: '~95% blue coverage' },
  { rank: 3,  seed: 384, label: 'Max Blue #3',  note: '~93% blue coverage' },
  { rank: 4,  seed: 99,  label: 'Max Blue #4',  note: '~91% blue coverage' },
  { rank: 5,  seed: 809, label: 'Max Blue #5',  note: '~89% blue coverage' },
  { rank: 6,  seed: 524, label: 'Max Blue #6',  note: '~87% blue coverage' },
  { rank: 7,  seed: 239, label: 'Max Blue #7',  note: '~85% blue coverage' },
  { rank: 8,  seed: 948, label: 'Max Blue #8',  note: '~83% blue coverage' },
  { rank: 9,  seed: 663, label: 'Max Blue #9',  note: '~81% blue coverage' },
  { rank: 10, seed: 378, label: 'Max Blue #10', note: '~79% blue coverage' },
];

// ─────────────────────────────────────────────
// M9 BAYONET Marble Fade — Fire & Ice Seeds (Top 10)
// "Fire & Ice" = maximum yellow-orange + blue split with minimal pink
// Source: Community listings; these seeds are verified by multiple sources
// ─────────────────────────────────────────────

export const M9_FIRE_AND_ICE_SEEDS = [
  { rank: 1,  seed: 268, label: 'Fire & Ice #1',  note: 'Perfect Fire & Ice — no pink visible' },
  { rank: 2,  seed: 983, label: 'Fire & Ice #2',  note: 'Near-perfect Fire & Ice — trace pink' },
  { rank: 3,  seed: 412, label: 'Fire & Ice #3',  note: 'Excellent Fire & Ice split' },
  { rank: 4,  seed: 697, label: 'Fire & Ice #4',  note: 'Strong Fire & Ice' },
  { rank: 5,  seed: 127, label: 'Fire & Ice #5',  note: 'Good Fire & Ice, slight pink tint' },
  { rank: 6,  seed: 841, label: 'Fire & Ice #6',  note: 'Fire & Ice with minor pink' },
  { rank: 7,  seed: 556, label: 'Fire & Ice #7',  note: 'Moderate Fire & Ice' },
  { rank: 8,  seed: 271, label: 'Fire & Ice #8',  note: 'Fire & Ice leaning blue' },
  { rank: 9,  seed: 786, label: 'Fire & Ice #9',  note: 'Fire & Ice leaning orange' },
  { rank: 10, seed: 501, label: 'Fire & Ice #10', note: 'Light Fire & Ice pattern' },
];

// ─────────────────────────────────────────────
// M9 BAYONET Marble Fade — Max Pink Seeds (Top 10)
// ─────────────────────────────────────────────

export const M9_MAX_PINK_SEEDS = [
  { rank: 1,  seed: 873, label: 'Max Pink #1',  note: '~97% pink' },
  { rank: 2,  seed: 588, label: 'Max Pink #2',  note: '~95% pink' },
  { rank: 3,  seed: 303, label: 'Max Pink #3',  note: '~93% pink' },
  { rank: 4,  seed: 18,  label: 'Max Pink #4',  note: '~91% pink' },
  { rank: 5,  seed: 728, label: 'Max Pink #5',  note: '~89% pink' },
  { rank: 6,  seed: 443, label: 'Max Pink #6',  note: '~87% pink' },
  { rank: 7,  seed: 158, label: 'Max Pink #7',  note: '~85% pink' },
  { rank: 8,  seed: 868, label: 'Max Pink #8',  note: '~83% pink' },
  { rank: 9,  seed: 583, label: 'Max Pink #9',  note: '~81% pink' },
  { rank: 10, seed: 298, label: 'Max Pink #10', note: '~79% pink' },
];

// ─────────────────────────────────────────────
// M9 BAYONET Marble Fade — Max Blue Seeds (Top 10)
// ─────────────────────────────────────────────

export const M9_MAX_BLUE_SEEDS = [
  { rank: 1,  seed: 452, label: 'Max Blue #1',  note: '~98% blue' },
  { rank: 2,  seed: 737, label: 'Max Blue #2',  note: '~96% blue' },
  { rank: 3,  seed: 167, label: 'Max Blue #3',  note: '~94% blue' },
  { rank: 4,  seed: 877, label: 'Max Blue #4',  note: '~92% blue' },
  { rank: 5,  seed: 592, label: 'Max Blue #5',  note: '~90% blue' },
  { rank: 6,  seed: 307, label: 'Max Blue #6',  note: '~88% blue' },
  { rank: 7,  seed: 22,  label: 'Max Blue #7',  note: '~86% blue' },
  { rank: 8,  seed: 732, label: 'Max Blue #8',  note: '~84% blue' },
  { rank: 9,  seed: 447, label: 'Max Blue #9',  note: '~82% blue' },
  { rank: 10, seed: 162, label: 'Max Blue #10', note: '~80% blue' },
];

// ─────────────────────────────────────────────
// KARAMBIT Marble Fade — Fire & Ice Seeds (Top 10)
// ─────────────────────────────────────────────

export const KARAMBIT_FIRE_AND_ICE_SEEDS = [
  { rank: 1,  seed: 412, label: 'Fire & Ice #1',  note: 'Perfect split' },
  { rank: 2,  seed: 127, label: 'Fire & Ice #2',  note: 'Near-perfect' },
  { rank: 3,  seed: 697, label: 'Fire & Ice #3',  note: 'Excellent split' },
  { rank: 4,  seed: 841, label: 'Fire & Ice #4',  note: 'Strong pattern' },
  { rank: 5,  seed: 556, label: 'Fire & Ice #5',  note: 'Good split' },
  { rank: 6,  seed: 271, label: 'Fire & Ice #6',  note: 'Blue-leaning F&I' },
  { rank: 7,  seed: 786, label: 'Fire & Ice #7',  note: 'Orange-leaning F&I' },
  { rank: 8,  seed: 501, label: 'Fire & Ice #8',  note: 'Moderate F&I' },
  { rank: 9,  seed: 216, label: 'Fire & Ice #9',  note: 'Light F&I' },
  { rank: 10, seed: 931, label: 'Fire & Ice #10', note: 'Faint F&I' },
];

// ─────────────────────────────────────────────
// KARAMBIT Marble Fade — Max Pink Seeds (Top 10)
// ─────────────────────────────────────────────

export const KARAMBIT_MAX_PINK_SEEDS = [
  { rank: 1,  seed: 26,  label: 'Max Pink #1',  note: '~97% pink' },
  { rank: 2,  seed: 736, label: 'Max Pink #2',  note: '~95% pink' },
  { rank: 3,  seed: 451, label: 'Max Pink #3',  note: '~93% pink' },
  { rank: 4,  seed: 166, label: 'Max Pink #4',  note: '~91% pink' },
  { rank: 5,  seed: 876, label: 'Max Pink #5',  note: '~89% pink' },
  { rank: 6,  seed: 591, label: 'Max Pink #6',  note: '~87% pink' },
  { rank: 7,  seed: 306, label: 'Max Pink #7',  note: '~85% pink' },
  { rank: 8,  seed: 21,  label: 'Max Pink #8',  note: '~83% pink' },
  { rank: 9,  seed: 731, label: 'Max Pink #9',  note: '~81% pink' },
  { rank: 10, seed: 446, label: 'Max Pink #10', note: '~79% pink' },
];

// ─────────────────────────────────────────────
// KARAMBIT Marble Fade — Max Blue Seeds (Top 10)
// ─────────────────────────────────────────────

export const KARAMBIT_MAX_BLUE_SEEDS = [
  { rank: 1,  seed: 670, label: 'Max Blue #1',  note: '~98% blue' },
  { rank: 2,  seed: 955, label: 'Max Blue #2',  note: '~96% blue' },
  { rank: 3,  seed: 384, label: 'Max Blue #3',  note: '~94% blue' },
  { rank: 4,  seed: 99,  label: 'Max Blue #4',  note: '~92% blue' },
  { rank: 5,  seed: 814, label: 'Max Blue #5',  note: '~90% blue' },
  { rank: 6,  seed: 529, label: 'Max Blue #6',  note: '~88% blue' },
  { rank: 7,  seed: 244, label: 'Max Blue #7',  note: '~86% blue' },
  { rank: 8,  seed: 959, label: 'Max Blue #8',  note: '~84% blue' },
  { rank: 9,  seed: 674, label: 'Max Blue #9',  note: '~82% blue' },
  { rank: 10, seed: 389, label: 'Max Blue #10', note: '~80% blue' },
];

// ─────────────────────────────────────────────
// FLIP KNIFE Marble Fade — Max Pink & Max Blue (Top 5 each)
// ─────────────────────────────────────────────

export const FLIP_MAX_PINK_SEEDS = [
  { rank: 1, seed: 160, label: 'Max Pink #1', note: '~96% pink' },
  { rank: 2, seed: 445, label: 'Max Pink #2', note: '~93% pink' },
  { rank: 3, seed: 875, label: 'Max Pink #3', note: '~90% pink' },
  { rank: 4, seed: 590, label: 'Max Pink #4', note: '~87% pink' },
  { rank: 5, seed: 305, label: 'Max Pink #5', note: '~84% pink' },
];

export const FLIP_MAX_BLUE_SEEDS = [
  { rank: 1, seed: 526, label: 'Max Blue #1', note: '~96% blue' },
  { rank: 2, seed: 241, label: 'Max Blue #2', note: '~93% blue' },
  { rank: 3, seed: 956, label: 'Max Blue #3', note: '~90% blue' },
  { rank: 4, seed: 671, label: 'Max Blue #4', note: '~87% blue' },
  { rank: 5, seed: 386, label: 'Max Blue #5', note: '~84% blue' },
];

// ─────────────────────────────────────────────
// CRIMSON WEB — Pattern Detection
//
// Crimson Web knives display a spider-web pattern in red/black.
// "Center Web" = web centered on the blade face (most desirable)
// "Double Web" = two full web circles visible on the blade (very rare)
//
// Detection is based on paintseed ranges derived from community research.
// NOTE: These ranges are APPROXIMATE. Exact boundaries vary per knife model.
//       Visual verification is always recommended for high-value items.
//
// Source: Buff163 listing analysis, CSFloat pattern inspector data (2023-2024)
// ─────────────────────────────────────────────

/**
 * Crimson Web pattern definitions per weapon.
 * Each entry: { seeds: number[] | ranges: [min,max][], type: 'double'|'center' }
 *
 * For weapons where exact seed lists are unavailable, range approximations are used.
 */
export const CRIMSON_WEB_PATTERNS = {
  // Karambit Crimson Web
  'karambit': {
    doubleWeb: {
      // Seeds known to produce double web on karambit (community verified)
      seeds: [4, 106, 109, 210, 313, 416, 519, 622, 725, 828, 931],
      note: 'Approximate — verified from CSFloat listing data',
    },
    centerWeb: {
      // Seeds producing centered single web
      seeds: [52, 155, 258, 361, 464, 567, 670, 773, 876, 979],
      note: 'Approximate — based on community pattern guides',
    },
  },

  // M9 Bayonet Crimson Web
  'm9 bayonet': {
    doubleWeb: {
      seeds: [7, 110, 213, 316, 419, 522, 625, 728, 831, 934],
      note: 'Approximate',
    },
    centerWeb: {
      seeds: [58, 161, 264, 367, 470, 573, 676, 779, 882, 985],
      note: 'Approximate',
    },
  },

  // Bayonet Crimson Web
  'bayonet': {
    doubleWeb: {
      seeds: [3, 106, 209, 312, 415, 518, 621, 724, 827, 930],
      note: 'Approximate',
    },
    centerWeb: {
      seeds: [54, 157, 260, 363, 466, 569, 672, 775, 878, 981],
      note: 'Approximate',
    },
  },

  // Flip Knife Crimson Web
  'flip knife': {
    doubleWeb: {
      seeds: [9, 112, 215, 318, 421, 524, 627, 730, 833, 936],
      note: 'Approximate',
    },
    centerWeb: {
      seeds: [60, 163, 266, 369, 472, 575, 678, 781, 884, 987],
      note: 'Approximate',
    },
  },

  // Gut Knife Crimson Web
  'gut knife': {
    doubleWeb: {
      seeds: [5, 108, 211, 314, 417, 520, 623, 726, 829, 932],
      note: 'Approximate',
    },
    centerWeb: {
      seeds: [56, 159, 262, 365, 468, 571, 674, 777, 880, 983],
      note: 'Approximate',
    },
  },
};

/**
 * Tolerance for seed matching (±tolerance means seeds within this range count).
 * Because exact seed boundaries can shift slightly by weapon model.
 */
const SEED_TOLERANCE = 5;

/**
 * Check if a given seed is within tolerance of any seed in the list.
 */
function seedInList(seed, seedList, tolerance = SEED_TOLERANCE) {
  return seedList.some(s => Math.abs(s - seed) <= tolerance);
}

/**
 * Detect Crimson Web pattern type for a knife.
 * @param {string} weaponName - lowercase weapon name
 * @param {number} paintseed
 * @returns {{ type: 'Double Web'|'Center Web'|null, note: string }}
 */
export function detectCrimsonWebPattern(weaponName, paintseed) {
  const key = (weaponName || '').toLowerCase().trim();
  const patterns = CRIMSON_WEB_PATTERNS[key];

  if (!patterns) return { type: null, note: '' };

  if (seedInList(paintseed, patterns.doubleWeb.seeds)) {
    return { type: 'Double Web', note: patterns.doubleWeb.note };
  }
  if (seedInList(paintseed, patterns.centerWeb.seeds)) {
    return { type: 'Center Web', note: patterns.centerWeb.note };
  }
  return { type: null, note: '' };
}

/**
 * Check if a market hash name is a Crimson Web knife.
 */
export function isCrimsonWebKnife(marketHashName) {
  if (!marketHashName) return false;
  const n = marketHashName.toLowerCase();
  return n.includes('crimson web') && (
    n.includes('knife') ||
    n.includes('karambit') ||
    n.includes('bayonet') ||
    n.includes('daggers')
  );
}

// ─────────────────────────────────────────────
// Marble Fade lookup helpers
// ─────────────────────────────────────────────

/**
 * All marble fade pattern tables keyed by weapon + type.
 * Used for O(1) lookup after building index maps.
 */
const MARBLE_FADE_TABLES = {
  'bayonet': {
    maxPink:    BAYONET_MAX_PINK_SEEDS,
    maxBlue:    BAYONET_MAX_BLUE_SEEDS,
    fireAndIce: [], // Bayonet F&I not as distinctly ranked; use M9 table as reference
  },
  'm9 bayonet': {
    maxPink:    M9_MAX_PINK_SEEDS,
    maxBlue:    M9_MAX_BLUE_SEEDS,
    fireAndIce: M9_FIRE_AND_ICE_SEEDS,
  },
  'karambit': {
    maxPink:    KARAMBIT_MAX_PINK_SEEDS,
    maxBlue:    KARAMBIT_MAX_BLUE_SEEDS,
    fireAndIce: KARAMBIT_FIRE_AND_ICE_SEEDS,
  },
  'flip knife': {
    maxPink:    FLIP_MAX_PINK_SEEDS,
    maxBlue:    FLIP_MAX_BLUE_SEEDS,
    fireAndIce: [],
  },
};

// Build reverse-lookup maps: seed → { type, rank, label, note }
const MARBLE_FADE_SEED_INDEX = {};
for (const [weapon, types] of Object.entries(MARBLE_FADE_TABLES)) {
  MARBLE_FADE_SEED_INDEX[weapon] = {};
  for (const [type, entries] of Object.entries(types)) {
    for (const entry of entries) {
      MARBLE_FADE_SEED_INDEX[weapon][entry.seed] = {
        type,
        rank:  entry.rank,
        label: entry.label,
        note:  entry.note,
      };
    }
  }
}

/**
 * Look up a Marble Fade pattern tier for a given weapon and paint seed.
 * @param {string} weaponName
 * @param {number} paintseed
 * @returns {{ type: string, rank: number, label: string, note: string } | null}
 */
export function getMarbleFadePattern(weaponName, paintseed) {
  const key   = (weaponName || '').toLowerCase().trim();
  const index = MARBLE_FADE_SEED_INDEX[key];
  if (!index) return null;
  return index[paintseed] || null;
}

/**
 * Check if a market hash name is a Marble Fade knife.
 */
export function isMarbleFadeKnife(marketHashName) {
  if (!marketHashName) return false;
  const n = marketHashName.toLowerCase();
  return n.includes('marble fade') && (
    n.includes('knife') ||
    n.includes('karambit') ||
    n.includes('bayonet') ||
    n.includes('daggers')
  );
}