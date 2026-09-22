/**
 * Employee Management System - server entry point
 * --------------------------------------------------------------
 * - Serves the REST API under /api
 * - Serves the frontend (../frontend) so the whole app runs from one command
 * - Connects to MongoDB using Mongoose
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const Employee = require('./models/Employee');
const authRoutes = require('./routes/auth');
const employeeRoutes = require('./routes/employees');
const { requireAuth, getAllowedEmails } = require('./middleware/auth');

/* ---------------------------------------------------------------
 * Configuration checks
 * ------------------------------------------------------------- */
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/employee_management';

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is missing. Add it to backend/.env and start the server again.');
  process.exit(1);
}
if (process.env.JWT_SECRET.startsWith('change-this')) {
  console.warn('Warning: JWT_SECRET is still the sample value. Set a long random secret before real use.');
}
if (getAllowedEmails().length === 0) {
  console.warn('Warning: HR_EMAILS is empty, so nobody can sign in. Add at least one HR email to backend/.env.');
}

const app = express();

/* ---------------------------------------------------------------
 * Middleware
 * ------------------------------------------------------------- */

// CORS: "*" allows any origin, otherwise only the listed origins
const allowedOrigins = (process.env.CORS_ORIGIN || '*')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.includes('*') ? true : allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json({ limit: '100kb' })); // parse JSON request bodies

/** Returns 503 instead of hanging when MongoDB is not connected. */
function requireDatabase(_req, res, next) {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      success: false,
      message: 'The database is unavailable right now. Please try again in a moment.',
    });
  }
  return next();
}

/* ---------------------------------------------------------------
 * Routes
 * ------------------------------------------------------------- */
app.get('/api/health', (_req, res) => {
  res.status(200).json({
    success: true,
    status: 'ok',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/employees', requireAuth, requireDatabase, employeeRoutes);

// Any other /api path is unknown
app.use('/api', (_req, res) => {
  res.status(404).json({ success: false, message: 'API endpoint not found.' });
});

// Serve the website
app.use(express.static(path.join(__dirname, '..', 'frontend')));

/* ---------------------------------------------------------------
 * Central error handler: turns errors into consistent JSON responses
 * ------------------------------------------------------------- */
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, next) => {
  if (res.headersSent) return next(err);

  // Body is not valid JSON
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'The request body is not valid JSON.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'The request body is too large.' });
  }

  // Mongoose schema validation failed
  if (err.name === 'ValidationError' && err.errors) {
    const errors = {};
    Object.values(err.errors).forEach((e) => {
      errors[e.path] = e.message;
    });
    return res.status(400).json({ success: false, message: 'Please fix the highlighted fields.', errors });
  }

  // A value has the wrong type (for example an invalid id)
  if (err.name === 'CastError') {
    return res.status(400).json({ success: false, message: `The value for "${err.path}" is not valid.` });
  }

  // Duplicate employee (unique index violation)
  if (err.code === 11000) {
    return res.status(409).json({
      success: false,
      message: 'An employee with this name, department and role already exists.',
    });
  }

  // Database unreachable
  if (['MongooseServerSelectionError', 'MongoNetworkError', 'MongoServerSelectionError'].includes(err.name)) {
    return res.status(503).json({
      success: false,
      message: 'The database is unavailable right now. Please try again in a moment.',
    });
  }

  console.error('Unexpected error:', err);
  return res.status(500).json({
    success: false,
    message: 'Something went wrong on the server. Please try again.',
  });
});

/* ---------------------------------------------------------------
 * Start: connect to MongoDB first, then begin listening
 * ------------------------------------------------------------- */
async function start() {
  try {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    await Employee.init(); // make sure the duplicate-protection index exists
    console.log('MongoDB connected');
  } catch (err) {
    console.error('Could not connect to MongoDB.');
    console.error(`  URI: ${MONGODB_URI.replace(/\/\/([^:]+):[^@]+@/, '//$1:****@')}`);
    console.error(`  Reason: ${err.message}`);
    console.error('Make sure MongoDB is running (or that your Atlas connection string is correct).');
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    console.log(`Employee Management System running at http://localhost:${PORT}`);
  });

  // Close connections cleanly on Ctrl+C
  const shutdown = () => {
    server.close(async () => {
      await mongoose.connection.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start();
