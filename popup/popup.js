/**
 * VaultLens — popup/popup.js
 *
 * Browser action popup controller.
 * Manages all three tabs: Overview, Settings, About.
 *
 * Responsibilities:
 *  - Tab switching
 *  - Load and display cache stats + page context
 *  - Pricing mode toggle + API key management
 *  - Settings persistence via chrome.storage.local
 *  - Trigger price refreshes via background.js
 *  - Display inventory value when on an inventory page
 *  - Cache clearing
 *
 * Communication:
 *  All data operations route through background.js via chrome.runtime.sendMessage.
 *  The popup never makes direct external fetch() calls.
 */

'use strict';

// ─────────────────────────────────────────────
// i18n + Theme bootstrap
// Loaded via dynamic import since popup runs as a classic script.
// We use a self-contained inline approach to avoid module complications.
// ─────────────────────────────────────────────

/**
 * Minimal inline i18n loader for the popup.
 * Full i18n engine lives in lib/i18n.js (used by content scripts).
 * The popup uses chrome.runtime.getURL to import it as a module.
 */
let _t    = key => key;  // placeholder until i18n loads
let _lang = 'en';
let _theme = 'dark';

// Language + theme storage keys (must match lib/i18n.js)
const LANG_KEY  = 'vl_language';
const THEME_KEY = 'vl_theme';

// ─────────────────────────────────────────────
// DOM References
// ─────────────────────────────────────────────

// Tabs
const tabButtons  = document.querySelectorAll('.tab');
const tabPanels   = document.querySelectorAll('.panel');

// Overview
const contextBanner     = document.getElementById('context-banner');
const contextIcon       = document.getElementById('context-icon');
const contextText       = document.getElementById('context-text');
const statTotalValue    = document.getElementById('stat-total-value');
const statItemCount     = document.getElementById('stat-item-count');
const statPricedCount   = document.getElementById('stat-priced-count');
const statMode          = document.getElementById('stat-mode');
const lastUpdatedTs     = document.getElementById('last-updated-ts');
const infoLastUpdated   = document.getElementById('info-last-updated');
const cachePriceCount   = document.getElementById('cache-price-count');
const cacheFloatCount   = document.getElementById('cache-float-count');
const btnRefreshPrices  = document.getElementById('btn-refresh-prices');
const btnOpenInventory  = document.getElementById('btn-open-inventory');
const overviewStatus    = document.getElementById('overview-status');

// Settings
const modeSkinport      = document.getElementById('mode-skinport');
const modePricempire    = document.getElementById('mode-pricempire');
const apiKeySection     = document.getElementById('api-key-section');
const apiKeyInput       = document.getElementById('api-key-input');
const btnToggleKey      = document.getElementById('btn-toggle-key');
const btnSaveSettings   = document.getElementById('btn-save-settings');
const settingsStatus    = document.getElementById('settings-status');
const toggleFloats      = document.getElementById('toggle-floats');
const toggleStickers    = document.getElementById('toggle-stickers');
const togglePatterns    = document.getElementById('toggle-patterns');
const toggleTradelock   = document.getElementById('toggle-tradelock');
const btnClearCache     = document.getElementById('btn-clear-cache');
const cacheStatus       = document.getElementById('cache-status');
// Language & Theme (Settings tab)
const languageSelect    = document.getElementById('language-select');
const themeSwitcher     = document.getElementById('theme-switcher');
const themeButtons      = document.querySelectorAll('.theme-btn');

// ─────────────────────────────────────────────
// State
// ─────────────────────────────────────────────

/** Currently active tab key */
let activeTab     = 'overview';
/** Last loaded settings object */
let currentSettings = {};
/** Currently active Chrome tab info */
let activePageInfo  = { type: 'other', url: '', steamId: '' };

// ─────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────

/**
 * Send a message to background.js and return a Promise.
 * @param {Object} msg
 * @returns {Promise<Object>}
 */
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
      resolve(response || {});
    });
  });
}

/**
 * Show a status message in a given element.
 * @param {HTMLElement} el
 * @param {string}      message
 * @param {'success'|'error'|'info'} type
 * @param {number}      [duration=3000] - Auto-hide after ms (0 = permanent)
 */
function showStatus(el, message, type = 'info', duration = 3000) {
  el.textContent  = message;
  el.className    = `status-msg status-msg--${type}`;
  el.style.display = 'block';

  if (duration > 0) {
    setTimeout(() => {
      el.style.display = 'none';
    }, duration);
  }
}

/**
 * Format a Unix timestamp (ms) as a human-readable relative time.
 * @param {number} ts
 * @returns {string}
 */
function timeSince(ts) {
  if (!ts) return t('cacheNever');
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60)   return t('timeUnitSec').replace('{n}', secs);
  if (secs < 3600) return t('timeUnitMin').replace('{n}', Math.floor(secs / 60));
  if (secs < 86400)return t('timeUnitHour').replace('{n}', Math.floor(secs / 3600));
  return t('timeUnitDay').replace('{n}', Math.floor(secs / 86400));
}

/**
 * Format a USD price value.
 * @param {number|null} price
 * @returns {string}
 */
function formatPrice(price) {
  if (price === null || price === undefined || isNaN(price)) return '—';
  if (price >= 10000) return `$${Math.round(price / 1000)}K`;
  if (price >= 1000)  return `$${(price / 1000).toFixed(1)}K`;
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(price);
}

// ─────────────────────────────────────────────
// Tab Switching
// ─────────────────────────────────────────────

/**
 * Activate a tab by its data-tab key.
 * Updates ARIA attributes, active classes, and panel visibility.
 * @param {string} tabKey - 'overview' | 'settings' | 'about'
 */
function activateTab(tabKey) {
  activeTab = tabKey;

  tabButtons.forEach(btn => {
    const isActive = btn.dataset.tab === tabKey;
    btn.classList.toggle('tab--active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  tabPanels.forEach(panel => {
    const isActive = panel.id === `panel-${tabKey}`;
    panel.classList.toggle('panel--active', isActive);
    panel.style.display = isActive ? 'flex' : 'none';
    if (isActive) {
      panel.removeAttribute('hidden');
    } else {
      panel.setAttribute('hidden', '');
    }
  });

  // Refresh data when switching to overview
  if (tabKey === 'overview') {
    loadOverviewData();
  }
}

// Attach tab click handlers
tabButtons.forEach(btn => {
  btn.addEventListener('click', () => activateTab(btn.dataset.tab));
});

// ─────────────────────────────────────────────
// Page Context Detection
// ─────────────────────────────────────────────

/**
 * Detect what kind of Steam page the active Chrome tab is showing.
 * Updates the context banner in the Overview tab.
 * @returns {Promise<{ type: string, url: string }>}
 */
async function detectActivePage() {
  return new Promise(resolve => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (!tabs || tabs.length === 0) {
        resolve({ type: 'other', url: '', title: '' });
        return;
      }

      const tab = tabs[0];
      const url = tab.url || '';

      let type  = 'other';

      if (url.match(/steamcommunity\.com\/(id|profiles)\/[^/]+\/inventory/)) {
        type = 'inventory';
      } else if (url.match(/steamcommunity\.com\/tradeoffer\//)) {
        type = 'trade-offer';
      } else if (url.match(/steamcommunity\.com\/(id|profiles)\/[^/]+\/tradeoffers/)) {
        type = 'trade-list';
      } else if (url.includes('steamcommunity.com')) {
        type = 'steam-other';
      }

      resolve({ type, url, title: tab.title || '' });
    });
  });
}

