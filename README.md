# VaultLens

**Real-time CS2 inventory pricing, float values, pattern detection, sticker values,
and trade analytics — all on one screen.**

VaultLens is a free, open-source Chrome extension (Manifest V3) that overlays pricing
and inspection data directly onto your Steam CS2 inventory and trade offer pages.

---

## Table of Contents

1. [Features](#features)
2. [Installation](#installation)
3. [Getting a PricEmpire API Key](#getting-a-pricempire-api-key)
4. [Using Skinport Mode (Zero Config)](#using-skinport-mode-zero-config)
5. [How It Works](#how-it-works)
6. [Pattern Detection](#pattern-detection)
7. [Known Limitations](#known-limitations)
8. [Privacy](#privacy)
9. [Contributing](#contributing)
10. [License](#license)

---

## Features

### Inventory Page
- **Price overlay** on every item — click to open Buff163 or Skinport listing
- **Float value** display (e.g. `0.0341`) with exterior pill (FN / MW / FT / WW / BS)
- **Rarity border glow** matching CS2 rarity colors
- **Doppler phase badges** (Phase 1–4, Ruby, Sapphire, Black Pearl, Emerald, Gamma phases)
- **Fade % badge** for all 27 fade weapons — gold highlight at ≥ 98%
- **Blue gem tier badges** for AK-47, Five-SeveN (including Scar #661), and Karambit Case Hardened
- **Pattern badges** — Marble Fade Max Pink/Blue/Fire & Ice, Crimson Web Double Web & Center Web
- **Trade lock countdown** (e.g. 🔒 5 days)
- **Sticker hover popup** with individual sticker prices and total sticker value
- **Duplicate count badge** (e.g. ×3) for items you own multiple of
- **Inventory toolbar** with total value, item count, fuzzy search, sort, multi-select, copy list, refresh
- **Profile buttons** — Copy SteamID64, Copy Trade Link (own profile), CSFloat Stall, CSGO-Rep

### Trade Offer Pages
- **P&L summary panel** — You Give / You Receive / P&L amount + percentage
- **Per-item prices** shown below each item name in the trade window
- **Doppler price override** — pencil icon to manually set a custom price for any Doppler item
- **Trade offer list** — P&L badge on each offer in the incoming/sent list

### Performance
- IntersectionObserver-based lazy loading — visible items processed first
- Smart float fetch queue — max 3 concurrent, 300ms batching, exponential backoff on 429
- Price cache (1-hour TTL), float cache (permanent per assetid)

---

## Installation

### Load Unpacked (Developer Mode)

VaultLens is not yet on the Chrome Web Store. Load it manually:

1. **Download or clone** this repository:
   ```bash
   git clone https://github.com/vaultlens/vaultlens.git

    Open Chrome and navigate to:

    text

    chrome://extensions/

    Enable Developer Mode — toggle the switch in the top-right corner.

    Click "Load unpacked".

    Select the vaultlens/ folder (the one containing manifest.json).

    VaultLens is now installed. You should see the orange VaultLens icon in your toolbar.

    Note: Chrome will show a warning about developer mode extensions on startup.
    This is normal for unpacked extensions and can be dismissed.

Verify Installation

Navigate to your Steam CS2 inventory:

text

https://steamcommunity.com/id/me/inventory/#730

You should see the VaultLens toolbar appear above the inventory grid within a few seconds.
Getting a PricEmpire API Key

PricEmpire mode provides Buff163, Skinport, and CSFloat pricing with Doppler phase pricing support.

    Create a free account at pricempire.com
    Navigate to pricempire.com/settings/developer
    Generate an API key (free tier is sufficient for personal use)
    Open the VaultLens popup → Settings tab
    Select "PricEmpire + CSFloat" mode
    Paste your API key into the field
    Click "Save & Fetch Prices"

The extension will fetch and cache ~100,000+ item prices from PricEmpire immediately.
Using Skinport Mode (Zero Config)

Skinport mode requires no API key and works immediately after installation.

    Open the VaultLens popup → Settings tab
    Select "Skinport" (selected by default)
    Click "Save & Fetch Prices"

Prices are sourced from Skinport's public API and display
min_price (the lowest current listing price on Skinport) for each item.

    Clicking a price badge opens the item's Skinport listing page.
    Prices are cached for 1 hour and auto-refreshed in the background.

How It Works
Price Pipeline

text

[Popup: Save Settings]
        ↓
[background.js: fetch from PricEmpire or Skinport]
        ↓
[chrome.storage.local: cache with 1-hour TTL]
        ↓
[content script: GET_PRICES message → render overlays]

Float Pipeline

text

[IntersectionObserver: item enters viewport]
        ↓
[Extract inspect link from Steam inventory data]
        ↓
[background.js: GET_FLOATS_BATCH → CSGOFloat public API]
        ↓ (max 3 concurrent, 300ms delay, exponential backoff)
[chrome.storage.local: cache by assetid (permanent)]
        ↓
[content script: updateItemOverlay() → render float + pattern badges]

Shadow DOM Isolation

All VaultLens UI elements are rendered inside Shadow DOM roots attached to each
inventory item holder. This means Steam's CSS can never affect VaultLens overlays,
and VaultLens CSS can never affect Steam's UI.
Pattern Detection
Blue Gems

Based on publicly known community tier lists from csbluegem.com
and Buff163 listing data.
Weapon	Table Source
AK-47 Case Hardened	Top ~20 seeds (Tier 1–3)
Five-SeveN Case Hardened	Including Scar #661
Karambit Case Hardened	Top ~17 seeds (Tier 1–3)
Marble Fade

Pattern types detected: Max Pink, Max Blue, Fire & Ice (ranked 1st–10th for each)

Supported: Bayonet, M9 Bayonet, Karambit, Flip Knife
Crimson Web

Detected: Double Web, Center Web

Detection uses paint seed ranges with ±5 tolerance. Supported knives: Karambit, M9 Bayonet,
Bayonet, Flip Knife, Gut Knife.

    ⚠️ Crimson Web detection is approximate. Always visually verify before trading.

Fade %

Calculated from paint seed using interpolated lookup tables (27 fade weapons supported).
Accuracy: approximately ±0.5% based on community measurements.
Full-fade (100%) seeds 0–4 are reliable; mid-range values use interpolation.
Doppler Phases

Exact — based on paintindex value from the CSGOFloat API:
Phase	Paint Index
Phase 1	415
Phase 2	416
Phase 3	417
Phase 4	418
Ruby	419
Sapphire	420
Black Pearl	421
Emerald (Gamma)	572
Known Limitations
Limitation	Detail
CSGOFloat rate limits	The public API allows ~5 requests/second. Large inventories (500+ items) may take several minutes to fully load float data. The extension handles this with queuing and backoff.
Fade % accuracy	±0.5% approximation. Exact Valve seed→fade algorithm is not publicly documented.
Pattern tier accuracy	Blue gem tiers and marble fade rankings reflect community consensus; individual buyers may disagree.
Crimson Web detection	Seed range approximations with ±5 tolerance. Visual verification always recommended.
Trade lock parsing	Relies on Steam's description text format. May fail if Valve changes the format.
Inventory SPA changes	Steam's inventory is a SPA; tab changes may require a page refresh to re-trigger VaultLens.
Private inventories	Float data cannot be fetched for items in private inventories.
Privacy

VaultLens collects zero data. There are no VaultLens servers.

    All price fetches go directly from your browser to PricEmpire or Skinport's public APIs.
    Float data goes directly from your browser to the CSGOFloat public API.
    Your PricEmpire API key is stored only in chrome.storage.local on your own machine.
    No telemetry, no analytics, no tracking of any kind.
    The extension is fully open source — you can audit every line of code.

See the full Privacy Policy for details.
Contributing

Issues and pull requests are welcome!

GitHub: github.com/vaultlens/vaultlens

Filing a bug:

    Go to Issues
    Include: Chrome version, extension version, what you expected, what happened
    Screenshots or console errors are very helpful

Adding pattern data:

    Blue gem seeds: edit data/blueGemTiers.js
    Fade tables: edit data/fadeWeapons.js
    Marble fade / Crimson web seeds: edit data/patternTiers.js

Adding new pricing sources:

    Add a fetch function in background.js
    Add a mode option in popup/popup.html + popup/popup.js
    Handle the new source in lib/priceEngine.js

License

MIT License — free to use, modify, and distribute.
See LICENSE for full text.

VaultLens is not affiliated with Valve Corporation, Steam, CS2, Buff163, Skinport,
PricEmpire, or CSFloat. All trademarks are property of their respective owners.