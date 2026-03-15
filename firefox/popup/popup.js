/**
 * Magnetar Guardian — Popup
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Bind buttons
  document.getElementById('btn-setup')?.addEventListener('click', openSetup);
  document.getElementById('btn-open-settings')?.addEventListener('click', openSettings);

  try {
    const status = await chrome.runtime.sendMessage({ action: 'getStatus' });

    if (!status.setupComplete) {
      show('state-setup');
      return;
    }

    if (status.scheduledBlock) {
      show('state-scheduled');
      return;
    }

    show('state-active');
    document.getElementById('stat-today').textContent = (status.stats?.today || 0).toLocaleString();
    document.getElementById('stat-week').textContent = (status.stats?.week || 0).toLocaleString();
  } catch (err) {
    console.error('Popup error:', err);
    show('state-setup');
  }
});

function show(id) {
  document.querySelectorAll('.state').forEach(s => s.style.display = 'none');
  document.getElementById(id).style.display = 'block';
}

function openSetup() {
  chrome.runtime.sendMessage({ action: 'openSetup' });
  window.close();
}

function openSettings() {
  chrome.runtime.openOptionsPage();
  window.close();
}
