/**
 * VaultLens — lib/fuzzySearch.js
 *
 * Fuzzy search and multi-sort logic for inventory filtering.
 *
 * Fuzzy search: Matches items whose names contain all characters of the
 * query in order (subsequence match), weighted by consecutive matches
 * and position. This is the same algorithm used by VS Code's file search.
 *
 * Sort modes:
 *   - default:       Steam's original order (by index)
 *   - price_high:    Price descending
 *   - price_low:     Price ascending
 *   - float_low:     Float ascending (best floats first)
 *   - float_high:    Float descending
 *   - name_az:       Alphabetical A→Z
 *   - name_za:       Alphabetical Z→A
 *   - value_high:    (sticker value) descending
 */

// ─────────────────────────────────────────────
// Fuzzy Match Algorithm
// ─────────────────────────────────────────────

/**
 * Compute a fuzzy match score between a query and a target string.
 *
 * Returns null if the target does not contain all query characters in order.
 * Returns a positive score if it matches — higher score = better match.
 *
 * Scoring:
 *   +10 per matched character
 *   +20 bonus for consecutive character matches
 *   +15 bonus if match starts at position 0
 *   +10 bonus if match starts after a separator (space, -, |, _)
 *   -1 per unmatched character between matches (penalize gaps)
 *
 * @param {string} query  - The search query (user input)
 * @param {string} target - The string to search in (item name)
 * @returns {number|null} Score (null if no match)
 */
export function fuzzyScore(query, target) {
  if (!query || !target) return query ? null : 0;

  const q = query.toLowerCase();
  const t = target.toLowerCase();

  // Fast path: exact substring match gets maximum score
  if (t.includes(q)) {
    const idx = t.indexOf(q);
    return 1000 + (idx === 0 ? 100 : 0);
  }

  let score        = 0;
  let queryIndex   = 0;
  let prevMatchPos = -1;
  let consecutive  = 0;

  const SEPARATORS = new Set([' ', '-', '|', '_', '.', '★', '(', ')']);

  for (let i = 0; i < t.length && queryIndex < q.length; i++) {
    if (t[i] === q[queryIndex]) {
      score += 10;

      // Bonus: consecutive matches
      if (prevMatchPos === i - 1) {
        consecutive++;
        score += 20 * consecutive; // escalating bonus
      } else {
        consecutive = 0;
      }

      // Bonus: match at start of string
      if (i === 0) score += 15;

      // Bonus: match after separator
      if (i > 0 && SEPARATORS.has(t[i - 1])) score += 10;

      // Penalty: gap from previous match
      if (prevMatchPos >= 0) {
        const gap = i - prevMatchPos - 1;
        score -= gap;
      }

      prevMatchPos = i;
      queryIndex++;
    }
  }

  // If we didn't match all query characters, return null
  if (queryIndex < q.length) return null;

  return score;
}

/**
 * Filter an array of items by fuzzy query.
 * Returns items sorted by match score (best first).
 *
 * @param {Array} items          - Array of item objects
 * @param {string} query         - Search query
 * @param {Function} nameGetter  - Function to extract the display name from an item
 * @returns {Array} Filtered and score-sorted items
 */
