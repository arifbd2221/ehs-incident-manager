# EHS Incident Management System — Design System & Conventions

## Project Overview

EHS (Environmental Health & Safety) incident management platform. React 18 + Vite frontend, Express + SQLite (better-sqlite3) backend, JWT auth.

```
client/                    # Vite React SPA
  src/
    api/                   # Axios API modules (one per domain)
    components/layout/     # Sidebar, TopBar
    components/shared/     # Icon, Badges, BodyMap3D
    context/               # AuthContext, AppContext
    pages/                 # Page components (folder per domain)
    styles/                # CSS files (one per page + shared)
server/                    # Express API
  db/                      # schema.sql, connection.js, migrate.js, seed.js
  db/migrations/           # Numbered SQL migrations
  middleware/              # auth.js, upload.js, errorHandler.js
  routes/                  # Express route files (one per domain)
```

**Run dev:** `cd client && npm run dev` (port 5173) | `cd server && node --watch index.js` (port 3001)

---

## Design Tokens

**Source of truth:** `client/src/styles/colors_and_type.css` — all tokens are CSS custom properties on `:root`.

### When to use which token

| Need | Token | Value |
|------|-------|-------|
| Page titles, headings | `--sds-fg-heading` | #1A1A1A |
| Body text | `--sds-fg-primary` | rgba(0,0,0,0.87) |
| Labels, secondary text | `--sds-fg-secondary` | #52525F |
| Captions, metadata | `--sds-fg-tertiary` | #666A72 |
| Muted/disabled text | `--sds-fg-muted` / `--sds-fg-disabled` | |
| Primary actions, links | `--sds-brand-primary` | #626DF9 |
| Hover state on primary | `--sds-brand-primary-hover` | rgba(98,109,249,0.8) |
| Selected/active tint | `--sds-brand-primary-tint` | rgba(98,109,249,0.08) |
| Focus ring | `--sds-brand-primary-light` | rgba(98,109,249,0.1) |
| Page background | `--sds-bg-page` | #F2F5F7 |
| Card/modal surface | `--sds-bg-surface` | #FFFFFF |
| Alternate surface | `--sds-bg-surface-alt` | #F8F9FB |
| Borders | `--sds-border` | #E0E0E0 |
| Input borders | `--sds-border-input` | rgba(0,0,0,0.23) |
| Error | `--sds-error` | #D32F2F |
| Success | `--sds-success` | #2E7D32 |
| Warning | `--sds-warning` | #ED6C02 |
| Info | `--sds-info` | #0DB4F0 |

### Spacing (8px base)

`--sds-space-xs` 4px | `--sds-space-sm` 8px | `--sds-space-md` 16px | `--sds-space-lg` 24px | `--sds-space-xl` 32px | `--sds-space-2xl` 48px

### Border Radius

| Token | Value | Use for |
|-------|-------|---------|
| `--sds-radius-xs` | 4px | Badges, tags |
| `--sds-radius-sm` | 5px | Inputs, small buttons |
| `--sds-radius-md` | 8px | Cards, buttons, dropdowns |
| `--sds-radius-lg` | 10px | Large cards, panels |
| `--sds-radius-xl` | 15px | Dialogs |
| `--sds-radius-2xl` | 20px | Modal containers |
| `--sds-radius-pill` | 50px | Pill badges |

### Shadows

- `--sds-shadow-card` — Cards: `rgba(58,53,65,0.1) 0 2px 10px 0`
- `--sds-shadow-elevated` — Elevated elements (3-layer MUI shadow)
- `--sds-shadow-primary-glow` — Primary button hover glow

### Z-Index Scale

`--sds-z-sidebar` 100 | `--sds-z-header` 200 | `--sds-z-dropdown` 300 | `--sds-z-modal-backdrop` 400 | `--sds-z-modal` 500 | `--sds-z-tooltip` 600 | `--sds-z-toast` 700

### Typography

- **Font:** `'Montserrat', Arial, sans-serif` via `--sds-font-family`
- **Mono:** `'SF Mono', Menlo, monospace` (used for IDs, timestamps, metadata)
- **Weights:** 400 regular, 500 medium, 600 semibold, 700 bold

---

## Component Patterns

### Buttons

```html
<button class="btn btn-primary">Primary</button>
<button class="btn btn-secondary">Secondary</button>
<button class="btn btn-tertiary">Tertiary</button>
<button class="btn btn-text">Text</button>
<button class="btn btn-danger">Danger</button>
<button class="btn btn-sm">Small</button>
<button class="btn btn-lg">Large</button>
```

