const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true, select: false },
  businessName: { type: String, trim: true },
  plan: { type: String, enum: ['free', 'starter', 'pro', 'unlimited'], default: 'free' },
  stripeCustomerId: String,
  stripeSubscriptionId: String,
  monthlyLimit: { type: Number, default: 5 },
  uploadsThisMonth: { type: Number, default: 0 },
  lastMonthlyReset: Date,
  fbCookies: { type: String, select: false },
  fbConnectedAt: Date,
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
