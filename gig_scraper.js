// gig_scraper.js - FIXED VERSION
// Properly extracts and structures gig data from Fiverr edit pages

(function(){
  function clean(s){ return (s||'').replace(/\s+/g,' ').trim(); }

  function getText(sel){ 
    const el = document.querySelector(sel); 
    return el ? clean(el.textContent) : ''; 
  }

  function getAllTexts(sel){ 
    return [...document.querySelectorAll(sel)]
      .map(n => clean(n.textContent))
      .filter(Boolean); 
  }

  function getImages(sel){ 
    return [...document.querySelectorAll(sel)]
      .map(n => n.src || n.getAttribute('src'))
      .filter(Boolean)
      .filter(url => url && !url.includes('data:') && url.length > 10); 
  }

  function getInputValue(sel){
    const el = document.querySelector(sel);
    if (!el) return '';
    const v = (el.value !== undefined ? el.value : el.getAttribute('value')) || '';
    return clean(v);
  }

  // Extract pricing packages from the pricing section
  function extractPricing(){
    try {
      const packages = [];
      
      // Try to find package rows in edit form
      const packageRows = document.querySelectorAll(
        '[data-testid*="package"], .package-row, .package-item, [class*="package-card"]'
      );
      
      if (packageRows.length > 0) {
        packageRows.forEach((row, idx) => {
          const nameEl = row.querySelector('input[name*="name"], input[placeholder*="name"]');
          const priceEl = row.querySelector('input[name*="price"], input[placeholder*="price"]');
          const descEl = row.querySelector('textarea[name*="desc"], textarea[placeholder*="description"]');
          
          const name = nameEl?.value || clean(row.querySelector('h3')?.textContent || '');
          const price = priceEl?.value || clean(row.querySelector('.price')?.textContent || '');
          const desc = descEl?.value || clean(row.querySelector('.description')?.textContent || '');
          
          if (name || price) {
            packages.push({ 
              name: name || `Package ${idx + 1}`, 
              price: price || 'Custom', 
              desc: desc || '' 
            });
          }
        });
      }
      
      // Fallback: look for price displays on view page
      if (packages.length === 0) {
        const priceCards = document.querySelectorAll('.package, [class*="pricing"]');
        priceCards.forEach((card, idx) => {
          const price = clean(card.querySelector('.price, [class*="price"]')?.textContent || '');
          const name = clean(card.querySelector('h3, .title')?.textContent || '');
          if (price) {
            packages.push({
              name: name || `Package ${idx + 1}`,
              price: price,
              desc: ''
            });
          }
        });
      }
      
      return packages;
    } catch(e) { 
      console.warn('extractPricing error', e); 
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
      console.log('[gig_scraper] Editor', i, 'text length:', text.length, 'preview:', text.substring(0, 60));
      
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
    
    // Strategy 3: Check for any stored value in hidden inputs or data attributes
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
          await new Promise(r => setTimeout(r, 500));

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