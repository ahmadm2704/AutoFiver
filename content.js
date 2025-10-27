// content.js

// Inject state.js to access centralized state management
if (typeof window.AppState === 'undefined') {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('state.js');
  script.onload = function() {
    console.log('[Fiverr Reader] State management loaded');
  };
  (document.head || document.documentElement).appendChild(script);
}
// ---------- utils ----------
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function clean(s){ return (s||"").replace(/\s+/g," ").trim(); }
function waitFor(sel, timeoutMs=20000){
  return new Promise((res,rej)=>{
    const hit=document.querySelector(sel); if(hit) return res(hit);
    const obs=new MutationObserver(()=>{ const el=document.querySelector(sel); if(el){obs.disconnect();res(el);} });
    obs.observe(document.documentElement,{childList:true,subtree:true});
    setTimeout(()=>{obs.disconnect();rej(new Error("Timeout "+sel));},timeoutMs);
  });
}

// ---------- login detection ----------
const GIGS_PATH_RE=/(seller_dashboard\/gigs|\/users\/[^/]+\/manage_gigs)/i;

function isLoggedIn(){
  if (/\/seller_dashboard/i.test(location.pathname)) return true;
  if (document.querySelector('a[href*="/logout"]')) return true;
  if (document.querySelector('a[href*="/seller_dashboard"]')) return true;
  if (document.querySelector('a[href^="/users/"][aria-label]')) return true;
  if (document.querySelector('a[href*="/login"], a[data-testid="sign-in-button"]')) return false;
  return false;
}

async function ensureLogin(){
  if (isLoggedIn()) return { loggedIn:true };
  
  // Show a temporary message overlay on the page
  showLoginMessage();
  
  location.assign("https://www.fiverr.com/login");
  await Promise.race([
    waitFor('form[action*="login"], input[type="email"], input[name="username"]'),
    sleep(10000)
  ]).catch(()=>{});
  return { loggedIn:false, action:"NAVIGATE_LOGIN" };
}

function showLoginMessage() {
  // Check if message already exists
  if (document.getElementById('fiverr-extension-login-message')) return;
  
  const messageDiv = document.createElement('div');
  messageDiv.id = 'fiverr-extension-login-message';
  messageDiv.innerHTML = `
    <div style="
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
      color: white;
      padding: 16px 20px;
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.3);
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.4;
      max-width: 320px;
      border: 1px solid #475569;
      animation: slideInRight 0.3s ease;
    ">
      <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
        <div style="
          width: 24px;
          height: 24px;
          background: #3b82f6;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
        ">F</div>
        <strong style="color: #f1f5f9;">Fiverr Gig Manager Pro</strong>
      </div>
      <p style="margin: 0 0 8px 0; color: #cbd5e1;">
        🔐 Please sign in to your Fiverr account to continue using the extension.
      </p>
      <p style="margin: 0; color: #94a3b8; font-size: 12px;">
        Return to the extension popup after logging in.
      </p>
    </div>
    <style>
      @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    </style>
  `;
  
  document.body.appendChild(messageDiv);
  
  // Auto-remove after 8 seconds
  setTimeout(() => {
    if (document.getElementById('fiverr-extension-login-message')) {
      messageDiv.style.animation = 'slideInRight 0.3s ease reverse';
      setTimeout(() => {
        if (messageDiv.parentNode) {
          messageDiv.parentNode.removeChild(messageDiv);
        }
      }, 300);
    }
  }, 8000);
}

function showSuccessMessage() {
  // Check if message already exists
  if (document.getElementById('fiverr-extension-success-message')) return;
  
  const messageDiv = document.createElement('div');
  messageDiv.id = 'fiverr-extension-success-message';
  messageDiv.innerHTML = `
    <div style="
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #059669 0%, #047857 100%);
      color: white;
      padding: 16px 20px;
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.3);
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.4;
      max-width: 320px;
      border: 1px solid #065f46;
      animation: slideInRight 0.3s ease;
    ">
      <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
        <div style="
          width: 24px;
          height: 24px;
          background: rgba(255,255,255,0.2);
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
        ">✅</div>
        <strong style="color: #f0fdf4;">Login Successful!</strong>
      </div>
      <p style="margin: 0 0 8px 0; color: #dcfce7;">
        Great! You're now logged in to Fiverr.
      </p>
      <p style="margin: 0; color: #bbf7d0; font-size: 12px;">
        Return to the extension popup to continue scanning your gigs.
      </p>
    </div>
    <style>
      @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    </style>
  `;
  
  document.body.appendChild(messageDiv);
  
  // Auto-remove after 6 seconds
  setTimeout(() => {
    if (document.getElementById('fiverr-extension-success-message')) {
      messageDiv.style.animation = 'slideInRight 0.3s ease reverse';
      setTimeout(() => {
        if (messageDiv.parentNode) {
          messageDiv.parentNode.removeChild(messageDiv);
        }
      }, 300);
    }
  }, 6000);
}

