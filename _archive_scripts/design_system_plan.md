STOP.

We are now working in DESIGN SYSTEM MODE.

This is NOT a redesign task.
This is NOT a feature task.
This is NOT a template invention task.

We are building a COMPLETE, REUSABLE, PROJECT-WIDE DESIGN SYSTEM + COMPONENT SYSTEM
for the existing SaaS product.

The goal is to make the UI:
- consistent
- reusable
- maintainable
- premium
- fast to extend

This must work with:
- HTML
- CSS
- Vanilla JavaScript

NO frameworks.
NO React.
NO Vue.
NO Tailwind.
NO CSS frameworks.

----------------------------------
SOURCE OF TRUTH
----------------------------------

You must NOT invent a new visual style.

You must extract and standardize the EXISTING style already used in the project and in the provided UI template.

That means:
- same colors
- same spacing
- same cards
- same buttons
- same tables
- same hierarchy

If multiple inconsistent versions exist:
- identify the best existing pattern
- choose ONE standard
- normalize everything to that standard

----------------------------------
STRICT RULES
----------------------------------

1. No inline styles
2. No duplicated CSS rules
3. No duplicated HTML component structures
4. No visual improvisation
5. No random class names
6. No breaking existing working functionality

----------------------------------
GOAL
----------------------------------

Build a reusable design system that defines:

1. design tokens
2. component classes
3. reusable UI helpers
4. standardized page structure
5. skeleton/loading/empty states
6. consistent naming rules

The final result must make the whole app look like:
- one product
- one design language
- one system

----------------------------------
PHASE 1 — AUDIT EXISTING UI
----------------------------------

Scan the project and identify:

- all button variants
- all card variants
- all table variants
- all form styles
- all badge/status styles
- all modal styles
- all spacing patterns
- all duplicated classes
- all inline style leftovers
- all inconsistent patterns

Output which patterns are:
- good and should become standard
- duplicated and should be merged
- wrong and should be removed

----------------------------------
PHASE 2 — DESIGN TOKENS
----------------------------------

Create/normalize CSS variables for:

COLORS
- --color-primary
- --color-primary-hover
- --color-secondary
- --color-success
- --color-warning
- --color-danger
- --color-bg
- --color-surface
- --color-border
- --color-text
- --color-text-muted

SPACING
- --space-1
- --space-2
- --space-3
- --space-4
- --space-5
- --space-6

RADIUS
- --radius-sm
- --radius-md
- --radius-lg

SHADOWS
- --shadow-sm
- --shadow-md

TYPOGRAPHY
- --font-family
- --font-size-xs
- --font-size-sm
- --font-size-md
- --font-size-lg
- --font-size-xl
- --font-weight-regular
- --font-weight-medium
- --font-weight-semibold
- --font-weight-bold

These must become the foundation of the system.

----------------------------------
PHASE 3 — COMPONENT SYSTEM
----------------------------------

Standardize these components in CSS:

BUTTONS
- .btn
- .btn-primary
- .btn-secondary
- .btn-danger
- .btn-ghost
- .btn-sm
- .btn-md
- .btn-lg

CARDS
- .card
- .card-header
- .card-title
- .card-subtitle
- .card-body
- .card-footer
- .card-actions

TABLES
- .table-wrap
- .table
- .table thead
- .table tbody
- .table-empty
- .table-loading

BADGES / STATUS
- .badge
- .badge-success
- .badge-warning
- .badge-danger
- .badge-neutral
- .badge-info

FORMS
- .form-group
- .label
- .input
- .select
- .textarea
- .input-error
- .field-help

MODALS
- .modal
- .modal-header
- .modal-body
- .modal-footer

EMPTY STATES
- .empty-state
- .empty-state-title
- .empty-state-text
- .empty-state-actions

SKELETONS
- .skeleton
- .skeleton-text
- .skeleton-card
- .skeleton-row
- .skeleton-circle

LAYOUT HELPERS
- .page-header
- .page-title
- .page-subtitle
- .page-actions
- .grid-2
- .grid-3
- .grid-4
- .stack-sm
- .stack-md
- .stack-lg

----------------------------------
PHASE 4 — UI.JS COMPONENT HELPERS
----------------------------------

Extend ui.js with reusable helpers.

Create functions such as:

UI.createBadge(status)
UI.createEmptyState(options)
UI.createSkeleton(type, options)
UI.createTableState(type, options)
UI.createButton(options)
UI.createCardShell(options)

Purpose:
- remove repeated HTML strings from page files
- keep pages cleaner
- centralize recurring UI fragments

Do NOT overengineer.
Keep helpers simple and practical.

----------------------------------
PHASE 5 — STANDARD PAGE STRUCTURE
----------------------------------

All pages must follow the same structural pattern:

1. Page Header
- title
- subtitle
- actions

2. Summary Area (if needed)
- KPI cards / chips

3. Main Content Blocks
- cards
- tables
- lists

4. Empty / Error / Loading states
- standardized

No page should feel visually unrelated.

----------------------------------
PHASE 6 — REMOVE DUPLICATION
----------------------------------

Refactor the project to:
- remove duplicate CSS rules
- remove repeated HTML patterns where reusable helpers are better
- remove dead classes
- remove unused styles
- normalize inconsistent spacing
- normalize inconsistent button/card/table implementations

----------------------------------
PHASE 7 — PAGE NORMALIZATION
----------------------------------

Apply the design system to all existing pages:

Admin:
- admin_dash.html
- admin_onboarding.html
- admin_clients.html
- admin_services.html
- admin_contracts.html
- admin_documents.html
- admin_invoices.html
- admin_renewals.html
- admin_reports.html
- admin_settings.html

Client:
- client_dash.html
- client_invoices.html
- client_contracts.html
- client_documents.html
- client_profile.html

Rules:
- preserve current functionality
- no redesign
- only standardize and clean

----------------------------------
PHASE 8 — NAMING CONVENTION
----------------------------------

Use one consistent naming convention only:

- btn-*
- card-*
- table-*
- badge-*
- modal-*
- form-*
- page-*
- skeleton-*

No random mixed naming allowed.

----------------------------------
PHASE 9 — I18N SAFETY
----------------------------------

All visible text must remain compatible with i18n.

- HTML static text → data-i18n
- JS dynamic text → I18n.t()

Do NOT hardcode visible labels while standardizing components.

----------------------------------
PHASE 10 — PERFORMANCE SAFETY
----------------------------------

Do not make the UI system heavier.

The design system must:
- reduce duplication
- improve maintainability
- not slow down rendering
- support skeleton-first rendering cleanly

----------------------------------
OUTPUT REQUIRED
----------------------------------

Provide in this exact order:

A. DESIGN AUDIT
- duplicated patterns found
- inconsistent components found
- what becomes the standard

B. DESIGN TOKENS
- final CSS variable set

C. COMPONENT MAP
- list of all standardized components
- where they are used

D. FILES TO MODIFY
- exact files that will change

E. IMPLEMENTATION
- updated dash.css
- updated ui.js
- page adjustments only where necessary

F. CLEANUP
- classes removed
- duplicate code removed
- dead styles removed

G. FINAL RESULT
Explain:
- why the system is now cleaner
- how future pages can reuse it
- what conventions must be followed from now on

----------------------------------
FINAL RULE
----------------------------------

This must feel like one unified premium SaaS system.

No improvisation.
No duplication.
No mixed styles.
No visual chaos.

Everything must look like it comes from one single design system.