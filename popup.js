// popup.js - COMPLETE UPDATED VERSION

const runBtn   = document.getElementById("run");
const exportBtn= document.getElementById("export");
const copyBtn  = document.getElementById("copy");
const listEl   = document.getElementById("list");
const statusEl = document.getElementById("status");
const countEl  = document.getElementById("count");
const filterEl = document.getElementById("filter");

// Progress bar elements
const progressContainer = document.getElementById("progressContainer");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");

// Modal elements
const loginModal = document.getElementById("loginModal");
const successModal = document.getElementById("successModal");
const openLoginBtn = document.getElementById("openLoginBtn");
const checkLoginBtn = document.getElementById("checkLoginBtn");
const closeModalBtn = document.getElementById("closeModalBtn");
const reloadBtn = document.getElementById("reloadBtn");

let gigs = [];
let view = [];
let currentTabId = null;

// Supabase config UI elements
const supabaseUrlEl = document.getElementById('supabaseUrl');
const supabaseKeyEl = document.getElementById('supabaseKey');
const saveSupabaseBtn = document.getElementById('saveSupabase');
const clearSupabaseBtn = document.getElementById('clearSupabase');
const testSupabaseBtn = document.getElementById('testSupabase');

// ========== SUPABASE CONFIG FUNCTIONS ==========
async function loadSupabaseConfig(){
  try{
    if (window.AppState && typeof window.AppState.getSupabaseConfig === 'function'){
      const cfg = await window.AppState.getSupabaseConfig();
      supabaseUrlEl.value = cfg.url || '';
      supabaseKeyEl.value = cfg.key || '';
      
      const connectionStatus = window.AppState.getConnectionStatus();
      updateSupabaseStatus(connectionStatus);
    } else {
      chrome.storage.local.get('supabase_config', (r)=>{
        const cfg = r.supabase_config || {url:'', key:''};
        supabaseUrlEl.value = cfg.url || '';
        supabaseKeyEl.value = cfg.key || '';
      });
    }
  }catch(e){ console.error('loadSupabaseConfig', e); }
}

async function saveSupabaseConfig(){
  const cfg = { url: supabaseUrlEl.value.trim(), key: supabaseKeyEl.value.trim() };
  try{
    if (window.AppState && typeof window.AppState.setSupabaseConfig === 'function'){
      await window.AppState.setSupabaseConfig(cfg);
      
      updateStatus('Testing Supabase connection...', 'loading');
      const connected = await window.AppState.testSupabaseConnection();
      const connectionStatus = window.AppState.getConnectionStatus();
      
      if (connected) {
        updateStatus('Supabase config saved and connected!', 'success');
      } else {
        updateStatus(`Supabase config saved but connection failed: ${connectionStatus.error}`, 'warning');
      }
      
      updateSupabaseStatus(connectionStatus);
    } else {
      chrome.storage.local.set({ supabase_config: cfg });
      updateStatus('Supabase config saved', 'success');
    }
  }catch(e){ 
    console.error('saveSupabaseConfig', e); 
    updateStatus('Failed to save config','error'); 
  }
}

async function clearSupabaseConfig(){
  try{
    const empty = { url:'', key:'' };
    if (window.AppState && typeof window.AppState.setSupabaseConfig === 'function'){
      await window.AppState.setSupabaseConfig(empty);
    } else {
      chrome.storage.local.set({ supabase_config: empty });
    }
    supabaseUrlEl.value = '';
    supabaseKeyEl.value = '';
    updateStatus('Supabase config cleared', 'info');
    
    const connectionStatus = { connected: false, lastChecked: new Date(), error: 'Configuration cleared' };
    updateSupabaseStatus(connectionStatus);
  }catch(e){ 
    console.error('clearSupabaseConfig', e); 
    updateStatus('Failed to clear config','error');
  }
}

