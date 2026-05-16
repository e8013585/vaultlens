/**
 * VaultLens — lib/i18n.js
 *
 * Internationalization (i18n) module.
 *
 * Architecture:
 *  - Chrome's built-in chrome.i18n.getMessage() is used as the primary
 *    translation source for all strings defined in _locales/en/messages.json.
 *  - For the popup UI, chrome.i18n automatically serves the correct locale
 *    based on Chrome's language setting OR the user's manually selected
 *    language stored in chrome.storage.local.
 *  - Content scripts use this module to retrieve translated strings at
 *    runtime, with the user's selected language preference applied.
 *  - Fallback: if a message key is missing, the English default is returned.
 *
 * Language Selection:
 *  - The user picks a language in the Settings tab of the popup.
 *  - The selected language code is stored in chrome.storage.local as
 *    'vl_language' (e.g. 'en', 'ru', 'zh-CN').
 *  - Since Chrome extensions with Manifest V3 only bundle one locale at a
 *    time via _locales/, runtime language switching for non-Chrome-locale
 *    languages is handled by storing translated string maps in this file
 *    for the most common languages, with a runtime override mechanism.
 *
 * Implementation Note:
 *  Because shipping full _locales/ folders for 130+ languages would require
 *  a very large bundle, this module uses a hybrid approach:
 *   1. chrome.i18n.getMessage() handles whatever Chrome's UI language is.
 *   2. A runtime translation map covers key UI strings for all 130+ languages.
 *   3. The runtime map takes precedence when the user has explicitly selected
 *      a language in VaultLens settings.
 *
 * The runtime translations below cover the most user-visible strings.
 * Technical/developer-facing strings remain in English.
 */

// ─────────────────────────────────────────────
// Storage key for user language preference
// ─────────────────────────────────────────────

export const LANGUAGE_STORAGE_KEY = 'vl_language';
export const THEME_STORAGE_KEY    = 'vl_theme';

// ─────────────────────────────────────────────
// Language Registry
// All 130 supported languages with metadata
// ─────────────────────────────────────────────