// ---------- navigation ----------
async function goToDashboardIfNeeded(){
  if (/seller_dashboard/i.test(location.pathname)) return;
  location.assign("https://www.fiverr.com/seller_dashboard");
  await waitFor("header").catch(()=>{});
}

async function goToGigs(){
  console.log("[Fiverr Reader] Current pathname:", location.pathname);
  if (GIGS_PATH_RE.test(location.pathname)) {
    console.log("[Fiverr Reader] Already on gigs page");
    return;
  }
  
  await goToDashboardIfNeeded();

  console.log("[Fiverr Reader] Looking for navigation to gigs...");

  // Try UI menu first - look for "My Business" or similar
  const openMenu=()=>{ 
    const btn=[...document.querySelectorAll("a,button")]
      .find(n=>/my\s*business/i.test(n.textContent||"")); 
    if(btn) {
      console.log("[Fiverr Reader] Found 'My Business' button, clicking...");
      btn.click(); 
    }
  };
  openMenu(); 
  await sleep(250);

  // Look for gigs link with multiple strategies
  let link=[...document.querySelectorAll('a[href]')].find(a=>{
    const href=a.getAttribute("href")||"";
    const text=a.textContent||"";
    return /gigs/i.test(text) || /\/manage_gigs|seller_dashboard\/gigs/i.test(href);
  });

  if (link) {
    console.log("[Fiverr Reader] Found gigs link:", link.href);
    link.click();
  }
  else {
    console.log("[Fiverr Reader] No gigs link found, trying direct navigation...");
    
    // Try common gigs URLs
    const gigUrls = [
      "https://www.fiverr.com/seller_dashboard/gigs",
      "https://www.fiverr.com/users/manage_gigs"
    ];
    
    // Build direct user path
    const prof=[...document.querySelectorAll('a[href*="/users/"]')]
      .map(a=>a.getAttribute("href")||"").find(h=>/\/users\/[^/]+\/?$/.test(h));
    const m=prof?prof.match(/\/users\/([^/]+)/i):null;
    const user=m?m[1]:null;
    
    const targetUrl = user ? `https://www.fiverr.com/users/${user}/manage_gigs` : gigUrls[0];
    console.log("[Fiverr Reader] Navigating directly to:", targetUrl);
    location.assign(targetUrl);
  }

  console.log("[Fiverr Reader] Waiting for gigs page to load...");
  await Promise.race([
    waitFor("table, .db-new-main-table, tbody tr, [data-testid='gig-row']"), // container appears
    sleep(15000)
  ]).catch(()=>{
    console.log("[Fiverr Reader] Timeout waiting for gigs table");
  });
}

// ---------- scraping ----------
function queryGigRows(){
  // Cover current and fallback DOMs - updated selectors for current Fiverr interface
  const sel = [
    // Current Fiverr table structure
    "table tbody tr",
    ".db-new-main-table table tbody tr",
    "table.db-table tbody tr", 
    // Alternative selectors for different layouts
    "tr[data-id]",
    "tr[data-slug]",
    "[data-testid='gig-row']",
    ".gig-row",
    // More generic row selectors
    "[role='row']",
    "tbody > tr",
    ".table-row"
  ].join(",");
  console.log("[Fiverr Reader] Looking for gig rows with selector:", sel);
  const rows = document.querySelectorAll(sel);
  console.log("[Fiverr Reader] Found", rows.length, "potential gig rows");
  return rows;
}

