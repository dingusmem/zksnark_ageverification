/**
 * /client/src/sdk.js
 * 
 * Embeddable ZK Age Verification Client SDK
 * 
 * Enables any web page or verifier application to trigger the ZK Age Verification
 * pop-up window and receive the cryptographic Groth16 proof asynchronously.
 */

/**
 * Requests zero-knowledge age verification proof via a secure browser pop-up.
 * 
 * @param {Object} options
 * @param {number} [options.minAge=18] - Required minimum age threshold
 * @param {string} [options.clientUrl] - URL of the verification client
 * @param {string|Date} [options.currentDate] - Current calendar date (YYYY-MM-DD or Date object)
 * @param {number} [options.timeoutMs=120000] - Timeout in milliseconds
 * @returns {Promise<{ proof: Object, publicSignals: Array<string>, credentialHolder?: string }>}
 */
export function requestAgeProof(options = {}) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const {
    minAge = 18,
    clientUrl = typeof window !== 'undefined' ? window.location.origin : '',
    currentDate = todayStr,
    timeoutMs = 120000
  } = options;

  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      return reject(new Error('requestAgeProof must be executed in a browser environment.'));
    }

    const dateParam = currentDate instanceof Date ? currentDate.toISOString().slice(0, 10) : currentDate;
    const reqId = 'zk_req_' + Math.random().toString(36).substring(2, 10);
    const width = 450;
    const height = 650;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popupUrl = `${clientUrl}?mode=popup&reqId=${encodeURIComponent(reqId)}&minAge=${encodeURIComponent(minAge)}&currentDate=${encodeURIComponent(dateParam)}&origin=${encodeURIComponent(window.location.origin)}`;

    const popup = window.open(
      popupUrl,
      'ZkAgeVerificationPopup',
      `width=${width},height=${height},left=${left},top=${top},status=no,menubar=no,toolbar=no,scrollbars=yes`
    );

    if (!popup) {
      return reject(new Error('Pop-up was blocked by browser. Please allow pop-ups for this site.'));
    }

    let timer = null;
    let pollInterval = null;

    const cleanup = () => {
      window.removeEventListener('message', handleMessage);
      if (timer) clearTimeout(timer);
      if (pollInterval) clearInterval(pollInterval);
    };

    const handleMessage = (event) => {
      if (event.data?.type === 'ZK_AGE_PROOF_SUCCESS' && event.data?.reqId === reqId) {
        cleanup();
        resolve({
          proof: event.data.proof,
          publicSignals: event.data.publicSignals,
          credentialHolder: event.data.credentialHolder
        });
      } else if (event.data?.type === 'ZK_AGE_PROOF_CANCEL' && event.data?.reqId === reqId) {
        cleanup();
        reject(new Error(event.data.reason || 'Verification was cancelled by user.'));
      }
    };

    window.addEventListener('message', handleMessage);

    // Watch for premature window closure
    pollInterval = setInterval(() => {
      if (popup.closed) {
        cleanup();
        reject(new Error('Verification pop-up was closed by the user before completing.'));
      }
    }, 500);

    // Timeout
    timer = setTimeout(() => {
      cleanup();
      if (!popup.closed) popup.close();
      reject(new Error('Age verification request timed out.'));
    }, timeoutMs);
  });
}
