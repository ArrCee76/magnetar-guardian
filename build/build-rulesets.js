#!/usr/bin/env node

/**
 * Magnetar Guardian — Blocklist Build Script
 * 
 * Fetches domain blocklists from public sources, deduplicates them,
 * splits by category, and outputs declarativeNetRequest JSON rulesets
 * ready to ship in the extension.
 * 
 * Usage: node build/build-rulesets.js
 * 
 * Run this before packaging the extension. Output goes to chrome/rules/ and firefox/rules/
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const zlib = require('zlib');

// ── Sources ──────────────────────────────────────────────────────────

const SOURCES = {
  // StevenBlack unified hosts — adult + malware (~81k domains)
  stevenblack: {
    url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts',
    category: 'adult',
    parser: 'hosts'
  },

  // UT1 category lists via GitHub mirror (olbat/ut1-blacklists, synced daily)
  // Note: adult list is gzip-compressed on GitHub due to size (>100MB limit)
  ut1_adult: {
    url: 'https://raw.githubusercontent.com/olbat/ut1-blacklists/master/blacklists/adult/domains.gz',
    category: 'adult',
    parser: 'domains',
    gzip: true
  },
  ut1_gambling: {
    url: 'https://raw.githubusercontent.com/olbat/ut1-blacklists/master/blacklists/gambling/domains',
    category: 'gambling',
    parser: 'domains'
  },
  ut1_violence: {
    url: 'https://raw.githubusercontent.com/olbat/ut1-blacklists/master/blacklists/agressif/domains',
    category: 'violence',
    parser: 'domains'
  },
  ut1_drugs: {
    url: 'https://raw.githubusercontent.com/olbat/ut1-blacklists/master/blacklists/drogue/domains',
    category: 'drugs',
    parser: 'domains'
  },
  ut1_dating: {
    url: 'https://raw.githubusercontent.com/olbat/ut1-blacklists/master/blacklists/dating/domains',
    category: 'dating',
    parser: 'domains'
  },
  ut1_proxy: {
    url: 'https://raw.githubusercontent.com/olbat/ut1-blacklists/master/blacklists/vpn/domains',
    category: 'proxy',
    parser: 'domains'
  },
  ut1_social: {
    url: 'https://raw.githubusercontent.com/olbat/ut1-blacklists/master/blacklists/social_networks/domains',
    category: 'social',
    parser: 'domains'
  },

  // Phishing and malware lists
  ut1_phishing: {
    url: 'https://raw.githubusercontent.com/olbat/ut1-blacklists/master/blacklists/phishing/domains',
    category: 'phishing',
    parser: 'domains'
  },
  ut1_malware: {
    url: 'https://raw.githubusercontent.com/olbat/ut1-blacklists/master/blacklists/malware/domains',
    category: 'malware',
    parser: 'domains'
  }
};

// ── Rule ID allocation ───────────────────────────────────────────────
// Each category gets a range of 50,000 IDs to avoid collisions
const CATEGORY_ID_BASE = {
  adult: 1,
  gambling: 330001,
  violence: 370001,
  drugs: 380001,
  dating: 390001,
  proxy: 400001,
  social: 540001,
  phishing: 550001,
  malware: 600001
};

// ── Fetch helper ─────────────────────────────────────────────────────

function fetch(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': 'MagnetarGuardian-BuildScript/1.0' } }, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error(`Timeout fetching ${url}`)); });
  });
}

function fetchGzip(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': 'MagnetarGuardian-BuildScript/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchGzip(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        zlib.gunzip(buffer, (err, decompressed) => {
          if (err) return reject(new Error(`Gzip decompression failed: ${err.message}`));
          resolve(decompressed.toString('utf8'));
        });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(120000, () => { req.destroy(); reject(new Error(`Timeout fetching ${url}`)); });
  });
}

// ── Parsers ──────────────────────────────────────────────────────────

function parseHosts(text) {
  // Format: 0.0.0.0 domain.com or 127.0.0.1 domain.com
  const domains = new Set();
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2 && (parts[0] === '0.0.0.0' || parts[0] === '127.0.0.1')) {
      const domain = parts[1].toLowerCase().trim();
      if (domain && domain !== 'localhost' && domain.includes('.')) {
        domains.add(domain);
      }
    }
  }
  return domains;
}

function parseDomains(text) {
  const domains = new Set();
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) continue;
    const domain = trimmed.toLowerCase();
    if (domain && domain.includes('.') && !domain.includes(' ')) {
      domains.add(domain);
    }
  }
  return domains;
}

function parseOisd(text) {
  // OISD wildcard format: lines like "domain.com" or "*.domain.com" (with optional wildcards)
  const domains = new Set();
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!') || trimmed.startsWith('[')) continue;
    // Strip leading wildcard prefix
    let domain = trimmed.replace(/^\*\./, '').toLowerCase();
    if (domain && domain.includes('.') && !domain.includes(' ') && !domain.includes('*')) {
      domains.add(domain);
    }
  }
  return domains;
}

const PARSERS = { hosts: parseHosts, domains: parseDomains, oisd: parseOisd };

// ── Domain → DNR rule conversion ─────────────────────────────────────

function domainToRule(domain, id) {
  return {
    id,
    priority: 1,
    action: { type: 'block' },
    condition: {
      urlFilter: `||${domain}`,
      resourceTypes: [
        'main_frame', 'sub_frame', 'stylesheet', 'script', 'image',
        'font', 'object', 'xmlhttprequest', 'ping', 'media', 'websocket', 'other'
      ]
    }
  };
}

// ── Safe search rules ────────────────────────────────────────────────

function buildSafeSearchRules() {
  return [
    // Google: append safe=active param to search URLs
    {
      id: 400001,
      priority: 2,
      action: {
        type: 'redirect',
        redirect: {
          transform: { queryTransform: { addOrReplaceParams: [{ key: 'safe', value: 'active' }] } }
        }
      },
      condition: {
        urlFilter: '||www.google.*/search?',
        resourceTypes: ['main_frame']
      }
    },
    // Bing: append safe search param
    {
      id: 400003,
      priority: 2,
      action: {
        type: 'redirect',
        redirect: {
          transform: { queryTransform: { addOrReplaceParams: [{ key: 'adlt', value: 'strict' }] } }
        }
      },
      condition: {
        urlFilter: '||www.bing.com/search?',
        resourceTypes: ['main_frame']
      }
    },
    // DuckDuckGo
    {
      id: 400004,
      priority: 2,
      action: {
        type: 'redirect',
        redirect: {
          transform: { queryTransform: { addOrReplaceParams: [{ key: 'kp', value: '1' }] } }
        }
      },
      condition: {
        urlFilter: '||duckduckgo.com/?q=',
        resourceTypes: ['main_frame']
      }
    },
    // YouTube restricted mode via cookie header
    {
      id: 400005,
      priority: 2,
      action: {
        type: 'modifyHeaders',
        responseHeaders: [
          { header: 'Set-Cookie', operation: 'append', value: 'PREF=f2=8000000; domain=.youtube.com; path=/' }
        ]
      },
      condition: {
        urlFilter: '||youtube.com',
        resourceTypes: ['main_frame', 'sub_frame']
      }
    },
    // Ecosia
    {
      id: 400006,
      priority: 2,
      action: {
        type: 'redirect',
        redirect: {
          transform: { queryTransform: { addOrReplaceParams: [{ key: 'p', value: '1' }] } }
        }
      },
      condition: {
        urlFilter: '||ecosia.org/search?',
        resourceTypes: ['main_frame']
      }
    }
  ];
}

