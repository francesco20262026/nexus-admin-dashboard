import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv('backend/.env')
sb = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])

new_body = """
<html>
<body style=\"font-family: Arial, sans-serif; line-height: 1.6; color: #333;\">
    <div style=\"max-width: 600px; margin: 0 auto; padding: 20px;\">
        <h2 style=\"color: #00A5CF; border-bottom: 2px solid #00A5CF; padding-bottom: 10px;\">
            Il tuo Preventivo #{quote_number}
        </h2>
        <p>Gentile <strong>{client_name}</strong>,</p>
        <p>Abbiamo preparato il preventivo che hai richiesto a {company_name}.</p>
        <div style=\"background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;\">
            <strong>Dettagli:</strong><br>
            Data Emissione: {quote_date}<br>
            Scadenza: {expiry_date}<br>
            Importo Totale: € {total_amount}
        </div>
        <p>Ti invitiamo ad accedere al tuo Portale Clienti per visionarlo in dettaglio e accettarlo digitalmente.</p>
        <div style=\"text-align: center; margin: 30px 0;\">
            <a href=\"{client_portal_url}\" style=\"background-color: #00A5CF; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; display: inline-block;\">
                👉 Vai al Portale Clienti
            </a>
        </div>
        <p>Cordiali saluti,<br><strong>Il team di {company_name}</strong></p>
    </div>
</body>
</html>
"""

print('Updating database templates for quote_send...')
res = sb.table('email_templates').update({'body_html': new_body}).eq('type', 'quote_send').execute()
print(f'Done! Updated {len(res.data)} templates.')
