/**
 * Magnetar Guardian — Settings Dashboard
 */

const CATEGORIES = [
  { id: 'adult', label: 'Adult Content', help: 'Pornography, explicit material, and adult-only websites.' },
  { id: 'gambling', label: 'Gambling', help: 'Betting sites, online casinos, and gambling platforms.' },
  { id: 'violence', label: 'Violence & Hate', help: 'Graphic violence, gore, hate speech, and extremist content.' },
  { id: 'drugs', label: 'Drugs', help: 'Drug use, drug trade, and substance-related content.' },
  { id: 'dating', label: 'Dating Sites', help: 'Dating platforms, hookup apps, and personal ads.' },
  { id: 'proxy', label: 'Proxies & VPNs', help: 'Proxy services and VPN sites that could be used to bypass this protection.' },
  { id: 'social', label: 'Social Media', help: 'Facebook, Instagram, TikTok, Twitter, Snapchat, and similar platforms.' },
  { id: 'phishing', label: 'Phishing & Scams', help: 'Known phishing sites, scam pages, and fraudulent domains.' },
  { id: 'malware', label: 'Malware', help: 'Sites known to distribute malware, viruses, and malicious software.' }
];

let currentProfile = 'child';
let currentToggles = {};

// ── PIN Verification ─────────────────────────────────────────────────

async function verifyPin() {
  const pin = document.getElementById('pin-input').value;
  const error = document.getElementById('pin-error');
  if (!pin) { error.textContent = 'Enter your PIN'; return; }

  const result = await PinUtils.validatePin(pin);
  if (result.locked) {
    const mins = Math.ceil(result.lockoutSeconds / 60);
    error.textContent = `Too many attempts. Try again in ${mins} minute${mins > 1 ? 's' : ''}.`;
    return;
  }
  if (!result.valid) {
    error.textContent = `Incorrect PIN. ${result.attemptsRemaining} attempt${result.attemptsRemaining > 1 ? 's' : ''} remaining.`;
    document.getElementById('pin-input').value = '';
    return;
  }

  document.getElementById('pin-gate').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  await loadDashboard();
}

function lockAndBrowse() {
  window.location.href = 'https://www.google.com';
}

// ── Load Dashboard ───────────────────────────────────────────────────

async function loadDashboard() {
  const data = await chrome.storage.local.get([
    'ageProfile', 'blocklistsEnabled', 'allowedDomains',
    'excludedDomains', 'reviewRequests', 'stats', 'bypassUntil'
  ]);

  currentProfile = data.ageProfile || 'child';
  currentToggles = data.blocklistsEnabled || {};

  // Set profile radio
  const radio = document.querySelector(`input[name="profile"][value="${currentProfile}"]`);
  if (radio) radio.checked = true;

  // Profile change handler
  document.querySelectorAll('input[name="profile"]').forEach(r => {
    r.addEventListener('change', async (e) => {
      currentProfile = e.target.value;
      // Get defaults for new profile
      const resp = await chrome.runtime.sendMessage({ action: 'getProfileDefaults', profile: currentProfile });
      currentToggles = resp.defaults || {};
      await chrome.runtime.sendMessage({ action: 'updateProfile', ageProfile: currentProfile, blocklistsEnabled: currentToggles });
      renderBlocklistToggles();
      renderSafeSearch();
    });
  });

  renderBlocklistToggles();
  renderSafeSearch();
  renderAllowlist(data.allowedDomains || {});
  renderExcludedSites(data.excludedDomains || []);
  renderReviewRequests(data.reviewRequests || []);
  renderStats(data.stats || {});
  renderBypassStatus(data.bypassUntil);
}

// ── Content Blocking Toggles ─────────────────────────────────────────

