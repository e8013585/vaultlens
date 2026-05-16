//
// VaultLens — content/tradeoffers.js
//
// Content script for Steam trade offer pages.
// Injected on:
//   https://steamcommunity.com/tradeoffer/*          (single trade offer)
//   https://steamcommunity.com/id/*/tradeoffers*     (trade offer list)
//   https://steamcommunity.com/profiles/*/tradeoffers* (trade offer list)
//
// Features:
//  1. Single trade offer page:
//     - Inject P&L summary panel above the trade window
//     - Show price below each item in the trade slots
//     - Manual price override button for Doppler items
//  2. Trade offer list page:
//     - Show P&L badge on each offer in the list
//
// Architecture:
//  - Uses Shadow DOM for injected panels
//  - Prices fetched from background.js cache
//  - Float data fetched for Doppler detection (paint_index)
//  - All DOM manipulation is additive (never removes Steam elements)
//

(async function VaultLensTradeOffers() {
  'use strict';

  if (window.__vaultLensTradeLoaded) return;
  window.__vaultLensTradeLoaded = true;

  // ─────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────

  let priceMap      = null;
  let pricingMode   = 'skinport';
  let priceLoadedAt = 0;
  let settings      = {};

  /**
   * Manual price overrides for Doppler items.
   * { [assetid]: number } — user-entered USD price
   */
  const manualPriceOverrides = {};

  /**
   * Float data cache for items in the trade window.
   * { [assetid]: iteminfo }
   */
  const tradeFloatCache = {};

  // ─────────────────────────────────────────────
  // Utilities
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
    if (price === null || price === undefined || isNaN(price)) return 'N/A';
    if (price >= 10000) return `$${Math.round(price / 1000)}K`;
    if (price >= 1000)  return `$${(price / 1000).toFixed(1)}K`;
    return `$${Number(price).toFixed(2)}`;
  }

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

  function showToast(message, type = 'info', duration = 2500) {
    const existing = document.querySelector('.vl-toast-global');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'vl-toast-global';
    const borderColor = type === 'success' ? '#4ade80'
                      : type === 'error'   ? '#f87171'
                      : '#f97316';
    toast.style.cssText = `
      position:fixed; bottom:24px; right:24px; z-index:999999;
      background:#0f1117; border:1px solid #2a2d3a;
      border-left:3px solid ${borderColor};
      border-radius:8px; padding:12px 16px; font-size:13px; color:#e2e8f0;
      font-family:'Motiva Sans',-apple-system,sans-serif;
      box-shadow:0 8px 32px rgba(0,0,0,0.6);
      display:flex; align-items:center; gap:10px; max-width:320px;
      pointer-events:none;
    `;
    const icon = type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ';
    toast.innerHTML = `<span style="color:${borderColor};font-weight:700">${icon}</span> ${escapeHtml(message)}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
  }

  // ─────────────────────────────────────────────
  // Price Lookup
  // ─────────────────────────────────────────────

  function lookupPrice(marketHashName) {
    if (!priceMap || !marketHashName) return null;
    const entry = priceMap[marketHashName];
    if (!entry) return null;
    if (pricingMode === 'skinport') return entry.minPrice ?? null;
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
  // Doppler Detection (inline for content script context)
  // ─────────────────────────────────────────────

  const DOPPLER_PHASES = {
    415: { phase: 'Phase 1',     color: '#6ab0de' },
    416: { phase: 'Phase 2',     color: '#c96bde' },
    417: { phase: 'Phase 3',     color: '#7b68de' },
    418: { phase: 'Phase 4',     color: '#3a5f8a' },
    419: { phase: 'Ruby',        color: '#c0392b' },
    420: { phase: 'Sapphire',    color: '#2980b9' },
    421: { phase: 'Black Pearl', color: '#2c2c54' },
    568: { phase: 'Gamma P1',    color: '#7dde6a' },
    569: { phase: 'Gamma P2',    color: '#6adec3' },
    570: { phase: 'Gamma P3',    color: '#6aa5de' },
    571: { phase: 'Gamma P4',    color: '#9b6ade' },
    572: { phase: 'Emerald',     color: '#00c853' },
  };

  function isDoppler(marketHashName) {
    return (marketHashName || '').toLowerCase().includes('doppler');
  }

  function getDopplerPhase(paintIndex) {
    return DOPPLER_PHASES[paintIndex] || null;
  }

  // ─────────────────────────────────────────────
  // Item Data Extraction from Trade Window
  // ─────────────────────────────────────────────

  /**
   * Extract trade items from Steam's trade offer page globals.
   * Steam stores trade items in g_rgCurrentTradeStatus:
   * {
   *   me:   { assets: [{ appid, contextid, assetid, amount }] }
   *   them: { assets: [...] }
   * }
   *
   * Item descriptions live in g_rgItems (a flat description map).
   */
  function getTradeItems() {
    const result = { myItems: [], theirItems: [] };

    try {
      // Primary: g_rgCurrentTradeStatus (active trade offer page)
      if (window.g_rgCurrentTradeStatus) {
        const status = window.g_rgCurrentTradeStatus;
        result.myItems    = resolveTradeAssets(status.me?.assets    || []);
        result.theirItems = resolveTradeAssets(status.them?.assets  || []);
        return result;
      }

      // Fallback: scan the trade offer DOM for item elements
      result.myItems    = extractItemsFromTradeSlot('#trade_yours .trade_item');
      result.theirItems = extractItemsFromTradeSlot('#trade_theirs .trade_item');
    } catch (err) {
      console.warn('[VaultLens] Trade item extraction error:', err.message);
    }

    return result;
  }

  /**
   * Resolve an array of trade assets to enriched item objects.
   * @param {Array} assets - [{ appid, contextid, assetid, amount }]
   */
  function resolveTradeAssets(assets) {
    return assets
      .filter(a => String(a.appid) === '730') // CS2 only
      .map(asset => {
        const desc = resolveItemDescription(asset);
        return {
          assetid:       String(asset.assetid),
          amount:        asset.amount || 1,
          marketHashName: desc?.market_hash_name || desc?.name || '',
          desc,
        };
      });
  }

  /**
   * Resolve item description from Steam globals for a trade asset.
   */
  function resolveItemDescription(asset) {
    try {
      // g_rgItems is a nested map: { [appid]: { [contextid]: { [assetid]: desc } } }
      if (window.g_rgItems) {
        const appCtx = window.g_rgItems[asset.appid]?.[asset.contextid];
        if (appCtx?.[asset.assetid]) return appCtx[asset.assetid];
      }

      // g_rgCurrentTradeStatus descriptions
      if (window.g_rgCurrentTradeStatus?.descriptions) {
        const key = `${asset.classid}_${asset.instanceid}`;
        return window.g_rgCurrentTradeStatus.descriptions[key] || null;
      }
    } catch {}
    return null;
  }

  /**
   * Fallback: extract items directly from trade slot DOM elements.
   * @param {string} selector - CSS selector for trade item elements
   */
  function extractItemsFromTradeSlot(selector) {
    const items = [];
    const els   = document.querySelectorAll(selector);

    for (const el of els) {
      // Steam item IDs: "item_730_2_{assetid}"
      const idParts = (el.id || el.dataset.id || '').split('_');
      const assetid = idParts[idParts.length - 1];
      if (!assetid || isNaN(Number(assetid))) continue;

      const nameEl = el.querySelector('.item_name, [class*="item_name"]');
      const name   = nameEl?.textContent?.trim() || '';

      items.push({
        assetid,
        amount: 1,
        marketHashName: name,
        desc: null,
        element: el,
      });
    }
    return items;
  }

  // ─────────────────────────────────────────────
  // Fetch Float Data for Trade Items (for Doppler detection)
  // ─────────────────────────────────────────────

  /**
   * Fetch inspect link for a trade item.
   * Trade items use market_actions for inspect links.
   */
  function extractTradeInspectLink(desc, assetid) {
    if (!desc) return null;
    const actions = desc.market_actions || desc.actions || [];
    const action  = actions.find(a => a.link?.includes('csgo_econ_action_preview'));
    if (!action) return null;

    let link = action.link;
    // For trade items, owner steamid might be different — use a placeholder
    link = link.replace('%owner_steamid%', '0');
    link = link.replace('%assetid%', assetid);
    return link.startsWith('steam://') ? link : null;
  }

  /**
   * Fetch float data for all Doppler items in the trade (for phase detection).
   * Non-blocking; updates UI when data arrives.
   */
  async function fetchDopplerFloats(items) {
    const dopplerItems = items.filter(item =>
      isDoppler(item.marketHashName) && !tradeFloatCache[item.assetid]
    );

    if (dopplerItems.length === 0) return;

    const toFetch = dopplerItems
      .map(item => ({
        assetid:     item.assetid,
        inspectLink: extractTradeInspectLink(item.desc, item.assetid),
      }))
      .filter(i => i.inspectLink);

    if (toFetch.length === 0) return;

    try {
      const resp = await bgMessage({
        action: 'GET_FLOATS_BATCH',
        items:  toFetch,
      });

      for (const [assetid, result] of Object.entries(resp.results || {})) {
        if (result.data) {
          tradeFloatCache[assetid] = result.data;
        }
      }

      // Re-render trade panel with updated Doppler info
      renderTradePanelAndItems();
    } catch (err) {
      console.warn('[VaultLens] Doppler float fetch error:', err.message);
    }
  }

  // ─────────────────────────────────────────────
  // P&L Calculation
  // ─────────────────────────────────────────────

  /**
   * Calculate total value of a list of trade items.
   * Uses manual overrides for Dopplers if set.
   */
  function calcTradeValue(items) {
    let total = 0;
    for (const item of items) {
      // Check manual override first
      if (manualPriceOverrides[item.assetid] !== undefined) {
        total += manualPriceOverrides[item.assetid];
        continue;
      }
      const price = lookupPrice(item.marketHashName);
      if (price !== null) total += price;
    }
    return total;
  }

  function calcPNL(giveValue, receiveValue) {
    const diff = receiveValue - giveValue;
    const pct  = giveValue > 0 ? (diff / giveValue) * 100 : 0;
    const sign = diff >= 0 ? '+' : '';
    const colorClass = diff > 0 ? 'profit' : diff < 0 ? 'loss' : 'even';
    return {
      diff,
      pct,
      label:      `${sign}${formatPrice(Math.abs(diff))} (${sign}${pct.toFixed(1)}%)`,
      rawLabel:   `${sign}${formatPrice(diff)}`,
      colorClass,
      isProfit:   diff > 0,
    };
  }

  // ─────────────────────────────────────────────
  // Single Trade Offer Page
  // ─────────────────────────────────────────────

  /**
   * Main render function for the single trade offer page.
   * Builds or updates the P&L panel and per-item price labels.
   */
  function renderTradePanelAndItems() {
    const { myItems, theirItems } = getTradeItems();

    const giveValue    = calcTradeValue(myItems);
    const receiveValue = calcTradeValue(theirItems);
    const pnl          = calcPNL(giveValue, receiveValue);

    // ── Render P&L Panel ─────────────────────────
    renderPNLPanel(giveValue, receiveValue, pnl, myItems.length, theirItems.length);

    // ── Render Per-Item Prices ────────────────────
    renderItemPrices(myItems,    '#trade_yours');
    renderItemPrices(theirItems, '#trade_theirs');
  }

  /**
   * Render or update the P&L summary panel above the trade window.
   */
  function renderPNLPanel(giveValue, receiveValue, pnl, myCount, theirCount) {
    const PANEL_ID = 'vl-trade-pnl-panel';
    let panel      = document.getElementById(PANEL_ID);

    if (!panel) {
      panel    = document.createElement('div');
      panel.id = PANEL_ID;
      panel.style.cssText = `
        display:flex; align-items:center; gap:16px; padding:12px 16px;
        background:#0f1117; border:1px solid #2a2d3a; border-radius:8px;
        margin-bottom:12px; flex-wrap:wrap;
        font-family:'Motiva Sans',-apple-system,sans-serif;
        box-shadow:0 2px 12px rgba(0,0,0,0.4);
      `;

      // Find insertion point — above the trade window
      const tradeArea = document.querySelector(
        '#trade_area, .trade_area, #tradeoffer_items_container'
      );
      if (tradeArea) {
        tradeArea.insertAdjacentElement('beforebegin', panel);
      } else {
        // Fallback: prepend to body
        document.body.insertAdjacentElement('afterbegin', panel);
      }
    }

    // Build content
    const pnlColor = pnl.diff > 0 ? '#4ade80' : pnl.diff < 0 ? '#f87171' : '#94a3b8';
    const modeLabel = pricingMode === 'skinport' ? 'Skinport' : 'Buff163';

    panel.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
        <div style="width:16px;height:16px;border-radius:3px;background:linear-gradient(135deg,#f97316,#ea580c);"></div>
        <span style="font-weight:700;font-size:12px;color:#f97316;letter-spacing:0.08em;">VAULTLENS</span>
        <span style="font-size:11px;color:#4b5563;padding:1px 5px;background:#1a1d27;border-radius:3px;border:1px solid #2a2d3a;">${modeLabel}</span>
      </div>

      <div style="width:1px;height:36px;background:#2a2d3a;flex-shrink:0;"></div>

      <div style="display:flex;flex-direction:column;min-width:110px;">
        <span style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:2px;">
          You Give (${myCount})
        </span>
        <span style="font-size:16px;font-weight:700;color:#f87171;">
          ${formatPrice(giveValue)}
        </span>
      </div>

      <div style="display:flex;flex-direction:column;min-width:110px;">
        <span style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:2px;">
          You Receive (${theirCount})
        </span>
        <span style="font-size:16px;font-weight:700;color:#4ade80;">
          ${formatPrice(receiveValue)}
        </span>
      </div>

      <div style="width:1px;height:36px;background:#2a2d3a;flex-shrink:0;"></div>

      <div style="display:flex;flex-direction:column;">
        <span style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:2px;">
          P&amp;L
        </span>
        <span style="font-size:18px;font-weight:800;color:${pnlColor};">
          ${pnl.rawLabel}
          <span style="font-size:13px;font-weight:600;opacity:0.85;">(${pnl.pct >= 0 ? '+' : ''}${pnl.pct.toFixed(1)}%)</span>
        </span>
      </div>

      <div style="margin-left:auto;font-size:11px;color:#4b5563;">
        Prices may vary. Always verify before trading.
      </div>
    `;
  }

  /**
   * Render price labels below each item in a trade slot.
   * @param {Array}  items    - Trade item objects
   * @param {string} slotSelector - '#trade_yours' or '#trade_theirs'
   */
  function renderItemPrices(items, slotSelector) {
    const slotEl = document.querySelector(slotSelector);
    if (!slotEl) return;

    for (const item of items) {
      // Find the item's DOM element within the slot
      const itemEl = slotEl.querySelector(
        `[id*="${item.assetid}"], [data-assetid="${item.assetid}"]`
      ) || findItemElementByName(slotEl, item.marketHashName);

      if (!itemEl) continue;

      // Remove existing VaultLens price label
      itemEl.querySelector('.vl-trade-price-wrap')?.remove();

      const wrap = document.createElement('div');
      wrap.className = 'vl-trade-price-wrap';
      wrap.style.cssText = `
        margin-top:3px; font-family:'Motiva Sans',-apple-system,sans-serif;
      `;

      // Determine price (with manual override)
      const hasOverride = manualPriceOverrides[item.assetid] !== undefined;
      const price       = hasOverride
        ? manualPriceOverrides[item.assetid]
        : lookupPrice(item.marketHashName);

      const floatData   = tradeFloatCache[item.assetid];
      const phase       = floatData ? getDopplerPhase(floatData.paintindex) : null;

      // Price display
      const priceSpan       = document.createElement('a');
      priceSpan.href        = getMarketUrl(item.marketHashName);
      priceSpan.target      = '_blank';
      priceSpan.rel         = 'noopener noreferrer';
      priceSpan.textContent = price !== null ? formatPrice(price) : 'N/A';
      priceSpan.style.cssText = `
        display:block; font-size:11px; font-weight:700;
        color:${price !== null ? '#4ade80' : '#4b5563'};
        text-decoration:none; transition:color 0.12s;
      `;
      priceSpan.addEventListener('mouseenter', () => { priceSpan.style.color = '#86efac'; });
      priceSpan.addEventListener('mouseleave', () => { priceSpan.style.color = price !== null ? '#4ade80' : '#4b5563'; });

      wrap.appendChild(priceSpan);

      // Doppler phase badge
      if (phase) {
        const phaseBadge = document.createElement('span');
        phaseBadge.style.cssText = `
          display:inline-block; margin-top:2px; padding:1px 4px;
          border-radius:3px; font-size:10px; font-weight:600;
          background:rgba(0,0,0,0.6); color:${phase.color};
          border:1px solid ${phase.color}55;
        `;
        phaseBadge.textContent = phase.phase;
        wrap.appendChild(phaseBadge);
      }

      // Price override button (pencil icon) for Doppler items
      if (isDoppler(item.marketHashName) || hasOverride) {
        const overrideWrap = buildPriceOverrideUI(item, priceSpan, wrap);
        wrap.appendChild(overrideWrap);
      }

      // Append to item element
      const nameEl = itemEl.querySelector(
        '.item_desc_name, .item_name, [class*="item_desc"]'
      ) || itemEl;
      nameEl.insertAdjacentElement('afterend', wrap);
    }
  }

  /**
   * Find an item DOM element within a slot by its market hash name.
   * Fuzzy fallback when assetid-based lookup fails.
   */
  function findItemElementByName(slotEl, marketHashName) {
    if (!marketHashName) return null;
    const skin = (marketHashName.split('|')[1] || '').replace(/\s*\(.*?\)/, '').trim().toLowerCase();
    const items = slotEl.querySelectorAll('.trade_item, .item');
    for (const el of items) {
      const text = el.textContent.toLowerCase();
      if (skin && text.includes(skin)) return el;
    }
    return null;
  }

  /**
   * Build the price override UI widget for Doppler items.
   * Shows a pencil icon that expands to an inline input on click.
   */
  function buildPriceOverrideUI(item, priceSpan, parentWrap) {
    const container = document.createElement('div');
    container.style.cssText = 'display:inline-flex;align-items:center;gap:4px;margin-top:3px;';

    const hasOverride = manualPriceOverrides[item.assetid] !== undefined;

    // Pencil button
    const pencilBtn = document.createElement('button');
    pencilBtn.title = 'Set custom price';
    pencilBtn.style.cssText = `
      background:transparent; border:none; cursor:pointer;
      color:${hasOverride ? '#f97316' : '#4b5563'}; font-size:11px;
      padding:1px 3px; border-radius:3px;
      transition:color 0.15s; font-family:inherit; line-height:1;
    `;
    pencilBtn.textContent = hasOverride ? '✏️ Override' : '✏️';
    pencilBtn.addEventListener('mouseenter', () => { pencilBtn.style.color = '#f97316'; });
    pencilBtn.addEventListener('mouseleave', () => {
      pencilBtn.style.color = hasOverride ? '#f97316' : '#4b5563';
    });

    // Input (hidden by default)
    const inputWrap = document.createElement('div');
    inputWrap.style.cssText = 'display:none;align-items:center;gap:3px;';

    const input = document.createElement('input');
    input.type        = 'number';
    input.step        = '0.01';
    input.min         = '0';
    input.placeholder = 'USD price';
    input.value       = hasOverride ? manualPriceOverrides[item.assetid].toFixed(2) : '';
    input.style.cssText = `
      width:75px; padding:2px 6px; background:#1a1d27;
      border:1px solid #f97316; border-radius:4px; color:#e2e8f0;
      font-size:11px; outline:none; font-family:inherit;
    `;

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = '✓';
    confirmBtn.style.cssText = `
      background:#f97316; border:none; border-radius:3px;
      color:#fff; font-weight:700; font-size:12px;
      padding:2px 5px; cursor:pointer; font-family:inherit;
    `;

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '✕';
    cancelBtn.style.cssText = `
      background:#1a1d27; border:1px solid #4b5563; border-radius:3px;
      color:#94a3b8; font-size:12px; padding:2px 5px;
      cursor:pointer; font-family:inherit;
    `;

    inputWrap.appendChild(input);
    inputWrap.appendChild(confirmBtn);
    inputWrap.appendChild(cancelBtn);

    // Toggle input visibility
    pencilBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = inputWrap.style.display !== 'none';
      inputWrap.style.display = isVisible ? 'none' : 'inline-flex';
      if (!isVisible) input.focus();
    });

    // Confirm override
    confirmBtn.addEventListener('click', () => {
      const val = parseFloat(input.value);
      if (!isNaN(val) && val >= 0) {
        manualPriceOverrides[item.assetid] = val;
        priceSpan.textContent = formatPrice(val);
        priceSpan.style.color = '#f97316'; // orange = manual override
        pencilBtn.textContent = '✏️ Override';
        pencilBtn.style.color = '#f97316';
        inputWrap.style.display = 'none';

        // Recalculate and update P&L panel
        renderTradePanelAndItems();
        showToast(`Price override set: ${formatPrice(val)}`, 'success');
      } else {
        showToast('Enter a valid USD price', 'error');
      }
    });

    // Cancel
    cancelBtn.addEventListener('click', () => {
      inputWrap.style.display = 'none';
    });

    // Allow Enter key to confirm
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter')  confirmBtn.click();
      if (e.key === 'Escape') cancelBtn.click();
    });

    container.appendChild(pencilBtn);
    container.appendChild(inputWrap);
    return container;
  }

  // ─────────────────────────────────────────────
  // Trade Offer LIST Page
  // ─────────────────────────────────────────────

  /**
   * On the trade offer list page (/tradeoffers/), inject P&L badges
   * on each offer summary row.
   */
  async function renderTradeOfferList() {
    const offerEls = document.querySelectorAll(
      '.tradeoffer, [class*="tradeoffer_items"]'
    );

    if (offerEls.length === 0) return;

    for (const offerEl of offerEls) {
      await renderSingleOfferRow(offerEl);
    }
  }

  /**
   * Render a P&L badge on a single offer row in the list.
   */
  async function renderSingleOfferRow(offerEl) {
    // Skip if already processed
    if (offerEl.querySelector('.vl-offer-pnl')) return;

    // Find item slots within this offer
    const primaryItems   = extractListOfferItems(offerEl, '.primary_panel, .tradeoffer_item_list:first-child');
    const secondaryItems = extractListOfferItems(offerEl, '.secondary_panel, .tradeoffer_item_list:last-child');

    if (primaryItems.length === 0 && secondaryItems.length === 0) return;

    // "Me" = primary (what I give), "Them" = secondary (what I receive)
    // NOTE: This ordering may vary; Steam's layout can differ per offer direction.
    const giveValue    = calcItemListValue(primaryItems);
    const receiveValue = calcItemListValue(secondaryItems);
    const pnl          = calcPNL(giveValue, receiveValue);

    // Build badge
    const badge = document.createElement('div');
    badge.className = 'vl-offer-pnl';

    const colorMap = { profit: '#4ade80', loss: '#f87171', even: '#94a3b8' };
    const bgMap    = {
      profit: 'rgba(74,222,128,0.1)',
      loss:   'rgba(248,113,113,0.1)',
      even:   'rgba(148,163,184,0.1)',
    };
    const borderMap = {
      profit: 'rgba(74,222,128,0.3)',
      loss:   'rgba(248,113,113,0.3)',
      even:   'rgba(148,163,184,0.3)',
    };

    badge.style.cssText = `
      display:inline-flex; align-items:center; gap:6px;
      padding:3px 8px; border-radius:4px; font-size:12px; font-weight:700;
      font-family:'Motiva Sans',-apple-system,sans-serif; margin-top:6px;
      background:${bgMap[pnl.colorClass]};
      color:${colorMap[pnl.colorClass]};
      border:1px solid ${borderMap[pnl.colorClass]};
    `;

    badge.innerHTML = `
      <span style="font-size:11px;opacity:0.8;">VaultLens</span>
      Give: ${formatPrice(giveValue)} →
      Receive: ${formatPrice(receiveValue)} |
      ${pnl.rawLabel} (${pnl.pct >= 0 ? '+' : ''}${pnl.pct.toFixed(1)}%)
    `;

    // Find a good insertion point in the offer row
    const footer = offerEl.querySelector(
      '.tradeoffer_footer, .tradeoffer_footer_actions, .tradeoffer_items_rule'
    );

    if (footer) {
      footer.insertAdjacentElement('beforebegin', badge);
    } else {
      offerEl.appendChild(badge);
    }
  }

  /**
   * Extract item names from a trade offer list row's item panel.
   */
  function extractListOfferItems(offerEl, panelSelector) {
    const panel = offerEl.querySelector(panelSelector);
    if (!panel) return [];

    const itemEls = panel.querySelectorAll(
      '.tradeoffer_item, .trade_item, [class*="item"]'
    );
    const items = [];

    for (const el of itemEls) {
      // Try to get market hash name from data attribute or item name text
      const name = el.dataset.marketHashName
        || el.querySelector('.item_name, .market_listing_item_name')?.textContent?.trim()
        || el.title
        || '';

      if (name && name !== 'Unknown') {
        items.push({ marketHashName: name });
      }
    }
    return items;
  }

  /**
   * Calculate total value of a simple item name list.
   */
  function calcItemListValue(items) {
    return items.reduce((sum, item) => {
      const price = lookupPrice(item.marketHashName);
      return sum + (price || 0);
    }, 0);
  }

  // ─────────────────────────────────────────────
  // Trade Window Mutation Observer
  // ─────────────────────────────────────────────

  /**
   * Watch for changes to the trade window (items being added/removed).
   * Steam updates the trade window dynamically via AJAX.
   */
  function setupTradeWindowObserver() {
    const tradeArea = document.querySelector(
      '#trade_area, .trade_area, #tradeoffer_items_container'
    );
    if (!tradeArea) return;

    let debounceTimer = null;

    const obs = new MutationObserver(() => {
      // Debounce re-renders to avoid excessive updates
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        renderTradePanelAndItems();
      }, 300);
    });

    obs.observe(tradeArea, {
      childList: true,
      subtree:   true,
      attributes: true,
    });
  }

  // ─────────────────────────────────────────────
  // Page Detection
  // ─────────────────────────────────────────────

  /**
   * Determine which type of trade page we're on.
   * @returns {'offer'|'list'|'unknown'}
   */
  function detectPageType() {
    const path = location.pathname;

    // Single trade offer: /tradeoffer/new or /tradeoffer/{id}
    if (path.includes('/tradeoffer/')) return 'offer';

    // Trade offer list: /tradeoffers or /tradeoffers/
    if (path.includes('/tradeoffers')) return 'list';

    return 'unknown';
  }

  // ─────────────────────────────────────────────
  // Main Initialization
  // ─────────────────────────────────────────────

  async function init() {
    console.log('[VaultLens] Trade offers script initializing...');

    // 1. Load settings
    try {
      const resp = await bgMessage({ action: 'GET_SETTINGS' });
      settings   = resp.settings || {};
    } catch {
      settings   = {};
    }

    // 2. Load prices
    try {
      const priceResp = await bgMessage({ action: 'GET_PRICES' });
      priceMap        = priceResp.priceMap    || null;
      pricingMode     = priceResp.mode        || 'skinport';
      priceLoadedAt   = priceResp.timestamp   || 0;
      console.log(`[VaultLens] Prices loaded: ${priceMap ? Object.keys(priceMap).length : 0} items`);
    } catch (err) {
      console.warn('[VaultLens] Price load failed:', err.message);
    }

    const pageType = detectPageType();
    console.log(`[VaultLens] Page type: ${pageType}`);

    if (pageType === 'offer') {
      // Wait for Steam's trade window to fully render
      await sleep(800);
      renderTradePanelAndItems();
      setupTradeWindowObserver();

      // Fetch float data for Doppler items in the trade
      const { myItems, theirItems } = getTradeItems();
      const allItems = [...myItems, ...theirItems];
      fetchDopplerFloats(allItems); // non-blocking

    } else if (pageType === 'list') {
      // Wait for the offer list to render
      await sleep(600);
      renderTradeOfferList();

      // Watch for dynamically loaded offers (infinite scroll / pagination)
      const listContainer = document.querySelector(
        '#inactivetradeoffers, #activetradeoffers, .tradeoffer_list'
      );
      if (listContainer) {
        const listObs = new MutationObserver(() => {
          renderTradeOfferList();
        });
        listObs.observe(listContainer, { childList: true, subtree: true });
      }
    }

    console.log('[VaultLens] Trade offers script ready.');
  }

  // ── Wait for Steam trade page to be ready ──────────────────────────────
  let initAttempts = 0;
  async function waitAndInit() {
    const tradeReady = document.querySelector(
      '#trade_area, .tradeoffer, #tradeoffer_items_container, .trade_item'
    );

    if (tradeReady || initAttempts >= 20) {
      await init();
    } else {
      initAttempts++;
      setTimeout(waitAndInit, 500);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitAndInit);
  } else {
    waitAndInit();
  }

})();