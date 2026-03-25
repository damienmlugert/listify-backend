require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const scrapeRoutes = require('./routes/scrape');
const facebookRoutes = require('./routes/facebook');
const billingRoutes = require('./routes/billing');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Database ────────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => { console.error('MongoDB error:', err); process.exit(1); });

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));
app.use(morgan('combined'));

// Raw body needed for Stripe webhooks
app.use('/billing/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));

// Global rate limiter
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200, message: 'Too many requests' }));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/auth', authRoutes);
app.use('/scrape', scrapeRoutes);
app.use('/facebook', facebookRoutes);
app.use('/billing', billingRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date() }));

// ─── Error handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
});

app.listen(PORT, () => console.log(`🚀 Listify API running on port ${PORT}`));
module.exports = app;
