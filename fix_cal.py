import os

html_file = 'e:/App/crm/admin_calendar.html'
with open(html_file, 'r', encoding='utf-8') as f:
    content = f.read()

head_addition = """
  <script src='https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/index.global.min.js'></script>
  <style>
    .fc { font-family: 'Inter', sans-serif; }
    .fc-theme-standard th, .fc-theme-standard td, .fc-theme-standard .fc-scrollgrid { border-color: #e5e7eb; }
    .fc .fc-toolbar-title { font-size: 18px; font-weight: 700; color: #111827; }
    .fc .fc-button-primary { background-color: #0a5c36 !important; border-color: #0a5c36 !important; border-radius: 8px; font-weight: 500;}
    .fc .fc-button-primary:hover { background-color: #08482a !important; }
    .fc .fc-button-active { background-color: #063720 !important; }
    .fc-event { border: none; border-radius: 4px; padding: 2px 4px; font-size: 11px; cursor: pointer; }
  </style>
</head>
"""

content = content.replace('</head>', head_addition)

with open(html_file, 'w', encoding='utf-8') as f:
    f.write(content)

print('Fixed Head in Calendar')
