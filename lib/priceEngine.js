/**
 * VaultLens — lib/priceEngine.js
 *
 * Price lookup, formatting, and caching utilities.
 *
 * This module is used by content scripts (inventory.js, tradeoffers.js)
 * to look up prices for items given the current active price map.
 *
 * All external API calls are routed through background.js via
 * chrome.runtime.sendMessage to respect rate limiting and CORS policies.
 *
 * Price map structure depends on mode:
 *   PricEmpire: { [marketHashName]: { buff163, skinport, csFloat } }  (values in USD cents or dollars — verify per API)
 *   Skinport:   { [marketHashName]: { minPrice, suggestedPrice, itemPage } }
 */

// ─────────────────────────────────────────────
// Price Map State (module-level cache for content scripts)
// ─────────────────────────────────────────────

/** @type {Object|null} Active price map */
let _priceMap      = null;
/** @type {string} Active pricing mode */
let _pricingMode   = 'skinport';
/** @type {number} Timestamp of last price load */
let _priceLoadedAt = 0;

// ─────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────

/**
 * Load prices from the background service worker.
 * Serves cached prices immediately; background refreshes if stale.
 *
 * @returns {Promise<{ priceMap: Object, mode: string, timestamp: number }>}
 */
export async function loadPrices() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: 'GET_PRICES' }, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (response?.error) {
        reject(new Error(response.error));
        return;
      }

      _priceMap      = response.priceMap    || {};
      _pricingMode   = response.mode        || 'skinport';
      _priceLoadedAt = response.timestamp   || Date.now();

      resolve({
        priceMap:  _priceMap,
        mode:      _pricingMode,
        timestamp: _priceLoadedAt,
      });
    });
  });
}

/**
 * Force a fresh price fetch via background.
 * @returns {Promise<Object>}
 */
export async function refreshPrices() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: 'FETCH_PRICES' }, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (response?.error) {
        reject(new Error(response.error));
        return;
      }

      _priceMap      = response.priceMap    || {};
      _pricingMode   = response.mode        || 'skinport';
      _priceLoadedAt = response.timestamp   || Date.now();

      resolve({
        priceMap:  _priceMap,
        mode:      _pricingMode,
        timestamp: _priceLoadedAt,
      });
    });
  });
}

/**
 * Manually inject an already-loaded price map (used when receiving
 * prices from popup or other sources without re-fetching).
 */
export function setPriceMap(priceMap, mode, timestamp) {
  _priceMap      = priceMap    || {};
  _pricingMode   = mode        || 'skinport';
  _priceLoadedAt = timestamp   || Date.now();
}

/**
 * Get the currently loaded price map.
 * @returns {Object|null}
 */
export function getPriceMap() {
  return _priceMap;
}

/**
 * Get the current pricing mode.
 * @returns {string}
 */
export function getPricingMode() {
  return _pricingMode;
}

// ─────────────────────────────────────────────
// Price Lookup
// ─────────────────────────────────────────────

/**
 * Look up the price for an item by market hash name.
 *
 * Returns price in USD (dollars, not cents).
 * PricEmpire prices are in USD. Skinport prices are in USD.
 *
 * @param {string} marketHashName
 * @param {Object} [overridePriceMap] - Optional override (uses module state if not provided)
 * @param {string} [overrideMode]     - Optional mode override
 * @returns {number|null} Price in USD, or null if not found
 */
export function lookupPrice(marketHashName, overridePriceMap, overrideMode) {
  const priceMap = overridePriceMap || _priceMap;
  const mode     = overrideMode     || _pricingMode;

  if (!priceMap || !marketHashName) return null;

  const entry = priceMap[marketHashName];
  if (!entry) return null;

  if (mode === 'skinport') {
    // Skinport prices are in USD cents from the API — divide by 100
    // ACTUALLY: Skinport API returns prices in the currency units directly (dollars)
    // Their min_price field is already in dollars for USD
    return entry.minPrice ?? null;
  } else {
    // PricEmpire: buff163 price is default display
    // PricEmpire v3 prices are in USD (dollar units, not cents)
    return entry.buff163 ?? entry.skinport ?? entry.csFloat ?? null;
  }
}

