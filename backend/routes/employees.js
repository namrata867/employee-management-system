/**
 * Employee routes  (mounted at /api/employees, protected by requireAuth)
 * --------------------------------------------------------------
 *   POST   /api/employees       -> 201 Created
 *   GET    /api/employees       -> 200 OK
 *   GET    /api/employees/:id   -> 200 OK | 404 Not Found
 *   PUT    /api/employees/:id   -> 200 OK | 404 Not Found | 409 Conflict
 *   DELETE /api/employees/:id   -> 200 OK | 404 Not Found
 *
 * Other status codes used: 400 (validation / bad id), 401 (not signed in),
 * 409 (duplicate employee), 503 (database down), 500 (unexpected error).
 * Errors thrown here are formatted by the error handler in server.js.
 */
const express = require('express');
const Employee = require('../models/Employee');

const router = express.Router();

/* ---------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------- */

/** Forwards errors from async handlers to the central error handler. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** A MongoDB ObjectId is exactly 24 hexadecimal characters. */
const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;

/** Runs before any route that contains ":id" and rejects malformed ids. */
router.param('id', (req, res, next, id) => {
  if (!OBJECT_ID_REGEX.test(id)) {
    return res.status(400).json({ success: false, message: 'The employee id is not valid.' });
  }
  return next();
});

/**
 * Validates and cleans the request body.
 * Returns { isValid, errors, clean } where "errors" maps field -> message.
 */
function validateEmployee(body) {
  const input = body && typeof body === 'object' ? body : {};
  const errors = {};
  const clean = {};

  // --- Text fields: required, trimmed, max 100 characters ---
  const textFields = [
    ['fullName', 'Full name'],
    ['department', 'Department'],
    ['role', 'Role'],
  ];
  for (const [field, label] of textFields) {
    const value = typeof input[field] === 'string' ? input[field].trim().replace(/\s+/g, ' ') : '';
    if (!value) errors[field] = `${label} is required`;
    else if (value.length > 100) errors[field] = `${label} must be 100 characters or fewer`;
    else clean[field] = value;
  }

  // --- Salary: required, must be a number, cannot be negative ---
  const rawSalary = input.salary;
  if (rawSalary === undefined || rawSalary === null || String(rawSalary).trim() === '') {
    errors.salary = 'Salary is required';
  } else {
    const isNumeric =
      (typeof rawSalary === 'number' && Number.isFinite(rawSalary)) ||
      (typeof rawSalary === 'string' && /^-?\d+(\.\d+)?$/.test(rawSalary.trim()));
    const salary = isNumeric ? Number(rawSalary) : NaN;

    if (!isNumeric) errors.salary = 'Salary must be a valid number';
    else if (salary < 0) errors.salary = 'Salary cannot be negative';
    else if (salary > 1e10) errors.salary = 'Salary is too large';
    else clean.salary = Math.round(salary * 100) / 100; // keep at most 2 decimals
  }

  // --- Join date: required, valid date, not before 1950, not more than a year ahead ---
  const rawDate = input.joinDate;
  if (rawDate === undefined || rawDate === null || String(rawDate).trim() === '') {
    errors.joinDate = 'Join date is required';
  } else {
    const date = new Date(rawDate);
    const oneYearAhead = new Date();
    oneYearAhead.setFullYear(oneYearAhead.getFullYear() + 1);

    if (Number.isNaN(date.getTime())) errors.joinDate = 'Join date is not a valid date';
    else if (date < new Date('1950-01-01')) errors.joinDate = 'Join date cannot be before 1950';
    else if (date > oneYearAhead) errors.joinDate = 'Join date cannot be more than a year in the future';
    else clean.joinDate = date;
  }

  return { isValid: Object.keys(errors).length === 0, errors, clean };
}

/** Sends the standard 400 response for failed validation. */
function sendValidationError(res, errors) {
  return res.status(400).json({ success: false, message: 'Please fix the highlighted fields.', errors });
}

/* ---------------------------------------------------------------
 * POST /api/employees  - add a new employee
 * ------------------------------------------------------------- */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { isValid, errors, clean } = validateEmployee(req.body);
    if (!isValid) return sendValidationError(res, errors);

    // A duplicate triggers MongoDB error 11000 -> handled as HTTP 409 in server.js
    const employee = await Employee.create(clean);

    return res.status(201).json({
      success: true,
      message: 'Employee added successfully',
      data: employee,
    });
  })
);

/* ---------------------------------------------------------------
 * GET /api/employees  - list all employees (newest first)
 * ------------------------------------------------------------- */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const employees = await Employee.find().sort({ createdAt: -1 });
    return res.status(200).json({ success: true, count: employees.length, data: employees });
  })
);

/* ---------------------------------------------------------------
 * GET /api/employees/:id  - get one employee
 * ------------------------------------------------------------- */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found. They may have been deleted.' });
    }
    return res.status(200).json({ success: true, data: employee });
  })
);

/* ---------------------------------------------------------------
 * PUT /api/employees/:id  - update an employee (all fields required)
 * ------------------------------------------------------------- */
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { isValid, errors, clean } = validateEmployee(req.body);
    if (!isValid) return sendValidationError(res, errors);

    const employee = await Employee.findByIdAndUpdate(req.params.id, clean, {
      new: true, // return the updated document
      runValidators: true, // apply schema rules to the update too
    });
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found. They may have been deleted.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Employee updated successfully',
      data: employee,
    });
  })
);

/* ---------------------------------------------------------------
 * DELETE /api/employees/:id  - remove an employee
 * ------------------------------------------------------------- */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const employee = await Employee.findByIdAndDelete(req.params.id);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found. They may have been deleted.' });
    }
    return res.status(200).json({
      success: true,
      message: 'Employee deleted successfully',
      data: employee,
    });
  })
);

module.exports = router;
