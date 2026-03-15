# Privacy Policy

**Magnetar Guardian** is a browser extension that runs entirely in your browser. This policy explains what data it handles and how.

## What Magnetar Guardian does not do

- Does not collect any personal data
- Does not use analytics or telemetry
- Does not track browsing activity or history
- Does not send data to any third-party services
- Does not log which sites are visited or blocked
- Does not display ads
- Does not transmit the guardian PIN or any settings externally

## What data is stored

Magnetar Guardian stores the following data locally in your browser's extension storage:

- **Guardian PIN** — stored as a salted SHA-256 hash (never plaintext)
- **Age profile selection** (Young Child, Child, or Teen)
- **Blocklist toggle states** (which categories are enabled/disabled)
- **Allowed domains** (sites the guardian has approved)
- **Review requests** (domains the user has flagged for guardian review — domain name and timestamp only)
- **Block statistics** (count of blocked requests today and this week — no URLs stored)
- **Schedule settings** (time-based access rules if configured)

All of this data stays on your device. It is never transmitted anywhere.

## Network requests

Magnetar Guardian makes **zero network requests**. All blocklists are compiled at build time and bundled with the extension. There is no phoning home, no update checking, no remote configuration.

## Browsing history

Magnetar Guardian does **not** record, store, or transmit any browsing history. The extension checks visited URLs against its local blocklists in real time and immediately discards the URL after the check. Only aggregate counts (e.g., "42 sites blocked today") are retained — never specific URLs.

## Children's privacy

Magnetar Guardian is designed with children's privacy as a core principle. No information about the child's browsing activity is collected, stored, or made available to anyone — including the guardian. The guardian dashboard shows only aggregate block counts and domains that the child has explicitly chosen to flag for review.

## Contact

For questions about this privacy policy, open an issue on [GitHub](https://github.com/ArrCee76/magnetar-guardian).