All buttons: 13px, font-weight 600, border-radius 8px, `scale(0.97)` on `:active`.

### Forms

```html
<div class="field">
  <label class="label">Label <span class="req">*</span></label>
  <input class="input" />
  <span class="helper">Helper text</span>
</div>

<div class="field-row">       <!-- 2-col grid -->
  <div class="field">...</div>
  <div class="field">...</div>
</div>

<div class="field-row-3">     <!-- 3-col grid -->
```

- `.input`, `.select`, `.textarea` share the same styling
- Focus state: 2px brand-primary border + `box-shadow: 0 0 0 2px var(--sds-brand-primary-light)`
- `.textarea`: `min-height: 110px`, `resize: vertical`

### Cards

```html
<div class="card card-pad">
  <div class="card-h">Heading <span class="more">View all</span></div>
  <!-- content -->
</div>
```

### Stat Cards

```html
<div class="stat-grid">
  <div class="stat">
    <div class="stat-row">
      <div>
        <div class="lbl">OPEN INCIDENTS</div>
        <div class="val">12</div>
        <div class="sub"><span class="up">+3</span> this week</div>
      </div>
      <div class="stat-icon"><Icon name="incidents" size={18} /></div>
    </div>
  </div>
</div>
```

### Modals

**CRITICAL:** Always render modals via `createPortal(jsx, document.body)`. The `.page` class has a CSS `transform` animation that breaks `position: fixed` on descendants.

```jsx
import { createPortal } from 'react-dom';

{showModal && createPortal(
  <div className="modal-backdrop" onClick={close}>
    <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
      <div className="modal-h">
        <div>
          <div className="modal-title">Title</div>
          <div className="modal-sub">Subtitle</div>
        </div>
        <button className="icon-btn" onClick={close}>
          <Icon name="close" size={18} />
        </button>
      </div>
      <div className="modal-body">
        {/* form fields */}
      </div>
      <div className="modal-f">
        <button className="btn btn-secondary" onClick={close}>Cancel</button>
        <button className="btn btn-primary">Save</button>
      </div>
    </div>
  </div>,
  document.body
)}
```

- `.modal` = 480px | `.modal-lg` = 600px
- Entrance: `modalSpring` animation (scale 0.96→1, translateY 16→0)
- Backdrop: `rgba(26,26,26,0.45)` with `fadeIn`

### Pills / Badges

```html
<span class="pill pill-success"><span class="dot"></span> Active</span>
<span class="pill pill-warn">Warning</span>
<span class="pill pill-err">Critical</span>
<span class="pill pill-info">Info</span>
<span class="pill pill-purple">Purple</span>
<span class="pill pill-gray">Gray</span>
```

### Status Dots (animated)

Three shared animations using `--dot-glow` CSS variable for color:

```css
/* Pulse — expanding ring (active states) */
style="--dot-glow: rgba(30,136,229,0.4)"
animation: dotPulse 2s infinite

/* Blink — fade in/out (urgent states) */
animation: dotBlink 1.5s infinite

/* Breathe — scale in/out (waiting states) */
animation: dotBreathe 2s infinite
```

### Tables

```html
<table class="tbl">
  <thead>
    <tr><th>ID</th><th>Title</th></tr>
  </thead>
  <tbody>
    <tr>
      <td class="id">INC-001</td>
      <td>Title <div class="meta">metadata</div></td>
    </tr>
  </tbody>
</table>
```

### Icon Button

```html
<button class="icon-btn">
  <Icon name="bell" size={20} />
  <span class="badge-dot"></span>      <!-- red dot -->
  <span class="badge-count">3</span>   <!-- numbered badge -->
</button>
```

38x38px, border-radius 8px, hover: `rgba(0,0,0,0.04)` bg. `.is-open` class for active state.

### Toast

```html
<div class="toast"><Icon name="check" size={16} /> Saved successfully</div>
```

Fixed bottom-center, pill-shaped, dark background, auto-animated in.

---

## Icons

Use: `<Icon name="..." size={N} color="..." />`

Available names: `dashboard`, `incidents`, `plus`, `investigation`, `capa`, `reports`, `settings`, `bell`, `help`, `search`, `arrow`, `arrowL`, `check`, `close`, `download`, `export`, `upload`, `file`, `photo`, `mic`, `person`, `location`, `clock`, `phone`, `shield`, `warning`, `info`, `filter`, `sort`, `more`, `edit`, `gear`, `leaf`, `eye`, `factory`, `fire`, `pulse`

Falls back to `help` icon if name not found. Default size 20, default color `currentColor`.

---