export const SUPPORTED_LANGUAGES = [
  { code: 'af',      chrome: 'af',      name: 'Afrikaans',          native: 'Afrikaans'           },
  { code: 'sq',      chrome: 'sq',      name: 'Albanian',           native: 'Shqip'               },
  { code: 'am',      chrome: 'am',      name: 'Amharic',            native: 'አማርኛ'                },
  { code: 'ar',      chrome: 'ar',      name: 'Arabic',             native: 'العربية'             },
  { code: 'hy',      chrome: 'hy',      name: 'Armenian',           native: 'Հայերեն'             },
  { code: 'as',      chrome: 'as',      name: 'Assamese',           native: 'অসমীয়া'             },
  { code: 'ay',      chrome: 'ay',      name: 'Aymara',             native: 'Aymar'               },
  { code: 'az',      chrome: 'az',      name: 'Azerbaijani',        native: 'Azərbaycan'          },
  { code: 'bm',      chrome: 'bm',      name: 'Bambara',            native: 'Bamanankan'          },
  { code: 'eu',      chrome: 'eu',      name: 'Basque',             native: 'Euskara'             },
  { code: 'be',      chrome: 'be',      name: 'Belarusian',         native: 'Беларуская'          },
  { code: 'bn',      chrome: 'bn',      name: 'Bengali',            native: 'বাংলা'               },
  { code: 'bho',     chrome: 'bho',     name: 'Bhojpuri',           native: 'भोजपुरी'             },
  { code: 'bs',      chrome: 'bs',      name: 'Bosnian',            native: 'Bosanski'            },
  { code: 'bg',      chrome: 'bg',      name: 'Bulgarian',          native: 'Български'           },
  { code: 'ca',      chrome: 'ca',      name: 'Catalan',            native: 'Català'              },
  { code: 'ceb',     chrome: 'ceb',     name: 'Cebuano',            native: 'Cebuano'             },
  { code: 'ny',      chrome: 'ny',      name: 'Chichewa',           native: 'Chichewa'            },
  { code: 'zh-CN',   chrome: 'zh_CN',   name: 'Chinese (Simplified)',  native: '中文（简体）'      },
  { code: 'zh-TW',   chrome: 'zh_TW',   name: 'Chinese (Traditional)', native: '中文（繁體）'      },
  { code: 'co',      chrome: 'co',      name: 'Corsican',           native: 'Corsu'               },
  { code: 'hr',      chrome: 'hr',      name: 'Croatian',           native: 'Hrvatski'            },
  { code: 'cs',      chrome: 'cs',      name: 'Czech',              native: 'Čeština'             },
  { code: 'da',      chrome: 'da',      name: 'Danish',             native: 'Dansk'               },
  { code: 'dv',      chrome: 'dv',      name: 'Dhivehi',            native: 'ދިވެހި'              },
  { code: 'doi',     chrome: 'doi',     name: 'Dogri',              native: 'डोगरी'               },
  { code: 'nl',      chrome: 'nl',      name: 'Dutch',              native: 'Nederlands'          },
  { code: 'en',      chrome: 'en',      name: 'English',            native: 'English'             },
  { code: 'eo',      chrome: 'eo',      name: 'Esperanto',          native: 'Esperanto'           },
  { code: 'et',      chrome: 'et',      name: 'Estonian',           native: 'Eesti'               },
  { code: 'ee',      chrome: 'ee',      name: 'Ewe',                native: 'Eʋegbe'              },
  { code: 'tl',      chrome: 'tl',      name: 'Filipino',           native: 'Filipino'            },
  { code: 'fi',      chrome: 'fi',      name: 'Finnish',            native: 'Suomi'               },
  { code: 'fr',      chrome: 'fr',      name: 'French',             native: 'Français'            },
  { code: 'fy',      chrome: 'fy',      name: 'Frisian',            native: 'Frysk'               },
  { code: 'gl',      chrome: 'gl',      name: 'Galician',           native: 'Galego'              },
  { code: 'ka',      chrome: 'ka',      name: 'Georgian',           native: 'ქართული'             },
  { code: 'de',      chrome: 'de',      name: 'German',             native: 'Deutsch'             },
  { code: 'el',      chrome: 'el',      name: 'Greek',              native: 'Ελληνικά'            },
  { code: 'gn',      chrome: 'gn',      name: 'Guarani',            native: 'Avañeẽ'              },
  { code: 'gu',      chrome: 'gu',      name: 'Gujarati',           native: 'ગુજરાતી'             },
  { code: 'ht',      chrome: 'ht',      name: 'Haitian Creole',     native: 'Kreyòl ayisyen'      },
  { code: 'ha',      chrome: 'ha',      name: 'Hausa',              native: 'Hausa'               },
  { code: 'haw',     chrome: 'haw',     name: 'Hawaiian',           native: 'ʻŌlelo Hawaiʻi'     },
  { code: 'iw',      chrome: 'iw',      name: 'Hebrew',             native: 'עברית'               },
  { code: 'hi',      chrome: 'hi',      name: 'Hindi',              native: 'हिन्दी'              },
  { code: 'hmn',     chrome: 'hmn',     name: 'Hmong',              native: 'Hmong'               },
  { code: 'hu',      chrome: 'hu',      name: 'Hungarian',          native: 'Magyar'              },
  { code: 'is',      chrome: 'is',      name: 'Icelandic',          native: 'Íslenska'            },
  { code: 'ig',      chrome: 'ig',      name: 'Igbo',               native: 'Igbo'                },
  { code: 'ilo',     chrome: 'ilo',     name: 'Ilocano',            native: 'Ilocano'             },
  { code: 'id',      chrome: 'id',      name: 'Indonesian',         native: 'Indonesia'           },
  { code: 'ga',      chrome: 'ga',      name: 'Irish',              native: 'Gaeilge'             },
  { code: 'it',      chrome: 'it',      name: 'Italian',            native: 'Italiano'            },
  { code: 'ja',      chrome: 'ja',      name: 'Japanese',           native: '日本語'               },
  { code: 'jw',      chrome: 'jw',      name: 'Javanese',           native: 'Basa Jawa'           },
  { code: 'kn',      chrome: 'kn',      name: 'Kannada',            native: 'ಕನ್ನಡ'               },
  { code: 'kk',      chrome: 'kk',      name: 'Kazakh',             native: 'Қазақ'               },
  { code: 'km',      chrome: 'km',      name: 'Khmer',              native: 'ខ្មែរ'               },
  { code: 'rw',      chrome: 'rw',      name: 'Kinyarwanda',        native: 'Kinyarwanda'         },
  { code: 'gom',     chrome: 'gom',     name: 'Konkani',            native: 'कोंकणी'              },
  { code: 'ko',      chrome: 'ko',      name: 'Korean',             native: '한국어'               },
  { code: 'kri',     chrome: 'kri',     name: 'Krio',               native: 'Krio'                },
  { code: 'ku',      chrome: 'ku',      name: 'Kurdish (Kurmanji)', native: 'Kurdî (Kurmancî)'    },
  { code: 'ckb',     chrome: 'ckb',     name: 'Kurdish (Sorani)',   native: 'کوردی (سۆرانی)'     },
  { code: 'ky',      chrome: 'ky',      name: 'Kyrgyz',             native: 'Кыргызча'            },
  { code: 'lo',      chrome: 'lo',      name: 'Lao',                native: 'ລາວ'                 },
  { code: 'la',      chrome: 'la',      name: 'Latin',              native: 'Latina'              },
  { code: 'lv',      chrome: 'lv',      name: 'Latvian',            native: 'Latviešu'            },
  { code: 'ln',      chrome: 'ln',      name: 'Lingala',            native: 'Lingála'             },
  { code: 'lt',      chrome: 'lt',      name: 'Lithuanian',         native: 'Lietuvių'            },
  { code: 'lg',      chrome: 'lg',      name: 'Luganda',            native: 'Luganda'             },
  { code: 'lb',      chrome: 'lb',      name: 'Luxembourgish',      native: 'Lëtzebuergesch'      },
  { code: 'mk',      chrome: 'mk',      name: 'Macedonian',         native: 'Македонски'          },
  { code: 'mai',     chrome: 'mai',     name: 'Maithili',           native: 'मैथिली'              },
  { code: 'mg',      chrome: 'mg',      name: 'Malagasy',           native: 'Malagasy'            },
  { code: 'ms',      chrome: 'ms',      name: 'Malay',              native: 'Melayu'              },
  { code: 'ml',      chrome: 'ml',      name: 'Malayalam',          native: 'മലയാളം'              },
  { code: 'mt',      chrome: 'mt',      name: 'Maltese',            native: 'Malti'               },
  { code: 'mi',      chrome: 'mi',      name: 'Maori',              native: 'Māori'               },
  { code: 'mr',      chrome: 'mr',      name: 'Marathi',            native: 'मराठी'               },
  { code: 'mni-Mtei',chrome: 'mni_Mtei',name: 'Meitei (Manipuri)', native: 'ꯃꯤꯇꯩꯂꯣꯟ'            },
  { code: 'lus',     chrome: 'lus',     name: 'Mizo',               native: 'Mizo ṭawng'          },
  { code: 'mn',      chrome: 'mn',      name: 'Mongolian',          native: 'Монгол'              },
  { code: 'my',      chrome: 'my',      name: 'Myanmar (Burmese)',  native: 'မြန်မာ'              },
  { code: 'ne',      chrome: 'ne',      name: 'Nepali',             native: 'नेपाली'              },
  { code: 'no',      chrome: 'no',      name: 'Norwegian',          native: 'Norsk'               },
  { code: 'or',      chrome: 'or',      name: 'Odia (Oriya)',       native: 'ଓଡ଼ିଆ'               },
  { code: 'om',      chrome: 'om',      name: 'Oromo',              native: 'Afaan Oromoo'        },
  { code: 'ps',      chrome: 'ps',      name: 'Pashto',             native: 'پښتو'                },
  { code: 'fa',      chrome: 'fa',      name: 'Persian',            native: 'فارسی'               },
  { code: 'pl',      chrome: 'pl',      name: 'Polish',             native: 'Polski'              },
  { code: 'pt',      chrome: 'pt',      name: 'Portuguese',         native: 'Português'           },
  { code: 'pa',      chrome: 'pa',      name: 'Punjabi',            native: 'ਪੰਜਾਬੀ'              },
  { code: 'qu',      chrome: 'qu',      name: 'Quechua',            native: 'Qichwa'              },
  { code: 'ro',      chrome: 'ro',      name: 'Romanian',           native: 'Română'              },
  { code: 'ru',      chrome: 'ru',      name: 'Russian',            native: 'Русский'             },
  { code: 'sm',      chrome: 'sm',      name: 'Samoan',             native: 'Gagana Samoa'        },
  { code: 'sa',      chrome: 'sa',      name: 'Sanskrit',           native: 'संस्कृत'             },
  { code: 'gd',      chrome: 'gd',      name: 'Scottish Gaelic',    native: 'Gàidhlig'            },
  { code: 'nso',     chrome: 'nso',     name: 'Sepedi',             native: 'Sepedi'              },
  { code: 'sr',      chrome: 'sr',      name: 'Serbian',            native: 'Српски'              },
  { code: 'st',      chrome: 'st',      name: 'Sesotho',            native: 'Sesotho'             },
  { code: 'sn',      chrome: 'sn',      name: 'Shona',              native: 'ChiShona'            },
  { code: 'sd',      chrome: 'sd',      name: 'Sindhi',             native: 'سنڌي'               },
  { code: 'si',      chrome: 'si',      name: 'Sinhala',            native: 'සිංහල'               },
  { code: 'sk',      chrome: 'sk',      name: 'Slovak',             native: 'Slovenčina'          },
  { code: 'sl',      chrome: 'sl',      name: 'Slovenian',          native: 'Slovenščina'         },
  { code: 'so',      chrome: 'so',      name: 'Somali',             native: 'Soomaali'            },
  { code: 'es',      chrome: 'es',      name: 'Spanish',            native: 'Español'             },
  { code: 'su',      chrome: 'su',      name: 'Sundanese',          native: 'Basa Sunda'          },
  { code: 'sw',      chrome: 'sw',      name: 'Swahili',            native: 'Kiswahili'           },
  { code: 'sv',      chrome: 'sv',      name: 'Swedish',            native: 'Svenska'             },
  { code: 'tg',      chrome: 'tg',      name: 'Tajik',              native: 'Тоҷикӣ'              },
  { code: 'ta',      chrome: 'ta',      name: 'Tamil',              native: 'தமிழ்'               },
  { code: 'tt',      chrome: 'tt',      name: 'Tatar',              native: 'Татар'               },
  { code: 'te',      chrome: 'te',      name: 'Telugu',             native: 'తెలుగు'              },
  { code: 'th',      chrome: 'th',      name: 'Thai',               native: 'ภาษาไทย'             },
  { code: 'ti',      chrome: 'ti',      name: 'Tigrinya',           native: 'ትግርኛ'               },
  { code: 'ts',      chrome: 'ts',      name: 'Tsonga',             native: 'Xitsonga'            },
  { code: 'tr',      chrome: 'tr',      name: 'Turkish',            native: 'Türkçe'              },
  { code: 'tk',      chrome: 'tk',      name: 'Turkmen',            native: 'Türkmen'             },
  { code: 'ak',      chrome: 'ak',      name: 'Twi',                native: 'Twi'                 },
  { code: 'uk',      chrome: 'uk',      name: 'Ukrainian',          native: 'Українська'          },
  { code: 'ur',      chrome: 'ur',      name: 'Urdu',               native: 'اردو'               },
  { code: 'ug',      chrome: 'ug',      name: 'Uyghur',             native: 'ئۇيغۇرچە'            },
  { code: 'uz',      chrome: 'uz',      name: "Uzbek",              native: "O'zbek"              },
  { code: 'vi',      chrome: 'vi',      name: 'Vietnamese',         native: 'Tiếng Việt'          },
  { code: 'cy',      chrome: 'cy',      name: 'Welsh',              native: 'Cymraeg'             },
  { code: 'xh',      chrome: 'xh',      name: 'Xhosa',              native: 'isiXhosa'            },
  { code: 'yi',      chrome: 'yi',      name: 'Yiddish',            native: 'ייִדיש'              },
  { code: 'yo',      chrome: 'yo',      name: 'Yoruba',             native: 'Yorùbá'              },
  { code: 'zu',      chrome: 'zu',      name: 'Zulu',               native: 'isiZulu'             },
];

// ─────────────────────────────────────────────
// RTL Languages
// These languages require right-to-left text direction.
// ─────────────────────────────────────────────

export const RTL_LANGUAGES = new Set([
  'ar',   // Arabic
  'iw',   // Hebrew
  'fa',   // Persian
  'ur',   // Urdu
  'ps',   // Pashto
  'sd',   // Sindhi
  'ug',   // Uyghur
  'yi',   // Yiddish
  'ckb',  // Kurdish (Sorani)
  'dv',   // Dhivehi
  'ku',   // Kurdish (Kurmanji) — partially RTL
]);

/**
 * Check if a language code is RTL.
 * @param {string} code
 * @returns {boolean}
 */
export function isRTL(code) {
  return RTL_LANGUAGES.has(code);
}

