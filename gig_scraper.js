// gig_scraper.js - FIXED VERSION
// Properly extracts and structures gig data from Fiverr edit pages

(function(){
  function clean(s){ return (s||'').replace(/\s+/g,' ').trim(); }

  function getText(sel){ 
    const el = document.querySelector(sel); 
    return el ? clean(el.textContent) : ''; 
  }

  function getInputValue(sel){
    const el = document.querySelector(sel);
    if (!el) return '';
    const v = (el.value !== undefined ? el.value : el.getAttribute('value')) || '';
    return clean(v);
  }

  function getImages(sel){ 
    return [...document.querySelectorAll(sel)]
      .map(n => n.src || n.getAttribute('src'))
      .filter(Boolean)
      .filter(url => url && !url.includes('data:') && url.length > 10); 
  }

  // Extract pricing packages with all details from table
  function extractPricing(){
    try {
      const packages = [];
      
      console.log('[gig_scraper] Starting pricing extraction...');
      
      // Strategy 1: Extract from table structure (most common on pricing page)
      const table = document.querySelector('table');
      if (table) {
        console.log('[gig_scraper] Found pricing table');
        
        // Get all header cells to identify package names
        const headerRow = table.querySelector('thead tr:last-child') || table.querySelector('thead tr');
        if (!headerRow) {
          console.log('[gig_scraper] No header row found');
          return [];
        }
        
        const headers = headerRow.querySelectorAll('th, td');
        const packageNames = [];
        
        // Find headers that are package names (skip first column which is labels)
        headers.forEach((header, idx) => {
          const name = clean(header.textContent);
          // Skip if it's the label column (first) or empty
          if (idx > 0 && name && name.length > 0 && !name.match(/\$|price|description|label/i)) {
            packageNames.push({ name, colIdx: idx });
          }
        });
        
        console.log('[gig_scraper] Package names found:', packageNames.map(p => p.name));
        
        if (packageNames.length === 0) {
          console.log('[gig_scraper] No packages found in headers, trying alternative detection...');
          // Look for columns with data
          const firstRow = table.querySelector('tbody tr');
          if (firstRow) {
            const cells = firstRow.querySelectorAll('td');
            for (let i = 1; i < cells.length; i++) {
              const headerCell = headers[i];
              if (headerCell) {
                const name = clean(headerCell.textContent);
                if (name && name.length > 0) {
                  packageNames.push({ name, colIdx: i });
                }
              }
            }
          }
        }
        
        // Extract data for each package column
        packageNames.forEach(({ name, colIdx }) => {
          const pkg = {
            name: name,
            title: '',
            description: '',
            price: '',
            delivery_time: '',
            revisions: '',
            features: []
          };
          
          // Get all body rows
          const bodyRows = table.querySelectorAll('tbody tr');
          console.log('[gig_scraper] Processing', bodyRows.length, 'rows for package:', name);
          
          bodyRows.forEach((row, rowIdx) => {
            const cells = row.querySelectorAll('td');
            const labelCell = cells[0];
            const dataCell = cells[colIdx];
            
            if (!dataCell) return;
            
            const label = clean(labelCell?.textContent || '');
            const value = clean(dataCell.textContent || '');
            
            console.log(`[gig_scraper] Row ${rowIdx}: Label="${label}", Value="${value}"`);
            
            // Skip empty values
            if (!value || value === '' || value === '✓' || value === '✕') {
              return;
            }
            
            // Match row labels to package properties
            const labelLower = label.toLowerCase();
            
            if (labelLower.includes('title') || labelLower.includes('name')) {
              pkg.title = value;
            } else if (labelLower.includes('description') || labelLower.includes('desc')) {
              pkg.description = value;
            } else if (labelLower.includes('price') || value.match(/^\$|€|₹|\d+/)) {
              pkg.price = value;
            } else if (labelLower.includes('delivery') || labelLower.includes('days')) {
              pkg.delivery_time = value;
            } else if (labelLower.includes('revision')) {
              pkg.revisions = value;
            } else {
              // Everything else is a feature/attribute
              pkg.features.push({
                name: label || `Attribute ${pkg.features.length + 1}`,
                value: value
              });
            }
          });
          
          // Only add package if it has at least name
          if (pkg.name) {
            packages.push(pkg);
            console.log('[gig_scraper] ✓ Extracted package:', pkg);
          }
        });
      }
      
      // Strategy 2: If table extraction didn't work, try looking for input fields directly
      if (packages.length === 0) {
        console.log('[gig_scraper] Table extraction failed, trying input fields...');
        
        // Look for package input groups
        const packageContainers = document.querySelectorAll('[data-testid*="package"], [class*="package-row"], .row');
        
        packageContainers.forEach((container, idx) => {
          const nameInput = container.querySelector('input[name*="name"], input[placeholder*="name"]');
          const priceInput = container.querySelector('input[name*="price"], input[placeholder*="price"]');
          const descInput = container.querySelector('textarea[name*="desc"], textarea[placeholder*="description"]');
          
          const name = nameInput?.value || clean(container.querySelector('h3, h2')?.textContent || '');
          const price = priceInput?.value || clean(container.querySelector('[class*="price"]')?.textContent || '');
          const desc = descInput?.value || '';
          
          if (name || price) {
            packages.push({
              name: name || `Package ${idx + 1}`,
              price: price,
              description: desc,
              features: []
            });
            console.log('[gig_scraper] Extracted from inputs:', name);
          }
        });
      }
      
      console.log('[gig_scraper] ✓ Total packages extracted:', packages.length);
      return packages;
    } catch(e) { 
      console.error('[gig_scraper] extractPricing error:', e); 
      return [];
    }
  }

  // Extract tags/skills
  function extractTags(){
    const tags = [];
    
    // From input fields in edit form
    const tagInputs = document.querySelectorAll(
      'input[name*="tag"], input[name*="skill"], [data-testid*="tag"] input'
    );
    tagInputs.forEach(input => {
      const val = input.value || input.getAttribute('value');
      if (val && val.length > 0) tags.push(val);
    });
    
    // From displayed tags on view page
    if (tags.length === 0) {
      const tagElements = document.querySelectorAll(
        '.tag, .skill, [class*="tag"], [class*="skill"]'
      );
      tagElements.forEach(el => {
        const tag = clean(el.textContent);
        if (tag && tag.length > 0) tags.push(tag);
      });
    }
    
    return [...new Set(tags)]; // deduplicate
  }

  // Extract detailed description with structure
  function extractDescription(){
    let description = '';
    
    // Strategy 1: Look for ALL Quill editors and find the one with real content
    const allEditors = document.querySelectorAll('div.ql-editor');
    console.log('[gig_scraper] Found', allEditors.length, 'Quill editors');
    
    for (let i = 0; i < allEditors.length; i++) {
      const editor = allEditors[i];
      const text = clean(editor.textContent);
      console.log('[giq_scraper] Editor', i, 'text length:', text.length, 'preview:', text.substring(0, 60));
      
      // Check if this editor has real content (not placeholder, not empty, substantial length)
      if (text && 
          text.length > 100 && 
          !text.includes('Please choose') && 
          !text.includes('Briefly Describe') &&
          !text.includes('shorter than') &&
          text.includes(' ')) {
        description = text;
        console.log('[gig_scraper] ✓ Found REAL description in Quill editor', i);
        break;
      }
    }
    
    // Strategy 2: Look for contenteditable divs (if Quill editor not found)
    if (!description) {
      const editableDivs = document.querySelectorAll('div[contenteditable="true"]');
      for (const div of editableDivs) {
        const text = clean(div.textContent);
        if (text && text.length > 100 && !text.includes('Please choose')) {
          description = text;
          console.log('[gig_scraper] Found description in contenteditable div');
          break;
        }
      }
    }
    
    // Strategy 3: Check for any stored value in hidden inputs
    if (!description) {
      const hiddenInput = document.querySelector('input[type="hidden"][name="description"]');
      if (hiddenInput && hiddenInput.value && hiddenInput.value.length > 100) {
        description = clean(hiddenInput.value);
        console.log('[gig_scraper] Found description in hidden input');
      }
    }
    
    console.log('[gig_scraper] ✓ Final description length:', description.length);
    if (description.length > 0) {
      console.log('[gig_scraper] Description preview:', description.substring(0, 150) + '...');
    }
    
    // Extract FAQ
    const faq = [];
    const faqRows = document.querySelectorAll('[data-testid*="faq"], .faq-item, [class*="faq"]');
    
    faqRows.forEach(row => {
      const q = getInputValue('input[name*="question"]') || clean(row.querySelector('h4, .question')?.textContent || '');
      const a = getInputValue('textarea[name*="answer"]') || clean(row.querySelector('p, .answer')?.textContent || '');
      if (q || a) {
        faq.push({ question: q, answer: a });
      }
    });
    
    return { description, faq };
  }

  // Extract seller information
  function extractSeller(){
    const name = getInputValue('input[name="seller_name"]') ||
                 getText('[data-testid="seller-name"], .seller-name');
    
    const rating = getText('[data-testid="rating"], .rating, .seller-rating');
    const sold = getText('.orders-sold, .deliveries, [class*="sold"]');
    const level = getText('.level, [class*="level"]');
    
    return { name, rating, sold, level };
  }

  // Extract requirements
  function extractRequirements(){
    const requirements = [];
    const whatProvide = [];
    const whatGet = [];
    
    // Requirement rows in edit form
    const reqRows = document.querySelectorAll('[data-testid*="requirement"], .requirement-row');
    reqRows.forEach(row => {
      const label = getInputValue('input[name*="label"]') || clean(row.querySelector('label')?.textContent || '');
      const type = row.querySelector('select')?.value || '';
      const required = /required|mandatory/i.test(row.textContent || '');
      
      if (label) {
        requirements.push({ label, type, required });
      }
    });
    
    // What to provide section
    const provideSection = document.querySelector('[data-testid*="provide"], [class*="provide"]');
    if (provideSection) {
      const items = provideSection.querySelectorAll('li, .item, [class*="item"]');
      items.forEach(item => {
        const text = clean(item.textContent);
        if (text) whatProvide.push(text);
      });
    }
    
    // What you get section
    const getSection = document.querySelector('[data-testid*="get"], [class*="benefits"]');
    if (getSection) {
      const items = getSection.querySelectorAll('li, .item, [class*="item"]');
      items.forEach(item => {
        const text = clean(item.textContent);
        if (text) whatGet.push(text);
      });
    }
    
    return { requirements, what_to_provide: whatProvide, what_you_get: whatGet };
  }

  // Extract gallery images and videos
  function extractGallery(){
    const images = getImages(
      '.gallery img, .gig-gallery img, [data-testid="gallery"] img, img[alt*="gig"]'
    );
    
    const videos = [...document.querySelectorAll('video source, [data-testid*="video"] source')]
      .map(n => n.src || n.getAttribute('src'))
      .filter(Boolean);
    
    return { images, videos };
  }

  // Extract overview/title info
  function extractOverview(){
    const title = getInputValue('input[name="title"]') || 
                  getText('h1, [data-testid="gig-title"]') || 
                  document.title || '';
    
    const description = getInputValue('textarea[name="description"]') ||
                       getText('.description, [data-testid="description"]');
    
    const tags = extractTags();
    const { images } = extractGallery();
    
    return { title, description, tags, images };
  }

  // Main message listener
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'SCRAPE_GIG'){
      (async () => {
        try {
          // Wait for content to fully load
          await new Promise(r => setTimeout(r, 1000));

          // Extract all data with proper structure
          const overview = extractOverview();
          const { description, faq } = extractDescription();
          const pricing = extractPricing();
          const { requirements, what_to_provide, what_you_get } = extractRequirements();
          const { images, videos } = extractGallery();
          const seller = extractSeller();
          const delivery = getText('.delivery-time, [data-testid="delivery-time"]');

          // Build comprehensive details object with proper structure
          const details = {
            url: location.href,
            title: overview.title,
            scraped_at: new Date().toISOString(),
            
            // Overview section
            overview: {
              title: overview.title,
              description: overview.description,
              tags: overview.tags || [],
              images: overview.images || [],
            },
            
            // Description section with FAQ
            description: {
              content: description,
              faq: faq || [],
            },
            
            // Pricing packages
            pricing: {
              packages: pricing || [],
            },
            
            // Requirements
            requirements: {
              list: requirements || [],
              what_to_provide: what_to_provide || [],
              what_you_get: what_you_get || [],
            },
            
            // Gallery
            gallery: {
              images: images || [],
              videos: videos || [],
            },
            
            // Seller info
            seller: seller || {},
            
            // Delivery info
            delivery_time: delivery || '',
          };

          console.log('[gig_scraper] Successfully extracted details:', details);
          sendResponse({ status: 'OK', details });
        } catch(e) {
          console.error('[gig_scraper] Error:', e);
          sendResponse({ status: 'ERR', error: String(e) });
        }
      })();
      return true;
    }
  });
})();