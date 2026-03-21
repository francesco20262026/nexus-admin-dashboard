/* site.js — Nexus landing page: animations, navbar, lang switcher
   All original logic preserved from git. */

if (window.I18n) I18n.init('lang-switcher-slot');

/**
 * site.js ΓÇö Nexus website animations
 * Converted from Next.js/React template to vanilla JS
 * Keeps all original animations, uses Nexus brand colors
 */

/* ================================================================
   NAVBAR ΓÇö hide on scroll down, show on scroll up
================================================================ */
(function initNavbar() {
  const nav = document.getElementById('site-nav');
  const mobileMenu = document.getElementById('mobile-menu');
  const menuBtn = document.getElementById('menu-btn');
  const menuOpen = document.getElementById('menu-icon-open');
  const menuClose = document.getElementById('menu-icon-close');
  let lastY = 0, loaded = false;

  setTimeout(() => {
    loaded = true;
    nav.style.opacity = '1';
    nav.style.transform = 'translateX(-50%) translateY(0)';
  }, 100);

  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (y > 50) {
      if (y > lastY + 5) {
        nav.style.transform = 'translateX(-50%) translateY(-120px)';
        nav.style.opacity = '0';
      } else if (lastY - y > 5) {
        nav.style.transform = 'translateX(-50%) translateY(0)';
        nav.style.opacity = '1';
      }
    } else {
      nav.style.transform = 'translateX(-50%) translateY(0)';
      nav.style.opacity = '1';
    }
    lastY = y;
  }, { passive: true });

  // Mobile menu toggle
  if (menuBtn) {
    menuBtn.addEventListener('click', () => {
      const open = mobileMenu.classList.toggle('open');
      menuOpen.style.opacity = open ? '0' : '1';
      menuClose.style.opacity = open ? '1' : '0';
    });
  }

  // Smooth scroll for nav links
  document.querySelectorAll('[data-scroll]').forEach(el => {
    el.addEventListener('click', () => {
      const target = document.querySelector(el.dataset.scroll);
      if (target) {
        const top = target.getBoundingClientRect().top + window.scrollY - 100;
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      }
      mobileMenu.classList.remove('open');
      menuOpen.style.opacity = '1';
      menuClose.style.opacity = '0';
    });
  });
})();

/* ================================================================
   ROTATING TEXT
================================================================ */
(function initRotatingText() {
  const el = document.getElementById('rotating-word');
  if (!el) return;
  const words = ['Growth', 'Innovation', 'Efficiency', 'Success', 'Performance'];
  let idx = 0;

  function next() {
    el.style.transform = 'translateY(-120%)';
    el.style.opacity = '0';
    setTimeout(() => {
      idx = (idx + 1) % words.length;
      el.textContent = words[idx];
      el.style.transform = 'translateY(0)';
      el.style.opacity = '1';
    }, 300);
  }

  setInterval(next, 2000);
})();