function renderBlocklistToggles() {
  const container = document.getElementById('blocklist-toggles');
  container.innerHTML = '';

  for (const cat of CATEGORIES) {
    const isEnabled = currentToggles[cat.id] !== undefined ? currentToggles[cat.id] : true;

    const row = document.createElement('div');
    row.className = 'toggle-row';
    row.innerHTML = `
      <div>
        <span>${cat.label}</span>
        <span class="toggle-help">${cat.help}</span>
      </div>
      <label class="switch">
        <input type="checkbox" ${isEnabled ? 'checked' : ''} data-ruleset="${cat.id}">
        <span class="slider"></span>
      </label>
    `;
    const checkbox = row.querySelector('input[type="checkbox"]');
    checkbox.addEventListener('change', function() {
      currentToggles[this.dataset.ruleset] = this.checked;
      chrome.runtime.sendMessage({ action: 'toggleRuleset', ruleset: this.dataset.ruleset, enabled: this.checked });
    });
    container.appendChild(row);
  }
}

// ── Safe Search ──────────────────────────────────────────────────────

function renderSafeSearch() {
  const toggle = document.getElementById('toggle-safesearch');
  toggle.checked = currentToggles.safesearch !== undefined ? currentToggles.safesearch : true;
}

// ── Bypass Mode ──────────────────────────────────────────────────────

function renderBypassStatus(bypassUntil) {
  const statusEl = document.getElementById('bypass-status');
  const timerEl = document.getElementById('bypass-timer');
  const offBtn = document.getElementById('btn-bypass-off');
  const bypassBtns = document.querySelectorAll('.btn-bypass');

  if (bypassUntil && Date.now() < bypassUntil) {
    statusEl.innerHTML = '<span class="bypass-badge active">⏸ Bypass Active</span>';
    offBtn.style.display = 'inline-block';
    bypassBtns.forEach(b => b.style.display = 'none');
    timerEl.style.display = 'block';
    updateBypassTimer(bypassUntil);
  } else {
    statusEl.innerHTML = '<span class="bypass-badge inactive">✓ Protection Active</span>';
    offBtn.style.display = 'none';
    bypassBtns.forEach(b => b.style.display = 'inline-block');
    timerEl.style.display = 'none';
  }
}

function updateBypassTimer(until) {
  const timerEl = document.getElementById('bypass-timer');
  const update = () => {
    const remaining = Math.max(0, until - Date.now());
    if (remaining <= 0) {
      renderBypassStatus(null);
      return;
    }
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    timerEl.textContent = `Protection re-enables in ${mins}:${secs.toString().padStart(2, '0')}`;
    setTimeout(update, 1000);
  };
  update();
}

async function activateBypass(minutes) {
  const resp = await chrome.runtime.sendMessage({ action: 'activateBypass', minutes });
  if (resp.success) renderBypassStatus(resp.until);
}

async function deactivateBypass() {
  await chrome.runtime.sendMessage({ action: 'deactivateBypass' });
  renderBypassStatus(null);
}

// ── Allowlist ────────────────────────────────────────────────────────

function renderAllowlist(allowedDomains) {
  const container = document.getElementById('allowlist');
  const domains = allowedDomains[currentProfile] || [];
  container.innerHTML = '';
  if (domains.length === 0) { container.innerHTML = '<p class="empty-state">No allowed sites</p>'; return; }

  for (const domain of domains) {
    const item = document.createElement('div');
    item.className = 'domain-item';
    item.innerHTML = `<span>${domain}</span>`;
    const btn = document.createElement('button');
    btn.className = 'btn-remove';
    btn.textContent = '×';
    btn.addEventListener('click', () => removeAllowlist(domain));
    item.appendChild(btn);
    container.appendChild(item);
  }
}

async function addAllowlist() {
  const input = document.getElementById('allowlist-input');
  let domain = input.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
  if (!domain) return;

  const data = await chrome.storage.local.get(['allowedDomains']);
  const allowed = data.allowedDomains || {};
  if (!allowed[currentProfile]) allowed[currentProfile] = [];
  if (!allowed[currentProfile].includes(domain)) {
    allowed[currentProfile].push(domain);
    await chrome.runtime.sendMessage({ action: 'updateAllowedSites', allowedDomains: allowed });
  }
  input.value = '';
  renderAllowlist(allowed);
}