/**
 * Update the context banner UI element based on detected page type.
 */
function updateContextBanner(pageInfo) {
  contextBanner.className = 'context-banner';
  switch (pageInfo.type) {
    case 'inventory':
      contextBanner.classList.add('context-banner--inventory');
      contextIcon.textContent = '📦';
      contextText.textContent = t('contextInventory');
      break;
    case 'trade-offer':
      contextBanner.classList.add('context-banner--trade');
      contextIcon.textContent = '🤝';
      contextText.textContent = t('contextTradeOffer');
      break;
    case 'trade-list':
      contextBanner.classList.add('context-banner--trade');
      contextIcon.textContent = '📋';
      contextText.textContent = t('contextTradeList');
      break;
    case 'steam-other':
      contextBanner.classList.add('context-banner--other');
      contextIcon.textContent = '🎮';
      contextText.textContent = t('contextSteamOther');
      break;
    default:
      contextBanner.classList.add('context-banner--other');
      contextIcon.textContent = '🔍';
      contextText.textContent = t('contextNotSteam');
      break;
  }
}

// ─────────────────────────────────────────────
// Overview Tab Data Loading
// ─────────────────────────────────────────────

/**
 * Load and render all Overview tab data:
 *  - Page context
 *  - Cache stats
 *  - Inventory value (if on inventory page, injected by content script)
 *  - Last updated timestamp
 */
async function loadOverviewData() {
  // ── Page context ──────────────────────────────
  try {
    const pageInfo = await detectActivePage();
    activePageInfo = pageInfo;
    updateContextBanner(pageInfo);
  } catch {
    updateContextBanner({ type: 'other' });
  }

  // ── Cache stats ───────────────────────────────
  try {
    const stats = await bgMessage({ action: 'GET_CACHE_STATS' });
    cachePriceCount.textContent = stats.priceEntries
      ? t('cacheItems').replace('{n}', stats.priceEntries.toLocaleString())
      : t('cacheEmpty');
    cacheFloatCount.textContent = stats.floatEntries
      ? t('cacheItems').replace('{n}', stats.floatEntries.toLocaleString())
      : t('cacheEmpty');

    if (stats.priceCacheTs) {
      lastUpdatedTs.textContent   = timeSince(stats.priceCacheTs);
      infoLastUpdated.style.display = 'flex';
    }
  } catch {
    cachePriceCount.textContent = '—';
    cacheFloatCount.textContent = '—';
  }

  // ── Settings (for mode display) ───────────────
  try {
    const resp     = await bgMessage({ action: 'GET_SETTINGS' });
    currentSettings = resp.settings || {};
    const modeLabel = currentSettings.pricingMode === 'pricempire'
      ? 'PricEmpire'
      : 'Skinport';
    statMode.textContent = modeLabel;
  } catch {
    statMode.textContent = '—';
  }

  // ── Inventory value: request from active content script ──
  // We ask the active tab's content script for its current stats.
  // If the content script is not loaded (non-inventory page), this silently fails.
  try {
    await queryContentScriptStats();
  } catch {
    // Content script not available — set placeholder stats
    statTotalValue.textContent  = '—';
    statItemCount.textContent   = '—';
    statPricedCount.textContent = '—';
  }
}

/**
 * Query the active tab's inventory content script for live stats.
 * Uses chrome.tabs.sendMessage to the content script.
 */
async function queryContentScriptStats() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (!tabs || tabs.length === 0) { reject(new Error('No active tab')); return; }

      const tabId = tabs[0].id;
      chrome.tabs.sendMessage(tabId, { action: 'GET_INVENTORY_STATS' }, response => {
        if (chrome.runtime.lastError) {
          // Content script not loaded — not an error state, just no data
          reject(new Error('Content script not available'));
          return;
        }
        if (!response) { reject(new Error('No response')); return; }

        // Update stats display
        if (response.totalValue !== undefined) {
          statTotalValue.textContent  = formatPrice(response.totalValue);
          statItemCount.textContent   = response.itemCount   ?? '—';
          statPricedCount.textContent = response.pricedCount !== undefined
            ? `${response.pricedCount} / ${response.itemCount}`
            : '—';
        }
        resolve(response);
      });
    });
  });
}

// ─────────────────────────────────────────────
// Overview Tab — Button Handlers
// ─────────────────────────────────────────────

/**
 * Refresh prices button: triggers a forced price fetch in background.js
 * then refreshes the popup's displayed stats.
 */
btnRefreshPrices.addEventListener('click', async () => {
  btnRefreshPrices.disabled    = true;
  btnRefreshPrices.textContent = t('btnRefreshing');

  try {
    const resp = await bgMessage({ action: 'FETCH_PRICES' });
    const count = resp.priceMap ? Object.keys(resp.priceMap).length : 0;
    showStatus(overviewStatus, t('statusRefreshed').replace('{n}', count.toLocaleString()), 'success');

    // Refresh the displayed timestamp
    lastUpdatedTs.textContent = t('timeJustNow');

    // Also tell the active content script to re-render overlays
    notifyContentScriptPricesUpdated(resp.priceMap, resp.mode);
  } catch (err) {
    showStatus(overviewStatus, `✗ ${err.message}`, 'error');
  } finally {
    btnRefreshPrices.disabled    = false;
    btnRefreshPrices.textContent = t('btnRefreshPrices');
  }
});

/**
 * Open Inventory button: opens the Steam inventory for the current user.
 * If we're already on Steam, it navigates to /inventory; otherwise opens new tab.
 */
btnOpenInventory.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs || tabs.length === 0) return;

    // If already on a Steam page, update the tab; otherwise create a new one
    const url = 'https://steamcommunity.com/id/me/inventory/#730';
    if (tabs[0].url && tabs[0].url.includes('steamcommunity.com')) {
      chrome.tabs.update(tabs[0].id, { url });
    } else {
      chrome.tabs.create({ url });
    }
    window.close();
  });
});

/**
 * Notify the active content script that prices have been updated.
 * The content script listens for this and re-renders all item overlays.
 */
function notifyContentScriptPricesUpdated(priceMap, mode) {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs || tabs.length === 0) return;
    chrome.tabs.sendMessage(tabs[0].id, {
      action: 'PRICES_UPDATED',
      priceMap,
      mode,
    }, () => {
      // Ignore errors — content script may not be loaded
      void chrome.runtime.lastError;
    });
  });
}

// ─────────────────────────────────────────────
// Settings Tab — Load
// ─────────────────────────────────────────────

/**
 * Load current settings from background.js and populate the Settings UI.
 */
