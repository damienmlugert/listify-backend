const mongoose = require('mongoose');

const ListingSchema = new mongoose.Schema({
  id: String, title: String, price: String, description: String,
  photos: [String], specs: mongoose.Schema.Types.Mixed, sourceUrl: String,
}, { _id: false });

const ScrapeJobSchema = new mongoose.Schema({
  _id: String,
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  url: { type: String, required: true },
  domain: String,
  status: { type: String, enum: ['running', 'done', 'failed'], default: 'running' },
  currentStep: { type: Number, default: 0 },
  progress: { type: Number, default: 0 },
  scanned: { type: Number, default: 0 },
  uploaded: { type: Number, default: 0 },
  failed: { type: Number, default: 0 },
  error: String,
  listings: [ListingSchema],
}, { timestamps: true });

module.exports = mongoose.model('ScrapeJob', ScrapeJobSchema);
