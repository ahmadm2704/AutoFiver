// state.js - SIMPLIFIED FOR NEW SCHEMA
// Direct table insertion instead of RPC

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

  async function initializeSupabase() {
    try {
      const config = await getSupabaseConfig();
      
      if (!config.url || !config.key) {
        connectionStatus = { connected: false, lastChecked: new Date(), error: 'Missing Supabase configuration' };
        return null;
      }

      supabaseClient = { url: config.url, key: config.key };

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
      
      const response = await fetch(
        `${supabaseClient.url}/rest/v1/gigs?select=count`,
        {
          headers: {
            'apikey': supabaseClient.key,
            'Authorization': `Bearer ${supabaseClient.key}`,
          }
        }
      );
      
      if (!response.ok) throw new Error('Connection failed');
      
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

  async function fetchSupabaseData(method, table, data = null) {
    const config = await getSupabaseConfig();
    
    if (!config.url || !config.key) {
      throw new Error('Supabase configuration missing');
    }

    const url = `${config.url}/rest/v1/${table}`;

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

    const response = await fetch(url, options);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Supabase error: ${response.status} - ${errorText}`);
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
          
          // Extract price from string like "$ 80" -> 80
          const extractPrice = (priceStr) => {
            if (!priceStr) return null;
            const match = priceStr.match(/\d+/);
            return match ? parseFloat(match[0]) : null;
          };

          // 1. Insert/Update main gig - First delete old packages to avoid duplicates
          const gigData = {
            user_id: 'extension_user',
            url: gig.url || '',
            title: gig.title || '',
            edit_url: gig.editUrl || gig.edit_url || '',
            scraped_at: gig.scraped_at || new Date().toISOString(),
            overview_title: gig.overview?.title || gig.title || '',
            overview_description: gig.overview?.description || gig.description || '',
            description_content: gig.description?.content || gig.description || '',
            seller_name: gig.seller?.name || '',
            seller_rating: gig.seller?.rating || '',
            seller_level: gig.seller?.level || '',
            tags: JSON.stringify(Array.isArray(gig.overview?.tags) ? gig.overview.tags : gig.tags || []),
            images: JSON.stringify(Array.isArray(gig.overview?.images) ? gig.overview.images : gig.gallery?.images || []),
            currency: 'USD'
          };

          console.log('[AppState] Upserting gig:', gigData.title);
          
          // Try to update first, then insert if doesn't exist
          try {
            // Try PATCH (update)
            const updateUrl = `${supabaseClient.url}/rest/v1/gigs?user_id=eq.extension_user&url=eq.${encodeURIComponent(gig.url || '')}`;
            const updateResponse = await fetch(updateUrl, {
              method: 'PATCH',
              headers: {
                'apikey': supabaseClient.key,
                'Authorization': `Bearer ${supabaseClient.key}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
              },
              body: JSON.stringify(gigData)
            });
            
            if (updateResponse.ok) {
              console.log('[AppState] Gig updated successfully');
            } else {
              console.log('[AppState] Update failed, trying insert...');
              await fetchSupabaseData('POST', 'gigs', gigData);
              console.log('[AppState] Gig inserted successfully');
            }
          } catch (e) {
            console.log('[AppState] Update attempt failed:', e.message);
            await fetchSupabaseData('POST', 'gigs', gigData);
            console.log('[AppState] Gig inserted successfully');
          }

          // Get the inserted gig's ID by querying it back
          const queryResponse = await fetch(
            `${supabaseClient.url}/rest/v1/gigs?url=eq.${encodeURIComponent(gig.url)}&select=id`,
            {
              headers: {
                'apikey': supabaseClient.key,
                'Authorization': `Bearer ${supabaseClient.key}`,
              }
            }
          );
          const gigs_response = await queryResponse.json();
          const gigId = gigs_response[0]?.id;

          if (!gigId) {
            console.error('[AppState] Could not get gig ID after insertion');
            continue;
          }

          // 2. Delete old packages and details for this gig before inserting new ones
          console.log('[AppState] Deleting old packages for gig:', gigId);
          try {
            await fetch(
              `${supabaseClient.url}/rest/v1/gig_packages?gig_id=eq.${gigId}`,
              {
                method: 'DELETE',
                headers: {
                  'apikey': supabaseClient.key,
                  'Authorization': `Bearer ${supabaseClient.key}`,
                }
              }
            );
            
            await fetch(
              `${supabaseClient.url}/rest/v1/gig_details?gig_id=eq.${gigId}`,
              {
                method: 'DELETE',
                headers: {
                  'apikey': supabaseClient.key,
                  'Authorization': `Bearer ${supabaseClient.key}`,
                }
              }
            );
            console.log('[AppState] Old data deleted');
          } catch (e) {
            console.log('[AppState] Delete attempt error (may not exist):', e.message);
          }

          // 3. Insert packages
          if (Array.isArray(gig.pricing?.packages) && gig.pricing.packages.length > 0) {
            for (const pkg of gig.pricing.packages) {
              const packageData = {
                gig_id: gigId,
                package_name: pkg.name || '',
                package_title: pkg.title || '',
                description: pkg.description || '',
                price: extractPrice(pkg.price),
                total_price: extractPrice(pkg.total_price),
                delivery_time: pkg.delivery_time || '',
                revisions: pkg.revisions || ''
              };

              console.log('[AppState] Inserting package:', packageData.package_name);
              await fetchSupabaseData('POST', 'gig_packages', packageData);

              // Insert features for this package
              if (Array.isArray(pkg.features) && pkg.features.length > 0) {
                // Get the package ID we just inserted
                const pkgQuery = await fetch(
                  `${supabaseClient.url}/rest/v1/gig_packages?gig_id=eq.${gigId}&package_name=eq.${encodeURIComponent(pkg.name)}&order=created_at.desc&limit=1&select=id`,
                  {
                    headers: {
                      'apikey': supabaseClient.key,
                      'Authorization': `Bearer ${supabaseClient.key}`,
                    }
                  }
                );
                const pkgResult = await pkgQuery.json();
                const packageId = pkgResult[0]?.id;

                if (packageId) {
                  for (const feature of pkg.features) {
                    const featureData = {
                      package_id: packageId,
                      feature_name: feature.name || '',
                      feature_value: feature.value || ''
                    };
                    await fetchSupabaseData('POST', 'package_features', featureData);
                  }
                }
              }
            }
          }

          // 3. Insert details
          const detailsData = {
            gig_id: gigId,
            description_full: gig.description?.content || gig.description || '',
            faq: JSON.stringify(Array.isArray(gig.description?.faq) ? gig.description.faq : []),
            requirements: JSON.stringify(Array.isArray(gig.requirements?.list) ? gig.requirements.list : []),
            what_to_provide: JSON.stringify(Array.isArray(gig.requirements?.what_to_provide) ? gig.requirements.what_to_provide : []),
            what_you_get: JSON.stringify(Array.isArray(gig.requirements?.what_you_get) ? gig.requirements.what_you_get : []),
            gallery_images: JSON.stringify(Array.isArray(gig.gallery?.images) ? gig.gallery.images : []),
            gallery_videos: JSON.stringify(Array.isArray(gig.gallery?.videos) ? gig.gallery.videos : [])
          };

          console.log('[AppState] Inserting details for gig:', gigId);
          await fetchSupabaseData('POST', 'gig_details', detailsData);

          successCount++;
          console.log(`[AppState] ✓ Completed gig: ${gig.title}`);
          
          // Polite delay between inserts
          await new Promise(r => setTimeout(r, 300));
        } catch (e) {
          console.error(`[AppState] Failed to save gig: ${e.message}`);
        }
      }

      console.log(`[AppState] ✓ Saved ${successCount}/${gigs.length} gigs`);
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
      await saveGigsToStorage(gigs);
      
      if (connectionStatus.connected) {
        await saveGigsToSupabase(gigs);
      } else {
        console.log('[AppState] Supabase not connected, saving to local storage only');
      }
      
      return { success: true, synced: connectionStatus.connected };
    } catch (error) {
      console.error('[AppState] Failed to sync gigs:', error);
      return { success: true, synced: false, error: error.message };
    }
  }

  async function testSupabaseSetup() {
    console.log('[AppState] Testing Supabase setup...');
    try {
      const connected = await testSupabaseConnection();
      return { 
        success: connected, 
        connection: connectionStatus
      };
    } catch (error) {
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
      initializeSupabase();
    }
  });

  window.AppState = {
    getSupabaseConfig,
    setSupabaseConfig,
    initializeSupabase,
    testSupabaseConnection,
    getConnectionStatus: () => connectionStatus,
    testSupabaseSetup,
    saveGigsToStorage,
    getGigsFromStorage,
    syncGigs,
    onChange: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    getStorage,
    setStorage
  };

  initializeSupabase();

  (async function ensureDefaultConfig(){
    try {
      const cfg = await getSupabaseConfig();
      const needWrite = !cfg || cfg.url !== DEFAULT_SUPABASE_CONFIG.url || cfg.key !== DEFAULT_SUPABASE_CONFIG.key;
      if (needWrite) {
        await setSupabaseConfig(DEFAULT_SUPABASE_CONFIG);
        await initializeSupabase();
        console.log('[AppState] Config updated');
      }
    } catch(e) { 
      console.error('[AppState] Config error', e); 
    }
  })();

})();