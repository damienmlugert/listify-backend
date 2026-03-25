const { chromium } = require('playwright');
const cheerio = require('cheerio');
const { v4: uuidv4 } = require('uuid');

async function scrapeInventory(url, onProgress = () => {}) {
  let browser;
  try {
    onProgress('connect', 0);
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    onProgress('listings', 0);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    await autoScroll(page);
    onProgress('details', 0);
    const html = await page.content();
    const listingLinks = await extractListingLinks(page, html, url);
    onProgress('photos', listingLinks.length);
    const listings = [];
    for (let i = 0; i < listingLinks.length; i++) {
      try {
        const listing = await scrapeListingPage(page, listingLinks[i]);
        if (listing) listings.push(listing);
        onProgress('photos', i + 1);
      } catch (e) { console.warn('Failed listing:', listingLinks[i], e.message); }
      await page.waitForTimeout(500 + Math.random() * 500);
    }
    onProgress('prepare', listings.length);
    return listings;
  } finally { if (browser) await browser.close(); }
}

async function extractListingLinks(page, html, baseUrl) {
  const $ = cheerio.load(html);
  const domain = new URL(baseUrl).origin;
  const links = new Set();
  const patterns = ['a[href*="/inventory/"]','a[href*="/vehicle/"]','a[href*="/listing/"]','a[href*="/used-cars/"]','a[href*="/details/"]','a[href*="/vehicles/"]','.vehicle-card a','.inventory-item a','[class*="vehicle"] a[href]','[class*="listing"] a[href]'];
  patterns.forEach(sel => {
    $(sel).each((_, el) => {
      let href = $(el).attr('href');
      if (!href || href === '#' || href.startsWith('javascript')) return;
      if (!href.startsWith('http')) href = domain + (href.startsWith('/') ? '' : '/') + href;
      if (href.includes(new URL(baseUrl).hostname)) links.add(href);
    });
  });
  try {
    const jsLinks = await page.$$eval('a[href]', els => els.map(el => el.href).filter(h => h && !h.endsWith('#')));
    jsLinks.forEach(href => { if (href.includes(new URL(baseUrl).hostname) && /\/(inventory|vehicle|listing|details|vehicles|stock|vin)\//i.test(href)) links.add(href); });
  } catch {}
  links.delete(baseUrl);
  return [...links].slice(0, 200);
}

async function scrapeListingPage(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const $ = cheerio.load(await page.content());
  const title = ($('h1').first().text().trim() || $('[class*="title"]').first().text().trim() || '').replace(/\s+/g, ' ');
  if (!title) return null;
  const priceEl = $('[class*="price"]').first().text().trim() || '';
  const priceMatch = priceEl.match(/\$[\d,]+/);
  const price = priceMatch ? priceMatch[0] : 'Contact for price';
  const desc = ($('[class*="description"]').first().text().trim() || '').replace(/\s+/g, ' ').substring(0, 800);
  const photos = [];
  $('img').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy');
    if (!src || src.startsWith('data:') || src.includes('logo') || src.includes('icon')) return;
    const w = parseInt($(el).attr('width') || '0');
    if (w > 0 && w < 100) return;
    photos.push(src.startsWith('http') ? src : new URL(src, url).href);
  });
  const specs = {};
  $('[class*="spec"], [class*="detail"]').each((_, el) => {
    const parts = $(el).text().trim().split(':');
    if (parts.length === 2 && parts[0].length < 50) specs[parts[0].trim()] = parts[1].trim();
  });
  return { id: uuidv4(), title: title.substring(0, 150), price, description: desc, photos: [...new Set(photos)].slice(0, 20), specs, sourceUrl: url };
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let total = 0;
      const timer = setInterval(() => {
        window.scrollBy(0, 400);
        total += 400;
        if (total >= document.body.scrollHeight - window.innerHeight) { clearInterval(timer); resolve(); }
      }, 100);
      setTimeout(resolve, 10000);
    });
  });
  await page.waitForTimeout(1000);
}

module.exports = { scrapeInventory };
