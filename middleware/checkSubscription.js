const User = require('../models/User');

const PLAN_LIMITS = { free: 5, starter: 50, pro: 200, unlimited: 999999 };

module.exports = async (req, res, next) => {
  const user = await User.findById(req.user._id);
  const limit = PLAN_LIMITS[user.plan] || 5;
  if (user.uploadsThisMonth >= limit) {
    return res.status(403).json({
      message: 'Monthly listing limit reached. Please upgrade your plan.',
      code: 'LIMIT_REACHED',
      plan: user.plan,
    });
  }
  next();
};
