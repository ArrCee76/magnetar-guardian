/**
 * Magnetar Guardian — PIN Utilities
 * 
 * Uses Web Crypto API for secure PIN hashing.
 * PIN stored as salted SHA-256 hash, never plaintext.
 */

const PinUtils = {
  /**
   * Generate a random salt
   */
  generateSalt() {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
  },

  /**
   * Hash a PIN with a salt using SHA-256
   */
  async hashPin(pin, salt) {
    const encoder = new TextEncoder();
    const data = encoder.encode(salt + pin);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  },

  /**
   * Create and store a new PIN
   */
  async createPin(pin) {
    const salt = PinUtils.generateSalt();
    const hash = await PinUtils.hashPin(pin, salt);
    await chrome.storage.local.set({
      pinHash: hash,
      pinSalt: salt,
      failedPinAttempts: 0
    });
    return true;
  },

  /**
   * Validate a PIN attempt
   * Returns { valid: boolean, locked: boolean, attemptsRemaining: number }
   */
  async validatePin(pin) {
    const data = await chrome.storage.local.get([
      'pinHash', 'pinSalt', 'failedPinAttempts', 'pinLockoutUntil'
    ]);

    // Check lockout
    if (data.pinLockoutUntil && Date.now() < data.pinLockoutUntil) {
      const remaining = Math.ceil((data.pinLockoutUntil - Date.now()) / 1000);
      return { valid: false, locked: true, lockoutSeconds: remaining };
    }

    const hash = await PinUtils.hashPin(pin, data.pinSalt);
    
    if (hash === data.pinHash) {
      // Correct — reset attempts
      await chrome.storage.local.set({ failedPinAttempts: 0, pinLockoutUntil: null });
      return { valid: true, locked: false, attemptsRemaining: 5 };
    }

    // Incorrect — increment attempts
    const attempts = (data.failedPinAttempts || 0) + 1;
    const maxAttempts = 5;

    if (attempts >= maxAttempts) {
      // Lock out for 5 minutes
      const lockoutUntil = Date.now() + (5 * 60 * 1000);
      await chrome.storage.local.set({ failedPinAttempts: attempts, pinLockoutUntil: lockoutUntil });
      return { valid: false, locked: true, lockoutSeconds: 300 };
    }

    await chrome.storage.local.set({ failedPinAttempts: attempts });
    return { valid: false, locked: false, attemptsRemaining: maxAttempts - attempts };
  },

  /**
   * Change PIN (requires current PIN validation first)
   */
  async changePin(currentPin, newPin) {
    const result = await PinUtils.validatePin(currentPin);
    if (!result.valid) return { success: false, ...result };

    await PinUtils.createPin(newPin);
    return { success: true };
  },

  /**
   * Check if a PIN has been set
   */
  async hasPinSet() {
    const data = await chrome.storage.local.get(['pinHash']);
    return !!data.pinHash;
  }
};

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.PinUtils = PinUtils;
}