async function testSupabaseConnection() {
  try {
    updateStatus('Testing Supabase connection and setup...', 'loading');
    
    if (!window.AppState || typeof window.AppState.testSupabaseSetup !== 'function') {
      updateStatus('AppState not available for testing', 'error');
      return;
    }

    const testResult = await window.AppState.testSupabaseSetup();
    
    if (testResult.success) {
      updateStatus('Supabase test successful! Check console for details.', 'success');
      console.log('[Popup] Supabase test successful:', testResult);
    } else {
      updateStatus(`Supabase test failed: ${testResult.error}`, 'error');
      console.error('[Popup] Supabase test failed:', testResult);
    }
    
    const connectionStatus = window.AppState.getConnectionStatus();
    updateSupabaseStatus(connectionStatus);
    
  } catch (error) {
    console.error('Test Supabase connection error:', error);
    updateStatus('Failed to test Supabase connection', 'error');
  }
}

function updateSupabaseStatus(connectionStatus) {
  let statusIndicator = document.getElementById('supabaseStatus');
  if (!statusIndicator) {
    const statusDiv = document.createElement('div');
    statusDiv.id = 'supabaseStatus';
    statusDiv.style.cssText = `
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 4px;
      margin-top: 4px;
      text-align: center;
    `;
    
    const supabaseSection = document.querySelector('div[style*="padding:12px"]');
    if (supabaseSection) {
      supabaseSection.appendChild(statusDiv);
    }
    statusIndicator = statusDiv;
  }
  
  if (statusIndicator) {
    if (connectionStatus.connected) {
      statusIndicator.textContent = '✅ Connected to Supabase';
      statusIndicator.style.background = 'rgba(16, 185, 129, 0.1)';
      statusIndicator.style.color = 'var(--success)';
      statusIndicator.style.border = '1px solid rgba(16, 185, 129, 0.3)';
    } else {
      statusIndicator.textContent = connectionStatus.error ? `❌ ${connectionStatus.error}` : '⚠️ Not connected';
      statusIndicator.style.background = 'rgba(239, 68, 68, 0.1)';
      statusIndicator.style.color = 'var(--error)';
      statusIndicator.style.border = '1px solid rgba(239, 68, 68, 0.3)';
    }
  }
}

// ========== UI FUNCTIONS ==========
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

// ========== PROGRESS BAR FUNCTIONS ==========
function showProgress() {
  progressContainer.style.display = 'flex';
}

function hideProgress() {
  progressContainer.style.display = 'none';
}

function updateProgress(current, total) {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
  progressBar.style.width = `${percentage}%`;
  progressText.textContent = `${percentage}%`;
}

// ========== MODAL FUNCTIONS ==========
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

// ========== STATUS FUNCTIONS ==========
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

// ========== LOGIN FUNCTIONS ==========
async function openFiverrLogin() {
  try {
    if (currentTabId) {
      await chrome.tabs.update(currentTabId, { 
        url: "https://www.fiverr.com/login",
        active: true 
      });
    } else {
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
      
      try {
        updateStatus('Collecting detailed gig info (this may take a while)...', 'loading');
        setLoadingState(true, 'Scraping gigs...');

        const detailed = await scrapeAllGigDetails(gigs);

        updateStatus('Saving detailed gigs to storage and Supabase...', 'loading');
        const syncResult = await window.AppState.syncGigs(detailed);

        const debugInfo = res.debug ? ` from ${new URL(res.debug.url).pathname}` : '';
        const syncInfo = syncResult.synced ? ' (synced to Supabase)' : ' (local storage only)';
        const successMessage = detailed.length > 0 
          ? `Successfully scraped and stored ${detailed.length} gig${detailed.length === 1 ? '' : 's'}${debugInfo}${syncInfo}`
          : "Scraping completed - no gigs found";

        setLoadingState(false);
        updateStatus(successMessage, detailed.length > 0 ? "success" : "warning");

        const connectionStatus = window.AppState.getConnectionStatus();
        updateSupabaseStatus(connectionStatus);
      } catch (syncError) {
        console.error('Failed to scrape or sync gigs:', syncError);
        setLoadingState(false);
        updateStatus('Scraping completed but failed to save all data. Check console for details.', 'warning');
      }
      
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

// ========== TAB HELPERS ==========
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
          clearTimeout(timer);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      }
      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

async function openOrReuseFiverrTab() {
  const HOME = "https://www.fiverr.com/";
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (active && active.url && active.url.includes("fiverr.com")) {
    await chrome.tabs.update(active.id, { url: HOME });
    await waitForComplete(active.id);
    return active.id;
  }
  
  const created = await chrome.tabs.create({ url: HOME });
  await waitForComplete(created.id);
  return created.id;
}

async function inject(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["state.js"] });
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
}

