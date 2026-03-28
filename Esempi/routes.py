from app import app
from flask import render_template, session, jsonify, make_response, request, redirect, url_for, session
import requests
import os
import traceback
from database_supabase import supabase, authenticate_user, is_in_spam_blacklist, create_enterprise_contact, get_user_by_email, get_user_by_id, create_user, create_purchase, update_purchase_status_by_payment_id, get_purchase_and_user_info
from database_sql_server import create_jobbir_session, delete_jobbir_session
from portals_config import PORTALS_SMART, PORTALS_PRO, PORTALS_BUSINESS, SMART_COUNT, PRO_COUNT, BUSINESS_COUNT, PORTAL_LOGOS, PORTAL_STATUS
from datetime import datetime, timedelta
from spam_check_services import check_chaptcha, check_honeypot, check_send_timestamp, check_email, is_gibberish, check_agent
from email_service import send_enterprise_contact_email, send_enterprise_confirmation_email, send_password_reset_email, send_admin_password_reset_notification, send_welcome_email, send_purchase_confirmation_email, send_admin_purchase_notification, send_purchase_confirmation_email_usa, send_admin_purchase_notification_usa
import secrets
import contract_content
from decimal import Decimal, InvalidOperation
from bkn301_service import BKN301Service
from cache_manager import api_cache
import hmac
import base64
import hashlib
from windoc_invoice import generate_invoice_from_order

@app.route('/')
def index():
    user_logged_in = session.get('user_logged_in', False)
    user_name = session.get('user_name', '')

    if 'registration_success' in session:
        session.pop('registration_success', None)

    iubenda_api_key = os.environ.get('IUBENDA_API_KEY', '')

    return render_template('index.html', user_logged_in=user_logged_in, user_name=user_name, iubenda_api_key=iubenda_api_key)

@app.route('/login', methods=['POST'])
def login():
    try:
        print(f"Login")
        email = request.json.get('email')
        password = request.json.get('password')

        if not email or not password:
            return jsonify({'success': False, 'message': 'Email e password richiesti'})

        hashed_password = hash_password(password)
        #Autentico l'utente
        user = authenticate_user(email, hashed_password)
        #Se non autenticato esco subito
        if not user:
            return jsonify({'success': False, 'message': 'Email o password non corretti'})
        
        jobbir_session_id = init_user_session(user)
        if not jobbir_session_id:
            return jsonify({'success': False, 'message': 'Errore generazione sessione'}), 500

        return build_login_response(jobbir_session_id)
        #return jsonify({'success': True, 'user_name': session['user_name'], 'jobbir_session_id' :jobbir_session_id})
    except Exception as e:
        print(f"Errore durante il login: {e}")
        return jsonify({'success': False, 'message': 'Errore del server'})

@app.route('/logout')
def logout():
    #Prendi il session_id dal cookie (quello condiviso con PHP)
    sid = session.get('jobbir_session_id')
    #Cancella la sessione SQL Server
    if sid:
        delete_jobbir_session(sid)
    #Cancella la sessione Flask
    session.clear()
    #Redirect alla home
    resp = redirect(url_for('index'))
    resp.delete_cookie(
        "jobbir_sid",
        path="/",
    )    
    return resp

@app.route('/enterprise')
def enterprise():
    user_logged_in = session.get('user_logged_in', False)
    user_name = session.get('user_name', '')
    iubenda_api_key = os.environ.get('IUBENDA_API_KEY', '')
    return render_template('enterprise.html', user_logged_in=user_logged_in, user_name=user_name, iubenda_api_key=iubenda_api_key)

@app.route('/jobbir')
def jobbir():
    user_logged_in = session.get('user_logged_in', False)
    user_name = session.get('user_name', '')
    iubenda_api_key = os.environ.get('IUBENDA_API_KEY', '')
   
    return render_template('jobbir.html', user_logged_in=user_logged_in, user_name=user_name, iubenda_api_key=iubenda_api_key,
                           portals_smart=PORTALS_SMART, portals_pro=PORTALS_PRO, portals_business=PORTALS_BUSINESS,
                           smart_count=SMART_COUNT, pro_count=PRO_COUNT, business_count=BUSINESS_COUNT,
                           portal_logos=PORTAL_LOGOS)

@app.route('/tuolavoro')
def tuolavoro():
    user_logged_in = session.get('user_logged_in', False)
    user_name = session.get('user_name', '')
    iubenda_api_key = os.environ.get('IUBENDA_API_KEY', '')
    return render_template('tuolavoro.html',
                           user_logged_in=user_logged_in,
                           user_name=user_name,
                           iubenda_api_key=iubenda_api_key)