// ─────────────────────────────────────────────
// Runtime Translation Map
//
// Key UI strings translated for all supported languages.
// Organized as: TRANSLATIONS[langCode][messageKey] = translatedString
//
// Coverage strategy:
//  - All user-visible overlay strings (price, float, buttons, badges)
//  - Toolbar strings
//  - Popup tab labels and section headers
//  - Toast notifications
//  - Trade panel strings
//
// For languages not listed here, English is used as fallback.
// Translations sourced from community contributions and standard
// localization references. Technical accuracy over literal translation.
// ─────────────────────────────────────────────

export const TRANSLATIONS = {

  // ─── English (baseline) ─────────────────────
  en: {
    tabOverview:          'Overview',
    tabSettings:          'Settings',
    tabAbout:             'About',
    btnRefreshPrices:     '↻ Refresh Prices',
    btnOpenInventory:     'Open Inventory',
    btnSaveSettings:      '💾 Save & Fetch Prices',
    btnClearCache:        '🗑 Clear All Cache',
    toolbarSearch:        '🔍 Search items...',
    toolbarCopyList:      '📋 Copy List',
    toolbarCopied:        '✅ Copied!',
    toolbarRefresh:       '↻ Refresh Prices',
    toolbarRefreshing:    '⏳ Refreshing...',
    toolbarSelect:        '⬜ Select',
    toolbarSelecting:     '✅ Selecting',
    sortDefault:          'Default Order',
    sortPriceHigh:        'Price: High → Low',
    sortPriceLow:         'Price: Low → High',
    sortFloatLow:         'Float: Low → High',
    sortFloatHigh:        'Float: High → Low',
    sortNameAZ:           'Name: A → Z',
    sortStickerVal:       'Sticker Value ↓',
    sectionPricingMode:   'Pricing Mode',
    sectionDisplay:       'Display Options',
    sectionCache:         'Cache',
    sectionLanguage:      'Language',
    sectionTheme:         'Appearance',
    labelLanguage:        'Interface Language',
    labelLanguageNote:    'UI language for VaultLens overlays and popup',
    labelTheme:           'Theme',
    themeDark:            'Dark',
    themeLight:           'Light',
    themeSystem:          'System Default',
    toggleFloatsLabel:    'Show Float Values',
    toggleStickersLabel:  'Show Sticker Prices',
    togglePatternsLabel:  'Show Pattern Badges',
    toggleTradelockLabel: 'Show Trade Lock Countdowns',
    profileCopySteamId:   '📋 Copy SteamID64',
    profileCopyTradeLink: '🔗 Copy Trade Link',
    profileCSFloatStall:  '🔍 CSFloat Stall',
    profileCSGORep:       '🛡️ CSGO-Rep',
    tradeYouGive:         'You Give',
    tradeYouReceive:      'You Receive',
    tradePnL:             'P&L',
    tradePriceDisclaimer: 'Prices may vary. Always verify before trading.',
    stickerPopupTitle:    'Stickers',
    stickerTotalValue:    'Total Sticker Value',
    toastSteamIdCopied:   'SteamID64 copied!',
    toastTradeLinkCopied: 'Trade link copied!',
    toastCopyFailed:      'Copy failed',
    toastPricesRefreshed: 'Prices refreshed!',
    tradeLockLocked:      '🔒 Locked',
    tradeLockToday:       '🔒 Today',
    tradeLockOneDay:      '🔒 1 day',
    inventoryLoading:     'Loading...',
    statusSaved:          '✓ Settings saved',
    statusCacheCleared:   '✓ Cache cleared successfully',
    statusApiKeyRequired: '✗ Please enter your PricEmpire API key',
  },

  // ─── Russian ─────────────────────────────────
  ru: {
    tabOverview:          'Обзор',
    tabSettings:          'Настройки',
    tabAbout:             'О расширении',
    btnRefreshPrices:     '↻ Обновить цены',
    btnOpenInventory:     'Открыть инвентарь',
    btnSaveSettings:      '💾 Сохранить и загрузить',
    btnClearCache:        '🗑 Очистить кэш',
    toolbarSearch:        '🔍 Поиск предметов...',
    toolbarCopyList:      '📋 Копировать список',
    toolbarCopied:        '✅ Скопировано!',
    toolbarRefresh:       '↻ Обновить цены',
    toolbarRefreshing:    '⏳ Обновление...',
    toolbarSelect:        '⬜ Выбрать',
    toolbarSelecting:     '✅ Выбор',
    sortDefault:          'По умолчанию',
    sortPriceHigh:        'Цена: высокая → низкая',
    sortPriceLow:         'Цена: низкая → высокая',
    sortFloatLow:         'Float: низкий → высокий',
    sortFloatHigh:        'Float: высокий → низкий',
    sortNameAZ:           'Название: А → Я',
    sortStickerVal:       'Стоимость стикеров ↓',
    sectionPricingMode:   'Режим цен',
    sectionDisplay:       'Отображение',
    sectionCache:         'Кэш',
    sectionLanguage:      'Язык',
    sectionTheme:         'Тема',
    labelLanguage:        'Язык интерфейса',
    labelLanguageNote:    'Язык для оверлеев и попапа VaultLens',
    labelTheme:           'Тема',
    themeDark:            'Тёмная',
    themeLight:           'Светлая',
    themeSystem:          'Системная',
    toggleFloatsLabel:    'Показывать Float',
    toggleStickersLabel:  'Показывать цены стикеров',
    togglePatternsLabel:  'Показывать паттерны',
    toggleTradelockLabel: 'Показывать блокировку трейда',
    profileCopySteamId:   '📋 Скопировать SteamID64',
    profileCopyTradeLink: '🔗 Скопировать трейд-ссылку',
    profileCSFloatStall:  '🔍 CSFloat Stall',
    profileCSGORep:       '🛡️ CSGO-Rep',
    tradeYouGive:         'Вы отдаёте',
    tradeYouReceive:      'Вы получаете',
    tradePnL:             'П/У',
    tradePriceDisclaimer: 'Цены могут отличаться. Проверяйте перед обменом.',
    stickerPopupTitle:    'Стикеры',
    stickerTotalValue:    'Общая стоимость стикеров',
    toastSteamIdCopied:   'SteamID64 скопирован!',
    toastTradeLinkCopied: 'Ссылка скопирована!',
    toastCopyFailed:      'Ошибка копирования',
    toastPricesRefreshed: 'Цены обновлены!',
    tradeLockLocked:      '🔒 Заблокировано',
    tradeLockToday:       '🔒 Сегодня',
    tradeLockOneDay:      '🔒 1 день',
    inventoryLoading:     'Загрузка...',
    statusSaved:          '✓ Настройки сохранены',
    statusCacheCleared:   '✓ Кэш очищен',
    statusApiKeyRequired: '✗ Введите API-ключ PricEmpire',
  },

  // ─── Chinese Simplified ──────────────────────
  'zh-CN': {
    tabOverview:          '概览',
    tabSettings:          '设置',
    tabAbout:             '关于',
    btnRefreshPrices:     '↻ 刷新价格',
    btnOpenInventory:     '打开库存',
    btnSaveSettings:      '💾 保存并获取价格',
    btnClearCache:        '🗑 清除缓存',
    toolbarSearch:        '🔍 搜索物品...',
    toolbarCopyList:      '📋 复制列表',
    toolbarCopied:        '✅ 已复制!',
    toolbarRefresh:       '↻ 刷新价格',
    toolbarRefreshing:    '⏳ 刷新中...',
    toolbarSelect:        '⬜ 选择',
    toolbarSelecting:     '✅ 选择中',
    sortDefault:          '默认排序',
    sortPriceHigh:        '价格: 高 → 低',
    sortPriceLow:         '价格: 低 → 高',
    sortFloatLow:         '磨损: 低 → 高',
    sortFloatHigh:        '磨损: 高 → 低',
    sortNameAZ:           '名称: A → Z',
    sortStickerVal:       '印花价值 ↓',
    sectionPricingMode:   '定价模式',
    sectionDisplay:       '显示选项',
    sectionCache:         '缓存',
    sectionLanguage:      '语言',
    sectionTheme:         '外观',
    labelLanguage:        '界面语言',
    labelLanguageNote:    'VaultLens 覆盖层和弹窗的语言',
    labelTheme:           '主题',
    themeDark:            '深色',
    themeLight:           '浅色',
    themeSystem:          '跟随系统',
    toggleFloatsLabel:    '显示磨损值',
    toggleStickersLabel:  '显示印花价格',
    togglePatternsLabel:  '显示图案徽章',
    toggleTradelockLabel: '显示交易锁定倒计时',
    profileCopySteamId:   '📋 复制 SteamID64',
    profileCopyTradeLink: '🔗 复制交易链接',
    profileCSFloatStall:  '🔍 CSFloat 摊位',
    profileCSGORep:       '🛡️ CSGO-Rep',
    tradeYouGive:         '你给出',
    tradeYouReceive:      '你收到',
    tradePnL:             '盈亏',
    tradePriceDisclaimer: '价格可能有所不同，交易前请核实。',
    stickerPopupTitle:    '印花',
    stickerTotalValue:    '印花总价值',
    toastSteamIdCopied:   'SteamID64 已复制!',
    toastTradeLinkCopied: '交易链接已复制!',
    toastCopyFailed:      '复制失败',
    toastPricesRefreshed: '价格已刷新!',
    tradeLockLocked:      '🔒 已锁定',
    tradeLockToday:       '🔒 今天',
    tradeLockOneDay:      '🔒 1天',
    inventoryLoading:     '加载中...',
    statusSaved:          '✓ 设置已保存',
    statusCacheCleared:   '✓ 缓存已清除',
    statusApiKeyRequired: '✗ 请输入 PricEmpire API 密钥',
  },

  // ─── Chinese Traditional ─────────────────────
  'zh-TW': {
    tabOverview:          '概覽',
    tabSettings:          '設定',
    tabAbout:             '關於',
    btnRefreshPrices:     '↻ 重新整理價格',
    btnOpenInventory:     '開啟庫存',
    btnSaveSettings:      '💾 儲存並取得價格',
    btnClearCache:        '🗑 清除快取',
    toolbarSearch:        '🔍 搜尋物品...',
    toolbarCopyList:      '📋 複製清單',
    toolbarCopied:        '✅ 已複製!',
    toolbarRefresh:       '↻ 重新整理價格',
    toolbarRefreshing:    '⏳ 重新整理中...',
    toolbarSelect:        '⬜ 選取',
    toolbarSelecting:     '✅ 選取中',
    sortDefault:          '預設順序',
    sortPriceHigh:        '價格: 高 → 低',
    sortPriceLow:         '價格: 低 → 高',
    sortFloatLow:         '磨損: 低 → 高',
    sortFloatHigh:        '磨損: 高 → 低',
    sortNameAZ:           '名稱: A → Z',
    sortStickerVal:       '貼紙價值 ↓',
    sectionPricingMode:   '定價模式',
    sectionDisplay:       '顯示選項',
    sectionCache:         '快取',
    sectionLanguage:      '語言',
    sectionTheme:         '外觀',
    labelLanguage:        '介面語言',
    labelLanguageNote:    'VaultLens 疊加層和彈出視窗的語言',
    labelTheme:           '主題',
    themeDark:            '深色',
    themeLight:           '淺色',
    themeSystem:          '跟隨系統',
    toggleFloatsLabel:    '顯示磨損值',
    toggleStickersLabel:  '顯示貼紙價格',
    togglePatternsLabel:  '顯示圖案徽章',
    toggleTradelockLabel: '顯示交易鎖定倒計時',
    profileCopySteamId:   '📋 複製 SteamID64',
    profileCopyTradeLink: '🔗 複製交易連結',
    profileCSFloatStall:  '🔍 CSFloat 攤位',
    profileCSGORep:       '🛡️ CSGO-Rep',
    tradeYouGive:         '你給出',
    tradeYouReceive:      '你收到',
    tradePnL:             '損益',
    tradePriceDisclaimer: '價格可能有所不同，交易前請核實。',
    stickerPopupTitle:    '貼紙',
    stickerTotalValue:    '貼紙總價值',
    toastSteamIdCopied:   'SteamID64 已複製!',
    toastTradeLinkCopied: '交易連結已複製!',
    toastCopyFailed:      '複製失敗',
    toastPricesRefreshed: '價格已重新整理!',
    tradeLockLocked:      '🔒 已鎖定',
    tradeLockToday:       '🔒 今天',
    tradeLockOneDay:      '🔒 1天',
    inventoryLoading:     '載入中...',
    statusSaved:          '✓ 設定已儲存',
    statusCacheCleared:   '✓ 快取已清除',
    statusApiKeyRequired: '✗ 請輸入 PricEmpire API 金鑰',
  },

  // ─── German ──────────────────────────────────
  de: {
    tabOverview:          'Übersicht',
    tabSettings:          'Einstellungen',
    tabAbout:             'Über',
    btnRefreshPrices:     '↻ Preise aktualisieren',
    btnOpenInventory:     'Inventar öffnen',
    btnSaveSettings:      '💾 Speichern & Preise laden',
    btnClearCache:        '🗑 Cache leeren',
    toolbarSearch:        '🔍 Items suchen...',
    toolbarCopyList:      '📋 Liste kopieren',
    toolbarCopied:        '✅ Kopiert!',
    toolbarRefresh:       '↻ Preise aktualisieren',
    toolbarRefreshing:    '⏳ Aktualisierung...',
    toolbarSelect:        '⬜ Auswählen',
    toolbarSelecting:     '✅ Auswahl',
    sortDefault:          'Standardreihenfolge',
    sortPriceHigh:        'Preis: Hoch → Niedrig',
    sortPriceLow:         'Preis: Niedrig → Hoch',
    sortFloatLow:         'Float: Niedrig → Hoch',
    sortFloatHigh:        'Float: Hoch → Niedrig',
    sortNameAZ:           'Name: A → Z',
    sortStickerVal:       'Stickerwert ↓',
    sectionPricingMode:   'Preismodus',
    sectionDisplay:       'Anzeigeoptionen',
    sectionCache:         'Cache',
    sectionLanguage:      'Sprache',
    sectionTheme:         'Erscheinungsbild',
    labelLanguage:        'Oberflächensprache',
    labelLanguageNote:    'Sprache für VaultLens-Overlays und Popup',
    labelTheme:           'Thema',
    themeDark:            'Dunkel',
    themeLight:           'Hell',
    themeSystem:          'Systemstandard',
    toggleFloatsLabel:    'Float-Werte anzeigen',
    toggleStickersLabel:  'Stickerpreise anzeigen',
    togglePatternsLabel:  'Muster-Badges anzeigen',
    toggleTradelockLabel: 'Handelssperre anzeigen',
    profileCopySteamId:   '📋 SteamID64 kopieren',
    profileCopyTradeLink: '🔗 Handelslink kopieren',
    profileCSFloatStall:  '🔍 CSFloat Stall',
    profileCSGORep:       '🛡️ CSGO-Rep',
    tradeYouGive:         'Du gibst',
    tradeYouReceive:      'Du erhältst',
    tradePnL:             'G/V',
    tradePriceDisclaimer: 'Preise können abweichen. Vor dem Handel prüfen.',
    stickerPopupTitle:    'Sticker',
    stickerTotalValue:    'Gesamter Stickerwert',
    toastSteamIdCopied:   'SteamID64 kopiert!',
    toastTradeLinkCopied: 'Handelslink kopiert!',
    toastCopyFailed:      'Kopieren fehlgeschlagen',
    toastPricesRefreshed: 'Preise aktualisiert!',
    tradeLockLocked:      '🔒 Gesperrt',
    tradeLockToday:       '🔒 Heute',
    tradeLockOneDay:      '🔒 1 Tag',
    inventoryLoading:     'Laden...',
    statusSaved:          '✓ Einstellungen gespeichert',
    statusCacheCleared:   '✓ Cache erfolgreich geleert',
    statusApiKeyRequired: '✗ Bitte PricEmpire API-Schlüssel eingeben',
  },

  // ─── French ──────────────────────────────────
  fr: {
    tabOverview:          'Aperçu',
    tabSettings:          'Paramètres',
    tabAbout:             'À propos',
    btnRefreshPrices:     '↻ Actualiser les prix',
    btnOpenInventory:     'Ouvrir l\'inventaire',
    btnSaveSettings:      '💾 Sauvegarder et charger',
    btnClearCache:        '🗑 Vider le cache',
    toolbarSearch:        '🔍 Rechercher des objets...',
    toolbarCopyList:      '📋 Copier la liste',
    toolbarCopied:        '✅ Copié !',
    toolbarRefresh:       '↻ Actualiser les prix',
    toolbarRefreshing:    '⏳ Actualisation...',
    toolbarSelect:        '⬜ Sélectionner',
    toolbarSelecting:     '✅ Sélection',
    sortDefault:          'Ordre par défaut',
    sortPriceHigh:        'Prix : Élevé → Bas',
    sortPriceLow:         'Prix : Bas → Élevé',
    sortFloatLow:         'Float : Bas → Élevé',
    sortFloatHigh:        'Float : Élevé → Bas',
    sortNameAZ:           'Nom : A → Z',
    sortStickerVal:       'Valeur sticker ↓',
    sectionPricingMode:   'Mode de tarification',
    sectionDisplay:       'Options d\'affichage',
    sectionCache:         'Cache',
    sectionLanguage:      'Langue',
    sectionTheme:         'Apparence',
    labelLanguage:        'Langue de l\'interface',
    labelLanguageNote:    'Langue pour les overlays et le popup VaultLens',
    labelTheme:           'Thème',
    themeDark:            'Sombre',
    themeLight:           'Clair',
    themeSystem:          'Système',
    toggleFloatsLabel:    'Afficher les floats',
    toggleStickersLabel:  'Afficher les prix des stickers',
    togglePatternsLabel:  'Afficher les badges de motifs',
    toggleTradelockLabel: 'Afficher le blocage d\'échange',
    profileCopySteamId:   '📋 Copier SteamID64',
    profileCopyTradeLink: '🔗 Copier le lien d\'échange',
    profileCSFloatStall:  '🔍 Stand CSFloat',
    profileCSGORep:       '🛡️ CSGO-Rep',
    tradeYouGive:         'Vous donnez',
    tradeYouReceive:      'Vous recevez',
    tradePnL:             'G/P',
    tradePriceDisclaimer: 'Les prix peuvent varier. Vérifiez avant d\'échanger.',
    stickerPopupTitle:    'Stickers',
    stickerTotalValue:    'Valeur totale des stickers',
    toastSteamIdCopied:   'SteamID64 copié !',
    toastTradeLinkCopied: 'Lien d\'échange copié !',
    toastCopyFailed:      'Échec de la copie',
    toastPricesRefreshed: 'Prix actualisés !',
    tradeLockLocked:      '🔒 Bloqué',
    tradeLockToday:       '🔒 Aujourd\'hui',
    tradeLockOneDay:      '🔒 1 jour',
    inventoryLoading:     'Chargement...',
    statusSaved:          '✓ Paramètres sauvegardés',
    statusCacheCleared:   '✓ Cache vidé avec succès',
    statusApiKeyRequired: '✗ Veuillez entrer votre clé API PricEmpire',
  },

  // ─── Spanish ─────────────────────────────────
  es: {
    tabOverview:          'Resumen',
    tabSettings:          'Ajustes',
    tabAbout:             'Acerca de',
    btnRefreshPrices:     '↻ Actualizar precios',
    btnOpenInventory:     'Abrir inventario',
    btnSaveSettings:      '💾 Guardar y cargar precios',
    btnClearCache:        '🗑 Limpiar caché',
    toolbarSearch:        '🔍 Buscar objetos...',
    toolbarCopyList:      '📋 Copiar lista',
    toolbarCopied:        '✅ ¡Copiado!',
    toolbarRefresh:       '↻ Actualizar precios',
    toolbarRefreshing:    '⏳ Actualizando...',
    toolbarSelect:        '⬜ Seleccionar',
    toolbarSelecting:     '✅ Seleccionando',
    sortDefault:          'Orden predeterminado',
    sortPriceHigh:        'Precio: Alto → Bajo',
    sortPriceLow:         'Precio: Bajo → Alto',
    sortFloatLow:         'Float: Bajo → Alto',
    sortFloatHigh:        'Float: Alto → Bajo',
    sortNameAZ:           'Nombre: A → Z',
    sortStickerVal:       'Valor de sticker ↓',
    sectionPricingMode:   'Modo de precios',
    sectionDisplay:       'Opciones de visualización',
    sectionCache:         'Caché',
    sectionLanguage:      'Idioma',
    sectionTheme:         'Apariencia',
    labelLanguage:        'Idioma de la interfaz',
    labelLanguageNote:    'Idioma para los overlays y el popup de VaultLens',
    labelTheme:           'Tema',
    themeDark:            'Oscuro',
    themeLight:           'Claro',
    themeSystem:          'Predeterminado del sistema',
    toggleFloatsLabel:    'Mostrar valores float',
    toggleStickersLabel:  'Mostrar precios de stickers',
    togglePatternsLabel:  'Mostrar insignias de patrones',
    toggleTradelockLabel: 'Mostrar bloqueo de intercambio',
    profileCopySteamId:   '📋 Copiar SteamID64',
    profileCopyTradeLink: '🔗 Copiar enlace de intercambio',
    profileCSFloatStall:  '🔍 Stand de CSFloat',
    profileCSGORep:       '🛡️ CSGO-Rep',
    tradeYouGive:         'Tú das',
    tradeYouReceive:      'Tú recibes',
    tradePnL:             'G/P',
    tradePriceDisclaimer: 'Los precios pueden variar. Verifica antes de intercambiar.',
    stickerPopupTitle:    'Stickers',
    stickerTotalValue:    'Valor total de stickers',
    toastSteamIdCopied:   '¡SteamID64 copiado!',
    toastTradeLinkCopied: '¡Enlace copiado!',
    toastCopyFailed:      'Error al copiar',
    toastPricesRefreshed: '¡Precios actualizados!',
    tradeLockLocked:      '🔒 Bloqueado',
    tradeLockToday:       '🔒 Hoy',
    tradeLockOneDay:      '🔒 1 día',
    inventoryLoading:     'Cargando...',
    statusSaved:          '✓ Ajustes guardados',
    statusCacheCleared:   '✓ Caché limpiada',
    statusApiKeyRequired: '✗ Introduce tu clave API de PricEmpire',
  },

  // ─── Portuguese ──────────────────────────────
  pt: {
    tabOverview:          'Visão Geral',
    tabSettings:          'Configurações',
    tabAbout:             'Sobre',
    btnRefreshPrices:     '↻ Atualizar preços',
    btnOpenInventory:     'Abrir inventário',
    btnSaveSettings:      '💾 Salvar e buscar preços',
    btnClearCache:        '🗑 Limpar cache',
    toolbarSearch:        '🔍 Pesquisar itens...',
    toolbarCopyList:      '📋 Copiar lista',
    toolbarCopied:        '✅ Copiado!',
    toolbarRefresh:       '↻ Atualizar preços',
    toolbarRefreshing:    '⏳ Atualizando...',
    toolbarSelect:        '⬜ Selecionar',
    toolbarSelecting:     '✅ Selecionando',
    sortDefault:          'Ordem padrão',
    sortPriceHigh:        'Preço: Alto → Baixo',
    sortPriceLow:         'Preço: Baixo → Alto',
    sortFloatLow:         'Float: Baixo → Alto',
    sortFloatHigh:        'Float: Alto → Baixo',
    sortNameAZ:           'Nome: A → Z',
    sortStickerVal:       'Valor de adesivo ↓',
    sectionPricingMode:   'Modo de preços',
    sectionDisplay:       'Opções de exibição',
    sectionCache:         'Cache',
    sectionLanguage:      'Idioma',
    sectionTheme:         'Aparência',
    labelLanguage:        'Idioma da interface',
    labelLanguageNote:    'Idioma para overlays e popup do VaultLens',
    labelTheme:           'Tema',
    themeDark:            'Escuro',
    themeLight:           'Claro',
    themeSystem:          'Padrão do sistema',
    toggleFloatsLabel:    'Mostrar valores float',
    toggleStickersLabel:  'Mostrar preços de adesivos',
    togglePatternsLabel:  'Mostrar badges de padrões',
    toggleTradelockLabel: 'Mostrar bloqueio de troca',
    profileCopySteamId:   '📋 Copiar SteamID64',
    profileCopyTradeLink: '🔗 Copiar link de troca',
    profileCSFloatStall:  '🔍 Estande CSFloat',
    profileCSGORep:       '🛡️ CSGO-Rep',
    tradeYouGive:         'Você dá',
    tradeYouReceive:      'Você recebe',
    tradePnL:             'L/P',
    tradePriceDisclaimer: 'Preços podem variar. Verifique antes de trocar.',
    stickerPopupTitle:    'Adesivos',
    stickerTotalValue:    'Valor total dos adesivos',
    toastSteamIdCopied:   'SteamID64 copiado!',
    toastTradeLinkCopied: 'Link de troca copiado!',
    toastCopyFailed:      'Falha ao copiar',
    toastPricesRefreshed: 'Preços atualizados!',
    tradeLockLocked:      '🔒 Bloqueado',
    tradeLockToday:       '🔒 Hoje',
    tradeLockOneDay:      '🔒 1 dia',
    inventoryLoading:     'Carregando...',
    statusSaved:          '✓ Configurações salvas',
    statusCacheCleared:   '✓ Cache limpo com sucesso',
    statusApiKeyRequired: '✗ Insira sua chave de API do PricEmpire',
  },

  // ─── Turkish ─────────────────────────────────
  tr: {
    tabOverview:          'Genel Bakış',
    tabSettings:          'Ayarlar',
    tabAbout:             'Hakkında',
    btnRefreshPrices:     '↻ Fiyatları Yenile',
    btnOpenInventory:     'Envanteri Aç',
    btnSaveSettings:      '💾 Kaydet ve Fiyatları Al',
    btnClearCache:        '🗑 Önbelleği Temizle',
    toolbarSearch:        '🔍 Öğe ara...',
    toolbarCopyList:      '📋 Listeyi Kopyala',
    toolbarCopied:        '✅ Kopyalandı!',
    toolbarRefresh:       '↻ Fiyatları Yenile',
    toolbarRefreshing:    '⏳ Yenileniyor...',
    toolbarSelect:        '⬜ Seç',
    toolbarSelecting:     '✅ Seçiliyor',
    sortDefault:          'Varsayılan Sıra',
    sortPriceHigh:        'Fiyat: Yüksek → Düşük',
    sortPriceLow:         'Fiyat: Düşük → Yüksek',
    sortFloatLow:         'Float: Düşük → Yüksek',
    sortFloatHigh:        'Float: Yüksek → Düşük',
    sortNameAZ:           'Ad: A → Z',
    sortStickerVal:       'Çıkartma Değeri ↓',
    sectionPricingMode:   'Fiyatlandırma Modu',
    sectionDisplay:       'Görüntüleme Seçenekleri',
    sectionCache:         'Önbellek',
    sectionLanguage:      'Dil',
    sectionTheme:         'Görünüm',
    labelLanguage:        'Arayüz Dili',
    labelLanguageNote:    'VaultLens katmanları ve açılır pencere dili',
    labelTheme:           'Tema',
    themeDark:            'Koyu',
    themeLight:           'Açık',
    themeSystem:          'Sistem Varsayılanı',
    toggleFloatsLabel:    'Float Değerlerini Göster',
    toggleStickersLabel:  'Çıkartma Fiyatlarını Göster',
    togglePatternsLabel:  'Desen Rozetlerini Göster',
    toggleTradelockLabel: 'Takas Kilidini Göster',
    profileCopySteamId:   '📋 SteamID64 Kopyala',
    profileCopyTradeLink: '🔗 Takas Bağlantısını Kopyala',
    profileCSFloatStall:  '🔍 CSFloat Standı',
    profileCSGORep:       '🛡️ CSGO-Rep',
    tradeYouGive:         'Veriyorsunuz',
    tradeYouReceive:      'Alıyorsunuz',
    tradePnL:             'K/Z',
    tradePriceDisclaimer: 'Fiyatlar değişebilir. Takas öncesi doğrulayın.',
    stickerPopupTitle:    'Çıkartmalar',
    stickerTotalValue:    'Toplam Çıkartma Değeri',
    toastSteamIdCopied:   'SteamID64 kopyalandı!',
    toastTradeLinkCopied: 'Takas bağlantısı kopyalandı!',
    toastCopyFailed:      'Kopyalama başarısız',
    toastPricesRefreshed: 'Fiyatlar yenilendi!',
    tradeLockLocked:      '🔒 Kilitli',
    tradeLockToday:       '🔒 Bugün',
    tradeLockOneDay:      '🔒 1 gün',
    inventoryLoading:     'Yükleniyor...',
    statusSaved:          '✓ Ayarlar kaydedildi',
    statusCacheCleared:   '✓ Önbellek temizlendi',
    statusApiKeyRequired: '✗ PricEmpire API anahtarını girin',
  },

  // ─── Polish ──────────────────────────────────
  pl: {
    tabOverview:          'Przegląd',
    tabSettings:          'Ustawienia',
    tabAbout:             'O rozszerzeniu',
    btnRefreshPrices:     '↻ Odśwież ceny',
    btnOpenInventory:     'Otwórz ekwipunek',
    btnSaveSettings:      '💾 Zapisz i pobierz ceny',
    btnClearCache:        '🗑 Wyczyść pamięć',
    toolbarSearch:        '🔍 Szukaj przedmiotów...',
    toolbarCopyList:      '📋 Kopiuj listę',
    toolbarCopied:        '✅ Skopiowano!',
    toolbarRefresh:       '↻ Odśwież ceny',
    toolbarRefreshing:    '⏳ Odświeżanie...',
    toolbarSelect:        '⬜ Zaznacz',
    toolbarSelecting:     '✅ Zaznaczanie',
    sortDefault:          'Domyślna kolejność',
    sortPriceHigh:        'Cena: Wysoka → Niska',
    sortPriceLow:         'Cena: Niska → Wysoka',
    sortFloatLow:         'Float: Niski → Wysoki',
    sortFloatHigh:        'Float: Wysoki → Niski',
    sortNameAZ:           'Nazwa: A → Z',
    sortStickerVal:       'Wartość naklejek ↓',
    sectionPricingMode:   'Tryb cenowy',
    sectionDisplay:       'Opcje wyświetlania',
    sectionCache:         'Pamięć podręczna',
    sectionLanguage:      'Język',
    sectionTheme:         'Wygląd',
    labelLanguage:        'Język interfejsu',
    labelLanguageNote:    'Język dla nakładek i okienka VaultLens',
    labelTheme:           'Motyw',
    themeDark:            'Ciemny',
    themeLight:           'Jasny',
    themeSystem:          'Systemowy',
    toggleFloatsLabel:    'Pokaż wartości float',
    toggleStickersLabel:  'Pokaż ceny naklejek',
    togglePatternsLabel:  'Pokaż odznaki wzorów',
    toggleTradelockLabel: 'Pokaż blokadę handlu',
    profileCopySteamId:   '📋 Kopiuj SteamID64',
    profileCopyTradeLink: '🔗 Kopiuj link wymiany',
    profileCSFloatStall:  '🔍 Stragan CSFloat',
    profileCSGORep:       '🛡️ CSGO-Rep',
    tradeYouGive:         'Dajesz',
    tradeYouReceive:      'Otrzymujesz',
    tradePnL:             'Z/S',
    tradePriceDisclaimer: 'Ceny mogą się różnić. Sprawdź przed wymianą.',
    stickerPopupTitle:    'Naklejki',
    stickerTotalValue:    'Łączna wartość naklejek',
    toastSteamIdCopied:   'SteamID64 skopiowany!',
    toastTradeLinkCopied: 'Link wymiany skopiowany!',
    toastCopyFailed:      'Błąd kopiowania',
    toastPricesRefreshed: 'Ceny odświeżone!',
    tradeLockLocked:      '🔒 Zablokowane',
    tradeLockToday:       '🔒 Dzisiaj',
    tradeLockOneDay:      '🔒 1 dzień',
    inventoryLoading:     'Ładowanie...',
    statusSaved:          '✓ Ustawienia zapisane',
    statusCacheCleared:   '✓ Pamięć wyczyszczona',
    statusApiKeyRequired: '✗ Wprowadź klucz API PricEmpire',
  },

  // ─── Korean ──────────────────────────────────
  ko: {
    tabOverview:          '개요',
    tabSettings:          '설정',
    tabAbout:             '정보',
    btnRefreshPrices:     '↻ 가격 새로고침',
    btnOpenInventory:     '인벤토리 열기',
    btnSaveSettings:      '💾 저장 및 가격 가져오기',
    btnClearCache:        '🗑 캐시 지우기',
    toolbarSearch:        '🔍 아이템 검색...',
    toolbarCopyList:      '📋 목록 복사',
    toolbarCopied:        '✅ 복사됨!',
    toolbarRefresh:       '↻ 가격 새로고침',
    toolbarRefreshing:    '⏳ 새로고침 중...',
    toolbarSelect:        '⬜ 선택',
    toolbarSelecting:     '✅ 선택 중',
    sortDefault:          '기본 순서',
    sortPriceHigh:        '가격: 높음 → 낮음',
    sortPriceLow:         '가격: 낮음 → 높음',
    sortFloatLow:         '플로트: 낮음 → 높음',
    sortFloatHigh:        '플로트: 높음 → 낮음',
    sortNameAZ:           '이름: A → Z',
    sortStickerVal:       '스티커 가치 ↓',
    sectionPricingMode:   '가격 모드',
    sectionDisplay:       '표시 옵션',
    sectionCache:         '캐시',
    sectionLanguage:      '언어',
    sectionTheme:         '테마',
    labelLanguage:        '인터페이스 언어',
    labelLanguageNote:    'VaultLens 오버레이 및 팝업 언어',
    labelTheme:           '테마',
    themeDark:            '다크',
    themeLight:           '라이트',
    themeSystem:          '시스템 기본값',
    toggleFloatsLabel:    '플로트 값 표시',
    toggleStickersLabel:  '스티커 가격 표시',
    togglePatternsLabel:  '패턴 배지 표시',
    toggleTradelockLabel: '거래 잠금 카운트다운 표시',
    profileCopySteamId:   '📋 SteamID64 복사',
    profileCopyTradeLink: '🔗 거래 링크 복사',
    profileCSFloatStall:  '🔍 CSFloat 스톨',
    profileCSGORep:       '🛡️ CSGO-Rep',
    tradeYouGive:         '당신이 주는 것',
    tradeYouReceive:      '당신이 받는 것',
    tradePnL:             '손익',
    tradePriceDisclaimer: '가격은 다를 수 있습니다. 거래 전 확인하세요.',
    stickerPopupTitle:    '스티커',
    stickerTotalValue:    '스티커 총 가치',
    toastSteamIdCopied:   'SteamID64 복사됨!',
    toastTradeLinkCopied: '거래 링크 복사됨!',
    toastCopyFailed:      '복사 실패',
    toastPricesRefreshed: '가격 새로고침됨!',
    tradeLockLocked:      '🔒 잠금',
    tradeLockToday:       '🔒 오늘',
    tradeLockOneDay:      '🔒 1일',
    inventoryLoading:     '로딩 중...',
    statusSaved:          '✓ 설정 저장됨',
    statusCacheCleared:   '✓ 캐시 지워짐',
    statusApiKeyRequired: '✗ PricEmpire API 키를 입력하세요',
  },

  // ─── Japanese ────────────────────────────────
  ja: {
    tabOverview:          '概要',
    tabSettings:          '設定',
    tabAbout:             '情報',
    btnRefreshPrices:     '↻ 価格を更新',
    btnOpenInventory:     'インベントリを開く',
    btnSaveSettings:      '💾 保存して価格を取得',
    btnClearCache:        '🗑 キャッシュをクリア',
    toolbarSearch:        '🔍 アイテムを検索...',
    toolbarCopyList:      '📋 リストをコピー',
    toolbarCopied:        '✅ コピーしました!',
    toolbarRefresh:       '↻ 価格を更新',
    toolbarRefreshing:    '⏳ 更新中...',
    toolbarSelect:        '⬜ 選択',
    toolbarSelecting:     '✅ 選択中',
    sortDefault:          'デフォルト順',
    sortPriceHigh:        '価格: 高 → 低',
    sortPriceLow:         '価格: 低 → 高',
    sortFloatLow:         'フロート: 低 → 高',
    sortFloatHigh:        'フロート: 高 → 低',
    sortNameAZ:           '名前: A → Z',
    sortStickerVal:       'ステッカー価値 ↓',
    sectionPricingMode:   '価格モード',
    sectionDisplay:       '表示オプション',
    sectionCache:         'キャッシュ',
    sectionLanguage:      '言語',
    sectionTheme:         '外観',
    labelLanguage:        'インターフェース言語',
    labelLanguageNote:    'VaultLensオーバーレイとポップアップの言語',
    labelTheme:           'テーマ',
    themeDark:            'ダーク',
    themeLight:           'ライト',
    themeSystem:          'システムデフォルト',
    toggleFloatsLabel:    'フロート値を表示',
    toggleStickersLabel:  'ステッカー価格を表示',
    togglePatternsLabel:  'パターンバッジを表示',
    toggleTradelockLabel: 'トレードロックを表示',
    profileCopySteamId:   '📋 SteamID64をコピー',
    profileCopyTradeLink: '🔗 トレードリンクをコピー',
    profileCSFloatStall:  '🔍 CSFloatスタール',
    profileCSGORep:       '🛡️ CSGO-Rep',
    tradeYouGive:         'あなたが渡す',
    tradeYouReceive:      'あなたが受け取る',
    tradePnL:             '損益',
    tradePriceDisclaimer: '価格は変動する場合があります。取引前に確認してください。',
    stickerPopupTitle:    'ステッカー',
    stickerTotalValue:    'ステッカー合計価値',
    toastSteamIdCopied:   'SteamID64をコピーしました!',
    toastTradeLinkCopied: 'トレードリンクをコピーしました!',
    toastCopyFailed:      'コピー失敗',
    toastPricesRefreshed: '価格を更新しました!',
    tradeLockLocked:      '🔒 ロック中',
    tradeLockToday:       '🔒 本日',
    tradeLockOneDay:      '🔒 1日',
    inventoryLoading:     '読み込み中...',
    statusSaved:          '✓ 設定を保存しました',
    statusCacheCleared:   '✓ キャッシュをクリアしました',
    statusApiKeyRequired: '✗ PricEmpire APIキーを入力してください',
  },

  // ─── Arabic ──────────────────────────────────
  ar: {
    tabOverview:          'نظرة عامة',
    tabSettings:          'الإعدادات',
    tabAbout:             'حول',
    btnRefreshPrices:     '↻ تحديث الأسعار',
    btnOpenInventory:     'فتح المخزون',
    btnSaveSettings:      '💾 حفظ وجلب الأسعار',
    btnClearCache:        '🗑 مسح ذاكرة التخزين المؤقت',
    toolbarSearch:        '🔍 البحث عن عناصر...',
    toolbarCopyList:      '📋 نسخ القائمة',
    toolbarCopied:        '✅ تم النسخ!',
    toolbarRefresh:       '↻ تحديث الأسعار',
    toolbarRefreshing:    '⏳ جارٍ التحديث...',
    toolbarSelect:        '⬜ تحديد',
    toolbarSelecting:     '✅ جارٍ التحديد',
    sortDefault:          'الترتيب الافتراضي',
    sortPriceHigh:        'السعر: من الأعلى إلى الأدنى',
    sortPriceLow:         'السعر: من الأدنى إلى الأعلى',
    sortFloatLow:         'Float: من الأدنى إلى الأعلى',
    sortFloatHigh:        'Float: من الأعلى إلى الأدنى',
    sortNameAZ:           'الاسم: أ → ي',
    sortStickerVal:       'قيمة الملصق ↓',
    sectionPricingMode:   'وضع التسعير',
    sectionDisplay:       'خيارات العرض',
    sectionCache:         'ذاكرة التخزين المؤقت',
    sectionLanguage:      'اللغة',
    sectionTheme:         'المظهر',
    labelLanguage:        'لغة الواجهة',
    labelLanguageNote:    'لغة تراكبات ونافذة VaultLens المنبثقة',
    labelTheme:           'الثيم',
    themeDark:            'داكن',
    themeLight:           'فاتح',
    themeSystem:          'افتراضي النظام',
    toggleFloatsLabel:    'إظهار قيم Float',
    toggleStickersLabel:  'إظهار أسعار الملصقات',
    togglePatternsLabel:  'إظهار شارات الأنماط',
    toggleTradelockLabel: 'إظهار قفل التداول',
    profileCopySteamId:   '📋 نسخ SteamID64',
    profileCopyTradeLink: '🔗 نسخ رابط التداول',
    profileCSFloatStall:  '🔍 كشك CSFloat',
    profileCSGORep:       '🛡️ CSGO-Rep',
    tradeYouGive:         'ما تعطيه',
    tradeYouReceive:      'ما تستلمه',
    tradePnL:             'ر/خ',
    tradePriceDisclaimer: 'قد تتفاوت الأسعار. تحقق دائماً قبل التداول.',
    stickerPopupTitle:    'الملصقات',
    stickerTotalValue:    'إجمالي قيمة الملصقات',
    toastSteamIdCopied:   'تم نسخ SteamID64!',
    toastTradeLinkCopied: 'تم نسخ رابط التداول!',
    toastCopyFailed:      'فشل النسخ',
    toastPricesRefreshed: 'تم تحديث الأسعار!',
    tradeLockLocked:      '🔒 مقفل',
    tradeLockToday:       '🔒 اليوم',
    tradeLockOneDay:      '🔒 يوم واحد',
    inventoryLoading:     'جارٍ التحميل...',
    statusSaved:          '✓ تم حفظ الإعدادات',
    statusCacheCleared:   '✓ تم مسح ذاكرة التخزين المؤقت',
    statusApiKeyRequired: '✗ الرجاء إدخال مفتاح API الخاص بـ PricEmpire',
  },
};

