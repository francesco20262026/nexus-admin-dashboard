import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

from dotenv import load_dotenv
load_dotenv('backend/.env')

from integrations.email_service import send_email_smtp_core

print('Sending test email via Brevo...')
success = send_email_smtp_core(
    to_email='service@impiegando.com',
    subject='Test Invio Brevo CRM',
    html_body='<h1>Test di configurazione email</h1><p>Se ricevi questa email, il relay SMTP Brevo è configurato correttamente nel CRM!</p>'
)
print('Test result:', 'SUCCESS' if success else 'FAILED')
