/* ============================================================
   login.js Login page logic
   ============================================================ */
'use strict';

// ── Supabase auth token in URL → redirect to set-password page ────────────────
(function detectMagicLink() {
  const hash  = window.location.hash;
  const hp    = new URLSearchParams(hash.replace('#', ''));
  const token = hp.get('access_token');
  const type  = hp.get('type');
  const code  = new URLSearchParams(window.location.search).get('code');
  
  // If it's a magic link login (not a new account invite/recovery)
  if (token && type === 'magiclink') {
    document.body.innerHTML = '<div style="display:flex;height:100vh;align-items:center;justify-content:center;font-family:sans-serif;color:#374151;">Accesso in corso...</div>';
    
    // We can't use window.API here if it's not loaded, so we use standard fetch
    fetch('/api/auth/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: token })
    })
    .then(res => res.json().then(data => ({ res, data })))
    .then(({ res, data }) => {
      if (!res.ok) throw new Error(data.detail || 'Token exchange failed');
      
      localStorage.setItem('nexus_token', data.token);
      
      // Automatically navigate to dashboard
      window.location.href = '/client_dash.html';
    })
    .catch(err => {
      console.error(err);
      window.location.replace('/client_set_password.html' + window.location.search + hash);
    });
    
    return;
  }

  // Any other Supabase auth token or PKCE code (invite/recovery) → send to password setup page
  if (code || token) {
    window.location.replace('/client_set_password.html' + window.location.search + hash);
  }
})();

// Forgot password
async function forgotPassword() {
  const email = (document.getElementById('f-email')?.value || '').trim();
  const errEl = document.getElementById('form-error');
  const msgEl = document.getElementById('error-msg');

  errEl.classList.remove('show');

  if (!email) {
    msgEl.textContent = 'Inserisci prima la tua email nel campo sopra.';
    errEl.classList.add('show');
    document.getElementById('f-email')?.focus();
    return;
  }

  const btn = document.getElementById('btn-forgot');
  btn.disabled = true;
  btn.textContent = 'Invio in corso...';

  try {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    if (!res.ok) throw new Error('Server error ' + res.status);
    // Show inline success (no alert)
    errEl.style.background = '#d1fae5';
    errEl.style.color = '#065f46';
    errEl.style.borderColor = '#6ee7b7';
    msgEl.textContent = `Se l'account esiste, riceverai un link su ${email}.`;
    errEl.classList.add('show');
  } catch(e) {
    errEl.style.background = '';
    errEl.style.color = '';
    errEl.style.borderColor = '';
    msgEl.textContent = 'Errore durante il reset. Riprova o contatta info@delocanova.com.';
    errEl.classList.add('show');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Password dimenticata?';
  }
}

/* Password toggle */
document.getElementById('pw-toggle').addEventListener('click', function () {
  const inp = document.getElementById('f-password');
  inp.type = inp.type === 'password' ? 'text' : 'password';
});

/* Login logic */
document.getElementById('btn-login').addEventListener('click', doLogin);
document.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

async function doLogin() {
  const email = document.getElementById('f-email').value.trim();
  const pw    = document.getElementById('f-password').value;
  const errEl = document.getElementById('form-error');
  const msgEl = document.getElementById('error-msg');
  const btn   = document.getElementById('btn-login');

  errEl.classList.remove('show');

  if (!email || !pw) {
    msgEl.textContent = 'Inserisci email e password.';
    errEl.classList.add('show');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="spin-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/></svg> Signing in…`;

  try {
    await Auth.login(email, pw); // redirects on success
  } catch (err) {
    btn.disabled = false;
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75"/></svg> Accedi`;
    msgEl.textContent = (err?.code === 'unauthorized')
      ? 'Email o password non corretti.'
      : (err?.message || 'Errore di login.');
    errEl.classList.add('show');
    document.getElementById('f-password').focus();
  }
}

window.forgotPassword = forgotPassword;
