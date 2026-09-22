/**
 * Auth routes  (mounted at /api/auth)
 * --------------------------------------------------------------
 *   POST /api/auth/login  -> verifies the email against HR_EMAILS and returns a token
 *   GET  /api/auth/me     -> confirms the current token is still valid
 */
const express = require('express');
const jwt = require('jsonwebtoken');
const { requireAuth, getAllowedEmails } = require('../middleware/auth');

const router = express.Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* ---------------------------------------------------------------
 * Basic brute-force protection: after 10 failed attempts from one
 * IP address, further attempts are blocked for 15 minutes.
 * ------------------------------------------------------------- */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const failures = new Map(); // ip -> { count, firstAt }

function isBlocked(ip) {
  const entry = failures.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > WINDOW_MS) {
    failures.delete(ip);
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

function recordFailure(ip) {
  const entry = failures.get(ip);
  if (!entry || Date.now() - entry.firstAt > WINDOW_MS) {
    failures.set(ip, { count: 1, firstAt: Date.now() });
  } else {
    entry.count += 1;
  }
}

// Clean out old entries once in a while so the map cannot grow forever
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of failures) {
    if (now - entry.firstAt > WINDOW_MS) failures.delete(ip);
  }
}, WINDOW_MS).unref();

/* ---------------------------------------------------------------
 * POST /api/auth/login
 * Body: { "email": "hr@company.com" }
 * ------------------------------------------------------------- */
router.post('/login', (req, res) => {
  const ip = req.ip;

  if (isBlocked(ip)) {
    return res.status(429).json({
      success: false,
      message: 'Too many failed attempts. Please wait 15 minutes and try again.',
    });
  }

  const raw = req.body && req.body.email;
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';

  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required.' });
  }
  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
  }

  if (!getAllowedEmails().includes(email)) {
    recordFailure(ip);
    return res.status(401).json({
      success: false,
      message: 'This email is not registered as an HR account.',
    });
  }

  const token = jwt.sign({ email }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });

  return res.status(200).json({
    success: true,
    message: 'Signed in successfully',
    data: { token, email },
  });
});

/* ---------------------------------------------------------------
 * GET /api/auth/me   (requires a valid token)
 * ------------------------------------------------------------- */
router.get('/me', requireAuth, (req, res) => {
  return res.status(200).json({ success: true, data: { email: req.user.email } });
});

module.exports = router;