async function removeAllowlist(domain) {
  const data = await chrome.storage.local.get(['allowedDomains']);
  const allowed = data.allowedDomains || {};
  if (allowed[currentProfile]) {
    allowed[currentProfile] = allowed[currentProfile].filter(d => d !== domain);
    await chrome.runtime.sendMessage({ action: 'updateAllowedSites', allowedDomains: allowed });
  }
  renderAllowlist(allowed);
}

// ── Excluded Sites ───────────────────────────────────────────────────

function renderExcludedSites(domains) {
  const container = document.getElementById('excluded-list');
  container.innerHTML = '';
  if (domains.length === 0) { container.innerHTML = '<p class="empty-state">No excluded sites</p>'; return; }

  for (const domain of domains) {
    const item = document.createElement('div');
    item.className = 'domain-item';
    item.innerHTML = `<span>${domain}</span>`;
    const btn = document.createElement('button');
    btn.className = 'btn-remove';
    btn.textContent = '×';
    btn.addEventListener('click', () => removeExcluded(domain));
    item.appendChild(btn);
    container.appendChild(item);
  }
}

async function addExcluded() {
  const input = document.getElementById('excluded-input');
  let domain = input.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
  if (!domain) return;

  const data = await chrome.storage.local.get(['excludedDomains']);
  const domains = data.excludedDomains || [];
  if (!domains.includes(domain)) {
    domains.push(domain);
    await chrome.runtime.sendMessage({ action: 'updateExcludedSites', domains });
  }
  input.value = '';
  renderExcludedSites(domains);
}

async function removeExcluded(domain) {
  const data = await chrome.storage.local.get(['excludedDomains']);
  const domains = (data.excludedDomains || []).filter(d => d !== domain);
  await chrome.runtime.sendMessage({ action: 'updateExcludedSites', domains });
  renderExcludedSites(domains);
}

// ── Review Requests ──────────────────────────────────────────────────

function renderReviewRequests(requests) {
  const container = document.getElementById('review-requests');
  container.innerHTML = '';
  if (requests.length === 0) { container.innerHTML = '<p class="empty-state">No review requests</p>'; return; }

  for (const req of requests) {
    const date = new Date(req.timestamp).toLocaleDateString();
    const item = document.createElement('div');
    item.className = 'domain-item';
    const span = document.createElement('span');
    span.innerHTML = `${req.domain} <small style="opacity:0.4">(${req.count}× · ${date})</small>`;
    const btnGroup = document.createElement('div');
    const approveBtn = document.createElement('button');
    approveBtn.className = 'btn-approve';
    approveBtn.textContent = 'Allow';
    approveBtn.addEventListener('click', async () => {
      await addToAllowlist(req.domain);
      await removeRequest(req.domain);
    });
    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'btn-remove';
    dismissBtn.textContent = '×';
    dismissBtn.addEventListener('click', () => removeRequest(req.domain));
    btnGroup.appendChild(approveBtn);
    btnGroup.appendChild(dismissBtn);
    item.appendChild(span);
    item.appendChild(btnGroup);
    container.appendChild(item);
  }
}

async function addToAllowlist(domain) {
  const data = await chrome.storage.local.get(['allowedDomains']);
  const allowed = data.allowedDomains || {};
  if (!allowed[currentProfile]) allowed[currentProfile] = [];
  if (!allowed[currentProfile].includes(domain)) {
    allowed[currentProfile].push(domain);
    await chrome.runtime.sendMessage({ action: 'updateAllowedSites', allowedDomains: allowed });
  }
  renderAllowlist(allowed);
}

async function removeRequest(domain) {
  const data = await chrome.storage.local.get(['reviewRequests']);
  const requests = (data.reviewRequests || []).filter(r => r.domain !== domain);
  await chrome.storage.local.set({ reviewRequests: requests });
  renderReviewRequests(requests);
}

// ── Stats ────────────────────────────────────────────────────────────

function renderStats(stats) {
  document.getElementById('dash-stat-today').textContent = (stats.today || 0).toLocaleString();
  document.getElementById('dash-stat-week').textContent = (stats.week || 0).toLocaleString();
}

// ── PIN Change ───────────────────────────────────────────────────────

