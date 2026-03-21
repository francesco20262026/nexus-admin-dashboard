/* ============================================================
   login.js — Login page logic
   ============================================================ */
'use strict';

let currentRole = 'admin';

function selectRole(role) {
  currentRole = role;
  document.getElementById('tab-admin').classList.toggle('selected', role === 'admin');
  document.getElementById('tab-client').classList.toggle('selected', role === 'client');
  document.getElementById('form-error').classList.remove('show');
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
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75"/></svg> Sign In`;
    msgEl.textContent = err?.message || 'Email o password errati.';
    errEl.classList.add('show');
    document.getElementById('f-password').focus();
  }
}

window.selectRole = selectRole;
