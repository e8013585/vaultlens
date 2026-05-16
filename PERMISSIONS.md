# VaultLens — Chrome Extension Permission Justifications

This document explains every permission requested in `manifest.json` and
why it is necessary for VaultLens to function. This file is intended for
transparency, Chrome Web Store review, and user trust.

---

## Declared Permissions

### `storage`

**Why it's needed:**
VaultLens stores all user data locally on the user's machine using
`chrome.storage.local`. This includes:

- Cached price data from PricEmpire and Skinport (with 1-hour TTL)
- Float and pattern data per item (keyed by `assetid`, permanent cache)
- User settings (pricing mode, API key, display preferences)
- The user's own SteamID64 (for detecting own inventory)

**What it does NOT do:**
Does not use `chrome.storage.sync` — no data ever leaves the user's
device via Chrome sync. No cloud storage of any kind.

**Alternative considered:**
`sessionStorage` or `localStorage` were considered but rejected because:
1. Content scripts (inventory.js, tradeoffers.js) and the service worker
   (background.js) run in different JavaScript contexts and cannot share
   `localStorage`.
2. `chrome.storage.local` is the correct cross-context persistent storage
   mechanism for MV3 extensions.

---

### `scripting`

**Why it's needed:**
Required for programmatic script injection via `chrome.scripting.executeScript()`.
This is used as a fallback injection mechanism when the declarative
`content_scripts` in `manifest.json` may not have run (e.g., when the
extension is installed while a Steam tab is already open).

**Scope:**
Only ever injects into `steamcommunity.com` pages, which are already
declared in `host_permissions`. No scripts are injected into any other
domains.

**Alternative considered:**
Declarative `content_scripts` cover most cases. `scripting` permission
handles the edge case of already-open tabs without requiring the user
to reload the page manually.

---

### `activeTab`

**Why it's needed:**
Used in the popup (`popup.js`) to:
1. Detect what type of Steam page the user is currently viewing
   (inventory, trade offer, or other) to display the correct context
   in the Overview tab.
2. Send messages to the active tab's content script to request live
   inventory stats (total value, item count).
3. Navigate the active tab to the user's Steam inventory when clicking
   "Open Inventory" in the popup.

**Scope:**
`activeTab` is a "temporary" permission — it grants access only to the
currently focused tab, only when the user explicitly clicks the extension
icon. It does not grant persistent access to any tab's contents.

**Why not `tabs`?**
The full `tabs` permission would expose all open tab URLs continuously.
`activeTab` is the privacy-respecting alternative that provides exactly
what is needed (current tab context on user interaction).

---

### `clipboardWrite`

**Why it's needed:**
The inventory toolbar includes a **"Copy List"** button that copies a
formatted text list of all inventory items (name, price, float, sticker
value) to the user's clipboard.

The profile header includes:
- **"Copy SteamID64"** button
- **"Copy Trade Link"** button

These features require the ability to write to the clipboard from a
content script context.

**Implementation:**
Uses `navigator.clipboard.writeText()` (the modern Clipboard API) with
`document.execCommand('copy')` as a fallback. The `clipboardWrite`
permission is required by Chrome for content scripts to access the
Clipboard API.

**What it does NOT do:**
VaultLens never READS from the clipboard. It only writes user-requested
data that originates from the Steam page currently being viewed.

---

## Host Permissions

Host permissions allow the extension to make network requests to (and
inject content scripts into) specific domains. Each is strictly necessary.

---

### `https://steamcommunity.com/*`

**Why it's needed:**
- Content scripts (`inventory.js`, `tradeoffers.js`) are injected into
  Steam inventory and trade offer pages.
- The `background.js` service worker communicates with these content
  scripts via the Chrome messaging API.

**Scope:**
Content scripts are injected only on the specific URL patterns declared
in `content_scripts` (inventory pages, trade offer pages). The host
permission is required by Chrome MV3 to authorize this injection.

---

### `https://api.pricempire.com/*`