export function fuzzyFilter(items, query, nameGetter) {
  if (!query || query.trim() === '') return items;

  const q = query.trim();

  const scored = [];
  for (const item of items) {
    const name  = nameGetter(item) || '';
    const score = fuzzyScore(q, name);
    if (score !== null) {
      scored.push({ item, score });
    }
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  return scored.map(s => s.item);
}

// ─────────────────────────────────────────────
// Sort Comparators
// ─────────────────────────────────────────────

/**
 * Sort mode definitions.
 * Each mode has a comparator function that takes two enriched item objects.
 *
 * Enriched item shape (as built by inventory.js):
 * {
 *   element:         HTMLElement  - The item's DOM element
 *   originalIndex:   number       - Original position in inventory
 *   marketHashName:  string
 *   price:           number|null  - USD price
 *   floatValue:      number|null
 *   stickerValue:    number|null
 *   name:            string       - Display name
 * }
 */
export const SORT_MODES = {
  default: {
    label: 'Default Order',
    compare: (a, b) => a.originalIndex - b.originalIndex,
  },
  price_high: {
    label: 'Price: High → Low',
    compare: (a, b) => {
      // Null prices go to the bottom
      if (a.price === null && b.price === null) return 0;
      if (a.price === null) return 1;
      if (b.price === null) return -1;
      return b.price - a.price;
    },
  },
  price_low: {
    label: 'Price: Low → High',
    compare: (a, b) => {
      if (a.price === null && b.price === null) return 0;
      if (a.price === null) return 1;
      if (b.price === null) return -1;
      return a.price - b.price;
    },
  },
  float_low: {
    label: 'Float: Low → High',
    compare: (a, b) => {
      // Non-float items go to bottom
      if (a.floatValue === null && b.floatValue === null) return 0;
      if (a.floatValue === null) return 1;
      if (b.floatValue === null) return -1;
      return a.floatValue - b.floatValue;
    },
  },
  float_high: {
    label: 'Float: High → Low',
    compare: (a, b) => {
      if (a.floatValue === null && b.floatValue === null) return 0;
      if (a.floatValue === null) return 1;
      if (b.floatValue === null) return -1;
      return b.floatValue - a.floatValue;
    },
  },
  name_az: {
    label: 'Name: A → Z',
    compare: (a, b) => (a.name || '').localeCompare(b.name || ''),
  },
  name_za: {
    label: 'Name: Z → A',
    compare: (a, b) => (b.name || '').localeCompare(a.name || ''),
  },
  sticker_value: {
    label: 'Sticker Value: High → Low',
    compare: (a, b) => {
      const av = a.stickerValue || 0;
      const bv = b.stickerValue || 0;
      return bv - av;
    },
  },
};

/**
 * Get a list of sort mode options for <select> population.
 * @returns {Array<{ value: string, label: string }>}
 */
export function getSortOptions() {
  return Object.entries(SORT_MODES).map(([value, { label }]) => ({ value, label }));
}

/**
 * Sort an array of enriched item objects by the given sort mode key.
 * Returns a new sorted array (does not mutate input).
 *
 * @param {Array} items       - Enriched item objects
 * @param {string} sortMode   - Key from SORT_MODES
 * @returns {Array}
 */
export function sortItems(items, sortMode) {
  const mode = SORT_MODES[sortMode] || SORT_MODES.default;
  return [...items].sort(mode.compare);
}

// ─────────────────────────────────────────────
// Combined Filter + Sort
// ─────────────────────────────────────────────

/**
 * Apply both fuzzy search filter and sort to an item array.
 *
 * @param {Array} items         - Enriched item objects
 * @param {string} query        - Search query (empty string = no filter)
 * @param {string} sortMode     - Sort mode key
 * @param {Function} nameGetter - Extracts searchable name from item
 * @returns {Array} Filtered and sorted items
 */
export function filterAndSort(items, query, sortMode, nameGetter) {
  // Apply fuzzy filter first
  const filtered = query && query.trim()
    ? fuzzyFilter(items, query, nameGetter)
    : items;

  // Then sort (fuzzy filter already sorts by score when query is active,
  // but we still apply the explicit sort if not using default)
  if (query && query.trim() && (!sortMode || sortMode === 'default')) {
    // When searching, keep fuzzy score order
    return filtered;
  }

  return sortItems(filtered, sortMode || 'default');
}

// ─────────────────────────────────────────────
// Highlight matched characters in a string
// ─────────────────────────────────────────────

/**
 * Generate HTML with matched query characters wrapped in <mark> tags.
 * Used for visual highlighting of fuzzy search matches in the UI.
 *
 * @param {string} query  - The search query
 * @param {string} target - The display string to highlight
 * @returns {string} HTML string with <mark> wrapping matched chars
 */
export function highlightFuzzyMatch(query, target) {
  if (!query || !target) return escapeHtml(target || '');

  const q = query.toLowerCase();
  const t = target;
  const tLower = t.toLowerCase();

  // Find matched character positions
  const matchedPositions = new Set();
  let qi = 0;
  for (let i = 0; i < tLower.length && qi < q.length; i++) {
    if (tLower[i] === q[qi]) {
      matchedPositions.add(i);
      qi++;
    }
  }

  if (qi < q.length) {
    // No match — return plain text
    return escapeHtml(t);
  }

  // Build highlighted HTML
  let html = '';
  let inMark = false;

  for (let i = 0; i < t.length; i++) {
    const char = escapeHtml(t[i]);
    if (matchedPositions.has(i)) {
      if (!inMark) {
        html += '<mark>';
        inMark = true;
      }
      html += char;
    } else {
      if (inMark) {
        html += '</mark>';
        inMark = false;
      }
      html += char;
    }
  }

  if (inMark) html += '</mark>';
  return html;
}

/**
 * Escape HTML special characters to prevent XSS in innerHTML usage.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─────────────────────────────────────────────
// Inventory Export / Copy List
// ─────────────────────────────────────────────

/**
 * Format an inventory item list as a plain-text string for clipboard copy.
 *
 * Format per line:
 * [Weapon] | [Skin] | [Exterior] | Float: [float] | $[price] | Stickers: $[sticker_value]
 *
 * @param {Array} enrichedItems - Enriched item objects with price/float/sticker data
 * @returns {string} Formatted multi-line string
 */
export function formatInventoryForClipboard(enrichedItems) {
  const lines = enrichedItems.map(item => {
    const name        = item.name          || item.marketHashName || 'Unknown';
    const price       = item.price         !== null ? `$${(item.price || 0).toFixed(2)}` : 'N/A';
    const floatStr    = item.floatValue    !== null ? `Float: ${item.floatValue?.toFixed(4)}` : '';
    const stickerStr  = item.stickerValue && item.stickerValue > 0
      ? `Stickers: $${item.stickerValue.toFixed(2)}`
      : '';

    const parts = [name, price];
    if (floatStr)   parts.push(floatStr);
    if (stickerStr) parts.push(stickerStr);

    return parts.join(' | ');
  });

  return lines.join('\n');
}

/**
 * Copy text to clipboard using the Clipboard API.
 * Falls back to document.execCommand for older contexts.
 * @param {string} text
 * @returns {Promise<boolean>} True if successful
 */
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    // Fallback
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.cssText = 'position:fixed;opacity:0;top:0;left:0;';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}