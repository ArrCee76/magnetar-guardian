/**
 * Magnetar Guardian — Setup Wizard
 */

let selectedProfile = null;

function nextStep(stepId) {
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  document.getElementById(`step-${stepId}`).classList.add('active');
  const steps = ['welcome', 'pin', 'profile'];
  const idx = steps.indexOf(stepId);
  document.querySelectorAll('.dot').forEach((dot, i) => {
    dot.classList.toggle('active', i <= idx);
  });
}

async function createPin() {
  const pin1 = document.getElementById('pin1').value;
  const pin2 = document.getElementById('pin2').value;
  const error = document.getElementById('pin-error');

  if (pin1.length < 4 || pin1.length > 8) { error.textContent = 'PIN must be 4–8 digits'; return; }
  if (!/^\d+$/.test(pin1)) { error.textContent = 'PIN must contain only numbers'; return; }
  if (pin1 !== pin2) { error.textContent = "PINs don't match"; return; }
  error.textContent = '';

  try {
    await PinUtils.createPin(pin1);
    nextStep('profile');
  } catch (err) {
    error.textContent = 'Failed to create PIN. Try again.';
  }
}

function selectProfile(profile) {
  selectedProfile = profile;
  document.querySelectorAll('.profile-card').forEach(card => {
    card.classList.toggle('selected', card.dataset.profile === profile);
  });
  document.getElementById('btn-confirm-profile').disabled = false;
}

async function confirmProfile() {
  if (!selectedProfile) return;

  // Tell background to complete setup with selected profile
  await chrome.runtime.sendMessage({
    action: 'setupComplete',
    ageProfile: selectedProfile
  });

  // Set timestamp so settings page auto-unlocks
  await chrome.storage.local.set({ setupTimestamp: Date.now() });

  // Navigate directly to the settings dashboard
  window.location.href = chrome.runtime.getURL('settings/settings.html');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-get-started').addEventListener('click', () => nextStep('pin'));
  document.getElementById('btn-set-pin').addEventListener('click', createPin);
  document.querySelectorAll('.profile-card').forEach(card => {
    card.addEventListener('click', () => selectProfile(card.dataset.profile));
  });
  document.getElementById('btn-confirm-profile').addEventListener('click', confirmProfile);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const activeStep = document.querySelector('.step.active');
      if (activeStep) {
        const btn = activeStep.querySelector('.btn-primary:not(:disabled)');
        if (btn) btn.click();
      }
    }
  });
});
