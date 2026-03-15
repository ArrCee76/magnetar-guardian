/**
 * Magnetar Guardian — Blocked Page
 */

const params = new URLSearchParams(window.location.search);
const blockedUrl = params.get('url') ? decodeURIComponent(params.get('url')) : '';
const profile = params.get('profile') || 'child';

document.body.classList.add(`theme-${profile}`);

const content = document.getElementById(`${profile}-content`);
if (content) content.style.display = 'block';

if (profile === 'teen' && blockedUrl) {
  try {
    document.getElementById('blocked-domain').textContent = new URL(blockedUrl).hostname;
  } catch { document.getElementById('blocked-domain').textContent = ''; }
}

(async () => {
  if (!blockedUrl) return;
  let domain = '';
  try { domain = new URL(blockedUrl).hostname; } catch { return; }

  const key = `blocked_attempts_${domain}`;
  const data = await chrome.storage.session?.get([key]) || {};
  const attempts = (data[key] || 0) + 1;
  if (chrome.storage.session) await chrome.storage.session.set({ [key]: attempts });

  if (attempts >= 2) {
    const btn = document.getElementById(`btn-request-${profile}`);
    if (btn) btn.style.display = 'block';
  }
})();

function goSafe() {
  window.location.href = 'https://www.google.com';
}

async function requestReview() {
  if (!blockedUrl) return;
  let domain = '';
  try { domain = new URL(blockedUrl).hostname; } catch { return; }

  const data = await chrome.storage.local.get(['reviewRequests']);
  const requests = data.reviewRequests || [];
  const existing = requests.find(r => r.domain === domain);
  if (existing) { existing.count++; existing.timestamp = Date.now(); }
  else { requests.push({ domain, count: 1, timestamp: Date.now() }); }
  await chrome.storage.local.set({ reviewRequests: requests });

  document.querySelectorAll('.blocked-content').forEach(c => c.style.display = 'none');
  document.getElementById('review-submitted').style.display = 'block';
  setTimeout(() => goSafe(), 3000);
}

document.querySelectorAll('[data-action="goSafe"]').forEach(btn => btn.addEventListener('click', goSafe));
document.querySelectorAll('[data-action="requestReview"]').forEach(btn => btn.addEventListener('click', requestReview));
