/**
 * Magnetar Guardian — Background Script (Firefox MV2)
 * 
 * Uses webRequest blocking API for domain blocking (Firefox doesn't need
 * declarativeNetRequest rulesets — we load the domain lists at runtime).
 */

// ── State ────────────────────────────────────────────────────────────

let blockedDomains = new Set();
let allowedDomains = new Set();
let safesearchEnabled = true;
let isSetupComplete = false;
let currentProfile = 'child';

// ── Age profile → category mapping ──────────────────────────────────

const PROFILE_CATEGORIES = {
  young: ['adult', 'gambling', 'violence', 'drugs', 'dating', 'proxy', 'social'],
  child: ['adult', 'gambling', 'violence', 'drugs', 'dating', 'proxy'],
  teen: ['adult', 'gambling', 'drugs', 'proxy']
};

// ── Load blocklists from bundled JSON files ──────────────────────────

async function loadBlocklists() {
  const data = await browser.storage.local.get(['ageProfile', 'blocklistsEnabled', 'allowedDomains', 'setupComplete']);
  
  isSetupComplete = data.setupComplete || false;
  currentProfile = data.ageProfile || 'child';
  
  if (!isSetupComplete) return;

  const categories = PROFILE_CATEGORIES[currentProfile] || PROFILE_CATEGORIES.child;
  const overrides = data.blocklistsEnabled || {};
  
  // Determine which categories to load
  const activeCategories = [];
  for (const cat of ['adult', 'gambling', 'violence', 'drugs', 'dating', 'proxy', 'social']) {
    if (overrides[cat] !== undefined) {
      if (overrides[cat]) activeCategories.push(cat);
    } else if (categories.includes(cat)) {
      activeCategories.push(cat);
    }
  }

  // Load domain lists
  blockedDomains = new Set();
  for (const cat of activeCategories) {
    try {
      const url = browser.runtime.getURL(`rules/${cat}-domains.json`);
      const response = await fetch(url);
      const rules = await response.json();
      for (const rule of rules) {
        // Extract domain from urlFilter (format: ||domain.com)
        const match = rule.condition?.urlFilter?.match(/^\|\|(.+)$/);
        if (match) {
          blockedDomains.add(match[1]);
        }
      }
    } catch (e) {
      console.warn(`[Guardian] Failed to load ${cat} blocklist:`, e);
    }
  }

  // Load allowlist
  allowedDomains = new Set();
  const allowed = data.allowedDomains || {};
  if (allowed[currentProfile]) {
    for (const d of allowed[currentProfile]) {
      allowedDomains.add(d);
    }
  }

  // Safe search
  safesearchEnabled = overrides.safesearch !== undefined ? overrides.safesearch : 
                       ['young', 'child'].includes(currentProfile);

  console.log(`[Guardian] Loaded ${blockedDomains.size} blocked domains, ${allowedDomains.size} allowed, safesearch: ${safesearchEnabled}`);
}

// ── Domain blocking via webRequest ───────────────────────────────────

function isDomainBlocked(hostname) {
  if (!hostname) return false;
  
  // Check allowlist first
  if (allowedDomains.has(hostname)) return false;
  
  // Check exact match
  if (blockedDomains.has(hostname)) return true;
  
  // Check parent domains (e.g. sub.blocked.com → blocked.com)
  const parts = hostname.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const parent = parts.slice(i).join('.');
    if (allowedDomains.has(parent)) return false;
    if (blockedDomains.has(parent)) return true;
  }
  
  return false;
}

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!isSetupComplete) return {};
    
    try {
      const url = new URL(details.url);
      if (isDomainBlocked(url.hostname)) {
        // Track stats
        updateStats();
        
        // For main_frame, redirect to blocked page
        if (details.type === 'main_frame') {
          const blockedUrl = encodeURIComponent(details.url);
          return {
            redirectUrl: browser.runtime.getURL(
              `blocked/blocked.html?url=${blockedUrl}&profile=${currentProfile}`
            )
          };
        }
        
        // For sub-resources, just cancel
        return { cancel: true };
      }
    } catch (e) {
      // Invalid URL, ignore
    }
    return {};
  },
  { urls: ['<all_urls>'] },
  ['blocking']
);

