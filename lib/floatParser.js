/**
 * VaultLens — lib/floatParser.js
 *
 * Utilities for extracting float (wear) values and related data
 * from Steam inventory item data.
 *
 * Steam inventory items include an "actions" array with inspect links
 * in the format: steam://rungame/730/76561202255233023/+csgo_econ_action_preview ...
 *
 * The CSGOFloat public API accepts these inspect links and returns:
 *   floatvalue, paintindex, paintseed, defindex, stickers, etc.
 *
 * This module handles:
 *   1. Extracting inspect links from Steam item data
 *   2. Determining float-eligible items
 *   3. Formatting float values for display
 *   4. Mapping float values to exterior names
 */

// ─────────────────────────────────────────────
// Exterior float ranges (CS2 standard)
// ─────────────────────────────────────────────

export const EXTERIOR_RANGES = [
  { label: 'FN',  name: 'Factory New',   min: 0.00, max: 0.07, color: '#4ade80' }, // green
  { label: 'MW',  name: 'Minimal Wear',  min: 0.07, max: 0.15, color: '#86efac' }, // light green
  { label: 'FT',  name: 'Field-Tested',  min: 0.15, max: 0.38, color: '#fbbf24' }, // yellow
  { label: 'WW',  name: 'Well-Worn',     min: 0.38, max: 0.45, color: '#f97316' }, // orange
  { label: 'BS',  name: 'Battle-Scarred',min: 0.45, max: 1.00, color: '#ef4444' }, // red
];

/**
 * Map a float value to its exterior label and color.
 * @param {number} floatVal - 0.0 to 1.0
 * @returns {{ label: string, name: string, color: string } | null}
 */
export function getExterior(floatVal) {
  if (floatVal === null || floatVal === undefined || isNaN(floatVal)) return null;
  for (const range of EXTERIOR_RANGES) {
    // Use < max except for Battle-Scarred which is inclusive at 1.0
    if (floatVal >= range.min && (floatVal < range.max || range.label === 'BS')) {
      return range;
    }
  }
  return null;
}

/**
 * Format a float value to 4 significant decimal places.
 * e.g. 0.034156787 → "0.0342"
 * @param {number} floatVal
 * @returns {string}
 */
export function formatFloat(floatVal) {
  if (floatVal === null || floatVal === undefined) return 'N/A';
  return floatVal.toFixed(4);
}

/**
 * Format float for compact display (shows more precision for FN items).
 * FN items (< 0.01): show 4 decimals. Others: show 4 decimals.
 * @param {number} floatVal
 * @returns {string}
 */
export function formatFloatCompact(floatVal) {
  if (floatVal === null || floatVal === undefined) return '—';
  if (floatVal < 0.001) return floatVal.toFixed(6); // ultra-low float
  return floatVal.toFixed(4);
}

// ─────────────────────────────────────────────
// Inspect Link Extraction
// ─────────────────────────────────────────────

/**
 * Extract the inspect link from a Steam inventory item's actions array.
 *
 * Steam item actions look like:
 * [{ "link": "steam://rungame/730/.../+csgo_econ_action_preview%20S%owner_steamid%A%assetid%D%d", "name": "..." }]
 *
 * The link has placeholders:
 *   %owner_steamid% → the owner's SteamID64
 *   %assetid%       → the item's asset ID
 *
 * These must be substituted before sending to CSGOFloat API.
 *
 * @param {Object} item - Steam inventory item object
 * @param {string} ownerSteamId - The inventory owner's SteamID64
 * @returns {string|null} Resolved inspect link, or null if not applicable
 */
export function extractInspectLink(item, ownerSteamId) {
  if (!item || !item.actions || !Array.isArray(item.actions)) return null;

  // Find the inspect action (link to CS2 inspect in-game)
  const inspectAction = item.actions.find(a =>
    a.link && a.link.includes('csgo_econ_action_preview')
  );

  if (!inspectAction) return null;

  let link = inspectAction.link;

  // Substitute placeholders
  // %owner_steamid% → Steam ID of the inventory owner
  link = link.replace('%owner_steamid%', ownerSteamId || '');
  // %assetid% → item's assetid
  link = link.replace('%assetid%', item.assetid || '');
  // %d / %D → descriptor (sometimes used); CSGOFloat handles this internally
  // Leave %d as-is if owner is browsing — CSGOFloat API resolves it

  // Validate it has the steam:// protocol
  if (!link.startsWith('steam://')) return null;

  return link;
}

/**
 * Extract the inspect link from market_actions (used on market pages)
 * vs regular actions (used in inventory).
 */
export function extractMarketInspectLink(item, ownerSteamId, assetid) {
  const actions = item.market_actions || item.actions || [];
  const inspectAction = actions.find(a =>
    a.link && a.link.includes('csgo_econ_action_preview')
  );
  if (!inspectAction) return null;

  let link = inspectAction.link;
  link = link.replace('%owner_steamid%', ownerSteamId || '');
  link = link.replace('%assetid%', assetid || item.assetid || '');
  return link;
}

// ─────────────────────────────────────────────
// Float-Eligibility Check
// ─────────────────────────────────────────────

/**
 * Items that cannot have float values (no paint layer).
 * These are common non-weapon item types in CS2 inventories.
 */