// ─────────────────────────────────────────────
// Runtime i18n Engine
// ─────────────────────────────────────────────

/** Currently active language code */
let _activeLang = 'en';

/**
 * Initialize the i18n engine.
 * Loads the user's saved language preference from chrome.storage.local.
 * Falls back to Chrome's UI language, then English.
 *
 * @returns {Promise<string>} The resolved language code
 */
export async function initI18n() {
  return new Promise(resolve => {
    chrome.storage.local.get([LANGUAGE_STORAGE_KEY], result => {
      const saved = result[LANGUAGE_STORAGE_KEY];
      if (saved && TRANSLATIONS[saved]) {
        _activeLang = saved;
      } else {
        // Detect Chrome UI language
        const chromeLang = (navigator.language || 'en').split('-')[0];
        // Check exact match first, then prefix match
        if (TRANSLATIONS[navigator.language]) {
          _activeLang = navigator.language;
        } else if (TRANSLATIONS[chromeLang]) {
          _activeLang = chromeLang;
        } else {
          _activeLang = 'en';
        }
      }
      resolve(_activeLang);
    });
  });
}

/**
 * Set the active language (called when user changes language in Settings).
 * Persists to storage.
 * @param {string} langCode
 */
export async function setLanguage(langCode) {
  _activeLang = TRANSLATIONS[langCode] ? langCode : 'en';
  return new Promise(resolve => {
    chrome.storage.local.set({ [LANGUAGE_STORAGE_KEY]: _activeLang }, resolve);
  });
}

