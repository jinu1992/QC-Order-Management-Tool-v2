document.addEventListener('DOMContentLoaded', () => {
  const apiUrlInput = document.getElementById('apiUrl');
  const portalSelect = document.getElementById('portalSelect');
  const detectionBadge = document.getElementById('detectionBadge');
  const syncBtn = document.getElementById('syncBtn');
  const statusConsole = document.getElementById('statusConsole');

  const PORTAL_DOMAINS = {
    flipkart: 'vendorhub.flipkart.com',
    instamart: 'partner.instamart.in',
    blinkit: 'partnersbiz.com',
    zepto: 'brands.zepto.co.in'
  };

  // Helper to log messages in popup console
  function log(msg, isError = false) {
    statusConsole.innerText = `Console: ${msg}`;
    statusConsole.style.color = isError ? '#DC2626' : '#059669';
    console.log(msg);
  }

  // 1. Load saved Render Server URL from extension local storage
  chrome.storage.local.get(['cubeleloApiUrl'], (result) => {
    if (result.cubeleloApiUrl) {
      apiUrlInput.value = result.cubeleloApiUrl;
    }
  });

  // Save URL when changed
  apiUrlInput.addEventListener('input', () => {
    chrome.storage.local.set({ cubeleloApiUrl: apiUrlInput.value });
  });

  // 2. Check active tab to auto-detect portal
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs[0] && tabs[0].url) {
      const activeUrl = tabs[0].url;
      let detectedPortal = null;

      for (const [id, domain] of Object.entries(PORTAL_DOMAINS)) {
        if (activeUrl.includes(domain)) {
          detectedPortal = id;
          break;
        }
      }

      if (detectedPortal) {
        portalSelect.value = detectedPortal;
        detectionBadge.innerText = "Active Portal Tab Detected";
        detectionBadge.className = "badge badge-detected";
        syncBtn.removeAttribute('disabled');
        log(`Detected portal page for "${portalSelect.options[portalSelect.selectedIndex].text}". Ready to sync.`);
      } else {
        detectionBadge.innerText = "No Portal Tab Detected";
        detectionBadge.className = "badge badge-missing";
        // Let them sync anyway if they manually select it
        syncBtn.removeAttribute('disabled');
        log("No matching portal page active. Select manually above.");
      }
    }
  });

  // 3. Handle Sync Button click
  syncBtn.addEventListener('click', () => {
    const portalId = portalSelect.value;
    const targetDomain = PORTAL_DOMAINS[portalId];
    const serverBaseUrl = apiUrlInput.value.trim().replace(/\/$/, "");

    if (!serverBaseUrl) {
      log("Error: Server URL cannot be empty.", true);
      return;
    }

    log(`Fetching cookies for domain: ${targetDomain}...`);
    syncBtn.setAttribute('disabled', 'true');

    // Retrieve all cookies for target domain
    chrome.cookies.getAll({ domain: targetDomain }, (cookies) => {
      if (!cookies || cookies.length === 0) {
        log(`Error: No active session cookies found for ${targetDomain}. Please log in first.`, true);
        syncBtn.removeAttribute('disabled');
        return;
      }

      log(`Found ${cookies.length} cookies. Formatting to Playwright state...`);

      // Convert cookies to Playwright schema
      const formattedCookies = cookies.map(c => {
        // Expiration mapping
        let expires = c.expirationDate;
        if (!expires) {
          // Fallback to 30 days expiration if not specified
          expires = Math.floor(Date.now() / 1000) + (86400 * 30);
        }

        // Handle sameSite mapping
        let sameSite = "Lax";
        if (c.sameSite === "no_restriction") sameSite = "None";
        else if (c.sameSite === "strict") sameSite = "Strict";

        return {
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          expires: expires,
          httpOnly: c.httpOnly,
          secure: c.secure,
          sameSite: sameSite
        };
      });

      const sessionJson = {
        cookies: formattedCookies,
        origins: [] // Playwright origin state (local storage data)
      };

      log("Uploading session state to cloud server...");

      // Send to Render Backend endpoint
      fetch(`${serverBaseUrl}/api/bot-sessions/upload-state`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          portalId,
          sessionJson
        })
      })
      .then(async response => {
        const text = await response.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch(e) {
          throw new Error(`Server returned non-JSON response: ${text.slice(0, 100)}`);
        }

        if (!response.ok || data.status === 'error') {
          throw new Error(data.message || `Server responded with status ${response.status}`);
        }
        
        log(`Success! Synced ${portalId} session to server.`);
        alert(`Successfully synced ${portalSelect.options[portalSelect.selectedIndex].text} session cookies to your cloud dashboard!`);
      })
      .catch(err => {
        log(`Failed: ${err.message}`, true);
        alert(`Failed to sync session:\n\n${err.message}\n\nPlease check if your Server URL is correct and active.`);
      })
      .finally(() => {
        syncBtn.removeAttribute('disabled');
      });
    });
  });
});
