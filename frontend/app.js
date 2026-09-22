/* ==========================================================================
   PeopleDesk - Employee Management System
   Frontend logic

   1. Configuration      6. Sign-in / sign-out    11. Delete flow
   2. State + DOM        7. Loading employees     12. Events
   3. Helpers            8. Rendering             13. Start-up
   4. Toasts             9. Sorting + filtering
   5. API layer         10. Add / edit form
   ========================================================================== */
'use strict';

/* ---------- 1. Configuration ---------- */
const CONFIG = {
  // Same origin when the site is served by the Express server (http://localhost:5000).
  // When the page is opened from a different dev server or from a file, call the API on port 5000.
  API_BASE:
    location.protocol === 'file:' || ['5500', '5501', '8080'].includes(location.port)
      ? 'http://localhost:5000'
      : '',
  LOCALE: 'en-US', // number and date formatting
  CURRENCY: 'USD', // change to INR, EUR, GBP ... to show a different currency
  TOAST_MS: 4500, // how long a toast stays on screen
  SEARCH_DELAY_MS: 150, // wait after typing before filtering
};

const STORAGE = { token: 'ems_token', email: 'ems_email' };
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Choices for the sort menu (also keeps the column headers in sync)
const SORT_OPTIONS = [
  { key: 'fullName', dir: 'asc', label: 'Name (A to Z)' },
  { key: 'fullName', dir: 'desc', label: 'Name (Z to A)' },
  { key: 'department', dir: 'asc', label: 'Department (A to Z)' },
  { key: 'department', dir: 'desc', label: 'Department (Z to A)' },
  { key: 'role', dir: 'asc', label: 'Role (A to Z)' },
  { key: 'role', dir: 'desc', label: 'Role (Z to A)' },
  { key: 'salary', dir: 'desc', label: 'Salary (high to low)' },
  { key: 'salary', dir: 'asc', label: 'Salary (low to high)' },
  { key: 'joinDate', dir: 'desc', label: 'Newest joiners first' },
  { key: 'joinDate', dir: 'asc', label: 'Longest serving first' },
];

/* ---------- 2. State + DOM ---------- */
const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* storage blocked */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* storage blocked */ } },
};

const state = {
  token: store.get(STORAGE.token),
  email: store.get(STORAGE.email),
  employees: [],
  search: '',
  department: '',
  sort: { key: 'fullName', dir: 'asc' },
  loading: false,
  loadError: null,
  deleteId: null,
};

const $ = (selector, root = document) => root.querySelector(selector);
const el = {
  bootView: $('#bootView'),
  loginView: $('#loginView'),
  appView: $('#appView'),
  loginForm: $('#loginForm'),
  loginField: $('#loginField'),
  loginEmail: $('#loginEmail'),
  loginError: $('#loginError'),
  loginBtn: $('#loginBtn'),
  userEmail: $('#userEmail'),
  logoutBtn: $('#logoutBtn'),
  addBtn: $('#addBtn'),
  statTotal: $('#statTotal'),
  statDepartments: $('#statDepartments'),
  statAverage: $('#statAverage'),
  statPayroll: $('#statPayroll'),
  searchInput: $('#searchInput'),
  deptFilter: $('#deptFilter'),
  sortSelect: $('#sortSelect'),
  tableWrap: $('#tableWrap'),
  tableBody: $('#employeeBody'),
  stateBox: $('#stateBox'),
  tableFoot: $('#tableFoot'),
  employeeDialog: $('#employeeDialog'),
  employeeForm: $('#employeeForm'),
  employeeId: $('#employeeId'),
  dialogTitle: $('#employeeDialogTitle'),
  formBanner: $('#formBanner'),
  saveBtn: $('#saveBtn'),
  saveLabel: $('#saveLabel'),
  departmentList: $('#departmentList'),
  deleteDialog: $('#deleteDialog'),
  deleteMessage: $('#deleteMessage'),
  confirmDeleteBtn: $('#confirmDeleteBtn'),
  toasts: $('#toasts'),
};

/* ---------- 3. Helpers ---------- */
const currencyFull = new Intl.NumberFormat(CONFIG.LOCALE, {
  style: 'currency', currency: CONFIG.CURRENCY, minimumFractionDigits: 0, maximumFractionDigits: 2,
});
const currencyCompact = new Intl.NumberFormat(CONFIG.LOCALE, {
  style: 'currency', currency: CONFIG.CURRENCY, notation: 'compact', maximumFractionDigits: 1,
});