async function loadSettings() {
  try {
    const resp      = await bgMessage({ action: 'GET_SETTINGS' });
    currentSettings = resp.settings || {};
      // Sync language selector to current setting
      if (languageSelect && _lang) {
        languageSelect.value = _lang;
      }
  } catch {
    currentSettings = {};
  }

  // ── Pricing mode radio ────────────────────────
  const mode = currentSettings.pricingMode || 'skinport';
  if (mode === 'pricempire') {
    modePricempire.checked = true;
    showApiKeySection(true);
  } else {
    modeSkinport.checked = true;
    showApiKeySection(false);
  }

  // ── API key ───────────────────────────────────
  if (currentSettings.pricempireApiKey) {
    apiKeyInput.value = currentSettings.pricempireApiKey;
  }

  // ── Display toggles ───────────────────────────
  toggleFloats.checked    = currentSettings.showFloats        !== false;
  toggleStickers.checked  = currentSettings.showStickerPrices !== false;
  togglePatterns.checked  = currentSettings.showPatternBadges !== false;
  toggleTradelock.checked = currentSettings.showTradeLock     !== false;
}

// ─────────────────────────────────────────────
// Settings Tab — Pricing Mode Toggle
// ─────────────────────────────────────────────

/**
 * Show or hide the API key input section.
 * @param {boolean} show
 */
function showApiKeySection(show) {
  apiKeySection.style.display = show ? 'flex' : 'none';
}

modeSkinport.addEventListener('change', () => {
  if (modeSkinport.checked) showApiKeySection(false);
});

modePricempire.addEventListener('change', () => {
  if (modePricempire.checked) showApiKeySection(true);
});

// ─────────────────────────────────────────────
// Settings Tab — API Key Visibility Toggle
// ─────────────────────────────────────────────

let apiKeyVisible = false;
btnToggleKey.addEventListener('click', () => {
  apiKeyVisible        = !apiKeyVisible;
  apiKeyInput.type     = apiKeyVisible ? 'text' : 'password';
  btnToggleKey.textContent = apiKeyVisible ? '🙈' : '👁';
});

// ─────────────────────────────────────────────
// Settings Tab — Save Settings
// ─────────────────────────────────────────────

/**
 * Collect current UI state, validate, save to storage, and optionally
 * trigger a fresh price fetch if the mode or API key changed.
 */
btnSaveSettings.addEventListener('click', async () => {
  btnSaveSettings.disabled    = true;
  btnSaveSettings.textContent = t('btnSaving');

  try {
    const newMode   = modePricempire.checked ? 'pricempire' : 'skinport';
    const newApiKey = apiKeyInput.value.trim();

    // Validate: PricEmpire mode requires an API key
    if (newMode === 'pricempire' && !newApiKey) {
      showStatus(settingsStatus, t('statusApiKeyRequired'), 'error');
      return;
    }

    const newSettings = {
      pricingMode:       newMode,
      pricempireApiKey:  newApiKey,
      showFloats:        toggleFloats.checked,
      showStickerPrices: toggleStickers.checked,
      showPatternBadges: togglePatterns.checked,
      showTradeLock:     toggleTradelock.checked,
    };

    // Check if pricing-relevant settings changed (triggers re-fetch)
    const modeChanged   = currentSettings.pricingMode      !== newSettings.pricingMode;
    const keyChanged    = currentSettings.pricempireApiKey !== newSettings.pricempireApiKey;
    const needsRefetch  = modeChanged || keyChanged;

    // Save settings
    await bgMessage({ action: 'SAVE_SETTINGS', settings: newSettings });
    currentSettings = newSettings;

    if (needsRefetch) {
      // Trigger fresh price fetch with new settings
      showStatus(settingsStatus, t('statusFetching'), 'info', 0);
      const resp  = await bgMessage({ action: 'FETCH_PRICES' });
      const count = resp.priceMap ? Object.keys(resp.priceMap).length : 0;
      showStatus(settingsStatus, `✓ ${count.toLocaleString()} ${t('btnRefreshPrices').replace('↻ ','')}`, 'success', 4000);
      // Notify content scripts
      notifyContentScriptPricesUpdated(resp.priceMap, resp.mode);
    } else {
      showStatus(settingsStatus, t('statusSaved'), 'success');
      // Notify content scripts of display setting changes
      notifyContentScriptSettingsUpdated(newSettings);
    }

  } catch (err) {
    showStatus(settingsStatus, `✗ ${err.message}`, 'error');
  } finally {
    btnSaveSettings.disabled    = false;
    btnSaveSettings.textContent = t('btnSaveSettings');
  }
});

/**
 * Notify active content script that display settings changed.
 */
function notifyContentScriptSettingsUpdated(settings) {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs || tabs.length === 0) return;
    chrome.tabs.sendMessage(tabs[0].id, {
      action: 'SETTINGS_UPDATED',
      settings,
    }, () => { void chrome.runtime.lastError; });
  });
}

// ─────────────────────────────────────────────
// Settings Tab — Cache Clear
// ─────────────────────────────────────────────

btnClearCache.addEventListener('click', async () => {
  // Confirm before destructive action
  const confirmed = confirm(t('clearCacheConfirm'));
  if (!confirmed) return;

  btnClearCache.disabled    = true;
  btnClearCache.textContent = t('btnClearing');

  try {
    await bgMessage({ action: 'CLEAR_CACHE' });
    showStatus(cacheStatus, t('statusCacheCleared'), 'success');

    // Refresh overview stats
    cachePriceCount.textContent = t('cacheEmpty');
    cacheFloatCount.textContent = t('cacheEmpty');
    lastUpdatedTs.textContent   = t('cacheNever');
  } catch (err) {
    showStatus(cacheStatus, `✗ ${err.message}`, 'error');
  } finally {
    btnClearCache.disabled    = false;
    btnClearCache.textContent = t('btnClearCache');
  }
});

// ─────────────────────────────────────────────
// Content Script Message Listener
// ─────────────────────────────────────────────

/**
 * Listen for messages from content scripts.
 * Content scripts may push inventory stats to the popup when it's open.
 */
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'INVENTORY_STATS_UPDATE' && activeTab === 'overview') {
    // Content script is pushing live stats
    if (message.totalValue !== undefined) {
      statTotalValue.textContent  = formatPrice(message.totalValue);
      statItemCount.textContent   = message.itemCount   ?? '—';
      statPricedCount.textContent = message.pricedCount !== undefined
        ? `${message.pricedCount} / ${message.itemCount}`
        : '—';
    }
  }
});

// ─────────────────────────────────────────────
// Keyboard Navigation
// ─────────────────────────────────────────────

/**
 * Arrow key navigation between tabs (accessibility).
 */
document.addEventListener('keydown', e => {
  if (!e.target.closest('.tabs')) return;

  const tabs  = ['overview', 'settings', 'about'];
  const idx   = tabs.indexOf(activeTab);

  if (e.key === 'ArrowRight' && idx < tabs.length - 1) {
    activateTab(tabs[idx + 1]);
    document.getElementById(`tab-${tabs[idx + 1]}`)?.focus();
  } else if (e.key === 'ArrowLeft' && idx > 0) {
    activateTab(tabs[idx - 1]);
    document.getElementById(`tab-${tabs[idx - 1]}`)?.focus();
  }
});

// ─────────────────────────────────────────────
// Auto-refresh overview stats every 30s while popup is open
// ─────────────────────────────────────────────

let overviewRefreshInterval = null;

function startOverviewAutoRefresh() {
  overviewRefreshInterval = setInterval(() => {
    if (activeTab === 'overview') {
      // Silently refresh timestamp displays
      bgMessage({ action: 'GET_CACHE_STATS' }).then(stats => {
        if (stats.priceCacheTs) {
          lastUpdatedTs.textContent = timeSince(stats.priceCacheTs);
        }
      }).catch(() => {});
    }
  }, 30000);
}