async function send(tabId, payload) {
  const sendOnce = () => chrome.tabs.sendMessage(tabId, payload);
  try { 
    return await sendOnce(); 
  } catch {
    await inject(tabId);
    await new Promise(r => setTimeout(r, 400));
    return await sendOnce();
  }
}

// ========== GIG SCRAPING FUNCTIONS ==========
async function scrapeAllGigDetails(gigList) {
  const detailed = [];
  if (!Array.isArray(gigList) || gigList.length === 0) return detailed;

  showProgress();
  updateProgress(0, gigList.length);

  if (!currentTabId) {
    console.error('No current tab available for scraping');
    hideProgress();
    return detailed;
  }

  const deepMerge = (target, source) => {
    if (!source) return target;
    for (const key of Object.keys(source)) {
      const sv = source[key];
      const tv = target[key];
      if (sv && typeof sv === 'object' && !Array.isArray(sv)) {
        target[key] = deepMerge(tv || {}, sv);
      } else if (Array.isArray(sv)) {
        target[key] = Array.isArray(tv) ? Array.from(new Set([...tv, ...sv])) : sv;
      } else if (sv !== undefined && sv !== null && String(sv).trim() !== '') {
        target[key] = sv;
      }
    }
    return target;
  };

  const buildStepUrls = (baseUrl) => {
    try {
      const u = new URL(baseUrl);
      const base = `${u.origin}${u.pathname}`;
      return [
        `${base}?step=0&tab=general`,
        `${base}?step=1&tab=pricing`,
        `${base}?step=2&tab=faq_description`,
        `${base}?step=3&tab=requirements`,
        `${base}?step=4&tab=gallery`,
      ];
    } catch { 
      return [baseUrl]; 
    }
  };

  for (let i = 0; i < gigList.length; ++i) {
    const gig = gigList[i];
    updateStatus(`Scraping gig ${i+1}/${gigList.length}: ${gig.title}`, 'loading');
    updateProgress(i, gigList.length);

    try {
      if (!gig.url) {
        detailed.push({ ...gig, error: 'no_url' });
        continue;
      }

      const editBase = gig.editUrl && gig.editUrl.length ? gig.editUrl : gig.url;
      const stepUrls = buildStepUrls(editBase);
      let merged = { title: gig.title, url: editBase };

      console.log('[Popup] Scraping gig:', gig.title);
      console.log('[Popup] Step URLs:', stepUrls);

      for (let s = 0; s < stepUrls.length; s++) {
        const stepUrl = stepUrls[s];
        console.log(`[Popup] Navigating to step ${s}: ${stepUrl}`);
        
        try {
          // Navigate to step
          await chrome.tabs.update(currentTabId, { url: stepUrl });
          await waitForComplete(currentTabId, 30000);
          console.log(`[Popup] Step ${s} page loaded`);
          
          // Extra wait for pricing step
          if (s === 1) {
            console.log('[Popup] Extra wait for pricing data...');
            await new Promise(r => setTimeout(r, 1500));
          } else {
            await new Promise(r => setTimeout(r, 800));
          }
          
          // Inject scripts
          await chrome.scripting.executeScript({ target: { tabId: currentTabId }, files: ['state.js'] });
          await chrome.scripting.executeScript({ target: { tabId: currentTabId }, files: ['gig_scraper.js'] });
          await new Promise(r => setTimeout(r, 600));

          console.log(`[Popup] Requesting SCRAPE_GIG for step ${s}...`);
          
          // Request scraping
          const scraped = await new Promise((res, rej) => {
            try {
              chrome.tabs.sendMessage(currentTabId, { type: 'SCRAPE_GIG' }, (response) => {
                if (chrome.runtime.lastError) {
                  console.error(`[Popup] Step ${s} error:`, chrome.runtime.lastError);
                  return rej(new Error(chrome.runtime.lastError.message));
                }
                if (!response) {
                  console.error(`[Popup] Step ${s} no response`);
                  return rej(new Error('No response from scraper'));
                }
                console.log(`[Popup] Step ${s} response:`, response);
                res(response);
              });
            } catch (e) { 
              console.error(`[Popup] Step ${s} send error:`, e);
              rej(e); 
            }
          });

          if (scraped && scraped.status === 'OK' && scraped.details) {
            console.log(`[Popup] Step ${s} success, merging data...`);
            merged = deepMerge(merged, scraped.details);
          } else {
            console.warn(`[Popup] Step ${s} failed or no data`, scraped);
          }

          await new Promise(r => setTimeout(r, 600));
        } catch (stepError) {
          console.error(`[Popup] Error at step ${s}:`, stepError);
        }
      }

      merged.scraped_at = new Date().toISOString();
      detailed.push(merged);

      console.log('[Popup] ✓ Completed gig:', merged.title);
      await new Promise(r => setTimeout(r, 1200));
    } catch (e) {
      const errorMsg = e.message || e.toString() || 'Unknown error';
      console.error('Navigation or scraping failed for', gig.url, errorMsg);
      detailed.push({ url: gig.url, title: gig.title, error: errorMsg, scraped_at: new Date().toISOString() });
    }
  }

  hideProgress();
  updateProgress(gigList.length, gigList.length);
  console.log(`[Popup] ✓ Completed scraping ${detailed.length} gigs`);
  return detailed;
}

