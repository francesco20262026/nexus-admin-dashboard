import re

def process_js(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Replace switchMainView
    # Regex to find switchMainView definition block up until ScrollSpy
    pattern_switch = r'/\*\s*──\s*View Toggles.*?\n\s*window\.switchMainView = function[\s\S]*?(?=/\*\s*──\s*Deep-link)'
    
    new_switch = """/* ── Tab Routing (SPA) ────────────────────────────────────────── */
  window.switchMainView = function (viewId) {
    // Hide all tabs
    document.querySelectorAll('.mac-tab-section').forEach(el => {
      el.style.display = 'none';
      el.classList.remove('active');
    });
    
    // Show target tab
    const target = document.getElementById('view-' + viewId);
    if (target) {
      target.style.display = '';
      target.classList.add('active');
    }

    // Update Sidebar Navigation state
    document.querySelectorAll('.mac-sidebar .mac-nav-item').forEach(el => el.classList.remove('active'));
    const activeNav = document.getElementById('tab-' + viewId);
    if (activeNav) activeNav.classList.add('active');

    // Lazy load the timeline only when requested
    if (viewId === 'timeline' && !loaded['storico']) {
      if (typeof loadStorico === 'function') loadStorico();
      loaded['storico'] = true;
    }
  };

  """
    
    content = re.sub(pattern_switch, new_switch, content)

    # 2. Remove initScrollSpy calls and scrolling listeners
    # Regex for Smooth scrolling bindings
    pattern_smooth = r'// Smooth scrolling bindings.*?initScrollSpy\(\);\n*'
    content = re.sub(pattern_smooth, '', content, flags=re.DOTALL)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

process_js('assets/js/admin_onboarding_detail.js')
process_js('assets/js/admin_client_detail.js')
print("Processed JS files.")
