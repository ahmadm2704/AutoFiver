// popup.js

const runBtn   = document.getElementById("run");
const exportBtn= document.getElementById("export");
const copyBtn  = document.getElementById("copy");
const listEl   = document.getElementById("list");
const statusEl = document.getElementById("status");
const countEl  = document.getElementById("count");
const filterEl = document.getElementById("filter");

// Modal elements
const loginModal = document.getElementById("loginModal");
const successModal = document.getElementById("successModal");
const openLoginBtn = document.getElementById("openLoginBtn");
const checkLoginBtn = document.getElementById("checkLoginBtn");
const closeModalBtn = document.getElementById("closeModalBtn");
const reloadBtn = document.getElementById("reloadBtn");

let gigs = [];   // [{title,url}]
let view = [];
let currentTabId = null;

function render(items) {
  if (items.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-title">No gigs found</div>
        <div class="empty-description">Try adjusting your search or scan again</div>
      </div>
    `;
  } else {
    listEl.innerHTML = "";
    items.forEach(({ title, url }) => {
      const div = document.createElement("div");
      div.className = "gig-item";
      
      if (url) {
        const a = document.createElement("a");
        a.href = url; 
        a.target = "_blank"; 
        a.rel = "noreferrer"; 
        a.textContent = title;
        a.className = "gig-link";
        div.appendChild(a);
      } else { 
        div.textContent = title; 
        div.className += " gig-text";
      }
      
      listEl.appendChild(div);
    });
  }
  
  countEl.textContent = String(items.length);
  exportBtn.disabled = items.length === 0;
  copyBtn.disabled = items.length === 0;
}
function applyFilter() {
  const q = (filterEl.value || "").toLowerCase().trim();
  view = q ? gigs.filter(g => g.title.toLowerCase().includes(q)) : gigs.slice();
  render(view);
}

// Modal management functions
function showLoginModal() {
  loginModal.style.display = "flex";
  document.body.style.overflow = "hidden";
}

function hideLoginModal() {
  loginModal.style.display = "none";
  document.body.style.overflow = "auto";
}

function showSuccessModal() {
  hideLoginModal();
  successModal.style.display = "flex";
  document.body.style.overflow = "hidden";
}

function hideSuccessModal() {
  successModal.style.display = "none";
  document.body.style.overflow = "auto";
}

async function openFiverrLogin() {
  try {
    if (currentTabId) {
      // Update existing tab to Fiverr login
      await chrome.tabs.update(currentTabId, { 
        url: "https://www.fiverr.com/login",
        active: true 
      });
    } else {
      // Create new tab for Fiverr login
      const tab = await chrome.tabs.create({ 
        url: "https://www.fiverr.com/login",
        active: true 
      });
      currentTabId = tab.id;
    }
  } catch (error) {
    console.error("Failed to open Fiverr login:", error);
    updateStatus("Failed to open login page. Please try again.", "error");
  }
}

async function checkLoginStatus() {
  try {
    if (!currentTabId) {
      updateStatus("Please open Fiverr login first.", "warning");
      return false;
    }

    // Inject content script and check login
    await inject(currentTabId);
    const result = await send(currentTabId, { type: "CHECK_LOGIN" });
    
    if (result?.loggedIn) {
      showSuccessModal();
      updateStatus("Login successful! Click 'Reload & Continue' to proceed.", "success");
      return true;
    } else {
      updateStatus("Please complete login in the Fiverr tab first.", "warning");
      return false;
    }
  } catch (error) {
    console.error("Failed to check login status:", error);
    updateStatus("Failed to verify login. Please try again.", "error");
    return false;
  }
}

function reloadExtension() {
  hideSuccessModal();
  updateStatus("Extension reloaded. Ready to scan your gigs.", "success");
  // Reset state
  gigs = [];
  view = [];
  render([]);
  filterEl.value = "";
}

async function continueAfterLogin() {
  try {
    if (!currentTabId) {
      updateStatus("Please try scanning again.", "error");
      return;
    }

    setLoadingState(true, "Scanning gigs...");
    updateStatus("Login successful. Scanning your gigs...", "loading");
    
    const res = await send(currentTabId, { type: "NAV_TO_GIGS_AND_SCRAPE" });
    
    if (res?.status === "OK") {
      gigs = Array.isArray(res.gigs) ? res.gigs : [];
      filterEl.value = "";
      
      const debugInfo = res.debug ? ` from ${new URL(res.debug.url).pathname}` : '';
      const successMessage = gigs.length > 0 
        ? `Successfully loaded ${gigs.length} gig${gigs.length === 1 ? '' : 's'}${debugInfo}`
        : "Scan completed - no gigs found in your account";
        
      setLoadingState(false);
      updateStatus(successMessage, gigs.length > 0 ? "success" : "warning");
      
      if (res.debug) {
        console.log("[Fiverr Reader] Success debug info:", res.debug);
      }
      if (gigs.length === 0) {
        console.log("[Fiverr Reader] No gigs found. Please check if you have active gigs in your account.");
      }
      
      applyFilter();
    } else {
      setLoadingState(false);
      updateStatus("Failed to scan gigs after login. Please try again.", "error");
    }
  } catch (error) {
    console.error("[Fiverr Reader] Error during continue after login:", error);
    setLoadingState(false);
    updateStatus("An error occurred while scanning. Please try again.", "error");
  }
}

// ----- tab helpers (run inside popup) -----
function waitForComplete(tabId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    chrome.tabs.get(tabId, (t) => {
      if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
      if (!t) return reject(new Error("Tab not found"));
      if (t.status === "complete") return resolve();
      const timer = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error("Timeout waiting for tab to load"));
      }, timeoutMs);
      function listener(id, info) {
        if (id === tabId && info.status === "complete") {
          clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener); resolve();
        }
      }
      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

async function openOrReuseFiverrTab() {
  const HOME = "https://www.fiverr.com/";
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  // If current tab is Fiverr already, reuse it
  if (active && active.url && active.url.includes("fiverr.com")) {
    await chrome.tabs.update(active.id, { url: HOME });
    await waitForComplete(active.id);
    return active.id;
  }
  // Otherwise open a new one
  const created = await chrome.tabs.create({ url: HOME });
  await waitForComplete(created.id);
  return created.id;
}

async function inject(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
}

async function send(tabId, payload) {
  const sendOnce = () => chrome.tabs.sendMessage(tabId, payload);
  try { return await sendOnce(); }
  catch {
    await inject(tabId);
    await new Promise(r => setTimeout(r, 400));
    return await sendOnce();
  }
}

async function waitUntilLoggedIn(tabId, maxMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    statusEl.textContent = "Waiting for login…";
    const { loggedIn } = await send(tabId, { type: "CHECK_LOGIN" });
    if (loggedIn) return true;
    await new Promise(r => setTimeout(r, 1500));
  }
  return false;
}

// Loading state management
function setLoadingState(isLoading, message = "") {
  runBtn.disabled = isLoading;
  if (isLoading) {
    runBtn.classList.add("loading");
    runBtn.innerHTML = `<span>${message || "Processing..."}</span>`;
  } else {
    runBtn.classList.remove("loading");
    runBtn.innerHTML = `<span>Scan & Load Gigs</span>`;
  }
}

function updateStatus(message, type = "info") {
  statusEl.textContent = message;
  statusEl.className = `status-message ${type}`;
}

// ----- main flow -----
async function run() {
  try {
    setLoadingState(true, "Opening Fiverr...");
    updateStatus("Connecting to Fiverr...", "loading");
    
    const tabId = await openOrReuseFiverrTab();
    currentTabId = tabId;
    await inject(tabId);

    // Ensure login (content.js will navigate to /login if needed)
    setLoadingState(true, "Checking login...");
    updateStatus("Verifying authentication...", "loading");
    
    const loginRes = await send(tabId, { type: "ENSURE_LOGIN" });
    if (!loginRes?.loggedIn) {
      setLoadingState(false);
      updateStatus("Authentication required. Please sign in to continue.", "warning");
      showLoginModal();
      return;
    }

    setLoadingState(true, "Scanning gigs...");
    updateStatus("Navigating to gigs page and extracting data...", "loading");
    
    const res = await send(tabId, { type: "NAV_TO_GIGS_AND_SCRAPE" });

    if (res?.status === "OK") {
      gigs = Array.isArray(res.gigs) ? res.gigs : [];
      filterEl.value = "";
      
      const debugInfo = res.debug ? ` from ${new URL(res.debug.url).pathname}` : '';
      const successMessage = gigs.length > 0 
        ? `Successfully loaded ${gigs.length} gig${gigs.length === 1 ? '' : 's'}${debugInfo}`
        : "Scan completed - no gigs found in your account";
        
      setLoadingState(false);
      updateStatus(successMessage, gigs.length > 0 ? "success" : "warning");
      
      // Log debug information to console for troubleshooting
      if (res.debug) {
        console.log("[Fiverr Reader] Success debug info:", res.debug);
      }
      if (gigs.length === 0) {
        console.log("[Fiverr Reader] No gigs found. Please check if you have active gigs in your account.");
      }
      
      applyFilter();
      return;
    }

    if (res?.status === "LOGIN_REQUIRED") {
      setLoadingState(false);
      updateStatus("Authentication required. Please sign in to continue.", "warning");
      showLoginModal();
      return;
    }

    // Handle errors
    setLoadingState(false);
    
    // Log error information for debugging
    if (res?.debug) {
      console.log("[Fiverr Reader] Error debug info:", res.debug);
    }
    if (res?.error) {
      console.log("[Fiverr Reader] Error details:", res.error);
    }
    
    updateStatus("Failed to scan gigs. Please check the console for details.", "error");
  } catch (e) {
    console.error("[Fiverr Reader] Unexpected error:", e);
    setLoadingState(false);
    updateStatus("An unexpected error occurred. Please try again.", "error");
  }
}

runBtn.addEventListener("click", run);
exportBtn.addEventListener("click", () => {
  const rows = view.length ? view : gigs;
  const csv = ["Title,URL"]
    .concat(rows.map(({ title, url }) =>
      `"${(title||"").replace(/"/g,'""')}","${(url||"").replace(/"/g,'""')}"`))
    .join("\n");
  
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); 
  a.href = url; 
  a.download = `fiverr_gigs_${new Date().toISOString().split('T')[0]}.csv`; 
  a.click();
  URL.revokeObjectURL(url);
  
  // Provide feedback
  updateStatus(`Exported ${rows.length} gig${rows.length === 1 ? '' : 's'} to CSV file.`, "success");
  
  // Temporarily change button text
  const originalText = exportBtn.textContent;
  exportBtn.textContent = "Exported!";
  exportBtn.style.background = "var(--success)";
  
  setTimeout(() => {
    exportBtn.textContent = originalText;
    exportBtn.style.background = "";
  }, 2000);
});
copyBtn.addEventListener("click", async () => {
  const items = view.length ? view : gigs;
  const lines = items.map(g => g.title).join("\n");
  
  try { 
    await navigator.clipboard.writeText(lines); 
    updateStatus(`Copied ${items.length} gig title${items.length === 1 ? '' : 's'} to clipboard.`, "success");
    
    // Temporarily change button text
    const originalText = copyBtn.textContent;
    copyBtn.textContent = "Copied!";
    copyBtn.style.background = "var(--success)";
    
    setTimeout(() => {
      copyBtn.textContent = originalText;
      copyBtn.style.background = "";
    }, 2000);
  }
  catch { 
    updateStatus("Failed to copy to clipboard. Please try again.", "error");
  }
});
filterEl.addEventListener("input", applyFilter);

// Modal event listeners
openLoginBtn.addEventListener("click", openFiverrLogin);

checkLoginBtn.addEventListener("click", async () => {
  const loggedIn = await checkLoginStatus();
  // Success modal will be shown if login is successful
});

closeModalBtn.addEventListener("click", hideLoginModal);

reloadBtn.addEventListener("click", async () => {
  reloadExtension();
  // Continue scanning after successful login
  await continueAfterLogin();
});

// Close modal when clicking outside
loginModal.addEventListener("click", (e) => {
  if (e.target === loginModal) {
    hideLoginModal();
  }
});

successModal.addEventListener("click", (e) => {
  if (e.target === successModal) {
    hideSuccessModal();
  }
});

// Close modals on Escape key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (loginModal.style.display === "flex") {
      hideLoginModal();
    }
    if (successModal.style.display === "flex") {
      hideSuccessModal();
    }
  }
});