/**
 * Look up Buff163 price specifically (PricEmpire mode).
 * @param {string} marketHashName
 * @returns {number|null}
 */
export function lookupBuff163Price(marketHashName) {
  if (!_priceMap) return null;
  const entry = _priceMap[marketHashName];
  return entry?.buff163 ?? null;
}

/**
 * Look up CSFloat price specifically (PricEmpire mode).
 * @param {string} marketHashName
 * @returns {number|null}
 */
export function lookupCSFloatPrice(marketHashName) {
  if (!_priceMap) return null;
  const entry = _priceMap[marketHashName];
  return entry?.csFloat ?? null;
}

/**
 * Look up Skinport price specifically.
 * @param {string} marketHashName
 * @returns {number|null}
 */
export function lookupSkinportPrice(marketHashName) {
  if (!_priceMap) return null;
  const entry = _priceMap[marketHashName];
  if (_pricingMode === 'skinport') return entry?.minPrice ?? null;
  return entry?.skinport ?? null;
}

// ─────────────────────────────────────────────
// Doppler Phase Price Override
// ─────────────────────────────────────────────

/**
 * Fetch a phase-specific price for a Doppler knife from CSFloat.
 * This is an async call that goes through background.js.
 *
 * @param {string} marketHashName
 * @param {number} paintIndex
 * @returns {Promise<number|null>} Price in USD
 */
export async function fetchDopplerPhasePrice(marketHashName, paintIndex) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({
      action:         'FETCH_CSFLOAT_DOPPLER',
      marketHashName,
      paintIndex,
    }, response => {
      if (chrome.runtime.lastError || response?.error) {
        resolve(null);
        return;
      }
      resolve(response?.price ?? null);
    });
  });
}

// ─────────────────────────────────────────────
// Price Formatting
// ─────────────────────────────────────────────

/**
 * Format a USD price value for display.
 * @param {number|null} price - USD dollar value
 * @param {Object} [opts]
 * @param {boolean} [opts.showCents=true]  - Show cents if price < $100
 * @param {boolean} [opts.compact=false]   - Use compact notation (K/M)
 * @returns {string} e.g. "$42.50", "$1,234.00", "$1.2K"
 */
