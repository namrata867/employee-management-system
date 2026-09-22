# PeopleDesk - Employee Management System

A full-stack CRUD web app for HR teams. Visitors first see a sign-in screen and can only open the dashboard with an authorised HR email address.

- **Frontend:** HTML5, CSS3, vanilla JavaScript (Fetch API)
- **Backend:** Node.js + Express.js (REST API, CORS enabled)
- **Database:** MongoDB with Mongoose

## Features

- HR email sign-in gate (only emails listed in `.env` can enter)
- Employee table that is searchable, sortable and filterable by department
- Add, edit and delete employees, with a confirmation dialog before deleting
- Form validation in the browser **and** on the server
- Loading indicators, error messages, empty states and toast notifications for every action
- Duplicate protection (same name + department + role, case-insensitive)
- Responsive layout: the table becomes a list of cards on phones

## Project structure

```
employee-management-system/
├── frontend/
│   ├── index.html          Sign-in screen, dashboard, form and dialogs
│   ├── style.css           All styling (responsive)
│   └── app.js              Sign-in, API calls, table, form, toasts
├── backend/
│   ├── server.js           Express app, CORS, MongoDB connection, error handling
│   ├── routes/
│   │   ├── auth.js         POST /api/auth/login, GET /api/auth/me
│   │   └── employees.js    CRUD endpoints + validation
│   ├── models/
│   │   └── Employee.js     Mongoose schema
│   ├── middleware/
│   │   └── auth.js         Checks the login token on every employee request
│   └── .env                Your settings (port, database, HR emails, secret)
├── package.json
└── README.md
```

The Express server also serves the `frontend` folder, so **one command runs the whole app**.

## Setup

### 1. Requirements

