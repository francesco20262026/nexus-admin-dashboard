STOP.

The KPI/stat cards are currently inconsistent across pages and this is NOT acceptable.

I want a FULL KPI CARD STANDARDIZATION across the admin panel.

IMPORTANT:
- Do NOT redesign the whole product
- Use the existing template/design system
- Keep the dashboard style, but normalize all KPI/stat cards across pages
- No improvisation

GOAL:
Make KPI/stat cards visually consistent across all admin pages.

----------------------------------
PROBLEMS TO FIX
----------------------------------

1. KPI cards are different on every page
- different sizes
- different spacing
- different hover behavior
- different visual weight
- inconsistent color usage

2. Some cards show weird horizontal lines instead of real values
- this is wrong
- if data is loading → use proper skeleton
- if data is empty → show 0
- do NOT show random dash/line placeholders

3. Dashboard cards and inner-page cards are not aligned as a system

----------------------------------
TARGET DESIGN RULE
----------------------------------

1. DASHBOARD PAGE
- dashboard KPI cards can stay slightly larger
- keep them as the premium overview cards
- they must still follow the same design language as the rest

2. ALL OTHER ADMIN PAGES
The KPI/stat cards on these pages must be:
- same width behavior
- same height
- same padding
- same font scale
- same icon positioning
- same border radius
- same hover animation
- same spacing between cards

Pages to standardize:
- admin_onboarding.html
- admin_clients.html
- admin_services.html
- admin_contracts.html
- admin_documents.html
- admin_invoices.html
- admin_renewals.html
- admin_reminders.html
- admin_settings.html if relevant

----------------------------------
COLOR SYSTEM
----------------------------------

I want the KPI cards to have more visual personality, but still elegant.

Use a consistent accent logic such as:
- green
- blue
- purple
- amber
- red when needed

Rules:
- cards stay mostly clean/light
- accent color should appear in:
  - icon background
  - top marker / small accent line
  - hover border / hover glow
  - optional number accent if appropriate

Do NOT create random colors page by page.
Create a reusable KPI color system.

----------------------------------
HOVER BEHAVIOR
----------------------------------

All KPI/stat cards on inner pages must have the SAME hover behavior:
- subtle border highlight
- subtle shadow lift
- smooth transition
- template-consistent animation

Do NOT overdo it.
It must feel premium and calm.

----------------------------------
VALUE DISPLAY RULE
----------------------------------

This is critical:

- if loading:
  show proper skeleton placeholder
- if loaded and value is empty:
  show 0
- if loaded and unavailable:
  show a clear fallback like "0" or "—" only if truly appropriate

NEVER show random-looking small horizontal lines pretending to be values.

Current line placeholders must be removed and replaced with a real standardized state.

----------------------------------
IMPLEMENTATION RULES
----------------------------------

1. Create one reusable KPI/stat card system in dash.css
Examples:
- .stat-card
- .stat-card--lg
- .stat-card--sm
- .stat-card--green
- .stat-card--blue
- .stat-card--purple
- .stat-card--amber
- .stat-card--danger

2. Ensure all pages use the same classes

3. If needed, extend ui.js with a helper to render stat cards consistently

4. Remove duplicated KPI styling across pages

----------------------------------
OUTPUT REQUIRED
----------------------------------

Provide:

1. summary of what is currently inconsistent
2. the standard KPI card system you are applying
3. exact CSS classes added/normalized
4. files modified
5. updated code/patches
6. explain:
   - dashboard cards vs inner-page cards
   - loading state
   - empty state
   - hover behavior
   - color system

----------------------------------
FINAL RULE
----------------------------------

After this change:
- dashboard can keep bigger KPI cards
- all other admin pages must have KPI cards with identical structure and size
- no ugly line placeholders
- the whole admin must feel like one coherent premium SaaS