// Clean up interval when popup closes
window.addEventListener('unload', () => {
  if (overviewRefreshInterval) clearInterval(overviewRefreshInterval);
});

// ─────────────────────────────────────────────
// i18n Bootstrap (Popup)
// ─────────────────────────────────────────────

/**
 * Supported languages list — mirrors lib/i18n.js SUPPORTED_LANGUAGES.
 * Inlined here to avoid module import complexity in popup context.
 */
const SUPPORTED_LANGUAGES = [
  { code: 'af',       name: 'Afrikaans',             native: 'Afrikaans'           },
  { code: 'sq',       name: 'Albanian',               native: 'Shqip'               },
  { code: 'am',       name: 'Amharic',                native: 'አማርኛ'                },
  { code: 'ar',       name: 'Arabic',                 native: 'العربية'             },
  { code: 'hy',       name: 'Armenian',               native: 'Հայերեն'             },
  { code: 'as',       name: 'Assamese',               native: 'অসমীয়া'             },
  { code: 'ay',       name: 'Aymara',                 native: 'Aymar'               },
  { code: 'az',       name: 'Azerbaijani',            native: 'Azərbaycan'          },
  { code: 'bm',       name: 'Bambara',                native: 'Bamanankan'          },
  { code: 'eu',       name: 'Basque',                 native: 'Euskara'             },
  { code: 'be',       name: 'Belarusian',             native: 'Беларуская'          },
  { code: 'bn',       name: 'Bengali',                native: 'বাংলা'               },
  { code: 'bho',      name: 'Bhojpuri',               native: 'भोजपुरी'             },
  { code: 'bs',       name: 'Bosnian',                native: 'Bosanski'            },
  { code: 'bg',       name: 'Bulgarian',              native: 'Български'           },
  { code: 'ca',       name: 'Catalan',                native: 'Català'              },
  { code: 'ceb',      name: 'Cebuano',                native: 'Cebuano'             },
  { code: 'ny',       name: 'Chichewa',               native: 'Chichewa'            },
  { code: 'zh-CN',    name: 'Chinese (Simplified)',   native: '中文（简体）'          },
  { code: 'zh-TW',    name: 'Chinese (Traditional)', native: '中文（繁體）'          },
  { code: 'co',       name: 'Corsican',               native: 'Corsu'               },
  { code: 'hr',       name: 'Croatian',               native: 'Hrvatski'            },
  { code: 'cs',       name: 'Czech',                  native: 'Čeština'             },
  { code: 'da',       name: 'Danish',                 native: 'Dansk'               },
  { code: 'dv',       name: 'Dhivehi',                native: 'ދިވެހި'              },
  { code: 'doi',      name: 'Dogri',                  native: 'डोगरी'               },
  { code: 'nl',       name: 'Dutch',                  native: 'Nederlands'          },
  { code: 'en',       name: 'English',                native: 'English'             },
  { code: 'eo',       name: 'Esperanto',              native: 'Esperanto'           },
  { code: 'et',       name: 'Estonian',               native: 'Eesti'               },
  { code: 'ee',       name: 'Ewe',                    native: 'Eʋegbe'              },
  { code: 'tl',       name: 'Filipino',               native: 'Filipino'            },
  { code: 'fi',       name: 'Finnish',                native: 'Suomi'               },
  { code: 'fr',       name: 'French',                 native: 'Français'            },
  { code: 'fy',       name: 'Frisian',                native: 'Frysk'               },
  { code: 'gl',       name: 'Galician',               native: 'Galego'              },
  { code: 'ka',       name: 'Georgian',               native: 'ქართული'             },
  { code: 'de',       name: 'German',                 native: 'Deutsch'             },
  { code: 'el',       name: 'Greek',                  native: 'Ελληνικά'            },
  { code: 'gn',       name: 'Guarani',                native: 'Avañeẽ'              },
  { code: 'gu',       name: 'Gujarati',               native: 'ગુજરાતી'             },
  { code: 'ht',       name: 'Haitian Creole',         native: 'Kreyòl ayisyen'      },
  { code: 'ha',       name: 'Hausa',                  native: 'Hausa'               },
  { code: 'haw',      name: 'Hawaiian',               native: 'ʻŌlelo Hawaiʻi'     },
  { code: 'iw',       name: 'Hebrew',                 native: 'עברית'               },
  { code: 'hi',       name: 'Hindi',                  native: 'हिन्दी'              },
  { code: 'hmn',      name: 'Hmong',                  native: 'Hmong'               },
  { code: 'hu',       name: 'Hungarian',              native: 'Magyar'              },
  { code: 'is',       name: 'Icelandic',              native: 'Íslenska'            },
  { code: 'ig',       name: 'Igbo',                   native: 'Igbo'                },
  { code: 'ilo',      name: 'Ilocano',                native: 'Ilocano'             },
  { code: 'id',       name: 'Indonesian',             native: 'Indonesia'           },
  { code: 'ga',       name: 'Irish',                  native: 'Gaeilge'             },
  { code: 'it',       name: 'Italian',                native: 'Italiano'            },
  { code: 'ja',       name: 'Japanese',               native: '日本語'               },
  { code: 'jw',       name: 'Javanese',               native: 'Basa Jawa'           },
  { code: 'kn',       name: 'Kannada',                native: 'ಕನ್ನಡ'               },
  { code: 'kk',       name: 'Kazakh',                 native: 'Қазақ'               },
  { code: 'km',       name: 'Khmer',                  native: 'ខ្មែរ'               },
  { code: 'rw',       name: 'Kinyarwanda',            native: 'Kinyarwanda'         },
  { code: 'gom',      name: 'Konkani',                native: 'कोंकणी'              },
  { code: 'ko',       name: 'Korean',                 native: '한국어'               },
  { code: 'kri',      name: 'Krio',                   native: 'Krio'                },
  { code: 'ku',       name: 'Kurdish (Kurmanji)',      native: 'Kurdî (Kurmancî)'    },
  { code: 'ckb',      name: 'Kurdish (Sorani)',        native: 'کوردی (سۆرانی)'     },
  { code: 'ky',       name: 'Kyrgyz',                 native: 'Кыргызча'            },
  { code: 'lo',       name: 'Lao',                    native: 'ລາວ'                 },
  { code: 'la',       name: 'Latin',                  native: 'Latina'              },
  { code: 'lv',       name: 'Latvian',                native: 'Latviešu'            },
  { code: 'ln',       name: 'Lingala',                native: 'Lingála'             },
  { code: 'lt',       name: 'Lithuanian',             native: 'Lietuvių'            },
  { code: 'lg',       name: 'Luganda',                native: 'Luganda'             },
  { code: 'lb',       name: 'Luxembourgish',          native: 'Lëtzebuergesch'      },
  { code: 'mk',       name: 'Macedonian',             native: 'Македонски'          },
  { code: 'mai',      name: 'Maithili',               native: 'मैथिली'              },
  { code: 'mg',       name: 'Malagasy',               native: 'Malagasy'            },
  { code: 'ms',       name: 'Malay',                  native: 'Melayu'              },
  { code: 'ml',       name: 'Malayalam',              native: 'മലയാളം'              },
  { code: 'mt',       name: 'Maltese',                native: 'Malti'               },
  { code: 'mi',       name: 'Maori',                  native: 'Māori'               },
  { code: 'mr',       name: 'Marathi',                native: 'मराठी'               },
  { code: 'mni-Mtei', name: 'Meitei (Manipuri)',      native: 'ꯃꯤꯇꯩꯂꯣꯟ'            },
  { code: 'lus',      name: 'Mizo',                   native: 'Mizo ṭawng'          },
  { code: 'mn',       name: 'Mongolian',              native: 'Монгол'              },
  { code: 'my',       name: 'Myanmar (Burmese)',      native: 'မြန်မာ'              },
  { code: 'ne',       name: 'Nepali',                 native: 'नेपाली'              },
  { code: 'no',       name: 'Norwegian',              native: 'Norsk'               },
  { code: 'or',       name: 'Odia (Oriya)',           native: 'ଓଡ଼ିଆ'               },
  { code: 'om',       name: 'Oromo',                  native: 'Afaan Oromoo'        },
  { code: 'ps',       name: 'Pashto',                 native: 'پښتو'                },
  { code: 'fa',       name: 'Persian',                native: 'فارسی'               },
  { code: 'pl',       name: 'Polish',                 native: 'Polski'              },
  { code: 'pt',       name: 'Portuguese',             native: 'Português'           },
  { code: 'pa',       name: 'Punjabi',                native: 'ਪੰਜਾਬੀ'              },
  { code: 'qu',       name: 'Quechua',                native: 'Qichwa'              },
  { code: 'ro',       name: 'Romanian',               native: 'Română'              },
  { code: 'ru',       name: 'Russian',                native: 'Русский'             },
  { code: 'sm',       name: 'Samoan',                 native: 'Gagana Samoa'        },
  { code: 'sa',       name: 'Sanskrit',               native: 'संस्कृत'             },
  { code: 'gd',       name: 'Scottish Gaelic',        native: 'Gàidhlig'            },
  { code: 'nso',      name: 'Sepedi',                 native: 'Sepedi'              },
  { code: 'sr',       name: 'Serbian',                native: 'Српски'              },
  { code: 'st',       name: 'Sesotho',                native: 'Sesotho'             },
  { code: 'sn',       name: 'Shona',                  native: 'ChiShona'            },
  { code: 'sd',       name: 'Sindhi',                 native: 'سنڌي'               },
  { code: 'si',       name: 'Sinhala',                native: 'සිංහල'               },
  { code: 'sk',       name: 'Slovak',                 native: 'Slovenčina'          },
  { code: 'sl',       name: 'Slovenian',              native: 'Slovenščina'         },
  { code: 'so',       name: 'Somali',                 native: 'Soomaali'            },
  { code: 'es',       name: 'Spanish',                native: 'Español'             },
  { code: 'su',       name: 'Sundanese',              native: 'Basa Sunda'          },
  { code: 'sw',       name: 'Swahili',                native: 'Kiswahili'           },
  { code: 'sv',       name: 'Swedish',                native: 'Svenska'             },
  { code: 'tg',       name: 'Tajik',                  native: 'Тоҷикӣ'              },
  { code: 'ta',       name: 'Tamil',                  native: 'தமிழ்'               },
  { code: 'tt',       name: 'Tatar',                  native: 'Татар'               },
  { code: 'te',       name: 'Telugu',                 native: 'తెలుగు'              },
  { code: 'th',       name: 'Thai',                   native: 'ภาษาไทย'             },
  { code: 'ti',       name: 'Tigrinya',               native: 'ትግርኛ'               },
  { code: 'ts',       name: 'Tsonga',                 native: 'Xitsonga'            },
  { code: 'tr',       name: 'Turkish',                native: 'Türkçe'              },
  { code: 'tk',       name: 'Turkmen',                native: 'Türkmen'             },
  { code: 'ak',       name: 'Twi',                    native: 'Twi'                 },
  { code: 'uk',       name: 'Ukrainian',              native: 'Українська'          },
  { code: 'ur',       name: 'Urdu',                   native: 'اردو'               },
  { code: 'ug',       name: 'Uyghur',                 native: 'ئۇيغۇرچە'            },
  { code: 'uz',       name: 'Uzbek',                  native: "O'zbek"              },
  { code: 'vi',       name: 'Vietnamese',             native: 'Tiếng Việt'          },
  { code: 'cy',       name: 'Welsh',                  native: 'Cymraeg'             },
  { code: 'xh',       name: 'Xhosa',                  native: 'isiXhosa'            },
  { code: 'yi',       name: 'Yiddish',                native: 'ייִדיש'              },
  { code: 'yo',       name: 'Yoruba',                 native: 'Yorùbá'              },
  { code: 'zu',       name: 'Zulu',                   native: 'isiZulu'             },
];