@app.route('/prezzi')
def prezzi():
    user_logged_in = session.get('user_logged_in', False)
    user_name = session.get('user_name', '')
    iubenda_api_key = os.environ.get('IUBENDA_API_KEY', '')
    return render_template('prezzi.html', user_logged_in=user_logged_in, user_name=user_name, iubenda_api_key=iubenda_api_key,
                           portals_smart=PORTALS_SMART, portals_pro=PORTALS_PRO, portals_business=PORTALS_BUSINESS,
                           smart_count=SMART_COUNT, pro_count=PRO_COUNT, business_count=BUSINESS_COUNT)

@app.route('/portali')
def portali():
    user_logged_in = session.get('user_logged_in', False)
    user_name = session.get('user_name', '')
    iubenda_api_key = os.environ.get('IUBENDA_API_KEY', '')
    return render_template('portali.html',
                           user_logged_in=user_logged_in, user_name=user_name, iubenda_api_key=iubenda_api_key,
                           portals_smart=PORTALS_SMART, portals_pro=PORTALS_PRO, portals_business=PORTALS_BUSINESS,
                           portal_status=PORTAL_STATUS)

@app.route('/chi-siamo')
def chi_siamo():
    user_logged_in = session.get('user_logged_in', False)
    user_name = session.get('user_name', '')
    iubenda_api_key = os.environ.get('IUBENDA_API_KEY', '')
    return render_template('chi-siamo.html', user_logged_in=user_logged_in, user_name=user_name, iubenda_api_key=iubenda_api_key)

@app.route('/contatti')
def contatti():
    user_logged_in = session.get('user_logged_in', False)
    user_name = session.get('user_name', '')
    iubenda_api_key = os.environ.get('IUBENDA_API_KEY', '')
    recaptcha_site_key = os.environ.get('RECAPTCHA_SITE_KEY', '')
    return render_template('contatti.html', user_logged_in=user_logged_in, user_name=user_name, iubenda_api_key=iubenda_api_key, recaptcha_site_key=recaptcha_site_key)

@app.route('/contatti', methods=['POST'])
def send_contact_post():
    return send_contact(request.path, True if request.headers.get('X-Requested-With') == 'XMLHttpRequest' else False)

@app.route('/informativa-privacy')
def informativa_privacy():
    return render_template('privacy-policy.html')

@app.route('/condizioni-contrattuali')
def condizioni_contrattuali():
    return render_template('contratto.html', c=contract_content)

@app.route('/privacy-candidati')
def privacy_candidati():
    return render_template('privacy-candidati.html')

@app.route('/nomina-responsabile')
def nomina_responsabile():
    return render_template('nomina-responsabile.html')

@app.route('/sub-responsabili')
def sub_responsabili():
    return render_template('sub-responsabili.html')

@app.route('/forgot-password')
def forgot_password():
    return render_template('forgot_password.html')

@app.route('/forgot-password', methods=['POST'])
def forgot_password_submit():
    try:
        email = request.form.get('email', '').strip()

        if not email:
            return render_template('forgot_password.html', error='Email richiesta')

        # Verifica se l'utente esiste
        user = get_user_by_email(email)
        if not user:
            # Per sicurezza, non riveliamo se l'email esiste o no
            return render_template('forgot_password.html', success=True)

        # Genera token unico
        reset_token = secrets.token_urlsafe(32)

        # Salva il token nel database con scadenza
        expires_at = datetime.now() + timedelta(hours=1)  # Token valido per 1 ora

        try:
            # Inserisci il token nella tabella password_reset_tokens
            supabase.table('password_reset_tokens').insert({
                'user_id': user['id'],
                'token': reset_token,
                'expires_at': expires_at.isoformat()
            }).execute()

            # Invia email di reset
            email_sent = send_password_reset_email(email, user.get('nome', ''), reset_token)

            if email_sent:
                print(f"Email reset password inviata a {email}")
                return render_template('forgot_password.html', success=True)
            else:
                print(f"Errore invio email reset a {email}")
                return render_template('forgot_password.html', error='Errore invio email')

        except Exception as db_error:
            print(f"Errore database reset password: {db_error}")
            return render_template('forgot_password.html', error='Errore del server')

    except Exception as e:
        print(f"Errore forgot password: {e}")
        return render_template('forgot_password.html', error='Errore del server')

