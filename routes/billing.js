const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const auth = require('../middleware/auth');
const User = require('../models/User');

const PLAN_CONFIG = {
  starter: { price: process.env.STRIPE_PRICE_STARTER, limit: 50 },
  pro:     { price: process.env.STRIPE_PRICE_PRO,     limit: 200 },
  unlimited: { price: process.env.STRIPE_PRICE_UNLIMITED, limit: 999999 },
};

router.get('/plans', (req, res) => {
  res.json([
    { id: 'starter', name: 'Starter', price: 29, period: 'month', listings: 50 },
    { id: 'pro',     name: 'Pro',     price: 79, period: 'month', listings: 200 },
    { id: 'unlimited', name: 'Unlimited', price: 149, period: 'month', listings: null },
  ]);
});

router.get('/subscription', auth, async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user.stripeSubscriptionId) {
    return res.json({ plan: user.plan, status: user.plan === 'free' ? 'free' : 'active' });
  }
  try {
    const sub = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
    res.json({ plan: user.plan, status: sub.status, renewsAt: new Date(sub.current_period_end * 1000) });
  } catch { res.json({ plan: user.plan, status: 'unknown' }); }
});

router.get('/usage', auth, async (req, res) => {
  const user = await User.findById(req.user._id);
  const now = new Date();
  const lastReset = user.lastMonthlyReset || new Date(0);
  if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
    await User.findByIdAndUpdate(user._id, { uploadsThisMonth: 0, lastMonthlyReset: now });
    user.uploadsThisMonth = 0;
  }
  res.json({ plan: user.plan, uploadsThisMonth: user.uploadsThisMonth || 0, monthlyLimit: PLAN_CONFIG[user.plan]?.limit || parseInt(process.env.MAX_FREE_LISTINGS) || 5 });
});

router.post('/checkout', auth, async (req, res) => {
  const { planId } = req.body;
  const planCfg = PLAN_CONFIG[planId];
  if (!planCfg) return res.status(400).json({ message: 'Invalid plan' });
  const user = await User.findById(req.user._id);
  try {
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, name: user.name });
      customerId = customer.id;
      await User.findByIdAndUpdate(user._id, { stripeCustomerId: customerId });
    }
    const paymentIntent = await stripe.paymentIntents.create({
      amount: { starter: 2900, pro: 7900, unlimited: 14900 }[planId],
      currency: 'usd', customer: customerId, setup_future_usage: 'off_session',
      metadata: { userId: user._id.toString(), planId },
    });
    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Payment setup failed' }); }
});

router.delete('/subscription', auth, async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user.stripeSubscriptionId) return res.status(400).json({ message: 'No active subscription' });
  try {
    await stripe.subscriptions.update(user.stripeSubscriptionId, { cancel_at_period_end: true });
    res.json({ message: 'Subscription will cancel at end of billing period' });
  } catch (err) { res.status(500).json({ message: 'Could not cancel subscription' }); }
});

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try { event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET); }
  catch (err) { return res.status(400).send('Webhook Error: ' + err.message); }
  if (event.type === 'payment_intent.succeeded') {
    const { userId, planId } = event.data.object.metadata;
    if (userId && planId) await User.findByIdAndUpdate(userId, { plan: planId, monthlyLimit: PLAN_CONFIG[planId]?.limit || 5 });
  }
  res.json({ received: true });
});

module.exports = router;
