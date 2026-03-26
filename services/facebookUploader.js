/**
 * Facebook Marketplace Uploader Service
 * Uses Playwright to automate posting to Facebook Marketplace
 * with a stored user session (cookies).
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const axios = require('axios');

const FB_MARKETPLACE_URL = 'https://www.facebook.com/marketplace/create/vehicle';

/**
 * Upload a batch of listings to Facebook Marketplace.
 * @param {Array} listings - Array of listing objects
 * @param {string} fbCookies - JSON string of Facebook session cookies
 * @param {function} onProgress - Callback({ uploaded, failed, currentTitle })
 */
async function uploadListings(listings, fbCookies, onProgress = () => {}) {
    let browser;
    const results = { uploaded: 0, failed: 0, failedListings: [] };

  try {
        browser = await chromium.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

      const context = await browser.newContext({
              userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      });

      // Restore Facebook session
      const cookies = JSON.parse(fbCookies);
        await context.addCookies(cookies);

      const page = await context.newPage();

      // Verify session is valid
      await page.goto('https://www.facebook.com', { waitUntil: 'networkidle' });
        const isLoggedIn = await page.$('[aria-label="Your profile"]') !== null ||
                await page.$('[data-testid="royal_login_button"]') === null;

      if (!isLoggedIn) {
              throw new Error('FACEBOOK_SESSION_EXPIRED');
      }

      // Upload each listing
      for (const listing of listings) {
              try {
                        onProgress({ ...results, currentTitle: listing.title, status: 'running' });
                        await uploadSingleListing(page, listing);
                        results.uploaded++;
                        onProgress({ ...results, recentTitle: listing.title, status: 'running' });

                // Human-like delay between listings to avoid FB detection
                // 35-65 seconds per listing (115 cars ~ 90 min total, runs in background)
                const delayMs = 35000 + Math.random() * 30000;
                        await page.waitForTimeout(delayMs);
              } catch (err) {
                        console.error(`Failed to upload: ${listing.title}`, err.message);
                        results.failed++;
                        results.failedListings.push({ id: listing.id, title: listing.title, error: err.message });
              }
      }

      onProgress({ ...results, status: 'done' });
        return results;
  } catch (err) {
        onProgress({ ...results, status: 'failed', error: err.message });
        throw err;
  } finally {
        if (browser) await browser.close();
  }
}

async function uploadSingleListing(page, listing) {
    // Navigate to Marketplace vehicle listing form
  await page.goto(FB_MARKETPLACE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

  // -- Photos --
  if (listing.photos && listing.photos.length > 0) {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'listify-'));
        const photoPaths = [];

      // Download photos to temp files
      for (let i = 0; i < Math.min(listing.photos.length, 10); i++) {
              try {
                        const response = await axios.get(listing.photos[i], {
                                    responseType: 'arraybuffer', timeout: 15000,
                                    headers: { 'User-Agent': 'Mozilla/5.0' },
                        });
                        const ext = listing.photos[i].split('.').pop().split('?')[0] || 'jpg';
                        const filePath = path.join(tempDir, `photo_${i}.${ext}`);
                        fs.writeFileSync(filePath, response.data);
                        photoPaths.push(filePath);
              } catch { /* skip failed photo */ }
      }

      if (photoPaths.length > 0) {
              const fileInput = await page.$('input[type="file"]');
              if (fileInput) {
                        await fileInput.setInputFiles(photoPaths);
                        await page.waitForTimeout(3000);
              }
              // Cleanup temp files
          photoPaths.forEach((p) => { try { fs.unlinkSync(p); } catch {} });
              try { fs.rmdirSync(tempDir); } catch {}
      }
  }

  // -- Title --
  await fillField(page, [
        'input[placeholder*="title" i]',
        'input[aria-label*="title" i]',
        'input[name="title"]',
      ], listing.title.substring(0, 100));

  // -- Price --
  const numericPrice = listing.price.replace(/[^0-9]/g, '');
    if (numericPrice) {
          await fillField(page, [
                  'input[placeholder*="price" i]',
                  'input[aria-label*="price" i]',
                  'input[name="price"]',
                ], numericPrice);
    }

  // -- Description --
  if (listing.description) {
        await fillField(page, [
                'textarea[placeholder*="description" i]',
                'textarea[aria-label*="description" i]',
                'textarea[name="description"]',
                '[contenteditable="true"][aria-label*="description" i]',
              ], listing.description.substring(0, 9999));
  }

  // -- Submit --
  await page.waitForTimeout(1000);

  // Click "Next" or "Publish" button
  const publishSelectors = [
        'button:has-text("Publish")',
        'button:has-text("Next")',
        '[data-testid="marketplace-pdp-primary-cta"]',
        'button[type="submit"]',
      ];

  for (const sel of publishSelectors) {
        const btn = await page.$(sel);
        if (btn) {
                await btn.click();
                await page.waitForTimeout(2000);
                break;
        }
  }

  // Handle multi-step forms (click Next multiple times until Publish appears)
  for (let step = 0; step < 5; step++) {
        const publishBtn = await page.$('button:has-text("Publish")');
        if (publishBtn) {
                await publishBtn.click();
                await page.waitForTimeout(3000);
                return; // Success
        }
        const nextBtn = await page.$('button:has-text("Next")');
        if (nextBtn) {
                await nextBtn.click();
                await page.waitForTimeout(2000);
        } else {
                break;
        }
  }
}

async function fillField(page, selectors, value) {
    for (const selector of selectors) {
          try {
                  const el = await page.$(selector);
                  if (el) {
                            await el.click({ clickCount: 3 });
                            await el.fill(value);
                            return true;
                  }
          } catch {}
    }
    return false;
}

module.exports = { uploadListings };