/** RTL language codes */
const RTL_LANGS = new Set(['ar','iw','fa','ur','ps','sd','ug','yi','ckb','dv','ku']);

/**
 * Runtime translation strings (popup-critical keys only).
 * Full set lives in lib/i18n.js for content script use.
 */
const POPUP_TRANSLATIONS = {
  en: {
    tabOverview:'Overview', tabSettings:'Settings', tabAbout:'About',
    btnRefreshPrices:'↻ Refresh Prices', btnOpenInventory:'Open Inventory',
    btnSaveSettings:'💾 Save & Fetch Prices', btnClearCache:'🗑 Clear All Cache',
    sectionPricingMode:'Pricing Mode', sectionDisplay:'Display Options',
    sectionCache:'Cache', sectionLanguage:'Language', sectionTheme:'Appearance',
    labelLanguage:'Interface Language',
    labelLanguageNote:'UI language for VaultLens overlays and popup',
    labelTheme:'Theme', themeDark:'Dark', themeLight:'Light', themeSystem:'System Default',
    modeSkinportName:'Skinport', modeSkinportBadge:'Free',
    modeSkinportDesc:'No API key required. Uses Skinport public API.',
    modePricempireName:'PricEmpire + CSFloat', modePricempireBadge:'API Key',
    modePricempireDesc:'Buff163, Skinport & CSFloat prices. Requires API key.',
    labelApiKey:'PricEmpire API Key', linkGetKey:'Get key →',
    toggleFloatsLabel:'Show Float Values', toggleStickersLabel:'Show Sticker Prices',
    togglePatternsLabel:'Show Pattern Badges', toggleTradelockLabel:'Show Trade Lock Countdowns',
    toggleFloatsDesc:'Display float value badges on inventory items',
    toggleStickersDesc:'Show sticker value hover popup',
    togglePatternsDesc:'Blue gem, Doppler phase, fade %, marble fade patterns',
    toggleTradelockDesc:'Display 🔒 badge with days remaining on locked items',
    labelCacheTTL:'Price cache TTL', valueCacheTTL:'1 hour',
    labelFloatCache:'Float cache', valueFloatCache:'Permanent (per item)',
    statTotalValue:'Total Value', statItems:'Items', statPriced:'Priced', statMode:'Mode',
    labelPricesUpdated:'Prices updated', labelPriceEntries:'Price entries',
    labelFloatEntries:'Float entries',
    statusSaved:'✓ Settings saved', statusCacheCleared:'✓ Cache cleared successfully',
    statusApiKeyRequired:'✗ Please enter your PricEmpire API key',
    privacyTitle:'🔒 Privacy',
    privacyText:'VaultLens is free and open source. No data is collected or tracked.',
    sectionDataSources:'Data Sources', sectionLimitations:'Known Limitations',
    linkChromeStore:'🏪 Chrome Web Store', linkGitHub:'📦 GitHub Repository',
    linkIssues:'🐛 Report an Issue', aboutDesc:'Real-time CS2 inventory pricing.',
    contextNotSteam:'Not on a Steam page', contextInventory:'CS2 Inventory — VaultLens active',
    contextTradeOffer:'Trade Offer — P&L panel active',
    contextTradeList:'Trade Offers List — P&L badges active',
    contextSteamOther:'Steam page — navigate to inventory',
    // About section — Data Sources labels
    aboutLabelPricesMode1:'Prices (Mode 1)',
    aboutLabelPricesMode2:'Prices (Mode 2)',
    aboutLabelFloatPattern:'Float / Pattern',
    aboutLabelDopplerListings:'Doppler Listings',
    // About section — Known Limitations
    limitRateLimits:'CSGOFloat API has rate limits (~5 req/s). Float loading may be slow for large inventories.',
    limitFadeApprox:'Fade % values are approximate (±0.5%) based on community-researched seed tables.',
    limitPatternTier:'Pattern tier data reflects community consensus; rankings may not match all buyer preferences.',
    limitCrimsonWeb:'Crimson Web pattern detection uses seed range approximations; visual verification recommended.',
    limitTradeLock:'Trade lock detection relies on Steam\'s description format, which may vary.',
    // Cache / time strings (used in JS)
    cacheItems:'{n} items',
    cacheEmpty:'Empty',
    cacheNever:'Never',
    timeJustNow:'Just now',
    timeUnitSec:'{n}s ago',
    timeUnitMin:'{n}m ago',
    timeUnitHour:'{n}h ago',
    timeUnitDay:'{n}d ago',
    // Button loading states
    btnRefreshing:'⏳ Refreshing...',
    btnSaving:'⏳ Saving...',
    btnClearing:'⏳ Clearing...',
    clearCacheConfirm:'Clear all cached prices and float data?\n\nPrices will be re-fetched on next use. Float data will be re-fetched as items are viewed.',
    statusRefreshed:'✓ Refreshed — {n} prices loaded',
    statusFetching:'⏳ Fetching prices with new settings...',
  },
  ru: {
    tabOverview:'Обзор', tabSettings:'Настройки', tabAbout:'О расширении',
    btnRefreshPrices:'↻ Обновить цены', btnOpenInventory:'Открыть инвентарь',
    btnSaveSettings:'💾 Сохранить и загрузить', btnClearCache:'🗑 Очистить кэш',
    sectionPricingMode:'Режим цен', sectionDisplay:'Отображение',
    sectionCache:'Кэш', sectionLanguage:'Язык', sectionTheme:'Тема',
    labelLanguage:'Язык интерфейса', labelTheme:'Тема',
    themeDark:'Тёмная', themeLight:'Светлая', themeSystem:'Системная',
    modeSkinportName:'Skinport', modeSkinportBadge:'Бесплатно',
    modePricempireName:'PricEmpire + CSFloat', modePricempireBadge:'API ключ',
    labelApiKey:'API-ключ PricEmpire', linkGetKey:'Получить ключ →',
    toggleFloatsLabel:'Показывать Float', toggleStickersLabel:'Показывать цены стикеров',
    togglePatternsLabel:'Показывать паттерны', toggleTradelockLabel:'Показывать блокировку трейда',
    labelCacheTTL:'TTL кэша цен', valueCacheTTL:'1 час',
    labelFloatCache:'Кэш float', valueFloatCache:'Постоянный (на предмет)',
    statTotalValue:'Общая стоимость', statItems:'Предметы',
    statPriced:'Оценено', statMode:'Режим',
    labelPricesUpdated:'Цены обновлены', labelPriceEntries:'Записей цен',
    labelFloatEntries:'Записей float',
    statusSaved:'✓ Настройки сохранены', statusCacheCleared:'✓ Кэш очищен',
    statusApiKeyRequired:'✗ Введите API-ключ PricEmpire',
    contextNotSteam:'Не на странице Steam',
    contextInventory:'Инвентарь CS2 — VaultLens активен',
    contextTradeOffer:'Предложение обмена — панель П/У активна',
    contextTradeList:'Список обменов — значки П/У активны',
    contextSteamOther:'Страница Steam — перейдите в инвентарь',
  },
  'zh-CN': {
    tabOverview:'概览', tabSettings:'设置', tabAbout:'关于',
    btnRefreshPrices:'↻ 刷新价格', btnOpenInventory:'打开库存',
    btnSaveSettings:'💾 保存并获取价格', btnClearCache:'🗑 清除缓存',
    sectionPricingMode:'定价模式', sectionDisplay:'显示选项',
    sectionCache:'缓存', sectionLanguage:'语言', sectionTheme:'外观',
    labelLanguage:'界面语言', labelTheme:'主题',
    themeDark:'深色', themeLight:'浅色', themeSystem:'跟随系统',
    modeSkinportName:'Skinport', modeSkinportBadge:'免费',
    modePricempireName:'PricEmpire + CSFloat', modePricempireBadge:'需要API密钥',
    labelApiKey:'PricEmpire API 密钥', linkGetKey:'获取密钥 →',
    toggleFloatsLabel:'显示磨损值', toggleStickersLabel:'显示印花价格',
    togglePatternsLabel:'显示图案徽章', toggleTradelockLabel:'显示交易锁定倒计时',
    labelCacheTTL:'价格缓存TTL', valueCacheTTL:'1小时',
    labelFloatCache:'磨损缓存', valueFloatCache:'永久（每个物品）',
    statTotalValue:'总价值', statItems:'物品', statPriced:'已定价', statMode:'模式',
    labelPricesUpdated:'价格更新时间', labelPriceEntries:'价格条目',
    labelFloatEntries:'磨损条目',
    statusSaved:'✓ 设置已保存', statusCacheCleared:'✓ 缓存已清除',
    statusApiKeyRequired:'✗ 请输入PricEmpire API密钥',
    contextNotSteam:'不在Steam页面', contextInventory:'CS2库存 — VaultLens已激活',
    contextTradeOffer:'交易报价 — 损益面板已激活',
    contextTradeList:'交易报价列表 — 损益徽章已激活',
    contextSteamOther:'Steam页面 — 前往库存',
  },
  de: {
    tabOverview:'Übersicht', tabSettings:'Einstellungen', tabAbout:'Über',
    btnRefreshPrices:'↻ Preise aktualisieren', btnOpenInventory:'Inventar öffnen',
    btnSaveSettings:'💾 Speichern & Preise laden', btnClearCache:'🗑 Cache leeren',
    sectionPricingMode:'Preismodus', sectionDisplay:'Anzeigeoptionen',
    sectionCache:'Cache', sectionLanguage:'Sprache', sectionTheme:'Erscheinungsbild',
    labelLanguage:'Oberflächensprache', labelTheme:'Thema',
    themeDark:'Dunkel', themeLight:'Hell', themeSystem:'Systemstandard',
    modeSkinportName:'Skinport', modeSkinportBadge:'Kostenlos',
    modePricempireName:'PricEmpire + CSFloat', modePricempireBadge:'API-Schlüssel',
    labelApiKey:'PricEmpire API-Schlüssel', linkGetKey:'Schlüssel holen →',
    toggleFloatsLabel:'Float-Werte anzeigen', toggleStickersLabel:'Stickerpreise anzeigen',
    togglePatternsLabel:'Muster-Badges anzeigen', toggleTradelockLabel:'Handelssperre anzeigen',
    labelCacheTTL:'Cache-TTL', valueCacheTTL:'1 Stunde',
    labelFloatCache:'Float-Cache', valueFloatCache:'Permanent (pro Item)',
    statTotalValue:'Gesamtwert', statItems:'Items', statPriced:'Bewertet', statMode:'Modus',
    labelPricesUpdated:'Preise aktualisiert', labelPriceEntries:'Preiseinträge',
    labelFloatEntries:'Float-Einträge',
    statusSaved:'✓ Einstellungen gespeichert', statusCacheCleared:'✓ Cache geleert',
    statusApiKeyRequired:'✗ Bitte API-Schlüssel eingeben',
    contextNotSteam:'Keine Steam-Seite',
    contextInventory:'CS2-Inventar — VaultLens aktiv',
    contextTradeOffer:'Handelsangebot — G/V-Panel aktiv',
    contextTradeList:'Handelsliste — G/V-Badges aktiv',
    contextSteamOther:'Steam-Seite — zum Inventar navigieren',
  },
  fr: {
    tabOverview:'Aperçu', tabSettings:'Paramètres', tabAbout:'À propos',
    btnRefreshPrices:'↻ Actualiser les prix', btnOpenInventory:"Ouvrir l'inventaire",
    btnSaveSettings:'💾 Sauvegarder et charger', btnClearCache:'🗑 Vider le cache',
    sectionPricingMode:'Mode de tarification', sectionDisplay:"Options d'affichage",
    sectionCache:'Cache', sectionLanguage:'Langue', sectionTheme:'Apparence',
    labelLanguage:"Langue de l'interface", labelTheme:'Thème',
    themeDark:'Sombre', themeLight:'Clair', themeSystem:'Système',
    modeSkinportName:'Skinport', modeSkinportBadge:'Gratuit',
    modePricempireName:'PricEmpire + CSFloat', modePricempireBadge:'Clé API',
    labelApiKey:'Clé API PricEmpire', linkGetKey:'Obtenir la clé →',
    toggleFloatsLabel:'Afficher les floats', toggleStickersLabel:'Afficher les prix des stickers',
    togglePatternsLabel:'Afficher les badges de motifs',
    toggleTradelockLabel:"Afficher le blocage d'échange",
    labelCacheTTL:'TTL du cache', valueCacheTTL:'1 heure',
    labelFloatCache:'Cache float', valueFloatCache:'Permanent (par item)',
    statTotalValue:'Valeur totale', statItems:'Objets', statPriced:'Évalués', statMode:'Mode',
    labelPricesUpdated:'Prix mis à jour', labelPriceEntries:'Entrées de prix',
    labelFloatEntries:'Entrées float',
    statusSaved:'✓ Paramètres sauvegardés', statusCacheCleared:'✓ Cache vidé',
    statusApiKeyRequired:"✗ Veuillez entrer votre clé API PricEmpire",
    contextNotSteam:'Pas sur une page Steam',
    contextInventory:'Inventaire CS2 — VaultLens actif',
    contextTradeOffer:"Offre d'échange — Panneau G/P actif",
    contextTradeList:"Liste d'échanges — Badges G/P actifs",
    contextSteamOther:"Page Steam — naviguer vers l'inventaire",
  },
  es: {
    tabOverview:'Resumen', tabSettings:'Ajustes', tabAbout:'Acerca de',
    btnRefreshPrices:'↻ Actualizar precios', btnOpenInventory:'Abrir inventario',
    btnSaveSettings:'💾 Guardar y cargar precios', btnClearCache:'🗑 Limpiar caché',
    sectionPricingMode:'Modo de precios', sectionDisplay:'Opciones de visualización',
    sectionCache:'Caché', sectionLanguage:'Idioma', sectionTheme:'Apariencia',
    labelLanguage:'Idioma de la interfaz', labelTheme:'Tema',
    themeDark:'Oscuro', themeLight:'Claro', themeSystem:'Sistema',
    modeSkinportName:'Skinport', modeSkinportBadge:'Gratis',
    modePricempireName:'PricEmpire + CSFloat', modePricempireBadge:'Clave API',
    labelApiKey:'Clave API de PricEmpire', linkGetKey:'Obtener clave →',
    toggleFloatsLabel:'Mostrar valores float', toggleStickersLabel:'Mostrar precios de stickers',
    togglePatternsLabel:'Mostrar insignias de patrones',
    toggleTradelockLabel:'Mostrar bloqueo de intercambio',
    labelCacheTTL:'TTL del caché', valueCacheTTL:'1 hora',
    labelFloatCache:'Caché float', valueFloatCache:'Permanente (por ítem)',
    statTotalValue:'Valor total', statItems:'Ítems', statPriced:'Con precio', statMode:'Modo',
    labelPricesUpdated:'Precios actualizados', labelPriceEntries:'Entradas de precio',
    labelFloatEntries:'Entradas float',
    statusSaved:'✓ Ajustes guardados', statusCacheCleared:'✓ Caché limpiada',
    statusApiKeyRequired:'✗ Introduce tu clave API de PricEmpire',
    contextNotSteam:'No en una página Steam',
    contextInventory:'Inventario CS2 — VaultLens activo',
    contextTradeOffer:'Oferta de intercambio — Panel G/P activo',
    contextTradeList:'Lista de intercambios — Badges G/P activos',
    contextSteamOther:'Página Steam — navegar al inventario',
  },
  tr: {
    tabOverview:'Genel Bakış', tabSettings:'Ayarlar', tabAbout:'Hakkında',
    btnRefreshPrices:'↻ Fiyatları Yenile', btnOpenInventory:'Envanteri Aç',
    btnSaveSettings:'💾 Kaydet ve Fiyatları Al', btnClearCache:'🗑 Önbelleği Temizle',
    sectionPricingMode:'Fiyatlandırma Modu', sectionDisplay:'Görüntüleme Seçenekleri',
    sectionCache:'Önbellek', sectionLanguage:'Dil', sectionTheme:'Görünüm',
    labelLanguage:'Arayüz Dili', labelTheme:'Tema',
    themeDark:'Koyu', themeLight:'Açık', themeSystem:'Sistem',
    modeSkinportName:'Skinport', modeSkinportBadge:'Ücretsiz',
    modePricempireName:'PricEmpire + CSFloat', modePricempireBadge:'API Anahtarı',
    labelApiKey:'PricEmpire API Anahtarı', linkGetKey:'Anahtar al →',
    toggleFloatsLabel:'Float Değerlerini Göster',
    toggleStickersLabel:'Çıkartma Fiyatlarını Göster',
    togglePatternsLabel:'Desen Rozetlerini Göster',
    toggleTradelockLabel:'Takas Kilidini Göster',
    labelCacheTTL:'Önbellek TTL', valueCacheTTL:'1 saat',
    labelFloatCache:'Float önbellek', valueFloatCache:'Kalıcı (öğe başına)',
    statTotalValue:'Toplam Değer', statItems:'Öğeler', statPriced:'Fiyatlı', statMode:'Mod',
    labelPricesUpdated:'Fiyatlar güncellendi', labelPriceEntries:'Fiyat girişleri',
    labelFloatEntries:'Float girişleri',
    statusSaved:'✓ Ayarlar kaydedildi', statusCacheCleared:'✓ Önbellek temizlendi',
    statusApiKeyRequired:'✗ PricEmpire API anahtarını girin',
    contextNotSteam:'Steam sayfasında değil',
    contextInventory:'CS2 Envanteri — VaultLens aktif',
    contextTradeOffer:'Takas Teklifi — K/Z paneli aktif',
    contextTradeList:'Takas Listesi — K/Z rozetleri aktif',
    contextSteamOther:'Steam sayfası — envantere gidin',
  },
};