const NON_FLOAT_TAGS = [
  'Gift',
  'Sticker',
  'Graffiti',
  'Sealed Graffiti',
  'Music Kit',
  'Case',
  'Key',
  'Tag',
  'Storage Unit',
  'Pin',
  'Coin',
  'Pass',
  'Ticket',
  'Tool',
  'Agent',           // Agents don't have float
  'Patch',
  'Charm',
];

/**
 * Weapons/items that have float values but are NOT inspectable
 * in the traditional sense (no paint/pattern data from CSGOFloat).
 * NOTE: Vanilla knives (no skin) do not have inspect links.
 */
const ALWAYS_INSPECTABLE_KEYWORDS = [
  '★', // All star (knife) items with skins have floats
];

/**
 * Determine if an item has a float value (and thus can be queried from CSGOFloat).
 * @param {Object} item - Steam inventory item (with descriptions/tags)
 * @returns {boolean}
 */
export function isFloatEligible(item) {
  if (!item) return false;

  // Check item type via tags
  const tags = item.tags || [];
  for (const tag of tags) {
    const catValue = (tag.category_name || '').toLowerCase();
    const tagValue = (tag.localized_tag_name || tag.name || '').toLowerCase();

    // If the item type tag matches a non-float type, skip
    if (catValue === 'type') {
      for (const nonFloat of NON_FLOAT_TAGS) {
        if (tagValue.includes(nonFloat.toLowerCase())) return false;
      }
    }

    // "exterior" tag presence is a strong indicator of float eligibility
    if (catValue === 'exterior') return true;
  }

  // Check market hash name for knives (starred items)
  const name = item.market_hash_name || item.name || '';
  if (name.startsWith('★')) return true;

  // Check if item has an inspect link at all
  const actions = item.actions || [];
  const hasInspect = actions.some(a =>
    a.link && a.link.includes('csgo_econ_action_preview')
  );

  return hasInspect;
}

// ─────────────────────────────────────────────
// Rarity Color Mapping
// ─────────────────────────────────────────────

/**
 * CS2 rarity colors (border glow colors for overlays).
 * Matches Valve's official rarity color scale.
 */
export const RARITY_COLORS = {
  'Consumer Grade':     '#b0c3d9', // white/grey
  'Industrial Grade':   '#5e98d9', // light blue
  'Mil-Spec Grade':     '#4b69ff', // blue
  'Restricted':         '#8847ff', // purple
  'Classified':         '#d32ce6', // pink
  'Covert':             '#eb4b4b', // red
  'Extraordinary':      '#e4ae39', // gold (knives/gloves)
  'Contraband':         '#e4ae39', // gold (discontinued)
  '★':                  '#e4ae39', // fallback for knife items

  // Sticker rarities
  'High Grade':         '#4b69ff',
  'Remarkable':         '#8847ff',
  'Exotic':             '#d32ce6',
  'Extraordinary (Sticker)': '#e4ae39',
};

/**
 * Extract the rarity color for an item from its tags.
 * @param {Object} item - Steam inventory item
 * @returns {string} CSS color string
 */
export function getRarityColor(item) {
  if (!item || !item.tags) return RARITY_COLORS['Consumer Grade'];

  for (const tag of item.tags) {
    if (tag.category === 'Rarity' || tag.category_name === 'Quality') {
      const name = tag.localized_tag_name || tag.name || '';
      // Direct match
      if (RARITY_COLORS[name]) return RARITY_COLORS[name];
      // Tag internal name matching (e.g. "Rarity_Ancient_Weapon" = Covert)
      const internalName = tag.internal_name || '';
      if (internalName.includes('Contraband')) return RARITY_COLORS['Contraband'];
      if (internalName.includes('Ancient'))    return RARITY_COLORS['Covert'];
      if (internalName.includes('Legendary'))  return RARITY_COLORS['Classified'];
      if (internalName.includes('Mythical'))   return RARITY_COLORS['Restricted'];
      if (internalName.includes('Rare'))       return RARITY_COLORS['Mil-Spec Grade'];
      if (internalName.includes('Uncommon'))   return RARITY_COLORS['Industrial Grade'];
      if (internalName.includes('Common'))     return RARITY_COLORS['Consumer Grade'];
    }
  }

  // Knife fallback
  const name = item.market_hash_name || '';
  if (name.startsWith('★')) return RARITY_COLORS['Extraordinary'];

  return RARITY_COLORS['Consumer Grade'];
}

// ─────────────────────────────────────────────
// Float quality thresholds (for highlighting)
// ─────────────────────────────────────────────

/** Thresholds for "low float" highlighting within an exterior tier */
export const LOW_FLOAT_THRESHOLDS = {
  FN: 0.01,   // Under 0.01 is elite FN
  MW: 0.08,   // Just above FN boundary
  FT: 0.16,   // Just above MW boundary
  WW: 0.39,
  BS: 0.46,
};

/**
 * Check if a float value is considered "low float" for its exterior.
 * @param {number} floatVal
 * @returns {boolean}
 */
export function isLowFloat(floatVal) {
  const exterior = getExterior(floatVal);
  if (!exterior) return false;
  const threshold = LOW_FLOAT_THRESHOLDS[exterior.label];
  return floatVal < threshold;
}

/**
 * Check if a float value is "high float" (near the upper boundary of its exterior).
 * @param {number} floatVal
 * @returns {boolean}
 */
export function isHighFloat(floatVal) {
  const exterior = getExterior(floatVal);
  if (!exterior) return false;
  // Within 10% of the max boundary
  const range = exterior.max - exterior.min;
  return floatVal > (exterior.max - range * 0.1);
}