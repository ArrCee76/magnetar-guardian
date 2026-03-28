/**
 * Magnetar Guardian — Content Script
 * 
 * Handles:
 * - Scheduled block overlay
 * - Keyword filtering (URL + page title)
 */

(async () => {
  const data = await chrome.storage.local.get([
    'scheduledBlock', 'ageProfile', 'setupComplete',
    'keywordFilterEnabled', 'customKeywords', 'bypassUntil'
  ]);

  if (!data.setupComplete) return;

  // Don't filter during bypass
  if (data.bypassUntil && Date.now() < data.bypassUntil) return;

  const profile = data.ageProfile || 'child';

  // ── Schedule block ─────────────────────────────────────────────
  if (data.scheduledBlock) {
    showScheduleBlock(profile);
    return;
  }

  // ── Keyword filtering ──────────────────────────────────────────
  if (data.keywordFilterEnabled === false) return;

  // Skip chrome:// and extension pages
  const url = window.location.href;
  if (url.startsWith('chrome') || url.startsWith('about:') || url.startsWith('moz-extension')) return;

  // Built-in keywords — longer/specific terms to avoid false positives.
  // e.g. "anal" would match "analysis", "escort" would match "Ford Escort"
  // so we use multi-word or site-specific variants instead.
  const builtInKeywords = [
    // Adult sites and terms
    'porn', 'p0rn', 'pr0n', 'porno', 'pornstar',
    'xxx', 'xxxx',
    'hentai', 'h3ntai', 'milf', 'nsfw',
    'onlyfans', 'fansly', 'manyvids',
    'xvideos', 'xhamster', 'xnxx',
    'redtube', 'youporn', 'tube8', 'spankbang',
    'brazzers', 'bangbros', 'realitykings', 'naughtyamerica',
    'chaturbate', 'stripchat', 'livejasmin', 'cam4', 'bongacams',
    'camsoda', 'myfreecams', 'camgirl', 'livecam',
    'pornhub', 'p0rnhub',
    'naked girls', 'naked women', 'naked teens',
    'nude girls', 'nude women', 'nude teens',
    'boobs', 'b00bs', 'tits', 't1ts',
    'pussy', 'pu55y', 'vagina',
    'blowjob', 'bl0wjob', 'handjob',
    'creampie', 'gangbang', 'threesome',
    'anal sex', 'analsex',
    'hardcore sex', 'hardcoresex',
    'fetish porn', 'bondage porn',
    'bdsm', 'femdom', 'domination porn',
    'hooker', 'prostitute', 'call girl',
    'sex video', 'sex tape', 'sextape',
    'sex chat', 'sexchat', 'cybersex',
    'erotic', 'er0tic',
    'rule34', 'rule 34', 'nhentai',
    'hentaihaven', 'hanime',
    'deepfake porn', 'deepfakeporn',
    'leaked nudes', 'leaked nude',

    // Violence and gore
    'bestgore', 'livegore', 'goregrish',
    'rotten.com', 'death video', 'deathvideo',
    'beheading video', 'execution video',
    'snuff film', 'snuff video',
    'animal cruelty video',

    // Self-harm and dangerous content
    'self-harm', 'selfharm', 'self harm',
    'suicide method', 'how to kill yourself',
    'pro-ana', 'proana', 'thinspo', 'thinspiration',

    // Drug markets
    'buy drugs online', 'dark web drugs', 'darknet market',
    'silk road market',

    // Leet-speak and evasion variants
    's3x', 'p0rn0', 'pr0n0', 'f4p',
    'wank', 'w4nk', 'j3rkoff', 'jerkoff',
    'cum shot', 'cumshot', 'facial cumshot',
    'orgasm', '0rgasm',
    'sexy girls', 'sexy teens', 'sexy women',
    'hot girls naked', 'hot teens naked'
  ];

  const customKeywords = data.customKeywords || [];
  const allKeywords = [...builtInKeywords, ...customKeywords.map(k => k.toLowerCase())];

  // Check URL
  const urlLower = url.toLowerCase();
  let matchedKeyword = allKeywords.find(kw => urlLower.includes(kw));

  if (matchedKeyword) {
    showKeywordBlock(profile, matchedKeyword);
    return;
  }

  // Check page title after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => checkTitle(allKeywords, profile));
  } else {
    checkTitle(allKeywords, profile);
  }

  // Also watch for title changes (SPAs, dynamic pages)
  const observer = new MutationObserver(() => checkTitle(allKeywords, profile));
  const titleEl = document.querySelector('title');
  if (titleEl) {
    observer.observe(titleEl, { childList: true, characterData: true, subtree: true });
  }
})();

