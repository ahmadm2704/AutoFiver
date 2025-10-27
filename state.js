// state.js - FIXED VERSION
// Properly formats gig data for Supabase storage

(function(){
  const STORAGE_KEY = 'supabase_config';
  const GIGS_STORAGE_KEY = 'scraped_gigs';
  
  const DEFAULT_SUPABASE_CONFIG = {
    url: 'https://ufstufxizwnbzypmdzhp.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmc3R1ZnhpenduYnp5cG1kemhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk3NTE2NDYsImV4cCI6MjA3NTMyNzY0Nn0.yb0Cd_W9qnuib7muldWHUdSZWpJEx_CV8AaPJIN1dr8'
  };
  
  let supabaseClient = null;
  let connectionStatus = { connected: false, lastChecked: null, error: null };

  function getStorage(key){
    return new Promise((res)=> chrome.storage.local.get(key, (r)=> res(r)));
  }

  function setStorage(data){
    return new Promise((res)=> chrome.storage.local.set(data, ()=> res()));
  }

  async function getSupabaseConfig(){
    const data = await getStorage(STORAGE_KEY);
    return data[STORAGE_KEY] || { url: '', key: '' };
  }

  function setSupabaseConfig(cfg){
    return new Promise((res)=> chrome.storage.local.set({[STORAGE_KEY]: cfg}, ()=> res()));
  }

  // Properly flatten nested gig data for database storage
  function flattenGigData(gig) {
    try {
      const flattened = {
        url: gig.url || '',
        title: gig.title || '',
        edit_url: gig.editUrl || gig.edit_url || '',
        scraped_at: gig.scraped_at || new Date().toISOString(),
        user_id: 'extension_user',
        
        // Overview data
        overview_title: gig.overview?.title || gig.title || '',
        overview_description: gig.overview?.description || gig.description || '',
        seller_name: gig.seller?.name || '',
        seller_rating: gig.seller?.rating || '',
        seller_level: gig.seller?.level || '',
        delivery_time: gig.delivery_time || '',
        
        // Tags as properly formatted JSON array
        tags: JSON.stringify(
          Array.isArray(gig.overview?.tags) ? gig.overview.tags : 
          Array.isArray(gig.tags) ? gig.tags : 
          []
        ),
        
        // Images as properly formatted JSON array
        images: JSON.stringify(
          Array.isArray(gig.overview?.images) ? gig.overview.images :
          Array.isArray(gig.gallery?.images) ? gig.gallery.images :
          Array.isArray(gig.images) ? gig.images :
          []
        ),
        
        // Pricing packages as properly formatted JSON array
        packages: JSON.stringify(
          Array.isArray(gig.pricing?.packages) ? 
            gig.pricing.packages.map(p => ({
              name: p.name || '',
              price: p.price || '',
              desc: p.desc || ''
            })) :
          Array.isArray(gig.packages) ? gig.packages :
          []
        ),
        
        // Description content
        description_content: 
          gig.description?.content || 
          gig.description?.description ||
          gig.overview?.description ||
          gig.description ||
          '',
        
        // FAQ as properly formatted JSON array
        faq: JSON.stringify(
          Array.isArray(gig.description?.faq) ?
            gig.description.faq.map(item => ({
              question: item.question || '',
              answer: item.answer || ''
            })) :
          []
        ),
        
        // Requirements as properly formatted JSON array
        requirements: JSON.stringify(
          Array.isArray(gig.requirements?.list) ? gig.requirements.list :
          Array.isArray(gig.requirements?.requirements) ? gig.requirements.requirements :
          []
        ),
        
        // What to provide and get as JSON arrays
        what_to_provide: JSON.stringify(
          Array.isArray(gig.requirements?.what_to_provide) ? gig.requirements.what_to_provide : []
        ),
        
        what_you_get: JSON.stringify(
          Array.isArray(gig.requirements?.what_you_get) ? gig.requirements.what_you_get : []
        ),
        
        // Gallery videos
        gallery_videos: JSON.stringify(
          Array.isArray(gig.gallery?.videos) ? gig.gallery.videos : []
        ),
        
        // Error field
        error: gig.error || null
      };
      
      console.log('[AppState] Flattened gig data:', flattened);
      return flattened;
    } catch (e) {
      console.error('[AppState] Error flattening gig data:', e, gig);
      return null;
    }
  }

  async function initializeSupabase() {
    try {
      const config = await getSupabaseConfig();
      
      if (!config.url || !config.key) {
        connectionStatus = { connected: false, lastChecked: new Date(), error: 'Missing Supabase configuration' };
        return null;
      }

      if (typeof window !== 'undefined' && window.supabase) {
        supabaseClient = window.supabase.createClient(config.url, config.key);
      } else {
        supabaseClient = {
          url: config.url,
          key: config.key,
          from: (table) => ({
            select: (columns = '*') => ({
              async execute() {
                return await fetchSupabaseData('GET', table, null, columns);
              }
            }),
            insert: (data) => ({
              async execute() {
                return await fetchSupabaseData('POST', table, data);
              }
            }),
            update: (data) => ({
              eq: (column, value) => ({
                async execute() {
                  return await fetchSupabaseData('PATCH', table, data, null, { [column]: value });
                }
              })
            }),
            delete: () => ({
              eq: (column, value) => ({
                async execute() {
                  return await fetchSupabaseData('DELETE', table, null, null, { [column]: value });
                }
              })
            })
          })
        };
      }

      await testSupabaseConnection();
      return supabaseClient;
    } catch (error) {
      console.error('Failed to initialize Supabase:', error);
      connectionStatus = { connected: false, lastChecked: new Date(), error: error.message };
      return null;
    }
  }

  async function testSupabaseConnection() {
    try {
      if (!supabaseClient) {
        throw new Error('Supabase client not initialized');
      }

      console.log('[AppState] Testing Supabase connection...');
      
      const response = await fetchSupabaseData('GET', 'gigs', null, 'count');
      
      console.log('[AppState] Supabase connection test successful');
      
      connectionStatus = { 
        connected: true, 
        lastChecked: new Date(), 
        error: null 
      };
      
      return true;
    } catch (error) {
      console.error('[AppState] Supabase connection test failed:', error);
      connectionStatus = { 
        connected: false, 
        lastChecked: new Date(), 
        error: error.message 
      };
      return false;
    }
  }

  async function fetchSupabaseData(method, table, data = null, columns = '*', filters = {}) {
    const config = await getSupabaseConfig();
    
    if (!config.url || !config.key) {
      throw new Error('Supabase configuration missing');
    }

    const url = new URL(`${config.url}/rest/v1/${table}`);
    
    if (method === 'GET' && columns !== '*') {
      url.searchParams.set('select', columns);
    }

    Object.entries(filters).forEach(([key, value]) => {
      url.searchParams.set(key, `eq.${value}`);
    });

    const options = {
      method,
      headers: {
        'apikey': config.key,
        'Authorization': `Bearer ${config.key}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      }
    };

    if (data && (method === 'POST' || method === 'PATCH')) {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(url.toString(), options);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Supabase API error: ${response.status} - ${errorText}`);
    }

    if (method === 'GET') {
      return await response.json();
    }
    
    return { success: true };
  }

  async function saveGigsToSupabase(gigs) {
    console.log('[AppState] Saving', gigs.length, 'gigs to Supabase');
    
    if (!supabaseClient) {
      console.log('[AppState] Initializing Supabase...');
      await initializeSupabase();
    }

    if (!connectionStatus.connected) {
      console.error('[AppState] Supabase not connected');
      throw new Error('Supabase not connected');
    }

    try {
      let successCount = 0;
      
      for (const gig of gigs) {
        try {
          console.log(`[AppState] Processing gig: ${gig.title || gig.url}`);
          
          // Flatten the gig data properly
          const gigData = flattenGigData(gig);
          
          if (!gigData) {
            console.error('[AppState] Failed to flatten gig data:', gig);
            continue;
          }

          // Delete existing record if any
          try {
            await fetchSupabaseData('DELETE', 'gigs', null, '*', { 
              user_id: gigData.user_id, 
              url: gigData.url 
            });
          } catch (deleteError) {
            console.log('[AppState] Delete attempt (may not exist):', deleteError.message);
          }
          
          // Insert the flattened data
          console.log('[AppState] Inserting gig:', gigData.title);
          const insertResult = await fetchSupabaseData('POST', 'gigs', gigData);
          
          console.log('[AppState] Successfully inserted gig');
          successCount++;
          
          // Polite delay between inserts
          await new Promise(r => setTimeout(r, 300));
        } catch (e) {
          console.error('[AppState] Failed to save gig:', e, gig);
        }
      }

      console.log(`[AppState] Successfully saved ${successCount}/${gigs.length} gigs`);
      return { success: true, count: successCount };
    } catch (error) {
      console.error('[AppState] Failed to save gigs:', error);
      throw error;
    }
  }

  async function saveGigsToStorage(gigs) {
    await setStorage({ [GIGS_STORAGE_KEY]: gigs });
    return gigs;
  }

  async function getGigsFromStorage() {
    const data = await getStorage(GIGS_STORAGE_KEY);
    return data[GIGS_STORAGE_KEY] || [];
  }

  async function syncGigs(gigs) {
    try {
      // Save to local storage first
      await saveGigsToStorage(gigs);
      
      // Try to save to Supabase
      if (connectionStatus.connected) {
        await saveGigsToSupabase(gigs);
      }
      
      return { success: true, synced: connectionStatus.connected };
    } catch (error) {
      console.error('[AppState] Failed to sync gigs:', error);
      return { success: true, synced: false, error: error.message };
    }
  }

  async function testSupabaseSetup() {
    console.log('[AppState] Testing complete Supabase setup...');
    
    try {
      const connected = await testSupabaseConnection();
      if (!connected) {
        return { success: false, error: 'Connection failed', details: connectionStatus };
      }

      const testGig = {
        url: 'https://test.com/gig1',
        title: 'Test Gig',
        user_id: 'extension_user',
        scraped_at: new Date().toISOString(),
        overview_title: 'Test Overview',
        seller_name: 'Test Seller',
        tags: JSON.stringify(['test', 'sample']),
        packages: JSON.stringify([{ name: 'Test', price: '$10', desc: 'Test package' }])
      };

      console.log('[AppState] Testing with sample data...');
      
      try {
        await fetchSupabaseData('DELETE', 'gigs', null, '*', { 
          user_id: 'extension_user', 
          url: 'https://test.com/gig1' 
        });
      } catch (deleteError) {
        console.log('[AppState] Delete test record (may not exist)');
      }
      
      const insertResult = await fetchSupabaseData('POST', 'gigs', testGig);
      console.log('[AppState] Insert test result:', insertResult);

      return { 
        success: true, 
        connection: connectionStatus,
        insertTest: insertResult
      };

    } catch (error) {
      console.error('[AppState] Setup test failed:', error);
      return { 
        success: false, 
        error: error.message,
        connection: connectionStatus
      };
    }
  }

  const listeners = new Set();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (changes[STORAGE_KEY]) {
      const newVal = changes[STORAGE_KEY].newValue || { url: '', key: '' };
      listeners.forEach(cb => {
        try { cb(newVal); } catch(e) { console.error('AppState listener error', e); }
      });
      initializeSupabase();
    }
  });

  // Expose API on window
  window.AppState = {
    getSupabaseConfig,
    setSupabaseConfig,
    initializeSupabase,
    testSupabaseConnection,
    getConnectionStatus: () => connectionStatus,
    testSupabaseSetup,
    saveGigsToStorage,
    getGigsFromStorage,
    saveGigsToSupabase,
    syncGigs,
    onChange: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    getStorage,
    setStorage
  };

  // Auto-initialize
  initializeSupabase();

  // Ensure defaults
  (async function ensureDefaultConfig(){
    try {
      const cfg = await getSupabaseConfig();
      const needWrite = !cfg || cfg.url !== DEFAULT_SUPABASE_CONFIG.url || cfg.key !== DEFAULT_SUPABASE_CONFIG.key;
      if (needWrite) {
        await setSupabaseConfig(DEFAULT_SUPABASE_CONFIG);
        await initializeSupabase();
        console.log('[AppState] Config updated with defaults');
      }
    } catch(e) { 
      console.error('[AppState] Config error', e); 
    }
  })();

})();