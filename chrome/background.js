/**
 * Magnetar Guardian — Background Service Worker (Chrome MV3)
 * 
 * Handles:
 * - Profile-based ruleset management (4 profiles, all toggleable)
 * - Guardian bypass mode with auto-relock timer
 * - Excluded sites (manual blocklist via dynamic rules)
 * - Hardcoded allowlist (buymeacoffee.com etc.)
 * - Block counting and stats
 * - First-run setup flow
 */

// ── Profile defaults (all toggleable by guardian) ────────────────────

const PROFILE_DEFAULTS = {
  young: {
    adult: true, gambling: true, violence: true, drugs: true,
    dating: true, proxy: true, social: true, phishing: true,
    malware: true, safesearch: true
  },
  child: {
    adult: true, gambling: true, violence: true, drugs: true,
    dating: true, proxy: true, social: true, phishing: true,
    malware: true, safesearch: true
  },
  teen: {
    adult: true, gambling: true, violence: false, drugs: true,
    dating: false, proxy: true, social: false, phishing: true,
    malware: true, safesearch: false
  },
  vulnerable: {
    adult: false, gambling: true, violence: false, drugs: false,
    dating: false, proxy: false, social: false, phishing: true,
    malware: true, safesearch: false
  }
};

const ALL_CATEGORIES = [
  'adult', 'gambling', 'violence', 'drugs', 'dating',
  'proxy', 'social', 'phishing', 'malware', 'safesearch'
];

// Domains that are always allowed regardless of blocklists
const HARDCODED_ALLOWLIST = [
  'buymeacoffee.com'
];

// ── Installation / First Run ─────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await chrome.storage.local.set({ setupComplete: false });
    chrome.tabs.create({ url: chrome.runtime.getURL('setup/setup.html') });
  }
});

// ── Startup ──────────────────────────────────────────────────────────

chrome.runtime.onStartup.addListener(async () => {
  await resetDailyStats();
  await checkBypassExpiry();
  await applyProfileRulesets();
});

// ── Get all available ruleset IDs from the manifest ──────────────────

function getAllRulesetIds() {
  const manifest = chrome.runtime.getManifest();
  const resources = manifest.declarative_net_request?.rule_resources || [];
  return resources.map(r => r.id);
}

function categoryToRulesetIds(category) {
  const allIds = getAllRulesetIds();
  return allIds.filter(id => id === category || id.startsWith(category + '_'));
}

// ── Apply rulesets based on current profile and overrides ─────────────

async function applyProfileRulesets() {
  const data = await chrome.storage.local.get([
    'ageProfile', 'blocklistsEnabled', 'setupComplete', 'bypassUntil'
  ]);
  const allIds = getAllRulesetIds();
  
  if (!data.setupComplete) {
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      disableRulesetIds: allIds
    });
    return;
  }

  // Check guardian bypass
  if (data.bypassUntil && Date.now() < data.bypassUntil) {
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      disableRulesetIds: allIds
    });
    console.log('[Guardian] Bypass active — all rulesets disabled');
    return;
  }

  const profileName = data.ageProfile || 'child';
  const defaults = PROFILE_DEFAULTS[profileName] || PROFILE_DEFAULTS.child;
  const overrides = data.blocklistsEnabled || {};

  const enableIds = [];
  const disableIds = [];

  for (const category of ALL_CATEGORIES) {
    const rulesetIds = categoryToRulesetIds(category);
    // Guardian override takes priority, then profile default
    const enabled = overrides[category] !== undefined ? overrides[category] : defaults[category];

    for (const id of rulesetIds) {
      if (enabled) {
        enableIds.push(id);
      } else {
        disableIds.push(id);
      }
    }
  }

  try {
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: enableIds,
      disableRulesetIds: disableIds
    });
    console.log(`[Guardian] Profile: ${profileName}, enabled: [${enableIds.length} rulesets]`);
  } catch (err) {
    console.error('[Guardian] Failed to update rulesets:', err);
  }

  // Apply excluded sites as dynamic rules
  await applyExcludedSites();
  // Apply hardcoded allowlist as dynamic allow rules
  await applyHardcodedAllowlist();
}

// ── Excluded sites (guardian's manual blocklist) ─────────────────────

