const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const auth = require('../middleware/auth');
const { uploadListings } = require('../services/facebookUploader');
const ScrapeJob = require('../models/ScrapeJob');
const UploadSession = require('../models/UploadSession');
const User = require('../models/User');

router.post('/session', auth, async (req, res) => {
  const { cookies } = req.body;
  if (!cookies || !Array.isArray(cookies)) return res.status(400).json({ message: 'Valid cookies array required' });
  const hasFbCookies = cookies.some((c) => c.name === 'c_user' || c.name === 'xs');
  if (!hasFbCookies) return res.status(400).json({ message: 'Invalid Facebook session cookies' });
  await User.findByIdAndUpdate(req.user._id, { fbCookies: JSON.stringify(cookies), fbConnectedAt: new Date() });
  res.json({ message: 'Facebook account connected successfully' });
});

router.post('/upload/start', auth, async (req, res) => {
  const { jobId, listingIds } = req.body;
  if (!jobId || !listingIds?.length) return res.status(400).json({ message: 'jobId and listingIds required' });
  const user = await User.findById(req.user._id);
  if (!user.fbCookies) return res.status(401).json({ message: 'Facebook account not connected', code: 'FB_NOT_CONNECTED' });
  const job = await ScrapeJob.findOne({ _id: jobId, userId: user._id });
  if (!job) return res.status(404).json({ message: 'Scan job not found' });
  const selectedListings = job.listings.filter((l) => listingIds.includes(l.id));
  if (!selectedListings.length) return res.status(400).json({ message: 'No valid listings found' });
  const sessionId = uuidv4();
  await UploadSession.create({ _id: sessionId, userId: user._id, jobId, total: selectedListings.length, uploaded: 0, failed: 0, status: 'running', recentTitles: [] });
  res.json({ sessionId, total: selectedListings.length });
  (async () => {
    try {
      await uploadListings(selectedListings, user.fbCookies, async (progress) => {
        const update = { uploaded: progress.uploaded, failed: progress.failed, status: progress.status };
        if (progress.recentTitle) {
          await UploadSession.findByIdAndUpdate(sessionId, { ...update, $push: { recentTitles: { $each: [progress.recentTitle], $slice: -20 } } });
        } else {
          await UploadSession.findByIdAndUpdate(sessionId, update);
        }
      });
      await User.findByIdAndUpdate(user._id, { $inc: { uploadsThisMonth: selectedListings.length } });
    } catch (err) {
      const code = err.message === 'FACEBOOK_SESSION_EXPIRED' ? 'FB_SESSION_EXPIRED' : 'UPLOAD_ERROR';
      await UploadSession.findByIdAndUpdate(sessionId, { status: 'failed', errorCode: code });
    }
  })();
});

router.get('/upload/status/:sessionId', auth, async (req, res) => {
  const session = await UploadSession.findOne({ _id: req.params.sessionId, userId: req.user._id });
  if (!session) return res.status(404).json({ message: 'Session not found' });
  res.json(session);
});

module.exports = router;