// ── Safe Search enforcement via webRequest ───────────────────────────

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!isSetupComplete || !safesearchEnabled) return {};
    if (details.type !== 'main_frame') return {};

    try {
      const url = new URL(details.url);
      
      // Google: append safe=active
      if (url.hostname.includes('google.') && url.pathname === '/search') {
        if (url.searchParams.get('safe') !== 'active') {
          url.searchParams.set('safe', 'active');
          return { redirectUrl: url.toString() };
        }
      }
      
      // Bing
      if (url.hostname.includes('bing.com') && url.pathname === '/search') {
        if (url.searchParams.get('adlt') !== 'strict') {
          url.searchParams.set('adlt', 'strict');
          return { redirectUrl: url.toString() };
        }
      }
      
      // DuckDuckGo
      if (url.hostname.includes('duckduckgo.com')) {
        if (url.searchParams.get('kp') !== '1') {
          url.searchParams.set('kp', '1');
          return { redirectUrl: url.toString() };
        }
      }
      
      // Ecosia
      if (url.hostname.includes('ecosia.org') && url.pathname === '/search') {
        if (url.searchParams.get('p') !== '1') {
          url.searchParams.set('p', '1');
          return { redirectUrl: url.toString() };
        }
      }
    } catch (e) {
      // Ignore URL parse errors
    }
    return {};
  },
  { urls: ['<all_urls>'] },
  ['blocking']
);

// YouTube Restricted Mode via response headers
browser.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (!isSetupComplete || !safesearchEnabled) return {};
    
    try {
      const url = new URL(details.url);
      if (url.hostname.includes('youtube.com')) {
        const headers = details.responseHeaders || [];
        headers.push({
          name: 'Set-Cookie',
          value: 'PREF=f2=8000000; domain=.youtube.com; path=/'
        });
        return { responseHeaders: headers };
      }
    } catch (e) {}
    return {};
  },
  { urls: ['*://*.youtube.com/*'] },
  ['blocking', 'responseHeaders']
);

// ── Stats tracking ───────────────────────────────────────────────────

async function updateStats() {
  const data = await browser.storage.local.get(['stats']);
  const stats = data.stats || { today: 0, week: 0, categories: {} };
  stats.today++;
  stats.week++;
  await browser.storage.local.set({ stats });
  
  const badgeText = stats.today > 999 ? '999+' : stats.today.toString();
  browser.browserAction.setBadgeText({ text: badgeText });
  browser.browserAction.setBadgeBackgroundColor({ color: '#4CAF50' });
}

// ── Daily reset ──────────────────────────────────────────────────────

async function resetDailyStats() {
  const data = await browser.storage.local.get(['stats', 'lastResetDate']);
  const today = new Date().toISOString().split('T')[0];
  
  if (data.lastResetDate !== today) {
    const stats = data.stats || { today: 0, week: 0, categories: {} };
    stats.today = 0;
    if (new Date().getDay() === 1) stats.week = 0;
    await browser.storage.local.set({ stats, lastResetDate: today });
    browser.browserAction.setBadgeText({ text: '' });
  }
}

// ── Installation ─────────────────────────────────────────────────────

browser.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await browser.storage.local.set({ setupComplete: false });
    browser.tabs.create({ url: browser.runtime.getURL('setup/setup.html') });
  }
});

// ── Message handler ──────────────────────────────────────────────────

browser.runtime.onMessage.addListener((message, sender) => {
  return handleMessage(message);
});

async function handleMessage(message) {
  switch (message.action) {
    case 'getStatus': {
      const data = await browser.storage.local.get(['setupComplete', 'ageProfile', 'stats', 'scheduledBlock']);
      return {
        setupComplete: data.setupComplete || false,
        ageProfile: data.ageProfile || null,
        stats: data.stats || { today: 0, week: 0, categories: {} },
        scheduledBlock: data.scheduledBlock || false
      };
    }

    case 'setupComplete': {
      await browser.storage.local.set({
        setupComplete: true,
        ageProfile: message.ageProfile,
        blocklistsEnabled: message.blocklistsEnabled || {}
      });
      await loadBlocklists();
      return { success: true };
    }

    case 'updateProfile': {
      await browser.storage.local.set({
        ageProfile: message.ageProfile,
        blocklistsEnabled: message.blocklistsEnabled || {}
      });
      await loadBlocklists();
      return { success: true };
    }

    case 'toggleRuleset': {
      const data = await browser.storage.local.get(['blocklistsEnabled']);
      const overrides = data.blocklistsEnabled || {};
      overrides[message.ruleset] = message.enabled;
      await browser.storage.local.set({ blocklistsEnabled: overrides });
      await loadBlocklists();
      return { success: true };
    }

    case 'getBlocklists': {
      // Return which categories are currently active
      const categories = PROFILE_CATEGORIES[currentProfile] || [];
      return { enabled: safesearchEnabled ? [...categories, 'safesearch'] : categories };
    }

    case 'openSetup': {
      browser.tabs.create({ url: browser.runtime.getURL('setup/setup.html') });
      return { success: true };
    }

    default:
      return { error: 'Unknown action' };
  }
}

// ── Storage change listener (reload blocklists when settings change) ──

browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.ageProfile || changes.blocklistsEnabled || changes.allowedDomains)) {
    loadBlocklists();
  }
});

// ── Init ─────────────────────────────────────────────────────────────

(async () => {
  await resetDailyStats();
  await loadBlocklists();
  console.log('[Guardian] Background script started');
})();