/** Escapes text before it is placed inside HTML (prevents script injection). */
function escapeHtml(value) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value ?? '').replace(/[&<>"']/g, (c) => map[c]);
}

/** Dates are stored at UTC midnight, so format them in UTC to avoid off-by-one days. */
function formatDate(iso) {
  return new Date(iso).toLocaleDateString(CONFIG.LOCALE, {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}
const toInputDate = (iso) => new Date(iso).toISOString().slice(0, 10);
const todayInputDate = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time

function initials(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

/** Gives each person a steady avatar colour based on their name. */
function hueFor(name) {
  let hash = 0;
  for (const ch of String(name)) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return hash;
}

function debounce(fn, delay) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

/** Shows a spinner inside a button and blocks double clicks. */
function setLoading(button, isLoading) {
  button.classList.toggle('is-loading', isLoading);
  button.disabled = isLoading;
}

function showView(name) {
  el.bootView.hidden = name !== 'boot';
  el.loginView.hidden = name !== 'login';
  el.appView.hidden = name !== 'app';
}

/* ---------- 4. Toasts ---------- */
const TOAST_ICONS = {
  success: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/></svg>',
  error: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/></svg>',
  info: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.01"/></svg>',
};

/** Shows a message in the corner of the screen. type: 'success' | 'error' | 'info' */
function toast(message, type = 'info') {
  const item = document.createElement('div');
  item.className = `toast toast-${type}`;
  item.setAttribute('role', type === 'error' ? 'alert' : 'status');
  item.innerHTML = `<span class="toast-icon">${TOAST_ICONS[type]}</span><span class="toast-msg"></span>` +
    '<button type="button" class="toast-close" aria-label="Dismiss">&times;</button>';
  item.querySelector('.toast-msg').textContent = message;

  const remove = () => {
    if (!item.isConnected) return;
    item.classList.add('is-leaving');
    setTimeout(() => item.remove(), 200);
  };
  item.querySelector('.toast-close').addEventListener('click', remove);
  setTimeout(remove, CONFIG.TOAST_MS);

  // Re-opening the popover puts toasts above any dialog that is currently open
  try {
    if (el.toasts.hidePopover) {
      if (el.toasts.matches(':popover-open')) el.toasts.hidePopover();
      el.toasts.showPopover();
    }
  } catch { /* older browsers: the toasts simply use normal stacking */ }

  el.toasts.appendChild(item);
}

/* ---------- 5. API layer ---------- */
class ApiError extends Error {
  constructor(message, status, errors) {
    super(message);
    this.status = status; // HTTP status (0 = server not reachable)
    this.errors = errors; // per-field messages from the server, if any
  }
}

/** Calls the backend and returns the parsed JSON, or throws an ApiError. */
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  let response;
  try {
    response = await fetch(CONFIG.API_BASE + path, { ...options, headers });
  } catch {
    throw new ApiError('Cannot reach the server. Check that the backend is running and try again.', 0);
  }

  let body = null;
  try { body = await response.json(); } catch { /* response had no JSON body */ }

  if (!response.ok) {
    // A rejected token means the session is over: go back to the sign-in screen
    if (response.status === 401 && state.token) endSession(body && body.message);
    throw new ApiError(
      (body && body.message) || `Something went wrong (error ${response.status}).`,
      response.status,
      body && body.errors
    );
  }
  return body;
}

/* ---------- 6. Sign-in / sign-out ---------- */
function setLoginError(message) {
  el.loginError.textContent = message || '';
  el.loginField.classList.toggle('has-error', Boolean(message));
  el.loginEmail.setAttribute('aria-invalid', message ? 'true' : 'false');
}

async function handleLogin(event) {
  event.preventDefault();
  setLoginError('');

  const email = el.loginEmail.value.trim().toLowerCase();
  if (!email) return setLoginError('Enter your HR email address.');
  if (!EMAIL_REGEX.test(email)) return setLoginError('Enter a valid email address, like name@company.com.');

  setLoading(el.loginBtn, true);
  try {
    const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email }) });
    state.token = result.data.token;
    state.email = result.data.email;
    store.set(STORAGE.token, state.token);
    store.set(STORAGE.email, state.email);
    el.loginForm.reset();
    enterApp();
    toast(`Signed in as ${state.email}`, 'success');
  } catch (err) {
    setLoginError(err.message);
  } finally {
    setLoading(el.loginBtn, false);
  }
}

