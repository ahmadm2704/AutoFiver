function waitForComplete(tabId, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      chrome.tabs.get(tabId, (t) => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
        if (t.status === "complete") return resolve();
        const timer = setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(listener);
          reject(new Error("Timeout waiting for tab to load"));
        }, timeoutMs);
        function listener(id, info) {
          if (id === tabId && info.status === "complete") {
            clearTimeout(timer);
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        }
        chrome.tabs.onUpdated.addListener(listener);
      });
    });
  }
  
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "OPEN_AND_NAVIGATE") {
      (async () => {
        try {
          const DASHBOARD = "https://www.fiverr.com/seller_dashboard";
          const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
          let tabId;
          if (active && active.url && active.url.includes("fiverr.com")) {
            const upd = await chrome.tabs.update(active.id, { url: DASHBOARD });
            tabId = upd.id;
          } else {
            const created = await chrome.tabs.create({ url: DASHBOARD });
            tabId = created.id;
          }
          await waitForComplete(tabId);
          await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
          sendResponse(tabId);
        } catch (e) {
          console.error(e);
          sendResponse(null);
        }
      })();
      return true;
    }
  });
  