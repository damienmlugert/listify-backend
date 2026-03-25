const mongoose = require('mongoose');

const UploadSessionSchema = new mongoose.Schema({
  _id: String,
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  jobId: String,
  total: Number,
  uploaded: { type: Number, default: 0 },
  failed: { type: Number, default: 0 },
  status: { type: String, enum: ['running', 'done', 'failed'], default: 'running' },
  errorCode: String,
  recentTitles: [String],
  failedListings: [{ id: String, title: String, error: String }],
}, { timestamps: true });

module.exports = mongoose.model('UploadSession', UploadSessionSchema);