/** Opens the dashboard for a signed-in HR user. */
function enterApp() {
  el.userEmail.textContent = state.email || '';
  showView('app');
  loadEmployees();
}

/** Clears the session and shows the sign-in screen. */
function endSession(message) {
  const wasSignedIn = Boolean(state.token);
  state.token = null;
  state.email = null;
  state.employees = [];
  state.deleteId = null;
  store.remove(STORAGE.token);
  store.remove(STORAGE.email);

  if (el.employeeDialog.open) el.employeeDialog.close();
  if (el.deleteDialog.open) el.deleteDialog.close();

  setLoginError('');
  showView('login');
  el.loginEmail.focus();
  if (wasSignedIn && message) toast(message, 'error');
}

function handleLogout() {
  endSession();
  toast('You have been signed out.', 'info');
}

/* ---------- 7. Loading employees ---------- */
async function loadEmployees() {
  state.loading = true;
  state.loadError = null;
  render();

  try {
    const result = await api('/api/employees');
    state.employees = result.data;
  } catch (err) {
    if (err.status === 401) return; // session ended, sign-in screen already shown
    state.loadError = err.message;
    toast(err.message, 'error');
  } finally {
    state.loading = false;
  }
  render();
}

/* ---------- 8. Rendering ---------- */
function render() {
  renderStats();
  renderDepartments();
  renderTable();
}

function renderStats() {
  const list = state.employees;
  const total = list.length;
  const payroll = list.reduce((sum, e) => sum + e.salary, 0);
  const departments = new Set(list.map((e) => e.department.toLowerCase())).size;

  el.statTotal.textContent = total.toLocaleString(CONFIG.LOCALE);
  el.statDepartments.textContent = departments.toLocaleString(CONFIG.LOCALE);
  el.statAverage.textContent = total ? currencyCompact.format(payroll / total) : '-';
  el.statPayroll.textContent = total ? currencyCompact.format(payroll) : '-';
}

/** Fills the department filter and the form's suggestion list from the data. */
function renderDepartments() {
  const seen = new Map();
  state.employees.forEach((e) => {
    if (!seen.has(e.department.toLowerCase())) seen.set(e.department.toLowerCase(), e.department);
  });
  const names = [...seen.values()].sort((a, b) => a.localeCompare(b));

  // Keep the selection in sync with the list; reset it if that department no longer exists
  // (e.g. its last employee was deleted)
  const match = names.find((n) => n.toLowerCase() === state.department.toLowerCase());
  state.department = match || '';

  el.deptFilter.innerHTML = '<option value="">All departments</option>' +
    names.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
  el.deptFilter.value = state.department;
  el.departmentList.innerHTML = names.map((n) => `<option value="${escapeHtml(n)}"></option>`).join('');
}

/** Draws a loading, error, empty or "no matches" message in place of the table. */
function showState({ icon, tone = '', title, text, actions = [] }) {
  el.tableWrap.hidden = true;
  el.tableFoot.hidden = true;
  el.stateBox.hidden = false;
  el.stateBox.innerHTML =
    (icon ? `<span class="state-icon ${tone}">${icon}</span>` : '') +
    `<h3>${escapeHtml(title)}</h3>` +
    (text ? `<p>${escapeHtml(text)}</p>` : '') +
    (actions.length
      ? `<div class="state-actions">${actions
          .map((a) => `<button type="button" class="btn ${a.primary ? 'btn-primary' : 'btn-secondary'}" data-action="${a.action}">${escapeHtml(a.label)}</button>`)
          .join('')}</div>`
      : '');
}

const ICON_PEOPLE = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.7a3.5 3.5 0 0 1 0 6.6M18 14.3c2.2.6 3.5 2.6 3.5 5.7"/></svg>';
const ICON_ALERT = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 20h20L12 3zM12 10v4.5M12 17.5v.01"/></svg>';
const ICON_SEARCH = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';