// Cache for dynamically loaded _locales/messages.json by language
const _messagesCache = {};

/**
 * Fetch and parse _locales/<lang>/messages.json for languages not in
 * POPUP_TRANSLATIONS. Caches the result to avoid repeated fetches.
 */
async function ensureMessagesLoaded(lang) {
  if (POPUP_TRANSLATIONS[lang] || _messagesCache[lang]) return;
  try {
    // Chrome uses underscores in locale folder names (e.g. zh_CN, not zh-CN)
    const folder = lang.replace(/-/g, '_');
    const url    = chrome.runtime.getURL(`_locales/${folder}/messages.json`);
    const resp   = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json   = await resp.json();
    const map    = {};
    for (const [key, entry] of Object.entries(json)) {
      if (entry && entry.message) map[key] = entry.message;
    }
    _messagesCache[lang] = map;
  } catch {
    _messagesCache[lang] = {}; // prevent re-fetching on failure
  }
}

/**
 * Get a translated string for the popup.
 * Lookup order: POPUP_TRANSLATIONS → dynamically loaded _locales → English → key.
 */
function t(key) {
  const map  = POPUP_TRANSLATIONS[_lang] || {};
  let   str  = map[key];
  if (str) return str;
  const cached = _messagesCache[_lang] || {};
  str = cached[key];
  if (str) return str;
  return POPUP_TRANSLATIONS.en[key] || key;
}

