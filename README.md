# EHS Incident Manager

A full-stack Environmental Health & Safety (EHS) incident management system. Report incidents, run root-cause investigations with 5-Why analysis, track corrective/preventive actions (CAPAs), and generate OSHA 300/300A and RIDDOR compliance reports — all from one platform.

## Tech Stack

- **Frontend** — React 18, Vite, React Router v6, Axios
- **Backend** — Express 4, better-sqlite3, JWT auth, Multer (file uploads)
- **Database** — SQLite (zero-config, file-based)

## Prerequisites

- **Node.js** >= 18 (tested on v22)
- **npm** >= 9
- **Python 3 + build tools** (only if `better-sqlite3` needs to compile native bindings)
  - macOS: `xcode-select --install`
  - Ubuntu/Debian: `sudo apt install python3 make g++`

## Quick Start

### 1. Clone

```bash
git clone git@github.com:arifbd2221/ehs-incident-manager.git
cd ehs-incident-manager
```

### 2. Environment

```bash
cp .env.example server/.env
```

Edit `server/.env` if needed. The defaults work out of the box for local development.

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `JWT_SECRET` | — | Any random string (change in production) |
| `UPLOAD_DIR` | `./uploads` | File upload directory |
| `DB_PATH` | `./db/incident_management.db` | SQLite database path |

### 3. Install Dependencies

```bash
# Root (concurrently for dev mode)
npm install

# Server
cd server && npm install && cd ..

# Client
cd client && npm install && cd ..
```

### 4. Seed the Database

```bash
npm run seed
```

This creates the SQLite database with schema, sample data, and demo users.

### 5. Run in Development

```bash
npm run dev
```

This starts both servers concurrently:
- **Frontend** — http://localhost:5173
- **Backend API** — http://localhost:3001

The Vite dev server proxies `/api` and `/uploads` requests to the backend automatically.

### 6. Login

Use any of the demo accounts (all use password `password123`):

| Email | Role |
|-------|------|
| `elena@sdsmanager.com` | EHS Lead |
| `marcus@sdsmanager.com` | Supervisor |
| `james@sdsmanager.com` | EHS Manager |
| `mehta@sdsmanager.com` | Occupational Health |

## Production Build

```bash
# Build the client
npm run build

# Start the server (serves the built client)
npm start
```

The app runs on `http://localhost:3001` in production mode.

## Docker

```bash
docker compose up --build
```

The app will be available at `http://localhost:3001`. Database and uploads are persisted in Docker volumes.

> **Note:** Update `JWT_SECRET` in `docker-compose.yml` before deploying.

## Project Structure

```
├── client/                 # React frontend
│   ├── src/
│   │   ├── api/            # Axios API clients
│   │   ├── components/     # Shared components (Icon, Badges, Sidebar, TopBar)
│   │   ├── context/        # Auth & App context providers
│   │   ├── pages/          # Page components
│   │   │   ├── capas/      # CAPA list + detail
│   │   │   ├── incidents/  # Incidents list + detail + modals
│   │   │   ├── investigations/ # Investigations board + detail + modals
│   │   │   ├── reports/    # OSHA 300/300A, RIDDOR, Metrics
│   │   │   └── wizard/     # Incident reporting wizard
│   │   ├── styles/         # CSS per feature
│   │   └── utils/          # Date/time helpers
│   └── vite.config.js
├── server/
│   ├── db/
│   │   ├── connection.js   # SQLite connection
│   │   ├── schema.sql      # Database schema
│   │   └── seed.js         # Demo data seeder
│   ├── middleware/          # Auth, error handling, file upload
│   ├── routes/             # Express route handlers
│   ├── services/           # Classification, metrics, numbering, regulatory
│   └── index.js            # Server entry point
├── .env.example
├── docker-compose.yml
├── Dockerfile
└── package.json            # Root scripts (dev, build, seed)
```

## Features

- **Dashboard** — KPI cards (TRIR, DART, open incidents, overdue CAPAs), donut chart, track pipeline, activity feed
- **Incident Reporting** — Full-screen wizard with live preview, 8 incident types, auto-classification by severity and track (A/B/C)
- **Incidents** — Card-based list with severity bands, search, filters, detail view with triage recommendations
- **Investigations** — Kanban board + list view, 5-Why root cause analysis chain, findings, evidence, team management
- **CAPA** — Kanban board with progress tracking, owner/verifier separation, milestone checklist, overdue flagging
- **Reports** — OSHA 300 log, OSHA 300A annual summary, RIDDOR F2508, safety metrics (TRIR, DART, severity rate)
- **Compliance** — OSHA recordable flagging, RIDDOR reportable detection, regulatory alert badges