/* ================================================================
   FEATURES SECTION ΓÇö IntersectionObserver + animated sub-demos
================================================================ */
(function initFeatures() {
  const section = document.getElementById('features');
  if (!section) return;

  // Entrance animation
  const grid = document.getElementById('features-grid');
  const header = document.getElementById('features-header');
  const obs = new IntersectionObserver(([e]) => {
    if (e.isIntersecting) {
      header && (header.style.opacity = '1', header.style.transform = 'translateY(0)');
      grid && (grid.style.opacity = '1', grid.style.transform = 'translateY(0)');
      obs.disconnect();
    }
  }, { threshold: 0.1 });
  obs.observe(section);

  // Animated chat demo
  function initChatDemo(container) {
    if (!container) return;
    const scenarios = [
      ["Hi! How can I help you today?", "I'd like to book an appointment", "Perfect! What service are you interested in?"],
      ["Hello! I'm available 24/7 to assist you.", "Do you have weekend availability?", "Let me check our weekend slots for you."],
      ["Good evening! How may I assist you?", "I need help with pricing", "I'd be happy to provide pricing information right away!"],
    ];
    let cycle = 0;
    function runCycle() {
      const msgs = scenarios[cycle % scenarios.length];
      const rows = container.querySelectorAll('.chat-msg');
      rows.forEach(r => { r.style.opacity = '0'; r.style.transform = 'translateY(8px)'; });
      rows[0].querySelector('.bubble').textContent = msgs[0];
      rows[1].querySelector('.bubble').textContent = msgs[1];
      rows[2].querySelector('.bubble').textContent = msgs[2];
      setTimeout(() => { rows[0].style.opacity = '1'; rows[0].style.transform = 'translateY(0)'; }, 500);
      setTimeout(() => { rows[1].style.opacity = '1'; rows[1].style.transform = 'translateY(0)'; }, 2000);
      const typing = container.querySelector('.typing');
      setTimeout(() => {
        if (typing) typing.style.display = 'flex';
        setTimeout(() => {
          if (typing) typing.style.display = 'none';
          rows[2].style.opacity = '1'; rows[2].style.transform = 'translateY(0)';
          setTimeout(() => { cycle++; runCycle(); }, 3000);
        }, 2000);
      }, 3500);
    }
    runCycle();
  }

  // Animated phone demo
  function initPhoneDemo(container) {
    if (!container) return;
    const circle = container.querySelector('.phone-circle');
    const label = container.querySelector('.call-label');
    const counter = container.querySelector('.call-count');
    let calls = 1;
    function cycle() {
      circle.classList.remove('answered'); circle.classList.add('ringing');
      label && (label.textContent = 'Incoming call...', label.style.opacity = '1');
      setTimeout(() => {
        circle.classList.remove('ringing'); circle.classList.add('answered');
        label && (label.textContent = 'Call answered');
        setTimeout(() => {
          circle.classList.remove('answered');
          label && (label.style.opacity = '0');
          calls++; if (counter) counter.textContent = 'Calls: ' + calls;
          setTimeout(cycle, 2000);
        }, 2000);
      }, 2000);
    }
    setTimeout(cycle, 800);
  }

  // Animated calendar demo
  function initCalendarDemo(container) {
    if (!container) return;
    const cells = container.querySelectorAll('.cal-cell');
    const note = container.querySelector('.cal-note');
    function cycle() {
      cells.forEach(c => { c.classList.remove('selected', 'booked'); });
      if (note) note.style.opacity = '0';
      setTimeout(() => {
        cells[14] && cells[14].classList.add('selected');
        setTimeout(() => {
          cells[14] && cells[14].classList.add('booked');
          if (note) note.style.opacity = '1';
        }, 1500);
      }, 1000);
    }
    cycle();
    setInterval(cycle, 7000);
  }

  // Animated email demo
  function initEmailDemo(container) {
    if (!container) return;
    function cycle() {
      const rows = container.querySelectorAll('.email-row');
      rows.forEach(r => r.classList.remove('replied'));
      rows.forEach((r, i) => {
        setTimeout(() => r.classList.add('replied'), 1000 + i * 800);
      });
      setTimeout(cycle, 8000);
    }
    cycle();
  }

  // Animated leads demo
  function initLeadsDemo(container) {
    if (!container) return;
    const targets = [85, 92, 78];
    function cycle() {
      const bars = container.querySelectorAll('.lead-bar');
      const labels = container.querySelectorAll('.lead-pct');
      const checks = container.querySelectorAll('.lead-check');
      bars.forEach(b => { b.style.width = '0%'; b.classList.remove('qualified'); });
      labels.forEach(l => l.textContent = '0%');
      checks.forEach(c => c.style.opacity = '0');
      bars.forEach((bar, i) => {
        setTimeout(() => {
          let score = 0;
          const iv = setInterval(() => {
            score = Math.min(score + 5, targets[i]);
            bar.style.width = score + '%';
            if (labels[i]) labels[i].textContent = score + '%';
            if (score >= 80) { bar.classList.add('qualified'); if (checks[i]) checks[i].style.opacity = '1'; }
            if (score >= targets[i]) clearInterval(iv);
          }, 50);
        }, i * 600);
      });
      setTimeout(cycle, 8000);
    }
    cycle();
  }

  // Animated integrations demo
  function initIntegrationsDemo(container) {
    if (!container) return;
    function cycle() {
      const items = container.querySelectorAll('.integration-item');
      items.forEach(it => it.classList.remove('connected'));
      items.forEach((it, i) => setTimeout(() => it.classList.add('connected'), 500 + i * 400));
      setTimeout(cycle, 8000);
    }
    cycle();
  }

  // Init each card on hover
  document.querySelectorAll('.feat-card').forEach(card => {
    const type = card.dataset.demo;
    if (type === 'chat') initChatDemo(card.querySelector('.demo-area'));
    if (type === 'phone') initPhoneDemo(card.querySelector('.demo-area'));
    if (type === 'calendar') initCalendarDemo(card.querySelector('.demo-area'));
    if (type === 'email') initEmailDemo(card.querySelector('.demo-area'));
    if (type === 'leads') initLeadsDemo(card.querySelector('.demo-area'));
    if (type === 'integrations') initIntegrationsDemo(card.querySelector('.demo-area'));
  });
})();

/* ================================================================
   TESTIMONIALS + CTA ΓÇö IntersectionObserver fade-in
================================================================ */
(function initScrollFadeIns() {
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.querySelectorAll('.fade-in-element').forEach((el, i) => {
          setTimeout(() => el.classList.add('visible'), i * 250);
        });
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('[data-observe]').forEach(el => obs.observe(el));
})();