@app.route('/reset-password')
def reset_password():
    token = request.args.get('token')

    if not token:
        print("Token mancante nella richiesta")
        return render_template('reset_password.html', error='Token mancante')

    try:
        # Verifica se il token è valido e non scaduto
        response = supabase.table('password_reset_tokens').select('*').eq('token', token).gte('expires_at', datetime.now().isoformat()).execute()

        if not response.data:
            print("Token non trovato o scaduto")
            return render_template('reset_password.html', error='Token non valido o scaduto')

        token_data = response.data[0]
        user_id = token_data['user_id']

        # Ottieni dati utente
        user = get_user_by_id(user_id)
        if not user:
            return render_template('reset_password.html', error='Utente non trovato')

        # Verifica se l'utente ha mai fatto acquisti
        try:
            purchases_response = supabase.table('purchases').select('id').eq('user_id', user_id).limit(1).execute()
            has_purchases = len(purchases_response.data) > 0
        except:
            has_purchases = False

        print(f"Rendering pagina reset password per {user.get('email', '')}")
        return render_template('reset_password.html', token=token, user=user, has_purchases=has_purchases)

    except Exception as e:
        print(f"Errore verifica token reset: {e}")
        import traceback
        traceback.print_exc()
        return render_template('reset_password.html', error='Errore del server')

@app.route('/reset-password', methods=['POST'])
def reset_password_submit():
    try:
        token = request.form.get('token')
        new_password = request.form.get('password')
        confirm_password = request.form.get('confirm_password')

        if not all([token, new_password, confirm_password]):
            print("Tutti i campi sono richiesti")
            return render_template('reset_password.html', token=token, error='Tutti i campi sono richiesti')

        if new_password != confirm_password:
            print("Le password non corrispondono")
            return render_template('reset_password.html', token=token, error='Le password non corrispondono')

        if not new_password or len(new_password) < 6:
            print("La password deve essere di almeno 6 caratteri")
            return render_template('reset_password.html', token=token, error='La password deve essere di almeno 6 caratteri')

        # Verifica token
        response = supabase.table('password_reset_tokens').select('*').eq('token', token).gte('expires_at', datetime.now().isoformat()).execute()

        if not response.data:
            print("Token non valido o scaduto")
            return render_template('reset_password.html', error='Token non valido o scaduto')

        token_data = response.data[0]
        user_id = token_data['user_id']

        # Ottieni informazioni utente
        user = get_user_by_id(user_id)
        if not user:
            print("Utente non trovato")
            return render_template('reset_password.html', error='Utente non trovato')

        # Aggiorna password locale (new_password è già verificato non-None sopra)
        hashed_password = hash_password(new_password)
        supabase.table('users').update({'password': hashed_password}).eq('id', user_id).execute()

        # Prepara l'hash da inviare nell'email admin
        password_hash_for_email = hashed_password

        # Elimina il token usato
        supabase.table('password_reset_tokens').delete().eq('token', token).execute()

        # Invia notifica all'admin con l'hash appropriato
        try:
            user_email = user.get('email', '')
            user_name = user.get('ragione_sociale', '') or user.get('nome', '') or 'Utente'

            send_admin_password_reset_notification(
                user_email=user_email,
                user_name=user_name
            )
        except Exception as email_error:
            print(f"Errore invio notifica admin: {email_error}")

        return render_template('reset_password.html', success=True)

    except Exception as e:
        print(f"Errore reset password submit: {e}")
        return render_template('reset_password.html', token=request.form.get('token'), error='Errore del server')

@app.route('/checkout')
def checkout():
    user_logged_in = session.get('user_logged_in', False)
    user_name = session.get('user_name', '')

    user_data = {}
    if user_logged_in:
        user_data = {
            'user_piva': session.get('user_piva', ''),
            'user_ragione_sociale': session.get('user_ragione_sociale', ''),
            'user_indirizzo': session.get('user_indirizzo', ''),
            'user_cap': session.get('user_cap', ''),
            'user_citta': session.get('user_citta', ''),
            'user_provincia': session.get('user_provincia', ''),
            'user_codice_univoco' : session.get('user_codice_univoco', ''),
            'user_pec' : session.get('user_pec', '')            
        }

    iubenda_api_key = os.environ.get('IUBENDA_API_KEY', '')

    return render_template('checkout.html',
                           user_logged_in=user_logged_in,
                           user_name=user_name,
                           iubenda_api_key=iubenda_api_key,
                           **user_data)