function collectGigDataOnce(){
  const rows=queryGigRows();
  const ACTION=/^(preview|edit|share|add\s+video|live\s+portfolio|edit\s+video|actions?|manage)$/i;
  const seen=new Set(), gigs=[];
  
  console.log("[Fiverr Reader] Processing", rows.length, "rows for gig data");
  
  // Get the active tab content area to filter rows
  const activeTabContent = findActiveTabContent();
  
  rows.forEach((tr, index)=>{
    // Skip rows that are not in the active tab content
    if (activeTabContent && !activeTabContent.contains(tr)) {
      console.log(`[Fiverr Reader] Skipping row ${index + 1}: not in active tab content`);
      return;
    }
    
    let title="", url="";
    
    console.log(`[Fiverr Reader] Processing row ${index + 1}:`, tr);
    
    // Strategy 0: Look for data-slug attribute first (most reliable)
    const dataSlug = tr.getAttribute('data-slug');
    if (dataSlug) {
      title = dataSlug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      // Look for edit link in the same row
      const editLink = tr.querySelector('a[href*="/manage_gigs"], a[href*="/seller_dashboard/gigs"], a[href*="/users/"]');
      url = editLink ? editLink.href : '';
      console.log(`[Fiverr Reader] Strategy 0 (data-slug) found:`, {title, url});
    }
    
    // Strategy 1: Look in title cell (typical table layout)
    if (!title) {
      const titleCell = tr.querySelector('.title, [class*="title"], td:nth-child(2), td:nth-child(3)');
      if (titleCell) {
        const a = titleCell.querySelector('a[href]');
        title = clean(a ? a.textContent : titleCell.textContent);
        url = a ? a.href : '';
        console.log(`[Fiverr Reader] Strategy 1 (title cell) found:`, {title, url});
      }
    }
    
    // Strategy 2: Look for specific gig title elements
    if (!title){
      const titleSelectors = [
        '[data-testid="gig-title"]',
        '[data-test="gig-title"]', 
        '.gig-title',
        'a[href*="/gig/"]',
        'h3 a[href*="/gig/"]',
        'a[href*="/gig/"] h3',
        '.gig-name',
        '[data-qa="gig-title"]'
      ];
      
      for (const selector of titleSelectors) {
        const t=tr.querySelector(selector);
        if (t){ 
          title=clean(t.textContent); 
          const a=t.closest("a[href]") || t.querySelector("a[href]");
          url=a?a.href:""; 
          console.log(`[Fiverr Reader] Strategy 2 (${selector}) found:`, {title, url});
          break;
        }
      }
    }
    
    // Strategy 3: Look for any link with gig-like href in the row
    if (!title){
      const gigLinks = tr.querySelectorAll('a[href*="/gig/"], a[href*="gigs"]');
      if (gigLinks.length > 0) {
        const link = gigLinks[0];
        title = clean(link.textContent);
        url = link.href;
        console.log(`[Fiverr Reader] Strategy 3 (gig links) found:`, {title, url});
      }
    }
    
    // Strategy 4: Look in first column that contains substantial text
    if (!title){
      const cells = tr.querySelectorAll("td");
      for (const cell of cells) {
        const text = clean(cell.textContent);
        if (text && text.length > 10 && !ACTION.test(text)) {
          const a = cell.querySelector("a[href]");
          title = text;
          url = a ? a.href : "";
          console.log(`[Fiverr Reader] Strategy 4 (substantial text) found:`, {title, url});
          break;
        }
      }
    }
    
    console.log(`[Fiverr Reader] Final result for row ${index + 1}:`, {title, url});
    
    // Skip if no title found, or if it matches action patterns
    if (!title || ACTION.test(title)) {
      console.log(`[Fiverr Reader] Skipping row ${index + 1}: no title or action pattern`);
      return;
    }
    
    // Additional filtering: Skip common non-gig text patterns
    const skipPatterns = /^(impressions|clicks|views|orders|revenue|earnings|status|active|pending|draft|denied|paused|accepting|custom|orders|modification|delete|activate|pause|window\.initialdata)$/i;
    if (skipPatterns.test(title)) {
      console.log(`[Fiverr Reader] Skipping row ${index + 1}: matches skip pattern:`, title);
      return;
    }
    
    // Skip if title is too short or contains JavaScript code
    if (title.length < 5 || title.includes('window.initialData') || title.includes('{') || title.includes('}')) {
      console.log(`[Fiverr Reader] Skipping row ${index + 1}: title too short or contains code:`, title);
      return;
    }
    
    // Skip if title looks like UI elements (buttons, labels, etc.)
    const uiPatterns = /^(active|pending|approval|requires|modification|draft|denied|paused|accepting|custom|orders|pause|activate|delete|impressions|clicks|views|orders|revenue|earnings|status)$/i;
    if (uiPatterns.test(title)) {
      console.log(`[Fiverr Reader] Skipping row ${index + 1}: looks like UI element:`, title);
      return;
    }
    // Deduplicate based on title
    const key=title.toLowerCase(); 
    if (seen.has(key)) {
      console.log(`[Fiverr Reader] Skipping duplicate title:`, title);
      return; 
    }
    seen.add(key);
    
    // Try to find an 'Edit' link for the gig row (manage/edit page)
    let editUrl = "";
    try {
      const editLinkCandidates = [...tr.querySelectorAll('a[href]')].filter(a => {
        const h = (a.getAttribute('href')||'').toLowerCase();
        const t = (a.textContent||'').toLowerCase();
        return /edit|manage|edit-gig|update/.test(h) || /edit|manage/.test(t);
      });
      if (editLinkCandidates.length) {
        editUrl = editLinkCandidates[0].href || '';
      } else {
        // fallback: look for any link containing '/manage_gigs' or '/users/' (manage path)
        const fallback = tr.querySelector('a[href*="/manage_gigs"], a[href*="/seller_dashboard/gigs"], a[href*="/users/"]');
        if (fallback) editUrl = fallback.href || '';
      }
    } catch(e){ editUrl = ''; }

    gigs.push({title,url, editUrl});
    console.log(`[Fiverr Reader] Added gig:`, {title, url});
  });
  
  console.log(`[Fiverr Reader] Total gigs collected from active tab:`, gigs.length);
  return gigs;
}

