import os
import asyncio
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env")
    exit(1)

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

TEMPLATES_DEF = [
    {
        "type": "quote_send",
        "subject": "Il tuo Preventivo #{quote_number} - {company_name}",
        "body_html": '''
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #00A5CF; border-bottom: 2px solid #00A5CF; padding-bottom: 10px;">
                    Preventivo #{quote_number}
                </h2>
                <p>Gentile <strong>{client_name}</strong>,</p>
                <p>In allegato trovi il preventivo che hai richiesto a {company_name}.</p>
                <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <strong>Dettagli:</strong><br>
                    Data Emissione: {quote_date}<br>
                    Scadenza: {expiry_date}<br>
                    Importo Totale: € {total_amount}
                </div>
                <p>Per accettare il preventivo o per qualsiasi chiarimento, puoi rispondere direttamente a questa email.</p>
                <p>Cordiali saluti,<br><strong>Il team di {company_name}</strong></p>
            </div>
        </body>
        </html>
        '''
    },
    {
        "type": "contract_send",
        "subject": "Il tuo Contratto è pronto - {company_name}",
        "body_html": '''
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #00A5CF; border-bottom: 2px solid #00A5CF; padding-bottom: 10px;">
                    Contratto da Visionare
                </h2>
                <p>Gentile <strong>{client_name}</strong>,</p>
                <p>Abbiamo preparato il contratto relativo alla nostra collaborazione con {company_name}.</p>
                <p>In allegato trovi una copia in formato PDF, ma ti invitiamo ad accedere al tuo Portale Clienti per visionarlo.</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{client_portal_url}" style="background-color: #00A5CF; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; display: inline-block;">
                        👉 Vai al Portale Clienti
                    </a>
                </div>
                <p>Cordiali saluti,<br><strong>Il team di {company_name}</strong></p>
            </div>
        </body>
        </html>
        '''
    },
    {
        "type": "proforma_send",
        "subject": "Invio Avviso di Parcella (Proforma) #{proforma_number} - {company_name}",
        "body_html": '''
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #00A5CF; border-bottom: 2px solid #00A5CF; padding-bottom: 10px;">
                    Avviso di Parcella Inviato
                </h2>
                <p>Gentile <strong>{client_name}</strong>,</p>
                <p>Ti inviamo in allegato l'Avviso di Parcella (Proforma) n. {proforma_number} emesso da {company_name}.</p>
                <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <strong>Dettagli:</strong><br>
                    Data: {date}<br>
                    Importo Totale da Saldare: € {total_amount}
                </div>
                <p>Al ricevimento del pagamento, provvederemo a emettere e trasmettere la relativa Fattura Elettronica.</p>
                <p>Grazie,<br><strong>Il team di {company_name}</strong></p>
            </div>
        </body>
        </html>
        '''
    },
    {
        "type": "client_invite",
        "subject": "Benvenuto nell'Area Clienti di {company_name}",
        "body_html": '''
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #00A5CF; border-bottom: 2px solid #00A5CF; padding-bottom: 10px;">
                    Benvenuto nel tuo Portale Clienti
                </h2>
                <p>Gentile <strong>{client_name}</strong>,</p>
                <p>Per facilitare le comunicazioni, noi di {company_name} abbiamo creato un account riservato a te nell'Area Clienti.</p>
                <p>Da qui potrai visionare contratti, accettare preventivi e consultare le fatture in modo rapido e sicuro.</p>
                <p>Per iniziare, imposta la tua password personale cliccando sul pulsante sottostante:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{magic_link}" style="background-color: #00A5CF; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; display: inline-block;">
                        👉 Imposta Password e Accedi
                    </a>
                </div>
                <p><i>Il link è valido per 24 ore.</i></p>
                <p>A presto,<br><strong>Il team di {company_name}</strong></p>
            </div>
        </body>
        </html>
        '''
    },
    {
        "type": "password_reset",
        "subject": "Reimposta Password Area Clienti - {company_name}",
        "body_html": '''
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #00A5CF; border-bottom: 2px solid #00A5CF; padding-bottom: 10px;">
                    Richiesta Reset Password
                </h2>
                <p>Gentile <strong>{client_name}</strong>,</p>
                <p>Hai richiesto di reimpostare la tua password per l'Area Clienti di {company_name}.</p>
                <p>Clicca sul pulsante qui sotto per inserirne una nuova:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{magic_link}" style="background-color: #00A5CF; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; display: inline-block;">
                        🔑 Reimposta Password
                    </a>
                </div>
                <p>Se non hai richiesto tu il reset, puoi ignorare questo messaggio.</p>
            </div>
        </body>
        </html>
        '''
    }
]

def seed_templates():
    companies = sb.table('companies').select('id, name').execute().data
    print(f"Found {len(companies)} companies. Injecting templates...")

    for comp in companies:
        c_id = comp['id']
        c_name = comp['name']
        print(f"\n--- Processing {c_name} ---")

        for tpl in TEMPLATES_DEF:
            # Check if template already exists
            existing = sb.table('email_templates').select('id').eq('company_id', c_id).eq('type', tpl['type']).eq('lang', 'it').execute().data
            if existing:
                print(f"  [SKIPPED] Template '{tpl['type']}' already exists.")
                continue
            
            # Prepare and insert
            row = {
                "company_id": c_id,
                "type": tpl['type'],
                "lang": "it",
                "subject": tpl['subject'].replace('{company_name}', c_name),
                "body_html": tpl['body_html']
            }
            try:
                sb.table('email_templates').insert(row).execute()
                print(f"  [OK] Inserted '{tpl['type']}'")
            except Exception as e:
                print(f"  [ERROR] Could not insert '{tpl['type']}': {e}")

if __name__ == "__main__":
    seed_templates()
