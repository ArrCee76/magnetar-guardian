# Magnetar Guardian

Safe browsing for the whole family.

Magnetar Guardian is a browser extension that blocks adult content, phishing, scams, and unsafe websites with age-based profiles and PIN-locked settings. It is not surveillance software. There is no data collection, no tracking, and no logging. Everything runs locally in your browser.

Part of the Magnetar extension family: https://github.com/ArrCee76/magnetar


## Features

### Four Age-Based Profiles

- Young Child (Under 7) - Maximum protection. All categories blocked, safe search enforced, social media blocked.
- Child (7-12) - Strong protection. Adult, gambling, violence, drugs, social media blocked. Safe search enforced.
- Teen (13-17) - Moderate protection. Adult and gambling blocked. Social media and safe search left open.
- Vulnerable Adult - Scam and phishing protection for non-tech-savvy adults. Blocks phishing, malware, and gambling. Normal browsing unrestricted.

Every toggle is fully configurable. The profile just sets sensible defaults.

### PIN-Protected Settings

Guardian creates a 4-8 digit PIN during setup. All settings, profile changes, and bypass mode require the PIN. Kids cannot disable protection or change anything.

### Domain Blocking

200,000+ domains blocked across 9 categories:

- Adult Content - Pornography and explicit material
- Gambling - Betting sites, online casinos
- Violence and Hate - Graphic violence, hate speech, extremist content
- Drugs - Drug-related content
- Dating - Dating platforms and hookup apps
- Proxies and VPNs - Sites that could bypass protection
- Social Media - Facebook, Instagram, TikTok, X, Snapchat, Reddit, Discord, and more
- Phishing and Scams - Known phishing and fraud domains
- Malware - Sites distributing malicious software

### Keyword Filtering

Scans page URLs and titles for inappropriate words and phrases. Includes a comprehensive built-in keyword list covering adult content, violence, self-harm, and leet-speak evasion variants. Guardians can add custom keywords through the settings dashboard. Pages that match are blocked with an age-appropriate message encouraging the user to talk to their guardian.

### Safe Search Enforcement

Forces filtered results on Google, Bing, DuckDuckGo, Ecosia, and YouTube Restricted Mode. Toggleable by the guardian.

### Guardian Bypass Mode

Temporarily pause all blocking for 15, 30, or 60 minutes so the guardian can browse freely. Protection re-enables automatically with a live countdown timer.

### Allowed and Excluded Sites

- Allowed Sites - Whitelist domains that should not be blocked (e.g. a safe site caught by a blocklist)
- Excluded Sites - Manually block specific domains not covered by the blocklists

### Privacy-First Stats

Badge shows today's block count. Dashboard shows weekly stats. No URLs or browsing history are ever recorded, just aggregate counts.

### Review Requests

When a user hits a blocked site multiple times, they can request the guardian review it. Requests appear in the dashboard for the guardian to approve or dismiss.

### Import and Export

Back up and restore settings as JSON. Share configurations between devices.


## Installation

### Chrome / Edge

1. Download the latest release from https://github.com/ArrCee76/magnetar-guardian/releases and unzip it, or click the green Code button above and select Download ZIP
2. Unzip the folder somewhere on your computer
3. Open Chrome and go to chrome://extensions (or Edge: edge://extensions)
4. Turn on Developer mode (toggle in the top right)
5. Click Load unpacked
6. Select the chrome folder from inside the unzipped download
7. The setup wizard will open automatically. Create your PIN and choose a profile.

That's it. No terminal, no commands, no extra software needed.

### Firefox

1. Download and unzip as above
2. Go to about:debugging#/runtime/this-firefox
3. Click Load Temporary Add-on
4. Select manifest.json from the firefox folder
5. The setup wizard will open automatically

Note: Firefox temporary add-ons are removed when the browser closes. A permanent Firefox install will be available via Firefox AMO once published.

### Updating Blocklists (Optional)

The extension ships with pre-built blocklists. If you want to update them to the latest versions, you will need Node.js installed, then run:

    cd build
    node build-rulesets.js

This fetches the latest lists, deduplicates, and rebuilds the rule files. Most users will not need to do this.


## How It Works

1. On first install, Magnetar Guardian opens a setup wizard
2. Guardian creates a PIN (4-8 digits)
3. Guardian selects an age profile for the user
4. Guardian lands on the full settings dashboard to customise as needed
5. Click "Start Safe Browsing" to lock settings and begin protected browsing

All subsequent access to settings requires the PIN. The user only sees a friendly popup showing protection is active and the day's block count.


## Blocklist Sources

- StevenBlack/hosts (https://github.com/StevenBlack/hosts) - Adult, malware - Updated daily
- UT1 Blacklists, Universite Toulouse (https://github.com/olbat/ut1-blacklists) - Adult, gambling, violence, drugs, dating, proxy, social, phishing, malware - Updated daily
- Core domains (built-in) - Social media, gambling, adult - Updated per release

Lists are compiled at build time and shipped as static rulesets. No dynamic fetching, works completely offline.


## Technical Details

- Chrome: Manifest V3, declarativeNetRequest for domain blocking, service worker background
- Firefox: Manifest V2, webRequest blocking API, background scripts
- PIN Security: Salted SHA-256 hash via Web Crypto API, never stored in plaintext, lockout after 5 failed attempts
- Safe Search: Query parameter injection (safe=active for Google, adlt=strict for Bing, etc.)
- Keyword Filtering: Content script scans URLs and page titles against built-in and custom word lists
- MV3 Budget: 200,000 static rules across chunked rulesets (50k rules per file), auto-managed by build script
- No inline event handlers, fully MV3 CSP compliant


## File Structure

    magnetar-guardian/
    |-- chrome/          Chrome MV3 build
    |-- firefox/         Firefox MV2 build (shared UI, separate background + manifest)
    |-- build/           Build script for compiling blocklists
    |-- README.md
    |-- PRIVACY.md
    +-- LICENSE          MIT


## Privacy

See PRIVACY.md for the full privacy policy.

In short: Magnetar Guardian does not collect, transmit, or store any browsing data. All settings and statistics are stored locally on your device. No analytics, no tracking, no ads, no remote servers. The guardian PIN is stored as a salted hash, never in plaintext.


## Built With

Developed with assistance from Claude Opus 4.6 to optimise code structure and logic.


## Support

If Magnetar Guardian is useful to you, consider buying me a coffee: https://buymeacoffee.com/arrcee76


## Licence

MIT - see LICENSE file.


## Author

ArrCee76 - https://github.com/ArrCee76