**Why it's needed:**
When the user selects **PricEmpire mode**, `background.js` fetches
CS2 item prices from the PricEmpire API v3:

GET https://api.pricempire.com/v3/items/prices?api_key=...&sources=buff163,skinport,csFloat&appId=730

text


This is a direct browser-to-API request. The user's API key is included
in the request URL as a query parameter, sent directly to PricEmpire's
servers — it never passes through any VaultLens-controlled server.

**Frequency:**
Once per hour (respects 1-hour cache TTL). Forced refresh only on user
action ("Refresh Prices" button or "Save & Fetch Prices").

---

### `https://csfloat.com/*`

**Why it's needed:**
When PricEmpire mode is active and a Doppler knife is detected,
`background.js` fetches the current lowest listing price for that specific
Doppler phase from the CSFloat marketplace API:

GET https://csfloat.com/api/v1/listings?market_hash_name=...&paint_index=...

text


This provides phase-specific Doppler pricing (e.g., the price of a
Ruby Karambit vs a Phase 2 Karambit is significantly different).

**Frequency:**
Only called for Doppler knives, only when PricEmpire mode is active,
only if the item's paint_index is available from the CSGOFloat API.

---

### `https://api.skinport.com/*`

**Why it's needed:**
When the user selects **Skinport mode**, `background.js` fetches all CS2
item prices from Skinport's public API (no authentication required):

GET https://api.skinport.com/v1/items?app_id=730&currency=USD

text


This returns `min_price` (lowest current listing) for every CS2 item
on Skinport, providing a comprehensive price reference without any
API key requirement.

**Frequency:**
Once per hour (respects 1-hour cache TTL).

---

### `https://api.csgofloat.com/*`

**Why it's needed:**
Float values, paint seeds, paint indexes, and sticker data for inventory
items are fetched from the CSGOFloat public API:

GET https://api.csgofloat.com/?url={steam_inspect_link}

text


This is the primary mechanism for obtaining:
- `floatvalue` — the wear value of a skin (0.0 to 1.0)
- `paintseed` — the pattern seed (0–999)
- `paintindex` — determines Doppler phase
- `defindex` — weapon type identifier
- `stickers` — sticker slot data with names for pricing

**Frequency:**
Called per item, once, then cached permanently (float values never change
for a specific item). The extension queues requests at max 3 concurrent
with 300ms delay between batches to respect the public API's rate limits.

**No authentication required:**
The CSGOFloat public API (`api.csgofloat.com`) is free and does not
require an API key.

---

## Summary Table

| Permission | Category | User Data Involved | Frequency |
|---|---|---|---|
| `storage` | Local data | Prices, floats, settings, API key (local only) | Continuous |
| `scripting` | Script injection | None | On tab open |
| `activeTab` | Tab access | Current tab URL only, on click | On popup open |
| `clipboardWrite` | Clipboard | User-selected text (SteamID, item list) | On button click |
| `steamcommunity.com` | Host | None (injection only) | On page load |
| `api.pricempire.com` | Host | API key in query param (sent to PricEmpire) | Hourly |
| `csfloat.com` | Host | Item market name, paint index | Per Doppler item |
| `api.skinport.com` | Host | None (public API, no auth) | Hourly |
| `api.csgofloat.com` | Host | Steam inspect link (public data) | Per item, once |

---

## Why These Permissions Are Not Requested

| Permission | Reason Not Needed |
|---|---|
| `tabs` | `activeTab` is sufficient for popup context detection |
| `history` | VaultLens does not access browsing history |
| `bookmarks` | Not used |
| `cookies` | VaultLens does not read or set cookies |
| `webRequest` | Not intercepting network requests; all fetches are explicit |
| `identity` | No Google account or OAuth required |
| `notifications` | No push notifications |
| `geolocation` | Not used |
| `downloads` | Not used |
| `management` | Not used |
| `contextMenus` | Not used (may be added in future for right-click features) |

---
v1.0.0