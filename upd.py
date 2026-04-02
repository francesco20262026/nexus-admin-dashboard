import sys

path = r'e:\App\crm\assets\js\admin_user_detail.js'
with open(path, 'r', encoding='utf-8') as f:
    js = f.read()

delete_js = """
// Hard Delete User
const btnDeleteUser = document.getElementById('btn-delete-user');
if (btnDeleteUser) {
  btnDeleteUser.addEventListener('click', async () => {
    if (!confirm('ATTENZIONE: sei sicuro di voler eliminare completamente l\\'utente? L\\'azione è irreversibile e cancellerà anche il suo accesso da Supabase Auth.')) return;
    try {
      btnDeleteUser.disabled = true;
      btnDeleteUser.textContent = 'Eliminazione...';
      await API.Users.delete(userId);
      window.location.href = 'admin_users.html?v=147';
    } catch (e) {
      console.error(e);
      UI.showToast('Errore durante l\\'eliminazione: ' + e.message, 'error');
      btnDeleteUser.disabled = false;
      btnDeleteUser.textContent = 'Elimina utente';
    }
  });
}
"""

if 'btnDeleteUser' not in js:
    js += '\n' + delete_js

with open(path, 'w', encoding='utf-8') as f:
    f.write(js)

print("added user deletion js")