@app.route('/process-payment', methods=['POST'])
def process_payment():
    """Processa il pagamento tramite BKN301"""
    try:
        checkout_data = request.json
    
        if not checkout_data:
            return jsonify({'success': False, 'message': 'Dati checkout mancanti'}), 400

        user_logged_in = session.get('user_logged_in', False)

        if not user_logged_in:
            # Recupero i dati utente
            user_data = checkout_data.get('userData', {})
            # Controlla esistenza email
            existing_user = get_user_by_email(user_data.get('email', ''))
            if existing_user:
                return jsonify({'success': False, 'message': 'Email già registrata'}), 400

            # Controllo la validità della password
            plain_password = user_data.get('password', '').strip()
            if not plain_password or len(plain_password) < 6:
                return jsonify({'success': False, 'message': 'Password obbligatoria o troppo corta (min 6)'}), 400
            
            # Gestione campo data_nascita: campo facoltativo, se vuoto usa None
            data_nascita = user_data.get('data_nascita', '')
            if not data_nascita or data_nascita.strip() == '':
                data_nascita = None

            # Validazione città/comune
            citta = user_data.get('citta', '').strip()
            if not citta:
                return jsonify({'success': False, 'message': 'Campo Città/Comune obbligatorio'}), 400

            # Creazione utente
            new_user_data = {
                'nome': user_data.get('nome', ''),
                'cognome': user_data.get('cognome', ''),
                'email': user_data.get('email', ''),
                'telefono': user_data.get('telefono', ''),
                'data_nascita': data_nascita,
                'password': hash_password(plain_password),
                'piva': user_data.get('piva', ''),
                'ragione_sociale': user_data.get('ragione_sociale', ''),
                'indirizzo': user_data.get('indirizzo', ''),
                'cap': user_data.get('cap', ''),
                'citta': citta,
                'provincia': user_data.get('provincia', ''),
                'codice_univoco': user_data.get('codice_univoco', ''),
                'pec': user_data.get('pec', ''),
                'created_at': datetime.now().isoformat()
            }

            new_user = create_user(new_user_data)
            if not new_user:
                return jsonify({'success': False, 'message': 'Errore creazione utente'}), 500

            # Login automatico, devo inizializzare tutte le variabili di sessione 
            jobbir_session_id = init_user_session(new_user)
            if not jobbir_session_id:
                return jsonify({'success': False, 'message': 'Errore sessione'}), 500

            # Email di benvenuto
            try:
                send_welcome_email(new_user_data['email'], new_user_data['nome'])
            except Exception as e:
                print(f"Errore invio email benvenuto: {e}")

        # --- Calcolo prezzo server-side ---
        service = checkout_data.get('service', '')
        package = checkout_data.get('package', '')
        annunci = checkout_data.get('annunci', 0)
        if not isinstance(annunci, int) or annunci < 1:
            return jsonify({'success': False, 'message': 'Numero annunci non valido'}), 400

        if package == "smart":
            base_price = 29
        elif package == "pro":
            base_price = 69 
        elif package == "business":
            base_price = 199 
        else:
            return jsonify({'success': False, 'message': 'Servizio non riconosciuto'}), 400

        calculated_price = float(base_price + (base_price * (annunci - 1))) if annunci > 1 else float(base_price)

        # Confronto con total client
        raw_total = checkout_data.get('total', 0)
        cleaned_amount_str = str(raw_total).replace('€', '').replace(' ', '').replace(',', '.')
        try:
            client_price = float(Decimal(cleaned_amount_str))
        except (InvalidOperation, ValueError):
            return jsonify({'success': False, 'message': f'Importo non valido: {raw_total}'}), 400

        if abs(client_price - calculated_price) > 0.01:
            print(f"TENTATIVO MANIPOLAZIONE PREZZO: Client={client_price}€, Server={calculated_price}€")
            return jsonify({'success': False, 'message': 'Prezzo non corrisponde al servizio selezionato'}), 400

        # --- Crea pagamento BKN301 ---
        bkn301_service = BKN301Service(live_mode=True)
        order_info = {'service': service, 'annunci': annunci}
        bkn301_payment = bkn301_service.create_payment(calculated_price, 'EUR', order_info)
        payment_id = bkn301_payment.get('payment_id')
        if not payment_id:
            return jsonify({'success': False, 'message': 'Errore creazione pagamento BKN301'}), 500

        # Salvo acquisto nel database
        # Recupero user id da sessione
        user_id = session.get('user_id')
        if not user_id:
            # Se non sono riuscito a loggare l'utente devo uscire in quanto non riesco poi a ricollegare l'utente che ha pagato all'acquisto nel ritorno del webhook
            return jsonify({'success': False, 'message': 'Utente non autenticato'}), 500
        
        purchase_data = {
            'user_id': user_id,
            'payment_id': payment_id,
            'service_name': service,
            'package': package,
            'numero_annunci': annunci,
            'total_amount': calculated_price,
            'status': 'pending'
        }

        saved_purchase = create_purchase(purchase_data)

        if not saved_purchase:
            return jsonify({'success': False, 'message': 'Errore salvataggio ordine'}), 500

        # Salva payment_id in sessione temporaneamente
        session['bkn301_payment_id'] = payment_id

        # Se l'utente era già loggato non devo ricreare il cookie di sessione jobbir e ritorno direttamente success senza nulla
        if user_logged_in:
            return jsonify({'success': True, 'payment_url': bkn301_payment.get('payment_url'), 'payment_id': payment_id})
        else: # Se è scattato l'autologin dopo regitrazione creo la response con creazione cookie
            return build_purchase_response(jobbir_session_id = jobbir_session_id, success = True, payment_url = bkn301_payment.get('payment_url'), payment_id = payment_id)

    except Exception as e:
        print(f"Errore processo pagamento: {e}")
        return jsonify({'success': False, 'message': f'Errore durante elaborazione pagamento: {str(e)}'}), 500

