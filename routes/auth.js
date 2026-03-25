const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const User = require('../models/User');

// Register
router.post('/register',
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('name').notEmpty().trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, email, password, businessName } = req.body;
    try {
      if (await User.findOne({ email })) {
        return res.status(409).json({ message: 'An account with this email already exists.' });
      }
      const hashed = await bcrypt.hash(password, 12);
      const user = await User.create({
        name, email, password: hashed, businessName,
        plan: 'free',
        uploadsThisMonth: 0,
        monthlyLimit: parseInt(process.env.MAX_FREE_LISTINGS) || 5,
        trialStartedAt: new Date(),
      });

      const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
      res.status(201).json({
        token,
        user: { id: user._id, name: user.name, email: user.email, businessName: user.businessName, plan: user.plan },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error during registration.' });
    }
  }
);

// Login
router.post('/login',
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;
    try {
      const user = await User.findOne({ email }).select('+password');
      if (!user || !await bcrypt.compare(password, user.password)) {
        return res.status(401).json({ message: 'Invalid email or password.' });
      }
      const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
      res.json({
        token,
        user: { id: user._id, name: user.name, email: user.email, businessName: user.businessName, plan: user.plan },
      });
    } catch (err) {
      res.status(500).json({ message: 'Server error during login.' });
    }
  }
);

// Get profile
router.get('/me', auth, async (req, res) => {
  const user = await User.findById(req.user._id).select('-password -fbCookies');
  res.json(user);
});

module.exports = router;