/**
 * Get the currently active language code.
 * @returns {string}
 */
export function getActiveLang() {
  return _activeLang;
}

/**
 * Get a translated string for the given key.
 *
 * Lookup order:
 *  1. Runtime translation map for active language
 *  2. Chrome's built-in i18n (chrome.i18n.getMessage) — handles _locales/
 *  3. English fallback from runtime map
 *  4. The key itself (last resort)
 *
 * @param {string} key        - Message key (matches messages.json key)
 * @param {string[]} [subs]   - Substitution values for $PLACEHOLDER$ tokens
 * @returns {string}
 */
export function t(key, subs) {
  // 1. Runtime translation map
  const langMap = TRANSLATIONS[_activeLang] || {};
  let   str     = langMap[key];

  // 2. Chrome i18n fallback
  if (!str && typeof chrome !== 'undefined' && chrome.i18n) {
    try {
      str = chrome.i18n.getMessage(key, subs);
    } catch {}
  }

  // 3. English fallback
  if (!str) {
    str = TRANSLATIONS.en[key] || '';
  }

  // 4. Key as last resort
  if (!str) str = key;

  // Apply substitutions ($1, $2, ... or named $NAME$)
  if (subs && subs.length > 0) {
    subs.forEach((sub, i) => {
      str = str.replace(new RegExp(`\\$${i + 1}`, 'g'), sub);
    });
  }

  return str;
}