function renderTable() {
  // 1. Loading
  if (state.loading) {
    showState({ title: 'Loading employees' });
    el.stateBox.insertAdjacentHTML('afterbegin', '<span class="spinner spinner-lg" role="status" aria-label="Loading"></span>');
    return;
  }

  // 2. Could not load
  if (state.loadError) {
    showState({
      icon: ICON_ALERT, tone: 'is-error',
      title: 'Employees could not be loaded',
      text: state.loadError,
      actions: [{ action: 'retry', label: 'Try again', primary: true }],
    });
    return;
  }

  // 3. No employees yet
  if (state.employees.length === 0) {
    showState({
      icon: ICON_PEOPLE,
      title: 'No employees yet',
      text: 'Add your first employee to start building the directory.',
      actions: [{ action: 'add', label: 'Add employee', primary: true }],
    });
    return;
  }

  // 4. Employees exist, but the search or filter matches none
  const visible = getVisibleEmployees();
  if (visible.length === 0) {
    showState({
      icon: ICON_SEARCH,
      title: 'No matching employees',
      text: 'Try a different search term or choose another department.',
      actions: [{ action: 'clear', label: 'Clear search and filter' }],
    });
    return;
  }

  // 5. Show the table
  el.stateBox.hidden = true;
  el.tableWrap.hidden = false;
  el.tableBody.innerHTML = visible.map(rowHtml).join('');

  el.tableFoot.hidden = false;
  el.tableFoot.textContent = `Showing ${visible.length} of ${state.employees.length} ${state.employees.length === 1 ? 'employee' : 'employees'}`;

  updateSortUi();
}

function rowHtml(emp) {
  const id = escapeHtml(emp.id);
  const name = escapeHtml(emp.fullName);
  return `
    <tr>
      <td class="cell-name" data-label="">
        <div class="person">
          <span class="avatar" style="--h:${hueFor(emp.fullName)}" aria-hidden="true">${escapeHtml(initials(emp.fullName))}</span>
          <span class="person-name">${name}</span>
        </div>
      </td>
      <td data-label="Department"><span class="badge">${escapeHtml(emp.department)}</span></td>
      <td data-label="Role">${escapeHtml(emp.role)}</td>
      <td data-label="Salary" class="num">${currencyFull.format(emp.salary)}</td>
      <td data-label="Joined">${formatDate(emp.joinDate)}</td>
      <td data-label="" class="col-actions">
        <div class="row-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-action="edit" data-id="${id}" aria-label="Edit ${name}">Edit</button>
          <button type="button" class="btn btn-danger-outline btn-sm" data-action="delete" data-id="${id}" aria-label="Delete ${name}">Delete</button>
        </div>
      </td>
    </tr>`;
}

/* ---------- 9. Sorting + filtering ---------- */
function compareEmployees(a, b) {
  const { key, dir } = state.sort;
  let result;
  if (key === 'salary') result = a.salary - b.salary;
  else if (key === 'joinDate') result = new Date(a.joinDate) - new Date(b.joinDate);
  else result = String(a[key]).localeCompare(String(b[key]), undefined, { sensitivity: 'base', numeric: true });

  if (result === 0) result = a.fullName.localeCompare(b.fullName, undefined, { sensitivity: 'base' }); // stable order for ties
  return dir === 'asc' ? result : -result;
}

function getVisibleEmployees() {
  const term = state.search.trim().toLowerCase();
  return state.employees
    .filter((e) => !state.department || e.department.toLowerCase() === state.department.toLowerCase())
    .filter((e) => !term || [e.fullName, e.department, e.role].some((v) => v.toLowerCase().includes(term)))
    .sort(compareEmployees);
}