async function applyExcludedSites() {
  const data = await chrome.storage.local.get(['excludedDomains']);
  const domains = data.excludedDomains || [];

  // Remove old dynamic block rules (IDs 900001+)
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const oldBlockIds = existingRules
    .filter(r => r.id >= 900001 && r.id < 950000)
    .map(r => r.id);

  const newRules = domains.map((domain, i) => ({
    id: 900001 + i,
    priority: 3,
    action: { type: 'block' },
    condition: {
      urlFilter: `||${domain}`,
      resourceTypes: [
        'main_frame', 'sub_frame', 'stylesheet', 'script', 'image',
        'font', 'object', 'xmlhttprequest', 'ping', 'media', 'websocket', 'other'
      ]
    }
  }));

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: oldBlockIds,
    addRules: newRules
  });
}

// ── Hardcoded allowlist ──────────────────────────────────────────────

async function applyHardcodedAllowlist() {
  const data = await chrome.storage.local.get(['allowedDomains', 'ageProfile']);
  const profile = data.ageProfile || 'child';
  const guardianAllowed = (data.allowedDomains || {})[profile] || [];
  const allAllowed = [...new Set([...HARDCODED_ALLOWLIST, ...guardianAllowed])];

  // Remove old dynamic allow rules (IDs 950001+)
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const oldAllowIds = existingRules
    .filter(r => r.id >= 950001)
    .map(r => r.id);

  const newRules = allAllowed.map((domain, i) => ({
    id: 950001 + i,
    priority: 10, // Higher priority = overrides blocks
    action: { type: 'allow' },
    condition: {
      urlFilter: `||${domain}`,
      resourceTypes: [
        'main_frame', 'sub_frame', 'stylesheet', 'script', 'image',
        'font', 'object', 'xmlhttprequest', 'ping', 'media', 'websocket', 'other'
      ]
    }
  }));

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: oldAllowIds,
    addRules: newRules
  });
}

// ── Guardian bypass mode ─────────────────────────────────────────────

async function activateBypass(minutes) {
  const until = Date.now() + (minutes * 60 * 1000);
  await chrome.storage.local.set({ bypassUntil: until });
  await applyProfileRulesets();
  
  // Set alarm to re-enable
  chrome.alarms.create('bypassExpiry', { delayInMinutes: minutes });
  
  // Update badge
  chrome.action.setBadgeText({ text: '⏸' });
  chrome.action.setBadgeBackgroundColor({ color: '#FF9800' });
  
  return { success: true, until };
}

async function deactivateBypass() {
  await chrome.storage.local.set({ bypassUntil: null });
  chrome.alarms.clear('bypassExpiry');
  await applyProfileRulesets();
  await updateBlockCount();
  return { success: true };
}

async function checkBypassExpiry() {
  const data = await chrome.storage.local.get(['bypassUntil']);
  if (data.bypassUntil && Date.now() >= data.bypassUntil) {
    await deactivateBypass();
  }
}

// ── Block counting ───────────────────────────────────────────────────

async function updateBlockCount() {
  try {
    const data = await chrome.storage.local.get(['stats', 'bypassUntil']);
    
    // Don't show count during bypass
    if (data.bypassUntil && Date.now() < data.bypassUntil) {
      chrome.action.setBadgeText({ text: '⏸' });
      chrome.action.setBadgeBackgroundColor({ color: '#FF9800' });
      return;
    }
    
    const stats = data.stats || { today: 0, week: 0 };
    const badgeText = stats.today > 999 ? '999+' : stats.today > 0 ? stats.today.toString() : '';
    chrome.action.setBadgeText({ text: badgeText });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
  } catch (e) {
    // Silently fail
  }
}

// Track via onRuleMatchedDebug if available
chrome.declarativeNetRequest.onRuleMatchedDebug?.addListener(async () => {
  const data = await chrome.storage.local.get(['stats']);
  const stats = data.stats || { today: 0, week: 0 };
  stats.today++;
  stats.week++;
  await chrome.storage.local.set({ stats });
  await updateBlockCount();
});

// Poll fallback
chrome.alarms.create('updateBlockCount', { periodInMinutes: 0.5 });

// ── Daily stats reset ────────────────────────────────────────────────

