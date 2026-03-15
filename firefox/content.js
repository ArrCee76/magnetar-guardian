/**
 * Magnetar Guardian — Content Script
 * 
 * Phase 1: Minimal — just handles scheduled block overlay
 * Phase 2 will add keyword filtering
 */

(async () => {
  // Check if browsing is currently schedule-blocked
  const data = await chrome.storage.local.get(['scheduledBlock', 'ageProfile']);
  
  if (data.scheduledBlock) {
    // Overlay the entire page with a friendly "not available" message
    const profile = data.ageProfile || 'child';
    const overlay = document.createElement('div');
    overlay.id = 'magnetar-guardian-schedule-block';
    
    const messages = {
      young: "It's time for a break! Come back later 🌙",
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
})();