// ========== MAIN FLOW ==========
async function run() {
  try {
    setLoadingState(true, "Opening Fiverr...");
    updateStatus("Connecting to Fiverr...", "loading");
    
    const tabId = await openOrReuseFiverrTab();
    currentTabId = tabId;
    await inject(tabId);

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
      
      try {
        updateStatus('Collecting detailed gig info (this may take a while)...', 'loading');
        setLoadingState(true, 'Scraping gigs...');

        const detailed = await scrapeAllGigDetails(gigs);

        updateStatus('Saving detailed gigs to storage and Supabase...', 'loading');
        const syncResult = await window.AppState.syncGigs(detailed);

        const debugInfo = res.debug ? ` from ${new URL(res.debug.url).pathname}` : '';
        const syncInfo = syncResult.synced ? ' (synced to Supabase)' : ' (local storage only)';
        const successMessage = detailed.length > 0 
          ? `Successfully scraped and stored ${detailed.length} gig${detailed.length === 1 ? '' : 's'}${debugInfo}${syncInfo}`
          : "Scraping completed - no gigs found";

        setLoadingState(false);
        updateStatus(successMessage, detailed.length > 0 ? "success" : "warning");

        const connectionStatus = window.AppState.getConnectionStatus();
        updateSupabaseStatus(connectionStatus);
      } catch (syncError) {
        console.error('Failed to scrape or sync gigs:', syncError);
        setLoadingState(false);
        updateStatus('Scraping completed but failed to save all data. Check console for details.', 'warning');
      }
      
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

    setLoadingState(false);
    
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

// ========== EVENT LISTENERS ==========
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
  
  updateStatus(`Exported ${rows.length} gig${rows.length === 1 ? '' : 's'} to CSV file.`, "success");
  
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
    
    const originalText = copyBtn.textContent;
    copyBtn.textContent = "Copied!";
    copyBtn.style.background = "var(--success)";
    
    setTimeout(() => {
      copyBtn.textContent = originalText;
      copyBtn.style.background = "";
    }, 2000);
  } catch { 
    updateStatus("Failed to copy to clipboard. Please try again.", "error");
  }
});

filterEl.addEventListener("input", applyFilter);

// Supabase config listeners
saveSupabaseBtn.addEventListener('click', saveSupabaseConfig);
clearSupabaseBtn.addEventListener('click', clearSupabaseConfig);
testSupabaseBtn.addEventListener('click', testSupabaseConnection);

// Modal listeners
openLoginBtn.addEventListener("click", openFiverrLogin);

checkLoginBtn.addEventListener("click", async () => {
  await checkLoginStatus();
});

closeModalBtn.addEventListener("click", hideLoginModal);

reloadBtn.addEventListener("click", async () => {
  reloadExtension();
  await continueAfterLogin();
});

// Close modals on outside click
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

// Close modals on Escape
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

// Load config on startup
loadSupabaseConfig();