/**
 * Apply translations to all data-i18n elements in the popup.
 */
function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const str = t(key);
    if (str && str !== key) el.textContent = str;
  });

  // Apply RTL direction if needed
  const isRTL = RTL_LANGS.has(_lang);
  document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
  document.documentElement.lang = _lang;
}

/**
 * Load language setting from storage and apply translations.
 */
async function bootstrapI18n() {
  return new Promise(resolve => {
    chrome.storage.local.get([LANG_KEY], result => {
      _lang = result[LANG_KEY] || detectBrowserLanguage();
      ensureMessagesLoaded(_lang).then(() => {
        applyTranslations();
        resolve(_lang);
      });
    });
  });
}

/**
 * Detect the browser's preferred language and map to a supported code.
 */
function detectBrowserLanguage() {
  const nav = navigator.language || 'en';
  // Exact match (e.g. 'zh-CN')
  if (POPUP_TRANSLATIONS[nav]) return nav;
  // Prefix match (e.g. 'zh' → 'zh-CN')
  const prefix = nav.split('-')[0];
  const match  = Object.keys(POPUP_TRANSLATIONS).find(k => k.startsWith(prefix));
  return match || 'en';
}

/**
 * Populate the language <select> dropdown.
 */
function populateLanguageDropdown() {
  if (!languageSelect) return;

  languageSelect.innerHTML = '';

  for (const lang of SUPPORTED_LANGUAGES) {
    const option   = document.createElement('option');
    option.value   = lang.code;
    // Format: "English (English)" for English, "German (Deutsch)" for others
    option.text    = lang.name === lang.native
      ? lang.name
      : `${lang.name} (${lang.native})`;
    option.selected = (lang.code === _lang);
    languageSelect.appendChild(option);
  }

  // Language change handler
  languageSelect.addEventListener('change', async () => {
    _lang = languageSelect.value;
    await Promise.all([
      new Promise(resolve =>
        chrome.storage.local.set({ [LANG_KEY]: _lang }, resolve)
      ),
      ensureMessagesLoaded(_lang),
    ]);
    applyTranslations();

    // Notify active content script of language change
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (!tabs?.length) return;
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'LANGUAGE_CHANGED',
        lang: _lang,
      }, () => { void chrome.runtime.lastError; });
    });
  });
}