async function nudgeRender(){
  // Some lists lazy-render rows; a small scroll makes them appear.
  const scroller =
    document.querySelector(".db-new-main-table") ||
    document.querySelector("[data-testid='gig-list']") ||
    document.scrollingElement || document.documentElement;

  const startTop = scroller.scrollTop;
  scroller.scrollTop = startTop + 200;
  await sleep(100);
  scroller.scrollTop = startTop;
}

async function collectGigDataRobust(maxWaitMs=12000){
  const start=Date.now();
  let gigs=[];
  while (Date.now()-start < maxWaitMs){
    gigs = collectGigDataOnce();
    if (gigs.length > 0) break;
    
    // Try alternative scraping if table-based approach fails
    if (Date.now()-start > maxWaitMs/2) {
      console.log("[Fiverr Reader] Table approach not working, trying alternative scraping...");
      gigs = collectGigDataAlternative();
      if (gigs.length > 0) break;
    }
    
    await nudgeRender();
    await sleep(300);
  }
  return gigs;
}

// Alternative scraping method for non-table layouts - ONLY from active tab content
function collectGigDataAlternative(){
  console.log("[Fiverr Reader] Trying alternative gig collection...");
  const seen=new Set(), gigs=[];
  
  // First, try to find the active tab content area
  const activeTabContent = findActiveTabContent();
  console.log("[Fiverr Reader] Active tab content area:", activeTabContent);
  
  // Look for gig links only in the active tab content
  const searchArea = activeTabContent || document;
  const gigLinks = searchArea.querySelectorAll('a[href*="/gig/"]');
  console.log("[Fiverr Reader] Found", gigLinks.length, "gig links in active tab");
  
  gigLinks.forEach((link, index) => {
    const title = clean(link.textContent);
    const url = link.href;
    
    console.log(`[Fiverr Reader] Alternative method gig ${index + 1}:`, {title, url});
    
    if (!title || title.length < 10) return; // Skip short/empty titles
    
    const key = title.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    
    gigs.push({title, url});
  });
  
  // Only if no gigs found in active tab, look for text patterns in active tab only
  if (gigs.length === 0 && activeTabContent) {
    console.log("[Fiverr Reader] No gig links found in active tab, looking for text patterns...");
    const allText = activeTabContent.querySelectorAll('*');
    allText.forEach(el => {
      const text = clean(el.textContent);
      // Look for substantial text that might be gig titles
      if (text && text.length > 15 && text.length < 200 && !text.includes('\n')) {
        const key = text.toLowerCase();
        if (!seen.has(key) && !/(gig|edit|preview|share|manage|dashboard|fiverr|impressions|clicks)/i.test(text)) {
          seen.add(key);
          gigs.push({title: text, url: ""});
        }
      }
    });
  }
  
  console.log(`[Fiverr Reader] Alternative method found ${gigs.length} gigs from active tab`);
  return gigs;
}

