/**
 * Authentication middleware
 * --------------------------------------------------------------
 * Every /api/employees request must carry a valid login token:
 *     Authorization: Bearer <token>
 * Tokens are issued by POST /api/auth/login after the HR email is verified.
 * The email is also re-checked against HR_EMAILS on every request, so removing
 * an address from .env locks that person out straight away.
 */
const jwt = require('jsonwebtoken');

/** Reads the HR allow-list from .env (comma-separated, case-insensitive). */
function getAllowedEmails() {
  return (process.env.HR_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({
      success: false,
      message: 'Please sign in with your HR email to continue.',
    });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    const message =
      err.name === 'TokenExpiredError'
        ? 'Your session has expired. Please sign in again.'
        : 'Your session is not valid. Please sign in again.';
    return res.status(401).json({ success: false, message });
  }

  if (!getAllowedEmails().includes(payload.email)) {
    return res.status(401).json({
      success: false,
      message: 'This email is no longer registered as an HR account.',
    });
  }

  req.user = { email: payload.email };
  return next();
}

module.exports = { requireAuth, getAllowedEmails };
