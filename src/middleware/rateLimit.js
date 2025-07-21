const rateLimit = require('express-rate-limit');

// Check if rate limiting should be disabled for development
const isDevelopment = process.env.NODE_ENV === 'development';
const disableRateLimit = process.env.DISABLE_RATE_LIMIT === 'true' || isDevelopment;

// Log rate limiting status
if (disableRateLimit) {
  console.log('🚫 Rate limiting disabled for development environment');
}

// No-op middleware for development (disables rate limiting)
const noRateLimit = (req, res, next) => {
  next();
};

// Rate limiting for public endpoints
const publicRateLimit = disableRateLimit ? noRateLimit : rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000, // limit each IP to 1000 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: process.env.NODE_ENV === 'production' ? 1 : false,
});

// Rate limiting for voting (more permissive)
const voteRateLimit = disableRateLimit ? noRateLimit : rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 200, // limit each IP to 200 votes per hour
  message: {
    error: 'Too many votes from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: process.env.NODE_ENV === 'production' ? 1 : false,
});

// Rate limiting for comments
const commentRateLimit = disableRateLimit ? noRateLimit : rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // limit each IP to 20 comments per hour
  message: {
    error: 'Too many comments from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: process.env.NODE_ENV === 'production' ? 1 : false,
});

// Rate limiting for authentication
const authRateLimit = disableRateLimit ? noRateLimit : rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 login attempts per 15 minutes
  message: {
    error: 'Too many login attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: process.env.NODE_ENV === 'production' ? 1 : false,
});

// Rate limiting for admin endpoints
const adminRateLimit = disableRateLimit ? noRateLimit : rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // limit each IP to 500 admin requests per 15 minutes
  message: {
    error: 'Too many admin requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: process.env.NODE_ENV === 'production' ? 1 : false,
});

module.exports = {
  publicRateLimit,
  voteRateLimit,
  commentRateLimit,
  authRateLimit,
  adminRateLimit
}; 