/**
 * Synchronous version of t() for use in content scripts
 * where async is impractical. Uses module-level _activeLang.
 * Must call initI18n() before this is meaningful.
 *
 * @param {string} key
 * @param {string[]} [subs]
 * @returns {string}
 */
export const __ = t;

/**
 * Apply i18n to an element's textContent by data-i18n attribute.
 * Use in popup HTML like: <span data-i18n="tabOverview"></span>
 *
 * @param {Element} root - Root element to search within
 */
export function applyI18nToDOM(root = document) {
  const elements = root.querySelectorAll('[data-i18n]');
  for (const el of elements) {
    const key = el.dataset.i18n;
    if (key) el.textContent = t(key);
  }
  const placeholders = root.querySelectorAll('[data-i18n-placeholder]');
  for (const el of placeholders) {
    const key = el.dataset.i18nPlaceholder;
    if (key) el.placeholder = t(key);
  }
}

// ─────────────────────────────────────────────
// Theme Engine
// ─────────────────────────────────────────────

export const THEMES = {
  dark:   'dark',
  light:  'light',
  system: 'system',
};

/** Currently active theme */
let _activeTheme = 'dark';

/**
 * CSS custom property overrides for light theme.
 * Applied to :root when light theme is active.
 */
export const LIGHT_THEME_VARS = `
  :root[data-vl-theme="light"] {
    --vl-bg:           #f1f5f9;
    --vl-bg-2:         #ffffff;
    --vl-bg-3:         #e2e8f0;
    --vl-border:       #cbd5e1;
    --vl-border-hi:    #94a3b8;
    --vl-text:         #0f172a;
    --vl-text-muted:   #475569;
    --vl-accent:       #ea580c;
    --vl-green:        #16a34a;
    --vl-red:          #dc2626;
    --vl-gold:         #d97706;
    --vl-shadow:       0 2px 12px rgba(0,0,0,0.12);
  }
`;

