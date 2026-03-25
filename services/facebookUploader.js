const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const axios = require('axios');

const FB_MARKETPLACE_URL = 'https://www.facebook.com/marketplace/create/vehicle';

async function uploadListings(listings, fbCookies, onProgress = () => {}) {
  let browser;
  const results = { uploaded: 0, failed: 0, failedListings: [] };
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
    });
    await context.addCookies(JSON.parse(fbCookies));
    const page = await context.newPage();
    await page.goto('https://www.facebook.com', { waitUntil: 'networkidle' });
    const loginBtn = await page.$('[data-testid="royal_login_button"]');
    if (loginBtn) throw new Error('FACEBOOK_SESSION_EXPIRED');
    for (const listing of listings) {
      try {
        onProgress({ ...results, currentTitle: listing.title, status: 'running' });
        await uploadSingleListing(page, listing);
        results.uploaded++;
        onProgress({ ...results, recentTitle: listing.title, status: 'running' });
        await page.waitForTimeout(3000 + Math.random() * 2000);
      } catch (err) {
        results.failed++;
        results.failedListings.push({ id: listing.id, title: listing.title, error: err.message });
      }
    }
    onProgress({ ...results, status: 'done' });
    return results;
  } catch (err) {
    onProgress({ ...results, status: 'failed', error: err.message });
    throw err;
  } finally { if (browser) await browser.close(); }
}

async function uploadSingleListing(page, listing) {
  await page.goto(FB_MARKETPLACE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  if (listing.photos && listing.photos.length > 0) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'listify-'));
    const photoPaths = [];
    for (let i = 0; i < Math.min(listing.photos.length, 10); i++) {
      try {
        const resp = await axios.get(listing.photos[i], { responseType: 'arraybuffer', timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } });
        const ext = (listing.photos[i].split('.').pop().split('?')[0] || 'jpg').substring(0, 4);
        const fp = path.join(tempDir, 'photo_' + i + '.' + ext);
        fs.writeFileSync(fp, resp.data);
        photoPaths.push(fp);
      } catch {}
    }
    if (photoPaths.length > 0) {
      const fileInput = await page.$('input[type="file"]');
      if (fileInput) { await fileInput.setInputFiles(photoPaths); await page.waitForTimeout(3000); }
      photoPaths.forEach(p => { try { fs.unlinkSync(p); } catch {} });
      try { fs.rmdirSync(tempDir); } catch {}
    }
  }
  await fillField(page, ['input[placeholder*="title" i]', 'input[aria-label*="title" i]'], listing.title.substring(0, 100));
  const price = listing.price.replace(/[^0-9]/g, '');
  if (price) await fillField(page, ['input[placeholder*="price" i]', 'input[aria-label*="price" i]'], price);
  if (listing.description) await fillField(page, ['textarea[placeholder*="description" i]', 'textarea[aria-label*="description" i]'], listing.description.substring(0, 9999));
  await page.waitForTimeout(1000);
  for (let step = 0; step < 5; step++) {
    const pub = await page.$('button:has-text("Publish")');
    if (pub) { await pub.click(); await page.waitForTimeout(3000); return; }
    const nxt = await page.$('button:has-text("Next")');
    if (nxt) { await nxt.click(); await page.waitForTimeout(2000); } else break;
  }
}

async function fillField(page, selectors, value) {
  for (const sel of selectors) {
    try { const el = await page.$(sel); if (el) { await el.click({ clickCount: 3 }); await el.fill(value); return true; } } catch {}
  }
  return false;
}

module.exports = { uploadListings };