// Helper function to find the active tab content area
function findActiveTabContent() {
  // Look for active tab indicators
  const activeTabSelectors = [
    '[role="tabpanel"][aria-hidden="false"]',
    '.tab-panel.active',
    '.tab-content.active',
    '[data-testid="active-tab"]',
    '.active-tab-content'
  ];
  
  for (const selector of activeTabSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      console.log("[Fiverr Reader] Found active tab content with selector:", selector);
      return element;
    }
  }
  
  // Look for tab content that's currently visible (not hidden)
  const tabPanels = document.querySelectorAll('[role="tabpanel"], .tab-panel, .tab-content');
  for (const panel of tabPanels) {
    const style = window.getComputedStyle(panel);
    if (style.display !== 'none' && style.visibility !== 'hidden' && !panel.hasAttribute('aria-hidden')) {
      console.log("[Fiverr Reader] Found visible tab panel");
      return panel;
    }
  }
  
  // If no specific tab content found, look for the main content area
  const mainContentSelectors = [
    'main',
    '.main-content',
    '.content-area',
    '[data-testid="gig-list"]',
    '.gig-list',
    'table tbody'
  ];
  
  for (const selector of mainContentSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      console.log("[Fiverr Reader] Using main content area:", selector);
      return element;
    }
  }
  
  console.log("[Fiverr Reader] No specific active tab content found, using document");
  return null; // Will use document as fallback
}

// ---------- Supabase integration ----------
async function syncGigsToSupabase(gigs) {
  try {
    // Wait for AppState to be available
    let attempts = 0;
    while (typeof window.AppState === 'undefined' && attempts < 10) {
      await sleep(100);
      attempts++;
    }
    
    if (typeof window.AppState === 'undefined') {
      console.log('[Fiverr Reader] AppState not available for Supabase sync');
      return { success: false, error: 'State management not available' };
    }
    
    const syncResult = await window.AppState.syncGigs(gigs);
    console.log('[Fiverr Reader] Supabase sync result:', syncResult);
    return syncResult;
  } catch (error) {
    console.error('[Fiverr Reader] Failed to sync gigs to Supabase:', error);
    return { success: false, error: error.message };
  }
}
// ---------- message handlers ----------
chrome.runtime.onMessage.addListener((msg,_sender,sendResponse)=>{
  if (msg.type==="ENSURE_LOGIN"){
    (async()=>{ try{ sendResponse(await ensureLogin()); }catch(e){ sendResponse({loggedIn:false,error:String(e)}); } })();
    return true;
  }

  if (msg.type==="CHECK_LOGIN"){
    try { 
      const loggedIn = isLoggedIn();
      if (loggedIn) {
        // Show success message when login is confirmed
        showSuccessMessage();
      }
      sendResponse({loggedIn, url:location.href}); 
    } catch { 
      sendResponse({loggedIn:false}); 
    }
    return true;
  }

  if (msg.type==="NAV_TO_GIGS_AND_SCRAPE"){
    (async()=>{
      try{
        console.log("[Fiverr Reader] Starting NAV_TO_GIGS_AND_SCRAPE...");
        if (!isLoggedIn()){ 
          console.log("[Fiverr Reader] User not logged in");
          showLoginMessage();
          const r=await ensureLogin(); 
          sendResponse({status:"LOGIN_REQUIRED", message:"Please sign in to your Fiverr account to continue", ...r}); 
          return; 
        }
        
        console.log("[Fiverr Reader] User is logged in, navigating to gigs...");
        await goToGigs();

        // Wait for any table skeleton, then robustly collect with retries + scroll
        console.log("[Fiverr Reader] Waiting for gigs table to appear...");
        await Promise.race([
          waitFor("table, .db-new-main-table, tr[data-id], tr[data-slug], tbody tr"),
          sleep(8000)
        ]).catch(()=>{
          console.log("[Fiverr Reader] Timeout waiting for gigs table");
        });

        console.log("[Fiverr Reader] Starting robust gig data collection...");
        const gigs = await collectGigDataRobust(15000); // keep trying up to 15s
        
        console.log("[Fiverr Reader] Collection complete. Found", gigs.length, "gigs");
        
        // Try to sync with Supabase if gigs were found
        let syncResult = null;
        if (gigs.length > 0) {
          console.log("[Fiverr Reader] Attempting to sync gigs to Supabase...");
          syncResult = await syncGigsToSupabase(gigs);
        }
        
        sendResponse({status:"OK", gigs, syncResult, debug: {
          url: location.href,
          gigCount: gigs.length,
          timestamp: new Date().toISOString(),
          supabaseSync: syncResult
        }});
      }catch(e){
        console.error("[Fiverr Reader] scrape error:", e);
        sendResponse({status:"ERR", gigs:[], error: e.message, debug: {
          url: location.href,
          error: e.toString(),
          timestamp: new Date().toISOString()
        }});
      }
    })();
    return true;
  }
});
