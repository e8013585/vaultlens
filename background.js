/**
 * VaultLens — background.js (Service Worker)
 *
 * Responsibilities:
 *  - Central API fetch router (all external requests go through here)
 *  - Rate-limited request queue (max 3 concurrent, 300ms between batches)
 *  - Price cache management (1-hour TTL in chrome.storage.local)
 *  - Float/inspect data cache (indefinite TTL per assetid)
 *  - Message handler for content scripts and popup
 *  - Exponential backoff on 429 responses
 */

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const PRICE_CACHE_KEY      = 'vl_price_cache';
const PRICE_CACHE_TS_KEY   = 'vl_price_cache_ts';
const FLOAT_CACHE_KEY      = 'vl_float_cache';
const SETTINGS_KEY         = 'vl_settings';
const PRICE_CACHE_TTL_MS   = 60 * 60 * 1000; // 1 hour

const PRICEMPIRE_URL       = 'https://api.pricempire.com/v3/items/prices';
const SKINPORT_URL         = 'https://api.skinport.com/v1/items?app_id=730&currency=USD';
const CSGOFLOAT_API        = 'https://api.csgofloat.com/';
const CSFLOAT_LISTINGS_URL = 'https://csfloat.com/api/v1/listings';

// Max concurrent external requests
const MAX_CONCURRENT = 3;
// Delay between batch groups (ms)
const BATCH_DELAY_MS = 300;

// ─────────────────────────────────────────────
// Request Queue
// ─────────────────────────────────────────────

/**
 * Simple async request queue with concurrency limiting and
 * exponential backoff on HTTP 429 responses.
 */
class RequestQueue {
  constructor(maxConcurrent = MAX_CONCURRENT, batchDelay = BATCH_DELAY_MS) {
    this.maxConcurrent = maxConcurrent;
    this.batchDelay    = batchDelay;
    this.running       = 0;
    this.queue         = [];
  }

  /**
   * Enqueue a fetch task. Returns a Promise that resolves with the Response.
   * @param {string} url
   * @param {RequestInit} options
   * @param {number} retryCount - internal retry counter
   */
  enqueue(url, options = {}, retryCount = 0) {
    return new Promise((resolve, reject) => {
      this.queue.push({ url, options, retryCount, resolve, reject });
      this._drain();
    });
  }

  _drain() {
    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      const task = this.queue.shift();
      this.running++;
      this._execute(task);
    }
  }

  async _execute(task) {
    const { url, options, retryCount, resolve, reject } = task;
    try {
      // Respect batch delay
      if (this.batchDelay > 0) {
        await sleep(this.batchDelay);
      }

      const response = await fetch(url, options);

      // Handle rate limiting with exponential backoff
      if (response.status === 429) {
        const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s …
        if (retryCount < 3) {
          console.warn(`[VaultLens] 429 on ${url}, retrying in ${delay}ms`);
          await sleep(delay);
          // Re-enqueue with incremented retry count
          this.running--;
          const retried = await this.enqueue(url, options, retryCount + 1);
          resolve(retried);
          this._drain();
          return;
        } else {
          reject(new Error(`Rate limit exceeded after retries: ${url}`));
        }
      } else {
        resolve(response);
      }
    } catch (err) {
      reject(err);
    } finally {
      this.running--;
      this._drain();
    }
  }
}

const requestQueue = new RequestQueue();

/** Utility: sleep for ms milliseconds */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────
// Storage Helpers
// ─────────────────────────────────────────────

async function storageGet(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}

async function storageSet(obj) {
  return new Promise(resolve => chrome.storage.local.set(obj, resolve));
}

async function storageRemove(keys) {
  return new Promise(resolve => chrome.storage.local.remove(keys, resolve));
}

/** Load settings with defaults */
async function loadSettings() {
  const result = await storageGet([SETTINGS_KEY]);
  return Object.assign({
    pricingMode:      'skinport', // 'pricempire' | 'skinport'
    pricempireApiKey: '',
    showFloats:       true,
    showStickerPrices: true,
    showPatternBadges: true,
    showTradeLock:    true,
  }, result[SETTINGS_KEY] || {});
}