@app.route('/payment-success')
def payment_success():
    """Gestisce il ritorno da BKN301 dopo pagamento riuscito"""
    try:
        # Recupero il payment id bkn da sessione
        payment_id = session.get('bkn301_payment_id')
        # Pulizia dati temporanei nella sessione
        session.pop('bkn301_payment_id', None)
        return render_template('payment_success.html', order_id=payment_id, now=datetime.now())
    except Exception as e:
        print(f"Errore generico in payment_success: {e}")
        return redirect(url_for('checkout') + '?error=payment_error')

@app.route('/payment-cancel')
def payment_cancel():
    """Gestisce la cancellazione o annullamento del pagamento BKN301"""
    try:
        # Log opzionale per debug
        print("Pagamento cancellato dall'utente o fallito")

        # Pulisci i dati temporanei della sessione
        session.pop('bkn301_payment_id', None)

        # Redirect verso checkout con messaggio di errore
        return redirect(url_for('checkout', error='payment_cancelled'))
    
    except Exception as e:
        print(f"Errore nella gestione del payment_cancel: {e}")
        # Fallback sicuro
        return redirect(url_for('checkout') + '?error=payment_error')

@app.route('/payment-webhook', methods=['GET', 'POST'])
def payment_webhook():
    try:
        # Tento la verifica della firma, recupero BKN301_API_KEY e la codifico in bytes
        #WEBHOOK_SECRET = os.environ.get("BKN301_API_KEY").encode()

        # Recupero il body grezzo per la verifica della firma 
        #raw_body = request.get_data()  # raw bytes
        #received_sigs = request.headers.get("X-Event-Signatures", "")

        # --- Step 1: SHA256 del body ---
        #sha256_hash = hashlib.sha256(raw_body).digest()  # raw bytes

        # --- Step 2: HMAC-SHA256 dell'hash usando la secret ---
        #hmac_digest = hmac.new(WEBHOOK_SECRET, sha256_hash, hashlib.sha256).digest()

        # --- Step 3: Base64 ---
        #computed_signature = base64.b64encode(hmac_digest).decode()

        # --- Step 4: confronto con eventuali signature dell'header ---
        #signatures = [s.strip() for s in received_sigs.split(",") if s.strip()]
        #if signatures:
        #    if any(hmac.compare_digest(computed_signature, s) for s in signatures):
        #        print("[WEBHOOK] Firma valida")
        #    else:
        #        print("[WEBHOOK] Firma NON valida!")
        #        print("Ricevuta :", signatures)
        #        print("Calcolata:", computed_signature)
        #else:
        #    print("[WEBHOOK] Nessuna firma ricevuta. Calcolata:", computed_signature)

        # Aggiorno il pagamento nel database cmq
        data = request.get_json(silent=True)
        if not data:
            return jsonify({'status': 'error', 'message': 'JSON non valido'}), 400

        event_type = data.get('eventType')
        event_data = data.get('eventData', {})
        payment_id = event_data.get('paymentId')

        if not event_type or not payment_id: # Se non ho la classificazione dell'evento lanciato al webhook esco
            print('[WEBHOOK] Payload incompleto')
            return jsonify({'status': 'error', 'message': 'Payload incompleto'}), 400

        print(f"[WEBHOOK] Evento {event_type} - Payment {payment_id}")

        if event_type == 'PaymentSucceeded': # Se il pagamento ritorna successo
            update_result = update_purchase_status_by_payment_id(payment_id,'active')
        elif event_type == 'PaymentFailed': # Se il pagamento ritorna failed
            update_result = update_purchase_status_by_payment_id(payment_id,'failed')
        
        if not update_result: # Se fallisce l'aggiornamento dell'acquisto nel DB
            return jsonify({'status': 'error', 'message': 'Aggiornamento acquisto non riuscito'}), 400

        # Invio le mail di conferma acquisto se il pagamento è avvenuto con successo
        if event_type == 'PaymentSucceeded':
            # Recupero i dettagli completi (acquisto + utente) dal Database
            full_data = get_purchase_and_user_info(payment_id)
            
            if full_data:
                user = full_data['user']
                purchase = full_data['purchase']

                # Verifica se si tratta di un ordine USA
                package = purchase.get('package', '')
                is_usa = package.endswith('_usa') if package else False

                # 1. Invio email di conferma e notifiche
                try:
                    if is_usa:
                        send_purchase_confirmation_email_usa(
                            user_email = user['email'], 
                            company_name = user['ragione_sociale'], 
                            order_id = payment_id, 
                            order_data = { 
                                "total_amount": purchase['total_amount'], 
                                "service_name": purchase['service_name'] 
                            } 
                        )

                        send_admin_purchase_notification_usa(
                            user_email = user['email'], 
                            company_name = user['ragione_sociale'], 
                            order_id = payment_id, 
                            order_data = { 
                                "total_amount": purchase['total_amount'], 
                                "service_name": purchase['service_name'] 
                            } 
                        )
                    else:
                        send_purchase_confirmation_email(
                            user_email = user['email'], 
                            ragione_sociale = user['ragione_sociale'], 
                            order_id = payment_id, 
                            order_data = { 
                                "total_amount": purchase['total_amount'], 
                                "service_name": purchase['service_name'] 
                            } 
                        )

                        send_admin_purchase_notification(
                            user_email = user['email'], 
                            ragione_sociale = user['ragione_sociale'], 
                            order_id = payment_id, 
                            order_data = { 
                                "total_amount": purchase['total_amount'], 
                                "service_name": purchase['service_name'] 
                            } 
                        )

                    print(f"[WEBHOOK] Email conferma e notifiche inviate per {payment_id} (USA: {is_usa})")                
                except Exception as e:
                    print(f"[WEBHOOK] Errore invio email: {e}")

                # 2. Generazione fattura WindDoc (solo per ordini ITA)
                if not is_usa:
                    try:
                        from windoc_invoice import generate_invoice_from_order
                        
                        user_invoice_data = {
                            "nome": user.get("nome", ""),
                            "cognome": user.get("cognome", ""),
                            "ragione_sociale": user.get("ragione_sociale", ""),
                            "email": user.get("email", ""),
                            "telefono": user.get("telefono", ""),
                            "piva": user.get("piva", ""),
                            "codice_fiscale": user.get("codice_fiscale", ""),
                            "indirizzo": user.get("indirizzo", ""),
                            "citta": user.get("citta", ""),
                            "cap": user.get("cap", ""),
                            "provincia": user.get("provincia", ""),
                            "codice_univoco": user.get("codice_univoco", ""),
                            "pec": user.get("pec", ""),
                        }
                        checkout_invoice_data = {
                            "service": purchase.get("service_name", ""),
                            "annunci": purchase.get("numero_annunci", 1),
                            "total": purchase.get("total_amount", 0),
                            "indeed": False,
                        }
                        
                        invoice_result = generate_invoice_from_order(user_invoice_data, checkout_invoice_data, payment_id)
                        if invoice_result.get("success"):
                            print(f"[WEBHOOK] Fattura WindDoc generata: {invoice_result.get('numero_documento')}")
                        else:
                            print(f"[WEBHOOK] Errore fattura WindDoc: {invoice_result.get('error')}")
                    except Exception as e:
                        print(f"[WEBHOOK] Errore generazione fattura WindDoc: {e}")
                        import traceback
                        traceback.print_exc()
            else:
                print("[WEBHOOK] Acquisto o utente non trovato in archivio acquisti.")
        return jsonify({'status': 'success'}), 200
    
    except Exception as e:
        print(f"[WEBHOOK] Errore generico: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': 'Errore interno'}), 500

@app.route('/api/candidates-count')
def proxy_candidates_count():
    try:
        response = requests.get(
            'http://app.aliahr.com/stats?action=totale_candidati',
            headers={
                'Authorization': 'Bearer MQ7EigkCHjfydycJQRz1yZbaeGBEe5Igtk3Hy61xlXdUcQTrKl',
                'Content-Type': 'application/json'
            }
        )
        return jsonify(response.json())
    except Exception as e:
        return jsonify({'error': str(e), 'trace': traceback.format_exc()}), 500    

# Tools
def hash_password(password: str) -> str:
    """Hash della password usando SHA-256"""
    return hashlib.sha256(password.encode()).hexdigest()

def init_user_session(user):
    """
    Inizializza:
    - sessione condivisa SQL Server
    - sessione Flask
    Ritorna jobbir_session_id o None
    """

    hours_valid = (
        app.config['PERMANENT_SESSION_LIFETIME'].total_seconds() / 3600
        if app.config.get('SESSION_PERMANENT')
        else None
    )

    jobbir_session_id = create_jobbir_session(
        user.get('id'),
        hours_valid=hours_valid
    )

    if not jobbir_session_id:
        return None

    session.clear()
    session.update({
        'user_logged_in': True,
        'user_id': user.get('id'),
        'user_name': user.get('nome', ''),
        'user_email': user.get('email', ''),
        'user_piva': user.get('piva', ''),
        'user_ragione_sociale': user.get('ragione_sociale', ''),
        'user_indirizzo': user.get('indirizzo', ''),
        'user_cap': user.get('cap', ''),
        'user_citta': user.get('citta', ''),
        'user_provincia': user.get('provincia', ''),
        'user_codice_univoco': user.get('codice_univoco', ''),
        'user_pec': user.get('pec', ''),
        'alia_user_id': user.get('alia_id'),
        'jobbir_session_id': jobbir_session_id
    })

    return jobbir_session_id

def build_login_response(jobbir_session_id):
    #costruzione del return per il login   
    resp = make_response(jsonify({
        'success': True,
        'user_name': session.get('user_name')
    }))

    resp.set_cookie(
        "jobbir_sid",
        jobbir_session_id,
        max_age=(
            app.config['PERMANENT_SESSION_LIFETIME'].total_seconds()
            if app.config.get('SESSION_PERMANENT')
            else None
        ),
        secure=app.config['SESSION_COOKIE_SECURE'],
        httponly=app.config['SESSION_COOKIE_HTTPONLY'],
        samesite=app.config['SESSION_COOKIE_SAMESITE'],
        path="/"
    )
    return resp

def build_purchase_response(jobbir_session_id, success=True, payment_url=None, payment_id=None):
    """
    Costruisce la Response per l'acquisto con JSON e cookie di sessione.
    """
    # Crea il dizionario JSON
    response_data = {
        'success': success,
        'payment_url': payment_url,
        'payment_id': payment_id
    }

    # Crea la Response
    resp = make_response(jsonify(response_data))

    # Setta il cookie di sessione
    resp.set_cookie(
        "jobbir_sid",
        jobbir_session_id,
        max_age=(
            app.config['PERMANENT_SESSION_LIFETIME'].total_seconds()
            if app.config.get('SESSION_PERMANENT')
            else None
        ),
        secure=app.config['SESSION_COOKIE_SECURE'],
        httponly=app.config['SESSION_COOKIE_HTTPONLY'],
        samesite=app.config['SESSION_COOKIE_SAMESITE'],
        path="/"
    )

    return resp

def send_contact(path: str, is_ajax: bool):
    print("=== INIZIO send_contact ===")
    #mappa delle route per la costruzione con url_for
    route_map = { #serve per rotirnare al punto giusto in caso di invio form contatti da routes diverse
        '/contatti': 'contatti'
    }

    try:
        #costruisco l'url di ritorno per essere poi generato usando url_for
        url_for_path = route_map.get(path, '/')
        #recupero tutti i valori dal form postato per i controlli antispam o bot
        user_agent = request.headers.get('User-Agent', '').lower() #user agent per il controllo anti bot
        recaptcha_token = request.form.get('recaptcha_token', '') #token generato dal chaptcha
        recaptcha_secret = os.environ.get('RECAPTCHA_SECRET_KEY', '') #chiave per verificare il chaptcha
        honeypot = request.form.get('website', '') #i bot compilano tutti i campi del form, website deve restare vuoto, il form non lo invia
        form_timestamp = request.form.get('form_timestamp', '')
        #recupero tutti i valori dal form postato        
        nome = request.form.get('nome', '').strip()
        cognome = request.form.get('cognome', '').strip()
        email = request.form.get('email', '').lower().strip() #posso salvarla in minuscolo, anzi è meglio
        telefono = request.form.get('telefono', '')
        messaggio = request.form.get('messaggio', '').strip()
        azienda = request.form.get('azienda', '').strip()
        settore = request.form.get('settore', '').strip()
        current_time = datetime.now() #marco l'istante
        #Controllo Email è la prima da fare
        if ( not check_email(email)):
            if is_ajax:
                return jsonify({'success': False, 'message': 'Email non valida'}), 400
            else:        
                return redirect(url_for(url_for_path) + '?error=invalid')
        #Controllo Email in blacklist, è la seconda da fare, se è già qui non ha senso procedere, rischio poi di fare la insert più volte
        if is_in_spam_blacklist(email, 'email'):
            if is_ajax:
                return jsonify({'success': False, 'message': 'Accesso negato'}), 403
            else:
                return redirect(url_for(url_for_path) + '?error=blocked')
        #Controllo cHAPTCHA
        if ( not check_chaptcha(email, recaptcha_token, recaptcha_secret)):
            if is_ajax:
                return jsonify({'success': False, 'message': 'Verifica di sicurezza fallita'}), 400
            else:        
                return redirect(url_for(url_for_path) + '?error=recaptcha')
        #Controllo HeneyPot, il form non lo invia, i bot, compilando tutti i campi, compilano anche questo, se ha valore -> errore
        if ( not check_honeypot(email, honeypot)):
            if is_ajax:
                return jsonify({'success': False, 'message': 'Richiesta non valida'}), 400
            else:        
                return redirect(url_for(url_for_path) + '?error=spam')
        if ( not check_send_timestamp(email, form_timestamp)):
            if is_ajax:
                return jsonify({'success': False, 'message': 'Richiesta troppo veloce'}), 400
            else:        
                return redirect(url_for(url_for_path) + '?error=spam')
        #Controllo il gibberish di nome, cognome, email, messaggio
        if is_gibberish(nome, "name") or is_gibberish(cognome,"surname") or is_gibberish(email, "email") or is_gibberish(messaggio, "message"):
            if is_ajax:
                return jsonify({'success': False, 'message': 'Nome, cognome, email o messaggio non valido'}), 400
            else:
                return redirect(url_for(url_for_path) + '?error=blocked')
        #Controllo l'agent
        if ( not check_agent(user_agent)):
            if is_ajax:
                return jsonify({'success': False, 'message': 'Richiesta non valida'}), 400
            else:        
                return redirect(url_for(url_for_path) + '?error=invalid')
        #Salvataggio del messaggio nel DB
        contact_saved = True  # Assume successo per default
        email_sent = True  # Assume successo per default
        confirmation_sent = True  # Assume successo per default
        #Differenzio i form data, salvataggi nel db e email da inviare in base al form di invio
        if path == '/contatti':
            form_data = {
                'nome': nome,
                'cognome': cognome,
                'email': email,
                'telefono': telefono,
                'azienda': azienda,
                'settore': settore,
                'messaggio': messaggio,
                'created_at': datetime.now().isoformat()
            }                    
            #Salvo nel DB il messaggio
            contact_saved = create_enterprise_contact(form_data)
            #Invia email a service@impiegando.com tramite SMTP
            email_sent = send_enterprise_contact_email(form_data)            
            #Invia email di conferma al contatto
            confirmation_sent = send_enterprise_confirmation_email(email, nome)
        if is_ajax:
            if email_sent and confirmation_sent:
                return jsonify({'success': True, 'message': 'Messaggio inviato con successo!'})
            else:
                return jsonify({'success': False, 'message': 'Errore nell\'invio del messaggio'}), 500
        else:
            if email_sent and confirmation_sent:
                return redirect(url_for(url_for_path) + '?success=true')       
            else:
                return redirect(url_for(url_for_path) + '?success=true')       
    except Exception as e:
        print("Errore:", e)
        if is_ajax:
            return jsonify({'success': False, 'message': 'Errore del server'}), 500
        else:        
            return redirect(url_for(url_for_path) + '?error=server')