async function resetDailyStats() {
  const data = await chrome.storage.local.get(['stats', 'lastResetDate']);
  const today = new Date().toISOString().split('T')[0];
  
  if (data.lastResetDate !== today) {
    const stats = data.stats || { today: 0, week: 0 };
    stats.today = 0;
    if (new Date().getDay() === 1) stats.week = 0;
    await chrome.storage.local.set({ stats, lastResetDate: today });
    chrome.action.setBadgeText({ text: '' });
  }
}

chrome.alarms.create('dailyReset', { periodInMinutes: 60 });

// ── Alarm handler ────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  switch (alarm.name) {
    case 'updateBlockCount':
      await updateBlockCount();
      break;
    case 'dailyReset':
      await resetDailyStats();
      break;
    case 'bypassExpiry':
      await deactivateBypass();
      break;
  }
});

// ── Message handler ──────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch(err => {
    console.error('[Guardian] Message error:', err);
    sendResponse({ error: err.message });
  });
  return true;
});

async function handleMessage(message) {
  switch (message.action) {
    case 'getStatus': {
      const data = await chrome.storage.local.get([
        'setupComplete', 'ageProfile', 'stats', 'bypassUntil', 'blocklistsEnabled'
      ]);
      const bypassActive = data.bypassUntil && Date.now() < data.bypassUntil;
      return {
        setupComplete: data.setupComplete || false,
        ageProfile: data.ageProfile || null,
        stats: data.stats || { today: 0, week: 0 },
        bypassActive,
        bypassUntil: bypassActive ? data.bypassUntil : null,
        blocklistsEnabled: data.blocklistsEnabled || {}
      };
    }

    case 'setupComplete': {
      // Get defaults for selected profile
      const defaults = PROFILE_DEFAULTS[message.ageProfile] || PROFILE_DEFAULTS.child;
      await chrome.storage.local.set({
        setupComplete: true,
        ageProfile: message.ageProfile,
        blocklistsEnabled: { ...defaults, ...(message.blocklistsEnabled || {}) }
      });
      await applyProfileRulesets();
      return { success: true };
    }

    case 'updateProfile': {
      const defaults = PROFILE_DEFAULTS[message.ageProfile] || PROFILE_DEFAULTS.child;
      // Merge: new profile defaults, but keep any existing overrides if provided
      await chrome.storage.local.set({
        ageProfile: message.ageProfile,
        blocklistsEnabled: message.blocklistsEnabled || defaults
      });
      await applyProfileRulesets();
      return { success: true };
    }

    case 'toggleRuleset': {
      const data = await chrome.storage.local.get(['blocklistsEnabled']);
      const overrides = data.blocklistsEnabled || {};
      overrides[message.ruleset] = message.enabled;
      await chrome.storage.local.set({ blocklistsEnabled: overrides });
      await applyProfileRulesets();
      return { success: true };
    }

    case 'getBlocklists': {
      const enabled = await chrome.declarativeNetRequest.getEnabledRulesets();
      return { enabled };
    }

    case 'getProfileDefaults': {
      return { defaults: PROFILE_DEFAULTS[message.profile] || PROFILE_DEFAULTS.child };
    }

    case 'activateBypass': {
      return await activateBypass(message.minutes || 30);
    }

    case 'deactivateBypass': {
      return await deactivateBypass();
    }

    case 'updateExcludedSites': {
      await chrome.storage.local.set({ excludedDomains: message.domains || [] });
      await applyExcludedSites();
      return { success: true };
    }

    case 'updateAllowedSites': {
      await chrome.storage.local.set({ allowedDomains: message.allowedDomains || {} });
      await applyHardcodedAllowlist();
      return { success: true };
    }

    case 'openSetup': {
      chrome.tabs.create({ url: chrome.runtime.getURL('setup/setup.html') });
      return { success: true };
    }

    case 'openSettings': {
      chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html') });
      return { success: true };
    }

    default:
      return { error: 'Unknown action' };
  }
}

// ── Init ─────────────────────────────────────────────────────────────

(async () => {
  await resetDailyStats();
  await checkBypassExpiry();
  await applyProfileRulesets();
  console.log('[Guardian] Background service worker started');
})();
