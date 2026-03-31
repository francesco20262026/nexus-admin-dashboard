You are working on a production-grade software project.

This is NOT a demo.
This is NOT a prototype.
This is a real system used daily.

----------------------------------
GLOBAL EXECUTION RULE
----------------------------------

Apply the core rules first.

Then execute the task.

If there is any conflict:
- the core rules ALWAYS win

----------------------------------
CORE RULES (NON-NEGOTIABLE)
----------------------------------

1. SINGLE SOURCE OF TRUTH
- Use ONLY the provided template/design/system
- Do NOT invent UI
- Do NOT change spacing, colors, or components
- If something is missing → reuse closest existing component

2. NO IMPROVISATION
- Do NOT guess structure
- Do NOT create alternative patterns
- Follow existing architecture strictly

3. SEPARATION OF CONCERNS
- HTML → structure only
- CSS → styles only (no inline styles)
- JS → logic only (external files only)
- Backend → business logic only

4. NO DUPLICATION
- No repeated logic
- No repeated API calls
- No copy-paste across files
- Shared logic must be centralized

5. API LAYER (MANDATORY)
- All API calls must go through a centralized API module
- No direct fetch calls in pages

6. CONSISTENT UI
- Same layout across all pages
- Same components (cards, buttons, tables)
- Same spacing system
- Same interaction patterns

7. I18N (MANDATORY)
- No hardcoded visible text
- HTML → data-i18n
- JS → translation function
- All keys must exist in all languages

8. UI STATES (MANDATORY)
Every component must handle:
- loading
- empty
- error

No broken UI allowed.

9. CLEAN CODE
- Remove unused code
- Remove temporary scripts
- No dead CSS
- No unused files
- Keep project clean after every change

10. PERFORMANCE FIRST
- UI must render instantly
- Data must load asynchronously
- Never block rendering waiting for API

11. UX QUALITY
- No UI blocking
- No layout jumps
- No white flashes
- Smooth and fast interactions

----------------------------------
ARCHITECTURE STANDARD
----------------------------------

Tech stack:
- Frontend → HTML + CSS + Vanilla JS
- Backend → Python + FastAPI
- Database → PostgreSQL (Supabase)

Forbidden:
- React
- Vue
- Angular
- Tailwind
- CSS frameworks
- Inline styles
- Build tools

----------------------------------
PROJECT STRUCTURE
----------------------------------

Frontend:
- HTML pages (structure only)
- CSS:
  - site.css → landing
  - dash.css → dashboard
- JS:
  - api.js
  - auth.js
  - ui.js
  - i18n.js
  - page-specific JS

Backend:
- main.py → bootstrap only
- modules/ → business logic
- services/
- integrations/
- jobs/

----------------------------------
FRONTEND RULES
----------------------------------

HTML:
- no inline styles
- no inline scripts
- semantic only

CSS:
- only in site.css or dash.css
- no duplication

JS:
- external files only
- shared logic centralized
- no helper duplication

AUTH (MANDATORY):
Each page must start with:

Auth.guard('admin') or Auth.guard('client')

----------------------------------
API STANDARD
----------------------------------

All API calls must go through api.js

Example:
API.Clients.list()
API.Invoices.markPaid(id)

No direct fetch allowed.

----------------------------------
I18N STANDARD
----------------------------------

HTML:
<h1 data-i18n="dashboard.title"></h1>

JS:
I18n.t("dashboard.title")

No visible hardcoded text.

----------------------------------
PERFORMANCE SYSTEM (MANDATORY)
----------------------------------

Always follow:

1. renderLayout() immediately
2. showSkeleton() placeholders
3. fetchData() asynchronously
4. updateUI() progressively

Rules:
- NEVER wait API before rendering
- NEVER block UI
- ALWAYS show skeletons (no plain "Loading...")

----------------------------------
CACHE & STATE SYSTEM
----------------------------------

Implement lightweight client-side memory:

Cache:
- user data
- company data
- dashboard stats
- recent lists

Rules:
- reuse data when possible
- avoid duplicate fetches
- allow short expiration (TTL)

State persistence:
- filters
- search
- pagination
- tabs

Use sessionStorage or simple JS store.

----------------------------------
API OPTIMIZATION RULES
----------------------------------

- no duplicate calls
- no repeated fetch for same data
- batch requests when possible
- parallel requests when possible
- reuse cached data

----------------------------------
NAVIGATION EXPERIENCE
----------------------------------

The app must feel like a SaaS:

- instant page appearance
- no reload perception
- no white flashes
- stable layouts

Allowed:
- subtle transitions (150–200ms)

Forbidden:
- heavy animations
- blocking transitions

----------------------------------
SKELETON SYSTEM
----------------------------------

Standardize placeholders for:
- cards
- tables
- lists

Never mix loading styles.

----------------------------------
COMPANY SWITCH LOGIC
----------------------------------

- update context cleanly
- clear only necessary cache
- reload only affected data
- no full reset feeling

----------------------------------
ERROR / EMPTY / RETRY UX
----------------------------------

- never break layout
- retry must be inline
- no forced page reload

----------------------------------
ANTI-DUPLICATION SYSTEM
----------------------------------

Each logic exists only once:

API → api.js
Auth → auth.js
UI → ui.js
i18n → i18n.js

----------------------------------
CLEAN CODE RULE
----------------------------------

After every task:

- 0 unused files
- 0 dead code
- 0 duplicated logic

----------------------------------
WORKFLOW
----------------------------------

1. Read existing files
2. Understand structure
3. Apply changes
4. Verify behavior
5. Clean codebase

----------------------------------
QA CHECK (MANDATORY BEFORE FINISH)
----------------------------------

UI:
- consistent layout
- consistent spacing
- consistent components

Code:
- no duplication
- centralized logic
- no inline styles

Performance:
- instant render
- no blocking
- no duplicate API calls

I18N:
- no hardcoded text

States:
- loading handled
- empty handled
- error handled

If ANY fails:
→ task is NOT complete

----------------------------------
FINAL RULE
----------------------------------

If something looks:
- inconsistent
- slow
- duplicated
- improvised

→ it is WRONG.

The result must feel like:
a premium SaaS product.

Fast.
Clean.
Stable.