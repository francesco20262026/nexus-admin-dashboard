# Nexus CRM

A production-grade CRM (Customer Relationship Management) platform built for business management.

## Tech Stack

- **Frontend**: Vanilla HTML + CSS + JavaScript (no frameworks)
- **Backend**: Python + FastAPI
- **Database**: PostgreSQL via Supabase
- **Auth**: JWT tokens

## Architecture

- Single unified server (`server.py`) serves both the static frontend and FastAPI backend on port 5000
- Frontend assets are in `assets/` (CSS, JS, locales)
- HTML pages are at the project root
- Backend code lives in `backend/`

## Project Structure

```
/                     — HTML pages (index, login, admin_*, client_*)
/assets/css/          — Stylesheets (site.css, dash.css, login.css)
/assets/js/           — JavaScript (api.js, auth.js, ui.js, i18n.js, page-specific)
/assets/locales/      — i18n translations (en.json, it.json)
/backend/             — FastAPI backend
  config.py           — Settings (reads from env vars / .env)
  database.py         — Supabase client
  main.py             — Original standalone backend entry (not used in Replit)
  auth/               — JWT authentication
  modules/            — Feature modules (clients, invoices, contracts, etc.)
  routers/            — Health, jobs, webhooks
  jobs/               — Scheduled tasks (payment reminders, renewal alerts)
  core_services/      — PDF generation, email service
  integrations/       — Zoho Sign, Windoc
  migrations/         — SQL migration files
/server.py            — Unified entry point for Replit (serves frontend + backend on :5000)
/components/          — Shared HTML components
```

## Running the App

The workflow `Start application` runs `python server.py` on port 5000.

## Required Secrets

Set these in the Replit Secrets panel:

| Secret | Description |
|--------|-------------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `SUPABASE_ANON_KEY` | Supabase anon/public key |
| `JWT_SECRET` | Secret key for signing JWT tokens |
| `SENDGRID_API_KEY` | (Optional) SendGrid key for email notifications |

## Notes

- The app runs in Italian by default (i18n support for EN/IT)
- PDF generation (WeasyPrint) requires OS-level pango/cairo libraries — non-critical for most features
- Without Supabase credentials, the frontend loads but API calls will fail