export function formatPrice(price, opts = {}) {
  if (price === null || price === undefined || isNaN(price)) return 'N/A';

  const { compact = false } = opts;

  if (compact && price >= 1000000) {
    return `$${(price / 1000000).toFixed(1)}M`;
  }
  if (compact && price >= 1000) {
    return `$${(price / 1000).toFixed(1)}K`;
  }

  // Standard USD formatting
  return new Intl.NumberFormat('en-US', {
    style:                 'currency',
    currency:              'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

/**
 * Format price for compact overlay badges.
 * Shows fewer decimals for high-value items.
 * @param {number|null} price
 * @returns {string}
 */
export function formatPriceBadge(price) {
  if (price === null || price === undefined) return '—';
  if (price === 0) return '$0.00';
  if (price >= 10000) return `$${Math.round(price / 1000)}K`;
  if (price >= 1000)  return `$${(price / 1000).toFixed(1)}K`;
  if (price >= 100)   return `$${Math.round(price)}`;
  return `$${price.toFixed(2)}`;
}

// ─────────────────────────────────────────────
// Market Link Generation
// ─────────────────────────────────────────────

/**
 * Generate a Buff163 listing URL for an item.
 * @param {string} marketHashName
 * @returns {string}
 */
export function getBuff163Url(marketHashName) {
  if (!marketHashName) return 'https://buff.163.com/market/csgo';
  const encoded = encodeURIComponent(marketHashName);
  return `https://buff.163.com/market/search?keyword=${encoded}&game=csgo`;
}

/**
 * Generate a Skinport listing URL for an item.
 * @param {string} marketHashName
 * @param {string|null} [itemPage] - Direct item page URL from Skinport API
 * @returns {string}
 */
export function getSkinportUrl(marketHashName, itemPage) {
  if (itemPage) return itemPage;
  if (!marketHashName) return 'https://skinport.com/market?app=730';
  const encoded = encodeURIComponent(marketHashName);
  return `https://skinport.com/market?app=730&search=${encoded}`;
}

/**
 * Get the appropriate market URL for an item based on current pricing mode.
 * @param {string} marketHashName
 * @param {Object} [priceEntry] - Price map entry for this item (may contain itemPage)
 * @returns {string}
 */
export function getMarketUrl(marketHashName, priceEntry) {
  if (_pricingMode === 'skinport') {
    return getSkinportUrl(marketHashName, priceEntry?.itemPage);
  }
  return getBuff163Url(marketHashName);
}

// ─────────────────────────────────────────────
// Inventory Value Calculation
// ─────────────────────────────────────────────

/**
 * Calculate total inventory value from an array of item objects.
 * @param {Array<{ marketHashName: string, quantity?: number }>} items
 * @returns {{ total: number, priced: number, unpriced: number }}
 */
export function calculateInventoryValue(items) {
  let total    = 0;
  let priced   = 0;
  let unpriced = 0;

  for (const item of items) {
    const qty   = item.quantity || 1;
    const price = lookupPrice(item.marketHashName || item.market_hash_name);

    if (price !== null) {
      total  += price * qty;
      priced += qty;
    } else {
      unpriced += qty;
    }
  }

  return { total, priced, unpriced };
}

/**
 * Calculate P&L for a trade offer.
 * @param {number} giveValue - Total USD value of items you're giving
 * @param {number} receiveValue - Total USD value of items you're receiving
 * @returns {{ diff: number, pct: number, label: string, color: string }}
 */
// Fix the function name (remove space in P&L)
export function calculateTradePNL(giveValue, receiveValue) {
  const diff  = receiveValue - giveValue;
  const pct   = giveValue > 0 ? (diff / giveValue) * 100 : 0;
  const sign  = diff >= 0 ? '+' : '';
  const color = diff >= 0 ? '#4ade80' : '#f87171';

  return {
    diff,
    pct,
    label: `${sign}${formatPrice(diff)} (${sign}${pct.toFixed(1)}%)`,
    color,
    isProfit: diff >= 0,
  };
}

// ─────────────────────────────────────────────
// Float Data Fetching (via background)
// ─────────────────────────────────────────────

/**
 * Fetch float data for a single item via background.js.
 * @param {string} assetid
 * @param {string} inspectLink
 * @returns {Promise<Object|null>}
 */
export async function fetchFloatData(assetid, inspectLink) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({
      action: 'GET_FLOAT',
      assetid,
      inspectLink,
    }, response => {
      if (chrome.runtime.lastError || response?.error) {
        resolve(null);
        return;
      }
      resolve(response?.data ?? null);
    });
  });
}

/**
 * Fetch float data for multiple items in a batch.
 * @param {Array<{ assetid: string, inspectLink: string }>} items
 * @returns {Promise<Object>} { [assetid]: { data, cached, error } }
 */
export async function fetchFloatDataBatch(items) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({
      action: 'GET_FLOATS_BATCH',
      items,
    }, response => {
      if (chrome.runtime.lastError || response?.error) {
        resolve({});
        return;
      }
      resolve(response?.results ?? {});
    });
  });
}

// ─────────────────────────────────────────────
// Settings access helper (for content scripts)
// ─────────────────────────────────────────────

/**
 * Load settings via background.js message.
 * @returns {Promise<Object>}
 */
export async function loadSettings() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'GET_SETTINGS' }, response => {
      if (chrome.runtime.lastError || !response?.settings) {
        resolve({
          showFloats:        true,
          showStickerPrices: true,
          showPatternBadges: true,
          showTradeLock:     true,
          pricingMode:       'skinport',
        });
        return;
      }
      resolve(response.settings);
    });
  });
}