function checkTitle(keywords, profile) {
  if (document.getElementById('magnetar-guardian-keyword-block')) return;
  const title = document.title.toLowerCase();
  const matched = keywords.find(kw => title.includes(kw));
  if (matched) showKeywordBlock(profile, matched);
}

function showKeywordBlock(profile, keyword) {
  // Don't double-block
  if (document.getElementById('magnetar-guardian-keyword-block')) return;

  const messages = {
    young: {
      heading: "This page isn't for you right now",
      subtext: "Let's go back to something fun!",
      button: "Back to safe browsing"
    },
    child: {
      heading: "This page has been blocked",
      subtext: "This content isn't suitable for you. If you think this is a mistake, talk to your guardian about it.",
      button: "Back to safe browsing"
    },
    teen: {
      heading: "This page has been blocked",
      subtext: "This content has been flagged as unsuitable. If you think this is a mistake, talk to your guardian about accessing this type of content.",
      button: "Go back"
    },
    vulnerable: {
      heading: "This page has been blocked",
      subtext: "This content has been flagged as potentially unsafe.",
      button: "Go back"
    }
  };

  const msg = messages[profile] || messages.child;

  const overlay = document.createElement('div');
  overlay.id = 'magnetar-guardian-keyword-block';
  overlay.innerHTML = `
    <div style="
      position: fixed; inset: 0; z-index: 2147483647;
      display: flex; align-items: center; justify-content: center; flex-direction: column;
      background: ${profile === 'young' ? 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)' :
                    profile === 'teen' ? '#111118' :
                    'linear-gradient(135deg, #2d3561 0%, #1e2243 50%, #23284e 100%)'};
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: white; text-align: center;
    ">
      <div style="max-width: 440px; padding: 40px;">
        <div style="font-size: ${profile === 'young' ? '72px' : '48px'}; margin-bottom: 20px;">
          ${profile === 'young' ? '🌈' : '🛡️'}
        </div>
        <h1 style="
          font-size: ${profile === 'teen' ? '18px' : profile === 'young' ? '28px' : '22px'};
          font-weight: ${profile === 'teen' ? '500' : '600'};
          margin: 0 0 12px 0;
          color: ${profile === 'teen' ? '#e0e0e8' : '#ffffff'};
        ">${msg.heading}</h1>
        <p style="
          font-size: ${profile === 'young' ? '18px' : '15px'};
          opacity: ${profile === 'teen' ? '0.6' : '0.8'};
          margin: 0 0 32px 0;
          line-height: 1.5;
        ">${msg.subtext}</p>
        <button id="mg-keyword-back" style="
          display: inline-block;
          padding: ${profile === 'young' ? '16px 40px' : '14px 32px'};
          border: ${profile === 'teen' ? '1px solid rgba(255,255,255,0.1)' : profile === 'young' ? '2px solid rgba(255,255,255,0.3)' : '1px solid rgba(255,255,255,0.12)'};
          border-radius: ${profile === 'young' ? '50px' : '12px'};
          font-size: ${profile === 'young' ? '18px' : '16px'};
          font-weight: 600;
          cursor: pointer;
          color: ${profile === 'teen' ? '#c0c0d0' : '#ffffff'};
          background: ${profile === 'teen' ? 'rgba(255,255,255,0.08)' :
                        profile === 'young' ? 'rgba(255,255,255,0.25)' :
                        'linear-gradient(135deg, rgba(80,140,255,0.5), rgba(120,80,255,0.5))'};
        ">${msg.button}</button>
      </div>
    </div>
  `;

  document.documentElement.appendChild(overlay);

  // Stop the page from being visible underneath
  document.body.style.overflow = 'hidden';

  document.getElementById('mg-keyword-back').addEventListener('click', () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = 'https://www.google.com';
    }
  });
}

function showScheduleBlock(profile) {
  const overlay = document.createElement('div');
  overlay.id = 'magnetar-guardian-schedule-block';

  const messages = {
    young: "It's time for a break! Come back later.",
    child: "Browsing isn't available right now. Come back during your allowed hours.",
    teen: "Browsing is currently restricted by your schedule."
  };

  overlay.innerHTML = `
    <div style="
      position: fixed; inset: 0; z-index: 2147483647;
      display: flex; align-items: center; justify-content: center;
      background: rgba(15, 15, 30, 0.97);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: white; text-align: center;
    ">
      <div>
        <div style="font-size: 48px; margin-bottom: 16px;">🛡️</div>
        <p style="font-size: 20px; margin: 0; opacity: 0.9;">${messages[profile] || messages.child}</p>
      </div>
    </div>
  `;

  document.documentElement.appendChild(overlay);
}