// ─────────────────────────────────────────────
// Price Fetching — PricEmpire
// ─────────────────────────────────────────────

/**
 * Fetch all CS2 prices from PricEmpire.
 * Returns a map: { [marketHashName]: { buff163: number, skinport: number, csFloat: number } }
 */
async function fetchPricEmpirePrices(apiKey) {
  if (!apiKey) throw new Error('PricEmpire API key not set');

  const url = `${PRICEMPIRE_URL}?api_key=${encodeURIComponent(apiKey)}&sources=buff163,skinport,csFloat&appId=730`;

  const response = await requestQueue.enqueue(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`PricEmpire fetch failed: HTTP ${response.status}`);
  }

  const data = await response.json();

  // PricEmpire v3 response shape:
  // { [marketHashName]: { buff163: { price: number }, skinport: { price: number }, ... } }
  const priceMap = {};
  for (const [name, sources] of Object.entries(data)) {
    priceMap[name] = {
      buff163:  sources?.buff163?.price  ?? null,
      skinport: sources?.skinport?.price ?? null,
      csFloat:  sources?.csFloat?.price  ?? null,
    };
  }

  return priceMap;
}

// ─────────────────────────────────────────────
// Price Fetching — Skinport
// ─────────────────────────────────────────────

/**
 * Fetch all CS2 prices from Skinport public API (no key required).
 * Returns a map: { [marketHashName]: { minPrice: number } }
 */
async function fetchSkinportPrices() {
  const response = await requestQueue.enqueue(SKINPORT_URL, {
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`Skinport fetch failed: HTTP ${response.status}`);
  }

  const items = await response.json();

  // Skinport returns an array of item objects
  const priceMap = {};
  for (const item of items) {
    if (item.market_hash_name) {
      priceMap[item.market_hash_name] = {
        minPrice:      item.min_price      ?? null,
        suggestedPrice: item.suggested_price ?? null,
        itemPage:      item.item_page       ?? null,
      };
    }
  }

  return priceMap;
}

// ─────────────────────────────────────────────
// Float / Inspect Data Fetching
// ─────────────────────────────────────────────

/**
 * Fetch float/pattern data from CSGOFloat public API.
 * @param {string} inspectLink - Steam inspect link
 * @returns {Object} { floatvalue, paintindex, paintseed, defindex, stickers, ... }
 */
async function fetchFloatData(inspectLink) {
  const url = `${CSGOFLOAT_API}?url=${encodeURIComponent(inspectLink)}`;

  const response = await requestQueue.enqueue(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`CSGOFloat fetch failed: HTTP ${response.status}`);
  }

  const data = await response.json();
  // CSGOFloat response: { iteminfo: { floatvalue, paintindex, paintseed, defindex, stickers, ... } }
  return data.iteminfo || data;
}

// ─────────────────────────────────────────────
// CSFloat Doppler Listing Fetch
// ─────────────────────────────────────────────

/**
 * Fetch CSFloat listings for a specific item + paint_index (Doppler phase).
 * @param {string} marketHashName
 * @param {number} paintIndex
 */
async function fetchCSFloatDopplerPrice(marketHashName, paintIndex) {
  const params = new URLSearchParams({
    market_hash_name: marketHashName,
    paint_index: paintIndex.toString(),
    limit: '10',
    sort_by: 'price',
    order: 'asc',
  });

  const url = `${CSFLOAT_LISTINGS_URL}?${params.toString()}`;

  const response = await requestQueue.enqueue(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  });

  if (!response.ok) return null;

  const data = await response.json();
  // Return lowest listed price
  if (data.data && data.data.length > 0) {
    return data.data[0].price / 100; // CSFloat prices are in cents
  }
  return null;
}

// ─────────────────────────────────────────────
// Cache Management
// ─────────────────────────────────────────────

/** Save price cache with current timestamp */
async function savePriceCache(priceMap) {
  await storageSet({
    [PRICE_CACHE_KEY]:    priceMap,
    [PRICE_CACHE_TS_KEY]: Date.now(),
  });
}