// ── Main build ───────────────────────────────────────────────────────

async function build() {
  console.log('🛡️  Magnetar Guardian — Building rulesets\n');

  const categoryDomains = {};
  let totalFetched = 0;

  // Fetch all sources
  for (const [name, source] of Object.entries(SOURCES)) {
    process.stdout.write(`  Fetching ${name}...`);
    try {
      let text;
      try {
        text = source.gzip ? await fetchGzip(source.url) : await fetch(source.url);
      } catch (e) {
        if (source.fallback) {
          process.stdout.write(' (trying fallback)...');
          text = await fetch(source.fallback);
        } else {
          throw e;
        }
      }

      const parser = PARSERS[source.parser];
      const domains = parser(text);

      if (!categoryDomains[source.category]) {
        categoryDomains[source.category] = new Set();
      }
      for (const d of domains) {
        categoryDomains[source.category].add(d);
      }

      console.log(` ${domains.size.toLocaleString()} domains`);
      totalFetched += domains.size;
    } catch (err) {
      if (source.optional) {
        console.log(` ⚠️  SKIPPED (optional): ${err.message}`);
      } else {
        console.log(` ⚠️  FAILED: ${err.message}`);
      }
    }
  }

  console.log(`\n  Total fetched (with overlaps): ${totalFetched.toLocaleString()}`);

  // ── Inject hardcoded core domains that blocklists often miss ──────
  const CORE_DOMAINS = {
    social: [
      'facebook.com', 'www.facebook.com', 'web.facebook.com', 'm.facebook.com',
      'instagram.com', 'www.instagram.com',
      'tiktok.com', 'www.tiktok.com',
      'twitter.com', 'x.com', 'www.x.com',
      'snapchat.com', 'www.snapchat.com', 'web.snapchat.com',
      'reddit.com', 'www.reddit.com', 'old.reddit.com',
      'pinterest.com', 'www.pinterest.com',
      'tumblr.com', 'www.tumblr.com',
      'discord.com', 'www.discord.com',
      'threads.net', 'www.threads.net',
      'bsky.app', 'mastodon.social',
      'linkedin.com', 'www.linkedin.com',
      'whatsapp.com', 'web.whatsapp.com',
      'telegram.org', 'web.telegram.org',
      'wechat.com', 'weibo.com',
      'vk.com', 'ok.ru'
    ],
    gambling: [
      'bet365.com', 'www.bet365.com',
      'pokerstars.com', 'williamhill.com', 'betfair.com',
      'paddypower.com', 'ladbrokes.com', 'coral.co.uk',
      'draftkings.com', 'fanduel.com', 'betway.com',
      'unibet.com', '888casino.com', 'casumo.com',
      'leovegas.com', 'mrgreen.com', 'betsson.com',
      'bwin.com', 'pinnacle.com', 'bovada.lv'
    ]
  };

  for (const [cat, domains] of Object.entries(CORE_DOMAINS)) {
    if (!categoryDomains[cat]) categoryDomains[cat] = new Set();
    for (const d of domains) {
      categoryDomains[cat].add(d);
    }
  }
  console.log('  Injected core social media + gambling domains');

  // Global deduplication: if a domain is in 'adult', don't also put it in other categories
  // Priority: adult > gambling > violence > drugs > dating > proxy > social
  const seen = new Set();
  const deduped = {};
  const priorityOrder = ['adult', 'gambling', 'violence', 'drugs', 'dating', 'proxy', 'social', 'phishing', 'malware'];

  for (const cat of priorityOrder) {
    if (!categoryDomains[cat]) continue;
    deduped[cat] = [];
    for (const domain of categoryDomains[cat]) {
      if (!seen.has(domain)) {
        seen.add(domain);
        deduped[cat].push(domain);
      }
    }
  }

  const totalUnique = Object.values(deduped).reduce((sum, arr) => sum + arr.length, 0);
  console.log(`  Total unique after dedup: ${totalUnique.toLocaleString()}`);

  // ── MV3 budget enforcement ───────────────────────────────────────
  // Chrome's documented limit is 330k but in practice ~300k is the safe max.
  // We target 200k to keep file sizes manageable and loading fast.
  const MV3_BUDGET = 200000;
  
  if (totalUnique > MV3_BUDGET) {
    console.log(`  ⚠️  Over MV3 budget (${totalUnique.toLocaleString()} > ${MV3_BUDGET.toLocaleString()})`);
    
    // Priority: keep smaller/important categories intact, cap the largest ones
    // Sort categories by size (smallest first = highest priority to keep)
    const catSizes = Object.entries(deduped)
      .map(([cat, arr]) => ({ cat, count: arr.length }))
      .sort((a, b) => a.count - b.count);
    
    let budgetRemaining = MV3_BUDGET;
    const caps = {};
    
    for (const { cat, count } of catSizes) {
      if (count <= budgetRemaining) {
        // Fits entirely
        caps[cat] = count;
        budgetRemaining -= count;
      } else {
        // Cap to whatever budget is left
        const capped = Math.max(0, budgetRemaining);
        caps[cat] = capped;
        budgetRemaining = 0;
        if (capped < count) {
          console.log(`  → Capped ${cat}: ${count.toLocaleString()} → ${capped.toLocaleString()} domains`);
        }
      }
    }
    
    // Apply caps
    for (const [cat, maxSize] of Object.entries(caps)) {
      if (deduped[cat] && deduped[cat].length > maxSize) {
        deduped[cat] = deduped[cat].slice(0, maxSize);
      }
    }
    
    // Remove empty categories
    for (const cat of Object.keys(deduped)) {
      if (deduped[cat].length === 0) {
        console.log(`  → Removed ${cat} (no budget remaining)`);
        delete deduped[cat];
      }
    }
  }

  const finalTotal = Object.values(deduped).reduce((sum, arr) => sum + arr.length, 0);
  console.log(`  Final rule count: ${finalTotal.toLocaleString()}\n`);

  // Build rulesets per category — split large lists into 50k-rule chunks
  const rulesetManifestEntries = [];
  const rulesetStats = {};
  const CHUNK_SIZE = 50000;

  for (const [cat, domains] of Object.entries(deduped)) {
    const baseId = CATEGORY_ID_BASE[cat] || 350001;
    
    if (domains.length > CHUNK_SIZE) {
      // Split into chunks
      const numChunks = Math.ceil(domains.length / CHUNK_SIZE);
      let totalForCat = 0;
      
      for (let chunk = 0; chunk < numChunks; chunk++) {
        const start = chunk * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, domains.length);
        const chunkDomains = domains.slice(start, end);
        const chunkRules = chunkDomains.map((domain, i) => domainToRule(domain, baseId + start + i));
        const chunkId = `${cat}_${chunk + 1}`;
        const filename = `${cat}-domains-${chunk + 1}.json`;

        rulesetManifestEntries.push({
          id: chunkId,
          enabled: true,
          path: `rules/${filename}`
        });

        for (const browser of ['chrome', 'firefox']) {
          const dir = path.join(__dirname, '..', browser, 'rules');
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, filename), JSON.stringify(chunkRules));
        }

        totalForCat += chunkRules.length;
        console.log(`  ✓ ${chunkId}: ${chunkRules.length.toLocaleString()} rules → rules/${filename}`);
      }
      
      rulesetStats[cat] = totalForCat;
    } else {
      // Single file
      const rules = domains.map((domain, i) => domainToRule(domain, baseId + i));
      const filename = `${cat}-domains.json`;

      rulesetStats[cat] = rules.length;
      rulesetManifestEntries.push({
        id: cat,
        enabled: true,
        path: `rules/${filename}`
      });

      for (const browser of ['chrome', 'firefox']) {
        const dir = path.join(__dirname, '..', browser, 'rules');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, filename), JSON.stringify(rules));
      }

      console.log(`  ✓ ${cat}: ${rules.length.toLocaleString()} rules → rules/${filename}`);
    }
  }

  // Build safe search rules
  const safeSearchRules = buildSafeSearchRules();
  const ssFilename = 'safesearch-rules.json';
  rulesetManifestEntries.push({
    id: 'safesearch',
    enabled: true,
    path: `rules/${ssFilename}`
  });

  for (const browser of ['chrome', 'firefox']) {
    const dir = path.join(__dirname, '..', browser, 'rules');
    fs.writeFileSync(path.join(dir, ssFilename), JSON.stringify(safeSearchRules));
  }
  console.log(`  ✓ safesearch: ${safeSearchRules.length} rules → rules/${ssFilename}`);

  // Write ruleset manifest snippet for easy copy-paste into manifest.json
  const manifestSnippet = JSON.stringify(rulesetManifestEntries, null, 2);
  fs.writeFileSync(path.join(__dirname, 'ruleset-manifest.json'), manifestSnippet);
  console.log(`\n  📋 Ruleset manifest entries written to build/ruleset-manifest.json`);

  // Auto-update Chrome manifest.json with dynamic ruleset entries
  const chromeManifestPath = path.join(__dirname, '..', 'chrome', 'manifest.json');
  try {
    const manifest = JSON.parse(fs.readFileSync(chromeManifestPath, 'utf8'));
    manifest.declarative_net_request = { rule_resources: rulesetManifestEntries };
    fs.writeFileSync(chromeManifestPath, JSON.stringify(manifest, null, 2));
    console.log(`  ✅ Updated chrome/manifest.json with ${rulesetManifestEntries.length} rulesets`);
  } catch (err) {
    console.log(`  ⚠️  Could not auto-update manifest: ${err.message}`);
    console.log('  Copy the entries from build/ruleset-manifest.json manually.');
  }

  // Summary
  console.log('\n  ── Summary ──');
  const grandTotal = Object.values(rulesetStats).reduce((s, n) => s + n, 0) + safeSearchRules.length;
  for (const [cat, count] of Object.entries(rulesetStats)) {
    const pct = ((count / grandTotal) * 100).toFixed(1);
    console.log(`  ${cat.padEnd(12)} ${count.toLocaleString().padStart(8)} rules  (${pct}%)`);
  }
  console.log(`  ${'safesearch'.padEnd(12)} ${safeSearchRules.length.toString().padStart(8)} rules`);
  console.log(`  ${'─'.repeat(35)}`);
  console.log(`  ${'TOTAL'.padEnd(12)} ${grandTotal.toLocaleString().padStart(8)} rules`);
  console.log(`\n  MV3 budget: ${grandTotal.toLocaleString()} / 330,000 (${((grandTotal / 330000) * 100).toFixed(1)}% used)`);
  console.log('\n🛡️  Build complete!\n');
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