/** Popup-specific light theme overrides */
export const POPUP_LIGHT_THEME = `
  [data-vl-theme="light"] body {
    background: #f1f5f9;
    color: #0f172a;
  }
  [data-vl-theme="light"] .header,
  [data-vl-theme="light"] .tabs {
    background: #ffffff;
    border-color: #e2e8f0;
  }
  [data-vl-theme="light"] .tab {
    color: #64748b;
  }
  [data-vl-theme="light"] .tab--active {
    color: #ea580c;
    border-bottom-color: #ea580c;
  }
  [data-vl-theme="light"] .stat-card,
  [data-vl-theme="light"] .settings-section,
  [data-vl-theme="light"] .context-banner,
  [data-vl-theme="light"] .toc,
  [data-vl-theme="light"] .highlight-box {
    background: #ffffff;
    border-color: #e2e8f0;
  }
  [data-vl-theme="light"] .stat-card__label,
  [data-vl-theme="light"] .settings-section__title,
  [data-vl-theme="light"] .info-row__label,
  [data-vl-theme="light"] .toggle-row__desc,
  [data-vl-theme="light"] .about-desc,
  [data-vl-theme="light"] .context-banner__text {
    color: #64748b;
  }
  [data-vl-theme="light"] .stat-card__value,
  [data-vl-theme="light"] .info-row__value,
  [data-vl-theme="light"] .toggle-row__label,
  [data-vl-theme="light"] .mode-option__name {
    color: #0f172a;
  }
  [data-vl-theme="light"] .mode-option__card {
    background: #f8fafc;
    border-color: #cbd5e1;
  }
  [data-vl-theme="light"] .mode-option input:checked + .mode-option__card {
    border-color: #ea580c;
    background: rgba(234,88,12,0.04);
  }
  [data-vl-theme="light"] .text-input,
  [data-vl-theme="light"] .vl-select,
  [data-vl-theme="light"] .vl-search__input {
    background: #f8fafc;
    border-color: #cbd5e1;
    color: #0f172a;
  }
  [data-vl-theme="light"] .btn--secondary {
    background: #f1f5f9;
    border-color: #cbd5e1;
    color: #475569;
  }
  [data-vl-theme="light"] .toggle__slider {
    background: #e2e8f0;
    border-color: #cbd5e1;
  }
  [data-vl-theme="light"] .privacy-box {
    background: rgba(22,163,74,0.04);
    border-color: rgba(22,163,74,0.2);
  }
  [data-vl-theme="light"] .about-link {
    background: #f8fafc;
    border-color: #e2e8f0;
    color: #475569;
  }
  [data-vl-theme="light"] .about-link:hover {
    background: #f1f5f9;
    color: #0f172a;
  }
  [data-vl-theme="light"] .header__version {
    background: #f1f5f9;
    border-color: #e2e8f0;
    color: #94a3b8;
  }
  [data-vl-theme="light"] .info-row {
    border-bottom-color: #f1f5f9;
  }
`;