/** Keeps the column-header arrows and the mobile sort menu in step with the current sort. */
function updateSortUi() {
  document.querySelectorAll('.th-btn').forEach((btn) => {
    const active = btn.dataset.sort === state.sort.key;
    btn.closest('th').setAttribute('aria-sort', active ? (state.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none');
  });
  el.sortSelect.value = `${state.sort.key}:${state.sort.dir}`;
}

function setSort(key, dir) {
  state.sort = { key, dir };
  renderTable();
  updateSortUi();
}

function clearFilters() {
  state.search = '';
  state.department = '';
  el.searchInput.value = '';
  el.deptFilter.value = '';
  renderTable();
}

/* ---------- 10. Add / edit form ---------- */
const FORM_FIELDS = ['fullName', 'department', 'role', 'salary', 'joinDate'];

function fieldWrap(name) { return el.employeeForm.querySelector(`[data-field="${name}"]`); }

function setFieldError(name, message) {
  const wrap = fieldWrap(name);
  if (!wrap) return;
  wrap.classList.toggle('has-error', Boolean(message));
  wrap.querySelector('.field-error').textContent = message || '';
  wrap.querySelector('input').setAttribute('aria-invalid', message ? 'true' : 'false');
}

function clearFormErrors() {
  FORM_FIELDS.forEach((name) => setFieldError(name, ''));
  el.formBanner.hidden = true;
  el.formBanner.textContent = '';
}

function showFormBanner(message) {
  el.formBanner.textContent = message;
  el.formBanner.hidden = false;
}

function openAddDialog() {
  el.employeeForm.reset();
  clearFormErrors();
  el.employeeId.value = '';
  el.dialogTitle.textContent = 'Add employee';
  el.saveLabel.textContent = 'Add employee';
  el.employeeForm.elements.joinDate.value = todayInputDate();
  el.employeeDialog.showModal();
  el.employeeForm.elements.fullName.focus();
}

function openEditDialog(id) {
  const emp = state.employees.find((e) => e.id === id);
  if (!emp) return toast('That employee could not be found. Refresh the list and try again.', 'error');

  el.employeeForm.reset();
  clearFormErrors();
  el.employeeId.value = emp.id;
  el.dialogTitle.textContent = 'Edit employee';
  el.saveLabel.textContent = 'Save changes';

  const f = el.employeeForm.elements;
  f.fullName.value = emp.fullName;
  f.department.value = emp.department;
  f.role.value = emp.role;
  f.salary.value = emp.salary;
  f.joinDate.value = toInputDate(emp.joinDate);
  el.employeeDialog.showModal();
  f.fullName.focus();
}

/** Checks the form in the browser before anything is sent to the server. */
function validateForm() {
  const f = el.employeeForm.elements;
  const errors = {};
  const values = {
    fullName: f.fullName.value.trim().replace(/\s+/g, ' '),
    department: f.department.value.trim().replace(/\s+/g, ' '),
    role: f.role.value.trim().replace(/\s+/g, ' '),
    salary: f.salary.value.trim(),
    joinDate: f.joinDate.value,
  };

  if (!values.fullName) errors.fullName = 'Enter the full name.';
  else if (values.fullName.length > 100) errors.fullName = 'Full name must be 100 characters or fewer.';

  if (!values.department) errors.department = 'Enter a department.';
  else if (values.department.length > 100) errors.department = 'Department must be 100 characters or fewer.';

  if (!values.role) errors.role = 'Enter a role or position.';
  else if (values.role.length > 100) errors.role = 'Role must be 100 characters or fewer.';

  // A number input returns '' when the text is not a valid number
  if (f.salary.validity.badInput) errors.salary = 'Salary must be a number.';
  else if (values.salary === '') errors.salary = 'Enter a salary.';
  else if (!Number.isFinite(Number(values.salary))) errors.salary = 'Salary must be a number.';
  else if (Number(values.salary) < 0) errors.salary = 'Salary cannot be negative.';

  if (!values.joinDate) errors.joinDate = 'Choose a join date.';
  else if (Number.isNaN(new Date(values.joinDate).getTime())) errors.joinDate = 'Choose a valid date.';

  return { values, errors };
}

function showFieldErrors(errors) {
  let firstInvalid = null;
  FORM_FIELDS.forEach((name) => {
    if (errors[name]) {
      setFieldError(name, errors[name]);
      if (!firstInvalid) firstInvalid = name;
    }
  });
  if (firstInvalid) el.employeeForm.elements[firstInvalid].focus();
}

async function handleEmployeeSubmit(event) {
  event.preventDefault();
  clearFormErrors();

  const { values, errors } = validateForm();
  if (Object.keys(errors).length > 0) return showFieldErrors(errors);

  const id = el.employeeId.value;
  const payload = { ...values, salary: Number(values.salary) };

  setLoading(el.saveBtn, true);
  try {
    if (id) {
      const result = await api(`/api/employees/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) });
      state.employees = state.employees.map((e) => (e.id === id ? result.data : e));
      toast('Employee updated successfully.', 'success');
    } else {
      const result = await api('/api/employees', { method: 'POST', body: JSON.stringify(payload) });
      state.employees.unshift(result.data);
      toast('Employee added successfully.', 'success');
    }
    el.employeeDialog.close();
    render();
  } catch (err) {
    if (err.status === 401) return; // session ended
    if (err.status === 400 && err.errors) showFieldErrors(err.errors);
    else if (err.status === 409) setFieldError('fullName', err.message);
    else showFormBanner(err.message);
    toast(err.message, 'error');

    // The employee was deleted by someone else while the form was open
    if (err.status === 404) { el.employeeDialog.close(); loadEmployees(); }
  } finally {
    setLoading(el.saveBtn, false);
  }
}

/* ---------- 11. Delete flow ---------- */
function openDeleteDialog(id) {
  const emp = state.employees.find((e) => e.id === id);
  if (!emp) return toast('That employee could not be found. Refresh the list and try again.', 'error');

  state.deleteId = id;
  el.deleteMessage.textContent =
    `${emp.fullName} (${emp.role}, ${emp.department}) will be permanently removed. This cannot be undone.`;
  el.deleteDialog.showModal();
}

async function confirmDelete() {
  const id = state.deleteId;
  if (!id) return;

  setLoading(el.confirmDeleteBtn, true);
  try {
    const result = await api(`/api/employees/${encodeURIComponent(id)}`, { method: 'DELETE' });
    state.employees = state.employees.filter((e) => e.id !== id);
    el.deleteDialog.close();
    render();
    toast(`${result.data.fullName} was deleted.`, 'success');
  } catch (err) {
    if (err.status === 401) return; // session ended
    toast(err.message, 'error');
    if (err.status === 404) { el.deleteDialog.close(); loadEmployees(); } // already gone: refresh the list
  } finally {
    setLoading(el.confirmDeleteBtn, false);
  }
}

/* ---------- 12. Events ---------- */
function bindEvents() {
  // Sign-in / sign-out
  el.loginForm.addEventListener('submit', handleLogin);
  el.loginEmail.addEventListener('input', () => setLoginError(''));
  el.logoutBtn.addEventListener('click', handleLogout);

  // Toolbar
  el.addBtn.addEventListener('click', openAddDialog);
  el.searchInput.addEventListener('input', debounce(() => {
    state.search = el.searchInput.value;
    renderTable();
  }, CONFIG.SEARCH_DELAY_MS));
  el.deptFilter.addEventListener('change', () => {
    state.department = el.deptFilter.value;
    renderTable();
  });

  // Sorting: column headers and the mobile menu
  el.sortSelect.innerHTML = SORT_OPTIONS
    .map((o) => `<option value="${o.key}:${o.dir}">${escapeHtml(o.label)}</option>`).join('');
  el.sortSelect.addEventListener('change', () => {
    const [key, dir] = el.sortSelect.value.split(':');
    setSort(key, dir);
  });
  document.querySelectorAll('.th-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.sort;
      const dir = state.sort.key === key && state.sort.dir === 'asc' ? 'desc' : 'asc';
      setSort(key, dir);
    });
  });

  // Row buttons (Edit / Delete) and state-box buttons (Try again / Add / Clear)
  el.tableBody.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    if (button.dataset.action === 'edit') openEditDialog(button.dataset.id);
    if (button.dataset.action === 'delete') openDeleteDialog(button.dataset.id);
  });
  el.stateBox.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    if (button.dataset.action === 'retry') loadEmployees();
    if (button.dataset.action === 'add') openAddDialog();
    if (button.dataset.action === 'clear') clearFilters();
  });

  // Add / edit form
  el.employeeForm.addEventListener('submit', handleEmployeeSubmit);
  el.employeeForm.addEventListener('input', (event) => {
    const wrap = event.target.closest('[data-field]');
    if (wrap) setFieldError(wrap.dataset.field, '');
    el.formBanner.hidden = true;
  });

  // Delete confirmation
  el.confirmDeleteBtn.addEventListener('click', confirmDelete);

  // Dialogs: close buttons, click on the dark backdrop, and no closing while saving
  document.querySelectorAll('dialog').forEach((dialog) => {
    dialog.addEventListener('click', (event) => {
      const busy = dialog.querySelector('.is-loading');
      if (busy) return;
      if (event.target === dialog || event.target.closest('[data-close]')) dialog.close();
    });
    dialog.addEventListener('cancel', (event) => {
      if (dialog.querySelector('.is-loading')) event.preventDefault(); // Escape key
    });
  });
  el.deleteDialog.addEventListener('close', () => { state.deleteId = null; });
}

/* ---------- 13. Start-up ---------- */
async function init() {
  bindEvents();
  updateSortUi();

  // No saved session: go straight to sign-in
  if (!state.token) return showView('login');

  // A saved session exists: confirm with the server that it is still valid
  try {
    const result = await api('/api/auth/me');
    state.email = result.data.email;
    store.set(STORAGE.email, state.email);
    enterApp();
  } catch (err) {
    if (err.status === 401) return; // api() already returned the user to sign-in
    showView('login');
    setLoginError(err.message); // e.g. the server is not running
  }
}

init();