/** Load price cache; returns { priceMap, timestamp, expired } */
async function loadPriceCache() {
  const result = await storageGet([PRICE_CACHE_KEY, PRICE_CACHE_TS_KEY]);
  const priceMap  = result[PRICE_CACHE_KEY]    || null;
  const timestamp = result[PRICE_CACHE_TS_KEY] || 0;
  const expired   = (Date.now() - timestamp) > PRICE_CACHE_TTL_MS;
  return { priceMap, timestamp, expired };
}

/** Load float cache (indefinite TTL, keyed by assetid) */
async function loadFloatCache() {
  const result = await storageGet([FLOAT_CACHE_KEY]);
  return result[FLOAT_CACHE_KEY] || {};
}

/** Save a single float entry for assetid */
async function saveFloatEntry(assetid, data) {
  const cache = await loadFloatCache();
  cache[assetid] = data;
  await storageSet({ [FLOAT_CACHE_KEY]: cache });
}

/** Bulk save multiple float entries */
async function saveFloatEntries(entries) {
  const cache = await loadFloatCache();
  Object.assign(cache, entries);
  await storageSet({ [FLOAT_CACHE_KEY]: cache });
}

// ─────────────────────────────────────────────
// Message Handler
// ─────────────────────────────────────────────

/**
 * Central message router.
 * Content scripts and popup communicate with background via chrome.runtime.sendMessage.
 *
 * Supported actions:
 *  - GET_PRICES              → returns { priceMap, timestamp, mode }
 *  - FETCH_PRICES            → forces a fresh price fetch, saves cache
 *  - GET_FLOAT               → returns float data for one inspect link
 *  - GET_FLOATS_BATCH        → batch float fetch for array of { assetid, inspectLink }
 *  - GET_SETTINGS            → returns current settings
 *  - SAVE_SETTINGS           → saves settings object
 *  - CLEAR_CACHE             → clears price + float cache
 *  - GET_CACHE_STATS         → returns cache size info
 *  - FETCH_CSFLOAT_DOPPLER   → fetches CSFloat doppler price
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // All handlers are async; we return true to keep the message channel open
  handleMessage(message, sender)
    .then(sendResponse)
    .catch(err => sendResponse({ error: err.message }));
  return true;
});

async function handleMessage(message, sender) {
  const { action } = message;

  switch (action) {

    // ── GET_PRICES ──────────────────────────────
    case 'GET_PRICES': {
      const { priceMap, timestamp, expired } = await loadPriceCache();
      const settings = await loadSettings();

      // If cache is fresh, return immediately
      if (priceMap && !expired) {
        return { priceMap, timestamp, mode: settings.pricingMode, fresh: true };
      }

      // Cache expired or empty — fetch fresh in background, but return stale cache if available
      // (content scripts will get the stale data instantly, then receive a follow-up via storage events)
      if (priceMap) {
        // Return stale, refresh in background
        triggerBackgroundPriceFetch(settings).catch(console.error);
        return { priceMap, timestamp, mode: settings.pricingMode, fresh: false };
      }

      // No cache at all — must fetch synchronously
      const fresh = await triggerBackgroundPriceFetch(settings);
      const ts    = (await storageGet([PRICE_CACHE_TS_KEY]))[PRICE_CACHE_TS_KEY] || 0;
      return { priceMap: fresh, timestamp: ts, mode: settings.pricingMode, fresh: true };
    }

    // ── FETCH_PRICES (force refresh) ────────────
    case 'FETCH_PRICES': {
      const settings = await loadSettings();
      const priceMap = await triggerBackgroundPriceFetch(settings);
      const ts       = (await storageGet([PRICE_CACHE_TS_KEY]))[PRICE_CACHE_TS_KEY] || 0;
      return { priceMap, timestamp: ts, mode: settings.pricingMode };
    }

    // ── GET_FLOAT ────────────────────────────────
    case 'GET_FLOAT': {
      const { assetid, inspectLink } = message;

      // Check cache first
      const cache = await loadFloatCache();
      if (cache[assetid]) {
        return { data: cache[assetid], cached: true };
      }

      // Fetch from CSGOFloat
      const data = await fetchFloatData(inspectLink);
      await saveFloatEntry(assetid, data);
      return { data, cached: false };
    }

    // ── GET_FLOATS_BATCH ─────────────────────────
    case 'GET_FLOATS_BATCH': {
      const { items } = message; // [{ assetid, inspectLink }]
      const cache     = await loadFloatCache();
      const results   = {};
      const toFetch   = [];

      // Separate cached from uncached
      for (const item of items) {
        if (cache[item.assetid]) {
          results[item.assetid] = { data: cache[item.assetid], cached: true };
        } else {
          toFetch.push(item);
        }
      }

      // Fetch uncached items with concurrency limiting
      const newEntries = {};
      for (const item of toFetch) {
        try {
          const data = await fetchFloatData(item.inspectLink);
          results[item.assetid]    = { data, cached: false };
          newEntries[item.assetid] = data;
        } catch (err) {
          results[item.assetid] = { error: err.message };
        }
      }

      // Bulk-save new entries
      if (Object.keys(newEntries).length > 0) {
        await saveFloatEntries(newEntries);
      }

      return { results };
    }

    // ── GET_SETTINGS ─────────────────────────────
    case 'GET_SETTINGS': {
      const settings = await loadSettings();
      return { settings };
    }

    // ── SAVE_SETTINGS ────────────────────────────
    case 'SAVE_SETTINGS': {
      const { settings } = message;
      await storageSet({ [SETTINGS_KEY]: settings });
      return { ok: true };
    }

    // ── CLEAR_CACHE ──────────────────────────────
    case 'CLEAR_CACHE': {
      await storageRemove([PRICE_CACHE_KEY, PRICE_CACHE_TS_KEY, FLOAT_CACHE_KEY]);
      return { ok: true };
    }

    // ── GET_CACHE_STATS ──────────────────────────
    case 'GET_CACHE_STATS': {
      const { priceMap, timestamp } = await loadPriceCache();
      const floatCache = await loadFloatCache();
      return {
        priceEntries: priceMap ? Object.keys(priceMap).length : 0,
        floatEntries: Object.keys(floatCache).length,
        priceCacheTs: timestamp,
      };
    }

    // ── FETCH_CSFLOAT_DOPPLER ────────────────────
    case 'FETCH_CSFLOAT_DOPPLER': {
      const { marketHashName, paintIndex } = message;
      const price = await fetchCSFloatDopplerPrice(marketHashName, paintIndex);
      return { price };
    }

    default:
      return { error: `Unknown action: ${action}` };
  }
}

// ─────────────────────────────────────────────
// Background Price Fetch Helper
// ─────────────────────────────────────────────

/**
 * Perform a full price fetch based on current settings.
 * Saves result to cache and returns the priceMap.
 */
async function triggerBackgroundPriceFetch(settings) {
  let priceMap;

  if (settings.pricingMode === 'skinport') {
    priceMap = await fetchSkinportPrices();
  } else {
    // PricEmpire mode
    priceMap = await fetchPricEmpirePrices(settings.pricempireApiKey);
  }

  await savePriceCache(priceMap);
  return priceMap;
}

// ─────────────────────────────────────────────
// Startup: warm up price cache if stale
// ─────────────────────────────────────────────

async function onStartup() {
  try {
    const { expired, priceMap } = await loadPriceCache();
    if (!priceMap || expired) {
      const settings = await loadSettings();
      // Only auto-fetch if we have what we need
      if (settings.pricingMode === 'skinport' ||
         (settings.pricingMode === 'pricempire' && settings.pricempireApiKey)) {
        await triggerBackgroundPriceFetch(settings);
        console.log('[VaultLens] Price cache warmed on startup.');
      }
    }
  } catch (err) {
    console.warn('[VaultLens] Startup price fetch failed:', err.message);
  }
}

// Service worker lifecycle events
chrome.runtime.onInstalled.addListener(() => {
  console.log('[VaultLens] Extension installed/updated.');
  onStartup();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[VaultLens] Browser started.');
  onStartup();
});