async function changePin() {
  const current = document.getElementById('current-pin').value;
  const newPin = document.getElementById('new-pin').value;
  const confirm = document.getElementById('confirm-pin').value;
  const error = document.getElementById('pin-change-error');

  if (newPin.length < 4 || newPin.length > 8 || !/^\d+$/.test(newPin)) {
    error.textContent = 'New PIN must be 4–8 digits'; error.style.color = '#ff6b6b'; return;
  }
  if (newPin !== confirm) {
    error.textContent = "PINs don't match"; error.style.color = '#ff6b6b'; return;
  }

  const result = await PinUtils.changePin(current, newPin);
  if (result.success) {
    error.textContent = 'PIN updated!'; error.style.color = '#66bb6a';
    document.getElementById('current-pin').value = '';
    document.getElementById('new-pin').value = '';
    document.getElementById('confirm-pin').value = '';
  } else {
    error.textContent = 'Current PIN is incorrect'; error.style.color = '#ff6b6b';
  }
}

// ── Import/Export ────────────────────────────────────────────────────

async function exportSettings() {
  const data = await chrome.storage.local.get(null);
  const exportData = { ...data };
  delete exportData.pinHash; delete exportData.pinSalt;
  delete exportData.failedPinAttempts; delete exportData.pinLockoutUntil;

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `magnetar-guardian-settings-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importSettings(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const imported = JSON.parse(text);
    delete imported.pinHash; delete imported.pinSalt;
    delete imported.failedPinAttempts; delete imported.pinLockoutUntil;
    await chrome.storage.local.set(imported);
    if (imported.ageProfile) {
      await chrome.runtime.sendMessage({ action: 'updateProfile', ageProfile: imported.ageProfile, blocklistsEnabled: imported.blocklistsEnabled });
    }
    await loadDashboard();
    alert('Settings imported successfully!');
  } catch (err) {
    alert('Failed to import. Make sure the file is valid JSON.');
  }
  event.target.value = '';
}

// ── Event Bindings ───────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // PIN gate
  document.getElementById('btn-verify-pin').addEventListener('click', verifyPin);
  document.getElementById('pin-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') verifyPin(); });
  document.getElementById('pin-input').focus();

  // Start Safe Browsing (lock + navigate)
  document.getElementById('btn-start-safe').addEventListener('click', lockAndBrowse);

  // Safe search toggle
  document.getElementById('toggle-safesearch').addEventListener('change', function() {
    currentToggles.safesearch = this.checked;
    chrome.runtime.sendMessage({ action: 'toggleRuleset', ruleset: 'safesearch', enabled: this.checked });
  });

  // Allowlist
  document.getElementById('btn-add-allow').addEventListener('click', addAllowlist);
  document.getElementById('allowlist-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') addAllowlist(); });

  // Excluded sites
  document.getElementById('btn-add-excluded').addEventListener('click', addExcluded);
  document.getElementById('excluded-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') addExcluded(); });

  // Bypass buttons
  document.querySelectorAll('.btn-bypass').forEach(btn => {
    btn.addEventListener('click', () => activateBypass(parseInt(btn.dataset.minutes)));
  });
  document.getElementById('btn-bypass-off').addEventListener('click', deactivateBypass);

  // PIN change
  document.getElementById('btn-change-pin').addEventListener('click', changePin);

  // Import/Export
  document.getElementById('btn-export').addEventListener('click', exportSettings);
  document.getElementById('btn-import').addEventListener('click', () => document.getElementById('import-file').click());
  document.getElementById('import-file').addEventListener('change', (e) => importSettings(e));

  // Check if we're coming from setup (auto-unlock)
  checkAutoUnlock();
});

async function checkAutoUnlock() {
  // If setup just completed (within last 5 seconds), skip PIN gate
  const data = await chrome.storage.local.get(['setupComplete', 'setupTimestamp']);
  if (data.setupComplete && data.setupTimestamp && (Date.now() - data.setupTimestamp) < 5000) {
    document.getElementById('pin-gate').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    await chrome.storage.local.remove('setupTimestamp');
    await loadDashboard();
  }
}