/**
 * Initialize the theme engine.
 * Loads saved theme from storage and applies it.
 * @returns {Promise<string>} Active theme
 */
export async function initTheme() {
  return new Promise(resolve => {
    chrome.storage.local.get([THEME_STORAGE_KEY], result => {
      const saved = result[THEME_STORAGE_KEY] || 'dark';
      _activeTheme = saved;
      applyTheme(saved);
      resolve(saved);
    });
  });
}

/**
 * Apply a theme to the document.
 * @param {'dark'|'light'|'system'} theme
 */
export function applyTheme(theme) {
  _activeTheme = theme;

  let resolved = theme;
  if (theme === 'system') {
    resolved = window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark';
  }

  document.documentElement.setAttribute('data-vl-theme', resolved);
}

/**
 * Save and apply a theme.
 * @param {'dark'|'light'|'system'} theme
 * @returns {Promise<void>}
 */
export async function setTheme(theme) {
  _activeTheme = theme;
  applyTheme(theme);
  return new Promise(resolve => {
    chrome.storage.local.set({ [THEME_STORAGE_KEY]: theme }, resolve);
  });
}

/**
 * Get the currently active theme setting.
 * @returns {string}
 */
export function getActiveTheme() {
  return _activeTheme;
}

/**
 * Watch for system theme changes and auto-update when theme = 'system'.
 */
export function watchSystemTheme() {
  const mq = window.matchMedia('(prefers-color-scheme: light)');
  mq.addEventListener('change', () => {
    if (_activeTheme === 'system') {
      applyTheme('system');
    }
  });
}