## Shared Components

### Badges (`components/shared/Badges.jsx`)

```jsx
import { TypePill, SevBadge, TrackBadge, sevName, typeOf, TYPES } from '../shared/Badges';

<TypePill tid="injury" />      // Colored pill with incident type
<SevBadge s={3} />             // "S3 Moderate" badge
<TrackBadge t="A" />           // Track A/B/C badge
sevName(2)                     // "S2 Major"
typeOf('nearmiss')             // { id, name, desc, color }
```

**Incident types:** `injury`, `illness`, `nearmiss`, `property`, `env`, `unsafe`, `observation`, `dangerous`

---

## Animation Rules

### Spring curve (primary)

```css
cubic-bezier(0.34, 1.56, 0.64, 1)
```

Use for: page entrances, modals, panels, nav indicators, card interactions, any element entering the viewport. This is the signature motion of the app.

### Standard ease (secondary)

```css
cubic-bezier(0.4, 0, 0.2, 1)
```

Use for: subtle transitions, toasts, opacity fades.

### Staggered animations

For lists of items entering the DOM, use incremental `animation-delay`:

```css
.item { animation: slideIn 250ms ease both; }
.item:nth-child(1) { animation-delay: 50ms; }
.item:nth-child(2) { animation-delay: 100ms; }
.item:nth-child(3) { animation-delay: 150ms; }
```

Or via inline style: `style={{ animationDelay: '50ms' }}`

### Existing keyframes (reuse, don't duplicate)

| Keyframe | Duration | Curve | Use |
|----------|----------|-------|-----|
| `pageEnter` | 350ms | spring | Page wrapper entrance |
| `modalSpring` | 300ms | spring | Modal entrance |
| `fadeIn` | 120ms | ease-out | Backdrops |
| `slideUp` | - | ease | Generic slide up |
| `dotPulse` | 2s | infinite | Active status dots |
| `dotBlink` | 1.5s | infinite | Urgent status dots |
| `dotBreathe` | 2s | infinite | Waiting status dots |

---

## Layout Structure

```
┌──────────────────────────────────────────┐
│ .shell (flex row, 100vh)                 │
│ ┌────────┬───────────────────────────────┤
│ │.sidebar│ .main (flex col, flex:1)      │
│ │ 80px   │ ┌─────────────────────────────┤
│ │        │ │ TopBar (.topbar-wrap)       │
│ │ nav    │ ├─────────────────────────────┤
│ │ items  │ │ <Outlet /> → .page wrapper │
│ │        │ │ (page content here)         │
│ │        │ │                             │
│ └────────┴─┴─────────────────────────────┘
```

Every page component should be wrapped in `<div className="page">` (or a page-specific variant like `sites-page`). The `.page` class provides consistent padding and the `pageEnter` animation.

---

## CSS Conventions

### File organization

- `colors_and_type.css` — Design tokens only (never put component styles here)
- `styles.css` — Shared components: layout, nav, topbar, buttons, forms, cards, modals, pills, tables, toasts, search, help, notifications, login, register, profile
- One CSS file per page: `incidents.css`, `investigations.css`, `capas.css`, `dashboard.css`, `reports.css`, `sites.css`, `wizard.css`, `bodymap.css`

### Naming

- Shared classes: short descriptive names (`.btn`, `.card`, `.pill`, `.tbl`, `.field`)
- Page-scoped classes: 2-4 letter prefix (e.g. `sm-` for sites modal, `idet-` for incident detail, `wiz-` for wizard, `sr-` for search results)
- No CSS modules or CSS-in-JS — plain class-based CSS
- Avoid generic names without prefix in page CSS files — they will leak globally

### What NOT to do

1. **Never use `position: fixed` inside `.page`** — the `pageEnter` animation's `transform` breaks it. Use `createPortal(jsx, document.body)` instead.
2. **Never redefine shared classes** (`.icon-btn`, `.btn`, `.input`, etc.) in page CSS files. Scope overrides: `.my-page .icon-btn { ... }`.
3. **Never use undefined CSS variables.** The design system uses `--sds-fg-*` for text, NOT `--sds-text-*`. Always reference `colors_and_type.css`.
4. **Never duplicate `@keyframes`** already defined in `styles.css`. Reuse them.
5. **Never use inline styles for anything tokenized** (colors, spacing, radii, shadows). Use CSS variables.
6. **Never hardcode colors** — use semantic tokens. Exception: `#fff` for card/modal backgrounds is acceptable as it matches `--sds-bg-surface`.

---

## Frontend Architecture

### Routing

