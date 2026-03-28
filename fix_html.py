with open('e:/App/crm/admin_user_detail_utf8.html', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace('<div class="modal-overlay" id="modal-add-company"open\')">', '<div class="modal-overlay" id="modal-add-company">')
text = text.replace('<div class="modal-overlay" id="modal-pick-client"open\')">', '<div class="modal-overlay" id="modal-pick-client">')

with open('e:/App/crm/admin_user_detail.html', 'w', encoding='utf-8') as f:
    f.write(text)
