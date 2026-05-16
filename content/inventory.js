 // VaultLens — content/inventory.js
 //
 // Main content script for Steam inventory pages.
 // Injected on: https://steamcommunity.com/id/*/inventory*
 //              https://steamcommunity.com/profiles/*/inventory*
 //
 // Responsibilities:
 //  1. Parse Steam's inventory data from the page
 //  2. Inject the VaultLens toolbar above the inventory grid
 //  3. Inject item overlay badges (price, float, exterior, pattern, trade lock)
 //  4. Handle sticker hover popups
 //  5. Inject profile button row (Copy SteamID, trade link, CSFloat stall, etc.)
 //  6. Manage IntersectionObserver-based lazy processing
 //  7. Multi-select mode
 //  8. Search + sort integration
 //  9. Clipboard export
 //
 // Architecture:
 //  - Uses Shadow DOM for all injected UI to prevent Steam CSS interference
 //  - IntersectionObserver processes visible items first
 //  - Float/pattern data fetched in batches of 10 via background.js
 //  - All prices served from module-level cache; refreshed on demand
 

// ─────────────────────────────────────────────
// IIFE wrapper — avoids polluting global scope
// (Content scripts share a JS context per page but not with page scripts)
// ─────────────────────────────────────────────
(async function VaultLensInventory() {
  'use strict';

  // ── Guard: only run once per page load ──────
  if (window.__vaultLensInventoryLoaded) return;
  window.__vaultLensInventoryLoaded = true;

  // ─────────────────────────────────────────────
  // Shadow DOM internal CSS
  // All overlay UI lives inside Shadow DOM roots.
  // ─────────────────────────────────────────────

  const SHADOW_STYLES = `
    :host { all: initial; font-family: 'Motiva Sans', -apple-system, BlinkMacSystemFont, sans-serif; }
    *, *::before, *::after { box-sizing: border-box; }

    .overlay {
      position: absolute;
      bottom: 0; left: 0; right: 0;
      padding: 3px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      align-items: flex-start;
      pointer-events: none;
      z-index: 10;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 5px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 600;
      line-height: 1.3;
      white-space: nowrap;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      pointer-events: all;
    }

    .price {
      background: rgba(0,0,0,0.85);
      color: #4ade80;
      cursor: pointer;
      text-decoration: none;
      font-weight: 700;
      font-size: 11px;
      transition: background 0.12s;
    }
    .price:hover { background: rgba(74,222,128,0.2); }

    .float-badge {
      background: rgba(0,0,0,0.75);
      color: #94a3b8;
      font-variant-numeric: tabular-nums;
    }
    .float-badge.low   { color: #4ade80; }
    .float-badge.ulow  { color: #fbbf24; font-weight: 700; }

    .exterior {
      font-weight: 700;
      letter-spacing: 0.05em;
    }
    .ext-FN { background: rgba(74,222,128,0.25);  color: #4ade80; }
    .ext-MW { background: rgba(134,239,172,0.2);  color: #86efac; }
    .ext-FT { background: rgba(251,191,36,0.2);   color: #fbbf24; }
    .ext-WW { background: rgba(249,115,22,0.2);   color: #f97316; }
    .ext-BS { background: rgba(248,113,113,0.2);  color: #f87171; }

    .pattern-badge {
      background: rgba(0,0,0,0.8);
      border: 1px solid currentColor;
      font-size: 10px;
    }

    .tradelock {
      background: rgba(127,29,29,0.85);
      color: #f87171;
      border: 1px solid #7f1d1d;
    }

    .dup-badge {
      position: absolute;
      top: 3px; right: 3px;
      background: rgba(249,115,22,0.9);
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      padding: 1px 4px;
      border-radius: 3px;
      pointer-events: none;
    }

    .rarity-glow {
      position: absolute;
      inset: 0;
      border-radius: 3px;
      pointer-events: none;
    }

    .skeleton {
      background: linear-gradient(90deg,#1a1d27 25%,#252836 50%,#1a1d27 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
      border-radius: 3px;
      display: inline-block;
    }
    @keyframes shimmer {
      0%   { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    .sticker-row {
      display: flex;
      gap: 2px;
      align-items: center;
      flex-wrap: wrap;
      pointer-events: all;
    }
    .sticker-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #94a3b8;
      cursor: pointer;
      transition: transform 0.12s;
    }
    .sticker-dot:hover { transform: scale(1.4); background: #fbbf24; }
    .sticker-dot.has-price { background: #4ade80; }
  `;

  // ─────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────

  /** @type {Object|null} Current price map */
  let priceMap      = null;
  /** @type {string} 'pricempire' | 'skinport' */
  let pricingMode   = 'skinport';
  /** @type {number} */
  let priceLoadedAt = 0;
  /** @type {Object} User settings */
  let settings      = {};
  /** @type {string} Owner's SteamID64 */
  let ownerSteamId  = '';
  /** @type {boolean} Is this the logged-in user's own inventory? */
  let isOwnInventory = false;
  /** @type {Map<string, Object>} assetid → float+pattern data */
  const floatCache  = new Map();
  /** @type {Map<string, Object>} assetid → enriched item data */
  const itemDataMap = new Map();
  /** @type {Set<string>} assetids currently being fetched */
  const fetchingSet = new Set();
  /** @type {Map<string, number>} marketHashName → duplicate count */
  let duplicateMap  = new Map();
  /** @type {Set<string>} Selected assetids (multi-select mode) */
  const selectedItems = new Set();
  /** @type {boolean} */
  let multiSelectMode = false;
  /** @type {string} Current search query */
  let searchQuery   = '';
  /** @type {string} Current sort mode */
  let sortMode      = 'default';
  /** @type {IntersectionObserver|null} */
  let observer      = null;
  /** @type {HTMLElement|null} Toolbar DOM reference */
  let toolbarEl     = null;
  /** @type {HTMLElement|null} Sticker popup element */
  let stickerPopup  = null;

  // ─────────────────────────────────────────────
  // Utility helpers
  // ─────────────────────────────────────────────

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  function escapeHtml(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatPrice(price) {
    if (price === null || price === undefined || isNaN(price)) return null;
    if (price >= 10000) return `$${Math.round(price / 1000)}K`;
    if (price >= 1000)  return `$${(price / 1000).toFixed(1)}K`;
    if (price >= 100)   return `$${Math.round(price)}`;
    return `$${Number(price).toFixed(2)}`;
  }

  function formatFloat(f) {
    if (f === null || f === undefined) return null;
    if (f < 0.001) return f.toFixed(6);
    return f.toFixed(4);
  }

  /** Send a message to background.js */
  function bgMessage(msg) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(msg, response => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response?.error) {
          reject(new Error(response.error));
          return;
        }
        resolve(response);
      });
    });
  }

  /** Show a toast notification */
  function showToast(message, type = 'info', duration = 2500) {
    const existing = document.querySelector('.vl-toast-container');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `vl-toast-container vl-toast vl-toast--${type}`;
    toast.style.cssText = `
      position:fixed; bottom:24px; right:24px; z-index:999999;
      background:#0f1117; border:1px solid #2a2d3a; border-radius:8px;
      padding:12px 16px; font-size:13px; color:#e2e8f0;
      font-family:'Motiva Sans',-apple-system,sans-serif;
      box-shadow:0 8px 32px rgba(0,0,0,0.6);
      display:flex; align-items:center; gap:10px; max-width:320px;
      animation:vl-toast-in 0.25s ease; pointer-events:none;
    `;

    const borderColor = type === 'success' ? '#4ade80'
                      : type === 'error'   ? '#f87171'
                      : '#f97316';
    toast.style.borderLeft = `3px solid ${borderColor}`;

    const icon = type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ';
    toast.innerHTML = `<span style="color:${borderColor};font-weight:700">${icon}</span> ${escapeHtml(message)}`;

    // Inject keyframe if not already present
    if (!document.querySelector('#vl-toast-style')) {
      const s = document.createElement('style');
      s.id = 'vl-toast-style';
      s.textContent = `@keyframes vl-toast-in { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }`;
      document.head.appendChild(s);
    }

    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
  }

  // ─────────────────────────────────────────────
  // Steam Page Data Extraction
  // ─────────────────────────────────────────────

  /**
   * Extract the inventory owner's SteamID64 from the page.
   * Steam embeds g_steamID or similar globals, or we parse from URL/page elements.
   */
  function extractOwnerSteamId() {
    // Method 1: Steam global variable
    if (typeof window.g_steamID !== 'undefined') return window.g_steamID;

    // Method 2: Parse from profile page meta or data attributes
    const profileEl = document.querySelector('[data-steamid]');
    if (profileEl) return profileEl.dataset.steamid;

    // Method 3: Parse from URL — /profiles/{steamid}/
    const profileMatch = location.pathname.match(/\/profiles\/(\d{17})/);
    if (profileMatch) return profileMatch[1];

    // Method 4: Try Steam's g_rgProfileData
    try {
      if (window.g_rgProfileData && window.g_rgProfileData.steamid) {
        return window.g_rgProfileData.steamid;
      }
    } catch {}

    // Method 5: Look for steamid in page script tags
    const scripts = document.querySelectorAll('script:not([src])');
    for (const script of scripts) {
      const match = script.textContent.match(/"steamid"\s*:\s*"(\d{17})"/);
      if (match) return match[1];
    }

    return '';
  }

  /**
   * Detect if this is the logged-in user's own inventory.
   * Checks URL for /id/me/ or if the steamid matches stored login.
   */
  async function detectOwnInventory(steamId) {
    if (location.pathname.includes('/id/me/')) return true;

    try {
      // Check if the stored login steamid matches the page's steamid
      const result = await new Promise(resolve =>
        chrome.storage.local.get(['vl_own_steamid'], resolve)
      );
      if (result.vl_own_steamid && result.vl_own_steamid === steamId) return true;

      // Try to detect from Steam's loginstate
      if (window.g_AccountID) {
        // g_AccountID is the 32-bit version; steamid64 = 76561197960265728 + g_AccountID
        const computed = (BigInt(76561197960265728) + BigInt(window.g_AccountID)).toString();
        if (computed === steamId) {
          // Cache for future
          chrome.storage.local.set({ vl_own_steamid: steamId });
          return true;
        }
      }
    } catch {}

    return false;
  }

  /**
   * Generate a Steam trade offer URL for the owner.
   * Requires the user's trade token (stored or available on their profile page).
   */
  function getTradeLink(steamId) {
    // Try to get trade token from the page (only visible on own profile)
    const tokenEl = document.querySelector('input[id*="trade_offer_access_url"]');
    if (tokenEl) {
      return tokenEl.value || `https://steamcommunity.com/tradeoffer/new/?partner=${steamId}`;
    }
    return `https://steamcommunity.com/profiles/${steamId}/tradeoffers/privacy`;
  }

  /**
   * Extract raw inventory items from Steam's JavaScript globals.
   * Steam stores inventory data in g_ActiveInventory or similar.
   * We also read from the inventory DOM elements directly.
   */
  function extractInventoryItems() {
    const items = [];

    // Method 1: Steam's g_ActiveInventory global
    try {
      if (window.g_ActiveInventory && window.g_ActiveInventory.m_rgAssets) {
        for (const [assetid, asset] of Object.entries(window.g_ActiveInventory.m_rgAssets)) {
          const desc = window.g_ActiveInventory.m_rgDescsByAsset?.[assetid];
          if (desc) {
            items.push({ ...asset, ...desc, assetid });
          }
        }
        if (items.length > 0) return items;
      }
    } catch {}

    // Method 2: Parse from DOM item elements
    // Steam renders items as <div class="item ..."> with data attributes
    const itemEls = document.querySelectorAll(
      '.inventory_item_link, .itemHolder .item[id^="item"]'
    );

    for (const el of itemEls) {
      try {
        // Steam item IDs are like "item_{appid}_{contextid}_{assetid}"
        const idParts = (el.id || '').split('_');
        if (idParts.length >= 4) {
          const assetid = idParts[idParts.length - 1];
          items.push({
            assetid,
            element: el,
            name: el.querySelector('.item_name')?.textContent?.trim() || '',
          });
        }
      } catch {}
    }

    return items;
  }

  /**
   * Extract full item description from Steam's inventory description map.
   * This gives us market_hash_name, tags (rarity, exterior), inspect links, etc.
   */
  function getItemDescription(assetid) {
    try {
      // Try Steam's global inventory data structures
      if (window.g_ActiveInventory) {
        const inv = window.g_ActiveInventory;

        // m_rgDescsByAsset maps assetid → description
        if (inv.m_rgDescsByAsset?.[assetid]) {
          return inv.m_rgDescsByAsset[assetid];
        }

        // Try assets map
        const asset = inv.m_rgAssets?.[assetid];
        if (asset) {
          const key = `${asset.classid}_${asset.instanceid}`;
          return inv.m_rgDescriptions?.[key] || null;
        }
      }
    } catch {}
    return null;
  }

  /**
   * Get all inventory item DOM elements from the currently active page/tab.
   * Steam uses a paginated inventory — returns items from the active tab.
   */
  function getInventoryItemElements() {
    // Steam's inventory items are in #inventories > .inventory_ctn
    // Each item is a .itemHolder containing a .item element
    return Array.from(document.querySelectorAll(
      '#inventories .itemHolder, .inventory_ctn .itemHolder'
    ));
  }

  // ─────────────────────────────────────────────
  // Price Lookup
  // ─────────────────────────────────────────────

  function lookupPrice(marketHashName) {
    if (!priceMap || !marketHashName) return null;
    const entry = priceMap[marketHashName];
    if (!entry) return null;

    if (pricingMode === 'skinport') {
      return entry.minPrice ?? null;
    }
    // PricEmpire: default to buff163
    return entry.buff163 ?? entry.skinport ?? entry.csFloat ?? null;
  }

  function getMarketUrl(marketHashName) {
    const encoded = encodeURIComponent(marketHashName || '');
    if (pricingMode === 'skinport') {
      const entry = priceMap?.[marketHashName];
      if (entry?.itemPage) return entry.itemPage;
      return `https://skinport.com/market?app=730&search=${encoded}`;
    }
    return `https://buff.163.com/market/search?keyword=${encoded}&game=csgo`;
  }

  // ─────────────────────────────────────────────
  // Float / Inspect Link Handling
  // ─────────────────────────────────────────────

  /**
   * Extract the inspect link for an item, substituting owner steamid + assetid.
   */
  function extractInspectLink(desc, assetid) {
    if (!desc) return null;
    const actions = desc.actions || desc.market_actions || [];
    const action  = actions.find(a => a.link?.includes('csgo_econ_action_preview'));
    if (!action) return null;

    let link = action.link;
    link = link.replace('%owner_steamid%', ownerSteamId || '');
    link = link.replace('%assetid%', assetid || '');
    return link.startsWith('steam://') ? link : null;
  }

  /**
   * Fetch float + pattern data for a batch of items.
   * Groups uncached items and sends to background.js.
   * @param {Array<{ assetid: string, inspectLink: string }>} items
   */
  async function fetchFloatBatch(items) {
    if (!items || items.length === 0) return;

    // Filter out already cached or in-flight
    const toFetch = items.filter(
      i => i.inspectLink && !floatCache.has(i.assetid) && !fetchingSet.has(i.assetid)
    );
    if (toFetch.length === 0) return;

    // Mark as in-flight
    toFetch.forEach(i => fetchingSet.add(i.assetid));

    try {
      const response = await bgMessage({
        action: 'GET_FLOATS_BATCH',
        items:  toFetch,
      });

      const results = response?.results || {};
      for (const [assetid, result] of Object.entries(results)) {
        fetchingSet.delete(assetid);
        if (result.data) {
          floatCache.set(assetid, result.data);
          // Re-render this item's overlay with float data
          updateItemOverlay(assetid);
        }
      }
    } catch (err) {
      console.warn('[VaultLens] Float batch fetch error:', err.message);
      toFetch.forEach(i => fetchingSet.delete(i.assetid));
    }
  }

  // ─────────────────────────────────────────────
  // Exterior / Rarity Helpers
  // ─────────────────────────────────────────────

  const EXTERIOR_RANGES = [
    { label: 'FN', min: 0.00, max: 0.07 },
    { label: 'MW', min: 0.07, max: 0.15 },
    { label: 'FT', min: 0.15, max: 0.38 },
    { label: 'WW', min: 0.38, max: 0.45 },
    { label: 'BS', min: 0.45, max: 1.00 },
  ];

  function getExteriorLabel(floatVal) {
    for (const r of EXTERIOR_RANGES) {
      if (floatVal >= r.min && (floatVal < r.max || r.label === 'BS')) return r.label;
    }
    return null;
  }

  const RARITY_COLORS = {
    'Consumer Grade':  '#b0c3d9',
    'Industrial Grade':'#5e98d9',
    'Mil-Spec Grade':  '#4b69ff',
    'Restricted':      '#8847ff',
    'Classified':      '#d32ce6',
    'Covert':          '#eb4b4b',
    'Extraordinary':   '#e4ae39',
    'Contraband':      '#e4ae39',
  };

  function getRarityColor(desc) {
    if (!desc?.tags) return '#b0c3d9';
    for (const tag of desc.tags) {
      if (tag.category === 'Rarity' || tag.category_name === 'Quality') {
        const name = tag.localized_tag_name || tag.name || '';
        if (RARITY_COLORS[name]) return RARITY_COLORS[name];
        const iname = tag.internal_name || '';
        if (iname.includes('Ancient'))    return RARITY_COLORS['Covert'];
        if (iname.includes('Legendary'))  return RARITY_COLORS['Classified'];
        if (iname.includes('Mythical'))   return RARITY_COLORS['Restricted'];
        if (iname.includes('Rare'))       return RARITY_COLORS['Mil-Spec Grade'];
        if (iname.includes('Uncommon'))   return RARITY_COLORS['Industrial Grade'];
        if (iname.includes('Common'))     return RARITY_COLORS['Consumer Grade'];
      }
    }
    const name = desc?.market_hash_name || '';
    if (name.startsWith('★')) return RARITY_COLORS['Extraordinary'];
    return '#b0c3d9';
  }

  // ─────────────────────────────────────────────
  // Pattern Analysis (inline — avoids ES module import issues in content scripts)
  // ─────────────────────────────────────────────

  // Doppler phase map
  const DOPPLER_PHASES = {
    415: { phase: 'Phase 1',    color: '#6ab0de', rarity: 'common'   },
    416: { phase: 'Phase 2',    color: '#c96bde', rarity: 'common'   },
    417: { phase: 'Phase 3',    color: '#7b68de', rarity: 'uncommon' },
    418: { phase: 'Phase 4',    color: '#3a5f8a', rarity: 'rare'     },
    419: { phase: 'Ruby',       color: '#c0392b', rarity: 'special'  },
    420: { phase: 'Sapphire',   color: '#2980b9', rarity: 'special'  },
    421: { phase: 'Black Pearl',color: '#2c2c54', rarity: 'special'  },
    568: { phase: 'Gamma P1',   color: '#7dde6a', rarity: 'common'   },
    569: { phase: 'Gamma P2',   color: '#6adec3', rarity: 'common'   },
    570: { phase: 'Gamma P3',   color: '#6aa5de', rarity: 'uncommon' },
    571: { phase: 'Gamma P4',   color: '#9b6ade', rarity: 'rare'     },
    572: { phase: 'Emerald',    color: '#00c853', rarity: 'special'  },
  };

  // Blue gem seeds (compact inline version)
  const AK47_BLUE_GEMS  = new Set([179,503,664,670,555,321,561,228,760,380,956,387,269,638,592,910,88,451,777]);
  const FN57_BLUE_GEMS  = new Set([661,277,923,363,592,171,614,940,815,433,888]);
  const KARAM_BLUE_GEMS = new Set([387,442,809,670,228,321,955,760,503,269,451,592,177]);

  // Marble fade pattern seeds (compact)
  const MARBLE_FIRE_ICE = {
    'm9 bayonet':  new Set([268,983,412,697,127,841,556,271,786,501]),
    'karambit':    new Set([412,127,697,841,556,271,786,501,216,931]),
    'bayonet':     new Set([268,983,412,697,127,841,556,271,786,501]),
  };
  const MARBLE_MAX_PINK = {
    'bayonet':     new Set([26,736,451,160,871,580,295,4,714,429]),
    'm9 bayonet':  new Set([873,588,303,18,728,443,158,868,583,298]),
    'karambit':    new Set([26,736,451,166,876,591,306,21,731,446]),
    'flip knife':  new Set([160,445,875,590,305]),
  };
  const MARBLE_MAX_BLUE = {
    'bayonet':     new Set([670,955,384,99,809,524,239,948,663,378]),
    'm9 bayonet':  new Set([452,737,167,877,592,307,22,732,447,162]),
    'karambit':    new Set([670,955,384,99,814,529,244,959,674,389]),
    'flip knife':  new Set([526,241,956,671,386]),
  };

  // Crimson web seeds (approximate, ±5 tolerance)
  const CW_DOUBLE = {
    'karambit':    [4,106,109,210,313,416,519,622,725,828,931],
    'm9 bayonet':  [7,110,213,316,419,522,625,728,831,934],
    'bayonet':     [3,106,209,312,415,518,621,724,827,930],
    'flip knife':  [9,112,215,318,421,524,627,730,833,936],
    'gut knife':   [5,108,211,314,417,520,623,726,829,932],
  };
  const CW_CENTER = {
    'karambit':    [52,155,258,361,464,567,670,773,876,979],
    'm9 bayonet':  [58,161,264,367,470,573,676,779,882,985],
    'bayonet':     [54,157,260,363,466,569,672,775,878,981],
    'flip knife':  [60,163,266,369,472,575,678,781,884,987],
    'gut knife':   [56,159,262,365,468,571,674,777,880,983],
  };

  /** Get weapon prefix from market hash name */
  function extractWeapon(mhn) {
    return (mhn || '').replace(/^★\s*/, '').split(' | ')[0].trim().toLowerCase();
  }

  /** Detect all pattern badges for an item given its float data */
  function detectPatterns(marketHashName, floatData) {
    if (!floatData || !settings.showPatternBadges) return [];

    const mhn        = marketHashName || '';
    const mhnLower   = mhn.toLowerCase();
    const weapon     = extractWeapon(mhn);
    const { paintseed, paintindex } = floatData;
    const badges     = [];

    // ── Doppler phase ────────────────────────────
    if (mhnLower.includes('doppler')) {
      const phase = DOPPLER_PHASES[paintindex];
      if (phase) {
        badges.push({
          label:    phase.phase,
          color:    phase.color,
          priority: phase.rarity === 'special' ? 90 : phase.rarity === 'rare' ? 50 : 20,
        });
      }
    }

    // ── Blue Gem ─────────────────────────────────
    if (mhnLower.includes('case hardened')) {
      let isBlueGem = false;
      let tier = 3;

      if (weapon === 'ak-47' && AK47_BLUE_GEMS.has(paintseed)) {
        isBlueGem = true;
        tier = paintseed === 179 || paintseed === 503 ? 1 :
               paintseed === 664 || paintseed === 670 || paintseed === 555 ? 1 : 2;
      } else if (weapon === 'five-seven' && FN57_BLUE_GEMS.has(paintseed)) {
        isBlueGem = true;
        tier = paintseed === 661 ? 1 : paintseed === 277 || paintseed === 923 ? 1 : 2;
      } else if (weapon === 'karambit' && KARAM_BLUE_GEMS.has(paintseed)) {
        isBlueGem = true;
        tier = paintseed === 387 || paintseed === 442 ? 1 : 2;
      }

      if (isBlueGem) {
        const isScar = weapon === 'five-seven' && paintseed === 661;
        const color  = tier === 1 ? '#1d4ed8' : tier === 2 ? '#3b82f6' : '#93c5fd';
        badges.push({
          label:    isScar ? '⭐ Scar' : `Tier ${tier} Blue Gem`,
          color,
          priority: isScar ? 100 : (4 - tier) * 25,
        });
      }
    }

    // ── Marble Fade patterns ──────────────────────
    if (mhnLower.includes('marble fade')) {
      const fiMap  = MARBLE_FIRE_ICE[weapon];
      const pmMap  = MARBLE_MAX_PINK[weapon];
      const bmMap  = MARBLE_MAX_BLUE[weapon];

      if (fiMap?.has(paintseed)) {
        badges.push({ label: 'Fire & Ice', color: '#60a5fa', priority: 70 });
      } else if (pmMap?.has(paintseed)) {
        badges.push({ label: 'Max Pink',   color: '#f472b6', priority: 60 });
      } else if (bmMap?.has(paintseed)) {
        badges.push({ label: 'Max Blue',   color: '#3b82f6', priority: 55 });
      }
    }

    // ── Crimson Web ───────────────────────────────
    if (mhnLower.includes('crimson web')) {
      const dwSeeds = CW_DOUBLE[weapon] || [];
      const cwSeeds = CW_CENTER[weapon] || [];
      const TOL     = 5;

      if (dwSeeds.some(s => Math.abs(s - paintseed) <= TOL)) {
        badges.push({ label: 'Double Web', color: '#dc2626', priority: 80 });
      } else if (cwSeeds.some(s => Math.abs(s - paintseed) <= TOL)) {
        badges.push({ label: 'Center Web', color: '#f97316', priority: 40 });
      }
    }

    // ── Fade % ────────────────────────────────────
    if (mhnLower.includes('| fade')) {
      const fade = estimateFade(weapon, paintseed);
      if (fade !== null) {
        const isGold = fade >= 98;
        badges.push({
          label:    isGold ? `${fade.toFixed(1)}% ✦` : `${fade.toFixed(1)}%`,
          color:    isGold ? '#ffd700' : fade >= 95 ? '#f97316' : '#94a3b8',
          priority: isGold ? 88 : Math.floor(fade),
          isFade:   true,
        });
      }
    }

    return badges.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Estimate fade % for a weapon+seed combo using a simplified linear model.
   * (Full tables live in data/fadeWeapons.js; this is the content-script inline version)
   */
  function estimateFade(weapon, seed) {
    if (seed === null || seed === undefined) return null;
    // Simplified: fade decreases linearly from 100% at seed 0 to ~50% at seed 500+
    // This matches the general curve; full accuracy requires the complete table.
    const normalized = Math.min(seed, 500) / 500;
    const fade       = 100 - normalized * 50;
    return Math.round(fade * 10) / 10;
  }

  // ─────────────────────────────────────────────
  // Trade Lock Detection
  // ─────────────────────────────────────────────

  function parseTradeLock(desc) {
    if (!desc) return { locked: false };
    if (desc.tradable === 1) return { locked: false };

    const allDesc = [...(desc.descriptions || []), ...(desc.owner_descriptions || [])];
    for (const d of allDesc) {
      const v = d.value || '';
      // "Tradable After: Apr 17, 2024 (7 days)"
      const afterMatch = v.match(/Tradable After:\s*(.+)/i);
      if (afterMatch) {
        const date = new Date(afterMatch[1].trim());
        if (!isNaN(date.getTime())) {
          const days = Math.max(0, Math.ceil((date - Date.now()) / 86400000));
          return { locked: days > 0, daysRemaining: days, unlockDate: date };
        }
      }
      const daysMatch = v.match(/(\d+)\s+day/i);
      if (daysMatch) {
        const days = parseInt(daysMatch[1], 10);
        return { locked: true, daysRemaining: days };
      }
      if (v.toLowerCase().includes('not tradable')) {
        return { locked: true, daysRemaining: null };
      }
    }

    if (desc.tradable === 0) return { locked: true, daysRemaining: null };
    return { locked: false };
  }

  function formatTradeLock(tl) {
    if (!tl?.locked) return null;
    if (tl.daysRemaining === null) return '🔒 Locked';
    if (tl.daysRemaining === 0)    return '🔒 Today';
    if (tl.daysRemaining === 1)    return '🔒 1 day';
    return `🔒 ${tl.daysRemaining} days`;
  }

  // ─────────────────────────────────────────────
  // Sticker Parsing
  // ─────────────────────────────────────────────

  function parseStickers(floatData) {
    const stickers = floatData?.stickers || [];
    return stickers.map(s => {
      const marketName = s.name ? `Sticker | ${s.name}` : null;
      let price = null;
      if (marketName && priceMap?.[marketName]) {
        const entry = priceMap[marketName];
        price = pricingMode === 'skinport'
          ? entry.minPrice
          : entry.buff163 ?? entry.skinport;
      }
      return {
        name:     s.name || 'Unknown Sticker',
        slot:     s.slot ?? -1,
        wear:     s.wear ?? 0,
        price,
        imageUrl: s.imageurl || '',
        marketName,
      };
    });
  }

  function calcStickerTotal(stickers) {
    return stickers.reduce((sum, s) => sum + (s.price || 0), 0);
  }

  // ─────────────────────────────────────────────
  // Shadow DOM Overlay Builder
  // ─────────────────────────────────────────────

  /**
   * Create or update the Shadow DOM overlay for an inventory item holder.
   * @param {HTMLElement} holder  - The .itemHolder element
   * @param {string}      assetid
   * @param {Object}      desc    - Steam item description
   * @param {Object|null} floatData - CSGOFloat API data (may be null if not yet fetched)
   */
  function buildOverlay(holder, assetid, desc, floatData) {
    // Ensure the holder is position:relative for absolute children
    const existingStyle = holder.getAttribute('style') || '';
    if (!existingStyle.includes('position')) {
      holder.style.position = 'relative';
    }

    // ── Find or create shadow host ───────────────
    let shadowHost = holder.querySelector('.vl-item-shadow-host');
    let shadow;

    if (!shadowHost) {
      shadowHost = document.createElement('div');
      shadowHost.className   = 'vl-item-shadow-host';
      shadowHost.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:50;';
      holder.appendChild(shadowHost);

      shadow = shadowHost.attachShadow({ mode: 'open' });
      const styleEl = document.createElement('style');
      styleEl.textContent = SHADOW_STYLES;
      shadow.appendChild(styleEl);
    } else {
      shadow = shadowHost.shadowRoot;
      // Clear existing overlay content (keep the style element)
      const toRemove = Array.from(shadow.children).filter(c => c.tagName !== 'STYLE');
      toRemove.forEach(c => c.remove());
    }

    const mhn   = desc?.market_hash_name || '';
    const price = lookupPrice(mhn);

    // ── Rarity glow ──────────────────────────────
    const rarityColor = getRarityColor(desc);
    const glowEl      = document.createElement('div');
    glowEl.className  = 'rarity-glow';
    glowEl.style.cssText = `box-shadow: inset 0 0 0 2px ${rarityColor}55, 0 0 8px ${rarityColor}22;`;
    shadow.appendChild(glowEl);

    // ── Duplicate badge ───────────────────────────
    const dupCount = duplicateMap.get(mhn) || 1;
    if (dupCount > 1) {
      const dupEl      = document.createElement('div');
      dupEl.className  = 'dup-badge';
      dupEl.textContent = `×${dupCount}`;
      shadow.appendChild(dupEl);
    }

    // ── Main overlay ─────────────────────────────
    const overlay    = document.createElement('div');
    overlay.className = 'overlay';

    // Price badge
    if (price !== null) {
      const priceEl       = document.createElement('a');
      priceEl.className   = 'badge price';
      priceEl.textContent = formatPrice(price) || 'N/A';
      priceEl.href        = getMarketUrl(mhn);
      priceEl.target      = '_blank';
      priceEl.rel         = 'noopener noreferrer';
      priceEl.style.pointerEvents = 'all';
      overlay.appendChild(priceEl);
    } else {
      // Skeleton loader if prices are still loading
      if (!priceMap) {
        const skeletonEl      = document.createElement('span');
        skeletonEl.className  = 'skeleton';
        skeletonEl.style.cssText = 'width:42px;height:14px;';
        overlay.appendChild(skeletonEl);
      }
    }

    // Float badge + exterior pill
    if (floatData?.floatvalue !== undefined) {
      const fv     = floatData.floatvalue;
      const extLbl = getExteriorLabel(fv);

      // Float value
      if (settings.showFloats !== false) {
        const floatEl      = document.createElement('span');
        const isLow        = fv < 0.001;
        const isNearLow    = fv < (extLbl === 'FN' ? 0.01 : extLbl === 'MW' ? 0.08 : 999);
        floatEl.className  = `badge float-badge${isLow ? ' ulow' : isNearLow ? ' low' : ''}`;
        floatEl.textContent = formatFloat(fv);
        overlay.appendChild(floatEl);

        // Exterior pill
        if (extLbl) {
          const extEl      = document.createElement('span');
          extEl.className  = `badge exterior ext-${extLbl}`;
          extEl.textContent = extLbl;
          overlay.appendChild(extEl);
        }
      }

      // Pattern badges
      const patterns = detectPatterns(mhn, floatData);
      for (const p of patterns.slice(0, 2)) { // Max 2 pattern badges per item
        const pEl       = document.createElement('span');
        pEl.className   = 'badge pattern-badge';
        pEl.style.color = p.color;
        pEl.textContent = p.label;
        overlay.appendChild(pEl);
      }

      // Sticker indicator dots
      if (settings.showStickerPrices !== false) {
        const stickers = parseStickers(floatData);
        if (stickers.length > 0) {
          const stickerRow   = document.createElement('div');
          stickerRow.className = 'sticker-row';
          stickerRow.dataset.assetid = assetid;

          for (let i = 0; i < stickers.length; i++) {
            const dot     = document.createElement('div');
            dot.className = `sticker-dot${stickers[i].price ? ' has-price' : ''}`;
            dot.dataset.slot = i;
            stickerRow.appendChild(dot);
          }

          // Store sticker data for popup use
          stickerRow.dataset.stickers = JSON.stringify(stickers);
          stickerRow.style.pointerEvents = 'all';

          // Hover events for sticker popup
          stickerRow.addEventListener('mouseenter', (e) => {
            showStickerPopup(e, stickers, mhn);
          });
          stickerRow.addEventListener('mouseleave', () => {
            hideStickerPopup();
          });

          overlay.appendChild(stickerRow);
        }
      }
    } else if (floatData === null && !fetchingSet.has(assetid)) {
      // Float data failed to load — show nothing (item may not be inspectable)
    } else if (!floatData) {
      // Still loading
      if (settings.showFloats !== false) {
        const skF      = document.createElement('span');
        skF.className  = 'skeleton';
        skF.style.cssText = 'width:50px;height:11px;';
        overlay.appendChild(skF);
      }
    }

    // Trade lock badge
    if (settings.showTradeLock !== false) {
      const tl = parseTradeLock(desc);
      if (tl.locked) {
        const tlLabel = formatTradeLock(tl);
        if (tlLabel) {
          const tlEl       = document.createElement('span');
          tlEl.className   = 'badge tradelock';
          tlEl.textContent = tlLabel;
          overlay.appendChild(tlEl);
        }
      }
    }

    shadow.appendChild(overlay);

    // ── Multi-select visual ───────────────────────
    if (multiSelectMode && selectedItems.has(assetid)) {
      shadowHost.style.outline = '2px solid #f97316';
      shadowHost.style.outlineOffset = '1px';
    } else {
      shadowHost.style.outline = '';
    }
  }

  /**
   * Update overlay for a specific assetid after float data arrives.
   */
  function updateItemOverlay(assetid) {
    const data = itemDataMap.get(assetid);
    if (!data) return;

    const floatData = floatCache.get(assetid) || null;
    buildOverlay(data.holder, assetid, data.desc, floatData);

    // Update enriched item data for sorting
    if (floatData) {
      data.floatValue   = floatData.floatvalue ?? null;
      data.stickerValue = calcStickerTotal(parseStickers(floatData));
    }

    updateToolbarStats();
  }

  // ─────────────────────────────────────────────
  // Sticker Popup
  // ─────────────────────────────────────────────

  function createStickerPopup() {
    if (stickerPopup) return;
    stickerPopup           = document.createElement('div');
    stickerPopup.className = 'vl-sticker-popup';
    stickerPopup.style.cssText = `
      position:fixed; z-index:999999;
      background:#0f1117; border:1px solid #2a2d3a; border-radius:8px;
      padding:10px 12px; min-width:200px; max-width:280px;
      box-shadow:0 8px 32px rgba(0,0,0,0.7);
      font-family:'Motiva Sans',-apple-system,sans-serif;
      pointer-events:none; opacity:0; transition:opacity 0.12s ease;
      font-size:12px; color:#e2e8f0;
    `;
    document.body.appendChild(stickerPopup);
  }

  function showStickerPopup(event, stickers, itemName) {
    createStickerPopup();

    const total = calcStickerTotal(stickers);
    const rows  = stickers.map(s => `
      <div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid #1a1d27;">
        ${s.imageUrl ? `<img src="${escapeHtml(s.imageUrl)}" style="width:32px;height:24px;object-fit:contain;" onerror="this.style.display='none'">` : ''}
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;">${escapeHtml(s.name)}</span>
        <span style="font-size:11px;font-weight:700;color:${s.price ? '#4ade80' : '#4b5563'}">
          ${s.price ? formatPrice(s.price) : 'N/A'}
        </span>
      </div>
    `).join('');

    stickerPopup.innerHTML = `
      <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">
        Stickers
      </div>
      ${rows}
      ${total > 0 ? `
        <div style="display:flex;justify-content:space-between;margin-top:8px;padding-top:8px;border-top:1px solid #2a2d3a;font-weight:700;">
          <span>Total Sticker Value</span>
          <span style="color:#fbbf24">${formatPrice(total)}</span>
        </div>
      ` : ''}
    `;

    // Position near mouse
    const x = Math.min(event.clientX + 12, window.innerWidth  - 300);
    const y = Math.min(event.clientY + 12, window.innerHeight - 200);
    stickerPopup.style.left    = `${x}px`;
    stickerPopup.style.top     = `${y}px`;
    stickerPopup.style.opacity = '1';
  }

  function hideStickerPopup() {
    if (stickerPopup) {
      stickerPopup.style.opacity = '0';
    }
  }

  // ─────────────────────────────────────────────
  // Profile Button Row
  // ─────────────────────────────────────────────

  function injectProfileButtons() {
    if (!ownerSteamId) return;

    // Avoid duplicate injection
    if (document.querySelector('.vl-profile-row')) return;

    // Find the profile header area
    const profileHeader = document.querySelector(
      '.profile_header_actions, .profile_summary_header, .playerAvatarAutoSizeInner'
    );
    if (!profileHeader) return;

    const row      = document.createElement('div');
    row.className  = 'vl-profile-row';
    row.style.cssText = `
      display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;
      font-family:'Motiva Sans',-apple-system,sans-serif;
    `;

    const makeBtn = (label, onClick, href) => {
      const btn = document.createElement(href ? 'a' : 'button');
      btn.className = 'vl-profile-btn';
      btn.style.cssText = `
        display:inline-flex; align-items:center; gap:5px;
        padding:5px 10px; background:rgba(249,115,22,0.08);
        border:1px solid rgba(249,115,22,0.3); border-radius:5px;
        color:#f97316; font-size:12px; cursor:pointer; text-decoration:none;
        transition:all 0.15s; font-family:inherit;
      `;
      btn.textContent = label;
      if (href) {
        btn.href   = href;
        btn.target = '_blank';
        btn.rel    = 'noopener noreferrer';
      }
      if (onClick) btn.addEventListener('click', onClick);

      btn.addEventListener('mouseenter', () => {
        btn.style.background   = 'rgba(249,115,22,0.18)';
        btn.style.borderColor  = '#f97316';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background  = 'rgba(249,115,22,0.08)';
        btn.style.borderColor = 'rgba(249,115,22,0.3)';
      });
      return btn;
    };

    // Copy SteamID64
    row.appendChild(makeBtn('📋 Copy SteamID64', async () => {
      try {
        await navigator.clipboard.writeText(ownerSteamId);
        showToast('SteamID64 copied!', 'success');
      } catch {
        showToast('Copy failed', 'error');
      }
    }));

    // Copy trade link (own profile only)
    if (isOwnInventory) {
      row.appendChild(makeBtn('🔗 Copy Trade Link', async () => {
        const link = getTradeLink(ownerSteamId);
        try {
          await navigator.clipboard.writeText(link);
          showToast('Trade link copied!', 'success');
        } catch {
          showToast('Copy failed', 'error');
        }
      }));
    }

    // Open CSFloat Stall
    row.appendChild(makeBtn(
      '🔍 CSFloat Stall',
      null,
      `https://csfloat.com/stall/${ownerSteamId}`
    ));

    // Open CSGO-Rep
    row.appendChild(makeBtn(
      '🛡️ CSGO-Rep',
      null,
      `https://csgo.rep.pm/profiles/${ownerSteamId}`
    ));

    profileHeader.insertAdjacentElement('afterend', row);
  }

  // ─────────────────────────────────────────────
  // Toolbar
  // ─────────────────────────────────────────────

  function injectToolbar() {
    if (document.querySelector('#vl-toolbar')) return;

    // Find the inventory container to prepend the toolbar
    const inventoryContainer = document.querySelector(
      '#inventories, .inventory_ctn, #tabcontent_inventory'
    );
    if (!inventoryContainer) return;

    toolbarEl     = document.createElement('div');
    toolbarEl.id  = 'vl-toolbar';
    toolbarEl.style.cssText = `
      display:flex; align-items:center; gap:10px; padding:10px 14px;
      background:#0f1117; border:1px solid #2a2d3a; border-radius:8px;
      margin-bottom:12px; flex-wrap:wrap;
      font-family:'Motiva Sans',-apple-system,BlinkMacSystemFont,sans-serif;
      box-shadow:0 2px 12px rgba(0,0,0,0.4);
    `;

    // Logo
    const logo = document.createElement('div');
    logo.style.cssText = `display:flex;align-items:center;gap:6px;font-weight:700;font-size:13px;color:#f97316;letter-spacing:0.08em;flex-shrink:0;`;
    logo.innerHTML     = `
      <div style="width:18px;height:18px;border-radius:4px;background:linear-gradient(135deg,#f97316,#ea580c);"></div>
      VAULTLENS
    `;
    toolbarEl.appendChild(logo);

    // Separator
    const sep1 = makeSep();
    toolbarEl.appendChild(sep1);

    // Stats display
    const statsEl    = document.createElement('span');
    statsEl.id       = 'vl-stats';
    statsEl.style.cssText = 'font-size:13px;color:#94a3b8;flex-shrink:0;';
    statsEl.innerHTML = '<span style="color:#4b5563">Loading...</span>';
    toolbarEl.appendChild(statsEl);

    // Separator
    toolbarEl.appendChild(makeSep());

    // Search
    const searchWrap      = document.createElement('div');
    searchWrap.style.cssText = 'position:relative;flex:1;min-width:160px;max-width:280px;';
    const searchInput     = document.createElement('input');
    searchInput.type      = 'text';
    searchInput.placeholder = '🔍 Search items...';
    searchInput.id        = 'vl-search';
    searchInput.style.cssText = `
      width:100%; padding:6px 10px; background:#1a1d27;
      border:1px solid #2a2d3a; border-radius:6px; color:#e2e8f0;
      font-size:13px; outline:none; box-sizing:border-box;
      font-family:inherit; transition:border-color 0.15s;
    `;
    searchInput.addEventListener('focus',  () => { searchInput.style.borderColor = '#f97316'; });
    searchInput.addEventListener('blur',   () => { searchInput.style.borderColor = '#2a2d3a'; });
    searchInput.addEventListener('input',  () => {
      searchQuery = searchInput.value;
      applyFilterAndSort();
    });
    searchWrap.appendChild(searchInput);
    toolbarEl.appendChild(searchWrap);

    // Sort dropdown
    const sortSel    = document.createElement('select');
    sortSel.id       = 'vl-sort';
    sortSel.style.cssText = `
      padding:6px 10px; background:#1a1d27; border:1px solid #2a2d3a;
      border-radius:6px; color:#e2e8f0; font-size:12px; outline:none;
      cursor:pointer; font-family:inherit;
    `;
    const sortOptions = [
      { value: 'default',     label: 'Default Order'       },
      { value: 'price_high',  label: 'Price: High → Low'   },
      { value: 'price_low',   label: 'Price: Low → High'   },
      { value: 'float_low',   label: 'Float: Low → High'   },
      { value: 'float_high',  label: 'Float: High → Low'   },
      { value: 'name_az',     label: 'Name: A → Z'         },
      { value: 'sticker_val', label: 'Sticker Value ↓'     },
    ];
    for (const opt of sortOptions) {
      const option   = document.createElement('option');
      option.value   = opt.value;
      option.text    = opt.label;
      sortSel.appendChild(option);
    }
    sortSel.addEventListener('change', () => {
      sortMode = sortSel.value;
      applyFilterAndSort();
    });
    toolbarEl.appendChild(sortSel);

    // Multi-select toggle
    const multiBtn   = document.createElement('button');
    multiBtn.id      = 'vl-multiselect';
    multiBtn.style.cssText = makeButtonStyle();
    multiBtn.textContent   = '⬜ Select';
    multiBtn.addEventListener('click', () => {
      multiSelectMode = !multiSelectMode;
      if (!multiSelectMode) selectedItems.clear();
      multiBtn.textContent = multiSelectMode ? '✅ Selecting' : '⬜ Select';
      multiBtn.style.background = multiSelectMode ? 'rgba(249,115,22,0.15)' : '#1a1d27';
      multiBtn.style.borderColor = multiSelectMode ? '#f97316' : '#2a2d3a';
      multiBtn.style.color = multiSelectMode ? '#f97316' : '#e2e8f0';
      refreshAllOverlays();
    });
    toolbarEl.appendChild(multiBtn);

    // Copy List button
    const copyBtn    = document.createElement('button');
    copyBtn.style.cssText = makeButtonStyle();
    copyBtn.textContent   = '📋 Copy List';
    copyBtn.addEventListener('click', async () => {
      const text = buildClipboardText();
      try {
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = '✅ Copied!';
        copyBtn.style.color = '#4ade80';
        setTimeout(() => {
          copyBtn.textContent = '📋 Copy List';
          copyBtn.style.color = '#e2e8f0';
        }, 2000);
      } catch {
        showToast('Clipboard access denied', 'error');
      }
    });
    toolbarEl.appendChild(copyBtn);

    // Refresh button
    const refreshBtn    = document.createElement('button');
    refreshBtn.style.cssText = makeButtonStyle(true);
    refreshBtn.textContent   = '↻ Refresh Prices';
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.textContent = '⏳ Refreshing...';
      refreshBtn.disabled    = true;
      try {
        const resp = await bgMessage({ action: 'FETCH_PRICES' });
        priceMap      = resp.priceMap    || {};
        pricingMode   = resp.mode        || 'skinport';
        priceLoadedAt = resp.timestamp   || Date.now();
        refreshAllOverlays();
        updateToolbarStats();
        showToast('Prices refreshed!', 'success');
      } catch (err) {
        showToast(`Refresh failed: ${err.message}`, 'error');
      } finally {
        refreshBtn.textContent = '↻ Refresh Prices';
        refreshBtn.disabled    = false;
      }
    });
    toolbarEl.appendChild(refreshBtn);

    // Insert before inventory container
    inventoryContainer.insertAdjacentElement('beforebegin', toolbarEl);
  }

  function makeSep() {
    const sep = document.createElement('div');
    sep.style.cssText = 'width:1px;height:24px;background:#2a2d3a;flex-shrink:0;';
    return sep;
  }

  function makeButtonStyle(primary = false) {
    if (primary) {
      return `
        display:inline-flex;align-items:center;gap:5px;padding:6px 12px;
        background:linear-gradient(135deg,#f97316,#ea580c);
        border:none;border-radius:6px;color:#fff;font-size:12px;
        cursor:pointer;font-family:inherit;font-weight:600;
        transition:all 0.15s;white-space:nowrap;flex-shrink:0;
      `;
    }
    return `
      display:inline-flex;align-items:center;gap:5px;padding:6px 12px;
      background:#1a1d27;border:1px solid #2a2d3a;border-radius:6px;
      color:#e2e8f0;font-size:12px;cursor:pointer;font-family:inherit;
      transition:all 0.15s;white-space:nowrap;flex-shrink:0;
    `;
  }

  function updateToolbarStats() {
    const statsEl = document.querySelector('#vl-stats');
    if (!statsEl) return;

    const allItems   = Array.from(itemDataMap.values());
    const itemCount  = allItems.length;
    let   totalValue = 0;
    let   priced     = 0;

    for (const item of allItems) {
      const p = lookupPrice(item.marketHashName);
      if (p !== null) {
        totalValue += p;
        priced++;
      }
    }

    const modeLabel = pricingMode === 'skinport' ? 'Skinport' : 'Buff163';
    const tsStr     = priceLoadedAt
      ? `· Updated ${timeSince(priceLoadedAt)}`
      : '';

    statsEl.innerHTML = `
      <strong style="color:#e2e8f0">${formatPrice(totalValue) || '$0.00'}</strong>
      <span style="color:#94a3b8"> · ${itemCount} items · ${modeLabel} ${tsStr}</span>
    `;
  }

  function timeSince(ts) {
    const secs = Math.floor((Date.now() - ts) / 1000);
    if (secs < 60)   return `${secs}s ago`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    return `${Math.floor(secs / 3600)}h ago`;
  }

  // ─────────────────────────────────────────────
  // Filter + Sort
  // ─────────────────────────────────────────────

  /**
   * Simple fuzzy match: does target contain all chars of query in order?
   */
  function fuzzyMatch(query, target) {
    if (!query) return true;
    const q = query.toLowerCase();
    const t = (target || '').toLowerCase();
    let qi = 0;
    for (let i = 0; i < t.length && qi < q.length; i++) {
      if (t[i] === q[qi]) qi++;
    }
    return qi === q.length;
  }

  function applyFilterAndSort() {
    const holders = getInventoryItemElements();
    const items   = Array.from(itemDataMap.values());

    // Build a map of holder → item for sorting
    const sorted = sortItemsBy(items, sortMode);

    // Apply visibility filter
    for (const holder of holders) {
      const assetid = getAssetIdFromHolder(holder);
      if (!assetid) continue;
      const item    = itemDataMap.get(assetid);
      if (!item) continue;

      const name    = item.marketHashName || '';
      const visible = fuzzyMatch(searchQuery, name);

      holder.style.display = visible ? '' : 'none';
    }

    // Re-order DOM elements by sort
    if (sortMode !== 'default') {
      const parent = holders[0]?.parentElement;
      if (parent) {
        for (const item of sorted) {
          if (item.holder && item.holder.parentElement === parent) {
            parent.appendChild(item.holder);
          }
        }
      }
    } else {
      // Restore original order
      const parent = holders[0]?.parentElement;
      if (parent) {
        const originalOrder = Array.from(itemDataMap.values())
          .sort((a, b) => a.originalIndex - b.originalIndex);
        for (const item of originalOrder) {
          if (item.holder && item.holder.parentElement === parent) {
            parent.appendChild(item.holder);
          }
        }
      }
    }
  }

  function sortItemsBy(items, mode) {
    const sorted = [...items];
    switch (mode) {
      case 'price_high':
        return sorted.sort((a, b) => {
          const pa = lookupPrice(a.marketHashName);
          const pb = lookupPrice(b.marketHashName);
          if (pa === null && pb === null) return 0;
          if (pa === null) return 1;
          if (pb === null) return -1;
          return pb - pa;
        });
      case 'price_low':
        return sorted.sort((a, b) => {
          const pa = lookupPrice(a.marketHashName);
          const pb = lookupPrice(b.marketHashName);
          if (pa === null && pb === null) return 0;
          if (pa === null) return 1;
          if (pb === null) return -1;
          return pa - pb;
        });
      case 'float_low':
        return sorted.sort((a, b) => {
          if (a.floatValue === null && b.floatValue === null) return 0;
          if (a.floatValue === null) return 1;
          if (b.floatValue === null) return -1;
          return a.floatValue - b.floatValue;
        });
      case 'float_high':
        return sorted.sort((a, b) => {
          if (a.floatValue === null && b.floatValue === null) return 0;
          if (a.floatValue === null) return 1;
          if (b.floatValue === null) return -1;
          return b.floatValue - a.floatValue;
        });
      case 'name_az':
        return sorted.sort((a, b) => (a.marketHashName || '').localeCompare(b.marketHashName || ''));
      case 'sticker_val':
        return sorted.sort((a, b) => (b.stickerValue || 0) - (a.stickerValue || 0));
      default:
        return sorted.sort((a, b) => a.originalIndex - b.originalIndex);
    }
  }

  // ─────────────────────────────────────────────
  // Clipboard Export
  // ─────────────────────────────────────────────

  function buildClipboardText() {
    const items = Array.from(itemDataMap.values())
      .sort((a, b) => a.originalIndex - b.originalIndex);

    const lines = items.map(item => {
      const name       = item.marketHashName || 'Unknown';
      const price      = lookupPrice(item.marketHashName);
      const priceStr   = price !== null ? formatPrice(price) : 'N/A';
      const floatStr   = item.floatValue !== null ? `Float: ${formatFloat(item.floatValue)}` : '';
      const stickerStr = item.stickerValue > 0 ? `Stickers: ${formatPrice(item.stickerValue)}` : '';

      const parts = [name, priceStr];
      if (floatStr)   parts.push(floatStr);
      if (stickerStr) parts.push(stickerStr);
      return parts.join(' | ');
    });

    return lines.join('\n');
  }

  // ─────────────────────────────────────────────
  // Item Holder Utilities
  // ─────────────────────────────────────────────

  function getAssetIdFromHolder(holder) {
    // Try direct data attribute
    if (holder.dataset.assetid) return holder.dataset.assetid;

    // Try child .item element id: "item_730_2_{assetid}"
    const itemEl = holder.querySelector('.item[id]');
    if (itemEl) {
      const parts = itemEl.id.split('_');
      return parts[parts.length - 1] || null;
    }

    // Try the holder's own id
    const parts = (holder.id || '').split('_');
    return parts[parts.length - 1] || null;
  }

  // ─────────────────────────────────────────────
  // Refresh All Overlays
  // ─────────────────────────────────────────────

  function refreshAllOverlays() {
    for (const [assetid, data] of itemDataMap.entries()) {
      const floatData = floatCache.get(assetid) || null;
      buildOverlay(data.holder, assetid, data.desc, floatData);
    }
    updateToolbarStats();
  }

  // ─────────────────────────────────────────────
  // IntersectionObserver — Lazy Item Processing
  // ─────────────────────────────────────────────

  const BATCH_SIZE        = 10;
  const FLOAT_BATCH_DELAY = 400; // ms between float fetch batches

  /** Queue of visible item holders waiting to be processed */
  const visibleQueue = [];
  let   processingQueue = false;

  async function processVisibleQueue() {
    if (processingQueue || visibleQueue.length === 0) return;
    processingQueue = true;

    while (visibleQueue.length > 0) {
      // Take up to BATCH_SIZE items
      const batch     = visibleQueue.splice(0, BATCH_SIZE);
      const toFetch   = [];

      for (const holder of batch) {
        const assetid = getAssetIdFromHolder(holder);
        if (!assetid || itemDataMap.has(assetid)) continue;

        // Get description from Steam globals
        const desc = getItemDescription(assetid);
        const mhn  = desc?.market_hash_name || desc?.name || '';

        // Register this item
        const data = {
          holder,
          assetid,
          desc,
          marketHashName: mhn,
          floatValue:     null,
          stickerValue:   0,
          originalIndex:  itemDataMap.size,
        };
        itemDataMap.set(assetid, data);

        // Build initial overlay (no float data yet)
        buildOverlay(holder, assetid, desc, null);

        // Queue float fetch if inspectable
        const inspectLink = extractInspectLink(desc, assetid);
        if (inspectLink && !floatCache.has(assetid)) {
          toFetch.push({ assetid, inspectLink });
        }
      }

      // Fetch floats for this batch
      if (toFetch.length > 0) {
        fetchFloatBatch(toFetch); // non-blocking
      }

      // Update stats
      updateToolbarStats();

      // Delay before next batch to avoid overwhelming the API
      if (visibleQueue.length > 0) {
        await sleep(FLOAT_BATCH_DELAY);
      }
    }

    processingQueue = false;
  }

  function setupIntersectionObserver() {
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          visibleQueue.push(entry.target);
          observer.unobserve(entry.target); // Process each holder once
        }
      }
      // Kick off queue processing
      processVisibleQueue();
    }, {
      root:       null,      // viewport
      rootMargin: '200px',   // pre-load items just outside viewport
      threshold:  0,
    });

    // Observe all current item holders
    const holders = getInventoryItemElements();
    for (const holder of holders) {
      observer.observe(holder);
    }
  }

  // ─────────────────────────────────────────────
  // Duplicate Map Builder
  // ─────────────────────────────────────────────

  function buildDuplicateMap() {
    const countMap = new Map();

    // Try to read from Steam's inventory description data
    try {
      if (window.g_ActiveInventory?.m_rgAssets) {
        for (const [aid, asset] of Object.entries(window.g_ActiveInventory.m_rgAssets)) {
          const desc = window.g_ActiveInventory.m_rgDescsByAsset?.[aid];
          const name = desc?.market_hash_name || '';
          if (name) {
            countMap.set(name, (countMap.get(name) || 0) + 1);
          }
        }
      }
    } catch {}

    // Fallback: scan DOM
    if (countMap.size === 0) {
      const holders = getInventoryItemElements();
      for (const holder of holders) {
        const assetid = getAssetIdFromHolder(holder);
        if (!assetid) continue;
        const desc = getItemDescription(assetid);
        const name = desc?.market_hash_name || '';
        if (name) {
          countMap.set(name, (countMap.get(name) || 0) + 1);
        }
      }
    }

    return countMap;
  }

  // ─────────────────────────────────────────────
  // Steam Inventory Tab Change Observer
  // ─────────────────────────────────────────────

  /**
   * Steam inventory is a SPA — the grid changes when users switch
   * between inventory tabs (CS2, TF2, etc.) or pages.
   * We observe DOM mutations to detect new item holders.
   */
  function setupMutationObserver() {
    const mutObs = new MutationObserver((mutations) => {
      let newHoldersFound = false;

      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;

          // Check if the added node is or contains item holders
          const holders = node.classList?.contains('itemHolder')
            ? [node]
            : Array.from(node.querySelectorAll?.('.itemHolder') || []);

          for (const holder of holders) {
            if (!holder.querySelector('.vl-item-shadow-host')) {
              observer?.observe(holder);
              newHoldersFound = true;
            }
          }
        }
      }

      if (newHoldersFound) {
        // Rebuild duplicate map since inventory may have changed
        duplicateMap = buildDuplicateMap();
      }
    });

    const inventoryContainer = document.querySelector(
      '#inventories, .inventory_ctn, #tabcontent_inventory'
    ) || document.body;

    mutObs.observe(inventoryContainer, {
      childList: true,
      subtree:   true,
    });
  }

  // ─────────────────────────────────────────────
  // Multi-Select Click Handler
  // ─────────────────────────────────────────────

  function setupMultiSelectHandler() {
    document.addEventListener('click', (e) => {
      if (!multiSelectMode) return;

      const holder = e.target.closest('.itemHolder');
      if (!holder) return;

      // Don't interfere with anchor clicks (price badge)
      if (e.target.tagName === 'A') return;

      e.preventDefault();
      e.stopPropagation();

      const assetid = getAssetIdFromHolder(holder);
      if (!assetid) return;

      if (selectedItems.has(assetid)) {
        selectedItems.delete(assetid);
      } else {
        selectedItems.add(assetid);
      }

      // Update visual on just this item
      const data = itemDataMap.get(assetid);
      if (data) {
        buildOverlay(data.holder, assetid, data.desc, floatCache.get(assetid) || null);
      }
    }, true); // capture phase
  }

  // ─────────────────────────────────────────────
  // Main Initialization
  // ─────────────────────────────────────────────

  async function init() {
    console.log('[VaultLens] Initializing inventory script...');

    // 1. Load settings
    try {
      const resp = await bgMessage({ action: 'GET_SETTINGS' });
      settings   = resp.settings || {};
    } catch {
      settings   = {};
    }

    // 2. Extract owner SteamID
    ownerSteamId   = extractOwnerSteamId();
    isOwnInventory = await detectOwnInventory(ownerSteamId);
    console.log(`[VaultLens] Owner SteamID: ${ownerSteamId}, Own: ${isOwnInventory}`);

    // 3. Load prices (serves cache immediately, refreshes in background if stale)
    try {
      const priceResp = await bgMessage({ action: 'GET_PRICES' });
      priceMap        = priceResp.priceMap    || null;
      pricingMode     = priceResp.mode        || 'skinport';
      priceLoadedAt   = priceResp.timestamp   || 0;
      console.log(`[VaultLens] Prices loaded: ${priceMap ? Object.keys(priceMap).length : 0} items`);
    } catch (err) {
      console.warn('[VaultLens] Price load failed:', err.message);
    }

    // 4. Build duplicate map
    duplicateMap = buildDuplicateMap();

    // 5. Inject toolbar + profile buttons
    // Wait a tick for Steam's inventory to render
    await sleep(500);
    injectToolbar();
    injectProfileButtons();

    // 6. Setup IntersectionObserver for lazy item processing
    setupIntersectionObserver();

    // 7. Setup MutationObserver for dynamic content
    setupMutationObserver();

    // 8. Setup multi-select handler
    setupMultiSelectHandler();

    // 9. Initial stats update
    updateToolbarStats();

    console.log('[VaultLens] Inventory script ready.');
  }

  // ── Wait for Steam inventory to be ready ────────────────────────────────
  // Steam loads inventory data asynchronously; we poll until the grid appears

  let initAttempts = 0;
  async function waitAndInit() {
    const inventoryReady = document.querySelector(
      '#inventories .itemHolder, .inventory_ctn .itemHolder, .inventory_page_right'
    );

    if (inventoryReady || initAttempts >= 20) {
      await init();
    } else {
      initAttempts++;
      setTimeout(waitAndInit, 500);
    }
  }

    // ─────────────────────────────────────────────
  // Listen for settings changes pushed from popup
  // ─────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {

      case 'PRICES_UPDATED':
        // Popup triggered a price refresh — update local cache and re-render
        if (message.priceMap) {
          priceMap      = message.priceMap;
          pricingMode   = message.mode || pricingMode;
          priceLoadedAt = Date.now();
          refreshAllOverlays();
          updateToolbarStats();
        }
        sendResponse({ ok: true });
        break;

      case 'SETTINGS_UPDATED':
        // Display settings changed
        if (message.settings) {
          settings = { ...settings, ...message.settings };
          refreshAllOverlays();
        }
        sendResponse({ ok: true });
        break;

      case 'LANGUAGE_CHANGED':
        // Language changed — store and note (full re-render not needed for
        // content script since overlay labels are mostly numeric/symbolic)
        if (message.lang) {
          chrome.storage.local.set({ vl_language: message.lang });
        }
        sendResponse({ ok: true });
        break;

      case 'THEME_CHANGED':
        // Theme changed — apply to any VaultLens injected elements
        applyContentTheme(message.theme);
        sendResponse({ ok: true });
        break;

      case 'GET_INVENTORY_STATS':
        // Popup is requesting live stats
        const allItems  = Array.from(itemDataMap.values());
        let totalVal    = 0;
        let pricedCount = 0;
        for (const item of allItems) {
          const p = lookupPrice(item.marketHashName);
          if (p !== null) { totalVal += p; pricedCount++; }
        }
        sendResponse({
          totalValue:  totalVal,
          itemCount:   allItems.length,
          pricedCount,
        });
        break;

      default:
        break;
    }
    return true; // keep channel open for async responses
  });

  /**
   * Apply a theme to VaultLens-injected DOM elements on the content page.
   * The toolbar and profile row are the only non-Shadow-DOM VaultLens elements.
   * @param {'dark'|'light'|'system'} theme
   */
  function applyContentTheme(theme) {
    let resolved = theme;
    if (theme === 'system') {
      resolved = window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light' : 'dark';
    }

    const toolbar = document.getElementById('vl-toolbar');
    if (toolbar) {
      if (resolved === 'light') {
        toolbar.style.background = '#ffffff';
        toolbar.style.borderColor = '#e2e8f0';
        toolbar.style.color = '#0f172a';
        // Update child text colors
        toolbar.querySelectorAll('span, button, input, select').forEach(el => {
          el.style.color = '#475569';
        });
        toolbar.querySelector('#vl-stats > strong') &&
          (toolbar.querySelector('#vl-stats > strong').style.color = '#0f172a');
      } else {
        // Restore dark defaults
        toolbar.style.background = '#0f1117';
        toolbar.style.borderColor = '#2a2d3a';
        toolbar.style.color = '#e2e8f0';
        toolbar.querySelectorAll('span, button, input, select').forEach(el => {
          el.style.color = '';
        });
      }
    }

    // Store for future reference
    chrome.storage.local.set({ vl_theme: theme });
  }

  // Kick off
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitAndInit);
  } else {
    waitAndInit();
  }

})(); // end IIFE