All protected routes are wrapped in `ProtectedLayout` which provides Sidebar + TopBar. Public routes: `/login`, `/register`.

### State Management

- **AuthContext:** `user`, `loading`, `login()`, `register()`, `updateUser()`, `logout()`
- **AppContext:** `wizardOpen`, `setWizardOpen()`, `refreshKey`, `triggerRefresh()`
- No Redux/Zustand — local state + context only

### API Pattern

All API modules are in `client/src/api/`. Each exports async functions that return `Promise<data>`:

```javascript
import api from './client';
export const getThings = (params) => api.get('/things', { params }).then(r => r.data);
export const createThing = (data) => api.post('/things', data).then(r => r.data);
```

The Axios client (`client.js`) auto-attaches JWT from localStorage and handles 401→logout.

### Available API modules

| Module | Key exports |
|--------|-------------|
| `auth.js` | `login`, `register`, `getMe`, `getSites`, `updateProfile`, `changePassword` |
| `incidents.js` | `getIncidents`, `getIncident`, `createIncident`, `updateIncident`, `assignIncident`, `escalateIncident`, `closeIncident`, `uploadAttachments` |
| `investigations.js` | `getInvestigations`, `getInvestigation`, `updateInvestigation`, `addFiveWhy`, `deleteFiveWhy`, `addTeamMember`, `closeInvestigation`, `assignCapa` |
| `capas.js` | `getCapas`, `getCapa`, `updateCapa`, `completeCapa`, `verifyCapa`, `rejectCapa` |
| `reports.js` | `getOsha300`, `getOsha300A`, `getOsha301`, `getRiddor`, `getMetrics` |
| `dashboard.js` | `getDashboard` |
| `notifications.js` | `getNotifications`, `markRead`, `markAllRead` |
| `search.js` | `globalSearch` |
| `sites.js` | `listSites`, `getSite`, `createSite`, `updateSite`, `deleteSite` |
| `users.js` | `getUsers`, `getSites` |

---

## Backend Conventions

### Server setup

- Port 3001, CORS allows `localhost:5173`
- All routes under `/api` prefix
- Auth middleware on all routes except `/api/auth`

### Route file pattern

```javascript
import { Router } from 'express';
import db from '../db/connection.js';
const router = Router();

router.get('/', (req, res) => {
  const { org_id } = req.user;
  // always scope queries by org_id
  const rows = db.prepare('SELECT * FROM things WHERE org_id = ?').all(org_id);
  res.json({ things: rows });
});

export default router;
```

### Response shapes

- **Success:** `{ things: [...], total, page, limit }` for lists, `{ ...thing }` for singles
- **Created:** 201 status with `{ id, ... }`
- **Error:** `{ error: "message" }` with appropriate status (400/401/403/404/409)

### Role-based access

Elevated roles (can mutate status, severity, assignments): `supervisor`, `ehs_officer`, `ehs_manager`, `admin`

```javascript
const ELEVATED = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);
if (!ELEVATED.has(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
```

### Migrations

- Numbered SQL files in `server/db/migrations/` (e.g. `001_phase2_tables.sql`)
- Tracked in `_schema_migrations` table, applied once in lexical order
- Run automatically on server start via `runMigrations(db)` in `connection.js`
- Use `PRAGMA defer_foreign_keys = ON` for table rebuilds

### Key architectural rules

- **Always scope by org_id** — no cross-org data access
- **Activity logging** — all state changes logged to `activity_log` table
- **CAPA owner != verifier** — enforced by DB trigger
- **Polymorphic attachments** — `entity_type` + `entity_id` pattern
- **Auto-severity** — calculated from `likelihood * consequence` matrix on incident creation

---

## Data Flow: Incident Lifecycle

```
Report → [New] → Assign → [Triage] → Escalate → [Investigating]
  → Investigation → Assign CAPA → [Awaiting CAPA]
    → CAPA Complete → Verify → [Closed]
```

Track C incidents may auto-close on creation.

---

## Adding a New Page (Checklist)

1. Create page component in `client/src/pages/`
2. Create CSS file in `client/src/styles/` with page-scoped prefix
3. Add route in `App.jsx` inside `ProtectedLayout`
4. Add nav item in `Sidebar.jsx` NAV array
5. Add API module in `client/src/api/` if new backend endpoints
6. Add backend route in `server/routes/`, mount in `index.js`
7. Wrap page content in `<div className="page">`
8. Use `createPortal` for any modals
9. Use existing component classes (`.btn`, `.field`, `.card`, etc.)
10. Add page tips in TopBar's `PAGE_TIPS` object