- [Node.js](https://nodejs.org) 18 or newer
- MongoDB, either
  - installed locally ([download](https://www.mongodb.com/try/download/community)) and running, or
  - a free cloud database on [MongoDB Atlas](https://www.mongodb.com/atlas) (copy its connection string)

### 2. Install

```bash
cd employee-management-system
npm install
```

### 3. Configure `backend/.env`

Open `backend/.env` and set at least these two values:

```env
HR_EMAILS=your.name@yourcompany.com,another.hr@yourcompany.com
JWT_SECRET=paste-a-long-random-string-here
```

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

If you use MongoDB Atlas, also replace `MONGODB_URI` with your Atlas connection string.

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | Port for the app and API | `5000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://127.0.0.1:27017/employee_management` |
| `HR_EMAILS` | Comma-separated list of emails allowed to sign in | `hr@company.com,admin@company.com` |
| `JWT_SECRET` | Secret that signs login tokens (**required**) | sample value, change it |
| `JWT_EXPIRES_IN` | How long a sign-in lasts | `8h` |
| `CORS_ORIGIN` | Allowed browser origins, or `*` for any | `*` |

### 4. Run

```bash
npm start          # normal
npm run dev        # auto-restart when you edit backend files
```

Open **http://localhost:5000**, enter one of the emails from `HR_EMAILS`, and the dashboard opens.

## How HR sign-in works

1. The visitor enters an email on the first screen.
2. The browser sends it to `POST /api/auth/login`.
3. The server checks it against `HR_EMAILS` (case-insensitive). If it is on the list, the server returns a signed token that lasts `JWT_EXPIRES_IN`.
4. The browser sends that token with every request. All `/api/employees` routes return `401` without it.
5. **Sign out**, or an expired token, returns the visitor to the sign-in screen.

Removing an email from `HR_EMAILS` (and restarting) locks that person out immediately, even if they are already signed in. After 10 failed attempts from one IP address, sign-in is blocked for 15 minutes.

> **Important:** this checks that the email is on the approved list, but it does not prove the person *owns* that email. Anyone who knows an HR address could type it in. That is fine for a demo, an internal network or a course project. For real HR data, add a one-time code sent to the email (for example with `nodemailer`) or use a login provider such as Google or Microsoft sign-in.

## API reference

Base URL: `http://localhost:5000/api`. Every response is JSON with a `success` flag and, on errors, a `message`.

| Method | Endpoint | Auth | Description | Success |
|---|---|---|---|---|
| POST | `/auth/login` | - | Sign in with an HR email | 200 |
| GET | `/auth/me` | Token | Check the current token | 200 |
| POST | `/employees` | Token | Add an employee | 201 |
| GET | `/employees` | Token | List all employees (newest first) | 200 |
| GET | `/employees/:id` | Token | Get one employee | 200 |
| PUT | `/employees/:id` | Token | Update an employee (send all fields) | 200 |
| DELETE | `/employees/:id` | Token | Delete an employee | 200 |
| GET | `/health` | - | Server and database status | 200 |

### Employee object

```json
{
  "id": "66f0c1e2a4b3c5d6e7f80912",
  "fullName": "Priya Sharma",
  "department": "Engineering",
  "role": "Software Engineer",
  "salary": 65000,
  "joinDate": "2024-03-15T00:00:00.000Z",
  "createdAt": "2026-09-20T09:30:00.000Z",
  "updatedAt": "2026-09-20T09:30:00.000Z"
}
```

### Validation rules

| Field | Rule |
|---|---|
| `fullName`, `department`, `role` | Required, at most 100 characters (extra spaces are trimmed) |
| `salary` | Required, must be a number, cannot be negative (rounded to 2 decimals) |
| `joinDate` | Required, valid date, not before 1950, not more than 1 year in the future |

### Status codes

| Code | Meaning |
|---|---|
| 200 / 201 | Success / created |
| 400 | Invalid input, invalid id or invalid JSON (`errors` lists each field) |
| 401 | Not signed in, token expired, or email is not an HR account |
| 404 | Employee or endpoint not found |
| 409 | Duplicate employee (same name, department and role) |
| 429 | Too many failed sign-in attempts |
| 503 | Database unavailable |
| 500 | Unexpected server error |

### Try it with curl

```bash
# 1. Sign in and keep the token
curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"hr@company.com"}'
# copy the "token" value from the response
TOKEN="paste-token-here"

# 2. Add an employee
curl -s -X POST http://localhost:5000/api/employees \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"fullName":"Priya Sharma","department":"Engineering","role":"Software Engineer","salary":65000,"joinDate":"2024-03-15"}'

# 3. List, update, delete (replace ID with the "id" from step 2)
curl -s http://localhost:5000/api/employees -H "Authorization: Bearer $TOKEN"

curl -s -X PUT http://localhost:5000/api/employees/ID \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"fullName":"Priya Sharma","department":"Engineering","role":"Senior Engineer","salary":80000,"joinDate":"2024-03-15"}'

curl -s -X DELETE http://localhost:5000/api/employees/ID -H "Authorization: Bearer $TOKEN"
```

The same requests work in Postman or Insomnia: sign in first, then add `Authorization: Bearer <token>` to each request.

## Manual test checklist

- [ ] Opening the site shows the sign-in screen, not the dashboard
- [ ] A non-HR email shows "This email is not registered as an HR account."
- [ ] An HR email opens the dashboard; refreshing the page keeps you signed in
- [ ] Sign out returns to the sign-in screen
- [ ] Adding an employee with empty fields or a non-numeric salary shows field errors
- [ ] Adding a valid employee shows a success toast and a new row
- [ ] Adding the same name, department and role again shows a duplicate message
- [ ] Edit opens a pre-filled form; saving updates the row
- [ ] Delete asks for confirmation; "Keep employee" cancels, "Delete employee" removes the row
- [ ] Search, department filter and column sorting work
- [ ] Stop MongoDB or the server: the list shows an error with a "Try again" button
- [ ] Narrow the browser window below 760px: rows become cards and sorting moves to a menu

## Customising

- **Currency and date format:** edit `CONFIG.CURRENCY` and `CONFIG.LOCALE` at the top of `frontend/app.js` (for example `INR` / `en-IN`).
- **Brand name and colours:** the name appears in `frontend/index.html`; colours are variables at the top of `frontend/style.css`.
- **Duplicate rule:** change the unique index in `backend/models/Employee.js` (for example, add `joinDate`).

## Troubleshooting

| Problem | Fix |
|---|---|
| `Could not connect to MongoDB` on start | Start MongoDB, or check `MONGODB_URI` (Atlas: allow your IP address in Network Access) |
| `JWT_SECRET is missing` | Add `JWT_SECRET=...` to `backend/.env` |
| "This email is not registered as an HR account" | Add the email to `HR_EMAILS` in `backend/.env` and restart the server |
| "Cannot reach the server" in the browser | Make sure `npm start` is running and you opened `http://localhost:5000` |
| Port already in use | Change `PORT` in `backend/.env` |
| Opening `index.html` by double-click | Use `http://localhost:5000` instead; the app needs the server for sign-in |