// ─────────────────────────────────────────────
// Theme Bootstrap (Popup)
// ─────────────────────────────────────────────

/**
 * Load and apply the saved theme from storage.
 */
async function bootstrapTheme() {
  return new Promise(resolve => {
    chrome.storage.local.get([THEME_KEY], result => {
      _theme = result[THEME_KEY] || 'dark';
      applyPopupTheme(_theme);
      syncThemeButtons(_theme);
      resolve(_theme);
    });
  });
}

/**
 * Apply a theme to the popup document.
 * @param {'dark'|'light'|'system'} theme
 */
function applyPopupTheme(theme) {
  let resolved = theme;
  if (theme === 'system') {
    resolved = window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'light' : 'dark';
  }
  document.documentElement.setAttribute('data-vl-theme', resolved);
}

/**
 * Update the active state on theme toggle buttons.
 * @param {string} activeTheme
 */
function syncThemeButtons(activeTheme) {
  themeButtons.forEach(btn => {
    btn.classList.toggle('theme-btn--active', btn.dataset.theme === activeTheme);
  });
}

// Attach theme button handlers
themeButtons.forEach(btn => {
  btn.addEventListener('click', async () => {
    _theme = btn.dataset.theme;
    applyPopupTheme(_theme);
    syncThemeButtons(_theme);

    await new Promise(resolve =>
      chrome.storage.local.set({ [THEME_KEY]: _theme }, resolve)
    );

    // Notify content scripts of theme change
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (!tabs?.length) return;
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'THEME_CHANGED',
        theme: _theme,
      }, () => { void chrome.runtime.lastError; });
    });
  });
});

// Watch system theme changes when 'system' mode is active
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  if (_theme === 'system') applyPopupTheme('system');
});

// ─────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────

/**
 * Main initialization sequence.
 * Runs once when the popup DOM is ready.
 */
async function init() {
  // 1. Load i18n module and apply translations
  await bootstrapI18n();

  // 2. Apply theme immediately (before rendering to avoid flash)
  await bootstrapTheme();

  // 3. Set initial panel visibility
  tabPanels.forEach(panel => {
    panel.style.display = panel.classList.contains('panel--active') ? 'flex' : 'none';
  });

  // 4. Populate language dropdown
  populateLanguageDropdown();

  // 5. Load settings
  await loadSettings();

  // 6. Load Overview data
  await loadOverviewData();

  // 7. Start auto-refresh
  startOverviewAutoRefresh();
}

// Run on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}