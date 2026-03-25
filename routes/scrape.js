const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const auth = require('../middleware/auth');
const checkSubscription = require('../middleware/checkSubscription');
const { scrapeInventory } = require('../services/scraper');
const ScrapeJob = require('../models/ScrapeJob');
const User = require('../models/User');

router.post('/start', auth, checkSubscription,
  body('url').isURL().withMessage('Valid URL required'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { url } = req.body;
    const jobId = uuidv4();
    await ScrapeJob.create({ _id: jobId, userId: req.user._id, url, domain: new URL(url).hostname, status: 'running', currentStep: 0, progress: 0 });
    res.json({ jobId, message: 'Scan started' });
    (async () => {
      try {
        const listings = await scrapeInventory(url, async (step, count) => {
          const stepIndex = { connect: 0, listings: 1, details: 2, photos: 3, prepare: 4 }[step] ?? 0;
          await ScrapeJob.findByIdAndUpdate(jobId, { currentStep: stepIndex, progress: count, status: 'running' });
        });
        await ScrapeJob.findByIdAndUpdate(jobId, { status: 'done', currentStep: 4, progress: listings.length, scanned: listings.length, listings });
      } catch (err) {
        await ScrapeJob.findByIdAndUpdate(jobId, { status: 'failed', error: err.message });
      }
    })();
  }
);

router.get('/status/:jobId', auth, async (req, res) => {
  const job = await ScrapeJob.findOne({ _id: req.params.jobId, userId: req.user._id }).select('-listings');
  if (!job) return res.status(404).json({ message: 'Job not found' });
  res.json(job);
});

router.get('/listings/:jobId', auth, async (req, res) => {
  const job = await ScrapeJob.findOne({ _id: req.params.jobId, userId: req.user._id });
  if (!job) return res.status(404).json({ message: 'Job not found' });
  if (job.status !== 'done') return res.status(400).json({ message: 'Job not complete yet' });
  res.json({ listings: job.listings });
});

router.get('/history', auth, async (req, res) => {
  const jobs = await ScrapeJob.find({ userId: req.user._id }).select('-listings').sort({ createdAt: -1 }).limit(50);
  res.json({ jobs });
});

module.exports = router;
